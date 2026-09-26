import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const ROOT_DIR = path.resolve(import.meta.dirname, '..')
const ADMIN_PANEL_PATH = path.join(ROOT_DIR, 'src', 'components', 'AdminPanel.vue')

test('src/components/AdminPanel.vue imports api from ../api.js', () => {
  assert.ok(fs.existsSync(ADMIN_PANEL_PATH), 'src/components/AdminPanel.vue must exist')
  const content = fs.readFileSync(ADMIN_PANEL_PATH, 'utf8')
  assert.match(content, /import\s+{[^}]*api[^}]*}\s+from\s+['"]\.\.\/api\.js['"]|import\s+api\s+from\s+['"]\.\.\/api\.js['"]/, 'AdminPanel.vue must import api from ../api.js')
})

test('AdminPanel.vue loadData fetches shoes and reservations from API without local fallbacks', () => {
  const content = fs.readFileSync(ADMIN_PANEL_PATH, 'utf8')
  assert.match(content, /async\s+function\s+loadData\s*\(/, 'loadData must be an async function')
  assert.match(content, /api\(\s*['"]shoes\/list\.php\?include_archived=1['"]\s*\)/, 'loadData must call api(shoes/list.php?include_archived=1)')
  assert.match(content, /api\(\s*['"]reservations\/list\.php['"]\s*\)/, 'loadData must call api(reservations/list.php)')
  assert.doesNotMatch(content, /getStoredShoes|getStoredOrders/, 'database records must not fall back to localStorage')
})

test('AdminPanel.vue handleSaveShoe is async and calls shoes/create.php or shoes/update.php', () => {
  const content = fs.readFileSync(ADMIN_PANEL_PATH, 'utf8')
  assert.match(content, /async\s+function\s+handleSaveShoe\s*\(/, 'handleSaveShoe must be an async function')
  assert.match(content, /api\(\s*['"]shoes\/update\.php['"]\s*,\s*\{[\s\S]*?method:\s*['"]POST['"]/, 'handleSaveShoe must call api(shoes/update.php, { method: POST, ... })')
  assert.match(content, /api\(\s*['"]shoes\/create\.php['"]\s*,\s*\{[\s\S]*?method:\s*['"]POST['"]/, 'handleSaveShoe must call api(shoes/create.php, { method: POST, ... })')
})

test('AdminPanel.vue confirmRestock is async and calls shoes/restock.php', () => {
  const content = fs.readFileSync(ADMIN_PANEL_PATH, 'utf8')
  assert.match(content, /async\s+function\s+confirmRestock\s*\(/, 'confirmRestock must be an async function')
  assert.match(content, /api\(\s*['"]shoes\/restock\.php['"]\s*,\s*\{[\s\S]*?method:\s*['"]POST['"][\s\S]*?body:\s*\{[\s\S]*?id:[\s\S]*?amount:[\s\S]*?\}\s*\}\s*\)/, 'confirmRestock must call api(shoes/restock.php) with id and amount')
})

test('AdminPanel.vue deleteShoe calls shoes/delete.php with soft and hard modes', () => {
  const content = fs.readFileSync(ADMIN_PANEL_PATH, 'utf8')
  assert.match(content, /api\(\s*['"]shoes\/delete\.php['"]\s*,\s*\{[\s\S]*?method:\s*['"]POST['"][\s\S]*?body:\s*\{[\s\S]*?id:[\s\S]*?mode[\s\S]*?\}\s*\}\s*\)/, 'deleteShoe must call api(shoes/delete.php) with id and mode')
  assert.match(content, /confirmPermanentDelete/, 'AdminPanel.vue must define confirmPermanentDelete for hard delete')
})

test('AdminPanel.vue restoreShoe calls shoes/restore.php', () => {
  const content = fs.readFileSync(ADMIN_PANEL_PATH, 'utf8')
  assert.match(content, /async\s+function\s+restoreShoe\s*\(/, 'restoreShoe must be an async function')
  assert.match(content, /api\(\s*['"]shoes\/restore\.php['"]\s*,\s*\{[\s\S]*?method:\s*['"]POST['"][\s\S]*?body:\s*\{[\s\S]*?id:[\s\S]*?\}\s*\}\s*\)/, 'restoreShoe must call api(shoes/restore.php) with id')
})

test('AdminPanel.vue handleOrderStatusChange is async and calls reservations/update-status.php', () => {
  const content = fs.readFileSync(ADMIN_PANEL_PATH, 'utf8')
  assert.match(content, /async\s+function\s+handleOrderStatusChange\s*\(/, 'handleOrderStatusChange must be an async function')
  assert.match(content, /api\(\s*['"]reservations\/update-status\.php['"]\s*,\s*\{[\s\S]*?method:\s*['"]POST['"][\s\S]*?body:\s*\{[\s\S]*?id:\s*orderId[\s\S]*?status:\s*newStatus[\s\S]*?\}\s*\}\s*\)/, 'handleOrderStatusChange must call api(reservations/update-status.php) with id and status')
})

test('AdminPanel.vue excludes walk-in payment flow', () => {
  const content = fs.readFileSync(ADMIN_PANEL_PATH, 'utf8')
  assert.doesNotMatch(content, /submitWalkInSale|status:\s*['"]paid['"]/, 'walk-in payment flow is outside pickup reservation scope')
})

test('AdminPanel.vue inventory tabs include archived tab and provide restore and delete buttons', () => {
  const content = fs.readFileSync(ADMIN_PANEL_PATH, 'utf8')
  assert.match(content, /activeTab\s*===\s*['"]archived['"]/, 'AdminPanel.vue template must have activeTab === "archived"')
  assert.match(content, /@click=["']restoreShoe\(shoe\)["']/, 'Archived tab must render restore button calling restoreShoe(shoe)')
  assert.match(content, /@click=["']confirmPermanentDelete\(shoe\)["']/, 'Archived tab must render permanent delete button calling confirmPermanentDelete(shoe)')
})

test('AdminPanel.vue top navigation includes User Accounts tab and manages user accounts', () => {
  const content = fs.readFileSync(ADMIN_PANEL_PATH, 'utf8')
  assert.match(content, /adminSection\s*===\s*['"]users['"]/, 'AdminPanel.vue must support adminSection === "users"')
  assert.match(content, /api\(\s*['"]auth\/users\.php\?include_archived=1['"]\s*\)/, 'AdminPanel.vue must fetch auth/users.php?include_archived=1')
  assert.match(content, /api\(\s*['"]auth\/delete-user\.php['"]/, 'AdminPanel.vue must call auth/delete-user.php for soft/hard delete')
  assert.match(content, /api\(\s*['"]auth\/restore-user\.php['"]/, 'AdminPanel.vue must call auth/restore-user.php to restore soft-deleted users')
  assert.match(content, /userRoleFilter/, 'AdminPanel.vue must support filtering users by role and archived status')
})

