<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { api } from '../api.js'
import MeshTagger from './MeshTagger.vue'
import ProductCustomizer from './ProductCustomizer.vue'
import TutorialOverlay from './TutorialOverlay.vue'

const props = defineProps({
  currentUser: {
    type: Object,
    default: () => null,
  },
  sellerProfile: {
    type: Object,
    default: () => null,
  },
})

const emit = defineEmits(['logout', 'profileUpdated'])

// ── Derived Profile Computeds ────────────────────────────────
const status = computed(() => {
  return props.sellerProfile?.status || 'pending'
})

const displayStoreName = computed(() => {
  return (
    props.sellerProfile?.storeName ||
    props.sellerProfile?.store_name ||
    props.currentUser?.name ||
    'Your Store'
  )
})

const displayEmail = computed(() => {
  return props.sellerProfile?.email || props.currentUser?.email || '—'
})

const adminNotes = computed(() => {
  return props.sellerProfile?.adminNotes || props.sellerProfile?.admin_notes || ''
})

const formattedAppliedDate = computed(() => {
  const dateStr = props.sellerProfile?.createdAt || props.sellerProfile?.created_at
  if (!dateStr) return 'Recently'
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return dateStr
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return dateStr
  }
})

// ── Tab Navigation & Tutorial ───────────────────────────────
const activeTab = ref('products') // 'products' | 'orders' | 'settings' | 'create'
const showTutorial = ref(false)

// ── Seller Products List State ──────────────────────────────
const products = ref([])
const isLoadingProducts = ref(false)
const isSubmittingReview = ref(null)
const productActionFeedback = ref('')
const productActionError = ref('')

async function loadProducts() {
  if (status.value !== 'approved') return
  isLoadingProducts.value = true
  productActionError.value = ''
  try {
    const res = await api('products/list.php')
    if (res?.products) {
      products.value = res.products
    }
  } catch (err) {
    console.error('Failed to load products:', err)
    productActionError.value = err.message || 'Failed to load products.'
  } finally {
    isLoadingProducts.value = false
  }
}

async function submitProductForReview(productId) {
  if (!productId || isSubmittingReview.value) return
  isSubmittingReview.value = productId
  productActionFeedback.value = ''
  productActionError.value = ''
  try {
    await api('products/submit.php', {
      method: 'POST',
      body: { productId },
    })
    productActionFeedback.value = 'Product submitted for review successfully!'
    await loadProducts()
  } catch (err) {
    productActionError.value = err.message || 'Failed to submit product for review.'
  } finally {
    isSubmittingReview.value = null
  }
}

function formatCreationMethod(method) {
  switch (method) {
    case 'upload':
      return 'GLB Upload'
    case 'ai_generate':
      return 'AI 2D→3D'
    case 'template':
      return 'Template'
    default:
      return method || 'Custom'
  }
}

function getStatusBadgeClass(status) {
  switch (status) {
    case 'approved':
      return 'border-[#3f7652] bg-[#f0f7f2] text-[#3f7652]'
    case 'pending':
      return 'border-[#c97d1e] bg-[#fffbeb] text-[#b45309]'
    case 'rejected':
      return 'border-[#9e3a26] bg-[#fdf2f2] text-[#9e3a26]'
    case 'suspended':
      return 'border-stone-400 bg-stone-200 text-stone-700'
    case 'draft':
    default:
      return 'border-stone-300 bg-stone-100 text-stone-600'
  }
}

function getStatusLabel(status) {
  switch (status) {
    case 'approved':
      return '[ APPROVED ]'
    case 'pending':
      return '[ PENDING REVIEW ]'
    case 'rejected':
      return '[ REJECTED ]'
    case 'suspended':
      return '[ SUSPENDED ]'
    case 'draft':
    default:
      return '[ DRAFT ]'
  }
}

// ── Seller Orders State ─────────────────────────────────────
const orders = ref([])
const orderStatusFilter = ref('all')
const orderSearch = ref('')
const isLoadingOrders = ref(false)
const isUpdatingOrderStatus = ref(null)
const orderActionFeedback = ref('')
const orderActionError = ref('')

async function loadOrders() {
  if (status.value !== 'approved') return
  isLoadingOrders.value = true
  orderActionError.value = ''
  try {
    const res = await api('orders/list.php')
    if (res?.orders) {
      orders.value = res.orders
    }
  } catch (err) {
    console.error('Failed to load orders:', err)
    orderActionError.value = err.message || 'Failed to load orders.'
  } finally {
    isLoadingOrders.value = false
  }
}

const filteredOrders = computed(() => {
  let list = orders.value || []
  if (orderStatusFilter.value !== 'all') {
    list = list.filter(o => (o.status || '').toLowerCase() === orderStatusFilter.value.toLowerCase())
  }
  const q = orderSearch.value.trim().toLowerCase()
  if (q) {
    list = list.filter(o => {
      const id = (o.id || '').toLowerCase()
      const buyerName = (o.buyerName || o.buyer_name || '').toLowerCase()
      const buyerEmail = (o.buyerEmail || o.buyer_email || '').toLowerCase()
      const prodName = (o.productName || o.product_name || '').toLowerCase()
      return id.includes(q) || buyerName.includes(q) || buyerEmail.includes(q) || prodName.includes(q)
    })
  }
  return list
})

async function updateOrderStatus(orderId, newStatus, notes = '') {
  if (!orderId || isUpdatingOrderStatus.value) return
  isUpdatingOrderStatus.value = orderId
  orderActionFeedback.value = ''
  orderActionError.value = ''
  try {
    await api('orders/update-status.php', {
      method: 'POST',
      body: { orderId, status: newStatus, notes },
    })
    orderActionFeedback.value = `Order ${orderId} updated to ${newStatus.toUpperCase()} successfully!`
    await loadOrders()
  } catch (err) {
    console.error('Failed to update order status:', err)
    orderActionError.value = err.message || 'Failed to update order status.'
  } finally {
    isUpdatingOrderStatus.value = null
  }
}

function getOrderStatusBadgeClass(orderStatus) {
  switch (orderStatus) {
    case 'confirmed':
      return 'border-[#1e6ac9] bg-[#eff6ff] text-[#1d4ed8]'
    case 'ready':
      return 'border-[#7c3aed] bg-[#f5f3ff] text-[#6d28d9]'
    case 'completed':
      return 'border-[#3f7652] bg-[#f0f7f2] text-[#3f7652]'
    case 'cancelled':
      return 'border-[#9e3a26] bg-[#fdf2f2] text-[#9e3a26]'
    case 'pending':
    default:
      return 'border-[#c97d1e] bg-[#fffbeb] text-[#b45309]'
  }
}

function getOrderStatusLabel(orderStatus) {
  switch (orderStatus) {
    case 'confirmed':
      return '[ CONFIRMED ]'
    case 'ready':
      return '[ READY FOR PICKUP ]'
    case 'completed':
      return '[ COMPLETED ]'
    case 'cancelled':
      return '[ CANCELLED ]'
    case 'pending':
    default:
      return '[ PENDING ]'
  }
}

function formatPickupDate(dateStr) {
  if (!dateStr) return '—'
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return dateStr
    return d.toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return dateStr
  }
}

// ── Product Creation Wizard State ───────────────────────────
// Steps:
// 0: Creation Method (Upload, AI 2D→3D, Template)
// 1: 3D Model & Mesh Tagging (MeshTagger)
// 2: Color & Charm Customization (ProductCustomizer)
// 3: Details & Submission
const wizardStep = ref(0)
const creationMethod = ref('template') // 'upload' | 'ai_generate' | 'template'

const draftGlbPath = ref('')
const draftBaseShoeId = ref('')
const draftMeshMap = ref({})
const draftPartColors = ref({})
const draftCharmId = ref('none')

const CATEGORY_OPTIONS = [
  { id: 'sneakers', label: 'Sneakers' },
  { id: 'basketball', label: 'Basketball' },
  { id: 'running', label: 'Running' },
  { id: 'fashion', label: 'Fashion' },
  { id: 'kickcraft', label: 'KickCraft Original' },
]

const draftProduct = ref({
  name: '',
  description: '',
  category: 'sneakers',
  price: 4999,
  stock: 10,
  sizesAvailable: [40, 41, 42, 43, 44],
})

const isUploadingGlb = ref(false)
const isGeneratingAi = ref(false)
const isSubmittingProduct = ref(false)
const wizardError = ref('')
const wizardSuccess = ref('')

const TEMPLATES = [
  {
    id: 'soleview',
    name: 'Classic SoleView',
    description: 'Signature low-top silhouette with 8 customizable zones and charm anchor',
    glbPath: '/models/shoe-soleview-final.glb',
    tag: 'Flagship Low',
  },
  {
    id: 'airmax',
    name: 'Air Max Edition',
    description: 'Cushioned athletic runner with visible air pocket and layered panels',
    glbPath: '/models/shoe-airmax-final.glb',
    tag: 'Athletic Runner',
  },
  {
    id: 'dunk',
    name: 'Dunk Low Retro',
    description: 'Court-inspired basketball heritage silhouette with multi-panel blocking',
    glbPath: '/models/shoe-dunk-final.glb',
    tag: 'Heritage Court',
  },
]

const ALL_SIZES = [36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46]

// ── Wizard Methods ──────────────────────────────────────────
function startWizard(method = null) {
  wizardError.value = ''
  wizardSuccess.value = ''
  draftProduct.value = {
    name: '',
    description: '',
    category: 'sneakers',
    price: 4999,
    stock: 10,
    sizesAvailable: [40, 41, 42, 43, 44],
  }
  draftGlbPath.value = ''
  draftBaseShoeId.value = ''
  draftMeshMap.value = {}
  draftPartColors.value = {}
  draftCharmId.value = 'none'

  if (method) {
    selectCreationMethod(method)
  } else {
    creationMethod.value = 'template'
    wizardStep.value = 0
  }
  activeTab.value = 'create'
}

function selectCreationMethod(method) {
  creationMethod.value = method
  wizardError.value = ''
  if (method === 'template') {
    draftBaseShoeId.value = 'soleview'
    draftGlbPath.value = '/models/shoe-soleview-final.glb'
  } else {
    draftBaseShoeId.value = ''
    draftGlbPath.value = ''
  }
  wizardStep.value = 1
}

function selectTemplate(tpl) {
  draftBaseShoeId.value = tpl.id
  draftGlbPath.value = tpl.glbPath
  draftMeshMap.value = {}
}

function cancelWizard() {
  wizardStep.value = 0
  activeTab.value = 'products'
}

async function handleGlbUpload(event) {
  const file = event.target.files?.[0]
  if (!file) return
  if (!file.name.toLowerCase().endsWith('.glb')) {
    wizardError.value = 'Please select a valid .glb 3D model file.'
    return
  }
  wizardError.value = ''
  isUploadingGlb.value = true
  try {
    const formData = new FormData()
    formData.append('file', file)
    const res = await api('products/upload-glb.php', {
      method: 'POST',
      body: formData,
    })
    if (res?.path) {
      draftGlbPath.value = res.path
      draftBaseShoeId.value = ''
      draftMeshMap.value = {}
    } else {
      throw new Error(res?.error || 'Failed to upload GLB file.')
    }
  } catch (err) {
    wizardError.value = err.message || 'Error uploading GLB file.'
  } finally {
    isUploadingGlb.value = false
    if (event.target) event.target.value = ''
  }
}

