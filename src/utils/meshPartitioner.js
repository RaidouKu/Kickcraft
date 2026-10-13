import * as THREE from 'three'

// Setup Node / headless environment polyfills for GLTFExporter if running without browser DOM
if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class FileReader {
    readAsArrayBuffer(blob) {
      blob
        .arrayBuffer()
        .then((buf) => {
          this.result = buf
          if (this.onload) this.onload({ target: this })
          if (this.onloadend) this.onloadend({ target: this })
        })
        .catch((err) => {
          if (this.onerror) this.onerror(err)
          if (this.onloadend) this.onloadend({ target: this })
        })
    }
  }
}

if (typeof globalThis.ImageData === 'undefined') {
  globalThis.ImageData = class ImageData {
    constructor(data, width, height) {
      this.data = data
      this.width = width
      this.height = height
    }
  }
}

if (typeof globalThis.OffscreenCanvas === 'undefined' && typeof document === 'undefined') {
  globalThis.OffscreenCanvas = class OffscreenCanvas {
    constructor(w = 1, h = 1) {
      this.width = w
      this.height = h
    }
    getContext() {
      return {
        drawImage() {},
        putImageData() {},
        getImageData() {
          return { data: new Uint8ClampedArray(4) }
        },
      }
    }
    convertToBlob(opts) {
      return Promise.resolve(
        new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], {
          type: opts?.type || 'image/png',
        })
      )
    }
  }
}

/**
 * Standard KickCraft shoe customizable parts definition.
 * Each part corresponds to an official 3D material name.
 */
export const KICKCRAFT_PARTS = [
  { id: 'Upper', label: 'Upper', material: 'UpperMaterial' },
  { id: 'ToeCap', label: 'Toe Cap', material: 'ToeCapMaterial' },
  { id: 'Tongue', label: 'Tongue', material: 'TongueMaterial' },
  { id: 'Laces', label: 'Laces', material: 'LacesMaterial' },
  { id: 'HeelPanel', label: 'Heel Panel', material: 'HeelPanelMaterial' },
  { id: 'SideAccents', label: 'Side Accents', material: 'SideAccentsMaterial' },
  { id: 'Midsole', label: 'Midsole', material: 'MidsoleMaterial' },
  { id: 'Outsole', label: 'Outsole', material: 'OutsoleMaterial' },
]

/**
 * Creates a high-reflectance neutral shading texture (~0.85-0.90 lightness)
 * for customizable shoe parts. This prevents dark baked photographic textures
 * from darkening user color selections, enabling 100% vibrant color multiplication.
 *
 * @param {number} width
 * @param {number} height
 * @returns {THREE.DataTexture}
 */
export function createNeutralDetailTexture(width = 256, height = 256) {
  const size = width * height * 4
  const data = new Uint8Array(size)
  // 224 / 255 = ~0.8784 lightness
  const val = Math.round(255 * 0.88)
  for (let i = 0; i < size; i += 4) {
    data[i] = val
    data[i + 1] = val
    data[i + 2] = val
    data[i + 3] = 255
  }

  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat)
  texture.needsUpdate = true
  if (THREE.SRGBColorSpace) {
    texture.colorSpace = THREE.SRGBColorSpace
  }
  return texture
}

/**
 * Helper to extract a sub-geometry from a BufferGeometry given an array of face indices.
 * Preserves vertex positions, normals, UVs, and all attributes while rebuilding indices.
 */
function buildSubGeometry(sourceGeom, faceIndices) {
  const subGeom = new THREE.BufferGeometry()
  const isIndexed = !!sourceGeom.index
  const oldIndex = sourceGeom.index
  const attrNames = Object.keys(sourceGeom.attributes)

  const newIndices = []
  const vertexMap = new Map()
  const newAttrArrays = {}
  for (const name of attrNames) {
    newAttrArrays[name] = []
  }

  let nextVertexIndex = 0
  for (const f of faceIndices) {
    const vIndices = isIndexed
      ? [oldIndex.getX(3 * f), oldIndex.getX(3 * f + 1), oldIndex.getX(3 * f + 2)]
      : [3 * f, 3 * f + 1, 3 * f + 2]

    for (const oldV of vIndices) {
      let newV = vertexMap.get(oldV)
      if (newV === undefined) {
        newV = nextVertexIndex++
        vertexMap.set(oldV, newV)
        for (const name of attrNames) {
          const attr = sourceGeom.attributes[name]
          const itemSize = attr.itemSize
          for (let k = 0; k < itemSize; k++) {
            newAttrArrays[name].push(attr.getComponent(oldV, k))
          }
        }
      }
      newIndices.push(newV)
    }
  }

  for (const name of attrNames) {
    const attr = sourceGeom.attributes[name]
    const ArrayType = attr.array.constructor
    const bufferArray = new ArrayType(newAttrArrays[name])
    subGeom.setAttribute(
      name,
      new THREE.BufferAttribute(bufferArray, attr.itemSize, attr.normalized)
    )
  }

  const IndexArrayType = nextVertexIndex > 65535 ? Uint32Array : Uint16Array
  subGeom.setIndex(new THREE.BufferAttribute(new IndexArrayType(newIndices), 1))
  return subGeom
}

