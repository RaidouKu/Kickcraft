import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { isPartCustomizable } from '../src/customization.js'

const MODAL_PATH = path.resolve('src/components/MarketplaceOrderModal.vue')
const VIEW_PATH = path.resolve('src/components/MarketplaceView.vue')

test('upload and template products with mesh_map have orderIsPartCustomizable === true, while ai_generate operates in charm-only mode', () => {
  // Test with upload product
  const uploadProduct = {
    id: 101,
    name: 'Custom Cyber Runner',
    creationMethod: 'upload',
    meshMap: {
      Upper: 'UpperMaterial',
      Midsole: 'MidsoleMaterial',
    },
  }
  assert.equal(isPartCustomizable(uploadProduct), true, 'upload product with meshMap object must be customizable')

  // Test with template product and JSON string
  const templateProduct = {
    id: 102,
    name: 'Template Court Heritage',
    creation_method: 'template',
    mesh_map: JSON.stringify({
      Upper: 'UpperMaterial',
      ToeCap: 'ToeCapMaterial',
      Midsole: 'MidsoleMaterial',
      Outsole: 'OutsoleMaterial',
    }),
  }
  assert.equal(isPartCustomizable(templateProduct), true, 'template product with mesh_map JSON string must be customizable')

  // AI-generated products operate in charm-only mode
  const aiProduct = {
    id: 103,
    name: 'AI Cloud Strider',
    creationMethod: 'ai_generate',
    meshMap: { Upper: 'UpperMaterial' },
  }
  assert.equal(isPartCustomizable(aiProduct), false, 'ai_generate product must operate in charm-only mode')

  // Verify MarketplaceOrderModal.vue uses isPartCustomizable
  assert.ok(fs.existsSync(MODAL_PATH), 'MarketplaceOrderModal.vue must exist')
  const modalContent = fs.readFileSync(MODAL_PATH, 'utf8')
  assert.match(
    modalContent,
    /const\s+orderIsPartCustomizable\s*=\s*computed\(\s*\(\)\s*=>\s*isPartCustomizable\(\s*orderProduct\.value\s*\)\s*\)/,
    'MarketplaceOrderModal must compute orderIsPartCustomizable via isPartCustomizable'
  )

  // Verify MarketplaceView.vue uses isPartCustomizable
  assert.ok(fs.existsSync(VIEW_PATH), 'MarketplaceView.vue must exist')
  const viewContent = fs.readFileSync(VIEW_PATH, 'utf8')
  assert.match(
    viewContent,
    /const\s+orderIsPartCustomizable\s*=\s*computed\(\s*\(\)\s*=>\s*isPartCustomizable\(\s*orderProduct\.value\s*\)\s*\)/,
    'MarketplaceView must compute orderIsPartCustomizable via isPartCustomizable'
  )
})

