<script setup>
import { ref, computed, watch, onMounted } from 'vue'

const props = defineProps({
  glbPath: {
    type: String,
    required: true,
  },
  meshMap: {
    type: Object,
    required: true,
  },
  initialColors: {
    type: Object,
    default: () => ({}),
  },
  initialCharm: {
    type: String,
    default: 'none',
  },
})

const emit = defineEmits(['complete', 'back'])

// KickCraft signature colors
const PALETTE = [
  { id: 'chalk', name: 'Chalk', hex: '#f1efe8', border: '#d9dcd8' },
  { id: 'graphite', name: 'Graphite', hex: '#292b2d', border: '#1a1b1c' },
  { id: 'terracotta', name: 'Terracotta', hex: '#b94d27', border: '#8b381a' },
  { id: 'cobalt', name: 'Cobalt', hex: '#245fa8', border: '#174075' },
  { id: 'sage', name: 'Sage', hex: '#7d9b76', border: '#5b7455' },
  { id: 'olive', name: 'Olive', hex: '#52684f', border: '#3b4c39' },
  { id: 'gold', name: 'Gold', hex: '#d4af37', border: '#a68824' },
  { id: 'crimson', name: 'Crimson', hex: '#963a20', border: '#6c2815' },
  { id: 'white', name: 'Pure White', hex: '#ffffff', border: '#d9dcd8' },
]

// Accessory charms
const CHARMS = [
  { id: 'none', label: 'None', description: 'No accessory charm', icon: '⊘', src: null },
  { id: 'star', label: 'Star', description: 'KickCraft star emblem', icon: '★', src: '/models/charms/star-charm.glb' },
  { id: 'k-tag', label: 'K-Tag', description: 'KickCraft signature tag', icon: '🏷', src: '/models/charms/k-tag-charm.glb' },
  { id: 'lightning', label: 'Lightning', description: 'Electric bolt accessory', icon: '⚡', src: '/models/charms/lightning-charm.glb' },
]

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

// State
const viewer = ref(null)
const modelReady = ref(false)
const modelError = ref('')
const partColors = ref({ ...props.initialColors })
const selectedCharm = ref(props.initialCharm || 'none')
const activePart = ref(Object.keys(props.meshMap)[0] || 'Upper')

const charmModels = computed(() => CHARMS.filter((c) => c.src))

const mappedParts = computed(() => {
  return Object.keys(props.meshMap).map((partId) => {
    const mapping = props.meshMap[partId]
    const meshName = typeof mapping === 'object' && mapping?.meshName ? mapping.meshName : mapping
    return {
      id: partId,
      label: PART_LABELS[partId] || partId,
      meshName: meshName || partId,
      color: partColors.value[partId] || '#ffffff',
    }
  })
})

const activePartObj = computed(() => {
  return (
    mappedParts.value.find((p) => p.id === activePart.value) ||
    mappedParts.value[0] || { id: activePart.value, label: activePart.value }
  )
})

const currentPartColor = computed(() => {
  return partColors.value[activePart.value] || '#ffffff'
})

const customizedPartsCount = computed(() => {
  return Object.keys(partColors.value).length
})

function getMeshNameForPart(partId) {
  const mapping = props.meshMap[partId]
  if (typeof mapping === 'object' && mapping?.meshName) {
    return mapping.meshName
  }
  return mapping || partId
}

function applyColorToViewer(partId, colorHex) {
  if (!viewer.value || !modelReady.value) return
  const meshName = getMeshNameForPart(partId)
  if (!meshName) return

  try {
    const material = viewer.value?.model?.getMaterialByName(meshName)
    if (material && material.pbrMetallicRoughness) {
      material.pbrMetallicRoughness.setBaseColorFactor(colorHex)
    } else if (viewer.value?.model?.materials) {
      const mat = viewer.value.model.materials.find((m) => m.name === meshName)
      if (mat && mat.pbrMetallicRoughness) {
        mat.pbrMetallicRoughness.setBaseColorFactor(colorHex)
      }
    }
  } catch (err) {
    console.warn('Failed to apply color to 3D model:', err)
  }
}

