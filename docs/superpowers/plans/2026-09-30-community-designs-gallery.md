# Community Designs Gallery — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let customers share custom colorway designs to a community gallery, where the admin curates submissions and other customers can browse and load approved designs into the 3D studio.

**Architecture:** Guest-based design submissions (name + email, like reservations — no customer registration required). New `community_designs` MySQL table. Three new PHP API endpoints (`designs/submit.php`, `designs/list.php`, `designs/review.php`). New `gallery` view in App.vue. New "Community Designs" tab in AdminPanel.vue.

**Tech Stack:** Vue 3, Tailwind CSS, PHP API, MySQL, `<model-viewer>`, existing KickCraft patterns.

**Spec:** This plan implements the instructor-approved "Option A: Community Designs Gallery" scope expansion. AGENTS.md will be updated to reflect the new scope.

## Global Constraints

- Zero physical `DELETE FROM` statements — all entities use `deleted_at` + `permanently_deleted`.
- 100% PDO prepared statements with bound parameters — zero string interpolation in SQL.
- Admin-only operations require `requireAdmin()` guard from `api/helpers.php`.
- Designs reuse existing shoe templates — no user GLB uploads. `partColors`, `charmId`, and `shoeId` reference existing catalog shoes.
- Designer identity uses the same guest model as reservations: name + email, no account required.
- Maintain KickCraft brutalist aesthetic: high contrast, solid borders, terracotta `#b94d27` accents, clean typography.
- All existing tests must continue to pass. Run `npm.cmd test` and `npm.cmd run build` after every task.
- Design ID format: `KCD-YYYY-XXXX` (KickCraft Design, year, 4-digit random).
- Design statuses: `pending`, `approved`, `rejected`, `featured`.

---

## File Structure

### New Files
| File | Responsibility |
|---|---|
| `api/designs/submit.php` | Accept community design submissions (POST, public) |
| `api/designs/list.php` | Return approved/featured designs (GET, public) or all designs (GET, admin) |
| `api/designs/review.php` | Admin approve/reject/feature designs (POST, admin-only) |
| `test/community-designs-backend.test.js` | Backend tests for all 3 design endpoints |
| `test/community-designs-gallery.test.js` | Frontend tests for gallery view, submission UI, admin moderation |

### Modified Files
| File | Changes |
|---|---|
| `api/database/setup.sql` | Add `community_designs` table |
| `src/App.vue` | Add gallery view, design submission modal, routing for `#gallery` |
| `src/components/AdminPanel.vue` | Add "Community Designs" tab with moderation controls |
| `AGENTS.md` | Update scope to include community designs |

---

## Task 1: Database Schema & Backend API

**Files:**
- Modify: `api/database/setup.sql` (after line 86)
- Modify: `AGENTS.md:99-119` (scope limits section)
- Create: `api/designs/submit.php`
- Create: `api/designs/list.php`
- Create: `api/designs/review.php`
- Test: `test/community-designs-backend.test.js`

**Interfaces:**
- Produces: `POST api/designs/submit.php` — accepts `{ designerName, designerEmail, designName, description?, shoeId, partColors, charmId, charmLabel }`, returns `{ success, design: { id, designerName, designName, shoeId, shoeName, partColors, charmId, charmLabel, status, createdAt } }`.
- Produces: `GET api/designs/list.php` — returns `{ designs: [...] }` (only `approved` + `featured` for public; all statuses for admin with `?include_all=1`).
- Produces: `POST api/designs/review.php` — accepts `{ id, status, notes? }`, returns `{ success, design }`. Admin-only.

- [ ] **Step 1: Write failing tests**

Create `test/community-designs-backend.test.js`:

```javascript
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

describe('Community Designs Backend', () => {
  // ── Schema ──
  describe('Database Schema', () => {
    it('setup.sql contains community_designs table', () => {
      const sql = fs.readFileSync('api/database/setup.sql', 'utf8')
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS community_designs'), 'community_designs table must exist')
      assert.ok(sql.includes('designer_name'), 'must have designer_name column')
      assert.ok(sql.includes('designer_email'), 'must have designer_email column')
      assert.ok(sql.includes('design_name'), 'must have design_name column')
      assert.ok(sql.includes('part_colors'), 'must have part_colors JSON column')
      assert.ok(sql.includes("ENUM('pending', 'approved', 'rejected', 'featured')"), 'must have correct status enum')
      assert.ok(sql.includes('deleted_at'), 'must support soft deletion')
      assert.ok(sql.includes('permanently_deleted'), 'must support permanent deletion flag')
    })

    it('setup.sql does NOT contain DELETE FROM', () => {
      const sql = fs.readFileSync('api/database/setup.sql', 'utf8')
      assert.ok(!sql.match(/DELETE\s+FROM/i), 'physical DELETE FROM is forbidden')
    })
  })

  // ── submit.php ──
  describe('api/designs/submit.php', () => {
    const filePath = 'api/designs/submit.php'

    it('endpoint file exists', () => {
      assert.ok(fs.existsSync(filePath), 'submit.php must exist')
    })

    it('uses PDO prepared statements', () => {
      const src = fs.readFileSync(filePath, 'utf8')
      assert.ok(src.includes('prepare('), 'must use PDO prepare()')
      assert.ok(src.includes('execute('), 'must use PDO execute()')
      assert.ok(!src.match(/\$_(POST|GET|REQUEST)\[/), 'must not use superglobals directly in SQL')
    })

    it('validates required fields', () => {
      const src = fs.readFileSync(filePath, 'utf8')
      assert.ok(src.includes('designerName') || src.includes('designer_name'), 'must validate designerName')
      assert.ok(src.includes('designerEmail') || src.includes('designer_email'), 'must validate designerEmail')
      assert.ok(src.includes('designName') || src.includes('design_name'), 'must validate designName')
      assert.ok(src.includes('shoeId') || src.includes('shoe_id'), 'must validate shoeId')
      assert.ok(src.includes('partColors') || src.includes('part_colors'), 'must validate partColors')
    })

    it('generates KCD-YYYY-XXXX design ID', () => {
      const src = fs.readFileSync(filePath, 'utf8')
      assert.ok(src.includes('KCD-'), 'must generate KCD- prefixed IDs')
    })

    it('verifies shoe exists before accepting submission', () => {
      const src = fs.readFileSync(filePath, 'utf8')
      assert.ok(src.includes('shoes') && src.includes('SELECT'), 'must verify shoe_id references a valid shoe')
    })

    it('does NOT contain DELETE FROM', () => {
      const src = fs.readFileSync(filePath, 'utf8')
      assert.ok(!src.match(/DELETE\s+FROM/i), 'physical DELETE FROM is forbidden')
    })
  })

  // ── list.php ──
  describe('api/designs/list.php', () => {
    const filePath = 'api/designs/list.php'

    it('endpoint file exists', () => {
      assert.ok(fs.existsSync(filePath), 'list.php must exist')
    })

    it('uses PDO prepared statements', () => {
      const src = fs.readFileSync(filePath, 'utf8')
      assert.ok(src.includes('prepare(') || src.includes('query('), 'must use PDO')
    })

    it('filters by approved+featured for public requests', () => {
      const src = fs.readFileSync(filePath, 'utf8')
      assert.ok(src.includes('approved') && src.includes('featured'), 'must filter public results to approved/featured')
    })

    it('supports include_all for admin users', () => {
      const src = fs.readFileSync(filePath, 'utf8')
      assert.ok(src.includes('include_all'), 'must support include_all parameter for admin')
    })

    it('excludes soft-deleted designs', () => {
      const src = fs.readFileSync(filePath, 'utf8')
      assert.ok(src.includes('deleted_at IS NULL'), 'must exclude soft-deleted designs')
    })
  })

  // ── review.php ──
  describe('api/designs/review.php', () => {
    const filePath = 'api/designs/review.php'

    it('endpoint file exists', () => {
      assert.ok(fs.existsSync(filePath), 'review.php must exist')
    })

    it('requires admin authentication', () => {
      const src = fs.readFileSync(filePath, 'utf8')
      assert.ok(src.includes('requireAdmin'), 'must call requireAdmin()')
    })

    it('uses PDO prepared statements', () => {
      const src = fs.readFileSync(filePath, 'utf8')
      assert.ok(src.includes('prepare('), 'must use PDO prepare()')
      assert.ok(src.includes('execute('), 'must use PDO execute()')
    })

    it('validates status transitions', () => {
      const src = fs.readFileSync(filePath, 'utf8')
      assert.ok(src.includes('approved'), 'must handle approved status')
      assert.ok(src.includes('rejected'), 'must handle rejected status')
      assert.ok(src.includes('featured'), 'must handle featured status')
    })

    it('does NOT contain DELETE FROM', () => {
      const src = fs.readFileSync(filePath, 'utf8')
      assert.ok(!src.match(/DELETE\s+FROM/i), 'physical DELETE FROM is forbidden')
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```powershell
npm.cmd test
```
Expected: New tests FAIL (`submit.php must exist`, `list.php must exist`, etc.)

- [ ] **Step 3: Update AGENTS.md scope**

In `AGENTS.md`, update the scope limits section (lines 99-119) to add community designs to the Included list:

```markdown
## Scope limits

Included:

- One original KickCraft shoe initially
- Eight-part color customization
- 3D charm selection
- Size selection
- Pickup reservations
- Reservation validation and persistence
- Owner/admin reservation management
- Community Designs Gallery (guest-based colorway submissions, admin curation, public gallery)

Excluded unless the instructor explicitly approves a scope change:

- Online payment
- Delivery and shipping
- Full accounting or physical POS functions
- Multi-store or third-party seller accounts
- Branded third-party shoe models
- Full inventory, supplier, or manufacturing management
- Customer social accounts, reviews, chat, or recommendation engines
```

- [ ] **Step 4: Add community_designs table to setup.sql**

After the reservations table indexes (after line 86), add:

```sql
-- --------------------------------------------------------
-- Community Designs Table
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS community_designs (
  id VARCHAR(64) PRIMARY KEY,
  designer_name VARCHAR(255) NOT NULL,
  designer_email VARCHAR(255) NOT NULL,
  design_name VARCHAR(255) NOT NULL,
  description TEXT DEFAULT NULL,
  shoe_id VARCHAR(100) NOT NULL,
  shoe_name VARCHAR(255) NOT NULL,
  part_colors JSON NOT NULL,
  charm_id VARCHAR(50) NOT NULL DEFAULT 'none',
  charm_label VARCHAR(50) NOT NULL DEFAULT 'None',
  status ENUM('pending', 'approved', 'rejected', 'featured') NOT NULL DEFAULT 'pending',
  admin_notes TEXT DEFAULT NULL,
  featured_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  permanently_deleted TINYINT(1) NOT NULL DEFAULT 0,
  INDEX idx_designs_status (status),
  INDEX idx_designs_shoe_id (shoe_id),
  INDEX idx_designs_email (designer_email),
  INDEX idx_designs_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

- [ ] **Step 5: Create api/designs/submit.php**

```php
<?php
/**
 * POST api/designs/submit.php
 * Accept a community design submission (public, no auth required).
 */
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../helpers.php';

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);
if (!$input) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid JSON body']);
    exit;
}

// ── Validate required fields ──
$designerName  = trim($input['designerName'] ?? '');
$designerEmail = trim($input['designerEmail'] ?? '');
$designName    = trim($input['designName'] ?? '');
$description   = trim($input['description'] ?? '');
$shoeId        = trim($input['shoeId'] ?? '');
$partColors    = $input['partColors'] ?? null;
$charmId       = trim($input['charmId'] ?? 'none');
$charmLabel    = trim($input['charmLabel'] ?? 'None');

$errors = [];
if (strlen($designerName) < 2)  $errors[] = 'Designer name must be at least 2 characters.';
if (!filter_var($designerEmail, FILTER_VALIDATE_EMAIL)) $errors[] = 'A valid email address is required.';
if (strlen($designName) < 2)    $errors[] = 'Design name must be at least 2 characters.';
if (strlen($designName) > 100)  $errors[] = 'Design name must not exceed 100 characters.';
if (!$shoeId)                   $errors[] = 'Shoe ID is required.';
if (!is_array($partColors) && !is_object($partColors)) $errors[] = 'Part colors configuration is required.';

if (count($errors) > 0) {
    http_response_code(400);
    echo json_encode(['error' => implode(' ', $errors)]);
    exit;
}

$pdo = getDbConnection();

// ── Verify shoe exists ──
$shoeStmt = $pdo->prepare('SELECT id, name FROM shoes WHERE id = ? AND deleted_at IS NULL AND permanently_deleted = 0');
$shoeStmt->execute([$shoeId]);
$shoe = $shoeStmt->fetch(PDO::FETCH_ASSOC);

if (!$shoe) {
    http_response_code(400);
    echo json_encode(['error' => 'The selected shoe model does not exist or is unavailable.']);
    exit;
}

// ── Rate-limit: max 10 designs per email per day ──
$rateStmt = $pdo->prepare(
    'SELECT COUNT(*) FROM community_designs WHERE designer_email = ? AND created_at > DATE_SUB(NOW(), INTERVAL 1 DAY) AND deleted_at IS NULL'
);
$rateStmt->execute([$designerEmail]);
if ((int) $rateStmt->fetchColumn() >= 10) {
    http_response_code(429);
    echo json_encode(['error' => 'You have reached the daily submission limit (10 designs per day). Please try again tomorrow.']);
    exit;
}

// ── Generate unique design ID: KCD-YYYY-XXXX ──
$year = date('Y');
$designId = '';
for ($i = 0; $i < 10; $i++) {
    $suffix = str_pad(random_int(1000, 9999), 4, '0', STR_PAD_LEFT);
    $candidateId = "KCD-{$year}-{$suffix}";
    $checkStmt = $pdo->prepare('SELECT COUNT(*) FROM community_designs WHERE id = ?');
    $checkStmt->execute([$candidateId]);
    if ((int) $checkStmt->fetchColumn() === 0) {
        $designId = $candidateId;
        break;
    }
}
if (!$designId) {
    http_response_code(500);
    echo json_encode(['error' => 'Could not generate a unique design ID. Please try again.']);
    exit;
}

// ── Insert design ──
$insertStmt = $pdo->prepare(
    'INSERT INTO community_designs (id, designer_name, designer_email, design_name, description, shoe_id, shoe_name, part_colors, charm_id, charm_label, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
);
$insertStmt->execute([
    $designId,
    $designerName,
    $designerEmail,
    $designName,
    $description ?: null,
    $shoeId,
    $shoe['name'],
    json_encode($partColors),
    $charmId,
    $charmLabel,
    'pending'
]);

// ── Fetch inserted design ──
$fetchStmt = $pdo->prepare('SELECT * FROM community_designs WHERE id = ?');
$fetchStmt->execute([$designId]);
$design = $fetchStmt->fetch(PDO::FETCH_ASSOC);

$design['partColors']   = json_decode($design['part_colors'], true);
$design['designerName'] = $design['designer_name'];
$design['designerEmail'] = $design['designer_email'];
$design['designName']   = $design['design_name'];
$design['shoeName']     = $design['shoe_name'];
$design['shoeId']       = $design['shoe_id'];
$design['charmId']      = $design['charm_id'];
$design['charmLabel']   = $design['charm_label'];
$design['adminNotes']   = $design['admin_notes'];
$design['featuredAt']   = $design['featured_at'];
$design['createdAt']    = $design['created_at'];
$design['updatedAt']    = $design['updated_at'];

http_response_code(201);
echo json_encode(['success' => true, 'design' => $design]);
```

- [ ] **Step 6: Create api/designs/list.php**

```php
<?php
/**
 * GET api/designs/list.php
 * Public: returns approved + featured designs.
 * Admin (?include_all=1): returns all designs for moderation.
 */
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../helpers.php';

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$pdo = getDbConnection();
$includeAll = isset($_GET['include_all']) && $_GET['include_all'] === '1';

if ($includeAll) {
    // Admin-only: verify owner session
    $user = currentSessionUser($pdo);
    if (!$user || $user['role'] !== 'owner') {
        http_response_code(403);
        echo json_encode(['error' => 'Admin access required to view all designs.']);
        exit;
    }
    $stmt = $pdo->prepare(
        'SELECT * FROM community_designs WHERE deleted_at IS NULL AND permanently_deleted = 0 ORDER BY created_at DESC'
    );
    $stmt->execute();
} else {
    // Public: approved + featured only
    $stmt = $pdo->prepare(
        "SELECT * FROM community_designs WHERE status IN ('approved', 'featured') AND deleted_at IS NULL AND permanently_deleted = 0 ORDER BY FIELD(status, 'featured', 'approved'), created_at DESC"
    );
    $stmt->execute();
}

$designs = [];
while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
    $row['partColors']    = json_decode($row['part_colors'], true);
    $row['designerName']  = $row['designer_name'];
    $row['designerEmail'] = $row['designer_email'];
    $row['designName']    = $row['design_name'];
    $row['shoeName']      = $row['shoe_name'];
    $row['shoeId']        = $row['shoe_id'];
    $row['charmId']       = $row['charm_id'];
    $row['charmLabel']    = $row['charm_label'];
    $row['adminNotes']    = $row['admin_notes'];
    $row['featuredAt']    = $row['featured_at'];
    $row['createdAt']     = $row['created_at'];
    $row['updatedAt']     = $row['updated_at'];
    $designs[] = $row;
}

echo json_encode(['designs' => $designs]);
```

- [ ] **Step 7: Create api/designs/review.php**

```php
<?php
/**
 * POST api/designs/review.php
 * Admin-only: approve, reject, or feature a community design.
 */
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../helpers.php';

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$pdo = getDbConnection();
requireAdmin($pdo);

$input = json_decode(file_get_contents('php://input'), true);
if (!$input) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid JSON body']);
    exit;
}

$designId = trim($input['id'] ?? '');
$newStatus = trim($input['status'] ?? '');
$notes = trim($input['notes'] ?? '');

if (!$designId) {
    http_response_code(400);
    echo json_encode(['error' => 'Design ID is required.']);
    exit;
}

$validStatuses = ['approved', 'rejected', 'featured', 'pending'];
if (!in_array($newStatus, $validStatuses, true)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid status. Must be one of: ' . implode(', ', $validStatuses)]);
    exit;
}

// ── Fetch current design ──
$fetchStmt = $pdo->prepare('SELECT * FROM community_designs WHERE id = ? AND deleted_at IS NULL AND permanently_deleted = 0');
$fetchStmt->execute([$designId]);
$design = $fetchStmt->fetch(PDO::FETCH_ASSOC);

if (!$design) {
    http_response_code(404);
    echo json_encode(['error' => 'Design not found.']);
    exit;
}

// ── Update status ──
$featuredAt = $newStatus === 'featured' ? date('Y-m-d H:i:s') : $design['featured_at'];
if ($newStatus !== 'featured' && $design['status'] === 'featured') {
    $featuredAt = null;
}

$updateStmt = $pdo->prepare(
    'UPDATE community_designs SET status = ?, admin_notes = ?, featured_at = ?, updated_at = NOW() WHERE id = ?'
);
$updateStmt->execute([$newStatus, $notes ?: null, $featuredAt, $designId]);

// ── Return updated design ──
$fetchStmt->execute([$designId]);
$updated = $fetchStmt->fetch(PDO::FETCH_ASSOC);

$updated['partColors']    = json_decode($updated['part_colors'], true);
$updated['designerName']  = $updated['designer_name'];
$updated['designerEmail'] = $updated['designer_email'];
$updated['designName']    = $updated['design_name'];
$updated['shoeName']      = $updated['shoe_name'];
$updated['shoeId']        = $updated['shoe_id'];
$updated['charmId']       = $updated['charm_id'];
$updated['charmLabel']    = $updated['charm_label'];
$updated['adminNotes']    = $updated['admin_notes'];
$updated['featuredAt']    = $updated['featured_at'];
$updated['createdAt']     = $updated['created_at'];
$updated['updatedAt']     = $updated['updated_at'];

echo json_encode(['success' => true, 'design' => $updated]);
```

- [ ] **Step 8: Run tests to verify they pass**

```powershell
npm.cmd test
```
Expected: All new tests PASS. All existing tests still PASS.

- [ ] **Step 9: Run production build**

```powershell
npm.cmd run build
```
Expected: Clean build with no errors.

- [ ] **Step 10: Commit**

```powershell
git add api/database/setup.sql api/designs/ test/community-designs-backend.test.js AGENTS.md
git commit -m "feat(backend): add community_designs table and submit/list/review API endpoints"
```

---

## Task 2: Design Submission UI in 3D Studio

**Files:**
- Modify: `src/App.vue` (studio section — add "Share to Community" button and submission modal)
- Test: `test/community-designs-gallery.test.js`

**Interfaces:**
- Consumes: `POST api/designs/submit.php` from Task 1 — `{ designerName, designerEmail, designName, description, shoeId, partColors, charmId, charmLabel }` → `{ success, design }`.
- Consumes: `partColors` ref, `selectedShoe` computed, `selectedCharm` computed from existing App.vue state.
- Consumes: `saveGuestProfile()` / guest profile prefill from existing App.vue.
- Produces: `showDesignSubmitModal = ref(false)` — controls modal visibility.
- Produces: `submitDesign()` async function — calls submit.php and handles success/error.
- Produces: `designSubmitted = ref(false)` — shows success confirmation.
- Produces: `designReceipt = ref(null)` — stores returned design object.
- Produces: BroadcastChannel message `{ type: 'NEW_DESIGN', design }` for admin real-time alerts.

- [ ] **Step 1: Write failing tests**

Create `test/community-designs-gallery.test.js`:

```javascript
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const appSrc = fs.readFileSync('src/App.vue', 'utf8')

describe('Community Designs — Submission UI', () => {
  it('App.vue contains Share to Community button in studio', () => {
    assert.ok(
      appSrc.includes('Share to Community') || appSrc.includes('share-to-community') || appSrc.includes('shareDesign'),
      'Studio must have a Share to Community button or action'
    )
  })

  it('App.vue has design submission modal with required fields', () => {
    assert.ok(appSrc.includes('designName') || appSrc.includes('design-name'), 'must have designName field')
    assert.ok(appSrc.includes('showDesignSubmitModal') || appSrc.includes('show-design-submit-modal'), 'must have modal toggle state')
  })

  it('App.vue has submitDesign function that calls designs/submit.php', () => {
    assert.ok(appSrc.includes('submitDesign'), 'must have submitDesign function')
    assert.ok(appSrc.includes('designs/submit.php'), 'must call designs/submit.php endpoint')
  })

  it('submission requires at least one customized part', () => {
    assert.ok(
      appSrc.includes('customizedCount') || appSrc.includes('partColors'),
      'must check that at least one part has been customized before submitting'
    )
  })

  it('shows success confirmation with design ID after submission', () => {
    assert.ok(appSrc.includes('designSubmitted') || appSrc.includes('designReceipt'), 'must show success state after submission')
    assert.ok(appSrc.includes('KCD-'), 'must display KCD design ID format')
  })

  it('broadcasts NEW_DESIGN event via BroadcastChannel', () => {
    assert.ok(appSrc.includes('NEW_DESIGN'), 'must broadcast NEW_DESIGN event for admin alerts')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```powershell
npm.cmd test
```
Expected: New tests FAIL.

- [ ] **Step 3: Implement design submission in src/App.vue**

Add the following reactive state near the existing reservation state (~line 170):

```javascript
// ── Community Design Submission ──
const showDesignSubmitModal = ref(false)
const designName = ref('')
const designDescription = ref('')
const designSubmitted = ref(false)
const designReceipt = ref(null)
const designError = ref('')
const isSubmittingDesign = ref(false)
```

Add the `submitDesign()` function near `submitReservation()`:

```javascript
async function submitDesign() {
  if (!designName.value.trim()) return
  if (Object.keys(partColors.value).length === 0) {
    designError.value = 'Customize at least one shoe part before sharing your design.'
    return
  }

  isSubmittingDesign.value = true
  designError.value = ''

  try {
    const guestProfile = loadGuestProfile()
    const dName = customerName.value.trim() || guestProfile?.name || 'Anonymous Designer'
    const dEmail = customerEmail.value.trim() || guestProfile?.email || ''

    if (!dEmail || !dName || dName.length < 2) {
      designError.value = 'Please enter your name and email to share your design.'
      isSubmittingDesign.value = false
      return
    }

    const res = await api('designs/submit.php', {
      method: 'POST',
      body: {
        designerName: dName,
        designerEmail: dEmail,
        designName: designName.value.trim(),
        description: designDescription.value.trim(),
        shoeId: selectedShoe.value.id,
        partColors: { ...partColors.value },
        charmId: selectedCharm.value.id,
        charmLabel: selectedCharm.value.label,
      },
    })

    saveGuestProfile(dName, dEmail)
    designReceipt.value = res.design
    designSubmitted.value = true

    // Broadcast for admin real-time alert
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        const channel = new BroadcastChannel('kickcraft_designs_channel')
        channel.postMessage({ type: 'NEW_DESIGN', design: res.design })
        channel.close()
      } catch (_) {}
    }
  } catch (err) {
    designError.value = err.message || 'Failed to submit design'
  } finally {
    isSubmittingDesign.value = false
  }
}

