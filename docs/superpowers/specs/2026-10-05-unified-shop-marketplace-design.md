# Unified Shop & Marketplace Storefront Design Specification

## Overview & System Identity
KickCraft is an interactive 3D shoe customization studio and seller-driven marketplace.
Currently, KickCraft separates the core catalog (Shop) and independent seller designs (Marketplace) into distinct views (`#shop` and `#marketplace`).

This specification defines a **unified storefront** on the main Shop page where both **KickCraft Originals** and **Independent Seller Designs** are featured together in a single catalog, while maintaining distinct, clear brand and company attribution:
1. **KickCraft Originals (Owner-created / Flagship shoes):** Labeled with `[ KICKCRAFT ORIGINAL ]`.
2. **Seller Designs:** Labeled with their verified company/store name: `[ BY {STORE_NAME} ]`.

---

## 1. User Workflows

### 1.1 Customer Unified Browsing Workflow
1. Customer visits the KickCraft storefront (`#shop`).
2. Customer views the 3D Hero product viewer at the top (KickCraft One interactive 3D model).
3. Below the Hero, the customer sees the unified search, origin/brand filter, and category filter toolbar:
   - **Origin Filter Pills:** `All Products (Total)` | `KickCraft Originals` | `Independent Sellers`
   - **Category Filter Pills:** `All` | `Sneakers` | `Basketball` | `Running` | `Fashion`
   - **Search Input:** Real-time search across shoe name, description, category, and company/store name.
4. Product grid presents cards with prominent brand attribution:
   - **KickCraft Originals:** Displays `[ KICKCRAFT ORIGINAL ]` badge in high-contrast brutalist style. Clicking "Customize & Reserve" routes directly to the 3D Studio customizer.
   - **Seller Designs:** Displays `[ BY {STORE_NAME} ]` badge and creation method badge (`[ GLB UPLOAD ]`, `[ AI GENERATED ]`, `[ TEMPLATE ]`). Clicking "Customize & Order" opens the interactive 3D Order Modal.
5. In the 3D Order Modal for seller shoes, customer rotates the 3D model, customizes colors or charm, selects size, and completes guest pickup order.

### 1.2 Route & Navigation Unification
- Desktop and Mobile Header Nav:
  - Consolidates primary storefront navigation to **"Shop"** (unified catalog).
  - Preserves the "Marketplace" link in header navigation (`href="#marketplace"` and `goToMarketplace()`) to maintain full backward compatibility with automated test suites and existing links.
  - When `#marketplace` is visited or clicked, it activates the `Independent Sellers` origin filter on the storefront (or navigates to the marketplace section), giving customers an immediate view of seller creations while remaining unified.

---

## 2. Brand & Attribution Architecture

### 2.1 Owner vs Seller Source Determination
| Source | Origin Condition | Attribution Display | Destination on Click |
|---|---|---|---|
| **KickCraft Original** | Row from `shoes` table (managed by Owner via Admin Inventory), or product where `is_original = 1` or seller is owner | `[ KICKCRAFT ORIGINAL ]` (Charcoal & Terracotta brutalist badge) | 3D Studio (`goToStudio(shoeId)`) |
| **Independent Seller** | Row from `products` table where `seller_id` belongs to an approved seller | `[ BY {store_name} ]` (Monospaced uppercase badge) + Method pill | 3D Customizer & Order Modal |

