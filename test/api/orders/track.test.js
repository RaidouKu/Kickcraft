import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const ROOT_DIR = path.resolve(import.meta.dirname, '..', '..', '..')
const TRACK_ORDER_PATH = path.join(ROOT_DIR, 'api', 'orders', 'track.php')

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
    public array $orders = [];

    public function __construct() {}

    public function prepare(string $query, array $options = []): PDOStatement {
        return new MockPDOStatement(function($params) use ($query) {
            $this->queries[] = ['query' => $query, 'params' => $params];

            // Order lookup by ID and buyer_email:
            // SELECT * FROM orders WHERE id = ? AND LOWER(TRIM(buyer_email)) = ... AND deleted_at IS NULL AND permanently_deleted = 0
            if (stripos($query, 'FROM orders') !== false && stripos($query, 'buyer_email') !== false) {
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

            return false;
        });
    }
}
`

function runPhpOrderTrack({ method = 'GET', getParams = {}, session = {}, pdoSetup = '' }) {
  const runner = path.join(ROOT_DIR, `test_run_order_track_${Date.now()}_${Math.random().toString(36).slice(2)}.php`)
  const statusFile = path.join(ROOT_DIR, `test_run_order_track_${Date.now()}_${Math.random().toString(36).slice(2)}_status.txt`)

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

require '${TRACK_ORDER_PATH.replace(/\\/g, '/')}';
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

test('Order track endpoint file exists and passes syntax check', () => {
  assert.ok(fs.existsSync(TRACK_ORDER_PATH), 'api/orders/track.php must exist')
  const syntax = execSync(`php -l "${TRACK_ORDER_PATH}"`, { encoding: 'utf8' })
  assert.match(syntax, /No syntax errors detected/i)
})

test('Order track endpoint contains zero physical DELETE statements', () => {
  const code = fs.readFileSync(TRACK_ORDER_PATH, 'utf8')
  assert.doesNotMatch(
    code,
    /\bDELETE\s+FROM\b/i,
    'track.php must not contain physical DELETE statements'
  )
})

test('Order track endpoint enforces config, db, helpers, and prepared statements', () => {
  const code = fs.readFileSync(TRACK_ORDER_PATH, 'utf8')
  assert.match(code, /config\.php/i, 'track.php must require config.php')
  assert.match(code, /db\.php/i, 'track.php must require db.php')
  assert.match(code, /helpers\.php/i, 'track.php must require helpers.php')
  assert.match(code, /\$db->prepare\s*\(/i, 'track.php must use PDO prepared statements')
  assert.doesNotMatch(code, /\$db->query\s*\(/i, 'track.php must not use unparameterized $db->query')
})

test('Order track endpoint rejects non-GET HTTP methods with 405', () => {
  const methods = ['POST', 'PUT', 'DELETE', 'PATCH']
  for (const method of methods) {
    const res = runPhpOrderTrack({ method, getParams: { orderId: 'KCO-2026-1001', email: 'test@example.com' } })
    assert.equal(res.statusCode, 405, `Method ${method} should be rejected with 405`)
    assert.equal(res.json.error, 'Method not allowed')
  }
})

test('Order track endpoint permits guest access without authentication session', () => {
  const pdoSetup = `
$pdo->orders['KCO-2026-1001'] = [
    'id' => 'KCO-2026-1001',
    'seller_id' => 5,
    'product_id' => 'KCP-2026-0001',
    'buyer_name' => 'Guest Buyer',
    'buyer_email' => 'guest@example.com',
    'custom_colors' => json_encode(['Upper' => '#FF0000']),
    'custom_charm' => 'star',
    'unit_price' => 3200.00,
    'total_price' => 3200.00,
    'product_name' => 'Retro High-Top',
    'product_thumbnail' => '/images/sample.png',
    'seller_store_name' => 'Retro Kicks',
    'status' => 'pending',
    'pickup_date' => '2026-10-15',
    'notes' => 'Please box nicely.',
    'created_at' => '2026-10-03 10:00:00',
    'updated_at' => '2026-10-03 10:00:00',
    'deleted_at' => null,
    'permanently_deleted' => 0
];
`
  // Empty session
  const res = runPhpOrderTrack({
    method: 'GET',
    getParams: { orderId: 'KCO-2026-1001', email: 'guest@example.com' },
    session: {},
    pdoSetup
  })
  assert.equal(res.statusCode, 200)
  assert.equal(res.json.success, true)
  assert.equal(res.json.order.id, 'KCO-2026-1001')
  assert.equal(res.json.order.buyerName, 'Guest Buyer')
})

test('Order track endpoint validates required parameters (orderId, email)', () => {
  // Missing orderId
  let res = runPhpOrderTrack({
    getParams: { email: 'guest@example.com' }
  })
  assert.equal(res.statusCode, 400)
  assert.match(res.json.error, /order id is required/i)

  // Empty orderId
  res = runPhpOrderTrack({
    getParams: { orderId: '   ', email: 'guest@example.com' }
  })
  assert.equal(res.statusCode, 400)
  assert.match(res.json.error, /order id is required/i)

  // Missing email
  res = runPhpOrderTrack({
    getParams: { orderId: 'KCO-2026-1001' }
  })
  assert.equal(res.statusCode, 400)
  assert.match(res.json.error, /valid email is required/i)

  // Invalid email
  res = runPhpOrderTrack({
    getParams: { orderId: 'KCO-2026-1001', email: 'not-an-email' }
  })
  assert.equal(res.statusCode, 400)
  assert.match(res.json.error, /valid email is required/i)
})

test('Order track endpoint returns 404 for unknown orderId or email mismatch', () => {
  const pdoSetup = `
