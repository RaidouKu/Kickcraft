# Implementation Plan: Seller Thumbnail Upload & Admin 3D Inspection with Approval Confirmation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow sellers to upload custom thumbnail pictures for their products in the Seller Studio, and empower admins in the Admin Panel to visually inspect 3D shoe models in the Product Moderation modal before approving, with a confirmation modal protecting status transitions.

**Architecture:** 
1. Add authenticated seller thumbnail upload endpoint (`api/products/upload-thumbnail.php`) accepting JPG, PNG, and WebP, saving to `models/seller-uploads/` or `images/seller-uploads/`, returning the public asset path.
2. In `SellerDashboard.vue` Step 3 ("Details & Submission"), add a thumbnail upload/preview widget allowing sellers to upload an image or keep auto-fallback (such as source image or template card).
3. In `AdminPanel.vue`, embed an interactive Google `<model-viewer>` in the Product Moderation modal so admins can rotate and inspect the 3D model, parts, and charms directly before approving.
4. Protect the admin approval action (and status changes) with the existing brutalist `ConfirmModal.vue`, asking the admin to confirm before publishing the listing to the public marketplace.

**Tech Stack:** Vue 3, Google `<model-viewer>`, Tailwind CSS, PHP 8, MySQL / PDO, Node.js Test Runner (`node:test`).

## Global Constraints
- Preserve KickCraft brutalist aesthetic (`border-2 border-stone-900`, `shadow-[..._#202220]`, terracotta `#b94d27` accents, uppercase mono typography).
- Zero physical `DELETE FROM` statements in SQL or backend files.
- All 576 existing tests must continue to pass with zero regressions.
- All new functionality must have focused automated tests.
- Do not proceed with code implementation until explicit user confirmation is received.

---

### Task 1: Seller Thumbnail Upload Backend Endpoint (`api/products/upload-thumbnail.php`)

**Files:**
- Create: `api/products/upload-thumbnail.php`
- Create: `test/api/products/upload-thumbnail.test.js`

**Interfaces:**
- Consumes: `requireSeller($pdo)`, `currentSessionUser()`, `kcGetAiStorageBase()`, `$_FILES['thumbnail']` or `$_FILES['file']`
- Produces: JSON response `{ success: true, path: '/images/seller-uploads/{hash}.{ext}' }`

- [ ] **Step 1: Write failing test (`test/api/products/upload-thumbnail.test.js`)**
  - Tests requireSeller authentication (rejects guest and customer with 403/401).
  - Tests HTTP method (rejects GET with 405).
  - Tests missing file returns 400.
  - Tests file size limit (rejects files > 5MB with 413).
  - Tests extension validation (rejects `.exe`, `.glb`, `.txt` with 415; accepts `.png`, `.jpg`, `.jpeg`, `.webp`).
  - Tests successful upload returns `{ success: true, path: '/images/seller-uploads/...' }`.
  - Verifies zero physical SQL DELETE statements.

- [ ] **Step 2: Run test to verify it fails**
  - Run: `node --test test/api/products/upload-thumbnail.test.js`
  - Expected: FAIL with file not found.

- [ ] **Step 3: Implement `api/products/upload-thumbnail.php`**
  - Enforce `requireMethod('POST')` and `requireSeller($pdo)`.
  - Validate image format (`png`, `jpg`, `jpeg`, `webp`), size (max 5MB), and MIME types.
  - Generate 16-byte random hex name and store in `$baseDir . '/images/seller-uploads/'`.
  - Return `{ success: true, path: $relativePath }`.

- [ ] **Step 4: Run test to verify it passes**
  - Run: `node --test test/api/products/upload-thumbnail.test.js`
  - Expected: PASS

- [ ] **Step 5: Commit**
  - `git add api/products/upload-thumbnail.php test/api/products/upload-thumbnail.test.js`
  - `git commit -m "feat(products): implement seller product thumbnail upload endpoint"`

---

### Task 2: Seller Dashboard Product Thumbnail Upload UI (`SellerDashboard.vue`)

**Files:**
- Modify: `src/components/SellerDashboard.vue`
- Modify: `test/frontend-seller-wizard.test.js`

**Interfaces:**
- Consumes: `api('products/upload-thumbnail.php')`, `draftProduct.thumbnailPath`
- Produces: `thumbnailPath` passed in `products/create.php` and `products/update.php` payloads.

- [ ] **Step 1: Write failing test in `test/frontend-seller-wizard.test.js`**
  - Assert that `SellerDashboard.vue` declares `draftProduct.thumbnailPath` (or `draftThumbnailPath`).
  - Assert that Step 3 contains a thumbnail upload input (`accept="image/*"`) with thumbnail preview and change/remove options.
  - Assert that `executeSubmitProduct` passes `thumbnailPath` in create and update payloads.

- [ ] **Step 2: Run test to verify it fails**
  - Run: `node --test test/frontend-seller-wizard.test.js`
  - Expected: FAIL.

- [ ] **Step 3: Implement Thumbnail Upload in `SellerDashboard.vue`**
  - In `draftProduct`, add `thumbnailPath: ''`.
  - In `startWizard()`, reset `draftProduct.value.thumbnailPath = ''`.
  - In `startEditProduct(prod)`, populate `draftProduct.value.thumbnailPath = prod.thumbnailPath || prod.thumbnail_path || ''`.
  - In `selectTemplate(tpl)`, auto-suggest template image if available (`/images/kickcraft-one-card.png`, etc.).
  - In `handleAiGenerate`, auto-suggest uploaded side-profile photo as initial thumbnail preview.
  - Add `handleThumbnailUpload(event)` calling `api('products/upload-thumbnail.php', { method: 'POST', body: formData })`.
  - In Step 3 template, render a clean brutalist "Product Card Thumbnail Image (Optional)" card with upload button, preview image box, and "Remove" / "Change" controls.
  - In `executeSubmitProduct()`, include `thumbnailPath: draftProduct.value.thumbnailPath || null` in both update and create API requests.

