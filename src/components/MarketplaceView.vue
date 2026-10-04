<script setup>
import { computed, onMounted, ref } from 'vue'
import { api } from '../api.js'
import { isPartCustomizable } from '../customization.js'

const props = defineProps({
  currentUser: {
    type: Object,
    default: () => null,
  },
})

const emit = defineEmits(['select-product', 'navigate-studio'])

// Reactive State
const products = ref([])
const isLoading = ref(true)
const error = ref('')
const searchQuery = ref('')
const selectedCategory = ref('all') // 'all' | 'sneakers' | 'basketball' | 'running' | 'fashion' | 'kickcraft'
const selectedMethod = selectedCategory // backward compatibility alias
const selectedProduct = ref(null)

const categoryFilters = [
  { id: 'all', label: 'All Sneakers' },
  { id: 'sneakers', label: 'Sneakers' },
  { id: 'basketball', label: 'Basketball' },
  { id: 'running', label: 'Running' },
  { id: 'fashion', label: 'Fashion' },
  { id: 'kickcraft', label: 'KickCraft Original' },
]

const CATEGORY_MAP = {
  sneakers: 'Sneakers',
  basketball: 'Basketball',
  running: 'Running',
  fashion: 'Fashion',
  kickcraft: 'KickCraft Original',
}

async function loadMarketplaceProducts() {
  isLoading.value = true
  error.value = ''
  try {
    const res = await api('products/list.php')
    if (res?.success && Array.isArray(res.products)) {
      products.value = res.products
    } else {
      products.value = []
    }
  } catch (err) {
    error.value = err.message || 'Failed to load marketplace products. Please check connection.'
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  loadMarketplaceProducts()
})

const filteredProducts = computed(() => {
  return products.value.filter((product) => {
    // Category filter
    if (selectedCategory.value !== 'all') {
      const activeCat = selectedCategory.value.toLowerCase()
      const primaryCat = (product.category || '').toLowerCase()
      const cats = Array.isArray(product.categories)
        ? product.categories.map((c) => String(c).toLowerCase())
        : []
      const matchCategory = primaryCat === activeCat || cats.includes(activeCat)
      if (!matchCategory) {
        return false
      }
    }

    // Search query filter
    if (searchQuery.value.trim()) {
      const q = searchQuery.value.toLowerCase().trim()
      const name = (product.name || '').toLowerCase()
      const desc = (product.description || '').toLowerCase()
      const store = (product.storeName || product.store_name || '').toLowerCase()
      const cat = (product.category || '').toLowerCase()
      return name.includes(q) || desc.includes(q) || store.includes(q) || cat.includes(q)
    }

    return true
  })
})

