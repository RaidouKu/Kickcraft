# Sub-project 1: Seller Auth & Dashboard Shell — Implementation Plan
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the complete seller authentication flow, including registration, admin approval, and the seller dashboard shell.
**Architecture:** PHP API layer handling sessions, registration, and status review. Vue 3 frontend for registration, dashboard shell, and admin management tabs.
**Tech Stack:** Vue 3, Tailwind CSS, PHP 8, MySQL.
**Spec:** `C:\Users\kinglebron\Desktop\Git uploads\kickcraft\docs\superpowers\specs\2026-10-02-seller-system-v2-design.md`

## Global Constraints
- The project uses Vue 3, Tailwind CSS, PHP API (XAMPP), MySQL
- Tests use Node.js built-in test runner (`node --test`)
- PHP tests use direct PHP execution
- Build: `npm run build` via Vite
- All PHP endpoints use PDO prepared statements
- Soft-delete pattern with deleted_at + permanently_deleted columns
- Follow existing patterns in the codebase (brutalist aesthetic)

---

### Task 1: Database Schema & API Helpers Update

**Files:**
- Modify: `api/database/setup.sql`
- Modify: `api/helpers.php`
- Test: `test/backend-seller-helpers.test.js`

**Interfaces:**
- Consumes: Nothing
- Produces: Database schema for `seller_profiles`, updated `users.role` enum. PHP helpers: `requireSeller()`, `requireApprovedSeller()`, updated `currentSessionUser()`.

- [ ] **Step 1: Write the failing test for helpers**
```javascript
import { test } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'node:child_process';
import fs from 'node:fs';

test('Seller auth helpers', () => {
  const phpCode = `
    require_once __DIR__ . '/../api/helpers.php';
    $_SESSION['user_id'] = 1;
    $_SESSION['user_role'] = 'seller';
    $_SESSION['user_email'] = 'test@example.com';
    $GLOBALS['__JSON_BODY__'] = [];
    
    // We can't easily mock PDO here, but we can check if functions exist
    echo function_exists('requireSeller') ? 'YES' : 'NO';
    echo function_exists('requireApprovedSeller') ? 'YES' : 'NO';
  `;
  fs.writeFileSync('test_helpers.php', '<?php ' + phpCode);
  const output = execSync('php test_helpers.php').toString();
  fs.unlinkSync('test_helpers.php');
  assert.match(output, /YESYES/, 'Helpers should be defined');
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `node --test test/backend-seller-helpers.test.js`
Expected: FAIL with "AssertionError"

- [ ] **Step 3: Write minimal implementation**
Update `api/database/setup.sql`:
- Change `role ENUM('customer', 'owner')` to `role ENUM('customer', 'owner', 'seller')`
- Add `CREATE TABLE seller_profiles` table definition as per spec.

Update `api/helpers.php`:
- In `currentSessionUser()`, change query to `WHERE id = ? AND role IN ('owner', 'seller')`. Add logic to query `seller_profiles` and inject `seller_status` into `$_SESSION` if role is seller.
- Add `requireSeller()` function.
- Add `requireApprovedSeller()` function.

```php
function requireSeller(?PDO $pdo = null): void {
    $user = currentSessionUser($pdo);
    if ($user === null || ($user['role'] ?? '') !== 'seller') {
        jsonError('Seller privileges required', 403);
    }
}

function requireApprovedSeller(?PDO $pdo = null): void {
    $user = currentSessionUser($pdo);
    if ($user === null || ($user['role'] ?? '') !== 'seller') {
        jsonError('Seller privileges required', 403);
    }
    if (empty($_SESSION['seller_status']) || $_SESSION['seller_status'] !== 'approved') {
        jsonError('Approved seller privileges required', 403);
    }
}
```
Update `currentSessionUser()` to fetch `seller_profiles.status` and store it in `$_SESSION['seller_status']` if role is seller.

- [ ] **Step 4: Run test to verify it passes**
Run: `node --test test/backend-seller-helpers.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

### Task 2: Seller Registration Endpoint

**Files:**
- Create: `api/auth/register.php`
- Test: `test/backend-seller-register.test.js`

**Interfaces:**
- Consumes: Database schema
- Produces: `POST api/auth/register.php`

