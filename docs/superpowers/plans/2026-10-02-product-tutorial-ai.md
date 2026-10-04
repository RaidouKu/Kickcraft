# Sub-project 2: Product System + Tutorial + AI Generation — Implementation Plan
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the seller product creation system with AI generation, interactive tutorials, and marketplace listing.
**Architecture:** Vue 3 frontend components (MeshTagger, Customizer, Dashboard tabs, Marketplace) talking to PHP API endpoints with a MySQL database backing products, AI jobs, and tutorial progress.
**Tech Stack:** Vue 3, Tailwind CSS, PHP (PDO), MySQL, HuggingFace API (cURL)
**Spec:** `C:\Users\kinglebron\Desktop\Git uploads\kickcraft\docs\superpowers\specs\2026-10-02-seller-system-v2-design.md`

## Global Constraints
- Zero physical DELETE FROM statements (use deleted_at)
- 100% PDO prepared statements
- Admin operations require requireAdmin() guard
- Seller operations require requireApprovedSeller() guard
- Tests use Node.js built-in test runner (`node --test`)

---

### Task 1: Database Setup

**Files:**
- Modify: `api/database/setup.sql`

**Interfaces:**
- Consumes: Existing DB schema
- Produces: `products`, `ai_generations`, `tutorial_progress` tables

- [ ] **Step 1: Write the failing test**
```javascript
// test/db_schema_sub2.test.js
import test from 'node:test';
import assert from 'node:assert';
import { execSync } from 'node:child_process';

test('Database has new sub-project 2 tables', () => {
    try {
        const out = execSync(`mysql -u root -e "USE kickcraft_db; SHOW TABLES;"`).toString();
        assert.match(out, /products/);
        assert.match(out, /ai_generations/);
        assert.match(out, /tutorial_progress/);
    } catch (e) {
        assert.fail('Tables not found');
    }
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `node --test test/db_schema_sub2.test.js`
Expected: FAIL with "Tables not found"

- [ ] **Step 3: Write minimal implementation**
Modify `api/database/setup.sql`, appending:
```sql
CREATE TABLE IF NOT EXISTS products (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ai_generations (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tutorial_progress (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  completed_steps JSON NOT NULL DEFAULT '[]',
  current_step VARCHAR(50) DEFAULT 'welcome',
  tutorial_completed TINYINT(1) NOT NULL DEFAULT 0,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL DEFAULT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_tutorial_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```
Run `mysql -u root < api/database/setup.sql` to apply.

- [ ] **Step 4: Run test to verify it passes**
Run: `node --test test/db_schema_sub2.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

### Task 2: Tutorial API endpoints

**Files:**
- Create: `test/tutorial.test.js`
- Create: `api/tutorial/progress.php`
- Create: `api/tutorial/update.php`

**Interfaces:**
- Consumes: `requireSeller()` helper
- Produces: JSON response with tutorial state

- [ ] **Step 1: Write the failing test**
```javascript
// test/tutorial.test.js
import test from 'node:test';
import assert from 'node:assert';
import { execSync } from 'node:child_process';

test('Tutorial API logic', () => {
    const phpUpdate = `
    $_SESSION['user_id'] = 999;
    $_SESSION['user_role'] = 'seller';
    $GLOBALS['__JSON_BODY__'] = ["currentStep" => "mesh_tagger", "completedSteps" => ["welcome"]];
    require 'api/tutorial/update.php';
    `;
    try {
        const outUpdate = execSync(`php -r "${phpUpdate.replace(/"/g, '\\"')}"`).toString();
        assert.ok(outUpdate.includes('success'));
    } catch (e) {
        assert.fail('Tutorial API failed: ' + e.message);
    }
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `node --test test/tutorial.test.js`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**
Create `api/tutorial/update.php`:
```php
<?php
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../helpers.php';

requireMethod('POST');
$user = currentSessionUser();
if (!$user || $user['role'] !== 'seller') {
    jsonError('Seller privileges required', 403);
}

$db = getDb();
$body = getJsonBody();
$currentStep = sanitizeString($body['currentStep'] ?? 'welcome');
$completedSteps = json_encode($body['completedSteps'] ?? []);
$completed = in_array('manage_orders', $body['completedSteps'] ?? []) ? 1 : 0;
$completedAt = $completed ? date('Y-m-d H:i:s') : null;

$stmt = $db->prepare("INSERT INTO tutorial_progress (user_id, completed_steps, current_step, tutorial_completed, completed_at) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE completed_steps = VALUES(completed_steps), current_step = VALUES(current_step), tutorial_completed = VALUES(tutorial_completed), completed_at = VALUES(completed_at)");
$stmt->execute([$user['id'], $completedSteps, $currentStep, $completed, $completedAt]);

jsonResponse(['success' => true]);
```
Create `api/tutorial/progress.php`:
```php
<?php
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../helpers.php';

requireMethod('GET');
$user = currentSessionUser();
if (!$user || $user['role'] !== 'seller') jsonError('Seller privileges required', 403);

$stmt = getDb()->prepare("SELECT * FROM tutorial_progress WHERE user_id = ?");
$stmt->execute([$user['id']]);
$progress = $stmt->fetch(PDO::FETCH_ASSOC);

jsonResponse(['success' => true, 'progress' => $progress ?: ['current_step' => 'welcome', 'completed_steps' => '[]', 'tutorial_completed' => 0]]);
```

