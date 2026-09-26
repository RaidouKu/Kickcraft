# KickCraft

Interactive 3D shoe customization and pickup-reservation system for KickCraft's original shoe design, with Nike demo entries retained for educational testing, backed by a persistent PHP REST API and MySQL database.

## Architecture

```text
Vue 3 Frontend (Vite) ──> PHP REST API (Apache / XAMPP) ──> MySQL Database (kickcraft_db)
```

- **Frontend:** Vue 3 `<script setup>`, Tailwind CSS, Google `<model-viewer>` for local 3D GLB shoe models, custom charm anchors.
- **Backend API:** Flat PHP endpoints under `api/` served via XAMPP Apache, PDO prepared statements on 100% of queries (SQL injection free), native session authentication (`PHPSESSID`), soft & hard delete flags (zero physical row deletion).
- **Database:** MySQL (`kickcraft_db`) with tables for `users`, `shoes`, and `reservations`.

Owner shoe uploads use the admin editor's GLB and thumbnail pickers. Files are validated by `api/shoes/upload.php`, stored under ignored `public/models/uploads/` or `public/images/uploads/`, then saved as local paths in MySQL.

---

## Local Setup with XAMPP

### 1. Start XAMPP Apache & MySQL
1. Open **XAMPP Control Panel**.
2. Start both **Apache** and **MySQL**.

### 2. Initialize the Database
Import `api/database/setup.sql` into MySQL:

**Via phpMyAdmin:**
1. Navigate to `http://localhost/phpmyadmin`.
2. Click **Import** -> Choose `api/database/setup.sql` -> Click **Import**.

**Or via command line (PowerShell):**
```powershell
& "C:\xampp\mysql\bin\mysql.exe" -u root < "api/database/setup.sql"
```

This creates `kickcraft_db` and seeds the initial silhouettes (KickCraft One, Nike Air Max, and Nike Dunk) plus sample reservations `KC-2026-1041` through `KC-2026-1044`. Nike entries are demo data only.

Create the owner account from local environment values (do not put a password in Git):

```powershell
Copy-Item api/.env.example api/.env
# Edit api/.env and set KICKCRAFT_OWNER_NAME, KICKCRAFT_OWNER_EMAIL, and KICKCRAFT_OWNER_PASSWORD.
& "C:\xampp\php\php.exe" api/database/create-owner.php
```

### 3. Deploy API to XAMPP Apache
Expose only the API and public assets through XAMPP:

```powershell
$projectRoot = (Get-Location).Path
$webRoot = "C:\xampp\htdocs\kickcraft"
New-Item -ItemType Directory -Force -Path $webRoot
New-Item -ItemType Junction -Path "$webRoot\api" -Target "$projectRoot\api"
New-Item -ItemType Junction -Path "$webRoot\public" -Target "$projectRoot\public"
```

Verify the API is reachable at:
`http://localhost/kickcraft/api/shoes/list.php`

### 4. Run the Vue Development Server
```powershell
npm install
npm run dev
```

Open `http://localhost:5173`. The Vite development server automatically proxies `/api/*` requests to `http://localhost/kickcraft/api/*`.

---

## Testing & Quality Assurance

```powershell
npm test        # Runs the unit and integration checks
npm run build   # Verifies production client bundle compilation
```

---

## Accounts
- Owner credentials come from `api/.env` and the one-time `create-owner.php` bootstrap.
- Customers reserve as guests and track reservations with their receipt reference and email address.
- The unlinked owner portal is available at `#admin`.
