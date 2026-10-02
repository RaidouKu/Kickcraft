import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const ROOT_DIR = path.resolve(import.meta.dirname, '..')
const PROFILE_PATH = path.join(ROOT_DIR, 'api', 'sellers', 'profile.php')
const UPDATE_PROFILE_PATH = path.join(ROOT_DIR, 'api', 'sellers', 'update-profile.php')

const PHP_MOCK_PDO_DEFINITION = `
class MockPDOStatement extends PDOStatement {
    private $onExecute;
    private $result = null;
    public int $affectedRows = 0;

    public function __construct(callable $onExecute) {
        $this->onExecute = $onExecute;
    }
    public function execute(?array $params = null): bool {
        $this->result = ($this->onExecute)($params ?? []);
        if (is_int($this->result)) {
            $this->affectedRows = $this->result;
        } elseif (is_array($this->result)) {
            $this->affectedRows = count($this->result);
        } else {
            $this->affectedRows = $this->result ? 1 : 0;
        }
        return true;
    }
    public function rowCount(): int {
        return $this->affectedRows;
    }
    public function fetch($mode = PDO::FETCH_DEFAULT, $cursorOrientation = PDO::FETCH_ORI_NEXT, $cursorOffset = 0): mixed {
        if (is_array($this->result) && isset($this->result[0]) && is_array($this->result[0])) {
            return array_shift($this->result);
        }
        return is_array($this->result) ? $this->result : false;
    }
    public function fetchAll(int $mode = PDO::FETCH_DEFAULT, mixed ...$args): array {
        if (is_array($this->result)) {
            $rows = $this->result;
            $this->result = [];
            return $rows;
        }
        return [];
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

    public function __construct() {}

    public function prepare(string $query, array $options = []): PDOStatement {
        return new MockPDOStatement(function($params) use ($query) {
            $this->queries[] = ['query' => $query, 'params' => $params];

            // 1. User lookup for currentSessionUser / requireSeller
            if (stripos($query, 'FROM users') !== false && stripos($query, 'JOIN') === false) {
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

            // 2. Profile lookup from currentSessionUser: SELECT status FROM seller_profiles WHERE user_id = ? ...
            if (stripos($query, 'SELECT status FROM seller_profiles') !== false) {
                $userId = (int)($params[0] ?? 0);
                foreach ($this->sellerProfiles as $sp) {
                    if ((int)$sp['user_id'] === $userId && empty($sp['deleted_at']) && empty($sp['permanently_deleted'])) {
                        return ['status' => $sp['status']];
                    }
                }
                return false;
            }

            // 3. Profile query joined with users: seller_profiles sp JOIN users u
            if (stripos($query, 'FROM seller_profiles') !== false && stripos($query, 'JOIN users') !== false) {
                $userId = (int)($params[0] ?? 0);
                foreach ($this->sellerProfiles as $sp) {
                    if ((int)$sp['user_id'] === $userId && empty($sp['deleted_at']) && empty($sp['permanently_deleted'])) {
                        foreach ($this->users as $u) {
                            if ((int)$u['id'] === $userId && empty($u['deleted_at']) && empty($u['permanently_deleted'])) {
                                return [
                                    'id' => $sp['id'],
                                    'user_id' => $sp['user_id'],
                                    'name' => $u['name'],
                                    'email' => $u['email'],
                                    'store_name' => $sp['store_name'],
                                    'store_description' => $sp['store_description'] ?? null,
                                    'status' => $sp['status'],
                                    'admin_notes' => $sp['admin_notes'] ?? null,
                                    'approved_at' => $sp['approved_at'] ?? null,
                                    'created_at' => $sp['created_at'],
                                ];
                            }
                        }
                    }
                }
                return false;
            }

            // 4. Update profile: UPDATE seller_profiles SET store_name = ?, store_description = ? WHERE user_id = ? ...
            if (stripos($query, 'UPDATE seller_profiles') !== false) {
                $storeName = $params[0] ?? '';
                $storeDesc = $params[1] ?? null;
                $userId = (int)($params[2] ?? 0);

                $updated = 0;
                foreach ($this->sellerProfiles as &$sp) {
                    if ((int)$sp['user_id'] === $userId && empty($sp['deleted_at']) && empty($sp['permanently_deleted'])) {
                        $sp['store_name'] = $storeName;
                        $sp['store_description'] = $storeDesc;
                        $updated++;
                    }
                }
                unset($sp);
                return $updated;
            }

            return false;
        });
    }
}
`

