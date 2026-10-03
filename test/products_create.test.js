import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const ROOT_DIR = path.resolve(import.meta.dirname, '..')
const PRODUCTS_DIR = path.join(ROOT_DIR, 'api', 'products')
const UPLOAD_GLB_PATH = path.join(PRODUCTS_DIR, 'upload-glb.php')
const CREATE_PATH = path.join(PRODUCTS_DIR, 'create.php')

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

            // 3. Product ID uniqueness check: SELECT COUNT(*) FROM products WHERE id = ?
            if (stripos($query, 'SELECT COUNT(*)') !== false && stripos($query, 'products') !== false) {
                $id = $params[0] ?? '';
                return isset($this->products[$id]) ? 1 : 0;
            }

            // 4. Insert product: INSERT INTO products ...
            if (stripos($query, 'INSERT INTO products') !== false) {
                $id = $params[0] ?? '';
                $sellerId = (int)($params[1] ?? 0);
                $name = $params[2] ?? '';
                $description = $params[3] ?? null;
                $price = (float)($params[4] ?? 0);
                $stock = (int)($params[5] ?? 0);
                $creationMethod = $params[6] ?? 'upload';
                $glbPath = $params[7] ?? null;
                $thumbnailPath = $params[8] ?? null;
                $baseShoeId = $params[9] ?? null;
                $partColors = $params[10] ?? null;
                $charmId = $params[11] ?? 'none';
                $meshMap = $params[12] ?? null;
                $sizesAvailable = $params[13] ?? '[]';
                $status = 'draft';
                $now = date('Y-m-d H:i:s');

                $record = [
                    'id' => $id,
                    'seller_id' => $sellerId,
                    'name' => $name,
                    'description' => $description,
                    'price' => $price,
                    'stock' => $stock,
                    'creation_method' => $creationMethod,
                    'glb_path' => $glbPath,
                    'thumbnail_path' => $thumbnailPath,
                    'base_shoe_id' => $baseShoeId,
                    'part_colors' => $partColors,
                    'charm_id' => $charmId,
                    'mesh_map' => $meshMap,
                    'sizes_available' => $sizesAvailable,
                    'status' => $status,
                    'admin_notes' => null,
                    'approved_at' => null,
                    'created_at' => $now,
                    'updated_at' => $now,
                    'deleted_at' => null,
                    'permanently_deleted' => 0,
                ];
                $this->products[$id] = $record;
                return 1;
            }

            // 5. Select product by id: SELECT * FROM products WHERE id = ?
            if (stripos($query, 'FROM products') !== false && stripos($query, 'WHERE id = ?') !== false) {
                $id = $params[0] ?? '';
                if (isset($this->products[$id])) {
                    return $this->products[$id];
                }
                return false;
            }

            return false;
        });
    }
}
`

test('Product endpoint files exist and pass syntax check', () => {
  assert.ok(fs.existsSync(UPLOAD_GLB_PATH), 'api/products/upload-glb.php must exist')
  assert.ok(fs.existsSync(CREATE_PATH), 'api/products/create.php must exist')

  const uploadSyntax = execSync(`php -l "${UPLOAD_GLB_PATH}"`, { encoding: 'utf8' })
  assert.match(uploadSyntax, /No syntax errors detected/i)

  const createSyntax = execSync(`php -l "${CREATE_PATH}"`, { encoding: 'utf8' })
  assert.match(createSyntax, /No syntax errors detected/i)
})

test('Product endpoint files contain zero physical DELETE statements', () => {
  for (const filePath of [UPLOAD_GLB_PATH, CREATE_PATH]) {
    const code = fs.readFileSync(filePath, 'utf8')
    assert.doesNotMatch(
      code,
      /\bDELETE\s+FROM\b/i,
      `Physical DELETE FROM found in ${filePath} - must not contain DELETE statements`
    )
  }
})

test('Product endpoint files enforce config, db, helpers, and prepared statements', () => {
  for (const filePath of [UPLOAD_GLB_PATH, CREATE_PATH]) {
    const code = fs.readFileSync(filePath, 'utf8')
    assert.match(code, /config\.php/i, `${filePath} must require config.php`)
    assert.match(code, /helpers\.php/i, `${filePath} must require helpers.php`)
  }

  const createCode = fs.readFileSync(CREATE_PATH, 'utf8')
  assert.match(createCode, /db\.php/i, 'create.php must require db.php')
  assert.match(createCode, /\$db->prepare\s*\(/i, 'create.php must use PDO prepared statements')
  assert.doesNotMatch(createCode, /\$db->query\s*\(/i, 'create.php must not use unparameterized $db->query')
})

test('Product endpoint files enforce POST HTTP method', () => {
  const uploadCode = fs.readFileSync(UPLOAD_GLB_PATH, 'utf8')
  assert.match(uploadCode, /requireMethod\s*\(\s*['"]POST['"]\s*\)/i, 'upload-glb.php must enforce POST')

  const createCode = fs.readFileSync(CREATE_PATH, 'utf8')
  assert.match(createCode, /requireMethod\s*\(\s*['"]POST['"]\s*\)/i, 'create.php must enforce POST')
})

test('runtime: Product endpoints reject invalid HTTP methods with 405', () => {
  for (const file of [UPLOAD_GLB_PATH, CREATE_PATH]) {
    const runner = path.join(ROOT_DIR, `test_prod_method_GET_${path.basename(file, '.php')}.php`)
    fs.writeFileSync(
      runner,
      `<?php
