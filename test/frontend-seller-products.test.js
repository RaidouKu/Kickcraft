import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const COMPONENT_PATH = path.resolve('src/components/SellerDashboard.vue')

test('SellerDashboard component file exists and defines product reactive state', () => {
  assert.ok(fs.existsSync(COMPONENT_PATH), 'SellerDashboard.vue must exist')
  const content = fs.readFileSync(COMPONENT_PATH, 'utf8')

  assert.match(content, /products\s*=\s*ref\(\[\]\)/, 'Must declare products ref initialized to empty array')
  assert.match(content, /isLoadingProducts\s*=\s*ref\(false\)/, 'Must declare isLoadingProducts ref')
  assert.match(content, /isSubmittingReview\s*=\s*ref\(/, 'Must declare isSubmittingReview ref')
  assert.match(content, /productActionFeedback\s*=\s*ref\(['"]['"]\)/, 'Must declare productActionFeedback ref')
  assert.match(content, /productActionError\s*=\s*ref\(['"]['"]\)/, 'Must declare productActionError ref')
})

test('SellerDashboard fetches products from api/products/list.php via loadProducts()', () => {
  const content = fs.readFileSync(COMPONENT_PATH, 'utf8')

  assert.match(content, /async\s+function\s+loadProducts\(\)/, 'Must define loadProducts async function')
  assert.match(content, /api\(\s*['"]products\/list\.php['"]\s*\)/, 'Must call api("products/list.php")')
  assert.match(content, /products\.value\s*=\s*res\.products/, 'Must assign res.products to products.value')
})

test('SellerDashboard displays dynamic count in My Products tab header', () => {
  const content = fs.readFileSync(COMPONENT_PATH, 'utf8')

  // Checks both nav tab count and section title count
  assert.match(content, /My Products\s*\(\{\{\s*products\.length\s*\}\}\)/i, 'Tab header must display dynamic count My Products ({{ products.length }})')
  assert.match(content, /MY PRODUCTS\s*\(\{\{\s*products\.length\s*\}\}\)|Your Shoe Products\s*\(\{\{\s*products\.length\s*\}\}\)/i, 'Section header must display dynamic product count')
})

test('SellerDashboard provides a refresh button calling loadProducts()', () => {
  const content = fs.readFileSync(COMPONENT_PATH, 'utf8')

  assert.match(content, /@click="[^"]*loadProducts\(\)[^"]*"/, 'Must have button with @click calling loadProducts()')
  assert.match(content, /Refresh|Reload/i, 'Must have refresh button label or tooltip')
})

test('SellerDashboard renders empty state when products.length === 0', () => {
  const content = fs.readFileSync(COMPONENT_PATH, 'utf8')

  assert.match(content, /v-if="products\.length\s*===?\s*0"|v-else/, 'Must conditionally check for empty products')
  assert.match(content, /You haven't listed any products yet/i, 'Must have empty state prompt')
  assert.match(content, /\+\s*Create New Product/i, 'Must provide Create New Product button in empty state')
})

test('SellerDashboard renders product card details (title, store name, method badge, price)', () => {
  const content = fs.readFileSync(COMPONENT_PATH, 'utf8')

  // Product title / name
  assert.match(content, /prod\.name/, 'Must bind product name')
  // Store name
  assert.match(content, /prod\.storeName|prod\.store_name|displayStoreName/, 'Must display store name on product card')
  // Creation method badge
  assert.match(content, /prod\.creationMethod|prod\.creation_method|GLB Upload|AI 2D→3D|Template/i, 'Must display creation method badge')
  // Price formatted with PHP symbol
  assert.match(content, /₱.*(?:price)/, 'Must format price with Philippine peso symbol ₱')
})

test('SellerDashboard displays formatted status badges for all product statuses', () => {
  const content = fs.readFileSync(COMPONENT_PATH, 'utf8')

  assert.match(content, /DRAFT/i, 'Must support DRAFT status badge')
  assert.match(content, /PENDING REVIEW|PENDING/i, 'Must support PENDING REVIEW status badge')
  assert.match(content, /APPROVED/i, 'Must support APPROVED status badge')
  assert.match(content, /REJECTED/i, 'Must support REJECTED status badge')
  assert.match(content, /SUSPENDED/i, 'Must support SUSPENDED status badge')
})

test('SellerDashboard renders admin feedback notes if product is rejected', () => {
  const content = fs.readFileSync(COMPONENT_PATH, 'utf8')

  assert.match(content, /prod\.adminNotes|prod\.admin_notes/, 'Must check product admin notes')
  assert.match(content, /Admin Feedback|Admin Notes|Reviewer Feedback/i, 'Must label admin feedback for rejected product')
})

test('SellerDashboard implements submitProductForReview calling api/products/submit.php', () => {
  const content = fs.readFileSync(COMPONENT_PATH, 'utf8')

  assert.match(content, /submitProductForReview/, 'Must define submitProductForReview function')
  assert.match(content, /api\(\s*['"]products\/submit\.php['"]\s*,\s*\{\s*method:\s*['"]POST['"]/, 'Must call products/submit.php with POST')
  assert.match(content, /productId/, 'Must pass productId in body to products/submit.php')
  assert.match(content, /@click="[^"]*submitProductForReview\(/, 'Must have button calling submitProductForReview with product id')
  assert.match(content, /Submit for Review/i, 'Must have "Submit for Review" button text')
})

test('SellerDashboard product cards support thumbnail resolution, error fallback, and 3D preview fallback', () => {
  const content = fs.readFileSync(COMPONENT_PATH, 'utf8')

  assert.match(content, /getProductThumbnail/, 'Must define getProductThumbnail helper')
  assert.match(content, /handleThumbnailImgError/, 'Must define handleThumbnailImgError helper')
  assert.match(content, /:src="resolveAssetUrl\(getProductThumbnail\(prod\)\)"/, 'Must bind resolved thumbnail asset url')
  assert.match(content, /@error="handleThumbnailImgError\(prod,\s*\$event\)"/, 'Must wire error fallback for thumbnails')
  assert.match(content, /<model-viewer[\s\S]*?:src="resolveAssetUrl\(prod\.glbPath\s*\|\|\s*prod\.glb_path\)"/, 'Must fallback to model-viewer for products without thumbnails')
})

test('SellerDashboard component strictly avoids physical DELETE statements', () => {
  const content = fs.readFileSync(COMPONENT_PATH, 'utf8')

  assert.doesNotMatch(content, /DELETE\s+FROM/i, 'Must NOT contain physical SQL DELETE FROM statements')
})