async function handleAiGenerate(event) {
  const file = event.target.files?.[0]
  if (!file) return
  wizardError.value = ''
  isGeneratingAi.value = true
  try {
    const formData = new FormData()
    formData.append('image', file)
    const res = await api('ai/generate.php', {
      method: 'POST',
      body: formData,
    })
    const glb = res?.generation?.resultGlbPath || res?.generation?.result_glb_path
    if (glb) {
      draftGlbPath.value = glb
      draftBaseShoeId.value = ''
      draftMeshMap.value = {}
    } else {
      throw new Error(res?.error || 'AI generation failed to return 3D model.')
    }
  } catch (err) {
    wizardError.value = err.message || 'Error generating 3D model with AI.'
  } finally {
    isGeneratingAi.value = false
    if (event.target) event.target.value = ''
  }
}

function onMeshTagged(meshMap) {
  draftMeshMap.value = meshMap
  wizardStep.value = 2
}

function onColorsCustomized(payload) {
  draftPartColors.value = payload?.partColors || {}
  draftCharmId.value = payload?.charmId || 'none'
  wizardStep.value = 3
}

function toggleSize(size) {
  const idx = draftProduct.value.sizesAvailable.indexOf(size)
  if (idx > -1) {
    draftProduct.value.sizesAvailable.splice(idx, 1)
  } else {
    draftProduct.value.sizesAvailable.push(size)
    draftProduct.value.sizesAvailable.sort((a, b) => a - b)
  }
}

async function submitProduct() {
  if (isSubmittingProduct.value) return
  wizardError.value = ''
  wizardSuccess.value = ''

  const name = draftProduct.value.name.trim()
  if (name.length < 2) {
    wizardError.value = 'Product name is required (minimum 2 characters).'
    return
  }
  const price = Number(draftProduct.value.price)
  if (isNaN(price) || price < 0) {
    wizardError.value = 'Price must be a valid non-negative number.'
    return
  }
  if (!draftProduct.value.sizesAvailable || draftProduct.value.sizesAvailable.length === 0) {
    wizardError.value = 'Please select at least one available shoe size.'
    return
  }

  isSubmittingProduct.value = true
  try {
    // 1. Create draft product
    const createRes = await api('products/create.php', {
      method: 'POST',
      body: {
        name,
        description: draftProduct.value.description ? draftProduct.value.description.trim() : null,
        category: draftProduct.value.category || 'sneakers',
        price,
        stock: Number(draftProduct.value.stock) || 0,
        creationMethod: creationMethod.value,
        glbPath: draftGlbPath.value || null,
        baseShoeId: draftBaseShoeId.value || null,
        meshMap: draftMeshMap.value,
        partColors: draftPartColors.value,
        charmId: draftCharmId.value,
        sizesAvailable: draftProduct.value.sizesAvailable,
      },
    })

    const productId = createRes.productId || createRes.product?.id

    // 2. Submit draft for admin review
    await api('products/submit.php', {
      method: 'POST',
      body: {
        productId,
      },
    })

    wizardSuccess.value = `Product "${name}" submitted for approval successfully!`
    await loadProducts()
    activeTab.value = 'products'
    wizardStep.value = 0
  } catch (err) {
    wizardError.value = err.message || 'Failed to submit product.'
  } finally {
    isSubmittingProduct.value = false
  }
}

// ── Store Settings Form State ────────────────────────────────
const storeName = ref('')
const storeDescription = ref('')
const isSaving = ref(false)
const saveSuccessMessage = ref('')
const saveErrorMessage = ref('')

// Initialize / sync form when sellerProfile prop changes
watch(
  () => props.sellerProfile,
  profile => {
    if (profile) {
      storeName.value = profile.storeName || profile.store_name || ''
      storeDescription.value = profile.storeDescription || profile.store_description || ''
      if (profile.status === 'approved') {
        loadProducts()
      }
    }
  },
  { immediate: true }
)

watch(
  () => activeTab.value,
  newTab => {
    if (newTab === 'products' && status.value === 'approved') {
      loadProducts()
    }
    if (newTab === 'orders' && status.value === 'approved') {
      loadOrders()
    }
  }
)

onMounted(() => {
  if (status.value === 'approved') {
    loadProducts()
    loadOrders()
  }
})

// ── Store Settings Actions ───────────────────────────────────
async function handleSaveSettings() {
  if (isSaving.value) return
  saveErrorMessage.value = ''
  saveSuccessMessage.value = ''

  const trimmedName = storeName.value.trim()
  if (trimmedName.length < 2 || trimmedName.length > 255) {
    saveErrorMessage.value = 'Store name must be between 2 and 255 characters.'
    return
  }

  const trimmedDescription = storeDescription.value ? storeDescription.value.trim() : ''
  if (trimmedDescription.length > 1000) {
    saveErrorMessage.value = 'Store description must not exceed 1000 characters.'
    return
  }

  isSaving.value = true
  try {
    const res = await api('sellers/update-profile.php', {
      method: 'PUT',
      body: {
        storeName: trimmedName,
        storeDescription: trimmedDescription,
      },
    })

    saveSuccessMessage.value = res.message || 'Store profile updated successfully.'
    if (res.seller) {
      emit('profileUpdated', res.seller)
    }
  } catch (err) {
    saveErrorMessage.value = err.message || 'Failed to update store settings.'
  } finally {
    isSaving.value = false
  }
}

function handleLogout() {
  emit('logout')
}
</script>

