# KickCraft Seller E-Commerce System — Design Specification

> **Scope change:** Instructor-approved expansion of KickCraft from a single-brand customization studio to an e-commerce platform where approved sellers can design and list shoes for buyer pickup reservations. AGENTS.md must be updated to reflect this scope change as part of Sub-project 1.

---

## System Overview

KickCraft expands to support three user types:

| Role | Auth | Capabilities |
|---|---|---|
| **Guest/Buyer** | None (name + email at checkout) | Browse catalog, customize KickCraft shoes, order seller products, reserve for pickup |
| **Seller** | Email/password login, admin-approved | List products (upload GLB or modular builder), set prices, manage own orders |
| **Owner/Admin** | Email/password login (existing) | Approve sellers, approve product listings, manage all orders, existing admin functions |

### Decisions Made

| Decision | Answer |
|---|---|
| Seller customization | Modular 3D mesh swapping + recoloring (user provides part GLBs) |
| Payment | Store pickup, pay at counter (no online payment) |
| Seller onboarding | Register with name/email/password → admin approves before seller can list |
| Buyer accounts | No — guests (name + email at checkout, same as reservations) |
| Seller paths | Both — upload own GLB OR build from KickCraft modular templates |
| Pricing | Seller sets their own price |
| Shipping | Store pickup only (no delivery) |

### Architecture

