import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const ROOT_DIR = path.resolve(import.meta.dirname, '..', '..', '..')
const CREATE_ORDER_PATH = path.join(ROOT_DIR, 'api', 'orders', 'create.php')

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
    public array $products = [];
    public array $sellerProfiles = [];
    public array $orders = [];

    public function __construct() {}

    public function prepare(string $query, array $options = []): PDOStatement {
        return new MockPDOStatement(function($params) use ($query) {
            $this->queries[] = ['query' => $query, 'params' => $params];

            // 1. Order ID collision check: SELECT COUNT(*) FROM orders WHERE id = ?
            if (stripos($query, 'SELECT COUNT(*)') !== false && stripos($query, 'orders') !== false) {
                $id = $params[0] ?? '';
                return isset($this->orders[$id]) ? 1 : 0;
            }

            // 2. Product lookup with left join seller_profiles
            if (stripos($query, 'FROM products') !== false && stripos($query, 'seller_profiles') !== false) {
                $id = $params[0] ?? '';
                if (isset($this->products[$id])) {
                    $p = $this->products[$id];
                    if ($p['status'] === 'approved' && empty($p['deleted_at']) && empty($p['permanently_deleted'])) {
                        $storeName = 'KickCraft Studio';
                        foreach ($this->sellerProfiles as $sp) {
                            if ($sp['user_id'] == $p['seller_id']) {
                                $storeName = $sp['store_name'];
                                break;
                            }
                        }
                        $row = $p;
                        $row['store_name'] = $storeName;
                        return $row;
                    }
                }
                return false;
            }

            // 3. Atomic stock decrement: UPDATE products SET stock = stock - 1 WHERE id = ? AND stock > 0 ...
            if (stripos($query, 'UPDATE products') !== false && stripos($query, 'stock = stock - 1') !== false) {
                $id = $params[0] ?? '';
                if (isset($this->products[$id])) {
                    $p = &$this->products[$id];
                    if ($p['stock'] > 0 && empty($p['deleted_at']) && empty($p['permanently_deleted'])) {
                        $p['stock'] -= 1;
                        return 1;
                    }
                }
                return 0;
            }

            // 4. Order insertion: INSERT INTO orders ...
            if (stripos($query, 'INSERT INTO orders') !== false) {
                $id = $params[0] ?? '';
                $sellerId = (int)($params[1] ?? 0);
                $productId = $params[2] ?? '';
                $buyerName = $params[3] ?? '';
                $buyerEmail = $params[4] ?? '';
                $customColors = $params[5] ?? '[]';
                $customCharm = $params[6] ?? 'none';
                $unitPrice = (float)($params[7] ?? 0);
                $totalPrice = (float)($params[8] ?? 0);
                $productName = $params[9] ?? '';
                $productThumbnail = $params[10] ?? '';
                $sellerStoreName = $params[11] ?? '';
                $pickupDate = $params[12] ?? '';
                $notes = $params[13] ?? null;
                $now = date('Y-m-d H:i:s');

                $order = [
                    'id' => $id,
                    'seller_id' => $sellerId,
                    'product_id' => $productId,
                    'buyer_name' => $buyerName,
                    'buyer_email' => $buyerEmail,
                    'custom_colors' => $customColors,
                    'custom_charm' => $customCharm,
                    'unit_price' => $unitPrice,
                    'total_price' => $totalPrice,
                    'product_name' => $productName,
                    'product_thumbnail' => $productThumbnail,
                    'seller_store_name' => $sellerStoreName,
                    'status' => 'pending',
                    'pickup_date' => $pickupDate,
                    'notes' => $notes,
                    'created_at' => $now,
                    'updated_at' => $now,
                    'deleted_at' => null,
                    'permanently_deleted' => 0,
                ];
                $this->orders[$id] = $order;
                return 1;
            }

            // 5. Order lookup: SELECT * FROM orders WHERE id = ?
            if (stripos($query, 'FROM orders') !== false && stripos($query, 'WHERE id = ?') !== false) {
                $id = $params[0] ?? '';
                return $this->orders[$id] ?? false;
            }

            return false;
        });
    }
}
`

function runPhpOrderCreate({ method = 'POST', body = null, session = {}, pdoSetup = '' }) {
  const runner = path.join(ROOT_DIR, `test_run_order_create_${Date.now()}_${Math.random().toString(36).slice(2)}.php`)
  const statusFile = path.join(ROOT_DIR, `test_run_order_create_${Date.now()}_${Math.random().toString(36).slice(2)}_status.txt`)

  const code = `<?php