<template>
  <div class="min-h-screen bg-[#f7f8f6] text-[#202220]">

    <!-- ══════════════════════════════════════════════════════════ -->
    <!-- 1. PENDING STATE                                            -->
    <!-- ══════════════════════════════════════════════════════════ -->
    <div
      v-if="status === 'pending'"
      class="mx-auto flex min-h-[80vh] max-w-2xl flex-col items-center justify-center px-4 py-12"
    >
      <div class="w-full border-2 border-stone-900 bg-[#fcfdfb] p-8 shadow-[6px_6px_0px_#202220] sm:p-10">
        <!-- Status Pill -->
        <div class="flex items-center justify-between border-b-2 border-stone-900 pb-4">
          <div class="flex items-center gap-2">
            <span class="inline-block h-3 w-3 animate-pulse bg-[#c97d1e]"></span>
            <span class="font-mono text-xs font-black tracking-widest text-[#c97d1e] uppercase">
              Application Under Review
            </span>
          </div>
          <span class="font-mono text-xs text-[#5f635f]">KICKCRAFT PARTNER</span>
        </div>

        <!-- Hero Content -->
        <div class="mt-8 flex flex-col items-center text-center">
          <div class="flex h-16 w-16 items-center justify-center border-2 border-stone-900 bg-[#fffbeb] text-[#c97d1e]">
            <!-- Hourglass / Clock Icon -->
            <svg class="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>

          <h1 class="mt-5 font-display text-2xl font-black tracking-tight text-[#202220] uppercase sm:text-3xl">
            Application Under Review
          </h1>

          <p class="mt-3 max-w-lg text-sm leading-relaxed text-[#5f635f]">
            Your seller application for <strong class="text-[#202220]">{{ displayStoreName }}</strong> is being reviewed by our team.
            We verify all seller profiles to maintain KickCraft quality and craft standards.
          </p>
        </div>

        <!-- Information Card -->
        <div class="mt-8 border-2 border-stone-900 bg-white p-5 font-mono text-xs">
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div class="border-b border-[#cfd2ce] pb-2 sm:border-b-0">
              <span class="text-[#5f635f] uppercase tracking-wider">Store Name</span>
              <p class="mt-1 font-bold text-[#202220]">{{ displayStoreName }}</p>
            </div>
            <div class="border-b border-[#cfd2ce] pb-2 sm:border-b-0">
              <span class="text-[#5f635f] uppercase tracking-wider">Account Email</span>
              <p class="mt-1 font-bold text-[#202220] truncate">{{ displayEmail }}</p>
            </div>
            <div class="border-b border-[#cfd2ce] pb-2 sm:border-b-0">
              <span class="text-[#5f635f] uppercase tracking-wider">Applied Date</span>
              <p class="mt-1 font-bold text-[#202220]">{{ formattedAppliedDate }}</p>
            </div>
            <div>
              <span class="text-[#5f635f] uppercase tracking-wider">Review Status</span>
              <p class="mt-1 font-bold text-[#c97d1e]">Pending Approval</p>
            </div>
          </div>
        </div>

        <!-- Guidance Note -->
        <p class="mt-6 border-l-4 border-[#b94d27] bg-[#fdf2ef] p-3 text-xs text-[#963a20]">
          Decisions are typically made within 24 to 48 hours. Once approved, you can immediately access the
          3D customization studio and publish silhouettes.
        </p>

        <!-- Actions -->
        <div class="mt-8 flex justify-end border-t-2 border-stone-900 pt-6">
          <button
            type="button"
            class="border-2 border-stone-900 bg-[#292b2d] px-6 py-2.5 font-mono text-xs font-bold text-white uppercase tracking-wider transition-colors hover:bg-[#b94d27] focus-visible:outline-2 focus-visible:outline-[#245fa8]"
            @click="handleLogout"
          >
            Log Out
          </button>
        </div>
      </div>
    </div>

    <!-- ══════════════════════════════════════════════════════════ -->
    <!-- 2. REJECTED STATE                                           -->
    <!-- ══════════════════════════════════════════════════════════ -->
    <div
      v-else-if="status === 'rejected'"
      class="mx-auto flex min-h-[80vh] max-w-2xl flex-col items-center justify-center px-4 py-12"
    >
      <div class="w-full border-2 border-stone-900 bg-[#fcfdfb] p-8 shadow-[6px_6px_0px_#202220] sm:p-10">
        <!-- Status Pill -->
        <div class="flex items-center justify-between border-b-2 border-stone-900 pb-4">
          <div class="flex items-center gap-2">
            <span class="inline-block h-3 w-3 bg-[#b94d27]"></span>
            <span class="font-mono text-xs font-black tracking-widest text-[#b94d27] uppercase">
              Application Not Approved
            </span>
          </div>
          <span class="font-mono text-xs text-[#5f635f]">KICKCRAFT PARTNER</span>
        </div>

        <!-- Hero Content -->
        <div class="mt-8 flex flex-col items-center text-center">
          <div class="flex h-16 w-16 items-center justify-center border-2 border-stone-900 bg-[#fdf2ef] text-[#b94d27]">
            <!-- Error / Alert Icon -->
            <svg class="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>

          <h1 class="mt-5 font-display text-2xl font-black tracking-tight text-[#202220] uppercase sm:text-3xl">
            Application Not Approved
          </h1>

          <p class="mt-3 max-w-lg text-sm leading-relaxed text-[#5f635f]">
            Thank you for applying to become a seller with KickCraft. We have reviewed your application for
            <strong class="text-[#202220]">{{ displayStoreName }}</strong>, but it was not approved at this time.
          </p>
        </div>

        <!-- Admin Notes / Feedback -->
        <div v-if="adminNotes" class="mt-8 border-2 border-stone-900 bg-white p-5">
          <div class="font-mono text-xs font-bold text-[#202220] uppercase tracking-wider">
            Reviewer Feedback &amp; Notes
          </div>
          <p class="mt-2 text-sm leading-relaxed text-[#5f635f]">
            {{ adminNotes }}
          </p>
        </div>

        <!-- Support Notice -->
        <div class="mt-6 border-l-4 border-stone-900 bg-white p-4 text-xs text-[#5f635f]">
          <p>
            If you have questions regarding this decision or wish to submit updated documentation, please contact our seller team:
          </p>
          <p class="mt-1 font-mono font-bold text-[#202220]">
            Contact <a href="mailto:admin@kickcraft.local" class="text-[#b94d27] underline">admin@kickcraft.local</a> for more information.
          </p>
        </div>

        <!-- Actions -->
        <div class="mt-8 flex justify-end border-t-2 border-stone-900 pt-6">
          <button
            type="button"
            class="border-2 border-stone-900 bg-[#292b2d] px-6 py-2.5 font-mono text-xs font-bold text-white uppercase tracking-wider transition-colors hover:bg-[#b94d27] focus-visible:outline-2 focus-visible:outline-[#245fa8]"
            @click="handleLogout"
          >
            Log Out
          </button>
        </div>
      </div>
    </div>

    <!-- ══════════════════════════════════════════════════════════ -->
    <!-- 3. SUSPENDED STATE                                          -->
    <!-- ══════════════════════════════════════════════════════════ -->
    <div
      v-else-if="status === 'suspended'"
      class="mx-auto flex min-h-[80vh] max-w-2xl flex-col items-center justify-center px-4 py-12"
    >
      <div class="w-full border-2 border-stone-900 bg-[#fcfdfb] p-8 shadow-[6px_6px_0px_#202220] sm:p-10">
        <!-- Status Pill -->
        <div class="flex items-center justify-between border-b-2 border-stone-900 pb-4">
          <div class="flex items-center gap-2">
            <span class="inline-block h-3 w-3 bg-[#c97d1e]"></span>
            <span class="font-mono text-xs font-black tracking-widest text-[#c97d1e] uppercase">
              Account Suspended
            </span>
          </div>
          <span class="font-mono text-xs text-[#5f635f]">KICKCRAFT PARTNER</span>
        </div>

        <!-- Hero Content -->
        <div class="mt-8 flex flex-col items-center text-center">
          <div class="flex h-16 w-16 items-center justify-center border-2 border-stone-900 bg-[#fffbeb] text-[#c97d1e]">
            <!-- Warning Triangle Icon -->
            <svg class="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>

          <h1 class="mt-5 font-display text-2xl font-black tracking-tight text-[#202220] uppercase sm:text-3xl">
            Account Suspended
          </h1>

          <p class="mt-3 max-w-lg text-sm leading-relaxed text-[#5f635f]">
            Access to the KickCraft Seller Studio for <strong class="text-[#202220]">{{ displayStoreName }}</strong>
            has been temporarily suspended by an administrator.
          </p>
        </div>

        <!-- Admin Notes -->
        <div v-if="adminNotes" class="mt-8 border-2 border-stone-900 bg-white p-5">
          <div class="font-mono text-xs font-bold text-[#202220] uppercase tracking-wider">
            Suspension Reason &amp; Notes
          </div>
          <p class="mt-2 text-sm leading-relaxed text-[#5f635f]">
            {{ adminNotes }}
          </p>
        </div>

        <!-- Support Notice -->
        <div class="mt-6 border-l-4 border-[#c97d1e] bg-[#fffbeb] p-4 text-xs text-[#b45309]">
          <p>
            Please contact administration at <strong class="text-[#202220]">admin@kickcraft.local</strong>
            to discuss reinstating your seller privileges and review store compliance.
          </p>
        </div>

        <!-- Actions -->
        <div class="mt-8 flex justify-end border-t-2 border-stone-900 pt-6">
          <button
            type="button"
            class="border-2 border-stone-900 bg-[#292b2d] px-6 py-2.5 font-mono text-xs font-bold text-white uppercase tracking-wider transition-colors hover:bg-[#b94d27] focus-visible:outline-2 focus-visible:outline-[#245fa8]"
            @click="handleLogout"
          >
            Log Out
          </button>
        </div>
      </div>
    </div>

    <!-- ══════════════════════════════════════════════════════════ -->
    <!-- 4. APPROVED STATE: SELLER STUDIO                            -->
    <!-- ══════════════════════════════════════════════════════════ -->
    <div v-else-if="status === 'approved'" class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">

      <!-- Header Banner -->
      <header class="border-2 border-stone-900 bg-[#fcfdfb] p-6 shadow-[6px_6px_0px_#202220] sm:p-8">
        <div class="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <div class="flex items-center gap-3">
              <span class="inline-block border border-stone-900 bg-[#3f7652] px-2 py-0.5 font-mono text-[10px] font-black tracking-widest text-white uppercase">
                APPROVED SELLER
              </span>
              <span class="font-mono text-xs text-[#5f635f]">{{ displayEmail }}</span>
            </div>
            <h1 class="mt-2 font-display text-2xl font-black tracking-tight text-[#202220] uppercase sm:text-3xl">
              KICKCRAFT SELLER STUDIO
            </h1>
            <p class="mt-1 font-mono text-sm font-bold text-[#b94d27]">
              {{ displayStoreName }}
            </p>
          </div>

          <div class="flex items-center gap-3">
            <button
              type="button"
              class="border-2 border-stone-900 bg-white px-4 py-2.5 font-mono text-xs font-bold text-[#202220] uppercase tracking-wider transition-colors hover:bg-[#f1f3f0]"
              @click="showTutorial = true"
            >
              Start Tutorial
            </button>
            <button
              type="button"
              class="border-2 border-stone-900 bg-white px-5 py-2.5 font-mono text-xs font-bold text-[#202220] uppercase tracking-wider transition-colors hover:bg-[#292b2d] hover:text-white focus-visible:outline-2 focus-visible:outline-[#245fa8]"
              @click="handleLogout"
            >
              Log Out
            </button>
          </div>
        </div>
      </header>

      <!-- Tab Navigation -->
      <nav class="mt-6 flex border-b-2 border-stone-900 bg-[#fcfdfb]" aria-label="Seller studio sections">
        <button
          type="button"
          class="flex items-center gap-2 border-b-2 px-6 py-4 font-mono text-xs font-bold uppercase tracking-wider transition-all"
          :class="activeTab === 'products'
            ? 'border-[#b94d27] bg-white text-[#202220] shadow-[inset_0_-2px_0_#b94d27]'
            : 'border-transparent text-[#5f635f] hover:bg-[#f1f3f0] hover:text-[#202220]'"
          @click="activeTab = 'products'"
        >
          <span v-if="products.length === 0">My Products (0)</span>
          <span v-else>My Products ({{ products.length }})</span>
        </button>

        <button
          data-tutorial="manage_orders"
          type="button"
          class="flex items-center gap-2 border-b-2 px-6 py-4 font-mono text-xs font-bold uppercase tracking-wider transition-all"
          :class="activeTab === 'orders'
            ? 'border-[#b94d27] bg-white text-[#202220] shadow-[inset_0_-2px_0_#b94d27]'
            : 'border-transparent text-[#5f635f] hover:bg-[#f1f3f0] hover:text-[#202220]'"
          @click="activeTab = 'orders'"
        >
          <span v-if="orders.length === 0">My Orders (0)</span>
          <span v-else>My Orders ({{ orders.length }})</span>
        </button>

        <button
          type="button"
          class="flex items-center gap-2 border-b-2 px-6 py-4 font-mono text-xs font-bold uppercase tracking-wider transition-all"
          :class="activeTab === 'settings'
            ? 'border-[#b94d27] bg-white text-[#202220] shadow-[inset_0_-2px_0_#b94d27]'
            : 'border-transparent text-[#5f635f] hover:bg-[#f1f3f0] hover:text-[#202220]'"
          @click="activeTab = 'settings'"
        >
          <span>Store Settings</span>
        </button>

        <button
          v-if="activeTab === 'create'"
          type="button"
          class="flex items-center gap-2 border-b-2 border-[#b94d27] bg-white px-6 py-4 font-mono text-xs font-bold uppercase tracking-wider text-[#b94d27] shadow-[inset_0_-2px_0_#b94d27]"
        >
          <span>+ Product Wizard (Step {{ wizardStep + 1 }}/4)</span>
        </button>
      </nav>

      <!-- ════════════════════════════════════════════════════════ -->
      <!-- TAB 1: MY PRODUCTS                                       -->
      <!-- ════════════════════════════════════════════════════════ -->
      <section v-if="activeTab === 'products'" class="mt-6 space-y-6">
        <!-- Success & Feedback Banners -->
        <div
          v-if="wizardSuccess"
          class="border-2 border-[#3f7652] bg-[#f0f7f2] p-4 font-mono text-xs font-bold text-[#3f7652] shadow-[4px_4px_0px_#202220]"
        >
          &check; {{ wizardSuccess }}
        </div>
        <div
          v-if="productActionFeedback"
          class="border-2 border-[#3f7652] bg-[#f0f7f2] p-4 font-mono text-xs font-bold text-[#3f7652] shadow-[4px_4px_0px_#202220]"
        >
          &check; {{ productActionFeedback }}
        </div>
        <div
          v-if="productActionError"
          class="border-2 border-[#9e3a26] bg-[#fdf2f2] p-4 font-mono text-xs font-bold text-[#9e3a26] shadow-[4px_4px_0px_#202220]"
        >
          &excl; {{ productActionError }}
        </div>

        <!-- Products List View (if products exist) -->
        <div v-if="products.length > 0" class="border-2 border-stone-900 bg-[#fcfdfb] p-6 shadow-[6px_6px_0px_#202220] sm:p-8">
          <div class="flex flex-wrap items-center justify-between gap-4 border-b-2 border-stone-900 pb-4">
            <div>
              <h2 class="font-display text-xl font-black tracking-tight text-[#202220] uppercase">
                MY PRODUCTS ({{ products.length }})
              </h2>
              <p class="mt-1 text-xs text-[#5f635f]">
                Manage, inspect, and monitor your listed 3D sneaker models and store approval status.
              </p>
            </div>

            <div class="flex items-center gap-3">
              <button
                type="button"
                class="flex items-center gap-1.5 border-2 border-stone-900 bg-white px-4 py-2.5 font-mono text-xs font-bold text-[#202220] uppercase tracking-wider transition-colors hover:bg-[#f1f3f0] disabled:opacity-50"
                :disabled="isLoadingProducts"
                @click="loadProducts()"
                title="Refresh products list"
              >
                <svg
                  class="h-4 w-4"
                  :class="{ 'animate-spin': isLoadingProducts }"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                </svg>
                <span>{{ isLoadingProducts ? 'Refreshing...' : 'Refresh' }}</span>
              </button>
              <button
                data-tutorial="create_product"
                type="button"
                class="border-2 border-stone-900 bg-[#292b2d] px-5 py-2.5 font-mono text-xs font-bold text-white uppercase tracking-wider transition-colors hover:bg-[#b94d27] focus-visible:outline-2 focus-visible:outline-[#245fa8]"
                @click="startWizard()"
              >
                + Create New Product
              </button>
            </div>
          </div>

          <!-- Product Cards Grid -->
          <div class="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <div
              v-for="prod in products"
              :key="prod.id"
              class="flex flex-col justify-between border-2 border-stone-900 bg-[#fcfdfb] shadow-[4px_4px_0px_#202220] hover:shadow-[6px_6px_0px_#202220] transition-all"
            >
              <div class="p-5">
                <!-- Card Header: ID & Status Badge -->
                <div class="flex items-center justify-between border-b border-stone-200 pb-3">
                  <span class="font-mono text-[10px] font-bold text-stone-500 uppercase tracking-wider">{{ prod.id }}</span>
                  <span
                    class="border px-2 py-0.5 font-mono text-[10px] font-black tracking-wider uppercase"
                    :class="getStatusBadgeClass(prod.status)"
                  >
                    {{ getStatusLabel(prod.status) }}
                  </span>
                </div>

                <!-- Thumbnail / 3D Model Preview Container -->
                <div class="mt-3 flex h-36 w-full items-center justify-center overflow-hidden border border-stone-200 bg-stone-50">
                  <img
                    v-if="prod.thumbnailPath || prod.thumbnail_path"
                    :src="prod.thumbnailPath || prod.thumbnail_path"
                    :alt="prod.name"
                    class="h-full w-full object-contain p-2"
                  />
                  <div v-else class="flex flex-col items-center justify-center text-stone-400">
                    <svg class="h-10 w-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                      <line x1="12" y1="22.08" x2="12" y2="12" />
                    </svg>
                    <span class="mt-1 font-mono text-[10px] uppercase">3D Shoe Model</span>
                  </div>
                </div>

                <!-- Product Title & Store Name -->
                <h3 class="mt-3 font-display text-base font-black uppercase text-[#202220] line-clamp-1">
                  {{ prod.name }}
                </h3>
                <p class="font-mono text-[11px] font-bold text-[#b94d27]">
                  {{ prod.storeName || prod.store_name || displayStoreName }}
                </p>
                <p v-if="prod.description" class="mt-1 line-clamp-2 text-xs text-[#5f635f]">
                  {{ prod.description }}
                </p>

                <!-- Creation Method & Charm Metadata Badges -->
                <div class="mt-3 flex flex-wrap items-center gap-2 font-mono text-[10px]">
                  <span class="border border-stone-300 bg-stone-100 px-2 py-0.5 font-bold text-stone-700 uppercase">
                    Method: {{ formatCreationMethod(prod.creationMethod || prod.creation_method) }}
                  </span>
                  <span v-if="prod.charmId && prod.charmId !== 'none'" class="border border-stone-300 bg-white px-2 py-0.5 text-[#b94d27] uppercase">
                    Charm: {{ prod.charmId }}
                  </span>
                  <span v-if="prod.stock !== undefined" class="border border-stone-300 bg-stone-100 px-2 py-0.5 text-stone-600">
                    Stock: {{ prod.stock }}
                  </span>
                </div>

                <!-- Admin Feedback Notes if Rejected -->
                <div
                  v-if="prod.status === 'rejected' && (prod.adminNotes || prod.admin_notes)"
                  class="mt-3 border-l-2 border-[#9e3a26] bg-[#fdf2f2] p-2.5 font-mono text-[11px] text-[#9e3a26]"
                >
                  <span class="font-bold uppercase tracking-wider">Admin Feedback:</span>
                  <p class="mt-0.5 font-sans text-xs text-stone-800">{{ prod.adminNotes || prod.admin_notes }}</p>
                </div>
              </div>

              <!-- Card Footer: Price & Actions -->
              <div class="border-t-2 border-stone-900 bg-white p-4">
                <div class="flex items-center justify-between">
                  <div>
                    <span class="block font-mono text-[10px] text-stone-500 uppercase">Price</span>
                    <span class="font-mono text-base font-black text-[#b94d27]">
                      ₱{{ Number(prod.price).toLocaleString() }}
                    </span>
                  </div>

                  <!-- Actions -->
                  <div class="flex items-center gap-2">
                    <button
                      v-if="prod.status === 'draft' || prod.status === 'rejected'"
                      type="button"
                      class="border-2 border-stone-900 bg-[#292b2d] px-3 py-1.5 font-mono text-xs font-bold text-white uppercase tracking-wider transition-colors hover:bg-[#b94d27] focus-visible:outline-2 focus-visible:outline-[#245fa8] disabled:opacity-50"
                      :disabled="isSubmittingReview === prod.id"
                      @click="submitProductForReview(prod.id)"
                    >
                      <span v-if="isSubmittingReview === prod.id">Submitting...</span>
                      <span v-else>Submit for Review</span>
                    </button>
                    <span
                      v-else-if="prod.status === 'pending'"
                      class="border border-[#c97d1e] bg-[#fffbeb] px-2 py-1 font-mono text-[10px] font-black text-[#b45309] uppercase tracking-wider"
                    >
                      Under Review
                    </span>
                    <span
                      v-else-if="prod.status === 'approved'"
                      class="border border-[#3f7652] bg-[#f0f7f2] px-2 py-1 font-mono text-[10px] font-black text-[#3f7652] uppercase tracking-wider"
                    >
                      Live in Market
                    </span>
                    <span
                      v-else-if="prod.status === 'suspended'"
                      class="border border-stone-400 bg-stone-200 px-2 py-1 font-mono text-[10px] font-black text-stone-700 uppercase tracking-wider"
                    >
                      Listing Suspended
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Empty State (when products.length === 0) -->
        <div v-else class="border-2 border-stone-900 bg-[#fcfdfb] p-8 shadow-[6px_6px_0px_#202220]">
          <div class="flex flex-col items-center justify-center py-12 text-center">
            <!-- Product box icon -->
            <div class="flex h-16 w-16 items-center justify-center border-2 border-stone-900 bg-[#f7f8f6] text-[#202220]">
              <svg class="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                <line x1="12" y1="22.08" x2="12" y2="12" />
              </svg>
            </div>

            <h2 class="mt-5 font-display text-xl font-black tracking-tight text-[#202220] uppercase sm:text-2xl">
              You haven't listed any products yet.
            </h2>

            <p class="mt-2 max-w-md text-sm text-[#5f635f]">
              Publish custom 3D sneaker silhouettes, set customizable part zones, configure pricing, and let customers personalize your designs.
            </p>

            <div class="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button
                data-tutorial="create_product"
                type="button"
                class="border-2 border-stone-900 bg-[#292b2d] px-6 py-3 font-mono text-xs font-bold text-white uppercase tracking-wider transition-colors hover:bg-[#b94d27] focus-visible:outline-2 focus-visible:outline-[#245fa8]"
                @click="startWizard()"
              >
                + Create New Product
              </button>
              <button
                type="button"
                class="border-2 border-stone-900 bg-white px-6 py-3 font-mono text-xs font-bold text-[#202220] uppercase tracking-wider transition-colors hover:bg-[#f1f3f0] focus-visible:outline-2 focus-visible:outline-[#245fa8]"
                @click="showTutorial = true"
              >
                Start Tutorial
              </button>
              <button
                type="button"
                class="flex items-center gap-1.5 border-2 border-stone-900 bg-white px-5 py-3 font-mono text-xs font-bold text-[#202220] uppercase tracking-wider transition-colors hover:bg-[#f1f3f0] disabled:opacity-50"
                :disabled="isLoadingProducts"
                @click="loadProducts()"
              >
                <svg
                  class="h-4 w-4"
                  :class="{ 'animate-spin': isLoadingProducts }"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                </svg>
                <span>{{ isLoadingProducts ? 'Refreshing...' : 'Refresh' }}</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- ════════════════════════════════════════════════════════ -->
      <!-- TAB: PRODUCT CREATION WIZARD                             -->
      <!-- ════════════════════════════════════════════════════════ -->
      <section v-if="activeTab === 'create'" class="mt-6 space-y-6">
        <!-- Wizard Navigation / Steps Header Bar -->
        <div class="border-2 border-stone-900 bg-[#fcfdfb] p-4 shadow-[4px_4px_0px_#202220]">
          <div class="flex flex-wrap items-center justify-between gap-4">
            <div class="flex items-center gap-3">
              <span class="inline-block h-3 w-3 bg-[#b94d27]"></span>
              <h2 class="font-display text-lg font-black tracking-tight text-[#202220] uppercase">
                Product Creation Wizard
              </h2>
              <span class="border border-stone-900 bg-stone-100 px-2 py-0.5 font-mono text-[10px] font-bold text-stone-700 uppercase">
                Step {{ wizardStep + 1 }} of 4
              </span>
            </div>

            <!-- Steps Tabs -->
            <div class="flex flex-wrap items-center gap-2 font-mono text-xs">
              <button
                type="button"
                class="border px-3 py-1 font-bold transition-colors"
                :class="wizardStep === 0
                  ? 'border-stone-900 bg-[#b94d27] text-white shadow-[2px_2px_0px_#202220]'
                  : 'border-stone-300 bg-white text-stone-600 hover:border-stone-900'"
                @click="wizardStep = 0"
              >
                1. Method
              </button>
              <span class="text-stone-400">&rarr;</span>
              <button
                type="button"
                class="border px-3 py-1 font-bold transition-colors"
                :class="wizardStep === 1
                  ? 'border-stone-900 bg-[#b94d27] text-white shadow-[2px_2px_0px_#202220]'
                  : 'border-stone-300 bg-white text-stone-600 hover:border-stone-900'"
                :disabled="!draftGlbPath && wizardStep < 1"
                @click="draftGlbPath ? wizardStep = 1 : null"
              >
                2. Model &amp; Meshes
              </button>
              <span class="text-stone-400">&rarr;</span>
              <button
                type="button"
                class="border px-3 py-1 font-bold transition-colors"
                :class="wizardStep === 2
                  ? 'border-stone-900 bg-[#b94d27] text-white shadow-[2px_2px_0px_#202220]'
                  : 'border-stone-300 bg-white text-stone-600 hover:border-stone-900'"
                :disabled="Object.keys(draftMeshMap).length === 0"
                @click="Object.keys(draftMeshMap).length ? wizardStep = 2 : null"
              >
                3. Customizer
              </button>
              <span class="text-stone-400">&rarr;</span>
              <button
                type="button"
                class="border px-3 py-1 font-bold transition-colors"
                :class="wizardStep === 3
                  ? 'border-stone-900 bg-[#b94d27] text-white shadow-[2px_2px_0px_#202220]'
                  : 'border-stone-300 bg-white text-stone-600 hover:border-stone-900'"
                :disabled="Object.keys(draftMeshMap).length === 0"
                @click="Object.keys(draftMeshMap).length ? wizardStep = 3 : null"
              >
                4. Details
              </button>

              <button
                type="button"
                class="ml-4 border border-stone-900 bg-white px-3 py-1 font-mono text-xs font-bold text-stone-700 transition-colors hover:bg-stone-900 hover:text-white"
                @click="cancelWizard"
              >
                &times; Exit
              </button>
            </div>
          </div>
        </div>

        <!-- Error & Feedback Banner -->
        <div
          v-if="wizardError"
          class="border-2 border-[#b94d27] bg-[#fdf2ef] p-4 font-mono text-xs font-bold text-[#963a20] shadow-[4px_4px_0px_#202220]"
        >
          &times; {{ wizardError }}
        </div>

        <!-- ────────────────────────────────────────────────────── -->
        <!-- STEP 0: CREATION METHOD SELECTION                      -->
        <!-- ────────────────────────────────────────────────────── -->
        <div
          v-if="wizardStep === 0"
          data-tutorial="choose_method"
          class="border-2 border-stone-900 bg-[#fcfdfb] p-6 shadow-[6px_6px_0px_#202220] sm:p-8"
        >
          <div class="border-b-2 border-stone-900 pb-4">
            <span class="font-mono text-xs font-bold text-[#b94d27] uppercase tracking-wider">[ STEP 1: SILHOUETTE SOURCE ]</span>
            <h3 class="mt-1 font-display text-2xl font-black tracking-tight text-[#202220] uppercase">
              Select Creation Method
            </h3>
            <p class="mt-1 text-sm text-[#5f635f]">
              Choose how you want to build your new 3D shoe product. You can bring your own 3D GLB file, synthesize a model from an image using AI, or start from KickCraft verified templates.
            </p>
          </div>

          <div class="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
            <!-- 1. Upload GLB -->
            <div
              class="flex flex-col justify-between border-2 border-stone-900 bg-white p-6 shadow-[4px_4px_0px_#202220] transition-all hover:-translate-y-1 hover:shadow-[6px_6px_0px_#202220]"
              :class="creationMethod === 'upload' ? 'ring-2 ring-[#b94d27]' : ''"
            >
              <div>
                <div class="flex h-12 w-12 items-center justify-center border-2 border-stone-900 bg-[#f7f8f6] text-[#202220]">
                  <svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                </div>
                <h4 class="mt-4 font-display text-lg font-black uppercase text-[#202220]">
                  Upload GLB Model
                </h4>
                <span class="inline-block mt-1 border border-stone-900 bg-stone-100 px-2 py-0.5 font-mono text-[10px] font-bold text-stone-700 uppercase">
                  Max 20MB &middot; .glb format
                </span>
                <p class="mt-3 text-xs leading-relaxed text-[#5f635f]">
                  Import your pre-built 3D sneaker file. You'll map meshes to KickCraft customizable parts (Upper, Midsole, Laces, etc.) using our visual tagger.
                </p>
              </div>

              <button
                type="button"
                class="mt-6 border-2 border-stone-900 bg-[#292b2d] px-4 py-3 font-mono text-xs font-bold text-white uppercase tracking-wider transition-colors hover:bg-[#b94d27]"
                @click="selectCreationMethod('upload')"
              >
                Select Upload GLB
              </button>
            </div>

            <!-- 2. AI 2D→3D Generation -->
            <div
              class="flex flex-col justify-between border-2 border-stone-900 bg-white p-6 shadow-[4px_4px_0px_#202220] transition-all hover:-translate-y-1 hover:shadow-[6px_6px_0px_#202220]"
              :class="creationMethod === 'ai_generate' ? 'ring-2 ring-[#b94d27]' : ''"
            >
              <div>
                <div class="flex h-12 w-12 items-center justify-center border-2 border-stone-900 bg-[#fdf2ef] text-[#b94d27]">
                  <svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                </div>
                <h4 class="mt-4 font-display text-lg font-black uppercase text-[#202220]">
                  AI 2D&rarr;3D Generate
                </h4>
                <span class="inline-block mt-1 border border-stone-900 bg-[#fffbeb] px-2 py-0.5 font-mono text-[10px] font-bold text-[#b45309] uppercase">
                  TripoSR Engine &middot; JPG / PNG
                </span>
                <p class="mt-3 text-xs leading-relaxed text-[#5f635f]">
                  Upload a clean 2D sneaker side profile photo or concept sketch. Our integrated AI generates an interactive 3D model automatically.
                </p>
              </div>

              <button
                type="button"
                class="mt-6 border-2 border-stone-900 bg-[#292b2d] px-4 py-3 font-mono text-xs font-bold text-white uppercase tracking-wider transition-colors hover:bg-[#b94d27]"
                @click="selectCreationMethod('ai_generate')"
              >
                Select AI 2D&rarr;3D
              </button>
            </div>

            <!-- 3. Template Builder -->
            <div
              class="flex flex-col justify-between border-2 border-stone-900 bg-white p-6 shadow-[4px_4px_0px_#202220] transition-all hover:-translate-y-1 hover:shadow-[6px_6px_0px_#202220]"
              :class="creationMethod === 'template' ? 'ring-2 ring-[#b94d27]' : ''"
            >
              <div>
                <div class="flex h-12 w-12 items-center justify-center border-2 border-stone-900 bg-[#f0f7f2] text-[#3f7652]">
                  <svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <line x1="3" y1="9" x2="21" y2="9" />
                    <line x1="9" y1="21" x2="9" y2="9" />
                  </svg>
                </div>
                <h4 class="mt-4 font-display text-lg font-black uppercase text-[#202220]">
                  Template Builder
                </h4>
                <span class="inline-block mt-1 border border-stone-900 bg-[#f0f7f2] px-2 py-0.5 font-mono text-[10px] font-bold text-[#3f7652] uppercase">
                  Pre-built &middot; Verified Compatibility
                </span>
                <p class="mt-3 text-xs leading-relaxed text-[#5f635f]">
                  Choose from verified KickCraft silhouettes (Classic SoleView, Air Max, Dunk Low) with optimized meshes, UV mapping, and CharmAnchor ready.
                </p>
              </div>

              <button
                type="button"
                class="mt-6 border-2 border-stone-900 bg-[#b94d27] px-4 py-3 font-mono text-xs font-bold text-white uppercase tracking-wider transition-colors hover:bg-[#963a20]"
                @click="selectCreationMethod('template')"
              >
                Select Template Builder
              </button>
            </div>
          </div>
        </div>

        <!-- ────────────────────────────────────────────────────── -->
        <!-- STEP 1: 3D MODEL & MESH TAGGING (MeshTagger)          -->
        <!-- ────────────────────────────────────────────────────── -->
        <div v-if="wizardStep === 1" class="space-y-6">
          <div class="border-2 border-stone-900 bg-[#fcfdfb] p-6 shadow-[6px_6px_0px_#202220]">
            <div class="flex flex-wrap items-center justify-between gap-4 border-b-2 border-stone-900 pb-4">
              <div>
                <span class="font-mono text-xs font-bold text-[#b94d27] uppercase tracking-wider">[ STEP 2: 3D MODEL &amp; MESH TAGGING ]</span>
                <h3 class="mt-1 font-display text-2xl font-black tracking-tight text-[#202220] uppercase">
                  {{ creationMethod === 'upload' ? 'Upload GLB & Tag Meshes' : creationMethod === 'ai_generate' ? 'AI 2D→3D Model & Tag Meshes' : 'Select Template & Tag Meshes' }}
                </h3>
              </div>
              <button
                type="button"
                class="border border-stone-900 bg-white px-3 py-1.5 font-mono text-xs font-bold text-stone-700 hover:bg-stone-900 hover:text-white"
                @click="wizardStep = 0"
              >
                &larr; Change Method
              </button>
            </div>

            <!-- Upload Input View -->
            <div v-if="creationMethod === 'upload'" class="mt-6">
              <div v-if="!draftGlbPath" class="flex flex-col items-center justify-center border-2 border-dashed border-stone-900 bg-[#f7f8f6] p-8 text-center">
                <svg class="h-12 w-12 text-stone-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <p class="mt-3 font-mono text-sm font-bold text-[#202220]">
                  Select or drag your .glb 3D shoe model
                </p>
                <p class="mt-1 font-mono text-xs text-[#5f635f]">
                  Supports glTF binary (.glb) up to 20MB
                </p>
                <label
                  class="mt-4 inline-block cursor-pointer border-2 border-stone-900 bg-[#292b2d] px-6 py-2.5 font-mono text-xs font-bold text-white uppercase tracking-wider transition-colors hover:bg-[#b94d27]"
                >
                  <span v-if="isUploadingGlb">Uploading GLB...</span>
                  <span v-else>Browse .GLB File</span>
                  <input
                    type="file"
                    accept=".glb"
                    class="hidden"
                    :disabled="isUploadingGlb"
                    @change="handleGlbUpload"
                  />
                </label>
              </div>

              <div v-else class="flex flex-wrap items-center justify-between border-2 border-stone-900 bg-white p-4 font-mono text-xs">
                <div class="flex items-center gap-2">
                  <span class="inline-block h-2.5 w-2.5 bg-[#3f7652]"></span>
                  <span class="text-[#5f635f] uppercase">Loaded GLB:</span>
                  <strong class="text-[#202220]">{{ draftGlbPath }}</strong>
                </div>
                <label class="cursor-pointer border border-stone-900 bg-stone-100 px-3 py-1 font-bold text-stone-800 hover:bg-stone-900 hover:text-white">
                  <span>Change Model</span>
                  <input type="file" accept=".glb" class="hidden" @change="handleGlbUpload" />
                </label>
              </div>
            </div>

            <!-- AI 2D→3D Generation Input View -->
            <div v-else-if="creationMethod === 'ai_generate'" class="mt-6">
              <div v-if="!draftGlbPath" class="flex flex-col items-center justify-center border-2 border-dashed border-stone-900 bg-[#f7f8f6] p-8 text-center">
                <svg class="h-12 w-12 text-[#b94d27]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
                <p class="mt-3 font-mono text-sm font-bold text-[#202220]">
                  Upload 2D Sneaker Photo to Generate 3D Model
                </p>
                <p class="mt-1 font-mono text-xs text-[#5f635f]">
                  Supports JPG or PNG (side profile recommended, max 10MB)
                </p>
                <label
                  class="mt-4 inline-block cursor-pointer border-2 border-stone-900 bg-[#292b2d] px-6 py-2.5 font-mono text-xs font-bold text-white uppercase tracking-wider transition-colors hover:bg-[#b94d27]"
                >
                  <span v-if="isGeneratingAi">Generating 3D Model with AI...</span>
                  <span v-else>Upload Photo &amp; Generate</span>
                  <input
                    type="file"
                    accept="image/*"
                    class="hidden"
                    :disabled="isGeneratingAi"
                    @change="handleAiGenerate"
                  />
                </label>
              </div>

              <div v-else class="flex flex-wrap items-center justify-between border-2 border-stone-900 bg-white p-4 font-mono text-xs">
                <div class="flex items-center gap-2">
                  <span class="inline-block h-2.5 w-2.5 bg-[#3f7652]"></span>
                  <span class="text-[#5f635f] uppercase">AI Generated 3D Mesh:</span>
                  <strong class="text-[#202220]">{{ draftGlbPath }}</strong>
                </div>
                <label class="cursor-pointer border border-stone-900 bg-stone-100 px-3 py-1 font-bold text-stone-800 hover:bg-stone-900 hover:text-white">
                  <span>Upload Another Image</span>
                  <input type="file" accept="image/*" class="hidden" @change="handleAiGenerate" />
                </label>
              </div>
            </div>

            <!-- Template Picker View -->
            <div v-else-if="creationMethod === 'template'" class="mt-6">
              <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div
                  v-for="tpl in TEMPLATES"
                  :key="tpl.id"
                  class="cursor-pointer border-2 border-stone-900 p-4 transition-all"
                  :class="draftBaseShoeId === tpl.id ? 'bg-[#fffbeb] shadow-[4px_4px_0px_#b94d27]' : 'bg-white hover:bg-[#f7f8f6]'"
                  @click="selectTemplate(tpl)"
                >
                  <div class="flex items-center justify-between">
                    <span class="border border-stone-900 bg-stone-100 px-2 py-0.5 font-mono text-[10px] font-bold text-stone-800 uppercase">
                      {{ tpl.tag }}
                    </span>
                    <span v-if="draftBaseShoeId === tpl.id" class="font-mono text-xs font-bold text-[#b94d27]">
                      &check; SELECTED
                    </span>
                  </div>
                  <h4 class="mt-2 font-display text-base font-black uppercase text-[#202220]">
                    {{ tpl.name }}
                  </h4>
                  <p class="mt-1 text-xs text-[#5f635f]">
                    {{ tpl.description }}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <!-- Mesh Tagger Component -->
          <div v-if="draftGlbPath" data-tutorial="tag_meshes" class="mt-6">
            <MeshTagger
              :glb-path="draftGlbPath"
              :initial-mesh-map="draftMeshMap"
              @complete="onMeshTagged"
              @cancel="cancelWizard"
            />
          </div>
        </div>

        <!-- ────────────────────────────────────────────────────── -->
        <!-- STEP 2: COLOR & CHARM CUSTOMIZATION                    -->
        <!-- ────────────────────────────────────────────────────── -->
        <div v-if="wizardStep === 2" data-tutorial="customize_colors" class="space-y-6">
          <div class="border-2 border-stone-900 bg-[#fcfdfb] p-6 shadow-[6px_6px_0px_#202220]">
            <div class="flex flex-wrap items-center justify-between gap-4 border-b-2 border-stone-900 pb-4">
              <div>
                <span class="font-mono text-xs font-bold text-[#b94d27] uppercase tracking-wider">[ STEP 3: COLOR &amp; CHARM CUSTOMIZATION ]</span>
                <h3 class="mt-1 font-display text-2xl font-black tracking-tight text-[#202220] uppercase">
                  Default Colors &amp; Accessory Charms
                </h3>
                <p class="mt-1 text-sm text-[#5f635f]">
                  Configure signature color palettes for each shoe part and select an accessory charm for 3D previews.
                </p>
              </div>
              <button
                type="button"
                class="border border-stone-900 bg-white px-3 py-1.5 font-mono text-xs font-bold text-stone-700 hover:bg-stone-900 hover:text-white"
                @click="wizardStep = 1"
              >
                &larr; Back to Mesh Tagging
              </button>
            </div>
          </div>

          <ProductCustomizer
            :glb-path="draftGlbPath"
            :mesh-map="draftMeshMap"
            :initial-colors="draftPartColors"
            :initial-charm="draftCharmId"
            @complete="onColorsCustomized"
            @back="wizardStep = 1"
          />
        </div>

        <!-- ────────────────────────────────────────────────────── -->
        <!-- STEP 3: DETAILS & SUBMISSION                           -->
        <!-- ────────────────────────────────────────────────────── -->
        <div v-if="wizardStep === 3" data-tutorial="set_details" class="border-2 border-stone-900 bg-[#fcfdfb] p-6 shadow-[6px_6px_0px_#202220] sm:p-8">
          <div class="border-b-2 border-stone-900 pb-4">
            <span class="font-mono text-xs font-bold text-[#b94d27] uppercase tracking-wider">[ STEP 4: FINAL DETAILS &amp; SUBMISSION ]</span>
            <h3 class="mt-1 font-display text-2xl font-black tracking-tight text-[#202220] uppercase">
              Product Details &amp; Pricing
            </h3>
            <p class="mt-1 text-sm text-[#5f635f]">
              Set your shoe's name, description, counter pickup price, inventory stock, and available sizes before submitting for store review.
            </p>
          </div>

          <div class="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-3">
            <!-- Form Fields -->
            <div class="space-y-6 lg:col-span-2">
              <div>
                <label for="product-name" class="font-mono text-xs font-bold uppercase tracking-wider text-[#202220]">
                  Product Name / Title <span class="text-[#b94d27]">*</span>
                </label>
                <input
                  id="product-name"
                  v-model="draftProduct.name"
                  type="text"
                  required
                  maxlength="255"
                  placeholder="e.g. Apex High-Top Retro"
                  class="mt-2 w-full border-2 border-stone-900 bg-white px-4 py-2.5 font-mono text-sm text-[#202220] focus:border-[#b94d27] focus:outline-none"
                />
              </div>

              <div>
                <label for="product-desc" class="font-mono text-xs font-bold uppercase tracking-wider text-[#202220]">
                  Product Description &amp; Design Notes
                </label>
                <textarea
                  id="product-desc"
                  v-model="draftProduct.description"
                  rows="4"
                  placeholder="Describe silhouette features, leather materials, cushioning tech, and inspiration..."
                  class="mt-2 w-full border-2 border-stone-900 bg-white px-4 py-2.5 text-sm text-[#202220] focus:border-[#b94d27] focus:outline-none"
                ></textarea>
              </div>

              <!-- Category & Style Tag Selector -->
              <div>
                <label class="font-mono text-xs font-bold uppercase tracking-wider text-[#202220]">
                  Category &amp; Style Tag <span class="text-[#b94d27]">*</span>
                </label>
                <p class="mt-1 text-xs text-[#5f635f]">Choose the marketplace category tag so customers can discover your sneaker style.</p>
                <div class="mt-3 flex flex-wrap gap-2">
                  <button
                    v-for="cat in CATEGORY_OPTIONS"
                    :key="cat.id"
                    type="button"
                    class="border-2 px-3 py-1.5 font-mono text-xs font-bold uppercase transition-all"
                    :class="draftProduct.category === cat.id
                      ? 'border-stone-900 bg-[#292b2d] text-white shadow-[2px_2px_0px_#b94d27]'
                      : 'border-stone-300 bg-white text-stone-700 hover:border-stone-900'"
                    @click="draftProduct.category = cat.id"
                  >
                    {{ cat.label }}
                  </button>
                </div>
              </div>

              <!-- Price & Stock -->
              <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label for="product-price" class="font-mono text-xs font-bold uppercase tracking-wider text-[#202220]">
                    Price (PHP ₱) <span class="text-[#b94d27]">*</span>
                  </label>
                  <div class="mt-2 relative">
                    <span class="absolute left-3 top-2.5 font-mono text-sm font-bold text-stone-500">₱</span>
                    <input
                      id="product-price"
                      v-model.number="draftProduct.price"
                      type="number"
                      min="0"
                      step="0.01"
                      required
                      class="w-full border-2 border-stone-900 bg-white pl-8 pr-4 py-2.5 font-mono text-sm text-[#202220] focus:border-[#b94d27] focus:outline-none"
                    />
                  </div>
                  <p class="mt-1 font-mono text-[11px] text-[#5f635f]">Store counter pickup reservation price</p>
                </div>

                <div>
                  <label for="product-stock" class="font-mono text-xs font-bold uppercase tracking-wider text-[#202220]">
                    Available Pickup Stock <span class="text-[#b94d27]">*</span>
                  </label>
                  <input
                    id="product-stock"
                    v-model.number="draftProduct.stock"
                    type="number"
                    min="0"
                    step="1"
                    required
                    class="mt-2 w-full border-2 border-stone-900 bg-white px-4 py-2.5 font-mono text-sm text-[#202220] focus:border-[#b94d27] focus:outline-none"
                  />
                  <p class="mt-1 font-mono text-[11px] text-[#5f635f]">Initial quantity ready for reservation</p>
                </div>
              </div>

              <!-- Available Sizes Checkboxes -->
              <div>
                <label class="font-mono text-xs font-bold uppercase tracking-wider text-[#202220]">
                  Available Shoe Sizes (EU) <span class="text-[#b94d27]">*</span>
                </label>
                <p class="mt-1 text-xs text-[#5f635f]">Select all sizes available for pickup customization.</p>
                <div class="mt-3 flex flex-wrap gap-2">
                  <button
                    v-for="sz in ALL_SIZES"
                    :key="sz"
                    type="button"
                    class="border-2 px-3.5 py-1.5 font-mono text-xs font-bold transition-all"
                    :class="draftProduct.sizesAvailable.includes(sz)
                      ? 'border-stone-900 bg-[#292b2d] text-white shadow-[2px_2px_0px_#b94d27]'
                      : 'border-stone-300 bg-white text-stone-700 hover:border-stone-900'"
                    @click="toggleSize(sz)"
                  >
                    {{ sz }}
                  </button>
                </div>
              </div>
            </div>

            <!-- Right Column: Specs Summary Card -->
            <div class="border-2 border-stone-900 bg-white p-5 shadow-[4px_4px_0px_#202220]">
              <div class="border-b-2 border-stone-900 pb-3">
                <span class="font-mono text-[10px] font-bold tracking-widest text-[#5f635f] uppercase">SPECIFICATION SUMMARY</span>
                <h4 class="mt-1 font-display text-lg font-black uppercase text-[#202220]">
                  3D Sneaker Spec
                </h4>
              </div>

              <div class="mt-4 space-y-3 font-mono text-xs">
                <div>
                  <span class="text-[#5f635f] uppercase tracking-wider text-[11px]">Creation Method</span>
                  <p class="font-bold text-[#202220] uppercase">
                    {{ creationMethod === 'upload' ? 'GLB Upload' : creationMethod === 'ai_generate' ? 'AI 2D→3D' : 'Template Builder' }}
                  </p>
                </div>

                <div>
                  <span class="text-[#5f635f] uppercase tracking-wider text-[11px]">Category &amp; Style</span>
                  <p class="font-bold text-[#202220] uppercase">
                    {{ CATEGORY_OPTIONS.find(c => c.id === draftProduct.category)?.label || 'Sneakers' }}
                  </p>
                </div>

                <div>
                  <span class="text-[#5f635f] uppercase tracking-wider text-[11px]">3D Model Asset</span>
                  <p class="font-bold text-[#202220] truncate">{{ draftGlbPath }}</p>
                </div>

                <div>
                  <span class="text-[#5f635f] uppercase tracking-wider text-[11px]">Customizable Parts</span>
                  <p class="font-bold text-[#202220]">
                    {{ Object.keys(draftMeshMap).length }} of 8 Parts Mapped
                  </p>
                </div>

                <div>
                  <span class="text-[#5f635f] uppercase tracking-wider text-[11px]">Signature Accessory Charm</span>
                  <p class="font-bold text-[#b94d27] uppercase">
                    {{ draftCharmId }}
                  </p>
                </div>

                <!-- Palette Preview -->
                <div v-if="Object.keys(draftPartColors).length > 0">
                  <span class="text-[#5f635f] uppercase tracking-wider text-[11px]">Default Colors</span>
                  <div class="mt-2 flex flex-wrap gap-1.5">
                    <div
                      v-for="(hex, partId) in draftPartColors"
                      :key="partId"
                      class="h-6 w-6 border border-stone-900 shadow-[1px_1px_0px_#202220]"
                      :style="{ backgroundColor: hex }"
                      :title="`${partId}: ${hex}`"
                    />
                  </div>
                </div>

                <div class="border-t border-[#cfd2ce] pt-3">
                  <span class="text-[#5f635f] uppercase tracking-wider text-[11px]">Listing Status</span>
                  <p class="font-bold text-[#c97d1e] uppercase">
                    Pending Admin Approval
                  </p>
                </div>
              </div>
            </div>
          </div>

          <!-- Submission Actions -->
          <div class="mt-8 flex flex-wrap items-center justify-between gap-4 border-t-2 border-stone-900 pt-6">
            <button
              type="button"
              class="border-2 border-stone-900 bg-white px-6 py-2.5 font-mono text-xs font-bold text-[#202220] uppercase tracking-wider transition-colors hover:bg-stone-100"
              @click="wizardStep = 2"
            >
              &larr; Back to Customizer
            </button>

            <div class="flex items-center gap-3">
              <button
                type="button"
                class="border border-stone-900 bg-white px-4 py-2.5 font-mono text-xs font-bold text-stone-600 uppercase hover:bg-stone-200"
                @click="cancelWizard"
              >
                Cancel
              </button>

              <button
                data-tutorial="submit_product"
                type="button"
                :disabled="isSubmittingProduct"
                class="border-2 border-stone-900 bg-[#b94d27] px-8 py-3 font-mono text-xs font-bold text-white uppercase tracking-wider shadow-[4px_4px_0px_#202220] transition-all hover:bg-[#963a20] hover:shadow-[6px_6px_0px_#202220] disabled:cursor-not-allowed disabled:opacity-50"
                @click="submitProduct"
              >
                <span v-if="isSubmittingProduct">Submitting for Review...</span>
                <span v-else>Create Draft &amp; Submit for Review</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- ════════════════════════════════════════════════════════ -->
      <!-- TAB 2: MY ORDERS                                         -->
      <!-- ════════════════════════════════════════════════════════ -->
      <section v-if="activeTab === 'orders'" class="mt-6 space-y-6">
        <!-- Action Feedback / Error Banners -->
        <div
          v-if="orderActionFeedback"
          class="border-2 border-[#3f7652] bg-[#f0f7f2] p-4 font-mono text-xs font-bold text-[#3f7652] shadow-[4px_4px_0px_#202220]"
        >
          &check; {{ orderActionFeedback }}
        </div>
        <div
          v-if="orderActionError"
          class="border-2 border-[#9e3a26] bg-[#fdf2f2] p-4 font-mono text-xs font-bold text-[#9e3a26] shadow-[4px_4px_0px_#202220]"
        >
          &excl; {{ orderActionError }}
        </div>

        <div class="border-2 border-stone-900 bg-[#fcfdfb] p-6 shadow-[6px_6px_0px_#202220] sm:p-8">
          <!-- Section Header & Controls -->
          <div class="flex flex-wrap items-center justify-between gap-4 border-b-2 border-stone-900 pb-4">
            <div>
              <h2 class="font-display text-xl font-black tracking-tight text-[#202220] uppercase">
                MY ORDERS ({{ orders.length }})
              </h2>
              <p class="mt-1 text-xs text-[#5f635f]">
                Track, review, and fulfill customer store pickup reservations for your 3D custom silhouettes.
              </p>
            </div>

            <div class="flex items-center gap-3">
              <button
                type="button"
                class="flex items-center gap-1.5 border-2 border-stone-900 bg-white px-4 py-2.5 font-mono text-xs font-bold text-[#202220] uppercase tracking-wider transition-colors hover:bg-[#f1f3f0] disabled:opacity-50"
                :disabled="isLoadingOrders"
                @click="loadOrders()"
                title="Refresh orders list"
              >
                <svg
                  class="h-4 w-4"
                  :class="{ 'animate-spin': isLoadingOrders }"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                </svg>
                <span>{{ isLoadingOrders ? 'Refreshing...' : 'Refresh' }}</span>
              </button>
            </div>
          </div>

          <!-- Filters & Search Bar -->
          <div class="mt-6 flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 pb-6">
            <!-- Status Filter Pills -->
            <div class="flex flex-wrap items-center gap-2">
              <button
                type="button"
                class="border-2 px-3 py-1 font-mono text-xs font-bold uppercase tracking-wider transition-all"
                :class="orderStatusFilter === 'all'
                  ? 'border-stone-900 bg-[#202220] text-white shadow-[2px_2px_0px_#b94d27]'
                  : 'border-stone-300 bg-white text-stone-700 hover:border-stone-900'"
                @click="orderStatusFilter = 'all'"
              >
                All ({{ orders.length }})
              </button>
              <button
                type="button"
                class="border-2 px-3 py-1 font-mono text-xs font-bold uppercase tracking-wider transition-all"
                :class="orderStatusFilter === 'pending'
                  ? 'border-[#c97d1e] bg-[#fffbeb] text-[#b45309] shadow-[2px_2px_0px_#c97d1e]'
                  : 'border-stone-300 bg-white text-stone-700 hover:border-stone-900'"
                @click="orderStatusFilter = 'pending'"
              >
                Pending ({{ orders.filter(o => (o.status || '').toLowerCase() === 'pending').length }})
              </button>
              <button
                type="button"
                class="border-2 px-3 py-1 font-mono text-xs font-bold uppercase tracking-wider transition-all"
                :class="orderStatusFilter === 'confirmed'
                  ? 'border-[#1e6ac9] bg-[#eff6ff] text-[#1d4ed8] shadow-[2px_2px_0px_#1e6ac9]'
                  : 'border-stone-300 bg-white text-stone-700 hover:border-stone-900'"
                @click="orderStatusFilter = 'confirmed'"
              >
                Confirmed ({{ orders.filter(o => (o.status || '').toLowerCase() === 'confirmed').length }})
              </button>
              <button
                type="button"
                class="border-2 px-3 py-1 font-mono text-xs font-bold uppercase tracking-wider transition-all"
                :class="orderStatusFilter === 'ready'
                  ? 'border-[#7c3aed] bg-[#f5f3ff] text-[#6d28d9] shadow-[2px_2px_0px_#7c3aed]'
                  : 'border-stone-300 bg-white text-stone-700 hover:border-stone-900'"
                @click="orderStatusFilter = 'ready'"
              >
                Ready for Pickup ({{ orders.filter(o => (o.status || '').toLowerCase() === 'ready').length }})
              </button>
              <button
                type="button"
                class="border-2 px-3 py-1 font-mono text-xs font-bold uppercase tracking-wider transition-all"
                :class="orderStatusFilter === 'completed'
                  ? 'border-[#3f7652] bg-[#f0f7f2] text-[#3f7652] shadow-[2px_2px_0px_#3f7652]'
                  : 'border-stone-300 bg-white text-stone-700 hover:border-stone-900'"
                @click="orderStatusFilter = 'completed'"
              >
                Completed ({{ orders.filter(o => (o.status || '').toLowerCase() === 'completed').length }})
              </button>
              <button
                type="button"
                class="border-2 px-3 py-1 font-mono text-xs font-bold uppercase tracking-wider transition-all"
                :class="orderStatusFilter === 'cancelled'
                  ? 'border-[#9e3a26] bg-[#fdf2f2] text-[#9e3a26] shadow-[2px_2px_0px_#9e3a26]'
                  : 'border-stone-300 bg-white text-stone-700 hover:border-stone-900'"
                @click="orderStatusFilter = 'cancelled'"
              >
                Cancelled ({{ orders.filter(o => (o.status || '').toLowerCase() === 'cancelled').length }})
              </button>
            </div>

            <!-- Search Input -->
            <div class="relative w-full sm:w-72">
              <input
                v-model="orderSearch"
                type="text"
                placeholder="Search orders, buyer, email..."
                class="w-full border-2 border-stone-900 bg-white px-3 py-1.5 font-mono text-xs text-[#202220] placeholder-stone-400 focus:outline-none focus:border-[#b94d27]"
              />
              <button
                v-if="orderSearch"
                type="button"
                class="absolute right-2 top-1/2 -translate-y-1/2 font-mono text-xs font-bold text-stone-400 hover:text-stone-700"
                @click="orderSearch = ''"
              >
                &times;
              </button>
            </div>
          </div>

          <!-- Empty State: Zero Orders Ever -->
          <div v-if="orders.length === 0" class="py-12 text-center">
            <div class="mx-auto flex h-16 w-16 items-center justify-center border-2 border-stone-900 bg-[#f7f8f6] text-[#202220]">
              <svg class="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
              </svg>
            </div>

            <h2 class="mt-5 font-display text-xl font-black tracking-tight text-[#202220] uppercase sm:text-2xl">
              No incoming orders yet.
            </h2>

            <p class="mx-auto mt-2 max-w-md text-sm text-[#5f635f]">
              When customers configure and reserve your 3D custom silhouettes for store pickup, reservation details and colorway specifications will show up here.
            </p>
          </div>

          <!-- Empty State: Filter Matched 0 Orders -->
          <div v-else-if="filteredOrders.length === 0" class="py-12 text-center">
            <h3 class="font-display text-lg font-black uppercase text-[#202220]">
              No orders found matching the filter.
            </h3>
            <p class="mt-1 text-xs text-[#5f635f]">
              Try choosing a different status filter or clearing your search keywords.
            </p>
            <button
              type="button"
              class="mt-4 border-2 border-stone-900 bg-white px-4 py-1.5 font-mono text-xs font-bold uppercase tracking-wider text-[#202220] hover:bg-[#f1f3f0]"
              @click="orderStatusFilter = 'all'; orderSearch = ''"
            >
              Reset Filters
            </button>
          </div>

          <!-- Orders Cards / List -->
          <div v-else class="mt-6 space-y-6">
            <div
              v-for="order in filteredOrders"
              :key="order.id"
              class="border-2 border-stone-900 bg-[#fcfdfb] shadow-[4px_4px_0px_#202220] transition-all hover:shadow-[6px_6px_0px_#202220]"
            >
              <!-- Order Card Header -->
              <div class="flex flex-wrap items-center justify-between gap-3 border-b-2 border-stone-900 bg-[#f7f8f6] p-4">
                <div class="flex flex-wrap items-center gap-3">
                  <span class="font-mono text-sm font-black text-[#202220] tracking-wider">{{ order.id }}</span>
                  <span
                    class="border px-2.5 py-0.5 font-mono text-[10px] font-black tracking-wider uppercase"
                    :class="getOrderStatusBadgeClass(order.status)"
                  >
                    {{ getOrderStatusLabel(order.status) }}
                  </span>
                </div>
                <div class="font-mono text-xs text-[#5f635f]">
                  Reserved: {{ order.createdAt || order.created_at || 'Recently' }}
                </div>
              </div>

              <!-- Order Card Body -->
              <div class="grid grid-cols-1 gap-6 p-5 md:grid-cols-3">
                <!-- Column 1: Customer Details -->
                <div class="border-b border-stone-200 pb-4 md:border-b-0 md:border-r md:pr-4">
                  <div class="font-mono text-[10px] font-bold text-stone-500 uppercase tracking-wider">
                    Customer Information
                  </div>
                  <div class="mt-2 font-display text-base font-black text-[#202220] uppercase">
                    {{ order.buyerName || order.buyer_name || 'Guest Customer' }}
                  </div>
                  <div class="mt-1 font-mono text-xs text-[#5f635f]">
                    {{ order.buyerEmail || order.buyer_email || '—' }}
                  </div>
                  <div class="mt-3 font-mono text-xs text-stone-600">
                    <span class="font-bold text-stone-500 uppercase">Payment:</span> Store Pickup (Pay at Counter)
                  </div>
                </div>

                <!-- Column 2: Product & Customization Specs -->
                <div class="border-b border-stone-200 pb-4 md:border-b-0 md:border-r md:pr-4">
                  <div class="font-mono text-[10px] font-bold text-stone-500 uppercase tracking-wider">
                    Product Reserved
                  </div>
                  <div class="mt-2 font-display text-base font-black text-[#202220] uppercase line-clamp-1">
                    {{ order.productName || order.product_name || 'Custom Silhouette' }}
                  </div>

                  <!-- Custom Colors Swatches -->
                  <div v-if="order.customColors || order.custom_colors" class="mt-3">
                    <span class="font-mono text-[10px] font-bold text-stone-500 uppercase tracking-wider block">
                      Custom Colorway:
                    </span>
                    <div class="mt-1 flex flex-wrap gap-1.5">
                      <div
                        v-for="(hex, part) in (order.customColors || order.custom_colors)"
                        :key="part"
                        class="flex items-center gap-1 border border-stone-300 bg-white px-1.5 py-0.5 font-mono text-[10px]"
                        :title="`${part}: ${hex}`"
                      >
                        <span
                          class="inline-block h-2.5 w-2.5 border border-stone-400"
                          :style="{ backgroundColor: hex }"
                        ></span>
                        <span class="text-stone-700 capitalize">{{ part }}</span>
                      </div>
                    </div>
                  </div>

                  <!-- Custom Charm Tag -->
                  <div v-if="order.customCharm && order.customCharm !== 'none'" class="mt-3">
                    <span class="font-mono text-[10px] font-bold text-stone-500 uppercase tracking-wider block">
                      Accessory Charm:
                    </span>
                    <span class="mt-1 inline-flex items-center gap-1 border border-[#b94d27] bg-[#fdf2ef] px-2 py-0.5 font-mono text-[10px] font-bold text-[#b94d27] uppercase">
                      &starf; {{ order.customCharm }}
                    </span>
                  </div>
                </div>

                <!-- Column 3: Store Pickup Schedule & Total -->
                <div class="flex flex-col justify-between">
                  <div>
                    <div class="font-mono text-[10px] font-bold text-stone-500 uppercase tracking-wider">
                      Store Pickup Date
                    </div>
                    <div class="mt-2 font-mono text-sm font-bold text-[#202220]">
                      {{ formatPickupDate(order.pickupDate || order.pickup_date) }}
                    </div>
                    <div v-if="order.notes" class="mt-3 border-l-2 border-stone-400 bg-stone-100 p-2 font-mono text-[11px] text-stone-700">
                      <span class="font-bold uppercase">Notes:</span> {{ order.notes }}
                    </div>
                  </div>

                  <div class="mt-4 pt-3 border-t border-stone-200">
                    <div class="font-mono text-[10px] font-bold text-stone-500 uppercase tracking-wider">
                      Order Total
                    </div>
                    <div class="font-mono text-lg font-black text-[#b94d27]">
                      ₱{{ Number(order.totalPrice || order.total_price || 0).toLocaleString() }}
                    </div>
                  </div>
                </div>
              </div>

              <!-- Order Action Footer -->
              <div class="flex flex-wrap items-center justify-between gap-3 border-t-2 border-stone-900 bg-white p-4">
                <div class="font-mono text-xs text-[#5f635f]">
                  <span v-if="order.status === 'pending'">Awaiting seller confirmation</span>
                  <span v-else-if="order.status === 'confirmed'">Order confirmed. Preparing for counter pickup</span>
                  <span v-else-if="order.status === 'ready'">Customer notified. Ready for pickup</span>
                  <span v-else-if="order.status === 'completed'" class="text-[#3f7652] font-bold">&check; Order fulfilled & completed</span>
                  <span v-else-if="order.status === 'cancelled'" class="text-[#9e3a26] font-bold">&excl; Order cancelled (Stock restored)</span>
                </div>

                <!-- Status Action Buttons -->
                <div class="flex items-center gap-2">
                  <!-- PENDING -> CONFIRMED -->
                  <button
                    v-if="order.status === 'pending'"
                    type="button"
                    class="border-2 border-stone-900 bg-[#1e6ac9] px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider text-white transition-colors hover:bg-[#1557a7] disabled:opacity-50"
                    :disabled="isUpdatingOrderStatus === order.id"
                    @click="updateOrderStatus(order.id, 'confirmed')"
                  >
                    {{ isUpdatingOrderStatus === order.id ? 'Updating...' : 'Confirm Order' }}
                  </button>

                  <!-- CONFIRMED -> READY -->
                  <button
                    v-if="order.status === 'confirmed'"
                    type="button"
                    class="border-2 border-stone-900 bg-[#7c3aed] px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider text-white transition-colors hover:bg-[#6d28d9] disabled:opacity-50"
                    :disabled="isUpdatingOrderStatus === order.id"
                    @click="updateOrderStatus(order.id, 'ready')"
                  >
                    {{ isUpdatingOrderStatus === order.id ? 'Updating...' : 'Mark Ready' }}
                  </button>

                  <!-- READY -> COMPLETED -->
                  <button
                    v-if="order.status === 'ready'"
                    type="button"
                    class="border-2 border-stone-900 bg-[#3f7652] px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider text-white transition-colors hover:bg-[#2e593d] disabled:opacity-50"
                    :disabled="isUpdatingOrderStatus === order.id"
                    @click="updateOrderStatus(order.id, 'completed')"
                  >
                    {{ isUpdatingOrderStatus === order.id ? 'Updating...' : 'Mark Completed' }}
                  </button>

                  <!-- CANCEL BUTTON (for pending or confirmed) -->
                  <button
                    v-if="order.status === 'pending' || order.status === 'confirmed'"
                    type="button"
                    class="border-2 border-[#9e3a26] bg-white px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider text-[#9e3a26] transition-colors hover:bg-[#fdf2f2] disabled:opacity-50"
                    :disabled="isUpdatingOrderStatus === order.id"
                    @click="updateOrderStatus(order.id, 'cancelled', 'Cancelled by seller')"
                  >
                    Cancel Order
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ════════════════════════════════════════════════════════ -->
      <!-- TAB 3: STORE SETTINGS                                    -->
      <!-- ════════════════════════════════════════════════════════ -->
      <section v-if="activeTab === 'settings'" class="mt-6 space-y-6">
        <div class="border-2 border-stone-900 bg-[#fcfdfb] p-6 shadow-[6px_6px_0px_#202220] sm:p-8">
          <div class="border-b-2 border-stone-900 pb-4">
            <h2 class="font-display text-xl font-black tracking-tight text-[#202220] uppercase">
              Store Profile Settings
            </h2>
            <p class="mt-1 text-xs text-[#5f635f]">
              Manage public details and branding for your KickCraft partner storefront.
            </p>
          </div>

          <!-- Feedback Banners -->
          <div
            v-if="saveSuccessMessage"
            role="status"
            class="mt-6 border-2 border-[#3f7652] bg-[#f0f7f2] p-4 text-xs font-bold text-[#3f7652]"
          >
            {{ saveSuccessMessage }}
          </div>

          <div
            v-if="saveErrorMessage"
            role="alert"
            class="mt-6 border-2 border-[#b94d27] bg-[#fdf2ef] p-4 text-xs font-bold text-[#963a20]"
          >
            {{ saveErrorMessage }}
          </div>

          <!-- Edit Form -->
          <form class="mt-6 space-y-6" @submit.prevent="handleSaveSettings">
            <!-- Store Name -->
            <div>
              <div class="flex items-center justify-between">
                <label for="seller-store-name" class="font-mono text-xs font-bold uppercase tracking-wider text-[#202220]">
                  Store Name <span class="text-[#b94d27]">*</span>
                </label>
                <span class="font-mono text-[11px] text-[#5f635f]">
                  {{ storeName.length }} / 255
                </span>
              </div>
              <input
                id="seller-store-name"
                v-model="storeName"
                type="text"
                maxlength="255"
                required
                class="mt-2 w-full border-2 border-stone-900 bg-white px-4 py-2.5 font-mono text-sm text-[#202220] focus:border-[#b94d27] focus:outline-none"
                placeholder="e.g. Apex Kicks Studio"
              />
              <p class="mt-1 text-[11px] text-[#5f635f]">
                Displayed on your product listings and store pickup reservations.
              </p>
            </div>

            <!-- Store Description -->
            <div>
              <div class="flex items-center justify-between">
                <label for="seller-store-desc" class="font-mono text-xs font-bold uppercase tracking-wider text-[#202220]">
                  Store Description
                </label>
                <span class="font-mono text-[11px] text-[#5f635f]">
                  {{ storeDescription.length }} / 1000
                </span>
              </div>
              <textarea
                id="seller-store-desc"
                v-model="storeDescription"
                rows="4"
                maxlength="1000"
                class="mt-2 w-full border-2 border-stone-900 bg-white px-4 py-2.5 text-sm text-[#202220] focus:border-[#b94d27] focus:outline-none"
                placeholder="Tell customers about your customization specialty, craftsmanship, and store history..."
              ></textarea>
              <p class="mt-1 text-[11px] text-[#5f635f]">
                Optional brief profile bio (up to 1000 characters).
              </p>
            </div>

            <!-- Account Details (Read-only) -->
            <div class="border-2 border-stone-900 bg-white p-4 font-mono text-xs">
              <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <span class="text-[#5f635f] uppercase tracking-wider">Account Email</span>
                  <p class="mt-1 font-bold text-[#202220]">{{ displayEmail }}</p>
                </div>
                <div>
                  <span class="text-[#5f635f] uppercase tracking-wider">Seller Status</span>
                  <p class="mt-1 font-bold text-[#3f7652] uppercase">Active &amp; Approved</p>
                </div>
              </div>
            </div>

            <!-- Form Actions -->
            <div class="flex justify-end pt-4">
              <button
                type="submit"
                :disabled="isSaving"
                class="border-2 border-stone-900 bg-[#b94d27] px-8 py-3 font-mono text-xs font-bold text-white uppercase tracking-wider transition-colors hover:bg-[#963a20] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-[#245fa8]"
              >
                <span v-if="isSaving">Saving...</span>
                <span v-else>Save Changes</span>
              </button>
            </div>
          </form>
        </div>
      </section>

      <!-- ════════════════════════════════════════════════════════ -->
      <!-- TUTORIAL OVERLAY WALKTHROUGH                            -->
      <!-- ════════════════════════════════════════════════════════ -->
      <TutorialOverlay
        :active="showTutorial"
        :current-user="currentUser"
        @close="showTutorial = false"
        @tutorial-completed="showTutorial = false"
        @tutorial-skipped="showTutorial = false"
      />

    </div>
  </div>
</template>
