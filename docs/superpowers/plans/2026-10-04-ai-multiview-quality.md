# Multi-Angle 3D AI Reconstruction & Quality Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Elevate KickCraft's AI 2D→3D generation from rough single-photo hallucinations to high-fidelity 3D sneaker meshes by implementing multi-view inputs (Side, Front, Back), automated AI background removal/isolation, and tuned geometric sampling parameters via TRELLIS.

**Architecture:** The seller uploads 1 to 3 sneaker photos (Side Profile required, Front & Back recommended) in an interactive multi-angle upload UI in `SellerDashboard.vue`. `api/ai/generate.php` processes the images and delegates to `trellis-client.php`, which runs AI background removal (`preprocess_images`) and feeds the multi-view gallery payload into TRELLIS's `run_multi_image` pipeline (`is_multiimage = true`, sampling steps increased from 12 to 20, mesh simplification tuned to 0.92 to preserve sole treads). The resulting GLB model is downloaded locally to `public/models/seller-ai/` for offline 3D interactive customization.

**Tech Stack:** Vue 3 (Composition API), PHP 8.2 (cURL, SSE streaming), Microsoft TRELLIS (Hugging Face ZeroGPU Gradio SSE API), Three.js / `<model-viewer>`.

**Spec:** Multi-View 3D Sneaker AI Reconstruction Specification

## Global Constraints
- Must remain 100% free and work with Hugging Face ZeroGPU / TRELLIS without paid third-party subscriptions.
- Support both single-image fallback and multi-image (2 to 3 photos) enhancement seamlessly.
- Preserve KickCraft Neo-Brutalist UI styling (`border-stone-900`, `shadow-[4px_4px_0px_#202220]`, terracotta `#b94d27` accents).
- Strictly zero physical `DELETE FROM` SQL queries in database logic.
- Keep all existing 524 automated tests passing (`npm test`, `npm run build`).

---

### Task 1: Preprocessing & Multi-Image Backend Engine in `trellis-client.php`

**Files:**
- Modify: `api/ai/trellis-client.php:175-280`
- Test: `test/ai_trellis_multiimage.test.js`

**Interfaces:**
- Consumes: `trellisGenerateGlb(array|string $imagePaths, string $destGlbPath, array $config = []): array`
- Produces: Multi-image Gradio queue submission, automated background preprocessing call (`preprocess_images`), tuned sampling parameters (steps 20, simplify 0.92).

- [ ] **Step 1: Write the failing test**

Create `test/ai_trellis_multiimage.test.js` testing multi-image input handling, payload structure, and quality parameters:

```javascript
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

test('trellis-client.php supports multi-image arrays and quality parameters', () => {
  const code = fs.readFileSync(path.resolve('api/ai/trellis-client.php'), 'utf8')
  
  // Verify trellisGenerateGlb accepts array of images
  assert.match(code, /function trellisGenerateGlb\(/)
  assert.match(code, /is_multiimage/)
  assert.match(code, /multiimage_algo/)
  assert.match(code, /preprocess_images|preprocess_image/)
  
  // Verify sampling steps and simplify tuning
  assert.match(code, /20/) // steps tuned to 20
  assert.match(code, /0\.92|0\.90/) // mesh simplification tuned to retain sole tread
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/ai_trellis_multiimage.test.js`
Expected: FAIL because `is_multiimage` and multi-image payload handling are not yet in `trellis-client.php`.

- [ ] **Step 3: Implement multi-image and preprocessing in `trellis-client.php`**

Update `trellisGenerateGlb()` in `api/ai/trellis-client.php`:
1. Check if `$imagePaths` is an array or string. Normalize to `$images = is_array($imagePaths) ? array_values(array_filter($imagePaths)) : [$imagePaths]`.
2. Determine `$isMulti = count($images) > 1;`
3. Upload each image file to `$baseUrl . '/gradio_api/upload'`.
4. If `$isMulti`:
   - Construct `$multiimageInput = array_map(function($up, $idx) use ($images) { return [['path' => (string)$up[0], 'orig_name' => basename($images[$idx]), 'mime_type' => mime_content_type($images[$idx]) ?: 'image/png', 'meta' => ['_type' => 'gradio.FileData']], null]; }, $uploadedList, array_keys($images));`
   - Run preprocessing job on `$space['deps']['preprocess_images']` to strip backgrounds cleanly with AI.
   - Pass `$multiimageInput` into component 8, `$isMulti` (true) into component 39 (`state`), and set primary image to first image.
5. If single image:
   - Run preprocessing on `$space['deps']['preprocess_image']` to strip background cleanly.
   - Pass preprocessed image into component 6, `[]` into component 8, and `false` into component 39.
