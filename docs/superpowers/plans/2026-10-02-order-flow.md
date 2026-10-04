# Sub-project 3: E-Commerce Order Flow — Implementation Plan
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the E-Commerce Order Flow for KickCraft seller products, including database tables, APIs, and frontend integration for guest checkout, tracking, and seller/admin management.
**Architecture:** PHP API endpoints for order CRUD, Vue 3 frontend for checkout, tracking, and dashboard tabs, backed by MySQL.
**Tech Stack:** Vue 3, PHP, MySQL, Node.js (for tests)
**Spec:** `docs/superpowers/specs/2026-10-02-seller-system-v2-design.md`

## Global Constraints
- Atomic stock management is strictly required for order creation.
- Price, product name, thumbnail, and seller info must be captured as a static snapshot at order creation.
- Custom colors and charm must be validated against the product's `mesh_map`.
- Use existing KCO-YYYY-XXXX pattern for order IDs.
- PDO prepared statements must be used for all DB queries.
- Soft-delete pattern (`deleted_at`, `permanently_deleted`) must be maintained.

---

### Task 1: Database Setup - Orders Table

**Files:**
- Modify: `api/database/setup.sql`
- Test: `test/api/orders/db.test.js`

**Interfaces:**
- Consumes: Database connection
- Produces: `orders` table

