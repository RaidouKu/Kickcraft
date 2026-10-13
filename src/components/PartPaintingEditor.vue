<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as THREE from 'three'
import { api } from '../api.js'
import { resolveAssetUrl } from '../customization.js'
import {
  KICKCRAFT_PARTS,
  createNeutralDetailTexture,
  exportPaintedModelGlb,
} from '../utils/meshPartitioner.js'

const props = defineProps({
  glbPath: {
    type: String,
    required: true,
  },
  productId: {
    type: String,
    default: '',
  },
  initialMeshMap: {
    type: Object,
    default: () => ({}),
  },
  initialPartColors: {
    type: Object,
    default: () => ({}),
  },
})

const emit = defineEmits(['save', 'cancel', 'saved'])

// Canonical 8 KickCraft Parts with distinct display colors for editing
const PARTS_CONFIG = [
  { id: 'Upper', label: 'Upper', material: 'UpperMaterial', displayColor: '#3b82f6', defaultColor: '#f1efe8' },
  { id: 'ToeCap', label: 'Toe Cap', material: 'ToeCapMaterial', displayColor: '#10b981', defaultColor: '#292b2d' },
  { id: 'Tongue', label: 'Tongue', material: 'TongueMaterial', displayColor: '#f59e0b', defaultColor: '#f1efe8' },
  { id: 'Laces', label: 'Laces', material: 'LacesMaterial', displayColor: '#8b5cf6', defaultColor: '#ffffff' },
  { id: 'HeelPanel', label: 'Heel Panel', material: 'HeelPanelMaterial', displayColor: '#ec4899', defaultColor: '#b94d27' },
  { id: 'SideAccents', label: 'Side Accents', material: 'SideAccentsMaterial', displayColor: '#06b6d4', defaultColor: '#245fa8' },
  { id: 'Midsole', label: 'Midsole', material: 'MidsoleMaterial', displayColor: '#f97316', defaultColor: '#f1efe8' },
  { id: 'Outsole', label: 'Outsole', material: 'OutsoleMaterial', displayColor: '#ef4444', defaultColor: '#292b2d' },
]

// Signature KickCraft Palette for color testing
const SIGNATURE_SWATCHES = [
  { name: 'Chalk', hex: '#f1efe8' },
  { name: 'Charcoal', hex: '#292b2d' },
  { name: 'Terracotta', hex: '#b94d27' },
  { name: 'Cobalt', hex: '#245fa8' },
  { name: 'Sage', hex: '#7d9b76' },
  { name: 'Gold', hex: '#d4af37' },
  { name: 'Crimson', hex: '#963a20' },
  { name: 'Pure White', hex: '#ffffff' },
]

// Reactive UI & Editor State
const canvasContainer = ref(null)
const cursorIndicator = ref(null)
const selectedPartIndex = ref(0)
const selectedPartId = computed(() => PARTS_CONFIG[selectedPartIndex.value]?.id || 'Upper')

// Tool modes: 'paint' | 'erase' | 'orbit'
const activeMode = ref('paint')
const brushRadius = ref(35) // in pixels
const isPointerOverCanvas = ref(false)
const cursorPos = ref({ x: 0, y: 0 })

// Color testing mode
const isTestingColors = ref(false)
const testColors = ref({
  Upper: '#f1efe8',
  ToeCap: '#292b2d',
  Tongue: '#f1efe8',
  Laces: '#ffffff',
  HeelPanel: '#b94d27',
  SideAccents: '#245fa8',
  Midsole: '#f1efe8',
  Outsole: '#292b2d',
  ...(props.initialPartColors || {}),
})

// Confirmation & Validation Modals
const showClearConfirm = ref(false)
const validationError = ref('')
const isSaving = ref(false)
const isLoadingModel = ref(true)
const modelLoadError = ref('')
const saveSuccessMessage = ref('')

// Three.js State
let renderer = null
let scene = null
let camera = null
let controls = null
let animFrameId = null
let targetMesh = null
let sceneRoot = null
let originalTexture = null
let neutralTexture = null
let raycaster = null
let normalMatrix = null
let viewDirVec = null
let faceNormalVec = null
let faceCenterVec = null

// Face Assignments & Geometry Caches
let totalFaces = 0
let faceAssignments = null // Int8Array (index 0..7 or -1)
let faceCenters = null // Float32Array (totalFaces * 3)
let faceNormals = null // Float32Array (totalFaces * 3)

// Stroke Undo History Stack
const undoStack = ref([]) // Array of Map<faceIndex, previousAssignment>
let currentStroke = null
let isDraggingBrush = false

// Part Statistics
const partStats = ref(
  PARTS_CONFIG.map((p) => ({
    id: p.id,
    label: p.label,
    faceCount: 0,
    coveragePercent: '0.0',
  }))
)

const totalAssignedFaces = computed(() => {
  return partStats.value.reduce((acc, p) => acc + p.faceCount, 0)
})

