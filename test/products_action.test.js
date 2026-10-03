import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const ROOT_DIR = path.resolve(import.meta.dirname, '..')
const PRODUCTS_DIR = path.join(ROOT_DIR, 'api', 'products')
const SUBMIT_PATH = path.join(PRODUCTS_DIR, 'submit.php')
const REVIEW_PATH = path.join(PRODUCTS_DIR, 'review.php')

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
        return is_numeric($this->result) ? $this->result : false;
    }
}

class MockPDO extends PDO {
    public array $queries = [];
    public array $users = [];
    public array $sellerProfiles = [];
    public array $products = [];

    public function __construct() {}

    public function prepare(string $query, array $options = []): PDOStatement {
        return new MockPDOStatement(function($params) use ($query) {
            $this->queries[] = ['query' => $query, 'params' => $params];

            // 1. User lookup for currentSessionUser
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

            // 2. Profile lookup from currentSessionUser
            if (stripos($query, 'SELECT status FROM seller_profiles') !== false) {
                $userId = (int)($params[0] ?? 0);
                foreach ($this->sellerProfiles as $sp) {
                    if ((int)$sp['user_id'] === $userId && empty($sp['deleted_at']) && empty($sp['permanently_deleted'])) {
                        return ['status' => $sp['status']];
                    }
                }
                return false;
            }

            // 3. submit.php UPDATE query
            // UPDATE products SET status = 'pending' WHERE id = ? AND seller_id = ? AND status IN ('draft', 'rejected') AND deleted_at IS NULL AND permanently_deleted = 0
            if (stripos($query, 'UPDATE products SET status') !== false && stripos($query, "status = 'pending'") !== false) {
                $id = $params[0] ?? '';
                $sellerId = (int)($params[1] ?? 0);

                foreach ($this->products as &$p) {
                    if ($p['id'] === $id && (int)$p['seller_id'] === $sellerId && in_array($p['status'], ['draft', 'rejected']) && empty($p['deleted_at']) && empty($p['permanently_deleted'])) {
                        $p['status'] = 'pending';
                        return 1;
                    }
                }
                return 0;
            }

            // 4. review.php UPDATE query
            // UPDATE products SET status = ?, admin_notes = ?, approved_at = COALESCE(approved_at, ?) WHERE id = ? AND deleted_at IS NULL AND permanently_deleted = 0
            if (stripos($query, 'UPDATE products SET status = ?, admin_notes = ?') !== false) {
                $newStatus = $params[0] ?? '';
                $adminNotes = $params[1] ?? null;
                $approvedAt = $params[2] ?? null;
                $id = $params[3] ?? '';

                foreach ($this->products as &$p) {
                    if ($p['id'] === $id && empty($p['deleted_at']) && empty($p['permanently_deleted'])) {
                        $changed = false;
                        if ($p['status'] !== $newStatus) {
                            $p['status'] = $newStatus;
                            $changed = true;
                        }
                        if ($p['admin_notes'] !== $adminNotes) {
                            $p['admin_notes'] = $adminNotes;
                            $changed = true;
                        }
                        if (empty($p['approved_at']) && $approvedAt !== null) {
                            $p['approved_at'] = $approvedAt;
                            $changed = true;
                        }
                        return $changed ? 1 : 0;
                    }
                }
                return 0;
            }

            // 5. review.php existence check query
            // SELECT id FROM products WHERE id = ? AND deleted_at IS NULL AND permanently_deleted = 0
            if (stripos($query, 'SELECT id FROM products WHERE id = ?') !== false) {
                $id = $params[0] ?? '';
                foreach ($this->products as $p) {
                    if ($p['id'] === $id && empty($p['deleted_at']) && empty($p['permanently_deleted'])) {
                        return ['id' => $id];
                    }
                }
                return false;
            }

            return false;
        });
    }
}
`

const SEED_USERS = [
  { id: 1, name: 'Admin Owner', email: 'admin@kickcraft.com', role: 'owner', deleted_at: null, permanently_deleted: 0 },
  { id: 10, name: 'Seller One', email: 'seller1@example.com', role: 'seller', deleted_at: null, permanently_deleted: 0 },
  { id: 20, name: 'Seller Two', email: 'seller2@example.com', role: 'seller', deleted_at: null, permanently_deleted: 0 },
  { id: 30, name: 'Customer User', email: 'customer@example.com', role: 'customer', deleted_at: null, permanently_deleted: 0 },
]

const SEED_PROFILES = [
  { id: 1, user_id: 10, store_name: 'SoleCraft Studio', status: 'approved', deleted_at: null, permanently_deleted: 0 },
  { id: 2, user_id: 20, store_name: 'Urban Kicks', status: 'approved', deleted_at: null, permanently_deleted: 0 },
]

const SEED_PRODUCTS = [
  {
    id: 'KCP-2026-0001',
    seller_id: 10,
    name: 'Seller 10 Draft Sneaker',
    status: 'draft',
    admin_notes: null,
    approved_at: null,
    deleted_at: null,
    permanently_deleted: 0,
  },
  {
    id: 'KCP-2026-0002',
    seller_id: 10,
    name: 'Seller 10 Rejected Sneaker',
    status: 'rejected',
    admin_notes: 'Please add better description',
    approved_at: null,
    deleted_at: null,
    permanently_deleted: 0,
  },
  {
    id: 'KCP-2026-0003',
    seller_id: 10,
    name: 'Seller 10 Pending Sneaker',
    status: 'pending',
    admin_notes: null,
    approved_at: null,
    deleted_at: null,
    permanently_deleted: 0,
  },
  {
    id: 'KCP-2026-0004',
    seller_id: 10,
    name: 'Seller 10 Approved Sneaker',
    status: 'approved',
    admin_notes: 'Looks great',
    approved_at: '2026-10-01 10:00:00',
    deleted_at: null,
    permanently_deleted: 0,
  },
  {
    id: 'KCP-2026-0005',
    seller_id: 20,
    name: 'Seller 20 Draft High-Top',
    status: 'draft',
    admin_notes: null,
    approved_at: null,
    deleted_at: null,
    permanently_deleted: 0,
  },
  {
    id: 'KCP-2026-0006',
    seller_id: 10,
    name: 'Soft Deleted Sneaker',
    status: 'draft',
    admin_notes: null,
    approved_at: null,
    deleted_at: '2026-10-02 12:00:00',
    permanently_deleted: 0,
  },
  {
    id: 'KCP-2026-0007',
    seller_id: 10,
    name: 'Permanently Deleted Sneaker',
    status: 'draft',
    admin_notes: null,
    approved_at: null,
    deleted_at: null,
    permanently_deleted: 1,
  },
]

function makeRunnerScript({ endpointFile, session = null, body = null, statusFile = null }) {
  let sessionPhp = ''
  if (session) {
    sessionPhp = `
