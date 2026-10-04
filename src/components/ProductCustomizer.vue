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
  // When true (AI-generated or single-mesh shoes) only the charm can be chosen;
  // part recoloring is hidden because the model has no separate parts.
  charmOnly: {
    type: Boolean,
    default: false,
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

const viewer = ref(null)
const modelReady = ref(false)
const modelError = ref('')
const viewerExposure = ref(2.4)
const partColors = ref({ ...props.initialColors })
const selectedCharm = ref(props.initialCharm || 'none')
const isSingleMesh = computed(() => Object.keys(props.meshMap || {}).length === 0)
const activePart = ref(Object.keys(props.meshMap || {})[0] || 'shoe')
const customHex = ref('#b94d27')
const hexInput = ref('')
const activeColor = ref('')

const charmModels = computed(() => CHARMS.filter((c) => c.src))

const mappedParts = computed(() => {
  if (props.charmOnly) return []
  const parts = Object.keys(props.meshMap || {}).map((partId) => {
    const mapping = props.meshMap[partId]
    const meshName = typeof mapping === 'object' && mapping?.meshName ? mapping.meshName : mapping
    return {
      id: partId,
      label: PART_LABELS[partId] || partId,
      meshName: meshName || partId,
      color: partColors.value[partId] || '#ffffff',
    }
  })
  if (parts.length === 0) {
    return [
      {
        id: 'shoe',
        label: 'Overall Shoe Color',
        meshName: 'all',
        color: partColors.value['shoe'] || '#ffffff',
      },
    ]
  }
  return parts
})

const activePartObj = computed(() => {
  return (
    mappedParts.value.find((p) => p.id === activePart.value) ||
    mappedParts.value[0] || { id: activePart.value, label: activePart.value }
  )
})

const currentColor = computed(() => {
  return (
    activeColor.value ||
    partColors.value['shoe'] ||
    partColors.value[activePart.value] ||
    Object.values(partColors.value)[0] ||
    '#ffffff'
  )
})

const currentPartColor = computed(() => {
  return currentColor.value
})

const isCustomColorSelected = computed(() => {
  const current = currentColor.value.toLowerCase()
  return !PALETTE.some((p) => p.hex.toLowerCase() === current)
})

function getContrastTextColor(hex) {
  if (!hex) return '#1c1917'
  const clean = hex.replace('#', '')
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16)
    const g = parseInt(clean[1] + clean[1], 16)
    const b = parseInt(clean[2] + clean[2], 16)
    const yiq = (r * 299 + g * 587 + b * 114) / 1000
    return yiq >= 128 ? '#1c1917' : '#ffffff'
  }
  if (clean.length >= 6) {
    const r = parseInt(clean.substring(0, 2), 16)
    const g = parseInt(clean.substring(2, 4), 16)
    const b = parseInt(clean.substring(4, 6), 16)
    const yiq = (r * 299 + g * 587 + b * 114) / 1000
    return yiq >= 128 ? '#1c1917' : '#ffffff'
  }
  return '#1c1917'
}

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
  if (props.charmOnly || !viewer.value || !modelReady.value) return
  try {
    const materials = viewer.value?.model?.materials || []
    if (isSingleMesh.value || partId === 'shoe' || materials.length === 1) {
      if (materials[0]?.pbrMetallicRoughness) {
        materials[0].pbrMetallicRoughness.setBaseColorFactor(colorHex)
      }
      return
    }
    const meshName = getMeshNameForPart(partId)
    if (!meshName) return

    const material = viewer.value?.model?.getMaterialByName(meshName)
    if (material && material.pbrMetallicRoughness) {
      material.pbrMetallicRoughness.setBaseColorFactor(colorHex)
    } else if (materials.length > 0) {
      const mat = materials.find((m) => m.name === meshName)
      if (mat?.pbrMetallicRoughness) {
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
  if (!colorHex) return
  let hex = colorHex.trim()
  if (!hex.startsWith('#') && /^[0-9a-fA-F]{3,8}$/.test(hex)) {
    hex = '#' + hex
  }
  activeColor.value = hex
  customHex.value = hex
  hexInput.value = hex.replace('#', '')

  const nextColors = {}
  if (mappedParts.value.length > 0) {
    for (const part of mappedParts.value) {
      nextColors[part.id] = hex
      applyColorToViewer(part.id, hex)
    }
  } else {
    nextColors['shoe'] = hex
    applyColorToViewer('shoe', hex)
  }
  partColors.value = nextColors
}

const chooseColor = setColor

function onCustomColorInput(event) {
  const val = event?.target?.value || customHex.value
  if (val) {
    setColor(val)
  }
}

function applyCustomColor() {
  if (!hexInput.value) return
  let hex = hexInput.value.trim()
  if (!hex.startsWith('#')) {
    hex = '#' + hex
  }
  if (/^#[0-9a-fA-F]{3,8}$/.test(hex)) {
    setColor(hex)
  }
}

function resetToOriginal() {
  setColor('#ffffff')
}

function selectCharm(charmId) {
  selectedCharm.value = charmId
}

function getCharmScale(charmId) {
  return charmId === selectedCharm.value ? '1 1 1' : '0 0 0'
}

function resetAllColors() {
  resetToOriginal()
}

function handleComplete() {
  emit('complete', {
    partColors: props.charmOnly ? {} : { ...partColors.value },
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
          <template v-if="charmOnly">Select an accessory charm for your product listing. This shoe keeps its original 3D texture.</template>
          <template v-else>Configure default shoe part colors and select an accessory charm for your product listing.</template>
        </p>
      </div>

      <!-- Quick stats badge -->
      <div class="flex items-center gap-3 font-mono text-xs bg-stone-100 border border-stone-900 px-3 py-2 self-start sm:self-auto">
        <span class="text-stone-500 uppercase">{{ charmOnly ? 'COLORS:' : 'COLOR:' }}</span>
        <span class="font-bold text-stone-900">{{ charmOnly ? 'ORIGINAL' : currentColor.toUpperCase() }}</span>
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
            <div v-if="!charmOnly" class="flex items-center gap-2">
              <span class="text-stone-500 text-[11px] uppercase">Color:</span>
              <span class="inline-flex items-center gap-1.5 bg-white border border-stone-900 px-2 py-0.5 text-stone-900 font-bold text-[11px]">
                <span class="size-2.5 rounded-full border border-stone-900" :style="{ backgroundColor: currentColor }"></span>
                <span>{{ currentColor.toUpperCase() }}</span>
              </span>
            </div>
          </div>

          <!-- Model Viewer Container -->
          <div class="relative flex-1 bg-stone-50 flex items-center justify-center overflow-hidden min-h-[420px]">
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
              camera-controls
              auto-rotate
              shadow-intensity="0.25"
              shadow-softness="1"
              :exposure="viewerExposure"
              environment-image="neutral"
              tone-mapping="neutral"
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
            v-if="!charmOnly"
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
          <!-- Single combined mesh notice (when meshes are not editable into parts) -->
          <div
            v-if="isSingleMesh && !charmOnly"
            class="border-2 border-stone-900 bg-[#fffbeb] p-3.5 shadow-[3px_3px_0px_#202220] font-mono text-xs text-stone-800"
          >
            <div class="font-bold uppercase tracking-wider text-[#b45309]">[ SINGLE COMBINED MESH · OVERALL COLOR ]</div>
            <p class="mt-1 text-[11px] leading-relaxed">
              Meshes are not editable into separate parts. You can customize the overall sneaker color below, or choose Pure White to retain the original texture.
            </p>
          </div>

          <!-- Charm-only notice (when explicitly configured) -->
          <div
            v-if="charmOnly"
            class="border-2 border-stone-900 bg-[#fffbeb] p-4 shadow-[3px_3px_0px_#202220] font-mono text-xs text-stone-800"
          >
            <div class="font-bold uppercase tracking-wider text-[#b45309]">[ ORIGINAL 3D TEXTURE ]</div>
            <p class="mt-2 leading-relaxed">
              This shoe is a single 3D mesh with its colors baked into one texture, so its parts can't be recolored separately.
              Customers will see it exactly as photographed and can still pick a charm and size.
              Part recoloring is available for template shoes and multi-part GLB uploads.
            </p>
          </div>

          <!-- Section 1: Sneaker Color & Palette -->
          <div v-if="!charmOnly" class="border-2 border-stone-900 bg-white p-4 shadow-[3px_3px_0px_#202220]">
            <div class="flex items-center justify-between pb-3 border-b border-stone-200 mb-3">
              <h3 class="font-mono text-xs font-bold text-stone-900 uppercase tracking-wider">
                1. Sneaker Color
              </h3>
              <div class="flex items-center gap-1.5 font-mono text-[10px]">
                <span class="text-stone-500 uppercase">CURRENT:</span>
                <span class="inline-flex items-center gap-1 border border-stone-900 bg-stone-100 px-1.5 py-0.5 font-bold text-stone-900">
                  <span class="size-2 rounded-full border border-stone-900" :style="{ backgroundColor: currentColor }"></span>
                  <span>{{ currentColor.toUpperCase() }}</span>
                </span>
              </div>
            </div>

            <!-- Notice if no parts mapped or single combined mesh -->
            <div v-if="isSingleMesh && !charmOnly" class="border border-stone-300 bg-stone-50 p-2.5 mb-3 text-[11px] font-mono text-stone-600">
              ✦ No customizable parts mapped. The shoe will display its original 3D materials. You can pick any custom color below or attach a 3D accessory charm.
            </div>

            <!-- Color Palette & Swatches Grid -->
            <div>
              <div class="flex items-center justify-between mb-2">
                <span class="font-mono text-[11px] font-bold text-stone-800 uppercase">
                  Palette &amp; Custom Color:
                </span>
                <button
                  type="button"
                  class="font-mono text-[10px] text-stone-600 hover:text-stone-900 underline uppercase cursor-pointer"
                  @click="resetToOriginal"
                >
                  Reset (Original White)
                </button>
              </div>

              <!-- Color Picker Swatches Grid -->
              <div class="grid grid-cols-5 gap-2 p-3 bg-stone-100 border border-stone-900">
                <!-- Preset Swatches -->
                <button
                  v-for="color in PALETTE"
                  :key="color.id"
                  type="button"
                  class="group relative flex flex-col items-center justify-center p-1.5 border cursor-pointer transition-transform hover:scale-105 active:scale-95"
                  :class="currentColor.toLowerCase() === color.hex.toLowerCase()
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

                <!-- + Add Color Swatch Button (Native Color Picker) -->
                <div
                  class="relative flex flex-col items-center justify-center p-1.5 border-2 border-dashed border-stone-900 bg-white cursor-pointer transition-transform hover:scale-105 active:scale-95 group"
                  :class="isCustomColorSelected ? 'border-solid border-[#b94d27] ring-2 ring-[#b94d27] ring-offset-1' : 'hover:border-[#b94d27]'"
                  title="Click to pick any custom color"
                >
                  <input
                    type="color"
                    :value="customHex"
                    @input="onCustomColorInput"
                    class="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                    aria-label="Pick custom color"
                  />
                  <div
                    class="size-6 sm:size-7 rounded-sm border border-stone-900 shadow-xs flex items-center justify-center text-xs font-black transition-colors"
                    :style="{
                      backgroundColor: isCustomColorSelected ? currentColor : '#b94d27',
                      color: isCustomColorSelected ? getContrastTextColor(currentColor) : '#ffffff'
                    }"
                  >
                    +
                  </div>
                  <span class="mt-1 font-mono text-[9px] text-[#b94d27] font-bold truncate w-full text-center">
                    {{ isCustomColorSelected ? currentColor.toUpperCase() : '+ Add Color' }}
                  </span>
                </div>
              </div>

              <!-- Direct Hex Code Input Bar -->
              <div class="mt-3 flex items-center gap-2 border border-stone-900 bg-white p-2 shadow-[2px_2px_0px_#202220]">
                <div
                  class="size-7 rounded-sm border border-stone-900 shrink-0 shadow-xs"
                  :style="{ backgroundColor: currentColor }"
                  title="Current Color Preview"
                ></div>
                <div class="relative flex-1">
                  <span class="absolute left-2.5 top-1/2 -translate-y-1/2 font-mono text-xs font-bold text-stone-400">#</span>
                  <input
                    type="text"
                    v-model="hexInput"
                    placeholder="B94D27"
                    maxlength="7"
                    class="w-full border border-stone-300 py-1 pl-6 pr-2 font-mono text-xs uppercase tracking-wider text-stone-900 focus:border-stone-900 focus:outline-none"
                    @keydown.enter.prevent="applyCustomColor"
                  />
                </div>
                <button
                  type="button"
                  class="border border-stone-900 bg-[#202220] px-3 py-1 font-mono text-xs font-bold text-white uppercase hover:bg-[#b94d27] transition-colors cursor-pointer"
                  @click="applyCustomColor"
                >
                  Apply
                </button>
              </div>
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
            {{ charmOnly ? '← Back to 3D Model' : '← Back to Mesh Tagger' }}
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