const overallCoveragePercent = computed(() => {
  if (totalFaces === 0) return '0.0'
  return ((totalAssignedFaces.value / totalFaces) * 100).toFixed(1)
})

const distinctPartsCount = computed(() => {
  return partStats.value.filter((p) => p.faceCount > 0).length
})

const canSave = computed(() => {
  return distinctPartsCount.value >= 2
})

// Helper: updates reactive counts per part
function updatePartStats() {
  if (!faceAssignments || totalFaces === 0) return
  const counts = new Array(PARTS_CONFIG.length).fill(0)
  for (let f = 0; f < totalFaces; f++) {
    const val = faceAssignments[f]
    if (val >= 0 && val < counts.length) {
      counts[val]++
    }
  }

  partStats.value = PARTS_CONFIG.map((p, idx) => {
    const count = counts[idx]
    const percent = totalFaces > 0 ? ((count / totalFaces) * 100).toFixed(1) : '0.0'
    return {
      id: p.id,
      label: p.label,
      faceCount: count,
      coveragePercent: percent,
    }
  })
}

// Convert Hex string to RGB floats [0..1]
function hexToRgb(hex) {
  const clean = hex.replace('#', '')
  const num = parseInt(clean, 16)
  return [
    ((num >> 16) & 255) / 255,
    ((num >> 8) & 255) / 255,
    (num & 255) / 255,
  ]
}

// Update vertex colors for a specific face
function setFaceVertexColor(faceIndex, assignmentValue) {
  if (!targetMesh || !targetMesh.geometry) return
  const colorAttr = targetMesh.geometry.attributes.color
  if (!colorAttr) return

  let r = 1.0
  let g = 1.0
  let b = 1.0

  if (assignmentValue >= 0 && assignmentValue < PARTS_CONFIG.length) {
    const part = PARTS_CONFIG[assignmentValue]
    const hex = isTestingColors.value
      ? (testColors.value[part.id] || part.defaultColor)
      : part.displayColor
    const rgb = hexToRgb(hex)
    r = rgb[0]
    g = rgb[1]
    b = rgb[2]
  }

  const vBase = faceIndex * 3
  for (let i = 0; i < 3; i++) {
    colorAttr.setXYZ(vBase + i, r, g, b)
  }
}

// Refresh all vertex colors (e.g. after mode switch or undo)
function refreshAllVertexColors() {
  if (!targetMesh || !targetMesh.geometry || !faceAssignments) return
  const colorAttr = targetMesh.geometry.attributes.color
  if (!colorAttr) return

  for (let f = 0; f < totalFaces; f++) {
    setFaceVertexColor(f, faceAssignments[f])
  }
  colorAttr.needsUpdate = true
}

// Switch between Display Tint and Neutral / Test Shading
function toggleTestColors() {
  isTestingColors.value = !isTestingColors.value
  if (!targetMesh || !targetMesh.material) return

  if (isTestingColors.value) {
    if (!neutralTexture) {
      neutralTexture = createNeutralDetailTexture()
    }
    targetMesh.material.map = neutralTexture
  } else {
    targetMesh.material.map = originalTexture
  }
  targetMesh.material.needsUpdate = true
  refreshAllVertexColors()
}

// Select a test swatch for active part
function selectTestColor(hex) {
  const partId = selectedPartId.value
  testColors.value[partId] = hex
  if (!isTestingColors.value) {
    toggleTestColors()
  } else {
    refreshAllVertexColors()
  }
}

// Brush Presets
function setBrushRadius(size) {
  brushRadius.value = size
}

// Tool Mode Selection
function setToolMode(mode) {
  activeMode.value = mode
  if (controls) {
    controls.enabled = mode === 'orbit'
  }
}

// Stroke Undo
function handleUndo() {
  if (undoStack.value.length === 0 || !faceAssignments) return
  const stroke = undoStack.value.pop()
  for (const [faceIndex, prevVal] of stroke.entries()) {
    faceAssignments[faceIndex] = prevVal
    setFaceVertexColor(faceIndex, prevVal)
  }
  if (targetMesh && targetMesh.geometry && targetMesh.geometry.attributes.color) {
    targetMesh.geometry.attributes.color.needsUpdate = true
  }
  updatePartStats()
  validationError.value = ''
}

// Clear Current Part
function handleClearPart() {
  const currentCount = partStats.value[selectedPartIndex.value]?.faceCount || 0
  if (currentCount === 0) return
  showClearConfirm.value = true
}

function clearPart() {
  handleClearPart()
}