$pdo->orders['KCO-2026-1001'] = [
    'id' => 'KCO-2026-1001',
    'seller_id' => 5,
    'product_id' => 'KCP-2026-0001',
    'buyer_name' => 'Alice Buyer',
    'buyer_email' => 'alice@example.com',
    'custom_colors' => json_encode(['Upper' => '#00FF00']),
    'custom_charm' => 'none',
    'unit_price' => 2800.00,
    'total_price' => 2800.00,
    'product_name' => 'Speed Runner',
    'product_thumbnail' => '/images/runner.png',
    'seller_store_name' => 'Fast Footwear',
    'status' => 'confirmed',
    'pickup_date' => '2026-10-18',
    'notes' => null,
    'created_at' => '2026-10-03 11:00:00',
    'updated_at' => '2026-10-03 11:00:00',
    'deleted_at' => null,
    'permanently_deleted' => 0
];
`
  // Non-existent order ID
  let res = runPhpOrderTrack({
    getParams: { orderId: 'KCO-2026-9999', email: 'alice@example.com' },
    pdoSetup
  })
  assert.equal(res.statusCode, 404)
  assert.match(res.json.error, /order not found or details do not match/i)

  // Mismatched email for existing order ID
  res = runPhpOrderTrack({
    getParams: { orderId: 'KCO-2026-1001', email: 'bob@example.com' },
    pdoSetup
  })
  assert.equal(res.statusCode, 404)
  assert.match(res.json.error, /order not found or details do not match/i)
})

test('Order track endpoint returns 404 for soft-deleted or permanently deleted orders', () => {
  const pdoSetup = `
$pdo->orders['KCO-2026-DEL1'] = [
    'id' => 'KCO-2026-DEL1',
    'seller_id' => 5,
    'product_id' => 'KCP-2026-0001',
    'buyer_name' => 'Charlie Buyer',
    'buyer_email' => 'charlie@example.com',
    'custom_colors' => json_encode([]),
    'custom_charm' => 'star',
    'unit_price' => 3000.00,
    'total_price' => 3000.00,
    'product_name' => 'Sample Shoe',
    'product_thumbnail' => '/images/sample.png',
    'seller_store_name' => 'Sample Store',
    'status' => 'cancelled',
    'pickup_date' => '2026-10-20',
    'notes' => null,
    'created_at' => '2026-10-01 10:00:00',
    'updated_at' => '2026-10-02 10:00:00',
    'deleted_at' => '2026-10-02 12:00:00',
    'permanently_deleted' => 0
];
$pdo->orders['KCO-2026-DEL2'] = [
    'id' => 'KCO-2026-DEL2',
    'seller_id' => 5,
    'product_id' => 'KCP-2026-0001',
    'buyer_name' => 'Dave Buyer',
    'buyer_email' => 'dave@example.com',
    'custom_colors' => json_encode([]),
    'custom_charm' => 'none',
    'unit_price' => 3000.00,
    'total_price' => 3000.00,
    'product_name' => 'Sample Shoe',
    'product_thumbnail' => '/images/sample.png',
    'seller_store_name' => 'Sample Store',
    'status' => 'cancelled',
    'pickup_date' => '2026-10-20',
    'notes' => null,
    'created_at' => '2026-10-01 10:00:00',
    'updated_at' => '2026-10-02 10:00:00',
    'deleted_at' => null,
    'permanently_deleted' => 1
];
`
  // Soft-deleted order
  let res = runPhpOrderTrack({
    getParams: { orderId: 'KCO-2026-DEL1', email: 'charlie@example.com' },
    pdoSetup
  })
  assert.equal(res.statusCode, 404)
  assert.match(res.json.error, /order not found or details do not match/i)

  // Permanently deleted order
  res = runPhpOrderTrack({
    getParams: { orderId: 'KCO-2026-DEL2', email: 'dave@example.com' },
    pdoSetup
  })
  assert.equal(res.statusCode, 404)
  assert.match(res.json.error, /order not found or details do not match/i)
})

test('Order track endpoint successfully returns formatted order with exact or case-insensitive email', () => {
  const pdoSetup = `