/**
 * Resolves a face assignment value into a canonical part id or '__unassigned__'.
 */
function resolvePartId(assignment, partsList) {
  if (assignment === null || assignment === undefined || assignment === -1) {
    return '__unassigned__'
  }
  if (typeof assignment === 'number') {
    if (assignment >= 0 && assignment < partsList.length) {
      return partsList[assignment].id
    }
    return '__unassigned__'
  }
  if (typeof assignment === 'string') {
    const matched = partsList.find(
      (p) => p.id === assignment || p.material === assignment || p.label === assignment
    )
    if (matched) return matched.id
  }
  return '__unassigned__'
}

/**
 * Groups triangles in a BufferGeometry by faceAssignments into sub-geometries and groups.
 *
 * @param {THREE.BufferGeometry} geometry
 * @param {Array<number>|Int8Array|TypedArray} faceAssignments
 * @param {Array<Object>} partsList
 * @returns {{ groups: Array<Object>, subGeometries: Record<string, THREE.BufferGeometry> }}
 */
export function partitionMeshGeometry(geometry, faceAssignments, partsList = KICKCRAFT_PARTS) {
  const isIndexed = !!geometry.index
  const totalFaces = isIndexed
    ? geometry.index.count / 3
    : Math.floor(geometry.attributes.position.count / 3)

  // Collect face indices for each part
  const partFacesMap = new Map()

  for (let f = 0; f < totalFaces; f++) {
    const rawAssignment = faceAssignments ? faceAssignments[f] : -1
    const partId = resolvePartId(rawAssignment, partsList)

    if (!partFacesMap.has(partId)) {
      partFacesMap.set(partId, [])
    }
    partFacesMap.get(partId).push(f)
  }

  const subGeometries = {}
  const groups = []
  let materialIndex = 0

  for (const [partId, faceIndices] of partFacesMap.entries()) {
    if (faceIndices.length === 0) continue

    const subGeom = buildSubGeometry(geometry, faceIndices)
    subGeometries[partId] = subGeom

    const partDef = partsList.find((p) => p.id === partId)
    groups.push({
      partId,
      material: partDef ? partDef.material : null,
      faceCount: faceIndices.length,
      faceIndices,
      materialIndex: materialIndex++,
    })
  }

  return { groups, subGeometries }
}

/**
 * Clones and partitions rootObject meshes according to faceAssignments.
 * Assigns canonical KickCraft materials (UpperMaterial, MidsoleMaterial, etc.)
 * to assigned parts, and preserves untouched appearance for unassigned faces
 * and child anchors (e.g., CharmAnchor).
 *
 * @param {THREE.Object3D|THREE.Mesh} rootObject
 * @param {Array<number>|Int8Array|TypedArray} faceAssignments
 * @param {Array<Object>} partsList
 * @returns {THREE.Group & { partitioned: THREE.Group, meshMap: Record<string, string>, partColors: Record<string, string> }}
 */
