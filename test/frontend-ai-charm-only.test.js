import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { isPartCustomizable, parseMeshMap } from '../src/customization.js'

const CUSTOMIZER_PATH = path.resolve('src/components/ProductCustomizer.vue')
const MESH_TAGGER_PATH = path.resolve('src/components/MeshTagger.vue')
const SELLER_DASHBOARD_PATH = path.resolve('src/components/SellerDashboard.vue')
const MARKETPLACE_PATH = path.resolve('src/components/MarketplaceView.vue')
const CREATE_API_PATH = path.resolve('api/products/create.php')
const UPDATE_API_PATH = path.resolve('api/products/update.php')
const ORDER_CREATE_API_PATH = path.resolve('api/orders/create.php')

test('isPartCustomizable helper accurately identifies shoes with separate addressable parts', () => {
  // AI-generated shoes are NEVER part-customizable (single baked mesh)
  assert.equal(isPartCustomizable({ creationMethod: 'ai_generate', meshMap: { Upper: 'Mesh_0' } }), false)
  assert.equal(isPartCustomizable({ creation_method: 'ai_generate', mesh_map: '{"Upper":"Mesh_0"}' }), false)

  // Null, undefined, or empty mesh maps are NOT part-customizable
  assert.equal(isPartCustomizable(null), false)
  assert.equal(isPartCustomizable({ creationMethod: 'upload', meshMap: {} }), false)
  assert.equal(isPartCustomizable({ creationMethod: 'template', meshMap: null }), false)
  assert.equal(isPartCustomizable({ creationMethod: 'template', mesh_map: '{}' }), false)

  // Template and GLB Upload shoes with 1+ mapped parts ARE part-customizable
  assert.equal(isPartCustomizable({ creationMethod: 'template', meshMap: { Upper: 'UpperMesh' } }), true)
  assert.equal(isPartCustomizable({ creation_method: 'upload', mesh_map: '{"Upper":"Mesh_0","Midsole":"Mesh_1"}' }), true)

  // parseMeshMap helper handles objects, JSON strings, and invalid values gracefully
  assert.deepEqual(parseMeshMap(null), {})
  assert.deepEqual(parseMeshMap('invalid json'), {})
  assert.deepEqual(parseMeshMap('{"ToeCap":"Toe_Mesh"}'), { ToeCap: 'Toe_Mesh' })
  assert.deepEqual(parseMeshMap({ Laces: 'Lace_Mesh' }), { Laces: 'Lace_Mesh' })
})

