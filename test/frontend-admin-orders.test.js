import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const ADMIN_PANEL_PATH = path.resolve('src/components/AdminPanel.vue')

test('AdminPanel.vue exists', () => {
  assert.ok(fs.existsSync(ADMIN_PANEL_PATH), 'src/components/AdminPanel.vue must exist')
})

test('AdminPanel navigation includes Marketplace Orders tab with pending badge', () => {
  const content = fs.readFileSync(ADMIN_PANEL_PATH, 'utf8')

  assert.match(content, /adminSection(?:\.value)?\s*===\s*['"]marketplace-orders['"]/, 'Must support adminSection === "marketplace-orders"')
  assert.match(content, /Marketplace Orders/i, 'Must have Marketplace Orders navigation tab label')
  assert.match(content, /pendingMarketplaceOrdersCount/, 'Must display pending marketplace orders count badge')
})

test('AdminPanel defines reactive state for global marketplace orders oversight', () => {
  const content = fs.readFileSync(ADMIN_PANEL_PATH, 'utf8')

  assert.match(content, /marketplaceOrders\s*=\s*ref\(\[\]\)/, 'Must declare marketplaceOrders ref')
  assert.match(content, /marketplaceOrderStatusFilter\s*=\s*ref\(['"]all['"]\)/, 'Must declare marketplaceOrderStatusFilter ref with default all')
  assert.match(content, /marketplaceOrderSearch\s*=\s*ref\(['"]['"]\)/, 'Must declare marketplaceOrderSearch ref')
  assert.match(content, /selectedOrderForReview\s*=\s*ref\(null\)/, 'Must declare selectedOrderForReview ref')
  assert.match(content, /(?:orderReviewNotes|orderNotes)\s*=\s*ref\(['"]['"]\)/, 'Must declare orderReviewNotes or orderNotes ref')
  assert.match(content, /pendingMarketplaceOrdersCount\s*=\s*computed\(/, 'Must compute pendingMarketplaceOrdersCount')
  assert.match(content, /confirmedMarketplaceOrdersCount\s*=\s*computed\(/, 'Must compute confirmedMarketplaceOrdersCount')
  assert.match(content, /readyMarketplaceOrdersCount\s*=\s*computed\(/, 'Must compute readyMarketplaceOrdersCount')
  assert.match(content, /completedMarketplaceOrdersCount\s*=\s*computed\(/, 'Must compute completedMarketplaceOrdersCount')
  assert.match(content, /cancelledMarketplaceOrdersCount\s*=\s*computed\(/, 'Must compute cancelledMarketplaceOrdersCount')
  assert.match(content, /filteredMarketplaceOrders\s*=\s*computed\(/, 'Must compute filteredMarketplaceOrders')
})

test('AdminPanel fetches orders from api/orders/list.php via fetchMarketplaceOrders() or loadData()', () => {
  const content = fs.readFileSync(ADMIN_PANEL_PATH, 'utf8')

  assert.match(content, /fetchMarketplaceOrders/, 'Must define fetchMarketplaceOrders function')
  assert.match(content, /api\(\s*['"]orders\/list\.php['"]\s*\)/, 'Must call api("orders/list.php")')
})

test('AdminPanel renders Marketplace Orders Oversight section when adminSection === "marketplace-orders"', () => {
  const content = fs.readFileSync(ADMIN_PANEL_PATH, 'utf8')

  assert.match(content, /v-else-if="adminSection\s*===\s*['"]marketplace-orders['"]"/, 'Must render section when adminSection === "marketplace-orders"')
  assert.match(content, /MARKETPLACE ORDERS OVERSIGHT|Marketplace Orders/i, 'Must have Marketplace Orders section title')
})

test('AdminPanel renders metric strip and status filter pills for orders', () => {
  const content = fs.readFileSync(ADMIN_PANEL_PATH, 'utf8')

  // Filter pills
  assert.match(content, /marketplaceOrderStatusFilter\s*===\s*['"]all['"]/, 'Filter pill for all orders')
  assert.match(content, /marketplaceOrderStatusFilter\s*===\s*['"]pending['"]/, 'Filter pill for pending orders')
  assert.match(content, /marketplaceOrderStatusFilter\s*===\s*['"]confirmed['"]/, 'Filter pill for confirmed orders')
  assert.match(content, /marketplaceOrderStatusFilter\s*===\s*['"]ready['"]/, 'Filter pill for ready orders')
  assert.match(content, /marketplaceOrderStatusFilter\s*===\s*['"]completed['"]/, 'Filter pill for completed orders')
  assert.match(content, /marketplaceOrderStatusFilter\s*===\s*['"]cancelled['"]/, 'Filter pill for cancelled orders')

  // Search input
  assert.match(content, /v-model="marketplaceOrderSearch"/, 'Must bind search input to marketplaceOrderSearch')
})

test('AdminPanel renders order data table with order ID, store, buyer, product, price, and pickup date', () => {
  const content = fs.readFileSync(ADMIN_PANEL_PATH, 'utf8')

  assert.match(content, /order\.id/, 'Must display order ID')
  assert.match(content, /order\.sellerStoreName|order\.seller_store_name/, 'Must display seller store name')
  assert.match(content, /order\.buyerName|order\.buyer_name/, 'Must display buyer name')
  assert.match(content, /order\.buyerEmail|order\.buyer_email/, 'Must display buyer email')
  assert.match(content, /order\.productName|order\.product_name/, 'Must display product name')
  assert.match(content, /order\.totalPrice|order\.total_price|order\.formattedTotalPrice/, 'Must display total price')
  assert.match(content, /order\.pickupDate|order\.pickup_date/, 'Must display pickup date')
})

test('AdminPanel displays brutalist status badges for marketplace orders', () => {
  const content = fs.readFileSync(ADMIN_PANEL_PATH, 'utf8')

  assert.match(content, /\[\s*PENDING\s*\]/i, 'Must render [ PENDING ] badge')
  assert.match(content, /\[\s*CONFIRMED\s*\]/i, 'Must render [ CONFIRMED ] badge')
  assert.match(content, /\[\s*READY(?:\s+FOR\s+PICKUP)?\s*\]/i, 'Must render [ READY FOR PICKUP ] or [ READY ] badge')
  assert.match(content, /\[\s*COMPLETED\s*\]/i, 'Must render [ COMPLETED ] badge')
  assert.match(content, /\[\s*CANCELLED\s*\]/i, 'Must render [ CANCELLED ] badge')
})

test('AdminPanel implements order status actions calling api/orders/update-status.php', () => {
  const content = fs.readFileSync(ADMIN_PANEL_PATH, 'utf8')

  assert.match(content, /api\(\s*['"]orders\/update-status\.php['"]\s*,\s*\{\s*method:\s*['"]POST['"]/, 'Must call api("orders/update-status.php", { method: "POST" })')
  assert.match(content, /(?:submitOrderAction|updateMarketplaceOrderStatus)/, 'Must have order status action handler function')
})

test('AdminPanel includes Order Details Review Modal with color swatches and charm choices', () => {
  const content = fs.readFileSync(ADMIN_PANEL_PATH, 'utf8')

  assert.match(content, /selectedOrderForReview/, 'Must use selectedOrderForReview for modal')
  assert.match(content, /customColors|custom_colors/, 'Must render custom color parts')
  assert.match(content, /customCharm|custom_charm/, 'Must render custom charm')
})

test('AdminPanel strictly avoids physical DELETE FROM queries', () => {
  const content = fs.readFileSync(ADMIN_PANEL_PATH, 'utf8')

  assert.doesNotMatch(content, /DELETE\s+FROM/i, 'Must NOT contain physical SQL DELETE FROM statements')
})
