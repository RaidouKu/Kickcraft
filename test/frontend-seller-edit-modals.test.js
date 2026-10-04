import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const DASHBOARD_PATH = path.resolve('src/components/SellerDashboard.vue')
const MESH_TAGGER_PATH = path.resolve('src/components/MeshTagger.vue')
const CUSTOMIZER_PATH = path.resolve('src/components/ProductCustomizer.vue')
const UPDATE_API_PATH = path.resolve('api/products/update.php')

test('Seller product editing functionality exists in SellerDashboard.vue', () => {
  assert.ok(fs.existsSync(DASHBOARD_PATH), 'SellerDashboard.vue must exist')
  const content = fs.readFileSync(DASHBOARD_PATH, 'utf8')

  // Edit state
  assert.match(content, /isEditingProduct\s*=\s*ref\(false\)/, 'Must declare isEditingProduct ref')
  assert.match(content, /editingProductId\s*=\s*ref\(null\)/, 'Must declare editingProductId ref')

  // Edit handler functions
  assert.match(content, /function\s+startEditProduct/, 'Must define startEditProduct function')
  assert.match(content, /function\s+handleEditProductClick/, 'Must define handleEditProductClick function')

  // Edit button in product card
  assert.match(content, /@click="handleEditProductClick\(prod\)"/, 'Must wire Edit button on product cards')

  // Calling update API on edit submission
  assert.match(content, /api\(\s*['"]products\/update\.php['"]/, 'Must call products/update.php when updating product')
})

test('Shoe parts are optional in MeshTagger.vue and ProductCustomizer.vue', () => {
  assert.ok(fs.existsSync(MESH_TAGGER_PATH), 'MeshTagger.vue must exist')
  const taggerContent = fs.readFileSync(MESH_TAGGER_PATH, 'utf8')

  // canComplete is computed to always allow progression (0 parts allowed)
  assert.match(taggerContent, /canComplete\s*=\s*computed\(\(\)\s*=>\s*true\)/, 'canComplete must always be true')
  assert.match(taggerContent, /PARTS OPTIONAL/i, 'Must display PARTS OPTIONAL in tagging status')

  assert.ok(fs.existsSync(CUSTOMIZER_PATH), 'ProductCustomizer.vue must exist')
  const customizerContent = fs.readFileSync(CUSTOMIZER_PATH, 'utf8')

  // Customizer handles 0 parts mapped cleanly
  assert.match(customizerContent, /No customizable parts mapped/i, 'Must have zero-parts banner in ProductCustomizer')
})

test('Confirmation modals are wired for all critical seller actions', () => {
  assert.ok(fs.existsSync(DASHBOARD_PATH), 'SellerDashboard.vue must exist')
  const content = fs.readFileSync(DASHBOARD_PATH, 'utf8')

  // ConfirmModal import and mount
  assert.match(content, /import\s+ConfirmModal\s+from\s+['"]\.\/ConfirmModal\.vue['"]/, 'Must import ConfirmModal')
  assert.match(content, /<ConfirmModal/, 'Must mount ConfirmModal in template')

  // Modal state and handlers
  assert.match(content, /confirmModal\s*=\s*ref\(/, 'Must declare confirmModal reactive state')
  assert.match(content, /function\s+openConfirm/, 'Must define openConfirm helper')
  assert.match(content, /function\s+handleModalConfirm/, 'Must define handleModalConfirm handler')
  assert.match(content, /function\s+handleModalCancel/, 'Must define handleModalCancel handler')

  // Confirmation triggers
  assert.match(content, /function\s+confirmSubmitForReview/, 'Must define confirmSubmitForReview')
  assert.match(content, /function\s+confirmCancelOrder/, 'Must define confirmCancelOrder')
  assert.match(content, /function\s+confirmCompleteOrder/, 'Must define confirmCompleteOrder')

  // Log Out confirmation
  assert.match(content, /Log Out of Seller Studio\?/i, 'handleLogout must open confirmation modal')
})

test('Owner approval is strictly enforced on product updates', () => {
  assert.ok(fs.existsSync(UPDATE_API_PATH), 'api/products/update.php must exist')
  const apiContent = fs.readFileSync(UPDATE_API_PATH, 'utf8')

  // Checks that update sets status to 'pending'
  assert.match(apiContent, /\$newStatus\s*=\s*'pending'/, 'Must reset product status to pending on update')
  assert.match(apiContent, /approved_at\s*=\s*NULL/, 'Must reset approved_at to NULL on update')
  assert.doesNotMatch(apiContent, /DELETE\s+FROM/i, 'Must strictly avoid physical DELETE FROM')
})