- [ ] **Step 1: Write the failing test**
```javascript
// test/api/orders/db.test.js
import { test } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'node:child_process';

test('Orders table should exist in database', () => {
    const checkTableCmd = `mysql -u root -e "USE kickcraft_db; SHOW TABLES LIKE 'orders';"`;
    try {
        const output = execSync(checkTableCmd, { encoding: 'utf8' });
        assert.match(output, /orders/);
    } catch (e) {
        assert.fail('orders table does not exist');
    }
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `node --test test/api/orders/db.test.js`
Expected: FAIL with "orders table does not exist"

- [ ] **Step 3: Write minimal implementation**
```sql
-- Append to api/database/setup.sql
CREATE TABLE IF NOT EXISTS orders (
  id VARCHAR(64) PRIMARY KEY,
  seller_id INT NOT NULL,
  product_id VARCHAR(64) NOT NULL,
  buyer_name VARCHAR(255) NOT NULL,
  buyer_email VARCHAR(255) NOT NULL,
  custom_colors JSON NOT NULL,
  custom_charm VARCHAR(50) NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  total_price DECIMAL(10,2) NOT NULL,
  product_name VARCHAR(255) NOT NULL,
  product_thumbnail VARCHAR(255) NOT NULL,
  seller_store_name VARCHAR(255) NOT NULL,
  status ENUM('pending', 'confirmed', 'ready', 'completed', 'cancelled') NOT NULL DEFAULT 'pending',
  pickup_date DATE NOT NULL,
  notes TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  permanently_deleted TINYINT(1) NOT NULL DEFAULT 0,
  INDEX idx_orders_seller (seller_id),
  INDEX idx_orders_email (buyer_email),
  INDEX idx_orders_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```
Apply it by running: `mysql -u root < api/database/setup.sql`

- [ ] **Step 4: Run test to verify it passes**
Run: `node --test test/api/orders/db.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

---

### Task 2: Orders API - Create

**Files:**
- Create: `api/orders/create.php`
- Test: `test/api/orders/create.test.js`

**Interfaces:**
- Consumes: `products` table stock, `seller_profiles` table
- Produces: `POST api/orders/create.php`

- [ ] **Step 1: Write the failing test**
```javascript
// test/api/orders/create.test.js
import { test } from 'node:test';
import assert from 'node:assert';

test('POST /api/orders/create.php should fail with missing params', async () => {
    const res = await fetch('http://localhost/kickcraft/api/orders/create.php', {
        method: 'POST',
        body: JSON.stringify({ buyerName: 'Test' })
    });
    const json = await res.json();
    assert.strictEqual(res.status, 400);
    assert.ok(json.error);
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `node --test test/api/orders/create.test.js`
Expected: FAIL (404 Not Found)

- [ ] **Step 3: Write minimal implementation**
```php
<?php
// api/orders/create.php
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../helpers.php';

requireMethod('POST');
$body = getJsonBody();

$buyerName = sanitizeString($body['buyerName'] ?? '');
$buyerEmail = validateEmail($body['buyerEmail'] ?? '');
$productId = trim((string)($body['productId'] ?? ''));
$pickupDate = trim((string)($body['pickupDate'] ?? ''));

if (!$buyerName || !$buyerEmail || !$productId || !$pickupDate) {
    jsonError('Missing required fields', 400);
}

// Minimal implementation: return success mock for now.
jsonResponse(['success' => true], 201);
```

- [ ] **Step 4: Run test to verify it passes**
Run: `node --test test/api/orders/create.test.js`
Expected: PASS

- [ ] **Step 5: Full implementation & Commit**
Update `api/orders/create.php` to fetch `products` (FOR UPDATE), verify `stock > 0`, atomatically decrement stock (`UPDATE products SET stock = stock - 1 WHERE id = ?`), fetch `seller_profiles.store_name`, validate `custom_colors` against `products.mesh_map`, generate `KCO-YYYY-XXXX` ID, and insert into `orders`. Emit `NEW_ORDER` broadcast event note (this is handled on frontend).

---

### Task 3: Orders API - Track and Cancel

**Files:**
- Create: `api/orders/track.php`
- Create: `api/orders/cancel.php`
- Test: `test/api/orders/track_cancel.test.js`

**Interfaces:**
- Consumes: `orders` table, `products` table (for restock)
- Produces: `GET api/orders/track.php`, `POST api/orders/cancel.php`

- [ ] **Step 1: Write the failing test**
```javascript
// test/api/orders/track_cancel.test.js
import { test } from 'node:test';
import assert from 'node:assert';

test('GET /api/orders/track.php without params should fail', async () => {
    const res = await fetch('http://localhost/kickcraft/api/orders/track.php?id=&email=');
    assert.strictEqual(res.status, 400);
});

test('POST /api/orders/cancel.php without params should fail', async () => {
    const res = await fetch('http://localhost/kickcraft/api/orders/cancel.php', { method: 'POST', body: '{}' });
    assert.strictEqual(res.status, 400);
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `node --test test/api/orders/track_cancel.test.js`
Expected: FAIL (404)

- [ ] **Step 3: Write minimal implementation**
```php
// api/orders/track.php
<?php
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../helpers.php';
requireMethod('GET');

$id = trim($_GET['id'] ?? '');
$email = trim($_GET['email'] ?? '');
if (!$id || !$email) jsonError('Missing ID or email', 400);

jsonResponse(['order' => null]);
```
```php
// api/orders/cancel.php
<?php
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../helpers.php';
requireMethod('POST');
$body = getJsonBody();
$id = trim($body['id'] ?? '');
if (!$id) jsonError('Missing ID', 400);
jsonResponse(['success' => true]);
```

- [ ] **Step 4: Run test to verify it passes**
Run: `node --test test/api/orders/track_cancel.test.js`
Expected: PASS

- [ ] **Step 5: Full implementation & Commit**
Update `track.php` to fetch the order by ID and Email. Update `cancel.php` to verify the order is not already cancelled, update status to `cancelled`, and atomically increment the `products` stock `UPDATE products SET stock = stock + 1 WHERE id = ?`.

---

### Task 4: Orders API - List and Update Status

**Files:**
- Create: `api/orders/list.php`
- Create: `api/orders/update-status.php`
- Test: `test/api/orders/list_update.test.js`

**Interfaces:**
- Consumes: `requireSeller()` or `requireAdmin()`
- Produces: `GET api/orders/list.php`, `POST api/orders/update-status.php`

- [ ] **Step 1: Write the failing test**
```javascript
// test/api/orders/list_update.test.js
import { test } from 'node:test';
import assert from 'node:assert';

test('GET /api/orders/list.php blocks unauthenticated users', async () => {
    const res = await fetch('http://localhost/kickcraft/api/orders/list.php');
    assert.strictEqual(res.status, 401);
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `node --test test/api/orders/list_update.test.js`
Expected: FAIL (404)

- [ ] **Step 3: Write minimal implementation**
```php
// api/orders/list.php
<?php
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../helpers.php';
requireMethod('GET');
requireAuth(); // Will return 401
jsonResponse(['orders' => []]);
```
```php
// api/orders/update-status.php
<?php
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../helpers.php';
requireMethod('POST');
requireAuth();
jsonResponse(['success' => true]);
```

- [ ] **Step 4: Run test to verify it passes**
Run: `node --test test/api/orders/list_update.test.js`
Expected: PASS

- [ ] **Step 5: Full implementation & Commit**
Update `list.php` to check if `owner` (fetch all) or `seller` (fetch `WHERE seller_id = ?`). Update `update-status.php` to validate status transitions, check ownership (admin or specific seller), and update DB.

---

### Task 5: Frontend - Marketplace Checkout Flow

**Files:**
- Modify: `src/App.vue`
- Test: `test/frontend/marketplace.test.js` (Optional/Manual)

**Interfaces:**
- Consumes: `api/orders/create.php`
- Produces: Inline checkout UI for marketplace products

- [ ] **Step 1: Write the failing test or setup**
Setup placeholders in `src/App.vue` state for marketplace order form (e.g. `orderBuyerName`, `orderBuyerEmail`, `orderPickupDate`).

- [ ] **Step 2: Run test to verify**
Run build: `npm run build`

- [ ] **Step 3: Write minimal implementation**
Add a checkout dialog/form in `src/App.vue` that triggers `api('orders/create.php', { method: 'POST', body: ... })` when buying a marketplace product. Show success receipt.

- [ ] **Step 4: Run test to verify it passes**
Run build: `npm run build`

- [ ] **Step 5: Commit**

---

### Task 6: Frontend - Track View Extension

**Files:**
- Modify: `src/App.vue`

**Interfaces:**
- Consumes: `api/orders/track.php`, `api/orders/cancel.php`
- Produces: UI for "Track Order" tab.

- [ ] **Step 1: Write the failing test or setup**
In `src/App.vue`, add a toggle state `trackMode = ref('reservation') // or 'order'`

- [ ] **Step 2: Run test to verify**
Run build.

- [ ] **Step 3: Write minimal implementation**
Add the secondary tab in the `#track` view. When `trackMode === 'order'`, query `api/orders/track.php`. Display order details, status badge, and provide a cancel button if `status === 'pending'` (using `ConfirmModal.vue`).

- [ ] **Step 4: Run test to verify it passes**
Run build.

- [ ] **Step 5: Commit**

---

### Task 7: Frontend - Seller Dashboard & Admin Panel Orders Tab

**Files:**
- Modify: `src/components/SellerDashboard.vue`
- Modify: `src/components/AdminPanel.vue`

**Interfaces:**
- Consumes: `api/orders/list.php`, `api/orders/update-status.php`, `BroadcastChannel('kickcraft_orders_channel')`
- Produces: Orders management tables.

- [ ] **Step 1: Write the failing test or setup**
Add `orders` state to `SellerDashboard.vue` and `AdminPanel.vue`.

- [ ] **Step 2: Run test to verify**
Run build.

- [ ] **Step 3: Write minimal implementation**
In `SellerDashboard.vue`, implement the "My Orders" tab to fetch `api/orders/list.php`, display a table of orders, and allow status updates (pending → confirmed → ready → completed) via `api/orders/update-status.php`. Listen to `kickcraft_orders_channel` for real-time updates.
In `AdminPanel.vue`, add a new "Orders" tab similarly fetching all orders.

- [ ] **Step 4: Run test to verify it passes**
Run build.

- [ ] **Step 5: Commit**

</E-Commerce Order Flow Implementation Plan>
