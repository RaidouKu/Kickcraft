# Unified Shop & Marketplace Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify the KickCraft Shop and Marketplace into a single storefront page with brand and company attribution ('KickCraft Original' for owner designs vs store name for seller listings).

**Architecture:** Fetch both KickCraft catalog shoes and approved seller marketplace products in `App.vue`, normalize them into a unified catalog list, render them with brutalist attribution badges in the main Shop view, and provide an origin filter (`All / KickCraft Originals / Independent Sellers`) while supporting 3D studio customization for originals and 3D order modal checkout for seller shoes.

**Tech Stack:** Vue 3, Tailwind CSS, Google `<model-viewer>`, PHP API / MySQL.

**Spec:** `docs/superpowers/specs/2026-10-05-unified-shop-marketplace-design.md`

## Global Constraints
- Zero physical SQL `DELETE FROM` statements; preserve soft-delete conventions.
- Maintain full compatibility with all 548 existing automated tests.
- High-contrast brutalist styling: dark stone borders (`border-stone-900`), hard drop shadows (`shadow-[4px_4px_0px_#202220]`), terracotta `#b94d27` accents, monospace tags.
- Preserves 3D `<model-viewer>` and charm placement.

---

### Task 1: Catalog Normalization & Data Adapter (`src/customization.js`)

**Files:**
- Create: `test/frontend-unified-catalog-adapter.test.js`
- Modify: `src/customization.js`

**Interfaces:**
- Consumes: Raw shoe rows from `api/shoes/list.php` and raw product rows from `api/products/list.php`.
- Produces: `normalizeCatalogItem(item, type)`, `buildUnifiedCatalog(shoes, products)`, returning normalized items with `isOriginal`, `storeName`, `attributionBadge`, `formattedPrice`, `categories`, and `actionType`.

- [ ] **Step 1: Write the failing test**

```javascript
// test/frontend-unified-catalog-adapter.test.js
import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeCatalogItem, buildUnifiedCatalog } from '../src/customization.js'

test('normalizeCatalogItem: formats KickCraft Original shoe correctly', () => {
  const shoe = {
    id: 'kickcraft-one',
    name: 'KickCraft One',
    description: 'Our original customizable sneaker.',
    price: 4890,
    categories: ['sneakers', 'kickcraft'],
    thumbnailPath: '/images/kickcraft-one-card.png',
  }

  const normalized = normalizeCatalogItem(shoe, 'shoe')

  assert.equal(normalized.id, 'kickcraft-one')
  assert.equal(normalized.isOriginal, true)
  assert.equal(normalized.storeName, 'KickCraft Original')
  assert.equal(normalized.attributionBadge, '[ KICKCRAFT ORIGINAL ]')
  assert.equal(normalized.formattedPrice, '₱4,890')
  assert.equal(normalized.actionType, 'studio')
})

test('normalizeCatalogItem: formats Independent Seller product correctly', () => {
  const product = {
    id: 'KCP-2026-0001',
    name: 'Apex Runner 90',
    description: 'Streetwear sneaker.',
    price: 5200,
    storeName: 'Apex Footwear',
    creationMethod: 'upload',
    glbPath: '/uploads/products/apex.glb',
    thumbnailPath: '/uploads/products/apex.png',
    categories: ['running'],
  }

  const normalized = normalizeCatalogItem(product, 'product')

  assert.equal(normalized.id, 'KCP-2026-0001')
  assert.equal(normalized.isOriginal, false)
  assert.equal(normalized.storeName, 'Apex Footwear')
  assert.equal(normalized.attributionBadge, '[ BY APEX FOOTWEAR ]')
  assert.equal(normalized.formattedPrice, '₱5,200')
  assert.equal(normalized.actionType, 'order_modal')
})

test('buildUnifiedCatalog: combines shoes and products with originals first', () => {
  const shoes = [
    { id: 'kickcraft-one', name: 'KickCraft One', price: 4890 },
  ]
  const products = [
    { id: 'KCP-2026-0001', name: 'Apex Runner', price: 5200, storeName: 'Apex Footwear' },
  ]

  const catalog = buildUnifiedCatalog(shoes, products)

  assert.equal(catalog.length, 2)
  assert.equal(catalog[0].id, 'kickcraft-one')
  assert.equal(catalog[0].isOriginal, true)
  assert.equal(catalog[1].id, 'KCP-2026-0001')
  assert.equal(catalog[1].isOriginal, false)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/frontend-unified-catalog-adapter.test.js`
