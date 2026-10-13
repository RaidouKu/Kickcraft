# AI Shoe 3D Part Painting Editor Design Specification

**Feature:** Seller-Facing 3D Part-Painting Editor for AI-Generated & Single-Mesh Shoes  
**Date:** 2026-10-13  
**Status:** Approved  

---

## 1. System Identity & Problem Context

In KickCraft, AI-generated shoes (and some user-uploaded GLB models) reconstruct as a single continuous 3D mesh with one baked photographic texture map. Because standard `<model-viewer>` recoloring relies on distinct material names or primitives (such as `UpperMaterial`, `MidsoleMaterial`), single-mesh models could not previously support multi-part color customization without Blender or manual 3D remodeling software.

This feature introduces an intuitive, seller-facing **3D Part-Painting Editor** directly inside the KickCraft Seller Studio. Sellers can visually paint customizable shoe regions (Upper, Toe Cap, Tongue, Laces, Heel Panel, Side Accents, Midsole, Outsole) onto the 3D surface using an interactive brush, preview independent colors live, and save the partitioned model back into their draft sneaker.

---

## 2. Core User Workflows

### 2.1 Seller Part-Painting Workflow
1. **Entry:**
   - From **My Products** table in `SellerDashboard.vue`: on any draft or AI shoe, the seller clicks **"Define customizable parts"**.
   - From **Creation Wizard (Step 1 or Step 2 / Mesh Tagger)**: after AI generation or GLB upload, the seller clicks **"🎨 Define Customizable Parts (3D Painter)"**.
2. **Display Original Model:**
   - Fullscreen/modal 3D viewport opens displaying the genuine, textured 3D shoe loaded with Three.js.
3. **Select Part to Paint:**
   - The seller chooses one of the 8 canonical KickCraft parts:
     - Upper (`UpperMaterial`)
     - Toe Cap (`ToeCapMaterial`)
     - Tongue (`TongueMaterial`)
     - Laces (`LacesMaterial`)
     - Heel Panel (`HeelPanelMaterial`)
     - Side Accents (`SideAccentsMaterial`)
     - Midsole (`MidsoleMaterial`)
     - Outsole (`OutsoleMaterial`)
4. **Interactive Painting & Erasing:**
   - Left-click and drag on the 3D shoe paints the selected part onto surface triangles.
   - Circular visual cursor follows the pointer across the 3D surface.
   - Brush size can be adjusted using preset buttons (Fine, Medium, Wide) and a fine slider.
   - Erase mode provides a dashed circular cursor to remove part assignments without altering geometry.
   - Rotation/Zoom: sellers can rotate, pan, and zoom around the shoe using standard controls (e.g., right-click/middle-click drag, or toggle navigation mode) to inspect and paint all sides.
   - Occlusion & hidden-surface protection prevents painting through to the other side of the shoe.
   - Undo button reverts completed paint strokes.
   - Clear Region button wipes the current part's paint with confirmation.
5. **In-Editor Color Testing:**
   - Seller switches to test color mode or picks swatches to test independent recoloring of each painted part in real time.
6. **Save to Product Draft:**
   - Requires at least 2 distinct nonempty painted parts.
   - Automatically backs up the untouched original GLB as `..._original.glb`.
   - Exports partitioned binary GLB with standard KickCraft material names and neutral shading texture.
   - Saves to backend `api/products/save-painted-parts.php`.
   - Updates product draft `glb_path`, `mesh_map`, and default `part_colors`.
   - Product remains in `draft` status, ready for review submission when the seller completes details.

---

## 3. Architecture & Subsystems

```text
Seller Studio UI (SellerDashboard.vue / MeshTagger.vue)
         │  (Opens Fullscreen Modal)
         ▼
PartPaintingEditor.vue
   ├── Three.js Canvas (GLTFLoader, OrbitControls, Raycaster)
   ├── Brush Engine (Solid circle paint, dashed ring erase, normal culling)
   ├── Stroke Undo Stack & Face Assignment Map
   ├── Color Test Previewer (dynamic PBR material updates)
   └── MeshPartitioner (src/utils/meshPartitioner.js)
         │  (Splits BufferGeometry by part, bakes neutral texture, exports GLB)
         ▼
api/products/save-painted-parts.php
   ├── Seller Authentication & Ownership Check
   ├── Original Model Backup (..._original.glb)
   ├── Atomic GLB & Companion PNG Storage
   └── MySQL Update (glb_path, mesh_map, part_colors in products table)
```

---

## 4. Technical Specifications

