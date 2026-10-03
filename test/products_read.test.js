import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const ROOT_DIR = path.resolve(import.meta.dirname, '..')
const PRODUCTS_DIR = path.join(ROOT_DIR, 'api', 'products')
const LIST_PATH = path.join(PRODUCTS_DIR, 'list.php')
const DETAIL_PATH = path.join(PRODUCTS_DIR, 'detail.php')

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

            // Helper to get store name for a seller_id
            $getStoreName = function($sellerId) {
                foreach ($this->sellerProfiles as $sp) {
                    if ((int)$sp['user_id'] === (int)$sellerId) {
                        return $sp['store_name'] ?? null;
                    }
                }
                return null;
            };

            // 3. Products detail query: WHERE p.id = ?
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

            // 4. Products list query:
            if (stripos($query, 'FROM products') !== false) {
                $rows = [];
                // Check if filtering by seller_id
                if (stripos($query, 'p.seller_id = ?') !== false) {
                    $sellerId = (int)($params[0] ?? 0);
                    foreach ($this->products as $p) {
                        if ((int)$p['seller_id'] === $sellerId && empty($p['deleted_at']) && empty($p['permanently_deleted'])) {
                            $row = $p;
                            $row['store_name'] = $getStoreName($p['seller_id']);
                            $rows[] = $row;
                        }
                    }
                    return $rows;
                }

                // Check if filtering by status = 'approved'
                if (stripos($query, "p.status = 'approved'") !== false) {
                    foreach ($this->products as $p) {
                        if ($p['status'] === 'approved' && empty($p['deleted_at']) && empty($p['permanently_deleted'])) {
                            $row = $p;
                            $row['store_name'] = $getStoreName($p['seller_id']);
                            $rows[] = $row;
                        }
                    }
                    return $rows;
                }

                // Owner query (no seller_id and no status filter)
                foreach ($this->products as $p) {
                    if (empty($p['deleted_at']) && empty($p['permanently_deleted'])) {
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

const SEED_USERS = [
  { id: 1, name: 'Admin Owner', email: 'admin@kickcraft.com', role: 'owner', deleted_at: null, permanently_deleted: 0 },
  { id: 10, name: 'Seller One', email: 'seller1@example.com', role: 'seller', deleted_at: null, permanently_deleted: 0 },
  { id: 20, name: 'Seller Two', email: 'seller2@example.com', role: 'seller', deleted_at: null, permanently_deleted: 0 },
]

const SEED_PROFILES = [
  { id: 1, user_id: 10, store_name: 'SoleCraft Studio', status: 'approved', deleted_at: null, permanently_deleted: 0 },
  { id: 2, user_id: 20, store_name: 'Urban Kicks', status: 'approved', deleted_at: null, permanently_deleted: 0 },
]

const SEED_PRODUCTS = [
  {
    id: 'KCP-2026-0001',
    seller_id: 10,
    name: 'KickCraft Wave Runner',
    description: 'High performance custom runner',
    price: 5490,
    stock: 15,
    creation_method: 'upload',
    glb_path: '/models/seller-uploads/runner.glb',
    thumbnail_path: '/images/thumbnails/runner.png',
    base_shoe_id: null,
    part_colors: JSON.stringify({ upper: { name: 'Crimson', value: '#e11d48' } }),
    charm_id: 'star',
    mesh_map: JSON.stringify({ upper: 'Mesh_Upper' }),
    sizes_available: JSON.stringify([40, 41, 42, 43]),
    status: 'approved',
    admin_notes: 'Looks great',
    approved_at: '2026-10-01 10:00:00',
    created_at: '2026-10-01 09:00:00',
    updated_at: '2026-10-01 10:00:00',
    deleted_at: null,
    permanently_deleted: 0,
  },
  {
    id: 'KCP-2026-0002',
    seller_id: 10,
    name: 'Seller 10 Draft Sneaker',
    description: 'Work in progress design',
    price: 4990,
    stock: 5,
    creation_method: 'template',
    glb_path: null,
    thumbnail_path: null,
    base_shoe_id: 'kickcraft-one',
    part_colors: JSON.stringify({ upper: { name: 'Noir', value: '#111827' } }),
    charm_id: 'none',
    mesh_map: null,
    sizes_available: JSON.stringify([39, 40, 41]),
    status: 'draft',
    admin_notes: null,
    approved_at: null,
    created_at: '2026-10-02 08:00:00',
    updated_at: '2026-10-02 08:00:00',
    deleted_at: null,
    permanently_deleted: 0,
  },
  {
    id: 'KCP-2026-0003',
    seller_id: 20,
    name: 'Seller 20 Pending High-Top',
    description: 'Awaiting moderation review',
    price: 6200,
    stock: 8,
    creation_method: 'ai_generate',
    glb_path: '/models/seller-uploads/ai-shoe.glb',
    thumbnail_path: '/images/thumbnails/ai-shoe.png',
    base_shoe_id: null,
    part_colors: JSON.stringify({ upper: { name: 'White', value: '#ffffff' } }),
    charm_id: 'lightning',
    mesh_map: JSON.stringify({ upper: 'Mesh_Upper_AI' }),
    sizes_available: JSON.stringify([41, 42, 43, 44]),
    status: 'pending',
    admin_notes: null,
    approved_at: null,
    created_at: '2026-10-02 11:00:00',
    updated_at: '2026-10-02 11:00:00',
    deleted_at: null,
    permanently_deleted: 0,
  },
  {
    id: 'KCP-2026-0004',
    seller_id: 20,
    name: 'Seller 20 Approved Low',
    description: 'Streetwear low-top sneaker',
    price: 3990,
    stock: 20,
    creation_method: 'upload',
    glb_path: '/models/seller-uploads/street.glb',
    thumbnail_path: '/images/thumbnails/street.png',
    base_shoe_id: null,
    part_colors: JSON.stringify({ outsole: { name: 'Gum', value: '#b48a52' } }),
    charm_id: 'star',
    mesh_map: JSON.stringify({ outsole: 'Mesh_Outsole' }),
    sizes_available: JSON.stringify([38, 39, 40, 41, 42]),
    status: 'approved',
    admin_notes: 'Approved for public listing',
    approved_at: '2026-10-02 14:00:00',
    created_at: '2026-10-02 13:00:00',
    updated_at: '2026-10-02 14:00:00',
    deleted_at: null,
    permanently_deleted: 0,
  },
  {
    id: 'KCP-2026-0005',
    seller_id: 10,
    name: 'Deleted Shoe',
    description: 'Archived product',
    price: 3500,
    stock: 0,
    creation_method: 'upload',
    glb_path: null,
    thumbnail_path: null,
    base_shoe_id: null,
    part_colors: null,
    charm_id: 'none',
    mesh_map: null,
    sizes_available: '[]',
    status: 'approved',
    admin_notes: null,
    approved_at: null,
    created_at: '2026-09-01 10:00:00',
    updated_at: '2026-09-01 10:00:00',
    deleted_at: '2026-10-01 12:00:00',
    permanently_deleted: 0,
  },
  {
    id: 'KCP-2026-0006',
    seller_id: 10,
    name: 'Permanently Deleted Shoe',
    description: 'Purged product',
    price: 3500,
    stock: 0,
    creation_method: 'upload',
    glb_path: null,
    thumbnail_path: null,
    base_shoe_id: null,
    part_colors: null,
    charm_id: 'none',
    mesh_map: null,
    sizes_available: '[]',
    status: 'approved',
    admin_notes: null,
    approved_at: null,
    created_at: '2026-09-01 10:00:00',
    updated_at: '2026-09-01 10:00:00',
    deleted_at: null,
    permanently_deleted: 1,
  },
]

function makeRunnerScript({ endpointFile, session = null, getParams = {} }) {
  const getArrayPhp = Object.entries(getParams)
    .map(([k, v]) => `$_GET['${k}'] = '${String(v).replace(/'/g, "\\'")}';`)
    .join('\n')

  let sessionPhp = ''
  if (session) {
    sessionPhp = `
$_SESSION['user_id'] = ${session.id};
$_SESSION['user_role'] = '${session.role}';
`
  }

  return `<?php
${PHP_MOCK_PDO_DEFINITION}

$_SERVER['REQUEST_METHOD'] = 'GET';
${getArrayPhp}

require_once '${path.join(ROOT_DIR, 'api', 'config.php').replace(/\\/g, '/')}';

$pdo = new MockPDO();
$pdo->users = json_decode(${JSON.stringify(JSON.stringify(SEED_USERS))}, true);
$pdo->sellerProfiles = json_decode(${JSON.stringify(JSON.stringify(SEED_PROFILES))}, true);
$pdo->products = json_decode(${JSON.stringify(JSON.stringify(SEED_PRODUCTS))}, true);
$GLOBALS['__TEST_PDO__'] = $pdo;

${sessionPhp}

require '${endpointFile.replace(/\\/g, '/')}';
`
}

test('Product read endpoint files exist and pass syntax check', () => {
  assert.ok(fs.existsSync(LIST_PATH), 'api/products/list.php must exist')
  assert.ok(fs.existsSync(DETAIL_PATH), 'api/products/detail.php must exist')

  const listSyntax = execSync(`php -l "${LIST_PATH}"`, { encoding: 'utf8' })
  assert.match(listSyntax, /No syntax errors detected/i)

  const detailSyntax = execSync(`php -l "${DETAIL_PATH}"`, { encoding: 'utf8' })
  assert.match(detailSyntax, /No syntax errors detected/i)
})

test('Product read endpoint files contain zero physical DELETE statements', () => {
  for (const filePath of [LIST_PATH, DETAIL_PATH]) {
    const code = fs.readFileSync(filePath, 'utf8')
    assert.doesNotMatch(
      code,
      /\bDELETE\s+FROM\b/i,
      `Physical DELETE FROM found in ${filePath} - read endpoints must not contain DELETE statements`
    )
  }
})

test('Product read endpoint files enforce config, db, helpers, and prepared statements', () => {
  for (const filePath of [LIST_PATH, DETAIL_PATH]) {
    const code = fs.readFileSync(filePath, 'utf8')
    assert.match(code, /config\.php/i, `${filePath} must require config.php`)
    assert.match(code, /db\.php/i, `${filePath} must require db.php`)
    assert.match(code, /helpers\.php/i, `${filePath} must require helpers.php`)
    assert.match(code, /\$db->prepare\s*\(/i, `${filePath} must use PDO prepared statements`)
    assert.doesNotMatch(code, /\$db->query\s*\(/i, `${filePath} must not use unparameterized $db->query`)
  }
})

test('Product read endpoint files enforce GET HTTP method', () => {
  const listCode = fs.readFileSync(LIST_PATH, 'utf8')
  assert.match(listCode, /requireMethod\s*\(\s*['"]GET['"]\s*\)/i, 'list.php must enforce GET')

  const detailCode = fs.readFileSync(DETAIL_PATH, 'utf8')
  assert.match(detailCode, /requireMethod\s*\(\s*['"]GET['"]\s*\)/i, 'detail.php must enforce GET')
})

test('runtime: Product read endpoints reject invalid HTTP methods with 405', () => {
  for (const file of [LIST_PATH, DETAIL_PATH]) {
    for (const method of ['POST', 'PUT', 'DELETE']) {
      const runner = path.join(ROOT_DIR, `test_read_method_${method}_${path.basename(file, '.php')}.php`)
      fs.writeFileSync(
        runner,
        `<?php
$_SERVER['REQUEST_METHOD'] = '${method}';
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
  }
})

test('runtime: list.php unauthenticated guest returns only approved, non-deleted products with store_name and decoded JSON', () => {
  const runner = path.join(ROOT_DIR, 'test_list_guest.php')
  fs.writeFileSync(
    runner,
    makeRunnerScript({ endpointFile: LIST_PATH, session: null })
  )

  try {
    const output = execSync(`php "${runner}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.equal(json.success, true)
    assert.ok(Array.isArray(json.products), 'products must be an array')
    assert.equal(json.products.length, 2, 'Guest should only see the 2 approved products')

    const ids = json.products.map(p => p.id)
    assert.ok(ids.includes('KCP-2026-0001'), 'Includes approved product KCP-2026-0001')
    assert.ok(ids.includes('KCP-2026-0004'), 'Includes approved product KCP-2026-0004')
    assert.ok(!ids.includes('KCP-2026-0002'), 'Must not include draft product')
    assert.ok(!ids.includes('KCP-2026-0003'), 'Must not include pending product')
    assert.ok(!ids.includes('KCP-2026-0005'), 'Must not include soft-deleted product')
    assert.ok(!ids.includes('KCP-2026-0006'), 'Must not include permanently deleted product')

    const p1 = json.products.find(p => p.id === 'KCP-2026-0001')
    assert.equal(p1.store_name || p1.storeName, 'SoleCraft Studio', 'Left join must include store_name')
    assert.deepEqual(p1.mesh_map || p1.meshMap, { upper: 'Mesh_Upper' }, 'mesh_map must be decoded')
    assert.deepEqual(p1.part_colors || p1.partColors, { upper: { name: 'Crimson', value: '#e11d48' } }, 'part_colors must be decoded')
    assert.deepEqual(p1.sizes_available || p1.sizesAvailable, [40, 41, 42, 43], 'sizes_available must be decoded')

    const p4 = json.products.find(p => p.id === 'KCP-2026-0004')
    assert.equal(p4.store_name || p4.storeName, 'Urban Kicks', 'Left join must include store_name')
  } finally {
    if (fs.existsSync(runner)) fs.unlinkSync(runner)
  }
})

test('runtime: list.php seller returns only products belonging to that seller (including drafts/pending)', () => {
  const runner = path.join(ROOT_DIR, 'test_list_seller.php')
  fs.writeFileSync(
    runner,
    makeRunnerScript({ endpointFile: LIST_PATH, session: { id: 10, role: 'seller' } })
  )

  try {
    const output = execSync(`php "${runner}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.equal(json.success, true)
    assert.ok(Array.isArray(json.products))
    assert.equal(json.products.length, 2, 'Seller 10 should see their 2 non-deleted products')

    const ids = json.products.map(p => p.id)
    assert.ok(ids.includes('KCP-2026-0001'), 'Includes seller 10 approved product')
    assert.ok(ids.includes('KCP-2026-0002'), 'Includes seller 10 draft product')
    assert.ok(!ids.includes('KCP-2026-0003'), 'Must not include seller 20 pending product')
    assert.ok(!ids.includes('KCP-2026-0004'), 'Must not include seller 20 approved product')
    assert.ok(!ids.includes('KCP-2026-0005'), 'Must not include soft-deleted product')
  } finally {
    if (fs.existsSync(runner)) fs.unlinkSync(runner)
  }
})

test('runtime: list.php owner returns all active products across all sellers', () => {
  const runner = path.join(ROOT_DIR, 'test_list_owner.php')
  fs.writeFileSync(
    runner,
    makeRunnerScript({ endpointFile: LIST_PATH, session: { id: 1, role: 'owner' } })
  )

  try {
    const output = execSync(`php "${runner}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.equal(json.success, true)
    assert.ok(Array.isArray(json.products))
    assert.equal(json.products.length, 4, 'Owner should see all 4 non-deleted products across all sellers')

    const ids = json.products.map(p => p.id)
    assert.ok(ids.includes('KCP-2026-0001'), 'Includes KCP-2026-0001')
    assert.ok(ids.includes('KCP-2026-0002'), 'Includes KCP-2026-0002')
    assert.ok(ids.includes('KCP-2026-0003'), 'Includes KCP-2026-0003')
    assert.ok(ids.includes('KCP-2026-0004'), 'Includes KCP-2026-0004')
    assert.ok(!ids.includes('KCP-2026-0005'), 'Must not include soft-deleted product')
    assert.ok(!ids.includes('KCP-2026-0006'), 'Must not include permanently deleted product')
  } finally {
    if (fs.existsSync(runner)) fs.unlinkSync(runner)
  }
})

test('runtime: detail.php rejects missing id with 400', () => {
  const runner = path.join(ROOT_DIR, 'test_detail_missing_id.php')
  fs.writeFileSync(
    runner,
    makeRunnerScript({ endpointFile: DETAIL_PATH, session: null, getParams: {} })
  )

  try {
    const output = execSync(`php "${runner}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.equal(json.error, 'Product ID required')
  } finally {
    if (fs.existsSync(runner)) fs.unlinkSync(runner)
  }
})

test('runtime: detail.php returns 404 for unknown or soft-deleted product', () => {
  // 1. Unknown product
  const runnerUnknown = path.join(ROOT_DIR, 'test_detail_unknown.php')
  fs.writeFileSync(
    runnerUnknown,
    makeRunnerScript({ endpointFile: DETAIL_PATH, session: null, getParams: { id: 'KCP-9999-9999' } })
  )
  try {
    const output = execSync(`php "${runnerUnknown}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.equal(json.error, 'Product not found')
  } finally {
    if (fs.existsSync(runnerUnknown)) fs.unlinkSync(runnerUnknown)
  }

  // 2. Soft-deleted product
  const runnerDeleted = path.join(ROOT_DIR, 'test_detail_deleted.php')
  fs.writeFileSync(
    runnerDeleted,
    makeRunnerScript({ endpointFile: DETAIL_PATH, session: null, getParams: { id: 'KCP-2026-0005' } })
  )
  try {
    const output = execSync(`php "${runnerDeleted}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.equal(json.error, 'Product not found')
  } finally {
    if (fs.existsSync(runnerDeleted)) fs.unlinkSync(runnerDeleted)
  }
})

test('runtime: detail.php allows guest to view approved product with decoded JSON and store_name', () => {
  const runner = path.join(ROOT_DIR, 'test_detail_guest_approved.php')
  fs.writeFileSync(
    runner,
    makeRunnerScript({ endpointFile: DETAIL_PATH, session: null, getParams: { id: 'KCP-2026-0001' } })
  )

  try {
    const output = execSync(`php "${runner}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.equal(json.success, true)
    assert.ok(json.product)
    assert.equal(json.product.id, 'KCP-2026-0001')
    assert.equal(json.product.status, 'approved')
    assert.equal(json.product.store_name || json.product.storeName, 'SoleCraft Studio')
    assert.deepEqual(json.product.mesh_map || json.product.meshMap, { upper: 'Mesh_Upper' })
    assert.deepEqual(json.product.part_colors || json.product.partColors, { upper: { name: 'Crimson', value: '#e11d48' } })
    assert.deepEqual(json.product.sizes_available || json.product.sizesAvailable, [40, 41, 42, 43])
  } finally {
    if (fs.existsSync(runner)) fs.unlinkSync(runner)
  }
})

test('runtime: detail.php blocks guest from viewing non-approved products with 404', () => {
  // Guest trying to view draft product KCP-2026-0002
  const runnerDraft = path.join(ROOT_DIR, 'test_detail_guest_draft.php')
  fs.writeFileSync(
    runnerDraft,
    makeRunnerScript({ endpointFile: DETAIL_PATH, session: null, getParams: { id: 'KCP-2026-0002' } })
  )
  try {
    const output = execSync(`php "${runnerDraft}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.equal(json.error, 'Product not found')
  } finally {
    if (fs.existsSync(runnerDraft)) fs.unlinkSync(runnerDraft)
  }

  // Guest trying to view pending product KCP-2026-0003
  const runnerPending = path.join(ROOT_DIR, 'test_detail_guest_pending.php')
  fs.writeFileSync(
    runnerPending,
    makeRunnerScript({ endpointFile: DETAIL_PATH, session: null, getParams: { id: 'KCP-2026-0003' } })
  )
  try {
    const output = execSync(`php "${runnerPending}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.equal(json.error, 'Product not found')
  } finally {
    if (fs.existsSync(runnerPending)) fs.unlinkSync(runnerPending)
  }
})

test('runtime: detail.php allows seller to view their own draft/pending product', () => {
  const runner = path.join(ROOT_DIR, 'test_detail_seller_own_draft.php')
  fs.writeFileSync(
    runner,
    makeRunnerScript({ endpointFile: DETAIL_PATH, session: { id: 10, role: 'seller' }, getParams: { id: 'KCP-2026-0002' } })
  )

  try {
    const output = execSync(`php "${runner}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.equal(json.success, true)
    assert.ok(json.product)
    assert.equal(json.product.id, 'KCP-2026-0002')
    assert.equal(json.product.status, 'draft')
    assert.equal(json.product.seller_id || json.product.sellerId, 10)
  } finally {
    if (fs.existsSync(runner)) fs.unlinkSync(runner)
  }
})

test('runtime: detail.php blocks seller from viewing another seller draft/pending product with 404', () => {
  // Seller 10 trying to view Seller 20's pending product KCP-2026-0003
  const runner = path.join(ROOT_DIR, 'test_detail_seller_other_pending.php')
  fs.writeFileSync(
    runner,
    makeRunnerScript({ endpointFile: DETAIL_PATH, session: { id: 10, role: 'seller' }, getParams: { id: 'KCP-2026-0003' } })
  )

  try {
    const output = execSync(`php "${runner}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.equal(json.error, 'Product not found')
  } finally {
    if (fs.existsSync(runner)) fs.unlinkSync(runner)
  }
})

test('runtime: detail.php allows owner to view any draft/pending product', () => {
  for (const id of ['KCP-2026-0002', 'KCP-2026-0003']) {
    const runner = path.join(ROOT_DIR, `test_detail_owner_${id}.php`)
    fs.writeFileSync(
      runner,
      makeRunnerScript({ endpointFile: DETAIL_PATH, session: { id: 1, role: 'owner' }, getParams: { id } })
    )

    try {
      const output = execSync(`php "${runner}"`, { encoding: 'utf8' })
      const json = JSON.parse(output)
      assert.equal(json.success, true)
      assert.ok(json.product)
      assert.equal(json.product.id, id)
    } finally {
      if (fs.existsSync(runner)) fs.unlinkSync(runner)
    }
  }
})