function clearFilters() {
  searchQuery.value = ''
  selectedCategory.value = 'all'
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

function openProductPreview(product) {
  selectedProduct.value = product
}

function closeProductPreview() {
  selectedProduct.value = null
}

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

// Marketplace Customize & Order Modal State
const orderModalOpen = ref(false)
const orderProduct = ref(null)
const orderViewer = ref(null)
const orderViewerExposure = ref(1.2)
const orderPartColors = ref({})
const orderSelectedCharm = ref('none')
const orderActivePart = ref('Upper')
const orderCustomHex = ref('#b94d27')
const orderHexInput = ref('')
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
const orderIsPartCustomizable = computed(() => isPartCustomizable(orderProduct.value))
const mappedParts = computed(() => getProductMappedParts(orderProduct.value))

const orderCurrentColor = computed(() => {
  return orderPartColors.value[orderActivePart.value] || '#ffffff'
})

const isOrderCustomColorSelected = computed(() => {
  const current = (orderPartColors.value[orderActivePart.value] || '').toLowerCase()
  if (!current) return false
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

function getMinPickupDate() {
  const d = new Date()
  d.setDate(d.getDate() + 7)
  const y = String(d.getFullYear())
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
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

function openOrderModal(product) {
  orderProduct.value = product
  orderReceipt.value = null
  orderError.value = ''
  orderModalTab.value = 'customize'
  orderSize.value = 9
  orderNotes.value = ''

  // Pre-fill colors
  let defaultColors = product.partColors || product.part_colors || {}
  if (typeof defaultColors === 'string') {
    try { defaultColors = JSON.parse(defaultColors) } catch (_) { defaultColors = {} }
  }
  orderPartColors.value = { ...defaultColors }
  if (!isPartCustomizable(product) && !orderPartColors.value.shoe) {
    orderPartColors.value.shoe = '#ffffff'
  }

  // Pre-fill charm
  orderSelectedCharm.value = product.charmId || product.charm_id || 'none'

  // Pre-fill active part
  const mapped = getProductMappedParts(product)
  orderActivePart.value = mapped.length > 0 ? mapped[0].id : (isPartCustomizable(product) ? 'Upper' : 'shoe')

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

  orderModalOpen.value = true
}

function closeOrderModal() {
  orderModalOpen.value = false
  orderProduct.value = null
  orderReceipt.value = null
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
  orderCustomHex.value = hex
  orderHexInput.value = hex.replace('#', '')

  if (!orderActivePart.value) return
  orderPartColors.value = {
    ...orderPartColors.value,
    [orderActivePart.value]: hex,
  }
  applyColorToOrderViewer(orderActivePart.value, hex)
}

function onOrderCustomColorInput(event) {
  const val = event?.target?.value || orderCustomHex.value
  if (val) {
    selectOrderPartColor(val)
  }
}

function applyOrderCustomColor() {
  if (!orderHexInput.value) return
  let hex = orderHexInput.value.trim()
  if (!hex.startsWith('#')) {
    hex = '#' + hex
  }
  if (/^#[0-9a-fA-F]{3,8}$/.test(hex)) {
    selectOrderPartColor(hex)
  }
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

    // Decrement local product stock
    const found = products.value.find((p) => p.id === orderProduct.value.id)
    if (found && typeof found.stock === 'number' && found.stock > 0) {
      found.stock -= 1
    }

    // Broadcast event so Seller Dashboard / Admin Panel update in real time
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        const channel = new BroadcastChannel('kickcraft_orders_channel')
        channel.postMessage({ type: 'NEW_ORDER', order: res.order })
        channel.close()
      } catch (_) {}
    }
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

function handleSelectProduct(product) {
  openOrderModal(product)
}
</script>

<template>
  <div class="mx-auto max-w-[1480px] px-5 py-8 lg:px-8 lg:py-10">

    <!-- ── Brutalist Hero Header ──────────────────────────────── -->
    <header class="mb-10 border-2 border-stone-900 bg-[#fcfdfb] p-6 shadow-[6px_6px_0px_#202220] sm:p-8 lg:p-10">
      <div class="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
        <div>
          <!-- Brutalist Tag -->
          <div class="inline-flex items-center gap-2 border border-stone-900 bg-[#202220] px-3 py-1 font-mono text-xs font-black uppercase tracking-widest text-white">
            <span>[ INDEPENDENT SELLER PLATFORM ]</span>
          </div>

          <!-- Main Title -->
          <h1 class="font-display mt-4 text-3xl font-black tracking-[-0.04em] text-[#202220] sm:text-5xl">
            KICKCRAFT MARKETPLACE
          </h1>

          <!-- Subtitle -->
          <p class="mt-3 max-w-2xl text-sm leading-relaxed text-[#5f635f] sm:text-base">
            Discover custom sneakers from independent sellers. Inspect real 3D models from every angle, customize available colorways, and reserve your pair directly for in-store pickup.
          </p>
        </div>

        <!-- Action link to join seller studio -->
        <div class="flex flex-wrap items-center gap-3">
          <a
            href="#seller-register"
            class="inline-flex h-12 items-center justify-center border-2 border-stone-900 bg-[#b94d27] px-6 font-mono text-xs font-black uppercase tracking-wider text-white shadow-[4px_4px_0px_#202220] transition-all hover:-translate-y-0.5 hover:bg-[#963a20] hover:shadow-[6px_6px_0px_#202220] focus-visible:outline-2 focus-visible:outline-[#245fa8]"
          >
            Want to sell? Join Seller Studio →
          </a>
        </div>
      </div>
    </header>

    <!-- ── Filter & Search Toolbar ────────────────────────────── -->
    <section aria-label="Marketplace filters" class="mb-8 border-2 border-stone-900 bg-[#fcfdfb] p-4 shadow-[4px_4px_0px_#202220]">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">

        <!-- Search input -->
        <div class="relative flex-1 max-w-md">
          <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-[#5f635f]">
            <svg class="size-4" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clip-rule="evenodd" />
            </svg>
          </div>
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search by shoe name, store, or description..."
            class="h-11 w-full border-2 border-stone-900 bg-white pl-10 pr-9 text-xs font-semibold text-[#202220] placeholder-[#8e938e] outline-none transition-colors focus:border-[#245fa8]"
          />
          <button
            v-if="searchQuery"
            type="button"
            class="absolute inset-y-0 right-0 flex items-center pr-3 text-stone-500 hover:text-stone-900"
            title="Clear search"
            @click="searchQuery = ''"
          >
            ✕
          </button>
        </div>

        <!-- Category & Style Filters -->
        <div class="flex flex-wrap items-center gap-2" role="group" aria-label="Category filters">
          <button
            v-for="filter in categoryFilters"
            :key="filter.id"
            type="button"
            class="h-9 border-2 px-3 font-mono text-xs font-bold uppercase transition-all"
            :class="selectedCategory === filter.id
              ? 'border-stone-900 bg-[#202220] text-white shadow-[2px_2px_0px_#202220]'
              : 'border-stone-900 bg-white text-[#202220] hover:bg-[#edf0ec]'"
            @click="selectedCategory = filter.id"
          >
            {{ filter.label }}
          </button>
        </div>

        <!-- Refresh / Reset -->
        <div class="flex items-center gap-2">
          <span class="font-mono text-xs font-bold text-[#5f635f]">
            {{ filteredProducts.length }} {{ filteredProducts.length === 1 ? 'sneaker' : 'sneakers' }}
          </span>
          <button
            type="button"
            class="h-9 border-2 border-stone-900 bg-white px-3 text-xs font-bold uppercase tracking-wider text-[#202220] transition-colors hover:bg-[#edf0ec]"
            title="Refresh marketplace catalog"
            @click="loadMarketplaceProducts"
          >
            ↻ Refresh
          </button>
        </div>

      </div>
    </section>

    <!-- ── Loading State ──────────────────────────────────────── -->
    <div v-if="isLoading" class="grid gap-8 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-label="Loading marketplace sneakers">
      <div
        v-for="n in 6"
        :key="n"
        class="animate-pulse border-2 border-stone-900 bg-[#fcfdfb] p-6 shadow-[6px_6px_0px_#202220] space-y-4"
      >
        <div class="h-64 border border-stone-300 bg-[#e9ece9]"></div>
        <div class="h-5 w-3/4 bg-[#e9ece9]"></div>
        <div class="h-4 w-1/2 bg-[#e9ece9]"></div>
        <div class="h-10 bg-[#e9ece9]"></div>
      </div>
    </div>

    <!-- ── Error State ────────────────────────────────────────── -->
    <div
      v-else-if="error"
      role="alert"
      class="mx-auto my-12 max-w-xl border-2 border-stone-900 bg-[#fdf2ef] p-8 text-center shadow-[6px_6px_0px_#202220]"
    >
      <div class="font-mono text-xs font-black uppercase tracking-widest text-[#b94d27]">
        [ CATALOG LOAD ERROR ]
      </div>
      <h2 class="font-display mt-2 text-xl font-black text-[#202220]">
        Unable to Load Marketplace
      </h2>
      <p class="mt-2 text-xs font-medium text-[#963a20]">{{ error }}</p>
      <button
        type="button"
        class="mt-6 inline-flex h-11 items-center justify-center border-2 border-stone-900 bg-[#b94d27] px-6 font-mono text-xs font-black uppercase tracking-wider text-white shadow-[3px_3px_0px_#202220] hover:bg-[#963a20]"
        @click="loadMarketplaceProducts"
      >
        Retry Connection
      </button>
    </div>

    <!-- ── Empty State ────────────────────────────────────────── -->
    <div
      v-else-if="filteredProducts.length === 0"
      class="mx-auto my-12 max-w-xl border-2 border-stone-900 bg-[#fcfdfb] p-12 text-center shadow-[6px_6px_0px_#202220]"
    >
      <div class="mx-auto mb-4 grid size-16 place-items-center border-2 border-stone-900 bg-[#f5f6f4] text-2xl font-black text-[#202220] shadow-[3px_3px_0px_#202220]">
        👟
      </div>
      <h2 class="font-display text-2xl font-black text-[#202220]">
        No sneakers found
      </h2>
      <p class="mt-2 text-xs leading-relaxed text-[#5f635f]">
        {{ searchQuery || selectedMethod !== 'all'
          ? 'No marketplace sneakers match your current search and filter criteria. Try resetting filters.'
          : 'Independent sellers have not listed any approved 3D sneakers yet. Check back soon or be the first to sell!' }}
      </p>
      <div class="mt-6 flex flex-wrap justify-center gap-3">
        <button
          v-if="searchQuery || selectedMethod !== 'all'"
          type="button"
          class="h-10 border-2 border-stone-900 bg-white px-5 font-mono text-xs font-bold uppercase tracking-wider text-[#202220] shadow-[3px_3px_0px_#202220] hover:bg-[#edf0ec]"
          @click="clearFilters"
        >
          Clear Filters
        </button>
        <a
          href="#seller-register"
          class="inline-flex h-10 items-center border-2 border-stone-900 bg-[#b94d27] px-5 font-mono text-xs font-bold uppercase tracking-wider text-white shadow-[3px_3px_0px_#202220] hover:bg-[#963a20]"
        >
          Become a Seller
        </a>
      </div>
    </div>

    <!-- ── Product Grid ───────────────────────────────────────── -->
    <section v-else aria-label="Available sneakers catalog" class="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
      <article
        v-for="product in filteredProducts"
        :key="product.id"
        class="group flex flex-col justify-between border-2 border-stone-900 bg-[#fcfdfb] shadow-[6px_6px_0px_#202220] transition-all hover:-translate-y-1 hover:shadow-[8px_8px_0px_#202220]"
      >
        <!-- Top Card Metadata Header -->
        <div class="flex items-center justify-between border-b-2 border-stone-900 bg-[#f5f6f4] px-4 py-2.5">
          <div class="flex items-center gap-1.5 flex-wrap">
            <span
              v-if="product.category"
              class="inline-block border border-stone-900 bg-[#202220] px-2 py-0.5 font-mono text-[10px] font-black uppercase tracking-wider text-white"
            >
              [ {{ (CATEGORY_MAP[product.category] || product.category).toUpperCase() }} ]
            </span>
            <span
              class="inline-block border px-2 py-0.5 font-mono text-[10px] font-black uppercase tracking-wider"
              :class="[
                getMethodBadge(product.creationMethod || product.creation_method).bg,
                getMethodBadge(product.creationMethod || product.creation_method).text,
                getMethodBadge(product.creationMethod || product.creation_method).border,
              ]"
            >
              {{ getMethodBadge(product.creationMethod || product.creation_method).label }}
            </span>
          </div>

          <span class="font-mono text-[11px] font-bold text-[#5f635f]">
            {{ product.stock > 0 ? `${product.stock} in stock` : 'Made to order' }}
          </span>
        </div>

        <!-- 3D Model Viewer Container -->
        <div class="relative h-64 border-b-2 border-stone-900 bg-[#e9ece9] overflow-hidden">
          <model-viewer
            class="size-full"
            :src="product.glbPath || product.glb_path || '/models/shoe-soleview-final.glb'"
            :alt="`3D model of ${product.name}`"
            camera-controls
            touch-action="pan-y"
            shadow-intensity="0.3"
            shadow-softness="1"
            exposure="1.2"
            environment-image="neutral"
            tone-mapping="neutral"
            auto-rotate
            auto-rotate-delay="2000"
            rotation-per-second="15deg"
          />
          <div class="pointer-events-none absolute bottom-2 left-2 border border-stone-900 bg-white/90 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-[#202220]">
            3D Interactive
          </div>
        </div>

        <!-- Card Body -->
        <div class="flex flex-1 flex-col justify-between p-5">
          <div>
            <!-- Store Name -->
            <div class="flex items-center gap-1.5 font-mono text-xs font-bold text-[#b94d27]">
              <span>STORE:</span>
              <span class="uppercase tracking-wider text-[#202220]">
                {{ product.storeName || product.store_name || 'Independent Artisan' }}
              </span>
            </div>

            <!-- Shoe Title -->
            <h2 class="font-display mt-1 text-xl font-black tracking-tight text-[#202220] group-hover:text-[#b94d27] transition-colors">
              {{ product.name }}
            </h2>

            <!-- Description -->
            <p v-if="product.description" class="mt-2 text-xs leading-relaxed text-[#5f635f] line-clamp-2">
              {{ product.description }}
            </p>

            <!-- Available Sizes Preview -->
            <div
              v-if="(product.sizesAvailable || product.sizes_available) && (product.sizesAvailable || product.sizes_available).length"
              class="mt-3 flex flex-wrap items-center gap-1"
            >
              <span class="font-mono text-[10px] font-bold uppercase text-[#5f635f]">Sizes:</span>
              <span
                v-for="s in (product.sizesAvailable || product.sizes_available)"
                :key="s"
                class="border border-stone-900 bg-white px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#202220]"
              >
                US {{ s }}
              </span>
            </div>
          </div>

          <!-- Bottom Price & Actions -->
          <div class="mt-5 border-t-2 border-stone-900 pt-4">
            <div class="flex items-baseline justify-between mb-3">
              <span class="font-mono text-xs font-bold text-[#5f635f]">Counter Price</span>
              <span class="font-display text-2xl font-black text-[#202220]">
                ₱{{ Number(product.price).toLocaleString() }}
              </span>
            </div>

            <div class="flex items-center gap-2">
              <button
                type="button"
                class="flex-1 h-11 border-2 border-stone-900 bg-[#202220] font-mono text-xs font-black uppercase tracking-wider text-white shadow-[3px_3px_0px_#202220] transition-all hover:bg-[#b94d27] hover:shadow-[4px_4px_0px_#202220] focus-visible:outline-2 focus-visible:outline-[#245fa8]"
                @click="openProductPreview(product)"
              >
                View in 3D
              </button>
              <button
                type="button"
                class="h-11 border-2 border-stone-900 bg-white px-4 font-mono text-xs font-black uppercase tracking-wider text-[#202220] shadow-[3px_3px_0px_#202220] transition-all hover:bg-[#edf0ec] hover:shadow-[4px_4px_0px_#202220] focus-visible:outline-2 focus-visible:outline-[#245fa8]"
                title="Customize & Order"
                @click="handleSelectProduct(product)"
              >
                Customize & Order
              </button>
            </div>
          </div>

        </div>
      </article>
    </section>

    <!-- ── 3D Details / Quick View Modal ──────────────────────── -->
    <div
      v-if="selectedProduct"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="preview-modal-title"
      @keydown.esc="closeProductPreview"
    >
      <div class="max-h-[90vh] w-full max-w-3xl overflow-y-auto border-2 border-stone-900 bg-[#fcfdfb] p-6 shadow-[8px_8px_0px_#202220]">
        <!-- Modal Header -->
        <div class="flex items-start justify-between border-b-2 border-stone-900 pb-4">
          <div>
            <div class="flex items-center gap-2">
              <span
                class="border px-2 py-0.5 font-mono text-[10px] font-black uppercase tracking-wider"
                :class="[
                  getMethodBadge(selectedProduct.creationMethod || selectedProduct.creation_method).bg,
                  getMethodBadge(selectedProduct.creationMethod || selectedProduct.creation_method).text,
                  getMethodBadge(selectedProduct.creationMethod || selectedProduct.creation_method).border,
                ]"
              >
                {{ getMethodBadge(selectedProduct.creationMethod || selectedProduct.creation_method).label }}
              </span>
              <span class="font-mono text-xs font-bold text-[#b94d27]">
                {{ selectedProduct.storeName || selectedProduct.store_name }}
              </span>
            </div>
            <h2 id="preview-modal-title" class="font-display mt-1 text-2xl font-black text-[#202220]">
              {{ selectedProduct.name }}
            </h2>
          </div>
          <button
            type="button"
            class="grid size-9 place-items-center border-2 border-stone-900 bg-white font-mono text-sm font-black text-stone-900 shadow-[2px_2px_0px_#202220] hover:bg-[#edf0ec]"
            aria-label="Close modal"
            @click="closeProductPreview"
          >
            ✕
          </button>
        </div>

        <!-- Modal 3D Viewer -->
        <div class="relative my-4 h-80 border-2 border-stone-900 bg-[#e9ece9]">
          <model-viewer
            class="size-full"
            :src="selectedProduct.glbPath || selectedProduct.glb_path || '/models/shoe-soleview-final.glb'"
            :alt="selectedProduct.name"
            camera-controls
            touch-action="pan-y"
            shadow-intensity="0.3"
            shadow-softness="1"
            exposure="1.2"
            environment-image="neutral"
            tone-mapping="neutral"
            auto-rotate
          />
        </div>

        <!-- Modal Details -->
        <div class="space-y-4">
          <p v-if="selectedProduct.description" class="text-xs leading-relaxed text-[#5f635f]">
            {{ selectedProduct.description }}
          </p>

          <div class="grid grid-cols-2 gap-4 border-y-2 border-stone-900 py-3 font-mono text-xs">
            <div>
              <span class="text-[#5f635f]">PRICE:</span>
              <span class="ml-2 font-black text-[#202220]">₱{{ Number(selectedProduct.price).toLocaleString() }}</span>
            </div>
            <div>
              <span class="text-[#5f635f]">AVAILABILITY:</span>
              <span class="ml-2 font-bold text-[#202220]">
                {{ selectedProduct.stock > 0 ? `${selectedProduct.stock} in stock` : 'Reserve for Store Pickup' }}
              </span>
            </div>
          </div>

          <!-- Actions -->
          <div class="flex flex-wrap items-center justify-end gap-3 pt-2">
            <button
              type="button"
              class="h-11 border-2 border-stone-900 bg-white px-5 font-mono text-xs font-bold uppercase tracking-wider text-[#202220] shadow-[3px_3px_0px_#202220] hover:bg-[#edf0ec]"
              @click="closeProductPreview"
            >
              Close
            </button>
            <button
              type="button"
              class="h-11 border-2 border-stone-900 bg-[#b94d27] px-6 font-mono text-xs font-black uppercase tracking-wider text-white shadow-[3px_3px_0px_#202220] hover:bg-[#963a20]"
              @click="openOrderModal(selectedProduct); closeProductPreview()"
            >
              Customize & Reserve
            </button>
          </div>
        </div>

      </div>
    </div>

    <!-- ── 3D Customizer & Order Modal ──────────────────────────── -->
    <div
      v-if="orderModalOpen && orderProduct"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="order-modal-title"
      @keydown.esc="closeOrderModal"
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
            class="grid size-9 place-items-center border-2 border-stone-900 bg-white font-mono text-xl font-bold hover:bg-[#edf0ec]"
            aria-label="Close modal"
            @click="closeOrderModal"
          >
            ×
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
                class="border border-stone-900 px-3 py-1 font-mono text-xs font-bold hover:bg-stone-100"
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
              @click="closeOrderModal"
            >
              Track Order
            </a>
            <button
              type="button"
              class="border-2 border-stone-900 bg-white px-6 py-2.5 font-mono text-xs font-bold uppercase tracking-wider text-stone-900 hover:bg-stone-100"
              @click="closeOrderModal"
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
                <button type="button" @click="orderViewerExposure = 1.0" :class="orderViewerExposure === 1.0 ? 'bg-stone-900 text-white font-bold' : 'text-stone-700 hover:bg-stone-200'" class="px-1.5 py-0.5 transition-colors">STD</button>
                <button type="button" @click="orderViewerExposure = 1.2" :class="orderViewerExposure === 1.2 ? 'bg-stone-900 text-white font-bold' : 'text-stone-700 hover:bg-stone-200'" class="px-1.5 py-0.5 transition-colors">BRIGHT</button>
                <button type="button" @click="orderViewerExposure = 1.45" :class="orderViewerExposure === 1.45 ? 'bg-[#b94d27] text-white font-bold' : 'text-stone-700 hover:bg-stone-200'" class="px-1.5 py-0.5 transition-colors">MAX</button>
              </div>

              <model-viewer
                ref="orderViewer"
                class="size-full"
                :src="orderProduct.glbPath || orderProduct.glb_path || '/models/shoe-soleview-final.glb'"
                :alt="orderProduct.name"
                camera-controls
                touch-action="pan-y"
                shadow-intensity="0.25"
                shadow-softness="1"
                :exposure="orderViewerExposure"
                environment-image="neutral"
                tone-mapping="neutral"
                auto-rotate
                @load="onOrderModelLoaded"
              >
                <extra-model
                  v-for="charm in activeCharms"
                  :key="charm.id"
                  :src="charm.src"
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

                  <!-- + Add Color Swatch Button (Native Color Picker) -->
                  <div
                    class="relative flex items-center gap-2 border-2 border-dashed border-stone-900 bg-white p-1.5 font-mono text-[11px] cursor-pointer transition-all hover:border-[#b94d27]"
                    :class="isOrderCustomColorSelected ? 'border-solid border-[#b94d27] bg-[#fdf2ef] font-bold shadow-[2px_2px_0px_#202220]' : ''"
                    title="Click to pick any custom color"
                  >
                    <input
                      type="color"
                      :value="orderCustomHex"
                      @input="onOrderCustomColorInput"
                      class="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                      aria-label="Pick custom color"
                    />
                    <span
                      class="size-4 shrink-0 border border-stone-900 flex items-center justify-center text-[10px] font-black"
                      :style="{
                        backgroundColor: isOrderCustomColorSelected ? orderCurrentColor : '#b94d27',
                        color: isOrderCustomColorSelected ? getContrastTextColor(orderCurrentColor) : '#ffffff'
                      }"
                    >+</span>
                    <span class="truncate text-[#b94d27] font-bold">{{ isOrderCustomColorSelected ? orderCurrentColor.toUpperCase() : '+ Add Color' }}</span>
                  </div>
                </div>

                <!-- Direct Hex Code Input Bar -->
                <div class="mt-2 flex items-center gap-2 border border-stone-900 bg-white p-1.5 shadow-[1px_1px_0px_#202220]">
                  <div
                    class="size-5 rounded-xs border border-stone-900 shrink-0 shadow-xs"
                    :style="{ backgroundColor: orderCurrentColor }"
                    title="Current Color Preview"
                  ></div>
                  <div class="relative flex-1">
                    <span class="absolute left-1.5 top-1/2 -translate-y-1/2 font-mono text-[11px] font-bold text-stone-400">#</span>
                    <input
                      type="text"
                      v-model="orderHexInput"
                      placeholder="B94D27"
                      maxlength="7"
                      class="w-full border border-stone-300 py-0.5 pl-4 pr-1 font-mono text-[11px] uppercase tracking-wider text-stone-900 focus:border-stone-900 focus:outline-none"
                      @keydown.enter.prevent="applyOrderCustomColor"
                    />
                  </div>
                  <button
                    type="button"
                    class="border border-stone-900 bg-[#202220] px-2 py-0.5 font-mono text-[10px] font-bold text-white uppercase hover:bg-[#b94d27] transition-colors cursor-pointer"
                    @click="applyOrderCustomColor"
                  >
                    Apply
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

  </div>
</template>