${PHP_MOCK_PDO_DEFINITION}

$_SERVER['REQUEST_METHOD'] = '${method}';
require_once '${path.join(ROOT_DIR, 'api', 'config.php').replace(/\\/g, '/')}';

$pdo = new MockPDO();
${pdoSetup}
$GLOBALS['__TEST_PDO__'] = $pdo;

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

require '${CREATE_ORDER_PATH.replace(/\\/g, '/')}';
`

  const dumpFile = path.join(ROOT_DIR, `test_run_order_create_dump_${Date.now()}_${Math.random().toString(36).slice(2)}.json`)
  const modifiedCode = code.replace(
    '$GLOBALS[\'__TEST_PDO__\'] = $pdo;',
    `$GLOBALS['__TEST_PDO__'] = $pdo;\n$GLOBALS['__DUMP_MOCK_PDO__'] = ${JSON.stringify(dumpFile)};`
  )

  fs.writeFileSync(runner, modifiedCode)

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
    let dbDump = null
    if (fs.existsSync(dumpFile)) {
      try {
        dbDump = JSON.parse(fs.readFileSync(dumpFile, 'utf8'))
      } catch {}
    }
    return { json, statusCode, dbDump, raw: output }
  } finally {
    if (fs.existsSync(runner)) fs.unlinkSync(runner)
    if (fs.existsSync(statusFile)) fs.unlinkSync(statusFile)
    if (fs.existsSync(dumpFile)) fs.unlinkSync(dumpFile)
  }
}

test('Order create endpoint file exists and passes syntax check', () => {
  assert.ok(fs.existsSync(CREATE_ORDER_PATH), 'api/orders/create.php must exist')
  const syntax = execSync(`php -l "${CREATE_ORDER_PATH}"`, { encoding: 'utf8' })
  assert.match(syntax, /No syntax errors detected/i)
})

test('Order create endpoint contains zero physical DELETE statements', () => {
  const code = fs.readFileSync(CREATE_ORDER_PATH, 'utf8')
  assert.doesNotMatch(
    code,
    /\bDELETE\s+FROM\b/i,
    'create.php must not contain physical DELETE statements'
  )
})

test('Order create endpoint enforces config, db, helpers, and prepared statements', () => {
  const code = fs.readFileSync(CREATE_ORDER_PATH, 'utf8')
  assert.match(code, /config\.php/i, 'create.php must require config.php')
  assert.match(code, /db\.php/i, 'create.php must require db.php')
  assert.match(code, /helpers\.php/i, 'create.php must require helpers.php')
  assert.match(code, /\$db->prepare\s*\(/i, 'create.php must use PDO prepared statements')
  assert.doesNotMatch(code, /\$db->query\s*\(/i, 'create.php must not use unparameterized $db->query')
})

test('Order create endpoint rejects non-POST HTTP methods with 405', () => {
  const res = runPhpOrderCreate({ method: 'GET' })
  assert.equal(res.statusCode, 405)
  assert.equal(res.json.error, 'Method not allowed')
})

test('Order create endpoint permits guest access without authentication session', () => {
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  const pdoSetup = `
$pdo->products['KCP-2026-0001'] = [
    'id' => 'KCP-2026-0001',
    'seller_id' => 10,
    'name' => 'Retro High-Top',
    'price' => 3500.00,
    'stock' => 5,
    'status' => 'approved',
    'glb_path' => '/models/seller-uploads/sample.glb',
    'thumbnail_path' => '/images/sample.png',
    'part_colors' => json_encode(['Upper' => '#FF0000']),
    'charm_id' => 'star',
    'deleted_at' => null,
    'permanently_deleted' => 0
];
$pdo->sellerProfiles = [
    ['user_id' => 10, 'store_name' => 'KickCraft Studio', 'status' => 'approved']
];
`
  const body = {
    productId: 'KCP-2026-0001',
    buyerName: 'Jane Guest',
    buyerEmail: 'jane@example.com',
    pickupDate: tomorrow,
    notes: 'Please double check laces.'
  }

  // Session is completely empty (guest access)
  const res = runPhpOrderCreate({ method: 'POST', body, session: {}, pdoSetup })
  assert.equal(res.statusCode, 201)
  assert.equal(res.json.success, true)
  assert.ok(res.json.orderId)
  assert.equal(res.json.order.buyerName, 'Jane Guest')
  assert.equal(res.json.order.buyerEmail, 'jane@example.com')
})

test('Order create endpoint validates required fields (productId, buyerName, buyerEmail, pickupDate)', () => {
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)

  // 1. Missing productId
  let res = runPhpOrderCreate({
    body: { buyerName: 'Jane Doe', buyerEmail: 'jane@example.com', pickupDate: tomorrow }
  })
  assert.equal(res.statusCode, 400)
  assert.match(res.json.error, /product id is required/i)

  // 2. Missing or short buyerName (< 2 chars)
  res = runPhpOrderCreate({
    body: { productId: 'KCP-2026-0001', buyerName: 'J', buyerEmail: 'jane@example.com', pickupDate: tomorrow }
  })
  assert.equal(res.statusCode, 400)
  assert.match(res.json.error, /buyer name must be at least 2 characters/i)

  // 3. Missing or invalid buyerEmail
  res = runPhpOrderCreate({
    body: { productId: 'KCP-2026-0001', buyerName: 'Jane Doe', buyerEmail: 'not-an-email', pickupDate: tomorrow }
  })
  assert.equal(res.statusCode, 400)
  assert.match(res.json.error, /valid email is required/i)

  // 4. Missing or invalid pickupDate format
  res = runPhpOrderCreate({
    body: { productId: 'KCP-2026-0001', buyerName: 'Jane Doe', buyerEmail: 'jane@example.com', pickupDate: 'bad-date' }
  })
  assert.equal(res.statusCode, 400)
  assert.match(res.json.error, /valid pickup date \(yyyy-mm-dd\) is required/i)

  // 5. Past pickupDate
  res = runPhpOrderCreate({
    body: { productId: 'KCP-2026-0001', buyerName: 'Jane Doe', buyerEmail: 'jane@example.com', pickupDate: '2020-01-01' }
  })
  assert.equal(res.statusCode, 400)
  assert.match(res.json.error, /pickup date cannot be in the past/i)
})

test('Order create endpoint rejects unknown or soft-deleted product with 404', () => {
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  const pdoSetup = `
$pdo->products['KCP-DELETED'] = [
    'id' => 'KCP-DELETED',
    'seller_id' => 10,
    'name' => 'Deleted Shoe',
    'price' => 2000.00,
    'stock' => 10,
    'status' => 'approved',
    'deleted_at' => '2026-01-01 00:00:00',
    'permanently_deleted' => 0
];
$pdo->products['KCP-PERM-DELETED'] = [
    'id' => 'KCP-PERM-DELETED',
    'seller_id' => 10,
    'name' => 'Perm Deleted Shoe',
    'price' => 2000.00,
    'stock' => 10,
    'status' => 'approved',
    'deleted_at' => null,
    'permanently_deleted' => 1
];
`

  // Non-existent product
  let res = runPhpOrderCreate({
    body: { productId: 'KCP-NONEXISTENT', buyerName: 'Jane Doe', buyerEmail: 'jane@example.com', pickupDate: tomorrow },
    pdoSetup
  })
  assert.equal(res.statusCode, 404)
  assert.match(res.json.error, /product not found or not available/i)

  // Soft-deleted product
  res = runPhpOrderCreate({
    body: { productId: 'KCP-DELETED', buyerName: 'Jane Doe', buyerEmail: 'jane@example.com', pickupDate: tomorrow },
    pdoSetup
  })
  assert.equal(res.statusCode, 404)
  assert.match(res.json.error, /product not found or not available/i)

  // Permanently deleted product
  res = runPhpOrderCreate({
    body: { productId: 'KCP-PERM-DELETED', buyerName: 'Jane Doe', buyerEmail: 'jane@example.com', pickupDate: tomorrow },
    pdoSetup
  })
  assert.equal(res.statusCode, 404)
  assert.match(res.json.error, /product not found or not available/i)
})

test('Order create endpoint rejects unapproved products (draft, pending, rejected, suspended) with 404', () => {
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  const statuses = ['draft', 'pending', 'rejected', 'suspended']

  for (const status of statuses) {
    const prodId = `KCP-${status.toUpperCase()}`
    const pdoSetup = `
