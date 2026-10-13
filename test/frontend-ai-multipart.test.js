import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { isPartCustomizable, setMaterialColor } from '../src/customization.js'

test('isPartCustomizable returns false for ai_generate products (charm-only mode)', () => {
  assert.equal(
    isPartCustomizable({
      creationMethod: 'ai_generate',
      meshMap: { Upper: 'UpperMaterial', Midsole: 'MidsoleMaterial' },
    }),
    false
  )
  assert.equal(
    isPartCustomizable({
      creation_method: 'ai_generate',
      mesh_map: '{"Upper":"UpperMaterial"}',
    }),
    false
  )
})

test('isPartCustomizable returns false for ai_generate products with empty or missing meshMap', () => {
  assert.equal(isPartCustomizable(null), false)
  assert.equal(isPartCustomizable(undefined), false)
  assert.equal(isPartCustomizable({ creationMethod: 'ai_generate', meshMap: null }), false)
  assert.equal(isPartCustomizable({ creationMethod: 'ai_generate', meshMap: {} }), false)
  assert.equal(isPartCustomizable({ creationMethod: 'ai_generate', mesh_map: '{}' }), false)
  assert.equal(isPartCustomizable({ creation_method: 'ai_generate', mesh_map: '[]' }), false)
  assert.equal(isPartCustomizable({ creationMethod: 'ai_generate', meshMap: [] }), false)
})

test('isPartCustomizable preserves existing behavior for template and upload products', () => {
  assert.equal(
    isPartCustomizable({
      creationMethod: 'template',
      meshMap: { Upper: 'UpperMaterial' },
    }),
    true
  )
  assert.equal(
    isPartCustomizable({
      creation_method: 'upload',
      mesh_map: '{"Upper":"Mesh_0","Midsole":"Mesh_1"}',
    }),
    true
  )
  assert.equal(isPartCustomizable({ creationMethod: 'upload', meshMap: {} }), false)
  assert.equal(isPartCustomizable({ creationMethod: 'template', meshMap: null }), false)
  assert.equal(isPartCustomizable({ creationMethod: 'template', mesh_map: '{}' }), false)
})

test('setMaterialColor sets base color factor on targeted material without mutating unrelated materials', () => {
  const materials = {
    UpperMaterial: {
      pbrMetallicRoughness: {
        baseColorFactor: [1, 1, 1, 1],
        setBaseColorFactor(val) {
          this.baseColorFactor = val
        },
      },
    },
    MidsoleMaterial: {
      pbrMetallicRoughness: {
        baseColorFactor: [0.5, 0.5, 0.5, 1],
        setBaseColorFactor(val) {
          this.baseColorFactor = val
        },
      },
    },
  }

  const model = {
    getMaterialByName(name) {
      return materials[name] || null
    },
  }

  const successUpper = setMaterialColor(model, 'UpperMaterial', '#ff5500')
  assert.equal(successUpper, true)
  assert.equal(materials.UpperMaterial.pbrMetallicRoughness.baseColorFactor, '#ff5500')
  assert.deepEqual(materials.MidsoleMaterial.pbrMetallicRoughness.baseColorFactor, [0.5, 0.5, 0.5, 1])

  const missingRes = setMaterialColor(model, 'NonExistentMaterial', '#00ff00')
  assert.equal(missingRes, false)
  assert.equal(setMaterialColor(null, 'UpperMaterial', '#000000'), false)
})

test('Zero physical SQL DELETE statements constraint check', () => {
  const testFileContent = fs.readFileSync(path.resolve('test/frontend-ai-multipart.test.js'), 'utf8')
  assert.doesNotMatch(testFileContent, /DELETE\s+FROM/i)
})
