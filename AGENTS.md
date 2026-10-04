# KickCraft Project Guide

This file is the source of truth for developers and AI coding assistants working on this repository. Read it before changing the project.

## System identity

**KickCraft** is an interactive 3D shoe customization studio and seller-driven 3D shoe marketplace. Customers design shoes by customizing parts, previewing charms, and reserving for store pickup; registered and approved sellers can list their own designs (via GLB upload, AI 2D→3D generation, or template builder) and manage customer pickup reservations.

KickCraft operates as a focused seller-driven 3D shoe marketplace and customization studio. Do not turn KickCraft into a delivery application or physical point-of-sale system. Do not use Nike, New Balance, or other third-party branding or copyrighted shoe designs.

## Users

- **Customer (Guest/Buyer):** browses catalog and marketplace, customizes shoe parts and charms, and submits pickup reservations/orders without requiring an account.
- **Seller:** registers, gets admin-approved, uploads or AI-generates shoe GLBs, customizes colors and charms in-system, lists products in marketplace, and manages customer pickup orders.
- **Owner/admin:** reviews and approves sellers, moderates product listings, manages all orders and reservations, and oversees store catalog.

Customers do not need an account for the main reservation or marketplace ordering workflow (guest checkout with name and email). Sellers and owner/admins require authentication before managing records or dashboards.

## Main workflows

### Customer workflow
1. A customer opens a KickCraft shoe or marketplace product.
2. The customer rotates and inspects the local 3D model.
3. The customer recolors customizable shoe parts.
4. The customer chooses an accessory charm.
5. The customer selects a shoe size and enters guest pickup information.
6. The system validates and saves the reservation / order.
7. The seller or owner/admin reviews the order and updates its status.

### Seller workflow
1. A seller registers an account with store details.
2. The owner/admin reviews and approves the seller application.
3. The seller logs in to the Seller Studio Dashboard (guided by an interactive tutorial).
4. The seller creates a product via GLB upload, AI 2D→3D generation, or template builder.
5. The seller tags shoe meshes using the visual mesh tagger with auto-detection.
6. The seller configures default colors and charm attachments in the customizer.
7. The seller submits the product for admin review.
8. Upon admin approval, the product appears in the public marketplace.
9. The seller receives and manages customer pickup orders through fulfillment.

## Innovation

Static shoe listings make it difficult for customers to understand and communicate a customized design. KickCraft improves this by letting customers directly recolor separate shoe parts and preview interchangeable 3D accessories on the shoe before submitting an exact pickup reservation. In addition, the seller marketplace empowers independent designers to easily onboard via an interactive tutorial, upload or AI-generate 3D shoes from 2D images, tag customizable meshes visually, and offer interactive 3D products for store pickup.

The visible innovation is the working 3D customization and interactive 3D seller workflow, not login or CRUD pages alone.

## Technology and architecture

- Vue 3 is the primary frontend framework.
- Tailwind CSS provides the responsive interface.
- Google `<model-viewer>` renders the local GLB shoe models.
- Native `<extra-model>` elements render the separate charm GLBs.
- The local backend is a small PHP API served by Apache through XAMPP.
- The persistent database is MySQL running locally through XAMPP.
- The Vue frontend communicates with MySQL through the PHP API; it must not access the database directly.

System Architecture:

```text
Vue 3 Frontend
├── Shop / Studio (KickCraft catalog + 3D customization)
├── Marketplace (seller product catalog with 3D preview)
├── Seller Dashboard (SellerDashboard.vue: Tutorial, Products, Mesh Tagger, Customizer, Orders, Settings)
├── Admin Panel (extended: Sellers + Products + Orders + Designs)
└── Track View (reservation & order tracking)
        │
   PHP API Layer
├── api/auth/ (register.php, login.php, session.php, logout.php)
├── api/sellers/ (list.php, review.php, profile.php, update-profile.php)
├── api/products/ (create.php, update.php, submit.php, upload-glb.php, list.php, detail.php, review.php)
├── api/ai/ (generate.php, status.php — HuggingFace TripoSR proxy)
├── api/orders/ (create.php, track.php, list.php, update-status.php, cancel.php)
└── api/shoes/, api/reservations/, api/designs/
        │
   MySQL Database
├── users (roles: customer, owner, seller)
├── seller_profiles
├── products & product_parts
├── ai_generations
├── tutorial_progress
├── orders
└── shoes, reservations, community_designs
```

Keep the architecture simple:

```text
Vue customer/seller/admin interface -> PHP API -> MySQL database
```

Node.js and npm are used for Vue development, build, and automated tests, but Node.js is not the application backend.

Do not add a new framework or service when Vue, browser APIs, PHP, MySQL, or an existing dependency already solves the problem.

## Current implementation

The repository currently contains:

- A local customizable shoe model at `public/models/shoe-soleview-final.glb` and modular templates.
- Eight independently recolorable meshes: Upper, ToeCap, Tongue, Laces, HeelPanel, SideAccents, Midsole, and Outsole.
- Star, lightning, and K-tag charm models under `public/models/charms/`.
- Charm generation code in `tools/generate-charms.py`.
- Size selection and pickup-reservation workflow with PHP API and MySQL persistence.
- Community Designs Gallery with guest submissions, admin moderation, and public display.
- Authenticated owner/admin panel for reservations, community designs, and seller management.
- **Sub-project 1 (Completed):** Seller Auth & Dashboard Shell:
  - Seller registration API (`api/auth/register.php`) and frontend view (`#seller-register`).
  - Seller authentication, login, session, and role detection (`api/auth/login.php`, `api/auth/session.php`).
  - Admin seller review & moderation API (`api/sellers/list.php`, `api/sellers/review.php`) and AdminPanel Sellers tab.
  - Seller profile management (`api/sellers/profile.php`, `api/sellers/update-profile.php`).
  - Seller Studio Dashboard (`SellerDashboard.vue`) with status-aware views (Pending, Approved, Rejected, Suspended) and tabs.
- **Sub-project 2 (Completed):** Product System + Tutorial + AI Generation:
  - 3 product creation paths: GLB upload, AI 2D→3D generation (local TRELLIS / HuggingFace proxy), and KickCraft template builder.
  - Visual Mesh Tagger with auto-detection for mapping 3D meshes to customizable shoe parts.
  - AI & Single-Mesh Model Handling: AI-generated shoes reconstruct as a single continuous mesh with one baked texture map. To preserve genuine photographed textures and prevent whole-shoe darkening, AI shoes operate in **Charm-Only Mode** (original 3D texture displayed authentically, parts recoloring disabled, interchangeable 3D charms, size selection, and store pickup orderable). Multi-part recoloring is preserved for modular templates and multi-mesh GLB uploads.
  - In-system color & charm customizer for seller products with charm-only support.
  - In-app interactive tutorial walkthrough with step-by-step guided overlays for seller onboarding (`TutorialOverlay.vue`).
  - Public Marketplace catalog (`#marketplace`, `MarketplaceView.vue`) with 3D preview, filters, and charm-only order support.
  - Admin product moderation tab with status transitions and review notes.
- **Sub-project 3 (Completed):** E-Commerce Order Flow:
  - Marketplace guest pickup checkout with custom colors, charm choices, and atomic stock decrement.
  - Seller order management (`My Orders` tab) with live status transitions (`pending` → `confirmed` → `ready` → `completed` / `cancelled`) and stock restoration upon cancellation.
  - Admin global marketplace orders oversight tab (`marketplace-orders`) and guest order tracking.

Keep reservation and order statuses simple: `pending`, `confirmed` / `approved`, `ready`, `completed`, and `cancelled`.

## Scope limits

Included:

- One original KickCraft shoe initially (plus modular templates)
- Eight-part color customization
- 3D charm selection
- Size selection
- Pickup reservations & validation/persistence
- Owner/admin reservation management
- Community Designs Gallery (guest-based colorway submissions, admin curation, public gallery)
- Seller registration & admin review system
- Seller product creation (GLB upload, AI 2D→3D generation, template builder)
- Visual mesh tagger + auto-detection for customizable shoe parts
- In-system color & charm customizer for seller products
- In-app interactive tutorial walkthrough for seller onboarding
- Public marketplace catalog with 3D preview & guest pickup checkout
- Seller order management & admin oversight

Excluded unless the instructor explicitly approves a scope change:

- Online payment (store pickup, pay at counter only)
- Delivery and shipping (in-store pickup only)
- Full accounting or physical POS functions
- Branded third-party shoe models (original/custom designs only)
- Full inventory, supplier, or manufacturing management
- Customer social accounts, reviews, chat, or recommendation engines

## 3D model rules

- Preserve the existing shoe mesh and material names because recoloring depends on them.
- Preserve `CharmAnchor`; the charm GLBs use it for placement.
- Keep model files local so the 3D studio can work without internet.
- Optimize new models for browser use and test them on ordinary hardware.
- Treat a new shoe as compatible only when its customizable parts are independently addressable.
- Do not replace the verified shoe or charm files with downloaded branded models.

## Validation and security

- Validate all reservation, order, seller, and product input in both the Vue interface and the API.
- Never trust prices, statuses, or admin permissions sent by the browser.
- Do not store admin passwords or secrets in frontend source code.
- Restrict reservation status updates and administrative reads to authorized roles (admin / assigned seller).
- Display clear success, error, loading, and empty states.
- Do not claim that a reservation or order was saved unless the database operation succeeded.

## Development commands

```powershell
npm install
npm run dev
npm test
npm run build
```

Before committing a change, run `npm test` and `npm run build`. Preserve unrelated user changes and do not commit `node_modules`, `dist`, local databases, environment files, or package-manager caches.

Run Apache and MySQL through XAMPP when testing the API locally. Keep database credentials in a local environment or configuration file that is excluded from Git.

## Guidance for AI assistants

1. Inspect this file, `README.md`, `package.json`, the relevant source files, and `git status` before editing.
2. Confirm whether a requested feature is inside the focused scope above.
3. Reuse the existing Vue, Tailwind, customization, and model-viewer patterns.
4. Prefer the smallest complete solution and avoid speculative abstractions.
5. Add or update a focused automated check for non-trivial behavior.
6. Verify the actual customer-to-admin and seller-to-admin workflows, not only isolated components.
7. Clearly distinguish existing behavior from planned behavior in explanations and documentation.
8. Do not push, deploy, delete, or rewrite Git history without explicit authorization.