$_SERVER['REQUEST_METHOD'] = 'GET';
require '${file.replace(/\\/g, '/')}';
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

test('runtime: Product endpoints reject unauthenticated requests and customer role with 403/401', () => {
  for (const file of [UPLOAD_GLB_PATH, CREATE_PATH]) {
    const name = path.basename(file, '.php')

    // 1. Unauthenticated -> 403 / 401
    const runnerUnauth = path.join(ROOT_DIR, `test_prod_unauth_${name}.php`)
    fs.writeFileSync(
      runnerUnauth,
      `<?php
$_SERVER['REQUEST_METHOD'] = 'POST';
require '${file.replace(/\\/g, '/')}';
`
    )
    try {
      const output = execSync(`php "${runnerUnauth}"`, { encoding: 'utf8' })
      const json = JSON.parse(output)
      assert.ok(json.error, `Unauthenticated request to ${name}.php must be rejected`)
      assert.match(json.error, /(seller privileges required|authentication required)/i)
    } finally {
      if (fs.existsSync(runnerUnauth)) fs.unlinkSync(runnerUnauth)
    }

    // 2. Customer role -> 403 Seller privileges required
    const runnerCustomer = path.join(ROOT_DIR, `test_prod_customer_${name}.php`)
    fs.writeFileSync(
      runnerCustomer,
      `<?php
$_SERVER['REQUEST_METHOD'] = 'POST';
require_once '${path.join(ROOT_DIR, 'api', 'config.php').replace(/\\/g, '/')}';
$_SESSION['user_id'] = 5;
$_SESSION['user_role'] = 'customer';
require '${file.replace(/\\/g, '/')}';
`
    )
    try {
      const output = execSync(`php "${runnerCustomer}"`, { encoding: 'utf8' })
      const json = JSON.parse(output)
      assert.equal(json.error, 'Seller privileges required')
    } finally {
      if (fs.existsSync(runnerCustomer)) fs.unlinkSync(runnerCustomer)
    }
  }
})

