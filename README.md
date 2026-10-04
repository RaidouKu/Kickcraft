# KickCraft

KickCraft is an interactive 3D shoe customization studio and seller-driven marketplace. Customers can inspect original shoe designs, customize available colors and charms, and place guest orders for store pickup. Approved sellers can create and list products, then manage customer orders.

## Features

- Interactive 3D shoe previews with local GLB models and 3D charms.
- Customization for independently tagged shoe parts; single-mesh and AI-generated shoes retain their original textures and support charm-only customization.
- Shoe size selection and guest pickup reservations and marketplace orders.
- Seller registration, admin approval, product creation, and order fulfillment tools.
- Product creation from GLB uploads, templates, or AI 2D-to-3D generation.
- Admin tools for seller and product review, reservations, and marketplace orders.
- Community design submissions with admin moderation.

KickCraft is for store pickup. It does not process online payments, delivery, or shipping.

## Technology

- Vue 3, Vite, and Tailwind CSS for the frontend.
- Google `<model-viewer>` and local GLB assets for 3D previews.
- PHP API served by Apache, with MySQL persistence.

```text
Vue frontend -> PHP API -> MySQL
```

Node.js and npm are used for frontend development and tests; they are not the application backend.

## Requirements

- Node.js and npm.
- XAMPP with Apache, PHP, and MySQL for local API and database use.

## Local setup

### 1. Install frontend dependencies

From the project root:

```powershell
npm install
```

### 2. Configure MySQL

Start Apache and MySQL in the XAMPP Control Panel. In phpMyAdmin, import [`api/database/setup.sql`](api/database/setup.sql) to create and seed the `kickcraft_db` database.

Create a local API configuration file from the example:

```powershell
Copy-Item api/.env.example api/.env
```

Edit `api/.env` with your local database connection values. To create the owner account, set `KICKCRAFT_OWNER_NAME`, `KICKCRAFT_OWNER_EMAIL`, and `KICKCRAFT_OWNER_PASSWORD` there, then run the one-time bootstrap:

```powershell
& "C:\xampp\php\php.exe" api/database/create-owner.php
```

Keep `api/.env` local. It is ignored by Git and must not be committed.

### 3. Make the PHP API available to Apache

The Vite development server proxies `/api` requests to `http://localhost/kickcraft/api`. Make the project's `api` and `public` folders available under XAMPP's web root. In PowerShell, from the project root:

```powershell
$projectRoot = (Get-Location).Path
$webRoot = "C:\xampp\htdocs\kickcraft"
New-Item -ItemType Directory -Force -Path $webRoot
New-Item -ItemType Junction -Path "$webRoot\api" -Target "$projectRoot\api"
New-Item -ItemType Junction -Path "$webRoot\public" -Target "$projectRoot\public"
```

If those junctions already exist, verify their targets rather than creating duplicates. Confirm the API is reachable at `http://localhost/kickcraft/api/shoes/list.php`.

### 4. Start the frontend

```powershell
npm run dev
```

Open the local URL printed by Vite (typically `http://localhost:5173`). Keep XAMPP Apache and MySQL running while using API-backed features.

## Tests and production build

```powershell
npm test
npm run build
```

The optional MySQL workflow test is run separately and requires the local PHP/MySQL setup:

```powershell
npm run test:mysql
```

## Main user workflows

- **Customer:** browse the catalog or marketplace, customize a compatible shoe, choose a size and charm, then submit a guest pickup reservation or order.
- **Seller:** register and await admin approval, create and submit products for review, then manage pickup orders in the seller dashboard.
- **Owner/admin:** manage reservations, review sellers and products, and oversee marketplace orders and community submissions.

Customers can order as guests. Seller and owner/admin management features require authentication.
