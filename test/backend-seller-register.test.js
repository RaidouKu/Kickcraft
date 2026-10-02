import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const ROOT_DIR = path.resolve(import.meta.dirname, '..')
const REGISTER_PATH = path.join(ROOT_DIR, 'api', 'auth', 'register.php')

const PHP_MOCK_PDO_DEFINITION = `
class MockPDOStatement extends PDOStatement {
    private $onExecute;
    private $result = null;
    public function __construct(callable $onExecute) {
        $this->onExecute = $onExecute;
    }
    public function execute(?array $params = null): bool {
        $this->result = ($this->onExecute)($params ?? []);
        return true;
    }
    public function fetch($mode = PDO::FETCH_DEFAULT, $cursorOrientation = PDO::FETCH_ORI_NEXT, $cursorOffset = 0): mixed {
        if (is_array($this->result) && isset($this->result[0]) && is_array($this->result[0])) {
            return array_shift($this->result);
        }
        return is_array($this->result) ? $this->result : false;
    }
    public function fetchColumn(int $column = 0): mixed {
        $row = $this->fetch();
        if (is_array($row)) {
            $vals = array_values($row);
            return $vals[$column] ?? false;
        }
        return false;
    }
}

class MockPDO extends PDO {
    public array $queries = [];
    public array $users = [];
    public array $sellerProfiles = [];
    private int $lastId = 0;
    private bool $inTx = false;

    public function __construct() {}
    public function inTransaction(): bool { return $this->inTx; }
    public function beginTransaction(): bool { $this->inTx = true; return true; }
    public function commit(): bool { $this->inTx = false; return true; }
    public function rollBack(): bool { $this->inTx = false; return true; }
    public function lastInsertId(?string $name = null): string|false {
        return (string)$this->lastId;
    }
    public function prepare(string $query, array $options = []): PDOStatement {
        return new MockPDOStatement(function($params) use ($query) {
            $this->queries[] = ['query' => $query, 'params' => $params];
            if (stripos($query, 'SELECT id FROM users') !== false) {
                $email = strtolower($params[0] ?? '');
                foreach ($this->users as $u) {
                    if (strtolower($u['email']) === $email && empty($u['deleted_at']) && empty($u['permanently_deleted'])) {
                        return ['id' => $u['id']];
                    }
                }
                return false;
            }
            if (stripos($query, 'INSERT INTO users') !== false) {
                $this->lastId++;
                $this->users[] = [
                    'id' => $this->lastId,
                    'name' => $params[0],
                    'email' => $params[1],
                    'password_hash' => $params[2],
                    'role' => $params[3],
                ];
                return true;
            }
            if (stripos($query, 'INSERT INTO seller_profiles') !== false) {
                $this->sellerProfiles[] = [
                    'user_id' => $params[0],
                    'store_name' => $params[1],
                    'store_description' => $params[2],
                    'status' => $params[3],
                ];
                return true;
            }
            return true;
        });
    }
}
`

test('register.php exists and is syntactically valid PHP', () => {
  assert.ok(fs.existsSync(REGISTER_PATH), 'api/auth/register.php must exist')
  const output = execSync(`php -l "${REGISTER_PATH}"`, { encoding: 'utf8' })
  assert.match(output, /No syntax errors detected/i, 'Syntax error in register.php')
})

