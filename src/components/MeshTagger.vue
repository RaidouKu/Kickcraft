<script setup>
import { ref, computed, onMounted } from 'vue'

const props = defineProps({
  glbPath: {
    type: String,
    required: true,
  },
  initialMeshMap: {
    type: Object,
    default: () => ({}),
  },
})

const emit = defineEmits(['complete', 'cancel'])

const KICKCRAFT_PARTS = [
  { id: 'Upper', label: 'Upper Main', description: 'Main shoe body and top fabric' },
  { id: 'ToeCap', label: 'Toe Cap', description: 'Front toe guard reinforcement' },
  { id: 'Tongue', label: 'Tongue', description: 'Shoe tongue under the laces' },
  { id: 'Laces', label: 'Laces', description: 'Shoelace strings and eyelet area' },
  { id: 'HeelPanel', label: 'Heel Panel', description: 'Rear heel counter support' },
  { id: 'SideAccents', label: 'Side Accents', description: 'Side accents, overlays, and branding' },
  { id: 'Midsole', label: 'Midsole Cushion', description: 'Middle cushioning foam layer' },
  { id: 'Outsole', label: 'Outsole Tread', description: 'Bottom rubber grip surface' },
]

const DEFAULT_MESH_CANDIDATES = [
  'UpperMaterial',
  'ToeCapMaterial',
  'TongueMaterial',
  'LacesMaterial',
  'HeelPanelMaterial',
  'SideAccentsMaterial',
  'MidsoleMaterial',
  'OutsoleMaterial',
]

// State
const meshMap = ref({ ...props.initialMeshMap })
const selectedPartId = ref('Upper')
const detectedMeshes = ref([])
const isScanning = ref(false)
const autoDetectFeedback = ref('')
const customMeshInput = ref('')
const viewer = ref(null)
const viewerExposure = ref(2.4)

const mappedCount = computed(() => Object.keys(meshMap.value).length)
const canComplete = computed(() => {
  if (mappedCount.value >= 3) return true
  if (detectedMeshes.value.length > 0 && detectedMeshes.value.length < 3) {
    return mappedCount.value >= detectedMeshes.value.length
  }
  return false
})

const selectedPart = computed(() => {
  return KICKCRAFT_PARTS.find((p) => p.id === selectedPartId.value) || KICKCRAFT_PARTS[0]
})

const unassignedMeshes = computed(() => {
  const assigned = Object.values(meshMap.value)
  return detectedMeshes.value.filter((mesh) => !assigned.includes(mesh))
})

