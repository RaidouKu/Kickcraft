import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const ROOT_DIR = path.resolve(import.meta.dirname, '..', '..', '..')
const UPDATE_STATUS_PATH = path.join(ROOT_DIR, 'api', 'orders', 'update-status.php')
const CANCEL_ORDER_PATH = path.join(ROOT_DIR, 'api', 'orders', 'cancel.php')

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
    public array $orders = [];

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

            // 3. Products stock increment: UPDATE products SET stock = stock + 1 WHERE id = ? ...
            if (stripos($query, 'UPDATE products') !== false && stripos($query, 'stock = stock + 1') !== false) {
                $prodId = $params[0] ?? '';
                if (isset($this->products[$prodId])) {
                    if (empty($this->products[$prodId]['deleted_at']) && empty($this->products[$prodId]['permanently_deleted'])) {
                        $this->products[$prodId]['stock'] = ((int)($this->products[$prodId]['stock'] ?? 0)) + 1;
                        return 1;
                    }
                }
                return 0;
            }

            // 4. Update orders status: UPDATE orders SET ...
            if (stripos($query, 'UPDATE orders') !== false) {
                if (stripos($query, "status = 'cancelled'") !== false) {
                    $notes = $params[0] ?? null;
                    $orderId = $params[1] ?? '';
                    if (isset($this->orders[$orderId])) {
                        $this->orders[$orderId]['status'] = 'cancelled';
                        if ($notes !== null && $notes !== '') {
                            $this->orders[$orderId]['notes'] = $notes;
                        }
                        $this->orders[$orderId]['updated_at'] = date('Y-m-d H:i:s');
                        return 1;
                    }
                    return 0;
                }

                if (stripos($query, 'SET status = ?') !== false) {
                    $status = $params[0] ?? '';
                    $notes = $params[1] ?? null;
                    $orderId = $params[2] ?? '';
                    if (isset($this->orders[$orderId])) {
                        $this->orders[$orderId]['status'] = $status;
                        if ($notes !== null && $notes !== '') {
                            $this->orders[$orderId]['notes'] = $notes;
                        }
                        $this->orders[$orderId]['updated_at'] = date('Y-m-d H:i:s');
                        return 1;
                    }
                    return 0;
                }
            }

            // 5. Orders lookup queries
            if (stripos($query, 'FROM orders') !== false) {
                // By id and buyer_email (guest tracking / cancel)
                if (stripos($query, 'buyer_email') !== false) {
                    $orderId = $params[0] ?? '';
                    $email = strtolower(trim((string)($params[1] ?? '')));
                    foreach ($this->orders as $o) {
                        $orderEmail = strtolower(trim((string)($o['buyer_email'] ?? '')));
                        if ($o['id'] === $orderId && $orderEmail === $email) {
                            if (empty($o['deleted_at']) && empty($o['permanently_deleted'])) {
                                return $o;
                            }
                        }
                    }
                    return false;
                }

                // By id and seller_id
                if (stripos($query, 'seller_id = ?') !== false) {
                    $orderId = $params[0] ?? '';
                    $sellerId = (int)($params[1] ?? 0);
                    foreach ($this->orders as $o) {
                        if ($o['id'] === $orderId && (int)$o['seller_id'] === $sellerId) {
                            if (empty($o['deleted_at']) && empty($o['permanently_deleted'])) {
                                return $o;
                            }
                        }
                    }
                    return false;
                }

                // By id alone
                if (stripos($query, 'id = ?') !== false || stripos($query, 'WHERE id = ?') !== false) {
                    $orderId = $params[0] ?? '';
                    foreach ($this->orders as $o) {
                        if ($o['id'] === $orderId) {
                            if (stripos($query, 'deleted_at IS NULL') !== false && (!empty($o['deleted_at']) || !empty($o['permanently_deleted']))) {
                                return false;
                            }
                            return $o;
                        }
                    }
                    return false;
                }
            }

            return false;
        });
    }
}
`

function runPhpEndpoint({ endpointPath, method = 'POST', body = null, session = {}, pdoSetup = '' }) {
  const runner = path.join(ROOT_DIR, `test_run_endpoint_${Date.now()}_${Math.random().toString(36).slice(2)}.php`)
  const statusFile = path.join(ROOT_DIR, `test_run_endpoint_${Date.now()}_${Math.random().toString(36).slice(2)}_status.txt`)
  const dumpFile = path.join(ROOT_DIR, `test_run_endpoint_${Date.now()}_${Math.random().toString(36).slice(2)}_dump.json`)

  const code = `<?php