test('register.php adheres to security and architecture requirements', () => {
  assert.ok(fs.existsSync(REGISTER_PATH), 'register.php must exist')
  const code = fs.readFileSync(REGISTER_PATH, 'utf8')

  assert.match(code, /config\.php/i, 'Must require config.php')
  assert.match(code, /db\.php/i, 'Must require db.php')
  assert.match(code, /helpers\.php/i, 'Must require helpers.php')
  assert.match(code, /requireMethod\s*\(\s*['"]POST['"]\s*\)/i, 'Must enforce POST method')
  assert.match(code, /getJsonBody\s*\(\s*\)/i, 'Must read JSON body via getJsonBody()')
  assert.match(code, /password_hash\s*\(/i, 'Must hash password')
  assert.match(code, /PASSWORD_DEFAULT/i, 'Must hash using PASSWORD_DEFAULT')
  assert.match(code, /['"]seller['"]/i, 'Must set role to seller')
  assert.doesNotMatch(code, /['"]customer['"]/i, 'Must not set role to customer')
  assert.match(code, /prepare\s*\(/i, 'Must use PDO prepared statements')
  assert.match(code, /deleted_at\s+IS\s+NULL/i, 'Must check deleted_at IS NULL')
  assert.match(code, /permanently_deleted\s*=\s*0/i, 'Must check permanently_deleted = 0')
  assert.match(code, /201/, 'Must return 201 Created')
  assert.doesNotMatch(code, /\bDELETE\s+FROM\b/i, 'Physical DELETE FROM is forbidden')
})

test('runtime: register.php rejects non-POST method with 405', () => {
  const runner = path.join(ROOT_DIR, 'test_register_method.php')
  fs.writeFileSync(
    runner,
    `<?php
$_SERVER['REQUEST_METHOD'] = 'GET';
require __DIR__ . '/api/auth/register.php';
`
  )
  try {
    const output = execSync(`php "${runner}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.equal(json.error, 'Method not allowed')
  } finally {
    if (fs.existsSync(runner)) fs.unlinkSync(runner)
  }
})

test('Seller registration endpoint validates input', () => {
  const runner = path.join(ROOT_DIR, 'test_register_brief.php')
  const phpCode = `<?php
    $_SERVER['REQUEST_METHOD'] = 'POST';
    $GLOBALS['__JSON_BODY__'] = ['email' => 'bademail'];
    require_once __DIR__ . '/api/auth/register.php';
  `
  fs.writeFileSync(runner, phpCode)
  try {
    const output = execSync(`php "${runner}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.ok(json.error, 'Should return error')
    assert.match(json.error, /name|email|invalid|required/i)
  } finally {
    if (fs.existsSync(runner)) fs.unlinkSync(runner)
  }
})

test('runtime: register.php validates required fields and bounds (400)', () => {
  const runRegister = (body) => {
    const runner = path.join(ROOT_DIR, 'test_register_val.php')
    fs.writeFileSync(
      runner,
      `<?php
$_SERVER['REQUEST_METHOD'] = 'POST';
$GLOBALS['__JSON_BODY__'] = json_decode(${JSON.stringify(JSON.stringify(body))}, true);
require __DIR__ . '/api/auth/register.php';
`
    )
    try {
      const output = execSync(`php "${runner}"`, { encoding: 'utf8' })
      return JSON.parse(output)
    } finally {
      if (fs.existsSync(runner)) fs.unlinkSync(runner)
    }
  }

  // 1. Missing name
  const resNoName = runRegister({
    email: 'test@example.com',
    password: 'password123',
    confirmPassword: 'password123',
    storeName: 'My Store',
  })
  assert.match(resNoName.error, /name/i, 'Missing name must be rejected')

  // 2. Short name (< 2 chars)
  const resShortName = runRegister({
    name: 'A',
    email: 'test@example.com',
    password: 'password123',
    confirmPassword: 'password123',
    storeName: 'My Store',
  })
  assert.match(resShortName.error, /name/i, 'Short name must be rejected')

  // 3. Name too long (> 255 chars)
  const resLongName = runRegister({
    name: 'A'.repeat(256),
    email: 'test@example.com',
    password: 'password123',
    confirmPassword: 'password123',
    storeName: 'My Store',
  })
  assert.match(resLongName.error, /name/i, 'Name over 255 chars must be rejected')

  // 4. Invalid email
  const resBadEmail = runRegister({
    name: 'Test Seller',
    email: 'not-an-email',
    password: 'password123',
    confirmPassword: 'password123',
    storeName: 'My Store',
  })
  assert.match(resBadEmail.error, /email/i, 'Invalid email format must be rejected')

  // 5. Short password (< 8 chars)
  const resShortPass = runRegister({
    name: 'Test Seller',
    email: 'test@example.com',
    password: 'short',
    confirmPassword: 'short',
    storeName: 'My Store',
  })
  assert.match(resShortPass.error, /password/i, 'Password under 8 chars must be rejected')

  // 6. Confirm password mismatch
  const resMismatch = runRegister({
    name: 'Test Seller',
    email: 'test@example.com',
    password: 'password123',
    confirmPassword: 'differentpassword',
    storeName: 'My Store',
  })
  assert.match(resMismatch.error, /password/i, 'Password mismatch must be rejected')

  // 7. Missing store name
  const resNoStore = runRegister({
    name: 'Test Seller',
    email: 'test@example.com',
    password: 'password123',
    confirmPassword: 'password123',
  })
  assert.match(resNoStore.error, /store/i, 'Missing store name must be rejected')

  // 8. Short store name (< 2 chars)
  const resShortStore = runRegister({
    name: 'Test Seller',
    email: 'test@example.com',
    password: 'password123',
    confirmPassword: 'password123',
    storeName: 'S',
  })
  assert.match(resShortStore.error, /store/i, 'Short store name must be rejected')

  // 9. Store name too long (> 255 chars)
  const resLongStore = runRegister({
    name: 'Test Seller',
    email: 'test@example.com',
    password: 'password123',
    confirmPassword: 'password123',
    storeName: 'S'.repeat(256),
  })
  assert.match(resLongStore.error, /store/i, 'Store name over 255 chars must be rejected')

  // 10. Store description too long (> 1000 chars)
  const resLongDesc = runRegister({
    name: 'Test Seller',
    email: 'test@example.com',
    password: 'password123',
    confirmPassword: 'password123',
    storeName: 'My Store',
    storeDescription: 'D'.repeat(1001),
  })
  assert.match(resLongDesc.error, /description/i, 'Store description over 1000 chars must be rejected')
})

test('runtime: register.php rejects duplicate emails with 409', () => {
  const runner = path.join(ROOT_DIR, 'test_register_dup.php')
  fs.writeFileSync(
    runner,
    `<?php
${PHP_MOCK_PDO_DEFINITION}

$_SERVER['REQUEST_METHOD'] = 'POST';

$pdo = new MockPDO();
$pdo->users[] = [
    'id' => 1,
    'name' => 'Existing User',
    'email' => 'existing@example.com',
    'password_hash' => password_hash('password123', PASSWORD_DEFAULT),
    'role' => 'seller',
    'deleted_at' => null,
    'permanently_deleted' => 0,
];

$GLOBALS['__TEST_PDO__'] = $pdo;
$GLOBALS['__JSON_BODY__'] = [
  'name' => 'New Seller',
  'email' => 'EXISTING@example.com', // case-insensitive check
  'password' => 'password123',
  'confirmPassword' => 'password123',
  'storeName' => 'Brand New Kicks',
];

require __DIR__ . '/api/auth/register.php';
`
  )
  try {
    const output = execSync(`php "${runner}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.match(json.error, /already registered/i, 'Duplicate email must return conflict error')
  } finally {
    if (fs.existsSync(runner)) fs.unlinkSync(runner)
  }
})

test('runtime: register.php successfully registers seller and returns 201', () => {
  const runner = path.join(ROOT_DIR, 'test_register_success.php')
  fs.writeFileSync(
    runner,
    `<?php
${PHP_MOCK_PDO_DEFINITION}

$_SERVER['REQUEST_METHOD'] = 'POST';

$pdo = new MockPDO();

// Insert soft-deleted user with the same email to ensure soft-deleted accounts do not collide
$pdo->users[] = [
    'id' => 99,
    'name' => 'Old User',
    'email' => 'juan@example.com',
    'password_hash' => password_hash('oldpass123', PASSWORD_DEFAULT),
    'role' => 'seller',
    'deleted_at' => '2026-01-01 00:00:00',
    'permanently_deleted' => 0,
];

$GLOBALS['__TEST_PDO__'] = $pdo;
$GLOBALS['__JSON_BODY__'] = [
  'name' => '  Juan Dela Cruz  ',
  'email' => '  juan@example.com  ',
  'password' => 'securepass123',
  'confirmPassword' => 'securepass123',
  'storeName' => "  Juan's Custom Kicks  ",
  'storeDescription' => 'Handcrafted Filipino-inspired shoe designs',
];

register_shutdown_function(function() use ($pdo) {
  $code = http_response_code();
  $user = null;
  foreach ($pdo->users as $u) {
    if (strtolower($u['email']) === 'juan@example.com' && empty($u['deleted_at'])) {
      $user = $u;
      break;
    }
  }

  $profile = null;
  if ($user) {
    foreach ($pdo->sellerProfiles as $sp) {
      if ((int)$sp['user_id'] === (int)$user['id']) {
        $profile = $sp;
        break;
      }
    }
  }

  $verification = [
    'statusCode' => $code,
    'userInserted' => (bool)$user,
    'userName' => $user['name'] ?? null,
    'userRole' => $user['role'] ?? null,
    'passwordValid' => $user ? password_verify('securepass123', $user['password_hash']) : false,
    'profileInserted' => (bool)$profile,
    'storeName' => $profile['store_name'] ?? null,
    'storeDescription' => $profile['store_description'] ?? null,
    'sellerStatus' => $profile['status'] ?? null,
  ];

  file_put_contents(__DIR__ . '/test_register_db_check.json', json_encode($verification));
});

require __DIR__ . '/api/auth/register.php';
`
  )
  const dbCheckPath = path.join(ROOT_DIR, 'test_register_db_check.json')
  try {
    const output = execSync(`php "${runner}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.equal(json.success, true, 'Response must have success: true')
    assert.equal(
      json.message,
      'Seller application submitted. Your account is under review.',
      'Must return expected success message'
    )

    assert.ok(fs.existsSync(dbCheckPath), 'Verification file must be created')
    const dbCheck = JSON.parse(fs.readFileSync(dbCheckPath, 'utf8'))
    assert.equal(dbCheck.statusCode, 201, 'HTTP status code must be 201')
    assert.equal(dbCheck.userInserted, true, 'User record must be inserted in DB')
    assert.equal(dbCheck.userName, 'Juan Dela Cruz', 'User name must be trimmed')
    assert.equal(dbCheck.userRole, 'seller', "User role must be 'seller'")
    assert.equal(dbCheck.passwordValid, true, 'Password must be verifiable with password_verify')
    assert.equal(dbCheck.profileInserted, true, 'Seller profile record must be inserted in DB')
    assert.equal(dbCheck.storeName, "Juan's Custom Kicks", 'Store name must be trimmed')
    assert.equal(
      dbCheck.storeDescription,
      'Handcrafted Filipino-inspired shoe designs',
      'Store description must be saved'
    )
    assert.equal(dbCheck.sellerStatus, 'pending', "Seller profile status must be 'pending'")
  } finally {
    if (fs.existsSync(runner)) fs.unlinkSync(runner)
    if (fs.existsSync(dbCheckPath)) fs.unlinkSync(dbCheckPath)
  }
})
