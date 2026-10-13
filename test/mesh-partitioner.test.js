import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import * as THREE from 'three'

import {
  KICKCRAFT_PARTS,
  createNeutralDetailTexture,
  partitionMeshGeometry,
  partitionModelForExport,
  exportPaintedModelGlb,
} from '../src/utils/meshPartitioner.js'

const ROOT_DIR = path.resolve(import.meta.dirname, '..')
const PARTITIONER_FILE = path.join(ROOT_DIR, 'src', 'utils', 'meshPartitioner.js')
const TEST_FILE = path.join(ROOT_DIR, 'test', 'mesh-partitioner.test.js')

test('KICKCRAFT_PARTS defines all 8 canonical KickCraft parts with id, label, and material', () => {
  assert.equal(KICKCRAFT_PARTS.length, 8)
  const expected = [
    { id: 'Upper', label: 'Upper', material: 'UpperMaterial' },
    { id: 'ToeCap', label: 'Toe Cap', material: 'ToeCapMaterial' },
    { id: 'Tongue', label: 'Tongue', material: 'TongueMaterial' },
    { id: 'Laces', label: 'Laces', material: 'LacesMaterial' },
    { id: 'HeelPanel', label: 'Heel Panel', material: 'HeelPanelMaterial' },
    { id: 'SideAccents', label: 'Side Accents', material: 'SideAccentsMaterial' },
    { id: 'Midsole', label: 'Midsole', material: 'MidsoleMaterial' },
    { id: 'Outsole', label: 'Outsole', material: 'OutsoleMaterial' },
  ]
  assert.deepEqual(KICKCRAFT_PARTS, expected)
})

test('createNeutralDetailTexture produces valid Three.js texture with high lightness (~0.85-0.90)', () => {
  const texture = createNeutralDetailTexture(64, 64)
  assert.ok(texture, 'Texture must be defined')
  assert.ok(texture.isTexture || texture.isDataTexture, 'Must be a Three.js Texture instance')

  // Check lightness of the texture data
  assert.ok(texture.image, 'Texture must have image object')
  const data = texture.image.data
  assert.ok(data && data.length > 0, 'Texture data must be populated')

  const r = data[0] / 255
  const g = data[1] / 255
  const b = data[2] / 255
  const lightness = (r + g + b) / 3

  assert.ok(
    lightness >= 0.85 && lightness <= 0.90,
    `Lightness must be ~0.85-0.90 for pure color multiplication, got ${lightness.toFixed(3)}`
  )
})

test('partitionMeshGeometry splits BufferGeometry faces into subGeometries and groups', () => {
  const geom = new THREE.BoxGeometry(1, 1, 1)
  const faceCount = geom.index.count / 3 // 12 faces
  const faceAssignments = new Int8Array(faceCount)
  faceAssignments.fill(-1)

  // 4 faces assigned to Upper (index 0), 4 faces assigned to Midsole (index 6), 4 unassigned
  faceAssignments[0] = 0
  faceAssignments[1] = 0
  faceAssignments[2] = 0
  faceAssignments[3] = 0

  faceAssignments[4] = 6
  faceAssignments[5] = 6
  faceAssignments[6] = 6
  faceAssignments[7] = 6

  const result = partitionMeshGeometry(geom, faceAssignments, KICKCRAFT_PARTS)
  assert.ok(result, 'Must return partition result')
  assert.ok(result.subGeometries, 'Must return subGeometries')
  assert.ok(result.groups, 'Must return groups')

  assert.ok(result.subGeometries.Upper, 'subGeometries must contain Upper')
  assert.ok(result.subGeometries.Midsole, 'subGeometries must contain Midsole')
  assert.ok(result.subGeometries.__unassigned__, 'subGeometries must contain __unassigned__')

  assert.equal(result.subGeometries.Upper.index.count / 3, 4, 'Upper must have 4 faces')
  assert.equal(result.subGeometries.Midsole.index.count / 3, 4, 'Midsole must have 4 faces')
  assert.equal(result.subGeometries.__unassigned__.index.count / 3, 4, 'Unassigned must have 4 faces')
})