$pdo->products['${prodId}'] = [
    'id' => '${prodId}',
    'seller_id' => 10,
    'name' => '${status} Shoe',
    'price' => 2500.00,
    'stock' => 5,
    'status' => '${status}',
    'deleted_at' => null,
    'permanently_deleted' => 0
];
`
    const res = runPhpOrderCreate({
      body: { productId: prodId, buyerName: 'Jane Doe', buyerEmail: 'jane@example.com', pickupDate: tomorrow },
      pdoSetup
    })
    assert.equal(res.statusCode, 404, `Product status ${status} must be rejected with 404`)
    assert.match(res.json.error, /product not found or not available/i)
  }
})

test('Order create endpoint rejects out of stock products (stock <= 0) with 400', () => {
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  const pdoSetup = `
$pdo->products['KCP-OUTOFSTOCK'] = [
    'id' => 'KCP-OUTOFSTOCK',
    'seller_id' => 10,
    'name' => 'Zero Stock Sneaker',
    'price' => 4200.00,
    'stock' => 0,
    'status' => 'approved',
    'deleted_at' => null,
    'permanently_deleted' => 0
];
`
  const res = runPhpOrderCreate({
    body: { productId: 'KCP-OUTOFSTOCK', buyerName: 'Jane Doe', buyerEmail: 'jane@example.com', pickupDate: tomorrow },
    pdoSetup
  })
  assert.equal(res.statusCode, 400)
  assert.match(res.json.error, /out of stock/i)
})

test('Order create endpoint performs atomic stock decrement by 1 and rejects once depleted', () => {
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  const pdoSetup = `
$pdo->products['KCP-LIMITED'] = [
    'id' => 'KCP-LIMITED',
    'seller_id' => 10,
    'name' => 'Limited Drop',
    'price' => 5500.00,
    'stock' => 1,
    'status' => 'approved',
    'glb_path' => '/models/seller-uploads/limited.glb',
    'thumbnail_path' => '/images/limited.png',
    'part_colors' => json_encode(['Upper' => '#000000']),
    'charm_id' => 'none',
    'deleted_at' => null,
    'permanently_deleted' => 0
];
$pdo->sellerProfiles = [
    ['user_id' => 10, 'store_name' => 'Hype Kicks', 'status' => 'approved']
];
`
  // First order should succeed and decrement stock from 1 to 0
  const res1 = runPhpOrderCreate({
    body: { productId: 'KCP-LIMITED', buyerName: 'Buyer One', buyerEmail: 'b1@example.com', pickupDate: tomorrow },
    pdoSetup
  })
  assert.equal(res1.statusCode, 201)
  assert.equal(res1.json.success, true)
  assert.equal(res1.dbDump.products['KCP-LIMITED'].stock, 0, 'Product stock must decrement to 0')

  // Second order on now-depleted stock should fail
  const pdoSetupDepleted = `