```text
Vue 3 Frontend
├── Shop / Studio (existing — KickCraft catalog + 3D customization)
├── Marketplace (new — seller product catalog)
├── Seller Dashboard (new — SellerDashboard.vue component)
├── Admin Panel (extended — new Sellers + Products + Orders tabs)
└── Shared: Track view extended with order tracking tab
        │
   PHP API Layer
├── api/auth/     (modified: register.php new, login.php extended)
├── api/sellers/  (new: list, review, profile, update-profile)
├── api/parts/    (new: list, create, update)
├── api/products/ (new: create, update, submit, upload-glb, list, detail, review)
├── api/orders/   (new: create, track, list, update-status, cancel)
└── Existing: api/shoes/, api/reservations/, api/designs/ (untouched)
        │
   MySQL Database
├── users (modified: 'seller' role added)
├── seller_profiles (new)
├── part_library (new)
├── products (new)
├── product_parts (new)
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

### BroadcastChannel Events

| Channel | Event Types |
|---|---|
| `kickcraft_reservations_channel` (existing) | `NEW_RESERVATION`, `RESERVATION_CANCELLED` |
| `kickcraft_designs_channel` (existing) | `NEW_DESIGN` |
| `kickcraft_sellers_channel` (new) | `NEW_SELLER_APPLICATION` |
| `kickcraft_products_channel` (new) | `PRODUCT_SUBMITTED`, `PRODUCT_APPROVED`, `PRODUCT_REJECTED` |
| `kickcraft_orders_channel` (new) | `NEW_ORDER`, `ORDER_CONFIRMED`, `ORDER_CANCELLED`, `ORDER_READY`, `ORDER_COMPLETED` |

---

## Sub-project 1: Seller Auth & Dashboard

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

## Sub-project 2: Product Listing System

### Goal

Approved sellers can create product listings via two paths: upload a custom GLB shoe file, or build from KickCraft's modular part library. Admin approves listings before they appear in the public marketplace.

### Database Changes

**New `part_library` table:**
```sql
CREATE TABLE part_library (
  id INT AUTO_INCREMENT PRIMARY KEY,
  slot VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  glb_path VARCHAR(500) NOT NULL,
  thumbnail_path VARCHAR(500) DEFAULT NULL,
  anchor_position VARCHAR(100) DEFAULT '0 0 0',
  anchor_rotation VARCHAR(100) DEFAULT '0 0 0',
  anchor_scale VARCHAR(100) DEFAULT '1 1 1',
  compatible_bases JSON NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  permanently_deleted TINYINT(1) NOT NULL DEFAULT 0,
  INDEX idx_part_slot (slot),
  INDEX idx_part_deleted (deleted_at)
);
```

**New `products` table:**
```sql
CREATE TABLE products (
  id VARCHAR(64) PRIMARY KEY,
  seller_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT DEFAULT NULL,
  price DECIMAL(10,2) NOT NULL,
  stock INT NOT NULL DEFAULT 0,
  creation_method ENUM('upload', 'template') NOT NULL,
  glb_path VARCHAR(500) DEFAULT NULL,
  thumbnail_path VARCHAR(500) DEFAULT NULL,
  base_shoe_id VARCHAR(100) DEFAULT NULL,
  part_colors JSON DEFAULT NULL,
  charm_id VARCHAR(50) DEFAULT 'none',
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

**New `product_parts` table:**
```sql
CREATE TABLE product_parts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id VARCHAR(64) NOT NULL,
  slot VARCHAR(50) NOT NULL,
  part_id INT NOT NULL,
  color VARCHAR(7) DEFAULT '#ffffff',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_pp_product (product_id),
  UNIQUE KEY uq_product_slot (product_id, slot)
);
```

### API Endpoints

#### `GET api/parts/list.php` (NEW — public)

**Query params:** `?slot=midsole&base=kickcraft-one` (optional filters)
**Returns:** Parts from `part_library` filtered by slot and/or compatible base shoe
**Soft-delete filter:** `WHERE deleted_at IS NULL AND permanently_deleted = 0`

#### `POST api/parts/create.php` (NEW — admin only)

**Auth:** `requireAdmin()`
**Request:**
```json
{
  "slot": "midsole",
  "name": "Chunky Platform Midsole",
  "glbPath": "/models/parts/midsole-chunky.glb",
  "thumbnailPath": "/images/parts/midsole-chunky.png",
  "anchorPosition": "0 -0.02 0",
  "anchorRotation": "0 0 0",
  "anchorScale": "1 1 1",
  "compatibleBases": ["kickcraft-one"]
}
```

#### `POST api/products/create.php` (NEW — approved seller only)

**Auth:** `requireApprovedSeller()`
**Request (upload method):**
```json
{
  "name": "Street Runner X",
  "description": "Urban-inspired running shoe",
  "price": 5490.00,
  "creationMethod": "upload",
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
  "partColors": { "Upper": "#FF6B35", "Midsole": "#1A1A2E", ... },
  "charmId": "star",
  "parts": [
    { "slot": "midsole", "partId": 3, "color": "#1A1A2E" },
    { "slot": "toecap", "partId": 7, "color": "#FF6B35" }
  ],
  "sizesAvailable": [7, 8, 9, 10, 11],
  "stock": 5
}
```

**Logic:**
1. Generate ID: `KCP-YYYY-XXXX`
2. Insert into `products` with `status = 'draft'`, `seller_id = session user`
3. If template method, insert part selections into `product_parts`
4. Return product ID

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
- If upload method: glb_path must exist
- If template method: base_shoe_id must reference valid shoe
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
**Returns:** Full product detail including seller info, parts (if template), part_colors, sizes, stock

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

### Frontend: Seller Dashboard — "My Products" Tab

Wired into `SellerDashboard.vue`:

**Product list view:**
- Grid/list of seller's products with status badges
- Filter tabs: All, Draft, Pending, Approved, Rejected, Suspended
- Each card: thumbnail, name, price, stock, status, creation date
- Actions: Edit (draft/rejected only), Submit for Review, Delete (soft)

**Product creation wizard:**
- Step 0: Choose creation method — "Upload My Own Design" or "Build from Template"

**Upload path:**
- Step 1: Upload GLB + thumbnail
- Step 2: 3D preview of uploaded model
- Step 3: Product details (name, description, price, stock, sizes)
- Step 4: Review and save as draft

**Template builder path:**
- Step 1: Pick base shoe from KickCraft catalog (shows available shoes)
- Step 2: Part customization — for each slot, show available parts from `part_library`
  - Visual grid of part variants with thumbnails
  - Color picker per part
  - 3D preview updates live using `<model-viewer>` base + `<extra-model>` parts
- Step 3: Charm selection (existing charm system)
- Step 4: Recolor remaining zones (existing color picker)
- Step 5: Product details (name, description, price, stock, sizes)
- Step 6: Review and save as draft

### Frontend: AdminPanel.vue — New "Products" Tab

- Tab label: "Products" with pending count badge
- Filter tabs: All, Pending, Approved, Rejected, Suspended
- Product cards: thumbnail, name, seller store name, price, creation method, status
- Product detail modal:
  - 3D viewer (if GLB available)
  - Full product info, seller info
  - Part breakdown (if template-based)
  - File info (GLB size, upload date)
- Action buttons: Approve, Reject (with notes), Suspend
- Rejection modal with presets: "3D model quality insufficient", "Inappropriate content", "Pricing policy violation"

### Frontend: Marketplace View (`#marketplace`)

New view in `src/App.vue`:

- Header: "KickCraft Marketplace" with subtitle
- Responsive grid of approved seller products
- Product cards:
  - Thumbnail or 3D mini-preview
  - Product name
  - Seller store name (linked)
  - Price (formatted with peso sign)
  - "View Details" button
- Filters sidebar/top bar:
  - Sort: Newest, Price Low-High, Price High-Low
  - Filter by creation method: All, Custom Upload, Template Build
  - Filter by base shoe (for template products)
  - Price range slider
- Empty state: "No products available yet" with CTA for sellers
- Loading and error states (existing patterns)

**Product detail page (modal or inline):**
- Full 3D `<model-viewer>` (uploaded GLB) or composed view (template + parts)
- Product name, description, price
- Seller store name
- Available sizes with selection
- Stock indicator
- "Reserve for Pickup" button → checkout flow (wired in Sub-project 3)

### Header Navigation Update

- Add "Marketplace" link between "Gallery" and seller/login links
- Active state styling when `view === 'marketplace'`

### Security

- Sellers can ONLY manage their own products: `WHERE seller_id = $_SESSION['user_id']`
- GLB uploads: 20MB max, glTF magic byte validation, cryptographic filenames
- Thumbnail uploads: 5MB max, image format validation
- Seller uploads stored in separate directory: `public/models/seller-uploads/`
- Products require admin approval before public visibility — no auto-publish
- Price validation: must be positive, max 2 decimal places, reasonable range (₱100 - ₱999,999)
- Admin can suspend any product at any time

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
  "pickupDate": "2026-10-15"
}
```

**Validation:**
- `productId`: required, must exist, must be `status = 'approved'`
- `size`: required, must be in product's `sizes_available`
- `quantity`: required, positive integer, default 1
- `customerName`: required, 2-255 chars
- `email`: required, valid format
- `pickupDate`: required, must be future date (at least tomorrow)
- Stock check: `product.stock >= quantity`

**Logic:**
1. Generate ID: `KCO-YYYY-XXXX`
2. Snapshot: `unit_price = product.price`, `total_price = unit_price * quantity`, `product_name`, `product_thumbnail`, `seller_store_name`
3. Atomically decrement stock: `UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?`
   - If affected rows = 0, return 409 "Out of stock"
4. Insert into `orders`
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
- Restores product stock: `UPDATE products SET stock = stock + quantity WHERE id = ?`

**For seller:** `{ "orderId": "...", "reason": "..." }` — can cancel pending/confirmed
- Restores stock

**For admin:** Can cancel any non-completed order
- Restores stock

### Frontend: Product Detail → Checkout Flow

On the marketplace product detail view, after selecting size:

1. "Reserve for Pickup" button opens inline checkout form
2. Form fields: Name, Email (auto-filled from localStorage), Pickup Date (calendar)
3. Order summary: product name, size, price, seller, pickup date
4. "Place Order" button → POST api/orders/create.php
5. Success: brutalist verification stamp `[ ✓ ORDER PLACED · PENDING CONFIRMATION · KCO-YYYY-XXXX ]`
6. Receipt with order ID, "Track your order" link

### Frontend: Track View Extension

Extend existing `#track` view with tabs:

- **"Track Reservation" tab** (existing) — KC-YYYY-XXXX reservations
- **"Track Order" tab** (new) — KCO-YYYY-XXXX orders

Order tracking shows: order ID, product name, seller, size, price, pickup date, current status, status history
If status = 'pending': "Cancel Order" button with confirmation modal

### Frontend: Seller Dashboard — "My Orders" Tab

Wired into `SellerDashboard.vue`:

- Order list with status filter tabs: All, Pending, Confirmed, Ready, Completed, Cancelled
- Pending count badge (highlighted)
- Order cards: buyer name, product name, size, quantity, total price, pickup date, status
- Action buttons per status:
  - Pending → "Confirm" or "Cancel" (with reason modal)
  - Confirmed → "Mark Ready"
  - Ready → "Mark Completed"
- Order detail modal: full order info, buyer contact, product snapshot
- Real-time floating alert via `BroadcastChannel('kickcraft_orders_channel')` on new orders
- Order stats summary cards: total pending, today's pickups, total completed

### Frontend: AdminPanel.vue — New "Orders" Tab

- Tab label: "Orders" with pending count badge
- Global view across all sellers
- Filter by: status, seller, date range
- Search by: order ID, buyer name/email
- Order detail modal: full order + seller + product info
- Override any status transition
- Cancel any order with admin reason
- Summary stats: total pending, today's pickups, revenue total

