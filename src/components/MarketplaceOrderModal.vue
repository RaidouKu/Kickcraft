<script setup>
import { computed, ref, watch } from 'vue'
import { api } from '../api.js'
import { isPartCustomizable, resolveAssetUrl } from '../customization.js'

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false,
  },
  product: {
    type: Object,
    default: () => null,
  },
})

const emit = defineEmits(['close', 'order-placed'])

// KickCraft Signature Palette & Accessory Charms
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

const CHARMS = [
  { id: 'none', label: 'None', description: 'No charm', icon: '⊘', src: null },
  { id: 'star', label: 'Star', description: 'Star emblem', icon: '★', src: '/models/charms/star-charm.glb' },
  { id: 'k-tag', label: 'K-Tag', description: 'KickCraft tag', icon: '🏷', src: '/models/charms/k-tag-charm.glb' },
  { id: 'lightning', label: 'Lightning', description: 'Bolt charm', icon: '⚡', src: '/models/charms/lightning-charm.glb' },
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

const SIZES = [7, 7.5, 8, 8.5, 9, 9.5, 10, 10.5, 11, 12]

// Reactive State
const orderViewer = ref(null)
const orderViewerExposure = ref(1.2)
const orderPartColors = ref({})
const orderSelectedCharm = ref('none')
const orderActivePart = ref('Upper')
const orderSize = ref(9)
const orderBuyerName = ref('')
const orderBuyerEmail = ref('')
const orderPickupDate = ref('')
const orderNotes = ref('')
const isSubmittingOrder = ref(false)
const orderError = ref('')
const orderReceipt = ref(null)
const receiptCopied = ref(false)
const orderModalTab = ref('customize') // 'customize' | 'checkout'

const activeCharms = computed(() => CHARMS.filter((c) => c.src))
const orderProduct = computed(() => props.product)
const orderIsPartCustomizable = computed(() => isPartCustomizable(orderProduct.value))
const mappedParts = computed(() => getProductMappedParts(orderProduct.value))

function getMinPickupDate() {
  const d = new Date()
  d.setDate(d.getDate() + 7)
  const y = String(d.getFullYear())
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function getMethodBadge(method) {
  switch (method) {
    case 'upload':
      return { label: '[ GLB UPLOAD ]', bg: 'bg-[#edf4fb]', text: 'text-[#245fa8]', border: 'border-[#245fa8]' }
    case 'ai_generate':
      return { label: '[ AI GENERATED ]', bg: 'bg-[#f4edf9]', text: 'text-[#6b21a8]', border: 'border-[#6b21a8]' }
    case 'template':
      return { label: '[ TEMPLATE ]', bg: 'bg-[#fdf2ef]', text: 'text-[#b94d27]', border: 'border-[#b94d27]' }
    default:
      return { label: '[ ' + (method || 'PRODUCT').toUpperCase() + ' ]', bg: 'bg-[#f5f6f4]', text: 'text-[#5f635f]', border: 'border-stone-900' }
  }
}

function getProductMappedParts(product) {
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

function initModal(prod) {
  if (!prod) return
  orderReceipt.value = null
  orderError.value = ''
  orderModalTab.value = 'customize'
  orderSize.value = 9
  orderNotes.value = ''

  // Pre-fill colors
  let defaultColors = prod.partColors || prod.part_colors || {}
  if (typeof defaultColors === 'string') {
    try { defaultColors = JSON.parse(defaultColors) } catch (_) { defaultColors = {} }
  }
  orderPartColors.value = { ...defaultColors }
  if (!isPartCustomizable(prod) && !orderPartColors.value.shoe) {
    orderPartColors.value.shoe = '#ffffff'
  }

  // Pre-fill charm
  orderSelectedCharm.value = prod.charmId || prod.charm_id || 'none'

  // Pre-fill active part
  const mapped = getProductMappedParts(prod)
  orderActivePart.value = mapped.length > 0 ? mapped[0].id : (isPartCustomizable(prod) ? 'Upper' : 'shoe')

  // Pre-fill guest profile from localStorage
  if (typeof localStorage !== 'undefined') {
    try {
      const saved = localStorage.getItem('kickcraft_guest_profile')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed.name) orderBuyerName.value = parsed.name
        if (parsed.email) orderBuyerEmail.value = parsed.email
      }
    } catch (_) {}
  }

  // Pre-fill pickup date to 7 days from now
  orderPickupDate.value = getMinPickupDate()
}

watch(
  () => [props.isOpen, props.product],
  ([open, prod]) => {
    if (open && prod) {
      initModal(prod)
    }
  },
  { immediate: true }
)

function closeModal() {
  emit('close')
}

function onOrderModelLoaded() {
  try {
    const materials = orderViewer.value?.model?.materials || []
    materials.forEach((mat) => {
      if (mat?.pbrMetallicRoughness) {
        mat.pbrMetallicRoughness.setMetallicFactor(0.0)
        if (typeof mat.pbrMetallicRoughness.roughnessFactor === 'number' && mat.pbrMetallicRoughness.roughnessFactor < 0.75) {
          mat.pbrMetallicRoughness.setRoughnessFactor(0.85)
        }
      }
    })
  } catch (_) {}

  // Apply any pre-filled part colors
  for (const [partId, colorHex] of Object.entries(orderPartColors.value)) {
    if (colorHex) {
      applyColorToOrderViewer(partId, colorHex)
    }
  }
}

function onOrderModelError(err) {
  console.warn('MarketplaceOrderModal 3D model failed to load, falling back to default:', err)
  if (orderViewer.value && orderViewer.value.src !== resolveAssetUrl('/models/shoe-soleview-final.glb')) {
    orderViewer.value.src = resolveAssetUrl('/models/shoe-soleview-final.glb')
  }
}

function applyColorToOrderViewer(partId, colorHex) {
  if (!orderViewer.value?.model || !orderProduct.value) return
  if (!isPartCustomizable(orderProduct.value) || partId === 'shoe') {
    const materials = orderViewer.value.model.materials || []
    if (materials[0]?.pbrMetallicRoughness) {
      materials[0].pbrMetallicRoughness.setBaseColorFactor(colorHex)
    }
    return
  }
  let rawMap = orderProduct.value.meshMap || orderProduct.value.mesh_map || {}
  if (typeof rawMap === 'string') {
    try { rawMap = JSON.parse(rawMap) } catch (_) { rawMap = {} }
  }
  const mapping = rawMap[partId]
  if (!mapping) return
  const meshOrMatName = typeof mapping === 'object' && mapping?.meshName ? mapping.meshName : mapping
  const materials = orderViewer.value.model.materials || []
  const mat = materials.find((m) => m?.name === meshOrMatName || m?.name?.toLowerCase() === String(meshOrMatName).toLowerCase())
    || orderViewer.value.model.getMaterialByName(meshOrMatName)
  if (mat?.pbrMetallicRoughness) {
    mat.pbrMetallicRoughness.setBaseColorFactor(colorHex)
  }
}

function selectOrderPartColor(colorHex) {
  if (!colorHex) return
  let hex = colorHex.trim()
  if (!hex.startsWith('#') && /^[0-9a-fA-F]{3,8}$/.test(hex)) {
    hex = '#' + hex
  }

  if (!orderActivePart.value) return
  orderPartColors.value = {
    ...orderPartColors.value,
    [orderActivePart.value]: hex,
  }
  applyColorToOrderViewer(orderActivePart.value, hex)
}

function getCharmScale(charmId) {
  return orderSelectedCharm.value === charmId ? '1 1 1' : '0 0 0'
}

async function submitMarketplaceOrder() {
  if (!orderBuyerName.value.trim() || !orderBuyerEmail.value.trim() || !orderPickupDate.value) {
    orderError.value = 'Please complete all required fields.'
    return
  }
  isSubmittingOrder.value = true
  orderError.value = ''

  try {
    const payload = {
      productId: orderProduct.value.id,
      buyerName: orderBuyerName.value.trim(),
      buyerEmail: orderBuyerEmail.value.trim(),
      pickupDate: orderPickupDate.value,
      customColors: { ...orderPartColors.value },
      customCharm: orderSelectedCharm.value,
      notes: `Size: US ${orderSize.value}. ${orderNotes.value.trim()}`.trim(),
    }

    const res = await api('orders/create.php', {
      method: 'POST',
      body: payload,
    })

    if (!res.success) {
      throw new Error(res.error || 'Failed to place order')
    }

    orderReceipt.value = res.order

    // Save guest profile for future visits
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(
          'kickcraft_guest_profile',
          JSON.stringify({ name: orderBuyerName.value.trim(), email: orderBuyerEmail.value.trim() })
        )
      } catch (_) {}
    }

    // Broadcast event so Seller Dashboard / Admin Panel update in real time
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        const channel = new BroadcastChannel('kickcraft_orders_channel')
        channel.postMessage({ type: 'NEW_ORDER', order: res.order })
        channel.close()
      } catch (_) {}
    }

    emit('order-placed', {
      order: res.order,
      productId: orderProduct.value.id,
    })
  } catch (err) {
    orderError.value = err.message || 'Failed to submit pickup order. Please check your connection.'
  } finally {
    isSubmittingOrder.value = false
  }
}

