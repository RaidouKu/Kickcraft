import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const ROOT_DIR = path.resolve(import.meta.dirname, '..')
const SHOES_DIR = path.join(ROOT_DIR, 'api', 'shoes')

const REQUIRED_FILES = [
  'list.php',
  'create.php',
  'update.php',
  'restock.php',
  'delete.php',
  'restore.php',
  'upload.php',
]

test('all shoe catalog endpoint files exist', () => {
  for (const file of REQUIRED_FILES) {
    const filePath = path.join(SHOES_DIR, file)
    assert.ok(fs.existsSync(filePath), `Expected endpoint file to exist: api/shoes/${file}`)
  }
})

test('shoe endpoints are syntactically valid PHP files', () => {
  for (const file of REQUIRED_FILES) {
    const filePath = path.join(SHOES_DIR, file)
    assert.ok(fs.existsSync(filePath), `api/shoes/${file} must exist before checking syntax`)
    const output = execSync(`php -l "${filePath}"`, { encoding: 'utf8' })
    assert.match(output, /No syntax errors detected/i, `Syntax error in ${file}`)
  }
})

test('zero physical DELETE FROM statements in api/shoes/', () => {
  for (const file of REQUIRED_FILES) {
    const filePath = path.join(SHOES_DIR, file)
    if (!fs.existsSync(filePath)) continue
    const code = fs.readFileSync(filePath, 'utf8')
    assert.doesNotMatch(
      code,
      /\bDELETE\s+FROM\b/i,
      `Physical DELETE FROM found in api/shoes/${file} - must use soft/hard delete flags instead`
    )
  }
})

test('all shoe endpoints require config, db, and helpers', () => {
  for (const file of REQUIRED_FILES) {
    const filePath = path.join(SHOES_DIR, file)
    if (!fs.existsSync(filePath)) continue
    const code = fs.readFileSync(filePath, 'utf8')
    assert.match(code, /config\.php/i, `${file} must include config.php`)
    assert.match(code, /db\.php/i, `${file} must include db.php`)
    assert.match(code, /helpers\.php/i, `${file} must include helpers.php`)
  }
})

