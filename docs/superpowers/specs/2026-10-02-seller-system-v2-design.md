# KickCraft Seller System v2 — Design Specification

> **Scope change:** Instructor-approved expansion of KickCraft from a single-brand customization studio to a seller-driven 3D shoe marketplace. Sellers register, get admin-approved, upload or AI-generate shoe GLBs, customize them with colors and charms in-system, and list them for buyer pickup reservations. An interactive tutorial system guides average-joe sellers through every step. AGENTS.md must be updated to reflect this scope change as part of Sub-project 1.

> **Supersedes:** `2026-10-01-seller-ecommerce-system-design.md`

---

## System Overview

KickCraft supports three user types:

| Role | Auth | Capabilities |
|---|---|---|
| **Guest/Buyer** | None (name + email at checkout) | Browse catalog, customize KickCraft shoes, order seller products, reserve for pickup |
| **Seller** | Email/password login, admin-approved | Upload GLB or AI-generate from 2D image, customize colors/charms in-system, list products, manage own orders |
| **Owner/Admin** | Email/password login (existing) | Approve sellers, approve product listings, manage all orders, existing admin functions |

### Key Decisions

| Decision | Answer |
|---|---|
| Seller auth | Register with name/email/password → admin approves before seller can list |
| Seller product creation | Three paths: upload own GLB, AI-generate from 2D image, or build from KickCraft template |
| GLB customization | Visual mesh tagger + auto-detect by naming convention; seller tags parts in a 3D viewer |
| In-system customization | Seller sets default colors per part + charm selection using the existing color/charm system |
| 2D → 3D AI | HuggingFace TripoSR (free Gradio Space, no API key, returns GLB) |
| Tutorial system | In-app interactive walkthrough with step-by-step guided overlays |
| Payment | Store pickup, pay at counter (no online payment) |
| Buyer accounts | No — guests (name + email at checkout) |
| Pricing | Seller sets their own price |
| Shipping | Store pickup only (no delivery) |

### Architecture

```text
Vue 3 Frontend
├── Shop / Studio (existing — KickCraft catalog + 3D customization)
├── Marketplace (new — seller product catalog)
├── Seller Dashboard (new — SellerDashboard.vue)
│   ├── Interactive Tutorial Walkthrough
│   ├── My Products (GLB upload, AI generate, template build)
│   ├── Visual Mesh Tagger + Auto-Detect
│   ├── In-System Color & Charm Customizer
│   ├── My Orders
│   └── Store Settings
├── Admin Panel (extended — Sellers + Products + Orders tabs)
└── Track View (extended — order tracking tab)
        │
   PHP API Layer
├── api/auth/         (modified: register.php new, login.php extended)
├── api/sellers/      (new: list, review, profile, update-profile)
├── api/products/     (new: create, update, submit, upload-glb, list, detail, review)
├── api/ai/           (new: generate.php, status.php — HuggingFace proxy)
├── api/orders/       (new: create, track, list, update-status, cancel)
└── Existing: api/shoes/, api/reservations/, api/designs/ (untouched)
        │
   MySQL Database
├── users (modified: 'seller' role added)
├── seller_profiles (new)
├── products (new)
├── product_parts (new)
├── ai_generations (new — tracks 2D→3D jobs)
├── tutorial_progress (new — seller onboarding state)
├── orders (new)
└── Existing: shoes, reservations, community_designs (untouched)
```

### New Hash Routes

| Route | View | Purpose |
|---|---|---|
| `#seller-register` | `seller-register` | Public seller registration form |
| `#seller` | `seller` | Authenticated seller dashboard |
| `#marketplace` | `marketplace` | Public marketplace catalog |

### ID Format Convention

| Entity | Format | Example |
|---|---|---|
| Reservations | `KC-YYYY-XXXX` | `KC-2026-4821` |
| Community Designs | `KCD-YYYY-XXXX` | `KCD-2026-1234` |
| Products | `KCP-YYYY-XXXX` | `KCP-2026-0091` |
| Orders | `KCO-YYYY-XXXX` | `KCO-2026-0512` |
| AI Jobs | `KCAI-YYYY-XXXX` | `KCAI-2026-0003` |

### BroadcastChannel Events

| Channel | Event Types |
|---|---|
| `kickcraft_reservations_channel` (existing) | `NEW_RESERVATION`, `RESERVATION_CANCELLED` |
| `kickcraft_designs_channel` (existing) | `NEW_DESIGN` |
| `kickcraft_sellers_channel` (new) | `NEW_SELLER_APPLICATION` |
| `kickcraft_products_channel` (new) | `PRODUCT_SUBMITTED`, `PRODUCT_APPROVED`, `PRODUCT_REJECTED` |
| `kickcraft_orders_channel` (new) | `NEW_ORDER`, `ORDER_CONFIRMED`, `ORDER_CANCELLED`, `ORDER_READY`, `ORDER_COMPLETED` |

---

## Sub-project 1: Seller Auth & Dashboard Shell

### Goal

A working seller registration → admin approval → seller login → seller dashboard shell. After this sub-project, sellers exist as authenticated users with a dashboard they can log into — but they can't list products yet.

### Database Changes

**Modify `users` table — add `'seller'` to role enum:**

In `api/database/setup.sql`, change:
```sql
role ENUM('customer', 'owner') NOT NULL DEFAULT 'customer'
```
to:
```sql
role ENUM('customer', 'owner', 'seller') NOT NULL DEFAULT 'customer'
```

**New `seller_profiles` table:**
```sql
CREATE TABLE seller_profiles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  store_name VARCHAR(255) NOT NULL,
  store_description TEXT DEFAULT NULL,
  status ENUM('pending', 'approved', 'suspended', 'rejected') NOT NULL DEFAULT 'pending',
  admin_notes TEXT DEFAULT NULL,
  approved_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  permanently_deleted TINYINT(1) NOT NULL DEFAULT 0,
  INDEX idx_seller_user_id (user_id),
  INDEX idx_seller_status (status)
);
```

### API Endpoints

#### `POST api/auth/register.php` (NEW — public)

**Request:**
```json
{
  "name": "Juan Dela Cruz",
  "email": "juan@example.com",
  "password": "securepass123",
  "confirmPassword": "securepass123",
  "storeName": "Juan's Custom Kicks",
  "storeDescription": "Handcrafted Filipino-inspired shoe designs"
}
```

