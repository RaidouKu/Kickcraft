import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const APP_PATH = path.resolve('src/App.vue')

test('Unified Catalog: App.vue imports buildUnifiedCatalog and defines MarketplaceOrderModal async component', () => {
  assert.ok(fs.existsSync(APP_PATH), 'src/App.vue must exist')
  const content = fs.readFileSync(APP_PATH, 'utf8')

  assert.match(
    content,
    /import\s*\{[^}]*buildUnifiedCatalog[^}]*\}\s*from\s*['"]\.\/customization(?:\.js)?['"]/,
    'App.vue must import buildUnifiedCatalog from ./customization.js'
  )

  assert.match(
    content,
    /const\s+MarketplaceOrderModal\s*=\s*defineAsyncComponent\(\s*\(\)\s*=>\s*import\(['"]\.\/components\/MarketplaceOrderModal\.vue['"]\)\s*\)/,
    'App.vue must define MarketplaceOrderModal as an async component'
  )
})

test('Unified Catalog: App.vue declares reactive state for products, origin filter, and order modal', () => {
  const content = fs.readFileSync(APP_PATH, 'utf8')

  assert.match(
    content,
    /const\s+marketplaceProducts\s*=\s*ref\(\[\]\)/,
    'App.vue must declare marketplaceProducts reactive ref initialized to []'
  )

  assert.match(
    content,
    /const\s+originFilter\s*=\s*ref\(['"]all['"]\)/,
    'App.vue must declare originFilter reactive ref initialized to "all"'
  )

  assert.match(
    content,
    /const\s+isOrderModalOpen\s*=\s*ref\((?:false)?\)/,
    'App.vue must declare isOrderModalOpen reactive ref'
  )

  assert.match(
    content,
    /const\s+selectedOrderProduct\s*=\s*ref\((?:null)?\)/,
    'App.vue must declare selectedOrderProduct reactive ref'
  )
})

test('Unified Catalog: loadCatalog fetches both shoes/list.php and products/list.php', () => {
  const content = fs.readFileSync(APP_PATH, 'utf8')

  assert.match(
    content,
    /api\(['"]shoes\/list\.php['"]\)/,
    'loadCatalog must fetch shoes from shoes/list.php'
  )

  assert.match(
    content,
    /api\(['"]products\/list\.php['"]\)/,
    'loadCatalog must fetch marketplace products from products/list.php'
  )

  assert.match(
    content,
    /marketplaceProducts\.value\s*=/,
    'loadCatalog must populate marketplaceProducts.value'
  )
})

test('Unified Catalog: App.vue computes unifiedCatalog and filters by origin, category, and search query', () => {
  const content = fs.readFileSync(APP_PATH, 'utf8')

  assert.match(
    content,
    /const\s+unifiedCatalog\s*=\s*computed\(/,
    'App.vue must compute unifiedCatalog'
  )

  assert.match(
    content,
    /buildUnifiedCatalog\(/,
    'unifiedCatalog must call buildUnifiedCatalog()'
  )

  assert.match(
    content,
    /originFilter\.value/,
    'filteredCatalog must account for originFilter ("all", "originals", "sellers")'
  )
})

test('Unified Catalog: template renders origin filter pills (All, KickCraft Originals, Independent Sellers)', () => {
  const content = fs.readFileSync(APP_PATH, 'utf8')

  assert.match(content, /originFilter\s*===\s*['"]all['"]/, 'Template must include "All" origin filter toggle')
  assert.match(content, /originFilter\s*===\s*['"]originals['"]/, 'Template must include "KickCraft Originals" origin filter toggle')
  assert.match(content, /originFilter\s*===\s*['"]sellers['"]/, 'Template must include "Independent Sellers" origin filter toggle')

  assert.match(content, /KickCraft Originals/i, 'Template must display KickCraft Originals filter label')
  assert.match(content, /Independent Sellers/i, 'Template must display Independent Sellers filter label')
})

test('Unified Catalog: template renders brutalist attribution badges for originals and sellers', () => {
  const content = fs.readFileSync(APP_PATH, 'utf8')

  // KickCraft Originals badge
  assert.match(
    content,
    /\[\s*KICKCRAFT ORIGINAL\s*\]/,
    'Template must render [ KICKCRAFT ORIGINAL ] attribution badge for originals'
  )

  // Seller store attribution badge
  assert.match(
    content,
    /card\.attributionBadge|\[\s*BY\s+\{\{.*card\.storeName.*\}\}\s*\]|card\.storeName/i,
    'Template must render store attribution badge for seller items'
  )
})

test('Unified Catalog: action buttons route originals to Studio and seller items to MarketplaceOrderModal', () => {
  const content = fs.readFileSync(APP_PATH, 'utf8')

  // Studio action for originals
  assert.match(
    content,
    /goToStudio\(card\.shoeId\)|goToStudio\(/,
    'Action button for original shoes must invoke goToStudio'
  )

  // Order modal trigger for seller items
  assert.match(
    content,
    /openOrderModal|isOrderModalOpen\.value\s*=\s*true|selectedOrderProduct\.value\s*=/,
    'Action button for seller items must open order modal with product'
  )

  // Modal mounted
  assert.match(
    content,
    /<MarketplaceOrderModal[^>]*:is-open="isOrderModalOpen"[^>]*:product="selectedOrderProduct"/s,
    'Template must mount MarketplaceOrderModal with :is-open and :product props'
  )
})

test('Unified Catalog: contains zero physical SQL DELETE statements', () => {
  const content = fs.readFileSync(APP_PATH, 'utf8')
  assert.doesNotMatch(content, /DELETE\s+FROM/i, 'App.vue must contain zero physical SQL DELETE statements')
})
