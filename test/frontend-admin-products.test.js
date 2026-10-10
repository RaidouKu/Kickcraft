import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const ADMIN_PANEL_PATH = path.resolve('src/components/AdminPanel.vue')

test('AdminPanel.vue exists', () => {
  assert.ok(fs.existsSync(ADMIN_PANEL_PATH), 'src/components/AdminPanel.vue must exist')
})

test('AdminPanel navigation includes Products tab with pending badge', () => {
  const content = fs.readFileSync(ADMIN_PANEL_PATH, 'utf8')

  // Check tab button in navigation
  assert.match(content, /adminSection(?:\.value)?\s*===\s*['"]products['"]/, 'Must support adminSection === "products"')
  assert.match(content, /Products|Product Moderation/i, 'Must have Products navigation tab label')
  assert.match(content, /pendingProductsCount/, 'Must display pending products count badge')
})

test('AdminPanel defines reactive state and methods for product moderation', () => {
  const content = fs.readFileSync(ADMIN_PANEL_PATH, 'utf8')

  // Reactive state
  assert.match(content, /products\s*=\s*ref\(\[\]\)/, 'Must declare products ref')
  assert.match(content, /productStatusFilter\s*=\s*ref\(['"]all['"]\)/, 'Must declare productStatusFilter ref with default all')
  assert.match(content, /productSearch\s*=\s*ref\(['"]['"]\)/, 'Must declare productSearch ref')
  assert.match(content, /selectedProductForReview\s*=\s*ref\(null\)/, 'Must declare selectedProductForReview ref')
  assert.match(content, /productReviewNotes\s*=\s*ref\(['"]['"]\)/, 'Must declare productReviewNotes ref')
  assert.match(content, /pendingProductsCount\s*=\s*computed\(/, 'Must compute pendingProductsCount')
  assert.match(content, /fetchProducts/, 'Must define fetchProducts function')
})

test('AdminPanel fetches products from api/products/list.php', () => {
  const content = fs.readFileSync(ADMIN_PANEL_PATH, 'utf8')

  assert.match(content, /api\(\s*['"]products\/list\.php['"]\)/, 'Must call products/list.php endpoint')
})

test('AdminPanel renders Product Moderation section when adminSection === "products"', () => {
  const content = fs.readFileSync(ADMIN_PANEL_PATH, 'utf8')

  assert.match(content, /v-else-if="adminSection\s*===\s*['"]products['"]"/, 'Must render section when adminSection === "products"')
  assert.match(content, /PRODUCT MODERATION|Product Moderation/i, 'Must have Product Moderation heading')
})

test('AdminPanel renders product status filter tabs and search input', () => {
  const content = fs.readFileSync(ADMIN_PANEL_PATH, 'utf8')

  // Filter tabs: all, pending, approved, rejected, suspended
  assert.match(content, /productStatusFilter\s*===\s*['"]all['"]/, 'Filter tab for all products')
  assert.match(content, /productStatusFilter\s*===\s*['"]pending['"]/, 'Filter tab for pending products')
  assert.match(content, /productStatusFilter\s*===\s*['"]approved['"]/, 'Filter tab for approved products')
  assert.match(content, /productStatusFilter\s*===\s*['"]rejected['"]/, 'Filter tab for rejected products')
  assert.match(content, /productStatusFilter\s*===\s*['"]suspended['"]/, 'Filter tab for suspended products')

  // Search input
  assert.match(content, /v-model="productSearch"/, 'Must bind search input to productSearch')
})

test('AdminPanel renders product table/grid with required columns and data bindings', () => {
  const content = fs.readFileSync(ADMIN_PANEL_PATH, 'utf8')

  // Fields rendered: product name, store name, creation method, price, status badge, dates, actions
  assert.match(content, /product\.name|p\.name/i, 'Must display product name')
  assert.match(content, /storeName|store_name/i, 'Must display store name')
  assert.match(content, /creationMethod|creation_method/i, 'Must display creation method')
  assert.match(content, /product\.price|p\.price|formattedPrice/i, 'Must display price')
  assert.match(content, /product\.status|p\.status/i, 'Must display status badge')
})

test('AdminPanel displays brutalist status badges for products', () => {
  const content = fs.readFileSync(ADMIN_PANEL_PATH, 'utf8')

  assert.match(content, /\[\s*PENDING REVIEW\s*\]/i, 'Must render [ PENDING REVIEW ] badge')
  assert.match(content, /\[\s*APPROVED\s*\]/i, 'Must render [ APPROVED ] badge')
  assert.match(content, /\[\s*REJECTED\s*\]/i, 'Must render [ REJECTED ] badge')
  assert.match(content, /\[\s*SUSPENDED\s*\]/i, 'Must render [ SUSPENDED ] badge')
})

test('AdminPanel has review modal and calls api/products/review.php with status and notes', () => {
  const content = fs.readFileSync(ADMIN_PANEL_PATH, 'utf8')

  assert.match(content, /api\(\s*['"]products\/review\.php['"]/, 'Must call products/review.php')
  assert.match(content, /selectedProductForReview/, 'Must use selectedProductForReview in review modal')
  assert.match(content, /productReviewNotes/, 'Must bind productReviewNotes textarea in review modal')
  assert.match(content, /submitProductReview/, 'Must define submitProductReview function')
})

test('AdminPanel product review modal contains interactive 3D model-viewer inspection viewport', () => {
  const content = fs.readFileSync(ADMIN_PANEL_PATH, 'utf8')

  // Find modal section
  assert.match(content, /v-if="selectedProductForReview"/, 'Review modal must exist')

  // Model viewer inside review modal with camera controls and auto rotate
  assert.match(
    content,
    /<model-viewer[\s\S]*?:src="resolveAssetUrl\(selectedProductForReview\.glbPath \|\| selectedProductForReview\.glb_path\)"[\s\S]*?camera-controls[\s\S]*?auto-rotate[\s\S]*?<\/model-viewer>/,
    'Review modal must render model-viewer with camera-controls and auto-rotate'
  )

  // Informative fallback when no GLB attached
  assert.match(
    content,
    /NO 3D GLB FILE ATTACHED/i,
    'Must display informative fallback when no GLB is attached'
  )

  // Thumbnail badge/preview
  assert.match(
    content,
    /selectedProductForReview\.thumbnailPath \|\| selectedProductForReview\.thumbnail_path/,
    'Must render thumbnail badge or preview when thumbnail is present'
  )
})

test('AdminPanel strictly avoids physical DELETE FROM queries', () => {
  const content = fs.readFileSync(ADMIN_PANEL_PATH, 'utf8')

  assert.doesNotMatch(content, /DELETE\s+FROM/i, 'Must NOT contain physical SQL DELETE FROM statements')
})
