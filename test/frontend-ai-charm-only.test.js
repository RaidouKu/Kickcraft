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
  // AI-generated shoes are not part-customizable (meshes cannot be divided into separate parts)
  assert.equal(isPartCustomizable({ creationMethod: 'ai_generate', meshMap: { Upper: 'Mesh_0' } }), false)
  assert.equal(isPartCustomizable({ creation_method: 'ai_generate', mesh_map: '{"Upper":"Mesh_0"}' }), false)

  // Null, undefined, or empty mesh maps are not multi-part customizable
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

test('ProductCustomizer allows overall color customization for single-mesh shoes', () => {
  assert.ok(fs.existsSync(CUSTOMIZER_PATH), 'ProductCustomizer.vue must exist')
  const content = fs.readFileSync(CUSTOMIZER_PATH, 'utf8')

  // isSingleMesh computed check
  assert.match(content, /isSingleMesh\s*=\s*computed\(/, 'Must compute isSingleMesh')

  // mappedParts provides single overall shoe part when meshMap is empty
  assert.match(content, /id:\s*['"]shoe['"]/, 'mappedParts must provide shoe part for single mesh')
  assert.match(content, /label:\s*['"]Overall Shoe Color['"]/, 'mappedParts must label Overall Shoe Color')

  // applyColorToViewer applies to materials[0] for single-mesh models
  assert.match(content, /isSingleMesh\.value\s*\|\|\s*partId\s*===\s*['"]shoe['"]/, 'applyColorToViewer must apply to materials[0] for single mesh')

  // Template displays single-mesh notice explaining meshes are not editable into parts
  assert.match(content, /SINGLE COMBINED MESH · OVERALL COLOR/i, 'Must display single combined mesh notice')
})

test('MeshTagger detects single combined meshes and indicates meshes are not editable', () => {
  assert.ok(fs.existsSync(MESH_TAGGER_PATH), 'MeshTagger.vue must exist')
  const content = fs.readFileSync(MESH_TAGGER_PATH, 'utf8')

  assert.match(content, /isSingleMaterial\s*=\s*ref\(false\)/, 'Must declare isSingleMaterial state')
  assert.match(content, /isSingleMaterial\.value\s*=\s*\(materials\.length\s*<=\s*1\)/, 'Must detect single material on model load')
  assert.match(content, /SINGLE COMBINED MESH · MESHES NOT EDITABLE/i, 'Must display single combined mesh banner')
})

test('SellerDashboard locks meshes during edit and preserves color customization', () => {
  assert.ok(fs.existsSync(SELLER_DASHBOARD_PATH), 'SellerDashboard.vue must exist')
  const content = fs.readFileSync(SELLER_DASHBOARD_PATH, 'utf8')

  // isSingleMeshProduct computed
  assert.match(content, /const\s+isSingleMeshProduct\s*=\s*computed\(/, 'Must declare isSingleMeshProduct computed')

  // Locks Step 1 during product edit
  assert.match(content, /isEditingProduct\s*\?\s*['"]2\.\s*Meshes\s*\(Locked\)['"]/, 'Must lock meshes during edit')

  // Allows color customization shortcut in Step 3
  assert.match(content, /Customize Colors &amp; Charm/, 'Must provide button to customize colors and charm in 3D')

  // Submit payload sends empty meshMap (meshes not editable) but preserves partColors
  assert.match(content, /const\s+effectiveMeshMap\s*=\s*isSingleMeshProduct\.value\s*\?\s*\{\}/, 'Must submit empty meshMap for single mesh products')
  assert.match(content, /const\s+effectivePartColors\s*=\s*draftPartColors\.value/, 'Must submit partColors for color customization')
})

test('MarketplaceView allows overall color customization for single-mesh shoes', () => {
  assert.ok(fs.existsSync(MARKETPLACE_PATH), 'MarketplaceView.vue must exist')
  const content = fs.readFileSync(MARKETPLACE_PATH, 'utf8')

  // Imports and uses isPartCustomizable
  assert.match(content, /import\s*\{\s*[^}]*isPartCustomizable[^}]*\}\s*from\s*['"]\.\.\/customization\.js['"]/, 'Must import isPartCustomizable')

  // getProductMappedParts returns overall shoe color for single-mesh products
  assert.match(content, /id:\s*['"]shoe['"]/, 'getProductMappedParts must return shoe part for single mesh')

  // applyColorToOrderViewer applies color to materials[0] for single-mesh products
  assert.match(content, /if\s*\(!isPartCustomizable\(orderProduct\.value\)\s*\|\|\s*partId\s*===\s*['"]shoe['"]\)/, 'applyColorToOrderViewer must tint single mesh')

  // Template displays single-mesh notice explaining meshes are not editable into parts
  assert.match(content, /SINGLE COMBINED MESH · OVERALL COLOR/i, 'Must display single combined mesh notice')

  // Order submission payload sends orderPartColors
  assert.match(content, /customColors:\s*\{\s*\.\.\.orderPartColors\.value\s*\}/, 'Must submit customColors from orderPartColors')
})

test('Backend endpoints enforce null meshMap while allowing partColors for AI shoes', () => {
  // create.php
  assert.ok(fs.existsSync(CREATE_API_PATH), 'create.php must exist')
  const createSql = fs.readFileSync(CREATE_API_PATH, 'utf8')
  assert.match(createSql, /\$creationMethod\s*===\s*'ai_generate'[\s\S]*\$meshMap\s*=\s*null;/, 'create.php must force null mesh_map for AI shoes')

  // update.php
  assert.ok(fs.existsSync(UPDATE_API_PATH), 'update.php must exist')
  const updateSql = fs.readFileSync(UPDATE_API_PATH, 'utf8')
  assert.match(updateSql, /\$creationMethod\s*===\s*'ai_generate'[\s\S]*\$meshMap\s*=\s*null;/, 'update.php must force null mesh_map for AI shoes')

  // orders/create.php
  assert.ok(fs.existsSync(ORDER_CREATE_API_PATH), 'orders/create.php must exist')
  const orderSql = fs.readFileSync(ORDER_CREATE_API_PATH, 'utf8')
  assert.match(orderSql, /\$rawCustomColors\s*=\s*\$body\['customColors'\]/, 'orders/create.php must accept customColors')
})
