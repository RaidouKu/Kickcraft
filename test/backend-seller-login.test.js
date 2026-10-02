import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const ROOT_DIR = path.resolve(import.meta.dirname, '..')
const LOGIN_PATH = path.join(ROOT_DIR, 'api', 'auth', 'login.php')
const SESSION_PATH = path.join(ROOT_DIR, 'api', 'auth', 'session.php')

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
    public array $users = [];
    public array $sellerProfiles = [];
    public array $queries = [];

    public function __construct() {}

    public function prepare(string $query, array $options = []): PDOStatement {
        return new MockPDOStatement(function($params) use ($query) {
            $this->queries[] = ['query' => $query, 'params' => $params];
            if (stripos($query, 'FROM users') !== false) {
                if (stripos($query, 'email = ?') !== false) {
                    $email = strtolower($params[0] ?? '');
                    foreach ($this->users as $u) {
                        if (strtolower($u['email']) === $email && empty($u['deleted_at']) && empty($u['permanently_deleted'])) {
                            if (stripos($query, "'owner', 'seller'") !== false) {
                                if (in_array($u['role'], ['owner', 'seller'], true)) {
                                    return $u;
                                }
                            } elseif (stripos($query, "role = 'owner'") !== false) {
                                if ($u['role'] === 'owner') {
                                    return $u;
                                }
                            }
                        }
                    }
                    return false;
                }
                if (stripos($query, 'id = ?') !== false) {
                    $id = (int)($params[0] ?? 0);
                    foreach ($this->users as $u) {
                        if ((int)$u['id'] === $id && empty($u['deleted_at']) && empty($u['permanently_deleted'])) {
                            return $u;
                        }
                    }
                    return false;
                }
            }

            if (stripos($query, 'FROM seller_profiles') !== false) {
                $userId = (int)($params[0] ?? 0);
                foreach ($this->sellerProfiles as $sp) {
                    if ((int)$sp['user_id'] === $userId && empty($sp['deleted_at']) && empty($sp['permanently_deleted'])) {
                        return $sp;
                    }
                }
                return false;
            }

            return false;
        });
    }
}
`

test('login.php and session.php exist and have no syntax errors', () => {
  assert.ok(fs.existsSync(LOGIN_PATH), 'api/auth/login.php must exist')
  assert.ok(fs.existsSync(SESSION_PATH), 'api/auth/session.php must exist')

  const loginSyntax = execSync(`php -l "${LOGIN_PATH}"`, { encoding: 'utf8' })
  assert.match(loginSyntax, /No syntax errors detected/i)

  const sessionSyntax = execSync(`php -l "${SESSION_PATH}"`, { encoding: 'utf8' })
  assert.match(sessionSyntax, /No syntax errors detected/i)
})

test('login.php and session.php contain zero physical DELETE statements', () => {
  for (const filePath of [LOGIN_PATH, SESSION_PATH]) {
    const code = fs.readFileSync(filePath, 'utf8')
    assert.doesNotMatch(
      code,
      /\bDELETE\s+FROM\b/i,
      `Physical DELETE FROM found in ${filePath} - must use soft/hard delete flags instead`
    )
  }
})

test('login.php allows sellers and checks role IN (owner, seller)', () => {
  const code = fs.readFileSync(LOGIN_PATH, 'utf8')
  assert.match(
    code,
    /role\s+IN\s*\(\s*['"]owner['"]\s*,\s*['"]seller['"]\s*\)/i,
    "login.php must query role IN ('owner', 'seller')"
  )
})

test('login.php queries seller_profiles with soft-delete checks', () => {
  const code = fs.readFileSync(LOGIN_PATH, 'utf8')
  assert.match(code, /seller_profiles/i, 'login.php must query seller_profiles table')
  assert.match(code, /deleted_at\s+IS\s+NULL/i, 'login.php must check deleted_at IS NULL')
  assert.match(code, /permanently_deleted\s*=\s*0/i, 'login.php must check permanently_deleted = 0')
  assert.match(code, /\$_SESSION\[['"]seller_status['"]\]/, 'login.php must set $_SESSION seller_status')
  assert.match(code, /['"]sellerProfile['"]/, 'login.php must include sellerProfile in response')
})

test('session.php includes sellerProfile for seller users', () => {
  const code = fs.readFileSync(SESSION_PATH, 'utf8')
  assert.match(code, /['"]sellerProfile['"]/, 'session.php must include sellerProfile in response')
})

test('runtime: login.php authenticates seller and returns sellerProfile and sets session', () => {
  const runner = path.join(ROOT_DIR, 'test_seller_login_run.php')
  const sessionCheckPath = path.join(ROOT_DIR, 'test_seller_login_session.json')
  fs.writeFileSync(
    runner,
    `<?php