Expected: FAIL with "normalizeCatalogItem is not a function"

- [ ] **Step 3: Implement `normalizeCatalogItem` and `buildUnifiedCatalog` in `src/customization.js`**

Add to `src/customization.js`:
```javascript
export function normalizeCatalogItem(item, type = 'shoe') {
  if (!item) return null

  const isShoe = type === 'shoe' || item.isOriginal || (!item.sellerId && !item.seller_id && !item.storeName && !item.store_name)
  const price = Number(item.price || 0)
  const formattedPrice = item.formattedPrice || ('₱' + price.toLocaleString())

  if (isShoe) {
    return {
      id: String(item.id || ''),
      shoeId: String(item.id || ''),
      name: String(item.name || ''),
      description: String(item.description || ''),
      price,
      formattedPrice,
      image: item.thumbnailPath || item.thumbnail_path || item.image || '/images/kickcraft-one-card.png',
      isOriginal: true,
      storeName: 'KickCraft Original',
      attributionBadge: '[ KICKCRAFT ORIGINAL ]',
      actionType: 'studio',
      category: Array.isArray(item.categories) && item.categories[0] ? item.categories[0] : (item.category || 'sneakers'),
      categories: Array.isArray(item.categories) ? item.categories : ['sneakers', 'kickcraft'],
      status: item.status || 'live',
      rawItem: item,
    }
  }

  const rawStoreName = item.storeName || item.store_name || 'Independent Seller'
  const storeName = String(rawStoreName).trim()
  const cleanStoreForBadge = storeName.toUpperCase().replace(/^BY\s+/i, '')

  return {
    id: String(item.id || ''),
    productId: String(item.id || ''),
    name: String(item.name || ''),
    description: String(item.description || ''),
    price,
    formattedPrice,
    image: item.thumbnailPath || item.thumbnail_path || item.glbPath || item.glb_path || '/images/kickcraft-one-card.png',
    glbPath: item.glbPath || item.glb_path || null,
    isOriginal: false,
    storeName,
    attributionBadge: `[ BY ${cleanStoreForBadge} ]`,
    creationMethod: item.creationMethod || item.creation_method || 'upload',
    actionType: 'order_modal',
    category: item.category || (Array.isArray(item.categories) && item.categories[0]) || 'sneakers',
    categories: Array.isArray(item.categories) ? item.categories : ['sneakers'],
    status: item.status === 'approved' ? 'live' : (item.status || 'draft'),
    stock: Number(item.stock ?? 0),
    sizesAvailable: item.sizesAvailable || item.sizes_available || [],
    rawItem: item,
  }
}

export function buildUnifiedCatalog(shoes = [], products = []) {
  const normalizedShoes = (shoes || []).map((s) => normalizeCatalogItem(s, 'shoe')).filter(Boolean)
  const normalizedProducts = (products || []).map((p) => normalizeCatalogItem(p, 'product')).filter(Boolean)
  return [...normalizedShoes, ...normalizedProducts]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/frontend-unified-catalog-adapter.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```powershell
git add test/frontend-unified-catalog-adapter.test.js src/customization.js
git commit -m "feat(catalog): add normalizeCatalogItem and buildUnifiedCatalog adapter"
```

---

### Task 2: 3D Marketplace Order Modal Component (`src/components/MarketplaceOrderModal.vue`)

**Files:**
- Create: `test/frontend-marketplace-order-modal.test.js`
- Create: `src/components/MarketplaceOrderModal.vue`
- Modify: `src/components/MarketplaceView.vue`

**Interfaces:**
- Consumes: `props: { isOpen: Boolean, product: Object }`, `emits: ['close', 'order-placed']`.
- Produces: Interactive modal with 3D model-viewer, color palette, charm picker, size picker, guest checkout inputs, and order submission via `api('orders/create.php')`.

- [ ] **Step 1: Write the failing test**

```javascript
// test/frontend-marketplace-order-modal.test.js
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const MODAL_PATH = path.resolve('src/components/MarketplaceOrderModal.vue')

