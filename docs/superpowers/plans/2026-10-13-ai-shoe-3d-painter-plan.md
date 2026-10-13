# AI Shoe 3D Part Painting Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a seller-facing 3D part-painting editor that enables sellers to visually paint customizable shoe parts directly onto AI-generated and single-mesh 3D models, test independent part recoloring, and save the partitioned model back to their product draft without requiring external 3D modeling tools.

**Architecture:** A fullscreen Three.js painting modal (`PartPaintingEditor.vue`) with surface raycasting, occlusion culling, undo history, brush sizing, and live color testing; a geometry partitioner (`src/utils/meshPartitioner.js`) grouping triangles into canonical KickCraft material primitives and exporting binary GLB; and an authenticated PHP endpoint (`api/products/save-painted-parts.php`) that backs up original models, validates seller ownership, and updates product drafts.

**Tech Stack:** Vue 3, Three.js (`three` v0.183.2, `GLTFLoader`, `GLTFExporter`, `OrbitControls`), Tailwind CSS, PHP 8, MySQL.

**Spec:** `docs/superpowers/specs/2026-10-13-ai-shoe-3d-painter-design.md`

## Global Constraints
- Preserve KickCraft brutalist aesthetic tokens: `border-2 border-stone-900`, `shadow-[..._#202220]`, terracotta `#b94d27` accents, uppercase mono typography.
- Zero physical SQL `DELETE FROM` statements anywhere in the codebase or tests.
- Model geometry, UV coordinates, normals, textures, transforms, and accessory anchors (`CharmAnchor`) must be preserved.
- Require at least two nonempty painted parts before enabling multi-part save.
- Keep the result in `draft` status; never publish automatically or re-invoke paid AI generation.
- All existing tests (629+) must continue to pass with zero regressions.

---

### Task 1: Backend Endpoint for Saving Painted Parts (`api/products/save-painted-parts.php`)

**Files:**
- Create: `api/products/save-painted-parts.php`
- Test: `test/api/products/save-painted-parts.test.js`

**Interfaces:**
- Consumes: `POST` with `multipart/form-data` or JSON: `productId`, `glbFile` (binary upload or base64), `meshMap` (JSON string or array), `partColors` (JSON string or object).
- Produces: JSON response `{ success: true, glbPath: string, meshMap: object, partColors: object }`.

- [ ] **Step 1: Write the failing test**
  Create `test/api/products/save-painted-parts.test.js` covering:
  - Rejecting unauthenticated requests (401).
  - Rejecting non-seller users (403).
  - Rejecting foreign product IDs not owned by the seller (404/403).
  - Validating required parameters (`productId`, `glbFile`, `meshMap`).
  - Enforcing at least 2 distinct mapped parts in `meshMap`.
  - Creating a backup of the original model (`_original.glb`) if it doesn't already exist.
  - Saving the updated GLB and companion `.png` in `/models/seller-uploads/` or `/models/seller-ai/`.
  - Updating the product record in MySQL (`glb_path`, `mesh_map`, `part_colors`) while preserving `status = 'draft'`.
  - Ensuring zero physical SQL `DELETE FROM` statements exist.

- [ ] **Step 2: Run test to verify it fails**
  Run: `cmd /c node --test test/api/products/save-painted-parts.test.js`
  Expected: FAIL with file not found or 404.

- [ ] **Step 3: Write minimal implementation**
  Create `api/products/save-painted-parts.php`:
  - Enforce `requireMethod('POST')`.
  - Authenticate seller via `requireSeller($pdo)`.
  - Verify seller ownership of `productId` in MySQL.
  - Verify input contains at least 2 distinct parts in `meshMap`.
  - Perform `_original.glb` backup of the existing model file if present.
  - Write new GLB file with secure random hash name, generate companion `.png`.
  - Update `products` table columns `glb_path`, `mesh_map`, `part_colors`.
  - Return JSON with new `glbPath`, `meshMap`, `partColors`.

- [ ] **Step 4: Run test to verify it passes**
  Run: `cmd /c node --test test/api/products/save-painted-parts.test.js`
  Expected: PASS all tests.

- [ ] **Step 5: Commit**
  ```bash
  git add api/products/save-painted-parts.php test/api/products/save-painted-parts.test.js
  git commit -m "feat(api): add save-painted-parts endpoint with seller ownership verification and model backup"
  ```

---

### Task 2: 3D Mesh Partitioner & Binary GLB Export Utility (`src/utils/meshPartitioner.js`)