test('ProductCustomizer supports charmOnly prop and hides part recoloring controls', () => {
  assert.ok(fs.existsSync(CUSTOMIZER_PATH), 'ProductCustomizer.vue must exist')
  const content = fs.readFileSync(CUSTOMIZER_PATH, 'utf8')

  // charmOnly prop declaration
  assert.match(content, /charmOnly:\s*\{\s*type:\s*Boolean,\s*default:\s*false,?\s*\}/, 'Must declare charmOnly prop')

  // Part colors and mapped parts gated on charmOnly
  assert.match(content, /partColors\s*=\s*ref\(props\.charmOnly\s*\?\s*\{\}\s*:\s*\{/, 'Must initialize partColors to empty in charmOnly mode')
  assert.match(content, /if\s*\(props\.charmOnly\)\s*return\s*\[\]/, 'mappedParts must be empty in charmOnly mode')
  assert.match(content, /if\s*\(props\.charmOnly\s*\|\|\s*!viewer\.value/, 'applyColorToViewer must early exit when charmOnly')
  assert.match(content, /partColors:\s*props\.charmOnly\s*\?\s*\{\}\s*:\s*\{/, 'handleComplete must emit empty partColors when charmOnly')

  // Template displays original texture banner and hides part selector / palette
  assert.match(content, /v-if="charmOnly"/, 'Must render charm-only banner')
  assert.match(content, /ORIGINAL 3D TEXTURE/i, 'Banner must label original 3D texture')
  assert.match(content, /v-if="!charmOnly"/, 'Must hide reset button and active part in charmOnly mode')
})

test('MeshTagger detects single combined meshes and notifies seller', () => {
  assert.ok(fs.existsSync(MESH_TAGGER_PATH), 'MeshTagger.vue must exist')
  const content = fs.readFileSync(MESH_TAGGER_PATH, 'utf8')

  assert.match(content, /isSingleMaterial\s*=\s*ref\(false\)/, 'Must declare isSingleMaterial state')
  assert.match(content, /isSingleMaterial\.value\s*=\s*\(materials\.length\s*<=\s*1\)/, 'Must detect single material on model load')
  assert.match(content, /SINGLE COMBINED MESH DETECTED/i, 'Must display single combined mesh banner')
})

test('SellerDashboard wires charm-only mode for AI-generated and single-mesh products', () => {
  assert.ok(fs.existsSync(SELLER_DASHBOARD_PATH), 'SellerDashboard.vue must exist')
  const content = fs.readFileSync(SELLER_DASHBOARD_PATH, 'utf8')

  // isCharmOnlyProduct computed
  assert.match(content, /const\s+isCharmOnlyProduct\s*=\s*computed\(/, 'Must declare isCharmOnlyProduct computed')
  assert.match(content, /creationMethod\.value\s*===\s*['"]ai_generate['"]/, 'isCharmOnlyProduct must check ai_generate')

  // Passes charm-only prop to ProductCustomizer
  assert.match(content, /:charm-only="isCharmOnlyProduct"/, 'Must pass :charm-only="isCharmOnlyProduct" to ProductCustomizer')

  // Step 3 preview shows original texture indicator
  assert.match(content, /isCharmOnlyProduct\s*\?\s*['"]Original 3D Texture/, 'Must show original texture label in Step 3 spec preview')

  // Submit payload uses effectiveMeshMap and effectivePartColors
  assert.match(content, /const\s+effectiveMeshMap\s*=\s*isCharmOnlyProduct\.value\s*\?\s*\{\}/, 'Must submit empty meshMap for charm-only products')
  assert.match(content, /const\s+effectivePartColors\s*=\s*isCharmOnlyProduct\.value\s*\?\s*\{\}/, 'Must submit empty partColors for charm-only products')
})

test('MarketplaceView handles non-customizable products with authentic original textures', () => {
  assert.ok(fs.existsSync(MARKETPLACE_PATH), 'MarketplaceView.vue must exist')
  const content = fs.readFileSync(MARKETPLACE_PATH, 'utf8')

  // Imports and uses isPartCustomizable
  assert.match(content, /import\s*\{\s*[^}]*isPartCustomizable[^}]*\}\s*from\s*['"]\.\.\/customization\.js['"]/, 'Must import isPartCustomizable')
  assert.match(content, /orderIsPartCustomizable\s*=\s*computed\(\(\)\s*=>\s*isPartCustomizable\(orderProduct\.value\)\)/, 'Must declare orderIsPartCustomizable computed')

  // Gated applyColorToOrderViewer (no materials[0] fallback tinting)
  assert.match(content, /if\s*\(!isPartCustomizable\(orderProduct\.value\)\)\s*return/, 'applyColorToOrderViewer must guard against non-customizable products')
  assert.doesNotMatch(content, /applyColorToOrderViewer[\s\S]*\|\|\s*materials\[0\]/, 'Must NOT fall back to materials[0] when applying color')

  // Template displays original texture notice and hides part recoloring controls
  assert.match(content, /v-if="!orderIsPartCustomizable"/, 'Must render original texture notice when shoe is not part-customizable')
  assert.match(content, /ORIGINAL 3D TEXTURE/i, 'Must display ORIGINAL 3D TEXTURE badge')
  assert.match(content, /v-if="orderIsPartCustomizable"/, 'Must gate part selector and color palette on orderIsPartCustomizable')

  // Order submission payload sends empty customColors for charm-only shoes
  assert.match(content, /customColors:\s*orderIsPartCustomizable\.value\s*\?\s*\{\s*\.\.\.orderPartColors\.value\s*\}\s*:\s*\{\}/, 'Must submit empty customColors for non-customizable products')
})

test('Backend endpoints enforce null colors and empty orders for AI shoes', () => {
  // create.php
  assert.ok(fs.existsSync(CREATE_API_PATH), 'create.php must exist')
  const createSql = fs.readFileSync(CREATE_API_PATH, 'utf8')
  assert.match(createSql, /\$creationMethod\s*===\s*'ai_generate'[\s\S]*\$meshMap\s*=\s*null;[\s\S]*\$partColors\s*=\s*null;/, 'create.php must force null mesh_map and part_colors for AI shoes')

  // update.php
  assert.ok(fs.existsSync(UPDATE_API_PATH), 'update.php must exist')
  const updateSql = fs.readFileSync(UPDATE_API_PATH, 'utf8')
  assert.match(updateSql, /\$creationMethod\s*===\s*'ai_generate'[\s\S]*\$meshMap\s*=\s*null;[\s\S]*\$partColors\s*=\s*null;/, 'update.php must force null mesh_map and part_colors for AI shoes')

  // orders/create.php
  assert.ok(fs.existsSync(ORDER_CREATE_API_PATH), 'orders/create.php must exist')
  const orderSql = fs.readFileSync(ORDER_CREATE_API_PATH, 'utf8')
  assert.match(orderSql, /!\$isPartCustomizable[\s\S]*\$customColors\s*=\s*json_encode\(\[\]\);/, 'orders/create.php must store empty custom_colors for non-customizable products')
})
