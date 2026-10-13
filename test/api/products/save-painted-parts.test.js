import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const ROOT_DIR = path.resolve(import.meta.dirname, '..', '..', '..')
const PRODUCTS_DIR = path.join(ROOT_DIR, 'api', 'products')
const SAVE_PAINTED_PATH = path.join(PRODUCTS_DIR, 'save-painted-parts.php')

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
            if (stripos($query, 'FROM users') !== false && stripos($query, 'id = ?') !== false) {
                $id = (int)($params[0] ?? 0);
                foreach ($this->users as $u) {
                    if ((int)$u['id'] === $id && empty($u['deleted_at']) && empty($u['permanently_deleted'])) {
                        return $u;
                    }
                }
                return false;
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

            // 3. SELECT * FROM products WHERE id = ?
            if (stripos($query, 'SELECT * FROM products') !== false && stripos($query, 'id = ?') !== false) {
                $productId = $params[0] ?? '';
                foreach ($this->products as $p) {
                    if ($p['id'] === $productId && empty($p['deleted_at']) && empty($p['permanently_deleted'])) {
                        // Check if seller_id condition is in the query
                        if (stripos($query, 'seller_id = ?') !== false) {
                            $sellerId = (int)($params[1] ?? 0);
                            if ((int)$p['seller_id'] === $sellerId) {
                                return $p;
                            }
                            return false;
                        }
                        return $p;
                    }
                }
                return false;
            }

            // 4. UPDATE products SET glb_path = ?, mesh_map = ?, part_colors = ...
            if (stripos($query, 'UPDATE products SET') !== false) {
                // Find target product
                $productId = end($params); // Usually id is at or near end
                // Find product by id from params
                $targetId = null;
                $targetSellerId = null;
                foreach ($params as $param) {
                    foreach ($this->products as $p) {
                        if ($p['id'] === $param) {
                            $targetId = $param;
                        }
                    }
                }
                if ($targetId !== null) {
                    foreach ($this->products as &$prod) {
                        if ($prod['id'] === $targetId) {
                            if (stripos($query, 'glb_path = ?') !== false) {
                                $prod['glb_path'] = $params[0] ?? $prod['glb_path'];
                            }
                            if (stripos($query, 'mesh_map = ?') !== false) {
                                $prod['mesh_map'] = $params[1] ?? $prod['mesh_map'];
                            }
                            if (stripos($query, 'part_colors = ?') !== false) {
                                $prod['part_colors'] = $params[2] ?? $prod['part_colors'];
                            }
                            return 1;
                        }
                    }
                }
                return 1;
            }

            return false;
        });
    }
}
`

const SEED_USERS = [
  { id: 10, name: 'Seller One', email: 'seller1@example.com', role: 'seller', deleted_at: null, permanently_deleted: 0 },
  { id: 20, name: 'Seller Two', email: 'seller2@example.com', role: 'seller', deleted_at: null, permanently_deleted: 0 },
  { id: 30, name: 'Customer User', email: 'customer@example.com', role: 'customer', deleted_at: null, permanently_deleted: 0 },
]

const SEED_PROFILES = [
  { id: 1, user_id: 10, store_name: 'KickCraft Studio', status: 'approved', deleted_at: null, permanently_deleted: 0 },
  { id: 2, user_id: 20, store_name: 'Urban Kicks', status: 'approved', deleted_at: null, permanently_deleted: 0 },
]

const SEED_PRODUCTS = [
  {
    id: 'KCP-2026-0001',
    seller_id: 10,
    name: 'Seller 10 AI Draft Shoe',
    status: 'draft',
    creation_method: 'ai_generate',
    glb_path: '/models/seller-ai/ai_shoe_0001.glb',
    mesh_map: null,
    part_colors: null,
    deleted_at: null,
    permanently_deleted: 0,
  },
  {
    id: 'KCP-2026-0002',
    seller_id: 20,
    name: 'Seller 20 AI Shoe',
    status: 'draft',
    creation_method: 'ai_generate',
    glb_path: '/models/seller-ai/ai_shoe_0002.glb',
    mesh_map: null,
    part_colors: null,
    deleted_at: null,
    permanently_deleted: 0,
  },
  {
    id: 'KCP-2026-0003',
    seller_id: 10,
    name: 'Soft Deleted Shoe',
    status: 'draft',
    creation_method: 'ai_generate',
    glb_path: '/models/seller-ai/ai_shoe_0003.glb',
    mesh_map: null,
    part_colors: null,
    deleted_at: '2026-10-01 00:00:00',
    permanently_deleted: 0,
  },
]

function runPhpSavePainted({
  method = 'POST',
  session = { id: 10, role: 'seller', seller_status: 'approved' },
  body = null,
  files = null,
  post = null,
  customProducts = null,
}) {
  const runner = path.join(ROOT_DIR, `test_run_save_painted_${Date.now()}_${Math.random().toString(36).slice(2)}.php`)
  const statusFile = path.join(ROOT_DIR, `test_run_save_painted_${Date.now()}_${Math.random().toString(36).slice(2)}_status.txt`)
  const productsOutFile = path.join(ROOT_DIR, `test_run_save_painted_${Date.now()}_${Math.random().toString(36).slice(2)}_prods.json`)

  let sessionPhp = ''
  if (session) {
    if (session.id !== undefined) sessionPhp += `$_SESSION['user_id'] = ${JSON.stringify(session.id)};\n`
    if (session.role !== undefined) sessionPhp += `$_SESSION['user_role'] = ${JSON.stringify(session.role)};\n`
    if (session.seller_status !== undefined) sessionPhp += `$_SESSION['seller_status'] = ${JSON.stringify(session.seller_status)};\n`
  }

  let bodyPhp = ''
  if (body !== null) {
    bodyPhp = `$GLOBALS['__JSON_BODY__'] = json_decode(${JSON.stringify(JSON.stringify(body))}, true);\n`
  }

  let postPhp = ''
  if (post !== null) {
    postPhp = `$_POST = json_decode(${JSON.stringify(JSON.stringify(post))}, true);\n`
  }

  let filesPhp = ''
  if (files !== null) {
    for (const [key, f] of Object.entries(files)) {
      filesPhp += `$_FILES[${JSON.stringify(key)}] = [
        'name' => ${JSON.stringify(f.name ?? 'painted.glb')},
        'type' => ${JSON.stringify(f.type ?? 'model/gltf-binary')},
        'tmp_name' => ${JSON.stringify((f.tmp_name ?? '').replace(/\\/g, '/'))},
        'error' => ${f.error ?? 'UPLOAD_ERR_OK'},
        'size' => ${f.size ?? 1024},
      ];\n`
    }
  }

  const productsToUse = customProducts || SEED_PRODUCTS

  const code = `<?php
