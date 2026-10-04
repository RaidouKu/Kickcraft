<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import ConfirmModal from './ConfirmModal.vue'
import { api } from '../api.js'
import {
  highlightMaterial,
  slugify,
  validateShoe,
} from '../admin.js'
import { CATEGORIES } from '../customization.js'

const props = defineProps({
  currentUser: {
    type: Object,
    default: () => ({ email: 'owner@kickcraft.local', role: 'owner' }),
  },
})

const emit = defineEmits(['backToShop', 'openStudio', 'shoesChanged', 'sessionExpired'])

// ── Confirmation Modal State ──────────────────────────────────
const adminConfirm = ref({
  show: false,
  title: '',
  message: '',
  confirmText: 'Confirm',
  cancelText: 'Cancel',
  variant: 'default',
  icon: 'warning',
  onConfirm: null,
})

function handleAdminModalConfirm() {
  if (adminConfirm.value.onConfirm) {
    adminConfirm.value.onConfirm()
  }
  adminConfirm.value.show = false
}

function handleAdminModalCancel() {
  adminConfirm.value.show = false
}

// ── Navigation Section ─────────────────────────────────────────
const adminSection = ref('inventory') // 'inventory' | 'reservations' | 'marketplace-orders' | 'sellers' | 'products' | 'users'


// ── Inventory State ────────────────────────────────────────────
const shoes = ref([])
const activeTab = ref('all') // 'all' | 'available' | 'coming_soon' | 'out_of_stock' | 'archived'
const searchQuery = ref('')
const editorMode = ref(false) // false = list view, true = editor view
const isEditing = ref(false) // false = create new, true = edit existing
const editingShoeId = ref(null)

// Restock dialog
const showRestockModal = ref(false)
const restockTargetShoe = ref(null)
const restockAmount = ref(10)

// Folder & Model Upload
const detectedFiles = ref([])
const detectedModelFileName = ref('')
const selectedModelFile = ref(null)
const selectedThumbnailFile = ref(null)
const uploadError = ref('')
const folderInput = ref(null)
const fileInput = ref(null)

// 3D Editor State
const editorViewer = ref(null)
const editorModelReady = ref(false)
const activeHighlightedMaterial = ref(null)
const validationErrors = ref([])
const saveFeedback = ref('')
const dataLoading = ref(false)
const dataError = ref('')

const defaultForm = () => ({
  name: '',
  description: '',
  price: 4990,
  stock: 25,
  status: 'available',
  categories: ['kickcraft', 'sneakers'],
  glbPath: '', // Empty initially — owner must drop model first!
  thumbnailPath: '/images/kickcraft-one-card.png',
  charmsEnabled: true,
  parts: [],
  colors: [
    { name: 'Chalk', value: '#f1efe8' },
    { name: 'Graphite', value: '#292b2d' },
    { name: 'Cobalt', value: '#245fa8' },
    { name: 'Rust', value: '#b94d27' },
  ],
})

const form = ref(defaultForm())
const newColorName = ref('')
const newColorHex = ref('#245fa8')

// ── Reservations & Orders State ────────────────────────────────
const orders = ref([])
const orderStatusFilter = ref('all')
const orderSearchQuery = ref('')
const reservationActionError = ref('')
const reservationActionSuccess = ref('')

function localDateKey(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}

const activeReservation = order => !['completed', 'cancelled'].includes(order.status)
const pendingCount = computed(() => (orders.value || []).filter(o => o.status === 'pending').length)
const todayCount = computed(() => (orders.value || []).filter(o => activeReservation(o) && o.pickupDate === localDateKey()).length)
const upcomingCount = computed(() => (orders.value || []).filter(o => activeReservation(o) && o.pickupDate > localDateKey()).length)
const overdueCount = computed(() => (orders.value || []).filter(o => activeReservation(o) && o.pickupDate < localDateKey()).length)
const readyCount = computed(() => (orders.value || []).filter(o => o.status === 'ready').length)
const completedCount = computed(() => (orders.value || []).filter(o => o.status === 'completed').length)
const cancelledCount = computed(() => (orders.value || []).filter(o => o.status === 'cancelled').length)

// Floating Reservation Alert State
const reservationAlert = ref(null)
let alertTimeoutId = null

function triggerReservationAlert(reservation) {
  if (alertTimeoutId) {
    clearTimeout(alertTimeoutId)
    alertTimeoutId = null
  }
  reservationAlert.value = reservation
  alertTimeoutId = setTimeout(() => {
    reservationAlert.value = null
  }, 12000)
}

function dismissReservationAlert() {
  if (alertTimeoutId) {
    clearTimeout(alertTimeoutId)
    alertTimeoutId = null
  }
  reservationAlert.value = null
}

// Reservation Inspection Modal State
const showInspectionModal = ref(false)
const selectedInspectionReservation = ref(null)

function openInspectionModal(reservation) {
  selectedInspectionReservation.value = reservation
  showInspectionModal.value = true
}

function closeInspectionModal() {
  showInspectionModal.value = false
  selectedInspectionReservation.value = null
}

// Owner Cancellation Modal State
const showOwnerCancelModal = ref(false)
const cancelReservationTarget = ref(null)
const cancellationReason = ref('')

function openOwnerCancelModal(reservation) {
  cancelReservationTarget.value = reservation
  cancellationReason.value = ''
  showOwnerCancelModal.value = true
}

function closeOwnerCancelModal() {
  showOwnerCancelModal.value = false
  cancelReservationTarget.value = null
  cancellationReason.value = ''
}

// Receipt / Details Modal State
const showReceiptModal = ref(false)
const selectedOrderForReceipt = ref(null)

function viewReservationDetails(order) {
  openInspectionModal(order)
}

// ── Users & Accounts State ────────────────────────────────────
const users = ref([])
const usersLoading = ref(false)
const usersError = ref('')
const userSearchQuery = ref('')
const userRoleFilter = ref('all') // 'all' | 'archived'

async function fetchUsers() {
  usersLoading.value = true
  usersError.value = ''
  try {
    const res = await api('auth/users.php?include_archived=1')
    if (res && Array.isArray(res.users)) {
      users.value = res.users
    }
  } catch (err) {
    usersError.value = err.message || 'Failed to load users'
  } finally {
    usersLoading.value = false
  }
}

function deleteUser(user, mode = 'soft') {
  if (user.email === props.currentUser.email) {
    adminConfirm.value = {
      show: true,
      title: 'Cannot Modify Own Account',
      message: 'You are currently logged into this account. For security, you cannot archive or delete your own active account.',
      confirmText: 'Understood',
      cancelText: 'Close',
      variant: 'warning',
      icon: 'warning',
      onConfirm: () => {},
    }
    return
  }

  if (mode === 'hard') {
    adminConfirm.value = {
      show: true,
      title: 'Permanently Delete User Account?',
      message: `Are you sure you want to permanently delete "${user.name}" (${user.email})? This user will be permanently blocked from signing in. Database history is preserved.`,
      confirmText: 'Delete Permanently',
      cancelText: 'Keep Account',
      variant: 'danger',
      icon: 'trash',
      onConfirm: async () => {
        try {
          await api('auth/delete-user.php', { method: 'POST', body: { id: user.id, mode: 'hard' } })
          await fetchUsers()
          saveFeedback.value = `"${user.name}" has been permanently deleted.`
        } catch (err) {
          saveFeedback.value = err.message || 'Failed to delete user'
        }
      },
    }
  } else {
    adminConfirm.value = {
      show: true,
      title: 'Archive User Account?',
      message: `Are you sure you want to archive "${user.name}" (${user.email})? This account will be deactivated and cannot sign in until restored.`,
      confirmText: 'Archive User',
      cancelText: 'Keep Active',
      variant: 'warning',
      icon: 'warning',
      onConfirm: async () => {
        try {
          await api('auth/delete-user.php', { method: 'POST', body: { id: user.id, mode: 'soft' } })
          await fetchUsers()
          saveFeedback.value = `"${user.name}" has been archived.`
        } catch (err) {
          saveFeedback.value = err.message || 'Failed to archive user'
        }
      },
    }
  }
}

async function restoreUser(user) {
  try {
    await api('auth/restore-user.php', { method: 'POST', body: { id: user.id } })
    await fetchUsers()
    saveFeedback.value = `"${user.name}" has been restored to active status.`
  } catch (err) {
    saveFeedback.value = err.message || 'Failed to restore user'
  }
}

// ── User Modal State (Create / Edit) ──────────────────────────
const showUserModal = ref(false)
const isEditingUser = ref(false)
const userModalSaving = ref(false)
const userModalError = ref('')
const showUserPassword = ref(false)
const userForm = ref({
  id: null,
  name: '',
  email: '',
  password: '',
})

function openCreateUserModal() {
  isEditingUser.value = false
  userModalError.value = ''
  showUserPassword.value = false
  userForm.value = {
    id: null,
    name: '',
    email: '',
    password: '',
  }
  showUserModal.value = true
}

function openEditUserModal(user) {
  isEditingUser.value = true
  userModalError.value = ''
  showUserPassword.value = false
  userForm.value = {
    id: user.id,
    name: user.name || '',
    email: user.email || '',
    password: '',
  }
  showUserModal.value = true
}

async function handleSaveUser() {
  userModalError.value = ''

  if (!userForm.value.name || userForm.value.name.trim().length < 2) {
    userModalError.value = 'Full name must be at least 2 characters long.'
    return
  }

  if (!userForm.value.email || !userForm.value.email.includes('@')) {
    userModalError.value = 'A valid email address is required.'
    return
  }

  if (!isEditingUser.value && (!userForm.value.password || userForm.value.password.length < 6)) {
    userModalError.value = 'Password must be at least 6 characters long for new accounts.'
    return
  }

  if (isEditingUser.value && userForm.value.password && userForm.value.password.length < 6) {
    userModalError.value = 'Password must be at least 6 characters long if changed.'
    return
  }

  userModalSaving.value = true

  try {
    if (isEditingUser.value) {
      await api('auth/update-user.php', {
        method: 'POST',
        body: {
          id: userForm.value.id,
          name: userForm.value.name.trim(),
          email: userForm.value.email.trim(),
          password: userForm.value.password ? userForm.value.password : undefined,
        },
      })
      saveFeedback.value = `User "${userForm.value.name}" updated successfully.`
    } else {
      await api('auth/create-user.php', {
        method: 'POST',
        body: {
          name: userForm.value.name.trim(),
          email: userForm.value.email.trim(),
          password: userForm.value.password,
        },
      })
      saveFeedback.value = `New user "${userForm.value.name}" created successfully.`
    }

    showUserModal.value = false
    await fetchUsers()
  } catch (err) {
    userModalError.value = err.message || 'Failed to save user account'
  } finally {
    userModalSaving.value = false
  }
}

const filteredUsers = computed(() => {
  let list = users.value || []
  const q = userSearchQuery.value.trim().toLowerCase()
  if (q) {
    list = list.filter(u =>
      (u.name && u.name.toLowerCase().includes(q)) ||
      (u.email && u.email.toLowerCase().includes(q))
    )
  }
  if (userRoleFilter.value === 'archived') {
    return list.filter(u => u.deleted_at && !u.permanently_deleted)
  }
  // For active views: hide archived
  list = list.filter(u => !u.deleted_at && !u.permanently_deleted)
  return list
})

const userStats = computed(() => {
  const all = users.value || []
  const active = all.filter(u => !u.deleted_at && !u.permanently_deleted)
  const archived = all.filter(u => u.deleted_at && !u.permanently_deleted).length
  return {
    total: all.length,
    active: active.length,
    archived,
  }
})

// ── Sellers State & Management ─────────────────────────────────
const sellers = ref([])
const sellerStatusFilter = ref('all') // 'all' | 'pending' | 'approved' | 'rejected' | 'suspended'
const sellerSearch = ref('')
const selectedSellerForReview = ref(null)
const reviewNotes = ref('')
const reviewLoading = ref(false)
const sellerActionFeedback = ref('')
const sellerActionError = ref('')

const pendingSellersCount = computed(() => (sellers.value || []).filter(s => s.status === 'pending').length)
const approvedSellersCount = computed(() => (sellers.value || []).filter(s => s.status === 'approved').length)
const rejectedSellersCount = computed(() => (sellers.value || []).filter(s => s.status === 'rejected').length)
const suspendedSellersCount = computed(() => (sellers.value || []).filter(s => s.status === 'suspended').length)

const filteredSellers = computed(() => {
  let list = sellers.value || []
  if (sellerStatusFilter.value !== 'all') {
    list = list.filter(s => s.status === sellerStatusFilter.value)
  }
  const q = sellerSearch.value.trim().toLowerCase()
  if (q) {
    list = list.filter(s =>
      (s.storeName && s.storeName.toLowerCase().includes(q)) ||
      (s.name && s.name.toLowerCase().includes(q)) ||
      (s.email && s.email.toLowerCase().includes(q))
    )
  }
  return list
})

async function fetchSellers() {
  sellerActionError.value = ''
  try {
    const res = await api('sellers/list.php')
    if (res && Array.isArray(res.sellers)) {
      sellers.value = res.sellers
    }
  } catch (err) {
    sellerActionError.value = err.message || 'Failed to load sellers.'
  }
}

function openSellerReviewModal(seller) {
  selectedSellerForReview.value = seller
  reviewNotes.value = seller.adminNotes || ''
  sellerActionError.value = ''
}

function closeSellerReviewModal() {
  selectedSellerForReview.value = null
  reviewNotes.value = ''
  sellerActionError.value = ''
}

async function submitSellerReview(userId, status, notes = null) {
  reviewLoading.value = true
  sellerActionError.value = ''
  sellerActionFeedback.value = ''
  try {
    const payload = {
      userId,
      status,
    }
    if (notes !== null && notes !== undefined) {
      payload.notes = notes
    }
    const res = await api('sellers/review.php', {
      method: 'POST',
      body: payload,
    })
    if (res && res.success) {
      sellerActionFeedback.value = `Seller status updated to "${status}".`
      setTimeout(() => {
        if (sellerActionFeedback.value) sellerActionFeedback.value = ''
      }, 4000)
      await fetchSellers()
      if (selectedSellerForReview.value) {
        closeSellerReviewModal()
      }
    }
  } catch (err) {
    sellerActionError.value = err.message || 'Failed to update seller status.'
  } finally {
    reviewLoading.value = false
  }
}

// ── Products State & Management ────────────────────────────────
const products = ref([])
const productStatusFilter = ref('all') // 'all' | 'pending' | 'approved' | 'rejected' | 'suspended'
const productSearch = ref('')
const selectedProductForReview = ref(null)
const productReviewNotes = ref('')
const isReviewingProduct = ref(false)
const productActionFeedback = ref('')
const productActionError = ref('')

const pendingProductsCount = computed(() => (products.value || []).filter(p => p.status === 'pending').length)
const approvedProductsCount = computed(() => (products.value || []).filter(p => p.status === 'approved').length)
const rejectedProductsCount = computed(() => (products.value || []).filter(p => p.status === 'rejected').length)
const suspendedProductsCount = computed(() => (products.value || []).filter(p => p.status === 'suspended').length)

const filteredProducts = computed(() => {
  let list = products.value || []
  if (productStatusFilter.value !== 'all') {
    list = list.filter(p => p.status === productStatusFilter.value)
  }
  const q = productSearch.value.trim().toLowerCase()
  if (q) {
    list = list.filter(p =>
      (p.name && p.name.toLowerCase().includes(q)) ||
      (p.storeName && p.storeName.toLowerCase().includes(q)) ||
      (p.description && p.description.toLowerCase().includes(q)) ||
      (p.creationMethod && p.creationMethod.toLowerCase().includes(q)) ||
      (p.id && String(p.id).toLowerCase().includes(q))
    )
  }
  return list
})

async function fetchProducts() {
  productActionError.value = ''
  try {
    const res = await api('products/list.php')
    if (res && Array.isArray(res.products)) {
      products.value = res.products
    }
  } catch (err) {
    productActionError.value = err.message || 'Failed to load products.'
  }
}

function openProductReviewModal(product) {
  selectedProductForReview.value = product
  productReviewNotes.value = product.adminNotes || ''
  productActionError.value = ''
}

function closeProductReviewModal() {
  selectedProductForReview.value = null
  productReviewNotes.value = ''
  productActionError.value = ''
}

async function submitProductReview(productId, status, notes = null) {
  isReviewingProduct.value = true
  productActionError.value = ''
  productActionFeedback.value = ''
  try {
    const payload = {
      productId,
      status,
    }
    if (notes !== null && notes !== undefined) {
      payload.notes = notes
    }
    const res = await api('products/review.php', {
      method: 'POST',
      body: payload,
    })
    if (res && res.success) {
      productActionFeedback.value = `Product status updated to "${status}".`
      setTimeout(() => {
        if (productActionFeedback.value) productActionFeedback.value = ''
      }, 4000)
      await fetchProducts()
      if (selectedProductForReview.value) {
        closeProductReviewModal()
      }
    }
  } catch (err) {
    productActionError.value = err.message || 'Failed to update product status.'
  } finally {
    isReviewingProduct.value = false
  }
}

// ── Global Marketplace Orders State & Management ──────────────
const marketplaceOrders = ref([])
const marketplaceOrderStatusFilter = ref('all') // 'all' | 'pending' | 'confirmed' | 'ready' | 'completed' | 'cancelled'
const marketplaceOrderSearch = ref('')
const selectedOrderForReview = ref(null)
const orderReviewNotes = ref('')
const isUpdatingOrder = ref(false)
const marketplaceOrderFeedback = ref('')
const marketplaceOrderError = ref('')

const pendingMarketplaceOrdersCount = computed(() => (marketplaceOrders.value || []).filter(o => o.status === 'pending').length)
const confirmedMarketplaceOrdersCount = computed(() => (marketplaceOrders.value || []).filter(o => o.status === 'confirmed').length)
const readyMarketplaceOrdersCount = computed(() => (marketplaceOrders.value || []).filter(o => o.status === 'ready').length)
const completedMarketplaceOrdersCount = computed(() => (marketplaceOrders.value || []).filter(o => o.status === 'completed').length)
const cancelledMarketplaceOrdersCount = computed(() => (marketplaceOrders.value || []).filter(o => o.status === 'cancelled').length)

const filteredMarketplaceOrders = computed(() => {
  let list = marketplaceOrders.value || []
  if (marketplaceOrderStatusFilter.value !== 'all') {
    list = list.filter(o => o.status === marketplaceOrderStatusFilter.value)
  }
  const q = marketplaceOrderSearch.value.trim().toLowerCase()
  if (q) {
    list = list.filter(o =>
      (o.id && String(o.id).toLowerCase().includes(q)) ||
      (o.sellerStoreName && o.sellerStoreName.toLowerCase().includes(q)) ||
      (o.buyerName && o.buyerName.toLowerCase().includes(q)) ||
      (o.buyerEmail && o.buyerEmail.toLowerCase().includes(q)) ||
      (o.productName && o.productName.toLowerCase().includes(q))
    )
  }
  return list
})

async function fetchMarketplaceOrders() {
  marketplaceOrderError.value = ''
  try {
    const res = await api('orders/list.php')
    if (res && Array.isArray(res.orders)) {
      marketplaceOrders.value = res.orders
    }
  } catch (err) {
    marketplaceOrderError.value = err.message || 'Failed to load marketplace orders.'
  }
}

function openOrderReviewModal(order) {
  selectedOrderForReview.value = order
  orderReviewNotes.value = order.notes || ''
  marketplaceOrderError.value = ''
}

function closeOrderReviewModal() {
  selectedOrderForReview.value = null
  orderReviewNotes.value = ''
  marketplaceOrderError.value = ''
}

async function submitOrderAction(orderId, newStatus, notes = null) {
  isUpdatingOrder.value = true
  marketplaceOrderError.value = ''
  marketplaceOrderFeedback.value = ''
  try {
    const payload = {
      orderId,
      status: newStatus,
    }
    if (notes !== null && notes !== undefined) {
      payload.notes = notes
    }
    const res = await api('orders/update-status.php', {
      method: 'POST',
      body: payload,
    })
    if (res && res.success) {
      marketplaceOrderFeedback.value = `Order #${orderId} status updated to "${newStatus}".`
      setTimeout(() => {
        if (marketplaceOrderFeedback.value) marketplaceOrderFeedback.value = ''
      }, 4000)
      await fetchMarketplaceOrders()
      if (selectedOrderForReview.value) {
        closeOrderReviewModal()
      }
    }
  } catch (err) {
    marketplaceOrderError.value = err.message || 'Failed to update order status.'
  } finally {
    isUpdatingOrder.value = false
  }
}

const updateMarketplaceOrderStatus = submitOrderAction

// ── Lifecycle ──────────────────────────────────────────────────
let reservationsChannel = null

onMounted(async () => {
  await loadData()

  if (typeof BroadcastChannel !== 'undefined') {
    try {
      reservationsChannel = new BroadcastChannel('kickcraft_reservations_channel')
      reservationsChannel.onmessage = (event) => {
        if (event.data?.type === 'NEW_RESERVATION' && event.data.reservation) {
          const newRes = event.data.reservation
          const exists = (orders.value || []).some(o => o.id === newRes.id)
          if (!exists) {
            orders.value.unshift(newRes)
          }
          triggerReservationAlert(newRes)
        } else if (event.data?.type === 'RESERVATION_CANCELLED' && event.data.id) {
          const target = (orders.value || []).find(o => o.id === event.data.id)
          if (target) {
            target.status = 'cancelled'
          }
          if (selectedInspectionReservation.value && selectedInspectionReservation.value.id === event.data.id) {
            selectedInspectionReservation.value.status = 'cancelled'
          }
        }
      }
    } catch (_) {}
  }
})

onUnmounted(() => {
  if (reservationsChannel) {
    try {
      reservationsChannel.close()
    } catch (_) {}
  }
  if (alertTimeoutId) {
    clearTimeout(alertTimeoutId)
  }
})

async function loadData() {
  dataLoading.value = true
  dataError.value = ''
  usersLoading.value = true
  usersError.value = ''

  const [shoesResult, ordersResult, usersResult, sellersResult, productsResult, marketplaceOrdersResult] = await Promise.allSettled([
    api('shoes/list.php?include_archived=1'),
    api('reservations/list.php'),
    api('auth/users.php?include_archived=1'),
    api('sellers/list.php'),
    api('products/list.php'),
    api('orders/list.php'),
  ])

  if (shoesResult.status === 'fulfilled') {
    const shoesRes = shoesResult.value
    shoes.value = Array.isArray(shoesRes?.shoes) ? shoesRes.shoes : []
  }

  if (ordersResult.status === 'fulfilled') {
    const ordersRes = ordersResult.value
    orders.value = Array.isArray(ordersRes?.reservations) ? ordersRes.reservations : []
  } else {
    if (ordersResult.reason?.status === 401 || ordersResult.reason?.message?.toLowerCase().includes('unauthorized') || ordersResult.reason?.message?.toLowerCase().includes('owner privileges')) {
      reservationActionError.value = 'Session expired. Please sign in again as owner.'
      setTimeout(() => {
        emit('sessionExpired')
      }, 1500)
    } else {
      reservationActionError.value = `Could not load reservations: ${ordersResult.reason?.message || 'Check local services, then retry.'}`
    }
  }

  if (usersResult.status === 'fulfilled') {
    const usersRes = usersResult.value
    users.value = Array.isArray(usersRes?.users) ? usersRes.users : []
  } else {
    usersError.value = usersResult.reason?.message || 'Failed to load administrator accounts.'
  }

  if (sellersResult.status === 'fulfilled') {
    const sellersRes = sellersResult.value
    sellers.value = Array.isArray(sellersRes?.sellers) ? sellersRes.sellers : []
  }

  if (productsResult.status === 'fulfilled') {
    const productsRes = productsResult.value
    products.value = Array.isArray(productsRes?.products) ? productsRes.products : []
  }

  if (marketplaceOrdersResult.status === 'fulfilled') {
    const marketplaceOrdersRes = marketplaceOrdersResult.value
    marketplaceOrders.value = Array.isArray(marketplaceOrdersRes?.orders) ? marketplaceOrdersRes.orders : []
  }

  const failures = [
    ['shoe catalog', shoesResult],
    ['reservations', ordersResult],
    ['administrator accounts', usersResult],
  ].filter(([, result]) => result.status === 'rejected')
  if (failures.length) {
    const labels = failures.map(([label]) => label).join(', ')
    dataError.value = `Could not load ${labels}. ${failures[0][1].reason?.message || 'Check local services, then retry.'}`
  }

  dataLoading.value = false
  usersLoading.value = false
  emit('shoesChanged', shoes.value)
}

// ── Inventory Filtering & Stats ────────────────────────────────
const filteredShoes = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  return shoes.value.filter(shoe => {
    if (shoe.permanentlyDeleted) return false

    if (activeTab.value === 'archived') {
      if (!shoe.deletedAt) return false
    } else {
      if (shoe.deletedAt) return false
    }

    const matchesStatus =
      activeTab.value === 'all' || activeTab.value === 'archived'
        ? true
        : activeTab.value === 'available'
          ? (shoe.status === 'available' || shoe.status === 'in_stock')
          : shoe.status === activeTab.value

    const matchesQuery =
      !query ||
      shoe.name.toLowerCase().includes(query) ||
      shoe.description?.toLowerCase().includes(query) ||
      (shoe.categories && shoe.categories.some(c => c.toLowerCase().includes(query)))

    return matchesStatus && matchesQuery
  })
})

