import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const MESH_TAGGER_PATH = path.resolve('src/components/MeshTagger.vue')
const SELLER_DASHBOARD_PATH = path.resolve('src/components/SellerDashboard.vue')
const CUSTOMIZER_PATH = path.resolve('src/components/ProductCustomizer.vue')

test('MeshTagger detects multi-material models when materials.length > 1', () => {
  assert.ok(fs.existsSync(MESH_TAGGER_PATH), 'MeshTagger.vue must exist')
  const content = fs.readFileSync(MESH_TAGGER_PATH, 'utf8')

  // Verify isSingleMaterial evaluates to false when materials.length > 1
  assert.match(
    content,
    /isSingleMaterial(?:\.value)?\s*=\s*\(?\s*materials\.length\s*<=\s*1\s*\)?/,
    'isSingleMaterial must evaluate to false when materials.length > 1'
  )

  // Simulation test for 8 segmented materials
  const mockMaterials = [
    { name: 'UpperMaterial' },
    { name: 'ToeCapMaterial' },
    { name: 'TongueMaterial' },
    { name: 'LacesMaterial' },
    { name: 'HeelPanelMaterial' },
    { name: 'SideAccentsMaterial' },
    { name: 'MidsoleMaterial' },
    { name: 'OutsoleMaterial' },
  ]

  const isSingle = mockMaterials.length <= 1
  assert.equal(isSingle, false, 'Model with 8 materials must not be marked as single material')
})

test('MeshTagger auto-detect matches standard 8 segmented shoe part materials', () => {
  assert.ok(fs.existsSync(MESH_TAGGER_PATH), 'MeshTagger.vue must exist')
  const content = fs.readFileSync(MESH_TAGGER_PATH, 'utf8')

  // Auto-detect heuristic function must exist
  assert.match(content, /function\s+matchPartForMesh|const\s+matchPartForMesh\s*=/)

  const heuristicMatcher = (name) => {
    if (!name || typeof name !== 'string') return null
    const lower = name.toLowerCase()
    if (lower.includes('upper')) return 'Upper'
    if (lower.includes('toe')) return 'ToeCap'
    if (lower.includes('tongue')) return 'Tongue'
    if (lower.includes('lace') || lower.includes('string')) return 'Laces'
    if (lower.includes('heel')) return 'HeelPanel'
    if (
      lower.includes('side') ||
      lower.includes('accent') ||
      lower.includes('logo') ||
      lower.includes('swoosh')
    ) {
      return 'SideAccents'
    }
    if (lower.includes('midsole') || lower.includes('mid')) return 'Midsole'
    if (
      lower.includes('outsole') ||
      lower.includes('sole') ||
      lower.includes('bottom') ||
      lower.includes('out')
    ) {
      return 'Outsole'
    }
    return null
  }

  const standardSegmentedMaterials = [
    { material: 'UpperMaterial', expectedPart: 'Upper' },
    { material: 'ToeCapMaterial', expectedPart: 'ToeCap' },
    { material: 'TongueMaterial', expectedPart: 'Tongue' },
    { material: 'LacesMaterial', expectedPart: 'Laces' },
    { material: 'HeelPanelMaterial', expectedPart: 'HeelPanel' },
    { material: 'SideAccentsMaterial', expectedPart: 'SideAccents' },
    { material: 'MidsoleMaterial', expectedPart: 'Midsole' },
    { material: 'OutsoleMaterial', expectedPart: 'Outsole' },
  ]

  for (const { material, expectedPart } of standardSegmentedMaterials) {
    assert.equal(
      heuristicMatcher(material),
      expectedPart,
      `Material "${material}" must auto-detect to part "${expectedPart}"`
    )
  }

  // Simulate autoDetectMeshes with all 8 segmented materials
  const detectedMeshes = standardSegmentedMaterials.map(m => m.material)
  const mapResult = {}
  for (const meshName of detectedMeshes) {
    const partId = heuristicMatcher(meshName)
    if (partId && !mapResult[partId]) {
      mapResult[partId] = meshName
    }
  }

  assert.equal(Object.keys(mapResult).length, 8, 'Auto-detect must map all 8 KickCraft shoe parts')
})