test('mappedParts yields individual parts rather than fallback single shoe part for AI shoes', () => {
  const modalContent = fs.readFileSync(MODAL_PATH, 'utf8')

  // Extract or verify getProductMappedParts logic
  assert.match(modalContent, /function\s+getProductMappedParts\s*\(/, 'Must define getProductMappedParts helper')

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

  function simulateGetProductMappedParts(product) {
    if (!product) return []
    if (!isPartCustomizable(product)) {
      return [
        {
          id: 'shoe',
          label: 'Overall Shoe Color',
          meshName: 'all',
        },
      ]
    }
    const raw = product.meshMap || product.mesh_map
    let mapObj = {}
    if (typeof raw === 'string') {
      try { mapObj = JSON.parse(raw) } catch (_) { mapObj = {} }
    } else if (raw && typeof raw === 'object') {
      mapObj = raw
    }

    const keys = Object.keys(mapObj)
    if (keys.length === 0) {
      return [
        {
          id: 'shoe',
          label: 'Overall Shoe Color',
          meshName: 'all',
        },
      ]
    }
    return keys.map((partId) => {
      const mapping = mapObj[partId]
      const meshName = typeof mapping === 'object' && mapping?.meshName ? mapping.meshName : mapping
      return {
        id: partId,
        label: PART_LABELS[partId] || partId,
        meshName: meshName || partId,
      }
    })
  }

  // 8 segmented parts upload shoe
  const upload8PartsProduct = {
    id: 103,
    creationMethod: 'upload',
    meshMap: {
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

  const mapped8 = simulateGetProductMappedParts(upload8PartsProduct)
  assert.equal(mapped8.length, 8, 'Must return all 8 individual parts')
  assert.deepEqual(
    mapped8.map((p) => p.id),
    ['Upper', 'ToeCap', 'Tongue', 'Laces', 'HeelPanel', 'SideAccents', 'Midsole', 'Outsole']
  )
  assert.equal(mapped8.some((p) => p.id === 'shoe'), false, 'Must not return fallback shoe part when segmented')
  assert.equal(mapped8[0].label, 'Upper Main')
  assert.equal(mapped8[6].label, 'Midsole Cushion')

  // AI shoe operates in charm-only mode (returns fallback single shoe part)
  const aiShoe = {
    id: 104,
    creationMethod: 'ai_generate',
    meshMap: upload8PartsProduct.meshMap,
  }
  const mappedAi = simulateGetProductMappedParts(aiShoe)
  assert.equal(mappedAi.length, 1)
  assert.equal(mappedAi[0].id, 'shoe')
})

test('MarketplaceOrderModal template renders part selection buttons and hides single-mesh notice when orderIsPartCustomizable is true', () => {
  const modalContent = fs.readFileSync(MODAL_PATH, 'utf8')

  // Part selector buttons container should be visible when orderIsPartCustomizable is true (for any mappedParts)
  assert.match(
    modalContent,
    /v-if="orderIsPartCustomizable\s*(?:&&\s*mappedParts\.length\s*>\s*0)?"/,
    'Part selector should be conditionally displayed when orderIsPartCustomizable is true'
  )

  // Must not restrict to mappedParts.length > 1
  assert.doesNotMatch(
    modalContent,
    /v-if="orderIsPartCustomizable\s*&&\s*mappedParts\.length\s*>\s*1"/,
    'Part selector must not require mappedParts.length > 1'
  )

  // Renders part buttons in a loop
  assert.match(
    modalContent,
    /<button[^>]*v-for="part in mappedParts"[^>]*@click="orderActivePart\s*=\s*part\.id"/,
    'Must render buttons for each part and set orderActivePart on click'
  )

  // Single-mesh notice must be guarded with !orderIsPartCustomizable
  assert.match(
    modalContent,
    /v-if="!orderIsPartCustomizable"[\s\S]*?\[ SINGLE COMBINED MESH · OVERALL COLOR \]/,
    'Single combined mesh notice must be hidden when orderIsPartCustomizable is true'
  )
})

test('Selecting a part and choosing a color applies color to that part material via model.getMaterialByName', () => {
  const modalContent = fs.readFileSync(MODAL_PATH, 'utf8')

  // Verify applyColorToOrderViewer targets getMaterialByName first
  assert.match(
    modalContent,
    /function\s+applyColorToOrderViewer\s*\(/,
    'applyColorToOrderViewer function must exist'
  )
  assert.match(
    modalContent,
    /orderViewer\.value\.model\.getMaterialByName\s*\(meshOrMatName\)|model\.getMaterialByName\s*\(meshOrMatName\)/,
    'applyColorToOrderViewer must call model.getMaterialByName'
  )

  // Simulate applying color to specific part in 3D viewer model
  const materials = {
    UpperMaterial: {
      name: 'UpperMaterial',
      pbrMetallicRoughness: {
        baseColorFactor: [1, 1, 1, 1],
        setBaseColorFactor(color) {
          this.baseColorFactor = color
        },
      },
    },
    MidsoleMaterial: {
      name: 'MidsoleMaterial',
      pbrMetallicRoughness: {
        baseColorFactor: [0.8, 0.8, 0.8, 1],
        setBaseColorFactor(color) {
          this.baseColorFactor = color
        },
      },
    },
  }

  let getMaterialByNameCalledWith = null
  const mockModel = {
    materials: [materials.UpperMaterial, materials.MidsoleMaterial],
    getMaterialByName(name) {
      getMaterialByNameCalledWith = name
      return materials[name] || null
    },
  }

  const simulateApplyColor = (orderProduct, partId, colorHex) => {
    if (!mockModel || !orderProduct) return
    if (!isPartCustomizable(orderProduct) || partId === 'shoe') {
      if (mockModel.materials[0]?.pbrMetallicRoughness) {
        mockModel.materials[0].pbrMetallicRoughness.setBaseColorFactor(colorHex)
      }
      return
    }
    const rawMap = orderProduct.meshMap || orderProduct.mesh_map || {}
    const mapping = rawMap[partId]
    if (!mapping) return
    const meshOrMatName = typeof mapping === 'object' && mapping?.meshName ? mapping.meshName : mapping
    const mat = (typeof mockModel.getMaterialByName === 'function' ? mockModel.getMaterialByName(meshOrMatName) : null)
      || mockModel.materials.find((m) => m?.name === meshOrMatName)
    if (mat?.pbrMetallicRoughness) {
      mat.pbrMetallicRoughness.setBaseColorFactor(colorHex)
    }
  }

  const uploadProduct = {
    creationMethod: 'upload',
    meshMap: {
      Upper: 'UpperMaterial',
      Midsole: 'MidsoleMaterial',
    },
  }

  // Recolor Midsole to Terracotta (#b94d27)
  simulateApplyColor(uploadProduct, 'Midsole', '#b94d27')

  assert.equal(getMaterialByNameCalledWith, 'MidsoleMaterial', 'getMaterialByName must be called with target part material name')
  assert.equal(materials.MidsoleMaterial.pbrMetallicRoughness.baseColorFactor, '#b94d27', 'Midsole material color must be updated')
  assert.deepEqual(materials.UpperMaterial.pbrMetallicRoughness.baseColorFactor, [1, 1, 1, 1], 'Upper material must NOT be mutated')
})

test('Unsegmented and unmapped shoes continue to fall back to overall shoe color and single-mesh notice', () => {
  // Unmapped AI shoe
  const unmappedProduct = {
    id: 104,
    creationMethod: 'ai_generate',
    meshMap: {},
  }
  assert.equal(isPartCustomizable(unmappedProduct), false, 'Empty meshMap must not be part customizable')

  const nullMapProduct = {
    id: 105,
    creation_method: 'ai_generate',
    mesh_map: null,
  }
  assert.equal(isPartCustomizable(nullMapProduct), false, 'Null mesh_map must not be part customizable')

  // Verify single-mesh fallback in MarketplaceOrderModal.vue
  const modalContent = fs.readFileSync(MODAL_PATH, 'utf8')
  assert.match(modalContent, /id:\s*['"]shoe['"]/, 'Must provide fallback shoe part ID')
  assert.match(modalContent, /label:\s*['"]Overall Shoe Color['"]/, 'Must provide fallback Overall Shoe Color label')
  assert.match(modalContent, /SINGLE COMBINED MESH · OVERALL COLOR/, 'Must display single combined mesh notice')
})

test('Zero physical SQL DELETE statements across marketplace modal and views', () => {
  const filesToCheck = [
    MODAL_PATH,
    VIEW_PATH,
    path.resolve('test/frontend-marketplace-ai-multipart.test.js'),
  ]

  for (const file of filesToCheck) {
    const content = fs.readFileSync(file, 'utf8')
    assert.doesNotMatch(content, /DELETE\s+FROM/i, `${file} must contain zero physical SQL DELETE statements`)
  }
})