$pdo->products['KCP-LIMITED'] = [
    'id' => 'KCP-LIMITED',
    'seller_id' => 10,
    'name' => 'Limited Drop',
    'price' => 5500.00,
    'stock' => 0,
    'status' => 'approved',
    'glb_path' => '/models/seller-uploads/limited.glb',
    'thumbnail_path' => '/images/limited.png',
    'part_colors' => json_encode(['Upper' => '#000000']),
    'charm_id' => 'none',
    'deleted_at' => null,
    'permanently_deleted' => 0
];
$pdo->sellerProfiles = [
    ['user_id' => 10, 'store_name' => 'Hype Kicks', 'status' => 'approved']
];
`
  const res2 = runPhpOrderCreate({
    body: { productId: 'KCP-LIMITED', buyerName: 'Buyer Two', buyerEmail: 'b2@example.com', pickupDate: tomorrow },
    pdoSetup: pdoSetupDepleted
  })
  assert.equal(res2.statusCode, 400)
  assert.match(res2.json.error, /out of stock/i)
})

test('Order create endpoint generates KCO-YYYY-XXXX ID, captures snapshots, and returns pending order', () => {
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  const pdoSetup = `
$pdo->products['KCP-SNAPSHOT-1'] = [
    'id' => 'KCP-SNAPSHOT-1',
    'seller_id' => 42,
    'name' => 'Cyber High Top',
    'price' => 4899.50,
    'stock' => 8,
    'status' => 'approved',
    'glb_path' => '/models/seller-uploads/cyber.glb',
    'thumbnail_path' => '/images/cyber.png',
    'part_colors' => json_encode(['Upper' => '#112233', 'Sole' => '#FFFFFF']),
    'charm_id' => 'lightning',
    'deleted_at' => null,
    'permanently_deleted' => 0
];
$pdo->sellerProfiles = [
    ['user_id' => 42, 'store_name' => 'Apex Footwear', 'status' => 'approved']
];
`
  const body = {
    productId: 'KCP-SNAPSHOT-1',
    buyerName: 'Marcus Wright',
    buyerEmail: 'marcus@example.com',
    pickupDate: tomorrow,
    customColors: { Upper: '#FF5500', Sole: '#000000', Laces: '#FFFFFF' },
    customCharm: 'lightning',
    notes: 'Size 10.5 preference noted.'
  }

  const res = runPhpOrderCreate({ body, pdoSetup })
  assert.equal(res.statusCode, 201)
  assert.equal(res.json.success, true)
  assert.ok(res.json.orderId)
  assert.match(res.json.orderId, /^KCO-\d{4}-\d{4}$/, 'Order ID must match KCO-YYYY-XXXX format')

  const order = res.json.order
  assert.equal(order.id, res.json.orderId)
  assert.equal(order.sellerId, 42)
  assert.equal(order.seller_id, 42)
  assert.equal(order.productId, 'KCP-SNAPSHOT-1')
  assert.equal(order.product_id, 'KCP-SNAPSHOT-1')
  assert.equal(order.buyerName, 'Marcus Wright')
  assert.equal(order.buyer_name, 'Marcus Wright')
  assert.equal(order.buyerEmail, 'marcus@example.com')
  assert.equal(order.buyer_email, 'marcus@example.com')
  assert.equal(order.unitPrice, 4899.5)
  assert.equal(order.unit_price, 4899.5)
  assert.equal(order.totalPrice, 4899.5)
  assert.equal(order.total_price, 4899.5)
  assert.equal(order.productName, 'Cyber High Top')
  assert.equal(order.product_name, 'Cyber High Top')
  assert.equal(order.productThumbnail, '/images/cyber.png')
  assert.equal(order.product_thumbnail, '/images/cyber.png')
  assert.equal(order.sellerStoreName, 'Apex Footwear')
  assert.equal(order.seller_store_name, 'Apex Footwear')
  assert.equal(order.status, 'pending')
  assert.equal(order.pickupDate, tomorrow)
  assert.equal(order.pickup_date, tomorrow)
  assert.equal(order.notes, 'Size 10.5 preference noted.')

  // Check decoded customColors
  assert.deepEqual(order.customColors, { Upper: '#FF5500', Sole: '#000000', Laces: '#FFFFFF' })
  assert.deepEqual(order.custom_colors, { Upper: '#FF5500', Sole: '#000000', Laces: '#FFFFFF' })
  assert.equal(order.customCharm, 'lightning')
  assert.equal(order.custom_charm, 'lightning')

  // Check DB insertion record
  const savedOrder = res.dbDump.orders[res.json.orderId]
  assert.ok(savedOrder, 'Order must be saved in database')
  assert.equal(savedOrder.status, 'pending')
  assert.equal(savedOrder.unit_price, 4899.5)
  assert.equal(savedOrder.seller_store_name, 'Apex Footwear')
})