test('runtime: upload-glb.php rejects missing file with 400', () => {
  const runner = path.join(ROOT_DIR, 'test_upload_glb_missing.php')
  const statusFile = path.join(ROOT_DIR, 'test_upload_glb_missing_status.txt')

  fs.writeFileSync(
    runner,
    `<?php
${PHP_MOCK_PDO_DEFINITION}

$_SERVER['REQUEST_METHOD'] = 'POST';
require_once '${path.join(ROOT_DIR, 'api', 'config.php').replace(/\\/g, '/')}';

$pdo = new MockPDO();
$pdo->users = [
    ['id' => 10, 'name' => 'Seller One', 'email' => 'seller1@example.com', 'role' => 'seller', 'deleted_at' => null, 'permanently_deleted' => 0],
];
$pdo->sellerProfiles = [
    ['id' => 1, 'user_id' => 10, 'store_name' => 'KickCraft Studio', 'status' => 'approved', 'deleted_at' => null, 'permanently_deleted' => 0],
];
$GLOBALS['__TEST_PDO__'] = $pdo;
$_SESSION['user_id'] = 10;
$_SESSION['user_role'] = 'seller';

register_shutdown_function(function() {
    file_put_contents(${JSON.stringify(statusFile)}, (string)http_response_code());
});

require '${UPLOAD_GLB_PATH.replace(/\\/g, '/')}';
`
  )

  try {
    const output = execSync(`php "${runner}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.match(json.error, /file is required/i)
    if (fs.existsSync(statusFile)) {
      const code = parseInt(fs.readFileSync(statusFile, 'utf8'), 10)
      assert.equal(code, 400)
    }
  } finally {
    if (fs.existsSync(runner)) fs.unlinkSync(runner)
    if (fs.existsSync(statusFile)) fs.unlinkSync(statusFile)
  }
})

test('runtime: upload-glb.php rejects non-glb extension with 415', () => {
  const runner = path.join(ROOT_DIR, 'test_upload_glb_invalid_ext.php')
  const statusFile = path.join(ROOT_DIR, 'test_upload_glb_invalid_ext_status.txt')
  const dummyFile = path.join(ROOT_DIR, 'test_dummy_model.obj')
  fs.writeFileSync(dummyFile, 'v 0 0 0')

  fs.writeFileSync(
    runner,
    `<?php
${PHP_MOCK_PDO_DEFINITION}

$_SERVER['REQUEST_METHOD'] = 'POST';
require_once '${path.join(ROOT_DIR, 'api', 'config.php').replace(/\\/g, '/')}';

$pdo = new MockPDO();
$pdo->users = [
    ['id' => 10, 'name' => 'Seller One', 'email' => 'seller1@example.com', 'role' => 'seller', 'deleted_at' => null, 'permanently_deleted' => 0],
];
$pdo->sellerProfiles = [
    ['id' => 1, 'user_id' => 10, 'store_name' => 'KickCraft Studio', 'status' => 'approved', 'deleted_at' => null, 'permanently_deleted' => 0],
];
$GLOBALS['__TEST_PDO__'] = $pdo;
$_SESSION['user_id'] = 10;
$_SESSION['user_role'] = 'seller';

$_FILES['file'] = [
    'name' => 'model.obj',
    'type' => 'application/octet-stream',
    'tmp_name' => '${dummyFile.replace(/\\/g, '/')}',
    'error' => UPLOAD_ERR_OK,
    'size' => 100,
];

register_shutdown_function(function() {
    file_put_contents(${JSON.stringify(statusFile)}, (string)http_response_code());
});

require '${UPLOAD_GLB_PATH.replace(/\\/g, '/')}';
`
  )

  try {
    const output = execSync(`php "${runner}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.match(json.error, /only \.glb|only glb/i)
    if (fs.existsSync(statusFile)) {
      const code = parseInt(fs.readFileSync(statusFile, 'utf8'), 10)
      assert.equal(code, 415)
    }
  } finally {
    if (fs.existsSync(runner)) fs.unlinkSync(runner)
    if (fs.existsSync(statusFile)) fs.unlinkSync(statusFile)
    if (fs.existsSync(dummyFile)) fs.unlinkSync(dummyFile)
  }
})

test('runtime: upload-glb.php rejects file exceeding 20MB with 413', () => {
  const runner = path.join(ROOT_DIR, 'test_upload_glb_oversize.php')
  const statusFile = path.join(ROOT_DIR, 'test_upload_glb_oversize_status.txt')
  const dummyFile = path.join(ROOT_DIR, 'test_dummy_oversize.glb')
  fs.writeFileSync(dummyFile, 'glTF')

  fs.writeFileSync(
    runner,
    `<?php
${PHP_MOCK_PDO_DEFINITION}

$_SERVER['REQUEST_METHOD'] = 'POST';
require_once '${path.join(ROOT_DIR, 'api', 'config.php').replace(/\\/g, '/')}';

$pdo = new MockPDO();
$pdo->users = [
    ['id' => 10, 'name' => 'Seller One', 'email' => 'seller1@example.com', 'role' => 'seller', 'deleted_at' => null, 'permanently_deleted' => 0],
];
$pdo->sellerProfiles = [
    ['id' => 1, 'user_id' => 10, 'store_name' => 'KickCraft Studio', 'status' => 'approved', 'deleted_at' => null, 'permanently_deleted' => 0],
];
$GLOBALS['__TEST_PDO__'] = $pdo;
$_SESSION['user_id'] = 10;
$_SESSION['user_role'] = 'seller';

$_FILES['file'] = [
    'name' => 'huge_model.glb',
    'type' => 'model/gltf-binary',
    'tmp_name' => '${dummyFile.replace(/\\/g, '/')}',
    'error' => UPLOAD_ERR_OK,
    'size' => 21 * 1024 * 1024, // 21MB
];

register_shutdown_function(function() {
    file_put_contents(${JSON.stringify(statusFile)}, (string)http_response_code());
});

require '${UPLOAD_GLB_PATH.replace(/\\/g, '/')}';
`
  )

  try {
    const output = execSync(`php "${runner}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.match(json.error, /exceeds maximum limit of 20MB|20MB/i)
    if (fs.existsSync(statusFile)) {
      const code = parseInt(fs.readFileSync(statusFile, 'utf8'), 10)
      assert.equal(code, 413)
    }
  } finally {
    if (fs.existsSync(runner)) fs.unlinkSync(runner)
    if (fs.existsSync(statusFile)) fs.unlinkSync(statusFile)
    if (fs.existsSync(dummyFile)) fs.unlinkSync(dummyFile)
  }
})

test('runtime: upload-glb.php successfully uploads .glb file and returns path', () => {
  const runner = path.join(ROOT_DIR, 'test_upload_glb_valid.php')
  const dummyFile = path.join(ROOT_DIR, 'test_valid_shoe.glb')
  fs.writeFileSync(dummyFile, 'glTF\x02\x00\x00\x00')

  fs.writeFileSync(
    runner,
    `<?php
${PHP_MOCK_PDO_DEFINITION}

$_SERVER['REQUEST_METHOD'] = 'POST';
require_once '${path.join(ROOT_DIR, 'api', 'config.php').replace(/\\/g, '/')}';

$pdo = new MockPDO();
$pdo->users = [
    ['id' => 10, 'name' => 'Seller One', 'email' => 'seller1@example.com', 'role' => 'seller', 'deleted_at' => null, 'permanently_deleted' => 0],
];
$pdo->sellerProfiles = [
    ['id' => 1, 'user_id' => 10, 'store_name' => 'KickCraft Studio', 'status' => 'approved', 'deleted_at' => null, 'permanently_deleted' => 0],
];
$GLOBALS['__TEST_PDO__'] = $pdo;
$_SESSION['user_id'] = 10;
$_SESSION['user_role'] = 'seller';

$_FILES['file'] = [
    'name' => 'custom_sneaker.glb',
    'type' => 'model/gltf-binary',
    'tmp_name' => '${dummyFile.replace(/\\/g, '/')}',
    'error' => UPLOAD_ERR_OK,
    'size' => 1024,
];

require '${UPLOAD_GLB_PATH.replace(/\\/g, '/')}';
`
  )

  let uploadedFilePath = null

  try {
    const output = execSync(`php "${runner}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.equal(json.success, true)
    assert.ok(json.path, 'Response must include path')
    assert.match(json.path, /^\/models\/seller-uploads\/[a-f0-9]+\.glb$/i, 'Path must match /models/seller-uploads/{hash}.glb')

    uploadedFilePath = path.join(ROOT_DIR, 'public', json.path.replace(/^\//, ''))
    assert.ok(fs.existsSync(uploadedFilePath), `Uploaded file must exist on disk: ${uploadedFilePath}`)
  } finally {
    if (fs.existsSync(runner)) fs.unlinkSync(runner)
    if (fs.existsSync(dummyFile)) fs.unlinkSync(dummyFile)
    if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
      fs.unlinkSync(uploadedFilePath)
    }
  }
})

test('runtime: create.php rejects missing or too short name (< 2 chars) with 400', () => {
  const runner = path.join(ROOT_DIR, 'test_create_invalid_name.php')
  const statusFile = path.join(ROOT_DIR, 'test_create_invalid_name_status.txt')

  const body = {
    name: ' ',
    price: 4990,
    creationMethod: 'upload',
  }

  fs.writeFileSync(
    runner,
    `<?php
${PHP_MOCK_PDO_DEFINITION}

$_SERVER['REQUEST_METHOD'] = 'POST';
require_once '${path.join(ROOT_DIR, 'api', 'config.php').replace(/\\/g, '/')}';

$pdo = new MockPDO();
$pdo->users = [
    ['id' => 10, 'name' => 'Seller One', 'email' => 'seller1@example.com', 'role' => 'seller', 'deleted_at' => null, 'permanently_deleted' => 0],
];
$GLOBALS['__TEST_PDO__'] = $pdo;
$_SESSION['user_id'] = 10;
$_SESSION['user_role'] = 'seller';
$GLOBALS['__JSON_BODY__'] = json_decode(${JSON.stringify(JSON.stringify(body))}, true);

register_shutdown_function(function() {
    file_put_contents(${JSON.stringify(statusFile)}, (string)http_response_code());
});

require '${CREATE_PATH.replace(/\\/g, '/')}';
`
  )

  try {
    const output = execSync(`php "${runner}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.match(json.error, /product name is required|minimum 2 characters/i)
    if (fs.existsSync(statusFile)) {
      const code = parseInt(fs.readFileSync(statusFile, 'utf8'), 10)
      assert.equal(code, 400)
    }
  } finally {
    if (fs.existsSync(runner)) fs.unlinkSync(runner)
    if (fs.existsSync(statusFile)) fs.unlinkSync(statusFile)
  }
})

test('runtime: create.php rejects missing, non-numeric, or negative price with 400', () => {
  for (const priceVal of [null, 'invalid', -50]) {
    const runner = path.join(ROOT_DIR, 'test_create_invalid_price.php')
    const statusFile = path.join(ROOT_DIR, 'test_create_invalid_price_status.txt')

    const body = {
      name: 'Cyber Runner',
      price: priceVal,
      creationMethod: 'upload',
    }

    fs.writeFileSync(
      runner,
      `<?php
${PHP_MOCK_PDO_DEFINITION}

$_SERVER['REQUEST_METHOD'] = 'POST';
require_once '${path.join(ROOT_DIR, 'api', 'config.php').replace(/\\/g, '/')}';

$pdo = new MockPDO();
$pdo->users = [
    ['id' => 10, 'name' => 'Seller One', 'email' => 'seller1@example.com', 'role' => 'seller', 'deleted_at' => null, 'permanently_deleted' => 0],
];
$GLOBALS['__TEST_PDO__'] = $pdo;
$_SESSION['user_id'] = 10;
$_SESSION['user_role'] = 'seller';
$GLOBALS['__JSON_BODY__'] = json_decode(${JSON.stringify(JSON.stringify(body))}, true);

register_shutdown_function(function() {
    file_put_contents(${JSON.stringify(statusFile)}, (string)http_response_code());
});

require '${CREATE_PATH.replace(/\\/g, '/')}';
`
    )

    try {
      const output = execSync(`php "${runner}"`, { encoding: 'utf8' })
      const json = JSON.parse(output)
      assert.match(json.error, /valid non-negative price|price is required/i)
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

test('runtime: create.php rejects invalid creationMethod with 400', () => {
  const runner = path.join(ROOT_DIR, 'test_create_invalid_method.php')
  const statusFile = path.join(ROOT_DIR, 'test_create_invalid_method_status.txt')

  const body = {
    name: 'Cyber Runner',
    price: 4990,
    creationMethod: 'unknown_method',
  }

  fs.writeFileSync(
    runner,
    `<?php
${PHP_MOCK_PDO_DEFINITION}

$_SERVER['REQUEST_METHOD'] = 'POST';
require_once '${path.join(ROOT_DIR, 'api', 'config.php').replace(/\\/g, '/')}';

$pdo = new MockPDO();
$pdo->users = [
    ['id' => 10, 'name' => 'Seller One', 'email' => 'seller1@example.com', 'role' => 'seller', 'deleted_at' => null, 'permanently_deleted' => 0],
];
$GLOBALS['__TEST_PDO__'] = $pdo;
$_SESSION['user_id'] = 10;
$_SESSION['user_role'] = 'seller';
$GLOBALS['__JSON_BODY__'] = json_decode(${JSON.stringify(JSON.stringify(body))}, true);

register_shutdown_function(function() {
    file_put_contents(${JSON.stringify(statusFile)}, (string)http_response_code());
});

require '${CREATE_PATH.replace(/\\/g, '/')}';
`
  )

  try {
    const output = execSync(`php "${runner}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.match(json.error, /creation method/i)
    if (fs.existsSync(statusFile)) {
      const code = parseInt(fs.readFileSync(statusFile, 'utf8'), 10)
      assert.equal(code, 400)
    }
  } finally {
    if (fs.existsSync(runner)) fs.unlinkSync(runner)
    if (fs.existsSync(statusFile)) fs.unlinkSync(statusFile)
  }
})

test('runtime: create.php generates KCP-YYYY-XXXX ID, inserts product with draft status, and encodes JSON columns', () => {
  const runner = path.join(ROOT_DIR, 'test_create_valid.php')
  const stateFile = path.join(ROOT_DIR, 'test_create_valid_state.json')

  const body = {
    name: 'Aero Velocity 3D',
    description: 'Ultra-light high performance runner designed with KickCraft Studio.',
    price: 5490,
    stock: 25,
    creationMethod: 'upload',
    glbPath: '/models/seller-uploads/a1b2c3d4e5f6.glb',
    thumbnailPath: '/images/thumbnails/a1b2c3d4e5f6.png',
    meshMap: {
      Mesh_001: 'upper',
      Mesh_002: 'midsole',
      Mesh_003: 'laces',
    },
    partColors: {
      upper: { name: 'Cobalt', value: '#245fa8' },
      midsole: { name: 'Chalk', value: '#f1efe8' },
    },
    charmId: 'star',
    sizesAvailable: [7, 8, 9, 10, 11, 12],
  }

  fs.writeFileSync(
    runner,
    `<?php
${PHP_MOCK_PDO_DEFINITION}

$_SERVER['REQUEST_METHOD'] = 'POST';
require_once '${path.join(ROOT_DIR, 'api', 'config.php').replace(/\\/g, '/')}';

$pdo = new MockPDO();
$pdo->users = [
    ['id' => 15, 'name' => 'Pro Seller', 'email' => 'pro@example.com', 'role' => 'seller', 'deleted_at' => null, 'permanently_deleted' => 0],
];
$pdo->sellerProfiles = [
    ['id' => 3, 'user_id' => 15, 'store_name' => 'Pro Footwear', 'status' => 'approved', 'deleted_at' => null, 'permanently_deleted' => 0],
];
$GLOBALS['__TEST_PDO__'] = $pdo;
$_SESSION['user_id'] = 15;
$_SESSION['user_role'] = 'seller';
$GLOBALS['__JSON_BODY__'] = json_decode(${JSON.stringify(JSON.stringify(body))}, true);

register_shutdown_function(function() use ($pdo) {
    file_put_contents(${JSON.stringify(stateFile)}, json_encode($pdo->products));
});

require '${CREATE_PATH.replace(/\\/g, '/')}';
`
  )

  try {
    const output = execSync(`php "${runner}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.equal(json.success, true)
    assert.ok(json.productId, 'Response must return productId')
    assert.match(json.productId, /^KCP-\d{4}-\d{4}$/, 'productId format must be KCP-YYYY-XXXX')

    assert.ok(fs.existsSync(stateFile), 'State file must be written')
    const dbProducts = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
    const product = dbProducts[json.productId]
    assert.ok(product, 'Product record must be saved in database')

    assert.equal(product.id, json.productId)
    assert.equal(product.seller_id, 15)
    assert.equal(product.name, 'Aero Velocity 3D')
    assert.equal(product.description, 'Ultra-light high performance runner designed with KickCraft Studio.')
    assert.equal(product.price, 5490)
    assert.equal(product.stock, 25)
    assert.equal(product.creation_method, 'upload')
    assert.equal(product.glb_path, '/models/seller-uploads/a1b2c3d4e5f6.glb')
    assert.equal(product.thumbnail_path, '/images/thumbnails/a1b2c3d4e5f6.png')
    assert.equal(product.status, 'draft', 'Initial product status must be draft')
    assert.equal(product.charm_id, 'star')

    // Verify JSON encoding in database
    const decodedMeshMap = JSON.parse(product.mesh_map)
    assert.deepEqual(decodedMeshMap, body.meshMap)

    const decodedPartColors = JSON.parse(product.part_colors)
    assert.deepEqual(decodedPartColors, body.partColors)

    const decodedSizes = JSON.parse(product.sizes_available)
    assert.deepEqual(decodedSizes, body.sizesAvailable)
  } finally {
    if (fs.existsSync(runner)) fs.unlinkSync(runner)
    if (fs.existsSync(stateFile)) fs.unlinkSync(stateFile)
  }
})

test('runtime: create.php handles template creationMethod with baseShoeId and custom partColors', () => {
  const runner = path.join(ROOT_DIR, 'test_create_template.php')
  const stateFile = path.join(ROOT_DIR, 'test_create_template_state.json')

  const body = {
    name: 'KickCraft Heritage Custom',
    description: 'Customized edition based on KickCraft One silhouette.',
    price: 4890,
    creationMethod: 'template',
    baseShoeId: 'kickcraft-one',
    partColors: {
      upper: { name: 'Moss', value: '#52684f' },
      laces: { name: 'Rust', value: '#b94d27' },
    },
    charmId: 'lightning',
  }

  fs.writeFileSync(
    runner,
    `<?php
${PHP_MOCK_PDO_DEFINITION}

$_SERVER['REQUEST_METHOD'] = 'POST';
require_once '${path.join(ROOT_DIR, 'api', 'config.php').replace(/\\/g, '/')}';

$pdo = new MockPDO();
$pdo->users = [
    ['id' => 20, 'name' => 'Template Seller', 'email' => 'template@example.com', 'role' => 'seller', 'deleted_at' => null, 'permanently_deleted' => 0],
];
$pdo->sellerProfiles = [
    ['id' => 4, 'user_id' => 20, 'store_name' => 'Custom Shop', 'status' => 'approved', 'deleted_at' => null, 'permanently_deleted' => 0],
];
$GLOBALS['__TEST_PDO__'] = $pdo;
$_SESSION['user_id'] = 20;
$_SESSION['user_role'] = 'seller';
$GLOBALS['__JSON_BODY__'] = json_decode(${JSON.stringify(JSON.stringify(body))}, true);

register_shutdown_function(function() use ($pdo) {
    file_put_contents(${JSON.stringify(stateFile)}, json_encode($pdo->products));
});

require '${CREATE_PATH.replace(/\\/g, '/')}';
`
  )

  try {
    const output = execSync(`php "${runner}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.equal(json.success, true)
    assert.ok(json.productId, 'Response must return productId')

    assert.ok(fs.existsSync(stateFile), 'State file must be written')
    const dbProducts = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
    const product = dbProducts[json.productId]
    assert.ok(product, 'Product record must be saved in database')

    assert.equal(product.seller_id, 20)
    assert.equal(product.name, 'KickCraft Heritage Custom')
    assert.equal(product.creation_method, 'template')
    assert.equal(product.base_shoe_id, 'kickcraft-one')
    assert.equal(product.charm_id, 'lightning')
    assert.equal(product.status, 'draft')
  } finally {
    if (fs.existsSync(runner)) fs.unlinkSync(runner)
    if (fs.existsSync(stateFile)) fs.unlinkSync(stateFile)
  }
})