### 4.1 3D Brush & Raycasting Engine
- **Hit Detection:** `THREE.Raycaster` projects pointer coordinates $(x, y)$ onto the shoe mesh.
- **Surface Patch Collection:**
  - Given intersection face index $F_0$ and hit point $P_0$, collect candidate triangles within world-space radius $R_{brush}$.
  - **Occlusion / Normal Culling:** Discard triangles whose surface normal points away from the camera:
    $$\vec{N}_{camera} \cdot \vec{V}_{view} \le 0.1$$
  - **Geodesic Distance Guard:** Discard triangles whose center distance from $P_0$ is greater than $R_{brush}$ or whose surface normal deviates by $> 90^\circ$ from the hit face normal to avoid bleed-through to internal cavities or opposite sides.
- **Assignment Storage:**
  - `faceAssignments = new Int8Array(totalFaces)` initialized to `-1` (unassigned).
  - When part $k \in [0..7]$ is painted, `faceAssignments[f] = k`.
  - When erasing, `faceAssignments[f] = -1`.
- **Stroke History & Undo:**
  - Each continuous mouse drag records a Map of `faceIndex -> oldPartId`.
  - Undo pops the latest stroke and restores the previous face assignments.

### 4.2 GLB Partitioning & Delighting (`src/utils/meshPartitioner.js`)
- **Mesh Splitting:**
  - BufferGeometry indexed triangles are grouped into sub-geometries based on `faceAssignments`.
  - For each part with assigned triangles, a dedicated Mesh/Primitive is created with the canonical KickCraft material name:
    - Part 0: `UpperMaterial`
    - Part 1: `ToeCapMaterial`
    - Part 2: `TongueMaterial`
    - Part 3: `LacesMaterial`
    - Part 4: `HeelPanelMaterial`
    - Part 5: `SideAccentsMaterial`
    - Part 6: `MidsoleMaterial`
    - Part 7: `OutsoleMaterial`
  - Unassigned triangles remain in `OriginalMaterial` with original diffuse texture.
- **Neutral Shading / Delighted Texture:**
  - To prevent dark photographic textures from making new colors muddy, assigned parts use a delighted high-reflectance shading map ($L \approx 0.85-0.90$) so `<model-viewer>` color multiplication behaves with true vibrance.
- **Export:**
  - Utilizes `GLTFExporter` from `three/examples/jsm/exporters/GLTFExporter.js`.
  - Exports in binary format (`{ binary: true }`).
  - Preserves transforms, UV coordinates, normals, and accessory anchors (such as `CharmAnchor`).

### 4.3 Backend Persistence & Security (`api/products/save-painted-parts.php`)
- **Session & Ownership:**
  - Requires seller authentication (`requireSeller($pdo)`).
  - Validates `product_id` belongs to the authenticated seller (`seller_id = ?`).
  - Rejects foreign seller requests with 404/403.
- **Asset Integrity & Backup:**
  - Max GLB upload size: 25MB.
  - Generates unique filename `hash_painted.glb`.
  - Preserves original model: copies original file to `..._original.glb` before updating.
  - Creates companion `.png` copy to satisfy edge proxy streaming requirements.
- **Database Update:**
  - Updates `glb_path`, `mesh_map` (JSON array of mapped parts), `part_colors` (JSON object of default part colors).
  - Preserves `draft` or `pending` status; does NOT publish to marketplace automatically.
  - Strict **zero physical `DELETE FROM` SQL statements**.

---

## 5. User Interface & Aesthetics
- **Brutalist Theme Tokens:**
  - Canvas frame: `border-2 border-stone-900 shadow-[6px_6px_0px_#202220]`.
  - Active part badges: terracotta `#b94d27` background, uppercase mono typography.
  - Cursor:
    - Paint mode: solid circle with live brush size radius.
    - Erase mode: dashed high-contrast circle.
  - Toolbar:
    - Preset size buttons: [FINE: 15px] [MED: 35px] [WIDE: 70px] + fine slider.
    - [PAINT] / [ERASE] mode toggle.
    - [ROTATE / PAN] navigation toggle.
    - [UNDO STROKE] and [CLEAR PART].
    - [TEST COLORS] preview toggle.
    - [SAVE & UPDATE DRAFT] primary action button.

---

## 6. Verification Criteria
1. At least 2 distinct parts required before enabling save.
2. Dense, continuous painting without bleed-through or painting through the shoe.
3. Erasing removes assignments without deleting shoe geometry.
4. Undo correctly restores preceding stroke state.
5. Exported GLB loads cleanly in `<model-viewer>` with mapped parts independently recolorable.
6. Backend enforces seller ownership and backs up original GLB untouched.
7. Zero physical `DELETE FROM` SQL statements.
8. 100% of existing test suites continue to pass with zero regressions.