- [ ] **Step 4: Run test to verify it passes**
  - Run: `node --test test/frontend-seller-wizard.test.js`
  - Expected: PASS

- [ ] **Step 5: Commit**
  - `git add src/components/SellerDashboard.vue test/frontend-seller-wizard.test.js`
  - `git commit -m "feat(seller): add product thumbnail upload and preview in seller creation wizard"`

---

### Task 3: Admin 3D Shoe Model Inspection in Product Review Modal (`AdminPanel.vue`)

**Files:**
- Modify: `src/components/AdminPanel.vue`
- Modify: `test/frontend-admin-products.test.js`

**Interfaces:**
- Consumes: `selectedProductForReview.glbPath`, `resolveAssetUrl(glbPath)`, `<model-viewer>`
- Produces: Interactive 3D shoe canvas rendered inside Admin Product Moderation modal.

- [ ] **Step 1: Write failing test in `test/frontend-admin-products.test.js`**
  - Assert that `selectedProductForReview` modal contains a `<model-viewer>` component with camera controls and auto-rotate.
  - Assert that `:src` is bound to `resolveAssetUrl(selectedProductForReview.glbPath || ...)` when GLB is present.
  - Assert that fallback/empty state is displayed gracefully if product has no 3D GLB.

- [ ] **Step 2: Run test to verify it fails**
  - Run: `node --test test/frontend-admin-products.test.js`
  - Expected: FAIL.

- [ ] **Step 3: Implement 3D Model Viewer in `AdminPanel.vue`**
  - Inside `selectedProductForReview` modal body:
    - Add a 3D inspection viewport (`h-64 sm:h-72 border-2 border-stone-900 bg-[#e9ece9]`) above the metadata grid.
    - Mount `<model-viewer>` with `camera-controls`, `auto-rotate`, `shadow-intensity="0.25"`, `:exposure="1.4"`, and `:src="resolveAssetUrl(selectedProductForReview.glbPath || selectedProductForReview.glb_path)"`.
    - Render a "3D Interactive Inspection · Click & Drag to Rotate" badge.
    - If `selectedProductForReview.thumbnailPath`, render thumbnail preview thumbnail badge alongside.
    - If no GLB path is present, render informative fallback box ("No 3D GLB file attached to this listing").

- [ ] **Step 4: Run test to verify it passes**
  - Run: `node --test test/frontend-admin-products.test.js`
  - Expected: PASS

- [ ] **Step 5: Commit**
  - `git add src/components/AdminPanel.vue test/frontend-admin-products.test.js`
  - `git commit -m "feat(admin): add interactive 3D model viewer to product moderation review modal"`

---

### Task 4: Admin Product Approval & Status Change Confirmation Modal (`AdminPanel.vue`)

**Files:**
- Modify: `src/components/AdminPanel.vue`
- Modify: `test/frontend-admin-products.test.js`

**Interfaces:**
- Consumes: `adminConfirm` state, `ConfirmModal.vue`, `submitProductReview()`
- Produces: Confirmation dialog triggered before approving, rejecting, or suspending a product.

- [ ] **Step 1: Write failing test in `test/frontend-admin-products.test.js`**
  - Assert that approving a product from table or modal triggers confirmation modal (`adminConfirm.value.show = true` or `confirmApproveProduct`).
  - Assert that confirm modal displays product name, store name, and confirmation text.
  - Assert that confirming executes `submitProductReview(productId, 'approved', notes)`.

- [ ] **Step 2: Run test to verify it fails**
  - Run: `node --test test/frontend-admin-products.test.js`
  - Expected: FAIL.

- [ ] **Step 3: Wire Confirmation Modal for Product Statuses in `AdminPanel.vue`**
  - Implement `confirmApproveProduct(product, notes)` and `confirmRejectProduct(product, notes)` helper methods.
  - Wire `adminConfirm.value` with:
    - Title: `"Approve Product for Public Marketplace?"`
    - Message: `Are you sure you want to approve "${product.name}" from ${product.storeName}? This will publish the 3D sneaker to the KickCraft marketplace for customer orders.`
    - Variant: `'default'` (or `'warning'` for reject/suspend).
    - `onConfirm: () => submitProductReview(product.id, 'approved', notes)`.
  - Update both the table "Approve" button and the Modal "Approve Listing" button to trigger `confirmApproveProduct`.
  - Similarly wrap "Reject" and "Suspend" actions with confirmation dialogs to prevent accidental clicks.

- [ ] **Step 4: Run test to verify it passes**
  - Run: `node --test test/frontend-admin-products.test.js`
  - Expected: PASS

- [ ] **Step 5: Commit**
  - `git add src/components/AdminPanel.vue test/frontend-admin-products.test.js`
  - `git commit -m "feat(admin): wire confirmation modal before approving or changing product statuses"`

---

### Task 5: End-to-End Verification & Full Test Suite

**Files:**
- Test: All test files (`npm test`)
- Build: `npm run build`

- [ ] **Step 1: Run comprehensive tests**
  - Run `cmd /c npm test`
  - Verify all 576+ tests pass with 0 failures.

- [ ] **Step 2: Production frontend build**
  - Run `cmd /c npm run build`
  - Ensure zero build errors or bundle warnings.

- [ ] **Step 3: Verification check**
  - Verify zero physical `DELETE FROM` statements.
  - Verify full backward compatibility with marketplace catalog and seller orders.