function confirmClearPart() {
  if (!faceAssignments) {
    showClearConfirm.value = false
    return
  }

  const partIdx = selectedPartIndex.value
  const clearStroke = new Map()

  for (let f = 0; f < totalFaces; f++) {
    if (faceAssignments[f] === partIdx) {
      clearStroke.set(f, faceAssignments[f])
      faceAssignments[f] = -1
      setFaceVertexColor(f, -1)
    }
  }

  if (clearStroke.size > 0) {
    undoStack.value.push(clearStroke)
    if (targetMesh && targetMesh.geometry && targetMesh.geometry.attributes.color) {
      targetMesh.geometry.attributes.color.needsUpdate = true
    }
    updatePartStats()
  }

  showClearConfirm.value = false
}

// Camera Reset
function resetCamera() {
  if (!controls || !camera || !sceneRoot) return
  const box = new THREE.Box3().setFromObject(sceneRoot)
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z)

  camera.position.set(center.x, center.y + maxDim * 0.4, center.z + maxDim * 1.8)
  camera.lookAt(center)
  controls.target.copy(center)
  controls.update()
}

// Raycasting & Surface Painting Engine
function performBrushStroke(event) {
  if (!targetMesh || !renderer || !camera || !faceAssignments) return
  const rect = renderer.domElement.getBoundingClientRect()
  const ndcX = ((event.clientX - rect.left) / rect.width) * 2 - 1
  const ndcY = -((event.clientY - rect.top) / rect.height) * 2 + 1

  raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera)
  const hits = raycaster.intersectObject(targetMesh, false)
  if (hits.length === 0) return

  const hit = hits[0]
  const hitPoint = hit.point // world space
  const camDist = camera.position.distanceTo(hitPoint)

  // Screen space pixel radius to world space radius
  const fovRad = (camera.fov * Math.PI) / 180
  const worldRadius = brushRadius.value * ((2 * camDist * Math.tan(fovRad / 2)) / rect.height)

  // Local space hit point and radius
  const localHit = targetMesh.worldToLocal(hitPoint.clone())
  const scale = targetMesh.scale.x || 1
  const localRadiusSq = (worldRadius / scale) * (worldRadius / scale)

  const worldMat = targetMesh.matrixWorld
  normalMatrix.getNormalMatrix(worldMat)

  const hitNormal = hit.face ? hit.face.normal : null
  let modifiedAny = false
  const targetVal = activeMode.value === 'erase' ? -1 : selectedPartIndex.value

  for (let f = 0; f < totalFaces; f++) {
    const fIdx3 = f * 3
    const fx = faceCenters[fIdx3]
    const fy = faceCenters[fIdx3 + 1]
    const fz = faceCenters[fIdx3 + 2]

    const dx = fx - localHit.x
    const dy = fy - localHit.y
    const dz = fz - localHit.z
    const distSq = dx * dx + dy * dy + dz * dz

    if (distSq > localRadiusSq) continue

    // Surface normal occlusion check: reject back-facing surfaces
    faceCenterVec.set(fx, fy, fz).applyMatrix4(worldMat)
    viewDirVec.subVectors(faceCenterVec, camera.position).normalize()
    faceNormalVec.set(faceNormals[fIdx3], faceNormals[fIdx3 + 1], faceNormals[fIdx3 + 2])
      .applyMatrix3(normalMatrix)
      .normalize()

    // Dot product check against view direction (< -0.15 rejects back faces)
    const dot = faceNormalVec.dot(viewDirVec)
    if (dot >= -0.15) {
      continue // Back-facing or glancing triangle culled
    }

    // Normal alignment with hit triangle normal to prevent bleeding to interior walls
    if (hitNormal) {
      const align = faceNormalVec.dot(hitNormal)
      if (align < 0.1) {
        continue
      }
    }

    if (faceAssignments[f] !== targetVal) {
      if (!currentStroke.has(f)) {
        currentStroke.set(f, faceAssignments[f])
      }
      faceAssignments[f] = targetVal
      setFaceVertexColor(f, targetVal)
      modifiedAny = true
    }
  }

  if (modifiedAny && targetMesh.geometry.attributes.color) {
    targetMesh.geometry.attributes.color.needsUpdate = true
  }
}

// Canvas Pointer Events
function onPointerDown(e) {
  if (activeMode.value === 'orbit' || e.button !== 0) {
    if (controls) controls.enabled = true
    return
  }

  isDraggingBrush = true
  currentStroke = new Map()
  if (controls) controls.enabled = false
  performBrushStroke(e)
}

function onPointerMove(e) {
  cursorPos.value = { x: e.clientX, y: e.clientY }
  if (isDraggingBrush && (activeMode.value === 'paint' || activeMode.value === 'erase')) {
    performBrushStroke(e)
  }
}

function onPointerUp() {
  if (isDraggingBrush) {
    isDraggingBrush = false
    if (controls) controls.enabled = activeMode.value === 'orbit'
    if (currentStroke && currentStroke.size > 0) {
      undoStack.value.push(currentStroke)
      currentStroke = null
      updatePartStats()
      validationError.value = ''
    }
  }
}

function onPointerEnter() {
  isPointerOverCanvas.value = true
}

function onPointerLeave() {
  isPointerOverCanvas.value = false
  onPointerUp()
}

