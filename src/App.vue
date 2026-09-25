<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import AdminPanel from './components/AdminPanel.vue'
import ConfirmModal from './components/ConfirmModal.vue'
import KickCraftCalendar from './components/KickCraftCalendar.vue'
import { api } from './api.js'
import { adminShoeToCatalogCard, getStoredShoes, setStoredShoes } from './admin.js'
import { getStoredOrders, setStoredOrders } from './financials.js'
import {
  CATALOG,
  CATEGORIES,
  CHARMS,
  SHOES,
  charmScale,
  charmSource,
  filterCatalog,
  setMaterialColor,
} from './customization.js'

const sizes = [7, 8, 9, 10, 11]
const colors = [
  { name: 'Chalk', value: '#f1efe8' },
  { name: 'Graphite', value: '#292b2d' },
  { name: 'Cobalt', value: '#245fa8' },
  { name: 'Rust', value: '#b94d27' },
  { name: 'Moss', value: '#52684f' },
  { name: 'Burgundy', value: '#713741' },
]

const adminShoes = ref(getStoredShoes())
const currentUser = ref(null) // { email, role: 'customer' | 'owner' }

onMounted(async () => {
  // Listen for browser navigation via URL hash and route changes (supports shop, studio, reservations, admin)
  if (typeof window !== 'undefined') {
    window.addEventListener('hashchange', () => {
      const hash = window.location.hash.replace(/^#\/?/, '').trim()
      if (hash === 'reservations' && currentUser.value?.role === 'customer') {
        fetchMyReservations()
      }
      resolveCurrentRoute()
    })
    window.addEventListener('popstate', () => {
      resolveCurrentRoute()
    })
  }

  // Check active session from PHP API
  try {
    const sessionRes = await api('auth/session.php')
    if (sessionRes?.authenticated && sessionRes?.user) {
      currentUser.value = sessionRes.user
      const hash = typeof window !== 'undefined' ? window.location.hash.replace(/^#\/?/, '').trim() : ''
      const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('kickcraft_view') : ''
      if (sessionRes.user.role === 'owner' && (hash === 'admin' || saved === 'admin' || view.value === 'admin')) {
        view.value = 'admin'
        notFoundPath.value = ''
      } else if (sessionRes.user.role === 'customer' && (hash === 'reservations' || saved === 'reservations' || view.value === 'reservations')) {
        view.value = 'reservations'
        notFoundPath.value = ''
        fetchMyReservations()
      } else if (sessionRes.user.role !== 'owner' && view.value === 'admin') {
        // Block brute force attempts by non-owners to access admin
        notFoundPath.value = '/admin'
        view.value = 'not-found'
      }
    } else {
      // Unauthenticated session
      if (view.value === 'admin') {
        // Block unauthenticated brute-force attempts to /admin -> 404
        notFoundPath.value = '/admin'
        view.value = 'not-found'
      } else if (view.value === 'reservations') {
        goToLogin('customer')
      }
    }
  } catch (_) {
    // Session check fails gracefully when offline or unauthenticated
    if (view.value === 'admin') {
      notFoundPath.value = '/admin'
      view.value = 'not-found'
    } else if (view.value === 'reservations') {
      fetchMyReservations()
    }
  }

  // Load catalog shoes from API with fallback to getStoredShoes()
  try {
    const shoesRes = await api('shoes/list.php')
    if (shoesRes?.shoes && Array.isArray(shoesRes.shoes) && shoesRes.shoes.length > 0) {
      adminShoes.value = shoesRes.shoes
    }
  } catch (_) {
    // Fallback to getStoredShoes() which initialized adminShoes
  }

  // Pre-load saved guest profile if available
  const savedGuest = loadGuestProfile()
  if (savedGuest) {
    rememberGuestProfile.value = true
    if (savedGuest.name && !customerName.value) {
      customerName.value = savedGuest.name
    }
    if (savedGuest.email && !customerEmail.value) {
      customerEmail.value = savedGuest.email
    }
  }

  // Listen for real-time reservation updates across tabs
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      const channel = new BroadcastChannel('kickcraft_reservations_channel')
      channel.onmessage = (event) => {
        if (event.data?.type === 'RESERVATION_CANCELLED') {
          const target = myReservations.value.find(r => r.id === event.data.id)
          if (target) {
            target.status = 'cancelled'
            if (event.data.notes) {
              target.notes = event.data.notes
            }
          }
        } else if (event.data?.type === 'RESERVATION_STATUS_UPDATED' && event.data.id && event.data.status) {
          const target = myReservations.value.find(r => r.id === event.data.id)
          if (target) {
            target.status = event.data.status
          }
        }
      }
    } catch (_) {}
  }
})

function onShoesChanged(updatedShoes) {
  adminShoes.value = updatedShoes
}

const modelViewer = ref(null)
const selectedShoeId = ref(SHOES[0].id)
const selectedShoe = computed(() => {
  const foundInAdmin = adminShoes.value.find(shoe => shoe.id === selectedShoeId.value)
  if (foundInAdmin) {
    return {
      ...foundInAdmin,
      src: foundInAdmin.glbPath,
      image: foundInAdmin.thumbnailPath,
    }
  }
  return SHOES.find(shoe => shoe.id === selectedShoeId.value) || SHOES[0]
})

const shoeColors = computed(() => {
  if (selectedShoe.value?.colors && selectedShoe.value.colors.length) {
    return selectedShoe.value.colors
  }
  return colors
})

const selectedParts = computed(() => selectedShoe.value.parts || [])
const selectedPartId = ref(selectedParts.value[0]?.id || 'upper')
const selectedCharmId = ref('none')
const partColors = ref({})
const selectedSize = ref(9)
const modelReady = ref(false)
const modelError = ref('')
const reserved = ref(false)
const customerName = ref('')
const customerEmail = ref('')
const pickupDate = ref('')
const reservationReceipt = ref(null)
const isSubmitting = ref(false)
const reservationError = ref('')
const showGuestPerkReminder = ref(false)

const GUEST_PROFILE_KEY = 'kickcraft_guest_profile'
const rememberGuestProfile = ref(false)

function loadGuestProfile() {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(GUEST_PROFILE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') {
        return parsed
      }
    }
  } catch (_) {}
  return null
}

function saveGuestProfile(name, email) {
  if (typeof localStorage === 'undefined') return
  try {
    if (rememberGuestProfile.value) {
      localStorage.setItem(
        GUEST_PROFILE_KEY,
        JSON.stringify({ name: name || '', email: email || '' })
      )
    } else {
      localStorage.removeItem(GUEST_PROFILE_KEY)
    }
  } catch (_) {}
}

watch(rememberGuestProfile, (newVal) => {
  if (!newVal && typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(GUEST_PROFILE_KEY)
    } catch (_) {}
  }
})

function getPickupDateOffset(days) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  const y = String(d.getFullYear())
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const minPickupDate = computed(() => getPickupDateOffset(7))
const maxPickupDate = computed(() => getPickupDateOffset(365))

const confirmModal = ref({
  show: false,
  title: '',
  message: '',
  confirmText: 'Confirm',
  cancelText: 'Cancel',
  variant: 'default',
  icon: 'warning',
  onConfirm: null,
})

function handleModalConfirm() {
  if (confirmModal.value.onConfirm) {
    confirmModal.value.onConfirm()
  }
  confirmModal.value.show = false
}

function handleModalCancel() {
  confirmModal.value.show = false
}

// ── Feedback Modal State & Handlers ───────────────────────────
const showFeedbackModal = ref(false)
const feedbackForm = ref({
  name: '',
  email: '',
  category: 'general',
  message: '',
})
const feedbackSubmitting = ref(false)
const feedbackSubmitted = ref(false)
const feedbackError = ref('')

function openFeedbackModal() {
  feedbackError.value = ''
  feedbackSubmitted.value = false
  if (currentUser.value) {
    if (currentUser.value.name) feedbackForm.value.name = currentUser.value.name
    if (currentUser.value.email) feedbackForm.value.email = currentUser.value.email
  } else {
    const guest = loadGuestProfile()
    if (guest) {
      if (guest.name) feedbackForm.value.name = guest.name
      if (guest.email) feedbackForm.value.email = guest.email
    }
  }
  showFeedbackModal.value = true
}

function closeFeedbackModal() {
  showFeedbackModal.value = false
  feedbackSubmitted.value = false
  feedbackError.value = ''
}

async function handleFeedbackSubmit() {
  feedbackError.value = ''
  if (!feedbackForm.value.message.trim()) {
    feedbackError.value = 'Please provide your feedback message.'
    return
  }

  feedbackSubmitting.value = true
  try {
    const existing = JSON.parse(localStorage.getItem('kickcraft_feedback') || '[]')
    existing.unshift({
      id: 'FB-' + Date.now(),
      name: feedbackForm.value.name.trim() || 'Anonymous',
      email: feedbackForm.value.email.trim() || 'Not provided',
      category: feedbackForm.value.category,
      message: feedbackForm.value.message.trim(),
      createdAt: new Date().toISOString(),
    })
    localStorage.setItem('kickcraft_feedback', JSON.stringify(existing))
    feedbackSubmitted.value = true
    feedbackForm.value.message = ''
  } catch (err) {
    feedbackError.value = 'Failed to submit feedback. Please try again.'
  } finally {
    feedbackSubmitting.value = false
  }
}


const selectedPart = computed(() => selectedParts.value.find(part => part.id === selectedPartId.value) || selectedParts.value[0])
const selectedCharm = computed(() => CHARMS.find(charm => charm.id === selectedCharmId.value))
const customizedCount = computed(() => Object.keys(partColors.value).length)
const selectedColor = computed(() => partColors.value[selectedPartId.value])
const charmModels = computed(() => CHARMS
  .filter(charm => charm.src)
  .map(charm => ({ ...charm, src: charmSource(charm, selectedShoe.value) })))

const searchQuery = ref('')
const activeCategory = ref('all')

const dynamicCatalog = computed(() => {
  const adminIds = new Set(adminShoes.value.map(s => s.id))
  const cardsFromAdmin = adminShoes.value.map(adminShoeToCatalogCard)

  const remaining = CATALOG.filter(c => !adminIds.has(c.id))
  return [...cardsFromAdmin, ...remaining]
})

const filteredCatalog = computed(() => {
  return filterCatalog(dynamicCatalog.value, searchQuery.value, activeCategory.value)
})

function clearFilters() {
  searchQuery.value = ''
  activeCategory.value = 'all'
}

function handleModelLoad() {
  const model = modelViewer.value?.model
  const missingPart = selectedParts.value.find(part => !model?.getMaterialByName(part.material))

  if (missingPart) {
    modelError.value = 'This shoe model cannot be customized because a required part is missing.'
    return
  }

  modelReady.value = true
  modelError.value = ''

  for (const [partId, color] of Object.entries(partColors.value)) {
    const part = selectedParts.value.find(p => p.id === partId)
    if (part && color?.value) {
      setMaterialColor(model, part.material, color.value)
    }
  }
}

function handleModelError() {
  modelReady.value = false
  modelError.value = 'The 3D shoe could not be loaded. Check the model file, then refresh the page.'
}

function chooseColor(color) {
  if (!modelReady.value) return
  if (!setMaterialColor(modelViewer.value.model, selectedPart.value.material, color.value)) return

  partColors.value = { ...partColors.value, [selectedPartId.value]: color }
}

function resetDesign() {
  if (!modelReady.value) return
  if (selectedParts.value.every(part => setMaterialColor(modelViewer.value.model, part.material, '#ffffff'))) {
    partColors.value = {}
  }
}

function requestResetDesign() {
  if (customizedCount.value === 0) return
  confirmModal.value = {
    show: true,
    title: 'Reset Custom Design?',
    message: 'This will reset all custom color choices back to original white/chalk. Your current combination will be lost.',
    confirmText: 'Reset to White',
    cancelText: 'Keep My Design',
    variant: 'warning',
    icon: 'reset',
    onConfirm: () => {
      if (selectedParts.value.every(part => setMaterialColor(modelViewer.value.model, part.material, '#ffffff'))) {
        partColors.value = {}
      }
    },
  }
}