$pdo->orders['KCO-2026-5555'] = [
    'id' => 'KCO-2026-5555',
    'seller_id' => 12,
    'product_id' => 'KCP-2026-0099',
    'buyer_name' => 'Elena Rostova',
    'buyer_email' => 'elena.rostova@example.com',
    'custom_colors' => json_encode(['Upper' => '#FF5500', 'Midsole' => '#000000']),
    'custom_charm' => 'lightning',
    'unit_price' => 4500.50,
    'total_price' => 4500.50,
    'product_name' => 'Cyber High-Top',
    'product_thumbnail' => '/images/cyber.png',
    'seller_store_name' => 'Future Kicks',
    'status' => 'ready',
    'pickup_date' => '2026-10-25',
    'notes' => 'Hold at counter until 5pm.',
    'created_at' => '2026-10-03 14:00:00',
    'updated_at' => '2026-10-03 14:30:00',
    'deleted_at' => null,
    'permanently_deleted' => 0
];
`
  // Case-insensitive email with leading/trailing spaces
  const res = runPhpOrderTrack({
    getParams: { orderId: 'KCO-2026-5555', email: '  ELENA.ROSTOVA@EXAMPLE.COM  ' },
    pdoSetup
  })
  assert.equal(res.statusCode, 200)
  assert.equal(res.json.success, true)

  const order = res.json.order
  assert.ok(order, 'Response must include order object')
  assert.equal(order.id, 'KCO-2026-5555')
  assert.equal(order.sellerId, 12)
  assert.equal(order.seller_id, 12)
  assert.equal(order.productId, 'KCP-2026-0099')
  assert.equal(order.product_id, 'KCP-2026-0099')
  assert.equal(order.buyerName, 'Elena Rostova')
  assert.equal(order.buyer_name, 'Elena Rostova')
  assert.equal(order.buyerEmail, 'elena.rostova@example.com')
  assert.equal(order.buyer_email, 'elena.rostova@example.com')
  assert.equal(order.unitPrice, 4500.50)
  assert.equal(order.unit_price, 4500.50)
  assert.equal(order.formattedUnitPrice, '₱4,500.50')
  assert.equal(order.totalPrice, 4500.50)
  assert.equal(order.total_price, 4500.50)
  assert.equal(order.formattedTotalPrice, '₱4,500.50')
  assert.equal(order.productName, 'Cyber High-Top')
  assert.equal(order.product_name, 'Cyber High-Top')
  assert.equal(order.productThumbnail, '/images/cyber.png')
  assert.equal(order.product_thumbnail, '/images/cyber.png')
  assert.equal(order.sellerStoreName, 'Future Kicks')
  assert.equal(order.seller_store_name, 'Future Kicks')
  assert.equal(order.status, 'ready')
  assert.equal(order.pickupDate, '2026-10-25')
  assert.equal(order.pickup_date, '2026-10-25')
  assert.equal(order.notes, 'Hold at counter until 5pm.')
  assert.deepEqual(order.customColors, { Upper: '#FF5500', Midsole: '#000000' })
  assert.deepEqual(order.custom_colors, { Upper: '#FF5500', Midsole: '#000000' })
  assert.equal(order.customCharm, 'lightning')
  assert.equal(order.custom_charm, 'lightning')
  assert.equal(order.createdAt, '2026-10-03 14:00:00')
})

test('Order track endpoint supports "id" fallback parameter in addition to "orderId"', () => {
  const pdoSetup = `
$pdo->orders['KCO-2026-7777'] = [
    'id' => 'KCO-2026-7777',
    'seller_id' => 8,
    'product_id' => 'KCP-2026-0008',
    'buyer_name' => 'Fallback Tester',
    'buyer_email' => 'fallback@example.com',
    'custom_colors' => json_encode([]),
    'custom_charm' => 'none',
    'unit_price' => 1999.00,
    'total_price' => 1999.00,
    'product_name' => 'Budget Sneaker',
    'product_thumbnail' => '/images/budget.png',
    'seller_store_name' => 'Budget Kicks',
    'status' => 'completed',
    'pickup_date' => '2026-10-10',
    'notes' => null,
    'created_at' => '2026-10-01 10:00:00',
    'updated_at' => '2026-10-01 10:00:00',
    'deleted_at' => null,
    'permanently_deleted' => 0
];
`
  // Using id instead of orderId
  const res = runPhpOrderTrack({
    getParams: { id: 'KCO-2026-7777', email: 'fallback@example.com' },
    pdoSetup
  })
  assert.equal(res.statusCode, 200)
  assert.equal(res.json.success, true)
  assert.equal(res.json.order.id, 'KCO-2026-7777')
  assert.equal(res.json.order.status, 'completed')
})
