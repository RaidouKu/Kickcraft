import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const ROOT_DIR = path.resolve(import.meta.dirname, '..')
const API_DIR = path.join(ROOT_DIR, 'api')

test('backend infrastructure files exist', () => {
  const requiredFiles = [
    path.join(API_DIR, 'database', 'setup.sql'),
    path.join(API_DIR, 'database', 'create-owner.php'),
    path.join(API_DIR, '.env.example'),
    path.join(API_DIR, 'config.php'),
    path.join(API_DIR, 'db.php'),
    path.join(API_DIR, 'helpers.php'),
    path.join(API_DIR, '.htaccess'),
  ]

  for (const filePath of requiredFiles) {
    assert.ok(fs.existsSync(filePath), `Expected file to exist: ${path.relative(ROOT_DIR, filePath)}`)
  }
})

test('setup.sql defines schema without physical DELETE statements', () => {
  const sqlPath = path.join(API_DIR, 'database', 'setup.sql')
  assert.ok(fs.existsSync(sqlPath), 'setup.sql must exist')
  const sql = fs.readFileSync(sqlPath, 'utf8')

  // Zero physical DELETE FROM
  assert.doesNotMatch(sql, /\bDELETE\s+FROM\b/i, 'setup.sql must not contain any physical DELETE FROM statements')

  // Database creation
  assert.match(sql, /CREATE\s+DATABASE\s+IF\s+NOT\s+EXISTS\s+kickcraft_db/i)
  assert.match(sql, /USE\s+kickcraft_db/i)

  // Users table
  assert.match(sql, /CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?users/i)
  assert.match(sql, /role\s+ENUM\('customer',\s*'owner'\)/i)
  assert.match(sql, /deleted_at\s+TIMESTAMP\s+NULL/i)
  assert.match(sql, /permanently_deleted\s+TINYINT/i)

  // Shoes table
  assert.match(sql, /CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?shoes/i)
  assert.match(sql, /price\s+DECIMAL\(10,\s*2\)/i)
  assert.match(sql, /categories\s+JSON/i)
  assert.match(sql, /parts\s+JSON/i)
  assert.match(sql, /colors\s+JSON/i)
  assert.match(sql, /charms_enabled\s+TINYINT/i)

  // Reservations table
  assert.match(sql, /CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?reservations/i)
  assert.match(sql, /part_colors\s+JSON/i)
  assert.match(sql, /charm_id\s+VARCHAR/i)
  assert.match(sql, /status\s+ENUM\('pending',\s*'approved',\s*'ready',\s*'completed',\s*'cancelled'\)/i)
  assert.match(sql, /idx_reservations_email/i)
  assert.match(sql, /idx_reservations_status/i)
  assert.match(sql, /idx_reservations_pickup_date/i)
  assert.match(sql, /idx_reservations_created_at/i)

  // Seeds
  assert.match(sql, /'owner'/)
  assert.match(sql, /kickcraft-one/)
  assert.match(sql, /nike-air-max/)
  assert.match(sql, /nike-dunk/)
  assert.match(sql, /KC-2026-1041/)
  assert.match(sql, /KC-2026-1042/)
  assert.match(sql, /KC-2026-1043/)
  assert.match(sql, /KC-2026-1044/)
})

test('environment config and gitignore rules are configured', () => {
  const envExamplePath = path.join(API_DIR, '.env.example')
  const gitignorePath = path.join(ROOT_DIR, '.gitignore')

  assert.ok(fs.existsSync(envExamplePath), '.env.example must exist')

  const envExample = fs.readFileSync(envExamplePath, 'utf8')
  assert.match(envExample, /DB_HOST=/)
  assert.match(envExample, /DB_PORT=/)
  assert.match(envExample, /DB_NAME=kickcraft_db/)
  assert.match(envExample, /DB_USER=/)
  assert.match(envExample, /DB_PASS=/)
  assert.match(envExample, /KICKCRAFT_OWNER_PASSWORD=/)

  const gitignore = fs.readFileSync(gitignorePath, 'utf8')
  assert.match(gitignore, /api\/\.env(\s|$)/, '.gitignore must ignore api/.env')
})

test('db.php configures PDO singleton with prepared statements', () => {
  const dbPath = path.join(API_DIR, 'db.php')
  assert.ok(fs.existsSync(dbPath), 'db.php must exist')
  const content = fs.readFileSync(dbPath, 'utf8')

  assert.match(content, /function\s+getDb\s*\(\)\s*:\s*PDO/)
  assert.match(content, /PDO::ATTR_ERRMODE\s*=>\s*PDO::ERRMODE_EXCEPTION/)
  assert.match(content, /PDO::ATTR_DEFAULT_FETCH_MODE\s*=>\s*PDO::FETCH_ASSOC/)
  assert.match(content, /PDO::ATTR_EMULATE_PREPARES\s*=>\s*false/)
})

test('config.php loads env, sets CORS, and sets cookie params', () => {
  const configPath = path.join(API_DIR, 'config.php')
  assert.ok(fs.existsSync(configPath), 'config.php must exist')
  const content = fs.readFileSync(configPath, 'utf8')

  assert.match(content, /session_set_cookie_params/)
  assert.match(content, /'httponly'\s*=>\s*true/)
  assert.match(content, /'samesite'\s*=>\s*'Lax'/i)
  assert.match(content, /Access-Control-Allow-Origin/i)
  assert.match(content, /Access-Control-Allow-Credentials/i)
  assert.match(content, /Content-Type:\s*application\/json/i)
})

test('helpers.php provides sanitizer, validator, and response helpers', () => {
  const helpersPath = path.join(API_DIR, 'helpers.php')
  assert.ok(fs.existsSync(helpersPath), 'helpers.php must exist')

  const testScriptPath = path.join(API_DIR, 'test_helpers_runner.php')
  fs.writeFileSync(testScriptPath, `<?php
require __DIR__ . '/helpers.php';
assert(function_exists('jsonResponse'));
assert(function_exists('jsonError'));
assert(function_exists('requireMethod'));
assert(function_exists('requireAuth'));
assert(function_exists('requireAdmin'));
assert(function_exists('getJsonBody'));
assert(function_exists('sanitizeString'));
assert(function_exists('validateEmail'));
assert(function_exists('isLocalAssetPath'));

$clean = sanitizeString('  <script>alert("xss")</script>  ');
if ($clean !== '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;') {
    echo "sanitizeString failed: " . $clean;
    exit(1);
}

if (!validateEmail('test@kickcraft.local')) {
    echo "validateEmail valid failed";
    exit(1);
}
if (validateEmail('not-an-email')) {
    echo "validateEmail invalid failed";
    exit(1);
}
if (!isLocalAssetPath('/models/demo.glb', 'models', ['glb']) || isLocalAssetPath('blob:demo', 'models', ['glb'])) {
    echo "isLocalAssetPath failed";
    exit(1);
}

echo "OK";
`)

  try {
    const result = execSync(`php "${testScriptPath}"`, { encoding: 'utf8' })
    assert.match(result, /OK/)
  } finally {
    if (fs.existsSync(testScriptPath)) {
      fs.unlinkSync(testScriptPath)
    }
  }
})

test('.htaccess configures RewriteEngine', () => {
  const htaccessPath = path.join(API_DIR, '.htaccess')
  assert.ok(fs.existsSync(htaccessPath), '.htaccess must exist')
  const content = fs.readFileSync(htaccessPath, 'utf8')
  assert.match(content, /RewriteEngine\s+On/i)
  assert.match(content, /FilesMatch\s+"\^\\\.env/i, 'api/.htaccess must block environment files')
})
