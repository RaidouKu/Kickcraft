import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const ROOT_DIR = path.resolve(import.meta.dirname, '..')
const LIST_PATH = path.join(ROOT_DIR, 'api', 'sellers', 'list.php')
const REVIEW_PATH = path.join(ROOT_DIR, 'api', 'sellers', 'review.php')

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

            // 1. User lookup for currentSessionUser / requireAdmin
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

            // 2. Sellers listing: seller_profiles JOIN users
            if (stripos($query, 'FROM seller_profiles') !== false && stripos($query, 'JOIN users') !== false) {
                $rows = [];
                // Check if status filter is in query
                $filterStatus = null;
                if (stripos($query, 'sp.status = ?') !== false || stripos($query, 'status = ?') !== false) {
                    $filterStatus = $params[0] ?? null;
                }

                foreach ($this->sellerProfiles as $sp) {
                    if (!empty($sp['deleted_at']) || !empty($sp['permanently_deleted'])) {
                        continue;
                    }
                    // Find user
                    $user = null;
                    foreach ($this->users as $u) {
                        if ((int)$u['id'] === (int)$sp['user_id'] && empty($u['deleted_at']) && empty($u['permanently_deleted'])) {
                            $user = $u;
                            break;
                        }
                    }
                    if (!$user) {
                        continue;
                    }

                    if ($filterStatus !== null && $sp['status'] !== $filterStatus) {
                        continue;
                    }

                    $rows[] = [
                        'id' => $sp['id'],
                        'user_id' => $sp['user_id'],
                        'name' => $user['name'],
                        'email' => $user['email'],
                        'store_name' => $sp['store_name'],
                        'store_description' => $sp['store_description'] ?? null,
                        'status' => $sp['status'],
                        'admin_notes' => $sp['admin_notes'] ?? null,
                        'approved_at' => $sp['approved_at'] ?? null,
                        'created_at' => $sp['created_at'],
                    ];
                }

                // Sort by created_at DESC
                usort($rows, fn($a, $b) => strcmp($b['created_at'], $a['created_at']));
                return $rows;
            }

            // 3. Review update: UPDATE seller_profiles SET status = ?, admin_notes = ? ...
            if (stripos($query, 'UPDATE seller_profiles') !== false) {
                $status = $params[0] ?? '';
                $notes = $params[1] ?? null;
                $userId = (int)($params[3] ?? 0);

                $updated = 0;
                foreach ($this->sellerProfiles as &$sp) {
                    if ((int)$sp['user_id'] === $userId && empty($sp['deleted_at']) && empty($sp['permanently_deleted'])) {
                        $sp['status'] = $status;
                        $sp['admin_notes'] = $notes;
                        if ($status === 'approved') {
                            $sp['approved_at'] = date('Y-m-d H:i:s');
                        }
                        $updated++;
                    }
                }
                unset($sp);
                return $updated;
            }

            // 4. Seller existence check (e.g. after update or for 404 validation)
            if (stripos($query, 'SELECT') !== false && stripos($query, 'seller_profiles') !== false) {
                $userId = (int)($params[0] ?? 0);
                foreach ($this->sellerProfiles as $sp) {
                    if ((int)$sp['user_id'] === $userId && empty($sp['deleted_at']) && empty($sp['permanently_deleted'])) {
                        // Check if user is active as well if JOIN present
                        if (stripos($query, 'JOIN users') !== false) {
                            foreach ($this->users as $u) {
                                if ((int)$u['id'] === $userId && empty($u['deleted_at']) && empty($u['permanently_deleted'])) {
                                    return ['id' => $sp['id']];
                                }
                            }
                            return false;
                        }
                        return ['id' => $sp['id']];
                    }
                }
                return false;
            }

            return false;
        });
    }
}
`

test('Admin seller files exist and have no syntax errors', () => {
  assert.ok(fs.existsSync(LIST_PATH), 'api/sellers/list.php must exist')
  assert.ok(fs.existsSync(REVIEW_PATH), 'api/sellers/review.php must exist')

  const listSyntax = execSync(`php -l "${LIST_PATH}"`, { encoding: 'utf8' })
  assert.match(listSyntax, /No syntax errors detected/i)

  const reviewSyntax = execSync(`php -l "${REVIEW_PATH}"`, { encoding: 'utf8' })
  assert.match(reviewSyntax, /No syntax errors detected/i)
})

test('Admin seller files contain zero physical DELETE statements', () => {
  for (const filePath of [LIST_PATH, REVIEW_PATH]) {
    const code = fs.readFileSync(filePath, 'utf8')
    assert.doesNotMatch(
      code,
      /\bDELETE\s+FROM\b/i,
      `Physical DELETE FROM found in ${filePath} - must use soft/hard delete flags instead`
    )
  }
})

test('Admin seller files enforce config, db, helpers, requireAdmin, and soft-delete filtering', () => {
  for (const filePath of [LIST_PATH, REVIEW_PATH]) {
    const code = fs.readFileSync(filePath, 'utf8')
    assert.match(code, /config\.php/i, `${filePath} must require config.php`)
    assert.match(code, /db\.php/i, `${filePath} must require db.php`)
    assert.match(code, /helpers\.php/i, `${filePath} must require helpers.php`)
    assert.match(code, /requireAdmin\s*\(/i, `${filePath} must enforce requireAdmin`)
    assert.match(code, /deleted_at\s+IS\s+NULL/i, `${filePath} must check deleted_at IS NULL`)
    assert.match(code, /permanently_deleted\s*=\s*0/i, `${filePath} must check permanently_deleted = 0`)
    assert.match(code, /\$db->prepare\s*\(/i, `${filePath} must use PDO prepared statements`)
    assert.doesNotMatch(code, /\$db->query\s*\(/i, `${filePath} must not use unparameterized $db->query`)
  }
})

test('api/sellers/list.php enforces GET method, join query, and created_at sorting', () => {
  const code = fs.readFileSync(LIST_PATH, 'utf8')
  assert.match(code, /requireMethod\s*\(\s*['"]GET['"]\s*\)/i, 'list.php must enforce GET method')
  assert.match(code, /seller_profiles/i, 'list.php must query seller_profiles')
  assert.match(code, /JOIN\s+users/i, 'list.php must join users table')
  assert.match(code, /ORDER\s+BY[\s\S]*?created_at\s+DESC/i, 'list.php must sort by created_at DESC')
})

test('api/sellers/review.php enforces POST method, status validation, and approved_at handling', () => {
  const code = fs.readFileSync(REVIEW_PATH, 'utf8')
  assert.match(code, /requireMethod\s*\(\s*['"]POST['"]\s*\)/i, 'review.php must enforce POST method')
  assert.match(code, /UPDATE\s+seller_profiles/i, 'review.php must update seller_profiles')
  assert.match(code, /approved/i, 'review.php must handle approved status')
  assert.match(code, /rejected/i, 'review.php must handle rejected status')
  assert.match(code, /suspended/i, 'review.php must handle suspended status')
  assert.match(code, /approved_at/i, 'review.php must manage approved_at timestamp')
})

test('runtime: list.php rejects non-GET methods with 405', () => {
  const runner = path.join(ROOT_DIR, 'test_admin_list_method.php')
  fs.writeFileSync(
    runner,
    `<?php