function closeDesignModal() {
  showDesignSubmitModal.value = false
  designSubmitted.value = false
  designReceipt.value = null
  designName.value = ''
  designDescription.value = ''
  designError.value = ''
}
```

Add the "Share to Community" button in the studio sidebar (near the "Reserve for Pickup" button), gated on `customizedCount > 0`:

```html
<button
  v-if="customizedCount > 0"
  type="button"
  class="w-full border-2 border-[#245fa8] bg-white px-4 py-3 text-sm font-bold uppercase tracking-wider text-[#245fa8] transition-colors hover:bg-[#245fa8] hover:text-white"
  @click="showDesignSubmitModal = true"
>
  Share to Community
</button>
```

Add the design submission modal dialog (after the reservation dialog). The modal includes two templates — a submission form (`v-if="!designSubmitted"`) and a success confirmation (`v-else`). The form collects designName, optional description, customerName, customerEmail, and shows a color swatch preview. The success state shows a brutalist verification banner with the KCD ID and buttons for "Continue Designing" and "View Gallery".

- [ ] **Step 4: Run tests to verify they pass**

```powershell
npm.cmd test
```
Expected: All tests PASS.

- [ ] **Step 5: Run production build**

```powershell
npm.cmd run build
```

- [ ] **Step 6: Commit**

```powershell
git add src/App.vue test/community-designs-gallery.test.js
git commit -m "feat(studio): add Share to Community design submission modal"
```

---

## Task 3: Community Gallery View

**Files:**
- Modify: `src/App.vue` (add `gallery` view with design cards, 3D preview modal, "Use This Design" flow)
- Modify: `test/community-designs-gallery.test.js` (add gallery view tests)

**Interfaces:**
- Consumes: `GET api/designs/list.php` from Task 1 — `{ designs: [...] }`.
- Consumes: `partColors` ref, `selectedCharmId` ref, `selectedShoeId` ref from existing App.vue state.
- Produces: `view === 'gallery'` route with hash `#gallery`.
- Produces: `communityDesigns = ref([])` — loaded from API.
- Produces: `loadCommunityDesigns()` async function.
- Produces: `useDesign(design)` function — loads design colors into studio and navigates to studio view.
- Produces: `showDesignPreview = ref(false)`, `previewDesign = ref(null)` — design detail modal.