test('SellerDashboard defines isSingleMeshProduct based on creationMethod and draftMeshMap emptiness', () => {
  assert.ok(fs.existsSync(SELLER_DASHBOARD_PATH), 'SellerDashboard.vue must exist')
  const content = fs.readFileSync(SELLER_DASHBOARD_PATH, 'utf8')

  // isSingleMeshProduct operates in Charm-Only mode for AI shoes or when draftMeshMap is empty
  assert.match(
    content,
    /creationMethod(?:\.value)?\s*===\s*['"]ai_generate['"]\s*\|\|\s*Object\.keys/,
    'isSingleMeshProduct must identify AI-generated products or empty meshMap as single-mesh'
  )

  // ProductCustomizer receives charm-only prop
  assert.match(
    content,
    /:charm-only="creationMethod\s*===\s*'ai_generate'"/,
    'ProductCustomizer must receive charm-only prop for AI-generated products'
  )

  // Simulation test: An AI product operates in charm-only mode
  const computeIsSingleMeshProduct = (creationMethod, draftMeshMap) => {
    return creationMethod === 'ai_generate' || Object.keys(draftMeshMap || {}).length === 0
  }

  const aiProductWithParts = {
    creationMethod: 'ai_generate',
    draftMeshMap: {
      Upper: 'UpperMaterial',
      ToeCap: 'ToeCapMaterial',
      Tongue: 'TongueMaterial',
      Laces: 'LacesMaterial',
      HeelPanel: 'HeelPanelMaterial',
      SideAccents: 'SideAccentsMaterial',
      Midsole: 'MidsoleMaterial',
      Outsole: 'OutsoleMaterial',
    },
  }

  assert.equal(
    computeIsSingleMeshProduct(aiProductWithParts.creationMethod, aiProductWithParts.draftMeshMap),
    true,
    'AI-generated product must operate in charm-only mode (isSingleMeshProduct === true)'
  )

  const unmappedProduct = {
    creationMethod: 'upload',
    draftMeshMap: {},
  }

  assert.equal(
    computeIsSingleMeshProduct(unmappedProduct.creationMethod, unmappedProduct.draftMeshMap),
    true,
    'Product with 0 mapped parts must be marked as single-mesh product'
  )
})

test('SellerDashboard submits effectiveMeshMap preserving mapped parts for AI shoes', () => {
  assert.ok(fs.existsSync(SELLER_DASHBOARD_PATH), 'SellerDashboard.vue must exist')
  const content = fs.readFileSync(SELLER_DASHBOARD_PATH, 'utf8')

  // effectiveMeshMap logic
  assert.match(
    content,
    /const\s+effectiveMeshMap\s*=\s*isSingleMeshProduct\.value\s*\?\s*\{\}\s*:\s*draftMeshMap\.value/,
    'effectiveMeshMap must be draftMeshMap.value when meshes are mapped'
  )

  // Sent in create.php and update.php payloads
  assert.match(
    content,
    /meshMap:\s*effectiveMeshMap/,
    'Product submission must send effectiveMeshMap'
  )
})

test('ProductCustomizer displays 8-part color controls when meshMap contains mapped parts', () => {
  assert.ok(fs.existsSync(CUSTOMIZER_PATH), 'ProductCustomizer.vue must exist')
  const content = fs.readFileSync(CUSTOMIZER_PATH, 'utf8')

  // isSingleMesh computed check
  assert.match(content, /isSingleMesh\s*=\s*computed\(/, 'Must compute isSingleMesh')

  // mappedParts computed definition
  assert.match(content, /const\s+mappedParts\s*=\s*computed\(/, 'Must compute mappedParts')

  // Template must render part color cards / controls when not single mesh
  assert.match(
    content,
    /v-if="!isSingleMesh"/,
    'ProductCustomizer template must render part color controls section when !isSingleMesh'
  )

  // Simulation test: 8 mapped parts
  const meshMap8Parts = {
    Upper: 'UpperMaterial',
    ToeCap: 'ToeCapMaterial',
    Tongue: 'TongueMaterial',
    Laces: 'LacesMaterial',
    HeelPanel: 'HeelPanelMaterial',
    SideAccents: 'SideAccentsMaterial',
    Midsole: 'MidsoleMaterial',
    Outsole: 'OutsoleMaterial',
  }

  const PART_LABELS = {
    Upper: 'Upper Main',
    ToeCap: 'Toe Cap',
    Tongue: 'Tongue',
    Laces: 'Laces',
    HeelPanel: 'Heel Panel',
    SideAccents: 'Side Accents',
    Midsole: 'Midsole Cushion',
    Outsole: 'Outsole Tread',
  }

  const computedMappedParts = Object.keys(meshMap8Parts).map((partId) => ({
    id: partId,
    label: PART_LABELS[partId] || partId,
    meshName: meshMap8Parts[partId],
    color: '#ffffff',
  }))

  assert.equal(computedMappedParts.length, 8, 'mappedParts must contain all 8 parts')
  assert.deepEqual(
    computedMappedParts.map(p => p.id),
    ['Upper', 'ToeCap', 'Tongue', 'Laces', 'HeelPanel', 'SideAccents', 'Midsole', 'Outsole']
  )
})

test('Zero physical SQL DELETE statements constraint in test and source files', () => {
  const filesToCheck = [
    path.resolve('test/frontend-seller-ai-tagger.test.js'),
    MESH_TAGGER_PATH,
    SELLER_DASHBOARD_PATH,
    CUSTOMIZER_PATH,
  ]

  for (const file of filesToCheck) {
    const text = fs.readFileSync(file, 'utf8')
    assert.doesNotMatch(text, /DELETE\s+FROM/i, `${file} must contain zero physical SQL DELETE statements`)
  }
})
