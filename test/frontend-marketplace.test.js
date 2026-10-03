import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const MARKETPLACE_COMPONENT_PATH = path.resolve('src/components/MarketplaceView.vue')
const APP_PATH = path.resolve('src/App.vue')

test('MarketplaceView: component file exists and defines required props and emits', () => {
  assert.ok(fs.existsSync(MARKETPLACE_COMPONENT_PATH), 'src/components/MarketplaceView.vue must exist')
  const content = fs.readFileSync(MARKETPLACE_COMPONENT_PATH, 'utf8')

  // Props
  assert.match(content, /currentUser/, 'Must declare currentUser prop')
  // Emits
  assert.match(content, /defineEmits\(\s*\[[^\]]*['"]select-product['"][^\]]*\]\s*\)|defineEmits\(\s*\[[^\]]*['"]navigate-studio['"][^\]]*\]\s*\)/, 'Must define emits including select-product or navigate-studio')
})

test('MarketplaceView: declares reactive state for products, filters, loading, and error', () => {
  assert.ok(fs.existsSync(MARKETPLACE_COMPONENT_PATH), 'src/components/MarketplaceView.vue must exist')
  const content = fs.readFileSync(MARKETPLACE_COMPONENT_PATH, 'utf8')

  assert.match(content, /const\s+products\s*=\s*ref\(\[\]\)/, 'Must declare products reactive ref initialized to empty array')
  assert.match(content, /const\s+isLoading\s*=\s*ref\(/, 'Must declare isLoading reactive ref')
  assert.match(content, /const\s+error\s*=\s*ref\(['"]['"]\)/, 'Must declare error reactive ref')
  assert.match(content, /const\s+searchQuery\s*=\s*ref\(['"]['"]\)/, 'Must declare searchQuery reactive ref')
  assert.match(content, /const\s+(?:selectedMethod|filterMethod)\s*=\s*ref\(['"]all['"]\)/, 'Must declare selectedMethod or filterMethod ref initialized to "all"')
})

test('MarketplaceView: fetches public products from products/list.php on mount', () => {
  assert.ok(fs.existsSync(MARKETPLACE_COMPONENT_PATH), 'src/components/MarketplaceView.vue must exist')
  const content = fs.readFileSync(MARKETPLACE_COMPONENT_PATH, 'utf8')

  assert.match(content, /loadMarketplaceProducts|loadProducts/, 'Must define function to load marketplace products')
  assert.match(content, /api\(\s*['"]products\/list\.php['"]\s*\)/, 'Must call api("products/list.php")')
  assert.match(content, /products\.value\s*=\s*res\.products/, 'Must assign returned products to products.value')
  assert.match(content, /onMounted\(/, 'Must invoke load function in onMounted hook')
})

test('MarketplaceView: computes filteredProducts based on search query and creation method', () => {
  assert.ok(fs.existsSync(MARKETPLACE_COMPONENT_PATH), 'src/components/MarketplaceView.vue must exist')
  const content = fs.readFileSync(MARKETPLACE_COMPONENT_PATH, 'utf8')

  assert.match(content, /const\s+filteredProducts\s*=\s*computed\(/, 'Must declare filteredProducts computed property')
  assert.match(content, /searchQuery\.value/, 'filteredProducts must filter by search query')
  assert.match(content, /creationMethod|creation_method/, 'filteredProducts must filter by creation method')
})

test('MarketplaceView: renders brutalist hero section with title, subtitle, and seller CTA', () => {
  assert.ok(fs.existsSync(MARKETPLACE_COMPONENT_PATH), 'src/components/MarketplaceView.vue must exist')
  const content = fs.readFileSync(MARKETPLACE_COMPONENT_PATH, 'utf8')

  assert.match(content, /INDEPENDENT SELLER PLATFORM/i, 'Must render brutalist tag [ INDEPENDENT SELLER PLATFORM ]')
  assert.match(content, /KICKCRAFT MARKETPLACE/i, 'Must render hero heading KICKCRAFT MARKETPLACE')
  assert.match(content, /Discover custom sneakers from independent sellers/i, 'Must render subtitle')
  assert.match(content, /seller-register/i, 'Must link to seller registration')
})

test('MarketplaceView: renders search toolbar and creation method filter pills', () => {
  assert.ok(fs.existsSync(MARKETPLACE_COMPONENT_PATH), 'src/components/MarketplaceView.vue must exist')
  const content = fs.readFileSync(MARKETPLACE_COMPONENT_PATH, 'utf8')

  assert.match(content, /v-model="searchQuery"/, 'Must bind search input to searchQuery')
  assert.match(content, /All/i, 'Must have "All" filter option')
  assert.match(content, /Upload/i, 'Must have "Upload" filter option')
  assert.match(content, /AI Generated|AI 2D→3D/i, 'Must have "AI Generated" filter option')
  assert.match(content, /Template/i, 'Must have "Template" filter option')
})

test('MarketplaceView: renders product cards with model-viewer, price, badges, and action buttons', () => {
  assert.ok(fs.existsSync(MARKETPLACE_COMPONENT_PATH), 'src/components/MarketplaceView.vue must exist')
  const content = fs.readFileSync(MARKETPLACE_COMPONENT_PATH, 'utf8')

  // Product title and store name
  assert.match(content, /product\.name/, 'Must bind product.name')
  assert.match(content, /product\.storeName|product\.store_name/, 'Must display store name')

  // Price formatting with PHP peso symbol
  assert.match(content, /₱.*(?:product\.price|formattedPrice)/, 'Must format price with ₱ symbol')

  // Creation method badge
  assert.match(content, /product\.creationMethod|product\.creation_method|GLB UPLOAD|AI GENERATED|TEMPLATE/i, 'Must display creation method badge')

  // 3D model-viewer
  assert.match(content, /<model-viewer/i, 'Must include <model-viewer> component for 3D inspection')
  assert.match(content, /camera-controls/i, 'model-viewer must enable camera-controls')

  // Action button
  assert.match(content, /View in 3D|Customize & Order|Select Product/i, 'Must provide action button to view or customize')

  // Brutalist styling classes
  assert.match(content, /border-stone-900|border-\[#202220\]/, 'Must follow brutalist styling with dark stone borders')
  assert.match(content, /shadow-\[6px_6px_0px_#202220\]|shadow-\[8px_8px_0px_#202220\]/, 'Must include hard brutalist drop shadows')
})

test('MarketplaceView: renders empty state when no products match or catalog is empty', () => {
  assert.ok(fs.existsSync(MARKETPLACE_COMPONENT_PATH), 'src/components/MarketplaceView.vue must exist')
  const content = fs.readFileSync(MARKETPLACE_COMPONENT_PATH, 'utf8')

  assert.match(content, /filteredProducts\.length\s*===?\s*0|products\.length\s*===?\s*0/, 'Must check for empty products')
  assert.match(content, /No sneakers found|No marketplace products|No products match/i, 'Must display helpful empty state message')
})

test('App.vue: imports MarketplaceView asynchronously', () => {
  const content = fs.readFileSync(APP_PATH, 'utf8')
  assert.match(
    content,
    /const\s+MarketplaceView\s*=\s*defineAsyncComponent\(\s*\(\)\s*=>\s*import\(['"]\.\/components\/MarketplaceView\.vue['"]\)\s*\)/,
    'App.vue must define MarketplaceView async component'
  )
})

test('App.vue: routing handles marketplace and #marketplace in resolveCurrentRoute and getInitialView', () => {
  const content = fs.readFileSync(APP_PATH, 'utf8')

  // getInitialView supports marketplace
  assert.match(content, /['"]marketplace['"]/, 'getInitialView must include marketplace route')

  // resolveCurrentRoute supports marketplace
  assert.match(content, /target\s*===\s*['"]marketplace['"]|view\.value\s*=\s*['"]marketplace['"]/, 'resolveCurrentRoute must handle marketplace')

  // watch(view) handles marketplace
  assert.match(content, /watch\(view,/, 'Must watch view for route changes')
})

test('App.vue: mounts MarketplaceView component in main when view === "marketplace"', () => {
  const content = fs.readFileSync(APP_PATH, 'utf8')

  assert.match(content, /<MarketplaceView/i, 'Must mount MarketplaceView component')
  assert.match(content, /v-else-if="view\s*===\s*['"]marketplace['"]"|v-if="view\s*===\s*['"]marketplace['"]"/, 'Must conditionally render on view === "marketplace"')
  assert.match(content, /:current-user="currentUser"/, 'Must pass current-user prop to MarketplaceView')
})

test('Marketplace system strictly avoids physical DELETE FROM SQL statements', () => {
  const filesToCheck = [APP_PATH]
  if (fs.existsSync(MARKETPLACE_COMPONENT_PATH)) {
    filesToCheck.push(MARKETPLACE_COMPONENT_PATH)
  }

  for (const file of filesToCheck) {
    const text = fs.readFileSync(file, 'utf8')
    assert.doesNotMatch(text, /DELETE\s+FROM/i, `${file} must NOT contain physical SQL DELETE FROM statements`)
  }
})