- [ ] **Step 1: Write failing tests**

Append to `test/community-designs-gallery.test.js`:

```javascript
describe('Community Designs — Gallery View', () => {
  it('App.vue supports gallery view route', () => {
    assert.ok(appSrc.includes("'gallery'") || appSrc.includes('"gallery"'), 'must support gallery as a view value')
    assert.ok(appSrc.includes('#gallery') || appSrc.includes("=== 'gallery'"), 'must support #gallery hash route')
  })

  it('App.vue has communityDesigns reactive state', () => {
    assert.ok(appSrc.includes('communityDesigns'), 'must have communityDesigns ref')
  })

  it('App.vue has loadCommunityDesigns function calling designs/list.php', () => {
    assert.ok(appSrc.includes('loadCommunityDesigns'), 'must have loadCommunityDesigns function')
    assert.ok(appSrc.includes('designs/list.php'), 'must call designs/list.php endpoint')
  })

  it('App.vue has useDesign function to load design into studio', () => {
    assert.ok(appSrc.includes('useDesign'), 'must have useDesign function')
  })

  it('gallery view renders design cards with color swatches', () => {
    assert.ok(appSrc.includes('designerName') || appSrc.includes('designer-name'), 'must display designer name')
    assert.ok(appSrc.includes('designName') || appSrc.includes('design-name'), 'must display design name')
  })

  it('gallery view has featured designs section', () => {
    assert.ok(appSrc.includes('featured') && appSrc.includes('gallery'), 'must have featured designs handling')
  })

  it('gallery view has empty state', () => {
    assert.ok(
      appSrc.includes('No community designs') || appSrc.includes('no designs') || appSrc.includes('Be the first'),
      'must show empty state when no designs exist'
    )
  })

  it('gallery view has Use This Design button', () => {
    assert.ok(
      appSrc.includes('Use This Design') || appSrc.includes('useDesign'),
      'must have Use This Design action'
    )
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```powershell
npm.cmd test
```

- [ ] **Step 3: Implement gallery view in src/App.vue**

Add reactive state:

```javascript
// ── Community Gallery ──
const communityDesigns = ref([])
const isLoadingDesigns = ref(false)
const designsError = ref('')
const showDesignPreview = ref(false)
const previewDesign = ref(null)
```

Add data fetching and navigation functions:

```javascript
async function loadCommunityDesigns() {
  isLoadingDesigns.value = true
  designsError.value = ''
  try {
    const res = await api('designs/list.php')
    if (Array.isArray(res?.designs)) {
      communityDesigns.value = res.designs
    }
  } catch (err) {
    designsError.value = err.message || 'Could not load community designs.'
  } finally {
    isLoadingDesigns.value = false
  }
}

