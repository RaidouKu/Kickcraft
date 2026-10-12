import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const ROOT_DIR = path.resolve(import.meta.dirname, '..')
const UPDATE_PATH = path.join(ROOT_DIR, 'api', 'products', 'update.php')
const DETAIL_PATH = path.join(ROOT_DIR, 'api', 'products', 'detail.php')
const LIST_PATH = path.join(ROOT_DIR, 'api', 'products', 'list.php')

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

            // 1. User lookup
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

            // 2. Profile lookup
            if (stripos($query, 'SELECT status FROM seller_profiles') !== false) {
                $userId = (int)($params[0] ?? 0);
                foreach ($this->sellerProfiles as $sp) {
                    if ((int)$sp['user_id'] === $userId && empty($sp['deleted_at']) && empty($sp['permanently_deleted'])) {
                        return ['status' => $sp['status']];
                    }
                }
                return false;
            }

            // 3. Select product by id and seller_id
            if (stripos($query, 'SELECT * FROM products WHERE id = ? AND seller_id = ?') !== false) {
                $id = $params[0] ?? '';
                $sellerId = (int)($params[1] ?? 0);
                foreach ($this->products as $p) {
                    if ($p['id'] === $id && (int)$p['seller_id'] === $sellerId && empty($p['deleted_at']) && empty($p['permanently_deleted'])) {
                        return $p;
                    }
                }
                return false;
            }

            // 4. Select single product by id
            if (stripos($query, 'SELECT * FROM products WHERE id = ?') !== false) {
                $id = $params[0] ?? '';
                foreach ($this->products as $p) {
                    if ($p['id'] === $id && empty($p['deleted_at']) && empty($p['permanently_deleted'])) {
                        return $p;
                    }
                }
                return false;
            }

            // 5. UPDATE query
            if (stripos($query, 'UPDATE products SET') !== false) {
                $id = $params[count($params) - 2] ?? '';
                $sellerId = (int)($params[count($params) - 1] ?? 0);
                foreach ($this->products as &$p) {
                    if ($p['id'] === $id && (int)$p['seller_id'] === $sellerId) {
                        $p['name'] = $params[0];
                        $p['description'] = $params[1];
                        $p['price'] = $params[2];
                        $p['stock'] = $params[3];
                        $p['glb_path'] = $params[4];
                        $p['thumbnail_path'] = $params[5];
                        $p['base_shoe_id'] = $params[6];
                        $p['charm_id'] = $params[7];
                        $p['mesh_map'] = $params[8];
                        $p['part_colors'] = $params[9];
                        $p['sizes_available'] = $params[10];
                        $p['status'] = 'pending';
                        $p['approved_at'] = null;
                        return 1;
                    }
                }
                return 0;
            }

            // Helper to get store name for a seller_id
            $getStoreName = function($sellerId) {
                foreach ($this->sellerProfiles as $sp) {
                    if ((int)$sp['user_id'] === (int)$sellerId) {
                        return $sp['store_name'] ?? null;
                    }
                }
                return null;
            };

            // 6. Detail query: WHERE p.id = ?
            if (stripos($query, 'FROM products') !== false && stripos($query, 'p.id = ?') !== false) {
                $id = $params[0] ?? '';
                foreach ($this->products as $p) {
                    if ($p['id'] === $id && empty($p['deleted_at']) && empty($p['permanently_deleted'])) {
                        $row = $p;
                        $row['store_name'] = $getStoreName($p['seller_id']);
                        return $row;
                    }
                }
                return false;
            }

            // 7. List query:
            if (stripos($query, 'FROM products') !== false && stripos($query, 'p.seller_id = ?') !== false) {
                $sellerId = (int)($params[0] ?? 0);
                $rows = [];
                foreach ($this->products as $p) {
                    if ((int)$p['seller_id'] === $sellerId && empty($p['deleted_at']) && empty($p['permanently_deleted'])) {
                        $row = $p;
                        $row['store_name'] = $getStoreName($p['seller_id']);
                        $rows[] = $row;
                    }
                }
                return $rows;
            }

            return false;
        });
    }
}
`

function runPhp(scriptBody) {
  const tmpFile = path.join(ROOT_DIR, `temp_update_test_${Date.now()}_${Math.random().toString(36).substring(7)}.php`)
  try {
    fs.writeFileSync(
      tmpFile,
      `<?php
${PHP_MOCK_PDO_DEFINITION}