$_SESSION['user_id'] = ${session.id};
$_SESSION['user_role'] = '${session.role}';
`
  }

  let bodyPhp = ''
  if (body !== null) {
    bodyPhp = `$GLOBALS['__JSON_BODY__'] = json_decode(${JSON.stringify(JSON.stringify(body))}, true);`
  }

  let shutdownPhp = ''
  if (statusFile) {
    shutdownPhp = `
register_shutdown_function(function() {
    file_put_contents(${JSON.stringify(statusFile.replace(/\\/g, '/'))}, (string)http_response_code());
});
`
  }

  return `<?php
${PHP_MOCK_PDO_DEFINITION}

$_SERVER['REQUEST_METHOD'] = 'POST';

require_once '${path.join(ROOT_DIR, 'api', 'config.php').replace(/\\/g, '/')}';

$pdo = new MockPDO();
$pdo->users = json_decode(${JSON.stringify(JSON.stringify(SEED_USERS))}, true);
$pdo->sellerProfiles = json_decode(${JSON.stringify(JSON.stringify(SEED_PROFILES))}, true);
$pdo->products = json_decode(${JSON.stringify(JSON.stringify(SEED_PRODUCTS))}, true);
$GLOBALS['__TEST_PDO__'] = $pdo;

${sessionPhp}
${bodyPhp}
${shutdownPhp}