**Files:**
- Create: `src/utils/meshPartitioner.js`
- Test: `test/mesh-partitioner.test.js`

**Interfaces:**
- Consumes: Three.js `Mesh` or `BufferGeometry`, `faceAssignments` (`Int8Array` or array of numbers), `materialMap` (canonical KickCraft material mapping), `originalTexture` (optional).
- Produces: `exportPaintedModelGlb(sceneOrMesh, faceAssignments, partMapping)` returning `Promise<Blob>`.

- [ ] **Step 1: Write the failing test**
  Create `test/mesh-partitioner.test.js` testing:
  - Correct partitioning of a `BufferGeometry` with multiple face assignments into sub-meshes / material groups.
  - Mapping assigned face indices to canonical KickCraft material names (`UpperMaterial`, `MidsoleMaterial`, etc.).
  - Keeping unassigned faces in `OriginalMaterial`.
  - Validation: rejects export when fewer than 2 distinct nonempty parts are assigned.
  - Creation of neutral grayscale shading canvas texture for assigned materials to prevent muddy dark color multiplication.
  - Proper integration with `GLTFExporter` returning binary GLB.

- [ ] **Step 2: Run test to verify it fails**
  Run: `cmd /c node --test test/mesh-partitioner.test.js`
  Expected: FAIL with module not found.

- [ ] **Step 3: Write minimal implementation**
  Create `src/utils/meshPartitioner.js`:
  - Implement `createNeutralDetailTexture()`: creates an in-memory high-reflectance grayscale texture for pure color multiplication.
  - Implement `partitionMeshByParts(sourceMesh, faceAssignments, partDefinitions)`: creates cloned geometry groups or split sub-meshes assigned to standard KickCraft materials.
  - Implement `exportPaintedModelGlb(rootObject, faceAssignments, partDefinitions)`: validates $\ge 2$ distinct parts, partitions geometry, exports with `GLTFExporter.parse(..., { binary: true })`, and returns binary `Blob` / `ArrayBuffer`.

- [ ] **Step 4: Run test to verify it passes**
  Run: `cmd /c node --test test/mesh-partitioner.test.js`
  Expected: PASS all tests.

- [ ] **Step 5: Commit**
  ```bash
  git add src/utils/meshPartitioner.js test/mesh-partitioner.test.js
  git commit -m "feat(3d): implement mesh partitioner and binary GLB exporter for painted shoe parts"
  ```

---

### Task 3: 3D Part Painting Editor Component (`src/components/PartPaintingEditor.vue`)

**Files:**
- Create: `src/components/PartPaintingEditor.vue`
- Test: `test/part-painting-editor.test.js`

**Interfaces:**
- Props: `glbPath: String`, `productId: String`, `initialMeshMap: Object`.
- Emits: `save: { glbBlob: Blob, meshMap: Object, partColors: Object }`, `cancel: void`.

- [ ] **Step 1: Write the failing test**
  Create `test/part-painting-editor.test.js` testing:
  - Component exports cleanly and mounts.
  - All 8 canonical parts are listed (Upper, Toe Cap, Tongue, Laces, Heel Panel, Side Accents, Midsole, Outsole).
  - Brush controls: Paint / Erase modes, brush size presets (Fine, Medium, Wide) and slider.
  - Occlusion / normal culling logic: does not paint faces whose normals face away from camera view direction.
  - Undo stack: records stroke changes and pops previous state upon undo.
  - Clear part confirmation and action.
  - Part face count and percentage calculation.
  - Minimum 2 parts validation before saving.
  - Test colors preview toggle.

- [ ] **Step 2: Run test to verify it fails**
  Run: `cmd /c node --test test/part-painting-editor.test.js`
  Expected: FAIL with component not found.

- [ ] **Step 3: Write minimal implementation**
  Create `src/components/PartPaintingEditor.vue`:
  - Fullscreen modal shell with brutalist tokens (`border-2 border-stone-900 shadow-[6px_6px_0px_#202220]`, terracotta `#b94d27` active accents).
  - WebGL Canvas with Three.js `PerspectiveCamera`, `Scene`, `WebGLRenderer`, `GLTFLoader`, `OrbitControls`.
  - Surface brush pointer: circular indicator tracking raycast hit point on shoe surface (solid border for Paint, dashed for Erase).
  - Stroke painting with `THREE.Raycaster`: gathers nearby faces within brush radius, checks surface normal occlusion (`normal.dot(viewDir) < -0.15`) to prevent painting through the shoe.
  - Undo history: stores array of modified face indices and previous values per drag stroke.
  - Clear region action with confirmation dialog.
  - Real-time part face counts and coverage percentage metrics.
  - Test color palette allowing sellers to test each part with live vibrant colors.
  - Save button: validates $\ge 2$ parts, calls `exportPaintedModelGlb`, and emits `save`.

