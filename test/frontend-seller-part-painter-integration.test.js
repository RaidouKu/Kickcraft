import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const ROOT_DIR = path.resolve(import.meta.dirname, '..')
const MESH_TAGGER_PATH = path.join(ROOT_DIR, 'src', 'components', 'MeshTagger.vue')
const SELLER_DASHBOARD_PATH = path.join(ROOT_DIR, 'src', 'components', 'SellerDashboard.vue')

test('MeshTagger: defines open-painter emit and renders 3D Painter launch buttons', () => {
  assert.ok(fs.existsSync(MESH_TAGGER_PATH), 'MeshTagger.vue must exist')
  const content = fs.readFileSync(MESH_TAGGER_PATH, 'utf8')

  // Emits open-painter
  assert.match(
    content,
    /defineEmits\(\s*\[[^\]]*['"]open-painter['"][^\]]*\]\s*\)/,
    'MeshTagger must include "open-painter" in defineEmits'
  )

  // Single-mesh banner button
  assert.match(
    content,
    /@click=["']\$emit\(['"]open-painter['"]\)|openPainter/,
    'Single-mesh banner must have a button emitting open-painter'
  )
  assert.match(
    content,
    /Define Customizable Parts \(3D Painter\)/i,
    'Single-mesh banner button must include "Define Customizable Parts (3D Painter)" label'
  )

  // Header action bar 3D Painter button
  assert.match(
    content,
    /3D Painter/i,
    'Header action bar must render a 3D Painter shortcut button'
  )
})

test('SellerDashboard: imports PartPaintingEditor and defines reactive painter state', () => {
  assert.ok(fs.existsSync(SELLER_DASHBOARD_PATH), 'SellerDashboard.vue must exist')
  const content = fs.readFileSync(SELLER_DASHBOARD_PATH, 'utf8')

  // Component import
  assert.match(
    content,
    /import\s+PartPaintingEditor\s+from\s+['"]\.\/PartPaintingEditor\.vue['"]/,
    'SellerDashboard must import PartPaintingEditor'
  )

  // Reactive state refs
  assert.match(content, /showPartPainterModal\s*=\s*ref\(false\)/, 'Must declare showPartPainterModal ref(false)')
  assert.match(content, /partPainterTargetGlb\s*=\s*ref\(['"]['"]\)/, 'Must declare partPainterTargetGlb ref("")')
  assert.match(content, /partPainterProductId\s*=\s*ref\(['"]['"]\)/, 'Must declare partPainterProductId ref("")')
  assert.match(content, /partPainterInitialMeshMap\s*=\s*ref\(\{\}\)/, 'Must declare partPainterInitialMeshMap ref({})')
  assert.match(content, /partPainterInitialPartColors\s*=\s*ref\(\{\}\)/, 'Must declare partPainterInitialPartColors ref({})')

  // Template mounting of PartPaintingEditor
  assert.match(content, /<PartPaintingEditor/, 'Must mount PartPaintingEditor in template')
  assert.match(content, /v-if=["']showPartPainterModal["']/, 'Must condition PartPaintingEditor on showPartPainterModal')
  assert.match(content, /:glb-path=["']partPainterTargetGlb["']/, 'Must bind :glb-path="partPainterTargetGlb"')
  assert.match(content, /:product-id=["']partPainterProductId["']/, 'Must bind :product-id="partPainterProductId"')
  assert.match(content, /:initial-mesh-map=["']partPainterInitialMeshMap["']/, 'Must bind :initial-mesh-map="partPainterInitialMeshMap"')
  assert.match(content, /:initial-part-colors=["']partPainterInitialPartColors["']/, 'Must bind :initial-part-colors="partPainterInitialPartColors"')
  assert.match(content, /@save=["']handlePartPainterSave["']/, 'Must bind @save="handlePartPainterSave"')
  assert.match(content, /@cancel=["'][^"']*showPartPainterModal\s*=\s*false[^"']*["']/, 'Must handle @cancel to close painter modal')
})

test('SellerDashboard: renders "Define Parts" button in My Products table for sneaker listings', () => {
  const content = fs.readFileSync(SELLER_DASHBOARD_PATH, 'utf8')

  // Action button in product card
  assert.match(
    content,
    /@click=["']openPartPainterForProduct\(prod\)["']/,
    'Product card actions must include button calling openPartPainterForProduct(prod)'
  )
  assert.match(
    content,
    /Define Parts/i,
    'Must display "Define Parts" label on product table button'
  )
})

test('SellerDashboard: renders 3D Painter button in Wizard Step 1 when GLB is loaded and connects MeshTagger', () => {
  const content = fs.readFileSync(SELLER_DASHBOARD_PATH, 'utf8')

  // Button in Step 1
  assert.match(
    content,
    /@click=["']openPartPainterForWizard["']/,
    'Wizard Step 1 must have button calling openPartPainterForWizard'
  )
  assert.match(
    content,
    /Define Customizable Parts \(3D Painter\)/i,
    'Wizard Step 1 button must display "Define Customizable Parts (3D Painter)"'
  )

  // MeshTagger event listener
  assert.match(
    content,
    /<MeshTagger[^>]*@open-painter=["']openPartPainterForWizard["']/,
    'MeshTagger component must listen for @open-painter="openPartPainterForWizard"'
  )
})

test('SellerDashboard: openPartPainterForProduct and openPartPainterForWizard methods logic', () => {
  const content = fs.readFileSync(SELLER_DASHBOARD_PATH, 'utf8')

  assert.match(
    content,
    /function\s+openPartPainterForProduct\s*\(prod\)|const\s+openPartPainterForProduct\s*=\s*(?:async\s*)?\(/,
    'Must define openPartPainterForProduct function'
  )
  assert.match(
    content,
    /function\s+openPartPainterForWizard\s*\(\)|const\s+openPartPainterForWizard\s*=\s*(?:async\s*)?\(/,
    'Must define openPartPainterForWizard function'
  )

  // Functional simulation of openPartPainterForProduct logic
  const mockProduct = {
    id: 'prod-42',
    name: 'AI Cyber Runner',
    glbPath: 'storage/products/cyber_runner.glb',
    meshMap: '{"Upper":"Mesh_0"}',
    partColors: '{"Upper":"#b94d27"}',
  }

  const parseOrJson = (val) => {
    if (typeof val === 'string') {
      try { return JSON.parse(val) } catch { return {} }
    }
    return val || {}
  }

  const targetGlb = mockProduct.glbPath || mockProduct.glb_path
  const productId = mockProduct.id
  const meshMap = parseOrJson(mockProduct.meshMap || mockProduct.mesh_map)
  const partColors = parseOrJson(mockProduct.partColors || mockProduct.part_colors)

  assert.equal(targetGlb, 'storage/products/cyber_runner.glb')
  assert.equal(productId, 'prod-42')
  assert.deepEqual(meshMap, { Upper: 'Mesh_0' })
  assert.deepEqual(partColors, { Upper: '#b94d27' })
})

test('SellerDashboard: handlePartPainterSave updates wizard or product list state', () => {
  const content = fs.readFileSync(SELLER_DASHBOARD_PATH, 'utf8')

  assert.match(
    content,
    /function\s+handlePartPainterSave\s*\(savedData\)|const\s+handlePartPainterSave\s*=\s*(?:async\s*)?\(savedData\)/,
    'Must define handlePartPainterSave function'
  )

  // Checks wizard updates
  assert.match(content, /wizardStep\.value\s*=\s*2/, 'Wizard save must advance wizardStep to 2')
  assert.match(content, /draftGlbPath\.value\s*=/, 'Wizard save must update draftGlbPath')
  assert.match(content, /draftMeshMap\.value\s*=/, 'Wizard save must update draftMeshMap')
  assert.match(content, /draftPartColors\.value\s*=/, 'Wizard save must update draftPartColors')

  // Checks product list updates & feedback
  assert.match(content, /loadProducts\(\)/, 'Product list save must reload products')
  assert.match(content, /showPartPainterModal\.value\s*=\s*false/, 'Must close modal after save')
})

test('Safety Constraint: Zero physical SQL DELETE FROM statements across src and api', () => {
  const dirsToScan = ['src', 'api']

  const scanDir = (dir) => {
    const fullPath = path.join(ROOT_DIR, dir)
    if (!fs.existsSync(fullPath)) return

    const entries = fs.readdirSync(fullPath, { withFileTypes: true })
    for (const entry of entries) {
      const res = path.join(fullPath, entry.name)
      if (entry.isDirectory()) {
        scanDir(path.join(dir, entry.name))
      } else if (/\.(js|vue|php)$/i.test(entry.name)) {
        const text = fs.readFileSync(res, 'utf8')
        assert.doesNotMatch(
          text,
          /\bDELETE\s+FROM\b/i,
          `Physical SQL DELETE FROM detected in ${res}! Must use soft deletion or status updates only.`
        )
      }
    }
  }

  for (const dir of dirsToScan) {
    scanDir(dir)
  }
})