test('list.php is public, enforces GET, decodes JSON, and handles include_archived for owners', () => {
  const filePath = path.join(SHOES_DIR, 'list.php')
  assert.ok(fs.existsSync(filePath), 'list.php must exist')
  const code = fs.readFileSync(filePath, 'utf8')

  assert.match(code, /requireMethod\s*\(\s*['"]GET['"]\s*\)/i, 'Must enforce GET method')
  assert.doesNotMatch(code, /requireAdmin\s*\(/i, 'list.php is a public endpoint and must not requireAdmin unconditionally')
  assert.doesNotMatch(code, /requireAuth\s*\(/i, 'list.php is a public endpoint and must not requireAuth unconditionally')
  assert.match(code, /include_archived/i, 'Must check include_archived parameter')
  assert.match(code, /\$_SESSION\[['"]user_role['"]\]/, 'Must verify owner role for archived shoes')
  assert.match(code, /deleted_at\s+IS\s+NULL/i, 'Must filter out deleted shoes for public catalog')
  assert.match(code, /permanently_deleted\s*=\s*0/i, 'Must filter out permanently deleted shoes')
  assert.match(code, /json_decode\s*\(/i, 'Must decode JSON columns into PHP arrays')
  assert.match(code, /prepare\s*\(/i, 'Must use PDO prepare')
  assert.match(code, /formattedPrice/i, 'Must format price for frontend')
  assert.match(code, /shoes/i, 'Must return shoes key')
})

test('create.php enforces POST, requireAdmin, prepared statements, and JSON encoding', () => {
  const filePath = path.join(SHOES_DIR, 'create.php')
  assert.ok(fs.existsSync(filePath), 'create.php must exist')
  const code = fs.readFileSync(filePath, 'utf8')

  assert.match(code, /requireMethod\s*\(\s*['"]POST['"]\s*\)/i, 'Must enforce POST method')
  assert.match(code, /requireAdmin\s*\(\s*\)/i, 'Must require owner admin privileges')
  assert.match(code, /getJsonBody\s*\(\s*\)/i, 'Must parse JSON body')
  assert.match(code, /prepare\s*\(/i, 'Must use PDO prepare')
  assert.match(code, /INSERT\s+INTO\s+shoes/i, 'Must insert into shoes table')
  assert.match(code, /json_encode\s*\(/i, 'Must encode JSON columns')
  assert.match(code, /isLocalAssetPath\s*\(/i, 'Must accept only local model and thumbnail paths')
  assert.match(code, /201/, 'Must respond with 201 Created')
})

test('update.php enforces POST, requireAdmin, prepared statements, and guards permanently_deleted', () => {
  const filePath = path.join(SHOES_DIR, 'update.php')
  assert.ok(fs.existsSync(filePath), 'update.php must exist')
  const code = fs.readFileSync(filePath, 'utf8')

  assert.match(code, /requireMethod\s*\(\s*['"]POST['"]\s*\)/i, 'Must enforce POST method')
  assert.match(code, /requireAdmin\s*\(\s*\)/i, 'Must require owner admin privileges')
  assert.match(code, /getJsonBody\s*\(\s*\)/i, 'Must parse JSON body')
  assert.match(code, /prepare\s*\(/i, 'Must use PDO prepare')
  assert.match(code, /UPDATE\s+shoes/i, 'Must update shoes table')
  assert.match(code, /permanently_deleted\s*=\s*0/i, 'Must prevent updating permanently deleted shoes')
  assert.match(code, /isLocalAssetPath\s*\(/i, 'Must validate updated asset paths')
})

test('restock.php enforces POST, requireAdmin, amount validation, and status transition', () => {
  const filePath = path.join(SHOES_DIR, 'restock.php')
  assert.ok(fs.existsSync(filePath), 'restock.php must exist')
  const code = fs.readFileSync(filePath, 'utf8')

  assert.match(code, /requireMethod\s*\(\s*['"]POST['"]\s*\)/i, 'Must enforce POST method')
  assert.match(code, /requireAdmin\s*\(\s*\)/i, 'Must require owner admin privileges')
  assert.match(code, /prepare\s*\(/i, 'Must use PDO prepare')
  assert.match(code, /stock\s*=\s*stock\s*\+\s*\?/i, 'Must increment stock using prepared parameter')
  assert.match(code, /out_of_stock/i, 'Must handle out_of_stock status transition')
  assert.match(code, /permanently_deleted\s*=\s*0/i, 'Must guard permanently_deleted = 0')
})

test('delete.php enforces POST, requireAdmin, and supports soft and hard deletion without DELETE FROM', () => {
  const filePath = path.join(SHOES_DIR, 'delete.php')
  assert.ok(fs.existsSync(filePath), 'delete.php must exist')
  const code = fs.readFileSync(filePath, 'utf8')

  assert.match(code, /requireMethod\s*\(\s*['"]POST['"]\s*\)/i, 'Must enforce POST method')
  assert.match(code, /requireAdmin\s*\(\s*\)/i, 'Must require owner admin privileges')
  assert.match(code, /deleted_at\s*=\s*NOW\(\)/i, 'Must set deleted_at = NOW()')
  assert.match(code, /permanently_deleted\s*=\s*1/i, 'Must set permanently_deleted = 1 on hard delete')
  assert.match(code, /prepare\s*\(/i, 'Must use PDO prepare')
  assert.doesNotMatch(code, /\bDELETE\s+FROM\b/i, 'Must never use physical DELETE FROM')
})

test('restore.php enforces POST, requireAdmin, and clears deleted_at for non-permanent shoes', () => {
  const filePath = path.join(SHOES_DIR, 'restore.php')
  assert.ok(fs.existsSync(filePath), 'restore.php must exist')
  const code = fs.readFileSync(filePath, 'utf8')

  assert.match(code, /requireMethod\s*\(\s*['"]POST['"]\s*\)/i, 'Must enforce POST method')
  assert.match(code, /requireAdmin\s*\(\s*\)/i, 'Must require owner admin privileges')
  assert.match(code, /deleted_at\s*=\s*NULL/i, 'Must clear deleted_at timestamp')
  assert.match(code, /permanently_deleted\s*=\s*0/i, 'Must guard against restoring permanently deleted shoes')
  assert.match(code, /prepare\s*\(/i, 'Must use PDO prepare')
  assert.doesNotMatch(code, /\bDELETE\s+FROM\b/i, 'Must never use physical DELETE FROM')
})

test('runtime: list.php rejects POST method with 405', () => {
  if (!fs.existsSync(path.join(SHOES_DIR, 'list.php'))) return
  const runnerScript = path.join(SHOES_DIR, 'test_list_method.php')
  fs.writeFileSync(
    runnerScript,
    `<?php
$_SERVER['REQUEST_METHOD'] = 'POST';
require __DIR__ . '/list.php';
`
  )
  try {
    const output = execSync(`php "${runnerScript}"`, { encoding: 'utf8' })
    const json = JSON.parse(output)
    assert.equal(json.error, 'Method not allowed')
  } finally {
    if (fs.existsSync(runnerScript)) fs.unlinkSync(runnerScript)
  }
})

test('runtime: admin shoe endpoints reject unauthenticated and customer requests', () => {
  const endpoints = ['create.php', 'update.php', 'restock.php', 'delete.php', 'restore.php']
  for (const ep of endpoints) {
    const epPath = path.join(SHOES_DIR, ep)
    if (!fs.existsSync(epPath)) continue

    // 1. Unauthenticated -> 401
    const runnerUnauth = path.join(SHOES_DIR, `test_${ep}_unauth.php`)
    fs.writeFileSync(
      runnerUnauth,
      `<?php
$_SERVER['REQUEST_METHOD'] = 'POST';
require __DIR__ . '/${ep}';
`
    )
    try {
      const output = execSync(`php "${runnerUnauth}"`, { encoding: 'utf8' })
      const json = JSON.parse(output)
      assert.equal(json.error, 'Authentication required', `${ep} must reject unauthenticated requests with 401`)
    } finally {
      if (fs.existsSync(runnerUnauth)) fs.unlinkSync(runnerUnauth)
    }

    // 2. Customer role -> 403
    const runnerCustomer = path.join(SHOES_DIR, `test_${ep}_customer.php`)
    fs.writeFileSync(
      runnerCustomer,
      `<?php
$_SERVER['REQUEST_METHOD'] = 'POST';
require_once __DIR__ . '/../config.php';
$_SESSION['user_id'] = 42;
$_SESSION['user_role'] = 'customer';
require __DIR__ . '/${ep}';
`
    )
    try {
      const output = execSync(`php "${runnerCustomer}"`, { encoding: 'utf8' })
      const json = JSON.parse(output)
      assert.equal(json.error, 'Owner privileges required', `${ep} must reject customer role with 403`)
    } finally {
      if (fs.existsSync(runnerCustomer)) fs.unlinkSync(runnerCustomer)
    }
  }
})

test('runtime: formatShoeRow maps all 19 fields and decodes JSON columns', () => {
  const runner = path.join(SHOES_DIR, 'test_format_shoe.php')
  fs.writeFileSync(
    runner,
    `<?php
require_once __DIR__ . '/../helpers.php';

$mockRow = [
    'id' => 'test-shoe',
    'name' => 'Test Shoe',
    'description' => 'A test sneaker',
    'price' => '4890.00',
    'stock' => '25',
    'status' => 'available',
    'glb_path' => '/models/test.glb',
    'thumbnail_path' => '/images/test.png',
    'charms_enabled' => '1',
    'charm_offset' => '0 0.05 0',
    'charm_scale' => '0.5 0.5 0.5',
    'charm_dir' => '/models/charms/test/',
    'categories' => '["sneakers","running"]',
    'parts' => '[{"id":"upper","label":"Upper","material":"UpperMaterial"}]',
    'colors' => '[{"name":"Chalk","value":"#f1efe8"}]',
    'created_at' => '2026-09-16 12:00:00',
    'updated_at' => '2026-09-16 12:00:00',
    'deleted_at' => null,
    'permanently_deleted' => '0',
];

$formatted = formatShoeRow($mockRow);
echo json_encode($formatted);
`
  )
  try {
    const output = execSync(`php "${runner}"`, { encoding: 'utf8' })
    const res = JSON.parse(output)
    assert.equal(res.id, 'test-shoe')
    assert.equal(res.name, 'Test Shoe')
    assert.equal(res.description, 'A test sneaker')
    assert.equal(res.price, 4890)
    assert.equal(res.formattedPrice, '₱4,890')
    assert.equal(res.stock, 25)
    assert.equal(res.status, 'available')
    assert.equal(res.glbPath, '/models/test.glb')
    assert.equal(res.thumbnailPath, '/images/test.png')
    assert.equal(res.charmsEnabled, true)
    assert.equal(res.charmOffset, '0 0.05 0')
    assert.equal(res.charmScale, '0.5 0.5 0.5')
    assert.equal(res.charmDir, '/models/charms/test/')
    assert.deepEqual(res.categories, ['sneakers', 'running'])
    assert.deepEqual(res.parts, [{ id: 'upper', label: 'Upper', material: 'UpperMaterial' }])
    assert.deepEqual(res.colors, [{ name: 'Chalk', value: '#f1efe8' }])
    assert.equal(res.createdAt, '2026-09-16 12:00:00')
    assert.equal(res.updatedAt, '2026-09-16 12:00:00')
    assert.equal(res.deletedAt, null)
    assert.equal(res.permanentlyDeleted, 0)
  } finally {
    if (fs.existsSync(runner)) fs.unlinkSync(runner)
  }
})

test('runtime: create.php validates required fields and types', () => {
  const runCreate = (body) => {
    const runner = path.join(SHOES_DIR, 'test_create_tmp.php')
    fs.writeFileSync(
      runner,
      `<?php
$_SERVER['REQUEST_METHOD'] = 'POST';
require_once __DIR__ . '/../config.php';
$_SESSION['user_id'] = 1;
$_SESSION['user_role'] = 'owner';
$GLOBALS['__JSON_BODY__'] = '${JSON.stringify(body).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}';
require __DIR__ . '/create.php';
`
    )
    try {
      const out = execSync(`php "${runner}"`, { encoding: 'utf8' })
      return JSON.parse(out)
    } finally {
      if (fs.existsSync(runner)) fs.unlinkSync(runner)
    }
  }

  // 1. Missing name
  const res1 = runCreate({ name: '   ', price: 4890, stock: 10 })
  assert.equal(res1.error, 'Shoe name is required')

  // 2. Negative price
  const res2 = runCreate({ name: 'Valid Shoe', price: -10, stock: 10 })
  assert.equal(res2.error, 'Valid price is required')

  // 3. Negative stock
  const res3 = runCreate({ name: 'Valid Shoe', price: 4890, stock: -5 })
  assert.equal(res3.error, 'Valid stock count is required')
})

test('runtime: restock.php and delete.php validate inputs with owner session', () => {
  const runWithBody = (file, body) => {
    const runner = path.join(SHOES_DIR, 'test_val_tmp.php')
    fs.writeFileSync(
      runner,
      `<?php
$_SERVER['REQUEST_METHOD'] = 'POST';
require_once __DIR__ . '/../config.php';
$_SESSION['user_id'] = 1;
$_SESSION['user_role'] = 'owner';
$GLOBALS['__JSON_BODY__'] = '${JSON.stringify(body).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}';
require __DIR__ . '/${file}';
`
    )
    try {
      const out = execSync(`php "${runner}"`, { encoding: 'utf8' })
      return JSON.parse(out)
    } finally {
      if (fs.existsSync(runner)) fs.unlinkSync(runner)
    }
  }

  // Restock: missing ID
  const r1 = runWithBody('restock.php', { amount: 5 })
  assert.equal(r1.error, 'Shoe ID is required')

  // Restock: non-positive amount
  const r2 = runWithBody('restock.php', { id: 'kickcraft-one', amount: 0 })
  assert.equal(r2.error, 'Restock amount must be greater than 0')

  // Delete: missing ID
  const d1 = runWithBody('delete.php', {})
  assert.equal(d1.error, 'Shoe ID is required')

  // Delete: invalid mode
  const d2 = runWithBody('delete.php', { id: 'kickcraft-one', mode: 'invalid' })
  assert.equal(d2.error, "Invalid mode: must be 'soft' or 'hard'")

  // Restore: missing ID
  const rest1 = runWithBody('restore.php', {})
  assert.equal(rest1.error, 'Shoe ID is required')
})

test('upload.php exists, requires POST, requireAdmin, and validates file', () => {
  const filePath = path.join(SHOES_DIR, 'upload.php')
  assert.ok(fs.existsSync(filePath), 'api/shoes/upload.php must exist')

  const code = fs.readFileSync(filePath, 'utf8')
  assert.match(code, /requireMethod\(['"]POST['"]\)/, 'upload.php must enforce POST')
  assert.match(code, /requireAdmin\(\)/, 'upload.php must require owner authentication')
  assert.match(code, /move_uploaded_file/, 'upload.php must move uploaded file to destination')
  assert.match(code, /public\/models/, 'upload.php must store GLB models in public/models')
  assert.match(code, /public\/images/, 'upload.php must store images in public/images')
})

test('AdminPanel.vue uploads 3D model and thumbnail to upload.php before saving shoe', () => {
  const adminPanelPath = path.join(ROOT_DIR, 'src', 'components', 'AdminPanel.vue')
  const code = fs.readFileSync(adminPanelPath, 'utf8')

  assert.match(code, /selectedModelFile/, 'AdminPanel.vue must track selected model file')
  assert.match(code, /shoes\/upload\.php/, 'AdminPanel.vue must upload to shoes/upload.php')
  assert.match(code, /FormData/, 'AdminPanel.vue must use FormData for asset uploads')
})