### Header Navigation

- Marketplace link active state (already added in Sub-project 2)
- Track view tab switching works seamlessly

### Security

- Price snapshot at order creation — buyer cannot manipulate price
- Stock atomically decremented with `WHERE stock >= quantity` guard (prevents overselling)
- Stock restored on cancellation
- Buyer can only cancel own pending orders (email + orderId verification)
- Seller can only manage orders for their own products
- Admin can manage all orders
- Zero physical DELETE FROM — all cancellations are status changes

---

## Global Constraints (All Sub-projects)

1. Zero physical `DELETE FROM` statements — use `deleted_at` + `permanently_deleted` soft-delete pattern
2. 100% PDO prepared statements with bound parameters — zero SQL string interpolation
3. Admin operations require `requireAdmin()` guard
4. Seller operations require `requireSeller()` or `requireApprovedSeller()` guard
5. Maintain KickCraft brutalist aesthetic: high contrast, solid borders, terracotta `#b94d27` accents, clean typography
6. All existing features (shop, studio, reservations, gallery, admin panel) must remain fully functional
7. `src/App.vue` must not grow significantly — extract new views into components (`SellerDashboard.vue`, consider `MarketplaceView.vue`)
8. Run `npm.cmd test` (all existing tests pass) and `npm.cmd run build` (clean production build) before each commit
9. Follow existing ID generation patterns, BroadcastChannel patterns, and API response formats
10. Store pickup only — no shipping, no online payment
11. All new hash routes registered in `getInitialView()`, `resolveCurrentRoute()`, and `watch(view)`
12. Password hashing with `password_hash(PASSWORD_DEFAULT)` — never store plaintext

---

## Execution Order

```text
Sub-project 1: Seller Auth & Dashboard     ← START HERE
     │ produces: seller role, registration, login, dashboard shell
     ▼
Sub-project 2: Product Listing System
     │ produces: products table, upload/builder, marketplace view
     ▼
Sub-project 3: E-Commerce Order Flow
     │ produces: orders table, checkout, tracking, seller order management
     ▼
   COMPLETE
```

Each sub-project gets its own implementation plan via the `writing-plans` skill.