function openReservation() {
  reserved.value = false
  reservationReceipt.value = null
  reservationError.value = ''
  showGuestPerkReminder.value = false
  if (!pickupDate.value) {
    pickupDate.value = minPickupDate.value
  }
  if (currentUser.value) {
    if (currentUser.value.email) {
      customerEmail.value = currentUser.value.email
    }
    if (currentUser.value.name && !customerName.value) {
      customerName.value = currentUser.value.name
    }
  } else {
    const guest = loadGuestProfile()
    if (guest) {
      rememberGuestProfile.value = true
      if (guest.name && !customerName.value) {
        customerName.value = guest.name
      }
      if (guest.email && !customerEmail.value) {
        customerEmail.value = guest.email
      }
    }
  }
  nextTick(() => document.querySelector('#reservation-dialog')?.showModal())
}

function closeReservation() {
  document.querySelector('#reservation-dialog')?.close()
  showGuestPerkReminder.value = false
}

// ── Customer reservations state ───────────────────────────────
const myReservations = ref([])
const isLoadingReservations = ref(false)
const reservationsError = ref('')

async function fetchMyReservations() {
  isLoadingReservations.value = true
  reservationsError.value = ''
  try {
    const res = await api('reservations/list.php')
    if (res?.reservations && Array.isArray(res.reservations)) {
      myReservations.value = res.reservations
    } else {
      const email = currentUser.value?.email
      const stored = getStoredOrders()
      myReservations.value = email ? stored.filter(o => o.customerEmail === email || o.email === email) : stored
    }
  } catch (err) {
    try {
      const email = currentUser.value?.email
      const stored = getStoredOrders()
      const offline = email ? stored.filter(o => o.customerEmail === email || o.email === email) : stored
      myReservations.value = offline
      if (offline.length === 0 && err.message) {
        reservationsError.value = err.message || 'Failed to load reservations'
      }
    } catch (_) {
      reservationsError.value = err.message || 'Failed to load reservations'
    }
  } finally {
    isLoadingReservations.value = false
  }
}

function goToMyReservations() {
  if (currentUser.value?.role === 'customer') {
    closeReservation()
    view.value = 'reservations'
    fetchMyReservations()
    scrollToTop()
  } else {
    showGuestPerkReminder.value = true
  }
}

function requestCancelCustomerReservation(reservation) {
  confirmModal.value = {
    show: true,
    title: 'Cancel Pickup Reservation?',
    message: `Are you sure you want to cancel your reservation for ${getReservationShoeName(reservation)} (Reference: ${reservation.id})? This action cannot be undone.`,
    confirmText: 'Cancel Reservation',
    cancelText: 'Keep Reservation',
    variant: 'danger',
    icon: 'trash',
    onConfirm: async () => {
      try {
        await api('reservations/update-status.php', {
          method: 'POST',
          body: {
            id: reservation.id,
            status: 'cancelled',
          },
        })

        // Update local state in myReservations
        const target = myReservations.value.find(r => r.id === reservation.id)
        if (target) {
          target.status = 'cancelled'
        }

        // Update localStorage getStoredOrders()
        try {
          const storedOrders = getStoredOrders()
          const orderIndex = storedOrders.findIndex(o => o.id === reservation.id)
          if (orderIndex !== -1) {
            storedOrders[orderIndex].status = 'cancelled'
            setStoredOrders(storedOrders)
          }
        } catch (_) {}

        // Restore local shoe stock in adminShoes if present
        const shoeIndex = adminShoes.value.findIndex(s => s.id === reservation.shoeId)
        if (shoeIndex !== -1) {
          adminShoes.value[shoeIndex].stock += 1
          if (adminShoes.value[shoeIndex].status === 'out_of_stock') {
            adminShoes.value[shoeIndex].status = 'available'
          }
          setStoredShoes(adminShoes.value)
        }

        // Broadcast event via BroadcastChannel('kickcraft_reservations_channel')
        if (typeof BroadcastChannel !== 'undefined') {
          try {
            const channel = new BroadcastChannel('kickcraft_reservations_channel')
            channel.postMessage({ type: 'RESERVATION_CANCELLED', id: reservation.id })
            channel.close()
          } catch (_) {}
        }
      } catch (err) {
        reservationsError.value = err.message || 'Failed to cancel reservation'
      }
    },
  }
}

function getReservationStatusBadge(status) {
  const statusMap = {
    pending: {
      label: 'Pending Payment',
      bgClass: 'bg-[#fcf5eb]',
      textClass: 'text-[#c97d1e]',
      borderClass: 'border-[#c97d1e]',
      dotClass: 'bg-[#c97d1e]',
    },
    paid: {
      label: 'Paid & Confirmed',
      bgClass: 'bg-[#edf5f0]',
      textClass: 'text-[#3f7652]',
      borderClass: 'border-[#3f7652]',
      dotClass: 'bg-[#3f7652]',
    },
    approved: {
      label: 'Processing',
      bgClass: 'bg-[#edf4fb]',
      textClass: 'text-[#245fa8]',
      borderClass: 'border-[#245fa8]',
      dotClass: 'bg-[#245fa8]',
    },
    ready: {
      label: 'Ready for Store Pickup',
      bgClass: 'bg-[#eaf5ee]',
      textClass: 'text-[#2a593a]',
      borderClass: 'border-[#2a593a]',
      dotClass: 'bg-[#2a593a]',
    },
    completed: {
      label: 'Completed',
      bgClass: 'bg-[#f1f2f0]',
      textClass: 'text-[#292b2d]',
      borderClass: 'border-[#292b2d]',
      dotClass: 'bg-[#292b2d]',
    },
    cancelled: {
      label: 'Cancelled',
      bgClass: 'bg-[#fdf2ef]',
      textClass: 'text-[#b94d27]',
      borderClass: 'border-[#b94d27]',
      dotClass: 'bg-[#b94d27]',
    },
  }
  return statusMap[status] || {
    label: status || 'Pending',
    bgClass: 'bg-[#f1f2f0]',
    textClass: 'text-[#292b2d]',
    borderClass: 'border-[#292b2d]',
    dotClass: 'bg-[#292b2d]',
  }
}

function getReservationShoeImage(reservation) {
  const shoe = adminShoes.value.find(s => s.id === reservation.shoeId) || SHOES.find(s => s.id === reservation.shoeId)
  return shoe?.thumbnailPath || shoe?.image || '/images/kickcraft-one-card.png'
}

function getReservationShoeName(reservation) {
  if (reservation.shoeName) return reservation.shoeName
  const shoe = adminShoes.value.find(s => s.id === reservation.shoeId) || SHOES.find(s => s.id === reservation.shoeId)
  return shoe?.name || 'KickCraft Shoe'
}

function formatPartName(partKey) {
  const labelMap = {
    upper: 'Upper',
    toecap: 'Toe Cap',
    'toe-cap': 'Toe Cap',
    tongue: 'Tongue',
    laces: 'Laces',
    heelpanel: 'Heel Panel',
    'heel-panel': 'Heel Panel',
    sideaccents: 'Side Accents',
    'side-accents': 'Side Accents',
    midsole: 'Midsole',
    outsole: 'Outsole',
    swoosh: 'Swoosh',
  }
  return labelMap[partKey.toLowerCase()] || partKey.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

function normalizeColorInfo(colorVal) {
  if (!colorVal) return { name: 'Default', value: '#f1efe8' }
  if (typeof colorVal === 'string') return { name: colorVal, value: colorVal }
  return {
    name: colorVal.name || colorVal.value || 'Custom',
    value: colorVal.value || '#f1efe8',
  }
}

async function submitReservation() {
  if (!customerName.value.trim() || !customerEmail.value.trim() || !pickupDate.value) {
    return
  }

  isSubmitting.value = true
  reservationError.value = ''

  try {
    const res = await api('reservations/create.php', {
      method: 'POST',
      body: {
        customerName: customerName.value.trim(),
        email: customerEmail.value.trim(),
        pickupDate: pickupDate.value,
        shoeId: selectedShoe.value.id,
        size: selectedSize.value,
        partColors: { ...partColors.value },
        charmId: selectedCharm.value.id,
        charmLabel: selectedCharm.value.label,
      },
    })

    // Decrement inventory stock if present in admin catalog
    const shoeIndex = adminShoes.value.findIndex(s => s.id === selectedShoe.value.id)
    if (shoeIndex !== -1 && adminShoes.value[shoeIndex].stock > 0) {
      adminShoes.value[shoeIndex].stock -= 1
      if (adminShoes.value[shoeIndex].stock === 0) {
        adminShoes.value[shoeIndex].status = 'out_of_stock'
      }
      setStoredShoes(adminShoes.value)
    }

    try {
      const orders = getStoredOrders()
      orders.unshift(res.reservation)
      setStoredOrders(orders)
    } catch (_) {}

    saveGuestProfile(customerName.value.trim(), customerEmail.value.trim())

    reservationReceipt.value = res.reservation
    reserved.value = true

    // Broadcast event via BroadcastChannel('kickcraft_reservations_channel')
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        const channel = new BroadcastChannel('kickcraft_reservations_channel')
        channel.postMessage({ type: 'NEW_RESERVATION', reservation: res.reservation })
        channel.close()
      } catch (_) {}
    }
  } catch (err) {
    reservationError.value = err.message || 'Failed to create reservation'
  } finally {
    isSubmitting.value = false
  }
}