$_SERVER['REQUEST_METHOD'] = 'POST';
require __DIR__ . '/api/sellers/list.php';
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

test('runtime: list.php rejects unauthenticated requests with 401 and non-owner with 403', () => {
  // 1. Unauthenticated -> 401
  const runnerUnauth = path.join(ROOT_DIR, 'test_admin_list_unauth.php')
  fs.writeFileSync(
    runnerUnauth,
    `<?php
$_SERVER['REQUEST_METHOD'] = 'GET';
require __DIR__ . '/api/sellers/list.php';
`
  )
  try {
    const output = execSync(`php "${runnerUnauth}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.equal(json.error, 'Authentication required')
  } finally {
    if (fs.existsSync(runnerUnauth)) fs.unlinkSync(runnerUnauth)
  }

  // 2. Seller role -> 403
  const runnerSeller = path.join(ROOT_DIR, 'test_admin_list_forbidden.php')
  fs.writeFileSync(
    runnerSeller,
    `<?php
$_SERVER['REQUEST_METHOD'] = 'GET';
require_once __DIR__ . '/api/config.php';
$_SESSION['user_id'] = 42;
$_SESSION['user_role'] = 'seller';
require __DIR__ . '/api/sellers/list.php';
`
  )
  try {
    const output = execSync(`php "${runnerSeller}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.equal(json.error, 'Owner privileges required')
  } finally {
    if (fs.existsSync(runnerSeller)) fs.unlinkSync(runnerSeller)
  }
})

test('runtime: list.php returns formatted sellers list and filters by status', () => {
  const runner = path.join(ROOT_DIR, 'test_admin_list_runtime.php')
  fs.writeFileSync(
    runner,
    `<?php
${PHP_MOCK_PDO_DEFINITION}

$_SERVER['REQUEST_METHOD'] = 'GET';
require_once __DIR__ . '/api/config.php';

$pdo = new MockPDO();
$pdo->users = [
    [
        'id' => 1,
        'name' => 'Store Owner',
        'email' => 'owner@kickcraft.local',
        'role' => 'owner',
        'deleted_at' => null,
        'permanently_deleted' => 0,
    ],
    [
        'id' => 10,
        'name' => 'Juan Dela Cruz',
        'email' => 'juan@example.com',
        'role' => 'seller',
        'deleted_at' => null,
        'permanently_deleted' => 0,
    ],
    [
        'id' => 11,
        'name' => 'Maria Santos',
        'email' => 'maria@example.com',
        'role' => 'seller',
        'deleted_at' => null,
        'permanently_deleted' => 0,
    ],
    [
        'id' => 12,
        'name' => 'Deleted User Seller',
        'email' => 'deleted_user@example.com',
        'role' => 'seller',
        'deleted_at' => '2026-01-01 00:00:00',
        'permanently_deleted' => 0,
    ],
];

$pdo->sellerProfiles = [
    [
        'id' => 1,
        'user_id' => 10,
        'store_name' => "Juan's Custom Kicks",
        'store_description' => 'Handcrafted Filipino-inspired shoe designs',
        'status' => 'pending',
        'admin_notes' => null,
        'approved_at' => null,
        'created_at' => '2026-10-01 10:00:00',
        'deleted_at' => null,
        'permanently_deleted' => 0,
    ],
    [
        'id' => 2,
        'user_id' => 11,
        'store_name' => 'Maria Sole Studio',
        'store_description' => 'Bespoke leather craftsmanship',
        'status' => 'approved',
        'admin_notes' => 'Verified artisan store',
        'approved_at' => '2026-10-02 08:30:00',
        'created_at' => '2026-10-02 08:00:00',
        'deleted_at' => null,
        'permanently_deleted' => 0,
    ],
    [
        'id' => 3,
        'user_id' => 12,
        'store_name' => 'Ghost Store',
        'store_description' => 'User is soft deleted',
        'status' => 'pending',
        'admin_notes' => null,
        'approved_at' => null,
        'created_at' => '2026-10-01 09:00:00',
        'deleted_at' => null,
        'permanently_deleted' => 0,
    ],
    [
        'id' => 4,
        'user_id' => 10,
        'store_name' => 'Deleted Profile Store',
        'store_description' => 'Profile is soft deleted',
        'status' => 'pending',
        'admin_notes' => null,
        'approved_at' => null,
        'created_at' => '2026-10-01 09:30:00',
        'deleted_at' => '2026-01-01 00:00:00',
        'permanently_deleted' => 0,
    ],
];

$GLOBALS['__TEST_PDO__'] = $pdo;
$_SESSION['user_id'] = 1;
$_SESSION['user_role'] = 'owner';

// Case 1: All active sellers
require __DIR__ . '/api/sellers/list.php';
`
  )
  try {
    const output = execSync(`php "${runner}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.equal(json.success, true, 'Response must have success: true')
    assert.ok(Array.isArray(json.sellers), 'Response must include sellers array')
    assert.equal(json.sellers.length, 2, 'Should only return the 2 active sellers, excluding deleted user and deleted profile')

    // Sorted by created_at DESC: Maria (2026-10-02) then Juan (2026-10-01)
    const maria = json.sellers[0]
    assert.equal(maria.id, 2)
    assert.equal(maria.userId, 11)
    assert.equal(maria.name, 'Maria Santos')
    assert.equal(maria.email, 'maria@example.com')
    assert.equal(maria.storeName, 'Maria Sole Studio')
    assert.equal(maria.storeDescription, 'Bespoke leather craftsmanship')
    assert.equal(maria.status, 'approved')
    assert.equal(maria.adminNotes, 'Verified artisan store')
    assert.equal(maria.approvedAt, '2026-10-02 08:30:00')
    assert.equal(maria.createdAt, '2026-10-02 08:00:00')

    const juan = json.sellers[1]
    assert.equal(juan.id, 1)
    assert.equal(juan.userId, 10)
    assert.equal(juan.name, 'Juan Dela Cruz')
    assert.equal(juan.email, 'juan@example.com')
    assert.equal(juan.storeName, "Juan's Custom Kicks")
    assert.equal(juan.storeDescription, 'Handcrafted Filipino-inspired shoe designs')
    assert.equal(juan.status, 'pending')
    assert.equal(juan.adminNotes, null)
    assert.equal(juan.approvedAt, null)
    assert.equal(juan.createdAt, '2026-10-01 10:00:00')
  } finally {
    if (fs.existsSync(runner)) fs.unlinkSync(runner)
  }
})

test('runtime: list.php filters by ?status=pending', () => {
  const runner = path.join(ROOT_DIR, 'test_admin_list_filter.php')
  fs.writeFileSync(
    runner,
    `<?php
${PHP_MOCK_PDO_DEFINITION}

$_SERVER['REQUEST_METHOD'] = 'GET';
$_GET['status'] = 'pending';
require_once __DIR__ . '/api/config.php';

$pdo = new MockPDO();
$pdo->users = [
    [
        'id' => 1,
        'name' => 'Store Owner',
        'email' => 'owner@kickcraft.local',
        'role' => 'owner',
        'deleted_at' => null,
        'permanently_deleted' => 0,
    ],
    [
        'id' => 10,
        'name' => 'Juan Dela Cruz',
        'email' => 'juan@example.com',
        'role' => 'seller',
        'deleted_at' => null,
        'permanently_deleted' => 0,
    ],
    [
        'id' => 11,
        'name' => 'Maria Santos',
        'email' => 'maria@example.com',
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
        'status' => 'pending',
        'admin_notes' => null,
        'approved_at' => null,
        'created_at' => '2026-10-01 10:00:00',
        'deleted_at' => null,
        'permanently_deleted' => 0,
    ],
    [
        'id' => 2,
        'user_id' => 11,
        'store_name' => 'Maria Sole Studio',
        'store_description' => 'Bespoke leather craftsmanship',
        'status' => 'approved',
        'admin_notes' => 'Verified artisan store',
        'approved_at' => '2026-10-02 08:30:00',
        'created_at' => '2026-10-02 08:00:00',
        'deleted_at' => null,
        'permanently_deleted' => 0,
    ],
];

$GLOBALS['__TEST_PDO__'] = $pdo;
$_SESSION['user_id'] = 1;
$_SESSION['user_role'] = 'owner';

require __DIR__ . '/api/sellers/list.php';
`
  )
  try {
    const output = execSync(`php "${runner}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.equal(json.success, true)
    assert.equal(json.sellers.length, 1)
    assert.equal(json.sellers[0].status, 'pending')
    assert.equal(json.sellers[0].storeName, "Juan's Custom Kicks")
  } finally {
    if (fs.existsSync(runner)) fs.unlinkSync(runner)
  }
})

test('runtime: review.php rejects non-POST methods with 405', () => {
  const runner = path.join(ROOT_DIR, 'test_admin_review_method.php')
  fs.writeFileSync(
    runner,
    `<?php
$_SERVER['REQUEST_METHOD'] = 'GET';
require __DIR__ . '/api/sellers/review.php';
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

test('runtime: review.php rejects unauthenticated with 401 and non-owner with 403', () => {
  // 1. Unauthenticated -> 401
  const runnerUnauth = path.join(ROOT_DIR, 'test_admin_review_unauth.php')
  fs.writeFileSync(
    runnerUnauth,
    `<?php
$_SERVER['REQUEST_METHOD'] = 'POST';
require __DIR__ . '/api/sellers/review.php';
`
  )
  try {
    const output = execSync(`php "${runnerUnauth}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.equal(json.error, 'Authentication required')
  } finally {
    if (fs.existsSync(runnerUnauth)) fs.unlinkSync(runnerUnauth)
  }

  // 2. Seller role -> 403
  const runnerSeller = path.join(ROOT_DIR, 'test_admin_review_forbidden.php')
  fs.writeFileSync(
    runnerSeller,
    `<?php
$_SERVER['REQUEST_METHOD'] = 'POST';
require_once __DIR__ . '/api/config.php';
$_SESSION['user_id'] = 42;
$_SESSION['user_role'] = 'seller';
require __DIR__ . '/api/sellers/review.php';
`
  )
  try {
    const output = execSync(`php "${runnerSeller}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.equal(json.error, 'Owner privileges required')
  } finally {
    if (fs.existsSync(runnerSeller)) fs.unlinkSync(runnerSeller)
  }
})

test('runtime: review.php validates required fields and bounds (400)', () => {
  const runReview = (body) => {
    const runner = path.join(ROOT_DIR, 'test_review_val.php')
    fs.writeFileSync(
      runner,
      `<?php
$_SERVER['REQUEST_METHOD'] = 'POST';
require_once __DIR__ . '/api/config.php';
$_SESSION['user_id'] = 1;
$_SESSION['user_role'] = 'owner';
$GLOBALS['__JSON_BODY__'] = json_decode(${JSON.stringify(JSON.stringify(body))}, true);
require __DIR__ . '/api/sellers/review.php';
`
    )
    try {
      const output = execSync(`php "${runner}"`, { encoding: 'utf8' })
      return JSON.parse(output)
    } finally {
      if (fs.existsSync(runner)) fs.unlinkSync(runner)
    }
  }

  // Missing userId
  const resNoUser = runReview({ status: 'approved' })
  assert.match(resNoUser.error, /user ID/i)

  // Invalid userId (zero / negative)
  const resBadUser = runReview({ userId: 0, status: 'approved' })
  assert.match(resBadUser.error, /user ID/i)

  // Missing status
  const resNoStatus = runReview({ userId: 5 })
  assert.match(resNoStatus.error, /status/i)

  // Invalid status
  const resBadStatus = runReview({ userId: 5, status: 'supercharged' })
  assert.match(resBadStatus.error, /status/i)

  // Notes exceeding 1000 chars
  const resLongNotes = runReview({ userId: 5, status: 'approved', notes: 'N'.repeat(1001) })
  assert.match(resLongNotes.error, /notes/i)
})

test('runtime: review.php returns 404 when seller does not exist or is deleted', () => {
  const runner = path.join(ROOT_DIR, 'test_review_404.php')
  fs.writeFileSync(
    runner,
    `<?php
${PHP_MOCK_PDO_DEFINITION}

$_SERVER['REQUEST_METHOD'] = 'POST';
require_once __DIR__ . '/api/config.php';

$pdo = new MockPDO();
$pdo->users = [
    [
        'id' => 1,
        'name' => 'Store Owner',
        'email' => 'owner@kickcraft.local',
        'role' => 'owner',
        'deleted_at' => null,
        'permanently_deleted' => 0,
    ],
];
$pdo->sellerProfiles = []; // empty

$GLOBALS['__TEST_PDO__'] = $pdo;
$_SESSION['user_id'] = 1;
$_SESSION['user_role'] = 'owner';
$GLOBALS['__JSON_BODY__'] = [
    'userId' => 999,
    'status' => 'approved',
    'notes' => 'Does not exist',
];

require __DIR__ . '/api/sellers/review.php';
`
  )
  try {
    const output = execSync(`php "${runner}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.equal(json.error, 'Seller not found')
  } finally {
    if (fs.existsSync(runner)) fs.unlinkSync(runner)
  }
})

test('runtime: review.php updates seller status to approved, sets approved_at, and returns success', () => {
  const runner = path.join(ROOT_DIR, 'test_review_approve_success.php')
  fs.writeFileSync(
    runner,
    `<?php
${PHP_MOCK_PDO_DEFINITION}

$_SERVER['REQUEST_METHOD'] = 'POST';
require_once __DIR__ . '/api/config.php';

$pdo = new MockPDO();
$pdo->users = [
    [
        'id' => 1,
        'name' => 'Store Owner',
        'email' => 'owner@kickcraft.local',
        'role' => 'owner',
        'deleted_at' => null,
        'permanently_deleted' => 0,
    ],
    [
        'id' => 5,
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
        'user_id' => 5,
        'store_name' => "Juan's Custom Kicks",
        'store_description' => 'Handcrafted Filipino-inspired shoe designs',
        'status' => 'pending',
        'admin_notes' => null,
        'approved_at' => null,
        'created_at' => '2026-10-01 10:00:00',
        'deleted_at' => null,
        'permanently_deleted' => 0,
    ],
];

$GLOBALS['__TEST_PDO__'] = $pdo;
$_SESSION['user_id'] = 1;
$_SESSION['user_role'] = 'owner';
$GLOBALS['__JSON_BODY__'] = [
    'userId' => 5,
    'status' => 'approved',
    'notes' => 'Welcome aboard!',
];

register_shutdown_function(function() use ($pdo) {
    file_put_contents(__DIR__ . '/test_review_approve_state.json', json_encode($pdo->sellerProfiles));
});

require __DIR__ . '/api/sellers/review.php';
`
  )
  const statePath = path.join(ROOT_DIR, 'test_review_approve_state.json')
  try {
    const output = execSync(`php "${runner}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.equal(json.success, true)
    assert.equal(json.message, 'Seller status updated successfully')

    assert.ok(fs.existsSync(statePath), 'State file should exist')
    const profiles = JSON.parse(fs.readFileSync(statePath, 'utf8'))
    assert.equal(profiles[0].status, 'approved')
    assert.equal(profiles[0].admin_notes, 'Welcome aboard!')
    assert.ok(profiles[0].approved_at, 'approved_at should be set')
  } finally {
    if (fs.existsSync(runner)) fs.unlinkSync(runner)
    if (fs.existsSync(statePath)) fs.unlinkSync(statePath)
  }
})

test('runtime: review.php updates seller status to rejected and suspended with notes', () => {
  for (const status of ['rejected', 'suspended']) {
    const runner = path.join(ROOT_DIR, `test_review_${status}.php`)
    fs.writeFileSync(
      runner,
      `<?php
${PHP_MOCK_PDO_DEFINITION}

$_SERVER['REQUEST_METHOD'] = 'POST';
require_once __DIR__ . '/api/config.php';

$pdo = new MockPDO();
$pdo->users = [
    [
        'id' => 1,
        'name' => 'Store Owner',
        'email' => 'owner@kickcraft.local',
        'role' => 'owner',
        'deleted_at' => null,
        'permanently_deleted' => 0,
    ],
    [
        'id' => 5,
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
        'user_id' => 5,
        'store_name' => "Juan's Custom Kicks",
        'store_description' => 'Handcrafted Filipino-inspired shoe designs',
        'status' => 'pending',
        'admin_notes' => null,
        'approved_at' => null,
        'created_at' => '2026-10-01 10:00:00',
        'deleted_at' => null,
        'permanently_deleted' => 0,
    ],
];

$GLOBALS['__TEST_PDO__'] = $pdo;
$_SESSION['user_id'] = 1;
$_SESSION['user_role'] = 'owner';
$GLOBALS['__JSON_BODY__'] = [
    'userId' => 5,
    'status' => '${status}',
    'notes' => 'Status changed to ${status}',
];

register_shutdown_function(function() use ($pdo) {
    file_put_contents(__DIR__ . '/test_review_${status}_state.json', json_encode($pdo->sellerProfiles));
});

require __DIR__ . '/api/sellers/review.php';
`
    )
    const statePath = path.join(ROOT_DIR, `test_review_${status}_state.json`)
    try {
      const output = execSync(`php "${runner}"`, { encoding: 'utf8' })
      const json = JSON.parse(output)
      assert.equal(json.success, true)
      assert.equal(json.message, 'Seller status updated successfully')

      assert.ok(fs.existsSync(statePath), 'State file should exist')
      const profiles = JSON.parse(fs.readFileSync(statePath, 'utf8'))
      assert.equal(profiles[0].status, status)
      assert.equal(profiles[0].admin_notes, `Status changed to ${status}`)
    } finally {
      if (fs.existsSync(runner)) fs.unlinkSync(runner)
      if (fs.existsSync(statePath)) fs.unlinkSync(statePath)
    }
  }
})
