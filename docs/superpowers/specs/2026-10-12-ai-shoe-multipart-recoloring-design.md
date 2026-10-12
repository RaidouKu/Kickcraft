# AI 2D→3D Shoe Multi-Part Segmentation & True Color Customization Specification

## 1. Problem Statement & Root Cause

### 1.1 The Single-Mesh Barrier
When KickCraft's AI pipeline (Hugging Face TRELLIS) generates a 3D shoe model from 2D photos, it reconstructs continuous 3D geometry using Marching Cubes and bakes photographed colors into a single UV texture map. The resulting GLB file contains:
- **1 Mesh** (`geometry_0`)
- **1 Primitive**
- **1 Material** (`mat 0 name: None`)
- **1 Baked Texture Map** (`baseColorTexture`)

In contrast, production-ready CAD shoe models (`shoe-soleview-final.glb`, `air-max.glb`, `nike-dunk.glb`) feature **8 independently addressable materials** (`UpperMaterial`, `ToeCapMaterial`, `TongueMaterial`, `LacesMaterial`, `HeelPanelMaterial`, `SideAccentsMaterial`, `MidsoleMaterial`, `OutsoleMaterial`).

### 1.2 The "Overlay" Color Problem
In glTF PBR shading (rendered by Google `<model-viewer>`), the fragment color is computed as:
$$\text{Pixel Color} = \text{baseColorTexture.rgb} \times \text{baseColorFactor.rgb}$$
Because the photographed colors (e.g., brown leather, dark soles, red branding) are permanently baked into `baseColorTexture`:
1. Setting `baseColorFactor` acts as a **multiplicative tint overlay** rather than a true color replacement.
2. Multiplying a new color (e.g. Yellow $[1, 1, 0]$) against a blue/dark photographed texture produces muddy brown or black pixels. Pure white or vibrant pastels are mathematically impossible to render over a dark texture.
3. Because the entire shoe shares one material, any tint applied overlays the entire shoe at once (sole, upper, and laces all together).

---

## 2. Desired State & System Requirements

1. **Semantic Part Segmentation**:
   AI-generated shoes must be automatically partitioned into canonical KickCraft shoe parts (`Upper`, `ToeCap`, `Tongue`, `Laces`, `HeelPanel`, `SideAccents`, `Midsole`, `Outsole`), each with its own material in the GLB file.
2. **True Color Replacement (No Dark Overlay)**:
   When a user selects a color (e.g. Red, Terracotta, White, Black, Volt Yellow) for any part, that part must **completely and cleanly change to that exact color**, matching the behavior of the template and CAD shoes.
3. **Full Customizer & Marketplace Integration**:
   - In **Mesh Tagger** (`MeshTagger.vue`): Automatically detects the segmented shoe parts and maps them.
   - In **Seller Studio** (`ProductCustomizer.vue`): Sellers can recolor each part independently and set default colorways.
   - In **Marketplace & Order Modal** (`MarketplaceOrderModal.vue`): Buyers can rotate the 3D model, recolor each part independently, select their shoe size, and submit store pickup reservations.
   - In **PHP / MySQL Backend** (`create.php`, `update.php`): Stores `mesh_map` and `part_colors` for AI products instead of nullifying them.

---

## 3. Technical Architecture

### 3.1 Pillar 1: Automated 3D Shoe Slicer (`tools/segment-shoe-glb.py`)
A specialized geometric segmentation tool executes during the GLB post-processing stage (after TRELLIS synthesis):
1. **Bounding Box Normalization**:
   Computes the tight oriented bounding box of the shoe:
   - Height ($Y$ axis): $0.0$ (ground sole) to $1.0$ (highest point of collar/tongue).
   - Length ($Z$ axis): $0.0$ (rear heel) to $1.0$ (front toe tip).
   - Width ($X$ axis): $-0.5$ (medial) to $+0.5$ (lateral).
2. **Spatial Part Classification Heuristic**:
   Every triangle in the mesh index buffer is assigned to a part based on its vertex centroid $(X_c, Y_c, Z_c)$:
   - **Outsole** (`OutsoleMaterial`): $Y_c \le 0.12$ (bottom rubber tread layer).
   - **Midsole** (`MidsoleMaterial`): $0.12 < Y_c \le 0.25$ (cushion foam layer).
   - **ToeCap** (`ToeCapMaterial`): $Y_c > 0.25$, $Z_c \ge 0.78$, $Y_c \le 0.50$ (front toe bumper).
   - **Laces** (`LacesMaterial`): $Y_c > 0.45$, $|X_c| \le 0.18$, $0.35 \le Z_c < 0.72$, outer surface layer.
   - **Tongue** (`TongueMaterial`): $Y_c > 0.50$, $|X_c| \le 0.16$, $0.30 \le Z_c < 0.65$, inner surface layer.
   - **HeelPanel** (`HeelPanelMaterial`): $Y_c > 0.25$, $Z_c \le 0.22$ (rear counter wrap).
   - **SideAccents** (`SideAccentsMaterial`): $Y_c > 0.25$, $|X_c| \ge 0.35$, $0.25 \le Z_c < 0.75$ (lateral accent panels).
   - **Upper** (`UpperMaterial`): All remaining triangles on the shoe body.