export function partitionModelForExport(
  rootObject,
  faceAssignments,
  partsList = KICKCRAFT_PARTS
) {
  let targetMesh = null

  if (rootObject.isMesh) {
    targetMesh = rootObject
  } else if (rootObject.isBufferGeometry) {
    targetMesh = new THREE.Mesh(
      rootObject,
      new THREE.MeshStandardMaterial({ name: 'OriginalMaterial' })
    )
  } else {
    // Find the primary mesh in the hierarchy
    rootObject.traverse((child) => {
      if (child.isMesh && !targetMesh) {
        targetMesh = child
      }
    })
  }

  if (!targetMesh || !targetMesh.geometry) {
    throw new Error('No valid mesh geometry found in root object to partition')
  }

  const { subGeometries } = partitionMeshGeometry(
    targetMesh.geometry,
    faceAssignments,
    partsList
  )

  const container = new THREE.Group()
  container.name = rootObject.name || 'Shoe_Partitioned'

  const meshMap = {}
  const partColors = {}
  const neutralTexture = createNeutralDetailTexture()

  for (const [partKey, subGeom] of Object.entries(subGeometries)) {
    if (partKey === '__unassigned__') {
      const origMaterial = targetMesh.material
        ? targetMesh.material.clone()
        : new THREE.MeshStandardMaterial({ name: 'OriginalMaterial' })
      const unassignedMesh = new THREE.Mesh(subGeom, origMaterial)
      unassignedMesh.name = `${targetMesh.name || 'Shoe'}_unassigned`
      unassignedMesh.position.copy(targetMesh.position)
      unassignedMesh.rotation.copy(targetMesh.rotation)
      unassignedMesh.scale.copy(targetMesh.scale)
      container.add(unassignedMesh)
    } else {
      const partDef = partsList.find((p) => p.id === partKey)
      if (!partDef) continue

      const partMaterial = new THREE.MeshStandardMaterial({
        name: partDef.material,
        color: 0xffffff,
        roughness: 0.6,
        metalness: 0.1,
        map: neutralTexture,
      })

      const partMesh = new THREE.Mesh(subGeom, partMaterial)
      partMesh.name = `${targetMesh.name ? targetMesh.name + '_' : ''}${partDef.id}`
      partMesh.position.copy(targetMesh.position)
      partMesh.rotation.copy(targetMesh.rotation)
      partMesh.scale.copy(targetMesh.scale)
      container.add(partMesh)

      meshMap[partDef.id] = partDef.material
      partColors[partDef.id] = '#ffffff'
    }
  }

  // Preserve non-target children, anchors (e.g. CharmAnchor) and other hierarchy nodes
  const preserveChild = (node) => {
    if (!node || node === targetMesh) return
    if (node.name === 'CharmAnchor' || !node.isMesh) {
      const cloned = node.clone(true)
      container.add(cloned)
    } else if (node.isMesh && node !== targetMesh) {
      container.add(node.clone(true))
    }
  }

  if (rootObject.children) {
    for (const child of rootObject.children) {
      preserveChild(child)
    }
  }

  // Check if CharmAnchor was attached directly to targetMesh
  if (targetMesh.children) {
    for (const child of targetMesh.children) {
      if (child.name === 'CharmAnchor' && !container.getObjectByName('CharmAnchor')) {
        container.add(child.clone(true))
      }
    }
  }

  // Attach metadata to container for both object & destructured access
  container.partitioned = container
  container.meshMap = meshMap
  container.partColors = partColors

  return container
}

/**
 * Validates face assignments and exports a binary GLB containing the partitioned shoe.
 *
 * @param {THREE.Object3D|THREE.Mesh} rootObject
 * @param {Array<number>|Int8Array|TypedArray} faceAssignments
 * @param {Array<Object>} partsList
 * @returns {Promise<{ glbBuffer: ArrayBuffer, glbBlob: Blob, meshMap: Record<string, string>, partColors: Record<string, string> }>}
 */
export async function exportPaintedModelGlb(
  rootObject,
  faceAssignments,
  partsList = KICKCRAFT_PARTS
) {
  // 1. Validate that at least 2 distinct parts are assigned
  const assignedParts = new Set()
  if (faceAssignments) {
    for (let i = 0; i < faceAssignments.length; i++) {
      const partId = resolvePartId(faceAssignments[i], partsList)
      if (partId !== '__unassigned__') {
        assignedParts.add(partId)
      }
    }
  }

  if (assignedParts.size < 2) {
    throw new Error('At least 2 customizable parts must be defined')
  }

  // 2. Partition model
  const partitionedResult = partitionModelForExport(rootObject, faceAssignments, partsList)
  const partitionedModel = partitionedResult.partitioned || partitionedResult
  const meshMap = partitionedResult.meshMap
  const partColors = partitionedResult.partColors

  // 3. Load GLTFExporter
  let GLTFExporter
  try {
    const module = await import('three/examples/jsm/exporters/GLTFExporter.js')
    GLTFExporter = module.GLTFExporter
  } catch {
    const module = await import('three/addons/exporters/GLTFExporter.js')
    GLTFExporter = module.GLTFExporter
  }

  // 4. Export binary GLB
  return new Promise((resolve, reject) => {
    const exporter = new GLTFExporter()
    exporter.parse(
      partitionedModel,
      (result) => {
        let glbBuffer
        if (result instanceof ArrayBuffer) {
          glbBuffer = result
        } else if (result?.buffer instanceof ArrayBuffer) {
          glbBuffer = result.buffer.slice(
            result.byteOffset,
            result.byteOffset + result.byteLength
          )
        } else {
          return reject(new Error('GLTFExporter failed to return valid binary buffer'))
        }

        const glbBlob = new Blob([glbBuffer], { type: 'model/gltf-binary' })
        resolve({
          glbBuffer,
          glbBlob,
          meshMap,
          partColors,
        })
      },
      (error) => {
        reject(error || new Error('GLTFExporter parsing error'))
      },
      { binary: true }
    )
  })
}