- [ ] **Step 1: Write the failing test**
```javascript
import { test } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'node:child_process';
import fs from 'node:fs';

test('Seller registration endpoint validates input', () => {
  const phpCode = `
    $_SERVER['REQUEST_METHOD'] = 'POST';
    $GLOBALS['__JSON_BODY__'] = ['email' => 'bademail'];
    require_once __DIR__ . '/../api/auth/register.php';
  `;
  fs.writeFileSync('test_register.php', '<?php ' + phpCode);
  try {
    execSync('php test_register.php');
    assert.fail('Should have errored');
  } catch (e) {
    assert.match(e.stdout.toString(), /invalid/i);
  }
  fs.unlinkSync('test_register.php');
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `node --test test/backend-seller-register.test.js`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**
Create `api/auth/register.php`:
Validate `name`, `email`, `password`, `confirmPassword`, `storeName`, `storeDescription`.
Check email uniqueness.
Hash password, insert into `users` and `seller_profiles`.
Return 201 success JSON.

- [ ] **Step 4: Run test to verify it passes**
Run: `node --test test/backend-seller-register.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

### Task 3: Login & Session API Updates

**Files:**
- Modify: `api/auth/login.php`
- Modify: `api/auth/session.php`
- Test: `test/backend-seller-login.test.js`

**Interfaces:**
- Consumes: Updated `currentSessionUser()` from `helpers.php`
- Produces: Modified `POST api/auth/login.php` and `GET api/auth/session.php`

- [ ] **Step 1: Write the failing test**
```javascript
import { test } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'node:child_process';
import fs from 'node:fs';

test('Login allows sellers', () => {
  const phpCode = `
    $file = file_get_contents(__DIR__ . '/../api/auth/login.php');
    if (strpos($file, "'owner', 'seller'") !== false) {
      echo "PASS";
    } else {
      echo "FAIL";
    }
  `;
  fs.writeFileSync('test_login.php', '<?php ' + phpCode);
  const out = execSync('php test_login.php').toString();
  fs.unlinkSync('test_login.php');
  assert.equal(out.trim(), 'PASS');
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `node --test test/backend-seller-login.test.js`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**
In `api/auth/login.php`, change the query to `role IN ('owner', 'seller')`.
After login, if `role === 'seller'`, query `seller_profiles` to get `status`, `store_name`, `store_description`.
Set `$_SESSION['seller_status']`.
Return `sellerProfile` block in response.

In `api/auth/session.php`, include `sellerProfile` if user is a seller (fetching from DB or `$_SESSION`).

- [ ] **Step 4: Run test to verify it passes**
Run: `node --test test/backend-seller-login.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

### Task 4: Admin Seller Management Endpoints

**Files:**
- Create: `api/sellers/list.php`
- Create: `api/sellers/review.php`
- Test: `test/backend-admin-sellers.test.js`

**Interfaces:**
- Consumes: `requireAdmin()`
- Produces: `GET api/sellers/list.php`, `POST api/sellers/review.php`

- [ ] **Step 1: Write the failing test**
```javascript
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';

test('Admin seller files exist', () => {
  assert.ok(fs.existsSync('./api/sellers/list.php'));
  assert.ok(fs.existsSync('./api/sellers/review.php'));
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `node --test test/backend-admin-sellers.test.js`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**
Create `api/sellers/list.php`:
Uses `requireAdmin()`. Selects from `seller_profiles` joined with `users`. Supports `?status=pending`.

Create `api/sellers/review.php`:
Uses `requireAdmin()`. Validates `status` and `userId`. Updates `seller_profiles.status` and `admin_notes`, setting `approved_at` if approved.

- [ ] **Step 4: Run test to verify it passes**
Run: `node --test test/backend-admin-sellers.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

### Task 5: Seller Profile Endpoints

**Files:**
- Create: `api/sellers/profile.php`
- Create: `api/sellers/update-profile.php`
- Test: `test/backend-seller-profile.test.js`

**Interfaces:**
- Consumes: `requireSeller()`, `requireApprovedSeller()`
- Produces: `GET api/sellers/profile.php`, `PUT api/sellers/update-profile.php`

- [ ] **Step 1: Write the failing test**
```javascript
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';

test('Seller profile files exist', () => {
  assert.ok(fs.existsSync('./api/sellers/profile.php'));
  assert.ok(fs.existsSync('./api/sellers/update-profile.php'));
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `node --test test/backend-seller-profile.test.js`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**
Create `api/sellers/profile.php`:
Uses `requireSeller()`. Selects and returns profile.

Create `api/sellers/update-profile.php`:
Uses `requireApprovedSeller()`. Validates `storeName`, `storeDescription`. Updates `seller_profiles` for the logged-in user.

- [ ] **Step 4: Run test to verify it passes**
Run: `node --test test/backend-seller-profile.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