// Save & Export Model Flow
async function handleSave() {
  validationError.value = ''
  saveSuccessMessage.value = ''

  if (!canSave.value) {
    validationError.value = 'At least 2 customizable parts must be defined before saving.'
    return
  }

  isSaving.value = true

  try {
    const exportResult = await exportPaintedModelGlb(sceneRoot, faceAssignments, PARTS_CONFIG)

    // Build default part colors from current selections
    const exportedPartColors = {}
    for (const part of PARTS_CONFIG) {
      if (exportResult.meshMap[part.id]) {
        exportedPartColors[part.id] = testColors.value[part.id] || part.defaultColor
      }
    }

    // If productId is provided, persist directly to backend API
    if (props.productId) {
      const formData = new FormData()
      formData.append('productId', props.productId)
      formData.append('glbFile', exportResult.glbBlob, 'model_painted.glb')
      formData.append('meshMap', JSON.stringify(exportResult.meshMap))
      formData.append('partColors', JSON.stringify(exportedPartColors))

      const apiRes = await api('products/save-painted-parts.php', {
        method: 'POST',
        body: formData,
      })

      saveSuccessMessage.value = 'Customizable parts successfully saved and partitioned!'
      emit('saved', apiRes)
      emit('save', {
        ...exportResult,
        ...apiRes,
        partColors: exportedPartColors,
      })
    } else {
      // In-memory / Wizard draft mode
      saveSuccessMessage.value = 'Customizable parts successfully defined!'
      emit('save', {
        ...exportResult,
        partColors: exportedPartColors,
      })
    }
  } catch (err) {
    validationError.value = err.message || 'Failed to partition and save model.'
  } finally {
    isSaving.value = false
  }
}

function handleCancel() {
  emit('cancel')
}

// Lifecycle: Setup Three.js Scene and Load GLB
onMounted(async () => {
  if (!canvasContainer.value) return

  raycaster = new THREE.Raycaster()
  normalMatrix = new THREE.Matrix3()
  viewDirVec = new THREE.Vector3()
  faceNormalVec = new THREE.Vector3()
  faceCenterVec = new THREE.Vector3()

  // Scene & Camera
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0xf1efe8)

  const width = canvasContainer.value.clientWidth || 800
  const height = canvasContainer.value.clientHeight || 600
  camera = new THREE.PerspectiveCamera(45, width / height, 0.05, 50)
  camera.position.set(0, 0.5, 2.5)

  // Lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 1.2)
  scene.add(ambientLight)

  const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.4)
  dirLight1.position.set(5, 10, 7)
  scene.add(dirLight1)

  const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.8)
  dirLight2.position.set(-5, -3, -5)
  scene.add(dirLight2)

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
  renderer.setSize(width, height)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  if (THREE.SRGBColorSpace) {
    renderer.outputColorSpace = THREE.SRGBColorSpace
  }
  canvasContainer.value.appendChild(renderer.domElement)

  // OrbitControls
  let OrbitControls
  try {
    const mod = await import('three/examples/jsm/controls/OrbitControls.js')
    OrbitControls = mod.OrbitControls
  } catch {
    const mod = await import('three/addons/controls/OrbitControls.js')
    OrbitControls = mod.OrbitControls
  }

  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.05
  controls.enabled = activeMode.value === 'orbit'

  // Load GLTF
  let GLTFLoader
  try {
    const mod = await import('three/examples/jsm/loaders/GLTFLoader.js')
    GLTFLoader = mod.GLTFLoader
  } catch {
    const mod = await import('three/addons/loaders/GLTFLoader.js')
    GLTFLoader = mod.GLTFLoader
  }

  const loader = new GLTFLoader()
  const url = resolveAssetUrl(props.glbPath)

  loader.load(
    url,
    (gltf) => {
      sceneRoot = gltf.scene || gltf.scenes[0]

      // Locate target mesh
      sceneRoot.traverse((child) => {
        if (child.isMesh && !targetMesh) {
          targetMesh = child
        }
      })

      if (!targetMesh) {
        modelLoadError.value = 'No 3D mesh found in model file.'
        isLoadingModel.value = false
        return
      }

      // Convert to non-indexed geometry for exact per-face vertex coloration
      if (targetMesh.geometry.index) {
        targetMesh.geometry = targetMesh.geometry.toNonIndexed()
      }

      const geom = targetMesh.geometry
      totalFaces = Math.floor(geom.attributes.position.count / 3)
      faceAssignments = new Int8Array(totalFaces).fill(-1)

      // Precompute face centers and normals
      faceCenters = new Float32Array(totalFaces * 3)
      faceNormals = new Float32Array(totalFaces * 3)
      const pos = geom.attributes.position
      const pA = new THREE.Vector3()
      const pB = new THREE.Vector3()
      const pC = new THREE.Vector3()
      const cb = new THREE.Vector3()
      const ab = new THREE.Vector3()

      for (let f = 0; f < totalFaces; f++) {
        pA.fromBufferAttribute(pos, 3 * f)
        pB.fromBufferAttribute(pos, 3 * f + 1)
        pC.fromBufferAttribute(pos, 3 * f + 2)

        faceCenters[3 * f] = (pA.x + pB.x + pC.x) / 3
        faceCenters[3 * f + 1] = (pA.y + pB.y + pC.y) / 3
        faceCenters[3 * f + 2] = (pA.z + pB.z + pC.z) / 3

        cb.subVectors(pC, pB)
        ab.subVectors(pA, pB)
        cb.cross(ab).normalize()
        faceNormals[3 * f] = cb.x
        faceNormals[3 * f + 1] = cb.y
        faceNormals[3 * f + 2] = cb.z
      }

      // Add vertex color attribute
      const colors = new Float32Array(totalFaces * 9).fill(1.0)
      geom.setAttribute('color', new THREE.BufferAttribute(colors, 3))

      // Material setup
      originalTexture = targetMesh.material?.map || null
      targetMesh.material.vertexColors = true
      targetMesh.material.needsUpdate = true

      scene.add(sceneRoot)
      resetCamera()
      updatePartStats()
      isLoadingModel.value = false
    },
    undefined,
    (err) => {
      modelLoadError.value = 'Failed to load 3D shoe model: ' + (err.message || 'Network error')
      isLoadingModel.value = false
    }
  )

  // Render loop
  const animate = () => {
    animFrameId = requestAnimationFrame(animate)
    if (controls) controls.update()
    if (renderer && scene && camera) {
      renderer.render(scene, camera)
    }
  }
  animate()

  // Handle window resizing
  const onResize = () => {
    if (!canvasContainer.value || !renderer || !camera) return
    const w = canvasContainer.value.clientWidth
    const h = canvasContainer.value.clientHeight
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
  }
  window.addEventListener('resize', onResize)
})