**Validation:**
- `name`: required, 2-255 chars, trimmed
- `email`: required, valid format, unique in users table (case-insensitive)
- `password`: required, min 8 chars
- `confirmPassword`: must match password
- `storeName`: required, 2-255 chars, trimmed
- `storeDescription`: optional, max 1000 chars

**Logic:**
1. Validate all fields
2. Check email uniqueness: `SELECT id FROM users WHERE email = ? AND deleted_at IS NULL AND permanently_deleted = 0`
3. Hash password: `password_hash($password, PASSWORD_DEFAULT)`
4. Insert into `users`: `(name, email, password_hash, role='seller')`
5. Insert into `seller_profiles`: `(user_id, store_name, store_description, status='pending')`
6. Return HTTP 201: `{ success: true, message: "Seller application submitted. Your account is under review." }`

**Errors:**
- 400: Missing/invalid fields
- 409: Email already registered

#### `POST api/auth/login.php` (MODIFIED)

**Current:** `WHERE email = ? AND role = 'owner'`
**New:** `WHERE email = ? AND role IN ('owner', 'seller') AND deleted_at IS NULL AND permanently_deleted = 0`

**Additional for sellers:**
- After successful login, if `role = 'seller'`, query `seller_profiles` for status
- Include `sellerStatus` in response: `pending | approved | suspended | rejected`
- Session stores: `user_id`, `user_name`, `user_email`, `user_role`, and `seller_status` (if seller)

**Response additions for seller:**
```json
{
  "success": true,
  "user": {
    "id": 5,
    "name": "Juan Dela Cruz",
    "email": "juan@example.com",
    "role": "seller"
  },
  "sellerProfile": {
    "storeName": "Juan's Custom Kicks",
    "status": "approved",
    "storeDescription": "..."
  }
}
```

#### `GET api/auth/session.php` (MODIFIED)

Also modified in `api/helpers.php` — `currentSessionUser()`:
- Current: queries `WHERE role = 'owner'`
- New: queries `WHERE role IN ('owner', 'seller')`
- If seller, join `seller_profiles` to include status in response

#### `GET api/sellers/list.php` (NEW — admin only)

**Auth:** `requireAdmin()`
**Query params:** `?status=pending` (optional filter)
**Returns:** Array of seller profiles with user info, sorted by created_at DESC

#### `POST api/sellers/review.php` (NEW — admin only)

**Auth:** `requireAdmin()`
**Request:**
```json
{
  "userId": 5,
  "status": "approved",
  "notes": "Welcome aboard!"
}
```
**Validation:** `status` must be one of `approved`, `rejected`, `suspended`
**Logic:** Updates `seller_profiles.status`, `admin_notes`, sets `approved_at` if approving

#### `GET api/sellers/profile.php` (NEW — seller only)

**Auth:** `requireSeller()` (new helper — checks `role = 'seller'`, any status)
**Returns:** Own seller profile with store info and status

#### `PUT api/sellers/update-profile.php` (NEW — approved seller only)

**Auth:** `requireApprovedSeller()` (new helper — checks `role = 'seller'` AND `status = 'approved'`)
**Request:** `{ "storeName": "...", "storeDescription": "..." }`
**Validation:** Same as registration fields for store name/description

### Auth Helpers (api/helpers.php additions)

```php
function requireSeller($pdo = null) {
    // Checks session role = 'seller', returns user or 401
}

function requireApprovedSeller($pdo = null) {
    // Checks session role = 'seller' AND seller_profiles.status = 'approved'
    // Returns 403 if not approved
}
```

### Frontend: Seller Registration View (`#seller-register`)

In `src/App.vue`, add view `'seller-register'`:

- Clean brutalist registration form
- Fields: name, email, password, confirm password, store name, store description (textarea)
- Client-side validation with error messages per field
- Password strength indicator (min 8 chars)
- Submit calls `api/auth/register.php`
- Success state: brutalist verification stamp `[ ✓ APPLICATION SUBMITTED · UNDER REVIEW ]`
- "Already have an account? Log in" link → `#login`
- Error state: server validation errors displayed inline

### Frontend: Login View Modifications

- Current login routes to `#admin` on success
- Modified: check `role` in response
  - `owner` → `view = 'admin'`
  - `seller` → `view = 'seller'`
- Login form gets a subtle "Don't have a seller account? Register" link → `#seller-register`

### Frontend: Seller Dashboard (`src/components/SellerDashboard.vue`)

**New component** — extracted to prevent App.vue growth.

**Props:** `currentUser`, `sellerProfile`

**Conditional rendering by seller status:**

**Pending state:**
```text
┌─────────────────────────────────────┐
│  ⏳ Application Under Review        │
│                                     │
│  Your seller application for        │
│  "Juan's Custom Kicks" is being     │
│  reviewed by our team.              │
│                                     │
│  Store Name: Juan's Custom Kicks    │
│  Email: juan@example.com            │
│  Applied: Oct 1, 2026              │
│                                     │
│  [ Log Out ]                        │
└─────────────────────────────────────┘
```

**Rejected state:**
```text
┌─────────────────────────────────────┐
│  ✕ Application Not Approved         │
│                                     │
│  Reason: [admin_notes displayed]    │
│                                     │
│  Contact admin@kickcraft.local      │
│  for more information.              │
│                                     │
│  [ Log Out ]                        │
└─────────────────────────────────────┘
```

**Suspended state:**
```text
┌─────────────────────────────────────┐
│  ⚠ Account Suspended                │
│                                     │
│  Reason: [admin_notes displayed]    │
│                                     │
│  [ Log Out ]                        │
└─────────────────────────────────────┘
```

**Approved state — full dashboard:**
```text
┌─────────────────────────────────────────────────┐
│  KICKCRAFT SELLER STUDIO                        │
│  Juan's Custom Kicks                            │
│                                                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │ My       │ │ My       │ │ Store    │       │
│  │ Products │ │ Orders   │ │ Settings │       │
│  │ (0)      │ │ (0)      │ │          │       │
│  └──────────┘ └──────────┘ └──────────┘       │
│                                                 │
│  [Products tab — placeholder for Sub-project 2] │
│  "You haven't listed any products yet."         │
│  [ + Create New Product ]                       │
│                                                 │
│  💡 First time? [ Start Tutorial ]              │
│                                                 │
└─────────────────────────────────────────────────┘
```

