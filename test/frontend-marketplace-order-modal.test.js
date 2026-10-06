import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const MODAL_PATH = path.resolve('src/components/MarketplaceOrderModal.vue')

test('MarketplaceOrderModal: component file exists and defines required props and emits', () => {
  assert.ok(fs.existsSync(MODAL_PATH), 'src/components/MarketplaceOrderModal.vue must exist')
  const content = fs.readFileSync(MODAL_PATH, 'utf8')

  // Props
  assert.match(content, /isOpen/, 'Must declare isOpen prop')
  assert.match(content, /product/, 'Must declare product prop')

  // Emits
  assert.match(
    content,
    /defineEmits\(\s*\[[^\]]*['"]close['"][^\]]*['"]order-placed['"][^\]]*\]\s*\)|defineEmits\(\s*\[[^\]]*['"]order-placed['"][^\]]*['"]close['"][^\]]*\]\s*\)/,
    'Must define emits including close and order-placed'
  )
})

test('MarketplaceOrderModal: renders 3D model-viewer with camera-controls and extra-model charms', () => {
  assert.ok(fs.existsSync(MODAL_PATH), 'src/components/MarketplaceOrderModal.vue must exist')
  const content = fs.readFileSync(MODAL_PATH, 'utf8')

  assert.match(content, /<model-viewer/i, 'Must render <model-viewer>')
  assert.match(content, /camera-controls/i, 'model-viewer must enable camera-controls')
  assert.match(content, /<extra-model/i, 'Must support 3D accessory charms via <extra-model>')
  assert.match(content, /star-charm\.glb/i, 'Must include Star charm')
  assert.match(content, /k-tag-charm\.glb/i, 'Must include K-Tag charm')
  assert.match(content, /lightning-charm\.glb/i, 'Must include Lightning charm')
})

test('MarketplaceOrderModal: supports single-mesh and multi-mesh handling via isPartCustomizable', () => {
  assert.ok(fs.existsSync(MODAL_PATH), 'src/components/MarketplaceOrderModal.vue must exist')
  const content = fs.readFileSync(MODAL_PATH, 'utf8')

  assert.match(content, /isPartCustomizable/, 'Must use isPartCustomizable for mesh capability detection')
  assert.match(content, /SINGLE COMBINED MESH · OVERALL COLOR/i, 'Must display single combined mesh notice')
  assert.match(content, /id:\s*['"]shoe['"]/, 'Must provide fallback shoe part for single mesh models')
})

test('MarketplaceOrderModal: provides size selection and guest checkout form fields', () => {
  assert.ok(fs.existsSync(MODAL_PATH), 'src/components/MarketplaceOrderModal.vue must exist')
  const content = fs.readFileSync(MODAL_PATH, 'utf8')

  // Sizes array
  assert.match(content, /7\s*,\s*7\.5\s*,\s*8\s*,\s*8\.5\s*,\s*9\s*,\s*9\.5\s*,\s*10\s*,\s*10\.5\s*,\s*11\s*,\s*12/, 'Must include standard sizes list')

  // Form reactive bindings
  assert.match(content, /orderBuyerName/, 'Must have orderBuyerName ref/model')
  assert.match(content, /orderBuyerEmail/, 'Must have orderBuyerEmail ref/model')
  assert.match(content, /orderPickupDate/, 'Must have orderPickupDate ref/model')
  assert.match(content, /orderSize/, 'Must have orderSize ref/model')
  assert.match(content, /orderNotes/, 'Must have orderNotes ref/model')
})

test('MarketplaceOrderModal: submits order to orders/create.php and renders confirmation receipt', () => {
  assert.ok(fs.existsSync(MODAL_PATH), 'src/components/MarketplaceOrderModal.vue must exist')
  const content = fs.readFileSync(MODAL_PATH, 'utf8')

  assert.match(content, /api\(\s*['"]orders\/create\.php['"]/, 'Must submit order to api("orders/create.php")')
  assert.match(content, /emit\(\s*['"]order-placed['"]/, 'Must emit order-placed event upon success')
  assert.match(content, /orderReceipt/, 'Must hold orderReceipt state')
  assert.match(content, /copyOrderReference|receiptCopied/, 'Must provide copy order reference functionality')
  assert.match(content, /ORDER CONFIRMED|Pickup Order Placed/i, 'Must render confirmation receipt text')
})

test('MarketplaceOrderModal: does not display color wheel or arbitrary add color input for users (reserved for sellers only)', () => {
  assert.ok(fs.existsSync(MODAL_PATH), 'src/components/MarketplaceOrderModal.vue must exist')
  const content = fs.readFileSync(MODAL_PATH, 'utf8')

  assert.doesNotMatch(
    content,
    /<input[^>]*type="color"/i,
    'MarketplaceOrderModal must not show type="color" color wheel for buyers/users'
  )

  assert.doesNotMatch(
    content,
    /Custom Color Wheel/i,
    'MarketplaceOrderModal must not display Custom Color Wheel picker'
  )
})

test('MarketplaceOrderModal: contains zero physical SQL DELETE statements', () => {
  assert.ok(fs.existsSync(MODAL_PATH), 'src/components/MarketplaceOrderModal.vue must exist')
  const content = fs.readFileSync(MODAL_PATH, 'utf8')

  assert.doesNotMatch(content, /DELETE\s+FROM/i, 'Must contain zero physical SQL DELETE FROM statements')
})