test('partitionModelForExport assigns canonical materials and retains unassigned faces', () => {
  const geom = new THREE.BoxGeometry(2, 1, 1)
  const origMat = new THREE.MeshStandardMaterial({ name: 'OriginalMaterial', color: 0x222222 })
  const mesh = new THREE.Mesh(geom, origMat)
  mesh.name = 'ShoeMesh'

  const faceCount = geom.index.count / 3
  const faceAssignments = new Int8Array(faceCount)
  faceAssignments.fill(-1)
  faceAssignments[0] = 0 // Upper
  faceAssignments[1] = 0 // Upper
  faceAssignments[4] = 6 // Midsole
  faceAssignments[5] = 6 // Midsole

  const result = partitionModelForExport(mesh, faceAssignments, KICKCRAFT_PARTS)
  assert.ok(result, 'Must return partitioned model')

  const partitionedRoot = result.partitioned || result
  const meshMap = result.meshMap

  assert.deepEqual(meshMap, {
    Upper: 'UpperMaterial',
    Midsole: 'MidsoleMaterial',
  })

  // Find sub-meshes by material name
  const materialsFound = new Set()
  partitionedRoot.traverse((child) => {
    if (child.isMesh && child.material) {
      materialsFound.add(child.material.name)
    }
  })

  assert.ok(materialsFound.has('UpperMaterial'), 'Must contain UpperMaterial')
  assert.ok(materialsFound.has('MidsoleMaterial'), 'Must contain MidsoleMaterial')
  assert.ok(materialsFound.has('OriginalMaterial'), 'Unassigned faces must retain OriginalMaterial')
})

test('partitionModelForExport preserves child objects named CharmAnchor', () => {
  const root = new THREE.Group()
  root.name = 'ShoeRoot'

  const geom = new THREE.BoxGeometry(2, 1, 1)
  const mesh = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({ name: 'ShoeMat' }))
  mesh.name = 'ShoeMesh'
  root.add(mesh)

  const anchor = new THREE.Object3D()
  anchor.name = 'CharmAnchor'
  anchor.position.set(0.12, 0.34, 0.56)
  root.add(anchor)

  const faceCount = geom.index.count / 3
  const faceAssignments = new Int8Array(faceCount)
  faceAssignments.fill(-1)
  faceAssignments[0] = 0 // Upper
  faceAssignments[1] = 6 // Midsole

  const result = partitionModelForExport(root, faceAssignments, KICKCRAFT_PARTS)
  const partitionedRoot = result.partitioned || result

  const foundAnchor = partitionedRoot.getObjectByName('CharmAnchor')
  assert.ok(foundAnchor, 'CharmAnchor must be preserved in the partitioned hierarchy')
  assert.equal(foundAnchor.name, 'CharmAnchor')
  assert.equal(foundAnchor.position.x, 0.12)
  assert.equal(foundAnchor.position.y, 0.34)
  assert.equal(foundAnchor.position.z, 0.56)
})

test('exportPaintedModelGlb rejects when fewer than 2 distinct parts are assigned', async () => {
  const geom = new THREE.BoxGeometry(1, 1, 1)
  const mesh = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({ name: 'Base' }))
  const faceCount = geom.index.count / 3

  // Test with 0 assigned parts (all -1)
  const zeroAssignments = new Int8Array(faceCount).fill(-1)
  await assert.rejects(
    async () => {
      await exportPaintedModelGlb(mesh, zeroAssignments, KICKCRAFT_PARTS)
    },
    {
      message: 'At least 2 customizable parts must be defined',
    }
  )

  // Test with only 1 assigned part (Upper only)
  const oneAssignment = new Int8Array(faceCount).fill(-1)
  oneAssignment[0] = 0 // Upper only
  oneAssignment[1] = 0
  await assert.rejects(
    async () => {
      await exportPaintedModelGlb(mesh, oneAssignment, KICKCRAFT_PARTS)
    },
    {
      message: 'At least 2 customizable parts must be defined',
    }
  )
})