${PHP_MOCK_PDO_DEFINITION}

$_SERVER['REQUEST_METHOD'] = '${method}';
require_once '${path.join(ROOT_DIR, 'api', 'config.php').replace(/\\/g, '/')}';

$pdo = new MockPDO();
${pdoSetup}
$GLOBALS['__TEST_PDO__'] = $pdo;
$GLOBALS['__DUMP_MOCK_PDO__'] = ${JSON.stringify(dumpFile)};

${Object.entries(session).map(([k, v]) => `$_SESSION[${JSON.stringify(k)}] = ${JSON.stringify(v)};`).join('\n')}

${body !== null ? `$GLOBALS['__JSON_BODY__'] = json_decode(${JSON.stringify(JSON.stringify(body))}, true);` : ''}

register_shutdown_function(function() use ($pdo) {
    file_put_contents(${JSON.stringify(statusFile)}, (string)http_response_code());
    if (isset($GLOBALS['__DUMP_MOCK_PDO__'])) {
        file_put_contents($GLOBALS['__DUMP_MOCK_PDO__'], json_encode([
            'products' => $pdo->products,
            'orders' => $pdo->orders,
            'queries' => $pdo->queries
        ]));
    }
});

require '${endpointPath.replace(/\\/g, '/')}';
`

  fs.writeFileSync(runner, code)

  try {
    const output = execSync(`php "${runner}"`, { encoding: 'utf8' })
    let json = null
    try {
      json = JSON.parse(output)
    } catch {
      json = { rawOutput: output }
    }
    const statusCode = fs.existsSync(statusFile)
      ? parseInt(fs.readFileSync(statusFile, 'utf8'), 10)
      : 200

    let pdoState = null
    if (fs.existsSync(dumpFile)) {
      try {
        pdoState = JSON.parse(fs.readFileSync(dumpFile, 'utf8'))
      } catch {}
      fs.unlinkSync(dumpFile)
    }

    return { json, statusCode, raw: output, pdoState }
  } finally {
    if (fs.existsSync(runner)) fs.unlinkSync(runner)
    if (fs.existsSync(statusFile)) fs.unlinkSync(statusFile)
    if (fs.existsSync(dumpFile)) fs.unlinkSync(dumpFile)
  }
}

function runPhpUpdateStatus(opts) {
  return runPhpEndpoint({ endpointPath: UPDATE_STATUS_PATH, ...opts })
}

function runPhpCancel(opts) {
  return runPhpEndpoint({ endpointPath: CANCEL_ORDER_PATH, ...opts })
}

const SAMPLE_USERS_SETUP = `
$pdo->users = [
    ['id' => 1, 'name' => 'Owner Admin', 'email' => 'admin@kickcraft.local', 'role' => 'owner', 'deleted_at' => null, 'permanently_deleted' => 0],
    ['id' => 10, 'name' => 'Seller One', 'email' => 'seller1@kickcraft.local', 'role' => 'seller', 'deleted_at' => null, 'permanently_deleted' => 0],
    ['id' => 20, 'name' => 'Seller Two', 'email' => 'seller2@kickcraft.local', 'role' => 'seller', 'deleted_at' => null, 'permanently_deleted' => 0],
    ['id' => 99, 'name' => 'Customer Joe', 'email' => 'buyer@kickcraft.local', 'role' => 'customer', 'deleted_at' => null, 'permanently_deleted' => 0],
];
$pdo->sellerProfiles = [
    ['user_id' => 10, 'store_name' => 'Sole Studio', 'status' => 'approved', 'deleted_at' => null, 'permanently_deleted' => 0],
    ['user_id' => 20, 'store_name' => 'Kicks R Us', 'status' => 'approved', 'deleted_at' => null, 'permanently_deleted' => 0],
];
`

const SAMPLE_PRODUCTS_ORDERS_SETUP = `
${SAMPLE_USERS_SETUP}
$pdo->products = [
    'prod-100' => [
        'id' => 'prod-100',
        'seller_id' => 10,
        'name' => 'Runner X',
        'price' => 2500.00,
        'stock' => 5,
        'status' => 'approved',
        'deleted_at' => null,
        'permanently_deleted' => 0
    ],
    'prod-200' => [
        'id' => 'prod-200',
        'seller_id' => 20,
        'name' => 'Retro High',
        'price' => 3200.00,
        'stock' => 2,
        'status' => 'approved',
        'deleted_at' => null,
        'permanently_deleted' => 0
    ],
];
$pdo->orders = [
    'KCO-2026-0001' => [
        'id' => 'KCO-2026-0001',
        'seller_id' => 10,
        'product_id' => 'prod-100',
        'buyer_name' => 'Alice Buyer',
        'buyer_email' => 'alice@example.com',
        'custom_colors' => json_encode(['Upper' => '#ff0000']),
        'custom_charm' => 'star',
        'unit_price' => 2500.00,
        'total_price' => 2500.00,
        'product_name' => 'Runner X',
        'product_thumbnail' => '/uploads/thumb1.png',
        'seller_store_name' => 'Sole Studio',
        'status' => 'pending',
        'pickup_date' => '2026-10-15',
        'notes' => 'Original note',
        'created_at' => '2026-10-01 10:00:00',
        'updated_at' => '2026-10-01 10:00:00',
        'deleted_at' => null,
        'permanently_deleted' => 0
    ],
    'KCO-2026-0002' => [
        'id' => 'KCO-2026-0002',
        'seller_id' => 20,
        'product_id' => 'prod-200',
        'buyer_name' => 'Bob Smith',
        'buyer_email' => 'bob@example.com',
        'custom_colors' => '[]',
        'custom_charm' => 'none',
        'unit_price' => 3200.00,
        'total_price' => 3200.00,
        'product_name' => 'Retro High',
        'product_thumbnail' => '/uploads/thumb2.png',
        'seller_store_name' => 'Kicks R Us',
        'status' => 'confirmed',
        'pickup_date' => '2026-10-16',
        'notes' => null,
        'created_at' => '2026-10-02 11:00:00',
        'updated_at' => '2026-10-02 11:00:00',
        'deleted_at' => null,
        'permanently_deleted' => 0
    ],
    'KCO-2026-READY' => [
        'id' => 'KCO-2026-READY',
        'seller_id' => 10,
        'product_id' => 'prod-100',
        'buyer_name' => 'Charlie Ready',
        'buyer_email' => 'charlie@example.com',
        'custom_colors' => '[]',
        'custom_charm' => 'none',
        'unit_price' => 2500.00,
        'total_price' => 2500.00,
        'product_name' => 'Runner X',
        'product_thumbnail' => '/uploads/thumb1.png',
        'seller_store_name' => 'Sole Studio',
        'status' => 'ready',
        'pickup_date' => '2026-10-14',
        'notes' => null,
        'created_at' => '2026-10-01 12:00:00',
        'updated_at' => '2026-10-01 12:00:00',
        'deleted_at' => null,
        'permanently_deleted' => 0
    ],
    'KCO-2026-DONE' => [
        'id' => 'KCO-2026-DONE',
        'seller_id' => 10,
        'product_id' => 'prod-100',
        'buyer_name' => 'David Done',
        'buyer_email' => 'david@example.com',
        'custom_colors' => '[]',
        'custom_charm' => 'none',
        'unit_price' => 2500.00,
        'total_price' => 2500.00,
        'product_name' => 'Runner X',
        'product_thumbnail' => '/uploads/thumb1.png',
        'seller_store_name' => 'Sole Studio',
        'status' => 'completed',
        'pickup_date' => '2026-10-10',
        'notes' => null,
        'created_at' => '2026-10-01 08:00:00',
        'updated_at' => '2026-10-01 08:00:00',
        'deleted_at' => null,
        'permanently_deleted' => 0
    ],
    'KCO-2026-ALREADY-CANCELLED' => [
        'id' => 'KCO-2026-ALREADY-CANCELLED',
        'seller_id' => 10,
        'product_id' => 'prod-100',
        'buyer_name' => 'Eve Cancelled',
        'buyer_email' => 'eve@example.com',
        'custom_colors' => '[]',
        'custom_charm' => 'none',
        'unit_price' => 2500.00,
        'total_price' => 2500.00,
        'product_name' => 'Runner X',
        'product_thumbnail' => '/uploads/thumb1.png',
        'seller_store_name' => 'Sole Studio',
        'status' => 'cancelled',
        'pickup_date' => '2026-10-12',
        'notes' => 'Customer changed mind',
        'created_at' => '2026-10-01 09:00:00',
        'updated_at' => '2026-10-01 09:00:00',
        'deleted_at' => null,
        'permanently_deleted' => 0
    ],
    'KCO-2026-DELETED' => [
        'id' => 'KCO-2026-DELETED',
        'seller_id' => 10,
        'product_id' => 'prod-100',
        'buyer_name' => 'Ghost',
        'buyer_email' => 'ghost@example.com',
        'custom_colors' => '[]',
        'custom_charm' => 'none',
        'unit_price' => 2500.00,
        'total_price' => 2500.00,
        'product_name' => 'Runner X',
        'product_thumbnail' => '/uploads/thumb1.png',
        'seller_store_name' => 'Sole Studio',
        'status' => 'pending',
        'pickup_date' => '2026-10-15',
        'notes' => null,
        'created_at' => '2026-10-01 10:00:00',
        'updated_at' => '2026-10-01 10:00:00',
        'deleted_at' => '2026-10-02 12:00:00',
        'permanently_deleted' => 1
    ]
];
`

// -------------------------------------------------------------
// 1. Syntax, Structure & Method Integrity Checks
// -------------------------------------------------------------

test('Endpoint files exist and pass syntax check', () => {
  assert.ok(fs.existsSync(UPDATE_STATUS_PATH), 'api/orders/update-status.php must exist')
  assert.ok(fs.existsSync(CANCEL_ORDER_PATH), 'api/orders/cancel.php must exist')

  const syntax1 = execSync(`php -l "${UPDATE_STATUS_PATH}"`, { encoding: 'utf8' })
  assert.match(syntax1, /No syntax errors detected/i)

  const syntax2 = execSync(`php -l "${CANCEL_ORDER_PATH}"`, { encoding: 'utf8' })
  assert.match(syntax2, /No syntax errors detected/i)
})

test('Endpoints contain zero physical DELETE statements', () => {
  assert.ok(fs.existsSync(UPDATE_STATUS_PATH), 'api/orders/update-status.php must exist')
  assert.ok(fs.existsSync(CANCEL_ORDER_PATH), 'api/orders/cancel.php must exist')

  const code1 = fs.readFileSync(UPDATE_STATUS_PATH, 'utf8')
  assert.doesNotMatch(code1, /\bDELETE\s+FROM\b/i, 'update-status.php must not contain physical DELETE statements')

  const code2 = fs.readFileSync(CANCEL_ORDER_PATH, 'utf8')
  assert.doesNotMatch(code2, /\bDELETE\s+FROM\b/i, 'cancel.php must not contain physical DELETE statements')
})

test('Endpoints enforce config, db, helpers, and prepared statements', () => {
  const files = [
    { name: 'update-status.php', path: UPDATE_STATUS_PATH },
    { name: 'cancel.php', path: CANCEL_ORDER_PATH },
  ]
  for (const f of files) {
    const code = fs.readFileSync(f.path, 'utf8')
    assert.match(code, /config\.php/i, `${f.name} must require config.php`)
    assert.match(code, /db\.php/i, `${f.name} must require db.php`)
    assert.match(code, /helpers\.php/i, `${f.name} must require helpers.php`)
    assert.match(code, /\$db->prepare\s*\(/i, `${f.name} must use PDO prepared statements`)
    assert.doesNotMatch(code, /\$db->query\s*\(/i, `${f.name} must not use unparameterized $db->query`)
  }
})

test('update-status.php rejects non-POST HTTP methods with 405', () => {
  for (const method of ['GET', 'PUT', 'DELETE', 'PATCH']) {
    const res = runPhpUpdateStatus({
      method,
      session: { user_id: 10, user_role: 'seller' }
    })
    assert.equal(res.statusCode, 405, `Method ${method} should be rejected with 405`)
    assert.equal(res.json.error, 'Method not allowed')
  }
})

test('cancel.php rejects non-POST HTTP methods with 405', () => {
  for (const method of ['GET', 'PUT', 'DELETE', 'PATCH']) {
    const res = runPhpCancel({
      method,
      session: { user_id: 10, user_role: 'seller' }
    })
    assert.equal(res.statusCode, 405, `Method ${method} should be rejected with 405`)
    assert.equal(res.json.error, 'Method not allowed')
  }
})

// -------------------------------------------------------------
// 2. update-status.php Authorization & Validation Tests
// -------------------------------------------------------------

test('update-status.php rejects unauthenticated users with 403', () => {
  const res = runPhpUpdateStatus({
    body: { orderId: 'KCO-2026-0001', status: 'confirmed' },
    session: {},
    pdoSetup: SAMPLE_PRODUCTS_ORDERS_SETUP
  })
  assert.equal(res.statusCode, 403)
  assert.match(res.json.error, /Seller or admin privileges required/i)
})

test('update-status.php rejects customer users with 403', () => {
  const res = runPhpUpdateStatus({
    body: { orderId: 'KCO-2026-0001', status: 'confirmed' },
    session: { user_id: 99, user_role: 'customer' },
    pdoSetup: SAMPLE_PRODUCTS_ORDERS_SETUP
  })
  assert.equal(res.statusCode, 403)
  assert.match(res.json.error, /Seller or admin privileges required/i)
})

test('update-status.php requires order ID (400 if missing or empty)', () => {
  const res = runPhpUpdateStatus({
    body: { status: 'confirmed' },
    session: { user_id: 10, user_role: 'seller' },
    pdoSetup: SAMPLE_PRODUCTS_ORDERS_SETUP
  })
  assert.equal(res.statusCode, 400)
  assert.match(res.json.error, /Order ID required/i)
})

test('update-status.php validates status in allowed list (400 on invalid status)', () => {
  const invalidStatuses = ['unknown', 'shipped', 'refunded', '', 123]
  for (const st of invalidStatuses) {
    const res = runPhpUpdateStatus({
      body: { orderId: 'KCO-2026-0001', status: st },
      session: { user_id: 10, user_role: 'seller' },
      pdoSetup: SAMPLE_PRODUCTS_ORDERS_SETUP
    })
    assert.equal(res.statusCode, 400, `Status "${st}" should be rejected with 400`)
    assert.match(res.json.error, /Invalid status/i)
  }
})

test('update-status.php returns 404 if seller attempts to update another seller’s order', () => {
  // Order KCO-2026-0002 belongs to seller 20. Seller 10 attempts to update it.
  const res = runPhpUpdateStatus({
    body: { orderId: 'KCO-2026-0002', status: 'ready' },
    session: { user_id: 10, user_role: 'seller' },
    pdoSetup: SAMPLE_PRODUCTS_ORDERS_SETUP
  })
  assert.equal(res.statusCode, 404)
  assert.match(res.json.error, /Order not found or access denied/i)
})

test('update-status.php returns 404 for non-existent or soft-deleted order', () => {
  const res1 = runPhpUpdateStatus({
    body: { orderId: 'KCO-NONEXISTENT', status: 'confirmed' },
    session: { user_id: 10, user_role: 'seller' },
    pdoSetup: SAMPLE_PRODUCTS_ORDERS_SETUP
  })
  assert.equal(res1.statusCode, 404)

  const res2 = runPhpUpdateStatus({
    body: { orderId: 'KCO-2026-DELETED', status: 'confirmed' },
    session: { user_id: 10, user_role: 'seller' },
    pdoSetup: SAMPLE_PRODUCTS_ORDERS_SETUP
  })
  assert.equal(res2.statusCode, 404)
})

// -------------------------------------------------------------
// 3. update-status.php Successful Transitions & Stock Restoration
// -------------------------------------------------------------

test('update-status.php allows seller to transition own order to confirmed', () => {
  const res = runPhpUpdateStatus({
    body: { orderId: 'KCO-2026-0001', status: 'confirmed' },
    session: { user_id: 10, user_role: 'seller' },
    pdoSetup: SAMPLE_PRODUCTS_ORDERS_SETUP
  })
  assert.equal(res.statusCode, 200)
  assert.equal(res.json.success, true)
  assert.equal(res.json.order.status, 'confirmed')
  assert.equal(res.json.order.id, 'KCO-2026-0001')
  // Product stock should NOT have changed (was 5)
  assert.equal(res.pdoState.products['prod-100'].stock, 5)
})

test('update-status.php allows seller to update status to ready and append notes', () => {
  const res = runPhpUpdateStatus({
    body: { orderId: 'KCO-2026-0001', status: 'ready', notes: 'Packed and waiting at pickup desk' },
    session: { user_id: 10, user_role: 'seller' },
    pdoSetup: SAMPLE_PRODUCTS_ORDERS_SETUP
  })
  assert.equal(res.statusCode, 200)
  assert.equal(res.json.success, true)
  assert.equal(res.json.order.status, 'ready')
  assert.equal(res.json.order.notes, 'Packed and waiting at pickup desk')
})

test('update-status.php allows seller to transition own order to completed', () => {
  const res = runPhpUpdateStatus({
    body: { orderId: 'KCO-2026-0001', status: 'completed' },
    session: { user_id: 10, user_role: 'seller' },
    pdoSetup: SAMPLE_PRODUCTS_ORDERS_SETUP
  })
  assert.equal(res.statusCode, 200)
  assert.equal(res.json.success, true)
  assert.equal(res.json.order.status, 'completed')
})

test('update-status.php allows seller to cancel order and restores product stock by 1', () => {
  const res = runPhpUpdateStatus({
    body: { orderId: 'KCO-2026-0001', status: 'cancelled', notes: 'Cancelled by seller request' },
    session: { user_id: 10, user_role: 'seller' },
    pdoSetup: SAMPLE_PRODUCTS_ORDERS_SETUP
  })
  assert.equal(res.statusCode, 200)
  assert.equal(res.json.success, true)
  assert.equal(res.json.order.status, 'cancelled')
  assert.equal(res.json.order.notes, 'Cancelled by seller request')
  // Stock must have incremented from 5 to 6
  assert.equal(res.pdoState.products['prod-100'].stock, 6)
})

test('update-status.php does not double-restore stock if order was already cancelled', () => {
  const res = runPhpUpdateStatus({
    body: { orderId: 'KCO-2026-ALREADY-CANCELLED', status: 'cancelled' },
    session: { user_id: 10, user_role: 'seller' },
    pdoSetup: SAMPLE_PRODUCTS_ORDERS_SETUP
  })
  assert.equal(res.statusCode, 200)
  assert.equal(res.json.success, true)
  assert.equal(res.json.order.status, 'cancelled')
  // Stock must NOT have incremented (remains 5)
  assert.equal(res.pdoState.products['prod-100'].stock, 5)
})

test('update-status.php allows admin (owner) to update any seller’s order and restore stock on cancellation', () => {
  // Order KCO-2026-0002 belongs to seller 20. Admin (user_id: 1) cancels it.
  const res = runPhpUpdateStatus({
    body: { orderId: 'KCO-2026-0002', status: 'cancelled' },
    session: { user_id: 1, user_role: 'owner' },
    pdoSetup: SAMPLE_PRODUCTS_ORDERS_SETUP
  })
  assert.equal(res.statusCode, 200)
  assert.equal(res.json.success, true)
  assert.equal(res.json.order.status, 'cancelled')
  // Stock for prod-200 must have incremented from 2 to 3
  assert.equal(res.pdoState.products['prod-200'].stock, 3)
})

// -------------------------------------------------------------
// 4. cancel.php Authorization, Validation, & Stock Restoration
// -------------------------------------------------------------

test('cancel.php requires order ID (400 if missing or empty)', () => {
  const res = runPhpCancel({
    body: { email: 'alice@example.com' },
    session: {},
    pdoSetup: SAMPLE_PRODUCTS_ORDERS_SETUP
  })
  assert.equal(res.statusCode, 400)
  assert.match(res.json.error, /Order ID required/i)
})

test('cancel.php rejects guest cancellation if buyer email is missing or does not match (404)', () => {
  // Missing email
  const res1 = runPhpCancel({
    body: { orderId: 'KCO-2026-0001' },
    session: {},
    pdoSetup: SAMPLE_PRODUCTS_ORDERS_SETUP
  })
  assert.equal(res1.statusCode, 404)
  assert.match(res1.json.error, /Order not found or authorization failed/i)

  // Mismatched email
  const res2 = runPhpCancel({
    body: { orderId: 'KCO-2026-0001', email: 'wrong@example.com' },
    session: {},
    pdoSetup: SAMPLE_PRODUCTS_ORDERS_SETUP
  })
  assert.equal(res2.statusCode, 404)
  assert.match(res2.json.error, /Order not found or authorization failed/i)
})

test('cancel.php allows guest cancellation when orderId and email match (pending order)', () => {
  const res = runPhpCancel({
    body: { orderId: 'KCO-2026-0001', email: 'alice@example.com', notes: 'Changed my mind' },
    session: {},
    pdoSetup: SAMPLE_PRODUCTS_ORDERS_SETUP
  })
  assert.equal(res.statusCode, 200)
  assert.equal(res.json.success, true)
  assert.match(res.json.message, /cancelled successfully/i)
  assert.equal(res.json.order.status, 'cancelled')
  assert.equal(res.json.order.notes, 'Changed my mind')
  // Stock of prod-100 restored from 5 to 6
  assert.equal(res.pdoState.products['prod-100'].stock, 6)
})

test('cancel.php matches email case-insensitively and with whitespace trimmed', () => {
  const res = runPhpCancel({
    body: { orderId: 'KCO-2026-0001', email: '  ALICE@EXAMPLE.COM  ' },
    session: {},
    pdoSetup: SAMPLE_PRODUCTS_ORDERS_SETUP
  })
  assert.equal(res.statusCode, 200)
  assert.equal(res.json.success, true)
  assert.equal(res.json.order.status, 'cancelled')
  assert.equal(res.pdoState.products['prod-100'].stock, 6)
})

test('cancel.php allows guest cancellation for confirmed order', () => {
  const res = runPhpCancel({
    body: { orderId: 'KCO-2026-0002', email: 'bob@example.com' },
    session: {},
    pdoSetup: SAMPLE_PRODUCTS_ORDERS_SETUP
  })
  assert.equal(res.statusCode, 200)
  assert.equal(res.json.success, true)
  assert.equal(res.json.order.status, 'cancelled')
  assert.equal(res.pdoState.products['prod-200'].stock, 3)
})

test('cancel.php rejects cancellation if order is ready (400)', () => {
  const res = runPhpCancel({
    body: { orderId: 'KCO-2026-READY', email: 'charlie@example.com' },
    session: {},
    pdoSetup: SAMPLE_PRODUCTS_ORDERS_SETUP
  })
  assert.equal(res.statusCode, 400)
  assert.match(res.json.error, /ready for pickup or completed cannot be cancelled/i)
  // Stock unchanged
  assert.equal(res.pdoState.products['prod-100'].stock, 5)
})

test('cancel.php rejects cancellation if order is completed (400)', () => {
  const res = runPhpCancel({
    body: { orderId: 'KCO-2026-DONE', email: 'david@example.com' },
    session: {},
    pdoSetup: SAMPLE_PRODUCTS_ORDERS_SETUP
  })
  assert.equal(res.statusCode, 400)
  assert.match(res.json.error, /ready for pickup or completed cannot be cancelled/i)
  // Stock unchanged
  assert.equal(res.pdoState.products['prod-100'].stock, 5)
})

test('cancel.php returns success if order is already cancelled without duplicate stock restore', () => {
  const res = runPhpCancel({
    body: { orderId: 'KCO-2026-ALREADY-CANCELLED', email: 'eve@example.com' },
    session: {},
    pdoSetup: SAMPLE_PRODUCTS_ORDERS_SETUP
  })
  assert.equal(res.statusCode, 200)
  assert.equal(res.json.success, true)
  assert.match(res.json.message, /already cancelled/i)
  assert.equal(res.json.order.status, 'cancelled')
  // Stock unchanged
  assert.equal(res.pdoState.products['prod-100'].stock, 5)
})

test('cancel.php allows seller to cancel their own order without email', () => {
  const res = runPhpCancel({
    body: { orderId: 'KCO-2026-0001' },
    session: { user_id: 10, user_role: 'seller' },
    pdoSetup: SAMPLE_PRODUCTS_ORDERS_SETUP
  })
  assert.equal(res.statusCode, 200)
  assert.equal(res.json.success, true)
  assert.equal(res.json.order.status, 'cancelled')
  assert.equal(res.pdoState.products['prod-100'].stock, 6)
})

test('cancel.php rejects seller attempting to cancel another seller’s order (404)', () => {
  const res = runPhpCancel({
    body: { orderId: 'KCO-2026-0002' }, // Seller 20's order
    session: { user_id: 10, user_role: 'seller' }, // Seller 10
    pdoSetup: SAMPLE_PRODUCTS_ORDERS_SETUP
  })
  assert.equal(res.statusCode, 404)
  assert.match(res.json.error, /Order not found or authorization failed/i)
  assert.equal(res.pdoState.products['prod-200'].stock, 2)
})

test('cancel.php allows admin to cancel any order without email', () => {
  const res = runPhpCancel({
    body: { orderId: 'KCO-2026-0002' }, // Seller 20's order
    session: { user_id: 1, user_role: 'owner' }, // Admin
    pdoSetup: SAMPLE_PRODUCTS_ORDERS_SETUP
  })
  assert.equal(res.statusCode, 200)
  assert.equal(res.json.success, true)
  assert.equal(res.json.order.status, 'cancelled')
  assert.equal(res.pdoState.products['prod-200'].stock, 3)
})