// Auto-detection heuristic
function matchPartForMesh(name) {
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

function onModelLoaded() {
  extractModelMaterials()
  try {
    const materials = viewer.value?.model?.materials || []
    materials.forEach((mat) => {
      if (mat?.pbrMetallicRoughness) {
        mat.pbrMetallicRoughness.setMetallicFactor(0.0)
        if (typeof mat.pbrMetallicRoughness.roughnessFactor === 'number' && mat.pbrMetallicRoughness.roughnessFactor < 0.75) {
          mat.pbrMetallicRoughness.setRoughnessFactor(0.85)
        }
      }
    })
  } catch (_) {}
}

function extractModelMaterials() {
  try {
    const materials = viewer.value?.model?.materials || []
    const names = materials
      .map((m) => m?.name)
      .filter((name) => typeof name === 'string' && name.trim().length > 0)

    if (names.length > 0) {
      detectedMeshes.value = Array.from(new Set(names))
    } else if (detectedMeshes.value.length === 0) {
      detectedMeshes.value = [...DEFAULT_MESH_CANDIDATES]
    }
  } catch (_) {
    if (detectedMeshes.value.length === 0) {
      detectedMeshes.value = [...DEFAULT_MESH_CANDIDATES]
    }
  }
}

function autoDetectMeshes() {
  isScanning.value = true
  autoDetectFeedback.value = ''

  try {
    extractModelMaterials()
    const pool =
      detectedMeshes.value.length > 0 ? detectedMeshes.value : DEFAULT_MESH_CANDIDATES

    let newlyMapped = 0
    const nextMap = { ...meshMap.value }

    for (const meshName of pool) {
      const partId = matchPartForMesh(meshName)
      if (partId && !nextMap[partId]) {
        nextMap[partId] = meshName
        newlyMapped++
      }
    }

    meshMap.value = nextMap

    const totalNow = Object.keys(meshMap.value).length
    if (totalNow === 8) {
      autoDetectFeedback.value = '✓ All 8 customizable parts auto-detected and mapped!'
    } else if (newlyMapped > 0) {
      autoDetectFeedback.value = `⚡ Auto-detected ${newlyMapped} parts! (${totalNow}/8 mapped)`
    } else if (totalNow >= 3) {
      autoDetectFeedback.value = `Model already has ${totalNow} parts mapped.`
    } else {
      autoDetectFeedback.value =
        'No matching mesh names detected automatically. Please assign manually below.'
    }
  } finally {
    isScanning.value = false
  }
}

function assignMesh(partId, meshName) {
  if (!partId || !meshName || typeof meshName !== 'string') return
  const trimmed = meshName.trim()
  if (!trimmed) return

  meshMap.value = {
    ...meshMap.value,
    [partId]: trimmed,
  }
  customMeshInput.value = ''
}

function unmapPart(partId) {
  if (!partId || !meshMap.value[partId]) return
  const updated = { ...meshMap.value }
  delete updated[partId]
  meshMap.value = updated
}

function handleCustomAssign() {
  if (customMeshInput.value.trim()) {
    assignMesh(selectedPartId.value, customMeshInput.value.trim())
  }
}

function handleComplete() {
  if (!canComplete.value) return
  emit('complete', meshMap.value)
}

function handleCancel() {
  emit('cancel')
}

onMounted(() => {
  if (viewer.value) {
    extractModelMaterials()
  }
})
</script>

<template>
  <div class="w-full bg-[#fcfdfb] border-2 border-stone-900 shadow-[6px_6px_0px_#202220] p-6 text-stone-900">
    <!-- Header -->
    <div class="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b-2 border-stone-900 gap-4">
      <div>
        <div class="flex items-center gap-2">
          <span class="px-2 py-0.5 bg-[#b94d27] text-white font-mono text-xs uppercase tracking-wider font-bold">
            Step 4: Tag Meshes
          </span>
          <h2 class="text-xl md:text-2xl font-black uppercase tracking-tight">
            Visual Mesh Tagger
          </h2>
        </div>
        <p class="text-stone-600 text-sm mt-1">
          Map 3D geometry meshes to KickCraft customizable parts. Minimum 3 parts required for interactive customer customization.
        </p>
      </div>

      <div class="flex items-center gap-3">
        <button
          type="button"
          :disabled="isScanning"
          class="inline-flex items-center gap-2 px-4 py-2 bg-stone-900 text-white font-mono text-xs uppercase tracking-wider font-bold border-2 border-stone-900 hover:bg-[#b94d27] hover:border-[#b94d27] transition-colors shadow-[2px_2px_0px_#202220] active:translate-x-0.5 active:translate-y-0.5 disabled:opacity-50 cursor-pointer"
          @click="autoDetectMeshes"
        >
          <span v-if="isScanning" class="animate-spin">⚙</span>
          <span>⚡ AUTO-DETECT MESHES</span>
        </button>
      </div>
    </div>

    <!-- Auto-detect feedback banner -->
    <div
      v-if="autoDetectFeedback"
      class="mt-4 p-3 bg-stone-100 border-2 border-stone-900 font-mono text-xs flex items-center justify-between"
    >
      <span class="font-bold text-stone-800">{{ autoDetectFeedback }}</span>
      <button
        type="button"
        class="text-stone-500 hover:text-stone-900 font-bold ml-2 cursor-pointer"
        @click="autoDetectFeedback = ''"
      >
        ✕
      </button>
    </div>

    <!-- Main Workspace Grid: Left = 3D Model, Right = Mesh Mapping -->
    <div class="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
      <!-- Left Column: 3D Model Viewer -->
      <div class="lg:col-span-6 flex flex-col">
        <div class="flex items-center justify-between mb-2">
          <span class="font-mono text-xs font-bold uppercase tracking-wider text-stone-700">
            3D Model Preview
          </span>
          <span class="font-mono text-[10px] text-stone-500 uppercase">
            Click & Drag to Rotate
          </span>
        </div>

        <div class="relative w-full h-[360px] md:h-[460px] bg-stone-100 border-2 border-stone-900 shadow-[4px_4px_0px_#202220] flex items-center justify-center overflow-hidden">
          <!-- Quick Studio Brightness Control -->
          <div class="absolute top-3 right-3 z-10 flex items-center gap-1 border border-stone-900 bg-white/95 px-2 py-1 shadow-[2px_2px_0px_#202220] font-mono text-[10px]">
            <span class="font-bold text-stone-600">LIGHT:</span>
            <button type="button" @click="viewerExposure = 1.4" :class="viewerExposure === 1.4 ? 'bg-stone-900 text-white font-bold' : 'text-stone-700 hover:bg-stone-200'" class="px-1.5 py-0.5 transition-colors">STD</button>
            <button type="button" @click="viewerExposure = 1.9" :class="viewerExposure === 1.9 ? 'bg-stone-900 text-white font-bold' : 'text-stone-700 hover:bg-stone-200'" class="px-1.5 py-0.5 transition-colors">BRIGHT</button>
            <button type="button" @click="viewerExposure = 2.4" :class="viewerExposure === 2.4 ? 'bg-[#b94d27] text-white font-bold' : 'text-stone-700 hover:bg-stone-200'" class="px-1.5 py-0.5 transition-colors">MAX</button>
          </div>

          <model-viewer
            ref="viewer"
            :src="glbPath"
            class="w-full h-full"
            auto-rotate
            camera-controls
            shadow-intensity="0.25"
            shadow-softness="1"
            :exposure="viewerExposure"
            environment-image="neutral"
            tone-mapping="neutral"
            interaction-prompt="none"
            @load="onModelLoaded"
          >
          </model-viewer>

          <!-- Current active part tag overlay -->
          <div class="absolute bottom-3 left-3 bg-[#fcfdfb] border-2 border-stone-900 px-3 py-1.5 shadow-[2px_2px_0px_#202220] pointer-events-none">
            <div class="font-mono text-[10px] text-stone-500 uppercase">Selected Part</div>
            <div class="font-bold text-xs uppercase">{{ selectedPart.label }}</div>
          </div>
        </div>
      </div>

      <!-- Right Column: Tagging Workspace -->
      <div class="lg:col-span-6 flex flex-col justify-between">
        <div>
          <!-- Progress Tracker Header -->
          <div class="bg-stone-50 border-2 border-stone-900 p-4 mb-4 shadow-[2px_2px_0px_#202220]">
            <div class="flex items-center justify-between mb-1">
              <span class="font-mono text-xs font-bold uppercase tracking-wider">
                TAGGED {{ mappedCount }} OF 8 PARTS
              </span>
              <span
                class="font-mono text-[10px] px-2 py-0.5 border"
                :class="canComplete ? 'bg-emerald-100 border-emerald-900 text-emerald-900 font-bold' : 'bg-amber-100 border-amber-900 text-amber-900 font-bold'"
              >
                {{ canComplete ? '✓ READY' : (detectedMeshes.length > 0 && detectedMeshes.length < 3 ? 'TAG DETECTED MESH' : 'MINIMUM 3 REQUIRED') }}
              </span>
            </div>

            <!-- Progress Bar -->
            <div class="w-full h-2.5 bg-stone-200 border border-stone-900 mt-2 overflow-hidden">
              <div
                class="h-full bg-[#b94d27] transition-all duration-300"
                :style="{ width: `${(mappedCount / 8) * 100}%` }"
              ></div>
            </div>
          </div>

          <!-- Parts Mapping List -->
          <div class="space-y-2 mb-4 max-h-[260px] overflow-y-auto pr-1">
            <div
              v-for="part in KICKCRAFT_PARTS"
              :key="part.id"
              class="flex items-center justify-between p-2.5 border-2 transition-all cursor-pointer"
              :class="[
                selectedPartId === part.id
                  ? 'border-stone-900 bg-stone-100 shadow-[2px_2px_0px_#202220]'
                  : 'border-stone-300 bg-[#fcfdfb] hover:border-stone-900'
              ]"
              @click="selectedPartId = part.id"
            >
              <div class="flex items-center gap-2">
                <span
                  class="w-2.5 h-2.5 border border-stone-900"
                  :class="meshMap[part.id] ? 'bg-[#b94d27]' : 'bg-transparent'"
                ></span>
                <div>
                  <div class="font-bold text-xs uppercase">{{ part.label }}</div>
                  <div class="font-mono text-[10px] text-stone-500">{{ part.description }}</div>
                </div>
              </div>

              <!-- Status Badge / Actions -->
              <div class="flex items-center gap-2" @click.stop>
                <template v-if="meshMap[part.id]">
                  <span class="inline-flex items-center gap-1.5 px-2 py-1 bg-emerald-50 border border-emerald-900 text-emerald-950 font-mono text-[11px] font-bold">
                    ✓ {{ meshMap[part.id] }}
                    <button
                      type="button"
                      title="Unmap this mesh"
                      class="text-stone-500 hover:text-red-700 font-black ml-1 cursor-pointer"
                      @click="unmapPart(part.id)"
                    >
                      ✕
                    </button>
                  </span>
                </template>
                <template v-else>
                  <button
                    type="button"
                    class="px-2 py-1 bg-white border border-stone-900 text-stone-800 font-mono text-[11px] hover:bg-stone-900 hover:text-white transition-colors cursor-pointer"
                    @click="selectedPartId = part.id"
                  >
                    + Assign
                  </button>
                </template>
              </div>
            </div>
          </div>

          <!-- Active Assignment Sub-Panel -->
          <div class="border-2 border-stone-900 bg-stone-50 p-4 shadow-[2px_2px_0px_#202220]">
            <div class="flex items-center justify-between mb-2">
              <span class="font-mono text-xs font-bold uppercase text-stone-700">
                Assign Mesh to: <span class="text-[#b94d27]">{{ selectedPart.label }}</span>
              </span>
              <span v-if="meshMap[selectedPart.id]" class="font-mono text-[10px] text-stone-500">
                Currently: {{ meshMap[selectedPart.id] }}
              </span>
            </div>

            <!-- Manual Input Form -->
            <div class="flex items-center gap-2 mb-3">
              <input
                v-model="customMeshInput"
                type="text"
                placeholder="Enter mesh or material name..."
                class="flex-1 px-3 py-1.5 bg-white border-2 border-stone-900 font-mono text-xs focus:outline-none focus:border-[#b94d27]"
                @keydown.enter.prevent="handleCustomAssign"
              />
              <button
                type="button"
                class="px-3 py-1.5 bg-stone-900 text-white font-mono text-xs uppercase font-bold border-2 border-stone-900 hover:bg-[#b94d27] hover:border-[#b94d27] transition-colors cursor-pointer disabled:opacity-50"
                :disabled="!customMeshInput.trim()"
                @click="handleCustomAssign"
              >
                Set Mesh
              </button>
            </div>

            <!-- Unassigned Detected Meshes Quick-Pick Chips -->
            <div v-if="unassignedMeshes.length > 0">
              <div class="font-mono text-[10px] text-stone-500 uppercase mb-1">
                Detected Unmapped Meshes (Click to assign):
              </div>
              <div class="flex flex-wrap gap-1.5">
                <button
                  v-for="mesh in unassignedMeshes"
                  :key="mesh"
                  type="button"
                  class="px-2 py-0.5 bg-white border border-stone-900 text-stone-900 font-mono text-[10px] hover:bg-[#b94d27] hover:text-white transition-colors cursor-pointer"
                  @click="assignMesh(selectedPart.id, mesh)"
                >
                  + {{ mesh }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer Action Buttons -->
        <div class="pt-6 border-t-2 border-stone-900 mt-6 flex items-center justify-between gap-4">
          <button
            type="button"
            class="px-4 py-2 bg-stone-100 text-stone-900 border-2 border-stone-900 font-mono text-xs uppercase tracking-wider font-bold hover:bg-stone-200 transition-colors cursor-pointer shadow-[2px_2px_0px_#202220] active:translate-x-0.5 active:translate-y-0.5"
            @click="handleCancel"
          >
            ← Back / Cancel
          </button>

          <button
            type="button"
            :disabled="!canComplete"
            class="px-5 py-2 bg-[#b94d27] text-white border-2 border-stone-900 font-mono text-xs uppercase tracking-wider font-bold hover:bg-[#a04220] transition-colors shadow-[2px_2px_0px_#202220] active:translate-x-0.5 active:translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            @click="handleComplete"
          >
            Accept & Continue →
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