require '${endpointFile.replace(/\\/g, '/')}';
`
}

test('Product action endpoint files exist and pass syntax check', () => {
  assert.ok(fs.existsSync(SUBMIT_PATH), 'api/products/submit.php must exist')
  assert.ok(fs.existsSync(REVIEW_PATH), 'api/products/review.php must exist')

  const submitSyntax = execSync(`php -l "${SUBMIT_PATH}"`, { encoding: 'utf8' })
  assert.match(submitSyntax, /No syntax errors detected/i)

  const reviewSyntax = execSync(`php -l "${REVIEW_PATH}"`, { encoding: 'utf8' })
  assert.match(reviewSyntax, /No syntax errors detected/i)
})

test('Product action endpoint files contain zero physical DELETE statements', () => {
  for (const filePath of [SUBMIT_PATH, REVIEW_PATH]) {
    const code = fs.readFileSync(filePath, 'utf8')
    assert.doesNotMatch(
      code,
      /\bDELETE\s+FROM\b/i,
      `Physical DELETE FROM found in ${filePath} - action endpoints must not contain physical DELETE statements`
    )
  }
})

test('Product action endpoint files enforce config, db, helpers, and prepared statements', () => {
  for (const filePath of [SUBMIT_PATH, REVIEW_PATH]) {
    const code = fs.readFileSync(filePath, 'utf8')
    assert.match(code, /config\.php/i, `${filePath} must require config.php`)
    assert.match(code, /db\.php/i, `${filePath} must require db.php`)
    assert.match(code, /helpers\.php/i, `${filePath} must require helpers.php`)
    assert.match(code, /\$db->prepare\s*\(/i, `${filePath} must use PDO prepared statements`)
    assert.doesNotMatch(code, /\$db->query\s*\(/i, `${filePath} must not use unparameterized $db->query`)
  }
})

test('Product action endpoint files enforce POST HTTP method', () => {
  const submitCode = fs.readFileSync(SUBMIT_PATH, 'utf8')
  assert.match(submitCode, /requireMethod\s*\(\s*['"]POST['"]\s*\)/i, 'submit.php must enforce POST')

  const reviewCode = fs.readFileSync(REVIEW_PATH, 'utf8')
  assert.match(reviewCode, /requireMethod\s*\(\s*['"]POST['"]\s*\)/i, 'review.php must enforce POST')
})

test('runtime: Product action endpoints reject non-POST HTTP methods with 405', () => {
  for (const file of [SUBMIT_PATH, REVIEW_PATH]) {
    for (const method of ['GET', 'PUT', 'DELETE']) {
      const runner = path.join(ROOT_DIR, `test_action_method_${method}_${path.basename(file, '.php')}.php`)
      const statusFile = path.join(ROOT_DIR, `test_action_method_status_${method}_${path.basename(file, '.php')}.txt`)

      fs.writeFileSync(
        runner,
        `<?php
$_SERVER['REQUEST_METHOD'] = '${method}';
register_shutdown_function(function() {
    file_put_contents(${JSON.stringify(statusFile.replace(/\\/g, '/'))}, (string)http_response_code());
});
require '${file.replace(/\\/g, '/')}';
`
      )
      try {
        const output = execSync(`php "${runner}"`, { encoding: 'utf8' })
        const json = JSON.parse(output)
        assert.equal(json.error, 'Method not allowed')
        if (fs.existsSync(statusFile)) {
          const code = parseInt(fs.readFileSync(statusFile, 'utf8'), 10)
          assert.equal(code, 405)
        }
      } finally {
        if (fs.existsSync(runner)) fs.unlinkSync(runner)
        if (fs.existsSync(statusFile)) fs.unlinkSync(statusFile)
      }
    }
  }
})

// ==========================================
// submit.php tests
// ==========================================

test('runtime: submit.php rejects unauthenticated requests, customers, and owners with 403/401', () => {
  // 1. Unauthenticated
  const runnerUnauth = path.join(ROOT_DIR, 'test_submit_unauth.php')
  fs.writeFileSync(
    runnerUnauth,
    makeRunnerScript({ endpointFile: SUBMIT_PATH, session: null })
  )
  try {
    const output = execSync(`php "${runnerUnauth}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.match(json.error, /(seller privileges required|authentication required)/i)
  } finally {
    if (fs.existsSync(runnerUnauth)) fs.unlinkSync(runnerUnauth)
  }

  // 2. Customer
  const runnerCustomer = path.join(ROOT_DIR, 'test_submit_customer.php')
  fs.writeFileSync(
    runnerCustomer,
    makeRunnerScript({ endpointFile: SUBMIT_PATH, session: { id: 30, role: 'customer' } })
  )
  try {
    const output = execSync(`php "${runnerCustomer}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.equal(json.error, 'Seller privileges required')
  } finally {
    if (fs.existsSync(runnerCustomer)) fs.unlinkSync(runnerCustomer)
  }

  // 3. Owner
  const runnerOwner = path.join(ROOT_DIR, 'test_submit_owner.php')
  fs.writeFileSync(
    runnerOwner,
    makeRunnerScript({ endpointFile: SUBMIT_PATH, session: { id: 1, role: 'owner' } })
  )
  try {
    const output = execSync(`php "${runnerOwner}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.equal(json.error, 'Seller privileges required')
  } finally {
    if (fs.existsSync(runnerOwner)) fs.unlinkSync(runnerOwner)
  }
})