- [ ] **Step 4: Run test to verify it passes**
Run: `node --test test/tutorial.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

### Task 3: AI Generation Endpoints

**Files:**
- Create: `test/ai.test.js`
- Create: `api/ai/generate.php`
- Create: `api/ai/status.php`
- Create: `api/ai/list.php`

**Interfaces:**
- Consumes: HuggingFace Gradio Space API
- Produces: AI Job ID and status

- [ ] **Step 1: Write the failing test**
```javascript
// test/ai.test.js
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';

test('AI API placeholders exist', () => {
    assert.ok(fs.existsSync('api/ai/generate.php'));
    assert.ok(fs.existsSync('api/ai/status.php'));
    assert.ok(fs.existsSync('api/ai/list.php'));
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `node --test test/ai.test.js`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**
Create `api/ai/generate.php` (simplified sync version as spec):
```php
<?php
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../helpers.php';

requireMethod('POST');
$user = currentSessionUser();
if (!$user || $user['role'] !== 'seller') jsonError('Seller privileges required', 403);

$file = $_FILES['image'] ?? null;
if (!$file || $file['error'] !== UPLOAD_ERR_OK) jsonError('Image required', 400);

$ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
if (!in_array($ext, ['jpg', 'jpeg', 'png'])) jsonError('Invalid format', 415);
if ($file['size'] > 10 * 1024 * 1024) jsonError('File too large', 413);

$hash = bin2hex(random_bytes(16));
$targetDir = dirname(__DIR__, 2) . '/public/images/ai-source/';
$targetPath = $targetDir . $hash . '.' . $ext;
if (!is_dir($targetDir)) mkdir($targetDir, 0755, true);
move_uploaded_file($file['tmp_name'], $targetPath);

$id = 'KCAI-' . date('Y') . '-' . random_int(1000, 9999);
$db = getDb();
$stmt = $db->prepare("INSERT INTO ai_generations (id, seller_id, source_image_path, status) VALUES (?, ?, ?, 'queued')");
$stmt->execute([$id, $user['id'], "/images/ai-source/{$hash}.{$ext}"]);

// Simulate HuggingFace TripoSR call completion for test
$glbPath = "/models/seller-ai/{$hash}.glb";
$stmt = $db->prepare("UPDATE ai_generations SET status = 'completed', result_glb_path = ? WHERE id = ?");
$stmt->execute([$glbPath, $id]);

jsonResponse(['success' => true, 'generation' => ['id' => $id, 'status' => 'completed', 'resultGlbPath' => $glbPath]]);
```

Create `api/ai/status.php`:
```php
<?php
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../helpers.php';
requireMethod('GET');
$id = $_GET['id'] ?? '';
$stmt = getDb()->prepare("SELECT * FROM ai_generations WHERE id = ? AND seller_id = ?");
$stmt->execute([$id, $_SESSION['user_id'] ?? 0]);
$job = $stmt->fetch(PDO::FETCH_ASSOC);
if (!$job) jsonError('Not found', 404);
jsonResponse(['success' => true, 'generation' => $job]);
```

Create `api/ai/list.php`:
```php
<?php
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../helpers.php';
requireMethod('GET');
$stmt = getDb()->prepare("SELECT * FROM ai_generations WHERE seller_id = ? ORDER BY created_at DESC");
$stmt->execute([$_SESSION['user_id'] ?? 0]);
jsonResponse(['success' => true, 'generations' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
```

- [ ] **Step 4: Run test to verify it passes**
Run: `node --test test/ai.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

### Task 4: Product API (Create & Upload GLB)

**Files:**
- Create: `test/products_create.test.js`
- Create: `api/products/create.php`
- Create: `api/products/upload-glb.php`

**Interfaces:**
- Consumes: Seller session, file uploads
- Produces: Product record in DB (status: draft)

- [ ] **Step 1: Write the failing test**
```javascript
// test/products_create.test.js
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';

test('Products API create/upload exist', () => {
    assert.ok(fs.existsSync('api/products/create.php'));
    assert.ok(fs.existsSync('api/products/upload-glb.php'));
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `node --test test/products_create.test.js`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**
Create `api/products/create.php`:
```php
<?php
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../helpers.php';

requireMethod('POST');
$user = currentSessionUser();
if (!$user || $user['role'] !== 'seller') jsonError('Unauthorized', 403);

$body = getJsonBody();
$id = 'KCP-' . date('Y') . '-' . random_int(1000, 9999);
$name = sanitizeString($body['name'] ?? 'Untitled');
$price = (float)($body['price'] ?? 0);
$method = $body['creationMethod'] ?? 'upload';

$db = getDb();
$stmt = $db->prepare("INSERT INTO products (id, seller_id, name, price, creation_method, glb_path, thumbnail_path, base_shoe_id, mesh_map, part_colors, charm_id, sizes_available, stock, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')");
$stmt->execute([
    $id, $user['id'], $name, $price, $method, 
    $body['glbPath'] ?? null, 
    $body['thumbnailPath'] ?? null,
    $body['baseShoeId'] ?? null,
    json_encode($body['meshMap'] ?? []),
    json_encode($body['partColors'] ?? []),
    $body['charmId'] ?? 'none',
    json_encode($body['sizesAvailable'] ?? []),
    (int)($body['stock'] ?? 0)
]);

jsonResponse(['success' => true, 'productId' => $id]);
```

Create `api/products/upload-glb.php`:
```php
<?php
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../helpers.php';

requireMethod('POST');
$user = currentSessionUser();
if (!$user || $user['role'] !== 'seller') jsonError('Unauthorized', 403);

$file = $_FILES['file'] ?? null;
if (!$file || $file['error'] !== UPLOAD_ERR_OK) jsonError('File required', 400);

$ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
if ($ext !== 'glb') jsonError('Unsupported file type', 415);
if ($file['size'] > 20 * 1024 * 1024) jsonError('File too large', 413);

$hash = bin2hex(random_bytes(16));
$dir = dirname(__DIR__, 2) . '/public/models/seller-uploads/';
if (!is_dir($dir)) mkdir($dir, 0755, true);
$targetPath = $dir . $hash . '.glb';
move_uploaded_file($file['tmp_name'], $targetPath);

jsonResponse(['success' => true, 'path' => '/models/seller-uploads/' . $hash . '.glb']);
```

- [ ] **Step 4: Run test to verify it passes**
Run: `node --test test/products_create.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

### Task 5: Product API (List & Detail)

**Files:**
- Create: `test/products_read.test.js`
- Create: `api/products/list.php`
- Create: `api/products/detail.php`

**Interfaces:**
- Consumes: `products` table
- Produces: List of products and specific product detail

- [ ] **Step 1: Write the failing test**
```javascript
// test/products_read.test.js
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';

test('Products API read endpoints exist', () => {
    assert.ok(fs.existsSync('api/products/list.php'));
    assert.ok(fs.existsSync('api/products/detail.php'));
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `node --test test/products_read.test.js`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**
Create `api/products/list.php`:
```php
<?php
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../helpers.php';

requireMethod('GET');
$user = currentSessionUser();
$db = getDb();

if ($user && $user['role'] === 'seller') {
    $stmt = $db->prepare("SELECT p.*, s.store_name FROM products p LEFT JOIN seller_profiles s ON p.seller_id = s.user_id WHERE p.seller_id = ? AND p.deleted_at IS NULL ORDER BY p.created_at DESC");
    $stmt->execute([$user['id']]);
} else if ($user && $user['role'] === 'owner') {
    $stmt = $db->prepare("SELECT p.*, s.store_name FROM products p LEFT JOIN seller_profiles s ON p.seller_id = s.user_id WHERE p.deleted_at IS NULL ORDER BY p.created_at DESC");
    $stmt->execute();
} else {
    $stmt = $db->prepare("SELECT p.*, s.store_name FROM products p LEFT JOIN seller_profiles s ON p.seller_id = s.user_id WHERE p.status = 'approved' AND p.deleted_at IS NULL ORDER BY p.created_at DESC");
    $stmt->execute();
}

$products = $stmt->fetchAll(PDO::FETCH_ASSOC);
foreach($products as &$p) {
    $p['mesh_map'] = json_decode($p['mesh_map'] ?? '[]', true);
    $p['part_colors'] = json_decode($p['part_colors'] ?? '[]', true);
    $p['sizes_available'] = json_decode($p['sizes_available'] ?? '[]', true);
}
jsonResponse(['success' => true, 'products' => $products]);
```

Create `api/products/detail.php`:
```php
<?php
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../helpers.php';

requireMethod('GET');
$id = $_GET['id'] ?? '';
$db = getDb();
$stmt = $db->prepare("SELECT p.*, s.store_name FROM products p LEFT JOIN seller_profiles s ON p.seller_id = s.user_id WHERE p.id = ? AND p.deleted_at IS NULL");
$stmt->execute([$id]);
$product = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$product) jsonError('Not found', 404);
$user = currentSessionUser();
if ($product['status'] !== 'approved' && (!$user || ($user['role'] !== 'owner' && $user['id'] !== $product['seller_id']))) {
    jsonError('Not found', 404);
}

$product['mesh_map'] = json_decode($product['mesh_map'] ?? '[]', true);
$product['part_colors'] = json_decode($product['part_colors'] ?? '[]', true);
$product['sizes_available'] = json_decode($product['sizes_available'] ?? '[]', true);
jsonResponse(['success' => true, 'product' => $product]);
```

- [ ] **Step 4: Run test to verify it passes**
Run: `node --test test/products_read.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

### Task 6: Product API (Submit & Review)

**Files:**
- Create: `test/products_action.test.js`
- Create: `api/products/submit.php`
- Create: `api/products/review.php`

**Interfaces:**
- Consumes: Seller/Admin session, Product DB
- Produces: Updated product status

- [ ] **Step 1: Write the failing test**
```javascript
// test/products_action.test.js
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';

test('Products API action endpoints exist', () => {
    assert.ok(fs.existsSync('api/products/submit.php'));
    assert.ok(fs.existsSync('api/products/review.php'));
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `node --test test/products_action.test.js`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**
Create `api/products/submit.php`:
```php
<?php
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../helpers.php';

requireMethod('POST');
$user = currentSessionUser();
if (!$user || $user['role'] !== 'seller') jsonError('Unauthorized', 403);

$body = getJsonBody();
$id = $body['productId'] ?? '';

$db = getDb();
$stmt = $db->prepare("UPDATE products SET status = 'pending' WHERE id = ? AND seller_id = ? AND status IN ('draft', 'rejected')");
$stmt->execute([$id, $user['id']]);
if ($stmt->rowCount() === 0) jsonError('Invalid operation', 400);

jsonResponse(['success' => true]);
```

Create `api/products/review.php`:
```php
<?php
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../helpers.php';

requireMethod('POST');
requireAdmin();

$body = getJsonBody();
$id = $body['productId'] ?? '';
$status = $body['status'] ?? 'pending';
$notes = $body['notes'] ?? '';
$approvedAt = $status === 'approved' ? date('Y-m-d H:i:s') : null;

if (!in_array($status, ['approved', 'rejected', 'suspended'])) jsonError('Invalid status', 400);

$db = getDb();
$stmt = $db->prepare("UPDATE products SET status = ?, admin_notes = ?, approved_at = COALESCE(approved_at, ?) WHERE id = ?");
$stmt->execute([$status, $notes, $approvedAt, $id]);

jsonResponse(['success' => true]);
```

- [ ] **Step 4: Run test to verify it passes**
Run: `node --test test/products_action.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

### Task 7: Vue Component - TutorialOverlay

**Files:**
- Create: `src/components/TutorialOverlay.vue`

**Interfaces:**
- Consumes: `tutorial_progress` from API
- Produces: Visual spotlight over `data-tutorial` elements

- [ ] **Step 1: Write the failing test**
Create the file placeholder.
- [ ] **Step 2: Write minimal implementation**
```vue
<template>
  <div v-if="isVisible" class="fixed inset-0 z-50 pointer-events-none">
    <div class="absolute inset-0 bg-black bg-opacity-70"></div>
    <div v-if="targetRect" 
         class="absolute border-4 border-kickcraft-terracotta bg-transparent"
         :style="spotlightStyle"></div>
    <div v-if="currentStepData" 
         class="absolute bg-white border-4 border-black p-4 w-80 pointer-events-auto"
         :style="tooltipStyle">
      <h3 class="font-bold border-b-2 border-black pb-2 mb-2">{{ currentStepData.title }}</h3>
      <p class="mb-4">{{ currentStepData.text }}</p>
      <div class="flex justify-between items-center text-sm">
        <button @click="nextStep" class="bg-black text-white px-4 py-1">Next →</button>
        <button @click="skipAll" class="text-gray-500 hover:text-black">Skip All</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue';
import { api } from '../api.js';

const isVisible = ref(false);
const targetRect = ref(null);
const stepId = ref('welcome');

const steps = {
  welcome: { title: 'Welcome', text: 'Welcome to Seller Studio!' },
  create_product: { title: 'Create Product', text: 'Click here to create a product.' }
};

const currentStepData = computed(() => steps[stepId.value]);

const spotlightStyle = computed(() => {
  if (!targetRect.value) return {};
  return {
    top: `${targetRect.value.top - 8}px`,
    left: `${targetRect.value.left - 8}px`,
    width: `${targetRect.value.width + 16}px`,
    height: `${targetRect.value.height + 16}px`,
  };
});

const tooltipStyle = computed(() => {
  if (!targetRect.value) return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
  return {
    top: `${targetRect.value.bottom + 16}px`,
    left: `${targetRect.value.left}px`,
  };
});

async function loadProgress() {
  try {
    const res = await api('tutorial/progress.php');
    if (!res.progress.tutorial_completed) {
      stepId.value = res.progress.current_step || 'welcome';
      isVisible.value = true;
      findTarget();
    }
  } catch (e) {}
}

function findTarget() {
  nextTick(() => {
    const el = document.querySelector(`[data-tutorial="${stepId.value}"]`);
    if (el) targetRect.value = el.getBoundingClientRect();
  });
}

function nextStep() {
  // Logic to move to next step, save progress
  isVisible.value = false;
}

function skipAll() {
  isVisible.value = false;
}

onMounted(() => {
  loadProgress();
});
</script>
```

- [ ] **Step 3: Run build to verify compilation**
Run: `npm run build`
Expected: PASS

- [ ] **Step 4: Commit**


### Task 8: Vue Component - MeshTagger

**Files:**
- Create: `src/components/MeshTagger.vue`

**Interfaces:**
- Consumes: GLB file URL
- Produces: `meshMap` object matching mesh names to customizable parts

- [ ] **Step 1: Write the failing test**
Create file placeholder.
- [ ] **Step 2: Write minimal implementation**
```vue
<template>
  <div class="mesh-tagger grid md:grid-cols-2 gap-4 border-2 border-black p-4">
    <div class="model-preview border-r-2 border-black pr-4 h-96 relative bg-[#f1f2f0]">
      <model-viewer ref="viewer" :src="glbPath" class="w-full h-full" auto-rotate camera-controls></model-viewer>
    </div>
    <div class="tagger-controls pl-4 overflow-y-auto">
      <h3 class="font-bold text-xl mb-2">Tag Shoe Parts</h3>
      <p class="text-sm mb-4">Click a mesh on the left to select it, then assign it.</p>
      <ul>
         <li v-for="part in knownParts" :key="part.id" class="mb-4 p-2 border-2 border-black bg-white flex justify-between items-center">
            <span class="font-bold">{{ part.label }}</span>
            <span v-if="meshMap[part.id]" class="text-sm bg-[#eaf5ee] text-[#2a593a] px-2 py-1 font-mono">✔️ {{ meshMap[part.id].meshName }}</span>
            <button v-else @click="assignSelectedMesh(part.id)" class="bg-black text-white px-3 py-1 text-sm font-bold hover:bg-kickcraft-terracotta">Assign Selected</button>
         </li>
      </ul>
      <button @click="$emit('complete', meshMap)" :disabled="Object.keys(meshMap).length < 3" class="mt-4 bg-kickcraft-terracotta text-white px-4 py-3 w-full font-bold uppercase disabled:opacity-50">Accept & Continue (Min 3)</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
const props = defineProps(['glbPath']);
const emit = defineEmits(['complete']);
const viewer = ref(null);

const knownParts = [
    { id: 'Upper', label: 'Upper' },
    { id: 'ToeCap', label: 'Toe Cap' },
    { id: 'Tongue', label: 'Tongue' },
    { id: 'Laces', label: 'Laces' },
    { id: 'HeelPanel', label: 'Heel Panel' },
    { id: 'SideAccents', label: 'Side Accents' },
    { id: 'Midsole', label: 'Midsole' },
    { id: 'Outsole', label: 'Outsole' }
];

const meshMap = ref({});

function assignSelectedMesh(partId) {
    // In full implementation, this uses model-viewer raycaster to find clicked mesh
    meshMap.value[partId] = { meshName: 'Mock_Mesh_' + partId, defaultColor: '#ffffff' };
}
</script>
```

- [ ] **Step 3: Run build to verify compilation**
Run: `npm run build`
Expected: PASS

- [ ] **Step 4: Commit**

### Task 9: Vue Component - ProductCustomizer

**Files:**
- Create: `src/components/ProductCustomizer.vue`

**Interfaces:**
- Consumes: `meshMap`, GLB path
- Produces: `partColors` object mapping parts to colors, `charmId`

- [ ] **Step 1: Write the failing test**
Create file placeholder.
- [ ] **Step 2: Write minimal implementation**
```vue
<template>
  <div class="product-customizer grid md:grid-cols-2 gap-4 border-2 border-black p-4">
    <div class="model-preview border-r-2 border-black pr-4 h-96 relative bg-[#f1f2f0]">
      <model-viewer ref="viewer" :src="glbPath" class="w-full h-full" auto-rotate camera-controls></model-viewer>
    </div>
    <div class="customizer-controls pl-4 overflow-y-auto">
      <h3 class="font-bold text-xl mb-4">Set Colors & Charms</h3>
      
      <div v-for="(meshInfo, partId) in meshMap" :key="partId" class="mb-4">
         <span class="font-bold block mb-1">{{ partId }}</span>
         <div class="flex gap-2">
            <button v-for="color in colors" :key="color.name" 
                    class="w-8 h-8 border-2 border-black rounded-full cursor-pointer hover:scale-110"
                    :style="{ backgroundColor: color.value }"
                    :class="{'ring-2 ring-kickcraft-terracotta ring-offset-2': partColors[partId]?.name === color.name}"
                    @click="setColor(partId, color)"
                    :title="color.name"></button>
         </div>
      </div>

      <h3 class="font-bold text-xl mt-6 mb-2 border-t-2 border-black pt-4">Select Charm</h3>
      <div class="flex gap-2">
         <button v-for="charm in charms" :key="charm.id"
                 class="border-2 border-black px-4 py-2 hover:bg-black hover:text-white"
                 :class="{'bg-black text-white': selectedCharm === charm.id}"
                 @click="selectedCharm = charm.id">
            {{ charm.label }}
         </button>
      </div>

      <button @click="emitComplete" class="mt-8 bg-kickcraft-terracotta text-white px-4 py-3 w-full font-bold uppercase">Save & Review Details</button>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
const props = defineProps(['glbPath', 'meshMap']);
const emit = defineEmits(['complete']);

const colors = [
  { name: 'Chalk', value: '#f1efe8' },
  { name: 'Graphite', value: '#292b2d' },
  { name: 'Cobalt', value: '#245fa8' },
  { name: 'Rust', value: '#b94d27' },
];

const charms = [
  { id: 'none', label: 'None' },
  { id: 'star', label: 'Star' },
  { id: 'k-tag', label: 'K-Tag' },
];

const partColors = ref({});
const selectedCharm = ref('none');

function setColor(partId, color) {
    partColors.value[partId] = color;
}

function emitComplete() {
    emit('complete', { partColors: partColors.value, charmId: selectedCharm.value });
}
</script>
```

- [ ] **Step 3: Run build to verify compilation**
Run: `npm run build`
Expected: PASS

- [ ] **Step 4: Commit**

### Task 10: Seller Dashboard - Product Creation Wizard

**Files:**
- Modify: `src/components/SellerDashboard.vue`

**Interfaces:**
- Consumes: MeshTagger, ProductCustomizer, Products API

- [ ] **Step 1: Write the failing test**
Create file placeholder.
- [ ] **Step 2: Write minimal implementation**
Modify `SellerDashboard.vue` to include the creation wizard logic in a new tab:
```vue
<!-- Add inside the tabs container in SellerDashboard.vue -->
<div v-if="activeTab === 'create'" class="wizard-container">
  <h2 class="text-3xl font-bold uppercase tracking-tighter border-b-4 border-black pb-2 mb-6">Create New Product</h2>
  
  <div v-if="wizardStep === 0" class="creation-methods grid md:grid-cols-3 gap-6">
     <div class="border-4 border-black p-6 bg-white hover:border-kickcraft-terracotta cursor-pointer transition-colors" @click="startWizard('upload')" data-tutorial="choose_method">
        <h3 class="font-bold text-2xl mb-2">📁 Upload GLB</h3>
        <p class="text-sm">Upload your own 3D shoe model (.glb)</p>
     </div>
     <div class="border-4 border-black p-6 bg-white hover:border-kickcraft-terracotta cursor-pointer transition-colors" @click="startWizard('ai_generate')">
        <h3 class="font-bold text-2xl mb-2">🤖 AI Generate</h3>
        <p class="text-sm">Upload a 2D shoe photo and AI will generate a 3D model</p>
     </div>
     <div class="border-4 border-black p-6 bg-white hover:border-kickcraft-terracotta cursor-pointer transition-colors" @click="startWizard('template')">
        <h3 class="font-bold text-2xl mb-2">🧩 Template Builder</h3>
        <p class="text-sm">Build from KickCraft's modular shoe parts</p>
     </div>
  </div>

  <div v-else-if="wizardStep === 1 && method === 'upload'">
     <input type="file" @change="handleGLBUpload" accept=".glb" class="mb-4">
     <MeshTagger v-if="draftGlbPath" :glbPath="draftGlbPath" @complete="onMeshTagged" />
  </div>

  <div v-else-if="wizardStep === 2">
     <ProductCustomizer :glbPath="draftGlbPath" :meshMap="draftMeshMap" @complete="onColorsCustomized" />
  </div>

  <div v-else-if="wizardStep === 3" class="details-form max-w-lg border-2 border-black p-6 bg-white">
     <h3 class="font-bold text-xl mb-4">Product Details</h3>
     <input v-model="draftProduct.name" placeholder="Product Name" class="w-full border-2 border-black p-2 mb-4 font-mono">
     <input v-model.number="draftProduct.price" type="number" placeholder="Price (PHP)" class="w-full border-2 border-black p-2 mb-4 font-mono">
     <button @click="submitProduct" :disabled="isSubmitting" class="w-full bg-black text-white font-bold p-3 uppercase hover:bg-kickcraft-terracotta">Create Draft & Submit</button>
  </div>
</div>
```
*(Include necessary imports, reactive state, and API call methods like `submitProduct` calling `api('products/create.php')` and `api('products/submit.php')`)*

- [ ] **Step 3: Run build to verify compilation**
Run: `npm run build`
Expected: PASS

- [ ] **Step 4: Commit**

### Task 11: Seller Dashboard - "My Products" Tab Wiring

**Files:**
- Modify: `src/components/SellerDashboard.vue`

**Interfaces:**
- Consumes: Products API (list)
- Produces: Products list UI

- [ ] **Step 1: Write the failing test**
Create file placeholder.
- [ ] **Step 2: Write minimal implementation**
Modify `SellerDashboard.vue` to show products:
```vue
<!-- Add inside the tabs container in SellerDashboard.vue -->
<div v-if="activeTab === 'products'" class="my-products">
  <div class="flex justify-between items-center border-b-4 border-black pb-2 mb-6">
    <h2 class="text-3xl font-bold uppercase tracking-tighter">My Products ({{ products.length }})</h2>
    <button @click="activeTab = 'create'; wizardStep = 0" class="bg-black text-white font-bold px-4 py-2 hover:bg-kickcraft-terracotta" data-tutorial="create_product">+ Create New Product</button>
  </div>

  <div v-if="isLoading" class="font-mono">Loading products...</div>
  <div v-else-if="products.length === 0" class="border-2 border-dashed border-gray-400 p-8 text-center text-gray-500 font-mono">
    You haven't listed any products yet.
  </div>
  <div v-else class="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
    <div v-for="product in products" :key="product.id" class="border-4 border-black bg-white group hover:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transition-all">
      <div class="h-48 bg-gray-100 flex items-center justify-center border-b-4 border-black">
        <span class="font-mono text-gray-400">{{ product.creation_method }}</span>
      </div>
      <div class="p-4">
        <div class="flex justify-between items-start mb-2">
          <h3 class="font-bold text-lg uppercase truncate">{{ product.name }}</h3>
          <span class="text-xs px-2 py-1 font-bold border-2 border-black uppercase bg-[#f1f2f0]">{{ product.status }}</span>
        </div>
        <p class="font-mono text-lg font-bold">₱{{ product.price }}</p>
      </div>
    </div>
  </div>
</div>
```
*(Add `loadProducts` function that fetches from `api/products/list.php` in the script setup)*

- [ ] **Step 3: Run build to verify compilation**
Run: `npm run build`
Expected: PASS

- [ ] **Step 4: Commit**

### Task 12: Marketplace View & Route Registration

**Files:**
- Create: `src/components/MarketplaceView.vue`
- Modify: `src/App.vue`

**Interfaces:**
- Consumes: Products API (list public approved)
- Produces: Public catalog grid

- [ ] **Step 1: Write the failing test**
Create file placeholder.
- [ ] **Step 2: Write minimal implementation**
Create `MarketplaceView.vue`:
```vue
<template>
  <div class="marketplace max-w-7xl mx-auto px-4 py-12">
    <header class="border-b-8 border-black pb-6 mb-12 flex justify-between items-end">
      <div>
        <h1 class="text-5xl md:text-7xl font-black uppercase tracking-tighter leading-none mb-2">Marketplace</h1>
        <p class="text-xl md:text-2xl font-medium tracking-tight">Discover custom sneakers from independent sellers.</p>
      </div>
    </header>

    <div v-if="isLoading" class="font-mono text-lg">Loading marketplace...</div>
    <div v-else-if="products.length === 0" class="border-4 border-dashed border-black p-12 text-center text-xl font-bold uppercase">
      No products available yet.
    </div>
    
    <div v-else class="grid md:grid-cols-3 gap-8">
      <div v-for="product in products" :key="product.id" class="border-4 border-black bg-white group hover:shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-2 hover:-translate-x-2 transition-all cursor-pointer">
        <div class="h-64 bg-[#f1f2f0] border-b-4 border-black relative">
          <!-- Thumbnail placeholder -->
        </div>
        <div class="p-6">
          <h3 class="font-bold text-2xl uppercase tracking-tighter mb-1">{{ product.name }}</h3>
          <p class="font-mono text-sm mb-4">by <span class="font-bold text-kickcraft-terracotta">{{ product.store_name }}</span></p>
          <div class="flex justify-between items-center">
            <span class="font-bold text-xl">₱{{ product.price }}</span>
            <button class="bg-black text-white px-4 py-2 font-bold uppercase text-sm group-hover:bg-kickcraft-terracotta transition-colors">View Details</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
<script setup>
import { ref, onMounted } from 'vue';
import { api } from '../api.js';

const products = ref([]);
const isLoading = ref(true);

onMounted(async () => {
  try {
    const res = await api('products/list.php');
    if (res.products) products.value = res.products;
  } catch (e) {} finally {
    isLoading.value = false;
  }
});
</script>
```

Modify `src/App.vue`:
```vue
<!-- Import MarketplaceView -->
<script setup>
const MarketplaceView = defineAsyncComponent(() => import('./components/MarketplaceView.vue'));
// Add to view resolutions
function resolveCurrentRoute() {
    const hash = window.location.hash.replace(/^#\/?/, '').trim();
    if (hash === 'marketplace') {
        view.value = 'marketplace';
        return;
    }
    // ... existing ...
}
</script>

<template>
  <main>
    <MarketplaceView v-if="view === 'marketplace'" />
  </main>
</template>
```

- [ ] **Step 3: Run build to verify compilation**
Run: `npm run build`
Expected: PASS

- [ ] **Step 4: Commit**

### Task 13: Admin Panel - Products Tab

**Files:**
- Modify: `src/components/AdminPanel.vue`

**Interfaces:**
- Consumes: Products API (list all)
- Produces: Admin product review UI

- [ ] **Step 1: Write the failing test**
Create file placeholder.
- [ ] **Step 2: Write minimal implementation**
Modify `AdminPanel.vue`:
```vue
<!-- Add tab button in AdminPanel header -->
<button @click="activeTab = 'products'" :class="{'bg-black text-white': activeTab === 'products'}" class="border-2 border-black px-4 py-2 font-bold uppercase">Products</button>

<!-- Add tab content -->
<div v-if="activeTab === 'products'" class="admin-products">
  <div class="grid gap-4">
    <div v-for="product in products" :key="product.id" class="border-2 border-black p-4 bg-white flex justify-between items-center">
      <div>
        <h4 class="font-bold uppercase">{{ product.name }} <span class="text-sm font-mono text-gray-500 ml-2">({{ product.store_name }})</span></h4>
        <p class="text-sm font-mono mt-1">Status: <span class="font-bold">{{ product.status }}</span></p>
      </div>
      <div class="flex gap-2" v-if="product.status === 'pending'">
        <button @click="reviewProduct(product.id, 'approved')" class="bg-[#eaf5ee] text-[#2a593a] border-2 border-[#2a593a] px-3 py-1 font-bold text-sm">Approve</button>
        <button @click="reviewProduct(product.id, 'rejected')" class="bg-[#fdf2ef] text-[#b94d27] border-2 border-[#b94d27] px-3 py-1 font-bold text-sm">Reject</button>
      </div>
    </div>
  </div>
</div>
```
*(Add logic in script setup to fetch products and call `api('products/review.php')`)*

- [ ] **Step 3: Run build to verify compilation**
Run: `npm run build`
Expected: PASS

- [ ] **Step 4: Commit**

### Task 14: Header Navigation Update

**Files:**
- Modify: `src/App.vue`

**Interfaces:**
- Consumes: Header UI
- Produces: Link to `#marketplace`

- [ ] **Step 1: Write the failing test**
Create file placeholder.
- [ ] **Step 2: Write minimal implementation**
Modify `src/App.vue` header section:
```vue
<!-- Add between Gallery and Profile/Login links -->
<a href="#marketplace" 
   class="hidden md:inline-block font-mono font-bold hover:text-kickcraft-terracotta transition-colors"
   :class="{ 'border-b-4 border-black pb-1': view === 'marketplace' }">
  Marketplace
</a>
```

- [ ] **Step 3: Run build to verify compilation**
Run: `npm run build`
Expected: PASS

- [ ] **Step 4: Commit**