const stats = computed(() => {
  const activeShoes = shoes.value.filter(s => !s.permanentlyDeleted && !s.deletedAt)
  const total = activeShoes.length
  const available = activeShoes.filter(s => s.status === 'available' || s.status === 'in_stock').length
  const comingSoon = activeShoes.filter(s => s.status === 'coming_soon').length
  const outOfStock = activeShoes.filter(s => s.status === 'out_of_stock').length
  const archived = shoes.value.filter(s => !s.permanentlyDeleted && s.deletedAt).length
  return { total, available, comingSoon, outOfStock, archived }
})

// ── Reservations Filtering ────────────────────────────────────
const filteredOrders = computed(() => {
  const query = orderSearchQuery.value.trim().toLowerCase()
  return (orders.value || []).filter(order => {
    if (order.permanently_deleted || order.permanentlyDeleted || order.deleted_at || order.deletedAt) {
      return false
    }

    const today = localDateKey()
    const matchesStatus = {
      all: true,
      today: activeReservation(order) && order.pickupDate === today,
      upcoming: activeReservation(order) && order.pickupDate > today,
      overdue: activeReservation(order) && order.pickupDate < today,
      ready: order.status === 'ready',
      completed: order.status === 'completed',
      cancelled: order.status === 'cancelled',
    }[orderStatusFilter.value]

    const matchesQuery =
      !query ||
      (order.id && order.id.toLowerCase().includes(query)) ||
      (order.customerName && order.customerName.toLowerCase().includes(query)) ||
      (order.customerEmail && order.customerEmail.toLowerCase().includes(query)) ||
      (order.shoeName && order.shoeName.toLowerCase().includes(query))

    return matchesStatus && matchesQuery
  })
})

