import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const ROOT_DIR = path.resolve(import.meta.dirname, '..', '..', '..')
const LIST_ORDERS_PATH = path.join(ROOT_DIR, 'api', 'orders', 'list.php')

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

            // 3. Orders query
            if (stripos($query, 'FROM orders') !== false) {
                $paramIdx = 0;
                $filterSellerId = null;
                $filterStatus = null;

                if (stripos($query, 'seller_id = ?') !== false) {
                    $filterSellerId = (int)($params[$paramIdx++] ?? 0);
                }
                if (stripos($query, 'status = ?') !== false) {
                    $filterStatus = strtolower(trim((string)($params[$paramIdx++] ?? '')));
                }

                $matched = [];
                foreach ($this->orders as $o) {
                    // Check soft deletion
                    if (!empty($o['deleted_at']) || !empty($o['permanently_deleted'])) {
                        continue;
                    }
                    if ($filterSellerId !== null && (int)$o['seller_id'] !== $filterSellerId) {
                        continue;
                    }
                    if ($filterStatus !== null && strtolower((string)$o['status']) !== $filterStatus) {
                        continue;
                    }
                    $matched[] = $o;
                }

                // If query specifies created_at DESC, sort results
                if (stripos($query, 'ORDER BY') !== false && stripos($query, 'created_at DESC') !== false) {
                    usort($matched, function($a, $b) {
                        return strcmp((string)($b['created_at'] ?? ''), (string)($a['created_at'] ?? ''));
                    });
                }

                return $matched;
            }

            return false;
        });
    }
}
`

function runPhpOrderList({ method = 'GET', getParams = {}, session = {}, pdoSetup = '' }) {
  const runner = path.join(ROOT_DIR, `test_run_order_list_${Date.now()}_${Math.random().toString(36).slice(2)}.php`)
  const statusFile = path.join(ROOT_DIR, `test_run_order_list_${Date.now()}_${Math.random().toString(36).slice(2)}_status.txt`)

  const getArrayPhp = Object.entries(getParams)
    .map(([k, v]) => `$_GET['${k}'] = ${JSON.stringify(String(v))};`)
    .join('\n')

  const code = `<?php
${PHP_MOCK_PDO_DEFINITION}

$_SERVER['REQUEST_METHOD'] = '${method}';
${getArrayPhp}
require_once '${path.join(ROOT_DIR, 'api', 'config.php').replace(/\\/g, '/')}';

$pdo = new MockPDO();
${pdoSetup}
$GLOBALS['__TEST_PDO__'] = $pdo;

${Object.entries(session).map(([k, v]) => `$_SESSION[${JSON.stringify(k)}] = ${JSON.stringify(v)};`).join('\n')}

register_shutdown_function(function() {
    file_put_contents(${JSON.stringify(statusFile)}, (string)http_response_code());
});

require '${LIST_ORDERS_PATH.replace(/\\/g, '/')}';
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
    return { json, statusCode, raw: output }
  } finally {
    if (fs.existsSync(runner)) fs.unlinkSync(runner)
    if (fs.existsSync(statusFile)) fs.unlinkSync(statusFile)
  }
}

test('Order list endpoint file exists and passes syntax check', () => {
  assert.ok(fs.existsSync(LIST_ORDERS_PATH), 'api/orders/list.php must exist')
  const syntax = execSync(`php -l "${LIST_ORDERS_PATH}"`, { encoding: 'utf8' })
  assert.match(syntax, /No syntax errors detected/i)
})

test('Order list endpoint contains zero physical DELETE statements', () => {
  assert.ok(fs.existsSync(LIST_ORDERS_PATH), 'api/orders/list.php must exist')
  const code = fs.readFileSync(LIST_ORDERS_PATH, 'utf8')
  assert.doesNotMatch(
    code,
    /\bDELETE\s+FROM\b/i,
    'list.php must not contain physical DELETE statements'
  )
})