function copyOrderReference() {
  if (!orderReceipt.value?.id) return
  try {
    navigator.clipboard.writeText(orderReceipt.value.id)
    receiptCopied.value = true
    setTimeout(() => { receiptCopied.value = false }, 2500)
  } catch (_) {}
}
</script>

<template>
  <div
    v-if="isOpen && orderProduct"
    class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/70 backdrop-blur-sm"
    role="dialog"
    aria-modal="true"
    aria-labelledby="order-modal-title"
    @keydown.esc="closeModal"
  >
    <div class="max-h-[94vh] w-full max-w-5xl overflow-y-auto border-2 border-stone-900 bg-[#fcfdfb] p-5 shadow-[8px_8px_0px_#202220] sm:p-7">
      
      <!-- Header -->
      <div class="flex items-start justify-between border-b-2 border-stone-900 pb-4">
        <div>
          <div class="flex items-center gap-2">
            <span
              class="border px-2 py-0.5 font-mono text-[10px] font-black uppercase tracking-wider"
              :class="[
                getMethodBadge(orderProduct.creationMethod || orderProduct.creation_method).bg,
                getMethodBadge(orderProduct.creationMethod || orderProduct.creation_method).text,
                getMethodBadge(orderProduct.creationMethod || orderProduct.creation_method).border,
              ]"
            >
              {{ getMethodBadge(orderProduct.creationMethod || orderProduct.creation_method).label }}
            </span>
            <span class="font-mono text-xs font-bold text-[#b94d27]">
              {{ orderProduct.storeName || orderProduct.store_name }}
            </span>
          </div>
          <h2 id="order-modal-title" class="font-display mt-1 text-2xl font-black text-[#202220] sm:text-3xl">
            {{ orderProduct.name }}
          </h2>
        </div>
        <button
          type="button"
          class="grid size-9 place-items-center border-2 border-stone-900 bg-white font-mono text-xl font-bold hover:bg-[#edf0ec] cursor-pointer"
          aria-label="Close modal"
          @click="closeModal"
        >
          ✕
        </button>
      </div>

      <!-- If Order Placed: Receipt View -->
      <div v-if="orderReceipt" class="py-6 text-center">
        <div class="mx-auto grid size-12 place-items-center bg-[#3f7652] text-xl font-black text-white">✓</div>
        <h3 class="font-display mt-4 text-2xl font-black text-[#202220]">Pickup Order Placed!</h3>
        <div class="mt-3 inline-block border-2 border-[#3f7652] bg-[#edf5f0] px-4 py-2 font-mono text-xs font-black uppercase tracking-wider text-[#2a593a]">
          [ ✓ ORDER CONFIRMED · PENDING STORE PICKUP ]
        </div>

        <div class="mx-auto mt-6 max-w-md border-2 border-stone-900 bg-white p-5 text-left shadow-[4px_4px_0px_#202220]">
          <p class="font-mono text-xs font-bold text-[#5f635f] uppercase">Order Reference</p>
          <div class="mt-1 flex items-center justify-between gap-3">
            <code class="font-mono text-2xl font-black text-[#202220]">{{ orderReceipt.id }}</code>
            <button
              type="button"
              class="border border-stone-900 px-3 py-1 font-mono text-xs font-bold hover:bg-stone-100 cursor-pointer"
              @click="copyOrderReference"
            >
              {{ receiptCopied ? 'Copied!' : 'Copy' }}
            </button>
          </div>
          <div class="mt-4 border-t border-stone-200 pt-3 font-mono text-xs space-y-1.5 text-stone-700">
            <div class="flex justify-between">
              <span>Shoe:</span>
              <span class="font-bold text-[#202220]">{{ orderReceipt.productName || orderProduct.name }}</span>
            </div>
            <div class="flex justify-between">
              <span>Seller:</span>
              <span class="font-bold text-[#202220]">{{ orderReceipt.sellerStoreName || orderProduct.storeName }}</span>
            </div>
            <div class="flex justify-between">
              <span>Pickup Date:</span>
              <span class="font-bold text-[#202220]">{{ orderReceipt.pickupDate || orderPickupDate }}</span>
            </div>
            <div class="flex justify-between">
              <span>Total Due:</span>
              <span class="font-black text-[#b94d27]">₱{{ Number(orderReceipt.totalPrice || orderProduct.price).toLocaleString() }}</span>
            </div>
          </div>
          <p class="mt-4 text-[11px] text-[#5f635f]">
            Bring this reference with your ID when collecting and paying for your pair at the store counter.
          </p>
        </div>

        <div class="mt-6 flex flex-wrap justify-center gap-3">
          <a
            href="#track"
            class="border-2 border-stone-900 bg-[#202220] px-6 py-2.5 font-mono text-xs font-bold uppercase tracking-wider text-white shadow-[3px_3px_0px_#202220] hover:bg-[#b94d27]"
            @click="closeModal"
          >
            Track Order
          </a>
          <button
            type="button"
            class="border-2 border-stone-900 bg-white px-6 py-2.5 font-mono text-xs font-bold uppercase tracking-wider text-stone-900 hover:bg-stone-100 cursor-pointer"
            @click="closeModal"
          >
            Done
          </button>
        </div>
      </div>

      <!-- Active Customization & Ordering Layout (2 columns) -->
      <div v-else class="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-12">
        
        <!-- Left Column: 3D Model Viewer (7 cols) -->
        <div class="lg:col-span-7 flex flex-col">
          <div class="relative h-80 sm:h-[440px] border-2 border-stone-900 bg-[#e9ece9] overflow-hidden">
            <!-- Quick Studio Brightness Control -->
            <div class="absolute top-3 right-3 z-10 flex items-center gap-1 border border-stone-900 bg-white/95 px-2 py-1 shadow-[2px_2px_0px_#202220] font-mono text-[10px]">
              <span class="font-bold text-stone-600">LIGHT:</span>
              <button type="button" @click="orderViewerExposure = 1.0" :class="orderViewerExposure === 1.0 ? 'bg-stone-900 text-white font-bold' : 'text-stone-700 hover:bg-stone-200'" class="px-1.5 py-0.5 transition-colors cursor-pointer">STD</button>
              <button type="button" @click="orderViewerExposure = 1.2" :class="orderViewerExposure === 1.2 ? 'bg-stone-900 text-white font-bold' : 'text-stone-700 hover:bg-stone-200'" class="px-1.5 py-0.5 transition-colors cursor-pointer">BRIGHT</button>
              <button type="button" @click="orderViewerExposure = 1.45" :class="orderViewerExposure === 1.45 ? 'bg-[#b94d27] text-white font-bold' : 'text-stone-700 hover:bg-stone-200'" class="px-1.5 py-0.5 transition-colors cursor-pointer">MAX</button>
            </div>

            <model-viewer
              ref="orderViewer"
              class="size-full"
              :src="resolveAssetUrl(orderProduct.glbPath || orderProduct.glb_path || '/models/shoe-soleview-final.glb')"
              :alt="orderProduct.name"
              camera-controls
              touch-action="pan-y"
              shadow-intensity="0.25"
              shadow-softness="1"
              :exposure="orderViewerExposure"
              environment-image="neutral"
              tone-mapping="neutral"
              auto-rotate
              with-credentials
              @load="onOrderModelLoaded"
              @error="onOrderModelError"
            >
              <extra-model
                v-for="charm in activeCharms"
                :key="charm.id"
                :src="resolveAssetUrl(charm.src)"
                :scale="getCharmScale(charm.id)"
              />
            </model-viewer>

            <div class="pointer-events-none absolute bottom-2 left-2 border border-stone-900 bg-white/90 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-[#202220]">
              3D Customizer Preview · Drag to Rotate
            </div>
          </div>

          <!-- Price & Stock strip -->
          <div class="mt-3 flex items-center justify-between border-2 border-stone-900 bg-stone-100 p-3 font-mono text-xs">
            <div>
              <span class="text-stone-500 uppercase">PRICE:</span>
              <span class="ml-2 font-black text-lg text-[#202220]">₱{{ Number(orderProduct.price).toLocaleString() }}</span>
            </div>
            <div>
              <span class="text-stone-500 uppercase">STOCK:</span>
              <span class="ml-2 font-bold" :class="orderProduct.stock > 0 ? 'text-emerald-700' : 'text-amber-700'">
                {{ orderProduct.stock > 0 ? `${orderProduct.stock} Available` : 'Made to Order' }}
              </span>
            </div>
          </div>
        </div>

        <!-- Right Column: Controls & Form (5 cols) -->
        <div class="lg:col-span-5 flex flex-col justify-between">
          
          <!-- Navigation Tabs -->
          <div class="grid grid-cols-2 border-2 border-stone-900 font-mono text-xs font-bold mb-4">
            <button
              type="button"
              class="py-2.5 transition-colors uppercase cursor-pointer"
              :class="orderModalTab === 'customize' ? 'bg-[#202220] text-white' : 'bg-white text-stone-700 hover:bg-stone-100'"
              @click="orderModalTab = 'customize'"
            >
              1. Colors &amp; Charm
            </button>
            <button
              type="button"
              class="py-2.5 transition-colors uppercase border-l-2 border-stone-900 cursor-pointer"
              :class="orderModalTab === 'checkout' ? 'bg-[#202220] text-white' : 'bg-white text-stone-700 hover:bg-stone-100'"
              @click="orderModalTab = 'checkout'"
            >
              2. Size &amp; Pickup
            </button>
          </div>

          <!-- Tab 1: Colors & Charm -->
          <div v-if="orderModalTab === 'customize'" class="space-y-4">
            <!-- Notice if single-mesh / not part customizable -->
            <div
              v-if="!orderIsPartCustomizable"
              class="border-2 border-stone-900 bg-[#fffbeb] p-3.5 font-mono text-xs text-stone-800 shadow-[2px_2px_0px_#202220]"
            >
              <div class="font-bold text-[#b45309] uppercase tracking-wider mb-1">[ SINGLE COMBINED MESH · OVERALL COLOR ]</div>
              <p class="leading-relaxed text-[11px]">
                Meshes are not editable into separate parts. You can customize the overall sneaker color below or keep Pure White to view original photographed textures.
              </p>
            </div>

            <!-- Part Selector (Only for Multi-Part Customizable Shoes) -->
            <div v-if="orderIsPartCustomizable && mappedParts.length > 1">
              <span class="font-mono text-xs font-bold text-stone-700 uppercase">Select Shoe Part:</span>
              <div class="mt-1.5 flex flex-wrap gap-1.5">
                <button
                  v-for="part in mappedParts"
                  :key="part.id"
                  type="button"
                  class="border px-2.5 py-1 font-mono text-xs transition-colors cursor-pointer"
                  :class="orderActivePart === part.id
                    ? 'border-stone-900 bg-stone-900 text-white font-bold'
                    : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-100'"
                  @click="orderActivePart = part.id"
                >
                  {{ part.label }}
                </button>
              </div>
            </div>

            <!-- Color Palette -->
            <div>
              <div class="flex items-center justify-between mb-1.5">
                <span class="font-mono text-xs font-bold text-stone-700 uppercase">
                  {{ orderIsPartCustomizable ? `Color for ${PART_LABELS[orderActivePart] || orderActivePart}:` : 'Sneaker Color:' }}
                </span>
                <span
                  v-if="orderPartColors[orderActivePart]"
                  class="size-4 border border-stone-900"
                  :style="{ backgroundColor: orderPartColors[orderActivePart] }"
                ></span>
              </div>
              <div class="grid grid-cols-3 gap-1.5">
                <button
                  v-for="color in PALETTE"
                  :key="color.id"
                  type="button"
                  class="flex items-center gap-2 border p-1.5 text-left font-mono text-[11px] transition-all cursor-pointer"
                  :class="orderPartColors[orderActivePart] === color.hex
                    ? 'border-2 border-stone-900 bg-stone-100 font-bold shadow-[2px_2px_0px_#202220]'
                    : 'border-stone-300 bg-white hover:bg-stone-50 text-stone-700'"
                  @click="selectOrderPartColor(color.hex)"
                >
                  <span
                    class="size-4 shrink-0 border border-stone-400"
                    :style="{ backgroundColor: color.hex }"
                  ></span>
                  <span class="truncate">{{ color.name }}</span>
                </button>
              </div>

            </div>

            <!-- Charm Attachment -->
            <div>
              <span class="font-mono text-xs font-bold text-stone-700 uppercase">3D Accessory Charm:</span>
              <div class="mt-1.5 grid grid-cols-2 gap-2">
                <button
                  v-for="charm in CHARMS"
                  :key="charm.id"
                  type="button"
                  class="flex items-center gap-2 border p-2 font-mono text-xs text-left transition-all cursor-pointer"
                  :class="orderSelectedCharm === charm.id
                    ? 'border-2 border-stone-900 bg-[#b94d27]/10 font-bold shadow-[2px_2px_0px_#202220]'
                    : 'border-stone-300 bg-white hover:bg-stone-50 text-stone-700'"
                  @click="orderSelectedCharm = charm.id"
                >
                  <span class="text-base">{{ charm.icon }}</span>
                  <span class="truncate">{{ charm.label }}</span>
                </button>
              </div>
            </div>

            <div class="pt-4 border-t border-stone-200">
              <button
                type="button"
                class="w-full h-11 border-2 border-stone-900 bg-[#b94d27] font-mono text-xs font-black uppercase tracking-wider text-white shadow-[3px_3px_0px_#202220] hover:bg-[#963a20] cursor-pointer"
                @click="orderModalTab = 'checkout'"
              >
                Next: Size &amp; Pickup Info &rarr;
              </button>
            </div>
          </div>

          <!-- Tab 2: Size & Checkout Form -->
          <form v-else class="space-y-3.5" @submit.prevent="submitMarketplaceOrder">
            
            <!-- Size selector -->
            <div>
              <span class="font-mono text-xs font-bold text-stone-700 uppercase">Shoe Size (US Men/Unisex):</span>
              <div class="mt-1.5 grid grid-cols-5 gap-1.5">
                <button
                  v-for="s in SIZES"
                  :key="s"
                  type="button"
                  class="h-9 border font-mono text-xs font-bold transition-all cursor-pointer"
                  :class="orderSize === s
                    ? 'border-2 border-stone-900 bg-[#202220] text-white shadow-[2px_2px_0px_#202220]'
                    : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-100'"
                  @click="orderSize = s"
                >
                  {{ s }}
                </button>
              </div>
            </div>

            <!-- Full Name -->
            <div>
              <label class="block font-mono text-xs font-bold text-stone-700 uppercase mb-1">
                Full Name:
              </label>
              <input
                v-model="orderBuyerName"
                type="text"
                required
                placeholder="e.g. Maria Santos"
                class="w-full h-10 border-2 border-stone-900 bg-white px-3 font-mono text-xs outline-none focus:border-[#245fa8]"
              />
            </div>

            <!-- Email Address -->
            <div>
              <label class="block font-mono text-xs font-bold text-stone-700 uppercase mb-1">
                Email Address:
              </label>
              <input
                v-model="orderBuyerEmail"
                type="email"
                required
                placeholder="e.g. maria@example.com"
                class="w-full h-10 border-2 border-stone-900 bg-white px-3 font-mono text-xs outline-none focus:border-[#245fa8]"
              />
            </div>

            <!-- Pickup Date -->
            <div>
              <label class="block font-mono text-xs font-bold text-stone-700 uppercase mb-1">
                Pickup Date (Min. 7 Days Crafting):
              </label>
              <input
                v-model="orderPickupDate"
                type="date"
                :min="getMinPickupDate()"
                required
                class="w-full h-10 border-2 border-stone-900 bg-white px-3 font-mono text-xs outline-none focus:border-[#245fa8]"
              />
            </div>

            <!-- Notes -->
            <div>
              <label class="block font-mono text-xs font-bold text-stone-700 uppercase mb-1">
                Special Notes / Fitting (Optional):
              </label>
              <input
                v-model="orderNotes"
                type="text"
                placeholder="e.g. Wide feet, afternoon pickup"
                class="w-full h-9 border border-stone-300 bg-white px-3 font-mono text-xs outline-none focus:border-[#245fa8]"
              />
            </div>

            <!-- Error Banner -->
            <div v-if="orderError" class="border border-[#b94d27] bg-[#fdf2ef] p-2.5 font-mono text-xs text-[#b94d27]">
              {{ orderError }}
            </div>

            <!-- Action buttons -->
            <div class="pt-2 flex items-center gap-3">
              <button
                type="button"
                class="h-11 border-2 border-stone-900 bg-white px-4 font-mono text-xs font-bold uppercase tracking-wider text-stone-900 hover:bg-stone-100 cursor-pointer"
                @click="orderModalTab = 'customize'"
              >
                &larr; Colors
              </button>
              <button
                type="submit"
                :disabled="isSubmittingOrder"
                class="flex-1 h-11 border-2 border-stone-900 bg-[#b94d27] font-mono text-xs font-black uppercase tracking-wider text-white shadow-[3px_3px_0px_#202220] hover:bg-[#963a20] disabled:opacity-50 cursor-pointer"
              >
                {{ isSubmittingOrder ? 'Placing Order…' : 'Place Store Pickup Order' }}
              </button>
            </div>

            <p class="text-[10px] text-stone-500 font-mono text-center">
              Counter pickup only. Pay in cash or card upon physical inspection.
            </p>
          </form>

        </div>
      </div>

    </div>
  </div>
</template>