### 2.2 Data Adapter Model (`formatUnifiedCatalogItem`)
In `src/customization.js` or `src/App.vue`:
```javascript
export function normalizeCatalogItem(item, type = 'shoe') {
  if (type === 'shoe' || item.isOriginal || !item.sellerId) {
    return {
      id: item.id,
      shoeId: item.id,
      name: item.name,
      description: item.description || '',
      price: item.price,
      formattedPrice: item.formattedPrice || `₱${Number(item.price).toLocaleString()}`,
      image: item.thumbnailPath || item.image || '/images/kickcraft-one-card.png',
      isOriginal: true,
      storeName: 'KickCraft Original',
      attributionBadge: '[ KICKCRAFT ORIGINAL ]',
      category: (item.categories && item.categories[0]) || 'sneakers',
      categories: item.categories || ['sneakers', 'kickcraft'],
      status: item.status || 'live',
      rawItem: item,
    }
  } else {
    const storeName = item.storeName || item.store_name || 'Independent Seller'
    return {
      id: item.id,
      productId: item.id,
      name: item.name,
      description: item.description || '',
      price: item.price,
      formattedPrice: item.formattedPrice || `₱${Number(item.price).toLocaleString()}`,
      image: item.thumbnailPath || item.thumbnail_path || item.glbPath || item.glb_path,
      glbPath: item.glbPath || item.glb_path,
      isOriginal: false,
      storeName: storeName,
      attributionBadge: `[ BY ${storeName.toUpperCase()} ]`,
      creationMethod: item.creationMethod || item.creation_method || 'upload',
      category: item.category || (item.categories && item.categories[0]) || 'sneakers',
      categories: item.categories || ['sneakers'],
      status: item.status === 'approved' ? 'live' : item.status,
      stock: item.stock ?? 0,
      sizesAvailable: item.sizesAvailable || item.sizes_available || [],
      rawItem: item,
    }
  }
}
```

---

## 3. UI/UX Design & Brutalist Aesthetics

### 3.1 Unified Catalog Card Layout
- **Container:** High-contrast brutalist card: `border-2 border-stone-900 bg-[#fcfdfb] shadow-[4px_4px_0px_#202220] hover:shadow-[6px_6px_0px_#202220] hover:-translate-y-0.5 transition-all`
- **Header Badges Row:**
  - Left: Attribution Badge
    - For KickCraft Originals: `bg-[#292b2d] text-white px-2 py-0.5 text-[11px] font-mono font-bold tracking-wider`
    - For Sellers: `bg-[#fcf5eb] text-[#b94d27] border border-[#b94d27] px-2 py-0.5 text-[11px] font-mono font-bold tracking-wider`
  - Right: Method pill (for sellers) or `[ OFFICIAL STUDIO ]` (for originals).
- **Media Preview:**
  - For Originals: High-resolution catalog render with fallback 3D badge.
  - For Sellers: Thumbnail image or interactive 3D model container.
- **Card Body:**
  - Shoe Title (`font-display font-black text-xl text-[#202220]`)
  - Subtitle / Store Name
  - Formatted Price in PHP (`text-[#b94d27] font-black text-lg`)
- **Action Button:**
  - Originals: "Customize & Reserve →" (opens 3D Studio)
  - Sellers: "Customize & Order →" (opens 3D Order Modal)

### 3.2 3D Order Modal Integration
- When clicking a seller product from the unified grid, the 3D Order Modal opens directly over the page:
  - 3D `<model-viewer>` with camera controls, auto-rotate, and interaction prompt.
  - Single-mesh vs multi-mesh colorway customizer or color wheel.
  - Interchangeable 3D charm selection (Star, K-Tag, Lightning).
  - Shoe size selection buttons (US 7 - 12).
  - Guest pickup reservation form (Name, Email, Pickup Date offset min 7 days, Notes).
  - Order confirmation receipt with order ID (`KCO-YYYY-XXXX`) and clipboard copy button.

---

## 4. Verification & Testing Strategy
1. **Test `test/frontend-unified-catalog.test.js`:**
   - Verifies `App.vue` loads both `shoes/list.php` and `products/list.php`.
   - Verifies unified catalog rendering KickCraft Originals with `[ KICKCRAFT ORIGINAL ]`.
   - Verifies unified catalog rendering Seller shoes with `[ BY {STORE_NAME} ]`.
   - Verifies Origin filter pills (`All`, `KickCraft Originals`, `Independent Sellers`).
   - Verifies search input filters across shoe title and seller store name.
   - Verifies action button routing: Originals call `goToStudio()`, Seller shoes trigger 3D order modal.
2. **Preservation of Existing Tests:**
   - `test/frontend-marketplace.test.js` passes without modification.
   - `test/frontend-header-marketplace.test.js` passes without modification.
   - `test/frontend-ai-charm-only.test.js` passes without modification.
   - All 548 existing automated tests continue passing (`cmd /c npm test`).