test('Order list endpoint enforces config, db, helpers, and prepared statements', () => {
  assert.ok(fs.existsSync(LIST_ORDERS_PATH), 'api/orders/list.php must exist')
  const code = fs.readFileSync(LIST_ORDERS_PATH, 'utf8')
  assert.match(code, /config\.php/i, 'list.php must require config.php')
  assert.match(code, /db\.php/i, 'list.php must require db.php')
  assert.match(code, /helpers\.php/i, 'list.php must require helpers.php')
  assert.match(code, /\$db->prepare\s*\(/i, 'list.php must use PDO prepared statements')
  assert.doesNotMatch(code, /\$db->query\s*\(/i, 'list.php must not use unparameterized $db->query')
})

test('Order list endpoint rejects non-GET HTTP methods with 405', () => {
  const methods = ['POST', 'PUT', 'DELETE', 'PATCH']
  for (const method of methods) {
    const res = runPhpOrderList({
      method,
      session: { user_id: 10, user_role: 'seller' }
    })
    assert.equal(res.statusCode, 405, `Method ${method} should be rejected with 405`)
    assert.equal(res.json.error, 'Method not allowed')
  }
})

test('Order list endpoint rejects unauthenticated access (no session)', () => {
  const res = runPhpOrderList({
    method: 'GET',
    session: {}
  })
  assert.ok(res.statusCode === 401 || res.statusCode === 403, 'Must reject unauthenticated with 401 or 403')
  assert.match(res.json.error, /privileges required|Authentication required/i)
})

test('Order list endpoint rejects customer role access with 403', () => {
  const pdoSetup = `
$pdo->users[] = [
    'id' => 99,
    'name' => 'Regular Customer',
    'email' => 'customer@example.com',
    'role' => 'customer',
    'deleted_at' => null,
    'permanently_deleted' => 0
];
`
  const res = runPhpOrderList({
    method: 'GET',
    session: { user_id: 99, user_role: 'customer' },
    pdoSetup
  })
  assert.equal(res.statusCode, 403)
  assert.match(res.json.error, /privileges required/i)
})

test('Order list endpoint allows seller to retrieve only their own orders', () => {
  const pdoSetup = `
$pdo->users[] = [
    'id' => 5,
    'name' => 'Seller Five',
    'email' => 'seller5@example.com',
    'role' => 'seller',
    'deleted_at' => null,
    'permanently_deleted' => 0
];
$pdo->sellerProfiles[] = [
    'user_id' => 5,
    'store_name' => 'Five Kicks',
    'status' => 'approved',
    'deleted_at' => null,
    'permanently_deleted' => 0
];

$pdo->orders[] = [
    'id' => 'KCO-2026-0001',
    'seller_id' => 5,
    'product_id' => 'KCP-2026-0001',
    'buyer_name' => 'Alice Buyer',
    'buyer_email' => 'alice@example.com',
    'custom_colors' => json_encode(['Upper' => '#FF0000']),
    'custom_charm' => 'star',
    'unit_price' => 3200.00,
    'total_price' => 3200.00,
    'product_name' => 'Shoe Five A',
    'product_thumbnail' => '/images/five_a.png',
    'seller_store_name' => 'Five Kicks',
    'status' => 'pending',
    'pickup_date' => '2026-10-15',
    'notes' => 'Note 1',
    'created_at' => '2026-10-02 10:00:00',
    'updated_at' => '2026-10-02 10:00:00',
    'deleted_at' => null,
    'permanently_deleted' => 0
];

$pdo->orders[] = [
    'id' => 'KCO-2026-0002',
    'seller_id' => 8, // Different seller
    'product_id' => 'KCP-2026-0008',
    'buyer_name' => 'Bob Buyer',
    'buyer_email' => 'bob@example.com',
    'custom_colors' => json_encode([]),
    'custom_charm' => 'none',
    'unit_price' => 2500.00,
    'total_price' => 2500.00,
    'product_name' => 'Shoe Eight',
    'product_thumbnail' => '/images/eight.png',
    'seller_store_name' => 'Eight Kicks',
    'status' => 'pending',
    'pickup_date' => '2026-10-16',
    'notes' => null,
    'created_at' => '2026-10-02 11:00:00',
    'updated_at' => '2026-10-02 11:00:00',
    'deleted_at' => null,
    'permanently_deleted' => 0
];

$pdo->orders[] = [
    'id' => 'KCO-2026-0003',
    'seller_id' => 5,
    'product_id' => 'KCP-2026-0001',
    'buyer_name' => 'Charlie Buyer',
    'buyer_email' => 'charlie@example.com',
    'custom_colors' => json_encode(['Upper' => '#00FF00']),
    'custom_charm' => 'lightning',
    'unit_price' => 3200.00,
    'total_price' => 3200.00,
    'product_name' => 'Shoe Five B',
    'product_thumbnail' => '/images/five_b.png',
    'seller_store_name' => 'Five Kicks',
    'status' => 'confirmed',
    'pickup_date' => '2026-10-18',
    'notes' => 'Note 3',
    'created_at' => '2026-10-03 12:00:00',
    'updated_at' => '2026-10-03 12:00:00',
    'deleted_at' => null,
    'permanently_deleted' => 0
];
`

  const res = runPhpOrderList({
    method: 'GET',
    session: { user_id: 5, user_role: 'seller' },
    pdoSetup
  })

  assert.equal(res.statusCode, 200)
  assert.equal(res.json.success, true)
  assert.ok(Array.isArray(res.json.orders), 'orders must be an array')
  assert.equal(res.json.orders.length, 2, 'Seller 5 must receive exactly their 2 orders')

  const orderIds = res.json.orders.map(o => o.id)
  assert.ok(orderIds.includes('KCO-2026-0001'))
  assert.ok(orderIds.includes('KCO-2026-0003'))
  assert.ok(!orderIds.includes('KCO-2026-0002'), 'Must not include other seller order')
})

test('Order list endpoint excludes soft-deleted and permanently deleted orders for sellers', () => {
  const pdoSetup = `
$pdo->users[] = [
    'id' => 5,
    'name' => 'Seller Five',
    'email' => 'seller5@example.com',
    'role' => 'seller',
    'deleted_at' => null,
    'permanently_deleted' => 0
];
$pdo->sellerProfiles[] = [
    'user_id' => 5,
    'store_name' => 'Five Kicks',
    'status' => 'approved',
    'deleted_at' => null,
    'permanently_deleted' => 0
];

$pdo->orders[] = [
    'id' => 'KCO-ACTIVE',
    'seller_id' => 5,
    'product_id' => 'KCP-2026-0001',
    'buyer_name' => 'Active Buyer',
    'buyer_email' => 'active@example.com',
    'custom_colors' => json_encode([]),
    'custom_charm' => 'none',
    'unit_price' => 3000.00,
    'total_price' => 3000.00,
    'product_name' => 'Active Shoe',
    'product_thumbnail' => '/images/active.png',
    'seller_store_name' => 'Five Kicks',
    'status' => 'pending',
    'pickup_date' => '2026-10-20',
    'notes' => null,
    'created_at' => '2026-10-03 10:00:00',
    'updated_at' => '2026-10-03 10:00:00',
    'deleted_at' => null,
    'permanently_deleted' => 0
];

$pdo->orders[] = [
    'id' => 'KCO-SOFT-DEL',
    'seller_id' => 5,
    'product_id' => 'KCP-2026-0001',
    'buyer_name' => 'Soft Del Buyer',
    'buyer_email' => 'soft@example.com',
    'custom_colors' => json_encode([]),
    'custom_charm' => 'none',
    'unit_price' => 3000.00,
    'total_price' => 3000.00,
    'product_name' => 'Deleted Shoe',
    'product_thumbnail' => '/images/del.png',
    'seller_store_name' => 'Five Kicks',
    'status' => 'cancelled',
    'pickup_date' => '2026-10-20',
    'notes' => null,
    'created_at' => '2026-10-01 10:00:00',
    'updated_at' => '2026-10-02 10:00:00',
    'deleted_at' => '2026-10-02 12:00:00',
    'permanently_deleted' => 0
];

$pdo->orders[] = [
    'id' => 'KCO-PERM-DEL',
    'seller_id' => 5,
    'product_id' => 'KCP-2026-0001',
    'buyer_name' => 'Perm Del Buyer',
    'buyer_email' => 'perm@example.com',
    'custom_colors' => json_encode([]),
    'custom_charm' => 'none',
    'unit_price' => 3000.00,
    'total_price' => 3000.00,
    'product_name' => 'Perm Deleted Shoe',
    'product_thumbnail' => '/images/perm.png',
    'seller_store_name' => 'Five Kicks',
    'status' => 'cancelled',
    'pickup_date' => '2026-10-20',
    'notes' => null,
    'created_at' => '2026-10-01 09:00:00',
    'updated_at' => '2026-10-02 09:00:00',
    'deleted_at' => null,
    'permanently_deleted' => 1
];
`

  const res = runPhpOrderList({
    method: 'GET',
    session: { user_id: 5, user_role: 'seller' },
    pdoSetup
  })

  assert.equal(res.statusCode, 200)
  assert.equal(res.json.orders.length, 1)
  assert.equal(res.json.orders[0].id, 'KCO-ACTIVE')
})

test('Order list endpoint returns seller orders sorted newest first (created_at DESC)', () => {
  const pdoSetup = `
$pdo->users[] = [
    'id' => 7,
    'name' => 'Seller Seven',
    'email' => 'seller7@example.com',
    'role' => 'seller',
    'deleted_at' => null,
    'permanently_deleted' => 0
];
$pdo->sellerProfiles[] = [
    'user_id' => 7,
    'store_name' => 'Seven Kicks',
    'status' => 'approved',
    'deleted_at' => null,
    'permanently_deleted' => 0
];

$pdo->orders[] = [
    'id' => 'KCO-OLDER',
    'seller_id' => 7,
    'product_id' => 'KCP-1',
    'buyer_name' => 'Old Buyer',
    'buyer_email' => 'old@example.com',
    'custom_colors' => json_encode([]),
    'custom_charm' => 'none',
    'unit_price' => 2000.00,
    'total_price' => 2000.00,
    'product_name' => 'Old Order Shoe',
    'product_thumbnail' => '',
    'seller_store_name' => 'Seven Kicks',
    'status' => 'completed',
    'pickup_date' => '2026-10-01',
    'notes' => null,
    'created_at' => '2026-10-01 10:00:00',
    'updated_at' => '2026-10-01 10:00:00',
    'deleted_at' => null,
    'permanently_deleted' => 0
];

$pdo->orders[] = [
    'id' => 'KCO-NEWEST',
    'seller_id' => 7,
    'product_id' => 'KCP-2',
    'buyer_name' => 'New Buyer',
    'buyer_email' => 'new@example.com',
    'custom_colors' => json_encode([]),
    'custom_charm' => 'star',
    'unit_price' => 3500.00,
    'total_price' => 3500.00,
    'product_name' => 'New Order Shoe',
    'product_thumbnail' => '',
    'seller_store_name' => 'Seven Kicks',
    'status' => 'pending',
    'pickup_date' => '2026-10-10',
    'notes' => null,
    'created_at' => '2026-10-03 15:00:00',
    'updated_at' => '2026-10-03 15:00:00',
    'deleted_at' => null,
    'permanently_deleted' => 0
];

$pdo->orders[] = [
    'id' => 'KCO-MIDDLE',
    'seller_id' => 7,
    'product_id' => 'KCP-3',
    'buyer_name' => 'Mid Buyer',
    'buyer_email' => 'mid@example.com',
    'custom_colors' => json_encode([]),
    'custom_charm' => 'none',
    'unit_price' => 2800.00,
    'total_price' => 2800.00,
    'product_name' => 'Middle Order Shoe',
    'product_thumbnail' => '',
    'seller_store_name' => 'Seven Kicks',
    'status' => 'confirmed',
    'pickup_date' => '2026-10-05',
    'notes' => null,
    'created_at' => '2026-10-02 12:00:00',
    'updated_at' => '2026-10-02 12:00:00',
    'deleted_at' => null,
    'permanently_deleted' => 0
];
`

  const res = runPhpOrderList({
    method: 'GET',
    session: { user_id: 7, user_role: 'seller' },
    pdoSetup
  })

  assert.equal(res.statusCode, 200)
  assert.equal(res.json.orders.length, 3)
  assert.equal(res.json.orders[0].id, 'KCO-NEWEST')
  assert.equal(res.json.orders[1].id, 'KCO-MIDDLE')
  assert.equal(res.json.orders[2].id, 'KCO-OLDER')
})

test('Order list endpoint allows owner/admin to view all orders across all sellers', () => {
  const pdoSetup = `
$pdo->users[] = [
    'id' => 1,
    'name' => 'Store Owner',
    'email' => 'admin@kickcraft.com',
    'role' => 'owner',
    'deleted_at' => null,
    'permanently_deleted' => 0
];

$pdo->orders[] = [
    'id' => 'KCO-SELLER-1',
    'seller_id' => 10,
    'product_id' => 'KCP-10',
    'buyer_name' => 'Buyer Ten',
    'buyer_email' => 'ten@example.com',
    'custom_colors' => json_encode([]),
    'custom_charm' => 'none',
    'unit_price' => 2000.00,
    'total_price' => 2000.00,
    'product_name' => 'Shoe 10',
    'product_thumbnail' => '',
    'seller_store_name' => 'Store Ten',
    'status' => 'pending',
    'pickup_date' => '2026-10-15',
    'notes' => null,
    'created_at' => '2026-10-03 10:00:00',
    'updated_at' => '2026-10-03 10:00:00',
    'deleted_at' => null,
    'permanently_deleted' => 0
];

$pdo->orders[] = [
    'id' => 'KCO-SELLER-2',
    'seller_id' => 20,
    'product_id' => 'KCP-20',
    'buyer_name' => 'Buyer Twenty',
    'buyer_email' => 'twenty@example.com',
    'custom_colors' => json_encode([]),
    'custom_charm' => 'star',
    'unit_price' => 4000.00,
    'total_price' => 4000.00,
    'product_name' => 'Shoe 20',
    'product_thumbnail' => '',
    'seller_store_name' => 'Store Twenty',
    'status' => 'ready',
    'pickup_date' => '2026-10-16',
    'notes' => null,
    'created_at' => '2026-10-03 11:00:00',
    'updated_at' => '2026-10-03 11:00:00',
    'deleted_at' => null,
    'permanently_deleted' => 0
];
`

  const res = runPhpOrderList({
    method: 'GET',
    session: { user_id: 1, user_role: 'owner' },
    pdoSetup
  })

  assert.equal(res.statusCode, 200)
  assert.equal(res.json.orders.length, 2)
  const ids = res.json.orders.map(o => o.id)
  assert.ok(ids.includes('KCO-SELLER-1'))
  assert.ok(ids.includes('KCO-SELLER-2'))
})

test('Order list endpoint excludes soft-deleted and permanently deleted orders for owner/admin', () => {
  const pdoSetup = `
$pdo->users[] = [
    'id' => 1,
    'name' => 'Store Owner',
    'email' => 'admin@kickcraft.com',
    'role' => 'owner',
    'deleted_at' => null,
    'permanently_deleted' => 0
];

$pdo->orders[] = [
    'id' => 'KCO-VALID-ADMIN',
    'seller_id' => 10,
    'product_id' => 'KCP-10',
    'buyer_name' => 'Buyer Active',
    'buyer_email' => 'active@example.com',
    'custom_colors' => json_encode([]),
    'custom_charm' => 'none',
    'unit_price' => 2000.00,
    'total_price' => 2000.00,
    'product_name' => 'Shoe 10',
    'product_thumbnail' => '',
    'seller_store_name' => 'Store Ten',
    'status' => 'pending',
    'pickup_date' => '2026-10-15',
    'notes' => null,
    'created_at' => '2026-10-03 10:00:00',
    'updated_at' => '2026-10-03 10:00:00',
    'deleted_at' => null,
    'permanently_deleted' => 0
];

$pdo->orders[] = [
    'id' => 'KCO-DELETED-ADMIN',
    'seller_id' => 20,
    'product_id' => 'KCP-20',
    'buyer_name' => 'Buyer Deleted',
    'buyer_email' => 'del@example.com',
    'custom_colors' => json_encode([]),
    'custom_charm' => 'none',
    'unit_price' => 3000.00,
    'total_price' => 3000.00,
    'product_name' => 'Shoe 20',
    'product_thumbnail' => '',
    'seller_store_name' => 'Store Twenty',
    'status' => 'cancelled',
    'pickup_date' => '2026-10-16',
    'notes' => null,
    'created_at' => '2026-10-02 10:00:00',
    'updated_at' => '2026-10-02 10:00:00',
    'deleted_at' => '2026-10-03 08:00:00',
    'permanently_deleted' => 0
];
`

  const res = runPhpOrderList({
    method: 'GET',
    session: { user_id: 1, user_role: 'owner' },
    pdoSetup
  })

  assert.equal(res.statusCode, 200)
  assert.equal(res.json.orders.length, 1)
  assert.equal(res.json.orders[0].id, 'KCO-VALID-ADMIN')
})

test('Order list endpoint filters orders by status', () => {
  const pdoSetup = `
$pdo->users[] = [
    'id' => 5,
    'name' => 'Seller Five',
    'email' => 'seller5@example.com',
    'role' => 'seller',
    'deleted_at' => null,
    'permanently_deleted' => 0
];
$pdo->sellerProfiles[] = [
    'user_id' => 5,
    'store_name' => 'Five Kicks',
    'status' => 'approved',
    'deleted_at' => null,
    'permanently_deleted' => 0
];

$pdo->orders[] = [
    'id' => 'KCO-P1',
    'seller_id' => 5,
    'product_id' => 'KCP-1',
    'buyer_name' => 'Buyer P1',
    'buyer_email' => 'p1@example.com',
    'custom_colors' => json_encode([]),
    'custom_charm' => 'none',
    'unit_price' => 1000.00,
    'total_price' => 1000.00,
    'product_name' => 'Shoe P1',
    'product_thumbnail' => '',
    'seller_store_name' => 'Five Kicks',
    'status' => 'pending',
    'pickup_date' => '2026-10-15',
    'notes' => null,
    'created_at' => '2026-10-03 10:00:00',
    'updated_at' => '2026-10-03 10:00:00',
    'deleted_at' => null,
    'permanently_deleted' => 0
];

$pdo->orders[] = [
    'id' => 'KCO-C1',
    'seller_id' => 5,
    'product_id' => 'KCP-2',
    'buyer_name' => 'Buyer C1',
    'buyer_email' => 'c1@example.com',
    'custom_colors' => json_encode([]),
    'custom_charm' => 'none',
    'unit_price' => 2000.00,
    'total_price' => 2000.00,
    'product_name' => 'Shoe C1',
    'product_thumbnail' => '',
    'seller_store_name' => 'Five Kicks',
    'status' => 'confirmed',
    'pickup_date' => '2026-10-16',
    'notes' => null,
    'created_at' => '2026-10-03 11:00:00',
    'updated_at' => '2026-10-03 11:00:00',
    'deleted_at' => null,
    'permanently_deleted' => 0
];

$pdo->orders[] = [
    'id' => 'KCO-R1',
    'seller_id' => 5,
    'product_id' => 'KCP-3',
    'buyer_name' => 'Buyer R1',
    'buyer_email' => 'r1@example.com',
    'custom_colors' => json_encode([]),
    'custom_charm' => 'none',
    'unit_price' => 3000.00,
    'total_price' => 3000.00,
    'product_name' => 'Shoe R1',
    'product_thumbnail' => '',
    'seller_store_name' => 'Five Kicks',
    'status' => 'ready',
    'pickup_date' => '2026-10-17',
    'notes' => null,
    'created_at' => '2026-10-03 12:00:00',
    'updated_at' => '2026-10-03 12:00:00',
    'deleted_at' => null,
    'permanently_deleted' => 0
];
`

  // Test status=pending
  const resPending = runPhpOrderList({
    method: 'GET',
    getParams: { status: 'pending' },
    session: { user_id: 5, user_role: 'seller' },
    pdoSetup
  })
  assert.equal(resPending.statusCode, 200)
  assert.equal(resPending.json.orders.length, 1)
  assert.equal(resPending.json.orders[0].id, 'KCO-P1')

  // Test status=confirmed
  const resConfirmed = runPhpOrderList({
    method: 'GET',
    getParams: { status: 'confirmed' },
    session: { user_id: 5, user_role: 'seller' },
    pdoSetup
  })
  assert.equal(resConfirmed.statusCode, 200)
  assert.equal(resConfirmed.json.orders.length, 1)
  assert.equal(resConfirmed.json.orders[0].id, 'KCO-C1')

  // Test status=ready
  const resReady = runPhpOrderList({
    method: 'GET',
    getParams: { status: 'ready' },
    session: { user_id: 5, user_role: 'seller' },
    pdoSetup
  })
  assert.equal(resReady.statusCode, 200)
  assert.equal(resReady.json.orders.length, 1)
  assert.equal(resReady.json.orders[0].id, 'KCO-R1')

  // Test status=all returns all active
  const resAll = runPhpOrderList({
    method: 'GET',
    getParams: { status: 'all' },
    session: { user_id: 5, user_role: 'seller' },
    pdoSetup
  })
  assert.equal(resAll.statusCode, 200)
  assert.equal(resAll.json.orders.length, 3)
})

test('Order list endpoint returns full formatted order properties including parsed customColors', () => {
  const pdoSetup = `
$pdo->users[] = [
    'id' => 12,
    'name' => 'Custom Master',
    'email' => 'master@example.com',
    'role' => 'seller',
    'deleted_at' => null,
    'permanently_deleted' => 0
];
$pdo->sellerProfiles[] = [
    'user_id' => 12,
    'store_name' => 'Master Shoes',
    'status' => 'approved',
    'deleted_at' => null,
    'permanently_deleted' => 0
];

$pdo->orders[] = [
    'id' => 'KCO-FORMAT-TEST',
    'seller_id' => 12,
    'product_id' => 'KCP-99',
    'buyer_name' => 'Jordan Baker',
    'buyer_email' => 'jordan@example.com',
    'custom_colors' => json_encode(['Upper' => '#112233', 'Midsole' => '#FFFFFF']),
    'custom_charm' => 'lightning',
    'unit_price' => 4500.50,
    'total_price' => 4500.50,
    'product_name' => 'Lightning Retro',
    'product_thumbnail' => '/images/retro.png',
    'seller_store_name' => 'Master Shoes',
    'status' => 'pending',
    'pickup_date' => '2026-10-25',
    'notes' => 'Handle with care',
    'created_at' => '2026-10-03 14:00:00',
    'updated_at' => '2026-10-03 14:00:00',
    'deleted_at' => null,
    'permanently_deleted' => 0
];
`

  const res = runPhpOrderList({
    method: 'GET',
    session: { user_id: 12, user_role: 'seller' },
    pdoSetup
  })

  assert.equal(res.statusCode, 200)
  assert.equal(res.json.success, true)
  assert.equal(res.json.orders.length, 1)

  const order = res.json.orders[0]
  assert.equal(order.id, 'KCO-FORMAT-TEST')
  assert.equal(order.sellerId, 12)
  assert.equal(order.seller_id, 12)
  assert.equal(order.productId, 'KCP-99')
  assert.equal(order.product_id, 'KCP-99')
  assert.equal(order.buyerName, 'Jordan Baker')
  assert.equal(order.buyer_name, 'Jordan Baker')
  assert.equal(order.buyerEmail, 'jordan@example.com')
  assert.equal(order.buyer_email, 'jordan@example.com')
  assert.deepEqual(order.customColors, { Upper: '#112233', Midsole: '#FFFFFF' })
  assert.deepEqual(order.custom_colors, { Upper: '#112233', Midsole: '#FFFFFF' })
  assert.equal(order.customCharm, 'lightning')
  assert.equal(order.custom_charm, 'lightning')
  assert.equal(order.unitPrice, 4500.50)
  assert.equal(order.unit_price, 4500.50)
  assert.equal(order.formattedUnitPrice, '₱4,500.50')
  assert.equal(order.totalPrice, 4500.50)
  assert.equal(order.total_price, 4500.50)
  assert.equal(order.formattedTotalPrice, '₱4,500.50')
  assert.equal(order.productName, 'Lightning Retro')
  assert.equal(order.product_name, 'Lightning Retro')
  assert.equal(order.productThumbnail, '/images/retro.png')
  assert.equal(order.product_thumbnail, '/images/retro.png')
  assert.equal(order.sellerStoreName, 'Master Shoes')
  assert.equal(order.seller_store_name, 'Master Shoes')
  assert.equal(order.status, 'pending')
  assert.equal(order.pickupDate, '2026-10-25')
  assert.equal(order.pickup_date, '2026-10-25')
  assert.equal(order.notes, 'Handle with care')
  assert.equal(order.createdAt, '2026-10-03 14:00:00')
})

test('Order list endpoint returns empty orders array when seller has no matching orders', () => {
  const pdoSetup = `
$pdo->users[] = [
    'id' => 99,
    'name' => 'Empty Seller',
    'email' => 'empty@example.com',
    'role' => 'seller',
    'deleted_at' => null,
    'permanently_deleted' => 0
];
$pdo->sellerProfiles[] = [
    'user_id' => 99,
    'store_name' => 'Empty Store',
    'status' => 'approved',
    'deleted_at' => null,
    'permanently_deleted' => 0
];
`

  const res = runPhpOrderList({
    method: 'GET',
    session: { user_id: 99, user_role: 'seller' },
    pdoSetup
  })

  assert.equal(res.statusCode, 200)
  assert.equal(res.json.success, true)
  assert.deepEqual(res.json.orders, [])
})