3. **glTF Primitives Partitioning**:
   Rewrites the GLB:
   - Preserves shared vertex buffers (`POSITION`, `NORMAL`, `TEXCOORD_0`).
   - Splits `meshes[0].primitives` into 8 separate primitives, each referencing its own index buffer slice and dedicated material index.
   - Materials are named with standard KickCraft conventions: `UpperMaterial`, `MidsoleMaterial`, `OutsoleMaterial`, etc.

### 3.2 Pillar 2: Texture Decoupling & Delighting for True Color Replacement
To eliminate the dark/muddy multiplicative overlay:
1. **Delighted Grayscale Shading Texture**:
   The texture image is converted into a normalized grayscale ambient-occlusion/crease map. Brightness and contrast are normalized so that midtones represent neutral reflectances ($\sim 0.85$). When multiplied by `baseColorFactor`, the new color is rendered cleanly and faithfully with rich shading, wrinkles, and stitching preserved.
2. **Runtime Texture Detach in `<model-viewer>` (`src/customization.js`)**:
   In `setMaterialColor(model, materialName, colorHex, options)`:
   If a solid color replacement is applied:
   ```javascript
   const material = model?.getMaterialByName(materialName)
   if (material) {
     material.pbrMetallicRoughness.setBaseColorFactor(colorHex)
   }
   ```
   For materials where the user wants a 100% clean solid color without underlying texture influence, `<model-viewer>` can detach or suppress the texture, ensuring that applying white produces bright white, yellow produces vibrant volt yellow, and terracotta produces genuine KickCraft `#b94d27`.

### 3.3 Pillar 3: Frontend & Backend Integration
1. **`src/customization.js`**:
   - Update `isPartCustomizable(product)`: Remove the hardcoded `if (method === 'ai_generate') return false`. Check if the product has a non-empty `mesh_map`.
2. **`src/components/MeshTagger.vue`**:
   - The scanner extracts all materials. When 8 materials (`UpperMaterial`, `MidsoleMaterial`, etc.) are detected, auto-detection maps all 8 zones automatically.
3. **`src/components/ProductCustomizer.vue` & `SellerDashboard.vue`**:
   - Allow AI products with segmented meshes to enter full colorway customization (`charmOnly = false`).
   - Sellers select default colors for all 8 parts.
4. **`api/products/create.php` & `update.php`**:
   - Remove the override `if ($creationMethod === 'ai_generate') { $meshMap = null; }`.
   - Save the seller's `mesh_map` and `part_colors` to the database.
5. **`src/components/MarketplaceOrderModal.vue`**:
   - Renders individual part selector chips (Upper, Sole, Laces, etc.) for AI shoes just like standard GLB shoes.
   - Buyers customize colors, preview in 3D, and reserve for store pickup.

---

## 4. User Experience Flow

```
[Seller Uploads Shoe Photos]
           │
           ▼
[TRELLIS Reconstructs Raw 3D Model]
           │
           ▼
[tools/segment-shoe-glb.py Partitions Triangles into 8 Parts]
[Delights Textures into Grayscale Shading Maps]
           │
           ▼
[Model Saved with UpperMaterial, MidsoleMaterial, OutsoleMaterial, etc.]
           │
           ▼
[Seller Studio: Mesh Tagger Auto-Detects 8 Parts]
           │
           ▼
[Seller Picks Vibrant Base Colors (No Muddy Overlay!)]
           │
           ▼
[Admin Review -> Public Marketplace Storefront]
           │
           ▼
[Customer Customizes All 8 Parts in 3D -> Reserves for Store Pickup]
```

---

## 5. Verification & Safety Constraints
- Zero physical SQL `DELETE FROM` statements.
- Retain backward compatibility: single-mesh GLB models without segmentation fallback gracefully to overall color or charm-only.
- All existing unit and integration tests (597 tests) must continue to pass.
- Fast processing: segmentation execution in Python must complete within $< 1.5$ seconds per model.