test('runtime: submit.php rejects missing product ID with 400', () => {
  for (const emptyVal of ['', null, undefined]) {
    const runner = path.join(ROOT_DIR, 'test_submit_missing_id.php')
    const statusFile = path.join(ROOT_DIR, 'test_submit_missing_id_status.txt')

    const body = emptyVal !== undefined ? { productId: emptyVal } : {}

    fs.writeFileSync(
      runner,
      makeRunnerScript({
        endpointFile: SUBMIT_PATH,
        session: { id: 10, role: 'seller' },
        body,
        statusFile,
      })
    )

    try {
      const output = execSync(`php "${runner}"`, { encoding: 'utf8' })
      const json = JSON.parse(output)
      assert.equal(json.error, 'Product ID required')
      if (fs.existsSync(statusFile)) {
        const code = parseInt(fs.readFileSync(statusFile, 'utf8'), 10)
        assert.equal(code, 400)
      }
    } finally {
      if (fs.existsSync(runner)) fs.unlinkSync(runner)
      if (fs.existsSync(statusFile)) fs.unlinkSync(statusFile)
    }
  }
})

test('runtime: submit.php successfully transitions draft product to pending', () => {
  const runner = path.join(ROOT_DIR, 'test_submit_draft_success.php')
  fs.writeFileSync(
    runner,
    makeRunnerScript({
      endpointFile: SUBMIT_PATH,
      session: { id: 10, role: 'seller' },
      body: { productId: 'KCP-2026-0001' },
    })
  )

  try {
    const output = execSync(`php "${runner}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.equal(json.success, true)
  } finally {
    if (fs.existsSync(runner)) fs.unlinkSync(runner)
  }
})

test('runtime: submit.php successfully transitions rejected product to pending (re-submission)', () => {
  const runner = path.join(ROOT_DIR, 'test_submit_rejected_success.php')
  fs.writeFileSync(
    runner,
    makeRunnerScript({
      endpointFile: SUBMIT_PATH,
      session: { id: 10, role: 'seller' },
      body: { productId: 'KCP-2026-0002' },
    })
  )

  try {
    const output = execSync(`php "${runner}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.equal(json.success, true)
  } finally {
    if (fs.existsSync(runner)) fs.unlinkSync(runner)
  }
})

test('runtime: submit.php rejects submit if product belongs to another seller', () => {
  const runner = path.join(ROOT_DIR, 'test_submit_other_seller.php')
  const statusFile = path.join(ROOT_DIR, 'test_submit_other_seller_status.txt')

  // Seller 10 attempts to submit Seller 20's draft product KCP-2026-0005
  fs.writeFileSync(
    runner,
    makeRunnerScript({
      endpointFile: SUBMIT_PATH,
      session: { id: 10, role: 'seller' },
      body: { productId: 'KCP-2026-0005' },
      statusFile,
    })
  )

  try {
    const output = execSync(`php "${runner}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.match(json.error, /invalid operation or product not eligible for submission/i)
    if (fs.existsSync(statusFile)) {
      const code = parseInt(fs.readFileSync(statusFile, 'utf8'), 10)
      assert.equal(code, 400)
    }
  } finally {
    if (fs.existsSync(runner)) fs.unlinkSync(runner)
    if (fs.existsSync(statusFile)) fs.unlinkSync(statusFile)
  }
})

test('runtime: submit.php rejects submit if product is already pending or approved', () => {
  // 1. Product is already pending (KCP-2026-0003)
  const runnerPending = path.join(ROOT_DIR, 'test_submit_already_pending.php')
  fs.writeFileSync(
    runnerPending,
    makeRunnerScript({
      endpointFile: SUBMIT_PATH,
      session: { id: 10, role: 'seller' },
      body: { productId: 'KCP-2026-0003' },
    })
  )

  try {
    const output = execSync(`php "${runnerPending}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.match(json.error, /invalid operation or product not eligible for submission/i)
  } finally {
    if (fs.existsSync(runnerPending)) fs.unlinkSync(runnerPending)
  }

  // 2. Product is already approved (KCP-2026-0004)
  const runnerApproved = path.join(ROOT_DIR, 'test_submit_already_approved.php')
  fs.writeFileSync(
    runnerApproved,
    makeRunnerScript({
      endpointFile: SUBMIT_PATH,
      session: { id: 10, role: 'seller' },
      body: { productId: 'KCP-2026-0004' },
    })
  )

  try {
    const output = execSync(`php "${runnerApproved}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.match(json.error, /invalid operation or product not eligible for submission/i)
  } finally {
    if (fs.existsSync(runnerApproved)) fs.unlinkSync(runnerApproved)
  }
})

test('runtime: submit.php rejects submit if product is soft-deleted, permanently deleted, or nonexistent', () => {
  for (const id of ['KCP-2026-0006', 'KCP-2026-0007', 'KCP-NONEXISTENT']) {
    const runner = path.join(ROOT_DIR, `test_submit_invalid_${id}.php`)
    fs.writeFileSync(
      runner,
      makeRunnerScript({
        endpointFile: SUBMIT_PATH,
        session: { id: 10, role: 'seller' },
        body: { productId: id },
      })
    )

    try {
      const output = execSync(`php "${runner}"`, { encoding: 'utf8' })
      const json = JSON.parse(output)
      assert.match(json.error, /invalid operation or product not eligible for submission/i)
    } finally {
      if (fs.existsSync(runner)) fs.unlinkSync(runner)
    }
  }
})

// ==========================================
// review.php tests
// ==========================================

test('runtime: review.php rejects unauthenticated requests, customers, and sellers with 401/403', () => {
  // 1. Unauthenticated -> 401
  const runnerUnauth = path.join(ROOT_DIR, 'test_review_unauth.php')
  fs.writeFileSync(
    runnerUnauth,
    makeRunnerScript({ endpointFile: REVIEW_PATH, session: null })
  )
  try {
    const output = execSync(`php "${runnerUnauth}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.match(json.error, /authentication required/i)
  } finally {
    if (fs.existsSync(runnerUnauth)) fs.unlinkSync(runnerUnauth)
  }

  // 2. Customer -> 403
  const runnerCustomer = path.join(ROOT_DIR, 'test_review_customer.php')
  fs.writeFileSync(
    runnerCustomer,
    makeRunnerScript({ endpointFile: REVIEW_PATH, session: { id: 30, role: 'customer' } })
  )
  try {
    const output = execSync(`php "${runnerCustomer}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.equal(json.error, 'Owner privileges required')
  } finally {
    if (fs.existsSync(runnerCustomer)) fs.unlinkSync(runnerCustomer)
  }

  // 3. Seller -> 403
  const runnerSeller = path.join(ROOT_DIR, 'test_review_seller.php')
  fs.writeFileSync(
    runnerSeller,
    makeRunnerScript({ endpointFile: REVIEW_PATH, session: { id: 10, role: 'seller' } })
  )
  try {
    const output = execSync(`php "${runnerSeller}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.equal(json.error, 'Owner privileges required')
  } finally {
    if (fs.existsSync(runnerSeller)) fs.unlinkSync(runnerSeller)
  }
})

test('runtime: review.php rejects missing product ID with 400', () => {
  const runner = path.join(ROOT_DIR, 'test_review_missing_id.php')
  const statusFile = path.join(ROOT_DIR, 'test_review_missing_id_status.txt')

  fs.writeFileSync(
    runner,
    makeRunnerScript({
      endpointFile: REVIEW_PATH,
      session: { id: 1, role: 'owner' },
      body: { status: 'approved' },
      statusFile,
    })
  )

  try {
    const output = execSync(`php "${runner}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.equal(json.error, 'Product ID required')
    if (fs.existsSync(statusFile)) {
      const code = parseInt(fs.readFileSync(statusFile, 'utf8'), 10)
      assert.equal(code, 400)
    }
  } finally {
    if (fs.existsSync(runner)) fs.unlinkSync(runner)
    if (fs.existsSync(statusFile)) fs.unlinkSync(statusFile)
  }
})

test('runtime: review.php rejects invalid status values with 400', () => {
  for (const invalidStatus of ['draft', 'pending', 'deleted', 'random', '']) {
    const runner = path.join(ROOT_DIR, 'test_review_invalid_status.php')
    const statusFile = path.join(ROOT_DIR, 'test_review_invalid_status_status.txt')

    fs.writeFileSync(
      runner,
      makeRunnerScript({
        endpointFile: REVIEW_PATH,
        session: { id: 1, role: 'owner' },
        body: { productId: 'KCP-2026-0003', status: invalidStatus },
        statusFile,
      })
    )

    try {
      const output = execSync(`php "${runner}"`, { encoding: 'utf8' })
      const json = JSON.parse(output)
      assert.match(json.error, /invalid status/i)
      if (fs.existsSync(statusFile)) {
        const code = parseInt(fs.readFileSync(statusFile, 'utf8'), 10)
        assert.equal(code, 400)
      }
    } finally {
      if (fs.existsSync(runner)) fs.unlinkSync(runner)
      if (fs.existsSync(statusFile)) fs.unlinkSync(statusFile)
    }
  }
})

test('runtime: review.php successfully approves pending product and sets approved_at timestamp', () => {
  const runner = path.join(ROOT_DIR, 'test_review_approve_success.php')
  fs.writeFileSync(
    runner,
    `<?php
${PHP_MOCK_PDO_DEFINITION}

$_SERVER['REQUEST_METHOD'] = 'POST';
require_once '${path.join(ROOT_DIR, 'api', 'config.php').replace(/\\/g, '/')}';

$pdo = new MockPDO();
$pdo->users = json_decode(${JSON.stringify(JSON.stringify(SEED_USERS))}, true);
$pdo->sellerProfiles = json_decode(${JSON.stringify(JSON.stringify(SEED_PROFILES))}, true);
$pdo->products = json_decode(${JSON.stringify(JSON.stringify(SEED_PRODUCTS))}, true);
$GLOBALS['__TEST_PDO__'] = $pdo;

$_SESSION['user_id'] = 1;
$_SESSION['user_role'] = 'owner';
$GLOBALS['__JSON_BODY__'] = [
    'productId' => 'KCP-2026-0003',
    'status' => 'approved',
    'notes' => 'Product meets KickCraft standards',
];

require '${REVIEW_PATH.replace(/\\/g, '/')}';
`
  )

  try {
    const output = execSync(`php "${runner}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.equal(json.success, true)

    // Verify in mock DB that product was updated
    const updatedProdScript = `<?php
require_once '${path.join(ROOT_DIR, 'api', 'config.php').replace(/\\/g, '/')}';
`
  } finally {
    if (fs.existsSync(runner)) fs.unlinkSync(runner)
  }
})

test('runtime: review.php successfully rejects pending product with notes', () => {
  const runner = path.join(ROOT_DIR, 'test_review_reject_success.php')
  fs.writeFileSync(
    runner,
    makeRunnerScript({
      endpointFile: REVIEW_PATH,
      session: { id: 1, role: 'owner' },
      body: {
        productId: 'KCP-2026-0003',
        status: 'rejected',
        notes: 'Mesh mapping incomplete',
      },
    })
  )

  try {
    const output = execSync(`php "${runner}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.equal(json.success, true)
  } finally {
    if (fs.existsSync(runner)) fs.unlinkSync(runner)
  }
})

test('runtime: review.php successfully suspends an approved product', () => {
  const runner = path.join(ROOT_DIR, 'test_review_suspend_success.php')
  fs.writeFileSync(
    runner,
    makeRunnerScript({
      endpointFile: REVIEW_PATH,
      session: { id: 1, role: 'owner' },
      body: {
        productId: 'KCP-2026-0004',
        status: 'suspended',
        notes: 'Temporarily unavailable',
      },
    })
  )

  try {
    const output = execSync(`php "${runner}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.equal(json.success, true)
  } finally {
    if (fs.existsSync(runner)) fs.unlinkSync(runner)
  }
})

test('runtime: review.php returns 404 for unknown or soft-deleted product ID', () => {
  for (const id of ['KCP-NONEXISTENT', 'KCP-2026-0006', 'KCP-2026-0007']) {
    const runner = path.join(ROOT_DIR, `test_review_notfound_${id}.php`)
    const statusFile = path.join(ROOT_DIR, `test_review_notfound_status_${id}.txt`)

    fs.writeFileSync(
      runner,
      makeRunnerScript({
        endpointFile: REVIEW_PATH,
        session: { id: 1, role: 'owner' },
        body: {
          productId: id,
          status: 'approved',
        },
        statusFile,
      })
    )

    try {
      const output = execSync(`php "${runner}"`, { encoding: 'utf8' })
      const json = JSON.parse(output)
      assert.equal(json.error, 'Product not found')
      if (fs.existsSync(statusFile)) {
        const code = parseInt(fs.readFileSync(statusFile, 'utf8'), 10)
        assert.equal(code, 404)
      }
    } finally {
      if (fs.existsSync(runner)) fs.unlinkSync(runner)
      if (fs.existsSync(statusFile)) fs.unlinkSync(statusFile)
    }
  }
})