function useDesign(design) {
  selectedShoeId.value = design.shoeId || design.shoe_id
  partColors.value = { ...(design.partColors || design.part_colors || {}) }
  selectedCharmId.value = design.charmId || design.charm_id || 'none'
  showDesignPreview.value = false
  previewDesign.value = null
  view.value = 'studio'
}

function openDesignPreview(design) {
  previewDesign.value = design
  showDesignPreview.value = true
}

function goToGallery() {
  view.value = 'gallery'
  loadCommunityDesigns()
  if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
}
```

Update `getInitialView()` — add `'gallery'` to valid routes:

```javascript
if (['shop', 'studio', 'track', 'gallery'].includes(target)) {
  return target
}
// ...
if (saved && ['shop', 'studio', 'admin', 'track', 'gallery'].includes(saved)) {
  return saved === 'admin' ? 'login' : saved
}
```

Update `resolveCurrentRoute()` — add `'gallery'` alongside `'studio'` and `'track'`:

```javascript
if (['studio', 'track', 'gallery'].includes(target)) {
  view.value = target
  notFoundPath.value = ''
  return
}
```

Add the gallery `<main>` section with: featured designs grid (border-[#b94d27]), all approved designs grid, design cards with color swatches and "Use This Design" buttons, loading/error/empty states. Empty state says "Be the first to share a design!" with a button to open the 3D Studio.

- [ ] **Step 4: Run tests to verify they pass**

```powershell
npm.cmd test
```

- [ ] **Step 5: Run production build**

```powershell
npm.cmd run build
```

- [ ] **Step 6: Commit**

```powershell
git add src/App.vue test/community-designs-gallery.test.js
git commit -m "feat(gallery): add community designs gallery view with featured section and Use This Design flow"
```

---

## Task 4: Admin Design Moderation Tab

**Files:**
- Modify: `src/components/AdminPanel.vue` (add "Community Designs" tab with moderation controls)
- Modify: `test/community-designs-gallery.test.js` (add admin moderation tests)

**Interfaces:**
- Consumes: `GET api/designs/list.php?include_all=1` from Task 1 — returns all designs for admin.
- Consumes: `POST api/designs/review.php` from Task 1 — `{ id, status, notes }`.
- Produces: `adminSection === 'designs'` tab in AdminPanel navigation.
- Produces: `communityDesigns = ref([])` admin-scoped designs list.
- Produces: `designStatusFilter = ref('all')` — filter tabs.
- Produces: `reviewDesign(id, status, notes)` function.
- Produces: BroadcastChannel listener for `NEW_DESIGN` events (real-time alert).

- [ ] **Step 1: Write failing tests**

Append to `test/community-designs-gallery.test.js`:

```javascript
const adminSrc = fs.readFileSync('src/components/AdminPanel.vue', 'utf8')