Tabs are placeholders wired in Sub-projects 2 and 3:
- "My Products" → wired in Sub-project 2
- "My Orders" → wired in Sub-project 3
- "Store Settings" → edit store name/description (implemented in Sub-project 1)

### Frontend: AdminPanel.vue — New "Sellers" Tab

Add `'sellers'` section to AdminPanel navigation:

- Tab label: "Sellers" with pending count badge (amber)
- Filter tabs: All, Pending, Approved, Rejected, Suspended
- Seller cards showing:
  - Store name, seller name, email, registration date
  - Status badge (pending: amber, approved: green, rejected: terracotta, suspended: gray)
  - Store description excerpt
- Action buttons per status:
  - Pending: "Approve", "Reject"
  - Approved: "Suspend"
  - Rejected: "Re-review" (sets back to pending)
  - Suspended: "Reinstate" (sets to approved), "Reject"
- Reject/Suspend modal: reason textarea with optional preset buttons
- Real-time alert via `BroadcastChannel('kickcraft_sellers_channel')` on new applications

### Frontend: Header Navigation Updates

- If logged-in seller: show "My Store" link → `#seller`
- If not logged in: show "Sell on KickCraft" link → `#seller-register`
- Login page includes "Register as Seller" CTA

### Routing Updates (src/App.vue)

Add to `getInitialView()` and `resolveCurrentRoute()`:
- `'seller-register'` → public, anyone can access
- `'seller'` → requires authenticated seller session
  - If not logged in → redirect to `#login`
  - If logged in as owner → redirect to `#admin`
  - If logged in as seller → show `SellerDashboard.vue`

### Security Constraints

- Seller can ONLY access their own profile: `WHERE user_id = $_SESSION['user_id']`
- `requireSeller()` and `requireApprovedSeller()` helpers enforce role checks
- Password: `password_hash()` with `PASSWORD_DEFAULT` (bcrypt)
- Email uniqueness enforced at database level (UNIQUE constraint) and application level
- Admin approval is mandatory — seller_profiles.status must be 'approved' for any seller operations beyond viewing own status
- Session regeneration on login (existing pattern)

---

## Sub-project 2: Product System + Tutorial + AI Generation

### Goal

Approved sellers can create product listings via three paths: upload a custom GLB, AI-generate a 3D model from a 2D shoe image (via HuggingFace TripoSR), or build from KickCraft's modular template. All three paths lead to an in-system customizer where sellers tag mesh parts, set colors, and attach charms. An interactive tutorial walkthrough guides first-time sellers through every step. Admin approves listings before they appear in the public marketplace.

### Database Changes

**New `products` table:**
```sql
CREATE TABLE products (
  id VARCHAR(64) PRIMARY KEY,
  seller_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT DEFAULT NULL,
  price DECIMAL(10,2) NOT NULL,
  stock INT NOT NULL DEFAULT 0,
  creation_method ENUM('upload', 'ai_generate', 'template') NOT NULL,
  glb_path VARCHAR(500) DEFAULT NULL,
  thumbnail_path VARCHAR(500) DEFAULT NULL,
  base_shoe_id VARCHAR(100) DEFAULT NULL,
  part_colors JSON DEFAULT NULL,
  charm_id VARCHAR(50) DEFAULT 'none',
  mesh_map JSON DEFAULT NULL,
  sizes_available JSON NOT NULL DEFAULT '[]',
  status ENUM('draft', 'pending', 'approved', 'rejected', 'suspended') NOT NULL DEFAULT 'draft',
  admin_notes TEXT DEFAULT NULL,
  approved_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  permanently_deleted TINYINT(1) NOT NULL DEFAULT 0,
  INDEX idx_products_seller (seller_id),
  INDEX idx_products_status (status),
  INDEX idx_products_method (creation_method)
);
```

The `mesh_map` JSON column stores the seller's mesh-to-part tagging:
```json
{
  "Upper": { "meshName": "Object_1", "defaultColor": "#f1efe8" },
  "ToeCap": { "meshName": "Object_2", "defaultColor": "#292b2d" },
  "Midsole": { "meshName": "sole_mesh", "defaultColor": "#ffffff" }
}
```

**New `ai_generations` table:**
```sql
CREATE TABLE ai_generations (
  id VARCHAR(64) PRIMARY KEY,
  seller_id INT NOT NULL,
  source_image_path VARCHAR(500) NOT NULL,
  status ENUM('queued', 'processing', 'completed', 'failed') NOT NULL DEFAULT 'queued',
  result_glb_path VARCHAR(500) DEFAULT NULL,
  provider VARCHAR(50) NOT NULL DEFAULT 'huggingface_triposr',
  error_message TEXT DEFAULT NULL,
  started_at TIMESTAMP NULL DEFAULT NULL,
  completed_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ai_seller (seller_id),
  INDEX idx_ai_status (status)
);
```

**New `tutorial_progress` table:**
```sql
CREATE TABLE tutorial_progress (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  completed_steps JSON NOT NULL DEFAULT '[]',
  current_step VARCHAR(50) DEFAULT 'welcome',
  tutorial_completed TINYINT(1) NOT NULL DEFAULT 0,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL DEFAULT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_tutorial_user (user_id)
);
```

### 2D → 3D AI Generation: HuggingFace TripoSR

#### How It Works

TripoSR is an open-source image-to-3D model hosted as a free Gradio Space on HuggingFace (`stabilityai/TripoSR`). The PHP backend acts as a proxy:

```text
Seller uploads 2D image
        │
   Vue frontend → POST api/ai/generate.php (image file)
        │
   PHP saves image locally, creates ai_generations record (status: 'queued')
        │
   PHP calls HuggingFace Gradio API via cURL:
   POST https://stabilityai-triposr.hf.space/api/predict
   with the image as base64 or file upload
        │
   HuggingFace processes (30-120 seconds typically)
        │
   PHP receives result (OBJ/GLB file URL), downloads it
        │
   PHP saves GLB to public/models/seller-ai/{hash}.glb
   Updates ai_generations record (status: 'completed', result_glb_path)
        │
   Frontend polls api/ai/status.php until completed
        │
   Seller proceeds to mesh tagger with the generated GLB
```