function onModelLoaded() {
  modelReady.value = true
  modelError.value = ''
  // Apply all existing part colors
  for (const [partId, colorHex] of Object.entries(partColors.value)) {
    if (colorHex) {
      applyColorToViewer(partId, colorHex)
    }
  }
}

function handleModelError() {
  modelReady.value = false
  modelError.value = 'Failed to load 3D shoe model preview.'
}

function selectPart(partId) {
  activePart.value = partId
}

function setColor(colorHex) {
  if (!activePart.value) return
  partColors.value = {
    ...partColors.value,
    [activePart.value]: colorHex,
  }
  applyColorToViewer(activePart.value, colorHex)
}

const chooseColor = setColor

function selectCharm(charmId) {
  selectedCharm.value = charmId
}

function getCharmScale(charmId) {
  return charmId === selectedCharm.value ? '1 1 1' : '0 0 0'
}

function resetAllColors() {
  const nextColors = {}
  for (const part of mappedParts.value) {
    nextColors[part.id] = '#ffffff'
    applyColorToViewer(part.id, '#ffffff')
  }
  partColors.value = nextColors
}

function handleComplete() {
  emit('complete', {
    partColors: { ...partColors.value },
    charmId: selectedCharm.value,
  })
}

function handleBack() {
  emit('back')
}
</script>