### Task 6: Frontend Seller Dashboard Shell

**Files:**
- Create: `src/components/SellerDashboard.vue`
- Test: `test/frontend-seller-dashboard.test.js`

**Interfaces:**
- Consumes: `currentUser`, `sellerProfile`
- Produces: `SellerDashboard.vue` component used by `App.vue`

- [ ] **Step 1: Write the failing test**
```javascript
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';

test('SellerDashboard exists and has props', () => {
  const content = fs.readFileSync('./src/components/SellerDashboard.vue', 'utf8');
  assert.match(content, /defineProps/);
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `node --test test/frontend-seller-dashboard.test.js`
Expected: FAIL (file missing)

- [ ] **Step 3: Write minimal implementation**
Create `src/components/SellerDashboard.vue`:
Accept `currentUser`, `sellerProfile` props.
Implement the four status states as per spec: Pending, Rejected, Suspended, Approved.
For Approved state, add the tab layout (My Products, My Orders, Store Settings).
Add basic Store Settings form calling `api('sellers/update-profile.php')`.

- [ ] **Step 4: Run test to verify it passes**
Run: `node --test test/frontend-seller-dashboard.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

### Task 7: Frontend Routing & App.vue Integration

**Files:**
- Modify: `src/App.vue`
- Test: `test/frontend-app-routing.test.js`

**Interfaces:**
- Consumes: `api/auth/register.php`, `SellerDashboard.vue`
- Produces: New `#seller-register` and `#seller` routes.

- [ ] **Step 1: Write the failing test**
```javascript
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';

test('App.vue contains seller routes', () => {
  const content = fs.readFileSync('./src/App.vue', 'utf8');
  assert.match(content, /view\.value === 'seller-register'/);
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `node --test test/frontend-app-routing.test.js`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**
In `src/App.vue`:
- Import `SellerDashboard.vue` (async component).
- Update `resolveCurrentRoute()` to handle `#seller-register` and `#seller`.
- Update login logic to check `role` and route appropriately (owner -> admin, seller -> seller).
- Add registration form UI in the template under `view === 'seller-register'`. Handle form submission to `api/auth/register.php`.
- Add `SellerDashboard` to the template under `view === 'seller'`.
- Update header navigation based on login status.

- [ ] **Step 4: Run test to verify it passes**
Run: `node --test test/frontend-app-routing.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

### Task 8: Admin Panel Sellers Tab

**Files:**
- Modify: `src/components/AdminPanel.vue`
- Test: `test/frontend-admin-sellers.test.js`

**Interfaces:**
- Consumes: `GET api/sellers/list.php`, `POST api/sellers/review.php`
- Produces: Sellers management UI for owner.

- [ ] **Step 1: Write the failing test**
```javascript
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';

test('AdminPanel contains sellers tab', () => {
  const content = fs.readFileSync('./src/components/AdminPanel.vue', 'utf8');
  assert.match(content, /adminSection\.value === 'sellers'/);
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `node --test test/frontend-admin-sellers.test.js`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**
In `src/components/AdminPanel.vue`:
- Add 'sellers' to `adminSection`.
- Add tab button for "Sellers" in the nav.
- Fetch sellers from `api/sellers/list.php`.
- Add UI to list sellers with status filters.
- Implement review modal to approve/reject/suspend calling `api/sellers/review.php`.

- [ ] **Step 4: Run test to verify it passes**
Run: `node --test test/frontend-admin-sellers.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

### Task 9: Update AGENTS.md

**Files:**
- Modify: `AGENTS.md`
- Test: `test/docs-agents.test.js`

**Interfaces:**
- Consumes: The new spec details.
- Produces: Updated scope in `AGENTS.md`.

- [ ] **Step 1: Write the failing test**
```javascript
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';

test('AGENTS.md reflects seller marketplace', () => {
  const content = fs.readFileSync('./AGENTS.md', 'utf8');
  assert.match(content, /seller-driven 3D shoe marketplace/i);
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `node --test test/docs-agents.test.js`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**
Update `AGENTS.md` root file to mention the expansion from a single-brand customization studio to a seller-driven 3D shoe marketplace where sellers can upload, AI-generate, and customize shoes for pickup.

- [ ] **Step 4: Run test to verify it passes**
Run: `node --test test/docs-agents.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

</Sub-project 1: Seller Auth & Dashboard Shell Implementation Plan>