#### API Endpoints

##### `POST api/ai/generate.php` (NEW — approved seller only)

**Auth:** `requireApprovedSeller()`
**Request:** multipart/form-data with `image` file (JPG/PNG, max 10MB)

**Validation:**
- Image file required, must be JPG or PNG
- Max 10MB file size
- `getimagesize()` validation
- Seller must not have more than 3 concurrent queued/processing jobs

**Logic:**
1. Generate ID: `KCAI-YYYY-XXXX`
2. Save image to `public/images/ai-source/{hash}.{ext}` with cryptographic filename
3. Insert into `ai_generations` with `status = 'queued'`
4. **Synchronous processing** (simplest for school project):
   - Update status to `'processing'`, set `started_at`
   - Call HuggingFace TripoSR Gradio endpoint via cURL:
     ```php
     $ch = curl_init();
     curl_setopt($ch, CURLOPT_URL, 'https://stabilityai-triposr.hf.space/api/predict');
     curl_setopt($ch, CURLOPT_POST, true);
     curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
         'data' => [
             'https://your-server.com/images/ai-source/' . $filename,
             // or base64 data URI
             256,    // resolution
             0.5     // threshold
         ],
         'fn_index' => 1
     ]));
     curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
     curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
     curl_setopt($ch, CURLOPT_TIMEOUT, 180); // 3 minute timeout
     $response = curl_exec($ch);
     ```
   - Parse response, download the resulting 3D file
   - Convert to GLB if needed (TripoSR may return OBJ — use a simple PHP conversion or store as-is for model-viewer which supports both)
   - Save to `public/models/seller-ai/{hash}.glb`
   - Update `ai_generations`: `status = 'completed'`, `result_glb_path`, `completed_at`
5. Return: `{ success: true, generation: { id, status, resultGlbPath } }`

**Error handling:**
- HuggingFace timeout: set status to `'failed'`, error_message = "Generation timed out. The AI service may be busy — try again."
- HuggingFace queue full: set status to `'failed'`, error_message = "AI service is currently busy. Please try again in a few minutes."
- Invalid response: set status to `'failed'`, log error details

**Note on Gradio endpoint:** The exact `fn_index` and parameter format depends on the Space's current API. The implementation must check `https://stabilityai-triposr.hf.space/api/info` at build time to confirm the correct function index and parameter schema. If the TripoSR Space is down or changes, the system gracefully shows "AI generation is temporarily unavailable" rather than crashing.

##### `GET api/ai/status.php` (NEW — approved seller only)

**Auth:** `requireApprovedSeller()`
**Query params:** `?id=KCAI-2026-0003`
**Validation:** Generation must belong to seller
**Returns:** Current status, result path if completed, error message if failed

##### `GET api/ai/list.php` (NEW — approved seller only)

**Auth:** `requireApprovedSeller()`
**Returns:** All AI generations for this seller, sorted by created_at DESC

### Visual Mesh Tagger + Auto-Detect

When a seller has a GLB file (from upload or AI generation), they enter the **Mesh Tagger** — a visual interface for mapping 3D mesh names to customizable shoe parts.

#### Auto-Detect Logic (runs first)

When a GLB is loaded in `<model-viewer>`, JavaScript inspects the model's mesh/material names:

```javascript
const KNOWN_PARTS = {
  'Upper':      ['upper', 'body', 'main', 'vamp'],
  'ToeCap':     ['toecap', 'toe_cap', 'toe', 'front'],
  'Tongue':     ['tongue', 'tongue_mesh'],
  'Laces':      ['laces', 'lace', 'shoelace'],
  'HeelPanel':  ['heel', 'heel_panel', 'heelpanel', 'back'],
  'SideAccents': ['side', 'accent', 'side_accent', 'sideaccent', 'swoosh', 'logo'],
  'Midsole':    ['midsole', 'mid_sole', 'mid'],
  'Outsole':    ['outsole', 'out_sole', 'sole', 'bottom']
};

function autoDetectParts(modelViewer) {
  const model = modelViewer.model;
  const meshMap = {};
  
  for (const material of model.materials) {
    const meshName = material.name.toLowerCase();
    for (const [partName, aliases] of Object.entries(KNOWN_PARTS)) {
      if (aliases.some(alias => meshName.includes(alias))) {
        meshMap[partName] = {
          meshName: material.name,
          defaultColor: '#ffffff',
          autoDetected: true
        };
        break;
      }
    }
  }
  
  return meshMap;
}
```

If auto-detect finds matches, they're pre-filled in the visual tagger. The seller can accept, modify, or override them.

#### Visual Mesh Tagger UI

