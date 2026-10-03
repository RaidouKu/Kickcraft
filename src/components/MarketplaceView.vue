<script setup>
import { computed, onMounted, ref } from 'vue'
import { api } from '../api.js'

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
const selectedMethod = ref('all') // 'all' | 'upload' | 'ai_generate' | 'template'
const selectedProduct = ref(null)

const methodFilters = [
  { id: 'all', label: 'All Sneakers' },
  { id: 'upload', label: 'GLB Uploads' },
  { id: 'ai_generate', label: 'AI Generated' },
  { id: 'template', label: 'Modular Templates' },
]

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
    // Method filter
    const method = product.creationMethod || product.creation_method || 'upload'
    if (selectedMethod.value !== 'all' && method !== selectedMethod.value) {
      return false
    }

    // Search query filter
    if (searchQuery.value.trim()) {
      const q = searchQuery.value.toLowerCase().trim()
      const name = (product.name || '').toLowerCase()
      const desc = (product.description || '').toLowerCase()
      const store = (product.storeName || product.store_name || '').toLowerCase()
      return name.includes(q) || desc.includes(q) || store.includes(q)
    }

    return true
  })
})

function clearFilters() {
  searchQuery.value = ''
  selectedMethod.value = 'all'
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

function handleSelectProduct(product) {
  emit('select-product', product)
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

        <!-- Creation Method Filters -->
        <div class="flex flex-wrap items-center gap-2">
          <button
            v-for="filter in methodFilters"
            :key="filter.id"
            type="button"
            class="h-9 border-2 px-3 font-mono text-xs font-bold uppercase transition-all"
            :class="selectedMethod === filter.id
              ? 'border-stone-900 bg-[#202220] text-white shadow-[2px_2px_0px_#202220]'
              : 'border-stone-900 bg-white text-[#202220] hover:bg-[#edf0ec]'"
            @click="selectedMethod = filter.id"
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
            shadow-intensity="1"
            shadow-softness="0.8"
            exposure="1"
            environment-image="neutral"
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
            shadow-intensity="1"
            exposure="1"
            environment-image="neutral"
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
              @click="handleSelectProduct(selectedProduct); closeProductPreview()"
            >
              Customize & Reserve
            </button>
          </div>
        </div>

      </div>
    </div>

  </div>
</template>