// ── View routing & Route Protection ───────────────────────────
function getAttemptedPath() {
  if (typeof window === 'undefined') return '/404'
  let p = window.location.pathname || ''
  p = p.replace(/^\/kickcraft\/?/i, '/')
  const cleanPath = p.replace(/^\/+|\/+$/g, '')
  if (cleanPath && cleanPath !== 'index.html') {
    return '/' + cleanPath
  }
  const hash = window.location.hash.replace(/^#\/?/, '').trim()
  if (hash) {
    return '#' + hash
  }
  return '/404'
}

const notFoundPath = ref(getAttemptedPath())

function getInitialView() {
  if (typeof window !== 'undefined') {
    let p = window.location.pathname || ''
    p = p.replace(/^\/kickcraft\/?/i, '/')
    const cleanPath = p.replace(/^\/+|\/+$/g, '')
    const hash = window.location.hash.replace(/^#\/?/, '').trim()

    const target = (cleanPath && cleanPath !== 'index.html') ? cleanPath : hash

    if (target) {
      if (['shop', 'studio', 'login', 'register', 'reservations'].includes(target)) {
        return target
      }
      if (target === 'admin') {
        // Will be verified against session in onMounted; if unauthenticated, transitions to not-found
        return 'admin'
      }
      return 'not-found'
    }

    try {
      const saved = localStorage.getItem('kickcraft_view')
      if (saved && ['shop', 'studio', 'login', 'register', 'admin', 'reservations'].includes(saved)) {
        return saved
      }
    } catch (_) {}
  }
  return 'shop'
}

const view = ref(getInitialView()) // 'shop' | 'studio' | 'login' | 'register' | 'admin' | 'reservations' | 'not-found'

function resolveCurrentRoute() {
  if (typeof window === 'undefined') return
  let p = window.location.pathname || ''
  p = p.replace(/^\/kickcraft\/?/i, '/')
  const cleanPath = p.replace(/^\/+|\/+$/g, '')
  const hash = window.location.hash.replace(/^#\/?/, '').trim()
  const target = (cleanPath && cleanPath !== 'index.html') ? cleanPath : hash

  if (!target || target === 'shop') {
    view.value = 'shop'
    notFoundPath.value = ''
    return
  }

  if (['studio', 'login', 'register'].includes(target)) {
    view.value = target
    notFoundPath.value = ''
    return
  }

  if (target === 'reservations') {
    if (currentUser.value?.role === 'customer') {
      view.value = 'reservations'
      notFoundPath.value = ''
      fetchMyReservations()
    } else if (!currentUser.value) {
      goToLogin('customer')
    } else {
      notFoundPath.value = cleanPath ? `/${cleanPath}` : `#${hash}`
      view.value = 'not-found'
    }
    return
  }

  if (target === 'admin') {
    if (currentUser.value?.role === 'owner') {
      view.value = 'admin'
      notFoundPath.value = ''
    } else {
      // Brute force / unauthorized attempt to access admin
      notFoundPath.value = cleanPath ? `/${cleanPath}` : `#${hash}`
      view.value = 'not-found'
    }
    return
  }

  // Any other URL attempted by user
  notFoundPath.value = cleanPath ? `/${cleanPath}` : `#${hash}`
  view.value = 'not-found'
}

watch(view, (newView) => {
  if (typeof window !== 'undefined' && newView) {
    if (newView === 'not-found') {
      try {
        localStorage.removeItem('kickcraft_view')
      } catch (_) {}
      return
    }
    if (window.location.hash !== `#${newView}`) {
      window.location.hash = newView
    }
    try {
      localStorage.setItem('kickcraft_view', newView)
    } catch (_) {}
  }
}, { immediate: true })

function goToAdmin() {
  notFoundPath.value = ''
  view.value = 'admin'
  scrollToTop()
}

async function handleLogout() {
  try {
    await api('auth/logout.php', { method: 'POST' })
  } catch (_) {}
  currentUser.value = null
  loginEmail.value = ''
  loginPassword.value = ''
  try {
    localStorage.removeItem('kickcraft_view')
  } catch (_) {}
  goToShop()
}

function requestLogout() {
  confirmModal.value = {
    show: true,
    title: 'Sign Out of KickCraft?',
    message: 'You will be signed out of your current session. You can sign back in at any time to access the Owner Portal or customer features.',
    confirmText: 'Sign Out',
    cancelText: 'Stay Logged In',
    variant: 'default',
    icon: 'logout',
    onConfirm: () => {
      handleLogout()
    },
  }
}

// ── Auth state ────────────────────────────────────────────────
const authRole = ref('customer') // 'customer' | 'owner'
const loginEmail = ref('')
const loginPassword = ref('')
const showLoginPassword = ref(false)
const loginRemember = ref(false)
const loginFeedback = ref('')
const loginError = ref('')
const isLoggingIn = ref(false)

const registerName = ref('')
const registerEmail = ref('')
const registerPassword = ref('')
const showRegisterPassword = ref(false)
const registerConfirmPassword = ref('')
const showRegisterConfirmPassword = ref(false)
const registerAgreed = ref(false)
const registerFeedback = ref('')
const registerError = ref('')
const isRegistering = ref(false)

function goToLogin(role = 'customer') {
  authRole.value = role
  loginFeedback.value = ''
  loginError.value = ''
  view.value = 'login'
  scrollToTop()
}

function goToRegister() {
  registerFeedback.value = ''
  registerError.value = ''
  view.value = 'register'
  scrollToTop()
}

async function handleLoginSubmit() {
  loginError.value = ''
  loginFeedback.value = ''
  if (!loginEmail.value || !loginPassword.value) {
    loginError.value = 'Please enter both your email and password.'
    return
  }

  isLoggingIn.value = true
  try {
    const res = await api('auth/login.php', {
      method: 'POST',
      body: {
        email: loginEmail.value,
        password: loginPassword.value,
      },
    })
    currentUser.value = res.user
    loginFeedback.value = `Logged in successfully as ${res.user.role === 'owner' ? 'Owner / Admin' : 'Customer'}. Redirecting…`
    setTimeout(() => {
      if (res.user.role === 'owner') {
        goToAdmin()
      } else {
        goToShop()
      }
    }, 400)
  } catch (err) {
    loginError.value = err.message || 'Login failed'
  } finally {
    isLoggingIn.value = false
  }
}

async function handleRegisterSubmit() {
  registerError.value = ''
  registerFeedback.value = ''
  if (!registerName.value || !registerEmail.value || !registerPassword.value) {
    registerError.value = 'All fields are required.'
    return
  }
  if (registerPassword.value !== registerConfirmPassword.value) {
    registerError.value = 'Passwords do not match. Please verify your password.'
    return
  }
  if (registerPassword.value.length < 6) {
    registerError.value = 'Password must be at least 6 characters long.'
    return
  }

  isRegistering.value = true
  try {
    const res = await api('auth/register.php', {
      method: 'POST',
      body: {
        name: registerName.value,
        email: registerEmail.value,
        password: registerPassword.value,
      },
    })
    registerFeedback.value = res.message || 'Account created successfully! Redirecting to sign in…'
    setTimeout(() => {
      loginEmail.value = registerEmail.value
      goToLogin('customer')
    }, 1200)
  } catch (err) {
    registerError.value = err.message || 'Registration failed'
  } finally {
    isRegistering.value = false
  }
}

function resetStudioState() {
  partColors.value = {}
  selectedCharmId.value = 'none'
  selectedPartId.value = selectedParts.value[0].id
  selectedSize.value = 9
  modelReady.value = false
  modelError.value = ''
  reserved.value = false
  reservationReceipt.value = null
  reservationError.value = ''
  showGuestPerkReminder.value = false
}

function goToStudio(shoeId) {
  selectedShoeId.value = shoeId
  resetStudioState()
  notFoundPath.value = ''
  view.value = 'studio'
  scrollToTop()
}

function goToShop() {
  selectedShoeId.value = SHOES[0].id
  resetStudioState()
  notFoundPath.value = ''
  view.value = 'shop'
  scrollToTop()
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
</script>

<template>
  <div class="min-h-screen bg-[#f5f6f4] text-[#292b2d]">

    <!-- ── Header ───────────────────────────────────────────── -->
    <header class="border-b border-[#cfd2ce] bg-[#fcfdfb]">
      <div class="mx-auto flex h-16 max-w-[1480px] items-center justify-between px-5 lg:px-8">
        <button
          class="flex items-center gap-3 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#245fa8]"
          @click="goToShop"
        >
          <span class="grid size-8 place-items-center bg-[#292b2d] text-sm font-black text-white">K</span>
          <span class="font-display text-lg font-extrabold tracking-[-0.03em]">KickCraft</span>
        </button>
        <nav class="flex items-center gap-4 text-sm font-semibold sm:gap-6" aria-label="Main navigation">
          <!-- Shop link (hide when in admin to avoid redundant buttons) -->
          <button
            v-if="view !== 'admin'"
            type="button"
            class="transition-colors hover:text-[#b94d27] focus-visible:outline-2 focus-visible:outline-[#245fa8]"
            :class="view === 'shop' ? 'border-b-2 border-[#b94d27] py-5 text-[#202220]' : 'text-[#5f635f]'"
            @click="goToShop"
          >
            Shop
          </button>

          <!-- Studio active tab label (if in studio) -->
          <span v-if="view === 'studio'" class="hidden border-b-2 border-[#b94d27] py-5 text-[#202220] sm:block">
            Design studio
          </span>

          <!-- Customer reservations tab -->
          <button
            v-if="currentUser?.role === 'customer'"
            type="button"
            class="transition-colors hover:text-[#b94d27] focus-visible:outline-2 focus-visible:outline-[#245fa8]"
            :class="view === 'reservations' ? 'border-b-2 border-[#b94d27] py-5 text-[#202220]' : 'text-[#5f635f]'"
            @click="goToMyReservations"
          >
            My Reservations
          </button>

          <!-- Admin link (shown if logged in as owner or in admin view) -->
          <button
            v-if="currentUser?.role === 'owner' || view === 'admin'"
            type="button"
            class="transition-colors hover:text-[#b94d27] focus-visible:outline-2 focus-visible:outline-[#245fa8]"
            :class="view === 'admin' ? 'border-b-2 border-[#b94d27] py-5 text-[#202220]' : 'text-[#5f635f]'"
            @click="goToAdmin"
          >
            Admin Portal
          </button>

          <!-- User session / Auth buttons -->
          <template v-if="currentUser">
            <span class="hidden text-xs text-[#6a6e6a] sm:inline">
              {{ currentUser.email }}
            </span>
            <button
              type="button"
              class="text-xs font-semibold text-[#8e938e] transition-colors hover:text-[#b94d27]"
              @click="requestLogout"
            >
              Sign out
            </button>
          </template>
          <template v-else>
            <!-- Log in link -->
            <button
              type="button"
              class="transition-colors hover:text-[#b94d27] focus-visible:outline-2 focus-visible:outline-[#245fa8]"
              :class="view === 'login' ? 'border-b-2 border-[#b94d27] py-5 text-[#202220]' : 'text-[#5f635f]'"
              @click="goToLogin('customer')"
            >
              Log in
            </button>

            <!-- Register link -->
            <button
              type="button"
              class="hidden transition-colors hover:text-[#b94d27] sm:block focus-visible:outline-2 focus-visible:outline-[#245fa8]"
              :class="view === 'register' ? 'border-b-2 border-[#b94d27] py-5 text-[#202220]' : 'text-[#5f635f]'"
              @click="goToRegister"
            >
              Register
            </button>
          </template>
        </nav>
      </div>
    </header>

    <!-- ══════════════════════════════════════════════════════ -->
    <!-- SHOP VIEW                                              -->
    <!-- ══════════════════════════════════════════════════════ -->
    <main v-if="view === 'shop'" class="mx-auto max-w-[1480px] px-5 py-10 lg:px-8 lg:py-14">

      <!-- Hero -->
      <div class="mb-10 border-b border-[#cfd2ce] pb-10">
        <p class="mb-2 text-sm font-semibold text-[#6a6e6a]">Original silhouettes / One design studio</p>
        <h1 class="font-display max-w-3xl text-4xl font-black leading-[0.95] tracking-[-0.045em] text-[#202220] sm:text-5xl lg:text-6xl">
          Shape the color.<br>Keep the character.
        </h1>
        <p class="mt-5 max-w-md text-sm leading-6 text-[#5f635f]">
          Design your own sneaker by recoloring its editable parts, attaching a 3D charm, and reserving it for in-store pickup.
        </p>
      </div>

      <!-- Search & Filters Toolbar -->
      <div class="mb-8 space-y-4">
        <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <!-- Search input -->
          <div class="relative w-full sm:max-w-md">
            <span class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-[#6a6e6a]">
              <svg class="size-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clip-rule="evenodd" />
              </svg>
            </span>
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Search styles by name or description…"
              class="h-11 w-full border border-[#bfc3bf] bg-[#fcfdfb] pl-10 pr-10 text-sm text-[#292b2d] placeholder-[#8e938e] outline-none transition-colors focus:border-[#245fa8] focus:ring-1 focus:ring-[#245fa8]"
              aria-label="Search styles by name or description"
            />
            <button
              v-if="searchQuery"
              type="button"
              class="absolute inset-y-0 right-0 flex items-center pr-3 text-[#6a6e6a] hover:text-[#292b2d] focus-visible:outline-none"
              aria-label="Clear search"
              @click="searchQuery = ''"
            >
              <svg class="size-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
          </div>

          <!-- Results counter -->
          <div class="text-xs font-semibold text-[#6a6e6a]">
            Showing <span class="font-bold text-[#202220]">{{ filteredCatalog.length }}</span> {{ filteredCatalog.length === 1 ? 'shoe' : 'shoes' }}
          </div>
        </div>

        <!-- Category pills -->
        <div class="flex flex-wrap items-center gap-2" role="group" aria-label="Category filter pills">
          <button
            v-for="cat in CATEGORIES"
            :key="cat.id"
            type="button"
            class="px-3.5 py-1.5 text-xs font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#245fa8]"
            :class="activeCategory === cat.id ? 'bg-[#292b2d] text-white' : 'bg-[#fcfdfb] text-[#5f635f] border border-[#bfc3bf] hover:border-[#292b2d]'"
            :aria-pressed="activeCategory === cat.id"
            @click="activeCategory = cat.id"
          >
            {{ cat.label }}
          </button>
        </div>
      </div>

      <!-- Empty state -->
      <div
        v-if="filteredCatalog.length === 0"
        class="flex flex-col items-center justify-center border border-dashed border-[#bfc3bf] bg-[#fcfdfb] px-6 py-16 text-center"
      >
        <div class="mb-4 grid size-12 place-items-center rounded-full bg-[#f1f3f0] text-[#6a6e6a]">
          <svg class="size-6" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clip-rule="evenodd" />
          </svg>
        </div>
        <h3 class="font-display text-lg font-bold text-[#202220]">No styles match your search or filter.</h3>
        <p class="mt-1 max-w-sm text-xs text-[#6a6e6a]">Try adjusting your search terms or selecting a different category to explore available styles.</p>
        <button
          type="button"
          class="mt-5 border border-[#292b2d] bg-[#292b2d] px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-[#404345] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#245fa8]"
          @click="clearFilters"
        >
          Clear filters
        </button>
      </div>

      <!-- Catalog grid -->
      <div v-else class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <template v-for="card in filteredCatalog" :key="card.id">
          <!-- Live shoe card -->
          <button
            v-if="card.status === 'live'"
            type="button"
            class="group flex flex-col overflow-hidden border border-[#bfc3bf] bg-[#fcfdfb] text-left transition-all duration-200 hover:border-[#292b2d] hover:shadow-[0_4px_20px_rgba(0,0,0,0.10)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#245fa8]"
            @click="goToStudio(card.shoeId)"
            :aria-label="`Customize and reserve ${card.name}`"
          >
            <!-- Thumbnail -->
            <div class="relative grid h-64 place-items-center overflow-hidden bg-[#e9ece9]">
              <img
                v-if="card.image"
                :src="card.image"
                :alt="`${card.name} customizable sneaker`"
                class="h-full w-full object-contain transition-transform duration-300 group-hover:scale-[1.04]"
              />
              <div v-else class="text-center text-[#6a6e6a]">
                <div class="mx-auto mb-3 grid size-16 place-items-center border border-[#bfc3bf] bg-[#fcfdfb] text-2xl">3D</div>
                <p class="text-xs font-bold uppercase tracking-widest">{{ card.name }}</p>
              </div>
              <!-- Hover overlay -->
              <div class="pointer-events-none absolute inset-0 bg-[#292b2d]/0 transition-colors duration-200 group-hover:bg-[#292b2d]/10" />
              <div class="pointer-events-none absolute left-3 top-3 bg-[#b94d27] px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-white">
                Customize
              </div>
              <!-- Arrow hint that appears on hover -->
              <div class="pointer-events-none absolute bottom-3 right-3 flex items-center gap-1.5 bg-[#292b2d] px-3 py-1.5 text-xs font-bold text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                Open studio
                <svg class="size-3" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                  <path d="M2 6h8M6 2l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </div>
            </div>

            <!-- Card body -->
            <div class="flex flex-1 flex-col p-5">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <h2 class="font-display text-xl font-black tracking-[-0.03em] text-[#202220]">{{ card.name }}</h2>
                  <p class="mt-0.5 text-xs text-[#6a6e6a]">{{ card.subtitle }}</p>
                </div>
                <p class="shrink-0 text-lg font-black text-[#b94d27]">{{ card.price }}</p>
              </div>

              <!-- Part color preview dots -->
              <div v-if="(adminShoes.find(s => s.id === card.shoeId) || SHOES.find(s => s.id === card.shoeId))" class="mt-3 flex items-center gap-1">
                <span
                  v-for="part in (adminShoes.find(s => s.id === card.shoeId) || SHOES.find(s => s.id === card.shoeId)).parts"
                  :key="part.id"
                  class="size-3 border border-black/10"
                  :style="{ backgroundColor: selectedShoeId === card.shoeId ? partColors[part.id]?.value || '#e9ece9' : '#e9ece9' }"
                  :title="part.label"
                />
                <span class="ml-1.5 text-[10px] text-[#6a6e6a]">{{ selectedShoeId === card.shoeId && customizedCount > 0 ? customizedCount + ' parts styled' : 'Default colors' }}</span>
              </div>

              <!-- CTA row -->
              <div class="mt-5 mt-auto flex h-12 w-full items-center justify-between bg-[#292b2d] px-5 text-sm font-bold text-white transition-colors duration-200 group-hover:bg-[#404345]">
                Customize &amp; Reserve
                <svg class="size-4 transition-transform duration-200 group-hover:translate-x-1" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </div>
            </div>
          </button>

          <!-- Out of Stock or Coming Soon card -->
          <div
            v-else
            class="flex flex-col overflow-hidden border border-[#bfc3bf] bg-[#fcfdfb] text-left opacity-90 transition-all duration-200"
          >
            <!-- Thumbnail / Placeholder -->
            <div class="relative grid h-64 place-items-center overflow-hidden bg-[#ebeeed]">
              <img
                v-if="card.image"
                :src="card.image"
                :alt="card.name"
                class="h-full w-full object-contain opacity-60 grayscale"
              />
              <div v-else class="text-center text-[#8e938e]">
                <div class="mx-auto mb-2 grid size-16 place-items-center border border-dashed border-[#bfc3bf] bg-[#f5f6f4] text-xl font-bold tracking-wider text-[#6a6e6a]">
                  3D
                </div>
                <p class="text-[11px] font-bold uppercase tracking-widest text-[#7a7e7a]">
                  {{ card.status === 'out_of_stock' ? 'Out of Stock' : 'Coming Soon' }}
                </p>
              </div>
              <div
                class="pointer-events-none absolute left-3 top-3 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-white"
                :class="card.status === 'out_of_stock' ? 'bg-[#b94d27]' : 'bg-[#6a6e6a]'"
              >
                {{ card.status === 'out_of_stock' ? 'Out of Stock' : 'Coming Soon' }}
              </div>
            </div>

            <!-- Card body -->
            <div class="flex flex-1 flex-col p-5">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <h2 class="font-display text-xl font-black tracking-[-0.03em] text-[#404345]">{{ card.name }}</h2>
                  <p class="mt-0.5 text-xs text-[#6a6e6a]">{{ card.subtitle }}</p>
                </div>
                <p class="shrink-0 text-lg font-bold text-[#6a6e6a]">{{ card.price }}</p>
              </div>

              <!-- Categories preview tags -->
              <div class="mt-3 flex flex-wrap items-center gap-1.5">
                <span
                  v-for="cat in card.categories"
                  :key="cat"
                  class="border border-[#cfd2ce] bg-[#f5f6f4] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#6a6e6a]"
                >
                  {{ cat }}
                </span>
              </div>

              <!-- Disabled indicator row -->
              <div
                class="mt-5 mt-auto flex h-12 w-full items-center justify-center border px-5 text-sm font-semibold select-none"
                :class="card.status === 'out_of_stock' ? 'border-[#b94d27]/30 bg-[#fdf2ef] text-[#963a20]' : 'border-[#cfd2ce] bg-[#f1f3f0] text-[#8e938e]'"
              >
                {{ card.status === 'out_of_stock' ? 'Temporarily Out of Stock' : 'Available Soon' }}
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- How it works strip -->
      <section class="mt-10 grid border border-[#bfc3bf] bg-[#292b2d] text-white sm:grid-cols-3" aria-label="How KickCraft works">
        <div class="border-b border-white/20 p-5 sm:border-b-0 sm:border-r"><p class="font-display font-bold">1. Customize</p><p class="mt-1 text-sm text-white/65">Color the editable parts.</p></div>
        <div class="border-b border-white/20 p-5 sm:border-b-0 sm:border-r"><p class="font-display font-bold">2. Inspect</p><p class="mt-1 text-sm text-white/65">Rotate and zoom the 3D model before choosing a size.</p></div>
        <div class="p-5"><p class="font-display font-bold">3. Reserve</p><p class="mt-1 text-sm text-white/65">Place your design reservation for in-store pickup.</p></div>
      </section>
    </main>

    <!-- ══════════════════════════════════════════════════════ -->
    <!-- STUDIO VIEW — viewport-locked, right panel scrollable  -->
    <!-- ══════════════════════════════════════════════════════ -->
    <div
      v-else-if="view === 'studio'"
      class="mx-auto max-w-[1480px] flex-col px-5 py-5 lg:px-8 lg:py-6"
    >
      <!-- Studio Breadcrumb -->
      <nav class="mb-4 flex items-center gap-2 text-xs font-bold text-[#5f635f]" aria-label="Studio Breadcrumb">
        <button type="button" class="transition-colors hover:text-[#202220] hover:underline" @click="goToShop">
          ← Back to Catalog
        </button>
        <span class="text-[#cfd2ce]">/</span>
        <span class="text-[#202220]">{{ selectedShoe.name }}</span>
      </nav>

      <!-- Compact title row -->
      <div class="mb-4 flex flex-wrap items-end justify-between gap-3 shrink-0">
        <div>
          <p class="text-xs font-semibold text-[#6a6e6a]">{{ selectedShoe.name }} · Design studio</p>
          <h1 class="font-display text-2xl font-black leading-tight tracking-[-0.04em] text-[#202220] sm:text-3xl">Shape the color. Keep the character.</h1>
        </div>
      </div>

      <!-- Studio panel: 3D viewer + customization -->
      <section class="grid border border-[#bfc3bf] bg-[#fcfdfb] lg:grid-cols-[minmax(0,1.55fr)_minmax(360px,.72fr)]">

        <!-- 3D viewer — fixed tall height so the full shoe is always visible -->
        <div class="relative border-b border-[#bfc3bf] bg-[#e9ece9] lg:border-b-0 lg:border-r" style="height:580px;">
          <model-viewer
            ref="modelViewer"
            :src="selectedShoe.src"
            :alt="`Interactive customizable 3D ${selectedShoe.name}`"
            camera-controls
            touch-action="pan-y"
            shadow-intensity="1"
            shadow-softness="1"
            exposure="1"
            environment-image="neutral"
            interaction-prompt="auto"
            style="width:100%;height:100%;position:absolute;inset:0;"
            @load="handleModelLoad"
            @error="handleModelError"
          >
            <extra-model
              v-for="charm in charmModels"
              :key="charm.id"
              :src="charm.src"
              :offset="selectedShoe.charmOffset"
              :scale="charmScale(charm.id, selectedCharmId, selectedShoe.charmScale)"
            />
          </model-viewer>

          <div v-if="!modelReady && !modelError" class="pointer-events-none absolute inset-0 grid place-items-center bg-[#e9ece9]/90" role="status">
            <div class="flex items-center gap-3 border border-[#bfc3bf] bg-[#fcfdfb] px-4 py-3 text-sm font-semibold">
              <span class="size-3 animate-pulse bg-[#b94d27]" />
              Loading customizable shoe
            </div>
          </div>

          <div v-if="modelError" class="absolute inset-0 grid place-items-center bg-[#e9ece9] p-8" role="alert">
            <div class="max-w-md border-l-4 border-[#b94d27] bg-[#fcfdfb] p-5">
              <h2 class="font-display text-lg font-bold">3D model unavailable</h2>
              <p class="mt-2 text-sm leading-6 text-[#5f635f]">{{ modelError }}</p>
            </div>
          </div>

          <div class="pointer-events-none absolute left-4 top-4 flex items-center gap-2 bg-[#fcfdfb]/95 px-3 py-2 text-xs font-semibold">
            <span class="size-2" :class="modelReady ? 'bg-[#3f7652]' : 'bg-[#9b9f9b]'" />
            {{ modelReady ? '3D model ready' : 'Preparing model' }}
          </div>
          <div class="pointer-events-none absolute bottom-4 left-4 bg-[#292b2d]/90 px-3 py-2 text-xs font-semibold text-white">Drag to rotate · Scroll to zoom</div>
        </div>

        <!-- Right panel — customization controls -->
        <div class="flex flex-col">
          <!-- Product header -->
          <div class="shrink-0 border-b border-[#d9dcd8] p-5 lg:p-6">
            <div class="flex items-start justify-between gap-4">
              <div>
                <h2 class="font-display text-2xl font-black tracking-[-0.04em] text-[#202220]">{{ selectedShoe.name }}</h2>
                <p class="mt-1 text-sm leading-6 text-[#626662]">{{ selectedShoe.description }}</p>
              </div>
              <p class="shrink-0 text-xl font-black text-[#b94d27]">{{ selectedShoe.price }}</p>
            </div>
          </div>

          <!-- Customization controls -->
          <div class="space-y-5 p-5 lg:p-6">
            <!-- Part selector -->
            <fieldset :disabled="!modelReady">
              <div class="mb-3 flex items-center justify-between gap-4">
                <legend class="font-display text-base font-bold">Customize part</legend>
                <span class="text-xs font-semibold text-[#696d69]">Editing: {{ selectedPart.label }}</span>
              </div>
              <div class="grid grid-cols-2 gap-2">
                <button
                  v-for="part in selectedParts"
                  :key="part.id"
                  type="button"
                  class="flex min-h-10 items-center justify-between border px-3 text-left text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#245fa8]"
                  :class="selectedPartId === part.id ? 'border-[#292b2d] bg-[#292b2d] text-white' : 'border-[#c5c9c5] bg-white hover:border-[#6f746f]'"
                  :aria-pressed="selectedPartId === part.id"
                  @click="selectedPartId = part.id"
                >
                  {{ part.label }}
                  <span class="size-3 border border-current/25" :style="{ backgroundColor: partColors[part.id]?.value || '#ffffff' }" />
                </button>
              </div>
            </fieldset>

            <!-- Color picker -->
            <fieldset :disabled="!modelReady">
              <div class="mb-3 flex items-center justify-between gap-4">
                <legend class="font-display text-base font-bold">Choose color</legend>
                <span class="text-xs font-semibold text-[#696d69]">{{ selectedColor?.name || 'Neutral' }}</span>
              </div>
              <div class="grid grid-cols-3 gap-2">
                <button
                  v-for="color in shoeColors"
                  :key="color.name"
                  type="button"
                  class="flex min-h-11 items-center gap-2 border bg-white px-2.5 text-left text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#245fa8]"
                  :class="selectedColor?.value === color.value ? 'border-[#292b2d] ring-1 ring-[#292b2d]' : 'border-[#c5c9c5] hover:border-[#6f746f]'"
                  :aria-pressed="selectedColor?.value === color.value"
                  @click="chooseColor(color)"
                >
                  <span class="size-5 shrink-0 border border-black/15" :style="{ backgroundColor: color.value }" />
                  {{ color.name }}
                </button>
              </div>
            </fieldset>

            <!-- Charm / accessory selector -->
            <fieldset :disabled="!modelReady">
              <div class="mb-3 flex items-center justify-between gap-4">
                <legend class="font-display text-base font-bold">Add accessory</legend>
                <span class="text-xs font-semibold text-[#696d69]">{{ selectedCharm.label }}</span>
              </div>
              <div class="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
                <button
                  v-for="charm in CHARMS"
                  :key="charm.id"
                  type="button"
                  class="min-h-10 border px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#245fa8]"
                  :class="selectedCharmId === charm.id ? 'border-[#292b2d] bg-[#292b2d] text-white' : 'border-[#c5c9c5] bg-white hover:border-[#6f746f]'"
                  :aria-pressed="selectedCharmId === charm.id"
                  @click="selectedCharmId = charm.id"
                >{{ charm.label }}</button>
              </div>
            </fieldset>

            <!-- Reset / summary row -->
            <div class="flex items-center justify-between border-y border-[#d9dcd8] py-3 text-sm">
              <span><strong>{{ customizedCount }}</strong> of {{ selectedParts.length }} parts · {{ selectedCharm.label }} accessory</span>
              <button
                type="button"
                class="font-semibold text-[#245fa8] underline underline-offset-4 disabled:cursor-not-allowed disabled:text-[#9b9f9b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#245fa8]"
                :disabled="!modelReady || customizedCount === 0"
                @click="requestResetDesign"
              >Reset design</button>
            </div>

            <!-- Size selector -->
            <fieldset>
              <div class="mb-3 flex items-center justify-between">
                <legend class="font-display text-base font-bold">Select size</legend>
                <span class="text-xs text-[#696d69]">US sizing</span>
              </div>
              <div class="grid grid-cols-5 gap-2">
                <button
                  v-for="size in sizes"
                  :key="size"
                  type="button"
                  class="h-10 border text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#245fa8]"
                  :class="selectedSize === size ? 'border-[#b94d27] bg-[#fff3ed] text-[#8f361b]' : 'border-[#c5c9c5] bg-white hover:border-[#6f746f]'"
                  :aria-pressed="selectedSize === size"
                  @click="selectedSize = size"
                >{{ size }}</button>
              </div>
            </fieldset>
          </div>

          <!-- Reservation CTA — pinned to bottom of panel -->
          <div class="mt-auto shrink-0 border-t border-[#d9dcd8] bg-[#f1f3f0] p-5 lg:p-6">
            <p class="mb-2 text-sm text-[#5f635f]">Pickup reservation · Your colors, accessory, and size are included.</p>
            <label class="mb-3 flex items-center gap-2 cursor-pointer select-none text-xs text-[#5f635f]">
              <input
                v-model="rememberGuestProfile"
                type="checkbox"
                class="size-4 accent-[#292b2d]"
              />
              <span>Remember my contact details on this device</span>
            </label>
            <button
              type="button"
              class="h-12 w-full bg-[#b94d27] px-5 font-bold text-white hover:bg-[#963a20] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#245fa8]"
              @click="openReservation"
            >Reserve this design</button>
          </div>
        </div>
      </section>

      <!-- ── Marketing / product description ──────────────── -->
      <div class="mt-px grid gap-px border-x border-b border-[#bfc3bf] bg-[#bfc3bf] lg:grid-cols-2">

        <!-- About the shoe -->
        <div class="bg-[#fcfdfb] p-7 lg:p-9">
          <p class="mb-1 text-xs font-semibold uppercase tracking-widest text-[#b94d27]">About this shoe</p>
          <h2 class="font-display mt-2 text-2xl font-black tracking-[-0.04em] text-[#202220] lg:text-3xl">Choose a look that fits you.</h2>
          <p class="mt-4 text-sm leading-7 text-[#5f635f]">
            {{ selectedShoe.name }} gives customers {{ selectedParts.length }} editable zones. The remaining shoe details stay fixed so the editing stays quick.
          </p>
          <p class="mt-3 text-sm leading-7 text-[#5f635f]">
            Rotate the model to inspect your color choices from every angle before you commit. Add a charm near the laces, choose a size, and place your reservation for pickup.
          </p>
        </div>

        <!-- Feature list -->
        <div class="bg-[#f5f6f4] p-7 lg:p-9">
          <p class="mb-1 text-xs font-semibold uppercase tracking-widest text-[#b94d27]">What you're designing</p>
          <h2 class="font-display mt-2 text-2xl font-black tracking-[-0.04em] text-[#202220] lg:text-3xl">{{ selectedParts.length }} zones. Your combination.</h2>
          <ul class="mt-5 space-y-3">
            <li v-for="part in selectedParts" :key="part.id" class="flex items-center gap-3 text-sm">
              <span
                class="size-4 shrink-0 border border-black/10"
                :style="{ backgroundColor: partColors[part.id]?.value || '#e9ece9' }"
              />
              <span class="font-semibold text-[#292b2d]">{{ part.label }}</span>
              <span class="text-[#6a6e6a]">—</span>
              <span class="text-[#5f635f]">{{ partColors[part.id]?.name || 'Original color' }}</span>
            </li>
          </ul>
        </div>

      </div>

      <!-- ── Why KickCraft strip ──────────────────────────── -->
      <div class="grid border-x border-b border-[#bfc3bf] bg-[#292b2d] text-white sm:grid-cols-3">
        <div class="border-b border-white/20 p-6 sm:border-b-0 sm:border-r">
          <p class="font-display text-base font-bold">Fixed details</p>
          <p class="mt-1.5 text-sm leading-6 text-white/65">Style the editable zones while the remaining shoe details stay fixed.</p>
        </div>
        <div class="border-b border-white/20 p-6 sm:border-b-0 sm:border-r">
          <p class="font-display text-base font-bold">Live 3D preview</p>
          <p class="mt-1.5 text-sm leading-6 text-white/65">See your color choices applied in real time on the actual 3D model — not a flat mockup or a filtered photo.</p>
        </div>
        <div class="p-6">
          <p class="font-display text-base font-bold">In-store pickup</p>
          <p class="mt-1.5 text-sm leading-6 text-white/65">Reserve your exact design online and pick it up at the KickCraft store — no shipping wait, no surprises.</p>
        </div>
      </div>

    </div>

    <!-- ══════════════════════════════════════════════════════ -->
    <!-- OWNER ADMIN PORTAL VIEW                                 -->
    <!-- ══════════════════════════════════════════════════════ -->
    <AdminPanel
      v-else-if="view === 'admin'"
      :current-user="currentUser"
      @back-to-shop="goToShop"
      @open-studio="goToStudio"
      @shoes-changed="onShoesChanged"
    />

    <!-- ══════════════════════════════════════════════════════ -->
    <!-- LOGIN VIEW                                             -->
    <!-- ══════════════════════════════════════════════════════ -->
    <main v-else-if="view === 'login'" class="mx-auto max-w-md px-5 py-12 lg:py-16">
      <div class="border border-[#bfc3bf] bg-[#fcfdfb] p-6 sm:p-8">

        <!-- Back to shop link -->
        <button
          type="button"
          class="mb-6 inline-flex items-center gap-1.5 text-xs font-semibold text-[#5f635f] transition-colors hover:text-[#202220] focus-visible:outline-2 focus-visible:outline-[#245fa8]"
          @click="goToShop"
        >
          <svg class="size-3.5" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M9 2L4 7l5 5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Back to shop
        </button>

        <!-- Header -->
        <div class="border-b border-[#d9dcd8] pb-4">
          <div class="flex items-center gap-2">
            <span class="grid size-7 place-items-center bg-[#292b2d] text-xs font-black text-white">K</span>
            <span class="font-display text-base font-extrabold tracking-[-0.03em]">KickCraft</span>
          </div>
          <h1 class="font-display mt-3 text-2xl font-black tracking-[-0.03em] text-[#202220]">
            Log in to KickCraft
          </h1>
          <p class="mt-1 text-xs text-[#6a6e6a]">
            Access your saved shoe customizations or management portal.
          </p>
        </div>

        <!-- Role Toggle (Customer vs Owner/Admin) -->
        <div class="mt-5">
          <label class="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#404345]">Account Type</label>
          <div class="grid grid-cols-2 gap-2 text-xs font-bold">
            <button
              type="button"
              class="h-10 border text-center transition-colors focus-visible:outline-2 focus-visible:outline-[#245fa8]"
              :class="authRole === 'customer'
                ? 'border-[#292b2d] bg-[#292b2d] text-white'
                : 'border-[#bfc3bf] bg-white text-[#5f635f] hover:border-[#292b2d]'"
              @click="authRole = 'customer'; loginFeedback = ''; loginError = ''"
            >
              Customer
            </button>
            <button
              type="button"
              class="h-10 border text-center transition-colors focus-visible:outline-2 focus-visible:outline-[#245fa8]"
              :class="authRole === 'owner'
                ? 'border-[#292b2d] bg-[#292b2d] text-white'
                : 'border-[#bfc3bf] bg-white text-[#5f635f] hover:border-[#292b2d]'"
              @click="authRole = 'owner'; loginFeedback = ''; loginError = ''"
            >
              Owner / Admin
            </button>
          </div>
        </div>

        <!-- Feedback alerts -->
        <div v-if="loginFeedback" class="mt-4 border border-[#3f7652]/30 bg-[#edf5f0] p-3 text-xs text-[#2a593a]">
          {{ loginFeedback }}
        </div>
        <div v-if="loginError" class="mt-4 border border-[#b94d27]/30 bg-[#fdf2ef] p-3 text-xs text-[#963a20]">
          {{ loginError }}
        </div>

        <!-- Login form -->
        <form class="mt-5 space-y-4" @submit.prevent="handleLoginSubmit">
          <label class="block">
            <span class="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#404345]">Email address</span>
            <input
              v-model="loginEmail"
              required
              type="email"
              autocomplete="email"
              placeholder="user@kickcraft.local"
              class="h-11 w-full border border-[#bfc3bf] bg-white px-3 text-sm outline-none transition-colors focus:border-[#245fa8] focus:ring-1 focus:ring-[#245fa8]"
            />
          </label>

          <label class="block">
            <div class="mb-1.5 flex items-center justify-between">
              <span class="text-xs font-bold uppercase tracking-wider text-[#404345]">Password</span>
            </div>
            <div class="relative">
              <input
                v-model="loginPassword"
                required
                :type="showLoginPassword ? 'text' : 'password'"
                autocomplete="current-password"
                placeholder="••••••••"
                class="h-11 w-full border border-[#bfc3bf] bg-white px-3 pr-10 text-sm outline-none transition-colors focus:border-[#245fa8] focus:ring-1 focus:ring-[#245fa8]"
              />
              <button
                type="button"
                class="absolute inset-y-0 right-0 flex items-center px-3 text-[#5f635f] hover:text-[#202220] focus-visible:outline-2 focus-visible:outline-[#245fa8]"
                :aria-label="showLoginPassword ? 'Hide password' : 'Show password'"
                @click="showLoginPassword = !showLoginPassword"
              >
                <svg v-if="!showLoginPassword" class="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                <svg v-else class="size-4 text-[#b94d27]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                </svg>
              </button>
            </div>
          </label>

          <div class="flex items-center justify-between text-xs">
            <label class="flex items-center gap-2 cursor-pointer select-none">
              <input v-model="loginRemember" type="checkbox" class="size-4 accent-[#292b2d]" />
              <span class="text-[#5f635f]">Remember me</span>
            </label>
          </div>

          <button
            type="submit"
            :disabled="isLoggingIn"
            class="h-12 w-full bg-[#292b2d] font-bold text-white transition-colors hover:bg-[#404345] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-[#245fa8]"
          >
            {{ isLoggingIn ? 'Signing in…' : `Sign In as ${authRole === 'owner' ? 'Owner / Admin' : 'Customer'}` }}
          </button>
        </form>

        <!-- Register link (for customers) -->
        <div class="mt-6 border-t border-[#d9dcd8] pt-4 text-center text-xs text-[#6a6e6a]">
          <template v-if="authRole === 'customer'">
            Don't have an account?
            <button
              type="button"
              class="font-bold text-[#b94d27] underline hover:text-[#963a20] focus-visible:outline-2 focus-visible:outline-[#245fa8]"
              @click="goToRegister"
            >
              Create customer account
            </button>
          </template>
          <template v-else>
            <p class="text-[11px] text-[#8e938e]">Owner and store manager portal requires administrative credentials.</p>
          </template>
        </div>

        <!-- Backend notice -->
        <div class="mt-4 bg-[#f1f3f0] p-3 text-center text-[10px] text-[#6a6e6a]">
          Backend architecture: Prepared for <span class="font-semibold text-[#202220]">PHP / MySQL API</span> (<code class="text-[#b94d27]">POST /api/auth/login.php</code>)
        </div>

      </div>
    </main>

    <!-- ══════════════════════════════════════════════════════ -->
    <!-- REGISTER VIEW                                          -->
    <!-- ══════════════════════════════════════════════════════ -->
    <main v-else-if="view === 'register'" class="mx-auto max-w-md px-5 py-12 lg:py-16">
      <div class="border border-[#bfc3bf] bg-[#fcfdfb] p-6 sm:p-8">

        <!-- Back to shop link -->
        <button
          type="button"
          class="mb-6 inline-flex items-center gap-1.5 text-xs font-semibold text-[#5f635f] transition-colors hover:text-[#202220] focus-visible:outline-2 focus-visible:outline-[#245fa8]"
          @click="goToShop"
        >
          <svg class="size-3.5" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M9 2L4 7l5 5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Back to shop
        </button>

        <!-- Header -->
        <div class="border-b border-[#d9dcd8] pb-4">
          <div class="flex items-center gap-2">
            <span class="grid size-7 place-items-center bg-[#b94d27] text-xs font-black text-white">K</span>
            <span class="font-display text-base font-extrabold tracking-[-0.03em]">KickCraft</span>
          </div>
          <h1 class="font-display mt-3 text-2xl font-black tracking-[-0.03em] text-[#202220]">
            Create an Account
          </h1>
          <p class="mt-1 text-xs text-[#6a6e6a]">
            Register as a customer to track your customized shoes and in-store pickup reservations.
          </p>
        </div>

        <!-- Feedback alerts -->
        <div v-if="registerFeedback" class="mt-4 border border-[#3f7652]/30 bg-[#edf5f0] p-3 text-xs text-[#2a593a]">
          {{ registerFeedback }}
        </div>
        <div v-if="registerError" class="mt-4 border border-[#b94d27]/30 bg-[#fdf2ef] p-3 text-xs text-[#963a20]">
          {{ registerError }}
        </div>

        <!-- Register form -->
        <form class="mt-5 space-y-4" @submit.prevent="handleRegisterSubmit">
          <label class="block">
            <span class="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#404345]">Full name</span>
            <input
              v-model="registerName"
              required
              type="text"
              autocomplete="name"
              placeholder="Juan dela Cruz"
              class="h-11 w-full border border-[#bfc3bf] bg-white px-3 text-sm outline-none transition-colors focus:border-[#245fa8] focus:ring-1 focus:ring-[#245fa8]"
            />
          </label>

          <label class="block">
            <span class="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#404345]">Email address</span>
            <input
              v-model="registerEmail"
              required
              type="email"
              autocomplete="email"
              placeholder="name@example.com"
              class="h-11 w-full border border-[#bfc3bf] bg-white px-3 text-sm outline-none transition-colors focus:border-[#245fa8] focus:ring-1 focus:ring-[#245fa8]"
            />
          </label>

          <label class="block">
            <span class="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#404345]">Password</span>
            <div class="relative">
              <input
                v-model="registerPassword"
                required
                :type="showRegisterPassword ? 'text' : 'password'"
                autocomplete="new-password"
                placeholder="Minimum 6 characters"
                class="h-11 w-full border border-[#bfc3bf] bg-white px-3 pr-10 text-sm outline-none transition-colors focus:border-[#245fa8] focus:ring-1 focus:ring-[#245fa8]"
              />
              <button
                type="button"
                class="absolute inset-y-0 right-0 flex items-center px-3 text-[#5f635f] hover:text-[#202220] focus-visible:outline-2 focus-visible:outline-[#245fa8]"
                :aria-label="showRegisterPassword ? 'Hide password' : 'Show password'"
                @click="showRegisterPassword = !showRegisterPassword"
              >
                <svg v-if="!showRegisterPassword" class="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                <svg v-else class="size-4 text-[#b94d27]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                </svg>
              </button>
            </div>
          </label>

          <label class="block">
            <span class="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#404345]">Confirm password</span>
            <div class="relative">
              <input
                v-model="registerConfirmPassword"
                required
                :type="showRegisterConfirmPassword ? 'text' : 'password'"
                autocomplete="new-password"
                placeholder="Repeat your password"
                class="h-11 w-full border border-[#bfc3bf] bg-white px-3 pr-10 text-sm outline-none transition-colors focus:border-[#245fa8] focus:ring-1 focus:ring-[#245fa8]"
              />
              <button
                type="button"
                class="absolute inset-y-0 right-0 flex items-center px-3 text-[#5f635f] hover:text-[#202220] focus-visible:outline-2 focus-visible:outline-[#245fa8]"
                :aria-label="showRegisterConfirmPassword ? 'Hide password' : 'Show password'"
                @click="showRegisterConfirmPassword = !showRegisterConfirmPassword"
              >
                <svg v-if="!showRegisterConfirmPassword" class="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                <svg v-else class="size-4 text-[#b94d27]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                </svg>
              </button>
            </div>
          </label>

          <label class="flex items-start gap-2 pt-1 text-xs cursor-pointer select-none">
            <input v-model="registerAgreed" required type="checkbox" class="mt-0.5 size-4 accent-[#292b2d]" />
            <span class="text-[#5f635f]">
              I agree to the KickCraft custom shoe reservation and in-store pickup policies.
            </span>
          </label>

          <button
            type="submit"
            :disabled="isRegistering"
            class="h-12 w-full bg-[#b94d27] font-bold text-white transition-colors hover:bg-[#963a20] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-[#245fa8]"
          >
            {{ isRegistering ? 'Creating account…' : 'Create Customer Account' }}
          </button>
        </form>

        <!-- Login link -->
        <div class="mt-6 border-t border-[#d9dcd8] pt-4 text-center text-xs text-[#6a6e6a]">
          Already have an account?
          <button
            type="button"
            class="font-bold text-[#245fa8] underline hover:text-[#184478] focus-visible:outline-2 focus-visible:outline-[#245fa8]"
            @click="goToLogin('customer')"
          >
            Log in here
          </button>
        </div>

        <!-- Backend notice -->
        <div class="mt-4 bg-[#f1f3f0] p-3 text-center text-[10px] text-[#6a6e6a]">
          Backend architecture: Prepared for <span class="font-semibold text-[#202220]">PHP / MySQL API</span> (<code class="text-[#b94d27]">POST /api/auth/register.php</code>)
        </div>

      </div>
    </main>

    <!-- ══════════════════════════════════════════════════════ -->
    <!-- MY RESERVATIONS VIEW (CUSTOMER)                        -->
    <!-- ══════════════════════════════════════════════════════ -->
    <main v-else-if="view === 'reservations'" class="mx-auto max-w-[1480px] px-5 py-10 lg:px-8 lg:py-14">
      <!-- Back to shop link -->
      <button
        type="button"
        class="mb-6 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#6a6e6a] transition-colors hover:text-[#202220] focus-visible:outline-2 focus-visible:outline-[#245fa8]"
        @click="goToShop"
      >
        <svg class="size-3.5" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path d="M9 2L4 7l5 5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Back to shop
      </button>

      <!-- Header -->
      <div class="mb-10 flex flex-col justify-between gap-4 border-b border-[#cfd2ce] pb-8 sm:flex-row sm:items-end">
        <div>
          <div class="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#6a6e6a]">
            <span>Customer Account</span>
            <span>•</span>
            <span class="text-[#b94d27]">Pickup History</span>
          </div>
          <h1 class="font-display text-3xl font-black tracking-[-0.04em] text-[#202220] sm:text-4xl">
            My Pickup Reservations
          </h1>
          <p class="mt-2 max-w-2xl text-sm leading-6 text-[#5f635f]">
            Review your customized shoes, track live preparation status, and present your receipt reference in-store for pickup.
          </p>
        </div>
        <div class="flex items-center gap-3">
          <button
            type="button"
            class="inline-flex items-center gap-2 border border-[#bfc3bf] bg-[#fcfdfb] px-4 py-2.5 text-xs font-bold text-[#292b2d] hover:border-[#292b2d] focus-visible:outline-2 focus-visible:outline-[#245fa8]"
            :disabled="isLoadingReservations"
            @click="fetchMyReservations"
          >
            <svg class="size-3.5" :class="{ 'animate-spin': isLoadingReservations }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 12a9 9 0 11-6.219-8.56"/>
            </svg>
            Refresh
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-2 bg-[#292b2d] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#1a1b1c] focus-visible:outline-2 focus-visible:outline-[#245fa8]"
            @click="goToShop"
          >
            Design Another Shoe
          </button>
        </div>
      </div>

      <!-- Loading state -->
      <div v-if="isLoadingReservations && myReservations.length === 0" class="py-16 text-center">
        <div class="inline-block size-8 animate-spin rounded-full border-2 border-[#292b2d] border-t-transparent"></div>
        <p class="mt-4 text-xs font-bold uppercase tracking-wider text-[#6a6e6a]">Loading reservations…</p>
      </div>

      <!-- Error feedback -->
      <div v-if="reservationsError" class="mb-6 border border-[#b94d27]/40 bg-[#fdf2ef] p-4 text-sm text-[#963a20]">
        <div class="font-bold">Unable to load reservations</div>
        <p class="mt-1 text-xs">{{ reservationsError }}</p>
      </div>

      <!-- Empty state -->
      <div
        v-if="myReservations.length === 0 && !isLoadingReservations"
        class="border border-[#cfd2ce] bg-[#fcfdfb] p-10 text-center sm:p-16"
      >
        <div class="mx-auto grid size-12 place-items-center bg-[#292b2d] text-lg font-black text-white">
          K
        </div>
        <h2 class="font-display mt-5 text-xl font-black tracking-tight text-[#202220] sm:text-2xl">
          You haven't reserved any custom shoes yet.
        </h2>
        <p class="mx-auto mt-2 max-w-md text-sm leading-6 text-[#5f635f]">
          Explore our original silhouettes in the 3D Studio, recolor individual parts, attach a custom charm, and reserve your unique pair for pickup.
        </p>
        <div class="mt-6">
          <button
            type="button"
            class="inline-flex items-center gap-2 bg-[#b94d27] px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-[#963a20] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#245fa8]"
            @click="goToStudio('kickcraft-one')"
          >
            Start Designing in 3D Studio
          </button>
        </div>
      </div>

      <!-- Reservations Card Grid -->
      <div v-else-if="myReservations.length > 0" class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <article
          v-for="reservation in myReservations"
          :key="reservation.id"
          class="flex flex-col border border-[#bfc3bf] bg-[#fcfdfb] transition-shadow hover:shadow-md"
        >
          <!-- Receipt Header & Status Badge -->
          <div class="flex items-center justify-between border-b border-[#e2e5e1] bg-[#f5f6f4] px-4 py-3">
            <div>
              <span class="block text-[10px] font-bold uppercase tracking-wider text-[#6a6e6a]">Receipt Reference</span>
              <span class="font-mono text-sm font-black text-[#202220]">{{ reservation.id }}</span>
            </div>
            <!-- Live Status Badge -->
            <span
              class="inline-flex items-center gap-1.5 border px-2.5 py-1 text-xs font-bold"
              :class="[
                getReservationStatusBadge(reservation.status).bgClass,
                getReservationStatusBadge(reservation.status).textClass,
                getReservationStatusBadge(reservation.status).borderClass,
              ]"
            >
              <span class="size-1.5 rounded-full" :class="getReservationStatusBadge(reservation.status).dotClass"></span>
              {{ getReservationStatusBadge(reservation.status).label }}
            </span>
          </div>

          <!-- Pickup date strip -->
          <div class="flex items-center justify-between border-b border-[#e2e5e1] bg-[#fcfdfb] px-4 py-2.5 text-xs">
            <span class="font-semibold text-[#5f635f]">Scheduled Pickup</span>
            <span class="flex items-center gap-1.5 font-bold text-[#202220]">
              <span class="size-2 rounded-full bg-[#245fa8]"></span>
              {{ reservation.pickupDate }}
            </span>
          </div>

          <!-- Shoe Thumbnail & Details -->
          <div class="flex items-center gap-4 border-b border-[#e2e5e1] p-4">
            <div class="grid size-20 shrink-0 place-items-center border border-[#d9dcd8] bg-[#f5f6f4] p-1">
              <img
                :src="getReservationShoeImage(reservation)"
                :alt="getReservationShoeName(reservation)"
                class="max-h-full max-w-full object-contain"
              />
            </div>
            <div class="min-w-0 flex-1">
              <h3 class="font-display truncate text-base font-black text-[#202220]">
                {{ getReservationShoeName(reservation) }}
              </h3>
              <div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#5f635f]">
                <span class="font-medium text-[#202220]">US {{ reservation.size }}</span>
                <span>•</span>
                <span class="font-bold text-[#202220]">{{ reservation.formattedPrice || '₱4,890' }}</span>
                <span>•</span>
                <span class="font-medium text-[#245fa8]">
                  {{ reservation.charmLabel || (reservation.charmId && reservation.charmId !== 'none' ? reservation.charmId : 'No accessory') }}
                </span>
              </div>
            </div>
          </div>

          <!-- 3D Customized Part Color Swatches -->
          <div class="flex-1 border-b border-[#e2e5e1] p-4">
            <h4 class="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-[#6a6e6a]">
              Customized Parts
            </h4>
            <div
              v-if="reservation.partColors && Object.keys(reservation.partColors).length > 0"
              class="grid grid-cols-2 gap-2 text-xs"
            >
              <div
                v-for="(colorInfo, partKey) in reservation.partColors"
                :key="partKey"
                class="flex items-center gap-2 border border-[#e2e5e1] bg-[#f5f6f4] px-2 py-1.5"
              >
                <span
                  class="size-3.5 shrink-0 border border-black/10"
                  :style="{ backgroundColor: normalizeColorInfo(colorInfo).value }"
                />
                <div class="min-w-0 flex-1 truncate">
                  <span class="font-semibold text-[#202220]">{{ formatPartName(partKey) }}: </span>
                  <span class="text-[#5f635f]">{{ normalizeColorInfo(colorInfo).name }}</span>
                </div>
              </div>
            </div>
            <div v-else class="text-xs italic text-[#6a6e6a]">
              Standard factory colorway
            </div>

            <!-- Store Cancellation Reason Callout -->
            <div
              v-if="reservation.status === 'cancelled' && reservation.notes"
              class="mt-3 border-l-2 border-[#b94d27] bg-[#fdf2ef] p-2.5 text-xs text-[#963a20]"
            >
              <span class="block text-[10px] font-bold uppercase tracking-wider text-[#963a20]">Store Cancellation Reason:</span>
              <p class="mt-0.5 text-xs text-[#202220]">{{ reservation.notes }}</p>
            </div>
          </div>

          <!-- Store Pickup Notice & Self-Cancellation Action -->
          <div class="border-t border-[#e2e5e1] bg-[#f5f6f4] p-4 text-xs text-[#5f635f]">
            <div class="flex items-start gap-2">
              <svg class="mt-0.5 size-4 shrink-0 text-[#245fa8]" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" />
              </svg>
              <p class="leading-relaxed">
                Please present this receipt reference at <strong class="text-[#202220]">123 Craft Studio Way, Manila</strong> on or before your pickup date.
              </p>
            </div>
            <div v-if="reservation.status === 'pending'" class="mt-3 flex justify-end border-t border-[#e2e5e1] pt-3">
              <button
                v-if="reservation.status === 'pending'"
                type="button"
                class="border border-[#b94d27] px-3 py-1.5 text-xs font-bold text-[#b94d27] transition-colors hover:bg-[#b94d27] hover:text-white focus-visible:outline-2 focus-visible:outline-[#b94d27]"
                @click="requestCancelCustomerReservation(reservation)"
              >
                Cancel Reservation
              </button>
            </div>
          </div>
        </article>
      </div>
    </main>

    <!-- ══════════════════════════════════════════════════════ -->
    <!-- 404 NOT FOUND / BRUTE-FORCE PROTECTION VIEW            -->
    <!-- ══════════════════════════════════════════════════════ -->
    <main v-else-if="view === 'not-found'" class="mx-auto max-w-2xl px-5 py-16 lg:py-24">
      <div class="border-2 border-[#202220] bg-[#fcfdfb] p-8 shadow-[8px_8px_0px_0px_#202220] sm:p-12">
        <!-- Brutalist Tag -->
        <div class="inline-flex items-center gap-2 border border-[#b94d27] bg-[#fdf2ef] px-3 py-1 font-mono text-xs font-bold uppercase tracking-widest text-[#b94d27]">
          <span>[ 404 · PAGE NOT FOUND · ACCESS RESTRICTED ]</span>
        </div>

        <!-- Heading -->
        <h1 class="font-display mt-6 text-6xl font-black tracking-tight text-[#202220] sm:text-7xl">
          404
        </h1>

        <h2 class="font-display mt-2 text-xl font-black uppercase tracking-tight text-[#202220] sm:text-2xl">
          Silhouette or Route Not Located
        </h2>

        <!-- Attempted Destination Box -->
        <div class="mt-5 border-l-4 border-[#b94d27] bg-[#f5f6f4] p-4 font-mono text-xs text-[#5f635f]">
          <span class="block font-bold uppercase tracking-wider text-[#202220]">Attempted Destination:</span>
          <code class="mt-1 block break-all text-sm font-bold text-[#b94d27]">{{ notFoundPath || '/admin' }}</code>
        </div>

        <p class="mt-5 text-sm leading-relaxed text-[#5f635f]">
          The address you requested does not exist or requires authenticated owner privileges. URL manipulation and unauthorized route tampering are restricted.
        </p>

        <!-- Navigation Actions -->
        <div class="mt-8 flex flex-wrap items-center gap-3 border-t border-[#d9dcd8] pt-6">
          <button
            type="button"
            class="inline-flex h-11 items-center justify-center bg-[#202220] px-6 text-xs font-bold uppercase tracking-wider text-white transition-colors hover:bg-[#404345] focus-visible:outline-2 focus-visible:outline-[#245fa8]"
            @click="goToShop"
          >
            ← Return to Catalog
          </button>
          <button
            type="button"
            class="inline-flex h-11 items-center justify-center border-2 border-[#202220] bg-white px-5 text-xs font-bold uppercase tracking-wider text-[#202220] transition-colors hover:bg-[#f1f3f0] focus-visible:outline-2 focus-visible:outline-[#245fa8]"
            @click="goToStudio('kickcraft-one')"
          >
            Open 3D Studio
          </button>
          <button
            v-if="!currentUser"
            type="button"
            class="inline-flex h-11 items-center justify-center border border-transparent px-4 text-xs font-bold uppercase tracking-wider text-[#b94d27] hover:underline focus-visible:outline-2 focus-visible:outline-[#245fa8]"
            @click="goToLogin('owner')"
          >
            Owner Sign In →
          </button>
        </div>
      </div>
    </main>

    <!-- ── Footer ───────────────────────────────────────────── -->
    <footer class="mt-20 border-t border-[#383a38] bg-[#202220] text-white">
      <div class="mx-auto max-w-[1480px] px-5 py-12 lg:px-8 lg:py-16">
        <div class="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">

          <!-- Col 1: Brand & Studio Flagship -->
          <div class="space-y-4">
            <div class="flex items-center gap-3">
              <span class="grid size-8 place-items-center bg-[#b94d27] text-sm font-black text-white">K</span>
              <span class="font-display text-lg font-extrabold tracking-[-0.03em] text-white">KickCraft</span>
            </div>
            <p class="text-xs leading-6 text-white/70">
              Interactive 3D shoe customization and store pickup system. Directly recolor independent shoe parts, attach interchangeable 3D charms, and reserve your custom pair for pickup.
            </p>
            <div class="border-t border-white/10 pt-3 text-xs text-white/50">
              <p class="font-semibold text-white/80">KickCraft Flagship Studio</p>
              <p class="mt-0.5">Mon–Sat · 10:00 AM – 8:00 PM</p>
            </div>
          </div>

          <!-- Col 2: Contact Numbers -->
          <div>
            <h3 class="font-display text-xs font-bold uppercase tracking-widest text-[#b94d27]">Contact Numbers</h3>
            <ul class="mt-4 space-y-3 text-xs text-white/75">
              <li>
                <span class="block text-[10px] font-bold uppercase tracking-wider text-white/50">Studio Hotline</span>
                <a href="tel:+63288885425" class="font-mono font-bold text-white transition-colors hover:text-[#b94d27]">(02) 8888-5425</a>
              </li>
              <li>
                <span class="block text-[10px] font-bold uppercase tracking-wider text-white/50">Customer Mobile / SMS</span>
                <a href="tel:+639171234567" class="font-mono font-bold text-white transition-colors hover:text-[#b94d27]">+63 917 123 4567</a>
              </li>
              <li>
                <span class="block text-[10px] font-bold uppercase tracking-wider text-white/50">In-Store Pickup Desk</span>
                <a href="tel:+639189876543" class="font-mono font-bold text-white transition-colors hover:text-[#b94d27]">+63 918 987 6543</a>
              </li>
              <li class="border-t border-white/10 pt-2 text-[11px] text-white/50">
                Studio Hours · Mon–Sat 10:00 AM – 8:00 PM
              </li>
            </ul>
          </div>

          <!-- Col 3: 3D Studio Features -->
          <div>
            <h3 class="font-display text-xs font-bold uppercase tracking-widest text-[#b94d27]">3D Studio</h3>
            <ul class="mt-4 space-y-2 text-xs text-white/75">
              <li>Independently Addressable Mesh Parts</li>
              <li>Interchangeable Metal 3D Charms</li>
              <li>Interactive 3D Orbit &amp; Zoom Preview</li>
              <li>US Sizes 7 through 11 Available</li>
              <li>Direct Store Pickup Assembly</li>
            </ul>
          </div>

          <!-- Col 4: Feedback -->
          <div>
            <h3 class="font-display text-xs font-bold uppercase tracking-widest text-[#b94d27]">Feedback</h3>
            <p class="mt-4 text-xs leading-relaxed text-white/70">
              Help us shape KickCraft. Share your thoughts on our 3D customizer, colorways, or store pickup experience.
            </p>
            <div class="mt-3 space-y-2 text-xs">
              <div>
                <span class="block text-[10px] font-bold uppercase tracking-wider text-white/50">Direct Studio Email</span>
                <a
                  href="mailto:feedback@kickcraft.local?subject=KickCraft%20Shoe%20Feedback"
                  class="font-mono text-white/90 underline transition-colors hover:text-[#b94d27]"
                >
                  feedback@kickcraft.local
                </a>
              </div>
              <button
                type="button"
                class="mt-1 inline-flex items-center gap-2 border border-[#b94d27] bg-[#b94d27]/10 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-[#b94d27] focus-visible:outline-2 focus-visible:outline-[#b94d27]"
                @click="openFeedbackModal"
              >
                <span>Send Quick Feedback</span>
                <span aria-hidden="true">→</span>
              </button>
            </div>
            <p class="mt-2 text-[11px] text-white/40">Responses typically within 24 hours.</p>
          </div>

        </div>

        <!-- Bottom bar -->
        <div class="mt-12 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 text-xs text-white/50 sm:flex-row">
          <p>© 2026 KickCraft. All rights reserved.</p>
          <div class="flex flex-wrap items-center justify-center gap-6">
            <button type="button" class="hover:text-white" @click="goToShop">Catalog</button>
            <button type="button" class="hover:text-white" @click="goToStudio('kickcraft-one')">3D Studio</button>
            <button type="button" class="hover:text-white" @click="goToLogin('customer')">Log In</button>
            <button type="button" class="hover:text-white" @click="goToRegister">Register</button>
            <button type="button" class="hover:text-white" @click="openReservation">Reserve</button>
          </div>
        </div>
      </div>
    </footer>

    <!-- ── Reservation dialog (shared between views) ─────── -->
    <dialog id="reservation-dialog" class="m-auto w-[calc(100%_-_32px)] max-w-md border border-[#8e938e] bg-[#fcfdfb] p-0 text-[#292b2d]">
      <div v-if="!reserved" class="p-6">
        <div class="flex items-start justify-between gap-4 border-b border-[#d9dcd8] pb-4">
          <div>
            <h2 class="font-display text-xl font-black">Reserve {{ selectedShoe.name }}</h2>
            <p class="mt-1 text-sm text-[#626662]">Size {{ selectedSize }} · {{ customizedCount }} customized parts · {{ selectedCharm.label }} accessory</p>
          </div>
          <button class="grid size-9 place-items-center border border-[#bfc3bf] text-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#245fa8]" aria-label="Close reservation modal" @click="closeReservation">×</button>
        </div>
        <div v-if="reservationError" class="mt-4 border border-[#b94d27]/30 bg-[#fdf2ef] p-3 text-xs text-[#963a20]">
          {{ reservationError }}
        </div>
        <form class="space-y-4 pt-5" @submit.prevent="submitReservation">
          <label class="block">
            <span class="mb-1.5 block text-sm font-bold">Full name</span>
            <input
              v-model="customerName"
              required
              autocomplete="name"
              placeholder="e.g. Maria Santos"
              class="h-11 w-full border border-[#bfc3bf] bg-white px-3 outline-none focus:border-[#245fa8] focus:ring-1 focus:ring-[#245fa8]"
            />
          </label>
          <label class="block">
            <span class="mb-1.5 block text-sm font-bold">Email address</span>
            <input
              v-model="customerEmail"
              required
              type="email"
              autocomplete="email"
              placeholder="e.g. maria@example.com"
              class="h-11 w-full border border-[#bfc3bf] bg-white px-3 outline-none focus:border-[#245fa8] focus:ring-1 focus:ring-[#245fa8]"
            />
          </label>
          <label class="flex items-center gap-2 pt-0.5 text-xs cursor-pointer select-none text-[#5f635f]">
            <input
              v-model="rememberGuestProfile"
              type="checkbox"
              class="size-4 accent-[#292b2d]"
            />
            <span>Remember my contact details on this device</span>
          </label>
          <div>
            <span class="mb-1.5 block text-sm font-bold">Pickup date</span>
            <KickCraftCalendar
              v-model="pickupDate"
              :min-date="minPickupDate"
              :max-date="maxPickupDate"
            />
          </div>
          <div class="border-t border-[#e2e5e1] pt-3 flex items-center justify-between text-sm">
            <span class="text-[#626662]">Estimated Total:</span>
            <span class="font-bold text-[#292b2d]">{{ selectedShoe.formattedPrice || '₱4,890' }}</span>
          </div>
          <p class="text-xs text-[#737773]">No online charge today. Payment is collected upon inspection and pickup in-store.</p>
          <button
            type="submit"
            :disabled="isSubmitting"
            class="h-12 w-full bg-[#b94d27] font-bold text-white hover:bg-[#963a20] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#245fa8]"
          >
            {{ isSubmitting ? 'Submitting reservation…' : 'Confirm pickup reservation' }}
          </button>
        </form>
      </div>
      <div v-else class="p-8 text-center">
        <div class="mx-auto grid size-12 place-items-center bg-[#3f7652] text-xl font-black text-white animate-pop-in">✓</div>
        <h2 class="font-display mt-5 text-xl font-black">Reservation placed!</h2>

        <div class="mt-4 border-2 border-[#3f7652] bg-[#edf5f0] px-4 py-2 font-mono text-xs font-black uppercase tracking-wider text-[#2a593a]">[ ✓ RESERVATION CONFIRMED · HELD FOR STORE PICKUP ]</div>

        <div class="mt-4 border border-[#d9dcd8] bg-[#f8f9f7] p-4 text-left font-mono text-xs text-[#292b2d]">
          <div class="flex items-center justify-between border-b border-[#e2e5e1] pb-2">
            <span class="font-sans font-semibold uppercase tracking-wider text-[#626662]">Receipt Reference</span>
            <span class="font-bold text-[#292b2d]">{{ reservationReceipt?.id || 'KC-2026-XXXX' }}</span>
          </div>
          <div class="flex items-center justify-between border-b border-[#e2e5e1] py-2">
            <span class="font-sans font-semibold uppercase tracking-wider text-[#626662]">Silhouette &amp; Size</span>
            <span class="font-sans font-bold text-[#292b2d]">{{ selectedShoe.name }} · Size {{ selectedSize }}</span>
          </div>
          <div class="flex items-center justify-between border-b border-[#e2e5e1] py-2">
            <span class="font-sans font-semibold uppercase tracking-wider text-[#626662]">Scheduled Pickup</span>
            <span class="font-sans font-bold text-[#292b2d]">{{ pickupDate }}</span>
          </div>
          <div class="flex items-start justify-between border-b border-[#e2e5e1] py-2">
            <span class="font-sans font-semibold uppercase tracking-wider text-[#626662]">Store Address</span>
            <span class="font-sans font-medium text-right text-[#292b2d]">123 Craft Studio Way, Manila</span>
          </div>
          <div class="flex items-start justify-between pt-2">
            <span class="font-sans font-semibold uppercase tracking-wider text-[#626662]">Status</span>
            <span class="font-sans font-medium text-right text-[#292b2d]">
              <span class="font-bold text-[#b94d27]">Pending Payment</span> · Payment collected in-store upon inspection
            </span>
          </div>
        </div>

        <p class="mt-3 text-xs leading-5 text-[#626662]">
          Your custom {{ selectedShoe.name }} (Size {{ selectedSize }}) with {{ selectedCharm.label }} accessory has been reserved. Please bring this receipt reference to the studio.
        </p>

        <div class="mt-6 flex flex-col gap-2.5">
          <button
            type="button"
            class="h-11 w-full bg-[#292b2d] font-bold text-white transition-colors hover:bg-[#1a1b1c] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#245fa8]"
            @click="goToMyReservations"
          >
            View in My Reservations
          </button>

          <!-- Guest account perk reminder -->
          <div
            v-if="showGuestPerkReminder && (!currentUser || currentUser.role !== 'customer')"
            class="border border-[#bfa76a] bg-[#fbf8f0] p-3 text-left text-xs text-[#634e18]"
          >
            <div class="font-bold uppercase tracking-wider text-[#493910]">Account Registration Perk</div>
            <p class="mt-1 leading-relaxed">
              Create a customer account to track your customized shoe reservations, verify real-time pickup readiness, and save your sizes.
            </p>
            <button
              type="button"
              class="mt-2 inline-flex items-center font-bold text-[#b94d27] underline hover:text-[#963a20]"
              @click="closeReservation(); goToRegister()"
            >
              Create an account now →
            </button>
          </div>

          <button
            type="button"
            class="h-11 w-full border border-[#8e938e] font-bold hover:bg-[#f1f3f0] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#245fa8]"
            @click="closeReservation"
          >
            Continue Designing
          </button>
        </div>
      </div>
    </dialog>

    <ConfirmModal
      :show="confirmModal.show"
      :title="confirmModal.title"
      :message="confirmModal.message"
      :confirm-text="confirmModal.confirmText"
      :cancel-text="confirmModal.cancelText"
      :variant="confirmModal.variant"
      :icon="confirmModal.icon"
      @confirm="handleModalConfirm"
      @cancel="handleModalCancel"
    />

    <!-- ── Feedback Modal Dialog ─────────────────────────────── -->
    <div
      v-if="showFeedbackModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="feedback-modal-title"
    >
      <div class="w-full max-w-md border-2 border-[#292b2d] bg-[#fcfdfb] p-6 text-[#292b2d] shadow-2xl">
        <div class="flex items-start justify-between gap-4 border-b border-[#d9dcd8] pb-4">
          <div>
            <span class="text-[10px] font-black uppercase tracking-widest text-[#b94d27]">KickCraft Studio</span>
            <h2 id="feedback-modal-title" class="font-display text-xl font-black">Send Quick Feedback</h2>
          </div>
          <button
            type="button"
            class="grid size-9 place-items-center border border-[#bfc3bf] text-xl font-bold hover:bg-[#f1f3f0] focus-visible:outline-2 focus-visible:outline-[#245fa8]"
            aria-label="Close feedback modal"
            @click="closeFeedbackModal"
          >
            ×
          </button>
        </div>

        <div v-if="feedbackSubmitted" class="py-8 text-center space-y-3">
          <div class="inline-grid size-12 place-items-center bg-[#edf5f0] text-xl text-[#2a593a] border border-[#3f7652]">
            ✓
          </div>
          <h3 class="font-display text-lg font-black text-[#202220]">Feedback saved on this device</h3>
          <p class="text-xs text-[#5f635f] leading-relaxed max-w-sm mx-auto">
            Email feedback@kickcraft.local when you want to send it to the studio team.
          </p>
          <div class="pt-3">
            <button
              type="button"
              class="h-10 px-6 border border-[#292b2d] bg-[#292b2d] text-xs font-bold uppercase tracking-wider text-white hover:bg-black transition-colors"
              @click="closeFeedbackModal"
            >
              Done
            </button>
          </div>
        </div>

        <form v-else class="space-y-4 pt-4" @submit.prevent="handleFeedbackSubmit">
          <div v-if="feedbackError" class="border border-[#b94d27]/40 bg-[#fdf2ef] p-3 text-xs font-semibold text-[#963a20]">
            {{ feedbackError }}
          </div>

          <div class="grid gap-3 sm:grid-cols-2">
            <label class="block">
              <span class="mb-1 block text-xs font-bold text-[#5f635f]">Your Name (optional)</span>
              <input
                v-model="feedbackForm.name"
                placeholder="e.g. Alex"
                class="h-10 w-full border border-[#bfc3bf] bg-white px-3 text-xs outline-none focus:border-[#245fa8] focus:ring-1 focus:ring-[#245fa8]"
              />
            </label>
            <label class="block">
              <span class="mb-1 block text-xs font-bold text-[#5f635f]">Email (optional)</span>
              <input
                v-model="feedbackForm.email"
                type="email"
                placeholder="e.g. alex@example.com"
                class="h-10 w-full border border-[#bfc3bf] bg-white px-3 text-xs outline-none focus:border-[#245fa8] focus:ring-1 focus:ring-[#245fa8]"
              />
            </label>
          </div>

          <label class="block">
            <span class="mb-1 block text-xs font-bold text-[#5f635f]">Topic / Category</span>
            <select
              v-model="feedbackForm.category"
              class="h-10 w-full border border-[#bfc3bf] bg-white px-3 text-xs outline-none focus:border-[#245fa8] focus:ring-1 focus:ring-[#245fa8]"
            >
              <option value="general">General Feedback</option>
              <option value="colors">Colorway &amp; Material Request</option>
              <option value="silhouette">Shoe Silhouette Suggestion</option>
              <option value="bug">3D Studio Bug Report</option>
              <option value="pickup">Store Pickup Experience</option>
            </select>
          </label>

          <label class="block">
            <span class="mb-1 block text-xs font-bold text-[#5f635f]">Feedback Message *</span>
            <textarea
              v-model="feedbackForm.message"
              required
              rows="4"
              placeholder="Tell us what you loved, what felt clunky, or what color/charm options you'd like to see next..."
              class="w-full border border-[#bfc3bf] bg-white p-3 text-xs outline-none focus:border-[#245fa8] focus:ring-1 focus:ring-[#245fa8]"
            ></textarea>
          </label>

          <div class="flex items-center justify-end gap-3 border-t border-[#d9dcd8] pt-4">
            <button
              type="button"
              class="h-10 px-4 border border-[#bfc3bf] text-xs font-bold hover:bg-[#f1f3f0]"
              @click="closeFeedbackModal"
            >
              Cancel
            </button>
            <button
              type="submit"
              :disabled="feedbackSubmitting"
              class="h-10 px-5 border border-[#292b2d] bg-[#292b2d] text-xs font-bold uppercase tracking-wider text-white hover:bg-black transition-colors disabled:opacity-50"
            >
              {{ feedbackSubmitting ? 'Saving…' : 'Save Feedback Note' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes popIn {
  0% { transform: scale(0.4); opacity: 0; }
  70% { transform: scale(1.15); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}
.animate-pop-in {
  animation: popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
}
</style>