```text
┌──────────────────────────────────────────────────────────────┐
│  MESH TAGGER                                        Step 2/4 │
│                                                              │
│  ┌─────────────────────┐  ┌─────────────────────────────┐   │
│  │                     │  │  Detected Parts:             │   │
│  │   [3D model-viewer  │  │                              │   │
│  │    showing the GLB  │  │  ✓ Upper → "Object_1"  [✏️] │   │
│  │    with highlighted │  │  ✓ ToeCap → "Object_2" [✏️] │   │
│  │    parts on hover]  │  │  ✓ Midsole → "sole"    [✏️] │   │
│  │                     │  │  ⚠ Tongue → not found  [🔗] │   │
│  │   Click a mesh to   │  │  ⚠ Laces → not found   [🔗] │   │
│  │   select it, then   │  │                              │   │
│  │   assign a part     │  │  Unassigned meshes:          │   │
│  │   from the right    │  │  · "Object_3" [click→assign] │   │
│  │   panel.            │  │  · "Object_4" [click→assign] │   │
│  │                     │  │  · "inner_lining" [skip]     │   │
│  └─────────────────────┘  │                              │   │
│                            │  Minimum: 3 parts tagged     │   │
│                            │  [ Accept & Continue → ]     │   │
│                            └─────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

**Interaction:**
1. GLB loads in `<model-viewer>` on the left
2. Auto-detect runs and pre-fills known parts (shown with ✓)
3. Unmatched parts shown with ⚠ — seller clicks a mesh in the 3D viewer, then assigns it to a part slot
4. Clicking a mesh highlights it with a bright color
5. The [🔗] button lets seller manually link an unassigned mesh to a part
6. The [✏️] button lets seller change the mesh assignment
7. Minimum 3 parts must be tagged before continuing
8. "Accept & Continue" saves the `mesh_map` JSON and moves to the color customizer

**Mesh highlighting:** Uses `model-viewer`'s material API to temporarily change a material's base color to a highlight color when hovered/selected:
```javascript
// Highlight a material
material.pbrMetallicRoughness.setBaseColorFactor([1, 0.4, 0, 1]); // orange highlight
// Restore
material.pbrMetallicRoughness.setBaseColorFactor(originalColor);
```

### In-System Color & Charm Customizer (for seller products)

After mesh tagging, the seller enters the **Product Customizer** — reusing the existing KickCraft color picker and charm system but adapted for seller products.

```text
┌──────────────────────────────────────────────────────────────┐
│  PRODUCT CUSTOMIZER                                 Step 3/4 │
│                                                              │
│  ┌─────────────────────┐  ┌─────────────────────────────┐   │
│  │                     │  │  Color each part:            │   │
│  │   [3D model-viewer  │  │                              │   │
│  │    live preview     │  │  Upper:      [■ #f1efe8] 🎨  │   │
│  │    with current     │  │  ToeCap:     [■ #292b2d] 🎨  │   │
│  │    colors applied]  │  │  Midsole:    [■ #ffffff] 🎨  │   │
│  │                     │  │                              │   │
│  │                     │  │  ── Charm ──                 │   │
│  │                     │  │  ○ None  ● Star  ○ Bolt     │   │
│  │                     │  │  ○ K-Tag                     │   │
│  │                     │  │                              │   │
│  │                     │  │  ── Quick Presets ──         │   │
│  │                     │  │  [Chalk Court] [Night Run]   │   │
│  │                     │  │  [Trail Moss]  [Burgundy]    │   │
│  │                     │  │                              │   │
│  └─────────────────────┘  │  [ ← Back ] [ Continue → ]  │   │
│                            └─────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

This reuses the existing `setMaterialColor()` function from `customization.js` but operates on the seller's tagged `mesh_map` rather than the hardcoded KickCraft shoe parts. The color picker and charm selector are the same UI components already in the codebase.

### Interactive Tutorial Walkthrough System

#### Design Philosophy

The tutorial is an **in-app guided overlay** that walks a first-time seller through the complete product creation flow. It activates automatically on a seller's first visit to the dashboard (unless dismissed) and can be replayed anytime via the "Start Tutorial" button.

#### Tutorial Steps

| Step ID | Title | What it teaches | Overlay target |
|---|---|---|---|
| `welcome` | "Welcome to Your Seller Studio" | Overview of the dashboard layout | Full dashboard |
| `create_product` | "Create Your First Product" | How to click "+ Create New Product" | The create button |
| `choose_method` | "Choose How to Create" | Explains the 3 paths: upload GLB, AI generate, or template | Method selection cards |
| `upload_glb` | "Upload a 3D Shoe Model" | How to upload a .glb file, file requirements | Upload dropzone |
| `ai_generate` | "Generate 3D from a Photo" | How to upload a 2D shoe image for AI conversion | AI generation panel |
| `mesh_tagger` | "Tag Your Shoe Parts" | How auto-detect works and how to manually tag parts | Mesh tagger view |
| `customize_colors` | "Set Your Colors & Charm" | How to pick colors per part and attach a charm | Color customizer |
| `product_details` | "Add Product Details" | Name, description, price, sizes, stock | Details form |
| `submit_review` | "Submit for Review" | How to submit for admin approval | Submit button |
| `manage_orders` | "Manage Your Orders" | How to see and process incoming orders | Orders tab |

#### Tutorial Overlay Component

```text
┌──────────────────────────────────────────────────┐
│  ┌─ Step 3 of 10 ─────────────────────────────┐  │
│  │                                              │  │
│  │  🎨 "Tag Your Shoe Parts"                   │  │
│  │                                              │  │
│  │  The system automatically detects parts      │  │
│  │  of your shoe model. Parts marked with ✓     │  │
│  │  were auto-detected. Click any mesh in the   │  │
│  │  3D viewer to manually assign undetected     │  │
│  │  parts.                                      │  │
│  │                                              │  │
│  │  You need at least 3 tagged parts for        │  │
│  │  customers to customize your shoe.           │  │
│  │                                              │  │
│  │  [ ← Previous ]  [ Next → ]  [ Skip All ]   │  │
│  │                  ● ● ● ○ ○ ○ ○ ○ ○ ○        │  │
│  └──────────────────────────────────────────────┘  │
│                                                    │
│  ↓ (arrow pointing to highlighted UI element)      │
└──────────────────────────────────────────────────┘
```

**Implementation approach:**
- A `TutorialOverlay.vue` component renders a semi-transparent backdrop with a "spotlight" cutout over the target element
- Target elements are identified by `data-tutorial="step-id"` attributes on dashboard elements
- The overlay positions a tooltip card near the spotlight using `getBoundingClientRect()`
- Progress is saved to `tutorial_progress` table via `api/tutorial/update.php` so it persists across sessions
- "Skip All" dismisses the tutorial and marks it complete
- "Start Tutorial" button in the dashboard header replays from the beginning

#### Tutorial API Endpoints

##### `GET api/tutorial/progress.php` (NEW — seller only)

**Auth:** `requireSeller()`
**Returns:** Current tutorial step, completed steps array, whether tutorial is complete

##### `POST api/tutorial/update.php` (NEW — seller only)

**Auth:** `requireSeller()`
**Request:** `{ "currentStep": "mesh_tagger", "completedSteps": ["welcome", "create_product", "choose_method"] }`
**Logic:** Upserts into `tutorial_progress`

### Product Creation Wizard

The wizard has four steps, with the first step branching into three creation methods:

#### Step 0: Choose Creation Method

```text
┌────────────────────────────────────────────────────────────────────┐
│  CREATE NEW PRODUCT                                                │
│                                                                    │
│  How would you like to create your shoe?                           │
│                                                                    │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐     │
│  │  📁 Upload GLB  │ │  🤖 AI Generate │ │  🧩 Template    │     │
│  │                 │ │                 │ │    Builder      │     │
│  │  Upload your    │ │  Upload a 2D    │ │  Build from     │     │
│  │  own 3D shoe    │ │  shoe photo     │ │  KickCraft's    │     │
│  │  model (.glb)   │ │  and AI will    │ │  modular shoe   │     │
│  │                 │ │  generate a 3D  │ │  parts          │     │
│  │                 │ │  model for you  │ │                 │     │
│  │  [ Select ]     │ │  [ Select ]     │ │  [ Select ]     │     │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘     │
│                                                                    │
│  💡 Not sure? The tutorial will walk you through each option.      │
└────────────────────────────────────────────────────────────────────┘
```

#### Path A: Upload GLB

1. **Upload** — drag-and-drop or file picker for .glb (max 20MB), thumbnail image (max 5MB)
2. **Mesh Tagger** — auto-detect + visual tagger (described above)
3. **Color & Charm Customizer** — set default colors per tagged part + charm
4. **Product Details** — name, description, price, stock, sizes

#### Path B: AI Generate from 2D Image

1. **Upload 2D Image** — drag-and-drop or file picker for shoe photo (JPG/PNG, max 10MB)
   - Tips shown: "Use a photo with a clean background", "Side view works best", "Good lighting helps"
   - "Generate 3D Model" button → calls `api/ai/generate.php`
   - Loading state with progress animation: "AI is generating your 3D model… this may take 1-3 minutes"
   - If the HuggingFace Space is busy: "The AI service is currently processing other requests. Please wait…"
   - On success: 3D preview of the generated model with "Use This Model" or "Try Again" buttons
   - On failure: error message with "Try Again" button and suggestion to use Upload instead
2. **Mesh Tagger** — same as Path A (auto-detect + visual tagger on the AI-generated GLB)
3. **Color & Charm Customizer** — same as Path A
4. **Product Details** — same as Path A

#### Path C: Template Builder

1. **Pick Base Shoe** — select from KickCraft catalog (shows available shoe templates)
2. **Recolor Parts** — existing 8-part color picker on the template shoe
3. **Charm Selection** — existing charm system (none, star, bolt, K-tag)
4. **Product Details** — name, description, price, stock, sizes

All three paths end at the **Product Details** form, then save as `status = 'draft'`.

### Product API Endpoints

#### `POST api/products/create.php` (NEW — approved seller only)

**Auth:** `requireApprovedSeller()`

**Request (upload/ai_generate method):**
```json
{
  "name": "Street Runner X",
  "description": "Urban-inspired running shoe",
  "price": 5490.00,
  "creationMethod": "upload",
  "glbPath": "/models/seller-uploads/abc123.glb",
  "thumbnailPath": "/images/seller-uploads/abc123.jpg",
  "meshMap": {
    "Upper": { "meshName": "Object_1", "defaultColor": "#f1efe8" },
    "ToeCap": { "meshName": "Object_2", "defaultColor": "#292b2d" }
  },
  "partColors": { "Upper": "#f1efe8", "ToeCap": "#292b2d" },
  "charmId": "star",
  "sizesAvailable": [7, 8, 9, 10, 11, 12],
  "stock": 10
}
```

**Request (template method):**
```json
{
  "name": "Sunset Runner",
  "description": "Warm-toned custom build",
  "price": 6290.00,
  "creationMethod": "template",
  "baseShoeId": "kickcraft-one",
  "partColors": { "Upper": "#FF6B35", "Midsole": "#1A1A2E" },
  "charmId": "star",
  "sizesAvailable": [7, 8, 9, 10, 11],
  "stock": 5
}
```

**Logic:**
1. Generate ID: `KCP-YYYY-XXXX`
2. Insert into `products` with `status = 'draft'`, `seller_id = session user`
3. Return product ID

#### `POST api/products/upload-glb.php` (NEW — approved seller only)

**Auth:** `requireApprovedSeller()`
**Reuses existing upload pattern from `api/shoes/upload.php`:**
- Max 20MB for GLB, 5MB for thumbnails
- glTF magic byte validation (`glTF` header check)
- Image validation via `getimagesize()`
- Cryptographic filename: `bin2hex(random_bytes(16))`
- Storage: `public/models/seller-uploads/{hash}.glb` and `public/images/seller-uploads/{hash}.ext`
- Returns path for association with product

#### `POST api/products/submit.php` (NEW — approved seller only)

**Auth:** `requireApprovedSeller()`
**Request:** `{ "productId": "KCP-2026-0091" }`
**Validation:**
- Product must belong to seller (`WHERE id = ? AND seller_id = ?`)
- Product must be in `draft` or `rejected` status
- Required fields must be filled (name, price, stock > 0, sizes_available non-empty)
- If upload/ai_generate method: glb_path must exist
- If template method: base_shoe_id must reference valid shoe
- mesh_map must have at least 3 tagged parts (for upload/ai_generate methods)
**Logic:** Update `status = 'pending'`
**Broadcast:** `{ type: 'PRODUCT_SUBMITTED', product }` on `kickcraft_products_channel`

#### `GET api/products/list.php` (NEW — mixed auth)

**Public (no auth):** Returns only `status = 'approved'` products with seller store name
**Seller (authenticated):** Returns own products (all statuses), `WHERE seller_id = ?`
**Admin (authenticated):** Returns all products with `?include_all=1`
**Query params:** `?status=pending&seller_id=5&method=upload` (admin/seller filters)

#### `GET api/products/detail.php` (NEW — public)

**Query params:** `?id=KCP-2026-0091`
**Public:** Only returns `approved` products
**Returns:** Full product detail including seller info, mesh_map, part_colors, sizes, stock

#### `POST api/products/review.php` (NEW — admin only)

**Auth:** `requireAdmin()`
**Request:**
```json
{
  "productId": "KCP-2026-0091",
  "status": "approved",
  "notes": "Looks great, approved!"
}
```
**Validation:** `status` must be `approved`, `rejected`, or `suspended`
**Logic:** Updates product status, admin_notes, sets approved_at if approving
**Broadcast:** `PRODUCT_APPROVED` or `PRODUCT_REJECTED` on `kickcraft_products_channel`

### Frontend: Marketplace View (`#marketplace`)

New view in `src/App.vue`:

- Header: "KickCraft Marketplace" with subtitle
- Responsive grid of approved seller products
- Product cards:
  - Thumbnail or 3D mini-preview
  - Product name
  - Seller store name (linked)
  - Price (formatted with peso sign)
  - Creation method badge (🤖 AI Generated, 📁 Custom Upload, 🧩 Template)
  - "View Details" button
- Filters sidebar/top bar:
  - Sort: Newest, Price Low-High, Price High-Low
  - Filter by creation method: All, Custom Upload, AI Generated, Template Build
  - Price range slider
- Empty state: "No products available yet" with CTA for sellers
- Loading and error states (existing patterns)

**Product detail page (modal or inline):**
- Full 3D `<model-viewer>` with the product's GLB
- Customizable parts rendered using the `mesh_map` — buyer can change colors on tagged parts
- Product name, description, price
- Seller store name
- Charm displayed via `<extra-model>` if set
- Available sizes with selection
- Stock indicator
- "Reserve for Pickup" button → checkout flow (wired in Sub-project 3)

### Frontend: AdminPanel.vue — New "Products" Tab

- Tab label: "Products" with pending count badge
- Filter tabs: All, Pending, Approved, Rejected, Suspended
- Product cards: thumbnail, name, seller store name, price, creation method, status
- Product detail modal:
  - 3D viewer (if GLB available)
  - Full product info, seller info
  - Mesh map breakdown showing tagged parts
  - File info (GLB size, upload date)
  - AI generation info if applicable (source image, generation time)
- Action buttons: Approve, Reject (with notes), Suspend
- Rejection modal with presets: "3D model quality insufficient", "Inappropriate content", "Pricing policy violation"

### Header Navigation Update

- Add "Marketplace" link between "Gallery" and seller/login links
- Active state styling when `view === 'marketplace'`

### Security

- Sellers can ONLY manage their own products: `WHERE seller_id = $_SESSION['user_id']`
- GLB uploads: 20MB max, glTF magic byte validation, cryptographic filenames
- Thumbnail uploads: 5MB max, image format validation
- AI source images: 10MB max, JPG/PNG only, `getimagesize()` validation
- Seller uploads stored in separate directories:
  - `public/models/seller-uploads/` (uploaded GLBs)
  - `public/models/seller-ai/` (AI-generated GLBs)
  - `public/images/seller-uploads/` (thumbnails)
  - `public/images/ai-source/` (source 2D images)
- Products require admin approval before public visibility — no auto-publish
- Price validation: must be positive, max 2 decimal places, reasonable range (₱100 - ₱999,999)
- Admin can suspend any product at any time
- AI generation rate-limited: max 3 concurrent jobs per seller

---

## Sub-project 3: E-Commerce Order Flow

### Goal

Buyers can order seller products from the marketplace with guest checkout (name + email), reserve for store pickup, and track their order. Sellers see incoming orders. Admin has global order oversight.

### Database Changes

**New `orders` table:**
```sql
CREATE TABLE orders (
  id VARCHAR(64) PRIMARY KEY,
  product_id VARCHAR(64) NOT NULL,
  seller_id INT NOT NULL,
  customer_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  size INT NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  unit_price DECIMAL(10,2) NOT NULL,
  total_price DECIMAL(10,2) NOT NULL,
  pickup_date DATE NOT NULL,
  product_name VARCHAR(255) NOT NULL,
  product_thumbnail VARCHAR(500) DEFAULT NULL,
  seller_store_name VARCHAR(255) NOT NULL,
  custom_colors JSON DEFAULT NULL,
  custom_charm VARCHAR(50) DEFAULT 'none',
  status ENUM('pending', 'confirmed', 'ready', 'completed', 'cancelled') NOT NULL DEFAULT 'pending',
  notes TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  permanently_deleted TINYINT(1) NOT NULL DEFAULT 0,
  INDEX idx_orders_product (product_id),
  INDEX idx_orders_seller (seller_id),
  INDEX idx_orders_email (email),
  INDEX idx_orders_status (status),
  INDEX idx_orders_pickup (pickup_date),
  INDEX idx_orders_created (created_at)
);
```

`custom_colors` and `custom_charm` capture the buyer's color choices if the product supports customization.

### Order Status Flow

```text
  pending ──→ confirmed ──→ ready ──→ completed
     │            │           │
     └────────────┴───────────┴──→ cancelled
```

| Status | Meaning | Who Transitions |
|---|---|---|
| `pending` | Order placed, awaiting seller acknowledgment | System (auto on creation) |
| `confirmed` | Seller accepted the order | Seller |
| `ready` | Shoe ready for store pickup | Seller |
| `completed` | Customer picked up | Seller or Admin |
| `cancelled` | Cancelled with reason in `notes` | Seller, Admin, or Buyer (pending only) |

### API Endpoints

#### `POST api/orders/create.php` (NEW — public)

**Request:**
```json
{
  "productId": "KCP-2026-0091",
  "size": 10,
  "quantity": 1,
  "customerName": "Mark Santos",
  "email": "mark@example.com",
  "pickupDate": "2026-10-15",
  "customColors": { "Upper": "#FF6B35", "Midsole": "#1A1A2E" },
  "customCharm": "star"
}
```

**Validation:**
- `productId`: required, must exist, must be `status = 'approved'`
- `size`: required, must be in product's `sizes_available`
- `quantity`: required, positive integer, default 1
- `customerName`: required, 2-255 chars
- `email`: required, valid format
- `pickupDate`: required, must be future date (at least tomorrow)
- `customColors`: optional JSON, keys must match product's `mesh_map` parts
- `customCharm`: optional, must be one of `none`, `star`, `bolt`, `ktag`
- Stock check: `product.stock >= quantity`

**Logic:**
1. Generate ID: `KCO-YYYY-XXXX`
2. Snapshot: `unit_price = product.price`, `total_price = unit_price * quantity`, `product_name`, `product_thumbnail`, `seller_store_name`
3. Atomically decrement stock: `UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?`
   - If affected rows = 0, return 409 "Out of stock"
4. Insert into `orders` with `custom_colors` and `custom_charm`
5. Broadcast `{ type: 'NEW_ORDER', order }` on `kickcraft_orders_channel`
6. Return HTTP 201: `{ success: true, order: { id, ... } }`

#### `GET api/orders/track.php` (NEW — public)

**Query params:** `?email=mark@example.com&orderId=KCO-2026-0512`
**Validation:** Both required
**Returns:** Order details if email matches, 404 otherwise

#### `GET api/orders/list.php` (NEW — seller/admin)

**Seller auth:** Returns orders for seller's products: `WHERE seller_id = ?`
**Admin auth:** Returns all orders with `?include_all=1`
**Query params:** `?status=pending&date_from=2026-10-01&date_to=2026-10-31`

#### `POST api/orders/update-status.php` (NEW — seller/admin)

**Auth:** Seller (own orders only) or Admin (any order)
**Request:**
```json
{
  "orderId": "KCO-2026-0512",
  "status": "confirmed",
  "notes": "Order confirmed, preparing your shoe"
}
```
**Valid transitions:**
- Seller: `pending→confirmed`, `confirmed→ready`, `ready→completed`
- Admin: any transition
**Broadcasts:** corresponding event on `kickcraft_orders_channel`

#### `POST api/orders/cancel.php` (NEW — public/seller/admin)

**For buyers (public):** `{ "orderId": "...", "email": "...", "reason": "Changed my mind" }`
- Only cancellable if `status = 'pending'` and email matches
- Restores product stock

**For seller:** `{ "orderId": "...", "reason": "..." }` — can cancel pending/confirmed
- Restores stock

**For admin:** Can cancel any non-completed order
- Restores stock

### Frontend: Product Detail → Checkout Flow

On the marketplace product detail view, after customizing and selecting size:

1. "Reserve for Pickup" button opens inline checkout form
2. Form fields: Name, Email (auto-filled from localStorage), Pickup Date (calendar)
3. Order summary: product name, size, price, seller, pickup date, custom colors/charm
4. "Place Order" button → POST api/orders/create.php
5. Success: brutalist verification stamp `[ ✓ ORDER PLACED · PENDING CONFIRMATION · KCO-YYYY-XXXX ]`
6. Receipt with order ID, "Track your order" link

### Frontend: Track View Extension

Extend existing `#track` view with tabs:

- **"Track Reservation" tab** (existing) — KC-YYYY-XXXX reservations
- **"Track Order" tab** (new) — KCO-YYYY-XXXX orders

Order tracking shows: order ID, product name, seller, size, price, pickup date, current status, custom colors/charm applied
If status = 'pending': "Cancel Order" button with confirmation modal

### Frontend: Seller Dashboard — "My Orders" Tab

Wired into `SellerDashboard.vue`:

- Order list with status filter tabs: All, Pending, Confirmed, Ready, Completed, Cancelled
- Pending count badge (highlighted)
- Order cards: buyer name, product name, size, quantity, total price, pickup date, status, custom colors
- Action buttons per status:
  - Pending → "Confirm" or "Cancel" (with reason modal)
  - Confirmed → "Mark Ready"
  - Ready → "Mark Completed"
- Order detail modal: full order info, buyer contact, product snapshot, buyer's custom color choices
- Real-time floating alert via `BroadcastChannel('kickcraft_orders_channel')` on new orders
- Order stats summary cards: total pending, today's pickups, total completed

### Frontend: AdminPanel.vue — New "Orders" Tab

- Tab label: "Orders" with pending count badge
- Global view across all sellers
- Filter by: status, seller, date range
- Search by: order ID, buyer name/email
- Order detail modal: full order + seller + product info + buyer customizations
- Override any status transition
- Cancel any order with admin reason
- Summary stats: total pending, today's pickups, revenue total

### Security

- Price snapshot at order creation — buyer cannot manipulate price
- Stock atomically decremented with `WHERE stock >= quantity` guard (prevents overselling)
- Stock restored on cancellation
- Buyer can only cancel own pending orders (email + orderId verification)
- Seller can only manage orders for their own products
- Admin can manage all orders
- Custom colors validated against product's mesh_map — buyer can't send arbitrary mesh names
- Zero physical DELETE FROM — all cancellations are status changes

---

## Global Constraints (All Sub-projects)

1. Zero physical `DELETE FROM` statements — use `deleted_at` + `permanently_deleted` soft-delete pattern
2. 100% PDO prepared statements with bound parameters — zero SQL string interpolation
3. Admin operations require `requireAdmin()` guard
4. Seller operations require `requireSeller()` or `requireApprovedSeller()` guard
5. Maintain KickCraft brutalist aesthetic: high contrast, solid borders, terracotta `#b94d27` accents, clean typography
6. All existing features (shop, studio, reservations, gallery, admin panel) must remain fully functional
7. `src/App.vue` must not grow significantly — extract new views into components (`SellerDashboard.vue`, `TutorialOverlay.vue`, `MeshTagger.vue`, `ProductCustomizer.vue`, consider `MarketplaceView.vue`)
8. Run `npm.cmd test` (all existing tests pass) and `npm.cmd run build` (clean production build) before each commit
9. Follow existing ID generation patterns, BroadcastChannel patterns, and API response formats
10. Store pickup only — no shipping, no online payment
11. All new hash routes registered in `getInitialView()`, `resolveCurrentRoute()`, and `watch(view)`
12. Password hashing with `password_hash(PASSWORD_DEFAULT)` — never store plaintext
13. HuggingFace TripoSR integration must gracefully handle Space downtime — show "AI generation is temporarily unavailable" rather than crashing
14. Tutorial progress must persist across sessions (saved to database)

---

## Execution Order

```text
Sub-project 1: Seller Auth & Dashboard Shell
     │ produces: seller role, registration, login, dashboard shell
     ▼
Sub-project 2: Product System + Tutorial + AI Generation
     │ produces: products table, upload/AI/builder paths, mesh tagger,
     │           color customizer, tutorial walkthrough, marketplace view
     ▼
Sub-project 3: E-Commerce Order Flow
     │ produces: orders table, checkout with custom colors, tracking,
     │           seller order management
     ▼
   COMPLETE
```

Each sub-project gets its own implementation plan via the `writing-plans` skill.