onBeforeUnmount(() => {
  if (animFrameId) cancelAnimationFrame(animFrameId)
  if (renderer && renderer.domElement) {
    renderer.domElement.remove()
    renderer.dispose()
  }
})
</script>

<template>
  <div class="fixed inset-0 z-50 bg-stone-900/80 flex flex-col font-sans select-none backdrop-blur-xs">
    <!-- Header Bar -->
    <header class="bg-[#fcfdfb] border-b-2 border-stone-900 px-6 py-3 flex items-center justify-between shadow-[0px_4px_0px_#202220]">
      <div class="flex items-center gap-3">
        <span class="inline-flex items-center justify-center w-8 h-8 bg-[#b94d27] text-white font-mono font-black text-sm border-2 border-stone-900 shadow-[2px_2px_0px_#202220]">
          🎨
        </span>
        <div>
          <h2 class="text-stone-900 font-mono font-black text-base uppercase tracking-wider">
            3D PART PAINTING STUDIO
          </h2>
          <p class="text-stone-500 font-mono text-xs uppercase">
            Paint customizable parts directly on single-mesh shoe
          </p>
        </div>
      </div>

      <div class="flex items-center gap-3">
        <!-- Distinct parts summary counter -->
        <span
          class="font-mono text-xs font-bold uppercase px-2.5 py-1 border-2 border-stone-900 shadow-[2px_2px_0px_#202220]"
          :class="canSave ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'"
        >
          {{ distinctPartsCount }} OF 8 PARTS DEFINED
        </span>

        <!-- Close / Cancel Button -->
        <button
          type="button"
          @click="handleCancel"
          class="px-3 py-1 font-mono text-xs font-bold uppercase bg-stone-100 hover:bg-stone-200 text-stone-700 border-2 border-stone-900 shadow-[2px_2px_0px_#202220] transition-colors"
        >
          ✕ CANCEL
        </button>
      </div>
    </header>

    <!-- Main Studio Workspace: Split Canvas & Sidebar -->
    <div class="flex-1 flex overflow-hidden">
      <!-- 3D Canvas Viewport -->
      <div class="relative flex-1 bg-stone-200 overflow-hidden flex flex-col">
        <!-- Floating Brutalist Toolbar -->
        <div class="absolute top-4 left-4 z-20 flex flex-wrap items-center gap-2 bg-[#fcfdfb] border-2 border-stone-900 shadow-[4px_4px_0px_#202220] p-2 font-mono text-xs">
          <!-- Modes -->
          <div class="flex items-center border-r-2 border-stone-300 pr-2 mr-1 gap-1">
            <button
              type="button"
              @click="setToolMode('paint')"
              class="px-2.5 py-1 uppercase font-bold border-2 transition-colors"
              :class="activeMode === 'paint' ? 'bg-[#b94d27] text-white border-stone-900 shadow-[2px_2px_0px_#202220]' : 'bg-white text-stone-800 border-stone-300 hover:border-stone-900'"
            >
              🖌️ PAINT
            </button>
            <button
              type="button"
              @click="setToolMode('erase')"
              class="px-2.5 py-1 uppercase font-bold border-2 transition-colors"
              :class="activeMode === 'erase' ? 'bg-red-600 text-white border-stone-900 shadow-[2px_2px_0px_#202220]' : 'bg-white text-stone-800 border-stone-300 hover:border-stone-900'"
            >
              🧹 ERASE
            </button>
            <button
              type="button"
              @click="setToolMode('orbit')"
              class="px-2.5 py-1 uppercase font-bold border-2 transition-colors"
              :class="activeMode === 'orbit' ? 'bg-stone-800 text-white border-stone-900 shadow-[2px_2px_0px_#202220]' : 'bg-white text-stone-800 border-stone-300 hover:border-stone-900'"
            >
              🔄 ORBIT
            </button>
          </div>

          <!-- Brush Size Presets & Slider -->
          <div class="flex items-center gap-1.5 border-r-2 border-stone-300 pr-2 mr-1">
            <span class="text-stone-500 uppercase font-bold text-[10px]">BRUSH:</span>
            <button
              type="button"
              @click="setBrushRadius(15)"
              class="px-1.5 py-0.5 border border-stone-900 transition-colors uppercase font-bold"
              :class="brushRadius === 15 ? 'bg-stone-900 text-white' : 'bg-white hover:bg-stone-100'"
            >
              Fine (15)
            </button>
            <button
              type="button"
              @click="setBrushRadius(35)"
              class="px-1.5 py-0.5 border border-stone-900 transition-colors uppercase font-bold"
              :class="brushRadius === 35 ? 'bg-stone-900 text-white' : 'bg-white hover:bg-stone-100'"
            >
              Medium (35)
            </button>
            <button
              type="button"
              @click="setBrushRadius(70)"
              class="px-1.5 py-0.5 border border-stone-900 transition-colors uppercase font-bold"
              :class="brushRadius === 70 ? 'bg-stone-900 text-white' : 'bg-white hover:bg-stone-100'"
            >
              Wide (70)
            </button>
            <input
              type="range"
              min="5"
              max="100"
              v-model.number="brushRadius"
              class="w-20 accent-[#b94d27] cursor-pointer"
            />
            <span class="text-stone-700 w-8 text-right font-bold">{{ brushRadius }}px</span>
          </div>

          <!-- Undo & Clear Actions -->
          <div class="flex items-center gap-1 border-r-2 border-stone-300 pr-2 mr-1">
            <button
              type="button"
              @click="handleUndo"
              :disabled="undoStack.length === 0"
              class="px-2 py-1 uppercase font-bold border-2 border-stone-900 transition-colors shadow-[2px_2px_0px_#202220] disabled:opacity-40 disabled:cursor-not-allowed"
              :class="undoStack.length > 0 ? 'bg-white hover:bg-stone-100 text-stone-900' : 'bg-stone-100 text-stone-400'"
            >
              ⤺ UNDO ({{ undoStack.length }})
            </button>
            <button
              type="button"
              @click="handleClearPart"
              class="px-2 py-1 uppercase font-bold border-2 border-stone-900 bg-white hover:bg-red-50 text-red-600 transition-colors shadow-[2px_2px_0px_#202220]"
            >
              🗑️ CLEAR PART
            </button>
          </div>

          <!-- Color Testing Mode Toggle -->
          <button
            type="button"
            @click="toggleTestColors"
            class="px-2.5 py-1 uppercase font-bold border-2 border-stone-900 transition-colors shadow-[2px_2px_0px_#202220]"
            :class="isTestingColors ? 'bg-amber-400 text-stone-900' : 'bg-white hover:bg-stone-100 text-stone-900'"
          >
            🎨 {{ isTestingColors ? 'TEST COLORS ACTIVE' : 'TEST COLORS' }}
          </button>

          <!-- Reset Camera -->
          <button
            type="button"
            @click="resetCamera"
            class="px-2 py-1 uppercase font-bold border-2 border-stone-900 bg-white hover:bg-stone-100 text-stone-700 transition-colors shadow-[2px_2px_0px_#202220]"
            title="Reset 3D Camera view"
          >
            🎯 RESET VIEW
          </button>
        </div>

        <!-- 3D Canvas Mount Point -->
        <div
          ref="canvasContainer"
          class="w-full h-full cursor-crosshair"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointerenter="onPointerEnter"
          @pointerleave="onPointerLeave"
        />

        <!-- Visual Brush Pointer Indicator -->
        <div
          v-if="activeMode !== 'orbit' && isPointerOverCanvas"
          ref="cursorIndicator"
          class="pointer-events-none fixed z-50 rounded-full -translate-x-1/2 -translate-y-1/2 transition-transform duration-75"
          :class="activeMode === 'erase' ? 'border-2 border-red-500 border-dashed bg-red-500/10' : 'border-2 border-stone-900 border-solid bg-amber-500/20'"
          :style="{
            left: `${cursorPos.x}px`,
            top: `${cursorPos.y}px`,
            width: `${brushRadius * 2}px`,
            height: `${brushRadius * 2}px`,
          }"
        />

        <!-- Model Loading State -->
        <div
          v-if="isLoadingModel"
          class="absolute inset-0 z-30 bg-stone-900/60 backdrop-blur-xs flex flex-col items-center justify-center gap-3 text-white font-mono"
        >
          <div class="w-10 h-10 border-4 border-white/20 border-t-[#b94d27] rounded-full animate-spin" />
          <p class="text-sm font-bold uppercase tracking-widest">LOADING 3D SHOE MODEL...</p>
        </div>

        <!-- Model Load Error -->
        <div
          v-if="modelLoadError"
          class="absolute inset-0 z-30 bg-stone-900/80 flex flex-col items-center justify-center p-6 text-white font-mono text-center"
        >
          <p class="text-red-400 font-bold mb-2 uppercase text-base">⚠️ FAILED TO LOAD MODEL</p>
          <p class="text-stone-300 text-xs mb-4 max-w-md">{{ modelLoadError }}</p>
          <button
            type="button"
            @click="handleCancel"
            class="px-4 py-2 bg-[#b94d27] text-white font-bold uppercase border-2 border-stone-900 shadow-[4px_4px_0px_#202220]"
          >
            CLOSE STUDIO
          </button>
        </div>

        <!-- Floating Hint Footer -->
        <div class="absolute bottom-3 left-4 z-10 bg-stone-900/80 backdrop-blur-xs text-white px-3 py-1.5 font-mono text-[11px] border border-stone-700 uppercase flex items-center gap-3">
          <span>💡 LEFT-CLICK & DRAG TO {{ activeMode === 'erase' ? 'ERASE' : 'PAINT' }}</span>
          <span>·</span>
          <span>RIGHT-CLICK TO ROTATE</span>
          <span>·</span>
          <span>TOTAL FACES: {{ totalFaces.toLocaleString() }}</span>
        </div>
      </div>

      <!-- Right Sidebar: Parts & Swatches Panel -->
      <aside class="w-80 lg:w-96 bg-[#fcfdfb] border-l-2 border-stone-900 flex flex-col overflow-y-auto">
        <!-- Sidebar Header -->
        <div class="p-4 border-b-2 border-stone-900 bg-stone-100">
          <h3 class="font-mono font-black text-sm uppercase tracking-wide text-stone-900">
            KICKCRAFT SHOE PARTS (8)
          </h3>
          <p class="font-mono text-xs text-stone-600 mt-1">
            Select a part to paint or erase on the 3D surface
          </p>
        </div>

        <!-- Part Selector List -->
        <div class="p-4 space-y-2 flex-1">
          <button
            v-for="(part, idx) in PARTS_CONFIG"
            :key="part.id"
            type="button"
            @click="selectedPartIndex = idx"
            class="w-full text-left p-3 border-2 transition-all font-mono flex items-center justify-between"
            :class="selectedPartIndex === idx
              ? 'bg-[#b94d27] text-white border-stone-900 shadow-[4px_4px_0px_#202220]'
              : 'bg-white hover:bg-stone-50 text-stone-900 border-stone-900 shadow-[2px_2px_0px_#202220]'"
          >
            <div class="flex items-center gap-3">
              <!-- Distinctive Display Color Chip -->
              <span
                class="w-5 h-5 rounded-none border border-stone-900 shrink-0 shadow-[1px_1px_0px_#202220]"
                :style="{ backgroundColor: isTestingColors ? (testColors[part.id] || part.defaultColor) : part.displayColor }"
              />
              <div>
                <span class="font-black text-xs uppercase block">{{ part.label }}</span>
                <span
                  class="text-[10px] uppercase block"
                  :class="selectedPartIndex === idx ? 'text-stone-200' : 'text-stone-500'"
                >
                  {{ part.material }}
                </span>
              </div>
            </div>

            <!-- Face Count & Coverage Badge -->
            <div class="text-right">
              <span
                class="text-xs font-bold block"
                :class="selectedPartIndex === idx ? 'text-white' : 'text-stone-900'"
              >
                {{ partStats[idx].coveragePercent }}%
              </span>
              <span
                class="text-[10px] block"
                :class="selectedPartIndex === idx ? 'text-stone-200' : 'text-stone-400'"
              >
                {{ partStats[idx].faceCount.toLocaleString() }} faces
              </span>
            </div>
          </button>
        </div>

        <!-- Color Testing Swatch Palette -->
        <div v-if="isTestingColors" class="p-4 border-t-2 border-stone-900 bg-amber-50">
          <div class="flex items-center justify-between mb-2">
            <h4 class="font-mono font-bold text-xs uppercase text-stone-900">
              🎨 TEST SWATCH FOR {{ PARTS_CONFIG[selectedPartIndex]?.label }}
            </h4>
            <span
              class="w-4 h-4 border border-stone-900 shadow-[1px_1px_0px_#202220]"
              :style="{ backgroundColor: testColors[selectedPartId] }"
            />
          </div>
          <div class="grid grid-cols-4 gap-2">
            <button
              v-for="swatch in SIGNATURE_SWATCHES"
              :key="swatch.hex"
              type="button"
              @click="selectTestColor(swatch.hex)"
              class="p-1 border-2 border-stone-900 bg-white hover:scale-105 transition-transform flex flex-col items-center gap-1 shadow-[2px_2px_0px_#202220]"
            >
              <span class="w-full h-5 border border-stone-400" :style="{ backgroundColor: swatch.hex }" />
              <span class="font-mono text-[9px] uppercase font-bold text-stone-700 truncate w-full text-center">
                {{ swatch.name }}
              </span>
            </button>
          </div>
        </div>

        <!-- Action / Save Section -->
        <div class="p-4 border-t-2 border-stone-900 bg-stone-100 font-mono space-y-3">
          <!-- Coverage Summary -->
          <div class="flex items-center justify-between text-xs text-stone-600 font-bold uppercase">
            <span>TOTAL COVERAGE:</span>
            <span>{{ overallCoveragePercent }}% ({{ totalAssignedFaces.toLocaleString() }} / {{ totalFaces.toLocaleString() }})</span>
          </div>

          <!-- Validation Warning -->
          <div
            v-if="validationError"
            class="p-2.5 bg-red-100 border-2 border-red-600 text-red-800 text-xs font-bold uppercase"
          >
            ⚠️ {{ validationError }}
          </div>

          <!-- Save Success Message -->
          <div
            v-if="saveSuccessMessage"
            class="p-2.5 bg-emerald-100 border-2 border-emerald-600 text-emerald-800 text-xs font-bold uppercase"
          >
            ✓ {{ saveSuccessMessage }}
          </div>

          <!-- Minimum 2 Parts Notice -->
          <div
            v-if="!canSave && !validationError"
            class="p-2 bg-amber-50 border border-amber-400 text-amber-800 text-[11px] font-bold uppercase"
          >
            ℹ️ AT LEAST 2 DISTINCT PARTS MUST HAVE PAINTED FACES BEFORE SAVING
          </div>

          <!-- Primary Save Button -->
          <button
            type="button"
            @click="handleSave"
            :disabled="isSaving || isLoadingModel"
            class="w-full py-3 bg-[#b94d27] hover:bg-[#a03f1e] text-white font-mono font-black text-sm uppercase tracking-wider border-2 border-stone-900 shadow-[4px_4px_0px_#202220] transition-transform active:translate-x-0.5 active:translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span v-if="isSaving">EXPORTING & SAVING...</span>
            <span v-else>💾 SAVE & UPDATE DRAFT</span>
          </button>

          <!-- Cancel / Close Button -->
          <button
            type="button"
            @click="handleCancel"
            class="w-full py-2 bg-white hover:bg-stone-50 text-stone-800 font-mono font-bold text-xs uppercase border-2 border-stone-900 shadow-[2px_2px_0px_#202220] transition-colors"
          >
            CANCEL
          </button>
        </div>
      </aside>
    </div>

    <!-- Clear Part Confirmation Dialog -->
    <div
      v-if="showClearConfirm"
      class="fixed inset-0 z-60 bg-stone-900/70 flex items-center justify-center p-4"
    >
      <div class="bg-[#fcfdfb] border-2 border-stone-900 shadow-[6px_6px_0px_#202220] max-w-sm w-full p-5 font-mono">
        <h4 class="font-black text-sm uppercase text-stone-900 mb-2">
          ⚠️ CLEAR {{ PARTS_CONFIG[selectedPartIndex]?.label }} PAINT?
        </h4>
        <p class="text-xs text-stone-600 mb-4 leading-relaxed">
          Are you sure you want to clear all painted faces for
          <strong class="text-stone-900">{{ PARTS_CONFIG[selectedPartIndex]?.label }}</strong>?
          This action can be undone with the Undo button.
        </p>
        <div class="flex items-center justify-end gap-2">
          <button
            type="button"
            @click="showClearConfirm = false"
            class="px-3 py-1.5 text-xs font-bold uppercase bg-stone-100 hover:bg-stone-200 text-stone-700 border-2 border-stone-900 shadow-[2px_2px_0px_#202220]"
          >
            CANCEL
          </button>
          <button
            type="button"
            @click="confirmClearPart"
            class="px-3 py-1.5 text-xs font-bold uppercase bg-red-600 hover:bg-red-700 text-white border-2 border-stone-900 shadow-[2px_2px_0px_#202220]"
          >
            YES, CLEAR PART
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