${PHP_MOCK_PDO_DEFINITION}

$_SERVER['REQUEST_METHOD'] = '${method}';
require_once '${path.join(ROOT_DIR, 'api', 'config.php').replace(/\\/g, '/')}';

$pdo = new MockPDO();
$pdo->users = json_decode(${JSON.stringify(JSON.stringify(SEED_USERS))}, true);
$pdo->sellerProfiles = json_decode(${JSON.stringify(JSON.stringify(SEED_PROFILES))}, true);
$pdo->products = json_decode(${JSON.stringify(JSON.stringify(productsToUse))}, true);
$GLOBALS['__TEST_PDO__'] = $pdo;

${sessionPhp}
${bodyPhp}
${postPhp}
${filesPhp}

register_shutdown_function(function() use ($pdo) {
    $code = http_response_code();
    file_put_contents(${JSON.stringify(statusFile.replace(/\\/g, '/'))}, (string)($code === false ? 200 : $code));
    file_put_contents(${JSON.stringify(productsOutFile.replace(/\\/g, '/'))}, json_encode($pdo->products));
});

require '${SAVE_PAINTED_PATH.replace(/\\/g, '/')}';
`

  fs.writeFileSync(runner, code, 'utf8')
  try {
    let output = ''
    try {
      output = execSync(`php "${runner}"`, { encoding: 'utf8' })
    } catch (e) {
      output = e.stdout || ''
    }

    let json = null
    try {
      json = JSON.parse(output)
    } catch {
      json = { rawOutput: output }
    }

    const statusCode = fs.existsSync(statusFile)
      ? parseInt(fs.readFileSync(statusFile, 'utf8'), 10)
      : 200

    let finalProducts = []
    if (fs.existsSync(productsOutFile)) {
      try {
        finalProducts = JSON.parse(fs.readFileSync(productsOutFile, 'utf8'))
      } catch {}
    }

    return { json, statusCode, raw: output, products: finalProducts }
  } finally {
    if (fs.existsSync(runner)) fs.unlinkSync(runner)
    if (fs.existsSync(statusFile)) fs.unlinkSync(statusFile)
    if (fs.existsSync(productsOutFile)) fs.unlinkSync(productsOutFile)
  }
}

test('api/products/save-painted-parts.php: file exists, valid syntax, zero physical SQL DELETE statements', () => {
  assert.ok(fs.existsSync(SAVE_PAINTED_PATH), 'api/products/save-painted-parts.php must exist')
  const content = fs.readFileSync(SAVE_PAINTED_PATH, 'utf8')
  assert.doesNotMatch(content, /\bDELETE\s+FROM\b/i, 'Strictly zero physical SQL DELETE statements')

  const syntax = execSync(`php -l "${SAVE_PAINTED_PATH}"`, { encoding: 'utf8' })
  assert.match(syntax, /No syntax errors detected/i)
})

test('api/products/save-painted-parts.php: enforces POST method (rejects GET with 405)', () => {
  const res = runPhpSavePainted({ method: 'GET' })
  assert.equal(res.statusCode, 405)
  assert.match(res.json?.error || '', /Method not allowed/i)
})

test('api/products/save-painted-parts.php: rejects unauthenticated user with 401/403', () => {
  const res = runPhpSavePainted({
    session: null,
    body: { productId: 'KCP-2026-0001' },
  })
  assert.ok(res.statusCode === 401 || res.statusCode === 403, `Expected 401/403, got ${res.statusCode}`)
  assert.match(res.json?.error || '', /privileges required|authentication required/i)
})

test('api/products/save-painted-parts.php: rejects non-seller customer user with 403', () => {
  const res = runPhpSavePainted({
    session: { id: 30, role: 'customer' },
    body: { productId: 'KCP-2026-0001' },
  })
  assert.equal(res.statusCode, 403)
  assert.match(res.json?.error || '', /Seller privileges required/i)
})

test('api/products/save-painted-parts.php: rejects missing productId with 400', () => {
  const res = runPhpSavePainted({
    body: {
      glbData: Buffer.from('glTFtestmockcontent').toString('base64'),
      meshMap: { Upper: 'UpperMaterial', Midsole: 'MidsoleMaterial' },
    },
  })
  assert.equal(res.statusCode, 400)
  assert.match(res.json?.error || '', /Product ID is required/i)
})

test('api/products/save-painted-parts.php: rejects nonexistent or deleted product with 404', () => {
  const res = runPhpSavePainted({
    body: {
      productId: 'KCP-NON-EXISTENT',
      glbData: Buffer.from('glTFtestmockcontent').toString('base64'),
      meshMap: { Upper: 'UpperMaterial', Midsole: 'MidsoleMaterial' },
    },
  })
  assert.equal(res.statusCode, 404)
  assert.match(res.json?.error || '', /Product not found/i)
})

test('api/products/save-painted-parts.php: rejects product belonging to another seller with 403 or 404', () => {
  // Seller 10 attempts to update Seller 20's product KCP-2026-0002
  const res = runPhpSavePainted({
    session: { id: 10, role: 'seller', seller_status: 'approved' },
    body: {
      productId: 'KCP-2026-0002',
      glbData: Buffer.from('glTFtestmockcontent').toString('base64'),
      meshMap: { Upper: 'UpperMaterial', Midsole: 'MidsoleMaterial' },
    },
  })
  assert.ok(res.statusCode === 403 || res.statusCode === 404, `Expected 403/404, got ${res.statusCode}`)
  assert.match(res.json?.error || '', /access denied|not found/i)
})

test('api/products/save-painted-parts.php: rejects missing GLB data or file with 400', () => {
  const res = runPhpSavePainted({
    body: {
      productId: 'KCP-2026-0001',
      meshMap: { Upper: 'UpperMaterial', Midsole: 'MidsoleMaterial' },
    },
  })
  assert.equal(res.statusCode, 400)
  assert.match(res.json?.error || '', /GLB.*required/i)
})

test('api/products/save-painted-parts.php: rejects meshMap with fewer than 2 distinct parts with 422', () => {
  // Case A: empty meshMap object
  const resEmpty = runPhpSavePainted({
    body: {
      productId: 'KCP-2026-0001',
      glbData: Buffer.from('glTFtestmockcontent').toString('base64'),
      meshMap: {},
    },
  })
  assert.equal(resEmpty.statusCode, 422)
  assert.match(resEmpty.json?.error || '', /At least 2 customizable parts must be defined/i)

  // Case B: single part in meshMap
  const resSingle = runPhpSavePainted({
    body: {
      productId: 'KCP-2026-0001',
      glbData: Buffer.from('glTFtestmockcontent').toString('base64'),
      meshMap: { Upper: 'UpperMaterial' },
    },
  })
  assert.equal(resSingle.statusCode, 422)
  assert.match(resSingle.json?.error || '', /At least 2 customizable parts must be defined/i)
})

test('api/products/save-painted-parts.php: successfully saves via multipart upload with model backup and companion PNG', () => {
  const docRoot = ROOT_DIR
  const baseDir = fs.existsSync(path.join(docRoot, 'public')) ? path.join(docRoot, 'public') : docRoot
  const aiDir = path.join(baseDir, 'models', 'seller-ai')
  if (!fs.existsSync(aiDir)) {
    fs.mkdirSync(aiDir, { recursive: true })
  }

  // Create an original mock GLB file on disk to test backup creation
  const originalShoeFile = path.join(aiDir, 'ai_shoe_0001.glb')
  fs.writeFileSync(originalShoeFile, 'glTF_ORIGINAL_BINARY_MOCK')

  // Create a temporary painted GLB file to simulate upload
  const tmpUploadFile = path.join(ROOT_DIR, `temp_painted_upload_${Date.now()}.glb`)
  fs.writeFileSync(tmpUploadFile, 'glTF_NEW_PAINTED_BINARY_MOCK')

  try {
    const res = runPhpSavePainted({
      session: { id: 10, role: 'seller', seller_status: 'approved' },
      post: {
        productId: 'KCP-2026-0001',
        meshMap: JSON.stringify({ Upper: 'UpperMaterial', Midsole: 'MidsoleMaterial', Outsole: 'OutsoleMaterial' }),
        partColors: JSON.stringify({ Upper: '#b94d27', Midsole: '#ffffff', Outsole: '#202220' }),
      },
      files: {
        glbFile: {
          name: 'shoe_painted.glb',
          type: 'model/gltf-binary',
          tmp_name: tmpUploadFile,
          size: 26,
        },
      },
    })

    assert.equal(res.statusCode, 200, `Expected 200 OK, got ${res.statusCode}: ${JSON.stringify(res.json)}`)
    assert.equal(res.json.success, true)
    assert.match(res.json.glbPath, /^\/models\/seller-uploads\/[a-f0-9]+_painted\.glb$/i)
    assert.deepEqual(res.json.meshMap, { Upper: 'UpperMaterial', Midsole: 'MidsoleMaterial', Outsole: 'OutsoleMaterial' })
    assert.deepEqual(res.json.partColors, { Upper: '#b94d27', Midsole: '#ffffff', Outsole: '#202220' })
    assert.equal(res.json.originalGlbPath, '/models/seller-ai/ai_shoe_0001_original.glb')

    // 1. Verify backup file was created
    const backupFile = path.join(aiDir, 'ai_shoe_0001_original.glb')
    assert.ok(fs.existsSync(backupFile), 'Original backup file _original.glb must exist on disk')
    assert.equal(fs.readFileSync(backupFile, 'utf8'), 'glTF_ORIGINAL_BINARY_MOCK')

    // 2. Verify new painted GLB was saved on disk
    const savedGlbPath = path.join(baseDir, res.json.glbPath.replace(/^\//, ''))
    assert.ok(fs.existsSync(savedGlbPath), `Saved GLB must exist at ${savedGlbPath}`)
    assert.equal(fs.readFileSync(savedGlbPath, 'utf8'), 'glTF_NEW_PAINTED_BINARY_MOCK')

    // 3. Verify companion .png copy exists
    const companionPngPath = savedGlbPath.replace(/\.glb$/, '.png')
    assert.ok(fs.existsSync(companionPngPath), `Companion .png must exist at ${companionPngPath}`)

    // 4. Clean up created mock files
    if (fs.existsSync(savedGlbPath)) fs.unlinkSync(savedGlbPath)
    if (fs.existsSync(companionPngPath)) fs.unlinkSync(companionPngPath)
    if (fs.existsSync(backupFile)) fs.unlinkSync(backupFile)
    const backupPng = backupFile.replace(/\.glb$/, '.png')
    if (fs.existsSync(backupPng)) fs.unlinkSync(backupPng)

    // 5. Verify database update preserved status = 'draft'
    const updatedProd = res.products.find(p => p.id === 'KCP-2026-0001')
    assert.ok(updatedProd, 'Product KCP-2026-0001 must be updated in database')
    assert.equal(updatedProd.status, 'draft', 'Must preserve draft status')
    assert.equal(updatedProd.glb_path, res.json.glbPath)
  } finally {
    if (fs.existsSync(originalShoeFile)) fs.unlinkSync(originalShoeFile)
    if (fs.existsSync(tmpUploadFile)) fs.unlinkSync(tmpUploadFile)
  }
})

test('api/products/save-painted-parts.php: successfully saves via JSON base64 body and preserves existing backup', () => {
  const docRoot = ROOT_DIR
  const baseDir = fs.existsSync(path.join(docRoot, 'public')) ? path.join(docRoot, 'public') : docRoot
  const aiDir = path.join(baseDir, 'models', 'seller-ai')
  if (!fs.existsSync(aiDir)) {
    fs.mkdirSync(aiDir, { recursive: true })
  }

  // Pre-existing backup should NOT be overwritten
  const backupFile = path.join(aiDir, 'ai_shoe_0001_original.glb')
  fs.writeFileSync(backupFile, 'EXISTING_PRESERVED_BACKUP')

  const base64Glb = Buffer.from('glTF_BASE64_SAVED_CONTENT').toString('base64')

  try {
    const res = runPhpSavePainted({
      session: { id: 10, role: 'seller', seller_status: 'approved' },
      body: {
        productId: 'KCP-2026-0001',
        glbData: base64Glb,
        meshMap: { Upper: 'UpperMaterial', Midsole: 'MidsoleMaterial' },
        partColors: { Upper: '#ff0000', Midsole: '#00ff00' },
      },
    })

    assert.equal(res.statusCode, 200)
    assert.equal(res.json.success, true)
    assert.match(res.json.glbPath, /^\/models\/seller-uploads\/[a-f0-9]+_painted\.glb$/i)
    assert.equal(res.json.originalGlbPath, '/models/seller-ai/ai_shoe_0001_original.glb')

    // Verify existing backup was untouched
    assert.equal(fs.readFileSync(backupFile, 'utf8'), 'EXISTING_PRESERVED_BACKUP')

    const savedGlbPath = path.join(baseDir, res.json.glbPath.replace(/^\//, ''))
    assert.ok(fs.existsSync(savedGlbPath))
    assert.equal(fs.readFileSync(savedGlbPath, 'utf8'), 'glTF_BASE64_SAVED_CONTENT')

    const companionPngPath = savedGlbPath.replace(/\.glb$/, '.png')
    assert.ok(fs.existsSync(companionPngPath))

    if (fs.existsSync(savedGlbPath)) fs.unlinkSync(savedGlbPath)
    if (fs.existsSync(companionPngPath)) fs.unlinkSync(companionPngPath)
  } finally {
    if (fs.existsSync(backupFile)) fs.unlinkSync(backupFile)
  }
})