describe('Community Designs — Admin Moderation', () => {
  it('AdminPanel has designs tab', () => {
    assert.ok(
      adminSrc.includes("'designs'") || adminSrc.includes('"designs"'),
      'AdminPanel must have designs as an adminSection value'
    )
    assert.ok(
      adminSrc.includes('Community Designs') || adminSrc.includes('community-designs'),
      'AdminPanel must have Community Designs tab label'
    )
  })

  it('AdminPanel fetches all designs for admin moderation', () => {
    assert.ok(adminSrc.includes('designs/list.php'), 'must call designs/list.php')
    assert.ok(adminSrc.includes('include_all'), 'must pass include_all for admin view')
  })

  it('AdminPanel has status filter tabs for designs', () => {
    assert.ok(adminSrc.includes('designStatusFilter') || adminSrc.includes('design-status-filter'), 'must have design status filter')
    assert.ok(adminSrc.includes('pending'), 'must filter by pending')
    assert.ok(adminSrc.includes('approved'), 'must filter by approved')
    assert.ok(adminSrc.includes('rejected'), 'must filter by rejected')
    assert.ok(adminSrc.includes('featured'), 'must filter by featured')
  })

  it('AdminPanel calls designs/review.php for status updates', () => {
    assert.ok(adminSrc.includes('designs/review.php'), 'must call designs/review.php')
  })

  it('AdminPanel renders design cards with color swatches in moderation view', () => {
    assert.ok(adminSrc.includes('partColors') || adminSrc.includes('part_colors'), 'must render part color swatches')
    assert.ok(adminSrc.includes('designerName') || adminSrc.includes('designer_name'), 'must show designer name')
  })

  it('AdminPanel has approve, reject, and feature actions', () => {
    assert.ok(adminSrc.includes('Approve') || adminSrc.includes('approve'), 'must have approve action')
    assert.ok(adminSrc.includes('Reject') || adminSrc.includes('reject'), 'must have reject action')
    assert.ok(adminSrc.includes('Feature') || adminSrc.includes('feature'), 'must have feature action')
  })

  it('AdminPanel listens for NEW_DESIGN BroadcastChannel events', () => {
    assert.ok(adminSrc.includes('kickcraft_designs_channel') || adminSrc.includes('NEW_DESIGN'), 'must listen for NEW_DESIGN broadcasts')
  })

  it('AdminPanel does NOT contain DELETE FROM', () => {
    assert.ok(!adminSrc.match(/DELETE\s+FROM/i), 'physical DELETE FROM is forbidden')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```powershell
npm.cmd test
```

- [ ] **Step 3: Implement admin designs tab in AdminPanel.vue**

Add `'designs'` as a fourth tab in the AdminPanel navigation bar (after `'users'`). Add reactive state: `communityDesigns`, `isLoadingDesigns`, `designStatusFilter`, `pendingDesignCount` computed, `filteredDesigns` computed. Add functions: `loadAdminDesigns()`, `reviewDesign(designId, status, notes)`. Add BroadcastChannel listener for `kickcraft_designs_channel` in `onMounted`. Add `adminSection === 'designs'` section with status filter tabs (all/pending/approved/featured/rejected), design cards showing designer info + color swatches + status badges, and action buttons (Approve/Reject/Feature/Remove Feature/Re-approve).

- [ ] **Step 4: Run tests to verify they pass**

```powershell
npm.cmd test
```

- [ ] **Step 5: Run production build**

```powershell
npm.cmd run build
```

- [ ] **Step 6: Commit**

```powershell
git add src/components/AdminPanel.vue test/community-designs-gallery.test.js
git commit -m "feat(admin): add Community Designs moderation tab with approve/reject/feature controls"
```

---

## Task 5: Navigation Integration, Polish & Final Verification

**Files:**
- Modify: `src/App.vue` (add Gallery link to header navigation, design preview modal)
- Modify: `test/community-designs-gallery.test.js` (add navigation and integration tests)

**Interfaces:**
- Consumes: `goToGallery()` from Task 3.
- Consumes: `loadCommunityDesigns()` from Task 3.
- Consumes: All existing navigation, views, and routing patterns.
- Produces: Gallery link in global `<header>` nav bar (between Track and Login).
- Produces: Design preview modal with full detail view and "Use This Design" action.

- [ ] **Step 1: Write failing tests**

Append to `test/community-designs-gallery.test.js`:

```javascript
describe('Community Designs — Navigation & Integration', () => {
  it('App.vue header navigation includes Gallery link', () => {
    assert.ok(
      appSrc.includes('Gallery') || appSrc.includes('Community'),
      'Header must include a Gallery or Community navigation link'
    )
    assert.ok(
      appSrc.includes('goToGallery') || (appSrc.includes("view = 'gallery'") || appSrc.includes("view.value = 'gallery'")),
      'Gallery link must navigate to gallery view'
    )
  })

  it('App.vue loads community designs when switching to gallery view', () => {
    assert.ok(
      appSrc.includes('loadCommunityDesigns'),
      'must call loadCommunityDesigns when entering gallery view'
    )
  })

  it('App.vue has design preview modal', () => {
    assert.ok(appSrc.includes('showDesignPreview') || appSrc.includes('previewDesign'), 'must have design preview modal state')
  })

  it('App.vue design preview has Use This Design action', () => {
    assert.ok(appSrc.includes('Use This Design'), 'preview modal must have Use This Design button')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```powershell
npm.cmd test
```

- [ ] **Step 3: Add Gallery link to header navigation**

In the `<header>` nav bar in `src/App.vue`, add a "Gallery" link between the existing navigation items:

```html
<button
  type="button"
  class="transition-colors hover:text-[#b94d27]"
  :class="view === 'gallery' ? 'border-b-2 border-[#b94d27] py-5 text-[#202220]' : 'text-[#5f635f]'"
  @click="goToGallery"
>
  Gallery
</button>
```

- [ ] **Step 4: Add design preview modal**

Add the design preview modal after the gallery `<main>` section. It shows the full design name, designer attribution, KCD ID, description, charm info, and a full color palette breakdown with large swatches per part (partId, color name, hex value). Action buttons: "Use This Design" (calls `useDesign(previewDesign)`) and "Close".

- [ ] **Step 5: Run ALL tests to verify everything passes**

```powershell
npm.cmd test
```
Expected: ALL tests pass (existing + all new community design tests).

- [ ] **Step 6: Run production build**

```powershell
npm.cmd run build
```
Expected: Clean build with no errors.

- [ ] **Step 7: Commit**

```powershell
git add src/App.vue test/community-designs-gallery.test.js
git commit -m "feat(nav): add Gallery navigation link, design preview modal, and gallery load trigger"
```

---

## Self-Review Checklist

| Requirement | Task |
|---|---|
| Community designs table in MySQL | Task 1 Step 4 |
| Guest-based submission (no account required) | Task 1 Step 5, Task 2 Step 3 |
| Rate limiting (10/day per email) | Task 1 Step 5 |
| Shoe existence validation before submission | Task 1 Step 5 |
| KCD-YYYY-XXXX ID format | Task 1 Step 5 |
| Admin-only review endpoint | Task 1 Step 7 |
| Public gallery (approved + featured only) | Task 1 Step 6, Task 3 Step 3 |
| Share to Community button in studio | Task 2 Step 3 |
| Design submission modal with preview | Task 2 Step 3 |
| BroadcastChannel for admin alerts | Task 2 Step 3 |
| Gallery view with featured section | Task 3 Step 3 |
| Use This Design → loads into studio | Task 3 Step 3 |
| Empty state in gallery | Task 3 Step 3 |
| Admin designs moderation tab | Task 4 Step 3 |
| Approve / reject / feature controls | Task 4 Step 3 |
| Real-time NEW_DESIGN alert for admin | Task 4 Step 3 |
| Gallery link in header nav | Task 5 Step 3 |
| Design preview modal | Task 5 Step 4 |
| Zero DELETE FROM statements | All tasks |
| 100% PDO prepared statements | Task 1 |
| AGENTS.md scope update | Task 1 Step 3 |
| All tests pass | Every task |
| Production build clean | Every task |