${PHP_MOCK_PDO_DEFINITION}

$_SERVER['REQUEST_METHOD'] = 'POST';

$pdo = new MockPDO();
$pdo->users[] = [
    'id' => 5,
    'name' => 'Juan Dela Cruz',
    'email' => 'juan@example.com',
    'password_hash' => password_hash('sellerpass123', PASSWORD_DEFAULT),
    'role' => 'seller',
    'deleted_at' => null,
    'permanently_deleted' => 0,
];
$pdo->sellerProfiles[] = [
    'user_id' => 5,
    'store_name' => "Juan's Custom Kicks",
    'store_description' => 'Handcrafted Filipino-inspired shoe designs',
    'status' => 'approved',
    'deleted_at' => null,
    'permanently_deleted' => 0,
];

$GLOBALS['__TEST_PDO__'] = $pdo;
$GLOBALS['__JSON_BODY__'] = [
    'email' => 'juan@example.com',
    'password' => 'sellerpass123',
];

register_shutdown_function(function() {
    file_put_contents(__DIR__ . '/test_seller_login_session.json', json_encode($_SESSION));
});

require __DIR__ . '/api/auth/login.php';
`
  )

  try {
    const output = execSync(`php "${runner}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.equal(json.success, true)
    assert.deepEqual(json.user, {
      id: 5,
      name: 'Juan Dela Cruz',
      email: 'juan@example.com',
      role: 'seller',
    })
    assert.deepEqual(json.sellerProfile, {
      storeName: "Juan's Custom Kicks",
      status: 'approved',
      storeDescription: 'Handcrafted Filipino-inspired shoe designs',
    })

    assert.ok(fs.existsSync(sessionCheckPath), 'Session check file should exist')
    const session = JSON.parse(fs.readFileSync(sessionCheckPath, 'utf8'))
    assert.equal(session.user_id, 5)
    assert.equal(session.user_role, 'seller')
    assert.equal(session.seller_status, 'approved')
  } finally {
    if (fs.existsSync(runner)) fs.unlinkSync(runner)
    if (fs.existsSync(sessionCheckPath)) fs.unlinkSync(sessionCheckPath)
  }
})