require_once '${path.join(ROOT_DIR, 'api', 'config.php').replace(/\\/g, '/')}';

${scriptBody}
`,
      'utf8'
    )
    const rawOutput = execSync(`php "${tmpFile}"`, { encoding: 'utf8' })
    const lastBrace = rawOutput.lastIndexOf('}')
    const firstBrace = rawOutput.indexOf('{')
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace >= firstBrace) {
      const jsonStr = rawOutput.substring(firstBrace, lastBrace + 1)
      return { status: 200, data: JSON.parse(jsonStr), raw: rawOutput }
    }
    return { status: 200, data: null, raw: rawOutput }
  } catch (err) {
    const stdout = err.stdout ? err.stdout.toString() : ''
    const stderr = err.stderr ? err.stderr.toString() : ''
    const output = stdout + '\n' + stderr
    const match = output.match(/\{[\s\S]*\}/)
    if (match) {
      try {
        const parsed = JSON.parse(match[0])
        return { status: err.status || 400, data: parsed, raw: output }
      } catch (_) {}
    }
    return { status: err.status || 500, error: err.message, raw: output }
  } finally {
    if (fs.existsSync(tmpFile)) {
      try { fs.unlinkSync(tmpFile) } catch (_) {}
    }
  }
}

test('update.php exists and passes PHP syntax check', () => {
  assert.ok(fs.existsSync(UPDATE_PATH), 'update.php must exist')
  execSync(`php -l "${UPDATE_PATH}"`)
})

test('update.php strictly avoids physical DELETE statements', () => {
  const content = fs.readFileSync(UPDATE_PATH, 'utf8')
  assert.doesNotMatch(content, /DELETE\s+FROM/i, 'Must not contain physical DELETE statements')
})

test('runtime: update.php rejects non-POST HTTP methods with 405', () => {
  const testScript = `
    $_SERVER['REQUEST_METHOD'] = 'GET';
    $pdo = new MockPDO();
    $GLOBALS['__TEST_PDO__'] = $pdo;
    require '${UPDATE_PATH.replace(/\\/g, '/')}';
  `
  const res = runPhp(testScript)
  assert.ok(res.data?.error)
  assert.match(res.data.error, /Method not allowed|POST required/i)
})

test('runtime: update.php rejects unauthenticated requests with 401/403', () => {
  const testScript = `
    $_SERVER['REQUEST_METHOD'] = 'POST';
    $pdo = new MockPDO();
    $GLOBALS['__TEST_PDO__'] = $pdo;
    $GLOBALS['__JSON_BODY__'] = ['id' => 'KCP-2026-1111', 'name' => 'Updated Sneaker'];
    require '${UPDATE_PATH.replace(/\\/g, '/')}';
  `
  const res = runPhp(testScript)
  assert.ok(res.data?.error)
  assert.match(res.data.error, /Authentication required|Seller/i)
})

test('runtime: update.php rejects missing product id with 400', () => {
  const testScript = `
    $_SERVER['REQUEST_METHOD'] = 'POST';
    $pdo = new MockPDO();
    $pdo->users = [['id' => 10, 'role' => 'seller', 'name' => 'Test Seller', 'email' => 'seller@test.com', 'deleted_at' => null, 'permanently_deleted' => 0]];
    $pdo->sellerProfiles = [['user_id' => 10, 'status' => 'approved', 'store_name' => 'Test Store', 'deleted_at' => null, 'permanently_deleted' => 0]];
    $GLOBALS['__TEST_PDO__'] = $pdo;
    $_SESSION['user_id'] = 10;
    $_SESSION['user_role'] = 'seller';
    $GLOBALS['__JSON_BODY__'] = ['name' => 'Updated Sneaker'];
    require '${UPDATE_PATH.replace(/\\/g, '/')}';
  `
  const res = runPhp(testScript)
  assert.ok(res.data?.error)
  assert.match(res.data.error, /Product ID is required/i)
})

test('runtime: update.php updates product and marks status as pending for owner approval', () => {
  const testScript = `
    $_SERVER['REQUEST_METHOD'] = 'POST';
    $pdo = new MockPDO();
    $pdo->users = [['id' => 10, 'role' => 'seller', 'name' => 'Test Seller', 'email' => 'seller@test.com', 'deleted_at' => null, 'permanently_deleted' => 0]];
    $pdo->sellerProfiles = [['user_id' => 10, 'status' => 'approved', 'store_name' => 'Test Store', 'deleted_at' => null, 'permanently_deleted' => 0]];
    $pdo->products = [
      [
        'id' => 'KCP-2026-5555',
        'seller_id' => 10,
        'name' => 'Original Shoe',
        'description' => 'Original description',
        'price' => '3500.00',
        'stock' => 5,
        'creation_method' => 'ai_generate',
        'glb_path' => '/models/seller-ai/test.glb',
        'thumbnail_path' => null,
        'base_shoe_id' => null,
        'charm_id' => 'star',
        'mesh_map' => '{}',
        'part_colors' => '{}',
        'sizes_available' => '[40,41]',
        'status' => 'approved',
        'approved_at' => '2026-10-04 10:00:00',
        'created_at' => '2026-10-04 09:00:00',
        'updated_at' => '2026-10-04 10:00:00',
        'deleted_at' => null,
        'permanently_deleted' => 0
      ]
    ];
    $GLOBALS['__TEST_PDO__'] = $pdo;
    $_SESSION['user_id'] = 10;
    $_SESSION['user_role'] = 'seller';
    $GLOBALS['__JSON_BODY__'] = [
      'id' => 'KCP-2026-5555',
      'name' => 'Enhanced Gumsole Runner',
      'description' => 'Updated with smooth leather finish',
      'price' => 3800,
      'stock' => 12,
    ];
    require '${UPDATE_PATH.replace(/\\/g, '/')}';
  `
  const res = runPhp(testScript)
  assert.equal(res.data?.success, true)
  assert.equal(res.data?.product?.name, 'Enhanced Gumsole Runner')
  assert.equal(res.data?.product?.status, 'pending', 'Must transition to pending for owner review')
})

test('runtime: update.php persists meshMap and partColors for ai_generate product and detail/list return them', () => {
  const meshMapToSave = {
    Upper: 'UpperMaterial',
    Midsole: 'MidsoleMaterial',
  }
  const partColorsToSave = {
    Upper: '#b94d27',
  }

  const testScript = `
    $_SERVER['REQUEST_METHOD'] = 'POST';
    $pdo = new MockPDO();
    $pdo->users = [['id' => 10, 'role' => 'seller', 'name' => 'Test Seller', 'email' => 'seller@test.com', 'deleted_at' => null, 'permanently_deleted' => 0]];
    $pdo->sellerProfiles = [['user_id' => 10, 'status' => 'approved', 'store_name' => 'Test Store', 'deleted_at' => null, 'permanently_deleted' => 0]];
    $pdo->products = [
      [
        'id' => 'KCP-2026-8888',
        'seller_id' => 10,
        'name' => 'Original AI Shoe',
        'description' => 'Original AI shoe without part mapping',
        'price' => '4500.00',
        'stock' => 8,
        'creation_method' => 'ai_generate',
        'glb_path' => '/models/seller-ai/ai_test.glb',
        'thumbnail_path' => null,
        'base_shoe_id' => null,
        'charm_id' => 'none',
        'mesh_map' => null,
        'part_colors' => null,
        'sizes_available' => '[40,41]',
        'status' => 'draft',
        'approved_at' => null,
        'created_at' => '2026-10-04 09:00:00',
        'updated_at' => '2026-10-04 10:00:00',
        'deleted_at' => null,
        'permanently_deleted' => 0
      ]
    ];
    $GLOBALS['__TEST_PDO__'] = $pdo;
    $_SESSION['user_id'] = 10;
    $_SESSION['user_role'] = 'seller';
    $GLOBALS['__JSON_BODY__'] = json_decode(${JSON.stringify(JSON.stringify({
      id: 'KCP-2026-8888',
      name: 'Updated Multi-Part AI Sneaker',
      description: 'Now segmented into 8 customizable parts',
      price: 4900,
      stock: 15,
      meshMap: meshMapToSave,
      partColors: partColorsToSave,
    }))}, true);
    require '${UPDATE_PATH.replace(/\\/g, '/')}';
  `

  const res = runPhp(testScript)
  assert.equal(res.data?.success, true)
  assert.equal(res.data?.product?.name, 'Updated Multi-Part AI Sneaker')
  assert.equal(res.data?.product?.creationMethod, 'ai_generate')
  assert.deepEqual(res.data?.product?.meshMap, meshMapToSave, 'update.php response must include updated meshMap')
  assert.deepEqual(res.data?.product?.partColors, partColorsToSave, 'update.php response must include updated partColors')

  // Verify detail.php and list.php
  const readScript = `
    $_SERVER['REQUEST_METHOD'] = 'GET';
    $_GET['id'] = 'KCP-2026-8888';
    $pdo = new MockPDO();
    $pdo->users = [['id' => 10, 'role' => 'seller', 'name' => 'Test Seller', 'email' => 'seller@test.com', 'deleted_at' => null, 'permanently_deleted' => 0]];
    $pdo->sellerProfiles = [['user_id' => 10, 'status' => 'approved', 'store_name' => 'Test Store', 'deleted_at' => null, 'permanently_deleted' => 0]];
    $pdo->products = [
      [
        'id' => 'KCP-2026-8888',
        'seller_id' => 10,
        'name' => 'Updated Multi-Part AI Sneaker',
        'description' => 'Now segmented into 8 customizable parts',
        'price' => 4900,
        'stock' => 15,
        'creation_method' => 'ai_generate',
        'glb_path' => '/models/seller-ai/ai_test.glb',
        'thumbnail_path' => null,
        'base_shoe_id' => null,
        'charm_id' => 'none',
        'mesh_map' => ${JSON.stringify(JSON.stringify(meshMapToSave))},
        'part_colors' => ${JSON.stringify(JSON.stringify(partColorsToSave))},
        'sizes_available' => '[40,41]',
        'status' => 'pending',
        'approved_at' => null,
        'created_at' => '2026-10-04 09:00:00',
        'updated_at' => '2026-10-04 10:00:00',
        'deleted_at' => null,
        'permanently_deleted' => 0
      ]
    ];
    $GLOBALS['__TEST_PDO__'] = $pdo;
    $_SESSION['user_id'] = 10;
    $_SESSION['user_role'] = 'seller';

    require '${DETAIL_PATH.replace(/\\/g, '/')}';
  `
  const detailRes = runPhp(readScript)
  assert.equal(detailRes.data?.success, true)
  assert.deepEqual(detailRes.data?.product?.meshMap, meshMapToSave, 'detail.php must return meshMap for updated AI product')
  assert.deepEqual(detailRes.data?.product?.partColors, partColorsToSave, 'detail.php must return partColors for updated AI product')

  const listScript = `
    $_SERVER['REQUEST_METHOD'] = 'GET';
    $pdo = new MockPDO();
    $pdo->users = [['id' => 10, 'role' => 'seller', 'name' => 'Test Seller', 'email' => 'seller@test.com', 'deleted_at' => null, 'permanently_deleted' => 0]];
    $pdo->sellerProfiles = [['user_id' => 10, 'status' => 'approved', 'store_name' => 'Test Store', 'deleted_at' => null, 'permanently_deleted' => 0]];
    $pdo->products = [
      [
        'id' => 'KCP-2026-8888',
        'seller_id' => 10,
        'name' => 'Updated Multi-Part AI Sneaker',
        'description' => 'Now segmented into 8 customizable parts',
        'price' => 4900,
        'stock' => 15,
        'creation_method' => 'ai_generate',
        'glb_path' => '/models/seller-ai/ai_test.glb',
        'thumbnail_path' => null,
        'base_shoe_id' => null,
        'charm_id' => 'none',
        'mesh_map' => ${JSON.stringify(JSON.stringify(meshMapToSave))},
        'part_colors' => ${JSON.stringify(JSON.stringify(partColorsToSave))},
        'sizes_available' => '[40,41]',
        'status' => 'pending',
        'approved_at' => null,
        'created_at' => '2026-10-04 09:00:00',
        'updated_at' => '2026-10-04 10:00:00',
        'deleted_at' => null,
        'permanently_deleted' => 0
      ]
    ];
    $GLOBALS['__TEST_PDO__'] = $pdo;
    $_SESSION['user_id'] = 10;
    $_SESSION['user_role'] = 'seller';

    require '${LIST_PATH.replace(/\\/g, '/')}';
  `
  const listRes = runPhp(listScript)
  assert.equal(listRes.data?.success, true)
  const productInList = listRes.data?.products?.find(p => p.id === 'KCP-2026-8888')
  assert.ok(productInList)
  assert.deepEqual(productInList.meshMap, meshMapToSave, 'list.php must return meshMap for updated AI product')
  assert.deepEqual(productInList.partColors, partColorsToSave, 'list.php must return partColors for updated AI product')
})