- [ ] **Step 4: Run test to verify it passes**
  Run: `cmd /c node --test test/part-painting-editor.test.js`
  Expected: PASS all tests.

- [ ] **Step 5: Commit**
  ```bash
  git add src/components/PartPaintingEditor.vue test/part-painting-editor.test.js
  git commit -m "feat(seller): create 3D part painting editor component with raycast brush and undo stack"
  ```

---

### Task 4: Seller Studio Integration (`SellerDashboard.vue` & `MeshTagger.vue`)

**Files:**
- Modify: `src/components/SellerDashboard.vue`
- Modify: `src/components/MeshTagger.vue`
- Test: `test/frontend-seller-part-painter-integration.test.js`

**Interfaces:**
- Seller opens "Define customizable parts" from My Products draft card or Creation Wizard Step 1 / Mesh Tagger.
- On save, updates product draft GLB path, `draftMeshMap`, and `draftPartColors`.

- [ ] **Step 1: Write the failing test**
  Create `test/frontend-seller-part-painter-integration.test.js` testing:
  - My Products table displays "🎨 Define customizable parts" button for draft/AI products.
  - Creation Wizard Step 1 & Mesh Tagger single-mesh banner display "🎨 Define Customizable Parts (3D Painter)" button.
  - Clicking button opens `PartPaintingEditor.vue` modal with the product's GLB.
  - Saving in `PartPaintingEditor.vue` sends payload to `api/products/save-painted-parts.php`.
  - On success, updates `draftGlbPath`, `draftMeshMap`, and closes modal with success feedback.
  - Zero physical `DELETE FROM` SQL statements.

- [ ] **Step 2: Run test to verify it fails**
  Run: `cmd /c node --test test/frontend-seller-part-painter-integration.test.js`
  Expected: FAIL with missing buttons or handlers.

- [ ] **Step 3: Implement changes in `SellerDashboard.vue` and `MeshTagger.vue`**
  - In `SellerDashboard.vue`:
    - Add state: `showPartPainterModal = ref(false)`, `partPainterProduct = ref(null)`.
    - Add method `openPartPainter(prod)`: loads product details and opens modal.
    - Add handler `handlePartPainterSave(result)`: calls `save-painted-parts.php`, updates local draft or product list, displays success toast.
    - In Products table: add "🎨 Define customizable parts" button next to "Edit" on drafts and AI shoes.
    - In Wizard Step 1: add "🎨 Define Customizable Parts (3D Painter)" button when GLB is loaded or AI generation finishes.
  - In `MeshTagger.vue`:
    - Add "🎨 Define Customizable Parts (3D Painter)" button on the single-mesh banner and in the toolbar.
    - Emit `open-painter` event to parent dashboard when clicked.

- [ ] **Step 4: Run test to verify it passes**
  Run: `cmd /c node --test test/frontend-seller-part-painter-integration.test.js`
  Expected: PASS all tests.

- [ ] **Step 5: Commit**
  ```bash
  git add src/components/SellerDashboard.vue src/components/MeshTagger.vue test/frontend-seller-part-painter-integration.test.js
  git commit -m "feat(seller): integrate 3D part painter into seller dashboard and mesh tagger"
  ```

---

### Task 5: End-to-End System Verification & Regression Testing

**Files:**
- Test: Full test suite (`test/**/*.test.js`)
- Verify: Production Vite build (`cmd /c npm run build`)

- [ ] **Step 1: Run complete test suite**
  Run: `cmd /c npm test`
  Verify: 100% of test suites pass with zero regressions.

- [ ] **Step 2: Verify production build**
  Run: `cmd /c npm run build`
  Verify: Vite build compiles without errors or bundle warnings.

- [ ] **Step 3: Verify security & rules**
  Verify:
  - Zero physical SQL `DELETE FROM` statements.
  - Ownership enforcement verified across sellers.
  - Original model preserved as backup.
  - Multi-part recoloring verified with $\ge 2$ parts.

- [ ] **Step 4: Commit and finalize**
  ```bash
  git commit -m "chore: complete 3D part painter system verification and regression checks"
  ```