test('exportPaintedModelGlb exports valid binary glTF buffer starting with magic 0x46546C67', async () => {
  const root = new THREE.Group()
  const geom = new THREE.BoxGeometry(2, 1, 1)
  const mesh = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({ name: 'OriginalMat' }))
  mesh.name = 'Shoe'
  root.add(mesh)

  const anchor = new THREE.Object3D()
  anchor.name = 'CharmAnchor'
  anchor.position.set(0.1, 0.2, 0.3)
  root.add(anchor)

  const faceCount = geom.index.count / 3
  const faceAssignments = new Int8Array(faceCount).fill(-1)
  faceAssignments[0] = 0 // Upper
  faceAssignments[1] = 0
  faceAssignments[2] = 6 // Midsole
  faceAssignments[3] = 6

  const exportResult = await exportPaintedModelGlb(root, faceAssignments, KICKCRAFT_PARTS)

  assert.ok(exportResult, 'Export result must be returned')
  assert.ok(exportResult.glbBuffer, 'Must return glbBuffer')
  assert.ok(exportResult.glbBlob, 'Must return glbBlob')
  assert.ok(exportResult.meshMap, 'Must return meshMap')
  assert.ok(exportResult.partColors, 'Must return partColors')

  assert.deepEqual(exportResult.meshMap, {
    Upper: 'UpperMaterial',
    Midsole: 'MidsoleMaterial',
  })
  assert.equal(typeof exportResult.partColors.Upper, 'string')
  assert.equal(typeof exportResult.partColors.Midsole, 'string')

  // Verify binary glTF magic header: 0x46546C67 ('glTF' in ASCII little-endian)
  assert.ok(exportResult.glbBuffer instanceof ArrayBuffer, 'glbBuffer must be an ArrayBuffer')
  const view = new DataView(exportResult.glbBuffer)
  const magic = view.getUint32(0, true)
  assert.equal(
    magic,
    0x46546c67,
    `Binary GLB must begin with glTF magic 0x46546C67, got 0x${magic.toString(16)}`
  )

  const version = view.getUint32(4, true)
  assert.equal(version, 2, 'glTF version must be 2')

  // Check glbBlob properties
  assert.equal(exportResult.glbBlob.size, exportResult.glbBuffer.byteLength)

  // Verify exported JSON contains materials and CharmAnchor
  const jsonLength = view.getUint32(12, true)
  const jsonString = Buffer.from(exportResult.glbBuffer, 20, jsonLength).toString('utf8').trim()
  const gltfJson = JSON.parse(jsonString)

  const materialNames = gltfJson.materials.map((m) => m.name)
  assert.ok(materialNames.includes('UpperMaterial'), 'GLB materials must include UpperMaterial')
  assert.ok(materialNames.includes('MidsoleMaterial'), 'GLB materials must include MidsoleMaterial')

  const nodeNames = gltfJson.nodes.map((n) => n.name)
  assert.ok(nodeNames.includes('CharmAnchor'), 'GLB nodes must include CharmAnchor')
})

test('partitionModelForExport handles string face assignments and non-indexed BufferGeometry', () => {
  const indexedGeom = new THREE.BoxGeometry(1, 1, 1)
  const nonIndexedGeom = indexedGeom.toNonIndexed()
  assert.equal(nonIndexedGeom.index, null, 'Geometry must be non-indexed')

  const mesh = new THREE.Mesh(nonIndexedGeom, new THREE.MeshStandardMaterial({ name: 'RawShoe' }))
  mesh.name = 'NonIndexedShoe'

  const faceCount = nonIndexedGeom.attributes.position.count / 3
  const faceAssignments = new Array(faceCount).fill(-1)
  faceAssignments[0] = 'Upper'
  faceAssignments[1] = 'Upper'
  faceAssignments[2] = 'ToeCap'
  faceAssignments[3] = 'ToeCap'

  const result = partitionModelForExport(mesh, faceAssignments, KICKCRAFT_PARTS)
  assert.ok(result, 'Must partition non-indexed geometry')

  assert.deepEqual(result.meshMap, {
    Upper: 'UpperMaterial',
    ToeCap: 'ToeCapMaterial',
  })

  const partitionedRoot = result.partitioned || result
  const materials = new Set()
  partitionedRoot.traverse((c) => {
    if (c.isMesh && c.material) materials.add(c.material.name)
  })

  assert.ok(materials.has('UpperMaterial'))
  assert.ok(materials.has('ToeCapMaterial'))
  assert.ok(materials.has('RawShoe'), 'Unassigned non-indexed faces must retain original material')
})

test('meshPartitioner utility strictly avoids physical SQL removal statements', () => {
  const partitionerContent = fs.existsSync(PARTITIONER_FILE)
    ? fs.readFileSync(PARTITIONER_FILE, 'utf8')
    : ''
  const testContent = fs.readFileSync(TEST_FILE, 'utf8')

  const forbidden = new RegExp('\\b' + 'DELETE' + '\\s+' + 'FROM' + '\\b', 'i')
  assert.doesNotMatch(
    partitionerContent,
    forbidden,
    'meshPartitioner.js must strictly avoid physical SQL removal statements'
  )
  assert.doesNotMatch(
    testContent.replace(forbidden, ''),
    forbidden,
    'mesh-partitioner.test.js must strictly avoid physical SQL removal statements'
  )
})