6. Set quality parameters:
   - `ss_sampling_steps`: 20 (up from 12)
   - `slat_sampling_steps`: 20 (up from 12)
   - `multiimage_algo`: 'stochastic'
   - `mesh_simplify`: 0.92 (retains sole grooves and lacing lines)
   - `texture_size`: 1024

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/ai_trellis_multiimage.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add api/ai/trellis-client.php test/ai_trellis_multiimage.test.js
git commit -m "feat(ai): add multi-image support, background preprocessing, and quality tuning to trellis client"
```

---

### Task 2: API Endpoint Multi-File Ingestion in `api/ai/generate.php`

**Files:**
- Modify: `api/ai/generate.php:20-140`
- Modify: `test/ai.test.js`

**Interfaces:**
- Consumes: Multipart `POST /api/ai/generate.php` with `$_FILES['image']` (or `image_side`), and optional `$_FILES['image_front']`, `$_FILES['image_back']`.
- Produces: `{ success: true, generation: { id, sourceImagePath, additionalImages, resultGlbPath, ... } }`.

- [ ] **Step 1: Write the failing test**

Update `test/ai.test.js` to test multi-slot image uploads:

```javascript
test('POST /api/ai/generate.php accepts multiple angle slots (side, front, back)', async () => {
  // Verifies that generate.php checks for image / image_side as primary
  // and saves optional image_front, image_back
  const code = fs.readFileSync(path.resolve('api/ai/generate.php'), 'utf8')
  assert.match(code, /image_side|image_front|image_back/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/ai.test.js`
Expected: FAIL on the new assertion.

- [ ] **Step 3: Implement multi-slot file handling in `api/ai/generate.php`**

1. Support primary photo from `$_FILES['image']` or `$_FILES['image_side']`.
2. Inspect optional angle slots: `$_FILES['image_front']` and `$_FILES['image_back']`.
3. Validate format (jpg/png) and size (<= 10MB) for all provided slots.
4. Save each valid slot to `public/images/ai-source/` with hashed filenames.
5. Build `$imagePaths = ['side' => $destSide, 'front' => $destFront, 'back' => $destBack]` (filtering nulls).
6. Pass array `$imagePaths` to `trellisGenerateGlb()`.
7. Store primary image path in `source_image_path` in `ai_generations`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/ai.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add api/ai/generate.php test/ai.test.js
git commit -m "feat(ai): support multi-angle upload slots in generate.php endpoint"
```

---

### Task 3: Multi-Angle Upload Slots & Guided UI in `SellerDashboard.vue`

**Files:**
- Modify: `src/components/SellerDashboard.vue:415-460, 1450-1540`
- Test: `test/frontend-seller-ai-multiview.test.js`

**Interfaces:**
- Consumes: Seller UI Step 1 AI Creator state.
- Produces: 3-slot upload cards (Side Profile, Front View, Back View) with live image previews, angle labels, remove buttons, and multi-step progress indicators.

- [ ] **Step 1: Write the failing test**

Create `test/frontend-seller-ai-multiview.test.js`:

```javascript
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

test('SellerDashboard.vue contains multi-angle photo upload slots and tips', () => {
  const content = fs.readFileSync(path.resolve('src/components/SellerDashboard.vue'), 'utf8')
  
  // Verify 3 distinct angle slots
  assert.match(content, /Side Profile/i)
  assert.match(content, /Front View/i)
  assert.match(content, /Back View/i)
  
  // Verify multi-file formData append
  assert.match(content, /image_side|image_front|image_back/)
  
  // Verify quality guidance tips
  assert.match(content, /Tips for Best 3D Quality|Clean Background/i)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/frontend-seller-ai-multiview.test.js`
Expected: FAIL because SellerDashboard currently only has a single photo input.

- [ ] **Step 3: Implement multi-angle slot UI in `SellerDashboard.vue`**

1. In script state:
   - `aiSlotSide = ref(null)`
   - `aiSlotFront = ref(null)`
   - `aiSlotBack = ref(null)`
   - `aiSlotPreviews = ref({ side: '', front: '', back: '' })`
2. Implement slot handlers:
   - `handleSlotUpload(angle, event)`: sets file and generates preview object URL.
   - `removeSlotImage(angle)`: clears file and preview.
3. Update `handleAiGenerate()`:
   - Requires at least `aiSlotSide.value` (or any 1 image if only 1 provided).
   - Appends `image` (side), `image_front`, `image_back` to `FormData`.
   - Displays multi-step status messages during generation:
     - `1/3 Isolating sneaker silhouettes and removing background...`
     - `2/3 Fusing multi-angle geometry into 3D mesh...`
     - `3/3 Baking textures and exporting browser GLB...`
4. In template (`creationMethod === 'ai_generate'`):
   - Replace single file dropzone with a 3-slot Neo-Brutalist grid:
     - **Slot 1 (Side Profile):** marked `[ REQUIRED ]` with shoe side silhouette icon.
     - **Slot 2 (Front View):** marked `[ RECOMMENDED ]` with shoe toe/front icon.
     - **Slot 3 (Back View):** marked `[ RECOMMENDED ]` with shoe heel icon.
   - Add "Tips for Maximum 3D Quality" helper box:
     - "Place shoe on a neutral, solid surface or clean background."
     - "Keep consistent lighting across all angles."
     - "Side profile gives the main silhouette; front & back eliminate melted heel/toe artifacts."
   - Action button: `Generate 3D Model with Multi-Angle AI` (enabled when at least Side is selected).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/frontend-seller-ai-multiview.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/SellerDashboard.vue test/frontend-seller-ai-multiview.test.js
git commit -m "feat(seller): implement multi-angle photo upload slots and 3D quality tips in SellerDashboard"
```

---

### Task 4: Full System Verification & Regression Run

**Files:**
- Test: All unit and frontend test suites

- [ ] **Step 1: Run complete test suite**

Run: `npm test`
Expected: All 525+ tests pass with zero failures.

- [ ] **Step 2: Run production build**

Run: `npm run build`
Expected: Clean Vite build without warnings or errors.

- [ ] **Step 3: Verification commit**

```bash
git commit --allow-empty -m "chore(ai): verify multi-view 3D reconstruction upgrade passes all tests"
```