test('Seller profile files exist and have no syntax errors', () => {
  assert.ok(fs.existsSync(PROFILE_PATH), 'api/sellers/profile.php must exist')
  assert.ok(fs.existsSync(UPDATE_PROFILE_PATH), 'api/sellers/update-profile.php must exist')

  const profileSyntax = execSync(`php -l "${PROFILE_PATH}"`, { encoding: 'utf8' })
  assert.match(profileSyntax, /No syntax errors detected/i)

  const updateSyntax = execSync(`php -l "${UPDATE_PROFILE_PATH}"`, { encoding: 'utf8' })
  assert.match(updateSyntax, /No syntax errors detected/i)
})

test('Seller profile files contain zero physical DELETE statements', () => {
  for (const filePath of [PROFILE_PATH, UPDATE_PROFILE_PATH]) {
    const code = fs.readFileSync(filePath, 'utf8')
    assert.doesNotMatch(
      code,
      /\bDELETE\s+FROM\b/i,
      `Physical DELETE FROM found in ${filePath} - must use soft/hard delete flags instead`
    )
  }
})

test('Seller profile files enforce config, db, helpers, and soft-delete filtering', () => {
  for (const filePath of [PROFILE_PATH, UPDATE_PROFILE_PATH]) {
    const code = fs.readFileSync(filePath, 'utf8')
    assert.match(code, /config\.php/i, `${filePath} must require config.php`)
    assert.match(code, /db\.php/i, `${filePath} must require db.php`)
    assert.match(code, /helpers\.php/i, `${filePath} must require helpers.php`)
    assert.match(code, /deleted_at\s+IS\s+NULL/i, `${filePath} must check deleted_at IS NULL`)
    assert.match(code, /permanently_deleted\s*=\s*0/i, `${filePath} must check permanently_deleted = 0`)
    assert.match(code, /\$db->prepare\s*\(/i, `${filePath} must use PDO prepared statements`)
    assert.doesNotMatch(code, /\$db->query\s*\(/i, `${filePath} must not use unparameterized $db->query`)
  }
})

test('api/sellers/profile.php enforces GET method and requireSeller', () => {
  const code = fs.readFileSync(PROFILE_PATH, 'utf8')
  assert.match(code, /requireMethod\s*\(\s*['"]GET['"]\s*\)/i, 'profile.php must enforce GET method')
  assert.match(code, /requireSeller\s*\(/i, 'profile.php must enforce requireSeller')
  assert.match(code, /seller_profiles/i, 'profile.php must query seller_profiles')
  assert.match(code, /JOIN\s+users/i, 'profile.php must join users table')
})

test('api/sellers/update-profile.php enforces PUT or POST and requireApprovedSeller', () => {
  const code = fs.readFileSync(UPDATE_PROFILE_PATH, 'utf8')
  assert.match(code, /requireApprovedSeller\s*\(/i, 'update-profile.php must enforce requireApprovedSeller')
  assert.match(code, /PUT/i, 'update-profile.php must accept PUT method')
  assert.match(code, /POST/i, 'update-profile.php must accept POST method')
  assert.match(code, /UPDATE\s+seller_profiles/i, 'update-profile.php must update seller_profiles')
})

test('runtime: profile.php rejects non-GET methods with 405', () => {
  const runner = path.join(ROOT_DIR, 'test_profile_method.php')
  fs.writeFileSync(
    runner,
    `<?php
$_SERVER['REQUEST_METHOD'] = 'POST';
require __DIR__ . '/api/sellers/profile.php';
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

test('runtime: profile.php rejects unauthenticated requests and non-seller roles', () => {
  // 1. Unauthenticated -> 403 or 401
  const runnerUnauth = path.join(ROOT_DIR, 'test_profile_unauth.php')
  fs.writeFileSync(
    runnerUnauth,
    `<?php
$_SERVER['REQUEST_METHOD'] = 'GET';
require __DIR__ . '/api/sellers/profile.php';
`
  )
  try {
    const output = execSync(`php "${runnerUnauth}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.ok(json.error, 'Should reject unauthenticated requests')
  } finally {
    if (fs.existsSync(runnerUnauth)) fs.unlinkSync(runnerUnauth)
  }

  // 2. Owner role -> 403 Seller privileges required
  const runnerOwner = path.join(ROOT_DIR, 'test_profile_owner.php')
  fs.writeFileSync(
    runnerOwner,
    `<?php
$_SERVER['REQUEST_METHOD'] = 'GET';
require_once __DIR__ . '/api/config.php';
$_SESSION['user_id'] = 1;
$_SESSION['user_role'] = 'owner';
require __DIR__ . '/api/sellers/profile.php';
`
  )
  try {
    const output = execSync(`php "${runnerOwner}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.equal(json.error, 'Seller privileges required')
  } finally {
    if (fs.existsSync(runnerOwner)) fs.unlinkSync(runnerOwner)
  }
})

test('runtime: profile.php returns seller profile for all statuses (pending, approved, suspended, rejected)', () => {
  const statuses = ['pending', 'approved', 'suspended', 'rejected']

  for (const status of statuses) {
    const runner = path.join(ROOT_DIR, `test_profile_${status}.php`)
    fs.writeFileSync(
      runner,
      `<?php
${PHP_MOCK_PDO_DEFINITION}

$_SERVER['REQUEST_METHOD'] = 'GET';
require_once __DIR__ . '/api/config.php';

$pdo = new MockPDO();
$pdo->users = [
    [
        'id' => 10,
        'name' => 'Juan Dela Cruz',
        'email' => 'juan@example.com',
        'role' => 'seller',
        'deleted_at' => null,
        'permanently_deleted' => 0,
    ],
];
$pdo->sellerProfiles = [
    [
        'id' => 1,
        'user_id' => 10,
        'store_name' => "Juan's Custom Kicks",
        'store_description' => 'Handcrafted Filipino-inspired shoe designs',
        'status' => '${status}',
        'admin_notes' => ${status === 'rejected' ? "'Needs more documentation'" : 'null'},
        'approved_at' => ${status === 'approved' ? "'2026-10-02 08:30:00'" : 'null'},
        'created_at' => '2026-10-01 10:00:00',
        'deleted_at' => null,
        'permanently_deleted' => 0,
    ],
];

$GLOBALS['__TEST_PDO__'] = $pdo;
$_SESSION['user_id'] = 10;
$_SESSION['user_role'] = 'seller';
$_SESSION['seller_status'] = '${status}';

require __DIR__ . '/api/sellers/profile.php';
`
    )
    try {
      const output = execSync(`php "${runner}"`, { encoding: 'utf8' })
      const json = JSON.parse(output)
      assert.equal(json.success, true, `Should succeed for status ${status}`)
      assert.ok(json.seller, 'Should return seller object')
      assert.equal(json.seller.userId, 10)
      assert.equal(json.seller.name, 'Juan Dela Cruz')
      assert.equal(json.seller.email, 'juan@example.com')
      assert.equal(json.seller.storeName, "Juan's Custom Kicks")
      assert.equal(json.seller.storeDescription, 'Handcrafted Filipino-inspired shoe designs')
      assert.equal(json.seller.status, status)
      if (status === 'rejected') {
        assert.equal(json.seller.adminNotes, 'Needs more documentation')
      }
      if (status === 'approved') {
        assert.equal(json.seller.approvedAt, '2026-10-02 08:30:00')
      }
      assert.equal(json.seller.createdAt, '2026-10-01 10:00:00')
    } finally {
      if (fs.existsSync(runner)) fs.unlinkSync(runner)
    }
  }
})

test('runtime: profile.php returns 404 when profile not found or soft-deleted', () => {
  const runner = path.join(ROOT_DIR, 'test_profile_404.php')
  fs.writeFileSync(
    runner,
    `<?php
${PHP_MOCK_PDO_DEFINITION}

$_SERVER['REQUEST_METHOD'] = 'GET';
require_once __DIR__ . '/api/config.php';

$pdo = new MockPDO();
$pdo->users = [
    [
        'id' => 99,
        'name' => 'Ghost Seller',
        'email' => 'ghost@example.com',
        'role' => 'seller',
        'deleted_at' => null,
        'permanently_deleted' => 0,
    ],
];
$pdo->sellerProfiles = []; // No active profile

$GLOBALS['__TEST_PDO__'] = $pdo;
$_SESSION['user_id'] = 99;
$_SESSION['user_role'] = 'seller';

require __DIR__ . '/api/sellers/profile.php';
`
  )
  try {
    const output = execSync(`php "${runner}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.equal(json.error, 'Seller profile not found')
  } finally {
    if (fs.existsSync(runner)) fs.unlinkSync(runner)
  }
})

test('runtime: update-profile.php rejects invalid methods with 405', () => {
  for (const method of ['GET', 'DELETE']) {
    const runner = path.join(ROOT_DIR, `test_update_method_${method}.php`)
    fs.writeFileSync(
      runner,
      `<?php
$_SERVER['REQUEST_METHOD'] = '${method}';
require __DIR__ . '/api/sellers/update-profile.php';
`
    )
    try {
      const output = execSync(`php "${runner}"`, { encoding: 'utf8' })
      const json = JSON.parse(output)
      assert.equal(json.error, 'Method not allowed')
    } finally {
      if (fs.existsSync(runner)) fs.unlinkSync(runner)
    }
  }
})

test('runtime: update-profile.php rejects non-sellers and unapproved sellers', () => {
  // 1. Non-approved seller (pending)
  const runnerPending = path.join(ROOT_DIR, 'test_update_pending.php')
  fs.writeFileSync(
    runnerPending,
    `<?php
$_SERVER['REQUEST_METHOD'] = 'POST';
require_once __DIR__ . '/api/config.php';
$_SESSION['user_id'] = 10;
$_SESSION['user_role'] = 'seller';
$_SESSION['seller_status'] = 'pending';
require __DIR__ . '/api/sellers/update-profile.php';
`
  )
  try {
    const output = execSync(`php "${runnerPending}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.equal(json.error, 'Approved seller privileges required')
  } finally {
    if (fs.existsSync(runnerPending)) fs.unlinkSync(runnerPending)
  }

  // 2. Suspended seller
  const runnerSuspended = path.join(ROOT_DIR, 'test_update_suspended.php')
  fs.writeFileSync(
    runnerSuspended,
    `<?php
$_SERVER['REQUEST_METHOD'] = 'PUT';
require_once __DIR__ . '/api/config.php';
$_SESSION['user_id'] = 10;
$_SESSION['user_role'] = 'seller';
$_SESSION['seller_status'] = 'suspended';
require __DIR__ . '/api/sellers/update-profile.php';
`
  )
  try {
    const output = execSync(`php "${runnerSuspended}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.equal(json.error, 'Approved seller privileges required')
  } finally {
    if (fs.existsSync(runnerSuspended)) fs.unlinkSync(runnerSuspended)
  }
})

test('runtime: update-profile.php validates storeName and storeDescription', () => {
  const runUpdate = (body, method = 'POST') => {
    const runner = path.join(ROOT_DIR, 'test_update_val.php')
    fs.writeFileSync(
      runner,
      `<?php
${PHP_MOCK_PDO_DEFINITION}

$_SERVER['REQUEST_METHOD'] = '${method}';
require_once __DIR__ . '/api/config.php';

$pdo = new MockPDO();
$pdo->users = [
    [
        'id' => 10,
        'name' => 'Juan Dela Cruz',
        'email' => 'juan@example.com',
        'role' => 'seller',
        'deleted_at' => null,
        'permanently_deleted' => 0,
    ],
];
$pdo->sellerProfiles = [
    [
        'id' => 1,
        'user_id' => 10,
        'store_name' => "Juan's Custom Kicks",
        'store_description' => 'Original description',
        'status' => 'approved',
        'admin_notes' => null,
        'approved_at' => '2026-10-02 08:30:00',
        'created_at' => '2026-10-01 10:00:00',
        'deleted_at' => null,
        'permanently_deleted' => 0,
    ],
];

$GLOBALS['__TEST_PDO__'] = $pdo;
$_SESSION['user_id'] = 10;
$_SESSION['user_role'] = 'seller';
$_SESSION['seller_status'] = 'approved';
$GLOBALS['__JSON_BODY__'] = json_decode(${JSON.stringify(JSON.stringify(body))}, true);

require __DIR__ . '/api/sellers/update-profile.php';
`
    )
    try {
      const output = execSync(`php "${runner}"`, { encoding: 'utf8' })
      return JSON.parse(output)
    } finally {
      if (fs.existsSync(runner)) fs.unlinkSync(runner)
    }
  }

  // Missing storeName
  const resNoName = runUpdate({ storeDescription: 'Just desc' })
  assert.match(resNoName.error, /Store name must be between 2 and 255 characters/i)

  // Empty string storeName
  const resEmptyName = runUpdate({ storeName: '   ' })
  assert.match(resEmptyName.error, /Store name must be between 2 and 255 characters/i)

  // Short storeName (< 2 chars)
  const resShortName = runUpdate({ storeName: 'J' })
  assert.match(resShortName.error, /Store name must be between 2 and 255 characters/i)

  // Long storeName (> 255 chars)
  const resLongName = runUpdate({ storeName: 'S'.repeat(256) })
  assert.match(resLongName.error, /Store name must be between 2 and 255 characters/i)

  // Description > 1000 chars
  const resLongDesc = runUpdate({ storeName: 'Valid Store', storeDescription: 'D'.repeat(1001) })
  assert.match(resLongDesc.error, /Store description must not exceed 1000 characters/i)
})

test('runtime: update-profile.php updates profile via PUT and POST and returns updated seller', () => {
  for (const method of ['PUT', 'POST']) {
    const runner = path.join(ROOT_DIR, `test_update_success_${method}.php`)
    fs.writeFileSync(
      runner,
      `<?php
${PHP_MOCK_PDO_DEFINITION}

$_SERVER['REQUEST_METHOD'] = '${method}';
require_once __DIR__ . '/api/config.php';

$pdo = new MockPDO();
$pdo->users = [
    [
        'id' => 10,
        'name' => 'Juan Dela Cruz',
        'email' => 'juan@example.com',
        'role' => 'seller',
        'deleted_at' => null,
        'permanently_deleted' => 0,
    ],
];
$pdo->sellerProfiles = [
    [
        'id' => 1,
        'user_id' => 10,
        'store_name' => "Old Store Name",
        'store_description' => 'Old description',
        'status' => 'approved',
        'admin_notes' => null,
        'approved_at' => '2026-10-02 08:30:00',
        'created_at' => '2026-10-01 10:00:00',
        'deleted_at' => null,
        'permanently_deleted' => 0,
    ],
];

$GLOBALS['__TEST_PDO__'] = $pdo;
$_SESSION['user_id'] = 10;
$_SESSION['user_role'] = 'seller';
$_SESSION['seller_status'] = 'approved';
$GLOBALS['__JSON_BODY__'] = [
    'storeName' => "Juan's Upgraded Studio",
    'storeDescription' => 'Premium handcrafted shoes from Manila',
];

register_shutdown_function(function() use ($pdo) {
    file_put_contents(
        __DIR__ . '/test_update_${method}_state.json',
        json_encode([
            'profiles' => $pdo->sellerProfiles,
            'session_name' => $_SESSION['seller_store_name'] ?? null,
            'session_desc' => $_SESSION['seller_store_description'] ?? null,
        ])
    );
});

require __DIR__ . '/api/sellers/update-profile.php';
`
    )
    const statePath = path.join(ROOT_DIR, `test_update_${method}_state.json`)
    try {
      const output = execSync(`php "${runner}"`, { encoding: 'utf8' })
      const json = JSON.parse(output)
      assert.equal(json.success, true)
      assert.equal(json.message, 'Store profile updated successfully')
      assert.ok(json.seller, 'Response must include updated seller')
      assert.equal(json.seller.userId, 10)
      assert.equal(json.seller.storeName, "Juan's Upgraded Studio")
      assert.equal(json.seller.storeDescription, 'Premium handcrafted shoes from Manila')
      assert.equal(json.seller.status, 'approved')

      assert.ok(fs.existsSync(statePath), 'State file should exist')
      const state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
      assert.equal(state.profiles[0].store_name, "Juan's Upgraded Studio")
      assert.equal(state.profiles[0].store_description, 'Premium handcrafted shoes from Manila')
      assert.equal(state.session_name, "Juan's Upgraded Studio")
      assert.equal(state.session_desc, 'Premium handcrafted shoes from Manila')
    } finally {
      if (fs.existsSync(runner)) fs.unlinkSync(runner)
      if (fs.existsSync(statePath)) fs.unlinkSync(statePath)
    }
  }
})