test('runtime: login.php authenticates owner without sellerProfile', () => {
  const runner = path.join(ROOT_DIR, 'test_owner_login_run.php')
  fs.writeFileSync(
    runner,
    `<?php
${PHP_MOCK_PDO_DEFINITION}

$_SERVER['REQUEST_METHOD'] = 'POST';

$pdo = new MockPDO();
$pdo->users[] = [
    'id' => 1,
    'name' => 'Store Owner',
    'email' => 'owner@kickcraft.local',
    'password_hash' => password_hash('ownerpass123', PASSWORD_DEFAULT),
    'role' => 'owner',
    'deleted_at' => null,
    'permanently_deleted' => 0,
];

$GLOBALS['__TEST_PDO__'] = $pdo;
$GLOBALS['__JSON_BODY__'] = [
    'email' => 'owner@kickcraft.local',
    'password' => 'ownerpass123',
];

require __DIR__ . '/api/auth/login.php';
`
  )

  try {
    const output = execSync(`php "${runner}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.equal(json.success, true)
    assert.deepEqual(json.user, {
      id: 1,
      name: 'Store Owner',
      email: 'owner@kickcraft.local',
      role: 'owner',
    })
    assert.equal(json.sellerProfile, undefined, 'Owner login response must not include sellerProfile')
  } finally {
    if (fs.existsSync(runner)) fs.unlinkSync(runner)
  }
})

test('runtime: login.php rejects customer accounts with 401', () => {
  const runner = path.join(ROOT_DIR, 'test_customer_login_run.php')
  fs.writeFileSync(
    runner,
    `<?php
${PHP_MOCK_PDO_DEFINITION}

$_SERVER['REQUEST_METHOD'] = 'POST';

$pdo = new MockPDO();
$pdo->users[] = [
    'id' => 9,
    'name' => 'Customer User',
    'email' => 'customer@example.com',
    'password_hash' => password_hash('custpass123', PASSWORD_DEFAULT),
    'role' => 'customer',
    'deleted_at' => null,
    'permanently_deleted' => 0,
];

$GLOBALS['__TEST_PDO__'] = $pdo;
$GLOBALS['__JSON_BODY__'] = [
    'email' => 'customer@example.com',
    'password' => 'custpass123',
];

require __DIR__ . '/api/auth/login.php';
`
  )

  try {
    const output = execSync(`php "${runner}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.equal(json.error, 'Invalid email or password')
  } finally {
    if (fs.existsSync(runner)) fs.unlinkSync(runner)
  }
})

test('runtime: login.php rejects soft-deleted seller accounts with 401', () => {
  const runner = path.join(ROOT_DIR, 'test_deleted_seller_login.php')
  fs.writeFileSync(
    runner,
    `<?php
${PHP_MOCK_PDO_DEFINITION}

$_SERVER['REQUEST_METHOD'] = 'POST';

$pdo = new MockPDO();
$pdo->users[] = [
    'id' => 5,
    'name' => 'Deleted Seller',
    'email' => 'deleted@example.com',
    'password_hash' => password_hash('sellerpass123', PASSWORD_DEFAULT),
    'role' => 'seller',
    'deleted_at' => '2026-01-01 00:00:00',
    'permanently_deleted' => 0,
];

$GLOBALS['__TEST_PDO__'] = $pdo;
$GLOBALS['__JSON_BODY__'] = [
    'email' => 'deleted@example.com',
    'password' => 'sellerpass123',
];

require __DIR__ . '/api/auth/login.php';
`
  )

  try {
    const output = execSync(`php "${runner}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.equal(json.error, 'Invalid email or password')
  } finally {
    if (fs.existsSync(runner)) fs.unlinkSync(runner)
  }
})

test('runtime: session.php returns sellerProfile when seller is logged in', () => {
  const runner = path.join(ROOT_DIR, 'test_seller_session_run.php')
  fs.writeFileSync(
    runner,
    `<?php
${PHP_MOCK_PDO_DEFINITION}

$_SERVER['REQUEST_METHOD'] = 'GET';
require_once __DIR__ . '/api/config.php';

$pdo = new MockPDO();
$pdo->users[] = [
    'id' => 5,
    'name' => 'Juan Dela Cruz',
    'email' => 'juan@example.com',
    'password_hash' => 'hash',
    'role' => 'seller',
    'deleted_at' => null,
    'permanently_deleted' => 0,
];
$pdo->sellerProfiles[] = [
    'user_id' => 5,
    'store_name' => "Juan's Custom Kicks",
    'store_description' => 'Handcrafted Filipino-inspired shoe designs',
    'status' => 'approved',
    'deleted_at' => null,
    'permanently_deleted' => 0,
];

$GLOBALS['__TEST_PDO__'] = $pdo;
$_SESSION['user_id'] = 5;
$_SESSION['user_name'] = 'Juan Dela Cruz';
$_SESSION['user_email'] = 'juan@example.com';
$_SESSION['user_role'] = 'seller';

require __DIR__ . '/api/auth/session.php';
`
  )

  try {
    const output = execSync(`php "${runner}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.equal(json.authenticated, true)
    assert.deepEqual(json.user, {
      id: 5,
      name: 'Juan Dela Cruz',
      email: 'juan@example.com',
      role: 'seller',
    })
    assert.deepEqual(json.sellerProfile, {
      storeName: "Juan's Custom Kicks",
      status: 'approved',
      storeDescription: 'Handcrafted Filipino-inspired shoe designs',
    })
  } finally {
    if (fs.existsSync(runner)) fs.unlinkSync(runner)
  }
})

test('runtime: session.php does NOT return sellerProfile when owner is logged in', () => {
  const runner = path.join(ROOT_DIR, 'test_owner_session_run.php')
  fs.writeFileSync(
    runner,
    `<?php
${PHP_MOCK_PDO_DEFINITION}

$_SERVER['REQUEST_METHOD'] = 'GET';
require_once __DIR__ . '/api/config.php';

$pdo = new MockPDO();
$pdo->users[] = [
    'id' => 1,
    'name' => 'Store Owner',
    'email' => 'owner@kickcraft.local',
    'password_hash' => 'hash',
    'role' => 'owner',
    'deleted_at' => null,
    'permanently_deleted' => 0,
];

$GLOBALS['__TEST_PDO__'] = $pdo;
$_SESSION['user_id'] = 1;
$_SESSION['user_name'] = 'Store Owner';
$_SESSION['user_email'] = 'owner@kickcraft.local';
$_SESSION['user_role'] = 'owner';

require __DIR__ . '/api/auth/session.php';
`
  )

  try {
    const output = execSync(`php "${runner}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.equal(json.authenticated, true)
    assert.deepEqual(json.user, {
      id: 1,
      name: 'Store Owner',
      email: 'owner@kickcraft.local',
      role: 'owner',
    })
    assert.equal(json.sellerProfile, undefined, 'Owner session must not include sellerProfile')
  } finally {
    if (fs.existsSync(runner)) fs.unlinkSync(runner)
  }
})