test('MarketplaceOrderModal: component file exists and defines props and emits', () => {
  assert.ok(fs.existsSync(MODAL_PATH), 'src/components/MarketplaceOrderModal.vue must exist')
  const content = fs.readFileSync(MODAL_PATH, 'utf8')

  assert.match(content, /isOpen/, 'Must accept isOpen prop')
  assert.match(content, /product/, 'Must accept product prop')
  assert.match(content, /defineEmits\(\s*\[[^\]]*['"]close['"][^\]]*\]\s*\)/, 'Must emit close event')
})

test('MarketplaceOrderModal: renders model-viewer, guest checkout inputs, and submit button', () => {
  const content = fs.readFileSync(MODAL_PATH, 'utf8')

  assert.match(content, /<model-viewer/i, 'Must render 3D model-viewer')
  assert.match(content, /orderBuyerName/, 'Must have buyer name model')
  assert.match(content, /orderBuyerEmail/, 'Must have buyer email model')
  assert.match(content, /orderPickupDate/, 'Must have pickup date model')
  assert.match(content, /api\(\s*['"]orders\/create\.php['"]/, 'Must call api("orders/create.php")')
  assert.doesNotMatch(content, /DELETE\s+FROM/i, 'Must contain zero physical SQL DELETE statements')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/frontend-marketplace-order-modal.test.js`
Expected: FAIL with "MarketplaceOrderModal.vue must exist"

- [ ] **Step 3: Create `src/components/MarketplaceOrderModal.vue`**

Implement `src/components/MarketplaceOrderModal.vue` encapsulating the 3D customizer & checkout modal with KickCraft brutalist styling:
- Props: `isOpen`, `product`. Emits: `close`, `order-placed`.
- 3D `<model-viewer>` with camera-controls, charm rendering (`<extra-model>`), and colorway applying.
- Form inputs: Customer Name, Customer Email, Pickup Date (using `minPickupDate`), Size selection, Notes.
- Order submission calling `api('orders/create.php')` and broadcast channel notification.
- Success receipt view with copy order reference button.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/frontend-marketplace-order-modal.test.js`
Expected: PASS

- [ ] **Step 5: Update `src/components/MarketplaceView.vue` to reuse `MarketplaceOrderModal.vue`**

Ensure `MarketplaceView.vue` imports and uses `MarketplaceOrderModal.vue` while preserving all existing test assertions in `test/frontend-marketplace.test.js` and `test/frontend-ai-charm-only.test.js`.

- [ ] **Step 6: Run existing marketplace tests to verify no regressions**

Run: `node --test test/frontend-marketplace.test.js test/frontend-ai-charm-only.test.js`
Expected: PASS (all tests pass)

- [ ] **Step 7: Commit**

```powershell
git add test/frontend-marketplace-order-modal.test.js src/components/MarketplaceOrderModal.vue src/components/MarketplaceView.vue
git commit -m "feat(modal): create reusable MarketplaceOrderModal component"
```

---

### Task 3: Unified Storefront & Attribution in `src/App.vue`

**Files:**
- Create: `test/frontend-unified-catalog.test.js`
- Modify: `src/App.vue`

**Interfaces:**
- Consumes: `buildUnifiedCatalog` from `src/customization.js`, `MarketplaceOrderModal` component, `api('shoes/list.php')`, `api('products/list.php')`.
- Produces: Single unified Shop storefront (`view === 'shop'`) rendering both KickCraft Originals and Seller creations with Origin filter (`All`, `KickCraft Originals`, `Independent Sellers`), category filters, search input, and brand attribution badges.

- [ ] **Step 1: Write the failing test**

```javascript
// test/frontend-unified-catalog.test.js
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const APP_PATH = path.resolve('src/App.vue')

test('App.vue: loads both shoes and marketplace products into unified catalog', () => {
  const content = fs.readFileSync(APP_PATH, 'utf8')

  assert.match(content, /api\(\s*['"]shoes\/list\.php['"]\s*\)/, 'Must fetch shoes from shoes/list.php')
  assert.match(content, /api\(\s*['"]products\/list\.php['"]\s*\)/, 'Must fetch products from products/list.php')
  assert.match(content, /unifiedCatalog|displayCatalog/, 'Must maintain unified catalog reactive state')
})

test('App.vue: renders origin filter pills for All, KickCraft Originals, and Independent Sellers', () => {
  const content = fs.readFileSync(APP_PATH, 'utf8')

  assert.match(content, /originFilter|selectedOrigin/, 'Must declare origin filter state')
  assert.match(content, /KickCraft Originals/i, 'Must have KickCraft Originals origin filter pill')
  assert.match(content, /Independent Sellers/i, 'Must have Independent Sellers origin filter pill')
})

test('App.vue: renders attribution badges for KickCraft Original vs Seller Company Name', () => {
  const content = fs.readFileSync(APP_PATH, 'utf8')

  assert.match(content, /KICKCRAFT ORIGINAL/i, 'Must render [ KICKCRAFT ORIGINAL ] attribution badge')
  assert.match(content, /card\.attributionBadge|card\.storeName|BY\s+/i, 'Must render seller store name attribution badge')
})

test('App.vue: mounts MarketplaceOrderModal for seller shoes in shop view', () => {
  const content = fs.readFileSync(APP_PATH, 'utf8')

  assert.match(content, /MarketplaceOrderModal/i, 'App.vue must mount MarketplaceOrderModal')
  assert.doesNotMatch(content, /DELETE\s+FROM/i, 'App.vue must NOT contain physical SQL DELETE statements')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/frontend-unified-catalog.test.js`
Expected: FAIL with missing origin filter pills or unified products fetch

- [ ] **Step 3: Modify `src/App.vue`**

1. Import `normalizeCatalogItem` and `buildUnifiedCatalog` from `./customization.js`.
2. Import `MarketplaceOrderModal` defineAsyncComponent (`./components/MarketplaceOrderModal.vue`).
3. Update `loadCatalog()`:
   ```javascript
   const marketplaceProducts = ref([])
   async function loadCatalog() {
     catalogLoading.value = true
     catalogError.value = ''
     try {
       const [shoesRes, productsRes] = await Promise.allSettled([
         api('shoes/list.php'),
         api('products/list.php')
       ])
       if (shoesRes.status === 'fulfilled' && Array.isArray(shoesRes.value?.shoes)) {
         adminShoes.value = shoesRes.value.shoes
       }
       if (productsRes.status === 'fulfilled' && Array.isArray(productsRes.value?.products)) {
         marketplaceProducts.value = productsRes.value.products
       }
     } catch (err) {
       catalogError.value = err.message || 'Failed to load catalog'
     } finally {
       catalogLoading.value = false
     }
   }
   ```
4. Define `originFilter = ref('all')` ('all', 'originals', 'sellers').
5. Update `unifiedCatalog` and `filteredCatalog` computed properties:
   - Filter by `searchQuery` (matching shoe name, description, categories, or storeName).
   - Filter by `originFilter`:
     - `'originals'`: only `card.isOriginal === true`
     - `'sellers'`: only `card.isOriginal === false`
   - Filter by `activeCategory`.
6. Update Shop view markup:
   - Origin Filter Pills strip above category pills:
     `[ All ({{ totalCount }}) ]`, `[ KickCraft Originals ]`, `[ Independent Sellers ]`
   - Grid cards:
     - Prominent Attribution Badge on each card:
       - If `card.isOriginal`: `[ KICKCRAFT ORIGINAL ]` (Charcoal & Terracotta)
       - If `!card.isOriginal`: `[ BY {{ card.storeName.toUpperCase() }} ]` + Method pill
     - Action button:
       - If `card.isOriginal`: "Customize & Reserve" -> `goToStudio(card.shoeId)`
       - If `!card.isOriginal`: "Customize & Order" -> opens `MarketplaceOrderModal` with `selectedOrderProduct = card.rawItem`
7. In `goToMarketplace()`:
   - Sets `view.value = 'shop'` with `originFilter.value = 'sellers'` and scrolls to catalog (while preserving `#marketplace` route handling so existing tests and bookmarks work).
8. Mount `<MarketplaceOrderModal>` in `App.vue`:
   `<MarketplaceOrderModal :is-open="isOrderModalOpen" :product="selectedOrderProduct" @close="isOrderModalOpen = false" />`

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/frontend-unified-catalog.test.js`
Expected: PASS

- [ ] **Step 5: Run all header and marketplace regression tests**

Run: `node --test test/frontend-header-marketplace.test.js test/frontend-marketplace.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```powershell
git add test/frontend-unified-catalog.test.js src/App.vue
git commit -m "feat(shop): unify shop and marketplace on single page with brand and company attribution"
```

---

### Task 4: Full Suite Verification & Build

**Files:**
- Verification only

- [ ] **Step 1: Run complete test suite**

Run: `cmd /c npm test`
Expected: All tests pass (0 failures).

- [ ] **Step 2: Run Vite production build**

Run: `cmd /c npm run build`
Expected: Build succeeds with 0 errors.

- [ ] **Step 3: Verify git status is clean**

Run: `git status`
Expected: Clean working tree.
