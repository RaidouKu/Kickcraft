import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const ADMIN_PANEL_PATH = path.resolve('src/components/AdminPanel.vue')

test('AdminPanel.vue exists', () => {
  assert.ok(fs.existsSync(ADMIN_PANEL_PATH), 'src/components/AdminPanel.vue must exist')
})

test('AdminPanel navigation includes Sellers tab with pending badge', () => {
  const content = fs.readFileSync(ADMIN_PANEL_PATH, 'utf8')

  // Check tab button in navigation
  assert.match(content, /adminSection(?:\.value)?\s*===\s*['"]sellers['"]/, 'Must support adminSection === "sellers"')
  assert.match(content, /Sellers|Seller Management/i, 'Must have Sellers navigation tab label')
  assert.match(content, /pendingSellersCount/, 'Must display pending sellers count badge')
})

test('AdminPanel defines reactive state and methods for seller management', () => {
  const content = fs.readFileSync(ADMIN_PANEL_PATH, 'utf8')

  // Reactive state
  assert.match(content, /sellers\s*=\s*ref\(\[\]\)/, 'Must declare sellers ref')
  assert.match(content, /sellerStatusFilter\s*=\s*ref\(['"]all['"]\)/, 'Must declare sellerStatusFilter ref with default all')
  assert.match(content, /sellerSearch(?:Query)?\s*=\s*ref\(['"]['"]\)/, 'Must declare sellerSearch ref')
  assert.match(content, /selectedSellerForReview\s*=\s*ref\(null\)/, 'Must declare selectedSellerForReview ref')
  assert.match(content, /reviewNotes\s*=\s*ref\(['"]['"]\)/, 'Must declare reviewNotes ref')
  assert.match(content, /reviewLoading\s*=\s*ref\(false\)/, 'Must declare reviewLoading ref')
  assert.match(content, /pendingSellersCount\s*=\s*computed\(/, 'Must compute pendingSellersCount')
  assert.match(content, /fetchSellers|loadSellers/, 'Must define fetchSellers or loadSellers function')
})

test('AdminPanel fetches sellers from api/sellers/list.php', () => {
  const content = fs.readFileSync(ADMIN_PANEL_PATH, 'utf8')

  assert.match(content, /api\(\s*['"]sellers\/list\.php['"]\)/, 'Must call sellers/list.php endpoint')
})

test('AdminPanel renders Seller Management section when adminSection === "sellers"', () => {
  const content = fs.readFileSync(ADMIN_PANEL_PATH, 'utf8')

  assert.match(content, /v-else-if="adminSection\s*===\s*['"]sellers['"]"/, 'Must render section when adminSection === "sellers"')
  assert.match(content, /SELLER MANAGEMENT|Seller Management/i, 'Must have Seller Management heading')
})

test('AdminPanel renders seller status filter tabs and search input', () => {
  const content = fs.readFileSync(ADMIN_PANEL_PATH, 'utf8')

  // Filter tabs: all, pending, approved, rejected, suspended
  assert.match(content, /sellerStatusFilter\s*===\s*['"]all['"]/, 'Filter tab for all sellers')
  assert.match(content, /sellerStatusFilter\s*===\s*['"]pending['"]/, 'Filter tab for pending sellers')
  assert.match(content, /sellerStatusFilter\s*===\s*['"]approved['"]/, 'Filter tab for approved sellers')
  assert.match(content, /sellerStatusFilter\s*===\s*['"]rejected['"]/, 'Filter tab for rejected sellers')
  assert.match(content, /sellerStatusFilter\s*===\s*['"]suspended['"]/, 'Filter tab for suspended sellers')

  // Search input
  assert.match(content, /v-model="sellerSearch(?:Query)?"/, 'Must bind search input to sellerSearch')
})

test('AdminPanel renders seller table with required columns and data bindings', () => {
  const content = fs.readFileSync(ADMIN_PANEL_PATH, 'utf8')

  // Columns / table fields
  assert.match(content, /storeName|store_name/i, 'Must display store name')
  assert.match(content, /seller\.name|s\.name/i, 'Must display seller name')
  assert.match(content, /seller\.email|s\.email/i, 'Must display seller email')
  assert.match(content, /seller\.status|s\.status/i, 'Must display seller status')
  assert.match(content, /createdAt|created_at/i, 'Must display registration/applied date')
})

test('AdminPanel displays status badges for pending, approved, rejected, suspended', () => {
  const content = fs.readFileSync(ADMIN_PANEL_PATH, 'utf8')

  assert.match(content, /PENDING REVIEW|Pending Review|PENDING/i, 'Must render pending badge text')
  assert.match(content, /APPROVED/i, 'Must render approved badge text')
  assert.match(content, /REJECTED/i, 'Must render rejected badge text')
  assert.match(content, /SUSPENDED/i, 'Must render suspended badge text')
})

test('AdminPanel has review modal and calls api/sellers/review.php', () => {
  const content = fs.readFileSync(ADMIN_PANEL_PATH, 'utf8')

  assert.match(content, /api\(\s*['"]sellers\/review\.php['"]/, 'Must call sellers/review.php')
  assert.match(content, /selectedSellerForReview/, 'Must use selectedSellerForReview in review modal')
  assert.match(content, /reviewNotes/, 'Must bind reviewNotes textarea in review modal')
  assert.match(content, /Approve/i, 'Must have approve action')
  assert.match(content, /Reject/i, 'Must have reject action')
  assert.match(content, /Suspend/i, 'Must have suspend action')
})

test('AdminPanel strictly avoids physical DELETE FROM queries', () => {
  const content = fs.readFileSync(ADMIN_PANEL_PATH, 'utf8')

  assert.doesNotMatch(content, /DELETE\s+FROM/i, 'Must NOT contain physical SQL DELETE FROM statements')
})
