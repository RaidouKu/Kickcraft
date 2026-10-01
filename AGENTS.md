# KickCraft Project Guide

This file is the source of truth for developers and AI coding assistants working on this repository. Read it before changing the project.

## System identity

**KickCraft** is an interactive 3D shoe customization and pickup-reservation system for an original shoe brand. Customers design a shoe by changing individual part colors, attaching a 3D charm, choosing a size, and reserving the finished design for store pickup.

Do not turn KickCraft into a general marketplace, multi-store platform, delivery application, or physical point-of-sale system. Do not use Nike, New Balance, or other third-party branding or copyrighted shoe designs.

## Users

- **Customer:** customizes an original KickCraft shoe and submits a pickup reservation.
- **Owner/admin:** manages available shoe designs and reviews or updates customer reservations.

Customers do not need an account for the main reservation workflow. The owner/admin side will require authentication before it can manage records.

## Main workflow

1. A customer opens a KickCraft shoe.
2. The customer rotates and inspects the local 3D model.
3. The customer recolors any of the eight independent shoe parts.
4. The customer chooses no accessory, a star, a lightning charm, or a KickCraft K tag.
5. The customer selects a shoe size.
6. The customer enters a name, email address, and pickup date.
7. The system validates and saves the reservation.
8. The owner/admin reviews the reservation and updates its status.

This single end-to-end workflow is more important than adding unrelated features.

## Innovation

Static shoe listings make it difficult for customers to understand and communicate a customized design. KickCraft improves this by letting customers directly recolor separate shoe parts and preview interchangeable 3D accessories on the shoe before submitting an exact pickup reservation.

The visible innovation is the working 3D customization, not login, CRUD pages, or a dashboard by themselves.

## Technology and architecture

- Vue 3 is the primary frontend framework.
- Tailwind CSS provides the responsive interface.
- Google `<model-viewer>` renders the local GLB shoe.
- Native `<extra-model>` elements render the separate charm GLBs.
- The planned local backend is a small PHP API served by Apache through XAMPP.
- The planned persistent database is MySQL running locally through XAMPP.
- The Vue frontend must communicate with MySQL through the PHP API; it must not access the database directly.

Keep the architecture small:

```text
Vue customer/admin interface -> PHP API -> MySQL database
```

Node.js and npm are still used for Vue development and production builds, but Node.js is not the application backend.

Do not add a new framework or service when Vue, browser APIs, PHP, MySQL, or an existing dependency already solves the problem.

## Current implementation

The repository currently contains a UI prototype with:

- A local customizable shoe model at `public/models/shoe-soleview-final.glb`.
- Eight independently recolorable meshes: Upper, ToeCap, Tongue, Laces, HeelPanel, SideAccents, Midsole, and Outsole.
- Star, lightning, and K-tag charm models under `public/models/charms/`.
- Charm generation code in `tools/generate-charms.py`.
- Size selection and a pickup-reservation preview form.
- Automated checks for material mapping, charm selection, and generated charm assets.

The reservation form is currently frontend-only. A persistent PHP API, MySQL database, admin authentication, and reservation-management screen are not implemented yet.

## Next implementation priority

Complete reservation persistence before expanding the product catalog:

1. Add a small PHP API and MySQL reservations table.
2. Validate and save the existing customer reservation form.
3. Add an authenticated owner/admin view for listing reservations and changing their statuses.
4. Add another shoe only after the complete reservation workflow works reliably.

Keep reservation statuses simple: `pending`, `approved`, `ready`, `completed`, and `cancelled`.

Recommended reservation record:

```text
id
customerName
email
pickupDate
shoeId
size
partColors
charmId
status
createdAt
updatedAt
```

Store `partColors` in a MySQL JSON column unless real query requirements prove that separate color columns are necessary.

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

## 3D model rules

- Preserve the existing shoe mesh and material names because recoloring depends on them.
- Preserve `CharmAnchor`; the charm GLBs use it for placement.
- Keep model files local so the 3D studio can work without internet.
- Optimize new models for browser use and test them on ordinary hardware.
- Treat a new shoe as compatible only when its customizable parts are independently addressable.
- Do not replace the verified shoe or charm files with downloaded branded models.

## Validation and security

- Validate all reservation input in both the Vue interface and the API.
- Never trust prices, statuses, or admin permissions sent by the browser.
- Do not store admin passwords or secrets in frontend source code.
- Restrict reservation status updates and administrative reads to the owner/admin.
- Display clear success, error, loading, and empty states.
- Do not claim that a reservation was saved unless the database operation succeeded.

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
6. Verify the actual customer-to-admin workflow, not only isolated components.
7. Clearly distinguish existing behavior from planned behavior in explanations and documentation.
8. Do not push, deploy, delete, or rewrite Git history without explicit authorization.