<template>
  <div class="bg-[#fcfdfb] border-2 border-stone-900 shadow-[6px_6px_0px_#202220] p-6 lg:p-8">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b-2 border-stone-900 mb-6">
      <div>
        <div class="flex items-center gap-3">
          <span class="px-2.5 py-0.5 bg-[#b94d27] text-white font-mono text-xs font-bold uppercase tracking-wider">
            STEP 3 OF 4
          </span>
          <h2 class="font-mono text-xl sm:text-2xl font-black text-stone-900 uppercase tracking-tight">
            Product Customizer
          </h2>
        </div>
        <p class="mt-1 text-sm text-stone-600">
          Configure default shoe part colors and select an accessory charm for your product listing.
        </p>
      </div>

      <!-- Quick stats badge -->
      <div class="flex items-center gap-3 font-mono text-xs bg-stone-100 border border-stone-900 px-3 py-2 self-start sm:self-auto">
        <span class="text-stone-500 uppercase">PARTS MAPPED:</span>
        <span class="font-bold text-stone-900">{{ mappedParts.length }}</span>
        <span class="text-stone-300">|</span>
        <span class="text-stone-500 uppercase">CHARM:</span>
        <span class="font-bold text-[#b94d27] uppercase">{{ selectedCharm }}</span>
      </div>
    </div>

    <!-- Main 2-Column Grid -->
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
      <!-- Left Column: 3D Model Viewer (7 cols) -->
      <div class="lg:col-span-7 flex flex-col">
        <div class="border-2 border-stone-900 bg-stone-100 relative flex-1 flex flex-col min-h-[480px]">
          <!-- 3D Header Bar -->
          <div class="bg-stone-200 border-b-2 border-stone-900 px-3 py-2 flex items-center justify-between font-mono text-xs">
            <div class="flex items-center gap-2">
              <span
                class="size-2 rounded-full"
                :class="modelReady ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'"
              ></span>
              <span class="font-bold text-stone-800 uppercase tracking-wider">3D Model Preview</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-stone-500 text-[11px] uppercase">Active:</span>
              <span class="bg-white border border-stone-900 px-2 py-0.5 text-stone-900 font-bold text-[11px]">
                {{ activePartObj.label }}
              </span>
            </div>
          </div>

          <!-- Model Viewer Container -->
          <div class="relative flex-1 bg-stone-50 flex items-center justify-center overflow-hidden min-h-[420px]">
            <model-viewer
              ref="viewer"
              :src="glbPath"
              camera-controls
              auto-rotate
              shadow-intensity="1"
              camera-orbit="45deg 75deg 105%"
              interaction-prompt="auto"
              style="width: 100%; height: 100%; position: absolute; inset: 0;"
              @load="onModelLoaded"
              @error="handleModelError"
            >
              <extra-model
                v-for="charm in charmModels"
                :key="charm.id"
                :src="charm.src"
                :scale="getCharmScale(charm.id)"
              />
            </model-viewer>

            <!-- Loading overlay -->
            <div
              v-if="!modelReady && !modelError"
              class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center bg-stone-100/90 z-10"
              role="status"
              aria-label="Loading 3D model"
            >
              <div class="size-10 border-4 border-stone-300 border-t-[#b94d27] rounded-full animate-spin"></div>
              <p class="font-mono text-xs uppercase tracking-wider text-stone-600 mt-4">
                Loading 3D Canvas...
              </p>
            </div>

            <!-- Error state -->
            <div
              v-if="modelError"
              class="absolute inset-0 flex items-center justify-center p-6 bg-stone-100/95 z-10"
              role="alert"
            >
              <div class="border-2 border-red-600 bg-white p-5 max-w-sm text-center shadow-[4px_4px_0px_#dc2626]">
                <div class="text-red-600 text-2xl mb-2 font-mono">⚠️</div>
                <h3 class="font-mono text-sm font-bold text-stone-900 uppercase">Model Error</h3>
                <p class="mt-1 text-xs text-stone-600">{{ modelError }}</p>
              </div>
            </div>

            <!-- Camera guide footer badge -->
            <div class="absolute bottom-3 left-3 bg-stone-900/80 backdrop-blur-xs text-white px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider pointer-events-none">
              Rotate: Click + Drag · Zoom: Scroll
            </div>
          </div>
        </div>

        <!-- Reset Button -->
        <div class="mt-3 flex justify-between items-center text-xs font-mono">
          <span class="text-stone-500">
            Selected charm: <strong class="text-stone-900 uppercase">{{ selectedCharm }}</strong>
          </span>
          <button
            type="button"
            class="text-stone-600 hover:text-stone-900 underline cursor-pointer"
            @click="resetAllColors"
          >
            Reset All Colors to White
          </button>
        </div>
      </div>

      <!-- Right Column: Controls Panel (5 cols) -->
      <div class="lg:col-span-5 flex flex-col justify-between space-y-6">
        <div class="space-y-6">
          <!-- Section 1: Part Selection & Colors -->
          <div class="border-2 border-stone-900 bg-white p-4 shadow-[3px_3px_0px_#202220]">
            <div class="flex items-center justify-between pb-3 border-b border-stone-200 mb-3">
              <h3 class="font-mono text-xs font-bold text-stone-900 uppercase tracking-wider">
                1. Select Part to Recolor
              </h3>
              <span class="font-mono text-[10px] bg-stone-100 text-stone-600 px-2 py-0.5 border border-stone-300">
                {{ mappedParts.length }} PARTS
              </span>
            </div>

            <!-- Part Selection Chips -->
            <div class="grid grid-cols-2 gap-2 mb-4">
              <button
                v-for="part in mappedParts"
                :key="part.id"
                type="button"
                class="flex items-center justify-between p-2 border text-left cursor-pointer transition-all font-mono text-xs"
                :class="activePart === part.id
                  ? 'border-2 border-stone-900 bg-[#b94d27]/10 font-bold shadow-[2px_2px_0px_#202220]'
                  : 'border-stone-300 bg-stone-50 hover:bg-stone-100 text-stone-700'"
                @click="selectPart(part.id)"
              >
                <span class="truncate">{{ part.label }}</span>
                <span
                  class="size-4 rounded-full border border-stone-900 ml-2 shrink-0 shadow-xs"
                  :style="{ backgroundColor: partColors[part.id] || '#ffffff' }"
                  :title="`Current: ${partColors[part.id] || '#ffffff'}`"
                ></span>
              </button>
            </div>

            <!-- Color Palette Header -->
            <div class="flex items-center justify-between mb-2">
              <span class="font-mono text-[11px] font-bold text-stone-800 uppercase">
                Color Palette for {{ activePartObj.label }}:
              </span>
              <span class="font-mono text-[10px] text-stone-500 uppercase">
                Current: <strong class="text-stone-900">{{ currentPartColor }}</strong>
              </span>
            </div>

            <!-- Color Picker Swatches Grid -->
            <div class="grid grid-cols-5 gap-2 p-3 bg-stone-100 border border-stone-900">
              <button
                v-for="color in PALETTE"
                :key="color.id"
                type="button"
                class="group relative flex flex-col items-center justify-center p-1.5 border cursor-pointer transition-transform hover:scale-105 active:scale-95"
                :class="currentPartColor.toLowerCase() === color.hex.toLowerCase()
                  ? 'border-2 border-stone-900 bg-white ring-2 ring-[#b94d27] ring-offset-1'
                  : 'border-stone-400 bg-white hover:border-stone-900'"
                :title="`${color.name} (${color.hex})`"
                @click="setColor(color.hex)"
              >
                <div
                  class="size-6 sm:size-7 rounded-sm border border-stone-900 shadow-xs"
                  :style="{ backgroundColor: color.hex }"
                ></div>
                <span class="mt-1 font-mono text-[9px] text-stone-800 font-semibold truncate w-full text-center">
                  {{ color.name }}
                </span>
              </button>
            </div>
          </div>

          <!-- Section 2: Accessory Charm -->
          <div class="border-2 border-stone-900 bg-white p-4 shadow-[3px_3px_0px_#202220]">
            <div class="flex items-center justify-between pb-3 border-b border-stone-200 mb-3">
              <h3 class="font-mono text-xs font-bold text-stone-900 uppercase tracking-wider">
                2. Accessory Charm
              </h3>
              <span class="font-mono text-[10px] text-[#b94d27] font-bold uppercase">
                ✦ 3D ATTACHMENT
              </span>
            </div>

            <div class="grid grid-cols-2 gap-2">
              <button
                v-for="charm in CHARMS"
                :key="charm.id"
                type="button"
                class="flex items-start gap-2.5 p-2.5 border text-left cursor-pointer transition-all font-mono"
                :class="selectedCharm === charm.id
                  ? 'border-2 border-stone-900 bg-[#b94d27]/10 font-bold shadow-[2px_2px_0px_#202220]'
                  : 'border-stone-300 bg-stone-50 hover:bg-stone-100 text-stone-700'"
                @click="selectCharm(charm.id)"
              >
                <span class="text-lg leading-none mt-0.5">{{ charm.icon }}</span>
                <div class="min-w-0 flex-1">
                  <div class="text-xs font-bold text-stone-900 flex items-center justify-between">
                    <span>{{ charm.label }}</span>
                    <span v-if="selectedCharm === charm.id" class="text-[10px] text-[#b94d27]">✓</span>
                  </div>
                  <div class="text-[10px] text-stone-500 leading-tight mt-0.5 truncate">
                    {{ charm.description }}
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>

        <!-- Footer Actions -->
        <div class="pt-4 border-t-2 border-stone-900 flex items-center justify-between gap-4">
          <button
            type="button"
            class="px-4 py-2 bg-stone-100 text-stone-900 border-2 border-stone-900 font-mono text-xs uppercase tracking-wider font-bold hover:bg-stone-200 transition-colors cursor-pointer shadow-[2px_2px_0px_#202220] active:translate-x-0.5 active:translate-y-0.5"
            @click="handleBack"
          >
            ← Back to Mesh Tagger
          </button>

          <button
            type="button"
            class="px-5 py-2 bg-[#b94d27] text-white border-2 border-stone-900 font-mono text-xs uppercase tracking-wider font-bold hover:bg-[#a04220] transition-colors cursor-pointer shadow-[2px_2px_0px_#202220] active:translate-x-0.5 active:translate-y-0.5"
            @click="handleComplete"
          >
            Save & Continue →
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