function exportReservationsCsv() {
  const cell = value => {
    const text = String(value ?? '')
    const safe = /^[=+\-@]/.test(text) ? `'${text}` : text
    return `"${safe.replaceAll('"', '""')}"`
  }
  const rows = filteredOrders.value.map(order => [
    order.id,
    order.customerName,
    order.customerEmail,
    order.shoeName,
    order.size,
    order.pickupDate,
    order.charmLabel || order.charmId || 'None',
    order.status,
  ])
  const csv = [['Receipt', 'Customer', 'Email', 'Shoe', 'Size', 'Pickup Date', 'Charm', 'Status'], ...rows]
    .map(row => row.map(cell).join(','))
    .join('\r\n')
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `kickcraft-reservations-${localDateKey()}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

function formatPartLabel(partKey) {
  if (!partKey) return ''
  return String(partKey)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

function getReservationShoeThumbnail(res) {
  if (!res) return '/images/kickcraft-one-card.png'
  if (res.thumbnail) return res.thumbnail
  if (res.thumbnailPath) return res.thumbnailPath
  const matched = shoes.value.find(s => s.id === res.shoeId)
  if (matched?.thumbnailPath) return matched.thumbnailPath
  if (matched?.thumbnail) return matched.thumbnail
  if (res.shoeId === 'air-max') return '/images/air-max-card.png'
  if (res.shoeId === 'nike-dunk') return '/images/nike-dunk-card.png'
  return '/images/kickcraft-one-card.png'
}

function requestOrderStatusChange(order, newStatus) {
  if (!order) return
  const customerName = order.customerName || order.customer_name || 'Customer'
  const action = {
    approved: ['Approve Reservation?', 'Approve', 'Keep Pending', `Approve reservation ${order.id} for ${customerName}?`],
    ready: ['Mark Reservation Ready?', 'Mark Ready', 'Keep Approved', `Mark reservation ${order.id} for ${customerName} ready for pickup?`],
    completed: ['Complete Reservation?', 'Mark Completed', 'Keep Active', `Mark reservation ${order.id} for ${customerName} completed? This confirms customer pickup.`],
  }[newStatus]
  if (!action) return

  adminConfirm.value = {
    show: true,
    title: action[0],
    message: action[3],
    confirmText: action[1],
    cancelText: action[2],
    variant: 'default',
    icon: 'warning',
    onConfirm: async () => {
      await handleOrderStatusChange(order.id, newStatus)
    },
  }
}

async function handleOrderStatusChange(orderId, newStatus) {
  reservationActionError.value = ''
  reservationActionSuccess.value = ''
  try {
    await api('reservations/update-status.php', {
      method: 'POST',
      body: {
        id: orderId,
        status: newStatus,
      },
    })
    reservationActionSuccess.value = `Reservation ${orderId} marked as ${newStatus}.`
    await loadData()
    if (selectedOrderForReceipt.value?.id === orderId) {
      selectedOrderForReceipt.value = { ...selectedOrderForReceipt.value, status: newStatus }
    }
    if (selectedInspectionReservation.value?.id === orderId) {
      selectedInspectionReservation.value = { ...selectedInspectionReservation.value, status: newStatus }
    }
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel('kickcraft_reservations_channel')
      channel.postMessage({ type: 'RESERVATION_STATUS_UPDATED', id: orderId, status: newStatus })
      channel.close()
    }
  } catch (err) {
    if (err.status === 401 || err.message?.toLowerCase().includes('unauthorized') || err.message?.toLowerCase().includes('session') || err.message?.toLowerCase().includes('owner privileges')) {
      reservationActionError.value = 'Session expired. Please sign in again as owner.'
      setTimeout(() => {
        emit('sessionExpired')
      }, 1500)
    } else {
      reservationActionError.value = `Could not update reservation: ${err.message || 'server error'}`
    }
  }
}

async function submitOwnerCancellation() {
  if (!cancelReservationTarget.value) return
  const target = cancelReservationTarget.value
  const targetId = target.id
  const reasonNotes = (cancellationReason.value || '').trim()
  reservationActionError.value = ''
  reservationActionSuccess.value = ''

  try {
    await api('reservations/update-status.php', {
      method: 'POST',
      body: {
        id: targetId,
        status: 'cancelled',
        notes: reasonNotes,
      },
    })
    reservationActionSuccess.value = `Reservation ${targetId} cancelled.`
  } catch (err) {
    if (err.status === 401 || err.message?.toLowerCase().includes('unauthorized') || err.message?.toLowerCase().includes('session') || err.message?.toLowerCase().includes('owner privileges')) {
      reservationActionError.value = 'Session expired. Please sign in again as owner.'
      setTimeout(() => {
        emit('sessionExpired')
      }, 1500)
    } else {
      reservationActionError.value = `Could not cancel reservation: ${err.message || 'server error'}`
    }
    return
  }

  if (selectedInspectionReservation.value?.id === targetId) {
    selectedInspectionReservation.value = { ...selectedInspectionReservation.value, status: 'cancelled', notes: reasonNotes }
  }
  if (selectedOrderForReceipt.value?.id === targetId) {
    selectedOrderForReceipt.value = { ...selectedOrderForReceipt.value, status: 'cancelled', notes: reasonNotes }
  }
  await loadData()

  if (typeof BroadcastChannel !== 'undefined') {
    try {
      const channel = new BroadcastChannel('kickcraft_reservations_channel')
      channel.postMessage({
        type: 'RESERVATION_CANCELLED',
        id: targetId,
        notes: reasonNotes,
      })
      channel.close()
    } catch (_) {}
  }

  closeOwnerCancelModal()
}

function requestCancelOrder(order) {
  openOwnerCancelModal(order)
  /* adminConfirm fallback:
     title: 'Cancel Sales Order?'
     variant: 'danger'
     icon: 'trash'
  */
}

function requestDeleteReservation(order) {
  adminConfirm.value = {
    show: true,
    title: 'Delete Cancelled Reservation?',
    message: 'Are you sure you want to delete the reservation record for ' + (order.customerName || order.customer_name) + ' (' + order.id + ')? This will remove it from the active reservations list.',
    confirmText: 'Delete Record',
    cancelText: 'Keep in Archive',
    variant: 'danger',
    icon: 'trash',
    onConfirm: async () => {
      reservationActionError.value = ''
      reservationActionSuccess.value = ''
      try {
        await api('reservations/delete.php', {
          method: 'POST',
          body: { id: order.id },
        })
        reservationActionSuccess.value = `Reservation ${order.id} deleted.`
      } catch (err) {
        if (err.status === 401 || err.message?.toLowerCase().includes('unauthorized') || err.message?.toLowerCase().includes('session')) {
          reservationActionError.value = 'Session expired. Please sign in again as owner.'
          setTimeout(() => {
            emit('sessionExpired')
          }, 1500)
        } else {
          reservationActionError.value = `Could not delete reservation: ${err.message || 'server error'}`
        }
        return
      }
      await loadData()
      if (selectedInspectionReservation.value && selectedInspectionReservation.value.id === order.id) {
        closeInspectionModal()
      }
      if (selectedOrderForReceipt.value && selectedOrderForReceipt.value.id === order.id) {
        showReceiptModal.value = false
        selectedOrderForReceipt.value = null
      }
    },
  }
}

function openReceipt(order) {
  selectedOrderForReceipt.value = order
  showReceiptModal.value = true
}

function printReceipt() {
  window.print()
}

// ── Folder & File Upload ───────────────────────────────────────
function triggerFolderPicker() {
  uploadError.value = ''
  folderInput.value?.click()
}

function triggerFilePicker() {
  uploadError.value = ''
  fileInput.value?.click()
}

function handleFileInputChange(event) {
  const fileList = event.target.files
  if (!fileList || !fileList.length) return
  processSelectedFiles(Array.from(fileList))
}

async function handleDrop(event) {
  event.preventDefault()
  uploadError.value = ''
  const dt = event.dataTransfer
  if (!dt) return

  const extractedFiles = []

  if (dt.items && dt.items.length) {
    const promises = []
    for (let i = 0; i < dt.items.length; i++) {
      const item = dt.items[i]
      if (item.webkitGetAsEntry) {
        const entry = item.webkitGetAsEntry()
        if (entry) {
          promises.push(readEntryRecursive(entry, extractedFiles))
          continue
        }
      }
      const file = item.getAsFile()
      if (file) extractedFiles.push(file)
    }
    await Promise.all(promises)
  } else if (dt.files && dt.files.length) {
    for (let i = 0; i < dt.files.length; i++) {
      extractedFiles.push(dt.files[i])
    }
  }

  processSelectedFiles(extractedFiles)
}

function readEntryRecursive(entry, files) {
  return new Promise(resolve => {
    if (entry.isFile) {
      entry.file(file => {
        files.push(file)
        resolve()
      }, () => resolve())
    } else if (entry.isDirectory) {
      const dirReader = entry.createReader()
      dirReader.readEntries(async entries => {
        const entryPromises = entries.map(child => readEntryRecursive(child, files))
        await Promise.all(entryPromises)
        resolve()
      }, () => resolve())
    } else {
      resolve()
    }
  })
}

function processSelectedFiles(fileList) {
  uploadError.value = ''
  const glbList = fileList.filter(f => f.name.toLowerCase().endsWith('.glb'))

  if (!glbList.length) {
    uploadError.value = 'No 3D model files (.glb) detected in the selected files or folder.'
    return
  }

  // Auto-detect thumbnail image if dropped alongside the model
  const imageList = fileList.filter(f => /\.(png|jpe?g|webp)$/i.test(f.name))
  if (imageList.length > 0) {
    selectedThumbnailFile.value = imageList[0]
    const reader = new FileReader()
    reader.onload = (e) => {
      form.value.thumbnailPath = e.target.result
    }
    reader.readAsDataURL(imageList[0])
  }

  const detected = glbList.map(f => ({
    name: f.name,
    sizeFormatted: formatFileSize(f.size),
    rawFile: f,
    blobUrl: URL.createObjectURL(f),
  }))

  if (detected.length === 1) {
    configureDetectedModel(detected[0])
  } else {
    detectedFiles.value = detected
  }
}

function formatFileSize(bytes) {
  if (!bytes) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

function configureDetectedModel(detected) {
  selectedModelFile.value = detected.rawFile
  detectedModelFileName.value = detected.name
  const modelNameClean = detected.name.replace(/\.[^/.]+$/, '').replace(/[-_]+/g, ' ')
  const capitalized = modelNameClean
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')

  form.value.name = capitalized.startsWith('KickCraft') ? capitalized : `KickCraft ${capitalized}`
  form.value.description = `Customizable silhouette based on ${detected.name}.`
  form.value.glbPath = detected.blobUrl
  form.value.parts = []
  detectedFiles.value = []
  uploadError.value = ''
}

function selectLibraryModel(path, name) {
  selectedModelFile.value = null
  detectedModelFileName.value = path.split('/').pop() || ''
  form.value.name = name
  form.value.description = `Customizable silhouette based on ${name}.`
  form.value.glbPath = path
  form.value.parts = []
  detectedFiles.value = []
  uploadError.value = ''
}

function changeModel() {
  selectedModelFile.value = null
  form.value.glbPath = ''
  detectedModelFileName.value = ''
  form.value.parts = []
  detectedFiles.value = []
  editorModelReady.value = false
  activeHighlightedMaterial.value = null
}

// ── Shoe Editor Actions ────────────────────────────────────────
function openNewShoeEditor() {
  form.value = defaultForm()
  detectedFiles.value = []
  detectedModelFileName.value = ''
  selectedModelFile.value = null
  selectedThumbnailFile.value = null
  uploadError.value = ''
  isEditing.value = false
  editingShoeId.value = null
  validationErrors.value = []
  saveFeedback.value = ''
  editorMode.value = true
}

function openEditShoe(shoe) {
  form.value = {
    name: shoe.name,
    description: shoe.description || '',
    price: shoe.price,
    stock: shoe.stock,
    status: shoe.status,
    categories: [...(shoe.categories || ['kickcraft'])],
    glbPath: shoe.glbPath,
    thumbnailPath: shoe.thumbnailPath,
    charmsEnabled: shoe.charmsEnabled !== false,
    parts: JSON.parse(JSON.stringify(shoe.parts || [])),
    colors: JSON.parse(JSON.stringify(shoe.colors || [])),
  }
  isEditing.value = true
  editingShoeId.value = shoe.id
  detectedFiles.value = []
  detectedModelFileName.value = (shoe.glbPath || '').split('/').pop() || ''
  selectedModelFile.value = null
  selectedThumbnailFile.value = null
  uploadError.value = ''
  validationErrors.value = []
  saveFeedback.value = ''
  editorMode.value = true
}

function closeEditor() {
  editorMode.value = false
  isEditing.value = false
  editingShoeId.value = null
  detectedFiles.value = []
  detectedModelFileName.value = ''
  selectedModelFile.value = null
  selectedThumbnailFile.value = null
  uploadError.value = ''
  activeHighlightedMaterial.value = null
  validationErrors.value = []
  saveFeedback.value = ''
}

function cancelEdit() {
  if (form.value.glbPath || form.value.name) {
    adminConfirm.value = {
      show: true,
      title: 'Discard Unsaved Changes?',
      message: 'You have unsaved edits in the 3D shoe editor. Any customized materials or model settings will be discarded.',
      confirmText: 'Discard & Exit',
      cancelText: 'Continue Editing',
      variant: 'warning',
      icon: 'reset',
      onConfirm: () => {
        closeEditor()
      },
    }
  } else {
    closeEditor()
  }
}

// ── Model Material Auto-Detection & Highlighting ──────────────
function handleEditorModelLoad() {
  editorModelReady.value = true
  const model = editorViewer.value?.model
  if (!model) return

  const modelMats = model.materials || []
  if (!modelMats.length) return

  if (!form.value.parts || form.value.parts.length === 0) {
    form.value.parts = modelMats.map(mat => {
      const cleanLabel = mat.name
        .replace(/Material$/i, '')
        .replace(/([A-Z])/g, ' $1')
        .replace(/[-_]/g, ' ')
        .trim()
      return {
        id: slugify(cleanLabel) || slugify(mat.name),
        label: cleanLabel.charAt(0).toUpperCase() + cleanLabel.slice(1),
        material: mat.name,
        customizable: true,
      }
    })
  } else {
    for (const mat of modelMats) {
      if (!form.value.parts.some(p => p.material === mat.name)) {
        const cleanLabel = mat.name
          .replace(/Material$/i, '')
          .replace(/([A-Z])/g, ' $1')
          .trim()
        form.value.parts.push({
          id: slugify(cleanLabel) || slugify(mat.name),
          label: cleanLabel.charAt(0).toUpperCase() + cleanLabel.slice(1),
          material: mat.name,
          customizable: true,
        })
      }
    }
  }
}

function testHighlightPart(materialName) {
  activeHighlightedMaterial.value = materialName
  const model = editorViewer.value?.model
  if (!model) return
  highlightMaterial(model, materialName, '#ff2222')
}

function resetHighlight() {
  activeHighlightedMaterial.value = null
  const model = editorViewer.value?.model
  if (!model) return
  highlightMaterial(model, null)
}

// ── Thumbnail Upload ───────────────────────────────────────────
function handleThumbnailUpload(event) {
  const file = event.target.files?.[0]
  if (!file) return
  if (!/\.(png|jpe?g|webp)$/i.test(file.name)) {
    uploadError.value = 'Thumbnail must be PNG, JPG, or WebP.'
    return
  }
  selectedThumbnailFile.value = file
  const reader = new FileReader()
  reader.onload = e => {
    form.value.thumbnailPath = e.target.result
  }
  reader.readAsDataURL(file)
}

async function uploadAsset(file, kind) {
  const body = new FormData()
  body.append('file', file)
  body.append('kind', kind)
  const response = await api('shoes/upload.php', { method: 'POST', body })
  return response.path
}

// ── Color Palette Controls ─────────────────────────────────────
function addColorToPalette() {
  if (!newColorName.value.trim()) return
  form.value.colors.push({
    name: newColorName.value.trim(),
    value: newColorHex.value,
  })
  newColorName.value = ''
}

function removeColorFromPalette(index) {
  form.value.colors.splice(index, 1)
}

// ── Save Shoe ──────────────────────────────────────────────────
async function handleSaveShoe() {
  validationErrors.value = []
  saveFeedback.value = ''

  if (!form.value.glbPath) {
    validationErrors.value = ['Please drop or select a 3D shoe model (.glb) first.']
    return
  }

  const customizableParts = form.value.parts.filter(p => p.customizable !== false)

  const candidate = {
    ...form.value,
    parts: customizableParts,
  }

  const validation = validateShoe(candidate)
  if (!validation.valid) {
    validationErrors.value = validation.errors
    return
  }

  try {
    const serverGlbPath = selectedModelFile.value
      ? await uploadAsset(selectedModelFile.value, 'model')
      : form.value.glbPath
    const serverThumbnailPath = selectedThumbnailFile.value
      ? await uploadAsset(selectedThumbnailFile.value, 'thumbnail')
      : form.value.thumbnailPath
    const payload = {
      ...form.value,
      glbPath: serverGlbPath,
      thumbnailPath: serverThumbnailPath,
      modelFileName: detectedModelFileName.value,
      parts: customizableParts,
    }

    if (isEditing.value && editingShoeId.value) {
      await api('shoes/update.php', {
        method: 'POST',
        body: { ...payload, id: editingShoeId.value },
      })
      saveFeedback.value = `Updated "${candidate.name}" in database successfully!`
    } else {
      await api('shoes/create.php', {
        method: 'POST',
        body: payload,
      })
      saveFeedback.value = `Published "${candidate.name}" to database successfully!`
    }
    await loadData()
    setTimeout(() => {
      closeEditor()
    }, 1200)
  } catch (err) {
    console.error('Database save error:', err)
    validationErrors.value = [
      `Database error: ${err.message || 'Failed to save shoe to MySQL database. Make sure you are logged in as Owner.'}`,
    ]
  }
}

// ── Quick Actions ──────────────────────────────────────────────
async function handleToggleStatus(shoe) {
  const nextStatus =
    shoe.status === 'available'
      ? 'coming_soon'
      : shoe.status === 'coming_soon'
        ? 'out_of_stock'
        : 'available'

  try {
    await api('shoes/update.php', {
      method: 'POST',
      body: { id: shoe.id, status: nextStatus },
    })
    await loadData()
  } catch (err) {
    saveFeedback.value = `Could not update shoe status: ${err.message || 'server error'}`
  }
}

function openRestock(shoe) {
  restockTargetShoe.value = shoe
  restockAmount.value = 10
  showRestockModal.value = true
}

async function confirmRestock() {
  if (!restockTargetShoe.value) return
  try {
    await api('shoes/restock.php', {
      method: 'POST',
      body: {
        id: restockTargetShoe.value.id,
        amount: Number(restockAmount.value),
      },
    })
    await loadData()
  } catch (err) {
    saveFeedback.value = `Could not restock shoe: ${err.message || 'server error'}`
  }

  showRestockModal.value = false
  restockTargetShoe.value = null
}

// function deleteShoe(shoe)
function deleteShoe(shoe, mode = 'soft') {
  if (mode === 'hard') {
    adminConfirm.value = {
      show: true,
      title: 'Delete Shoe Silhouette Permanently?',
      message: `Are you sure you want to permanently delete "${shoe.name}"? This silhouette will be permanently removed from the catalog.`,
      confirmText: 'Delete Permanently',
      cancelText: 'Keep Shoe',
      variant: 'danger',
      icon: 'trash',
      onConfirm: async () => {
        try {
          await api('shoes/delete.php', {
            method: 'POST',
            body: { id: shoe.id, mode },
          })
          await loadData()
        } catch (err) {
          saveFeedback.value = `Could not delete shoe: ${err.message || 'server error'}`
          return
        }
        saveFeedback.value = `"${shoe.name}" has been permanently deleted.`
      },
    }
  } else {
    adminConfirm.value = {
      show: true,
      title: 'Delete Shoe Silhouette?',
      message: `Are you sure you want to delete "${shoe.name}"? This silhouette will be moved to archived shoes.`,
      confirmText: 'Delete Permanently',
      cancelText: 'Keep Shoe',
      variant: 'danger',
      icon: 'trash',
      onConfirm: async () => {
        try {
          await api('shoes/delete.php', {
            method: 'POST',
            body: { id: shoe.id, mode },
          })
          await loadData()
        } catch (err) {
          saveFeedback.value = `Could not delete shoe: ${err.message || 'server error'}`
          return
        }
        saveFeedback.value = `"${shoe.name}" has been deleted.`
      },
    }
  }
}

const handleDeleteShoe = deleteShoe

function confirmPermanentDelete(shoe) {
  deleteShoe(shoe, 'hard')
}

async function restoreShoe(shoe) {
  try {
    await api('shoes/restore.php', {
      method: 'POST',
      body: { id: shoe.id },
    })
    await loadData()
    saveFeedback.value = `"${shoe.name}" has been restored to catalog.`
  } catch (err) {
    saveFeedback.value = `Failed to restore "${shoe.name}": ${err.message}`
  }
}
</script>

<template>
  <div class="mx-auto max-w-[1480px] px-5 py-6 lg:px-8" :aria-busy="dataLoading">

    <!-- Top Breadcrumb & Status Bar -->
    <div class="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-[#cfd2ce] pb-4">
      <div class="flex items-center gap-3">
        <span class="font-display text-base font-black tracking-[-0.02em] text-[#202220]">
          KickCraft
        </span>
        <span class="text-[#cfd2ce]">/</span>
        <span class="font-bold text-xs uppercase tracking-wider text-[#b94d27]">Owner Admin Portal</span>
      </div>

      <div class="flex items-center gap-3 text-xs">
        <button
          type="button"
          class="border border-[#bfc3bf] bg-white px-3.5 py-1.5 font-bold text-[#202220] shadow-sm transition-all duration-150 hover:border-[#202220] hover:bg-[#202220] hover:text-white focus-visible:outline-2 focus-visible:outline-[#245fa8]"
          @click="emit('backToShop')"
        >
          Preview Customer Shop
        </button>

        <span class="flex items-center gap-1.5 font-semibold text-[#5f635f]">
          <span class="size-2 rounded-full bg-[#3f7652]" />
          Signed in: <strong class="text-[#202220]">{{ currentUser?.email || 'owner@kickcraft.local' }}</strong>
        </span>
      </div>
    </div>

    <!-- ── Admin Section Tabs (Inventory vs Financials) ────────── -->
    <div class="mb-6 flex border-b border-[#cfd2ce] bg-white shadow-sm">
      <button
        type="button"
        class="border-b-2 px-6 py-3.5 text-xs font-bold transition-all duration-150 focus-visible:outline-2 focus-visible:outline-[#245fa8]"
        :class="adminSection === 'inventory'
          ? 'border-[#b94d27] bg-[#fcfdfb] text-[#202220]'
          : 'border-transparent text-[#5f635f] hover:bg-[#f7f8f6] hover:text-[#202220]'"
        @click="adminSection = 'inventory'; editorMode = false"
      >
        Shoe Catalog &amp; Inventory
      </button>

      <button
        type="button"
        class="flex items-center gap-2 border-b-2 px-6 py-3.5 text-xs font-bold transition-all duration-150 focus-visible:outline-2 focus-visible:outline-[#245fa8]"
        :class="adminSection === 'reservations'
          ? 'border-[#b94d27] bg-[#fcfdfb] text-[#202220]'
          : 'border-transparent text-[#5f635f] hover:bg-[#f7f8f6] hover:text-[#202220]'"
        @click="adminSection = 'reservations'; editorMode = false"
      >
        <span>Pickup Reservations</span>
        <span
          v-if="pendingCount > 0"
          class="rounded-full bg-[#c97d1e] px-1.5 py-0.5 text-[10px] font-black text-white"
        >
          {{ pendingCount }} pending
        </span>
      </button>

      <button
        type="button"
        class="flex items-center gap-2 border-b-2 px-6 py-3.5 text-xs font-bold transition-all duration-150 focus-visible:outline-2 focus-visible:outline-[#245fa8]"
        :class="adminSection === 'marketplace-orders'
          ? 'border-[#b94d27] bg-[#fcfdfb] text-[#202220]'
          : 'border-transparent text-[#5f635f] hover:bg-[#f7f8f6] hover:text-[#202220]'"
        @click="adminSection = 'marketplace-orders'; editorMode = false; fetchMarketplaceOrders()"
      >
        <span>Marketplace Orders</span>
        <span
          v-if="pendingMarketplaceOrdersCount > 0"
          class="rounded-full bg-[#c97d1e] px-1.5 py-0.5 text-[10px] font-black text-white"
        >
          {{ pendingMarketplaceOrdersCount }} pending
        </span>
      </button>

      <button
        type="button"
        class="flex items-center gap-2 border-b-2 px-6 py-3.5 text-xs font-bold transition-all duration-150 focus-visible:outline-2 focus-visible:outline-[#245fa8]"
        :class="adminSection === 'sellers'
          ? 'border-[#b94d27] bg-[#fcfdfb] text-[#202220]'
          : 'border-transparent text-[#5f635f] hover:bg-[#f7f8f6] hover:text-[#202220]'"
        @click="adminSection = 'sellers'; editorMode = false; fetchSellers()"
      >
        <span>Sellers</span>
        <span
          v-if="pendingSellersCount > 0"
          class="rounded-full bg-[#c97d1e] px-1.5 py-0.5 text-[10px] font-black text-white"
        >
          {{ pendingSellersCount }} pending
        </span>
      </button>

      <button
        type="button"
        class="flex items-center gap-2 border-b-2 px-6 py-3.5 text-xs font-bold transition-all duration-150 focus-visible:outline-2 focus-visible:outline-[#245fa8]"
        :class="adminSection === 'products'
          ? 'border-[#b94d27] bg-[#fcfdfb] text-[#202220]'
          : 'border-transparent text-[#5f635f] hover:bg-[#f7f8f6] hover:text-[#202220]'"
        @click="adminSection = 'products'; editorMode = false; fetchProducts()"
      >
        <span>Products</span>
        <span
          v-if="pendingProductsCount > 0"
          class="rounded-full bg-[#c97d1e] px-1.5 py-0.5 text-[10px] font-black text-white"
        >
          {{ pendingProductsCount }} pending
        </span>
      </button>

      <button
        type="button"
        class="flex items-center gap-2 border-b-2 px-6 py-3.5 text-xs font-bold transition-all duration-150 focus-visible:outline-2 focus-visible:outline-[#245fa8]"
        :class="adminSection === 'users'
          ? 'border-[#b94d27] bg-[#fcfdfb] text-[#202220]'
          : 'border-transparent text-[#5f635f] hover:bg-[#f7f8f6] hover:text-[#202220]'"
        @click="adminSection = 'users'; editorMode = false; fetchUsers()"
      >
        <span>Admin Accounts</span>
        <span
          v-if="userStats.total > 0"
          class="rounded-full bg-[#292b2d] px-1.5 py-0.5 text-[10px] font-black text-white"
        >
          {{ userStats.total }}
        </span>
      </button>
    </div>


    <div v-if="dataLoading" role="status" class="mb-6 border border-[#cfd2ce] bg-white px-4 py-3 text-sm font-semibold text-[#5f635f]">
      Refreshing owner data…
    </div>
    <div v-else-if="dataError" role="alert" class="mb-6 flex flex-wrap items-center justify-between gap-3 border border-[#b94d27] bg-[#fdf2ef] px-4 py-3 text-sm text-[#963a20]">
      <div>
        <p class="font-bold">Some owner data is unavailable.</p>
        <p class="mt-0.5 text-xs">{{ dataError }}</p>
      </div>
      <button
        type="button"
        class="border border-[#b94d27] px-3 py-1.5 text-xs font-bold hover:bg-[#b94d27] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b94d27]"
        @click="loadData"
      >
        Retry all data
      </button>
    </div>

    <!-- ══════════════════════════════════════════════════════════ -->
    <!-- SECTION 1: INVENTORY & CATALOG VIEW                        -->
    <!-- ══════════════════════════════════════════════════════════ -->
    <div v-if="adminSection === 'inventory'">

      <!-- ── VIEW 1A: SHOE LIST & INVENTORY ──────────────────── -->
      <div v-if="!editorMode" class="space-y-6">

        <!-- Header & Action Button -->
        <div class="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <h1 class="font-display text-3xl font-black tracking-[-0.04em] text-[#202220]">
              Shoe Catalog &amp; Inventory
            </h1>
            <p class="mt-1 text-sm text-[#5f635f]">
              Manage existing silhouettes, view stock levels, or configure new 3D shoe models.
            </p>
          </div>

          <div class="flex items-center gap-3">
            <button
              type="button"
              class="bg-[#292b2d] px-5 py-2.5 text-xs font-bold text-white shadow-sm transition-all duration-150 hover:bg-[#b94d27] focus-visible:outline-2 focus-visible:outline-[#245fa8]"
              @click="openNewShoeEditor"
            >
              Add New Shoe
            </button>
          </div>
        </div>

        <!-- Stat Badges Strip -->
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div class="border border-[#cfd2ce] bg-white p-4">
            <p class="text-[11px] font-bold uppercase tracking-wider text-[#6a6e6a]">Total Silhouettes</p>
            <p class="mt-1 text-2xl font-black text-[#202220]">{{ stats.total }}</p>
          </div>
          <div class="border border-[#cfd2ce] bg-white p-4">
            <p class="text-[11px] font-bold uppercase tracking-wider text-[#3f7652]">Available for Order</p>
            <p class="mt-1 text-2xl font-black text-[#3f7652]">{{ stats.available }}</p>
          </div>
          <div class="border border-[#cfd2ce] bg-white p-4">
            <p class="text-[11px] font-bold uppercase tracking-wider text-[#c97d1e]">Coming Soon</p>
            <p class="mt-1 text-2xl font-black text-[#c97d1e]">{{ stats.comingSoon }}</p>
          </div>
          <div class="border border-[#cfd2ce] bg-white p-4">
            <p class="text-[11px] font-bold uppercase tracking-wider text-[#b94d27]">Out of Stock</p>
            <p class="mt-1 text-2xl font-black text-[#b94d27]">{{ stats.outOfStock }}</p>
          </div>
          <div class="border border-[#cfd2ce] bg-white p-4">
            <p class="text-[11px] font-bold uppercase tracking-wider text-[#5f635f]">Archived</p>
            <p class="mt-1 text-2xl font-black text-[#5f635f]">{{ stats.archived }}</p>
          </div>
        </div>

        <!-- Filter bar -->
        <div class="flex flex-col gap-4 border border-[#cfd2ce] bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
          <!-- Status Tabs -->
          <div class="flex flex-wrap gap-1 text-xs font-bold">
            <button
              type="button"
              class="px-3 py-2 transition-colors"
              :class="activeTab === 'all' ? 'bg-[#292b2d] text-white' : 'text-[#5f635f] hover:bg-[#f1f3f0]'"
              @click="activeTab = 'all'"
            >
              All ({{ stats.total }})
            </button>
            <button
              type="button"
              class="px-3 py-2 transition-colors"
              :class="activeTab === 'available' ? 'bg-[#3f7652] text-white' : 'text-[#5f635f] hover:bg-[#f1f3f0]'"
              @click="activeTab = 'available'"
            >
              Available ({{ stats.available }})
            </button>
            <button
              type="button"
              class="px-3 py-2 transition-colors"
              :class="activeTab === 'coming_soon' ? 'bg-[#c97d1e] text-white' : 'text-[#5f635f] hover:bg-[#f1f3f0]'"
              @click="activeTab = 'coming_soon'"
            >
              Coming Soon ({{ stats.comingSoon }})
            </button>
            <button
              type="button"
              class="px-3 py-2 transition-colors"
              :class="activeTab === 'out_of_stock' ? 'bg-[#b94d27] text-white' : 'text-[#5f635f] hover:bg-[#f1f3f0]'"
              @click="activeTab = 'out_of_stock'"
            >
              Out of Stock ({{ stats.outOfStock }})
            </button>
            <button
              type="button"
              class="px-3 py-2 transition-colors"
              :class="activeTab === 'archived' ? 'bg-[#5f635f] text-white' : 'text-[#5f635f] hover:bg-[#f1f3f0]'"
              @click="activeTab = 'archived'"
            >
              Archived ({{ stats.archived }})
            </button>
          </div>

          <!-- Search -->
          <div class="relative sm:w-72">
            <input
              v-model="searchQuery"
              type="search"
              placeholder="Search shoes by name or category..."
              class="h-9 w-full border border-[#cfd2ce] bg-[#fcfdfb] px-3 text-xs outline-none transition-colors focus:border-[#245fa8]"
            />
          </div>
        </div>

        <!-- Shoe Cards Grid -->
        <div v-if="filteredShoes.length" class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <div
            v-for="shoe in filteredShoes"
            :key="shoe.id"
            class="flex flex-col border border-[#cfd2ce] bg-white transition-shadow hover:shadow-md"
          >
            <!-- Image preview with status badge -->
            <div class="relative aspect-video w-full overflow-hidden bg-[#e9ece9]">
              <img
                :src="shoe.thumbnailPath"
                :alt="shoe.name"
                class="size-full object-cover object-center"
                @error="$event.target.src = '/images/kickcraft-one-card.png'"
              />
              <span
                class="absolute right-3 top-3 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white shadow-sm"
                :class="{
                  'bg-[#5f635f]': shoe.deletedAt,
                  'bg-[#3f7652]': !shoe.deletedAt && shoe.status === 'available',
                  'bg-[#c97d1e]': !shoe.deletedAt && shoe.status === 'coming_soon',
                  'bg-[#b94d27]': !shoe.deletedAt && shoe.status === 'out_of_stock',
                }"
              >
                {{ shoe.deletedAt ? 'archived' : shoe.status.replace('_', ' ') }}
              </span>
            </div>

            <!-- Card Content -->
            <div class="flex flex-1 flex-col p-4">
              <div class="flex items-start justify-between gap-2">
                <div>
                  <h3 class="font-display text-lg font-black tracking-[-0.03em] text-[#202220]">
                    {{ shoe.name }}
                  </h3>
                  <p class="text-xs text-[#6a6e6a] line-clamp-1">{{ shoe.description }}</p>
                </div>
                <span class="font-display font-black text-sm text-[#b94d27]">
                  {{ shoe.formattedPrice || `₱${shoe.price?.toLocaleString()}` }}
                </span>
              </div>

              <!-- Categories tags -->
              <div class="mt-3 flex flex-wrap gap-1">
                <span
                  v-for="cat in shoe.categories"
                  :key="cat"
                  class="border border-[#cfd2ce] bg-[#f5f6f4] px-1.5 py-0.5 text-[9px] font-bold uppercase text-[#5f635f]"
                >
                  {{ cat }}
                </span>
              </div>

              <!-- Stock & parts counter info -->
              <div class="mt-4 flex items-center justify-between border-t border-[#f1f3f0] pt-3 text-xs text-[#5f635f]">
                <span>
                  Stock: <strong class="text-[#202220]">{{ shoe.stock ?? 0 }}</strong> pairs
                </span>
                <span>
                  <strong>{{ shoe.parts?.length || 0 }}</strong> custom parts
                </span>
              </div>

              <!-- Action buttons strip -->
              <div v-if="activeTab === 'archived' || shoe.deletedAt" class="mt-4 grid grid-cols-2 gap-2 border-t border-[#f1f3f0] pt-3">
                <button
                  type="button"
                  class="h-8 border border-[#3f7652] bg-white text-[11px] font-bold text-[#3f7652] transition-colors hover:bg-[#edf5f0]"
                  @click="restoreShoe(shoe)"
                >
                  Restore
                </button>
                <button
                  type="button"
                  class="h-8 border border-[#b94d27] bg-[#b94d27] text-[11px] font-bold text-white transition-colors hover:bg-[#963a20]"
                  @click="confirmPermanentDelete(shoe)"
                >
                  Delete Permanently
                </button>
              </div>
              <div v-else class="mt-4 grid grid-cols-3 gap-2 border-t border-[#f1f3f0] pt-3">
                <button
                  type="button"
                  class="h-8 border border-[#bfc3bf] bg-white text-[11px] font-bold text-[#202220] transition-colors hover:border-[#292b2d]"
                  @click="openEditShoe(shoe)"
                >
                  Edit
                </button>
                <button
                  type="button"
                  class="h-8 border border-[#bfc3bf] bg-white text-[11px] font-bold text-[#245fa8] transition-colors hover:border-[#245fa8] hover:bg-[#edf5f0]"
                  @click="openRestock(shoe)"
                >
                  Restock
                </button>
                <button
                  type="button"
                  class="h-8 border border-[#bfc3bf] bg-white text-[11px] font-bold text-[#b94d27] transition-colors hover:border-[#b94d27] hover:bg-[#fdf2ef]"
                  @click="deleteShoe(shoe)"
                >
                  Delete
                </button>
              </div>

              <!-- Preview in Customer Studio link -->
              <div class="mt-3 text-center">
                <button
                  type="button"
                  class="text-[11px] font-semibold text-[#5f635f] underline hover:text-[#202220]"
                  @click="emit('openStudio', shoe.id)"
                >
                  Test in 3D Customer Studio →
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Empty state -->
        <div v-else class="border border-[#cfd2ce] bg-white p-12 text-center">
          <p class="font-display text-lg font-bold text-[#202220]">{{ shoes.length ? 'No shoes match this view' : 'No shoes in catalog' }}</p>
          <p class="mt-1 text-xs text-[#5f635f]">{{ shoes.length ? 'Clear your search or change the selected status.' : 'Add the first 3D shoe to begin.' }}</p>
          <button
            type="button"
            class="mx-auto mt-4 bg-[#292b2d] px-5 py-2.5 text-xs font-bold text-white shadow-sm transition-all duration-150 hover:bg-[#b94d27]"
            @click="shoes.length ? (searchQuery = '', activeTab = 'all') : openNewShoeEditor()"
          >
            {{ shoes.length ? 'Clear filters' : 'Add New Shoe' }}
          </button>
        </div>

      </div>

      <!-- ── VIEW 1B: 3D SHOE CONFIGURATION & EDITOR ─────────── -->
      <div v-else class="space-y-6">

        <!-- Editor Header -->
        <div class="flex items-center justify-between border-b border-[#cfd2ce] pb-4">
          <div>
            <button
              type="button"
              class="text-xs font-bold text-[#5f635f] transition-colors hover:text-[#202220] hover:underline"
              @click="cancelEdit"
            >
              Back to Shoe Inventory
            </button>
            <h2 class="font-display mt-2 text-2xl font-black tracking-[-0.03em] text-[#202220]">
              {{ isEditing ? `Edit: ${form.name}` : (form.glbPath ? `Configure: ${form.name}` : 'Add New 3D Shoe Model') }}
            </h2>
          </div>

          <div v-if="form.glbPath" class="flex items-center gap-2">
            <button
              type="button"
              class="border border-[#bfc3bf] bg-white px-4 py-2 text-xs font-bold text-[#5f635f] hover:border-[#292b2d]"
              @click="cancelEdit"
            >
              Cancel
            </button>
            <button
              type="button"
              class="bg-[#b94d27] px-5 py-2 text-xs font-bold text-white hover:bg-[#963a20]"
              @click="handleSaveShoe"
            >
              {{ isEditing ? 'Save Changes' : 'Publish Shoe to Shop' }}
            </button>
          </div>
        </div>

        <!-- Feedback notifications -->
        <div v-if="saveFeedback" class="border border-[#3f7652]/30 bg-[#edf5f0] p-4 text-xs font-bold text-[#2a593a]">
          {{ saveFeedback }}
        </div>
        <div v-if="validationErrors.length" class="border border-[#b94d27]/30 bg-[#fdf2ef] p-4 text-xs text-[#963a20]">
          <p class="font-bold">Please resolve the following issues:</p>
          <ul class="mt-1.5 list-inside list-disc space-y-0.5">
            <li v-for="(err, idx) in validationErrors" :key="idx">{{ err }}</li>
          </ul>
        </div>

        <!-- STEP 1: DROPZONE (When no 3D model is loaded yet) -->
        <div
          v-if="!form.glbPath"
          class="border-2 border-dashed border-[#b94d27] bg-[#fcfdfb] p-8 sm:p-14 text-center transition-all"
          @dragover.prevent
          @drop="handleDrop"
        >
          <div class="mx-auto flex h-10 w-28 items-center justify-center border-2 border-[#b94d27] bg-[#fdf2ef] font-mono text-xs font-black uppercase tracking-wider text-[#b94d27]">
            Drop GLB
          </div>

          <h3 class="mt-4 font-display text-2xl font-black text-[#202220]">
            Upload 3D Shoe Model or Folder
          </h3>
          <p class="mx-auto mt-2 max-w-md text-xs leading-5 text-[#5f635f]">
            Drag and drop a folder of 3D shoes or an individual <code class="bg-[#f1f3f0] px-1 py-0.5 font-bold text-[#202220]">.glb</code> model file here. Customization options will appear once the file is loaded.
          </p>

          <!-- Hidden inputs -->
          <input
            ref="folderInput"
            type="file"
            webkitdirectory
            directory
            multiple
            class="hidden"
            @change="handleFileInputChange"
          />
          <input
            ref="fileInput"
            type="file"
            multiple
            accept=".glb"
            class="hidden"
            @change="handleFileInputChange"
          />

          <!-- Action buttons -->
          <div class="mt-6 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              class="border border-[#292b2d] bg-[#292b2d] px-5 py-2.5 text-xs font-bold text-white transition-colors hover:bg-[#b94d27]"
              @click="triggerFolderPicker"
            >
              Browse Folder
            </button>
            <button
              type="button"
              class="border border-[#bfc3bf] bg-white px-5 py-2.5 text-xs font-bold text-[#202220] transition-colors hover:border-[#292b2d]"
              @click="triggerFilePicker"
            >
              Choose .GLB File
            </button>
          </div>

          <div v-if="uploadError" class="mt-4 text-xs font-semibold text-[#b94d27]">
            {{ uploadError }}
          </div>

          <!-- Detected Models from Folder Selection -->
          <div v-if="detectedFiles.length > 1" class="mt-8 border-t border-[#d9dcd8] pt-6 text-left">
            <h4 class="font-display text-xs font-bold uppercase tracking-wider text-[#404345]">
              Detected 3D Models in Folder ({{ detectedFiles.length }})
            </h4>
            <p class="text-xs text-[#6a6e6a]">Select which model to customize:</p>

            <div class="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div
                v-for="(detected, idx) in detectedFiles"
                :key="idx"
                class="flex items-center justify-between border border-[#cfd2ce] bg-white p-3 shadow-sm"
              >
                <div class="overflow-hidden pr-2">
                  <p class="truncate text-xs font-bold text-[#202220]" :title="detected.name">
                    {{ detected.name }}
                  </p>
                  <p class="text-[10px] text-[#6a6e6a]">{{ detected.sizeFormatted }}</p>
                </div>
                <button
                  type="button"
                  class="shrink-0 bg-[#245fa8] px-3 py-1.5 text-[11px] font-bold text-white transition-colors hover:bg-[#184478]"
                  @click="configureDetectedModel(detected)"
                >
                  Customize →
                </button>
              </div>
            </div>
          </div>

          <!-- Or Choose from Existing Model Library -->
          <div class="mt-10 border-t border-[#d9dcd8] pt-6">
            <p class="text-[11px] font-bold uppercase tracking-wider text-[#8e938e]">
              Or choose an existing 3D model from the library
            </p>
            <div class="mt-3 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                class="border border-[#cfd2ce] bg-white px-3 py-1.5 text-xs font-semibold text-[#5f635f] hover:border-[#292b2d] hover:text-[#202220]"
                @click="selectLibraryModel('/models/shoe-soleview-final.glb', 'KickCraft One Silhouette')"
              >
                KickCraft One (.glb)
              </button>
              <button
                type="button"
                class="border border-[#cfd2ce] bg-white px-3 py-1.5 text-xs font-semibold text-[#5f635f] hover:border-[#292b2d] hover:text-[#202220]"
                @click="selectLibraryModel('/models/nike-air-max-custom.glb', 'Air Max Silhouette')"
              >
                Air Max (.glb)
              </button>
              <button
                type="button"
                class="border border-[#cfd2ce] bg-white px-3 py-1.5 text-xs font-semibold text-[#5f635f] hover:border-[#292b2d] hover:text-[#202220]"
                @click="selectLibraryModel('/models/nike-dunk.glb', 'Dunk Silhouette')"
              >
                Nike Dunk (.glb)
              </button>
            </div>
          </div>
        </div>

        <!-- STEP 2: CUSTOMIZATION CONTROLS -->
        <div v-else class="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(380px,1fr)]">

          <!-- Left Column: 3D Model Preview & Material Highlighting Guide -->
          <div class="flex flex-col space-y-3">
            <div class="relative h-[540px] w-full border border-[#bfc3bf] bg-[#e9ece9]">
              <model-viewer
                ref="editorViewer"
                :src="form.glbPath"
                alt="3D model configurator preview"
                camera-controls
                touch-action="pan-y"
                shadow-intensity="1"
                shadow-softness="1"
                exposure="1"
                environment-image="neutral"
                interaction-prompt="auto"
                style="width:100%;height:100%;"
                @load="handleEditorModelLoad"
              />

              <!-- Top Indicator & Change Model button -->
              <div class="absolute left-3 top-3 flex items-center gap-2">
                <span class="flex items-center gap-1.5 bg-white/95 px-3 py-1.5 text-xs font-semibold shadow-sm">
                  <span class="size-2 bg-[#3f7652]" />
                  Interactive 3D Preview
                </span>
                <button
                  type="button"
                  class="border border-[#bfc3bf] bg-white/95 px-2.5 py-1.5 text-xs font-bold text-[#5f635f] shadow-sm hover:border-[#292b2d] hover:text-[#202220]"
                  @click="changeModel"
                >
                  Change 3D Model
                </button>
              </div>

              <!-- Material highlight banner -->
              <div
                v-if="activeHighlightedMaterial"
                class="absolute bottom-3 left-3 right-3 flex items-center justify-between border border-[#b94d27] bg-[#292b2d] px-4 py-2.5 text-xs text-white shadow-md"
              >
                <span>
                  Highlighting Part: <strong class="text-[#b94d27]">{{ activeHighlightedMaterial }}</strong> (turned red)
                </span>
                <button
                  type="button"
                  class="text-[11px] underline hover:text-[#f1efe8]"
                  @click="resetHighlight"
                >
                  Reset Color
                </button>
              </div>
            </div>

            <div class="border border-[#cfd2ce] bg-[#fcfdfb] p-3 text-xs text-[#5f635f]">
              <strong class="text-[#202220]">Point &amp; Verify:</strong> Click any material button in the "Customizable Parts" section on the right. The corresponding mesh will glow red in the 3D viewer above so you can easily identify each part.
            </div>
          </div>

          <!-- Right Column: Settings, Material Auto-Detection & Palette -->
          <div class="space-y-6">

            <!-- Section 1: Basic Information -->
            <div class="border border-[#cfd2ce] bg-white p-5">
              <h3 class="font-display text-sm font-bold uppercase tracking-wider text-[#202220]">
                1. Basic Information
              </h3>

              <div class="mt-4 space-y-4">
                <label class="block">
                  <span class="mb-1 block text-xs font-bold text-[#404345]">Shoe Name</span>
                  <input
                    v-model="form.name"
                    type="text"
                    placeholder="e.g. KickCraft Velocity"
                    class="h-10 w-full border border-[#cfd2ce] px-3 text-xs outline-none focus:border-[#245fa8]"
                  />
                </label>

                <label class="block">
                  <span class="mb-1 block text-xs font-bold text-[#404345]">Description</span>
                  <textarea
                    v-model="form.description"
                    rows="2"
                    placeholder="Brief summary of silhouette, intended performance, and design highlights."
                    class="w-full border border-[#cfd2ce] p-2.5 text-xs outline-none focus:border-[#245fa8]"
                  />
                </label>

                <div class="grid grid-cols-3 gap-3">
                  <label class="block">
                    <span class="mb-1 block text-xs font-bold text-[#404345]">Price (₱)</span>
                    <input
                      v-model.number="form.price"
                      type="number"
                      min="1"
                      class="h-10 w-full border border-[#cfd2ce] px-3 text-xs outline-none focus:border-[#245fa8]"
                    />
                  </label>

                  <label class="block">
                    <span class="mb-1 block text-xs font-bold text-[#404345]">Stock (Pairs)</span>
                    <input
                      v-model.number="form.stock"
                      type="number"
                      min="0"
                      class="h-10 w-full border border-[#cfd2ce] px-3 text-xs outline-none focus:border-[#245fa8]"
                    />
                  </label>

                  <label class="block">
                    <span class="mb-1 block text-xs font-bold text-[#404345]">Initial Status</span>
                    <select
                      v-model="form.status"
                      class="h-10 w-full border border-[#cfd2ce] bg-white px-2 text-xs outline-none focus:border-[#245fa8]"
                    >
                      <option value="available">Available</option>
                      <option value="coming_soon">Coming Soon</option>
                      <option value="out_of_stock">Out of Stock</option>
                    </select>
                  </label>
                </div>

                <!-- Categories Checkboxes -->
                <div>
                  <span class="mb-1.5 block text-xs font-bold text-[#404345]">Categories</span>
                  <div class="flex flex-wrap gap-2">
                    <label
                      v-for="cat in CATEGORIES.filter(c => c.id !== 'all')"
                      :key="cat.id"
                      class="flex items-center gap-1.5 border border-[#cfd2ce] bg-[#fcfdfb] px-2.5 py-1 text-xs cursor-pointer select-none"
                      :class="form.categories.includes(cat.id) ? 'border-[#292b2d] bg-[#292b2d] text-white' : 'text-[#5f635f]'"
                    >
                      <input
                        v-model="form.categories"
                        type="checkbox"
                        :value="cat.id"
                        class="hidden"
                      />
                      <span>{{ cat.label }}</span>
                    </label>
                  </div>
                </div>

                <!-- Thumbnail & Charm Options -->
                <div class="grid grid-cols-2 gap-4 pt-2">
                  <div>
                    <span class="mb-1 block text-xs font-bold text-[#404345]">Catalog Thumbnail</span>
                    <div class="flex items-center gap-3">
                      <img
                        :src="form.thumbnailPath"
                        alt="Thumbnail preview"
                        class="size-12 border border-[#cfd2ce] object-cover"
                        @error="$event.target.src = '/images/kickcraft-one-card.png'"
                      />
                      <label class="cursor-pointer border border-[#bfc3bf] bg-[#f5f6f4] px-3 py-1.5 text-xs font-bold hover:border-[#292b2d]">
                        Upload Image
                        <input
                          type="file"
                          accept="image/*"
                          class="hidden"
                          @change="handleThumbnailUpload"
                        />
                      </label>
                    </div>
                  </div>

                  <div class="flex flex-col justify-center">
                    <label class="flex items-center gap-2 cursor-pointer select-none text-xs">
                      <input
                        v-model="form.charmsEnabled"
                        type="checkbox"
                        class="size-4 accent-[#292b2d]"
                      />
                      <span class="font-bold text-[#404345]">Enable 3D Charms</span>
                    </label>
                    <p class="mt-0.5 text-[10px] text-[#6a6e6a]">
                      Allows Star, Lightning, and K-tag attachments on CharmAnchor.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <!-- Section 2: Auto-Detected Materials & Part Mapping -->
            <div class="border border-[#cfd2ce] bg-white p-5">
              <div class="flex items-center justify-between">
                <div>
                  <h3 class="font-display text-sm font-bold uppercase tracking-wider text-[#202220]">
                    2. Customizable Parts (Auto-Detected)
                  </h3>
                  <p class="mt-0.5 text-xs text-[#6a6e6a]">
                    Click a material to highlight it red in the 3D viewer, then give it a customer-facing label.
                  </p>
                </div>
                <span class="bg-[#f1f3f0] px-2 py-1 text-[11px] font-bold text-[#202220]">
                  {{ form.parts.filter(p => p.customizable !== false).length }} Active Parts
                </span>
              </div>

              <!-- Materials List -->
              <div v-if="form.parts.length" class="mt-4 space-y-2.5">
                <div
                  v-for="(part, idx) in form.parts"
                  :key="part.material"
                  class="flex flex-wrap items-center justify-between gap-2 border border-[#cfd2ce] p-2.5"
                  :class="activeHighlightedMaterial === part.material ? 'border-[#b94d27] bg-[#fdf2ef]' : 'bg-[#fcfdfb]'"
                >
                  <!-- Highlight trigger button -->
                  <button
                    type="button"
                    class="flex items-center gap-2 text-left font-mono text-xs font-bold transition-colors hover:text-[#b94d27]"
                    :title="`Click to highlight ${part.material} in 3D`"
                    @click="testHighlightPart(part.material)"
                  >
                    <span
                      class="size-3 border border-black/20"
                      :class="activeHighlightedMaterial === part.material ? 'bg-[#ff2222]' : 'bg-[#bfc3bf]'"
                    />
                    <span>{{ part.material }}</span>
                  </button>

                  <!-- Customer Label input & Customizable Toggle -->
                  <div class="flex items-center gap-3">
                    <input
                      v-model="part.label"
                      type="text"
                      placeholder="Customer part label"
                      class="h-8 w-32 border border-[#cfd2ce] bg-white px-2 text-xs outline-none focus:border-[#245fa8]"
                    />
                    <label class="flex items-center gap-1.5 cursor-pointer text-xs">
                      <input
                        v-model="part.customizable"
                        type="checkbox"
                        class="size-3.5 accent-[#292b2d]"
                      />
                      <span class="text-[11px] font-semibold text-[#5f635f]">Customizable</span>
                    </label>
                  </div>
                </div>
              </div>

              <div v-else class="mt-4 border border-[#cfd2ce] bg-[#f5f6f4] p-4 text-center text-xs text-[#6a6e6a]">
                Loading materials from 3D model...
              </div>
            </div>

            <!-- Section 3: Color Palette Configuration -->
            <div class="border border-[#cfd2ce] bg-white p-5">
              <h3 class="font-display text-sm font-bold uppercase tracking-wider text-[#202220]">
                3. Color Palette Configuration
              </h3>
              <p class="mt-0.5 text-xs text-[#6a6e6a]">
                Define the specific colors customers can apply across all customizable parts on this shoe.
              </p>

              <!-- Current Swatches List -->
              <div class="mt-4 flex flex-wrap gap-2">
                <div
                  v-for="(col, idx) in form.colors"
                  :key="idx"
                  class="flex items-center gap-2 border border-[#cfd2ce] bg-[#fcfdfb] py-1 pl-2 pr-1.5 text-xs shadow-sm"
                >
                  <span
                    class="size-3.5 border border-black/20 shadow-inner"
                    :style="{ backgroundColor: col.value }"
                  />
                  <span class="font-bold text-[#202220]">{{ col.name }}</span>
                  <span class="font-mono text-[10px] text-[#8e938e]">{{ col.value }}</span>
                  <button
                    type="button"
                    class="ml-1 size-4 rounded-full text-xs text-[#8e938e] hover:bg-[#b94d27] hover:text-white"
                    title="Remove color"
                    @click="removeColorFromPalette(idx)"
                  >
                    ×
                  </button>
                </div>
              </div>

              <!-- Add Color Input Group -->
              <div class="mt-4 flex flex-wrap items-center gap-3 border-t border-[#f1f3f0] pt-4">
                <div class="flex items-center gap-2">
                  <input
                    v-model="newColorHex"
                    type="color"
                    class="size-8 cursor-pointer border border-[#cfd2ce] p-0.5"
                  />
                  <input
                    v-model="newColorName"
                    type="text"
                    placeholder="Color Name (e.g. Cobalt)"
                    class="h-8 w-44 border border-[#cfd2ce] px-2.5 text-xs outline-none focus:border-[#245fa8]"
                    @keydown.enter.prevent="addColorToPalette"
                  />
                </div>

                <button
                  type="button"
                  class="h-8 bg-[#292b2d] px-3.5 text-xs font-bold text-white shadow-sm transition-all duration-150 hover:bg-[#b94d27]"
                  @click="addColorToPalette"
                >
                  Add Color
                </button>
              </div>
            </div>

            <!-- Bottom Action Buttons -->
            <div class="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                class="border border-[#bfc3bf] bg-white px-5 py-2.5 text-xs font-bold text-[#5f635f] hover:border-[#292b2d]"
                @click="cancelEdit"
              >
                Cancel
              </button>
              <button
                type="button"
                class="bg-[#b94d27] px-6 py-2.5 text-xs font-bold text-white hover:bg-[#963a20] shadow-sm"
                @click="handleSaveShoe"
              >
                {{ isEditing ? 'Save Changes' : 'Publish Shoe to Shop' }}
              </button>
            </div>

          </div>

        </div>

      </div>

    </div>

    <!-- ══════════════════════════════════════════════════════════ -->
    <!-- SECTION 2: PICKUP RESERVATIONS HUB                         -->
    <!-- ══════════════════════════════════════════════════════════ -->
    <div v-else-if="adminSection === 'reservations'" class="space-y-6">

      <!-- Header -->
      <div class="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 class="font-display text-3xl font-black tracking-[-0.04em] text-[#202220]">
            Pickup Reservations
          </h1>
          <p class="mt-1 text-sm text-[#5f635f]">
            Manage incoming custom shoe pickup reservations, track order fulfillment, and update customer pickup status.
          </p>
        </div>
      </div>

      <!-- Action Feedback Banners -->
      <div
        v-if="reservationActionError"
        class="flex items-center justify-between border-2 border-[#b94d27] bg-[#fdf2ef] p-4 text-xs font-bold text-[#b94d27]"
      >
        <span>{{ reservationActionError }}</span>
        <button
          type="button"
          class="ml-4 font-bold underline hover:opacity-80"
          @click="reservationActionError = ''"
        >
          Dismiss
        </button>
      </div>

      <div
        v-if="reservationActionSuccess"
        class="flex items-center justify-between border-2 border-[#3f7652] bg-[#edf5f0] p-4 text-xs font-bold text-[#2a593a]"
      >
        <span>{{ reservationActionSuccess }}</span>
        <button
          type="button"
          class="ml-4 font-bold underline hover:opacity-80"
          @click="reservationActionSuccess = ''"
        >
          Dismiss
        </button>
      </div>

      <!-- Filter & Search Controls for Reservations -->
      <div class="flex flex-col gap-4 border border-[#cfd2ce] bg-white p-4 sm:flex-row sm:items-center sm:justify-between shadow-sm">
        <!-- Status Filter Tabs -->
        <div class="flex flex-wrap gap-1 text-xs font-bold">
          <button
            type="button"
            class="px-3 py-2 transition-colors"
            :class="orderStatusFilter === 'all' ? 'bg-[#292b2d] text-white' : 'text-[#5f635f] hover:bg-[#f1f3f0]'"
            @click="orderStatusFilter = 'all'"
          >
            All ({{ orders.length }})
          </button>
          <button
            type="button"
            class="px-3 py-2 transition-colors"
            :class="orderStatusFilter === 'today' ? 'bg-[#c97d1e] text-white' : 'text-[#5f635f] hover:bg-[#f1f3f0]'"
            @click="orderStatusFilter = 'today'"
          >
            Today ({{ todayCount }})
          </button>
          <button
            type="button"
            class="px-3 py-2 transition-colors"
            :class="orderStatusFilter === 'upcoming' ? 'bg-[#245fa8] text-white' : 'text-[#5f635f] hover:bg-[#f1f3f0]'"
            @click="orderStatusFilter = 'upcoming'"
          >
            Upcoming ({{ upcomingCount }})
          </button>
          <button
            type="button"
            class="px-3 py-2 transition-colors"
            :class="orderStatusFilter === 'overdue' ? 'bg-[#b94d27] text-white' : 'text-[#5f635f] hover:bg-[#f1f3f0]'"
            @click="orderStatusFilter = 'overdue'"
          >
            Overdue ({{ overdueCount }})
          </button>
          <button
            type="button"
            class="px-3 py-2 transition-colors"
            :class="orderStatusFilter === 'ready' ? 'bg-[#3f7652] text-white' : 'text-[#5f635f] hover:bg-[#f1f3f0]'"
            @click="orderStatusFilter = 'ready'"
          >
            Ready ({{ readyCount }})
          </button>
          <button
            type="button"
            class="px-3 py-2 transition-colors"
            :class="orderStatusFilter === 'completed' ? 'bg-[#3f7652] text-white' : 'text-[#5f635f] hover:bg-[#f1f3f0]'"
            @click="orderStatusFilter = 'completed'"
          >
            Completed ({{ completedCount }})
          </button>
          <button
            type="button"
            class="px-3 py-2 transition-colors"
            :class="orderStatusFilter === 'cancelled' ? 'bg-[#b94d27] text-white' : 'text-[#5f635f] hover:bg-[#f1f3f0]'"
            @click="orderStatusFilter = 'cancelled'"
          >
            Cancelled ({{ cancelledCount }})
          </button>
        </div>

        <div class="flex w-full gap-2 sm:w-auto">
          <input
            v-model="orderSearchQuery"
            type="search"
            placeholder="Search receipt #, customer name, email..."
            class="h-9 min-w-0 flex-1 border border-[#cfd2ce] bg-[#fcfdfb] px-3 text-xs outline-none transition-colors focus:border-[#245fa8] sm:w-72"
          />
          <button
            type="button"
            class="h-9 border border-[#292b2d] bg-white px-3 text-xs font-bold text-[#292b2d] hover:bg-[#292b2d] hover:text-white"
            @click="exportReservationsCsv"
          >
            Export CSV
          </button>
        </div>
      </div>

      <!-- Reservations Data Table -->
      <div class="overflow-x-auto border border-[#cfd2ce] bg-white shadow-sm">
        <table class="w-full text-left text-xs">
          <thead class="border-b border-[#cfd2ce] bg-[#f1f3f0] font-bold uppercase tracking-wider text-[#404345]">
            <tr>
              <th class="px-4 py-3">Receipt / Order #</th>
              <th class="px-4 py-3">Customer</th>
              <th class="px-4 py-3">Shoe Model &amp; US Size</th>
              <th class="px-4 py-3">Custom Parts</th>
              <th class="px-4 py-3">Scheduled Pickup Date</th>
              <th class="px-4 py-3">Status</th>
              <th class="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[#f1f3f0]">
            <tr
              v-for="order in filteredOrders"
              :key="order.id"
              class="transition-colors hover:bg-[#fcfdfb]"
            >
              <!-- Receipt # -->
              <td class="whitespace-nowrap px-4 py-3 font-mono font-bold text-[#202220]">
                {{ order.id }}
              </td>

              <!-- Customer -->
              <td class="px-4 py-3">
                <p class="font-bold text-[#202220]">{{ order.customerName }}</p>
                <p class="text-[11px] text-[#6a6e6a]">{{ order.customerEmail }}</p>
              </td>

              <!-- Shoe & Size -->
              <td class="px-4 py-3">
                <span class="font-semibold text-[#202220]">{{ order.shoeName }}</span>
                <span class="ml-1.5 border border-[#cfd2ce] bg-[#f5f6f4] px-1.5 py-0.5 text-[10px] font-bold">
                  US {{ order.size }}
                </span>
                <p v-if="order.charmLabel && order.charmLabel !== 'None'" class="text-[10px] text-[#6a6e6a]">
                  Accessory: {{ order.charmLabel }}
                </p>
              </td>

              <!-- Custom Parts Count -->
              <td class="whitespace-nowrap px-4 py-3">
                <span class="inline-flex items-center gap-1 border border-[#cfd2ce] bg-[#f9faf8] px-2 py-0.5 text-[11px] font-bold text-[#404345]">
                  <span>{{ order.partColors ? Object.keys(order.partColors).length : 0 }}</span>
                  <span class="font-normal text-[#6a6e6a]">custom parts</span>
                </span>
              </td>

              <!-- Scheduled Pickup Date -->
              <td class="whitespace-nowrap px-4 py-3">
                <span class="font-semibold text-[#202220]">
                  {{ order.pickupDate ? order.pickupDate : new Date(order.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }}
                </span>
              </td>

              <!-- Status badge -->
              <td class="whitespace-nowrap px-4 py-3">
                <span
                  class="inline-block px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-white shadow-sm"
                  :class="{
                    'bg-[#c97d1e]': order.status === 'pending',
                    'bg-[#245fa8]': order.status === 'approved',
                    'bg-[#3f7652]': order.status === 'ready' || order.status === 'completed',
                    'bg-[#b94d27]': order.status === 'cancelled',
                  }"
                >
                  {{ order.status }}
                </span>
              </td>

              <!-- Action buttons -->
              <td class="whitespace-nowrap px-4 py-3 text-right">
                <div class="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    class="border border-[#bfc3bf] bg-white px-2.5 py-1 text-[11px] font-bold text-[#202220] hover:border-[#292b2d]"
                    @click="viewReservationDetails(order)"
                  >
                    View Details
                  </button>

                  <button
                    v-if="order.status === 'pending'"
                    type="button"
                    class="bg-[#245fa8] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[#1d4b88]"
                    title="Approve reservation"
                    @click="requestOrderStatusChange(order, 'approved')"
                  >
                    Approve
                  </button>

                  <button
                    v-if="order.status === 'approved'"
                    type="button"
                    class="bg-[#3f7652] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[#2a593a]"
                    title="Mark reservation ready for pickup"
                    @click="requestOrderStatusChange(order, 'ready')"
                  >
                    Mark Ready
                  </button>

                  <button
                    v-if="order.status === 'ready'"
                    type="button"
                    class="bg-[#3f7652] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[#2a593a]"
                    title="Mark reservation as completed upon customer pickup"
                    @click="requestOrderStatusChange(order, 'completed')"
                  >
                    Complete Pickup
                  </button>

                  <button
                    v-if="!['completed', 'cancelled'].includes(order.status)"
                    type="button"
                    class="border border-[#b94d27] bg-white px-2.5 py-1 text-[11px] font-bold text-[#b94d27] hover:bg-[#fdf2ef]"
                    @click="requestCancelOrder(order)"
                  >
                    Cancel
                  </button>

                  <button
                    v-if="order.status === 'cancelled'"
                    type="button"
                    class="text-xs font-bold text-[#b94d27] hover:underline"
                    @click="requestDeleteReservation(order)"
                  >
                    Delete Record
                  </button>
                </div>
              </td>
            </tr>

            <tr v-if="filteredOrders.length === 0">
              <td colspan="7" class="px-4 py-8 text-center text-[#6a6e6a]">
                <p class="font-bold text-[#202220]">{{ orders.length ? 'No reservations match this view' : 'No pickup reservations yet' }}</p>
                <p class="mt-1 text-xs">{{ orders.length ? 'Clear the search or choose another queue.' : 'New guest reservations will appear here.' }}</p>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

    </div>

    <!-- ── Floating Reservation Alert Banner (Top-Right) ────────── -->
    <aside
      v-if="reservationAlert"
      aria-label="New reservation alert"
      class="fixed top-6 right-6 z-50 w-96 max-w-[calc(100vw-2rem)] border-2 border-[#202220] bg-white p-4 shadow-2xl"
    >
      <div class="flex items-start justify-between gap-3">
        <div class="flex items-center gap-2">
          <span class="inline-block size-2.5 rounded-full bg-[#3f7652] animate-pulse" />
          <span class="font-display text-xs font-black uppercase tracking-wider text-[#202220]">
            New Reservation Received
          </span>
        </div>
        <button
          type="button"
          class="text-xs font-bold text-[#5f635f] hover:text-[#202220]"
          title="Dismiss alert"
          @click="dismissReservationAlert"
        >
          Close
        </button>
      </div>

      <div class="mt-2.5 border-l-2 border-[#b94d27] pl-3">
        <p class="font-display text-sm font-black text-[#202220]">
          {{ reservationAlert.customerName }}
        </p>
        <p class="text-xs font-semibold text-[#5f635f]">
          {{ reservationAlert.shoeName || reservationAlert.shoeId || 'Custom Shoe' }} · US {{ reservationAlert.size }}
        </p>
        <p class="mt-0.5 font-mono text-[11px] font-bold text-[#8e938e]">
          Receipt: {{ reservationAlert.id }}
        </p>
      </div>

      <div class="mt-3.5 flex items-center justify-end gap-2 border-t border-[#f1f3f0] pt-3">
        <button
          type="button"
          class="border border-[#cfd2ce] bg-white px-3 py-1.5 text-xs font-bold text-[#5f635f] hover:border-[#202220] hover:text-[#202220]"
          @click="dismissReservationAlert"
        >
          Close
        </button>
        <button
          type="button"
          class="bg-[#202220] px-3.5 py-1.5 text-xs font-bold text-white transition-colors hover:bg-[#b94d27]"
          @click="openInspectionModal(reservationAlert); dismissReservationAlert()"
        >
          View Details
        </button>
      </div>
    </aside>

    <!-- ── Comprehensive Reservation Inspection Modal ──────────── -->
    <div
      v-if="showInspectionModal && selectedInspectionReservation"
      class="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/60 p-4"
    >
      <div class="my-8 w-full max-w-2xl border-2 border-[#202220] bg-[#fcfdfb] p-6 shadow-2xl sm:p-8">

        <!-- Modal Header -->
        <div class="flex items-start justify-between border-b-2 border-[#202220] pb-4">
          <div>
            <div class="flex items-center gap-2">
              <span class="font-mono text-xs font-black tracking-wider uppercase text-[#8e938e]">
                Receipt / Reservation
              </span>
              <span
                class="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white"
                :class="{
                  'bg-[#c97d1e]': selectedInspectionReservation.status === 'pending',
                  'bg-[#245fa8]': selectedInspectionReservation.status === 'approved',
                  'bg-[#3f7652]': selectedInspectionReservation.status === 'ready' || selectedInspectionReservation.status === 'completed',
                  'bg-[#b94d27]': selectedInspectionReservation.status === 'cancelled',
                }"
              >
                {{ selectedInspectionReservation.status }}
              </span>
            </div>
            <h2 class="font-display mt-1 text-2xl font-black tracking-[-0.03em] text-[#202220]">
              {{ selectedInspectionReservation.id }}
            </h2>
          </div>

          <button
            type="button"
            class="text-sm font-bold text-[#5f635f] hover:text-[#202220]"
            title="Close inspection modal"
            @click="closeInspectionModal"
          >
            ✕ Close
          </button>
        </div>

        <!-- Modal Action Feedback Banners -->
        <div
          v-if="reservationActionError"
          class="mt-4 flex items-center justify-between border-2 border-[#b94d27] bg-[#fdf2ef] p-3 text-xs font-bold text-[#b94d27]"
        >
          <span>{{ reservationActionError }}</span>
          <button
            type="button"
            class="ml-2 font-bold underline"
            @click="reservationActionError = ''"
          >
            Dismiss
          </button>
        </div>
        <div
          v-if="reservationActionSuccess"
          class="mt-4 flex items-center justify-between border-2 border-[#3f7652] bg-[#edf5f0] p-3 text-xs font-bold text-[#2a593a]"
        >
          <span>{{ reservationActionSuccess }}</span>
          <button
            type="button"
            class="ml-2 font-bold underline"
            @click="reservationActionSuccess = ''"
          >
            Dismiss
          </button>
        </div>

        <!-- Customer & Schedule Meta Cards -->
        <div class="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <!-- Customer Info Card -->
          <div class="border border-[#cfd2ce] bg-white p-4 shadow-sm">
            <p class="text-[10px] font-bold uppercase tracking-wider text-[#8e938e]">
              Customer Information
            </p>
            <p class="mt-1 font-display text-base font-black text-[#202220]">
              {{ selectedInspectionReservation.customerName }}
            </p>
            <p class="text-xs font-medium text-[#5f635f]">
              {{ selectedInspectionReservation.customerEmail || selectedInspectionReservation.email }}
            </p>
          </div>

          <!-- Pickup Schedule Card -->
          <div class="border border-[#cfd2ce] bg-white p-4 shadow-sm">
            <p class="text-[10px] font-bold uppercase tracking-wider text-[#8e938e]">
              Scheduled Pickup Date
            </p>
            <p class="mt-1 font-display text-base font-black text-[#b94d27]">
              {{ selectedInspectionReservation.pickupDate }}
            </p>
            <p class="text-xs font-medium text-[#5f635f]">
              Target Store Pickup at Flagship Studio
            </p>
          </div>
        </div>

        <!-- Shoe Specifications Card -->
        <div class="mt-5 border border-[#cfd2ce] bg-white p-4 shadow-sm">
          <p class="mb-3 text-[10px] font-bold uppercase tracking-wider text-[#8e938e]">
            Shoe Specifications &amp; Build
          </p>
          <div class="flex flex-col gap-4 sm:flex-row sm:items-center">
            <!-- Thumbnail Image -->
            <div class="flex size-20 shrink-0 items-center justify-center border border-[#cfd2ce] bg-[#f5f6f4] p-1.5">
              <img
                :src="getReservationShoeThumbnail(selectedInspectionReservation)"
                :alt="selectedInspectionReservation.shoeName || 'KickCraft Shoe'"
                class="max-h-full max-w-full object-contain"
              />
            </div>

            <!-- Specs Grid -->
            <div class="flex-1 space-y-1">
              <div class="flex items-center justify-between">
                <h3 class="font-display text-lg font-black text-[#202220]">
                  {{ selectedInspectionReservation.shoeName || selectedInspectionReservation.shoeId || 'KickCraft One' }}
                </h3>
                <span class="font-display text-lg font-black text-[#202220]">
                  ₱{{ (selectedInspectionReservation.price ?? 4990).toLocaleString() }}
                </span>
              </div>

              <div class="flex flex-wrap items-center gap-2 pt-1 text-xs text-[#5f635f]">
                <span class="border border-[#cfd2ce] bg-[#f7f8f6] px-2 py-0.5 font-bold text-[#202220]">
                  US Size: {{ selectedInspectionReservation.size }}
                </span>
                <span class="border border-[#cfd2ce] bg-[#f7f8f6] px-2 py-0.5 font-bold text-[#202220]">
                  Accessory Charm: {{ selectedInspectionReservation.charmLabel || selectedInspectionReservation.charmId || 'None' }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- 3D Design Color Palette Breakdown -->
        <div class="mt-5 border border-[#cfd2ce] bg-white p-4 shadow-sm">
          <div class="flex items-center justify-between border-b border-[#f1f3f0] pb-2.5">
            <p class="text-[10px] font-bold uppercase tracking-wider text-[#8e938e]">
              3D Design Color Palette Breakdown
            </p>
            <span class="text-[11px] font-bold text-[#5f635f]">
              {{ selectedInspectionReservation.partColors ? Object.keys(selectedInspectionReservation.partColors).length : 0 }} Customized Zones
            </span>
          </div>

          <div
            v-if="selectedInspectionReservation.partColors && Object.keys(selectedInspectionReservation.partColors).length > 0"
            class="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4"
          >
            <div
              v-for="(partColor, partKey) in selectedInspectionReservation.partColors"
              :key="partKey"
              class="flex items-center gap-2.5 border border-[#e5e7e4] bg-[#fcfdfb] p-2"
            >
              <!-- Color Swatch Box -->
              <div
                class="size-6 shrink-0 border border-[#202220]/25 shadow-sm"
                :style="{ backgroundColor: partColor.value }"
                :title="partColor.value"
              />
              <div class="min-w-0 flex-1">
                <p class="truncate text-[10px] font-bold uppercase tracking-wider text-[#5f635f]">
                  {{ formatPartLabel(partKey) }}
                </p>
                <p class="truncate text-xs font-black text-[#202220]">
                  {{ partColor.name || partColor.value }}
                </p>
              </div>
            </div>
          </div>
          <p v-else class="mt-3 text-xs italic text-[#8e938e]">
            Default factory colorway (no custom palette overrides).
          </p>
        </div>

        <!-- Store Cancellation Note (if cancelled with reason) -->
        <div
          v-if="selectedInspectionReservation.status === 'cancelled' && selectedInspectionReservation.notes"
          class="mt-4 border-l-2 border-[#b94d27] bg-[#fdf2ef] p-3 text-xs text-[#963a20]"
        >
          <span class="block font-bold uppercase tracking-wider text-[10px]">Cancellation Reason:</span>
          {{ selectedInspectionReservation.notes }}
        </div>

        <!-- Action Footer -->
        <div class="mt-6 flex flex-wrap items-center justify-between gap-3 border-t-2 border-[#202220] pt-4">
          <div class="flex flex-wrap items-center gap-2">
            <button
              v-if="selectedInspectionReservation.status === 'pending'"
              type="button"
              class="bg-[#245fa8] px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-[#1d4b88]"
              @click="requestOrderStatusChange(selectedInspectionReservation, 'approved')"
            >
              Approve Reservation
            </button>

            <button
              v-if="selectedInspectionReservation.status === 'approved'"
              type="button"
              class="bg-[#3f7652] px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-[#2a593a]"
              @click="requestOrderStatusChange(selectedInspectionReservation, 'ready')"
            >
              Mark Ready
            </button>

            <button
              v-if="selectedInspectionReservation.status === 'ready'"
              type="button"
              class="bg-[#3f7652] px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-[#2a593a]"
              @click="requestOrderStatusChange(selectedInspectionReservation, 'completed')"
            >
              Complete Pickup
            </button>

            <!-- Cancel Reservation (when not cancelled) -->
            <button
              v-if="!['completed', 'cancelled'].includes(selectedInspectionReservation.status)"
              type="button"
              class="border border-[#b94d27] bg-white px-4 py-2 text-xs font-bold text-[#b94d27] transition-colors hover:bg-[#fdf2ef]"
              @click="openOwnerCancelModal(selectedInspectionReservation)"
            >
              Cancel Reservation
            </button>

            <!-- Delete Record (when cancelled) -->
            <button
              v-if="selectedInspectionReservation.status === 'cancelled'"
              type="button"
              class="text-xs font-bold text-[#b94d27] hover:underline"
              @click="requestDeleteReservation(selectedInspectionReservation)"
            >
              Delete Record
            </button>
          </div>

          <button
            type="button"
            class="border border-[#bfc3bf] bg-white px-5 py-2 text-xs font-bold text-[#5f635f] transition-colors hover:border-[#202220] hover:text-[#202220]"
            @click="closeInspectionModal"
          >
            Close
          </button>
        </div>

      </div>
    </div>

    <!-- ── Owner Cancellation Explanation Modal ────────────────────── -->
    <div
      v-if="showOwnerCancelModal && cancelReservationTarget"
      class="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/60 p-4"
    >
      <div class="my-8 w-full max-w-lg border-2 border-[#202220] bg-[#fcfdfb] p-6 shadow-2xl sm:p-8">
        <!-- Header -->
        <div class="flex items-start justify-between border-b-2 border-[#202220] pb-4">
          <div>
            <div class="flex items-center gap-2">
              <span class="font-mono text-xs font-black uppercase tracking-wider text-[#b94d27]">
                Store Cancellation
              </span>
              <span class="bg-[#b94d27] px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">
                Reason Required
              </span>
            </div>
            <h2 class="mt-1 font-display text-xl font-black text-[#202220]">
              Cancel Reservation {{ cancelReservationTarget.id }}
            </h2>
            <p class="text-xs text-[#5f635f]">
              Customer: <strong class="text-[#202220]">{{ cancelReservationTarget.customerName || cancelReservationTarget.customer_name }}</strong>
              <span v-if="cancelReservationTarget.customerEmail || cancelReservationTarget.email">
                ({{ cancelReservationTarget.customerEmail || cancelReservationTarget.email }})
              </span>
            </p>
          </div>
          <button
            type="button"
            class="border border-[#202220] bg-white p-1 text-[#202220] transition-colors hover:bg-[#202220] hover:text-white"
            aria-label="Close"
            @click="closeOwnerCancelModal"
          >
            <svg class="size-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Quick Explanation Presets -->
        <div class="mt-4">
          <label class="mb-2 block text-xs font-bold uppercase tracking-wider text-[#5f635f]">
            Store Cancellation Presets:
          </label>
          <div class="flex flex-col gap-2">
            <button
              type="button"
              class="border border-[#cfd2ce] bg-white p-2.5 text-left text-xs font-semibold text-[#202220] transition-all hover:border-[#b94d27] hover:bg-[#fdf2ef]"
              :class="{ 'border-[#b94d27] bg-[#fdf2ef] font-bold text-[#b94d27]': cancellationReason === 'Selected custom color / material is currently unavailable' }"
              @click="cancellationReason = 'Selected custom color / material is currently unavailable'"
            >
              Selected custom color / material is currently unavailable
            </button>
            <button
              type="button"
              class="border border-[#cfd2ce] bg-white p-2.5 text-left text-xs font-semibold text-[#202220] transition-all hover:border-[#b94d27] hover:bg-[#fdf2ef]"
              :class="{ 'border-[#b94d27] bg-[#fdf2ef] font-bold text-[#b94d27]': cancellationReason === 'Silhouette size out of stock' }"
              @click="cancellationReason = 'Silhouette size out of stock'"
            >
              Silhouette size out of stock
            </button>
            <button
              type="button"
              class="border border-[#cfd2ce] bg-white p-2.5 text-left text-xs font-semibold text-[#202220] transition-all hover:border-[#b94d27] hover:bg-[#fdf2ef]"
              :class="{ 'border-[#b94d27] bg-[#fdf2ef] font-bold text-[#b94d27]': cancellationReason === 'Custom craftsmanship constraint' }"
              @click="cancellationReason = 'Custom craftsmanship constraint'"
            >
              Custom craftsmanship constraint
            </button>
          </div>
        </div>

        <!-- Custom write-in textarea -->
        <div class="mt-4">
          <label class="mb-1 block text-xs font-bold uppercase tracking-wider text-[#5f635f]">
            Additional Explanation / Custom Reason:
          </label>
          <textarea
            v-model="cancellationReason"
            rows="3"
            class="w-full border border-[#cfd2ce] bg-white p-3 text-xs text-[#202220] outline-none transition-colors focus:border-[#b94d27]"
            placeholder="Explain why this reservation is being cancelled (visible to customer)..."
          ></textarea>
        </div>

        <!-- Actions -->
        <div class="mt-6 flex flex-wrap items-center justify-end gap-3 border-t-2 border-[#202220] pt-4">
          <button
            type="button"
            class="border border-[#bfc3bf] bg-white px-4 py-2 text-xs font-bold text-[#5f635f] transition-colors hover:border-[#202220] hover:text-[#202220]"
            @click="closeOwnerCancelModal"
          >
            Keep Active
          </button>
          <button
            type="button"
            class="border border-[#b94d27] bg-[#b94d27] px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-[#963a20]"
            @click="submitOwnerCancellation"
          >
            Confirm Cancellation
          </button>
        </div>
      </div>
    </div>

    <!-- ── Restock Modal ───────────────────────────────────────── -->
    <div
      v-if="showRestockModal"
      class="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
    >
      <div class="w-full max-w-sm border border-[#292b2d] bg-white p-6 shadow-xl">
        <h3 class="font-display text-lg font-black text-[#202220]">
          Restock {{ restockTargetShoe?.name }}
        </h3>
        <p class="mt-1 text-xs text-[#5f635f]">
          Current inventory: <strong>{{ restockTargetShoe?.stock ?? 0 }} pairs</strong>.
        </p>

        <div class="mt-4">
          <label class="block text-xs font-bold text-[#404345]">
            Pairs to add to inventory:
            <input
              v-model.number="restockAmount"
              type="number"
              min="1"
              class="mt-1 h-10 w-full border border-[#cfd2ce] px-3 text-sm outline-none focus:border-[#245fa8]"
            />
          </label>
        </div>

        <div class="mt-6 flex justify-end gap-3">
          <button
            type="button"
            class="border border-[#bfc3bf] bg-white px-4 py-2 text-xs font-bold text-[#5f635f] hover:border-[#292b2d]"
            @click="showRestockModal = false"
          >
            Cancel
          </button>
          <button
            type="button"
            class="bg-[#245fa8] px-5 py-2 text-xs font-bold text-white hover:bg-[#184478]"
            @click="confirmRestock"
          >
            Update Stock
          </button>
        </div>
      </div>
    </div>



    <!-- ── Digital Receipt Voucher Modal ───────────────────────── -->
    <div
      v-if="showReceiptModal && selectedOrderForReceipt"
      class="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
    >
      <div class="w-full max-w-lg border border-[#292b2d] bg-[#fcfdfb] p-6 shadow-2xl sm:p-8">

        <!-- Printable Receipt Voucher Area -->
        <div id="printable-receipt" class="border border-[#cfd2ce] bg-white p-6 shadow-sm">
          <!-- Header -->
          <div class="border-b-2 border-[#202220] pb-4 text-center">
            <div class="mx-auto grid size-10 place-items-center bg-[#202220] text-lg font-black text-white">
              K
            </div>
            <h2 class="font-display mt-2 text-xl font-black tracking-[-0.03em] text-[#202220]">
              KickCraft Flagship Studio
            </h2>
            <p class="text-[11px] text-[#5f635f]">
              123 Craft Studio Way, Bonifacio Global City, Taguig
            </p>
            <p class="text-[10px] text-[#8e938e]">
              Official Custom Shoe Order &amp; Store Pickup Receipt
            </p>
          </div>

          <!-- Receipt Details Grid -->
          <div class="mt-4 grid grid-cols-2 gap-2 text-xs">
            <div>
              <p class="text-[10px] font-bold uppercase text-[#8e938e]">Receipt / Order #</p>
              <p class="font-mono font-bold text-[#202220]">{{ selectedOrderForReceipt.id }}</p>
            </div>
            <div class="text-right">
              <p class="text-[10px] font-bold uppercase text-[#8e938e]">Date Placed</p>
              <p class="font-semibold text-[#202220]">
                {{ new Date(selectedOrderForReceipt.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }}
              </p>
            </div>

            <div class="mt-2">
              <p class="text-[10px] font-bold uppercase text-[#8e938e]">Customer</p>
              <p class="font-bold text-[#202220]">{{ selectedOrderForReceipt.customerName }}</p>
              <p class="text-[11px] text-[#6a6e6a]">{{ selectedOrderForReceipt.customerEmail }}</p>
            </div>
            <div class="mt-2 text-right">
              <p class="text-[10px] font-bold uppercase text-[#8e938e]">Target Pickup Date</p>
              <p class="font-bold text-[#b94d27]">{{ selectedOrderForReceipt.pickupDate }}</p>
            </div>
          </div>

          <!-- Shoe Item Breakdown -->
          <div class="mt-5 border-t border-dashed border-[#cfd2ce] pt-4">
            <div class="flex items-start justify-between">
              <div>
                <h4 class="font-display font-black text-base text-[#202220]">
                  {{ selectedOrderForReceipt.shoeName }}
                </h4>
                <p class="text-xs text-[#5f635f]">
                  Size: <strong>US {{ selectedOrderForReceipt.size }}</strong> · Charm: <strong>{{ selectedOrderForReceipt.charmLabel || 'None' }}</strong>
                </p>
              </div>
              <p class="font-display text-lg font-black text-[#202220]">
                ₱{{ selectedOrderForReceipt.price?.toLocaleString() }}
              </p>
            </div>

            <!-- Customized Part Colors Swatches -->
            <div v-if="selectedOrderForReceipt.partColors && Object.keys(selectedOrderForReceipt.partColors).length" class="mt-3 bg-[#fcfdfb] p-3 border border-[#f1f3f0]">
              <p class="text-[10px] font-bold uppercase tracking-wider text-[#6a6e6a] mb-2">
                Custom Styled Parts:
              </p>
              <div class="grid grid-cols-2 gap-1.5 text-xs">
                <div
                  v-for="(color, partKey) in selectedOrderForReceipt.partColors"
                  :key="partKey"
                  class="flex items-center gap-1.5"
                >
                  <span
                    class="size-3 border border-black/20 shrink-0"
                    :style="{ backgroundColor: color.value }"
                  />
                  <span class="capitalize font-semibold text-[#404345]">{{ partKey.replace('-', ' ') }}:</span>
                  <span class="text-[#6a6e6a]">{{ color.name }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Total & Status Bar -->
          <div class="mt-5 flex items-center justify-between border-t-2 border-[#202220] pt-4">
            <div>
              <p class="text-[10px] font-bold uppercase text-[#8e938e]">Reservation Status</p>
              <span
                class="inline-block mt-0.5 px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wider text-white"
                :class="{
                  'bg-[#c97d1e]': selectedOrderForReceipt.status === 'pending',
                  'bg-[#245fa8]': selectedOrderForReceipt.status === 'approved',
                  'bg-[#3f7652]': selectedOrderForReceipt.status === 'ready' || selectedOrderForReceipt.status === 'completed',
                  'bg-[#b94d27]': selectedOrderForReceipt.status === 'cancelled',
                }"
              >
                {{ selectedOrderForReceipt.status }}
              </span>
            </div>

            <div class="text-right">
              <p class="text-[10px] font-bold uppercase text-[#8e938e]">Total Amount</p>
              <p class="font-display text-2xl font-black text-[#b94d27]">
                ₱{{ selectedOrderForReceipt.price?.toLocaleString() }}
              </p>
            </div>
          </div>

          <div class="mt-4 border-t border-dashed border-[#cfd2ce] pt-3 text-center text-[10px] text-[#8e938e]">
            Present this receipt at the KickCraft studio counter during store pickup.
          </div>
        </div>

        <!-- Action Controls (Excluded from print) -->
        <div class="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[#d9dcd8] pt-4">
          <div class="flex items-center gap-2">
            <span class="text-xs font-bold text-[#5f635f]">Status:</span>
            <button
              v-if="selectedOrderForReceipt.status === 'pending'"
              type="button"
              class="bg-[#245fa8] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[#1d4b88]"
              @click="handleOrderStatusChange(selectedOrderForReceipt.id, 'approved')"
            >
              Approve
            </button>
            <button
              v-if="selectedOrderForReceipt.status === 'approved'"
              type="button"
              class="bg-[#3f7652] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[#2a593a]"
              @click="handleOrderStatusChange(selectedOrderForReceipt.id, 'ready')"
            >
              Mark Ready
            </button>
            <button
              v-if="selectedOrderForReceipt.status === 'ready'"
              type="button"
              class="bg-[#3f7652] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[#2a593a]"
              @click="handleOrderStatusChange(selectedOrderForReceipt.id, 'completed')"
            >
              Complete Pickup
            </button>
            <button
              v-if="!['completed', 'cancelled'].includes(selectedOrderForReceipt.status)"
              type="button"
              class="border border-[#b94d27] bg-white px-2.5 py-1.5 text-xs font-bold text-[#b94d27] transition-all duration-150 hover:bg-[#fdf2ef]"
              @click="requestCancelOrder(selectedOrderForReceipt)"
            >
              Cancel Reservation
            </button>
          </div>

          <div class="flex items-center gap-2">
            <button
              type="button"
              class="border border-[#292b2d] bg-[#292b2d] px-4 py-1.5 text-xs font-bold text-white transition-all duration-150 hover:border-[#b94d27] hover:bg-[#b94d27]"
              @click="printReceipt"
            >
              Print Receipt
            </button>
            <button
              type="button"
              class="border border-[#bfc3bf] bg-white px-4 py-1.5 text-xs font-bold text-[#5f635f] hover:border-[#292b2d]"
              @click="showReceiptModal = false"
            >
              Close
            </button>
          </div>
        </div>

      </div>
    </div>

    <!-- ══════════════════════════════════════════════════════════ -->
    <!-- SECTION 3: ADMIN ACCOUNTS VIEW                             -->
    <!-- ══════════════════════════════════════════════════════════ -->
    <div v-else-if="adminSection === 'users'" class="space-y-6">
      <!-- Header -->
      <div class="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 class="font-display text-3xl font-black tracking-[-0.04em] text-[#202220]">
            Admin Accounts &amp; Access
          </h1>
          <p class="mt-1 text-sm text-[#5f635f]">
            Manage owner and administrator access to KickCraft operations.
          </p>
        </div>

        <div class="flex items-center gap-2">
          <button
            type="button"
            class="bg-[#292b2d] px-4 py-2 text-xs font-bold text-white shadow-sm transition-all duration-150 hover:bg-[#b94d27]"
            @click="openCreateUserModal"
          >
            Add Administrator
          </button>

          <button
            type="button"
            class="border border-[#bfc3bf] bg-white px-4 py-2 text-xs font-bold text-[#202220] shadow-sm transition-all duration-150 hover:border-[#202220] hover:bg-[#202220] hover:text-white"
            :disabled="usersLoading"
            @click="fetchUsers"
          >
            {{ usersLoading ? 'Refreshing…' : 'Refresh Accounts' }}
          </button>
        </div>
      </div>

      <!-- KPI Summary Cards -->
      <div class="grid gap-4 sm:grid-cols-3">
        <div class="border border-[#cfd2ce] bg-white p-4 shadow-sm">
          <p class="text-[11px] font-bold uppercase tracking-wider text-[#5f635f]">Total Admin Accounts</p>
          <p class="mt-1 font-display text-2xl font-black text-[#202220]">{{ userStats.total }}</p>
        </div>

        <div class="border border-[#cfd2ce] bg-white p-4 shadow-sm">
          <p class="text-[11px] font-bold uppercase tracking-wider text-[#3f7652]">Active</p>
          <p class="mt-1 font-display text-2xl font-black text-[#3f7652]">{{ userStats.active }}</p>
        </div>

        <div class="border border-[#cfd2ce] bg-white p-4 shadow-sm">
          <p class="text-[11px] font-bold uppercase tracking-wider text-[#c97d1e]">Archived</p>
          <p class="mt-1 font-display text-2xl font-black text-[#c97d1e]">{{ userStats.archived }}</p>
        </div>
      </div>

      <!-- Feedback Banner -->
      <div
        v-if="saveFeedback"
        class="flex items-center justify-between border border-[#3f7652] bg-[#f0f7f2] px-4 py-3 text-xs font-semibold text-[#3f7652]"
      >
        <span>{{ saveFeedback }}</span>
        <button type="button" class="font-bold underline" @click="saveFeedback = ''">Dismiss</button>
      </div>

      <!-- Error Banner -->
      <div
        v-if="usersError"
        class="flex items-center justify-between border border-[#b94d27] bg-[#fdf2ef] px-4 py-3 text-xs font-semibold text-[#b94d27]"
      >
        <span>{{ usersError }}</span>
        <button type="button" class="font-bold underline" :disabled="usersLoading" @click="fetchUsers">Retry</button>
      </div>

      <!-- Filter Controls & Search -->
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex flex-wrap gap-1 border border-[#cfd2ce] bg-white p-1 shadow-sm">
          <button
            type="button"
            class="px-3 py-1.5 text-xs font-bold transition-colors"
            :class="userRoleFilter === 'all'
              ? 'bg-[#292b2d] text-white'
              : 'text-[#5f635f] hover:text-[#202220]'"
            @click="userRoleFilter = 'all'"
          >
            All ({{ userStats.active }})
          </button>
          <button
            type="button"
            class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold transition-colors"
            :class="userRoleFilter === 'archived'
              ? 'bg-[#c97d1e] text-white'
              : 'text-[#5f635f] hover:text-[#202220]'"
            @click="userRoleFilter = 'archived'"
          >
            <span>Archived</span>
            <span
              v-if="userStats.archived > 0"
              class="rounded-full bg-[#fcfdfb] px-1.5 py-0.2 text-[10px] font-black text-[#c97d1e]"
            >
              {{ userStats.archived }}
            </span>
          </button>
        </div>

        <div class="relative w-full sm:w-72">
          <input
            v-model="userSearchQuery"
            type="text"
            placeholder="Search by name or email…"
            class="w-full border border-[#cfd2ce] bg-white px-3 py-2 text-xs text-[#202220] shadow-sm transition-colors focus:border-[#245fa8] focus:outline-none"
          />
          <button
            v-if="userSearchQuery"
            type="button"
            class="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-[#8e938e] hover:text-[#202220]"
            @click="userSearchQuery = ''"
          >
            ×
          </button>
        </div>
      </div>

      <!-- Users Table -->
      <div class="border border-[#cfd2ce] bg-white shadow-sm overflow-x-auto">
        <table class="w-full text-left text-xs text-[#202220]">
          <thead class="border-b border-[#cfd2ce] bg-[#f7f8f6] font-bold uppercase tracking-wider text-[#5f635f]">
            <tr>
              <th class="px-4 py-3">Administrator</th>
              <th class="px-4 py-3">Access</th>
              <th class="px-4 py-3">Registered</th>
              <th class="px-4 py-3">Status</th>
              <th class="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[#cfd2ce]">
            <tr
              v-for="u in filteredUsers"
              :key="u.id"
              class="transition-colors hover:bg-[#fcfdfb]"
              :class="{ 'bg-[#fdfaf5]': u.deleted_at }"
            >
              <!-- Profile -->
              <td class="px-4 py-3.5">
                <div class="flex items-center gap-3">
                  <div
                    class="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#b94d27] font-display text-xs font-black text-white"
                  >
                    {{ (u.name || u.email || 'U').charAt(0).toUpperCase() }}
                  </div>
                  <div>
                    <p class="font-bold text-[#202220]">
                      {{ u.name || 'Unnamed User' }}
                      <span
                        v-if="u.email === currentUser?.email"
                        class="ml-1.5 text-[10px] font-semibold text-[#3f7652]"
                      >
                        (You)
                      </span>
                    </p>
                    <p class="text-[11px] text-[#5f635f]">{{ u.email }}</p>
                  </div>
                </div>
              </td>

              <!-- Role -->
              <td class="px-4 py-3.5">
                <span
                  class="inline-block border border-[#b94d27] bg-[#fdf2ef] px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-[#b94d27]"
                >
                  Full Admin
                </span>
              </td>

              <!-- Registered -->
              <td class="px-4 py-3.5 text-[#5f635f]">
                {{ u.created_at ? new Date(u.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—' }}
              </td>

              <!-- Status -->
              <td class="px-4 py-3.5">
                <span
                  v-if="u.deleted_at"
                  class="inline-flex items-center gap-1 text-[11px] font-bold text-[#c97d1e]"
                >
                  <span class="size-1.5 rounded-full bg-[#c97d1e]" />
                  Archived
                </span>
                <span
                  v-else
                  class="inline-flex items-center gap-1 text-[11px] font-bold text-[#3f7652]"
                >
                  <span class="size-1.5 rounded-full bg-[#3f7652]" />
                  Active
                </span>
              </td>

              <!-- Actions -->
              <td class="px-4 py-3.5 text-right">
                <div class="flex items-center justify-end gap-2">
                  <!-- Self-account guard -->
                  <!-- Current Account Actions -->
                  <template v-if="u.email === currentUser?.email">
                    <button
                      type="button"
                      class="border border-[#cfd2ce] bg-white px-2.5 py-1 text-[11px] font-bold text-[#202220] transition-colors hover:border-[#245fa8] hover:bg-[#f0f4fa] hover:text-[#245fa8]"
                      @click="openEditUserModal(u)"
                    >
                      Edit Profile
                    </button>
                  </template>

                  <!-- Active User Actions -->
                  <template v-else-if="!u.deleted_at">
                    <button
                      type="button"
                      class="border border-[#cfd2ce] bg-white px-2.5 py-1 text-[11px] font-bold text-[#202220] transition-colors hover:border-[#245fa8] hover:bg-[#f0f4fa] hover:text-[#245fa8]"
                      @click="openEditUserModal(u)"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      class="border border-[#cfd2ce] bg-white px-2.5 py-1 text-[11px] font-bold text-[#5f635f] transition-colors hover:border-[#b94d27] hover:bg-[#fdf2ef] hover:text-[#b94d27]"
                      @click="deleteUser(u, 'soft')"
                    >
                      Archive
                    </button>
                  </template>

                  <!-- Archived User Actions -->
                  <template v-else>
                    <button
                      type="button"
                      class="border border-[#3f7652] bg-[#f0f7f2] px-2.5 py-1 text-[11px] font-bold text-[#3f7652] transition-colors hover:bg-[#3f7652] hover:text-white"
                      @click="restoreUser(u)"
                    >
                      Restore
                    </button>
                    <button
                      type="button"
                      class="border border-[#b94d27] bg-white px-2.5 py-1 text-[11px] font-bold text-[#b94d27] transition-colors hover:bg-[#b94d27] hover:text-white"
                      @click="deleteUser(u, 'hard')"
                    >
                      Delete Permanently
                    </button>
                  </template>
                </div>
              </td>
            </tr>

            <!-- Empty state -->
            <tr v-if="filteredUsers.length === 0">
              <td colspan="5" class="py-12 text-center text-sm text-[#5f635f]">
                <p class="font-bold text-[#202220]">No users found</p>
                <p class="mt-1 text-xs">
                  {{ userSearchQuery ? 'Try clearing your search keyword.' : 'No accounts match the selected filter.' }}
                </p>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ══════════════════════════════════════════════════════════ -->
    <!-- SECTION 4: SELLER MANAGEMENT                               -->
    <!-- ══════════════════════════════════════════════════════════ -->
    <section v-else-if="adminSection === 'sellers'" class="space-y-6">
      <!-- Header -->
      <div class="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <div class="flex items-center gap-2">
            <span class="font-mono text-xs font-black uppercase tracking-wider text-[#b94d27]">
              Marketplace Operations
            </span>
            <span
              v-if="pendingSellersCount > 0"
              class="border border-[#c97d1e] bg-[#fdf8f0] px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-[#c97d1e]"
            >
              {{ pendingSellersCount }} Pending Review
            </span>
          </div>
          <h1 class="mt-1 font-display text-3xl font-black tracking-[-0.04em] text-[#202220]">
            Seller Management
          </h1>
          <p class="mt-1 text-sm text-[#5f635f]">
            Review vendor registrations, inspect store applications, and manage seller permissions.
          </p>
        </div>

        <div class="flex items-center gap-3">
          <button
            type="button"
            class="border border-[#202220] bg-white px-4 py-2 text-xs font-bold text-[#202220] shadow-[2px_2px_0px_#202220] transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0 active:translate-y-0"
            @click="fetchSellers"
          >
            Refresh Sellers
          </button>
        </div>
      </div>

      <!-- Action Feedback / Error Banners -->
      <div
        v-if="sellerActionFeedback"
        class="border-2 border-[#3f7652] bg-[#f0f7f2] p-3 text-xs font-bold text-[#3f7652] shadow-[3px_3px_0px_#3f7652]"
      >
        {{ sellerActionFeedback }}
      </div>
      <div
        v-if="sellerActionError"
        class="border-2 border-[#b94d27] bg-[#fdf2ef] p-3 text-xs font-bold text-[#b94d27] shadow-[3px_3px_0px_#b94d27]"
      >
        {{ sellerActionError }}
      </div>

      <!-- Stat Badges Strip -->
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div class="border border-[#cfd2ce] bg-white p-4">
          <p class="text-[11px] font-bold uppercase tracking-wider text-[#6a6e6a]">Total Sellers</p>
          <p class="mt-1 text-2xl font-black text-[#202220]">{{ sellers.length }}</p>
        </div>
        <div class="border border-[#cfd2ce] bg-white p-4">
          <p class="text-[11px] font-bold uppercase tracking-wider text-[#c97d1e]">Pending Review</p>
          <p class="mt-1 text-2xl font-black text-[#c97d1e]">{{ pendingSellersCount }}</p>
        </div>
        <div class="border border-[#cfd2ce] bg-white p-4">
          <p class="text-[11px] font-bold uppercase tracking-wider text-[#3f7652]">Approved</p>
          <p class="mt-1 text-2xl font-black text-[#3f7652]">{{ approvedSellersCount }}</p>
        </div>
        <div class="border border-[#cfd2ce] bg-white p-4">
          <p class="text-[11px] font-bold uppercase tracking-wider text-[#b94d27]">Rejected</p>
          <p class="mt-1 text-2xl font-black text-[#b94d27]">{{ rejectedSellersCount }}</p>
        </div>
        <div class="border border-[#cfd2ce] bg-white p-4">
          <p class="text-[11px] font-bold uppercase tracking-wider text-[#5f635f]">Suspended</p>
          <p class="mt-1 text-2xl font-black text-[#5f635f]">{{ suspendedSellersCount }}</p>
        </div>
      </div>

      <!-- Controls: Filter Pills & Search -->
      <div class="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <!-- Filter Tabs -->
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors"
            :class="sellerStatusFilter === 'all'
              ? 'bg-[#202220] text-white shadow-[2px_2px_0px_#202220]'
              : 'border border-[#cfd2ce] bg-white text-[#5f635f] hover:border-[#202220] hover:text-[#202220]'"
            @click="sellerStatusFilter = 'all'"
          >
            All ({{ sellers.length }})
          </button>
          <button
            type="button"
            class="px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors"
            :class="sellerStatusFilter === 'pending'
              ? 'bg-[#c97d1e] text-white shadow-[2px_2px_0px_#c97d1e]'
              : 'border border-[#cfd2ce] bg-white text-[#5f635f] hover:border-[#c97d1e] hover:text-[#c97d1e]'"
            @click="sellerStatusFilter = 'pending'"
          >
            Pending ({{ pendingSellersCount }})
          </button>
          <button
            type="button"
            class="px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors"
            :class="sellerStatusFilter === 'approved'
              ? 'bg-[#3f7652] text-white shadow-[2px_2px_0px_#3f7652]'
              : 'border border-[#cfd2ce] bg-white text-[#5f635f] hover:border-[#3f7652] hover:text-[#3f7652]'"
            @click="sellerStatusFilter = 'approved'"
          >
            Approved ({{ approvedSellersCount }})
          </button>
          <button
            type="button"
            class="px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors"
            :class="sellerStatusFilter === 'rejected'
              ? 'bg-[#b94d27] text-white shadow-[2px_2px_0px_#b94d27]'
              : 'border border-[#cfd2ce] bg-white text-[#5f635f] hover:border-[#b94d27] hover:text-[#b94d27]'"
            @click="sellerStatusFilter = 'rejected'"
          >
            Rejected ({{ rejectedSellersCount }})
          </button>
          <button
            type="button"
            class="px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors"
            :class="sellerStatusFilter === 'suspended'
              ? 'bg-[#5f635f] text-white shadow-[2px_2px_0px_#5f635f]'
              : 'border border-[#cfd2ce] bg-white text-[#5f635f] hover:border-[#5f635f] hover:text-[#5f635f]'"
            @click="sellerStatusFilter = 'suspended'"
          >
            Suspended ({{ suspendedSellersCount }})
          </button>
        </div>

        <!-- Search Input -->
        <div class="relative w-full md:w-72">
          <input
            v-model="sellerSearch"
            type="text"
            placeholder="Search store, seller, email..."
            class="w-full border border-[#cfd2ce] bg-white px-3.5 py-2 pr-9 text-xs text-[#202220] placeholder-[#8e938e] focus:border-[#202220] focus:outline-none"
          />
          <button
            v-if="sellerSearch"
            type="button"
            class="absolute inset-y-0 right-0 flex items-center px-2.5 text-xs text-[#8e938e] hover:text-[#202220]"
            aria-label="Clear search"
            @click="sellerSearch = ''"
          >
            ✕
          </button>
        </div>
      </div>

      <!-- Sellers Table -->
      <div class="overflow-x-auto border-2 border-stone-900 bg-white shadow-[4px_4px_0px_#202220]">
        <table class="w-full text-left text-xs text-[#202220]">
          <thead class="border-b-2 border-stone-900 bg-[#f7f8f6] font-mono font-bold uppercase tracking-wider text-[#5f635f]">
            <tr>
              <th class="px-4 py-3">Store Name</th>
              <th class="px-4 py-3">Seller Name</th>
              <th class="px-4 py-3">Email</th>
              <th class="px-4 py-3">Status</th>
              <th class="px-4 py-3">Applied Date</th>
              <th class="px-4 py-3">Approved Date</th>
              <th class="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[#cfd2ce]">
            <tr
              v-for="seller in filteredSellers"
              :key="seller.id"
              class="transition-colors hover:bg-[#fcfdfb]"
            >
              <!-- Store Name & Description -->
              <td class="px-4 py-3.5">
                <p class="font-bold text-[#202220]">{{ seller.storeName || '—' }}</p>
                <p v-if="seller.storeDescription" class="mt-0.5 line-clamp-1 max-w-xs text-[11px] text-[#5f635f]">
                  {{ seller.storeDescription }}
                </p>
              </td>

              <!-- Seller Name -->
              <td class="px-4 py-3.5 font-medium text-[#202220]">
                {{ seller.name }}
              </td>

              <!-- Email -->
              <td class="px-4 py-3.5 font-mono text-[11px] text-[#5f635f]">
                {{ seller.email }}
              </td>

              <!-- Status Badge -->
              <td class="px-4 py-3.5">
                <span
                  v-if="seller.status === 'pending'"
                  class="inline-block border border-[#c97d1e] bg-[#fdf8f0] px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-[#c97d1e]"
                >
                  [ PENDING REVIEW ]
                </span>
                <span
                  v-else-if="seller.status === 'approved'"
                  class="inline-block border border-[#3f7652] bg-[#f0f7f2] px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-[#3f7652]"
                >
                  [ APPROVED ]
                </span>
                <span
                  v-else-if="seller.status === 'rejected'"
                  class="inline-block border border-[#b94d27] bg-[#fdf2ef] px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-[#b94d27]"
                >
                  [ REJECTED ]
                </span>
                <span
                  v-else-if="seller.status === 'suspended'"
                  class="inline-block border border-[#5f635f] bg-[#f2f3f1] px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-[#5f635f]"
                >
                  [ SUSPENDED ]
                </span>
                <span
                  v-else
                  class="inline-block border border-[#cfd2ce] bg-white px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-[#5f635f]"
                >
                  [ {{ (seller.status || 'UNKNOWN').toUpperCase() }} ]
                </span>
              </td>

              <!-- Applied Date -->
              <td class="px-4 py-3.5 font-mono text-[11px] text-[#5f635f]">
                {{ seller.createdAt ? new Date(seller.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—' }}
              </td>

              <!-- Approved Date -->
              <td class="px-4 py-3.5 font-mono text-[11px] text-[#5f635f]">
                {{ seller.approvedAt ? new Date(seller.approvedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—' }}
              </td>

              <!-- Actions -->
              <td class="px-4 py-3.5 text-right">
                <div class="flex items-center justify-end gap-1.5">
                  <!-- Pending Actions -->
                  <template v-if="seller.status === 'pending'">
                    <button
                      type="button"
                      class="border border-[#3f7652] bg-[#3f7652] px-2.5 py-1 text-[11px] font-bold text-white transition-colors hover:bg-[#2d583d] disabled:opacity-50"
                      :disabled="reviewLoading"
                      @click="submitSellerReview(seller.userId, 'approved', seller.adminNotes)"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      class="border border-[#b94d27] bg-white px-2.5 py-1 text-[11px] font-bold text-[#b94d27] transition-colors hover:bg-[#b94d27] hover:text-white disabled:opacity-50"
                      :disabled="reviewLoading"
                      @click="openSellerReviewModal(seller)"
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      class="border border-[#202220] bg-white px-2.5 py-1 text-[11px] font-bold text-[#202220] transition-colors hover:bg-[#202220] hover:text-white"
                      @click="openSellerReviewModal(seller)"
                    >
                      Review
                    </button>
                  </template>

                  <!-- Approved Actions -->
                  <template v-else-if="seller.status === 'approved'">
                    <button
                      type="button"
                      class="border border-[#5f635f] bg-white px-2.5 py-1 text-[11px] font-bold text-[#5f635f] transition-colors hover:border-[#b94d27] hover:bg-[#fdf2ef] hover:text-[#b94d27] disabled:opacity-50"
                      :disabled="reviewLoading"
                      @click="submitSellerReview(seller.userId, 'suspended', seller.adminNotes)"
                    >
                      Suspend
                    </button>
                    <button
                      type="button"
                      class="border border-[#202220] bg-white px-2.5 py-1 text-[11px] font-bold text-[#202220] transition-colors hover:bg-[#202220] hover:text-white"
                      @click="openSellerReviewModal(seller)"
                    >
                      Review
                    </button>
                  </template>

                  <!-- Suspended Actions -->
                  <template v-else-if="seller.status === 'suspended'">
                    <button
                      type="button"
                      class="border border-[#3f7652] bg-[#f0f7f2] px-2.5 py-1 text-[11px] font-bold text-[#3f7652] transition-colors hover:bg-[#3f7652] hover:text-white disabled:opacity-50"
                      :disabled="reviewLoading"
                      @click="submitSellerReview(seller.userId, 'approved', seller.adminNotes)"
                    >
                      Reactivate
                    </button>
                    <button
                      type="button"
                      class="border border-[#202220] bg-white px-2.5 py-1 text-[11px] font-bold text-[#202220] transition-colors hover:bg-[#202220] hover:text-white"
                      @click="openSellerReviewModal(seller)"
                    >
                      Review
                    </button>
                  </template>

                  <!-- Rejected Actions -->
                  <template v-else-if="seller.status === 'rejected'">
                    <button
                      type="button"
                      class="border border-[#3f7652] bg-[#f0f7f2] px-2.5 py-1 text-[11px] font-bold text-[#3f7652] transition-colors hover:bg-[#3f7652] hover:text-white disabled:opacity-50"
                      :disabled="reviewLoading"
                      @click="submitSellerReview(seller.userId, 'approved', seller.adminNotes)"
                    >
                      Reconsider
                    </button>
                    <button
                      type="button"
                      class="border border-[#202220] bg-white px-2.5 py-1 text-[11px] font-bold text-[#202220] transition-colors hover:bg-[#202220] hover:text-white"
                      @click="openSellerReviewModal(seller)"
                    >
                      Review
                    </button>
                  </template>

                  <!-- Other Actions -->
                  <template v-else>
                    <button
                      type="button"
                      class="border border-[#202220] bg-white px-2.5 py-1 text-[11px] font-bold text-[#202220] transition-colors hover:bg-[#202220] hover:text-white"
                      @click="openSellerReviewModal(seller)"
                    >
                      Review
                    </button>
                  </template>
                </div>
              </td>
            </tr>

            <!-- Empty state inside table -->
            <tr v-if="filteredSellers.length === 0">
              <td colspan="7" class="py-12 text-center text-[#5f635f]">
                <p class="font-mono text-sm font-bold uppercase tracking-wider text-[#202220]">No sellers found</p>
                <p class="mt-1 text-xs">
                  {{ sellerSearch ? 'No seller profiles match your search criteria.' : 'No seller applications in this status filter.' }}
                </p>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- ══════════════════════════════════════════════════════════ -->
    <!-- SECTION 6: PRODUCT MODERATION                            -->
    <!-- ══════════════════════════════════════════════════════════ -->
    <section v-else-if="adminSection === 'products'" class="space-y-6">
      <!-- Header -->
      <div class="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <div class="flex items-center gap-2">
            <span class="font-mono text-xs font-black uppercase tracking-wider text-[#b94d27]">
              Marketplace Catalog Operations
            </span>
            <span
              v-if="pendingProductsCount > 0"
              class="border border-[#c97d1e] bg-[#fdf8f0] px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-[#c97d1e]"
            >
              {{ pendingProductsCount }} Pending Review
            </span>
          </div>
          <h1 class="mt-1 font-display text-3xl font-black tracking-[-0.04em] text-[#202220]">
            Product Moderation
          </h1>
          <p class="mt-1 text-sm text-[#5f635f]">
            Review vendor shoe listings, inspect 3D assets, and manage marketplace catalog approval.
          </p>
        </div>

        <div class="flex items-center gap-3">
          <button
            type="button"
            class="border border-[#202220] bg-white px-4 py-2 text-xs font-bold text-[#202220] shadow-[2px_2px_0px_#202220] transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0 active:translate-y-0"
            @click="fetchProducts"
          >
            Refresh Products
          </button>
        </div>
      </div>

      <!-- Action Feedback / Error Banners -->
      <div
        v-if="productActionFeedback"
        class="border-2 border-[#3f7652] bg-[#f0f7f2] p-3 text-xs font-bold text-[#3f7652] shadow-[3px_3px_0px_#3f7652]"
      >
        {{ productActionFeedback }}
      </div>
      <div
        v-if="productActionError"
        class="border-2 border-[#b94d27] bg-[#fdf2ef] p-3 text-xs font-bold text-[#b94d27] shadow-[3px_3px_0px_#b94d27]"
      >
        {{ productActionError }}
      </div>

      <!-- Stat Badges Strip -->
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div class="border border-[#cfd2ce] bg-white p-4">
          <p class="text-[11px] font-bold uppercase tracking-wider text-[#6a6e6a]">Total Products</p>
          <p class="mt-1 text-2xl font-black text-[#202220]">{{ products.length }}</p>
        </div>
        <div class="border border-[#cfd2ce] bg-white p-4">
          <p class="text-[11px] font-bold uppercase tracking-wider text-[#c97d1e]">Pending Review</p>
          <p class="mt-1 text-2xl font-black text-[#c97d1e]">{{ pendingProductsCount }}</p>
        </div>
        <div class="border border-[#cfd2ce] bg-white p-4">
          <p class="text-[11px] font-bold uppercase tracking-wider text-[#3f7652]">Approved</p>
          <p class="mt-1 text-2xl font-black text-[#3f7652]">{{ approvedProductsCount }}</p>
        </div>
        <div class="border border-[#cfd2ce] bg-white p-4">
          <p class="text-[11px] font-bold uppercase tracking-wider text-[#b94d27]">Rejected</p>
          <p class="mt-1 text-2xl font-black text-[#b94d27]">{{ rejectedProductsCount }}</p>
        </div>
        <div class="border border-[#cfd2ce] bg-white p-4">
          <p class="text-[11px] font-bold uppercase tracking-wider text-[#5f635f]">Suspended</p>
          <p class="mt-1 text-2xl font-black text-[#5f635f]">{{ suspendedProductsCount }}</p>
        </div>
      </div>

      <!-- Controls: Filter Pills & Search -->
      <div class="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <!-- Filter Tabs -->
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors"
            :class="productStatusFilter === 'all'
              ? 'bg-[#202220] text-white shadow-[2px_2px_0px_#202220]'
              : 'border border-[#cfd2ce] bg-white text-[#5f635f] hover:border-[#202220] hover:text-[#202220]'"
            @click="productStatusFilter = 'all'"
          >
            All ({{ products.length }})
          </button>
          <button
            type="button"
            class="px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors"
            :class="productStatusFilter === 'pending'
              ? 'bg-[#c97d1e] text-white shadow-[2px_2px_0px_#c97d1e]'
              : 'border border-[#cfd2ce] bg-white text-[#5f635f] hover:border-[#c97d1e] hover:text-[#c97d1e]'"
            @click="productStatusFilter = 'pending'"
          >
            Pending ({{ pendingProductsCount }})
          </button>
          <button
            type="button"
            class="px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors"
            :class="productStatusFilter === 'approved'
              ? 'bg-[#3f7652] text-white shadow-[2px_2px_0px_#3f7652]'
              : 'border border-[#cfd2ce] bg-white text-[#5f635f] hover:border-[#3f7652] hover:text-[#3f7652]'"
            @click="productStatusFilter = 'approved'"
          >
            Approved ({{ approvedProductsCount }})
          </button>
          <button
            type="button"
            class="px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors"
            :class="productStatusFilter === 'rejected'
              ? 'bg-[#b94d27] text-white shadow-[2px_2px_0px_#b94d27]'
              : 'border border-[#cfd2ce] bg-white text-[#5f635f] hover:border-[#b94d27] hover:text-[#b94d27]'"
            @click="productStatusFilter = 'rejected'"
          >
            Rejected ({{ rejectedProductsCount }})
          </button>
          <button
            type="button"
            class="px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors"
            :class="productStatusFilter === 'suspended'
              ? 'bg-[#5f635f] text-white shadow-[2px_2px_0px_#5f635f]'
              : 'border border-[#cfd2ce] bg-white text-[#5f635f] hover:border-[#5f635f] hover:text-[#5f635f]'"
            @click="productStatusFilter = 'suspended'"
          >
            Suspended ({{ suspendedProductsCount }})
          </button>
        </div>

        <!-- Search Input -->
        <div class="relative w-full md:w-72">
          <input
            v-model="productSearch"
            type="text"
            placeholder="Search product, store, description..."
            class="w-full border border-[#cfd2ce] bg-white px-3.5 py-2 pr-9 text-xs text-[#202220] placeholder-[#8e938e] focus:border-[#202220] focus:outline-none"
          />
          <button
            v-if="productSearch"
            type="button"
            class="absolute inset-y-0 right-0 flex items-center px-2.5 text-xs text-[#8e938e] hover:text-[#202220]"
            aria-label="Clear search"
            @click="productSearch = ''"
          >
            ✕
          </button>
        </div>
      </div>

      <!-- Products Table -->
      <div class="overflow-x-auto border-2 border-stone-900 bg-white shadow-[4px_4px_0px_#202220]">
        <table class="w-full text-left text-xs text-[#202220]">
          <thead class="border-b-2 border-stone-900 bg-[#f7f8f6] font-mono font-bold uppercase tracking-wider text-[#5f635f]">
            <tr>
              <th class="px-4 py-3">Shoe / Product</th>
              <th class="px-4 py-3">Store Name</th>
              <th class="px-4 py-3">Method</th>
              <th class="px-4 py-3">Price</th>
              <th class="px-4 py-3">Status</th>
              <th class="px-4 py-3">Submitted</th>
              <th class="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[#cfd2ce]">
            <tr
              v-for="product in filteredProducts"
              :key="product.id"
              class="transition-colors hover:bg-[#fcfdfb]"
            >
              <!-- Shoe / Product Name & Description -->
              <td class="px-4 py-3.5">
                <div class="flex items-center gap-3">
                  <div class="relative size-10 shrink-0 overflow-hidden border border-[#cfd2ce] bg-[#f5f6f4]">
                    <img
                      v-if="product.thumbnailPath"
                      :src="product.thumbnailPath"
                      :alt="product.name"
                      class="size-full object-cover"
                      loading="lazy"
                    />
                    <div v-else class="flex size-full items-center justify-center font-mono text-[9px] text-[#8e938e]">
                      3D
                    </div>
                  </div>
                  <div class="min-w-0">
                    <p class="font-bold text-[#202220]">{{ product.name }}</p>
                    <p v-if="product.description" class="mt-0.5 line-clamp-1 max-w-xs text-[11px] text-[#5f635f]">
                      {{ product.description }}
                    </p>
                  </div>
                </div>
              </td>

              <!-- Store Name -->
              <td class="px-4 py-3.5 font-medium text-[#202220]">
                {{ product.storeName || '—' }}
              </td>

              <!-- Method -->
              <td class="px-4 py-3.5">
                <span
                  v-if="product.creationMethod === 'upload'"
                  class="inline-block border border-[#245fa8] bg-[#f0f4fa] px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-[#245fa8]"
                >
                  GLB UPLOAD
                </span>
                <span
                  v-else-if="product.creationMethod === 'ai'"
                  class="inline-block border border-[#8b5cf6] bg-[#f5f3ff] px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-[#8b5cf6]"
                >
                  AI 2D→3D
                </span>
                <span
                  v-else-if="product.creationMethod === 'template'"
                  class="inline-block border border-[#0d9488] bg-[#f0fdfa] px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-[#0d9488]"
                >
                  TEMPLATE
                </span>
                <span
                  v-else
                  class="inline-block border border-[#cfd2ce] bg-[#f7f8f6] px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-[#5f635f]"
                >
                  {{ (product.creationMethod || 'standard').toUpperCase() }}
                </span>
              </td>

              <!-- Price -->
              <td class="px-4 py-3.5 font-mono font-bold text-[#202220]">
                {{ product.formattedPrice || ('₱' + Number(product.price).toLocaleString('en-US')) }}
              </td>

              <!-- Status Badge -->
              <td class="px-4 py-3.5">
                <span
                  v-if="product.status === 'pending'"
                  class="inline-block border border-[#c97d1e] bg-[#fdf8f0] px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-[#c97d1e]"
                >
                  [ PENDING REVIEW ]
                </span>
                <span
                  v-else-if="product.status === 'approved'"
                  class="inline-block border border-[#3f7652] bg-[#f0f7f2] px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-[#3f7652]"
                >
                  [ APPROVED ]
                </span>
                <span
                  v-else-if="product.status === 'rejected'"
                  class="inline-block border border-[#b94d27] bg-[#fdf2ef] px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-[#b94d27]"
                >
                  [ REJECTED ]
                </span>
                <span
                  v-else-if="product.status === 'suspended'"
                  class="inline-block border border-[#5f635f] bg-[#f2f3f1] px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-[#5f635f]"
                >
                  [ SUSPENDED ]
                </span>
                <span
                  v-else-if="product.status === 'draft'"
                  class="inline-block border border-[#cfd2ce] bg-white px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-[#5f635f]"
                >
                  [ DRAFT ]
                </span>
                <span
                  v-else
                  class="inline-block border border-[#cfd2ce] bg-white px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-[#5f635f]"
                >
                  [ {{ (product.status || 'UNKNOWN').toUpperCase() }} ]
                </span>
              </td>

              <!-- Submitted Date -->
              <td class="px-4 py-3.5 font-mono text-[11px] text-[#5f635f]">
                {{ product.createdAt ? new Date(product.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—' }}
              </td>

              <!-- Actions -->
              <td class="px-4 py-3.5 text-right">
                <div class="flex items-center justify-end gap-1.5">
                  <!-- Pending Actions -->
                  <template v-if="product.status === 'pending'">
                    <button
                      type="button"
                      class="border border-[#3f7652] bg-[#3f7652] px-2.5 py-1 text-[11px] font-bold text-white transition-colors hover:bg-[#2d583d] disabled:opacity-50"
                      :disabled="isReviewingProduct"
                      @click="submitProductReview(product.id, 'approved', product.adminNotes)"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      class="border border-[#b94d27] bg-white px-2.5 py-1 text-[11px] font-bold text-[#b94d27] transition-colors hover:bg-[#b94d27] hover:text-white disabled:opacity-50"
                      :disabled="isReviewingProduct"
                      @click="openProductReviewModal(product)"
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      class="border border-[#202220] bg-white px-2.5 py-1 text-[11px] font-bold text-[#202220] transition-colors hover:bg-[#202220] hover:text-white"
                      @click="openProductReviewModal(product)"
                    >
                      Review Details
                    </button>
                  </template>

                  <!-- Approved Actions -->
                  <template v-else-if="product.status === 'approved'">
                    <button
                      type="button"
                      class="border border-[#5f635f] bg-white px-2.5 py-1 text-[11px] font-bold text-[#5f635f] transition-colors hover:border-[#b94d27] hover:bg-[#fdf2ef] hover:text-[#b94d27] disabled:opacity-50"
                      :disabled="isReviewingProduct"
                      @click="submitProductReview(product.id, 'suspended', product.adminNotes)"
                    >
                      Suspend
                    </button>
                    <button
                      type="button"
                      class="border border-[#202220] bg-white px-2.5 py-1 text-[11px] font-bold text-[#202220] transition-colors hover:bg-[#202220] hover:text-white"
                      @click="openProductReviewModal(product)"
                    >
                      Review Details
                    </button>
                  </template>

                  <!-- Suspended Actions -->
                  <template v-else-if="product.status === 'suspended'">
                    <button
                      type="button"
                      class="border border-[#3f7652] bg-[#f0f7f2] px-2.5 py-1 text-[11px] font-bold text-[#3f7652] transition-colors hover:bg-[#3f7652] hover:text-white disabled:opacity-50"
                      :disabled="isReviewingProduct"
                      @click="submitProductReview(product.id, 'approved', product.adminNotes)"
                    >
                      Reactivate
                    </button>
                    <button
                      type="button"
                      class="border border-[#202220] bg-white px-2.5 py-1 text-[11px] font-bold text-[#202220] transition-colors hover:bg-[#202220] hover:text-white"
                      @click="openProductReviewModal(product)"
                    >
                      Review Details
                    </button>
                  </template>

                  <!-- Rejected Actions -->
                  <template v-else-if="product.status === 'rejected'">
                    <button
                      type="button"
                      class="border border-[#3f7652] bg-[#f0f7f2] px-2.5 py-1 text-[11px] font-bold text-[#3f7652] transition-colors hover:bg-[#3f7652] hover:text-white disabled:opacity-50"
                      :disabled="isReviewingProduct"
                      @click="submitProductReview(product.id, 'approved', product.adminNotes)"
                    >
                      Reconsider
                    </button>
                    <button
                      type="button"
                      class="border border-[#202220] bg-white px-2.5 py-1 text-[11px] font-bold text-[#202220] transition-colors hover:bg-[#202220] hover:text-white"
                      @click="openProductReviewModal(product)"
                    >
                      Review Details
                    </button>
                  </template>

                  <!-- Other Actions (Draft, etc.) -->
                  <template v-else>
                    <button
                      type="button"
                      class="border border-[#202220] bg-white px-2.5 py-1 text-[11px] font-bold text-[#202220] transition-colors hover:bg-[#202220] hover:text-white"
                      @click="openProductReviewModal(product)"
                    >
                      Review Details
                    </button>
                  </template>
                </div>
              </td>
            </tr>

            <!-- Empty state inside table -->
            <tr v-if="filteredProducts.length === 0">
              <td colspan="7" class="py-12 text-center text-[#5f635f]">
                <p class="font-mono text-sm font-bold uppercase tracking-wider text-[#202220]">No products found</p>
                <p class="mt-1 text-xs">
                  {{ productSearch ? 'No product listings match your search criteria.' : 'No product listings in this status filter.' }}
                </p>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- ══════════════════════════════════════════════════════════ -->
    <!-- SECTION 7: MARKETPLACE ORDERS OVERSIGHT                    -->
    <!-- ══════════════════════════════════════════════════════════ -->
    <section v-else-if="adminSection === 'marketplace-orders'" class="space-y-6">
      <!-- Header -->
      <div class="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <div class="flex items-center gap-2">
            <span class="font-mono text-xs font-black uppercase tracking-wider text-[#b94d27]">
              Marketplace Operations
            </span>
            <span
              v-if="pendingMarketplaceOrdersCount > 0"
              class="border border-[#c97d1e] bg-[#fdf8f0] px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-[#c97d1e]"
            >
              {{ pendingMarketplaceOrdersCount }} Pending Pickup
            </span>
          </div>
          <h1 class="mt-1 font-display text-3xl font-black tracking-[-0.04em] text-[#202220]">
            Marketplace Orders Oversight
          </h1>
          <p class="mt-1 text-sm text-[#5f635f]">
            Oversee and manage all customer pickup orders across independent marketplace sellers.
          </p>
        </div>

        <div class="flex items-center gap-3">
          <button
            type="button"
            class="border border-[#202220] bg-white px-4 py-2 text-xs font-bold text-[#202220] shadow-[2px_2px_0px_#202220] transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0 active:translate-y-0"
            @click="fetchMarketplaceOrders"
          >
            Refresh Orders
          </button>
        </div>
      </div>

      <!-- Action Feedback / Error Banners -->
      <div
        v-if="marketplaceOrderFeedback"
        class="border-2 border-[#3f7652] bg-[#f0f7f2] p-3 text-xs font-bold text-[#3f7652] shadow-[3px_3px_0px_#3f7652]"
      >
        {{ marketplaceOrderFeedback }}
      </div>
      <div
        v-if="marketplaceOrderError"
        class="border-2 border-[#b94d27] bg-[#fdf2ef] p-3 text-xs font-bold text-[#b94d27] shadow-[3px_3px_0px_#b94d27]"
      >
        {{ marketplaceOrderError }}
      </div>

      <!-- Stat Badges Strip -->
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-6">
        <div class="border border-[#cfd2ce] bg-white p-4">
          <p class="text-[11px] font-bold uppercase tracking-wider text-[#6a6e6a]">Total Orders</p>
          <p class="mt-1 text-2xl font-black text-[#202220]">{{ marketplaceOrders.length }}</p>
        </div>
        <div class="border border-[#cfd2ce] bg-white p-4">
          <p class="text-[11px] font-bold uppercase tracking-wider text-[#c97d1e]">Pending</p>
          <p class="mt-1 text-2xl font-black text-[#c97d1e]">{{ pendingMarketplaceOrdersCount }}</p>
        </div>
        <div class="border border-[#cfd2ce] bg-white p-4">
          <p class="text-[11px] font-bold uppercase tracking-wider text-[#245fa8]">Confirmed</p>
          <p class="mt-1 text-2xl font-black text-[#245fa8]">{{ confirmedMarketplaceOrdersCount }}</p>
        </div>
        <div class="border border-[#cfd2ce] bg-white p-4">
          <p class="text-[11px] font-bold uppercase tracking-wider text-[#3f7652]">Ready for Pickup</p>
          <p class="mt-1 text-2xl font-black text-[#3f7652]">{{ readyMarketplaceOrdersCount }}</p>
        </div>
        <div class="border border-[#cfd2ce] bg-white p-4">
          <p class="text-[11px] font-bold uppercase tracking-wider text-[#202220]">Completed</p>
          <p class="mt-1 text-2xl font-black text-[#202220]">{{ completedMarketplaceOrdersCount }}</p>
        </div>
        <div class="border border-[#cfd2ce] bg-white p-4">
          <p class="text-[11px] font-bold uppercase tracking-wider text-[#b94d27]">Cancelled</p>
          <p class="mt-1 text-2xl font-black text-[#b94d27]">{{ cancelledMarketplaceOrdersCount }}</p>
        </div>
      </div>

      <!-- Controls: Filter Pills & Search -->
      <div class="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <!-- Filter Tabs -->
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors"
            :class="marketplaceOrderStatusFilter === 'all'
              ? 'bg-[#202220] text-white shadow-[2px_2px_0px_#202220]'
              : 'border border-[#cfd2ce] bg-white text-[#5f635f] hover:border-[#202220] hover:text-[#202220]'"
            @click="marketplaceOrderStatusFilter = 'all'"
          >
            All ({{ marketplaceOrders.length }})
          </button>
          <button
            type="button"
            class="px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors"
            :class="marketplaceOrderStatusFilter === 'pending'
              ? 'bg-[#c97d1e] text-white shadow-[2px_2px_0px_#c97d1e]'
              : 'border border-[#cfd2ce] bg-white text-[#5f635f] hover:border-[#c97d1e] hover:text-[#c97d1e]'"
            @click="marketplaceOrderStatusFilter = 'pending'"
          >
            Pending ({{ pendingMarketplaceOrdersCount }})
          </button>
          <button
            type="button"
            class="px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors"
            :class="marketplaceOrderStatusFilter === 'confirmed'
              ? 'bg-[#245fa8] text-white shadow-[2px_2px_0px_#245fa8]'
              : 'border border-[#cfd2ce] bg-white text-[#5f635f] hover:border-[#245fa8] hover:text-[#245fa8]'"
            @click="marketplaceOrderStatusFilter = 'confirmed'"
          >
            Confirmed ({{ confirmedMarketplaceOrdersCount }})
          </button>
          <button
            type="button"
            class="px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors"
            :class="marketplaceOrderStatusFilter === 'ready'
              ? 'bg-[#3f7652] text-white shadow-[2px_2px_0px_#3f7652]'
              : 'border border-[#cfd2ce] bg-white text-[#5f635f] hover:border-[#3f7652] hover:text-[#3f7652]'"
            @click="marketplaceOrderStatusFilter = 'ready'"
          >
            Ready ({{ readyMarketplaceOrdersCount }})
          </button>
          <button
            type="button"
            class="px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors"
            :class="marketplaceOrderStatusFilter === 'completed'
              ? 'bg-[#202220] text-white shadow-[2px_2px_0px_#202220]'
              : 'border border-[#cfd2ce] bg-white text-[#5f635f] hover:border-[#202220] hover:text-[#202220]'"
            @click="marketplaceOrderStatusFilter = 'completed'"
          >
            Completed ({{ completedMarketplaceOrdersCount }})
          </button>
          <button
            type="button"
            class="px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors"
            :class="marketplaceOrderStatusFilter === 'cancelled'
              ? 'bg-[#b94d27] text-white shadow-[2px_2px_0px_#b94d27]'
              : 'border border-[#cfd2ce] bg-white text-[#5f635f] hover:border-[#b94d27] hover:text-[#b94d27]'"
            @click="marketplaceOrderStatusFilter = 'cancelled'"
          >
            Cancelled ({{ cancelledMarketplaceOrdersCount }})
          </button>
        </div>

        <!-- Search Input -->
        <div class="relative w-full md:w-80">
          <input
            v-model="marketplaceOrderSearch"
            type="text"
            placeholder="Search order ID, store, buyer, product..."
            class="w-full border-2 border-[#202220] bg-white px-3.5 py-1.5 pr-8 text-xs font-medium text-[#202220] placeholder-[#8e938e] shadow-[2px_2px_0px_#202220] focus:border-[#b94d27] focus:outline-none"
          />
          <button
            v-if="marketplaceOrderSearch"
            type="button"
            class="absolute inset-y-0 right-0 flex items-center px-2.5 text-[#5f635f] hover:text-[#202220]"
            aria-label="Clear search"
            @click="marketplaceOrderSearch = ''"
          >
            &times;
          </button>
        </div>
      </div>

      <!-- Data Table -->
      <div class="overflow-x-auto border-2 border-stone-900 bg-white shadow-[4px_4px_0px_#202220]">
        <table class="w-full border-collapse text-left text-xs">
          <thead>
            <tr class="border-b-2 border-stone-900 bg-[#f7f8f6] font-mono text-[11px] font-black uppercase tracking-wider text-[#202220]">
              <th class="p-3">Order ID</th>
              <th class="p-3">Seller Store</th>
              <th class="p-3">Buyer Contact</th>
              <th class="p-3">Product</th>
              <th class="p-3">Total Price</th>
              <th class="p-3">Pickup Date</th>
              <th class="p-3">Status</th>
              <th class="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[#cfd2ce]">
            <tr
              v-for="order in filteredMarketplaceOrders"
              :key="order.id"
              class="transition-colors hover:bg-[#fcfdfb]"
            >
              <!-- Order ID -->
              <td class="p-3 font-mono font-bold text-[#202220]">
                #{{ order.id }}
              </td>

              <!-- Seller Store -->
              <td class="p-3">
                <span class="font-bold text-[#202220]">{{ order.sellerStoreName || '—' }}</span>
                <span class="block font-mono text-[10px] text-[#5f635f]">Seller #{{ order.sellerId }}</span>
              </td>

              <!-- Buyer Contact -->
              <td class="p-3">
                <p class="font-bold text-[#202220]">{{ order.buyerName }}</p>
                <p class="font-mono text-[11px] text-[#5f635f]">{{ order.buyerEmail }}</p>
              </td>

              <!-- Product -->
              <td class="p-3">
                <div class="flex items-center gap-2.5">
                  <div class="size-10 shrink-0 overflow-hidden border border-[#cfd2ce] bg-[#f7f8f6]">
                    <img
                      :src="order.productThumbnail || '/images/kickcraft-one-card.png'"
                      :alt="order.productName"
                      class="size-full object-cover"
                      onerror="this.src='/images/kickcraft-one-card.png'"
                    />
                  </div>
                  <div>
                    <span class="font-bold text-[#202220]">{{ order.productName }}</span>
                    <span v-if="order.customCharm && order.customCharm !== 'none'" class="block font-mono text-[10px] uppercase text-[#b94d27]">
                      Charm: {{ order.customCharm }}
                    </span>
                  </div>
                </div>
              </td>

              <!-- Total Price -->
              <td class="p-3 font-mono font-bold text-[#202220]">
                {{ order.formattedTotalPrice || ('₱' + Number(order.totalPrice || 0).toLocaleString()) }}
              </td>

              <!-- Pickup Date -->
              <td class="p-3 font-mono text-[#202220]">
                {{ order.pickupDate }}
              </td>

              <!-- Status badge -->
              <td class="p-3">
                <span
                  class="inline-block px-2 py-0.5 font-mono text-[10px] font-black uppercase tracking-wider"
                  :class="{
                    'bg-[#c97d1e] text-white': order.status === 'pending',
                    'bg-[#245fa8] text-white': order.status === 'confirmed',
                    'bg-[#3f7652] text-white': order.status === 'ready',
                    'bg-[#202220] text-white': order.status === 'completed',
                    'bg-[#b94d27] text-white': order.status === 'cancelled',
                  }"
                >
                  <template v-if="order.status === 'pending'">[ PENDING ]</template>
                  <template v-else-if="order.status === 'confirmed'">[ CONFIRMED ]</template>
                  <template v-else-if="order.status === 'ready'">[ READY FOR PICKUP ]</template>
                  <template v-else-if="order.status === 'completed'">[ COMPLETED ]</template>
                  <template v-else-if="order.status === 'cancelled'">[ CANCELLED ]</template>
                  <template v-else>[ {{ order.status.toUpperCase() }} ]</template>
                </span>
              </td>

              <!-- Actions -->
              <td class="p-3 text-right">
                <div class="flex items-center justify-end gap-1.5 font-mono">
                  <!-- Pending actions -->
                  <template v-if="order.status === 'pending'">
                    <button
                      type="button"
                      class="border border-[#245fa8] bg-[#f0f4fa] px-2.5 py-1 text-[11px] font-bold text-[#245fa8] transition-colors hover:bg-[#245fa8] hover:text-white disabled:opacity-50"
                      :disabled="isUpdatingOrder"
                      @click="submitOrderAction(order.id, 'confirmed')"
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      class="border border-[#b94d27] bg-[#fdf2ef] px-2.5 py-1 text-[11px] font-bold text-[#b94d27] transition-colors hover:bg-[#b94d27] hover:text-white disabled:opacity-50"
                      :disabled="isUpdatingOrder"
                      @click="submitOrderAction(order.id, 'cancelled')"
                    >
                      Cancel
                    </button>
                  </template>

                  <!-- Confirmed actions -->
                  <template v-else-if="order.status === 'confirmed'">
                    <button
                      type="button"
                      class="border border-[#3f7652] bg-[#f0f7f2] px-2.5 py-1 text-[11px] font-bold text-[#3f7652] transition-colors hover:bg-[#3f7652] hover:text-white disabled:opacity-50"
                      :disabled="isUpdatingOrder"
                      @click="submitOrderAction(order.id, 'ready')"
                    >
                      Mark Ready
                    </button>
                    <button
                      type="button"
                      class="border border-[#b94d27] bg-[#fdf2ef] px-2.5 py-1 text-[11px] font-bold text-[#b94d27] transition-colors hover:bg-[#b94d27] hover:text-white disabled:opacity-50"
                      :disabled="isUpdatingOrder"
                      @click="submitOrderAction(order.id, 'cancelled')"
                    >
                      Cancel
                    </button>
                  </template>

                  <!-- Ready actions -->
                  <template v-else-if="order.status === 'ready'">
                    <button
                      type="button"
                      class="border border-[#202220] bg-[#f7f8f6] px-2.5 py-1 text-[11px] font-bold text-[#202220] transition-colors hover:bg-[#202220] hover:text-white disabled:opacity-50"
                      :disabled="isUpdatingOrder"
                      @click="submitOrderAction(order.id, 'completed')"
                    >
                      Mark Completed
                    </button>
                  </template>

                  <!-- View details button for all statuses -->
                  <button
                    type="button"
                    class="border border-[#202220] bg-white px-2.5 py-1 text-[11px] font-bold text-[#202220] transition-colors hover:bg-[#202220] hover:text-white"
                    @click="openOrderReviewModal(order)"
                  >
                    View Details
                  </button>
                </div>
              </td>
            </tr>

            <!-- Empty state inside table -->
            <tr v-if="filteredMarketplaceOrders.length === 0">
              <td colspan="8" class="py-12 text-center text-[#5f635f]">
                <p class="font-mono text-sm font-bold uppercase tracking-wider text-[#202220]">No marketplace orders found</p>
                <p class="mt-1 text-xs">
                  {{ marketplaceOrderSearch ? 'No orders match your search criteria.' : 'No orders in this status filter.' }}
                </p>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- ── User Create / Edit Modal ────────────────────────────── -->
    <div
      v-if="showUserModal"
      class="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div
        class="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        @click="showUserModal = false"
      />
      <div class="relative w-full max-w-md border border-[#292b2d] bg-white p-6 shadow-2xl">
        <div class="flex items-center justify-between border-b border-[#cfd2ce] pb-3">
          <h2 class="font-display text-lg font-black text-[#202220]">
            {{ isEditingUser ? 'Edit Admin Account' : 'Create Admin Account' }}
          </h2>
          <button
            type="button"
            class="px-2.5 py-1 text-xs font-bold text-[#8e938e] transition-all duration-150 hover:bg-[#f1f3f0] hover:text-[#202220]"
            @click="showUserModal = false"
          >
            Close
          </button>
        </div>

        <form class="mt-4 space-y-4" @submit.prevent="handleSaveUser">
          <div
            v-if="userModalError"
            class="border border-[#b94d27] bg-[#fdf2ef] p-3 text-xs font-semibold text-[#b94d27]"
          >
            {{ userModalError }}
          </div>

          <div>
            <label class="block text-xs font-bold uppercase tracking-wider text-[#5f635f]">Full Name</label>
            <input
              v-model="userForm.name"
              type="text"
              required
              placeholder="e.g. Jordan Cruz"
              class="mt-1 w-full border border-[#cfd2ce] bg-white px-3 py-2 text-xs text-[#202220] focus:border-[#245fa8] focus:outline-none"
            />
          </div>

          <div>
            <label class="block text-xs font-bold uppercase tracking-wider text-[#5f635f]">Email Address</label>
            <input
              v-model="userForm.email"
              type="email"
              required
              placeholder="e.g. jordan@example.com"
              class="mt-1 w-full border border-[#cfd2ce] bg-white px-3 py-2 text-xs text-[#202220] focus:border-[#245fa8] focus:outline-none"
            />
          </div>

          <div>
            <label class="block text-xs font-bold uppercase tracking-wider text-[#5f635f]">
              {{ isEditingUser ? 'New Password (Optional)' : 'Password' }}
            </label>
            <div class="relative mt-1">
              <input
                v-model="userForm.password"
                :type="showUserPassword ? 'text' : 'password'"
                :placeholder="isEditingUser ? 'Leave blank to keep current password' : 'Minimum 6 characters'"
                class="w-full border border-[#cfd2ce] bg-white px-3 py-2 pr-10 text-xs text-[#202220] focus:border-[#245fa8] focus:outline-none"
              />
              <button
                type="button"
                class="absolute inset-y-0 right-0 flex items-center px-3 text-[#5f635f] hover:text-[#202220] focus-visible:outline-2 focus-visible:outline-[#245fa8]"
                :aria-label="showUserPassword ? 'Hide password' : 'Show password'"
                @click="showUserPassword = !showUserPassword"
              >
                <svg v-if="!showUserPassword" class="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                <svg v-else class="size-3.5 text-[#b94d27]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                </svg>
              </button>
            </div>
            <p v-if="isEditingUser" class="mt-1 text-[10px] text-[#8e938e]">
              Only enter a value if you want to reset this administrator's password.
            </p>
          </div>

          <div class="mt-6 flex items-center justify-end gap-3 border-t border-[#cfd2ce] pt-4">
            <button
              type="button"
              class="border border-[#cfd2ce] bg-white px-4 py-2 text-xs font-bold text-[#5f635f] hover:border-[#292b2d] hover:text-[#202220]"
              @click="showUserModal = false"
            >
              Cancel
            </button>
            <button
              type="submit"
              class="bg-[#292b2d] px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#b94d27]"
              :disabled="userModalSaving"
            >
              {{ userModalSaving ? 'Saving…' : (isEditingUser ? 'Save Changes' : 'Create Administrator') }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- ── Seller Review Modal ────────────────────────────────────── -->
    <div
      v-if="selectedSellerForReview"
      class="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/60 p-4"
    >
      <div class="my-8 w-full max-w-xl border-2 border-stone-900 bg-[#fcfdfb] p-6 shadow-[6px_6px_0px_#202220] sm:p-8">
        <!-- Modal Header -->
        <div class="flex items-start justify-between border-b-2 border-stone-900 pb-4">
          <div>
            <div class="flex items-center gap-2">
              <span class="font-mono text-xs font-black uppercase tracking-wider text-[#b94d27]">
                Seller Review
              </span>
              <span
                class="px-2 py-0.5 font-mono text-[10px] font-black uppercase tracking-wider"
                :class="{
                  'bg-[#c97d1e] text-white': selectedSellerForReview.status === 'pending',
                  'bg-[#3f7652] text-white': selectedSellerForReview.status === 'approved',
                  'bg-[#b94d27] text-white': selectedSellerForReview.status === 'rejected',
                  'bg-[#5f635f] text-white': selectedSellerForReview.status === 'suspended',
                }"
              >
                {{ (selectedSellerForReview.status || 'unknown').toUpperCase() }}
              </span>
            </div>
            <h2 class="mt-1 font-display text-xl font-black text-[#202220]">
              {{ selectedSellerForReview.storeName || 'Unnamed Store' }}
            </h2>
            <p class="text-xs text-[#5f635f]">
              Applicant: <strong class="text-[#202220]">{{ selectedSellerForReview.name }}</strong>
              <span class="font-mono">({{ selectedSellerForReview.email }})</span>
            </p>
          </div>
          <button
            type="button"
            class="border border-stone-900 bg-white p-1 text-[#202220] transition-colors hover:bg-stone-900 hover:text-white"
            aria-label="Close"
            @click="closeSellerReviewModal"
          >
            <svg class="size-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Modal Body Details -->
        <div class="mt-4 space-y-4">
          <!-- Details Grid -->
          <div class="grid grid-cols-2 gap-3 border border-[#cfd2ce] bg-white p-3 font-mono text-xs">
            <div>
              <span class="block text-[10px] uppercase tracking-wider text-[#5f635f]">User ID</span>
              <span class="font-bold text-[#202220]">#{{ selectedSellerForReview.userId }}</span>
            </div>
            <div>
              <span class="block text-[10px] uppercase tracking-wider text-[#5f635f]">Registration Date</span>
              <span class="font-bold text-[#202220]">
                {{ selectedSellerForReview.createdAt ? new Date(selectedSellerForReview.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—' }}
              </span>
            </div>
            <div>
              <span class="block text-[10px] uppercase tracking-wider text-[#5f635f]">Current Status</span>
              <span class="font-bold uppercase text-[#202220]">{{ selectedSellerForReview.status }}</span>
            </div>
            <div>
              <span class="block text-[10px] uppercase tracking-wider text-[#5f635f]">Approval Date</span>
              <span class="font-bold text-[#202220]">
                {{ selectedSellerForReview.approvedAt ? new Date(selectedSellerForReview.approvedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—' }}
              </span>
            </div>
          </div>

          <!-- Store Description -->
          <div>
            <label class="block text-xs font-bold uppercase tracking-wider text-[#5f635f]">
              Store Description
            </label>
            <div class="mt-1 border border-[#cfd2ce] bg-white p-3 text-xs text-[#202220]">
              {{ selectedSellerForReview.storeDescription || 'No description provided by the applicant.' }}
            </div>
          </div>

          <!-- Existing Admin Notes if any -->
          <div v-if="selectedSellerForReview.adminNotes">
            <label class="block text-xs font-bold uppercase tracking-wider text-[#5f635f]">
              Previous Admin Notes
            </label>
            <div class="mt-1 border border-[#cfd2ce] bg-[#f7f8f6] p-2.5 font-mono text-xs text-[#5f635f]">
              {{ selectedSellerForReview.adminNotes }}
            </div>
          </div>

          <!-- Admin Notes Input -->
          <div>
            <label class="mb-1 block text-xs font-bold uppercase tracking-wider text-[#5f635f]">
              Admin Notes &amp; Decision Feedback
            </label>
            <textarea
              v-model="reviewNotes"
              rows="3"
              maxlength="1000"
              class="w-full border border-[#cfd2ce] bg-white p-3 text-xs text-[#202220] focus:border-[#202220] focus:outline-none"
              placeholder="Enter internal review notes or feedback for this seller application (max 1000 characters)..."
            />
            <p class="mt-1 text-right font-mono text-[10px] text-[#8e938e]">
              {{ reviewNotes.length }} / 1000 characters
            </p>
          </div>

          <!-- Error in modal -->
          <div
            v-if="sellerActionError"
            class="border border-[#b94d27] bg-[#fdf2ef] p-2.5 text-xs font-bold text-[#b94d27]"
          >
            {{ sellerActionError }}
          </div>
        </div>

        <!-- Modal Actions -->
        <div class="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[#cfd2ce] pt-4">
          <button
            type="button"
            class="border border-[#cfd2ce] bg-white px-4 py-2 text-xs font-bold text-[#5f635f] hover:border-[#202220] hover:text-[#202220]"
            :disabled="reviewLoading"
            @click="closeSellerReviewModal"
          >
            Close
          </button>

          <div class="flex flex-wrap items-center gap-2">
            <button
              v-if="selectedSellerForReview.status !== 'suspended'"
              type="button"
              class="border border-[#5f635f] bg-white px-3.5 py-2 text-xs font-bold uppercase tracking-wider text-[#5f635f] transition-colors hover:border-stone-900 hover:bg-[#f2f3f1] hover:text-stone-900 disabled:opacity-50"
              :disabled="reviewLoading"
              @click="submitSellerReview(selectedSellerForReview.userId, 'suspended', reviewNotes)"
            >
              Suspend Account
            </button>

            <button
              v-if="selectedSellerForReview.status !== 'rejected'"
              type="button"
              class="border border-[#b94d27] bg-[#fdf2ef] px-3.5 py-2 text-xs font-bold uppercase tracking-wider text-[#b94d27] transition-colors hover:bg-[#b94d27] hover:text-white disabled:opacity-50"
              :disabled="reviewLoading"
              @click="submitSellerReview(selectedSellerForReview.userId, 'rejected', reviewNotes)"
            >
              Reject Application
            </button>

            <button
              v-if="selectedSellerForReview.status !== 'approved'"
              type="button"
              class="bg-[#3f7652] px-4 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-[2px_2px_0px_#202220] transition-colors hover:bg-[#2d583d] disabled:opacity-50"
              :disabled="reviewLoading"
              @click="submitSellerReview(selectedSellerForReview.userId, 'approved', reviewNotes)"
            >
              Approve Seller
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Product Review Modal ───────────────────────────────────── -->
    <div
      v-if="selectedProductForReview"
      class="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/60 p-4"
    >
      <div class="my-8 w-full max-w-xl border-2 border-stone-900 bg-[#fcfdfb] p-6 shadow-[6px_6px_0px_#202220] sm:p-8">
        <!-- Modal Header -->
        <div class="flex items-start justify-between border-b-2 border-stone-900 pb-4">
          <div>
            <div class="flex items-center gap-2">
              <span class="font-mono text-xs font-black uppercase tracking-wider text-[#b94d27]">
                Product Moderation
              </span>
              <span
                class="px-2 py-0.5 font-mono text-[10px] font-black uppercase tracking-wider"
                :class="{
                  'bg-[#c97d1e] text-white': selectedProductForReview.status === 'pending',
                  'bg-[#3f7652] text-white': selectedProductForReview.status === 'approved',
                  'bg-[#b94d27] text-white': selectedProductForReview.status === 'rejected',
                  'bg-[#5f635f] text-white': selectedProductForReview.status === 'suspended',
                  'bg-[#cfd2ce] text-[#202220]': selectedProductForReview.status === 'draft',
                }"
              >
                {{ (selectedProductForReview.status || 'unknown').toUpperCase() }}
              </span>
            </div>
            <h2 class="mt-1 font-display text-xl font-black text-[#202220]">
              {{ selectedProductForReview.name }}
            </h2>
            <p class="text-xs text-[#5f635f]">
              Store: <strong class="text-[#202220]">{{ selectedProductForReview.storeName || '—' }}</strong>
              <span class="font-mono">(Seller #{{ selectedProductForReview.sellerId }})</span>
            </p>
          </div>
          <button
            type="button"
            class="border border-stone-900 bg-white p-1 text-[#202220] transition-colors hover:bg-stone-900 hover:text-white"
            aria-label="Close"
            @click="closeProductReviewModal"
          >
            <svg class="size-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Modal Body Details -->
        <div class="mt-4 space-y-4">
          <!-- Details Grid -->
          <div class="grid grid-cols-2 gap-3 border border-[#cfd2ce] bg-white p-3 font-mono text-xs">
            <div>
              <span class="block text-[10px] uppercase tracking-wider text-[#5f635f]">Product ID</span>
              <span class="font-bold text-[#202220]">#{{ selectedProductForReview.id }}</span>
            </div>
            <div>
              <span class="block text-[10px] uppercase tracking-wider text-[#5f635f]">Creation Method</span>
              <span class="font-bold text-[#202220] uppercase">{{ selectedProductForReview.creationMethod }}</span>
            </div>
            <div>
              <span class="block text-[10px] uppercase tracking-wider text-[#5f635f]">Price</span>
              <span class="font-bold text-[#202220]">{{ selectedProductForReview.formattedPrice || ('₱' + selectedProductForReview.price) }}</span>
            </div>
            <div>
              <span class="block text-[10px] uppercase tracking-wider text-[#5f635f]">Stock</span>
              <span class="font-bold text-[#202220]">{{ selectedProductForReview.stock }} units</span>
            </div>
            <div>
              <span class="block text-[10px] uppercase tracking-wider text-[#5f635f]">Current Status</span>
              <span class="font-bold uppercase text-[#202220]">{{ selectedProductForReview.status }}</span>
            </div>
            <div>
              <span class="block text-[10px] uppercase tracking-wider text-[#5f635f]">Submission Date</span>
              <span class="font-bold text-[#202220]">
                {{ selectedProductForReview.createdAt ? new Date(selectedProductForReview.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—' }}
              </span>
            </div>
            <div class="col-span-2">
              <span class="block text-[10px] uppercase tracking-wider text-[#5f635f]">Base Model / GLB Path</span>
              <span class="break-all font-mono text-[11px] text-[#202220]">{{ selectedProductForReview.glbPath || '—' }}</span>
            </div>
            <div class="col-span-2" v-if="selectedProductForReview.sizesAvailable && selectedProductForReview.sizesAvailable.length">
              <span class="block text-[10px] uppercase tracking-wider text-[#5f635f]">Available Sizes</span>
              <span class="font-mono text-xs font-bold text-[#202220]">{{ selectedProductForReview.sizesAvailable.join(', ') }}</span>
            </div>
          </div>

          <!-- Product Description -->
          <div>
            <label class="block text-xs font-bold uppercase tracking-wider text-[#5f635f]">
              Product Description
            </label>
            <div class="mt-1 border border-[#cfd2ce] bg-white p-3 text-xs text-[#202220]">
              {{ selectedProductForReview.description || 'No description provided by the seller.' }}
            </div>
          </div>

          <!-- Existing Admin Notes if any -->
          <div v-if="selectedProductForReview.adminNotes">
            <label class="block text-xs font-bold uppercase tracking-wider text-[#5f635f]">
              Previous Moderation Notes
            </label>
            <div class="mt-1 border border-[#cfd2ce] bg-[#f7f8f6] p-2.5 font-mono text-xs text-[#5f635f]">
              {{ selectedProductForReview.adminNotes }}
            </div>
          </div>

          <!-- Admin Notes Input -->
          <div>
            <label class="mb-1 block text-xs font-bold uppercase tracking-wider text-[#5f635f]">
              Admin Notes &amp; Moderation Feedback
            </label>
            <textarea
              v-model="productReviewNotes"
              rows="3"
              maxlength="1000"
              class="w-full border border-[#cfd2ce] bg-white p-3 text-xs text-[#202220] focus:border-[#202220] focus:outline-none"
              placeholder="Enter internal moderation notes or feedback for this product listing (max 1000 characters)..."
            />
            <p class="mt-1 text-right font-mono text-[10px] text-[#8e938e]">
              {{ productReviewNotes.length }} / 1000 characters
            </p>
          </div>

          <!-- Error in modal -->
          <div
            v-if="productActionError"
            class="border border-[#b94d27] bg-[#fdf2ef] p-2.5 text-xs font-bold text-[#b94d27]"
          >
            {{ productActionError }}
          </div>
        </div>

        <!-- Modal Actions -->
        <div class="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[#cfd2ce] pt-4">
          <button
            type="button"
            class="border border-[#cfd2ce] bg-white px-4 py-2 text-xs font-bold text-[#5f635f] hover:border-[#202220] hover:text-[#202220]"
            :disabled="isReviewingProduct"
            @click="closeProductReviewModal"
          >
            Cancel
          </button>

          <div class="flex flex-wrap items-center gap-2">
            <button
              v-if="selectedProductForReview.status !== 'suspended'"
              type="button"
              class="border border-[#5f635f] bg-white px-3.5 py-2 text-xs font-bold uppercase tracking-wider text-[#5f635f] transition-colors hover:border-stone-900 hover:bg-[#f2f3f1] hover:text-stone-900 disabled:opacity-50"
              :disabled="isReviewingProduct"
              @click="submitProductReview(selectedProductForReview.id, 'suspended', productReviewNotes)"
            >
              Suspend Product
            </button>

            <button
              v-if="selectedProductForReview.status !== 'rejected'"
              type="button"
              class="border border-[#b94d27] bg-[#fdf2ef] px-3.5 py-2 text-xs font-bold uppercase tracking-wider text-[#b94d27] transition-colors hover:bg-[#b94d27] hover:text-white disabled:opacity-50"
              :disabled="isReviewingProduct"
              @click="submitProductReview(selectedProductForReview.id, 'rejected', productReviewNotes)"
            >
              Reject Listing
            </button>

            <button
              v-if="selectedProductForReview.status !== 'approved'"
              type="button"
              class="bg-[#3f7652] px-4 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-[2px_2px_0px_#202220] transition-colors hover:bg-[#2d583d] disabled:opacity-50"
              :disabled="isReviewingProduct"
              @click="submitProductReview(selectedProductForReview.id, 'approved', productReviewNotes)"
            >
              Approve Listing
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Marketplace Order Review / Details Modal ────────────────── -->
    <div
      v-if="selectedOrderForReview"
      class="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/60 p-4"
    >
      <div class="my-8 w-full max-w-xl border-2 border-stone-900 bg-[#fcfdfb] p-6 shadow-[6px_6px_0px_#202220] sm:p-8">
        <!-- Modal Header -->
        <div class="flex items-start justify-between border-b-2 border-stone-900 pb-4">
          <div>
            <div class="flex items-center gap-2">
              <span class="font-mono text-xs font-black uppercase tracking-wider text-[#b94d27]">
                Marketplace Order Details
              </span>
              <span
                class="px-2 py-0.5 font-mono text-[10px] font-black uppercase tracking-wider"
                :class="{
                  'bg-[#c97d1e] text-white': selectedOrderForReview.status === 'pending',
                  'bg-[#245fa8] text-white': selectedOrderForReview.status === 'confirmed',
                  'bg-[#3f7652] text-white': selectedOrderForReview.status === 'ready',
                  'bg-[#202220] text-white': selectedOrderForReview.status === 'completed',
                  'bg-[#b94d27] text-white': selectedOrderForReview.status === 'cancelled',
                }"
              >
                [{{ (selectedOrderForReview.status || 'unknown').toUpperCase() }}]
              </span>
            </div>
            <h2 class="mt-1 font-display text-xl font-black text-[#202220]">
              Order #{{ selectedOrderForReview.id }}
            </h2>
            <p class="text-xs text-[#5f635f]">
              Placed by <strong class="text-[#202220]">{{ selectedOrderForReview.buyerName }}</strong>
              <span class="font-mono">({{ selectedOrderForReview.buyerEmail }})</span>
            </p>
          </div>
          <button
            type="button"
            class="border border-stone-900 bg-white p-1 text-[#202220] transition-colors hover:bg-stone-900 hover:text-white"
            aria-label="Close"
            @click="closeOrderReviewModal"
          >
            <svg class="size-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Modal Body Details -->
        <div class="mt-4 space-y-4">
          <!-- Details Grid -->
          <div class="grid grid-cols-2 gap-3 border border-[#cfd2ce] bg-white p-3 font-mono text-xs">
            <div>
              <span class="block text-[10px] uppercase tracking-wider text-[#5f635f]">Seller Store</span>
              <span class="font-bold text-[#202220]">{{ selectedOrderForReview.sellerStoreName || '—' }}</span>
              <span class="block text-[10px] text-[#5f635f]">Seller ID #{{ selectedOrderForReview.sellerId }}</span>
            </div>
            <div>
              <span class="block text-[10px] uppercase tracking-wider text-[#5f635f]">Pickup Date</span>
              <span class="font-bold text-[#202220]">{{ selectedOrderForReview.pickupDate || '—' }}</span>
            </div>
            <div>
              <span class="block text-[10px] uppercase tracking-wider text-[#5f635f]">Product</span>
              <span class="font-bold text-[#202220]">{{ selectedOrderForReview.productName }}</span>
              <span class="block text-[10px] text-[#5f635f]">Product #{{ selectedOrderForReview.productId }}</span>
            </div>
            <div>
              <span class="block text-[10px] uppercase tracking-wider text-[#5f635f]">Total Price</span>
              <span class="font-bold text-[#202220]">{{ selectedOrderForReview.formattedTotalPrice || ('₱' + selectedOrderForReview.totalPrice) }}</span>
            </div>
            <div class="col-span-2">
              <span class="block text-[10px] uppercase tracking-wider text-[#5f635f]">Order Placed At</span>
              <span class="text-[#202220]">
                {{ selectedOrderForReview.createdAt ? new Date(selectedOrderForReview.createdAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '—' }}
              </span>
            </div>
          </div>

          <!-- Product Snapshot & Charm -->
          <div class="flex items-center gap-3 border border-[#cfd2ce] bg-[#f7f8f6] p-3">
            <div class="size-14 shrink-0 overflow-hidden border border-[#cfd2ce] bg-white">
              <img
                :src="selectedOrderForReview.productThumbnail || '/images/kickcraft-one-card.png'"
                :alt="selectedOrderForReview.productName"
                class="size-full object-cover"
                onerror="this.src='/images/kickcraft-one-card.png'"
              />
            </div>
            <div class="flex-1 text-xs">
              <p class="font-bold text-[#202220]">{{ selectedOrderForReview.productName }}</p>
              <p class="font-mono text-[#5f635f]">Unit Price: {{ selectedOrderForReview.formattedUnitPrice || ('₱' + selectedOrderForReview.unitPrice) }}</p>
              <div class="mt-1 flex items-center gap-2">
                <span class="font-mono text-[10px] uppercase tracking-wider text-[#5f635f]">Charm:</span>
                <span class="font-mono text-[11px] font-bold uppercase text-[#b94d27]">
                  {{ selectedOrderForReview.customCharm || 'None' }}
                </span>
              </div>
            </div>
          </div>

          <!-- Custom Colorway Swatches Breakdown -->
          <div v-if="selectedOrderForReview.customColors && Object.keys(selectedOrderForReview.customColors).length">
            <label class="block text-xs font-bold uppercase tracking-wider text-[#5f635f]">
              Custom Colors Breakdown
            </label>
            <div class="mt-1.5 flex flex-wrap gap-2">
              <div
                v-for="(colorVal, partKey) in selectedOrderForReview.customColors"
                :key="partKey"
                class="flex items-center gap-1.5 border border-[#cfd2ce] bg-white px-2.5 py-1 text-xs"
              >
                <span
                  class="size-3.5 border border-stone-400"
                  :style="{ backgroundColor: typeof colorVal === 'object' ? (colorVal.value || colorVal.hex || '#ccc') : colorVal }"
                />
                <span class="font-mono text-[11px] font-bold uppercase text-[#202220]">{{ partKey }}:</span>
                <span class="font-mono text-[11px] text-[#5f635f]">
                  {{ typeof colorVal === 'object' ? (colorVal.name || colorVal.value || '') : colorVal }}
                </span>
              </div>
            </div>
          </div>

          <!-- Existing Order Notes -->
          <div v-if="selectedOrderForReview.notes">
            <label class="block text-xs font-bold uppercase tracking-wider text-[#5f635f]">
              Previous Order Notes
            </label>
            <div class="mt-1 border border-[#cfd2ce] bg-[#f7f8f6] p-2.5 font-mono text-xs text-[#5f635f]">
              {{ selectedOrderForReview.notes }}
            </div>
          </div>

          <!-- Notes / Update notes input -->
          <div>
            <label class="mb-1 block text-xs font-bold uppercase tracking-wider text-[#5f635f]">
              Order Notes / Fulfillment Remarks
            </label>
            <textarea
              v-model="orderReviewNotes"
              rows="3"
              maxlength="1000"
              class="w-full border border-[#cfd2ce] bg-white p-3 text-xs text-[#202220] focus:border-[#202220] focus:outline-none"
              placeholder="Enter fulfillment remarks or customer notes..."
            />
            <p class="mt-1 text-right font-mono text-[10px] text-[#8e938e]">
              {{ orderReviewNotes.length }} / 1000 characters
            </p>
          </div>

          <!-- Error in modal -->
          <div
            v-if="marketplaceOrderError"
            class="border border-[#b94d27] bg-[#fdf2ef] p-2.5 text-xs font-bold text-[#b94d27]"
          >
            {{ marketplaceOrderError }}
          </div>
        </div>

        <!-- Modal Actions -->
        <div class="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[#cfd2ce] pt-4">
          <button
            type="button"
            class="border border-[#cfd2ce] bg-white px-4 py-2 text-xs font-bold text-[#5f635f] hover:border-[#202220] hover:text-[#202220]"
            :disabled="isUpdatingOrder"
            @click="closeOrderReviewModal"
          >
            Close
          </button>

          <div class="flex flex-wrap items-center gap-2">
            <!-- Cancel Action -->
            <button
              v-if="selectedOrderForReview.status !== 'cancelled' && selectedOrderForReview.status !== 'completed'"
              type="button"
              class="border border-[#b94d27] bg-[#fdf2ef] px-3.5 py-2 text-xs font-bold uppercase tracking-wider text-[#b94d27] transition-colors hover:bg-[#b94d27] hover:text-white disabled:opacity-50"
              :disabled="isUpdatingOrder"
              @click="submitOrderAction(selectedOrderForReview.id, 'cancelled', orderReviewNotes)"
            >
              Cancel Order
            </button>

            <!-- Confirm Action -->
            <button
              v-if="selectedOrderForReview.status === 'pending'"
              type="button"
              class="bg-[#245fa8] px-4 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-[2px_2px_0px_#202220] transition-colors hover:bg-[#1a4780] disabled:opacity-50"
              :disabled="isUpdatingOrder"
              @click="submitOrderAction(selectedOrderForReview.id, 'confirmed', orderReviewNotes)"
            >
              Confirm Order
            </button>

            <!-- Mark Ready Action -->
            <button
              v-if="selectedOrderForReview.status === 'confirmed'"
              type="button"
              class="bg-[#3f7652] px-4 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-[2px_2px_0px_#202220] transition-colors hover:bg-[#2d583d] disabled:opacity-50"
              :disabled="isUpdatingOrder"
              @click="submitOrderAction(selectedOrderForReview.id, 'ready', orderReviewNotes)"
            >
              Mark Ready for Pickup
            </button>

            <!-- Mark Completed Action -->
            <button
              v-if="selectedOrderForReview.status === 'ready'"
              type="button"
              class="bg-[#202220] px-4 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-[2px_2px_0px_#202220] transition-colors hover:bg-black disabled:opacity-50"
              :disabled="isUpdatingOrder"
              @click="submitOrderAction(selectedOrderForReview.id, 'completed', orderReviewNotes)"
            >
              Mark Completed
            </button>
          </div>
        </div>
      </div>
    </div>

    <ConfirmModal
      :show="adminConfirm.show"
      :title="adminConfirm.title"
      :message="adminConfirm.message"
      :confirm-text="adminConfirm.confirmText"
      :cancel-text="adminConfirm.cancelText"
      :variant="adminConfirm.variant"
      :icon="adminConfirm.icon"
      @confirm="handleAdminModalConfirm"
      @cancel="handleAdminModalCancel"
    />
  </div>
</template>
