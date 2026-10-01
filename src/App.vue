<script setup>
import { computed, defineAsyncComponent, nextTick, onMounted, ref, watch } from 'vue'
import ConfirmModal from './components/ConfirmModal.vue'
import KickCraftCalendar from './components/KickCraftCalendar.vue'
import { api } from './api.js'
import { adminShoeToCatalogCard } from './admin.js'
import {
  CATALOG,
  CATEGORIES,
  CHARMS,
  SHOES,
  buildPartColorway,
  charmScale,
  charmSource,
  filterCatalog,
  prioritizeLiveCatalog,
  setMaterialColor,
} from './customization.js'

const AdminPanel = defineAsyncComponent(() => import('./components/AdminPanel.vue'))

const sizes = [7, 8, 9, 10, 11]
const colors = [
  { name: 'Chalk', value: '#f1efe8' },
  { name: 'Graphite', value: '#292b2d' },
  { name: 'Cobalt', value: '#245fa8' },
  { name: 'Rust', value: '#b94d27' },
  { name: 'Moss', value: '#52684f' },
  { name: 'Burgundy', value: '#713741' },
]

const COLORWAY_PRESETS = [
  { name: 'Chalk court', colors: [colors[0], colors[1], colors[3]] },
  { name: 'Night run', colors: [colors[1], colors[0], colors[2]] },
  { name: 'Trail moss', colors: [colors[4], colors[0], colors[5]] },
  { name: 'Burgundy club', colors: [colors[5], colors[0], colors[1]] },
]

const adminShoes = ref([])
const currentUser = ref(null) // owner/admin only
const catalogLoading = ref(false)
const catalogError = ref('')

async function loadCatalog() {
  catalogLoading.value = true
  catalogError.value = ''
  try {
    const shoesRes = await api('shoes/list.php')
    if (Array.isArray(shoesRes?.shoes) && shoesRes.shoes.length > 0) {
      adminShoes.value = shoesRes.shoes
    }
  } catch (err) {
    catalogError.value = err.message || 'Could not load the latest shoe catalog.'
  } finally {
    catalogLoading.value = false
  }
}

onMounted(async () => {
  // Listen for browser navigation via URL hash and route changes.
  if (typeof window !== 'undefined') {
    window.addEventListener('hashchange', () => {
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
      } else if (sessionRes.user.role !== 'owner' && ['admin', 'login'].includes(view.value)) {
        // Block brute force attempts by non-owners to access admin
        notFoundPath.value = '/admin'
        view.value = 'not-found'
      }
    } else {
      // Unauthenticated session
      // Guests who intentionally visit /admin stay on the owner login screen.
    }
  } catch (_) {
    // Session check fails gracefully when offline or unauthenticated
    // Keep the owner login available when the session check is offline.
  }

  // Load database catalog. Built-in entries remain available if local services are offline.
  await loadCatalog()

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
const heroModelReady = ref(false)
const modelReady = ref(false)
const modelError = ref('')
const reserved = ref(false)
const customerName = ref('')
const customerEmail = ref('')
const pickupDate = ref('')
const reservationReceipt = ref(null)
const receiptCopied = ref(false)
const isSubmitting = ref(false)
const reservationError = ref('')
const GUIDE_KEY = 'kickcraft_3d_guide_seen'
const show3DGuide = ref(false)

function maybeShow3DGuide() {
  if (typeof localStorage === 'undefined') return
  try {
    show3DGuide.value = localStorage.getItem(GUIDE_KEY) !== 'true'
  } catch (_) {}
}

function dismiss3DGuide() {
  show3DGuide.value = false
  try {
    localStorage.setItem(GUIDE_KEY, 'true')
  } catch (_) {}
}

const GUEST_PROFILE_KEY = 'kickcraft_guest_profile'
const rememberGuestProfile = ref(false)

// ── Community Design Submission ──
const showDesignSubmitModal = ref(false)
const designName = ref('')
const designDescription = ref('')
const designSubmitted = ref(false)
const designReceipt = ref(null)
const designError = ref('')
const isSubmittingDesign = ref(false)

watch(showDesignSubmitModal, (isOpen) => {
  if (isOpen) {
    designError.value = ''
    if (currentUser.value) {
      if (currentUser.value.name && !customerName.value) customerName.value = currentUser.value.name
      if (currentUser.value.email && !customerEmail.value) customerEmail.value = currentUser.value.email
    } else {
      const guest = loadGuestProfile()
      if (guest) {
        if (guest.name && !customerName.value) customerName.value = guest.name
        if (guest.email && !customerEmail.value) customerEmail.value = guest.email
      }
    }
  }
})

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
const displayCatalog = computed(() => prioritizeLiveCatalog(filteredCatalog.value))
const liveCatalogCount = computed(() => displayCatalog.value.filter(card => card.status === 'live').length)

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
  highlightSelectedPart()
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

function highlightSelectedPart(part = selectedPart.value) {
  if (!modelReady.value) return
  for (const candidate of selectedParts.value) {
    const material = modelViewer.value?.model?.getMaterialByName(candidate.material)
    material?.setEmissiveFactor(candidate.id === part?.id ? '#180500' : '#000000')
  }
}

function selectPart(part) {
  selectedPartId.value = part.id
  highlightSelectedPart(part)
}

function applyColorway(preset) {
  if (!modelReady.value) return
  const nextColors = buildPartColorway(selectedParts.value, preset.colors)
  const applied = selectedParts.value.every(part =>
    setMaterialColor(modelViewer.value.model, part.material, nextColors[part.id].value)
  )
  if (applied) {
    partColors.value = nextColors
    highlightSelectedPart()
  }
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
  receiptCopied.value = false
  reservationError.value = ''
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
}

async function copyReceiptReference() {
  const receiptId = reservationReceipt.value?.id
  if (!receiptId || typeof navigator === 'undefined' || !navigator.clipboard) return
  try {
    await navigator.clipboard.writeText(receiptId)
    receiptCopied.value = true
  } catch (_) {
    receiptCopied.value = false
  }
}

// ── Guest reservation lookup ──────────────────────────────────
const trackReceiptId = ref('')
const trackEmail = ref('')
const trackedReservation = ref(null)
const trackLoading = ref(false)
const trackError = ref('')
const trackingSteps = [
  { status: 'pending', label: 'Pending', detail: 'Reservation received' },
  { status: 'approved', label: 'Approved', detail: 'Design accepted' },
  { status: 'ready', label: 'Ready', detail: 'Prepared for pickup' },
  { status: 'completed', label: 'Completed', detail: 'Pair collected' },
]
const trackingStepIndex = computed(() => trackingSteps.findIndex(step => step.status === trackedReservation.value?.status))

function goToTrackReservation() {
  closeReservation()
  if (reservationReceipt.value?.id) trackReceiptId.value = reservationReceipt.value.id
  if (reservationReceipt.value?.email || customerEmail.value) {
    trackEmail.value = reservationReceipt.value?.email || customerEmail.value
  }
  trackedReservation.value = null
  trackError.value = ''
  view.value = 'track'
  scrollToTop()
}

async function lookupReservation() {
  trackLoading.value = true
  trackError.value = ''
  trackedReservation.value = null
  try {
    const res = await api('reservations/lookup.php', {
      method: 'POST',
      body: { id: trackReceiptId.value.trim(), email: trackEmail.value.trim() },
    })
    trackedReservation.value = res.reservation
  } catch (err) {
    trackError.value = err.message || 'Could not find reservation'
  } finally {
    trackLoading.value = false
  }
}

function requestCancelTrackedReservation() {
  if (!trackedReservation.value || trackedReservation.value.status !== 'pending') return
  confirmModal.value = {
    show: true,
    title: 'Cancel Pickup Reservation?',
    message: `Cancel reservation ${trackedReservation.value.id}? This cannot be undone.`,
    confirmText: 'Cancel Reservation',
    cancelText: 'Keep Reservation',
    variant: 'danger',
    icon: 'trash',
    onConfirm: async () => {
      try {
        const res = await api('reservations/cancel.php', {
          method: 'POST',
          body: { id: trackReceiptId.value.trim(), email: trackEmail.value.trim() },
        })
        trackedReservation.value = { ...trackedReservation.value, ...res.reservation }
        if (typeof BroadcastChannel !== 'undefined') {
          const channel = new BroadcastChannel('kickcraft_reservations_channel')
          channel.postMessage({ type: 'RESERVATION_CANCELLED', id: trackedReservation.value.id })
          channel.close()
        }
      } catch (err) {
        trackError.value = err.message || 'Failed to cancel reservation'
      }
    },
  }
}

function getReservationStatusBadge(status) {
  const statusMap = {
    pending: {
      label: 'Awaiting Approval',
      bgClass: 'bg-[#fcf5eb]',
      textClass: 'text-[#c97d1e]',
      borderClass: 'border-[#c97d1e]',
      dotClass: 'bg-[#c97d1e]',
    },
    approved: {
      label: 'Approved',
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

    saveGuestProfile(customerName.value.trim(), customerEmail.value.trim())

    reservationReceipt.value = res.reservation
    reserved.value = true

    try {
      const shoesRes = await api('shoes/list.php')
      if (Array.isArray(shoesRes?.shoes)) adminShoes.value = shoesRes.shoes
    } catch (_) {}

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

async function submitDesign() {
  if (!designName.value.trim()) return
  if (Object.keys(partColors.value).length === 0) {
    designError.value = 'Customize at least one shoe part before sharing your design.'
    return
  }

  isSubmittingDesign.value = true
  designError.value = ''

  try {
    const guestProfile = loadGuestProfile()
    const dName = customerName.value.trim() || guestProfile?.name || 'Anonymous Designer'
    const dEmail = customerEmail.value.trim() || guestProfile?.email || ''

    if (!dEmail || !dName || dName.length < 2) {
      designError.value = 'Please enter your name and email to share your design.'
      isSubmittingDesign.value = false
      return
    }

    const res = await api('designs/submit.php', {
      method: 'POST',
      body: {
        designerName: dName,
        designerEmail: dEmail,
        designName: designName.value.trim(),
        description: designDescription.value.trim(),
        shoeId: selectedShoe.value.id,
        partColors: { ...partColors.value },
        charmId: selectedCharm.value.id,
        charmLabel: selectedCharm.value.label,
      },
    })

    saveGuestProfile(dName, dEmail)
    designReceipt.value = res.design
    designSubmitted.value = true

    // Broadcast for admin real-time alert
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        const channel = new BroadcastChannel('kickcraft_designs_channel')
        channel.postMessage({ type: 'NEW_DESIGN', design: res.design })
        channel.close()
      } catch (_) {}
    }
  } catch (err) {
    designError.value = err.message || 'Failed to submit design'
  } finally {
    isSubmittingDesign.value = false
  }
}

function closeDesignModal() {
  showDesignSubmitModal.value = false
  designSubmitted.value = false
  designReceipt.value = null
  designName.value = ''
  designDescription.value = ''
  designError.value = ''
}

function goToGallery() {
  closeDesignModal()
  if (typeof window !== 'undefined') {
    window.location.hash = 'gallery'
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
      if (['shop', 'studio', 'track'].includes(target)) {
        return target
      }
      if (target === 'admin') {
        return 'login'
      }
      return 'not-found'
    }

    try {
      const saved = localStorage.getItem('kickcraft_view')
      if (saved && ['shop', 'studio', 'admin', 'track'].includes(saved)) {
        return saved === 'admin' ? 'login' : saved
      }
    } catch (_) {}
  }
  return 'shop'
}

const view = ref(getInitialView()) // 'shop' | 'studio' | 'login' | 'admin' | 'track' | 'not-found'

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

  if (['studio', 'track'].includes(target)) {
    view.value = target
    notFoundPath.value = ''
    return
  }

  if (target === 'admin') {
    if (currentUser.value?.role === 'owner') {
      view.value = 'admin'
      notFoundPath.value = ''
    } else if (!currentUser.value) {
      view.value = 'login'
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
    const route = newView === 'login' ? 'admin' : newView
    if (window.location.hash !== `#${route}`) {
      window.location.hash = route
    }
    try {
      localStorage.setItem('kickcraft_view', route)
    } catch (_) {}
    if (newView === 'studio') maybeShow3DGuide()
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
    message: 'You will be signed out of the Owner Portal.',
    confirmText: 'Sign Out',
    cancelText: 'Stay Logged In',
    variant: 'default',
    icon: 'logout',
    onConfirm: () => {
      handleLogout()
    },
  }
}

function onAdminSessionExpired() {
  currentUser.value = null
  loginEmail.value = ''
  loginPassword.value = ''
  loginError.value = 'Your owner session has expired. Please sign in again.'
  view.value = 'login'
  try {
    localStorage.removeItem('kickcraft_view')
  } catch (_) {}
}

// ── Auth state ────────────────────────────────────────────────
const loginEmail = ref('')
const loginPassword = ref('')
const showLoginPassword = ref(false)
const loginRemember = ref(false)
const loginFeedback = ref('')
const loginError = ref('')
const isLoggingIn = ref(false)

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
    loginFeedback.value = 'Owner login successful. Redirecting…'
    setTimeout(() => {
      goToAdmin()
    }, 400)
  } catch (err) {
    loginError.value = err.message || 'Login failed'
  } finally {
    isLoggingIn.value = false
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
      <div class="mx-auto flex h-14 max-w-[1480px] items-center justify-between px-5 lg:px-8">
        <button
          class="flex items-center gap-3 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#245fa8]"
          @click="goToShop"
        >
          <span class="grid size-7 place-items-center bg-[#292b2d] text-xs font-black text-white">K</span>
          <span class="font-display text-base font-extrabold tracking-[-0.03em]">KickCraft</span>
        </button>
        <nav class="flex h-full items-center gap-4 text-[13px] font-semibold sm:gap-6" aria-label="Main navigation">
          <!-- Shop link (hide when in admin to avoid redundant buttons) -->
          <button
            v-if="view !== 'admin'"
            type="button"
            class="flex h-full items-center border-b-2 border-transparent transition-colors duration-150 hover:text-[#b94d27] focus-visible:outline-2 focus-visible:outline-[#245fa8]"
            :class="view === 'shop' ? '!border-[#b94d27] text-[#202220]' : 'text-[#5f635f]'"
            @click="goToShop"
          >
            Shop
          </button>

          <button
            v-if="view !== 'admin'"
            type="button"
            class="flex h-full items-center border-b-2 border-transparent transition-colors duration-150 hover:text-[#b94d27] focus-visible:outline-2 focus-visible:outline-[#245fa8]"
            :class="view === 'track' ? '!border-[#b94d27] text-[#202220]' : 'text-[#5f635f]'"
            @click="goToTrackReservation"
          >
            <span class="sm:hidden">Track</span>
            <span class="hidden sm:inline">Track reservation</span>
          </button>

          <!-- Studio active tab label (if in studio) -->
          <span v-if="view === 'studio'" class="hidden h-full items-center border-b-2 border-[#b94d27] text-[#202220] sm:flex">
            Design studio
          </span>

          <!-- Admin link is visible only inside an authenticated owner session. -->
          <button
            v-if="currentUser?.role === 'owner'"
            type="button"
            class="flex h-full items-center border-b-2 border-transparent transition-colors duration-150 hover:text-[#b94d27] focus-visible:outline-2 focus-visible:outline-[#245fa8]"
            :class="view === 'admin' ? '!border-[#b94d27] text-[#202220]' : 'text-[#5f635f]'"
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
        </nav>
      </div>
    </header>

    <div
      v-if="catalogError && ['shop', 'studio', 'track'].includes(view)"
      role="alert"
      class="border-b border-[#d5a28f] bg-[#fdf2ef]"
    >
      <div class="mx-auto flex max-w-[1480px] flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm text-[#7d301b] lg:px-8">
        <p><strong>Using built-in catalog.</strong> {{ catalogError }}</p>
        <button
          type="button"
          :disabled="catalogLoading"
          class="border border-[#b94d27] px-3 py-1.5 text-xs font-bold text-[#963a20] hover:bg-[#b94d27] hover:text-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b94d27]"
          @click="loadCatalog"
        >
          {{ catalogLoading ? 'Retrying…' : 'Retry connection' }}
        </button>
      </div>
    </div>

    <!-- ══════════════════════════════════════════════════════ -->
    <!-- SHOP VIEW                                              -->
    <!-- ══════════════════════════════════════════════════════ -->
    <main v-if="view === 'shop'" class="mx-auto max-w-[1480px] px-5 py-8 lg:px-8 lg:py-10">

      <!-- The product is the hero: a real, interactive local 3D shoe. -->
      <section class="mb-8 grid overflow-hidden border border-[#bfc3bf] bg-[#fcfdfb] lg:grid-cols-[minmax(320px,.72fr)_minmax(0,1.28fr)]" aria-labelledby="shop-heading">
        <div class="flex flex-col justify-center border-b border-[#bfc3bf] p-7 sm:p-9 lg:border-b-0 lg:border-r lg:p-10">
          <h1 id="shop-heading" class="font-display max-w-lg text-4xl font-black leading-[0.95] tracking-[-0.045em] text-[#202220] sm:text-5xl">
            Build your pair in 3D.
          </h1>
          <p class="mt-5 max-w-md text-base leading-7 text-[#5f635f]">
            Recolor each shoe part, add a charm, choose your size, then reserve the exact design for store pickup.
          </p>
          <div class="mt-7 flex flex-wrap gap-3">
            <button
              type="button"
              class="h-12 bg-[#b94d27] px-6 text-sm font-bold text-white transition-colors hover:bg-[#963a20] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#245fa8]"
              @click="goToStudio(SHOES[0].id)"
            >Start designing</button>
            <button
              type="button"
              class="h-12 border border-[#292b2d] bg-white px-6 text-sm font-bold text-[#292b2d] transition-colors hover:bg-[#f1f3f0] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#245fa8]"
              @click="goToTrackReservation"
            >Track a reservation</button>
          </div>
          <p class="mt-6 text-xs leading-5 text-[#6a6e6a]">Drag the shoe to inspect it. No account needed to reserve.</p>
        </div>

        <div class="relative h-[420px] bg-[#e9ece9] sm:h-[500px] lg:h-[540px]">
          <model-viewer
            class="hero-model absolute inset-0"
            :src="SHOES[0].src"
            :alt="`Interactive 3D preview of ${SHOES[0].name}`"
            camera-controls
            touch-action="pan-y"
            shadow-intensity="1"
            shadow-softness="1"
            exposure="1"
            environment-image="neutral"
            interaction-prompt="auto"
            @load="heroModelReady = true"
            @error="heroModelReady = true"
          />
          <div v-if="!heroModelReady" class="pointer-events-none absolute inset-0 animate-pulse bg-[#e3e6e2]" role="status" aria-label="Loading 3D shoe preview">
            <div class="absolute inset-x-[18%] bottom-[24%] h-24 border border-[#d2d6d1] bg-[#edf0ec]" />
          </div>
          <div class="pointer-events-none absolute bottom-4 left-4 border border-white/20 bg-[#292b2d]/90 px-3 py-2 text-xs font-semibold text-white">
            Drag to rotate · Scroll to zoom
          </div>
        </div>
      </section>

      <!-- Search & Filters Toolbar -->
      <div class="mb-8 space-y-3 border-y border-[#cfd2ce] py-4">
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

      <!-- Catalog loading state -->
      <div v-if="catalogLoading" class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-label="Loading shoe catalog">
        <div v-for="slot in 3" :key="slot" class="animate-pulse border border-[#cfd2ce] bg-[#fcfdfb]">
          <div class="h-72 bg-[#e3e6e2]" />
          <div class="space-y-3 p-5">
            <div class="h-5 w-2/3 bg-[#e3e6e2]" />
            <div class="h-3 w-full bg-[#eceeeb]" />
            <div class="h-3 w-1/2 bg-[#eceeeb]" />
          </div>
        </div>
      </div>

      <!-- Empty state -->
      <div
        v-else-if="filteredCatalog.length === 0"
        class="flex flex-col items-center justify-center border border-dashed border-[#bfc3bf] bg-[#fcfdfb] px-6 py-16 text-center"
      >
        <div class="mb-4 grid size-12 place-items-center border border-[#cfd2ce] bg-[#f1f3f0] text-[#6a6e6a]">
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
      <div v-else class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <template v-for="(card, index) in displayCatalog" :key="card.id">
          <div v-if="index === 0" class="col-span-full flex flex-wrap items-end justify-between gap-2 border-b border-[#cfd2ce] pb-4">
            <div>
              <h2 class="font-display text-2xl font-black tracking-[-0.03em] text-[#202220]">
                {{ liveCatalogCount ? 'Ready to customize' : 'More silhouettes' }}
              </h2>
              <p class="mt-1 text-sm text-[#626662]">
                {{ liveCatalogCount ? `${liveCatalogCount} ${liveCatalogCount === 1 ? 'shoe is' : 'shoes are'} available in the 3D studio.` : 'These styles are not available for customization yet.' }}
              </p>
            </div>
          </div>

          <div v-if="liveCatalogCount > 0 && index === liveCatalogCount" class="col-span-full mt-5 border-b border-[#cfd2ce] pb-4">
            <h2 class="font-display text-2xl font-black tracking-[-0.03em] text-[#202220]">More silhouettes</h2>
            <p class="mt-1 text-sm text-[#626662]">Future and temporarily unavailable styles stay visible without blocking today’s choices.</p>
          </div>

          <!-- Live shoe card -->
          <button
            v-if="card.status === 'live'"
            type="button"
            class="group flex flex-col overflow-hidden border border-[#bfc3bf] bg-[#fcfdfb] text-left transition-colors duration-150 hover:border-[#777b77] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#245fa8]"
            @click="goToStudio(card.shoeId)"
            :aria-label="`Customize and reserve ${card.name}`"
          >
            <!-- Thumbnail -->
            <div class="relative grid h-72 place-items-center overflow-hidden bg-[#e9ece9] p-7">
              <img
                v-if="card.image"
                :src="card.image"
                :alt="`${card.name} customizable sneaker`"
                class="h-full w-full object-contain transition-opacity duration-150 group-hover:opacity-90"
              />
              <div v-else class="text-center text-[#6a6e6a]">
                <div class="mx-auto mb-3 grid size-16 place-items-center border border-[#bfc3bf] bg-[#fcfdfb] text-2xl">3D</div>
                <p class="text-xs font-bold uppercase tracking-widest">{{ card.name }}</p>
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

              <!-- CTA row -->
              <div class="mt-5 flex w-full items-center justify-between border-t border-[#d9dcd8] pt-4 text-sm font-bold text-[#292b2d] transition-colors duration-150 group-hover:text-[#b94d27]">
                Customize &amp; Reserve
                <svg class="size-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </div>
            </div>
          </button>

          <!-- Out of Stock or Coming Soon card -->
          <div
            v-else
            class="flex flex-col overflow-hidden border border-[#cfd2ce] bg-[#fcfdfb] text-left opacity-90"
          >
            <!-- Thumbnail / Placeholder -->
            <div class="relative grid h-48 place-items-center overflow-hidden bg-[#ebeeed] p-6">
              <img
                v-if="card.image"
                :src="card.image"
                :alt="card.name"
                class="h-full w-full object-contain opacity-55 grayscale"
              />
              <div v-else class="text-center text-[#8e938e]">
                <div class="mx-auto grid size-16 place-items-center border border-dashed border-[#bfc3bf] bg-[#f5f6f4] text-xl font-bold tracking-wider text-[#6a6e6a]">
                  3D
                </div>
              </div>
              <div
                class="pointer-events-none absolute left-3 top-3 border bg-[#fcfdfb] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider"
                :class="card.status === 'out_of_stock' ? 'border-[#d5a28f] text-[#963a20]' : 'border-[#cfd2ce] text-[#6a6e6a]'"
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

              <!-- Disabled indicator row -->
              <div
                class="mt-5 flex w-full items-center border-t border-[#d9dcd8] pt-4 text-sm font-semibold select-none"
                :class="card.status === 'out_of_stock' ? 'text-[#963a20]' : 'text-[#8e938e]'"
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
      class="mx-auto max-w-[1480px] flex-col px-5 pb-24 pt-5 lg:px-8 lg:py-6"
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
      <section class="grid border border-[#bfc3bf] bg-[#fcfdfb] lg:grid-cols-[minmax(0,1.8fr)_minmax(380px,.72fr)]">

        <!-- 3D viewer — fixed tall height so the full shoe is always visible -->
        <div class="relative h-[500px] border-b border-[#bfc3bf] bg-[#e9ece9] lg:h-[640px] lg:border-b-0 lg:border-r">
          <model-viewer
            class="studio-model"
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

          <div v-if="!modelReady && !modelError" class="pointer-events-none absolute inset-0 animate-pulse bg-[#e3e6e2]" role="status" aria-label="Loading customizable shoe">
            <div class="absolute inset-x-[14%] top-[34%] h-40 border border-[#d2d6d1] bg-[#edf0ec]" />
            <div class="absolute bottom-6 left-6 space-y-2">
              <div class="h-3 w-40 bg-[#d2d6d1]" />
              <div class="h-3 w-24 bg-[#d2d6d1]" />
            </div>
          </div>

          <div v-if="modelError" class="absolute inset-0 grid place-items-center bg-[#e9ece9] p-8" role="alert">
            <div class="max-w-md border-l-4 border-[#b94d27] bg-[#fcfdfb] p-5">
              <h2 class="font-display text-lg font-bold">3D model unavailable</h2>
              <p class="mt-2 text-sm leading-6 text-[#5f635f]">{{ modelError }}</p>
            </div>
          </div>

          <aside v-if="modelReady && show3DGuide" class="absolute right-4 top-4 w-64 border border-[#8e938e] bg-[#fcfdfb] p-4 text-sm" aria-label="3D controls guide">
            <div class="flex items-start justify-between gap-4">
              <h2 class="font-display font-bold text-[#202220]">Use the 3D studio</h2>
              <button type="button" class="text-lg leading-none text-[#6a6e6a] hover:text-[#202220]" aria-label="Dismiss 3D guide" @click="dismiss3DGuide">×</button>
            </div>
            <ul class="mt-3 space-y-2 text-xs leading-5 text-[#5f635f]">
              <li><strong class="text-[#202220]">Drag</strong> to rotate the shoe.</li>
              <li><strong class="text-[#202220]">Scroll</strong> to inspect details.</li>
              <li><strong class="text-[#202220]">Choose a part</strong> to highlight it.</li>
            </ul>
            <button type="button" class="mt-4 h-9 w-full bg-[#292b2d] text-xs font-bold text-white hover:bg-[#404345]" @click="dismiss3DGuide">Start designing</button>
          </aside>

          <div class="pointer-events-none absolute left-4 top-4 flex items-center gap-2 bg-[#fcfdfb]/95 px-3 py-2 text-xs font-semibold">
            <span class="size-2" :class="modelReady ? 'bg-[#3f7652]' : 'bg-[#9b9f9b]'" />
            {{ modelReady ? '3D model ready' : 'Preparing model' }}
          </div>
          <div class="pointer-events-none absolute bottom-4 left-4 bg-[#292b2d]/90 px-3 py-2 text-xs font-semibold text-white">Drag to rotate · Scroll to zoom</div>
        </div>

        <!-- Right panel — customization controls -->
        <div class="flex flex-col lg:h-[640px] lg:min-h-0">
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

          <ol class="grid shrink-0 grid-cols-4 border-b border-[#d9dcd8] bg-[#f5f6f4] text-center text-[11px] font-semibold text-[#5f635f]" aria-label="Reservation progress">
            <li class="border-r border-[#d9dcd8] bg-[#292b2d] px-2 py-3 text-white"><strong class="block">1</strong>Design</li>
            <li class="border-r border-[#d9dcd8] px-2 py-3"><strong class="block text-[#202220]">2</strong>Size</li>
            <li class="border-r border-[#d9dcd8] px-2 py-3"><strong class="block text-[#202220]">3</strong>Details</li>
            <li class="px-2 py-3"><strong class="block text-[#202220]">4</strong>Confirm</li>
          </ol>

          <!-- Customization controls -->
          <div class="space-y-5 p-5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:p-6">
            <!-- Colorway presets -->
            <fieldset :disabled="!modelReady">
              <div class="mb-3 flex items-center justify-between gap-4">
                <legend class="font-display text-base font-bold">Start with a colorway</legend>
                <span class="text-xs text-[#696d69]">Optional</span>
              </div>
              <div class="grid grid-cols-2 gap-2">
                <button
                  v-for="preset in COLORWAY_PRESETS"
                  :key="preset.name"
                  type="button"
                  class="flex min-h-10 items-center justify-between border border-[#c5c9c5] bg-white px-3 text-left text-xs font-semibold hover:border-[#6f746f] disabled:opacity-50"
                  @click="applyColorway(preset)"
                >
                  {{ preset.name }}
                  <span class="flex" aria-hidden="true">
                    <span v-for="color in preset.colors" :key="color.value" class="size-3 border border-black/15" :style="{ backgroundColor: color.value }" />
                  </span>
                </button>
              </div>
            </fieldset>

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
                  @mouseenter="highlightSelectedPart(part)"
                  @mouseleave="highlightSelectedPart()"
                  @focus="highlightSelectedPart(part)"
                  @blur="highlightSelectedPart()"
                  @click="selectPart(part)"
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
            <div class="mb-3 flex items-start justify-between gap-4 text-sm">
              <div>
                <p class="font-display font-bold text-[#202220]">Design summary</p>
                <p class="mt-1 text-xs text-[#5f635f]">Pickup reservation · US {{ selectedSize }} · {{ selectedCharm.label }} charm · {{ customizedCount }} parts styled</p>
              </div>
              <div class="flex flex-wrap justify-end gap-1" aria-label="Selected part colors">
                <span v-for="part in selectedParts" :key="part.id" class="size-4 border border-black/15" :style="{ backgroundColor: partColors[part.id]?.value || '#ffffff' }" :title="part.label" />
              </div>
            </div>
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
            <button
              v-if="customizedCount > 0"
              type="button"
              class="mt-2.5 w-full border-2 border-[#245fa8] bg-white px-4 py-3 text-sm font-bold uppercase tracking-wider text-[#245fa8] transition-colors hover:bg-[#245fa8] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#245fa8]"
              @click="showDesignSubmitModal = true"
            >
              Share to Community
            </button>
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
        <div class="border-b border-white/20 p-4 sm:border-b-0 sm:border-r">
          <p class="font-display text-base font-bold">Fixed details</p>
          <p class="mt-1 text-sm leading-5 text-white/65">Edit selected zones while original details stay intact.</p>
        </div>
        <div class="border-b border-white/20 p-4 sm:border-b-0 sm:border-r">
          <p class="font-display text-base font-bold">Live 3D preview</p>
          <p class="mt-1 text-sm leading-5 text-white/65">See every color choice directly on the 3D shoe.</p>
        </div>
        <div class="p-4">
          <p class="font-display text-base font-bold">In-store pickup</p>
          <p class="mt-1 text-sm leading-5 text-white/65">Reserve online, then inspect and collect in store.</p>
        </div>
      </div>

      <div class="fixed inset-x-0 bottom-0 z-40 border-t border-[#bfc3bf] bg-[#fcfdfb] p-3 lg:hidden">
        <div class="mx-auto flex max-w-[1480px] items-center gap-3">
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-bold text-[#202220]">{{ selectedShoe.name }} · US {{ selectedSize }}</p>
            <p class="truncate text-xs text-[#626662]">{{ customizedCount }} parts · {{ selectedCharm.label }} charm</p>
          </div>
          <button
            type="button"
            class="h-11 shrink-0 bg-[#b94d27] px-5 text-sm font-bold text-white hover:bg-[#963a20] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#245fa8]"
            @click="openReservation"
          >Reserve</button>
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
      @session-expired="onAdminSessionExpired"
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
            Owner Portal
          </h1>
          <p class="mt-1 text-xs text-[#6a6e6a]">
            Sign in to manage reservations, shoes, and administrator accounts.
          </p>
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
              placeholder="owner@kickcraft.local"
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
            {{ isLoggingIn ? 'Signing in…' : 'Sign In to Owner Portal' }}
          </button>
        </form>

      </div>
    </main>

    <!-- ══════════════════════════════════════════════════════ -->
    <!-- REGISTER VIEW                                          -->
    <!-- ══════════════════════════════════════════════════════ -->
    <main v-else-if="view === 'track'" class="mx-auto max-w-4xl px-5 py-10 lg:px-8 lg:py-14">
      <button
        type="button"
        class="mb-6 text-xs font-bold text-[#5f635f] hover:text-[#202220] focus-visible:outline-2 focus-visible:outline-[#245fa8]"
        @click="goToShop"
      >
        ← Back to shop
      </button>

      <div class="grid border border-[#cfd2ce] bg-white lg:grid-cols-[320px_1fr]">
        <form class="border-b border-[#cfd2ce] p-6 lg:border-b-0 lg:border-r" @submit.prevent="lookupReservation">
          <h1 class="font-display text-2xl font-black tracking-tight text-[#202220]">Track reservation</h1>
          <p class="mt-2 text-sm leading-6 text-[#5f635f]">Enter receipt reference and reservation email.</p>

          <label class="mt-6 block">
            <span class="mb-1.5 block text-xs font-bold text-[#404345]">Receipt reference</span>
            <input
              v-model="trackReceiptId"
              required
              autocomplete="off"
              placeholder="KC-2026-1234"
              class="h-11 w-full border border-[#bfc3bf] px-3 font-mono text-sm uppercase outline-none focus:border-[#b94d27]"
            />
          </label>
          <label class="mt-4 block">
            <span class="mb-1.5 block text-xs font-bold text-[#404345]">Email address</span>
            <input
              v-model="trackEmail"
              required
              type="email"
              autocomplete="email"
              placeholder="name@example.com"
              class="h-11 w-full border border-[#bfc3bf] px-3 text-sm outline-none focus:border-[#b94d27]"
            />
          </label>
          <p v-if="trackError" role="alert" class="mt-4 border-l-2 border-[#b94d27] bg-[#fdf2ef] p-3 text-xs text-[#963a20]">
            {{ trackError }}
          </p>
          <button
            type="submit"
            :disabled="trackLoading"
            class="mt-5 h-11 w-full bg-[#292b2d] text-sm font-bold text-white hover:bg-[#1a1b1c] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b94d27]"
          >
            {{ trackLoading ? 'Checking…' : 'Check status' }}
          </button>
        </form>

        <section class="min-h-80 p-6" aria-live="polite">
          <div v-if="trackedReservation">
            <div class="flex flex-wrap items-start justify-between gap-4 border-b border-[#cfd2ce] pb-5">
              <div>
                <p class="font-mono text-sm font-black text-[#202220]">{{ trackedReservation.id }}</p>
                <p class="mt-1 text-sm text-[#5f635f]">{{ trackedReservation.shoeName }} · US {{ trackedReservation.size }}</p>
              </div>
              <span
                class="border px-2.5 py-1 text-xs font-bold"
                :class="[
                  getReservationStatusBadge(trackedReservation.status).bgClass,
                  getReservationStatusBadge(trackedReservation.status).textClass,
                  getReservationStatusBadge(trackedReservation.status).borderClass,
                ]"
              >
                {{ getReservationStatusBadge(trackedReservation.status).label }}
              </span>
            </div>
            <div v-if="trackedReservation.status === 'cancelled'" class="mt-5 border-l-4 border-[#b94d27] bg-[#fdf2ef] p-4 text-[#963a20]">
              <p class="text-sm font-bold">Reservation cancelled</p>
              <p class="mt-1 text-xs leading-5">{{ trackedReservation.notes || 'This reservation is no longer scheduled for pickup.' }}</p>
            </div>
            <ol v-else class="mt-5 grid gap-px bg-[#cfd2ce] sm:grid-cols-4" aria-label="Reservation progress">
              <li
                v-for="(step, index) in trackingSteps"
                :key="step.status"
                class="min-h-24 p-4"
                :class="index === trackingStepIndex ? 'bg-[#292b2d] text-white' : index < trackingStepIndex ? 'bg-[#e8ebe7] text-[#202220]' : 'bg-[#f7f8f6] text-[#777b77]'"
                :aria-current="index === trackingStepIndex ? 'step' : undefined"
              >
                <div class="flex items-start gap-3 sm:block">
                  <span class="grid size-6 shrink-0 place-items-center border border-current text-xs font-black">{{ index < trackingStepIndex ? '✓' : index + 1 }}</span>
                  <div class="sm:mt-3">
                    <p class="text-sm font-bold">{{ step.label }}</p>
                    <p class="mt-0.5 text-xs opacity-75">{{ step.detail }}</p>
                  </div>
                </div>
              </li>
            </ol>
            <dl class="grid gap-px bg-[#d9dcd8] sm:grid-cols-2">
              <div class="bg-white py-4 sm:pr-4">
                <dt class="text-xs font-bold text-[#6a6e6a]">Pickup date</dt>
                <dd class="mt-1 text-sm font-semibold text-[#202220]">{{ trackedReservation.pickupDate }}</dd>
              </div>
              <div class="bg-white py-4 sm:pl-4">
                <dt class="text-xs font-bold text-[#6a6e6a]">Accessory</dt>
                <dd class="mt-1 text-sm font-semibold text-[#202220]">{{ trackedReservation.charmLabel || 'None' }}</dd>
              </div>
            </dl>
            <div v-if="Object.keys(trackedReservation.partColors || {}).length" class="border-t border-[#d9dcd8] py-4">
              <p class="text-xs font-bold text-[#6a6e6a]">Reserved colors</p>
              <ul class="mt-2 flex flex-wrap gap-x-4 gap-y-2">
                <li v-for="(color, partId) in trackedReservation.partColors" :key="partId" class="flex items-center gap-2 text-xs font-semibold text-[#404345]">
                  <span class="size-4 border border-black/15" :style="{ backgroundColor: color.value }" />
                  {{ color.name }}
                </li>
              </ul>
            </div>
            <button
              v-if="trackedReservation.status === 'pending'"
              type="button"
              class="mt-5 border border-[#b94d27] px-4 py-2 text-xs font-bold text-[#b94d27] hover:bg-[#b94d27] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b94d27]"
              @click="requestCancelTrackedReservation"
            >
              Cancel reservation
            </button>
          </div>
          <div v-else class="grid min-h-64 place-items-center text-center text-sm text-[#6a6e6a]">
            Reservation details appear here after verification.
          </div>
        </section>
      </div>
    </main>

    <!-- ══════════════════════════════════════════════════════ -->
    <!-- MY RESERVATIONS VIEW (CUSTOMER)                        -->
    <!-- ══════════════════════════════════════════════════════ -->
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
        </div>
      </div>
    </main>

    <!-- ── Footer ───────────────────────────────────────────── -->
    <footer class="mt-6 border-t border-[#383a38] bg-[#202220] text-white">
      <div class="mx-auto max-w-[1480px] px-5 py-9 lg:px-8 lg:py-10">
        <div class="grid gap-8 md:grid-cols-[1.15fr_.85fr_1fr]">

          <!-- Col 1: Brand & Studio Flagship -->
          <div class="space-y-4">
            <div class="flex items-center gap-3">
              <span class="grid size-8 place-items-center bg-[#b94d27] text-sm font-black text-white">K</span>
              <span class="font-display text-lg font-extrabold tracking-[-0.03em] text-white">KickCraft</span>
            </div>
            <p class="max-w-md text-xs leading-6 text-white/70">
              Design an original shoe in 3D, add a charm, and reserve the finished pair for store pickup.
            </p>
            <div class="border-t border-white/10 pt-3 text-xs text-white/50">
              <p class="font-semibold text-white/80">KickCraft Flagship Studio</p>
              <p class="mt-0.5">Mon–Sat · 10:00 AM – 8:00 PM</p>
            </div>
          </div>

          <!-- Col 2: Contact Numbers -->
          <div>
            <h3 class="font-display text-sm font-bold text-[#d96a42]">Contact Numbers</h3>
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
            </ul>
          </div>

          <!-- Col 3: Feedback -->
          <div>
            <h3 class="font-display text-sm font-bold text-[#d96a42]">Feedback</h3>
            <p class="mt-4 text-xs leading-relaxed text-white/70">
              Tell us what worked—and what would make the customizer better.
            </p>
            <div class="mt-3 space-y-2 text-xs">
              <div>
                <span class="block text-[10px] font-bold uppercase tracking-wider text-white/50">Studio email</span>
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
          </div>

        </div>

        <!-- Bottom bar -->
        <div class="mt-8 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-5 text-xs text-white/50 sm:flex-row">
          <p>© 2026 KickCraft. All rights reserved.</p>
          <div class="flex flex-wrap items-center justify-center gap-6">
            <button type="button" class="hover:text-white" @click="goToShop">Catalog</button>
            <button type="button" class="hover:text-white" @click="goToStudio('kickcraft-one')">3D Studio</button>
            <button type="button" class="hover:text-white" @click="goToTrackReservation">Track Reservation</button>
          </div>
        </div>
      </div>
    </footer>

    <!-- ── Reservation dialog (shared between views) ─────── -->
    <dialog id="reservation-dialog" class="m-auto w-[calc(100%_-_32px)] max-w-lg border border-[#8e938e] bg-[#fcfdfb] p-0 text-[#292b2d]">
      <div v-if="!reserved" class="p-6">
        <ol class="mb-5 grid grid-cols-4 border border-[#d9dcd8] bg-[#f5f6f4] text-center text-[10px] font-semibold text-[#6a6e6a]" aria-label="Reservation progress">
          <li class="border-r border-[#d9dcd8] px-1 py-2">1<br>Design</li>
          <li class="border-r border-[#d9dcd8] px-1 py-2">2<br>Size</li>
          <li class="border-r border-[#d9dcd8] bg-[#292b2d] px-1 py-2 text-white">3<br>Details</li>
          <li class="px-1 py-2">4<br>Confirm</li>
        </ol>
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
      <div v-else class="p-6 text-center sm:p-8">
        <ol class="mb-5 grid grid-cols-4 border border-[#d9dcd8] bg-[#f5f6f4] text-center text-[10px] font-semibold text-[#6a6e6a]" aria-label="Reservation progress">
          <li class="border-r border-[#d9dcd8] px-1 py-2">1<br>Design</li>
          <li class="border-r border-[#d9dcd8] px-1 py-2">2<br>Size</li>
          <li class="border-r border-[#d9dcd8] px-1 py-2">3<br>Details</li>
          <li class="bg-[#3f7652] px-1 py-2 text-white">4<br>Confirmed</li>
        </ol>
        <div class="mx-auto grid size-12 place-items-center bg-[#3f7652] text-xl font-black text-white animate-pop-in">✓</div>
        <h2 class="font-display mt-5 text-xl font-black">Reservation placed!</h2>

        <div class="mt-4 border-2 border-[#3f7652] bg-[#edf5f0] px-4 py-2 font-mono text-xs font-black uppercase tracking-wider text-[#2a593a]">[ ✓ RESERVATION CONFIRMED · HELD FOR STORE PICKUP ]</div>

        <div class="mt-4 border border-[#bfc3bf] bg-white p-4 text-left">
          <p class="text-xs font-semibold text-[#626662]">Receipt reference</p>
          <div class="mt-1 flex flex-wrap items-center justify-between gap-3">
            <code class="font-mono text-2xl font-black tracking-tight text-[#202220]">{{ reservationReceipt?.id || 'KC-2026-XXXX' }}</code>
            <button
              type="button"
              class="h-9 border border-[#292b2d] px-3 text-xs font-bold text-[#292b2d] transition-colors hover:bg-[#f1f3f0] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#245fa8]"
              @click="copyReceiptReference"
            >{{ receiptCopied ? 'Copied' : 'Copy reference' }}</button>
          </div>
          <p class="mt-2 text-xs leading-5 text-[#626662]">Keep this reference with {{ reservationReceipt?.email || customerEmail }} to track your pickup.</p>
          <span class="sr-only" aria-live="polite">{{ receiptCopied ? 'Receipt reference copied.' : '' }}</span>
        </div>

        <div class="mt-3 grid grid-cols-[96px_1fr] border border-[#d9dcd8] bg-[#f8f9f7] text-left">
          <div class="grid min-h-28 place-items-center border-r border-[#d9dcd8] bg-[#e9ece9] p-2">
            <img v-if="selectedShoe.image" :src="selectedShoe.image" :alt="`${selectedShoe.name} reservation preview`" class="h-full w-full object-contain" />
            <span v-else class="font-display text-lg font-black text-[#6a6e6a]">3D</span>
          </div>
          <div class="p-4">
            <h3 class="font-display text-lg font-black text-[#202220]">{{ selectedShoe.name }}</h3>
            <p class="mt-1 text-xs text-[#626662]">US {{ selectedSize }} · {{ selectedCharm.label }} charm</p>
            <div class="mt-3 flex flex-wrap gap-1.5" aria-label="Reserved part colors">
              <span
                v-for="part in selectedParts"
                :key="part.id"
                class="size-5 border border-black/15"
                :style="{ backgroundColor: partColors[part.id]?.value || '#ffffff' }"
                :title="`${part.label}: ${partColors[part.id]?.name || 'Original color'}`"
              />
            </div>
          </div>
        </div>

        <div class="mt-3 border border-[#d9dcd8] bg-[#f8f9f7] p-4 text-left text-xs text-[#292b2d]">
          <div class="flex items-center justify-between border-b border-[#e2e5e1] py-2">
            <span class="font-semibold text-[#626662]">Scheduled pickup</span>
            <span class="font-bold text-[#292b2d]">{{ pickupDate }}</span>
          </div>
          <div class="flex items-start justify-between border-b border-[#e2e5e1] py-2">
            <span class="font-semibold text-[#626662]">Store address</span>
            <span class="font-medium text-right text-[#292b2d]">123 Craft Studio Way, Manila</span>
          </div>
          <div class="flex items-start justify-between pt-2">
            <span class="font-semibold text-[#626662]">Status</span>
            <span class="font-medium text-right text-[#292b2d]">
              <span class="font-bold text-[#b94d27]">Awaiting approval</span>
            </span>
          </div>
        </div>

        <p class="mt-3 text-xs leading-5 text-[#626662]">
          Bring your receipt reference when collecting the reserved pair.
        </p>

        <div class="mt-6 flex flex-col gap-2.5">
          <button
            type="button"
            class="h-11 w-full bg-[#292b2d] font-bold text-white transition-colors hover:bg-[#1a1b1c] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#245fa8]"
            @click="goToTrackReservation"
          >
            Track this reservation
          </button>

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

    <!-- ── Community Design Submission Modal ───────────────────── -->
    <div
      v-if="showDesignSubmitModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="design-submit-modal-title"
      @keydown.esc="closeDesignModal"
    >
      <div class="relative my-auto w-full max-w-lg border-2 border-[#292b2d] bg-[#fcfdfb] p-6 text-[#292b2d] shadow-2xl">
        <!-- SUBMISSION FORM -->
        <div v-if="!designSubmitted">
          <div class="flex items-start justify-between gap-4 border-b border-[#d9dcd8] pb-4">
            <div>
              <span class="text-[10px] font-black uppercase tracking-widest text-[#245fa8]">KickCraft Community</span>
              <h2 id="design-submit-modal-title" class="font-display text-xl font-black">Share Your Custom Design</h2>
              <p class="mt-0.5 text-xs text-[#626662]">Publish your original colorway to the Community Gallery.</p>
            </div>
            <button
              type="button"
              class="grid size-9 place-items-center border border-[#bfc3bf] text-xl font-bold hover:bg-[#f1f3f0] focus-visible:outline-2 focus-visible:outline-[#245fa8]"
              aria-label="Close design submission modal"
              @click="closeDesignModal"
            >
              ×
            </button>
          </div>

          <div v-if="designError" class="mt-4 border border-[#b94d27]/40 bg-[#fdf2ef] p-3 text-xs font-semibold text-[#963a20]">
            {{ designError }}
          </div>

          <!-- Color swatch & shoe summary preview -->
          <div class="mt-4 flex items-center justify-between border border-[#d9dcd8] bg-[#f5f6f4] p-3">
            <div>
              <p class="text-sm font-bold text-[#202220]">{{ selectedShoe.name }}</p>
              <p class="text-xs text-[#5f635f]">{{ customizedCount }} parts styled · {{ selectedCharm.label }} charm</p>
            </div>
            <div class="flex flex-wrap justify-end gap-1" aria-label="Customized part colors">
              <span
                v-for="part in selectedParts"
                :key="part.id"
                class="size-4 border border-black/15"
                :style="{ backgroundColor: partColors[part.id]?.value || '#ffffff' }"
                :title="`${part.label}: ${partColors[part.id]?.name || 'Original color'}`"
              />
            </div>
          </div>

          <form class="space-y-4 pt-4" @submit.prevent="submitDesign">
            <label class="block">
              <span class="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#292b2d]">Design Name *</span>
              <input
                v-model="designName"
                required
                maxlength="100"
                placeholder="e.g. Midnight Eclipse, Retro Neon"
                class="h-11 w-full border border-[#bfc3bf] bg-white px-3 text-sm outline-none focus:border-[#245fa8] focus:ring-1 focus:ring-[#245fa8]"
              />
            </label>

            <label class="block">
              <span class="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#292b2d]">Inspiration / Story <span class="text-[11px] font-normal text-[#6a6e6a]">(optional)</span></span>
              <textarea
                v-model="designDescription"
                rows="2"
                maxlength="500"
                placeholder="What inspired this combination or theme?"
                class="w-full border border-[#bfc3bf] bg-white p-3 text-sm outline-none focus:border-[#245fa8] focus:ring-1 focus:ring-[#245fa8]"
              ></textarea>
            </label>

            <div class="grid gap-3 sm:grid-cols-2">
              <label class="block">
                <span class="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#292b2d]">Your Name *</span>
                <input
                  v-model="customerName"
                  required
                  autocomplete="name"
                  placeholder="e.g. Maria Santos"
                  class="h-11 w-full border border-[#bfc3bf] bg-white px-3 text-sm outline-none focus:border-[#245fa8] focus:ring-1 focus:ring-[#245fa8]"
                />
              </label>
              <label class="block">
                <span class="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#292b2d]">Email Address *</span>
                <input
                  v-model="customerEmail"
                  required
                  type="email"
                  autocomplete="email"
                  placeholder="e.g. maria@example.com"
                  class="h-11 w-full border border-[#bfc3bf] bg-white px-3 text-sm outline-none focus:border-[#245fa8] focus:ring-1 focus:ring-[#245fa8]"
                />
              </label>
            </div>

            <label class="flex items-center gap-2 pt-0.5 text-xs cursor-pointer select-none text-[#5f635f]">
              <input
                v-model="rememberGuestProfile"
                type="checkbox"
                class="size-4 accent-[#292b2d]"
              />
              <span>Remember my contact details on this device</span>
            </label>

            <p class="text-xs text-[#737773]">
              Submissions are reviewed by our studio team before appearing publicly in the Community Gallery.
            </p>

            <div class="flex items-center gap-3 pt-2">
              <button
                type="button"
                class="h-11 flex-1 border border-[#bfc3bf] text-xs font-bold uppercase tracking-wider hover:bg-[#f1f3f0]"
                @click="closeDesignModal"
              >
                Cancel
              </button>
              <button
                type="submit"
                :disabled="isSubmittingDesign || !designName.trim()"
                class="h-11 flex-1 bg-[#245fa8] text-xs font-bold uppercase tracking-wider text-white transition-colors hover:bg-[#1a4780] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#245fa8]"
              >
                {{ isSubmittingDesign ? 'Submitting…' : 'Share to Community' }}
              </button>
            </div>
          </form>
        </div>

        <!-- SUCCESS VIEW -->
        <div v-else class="text-center sm:p-2">
          <div class="mx-auto grid size-12 place-items-center bg-[#245fa8] text-xl font-black text-white animate-pop-in">✓</div>
          <h2 class="font-display mt-4 text-xl font-black">Design Submitted!</h2>
          <p class="mt-1 text-xs text-[#626662]">Your design has been received and is waiting for studio review.</p>

          <!-- Brutalist verification stamp / banner -->
          <div class="mt-4 border-2 border-[#245fa8] bg-[#edf4fb] px-4 py-2 font-mono text-xs font-black uppercase tracking-wider text-[#245fa8]">
            [ ✓ DESIGN SUBMITTED · PENDING REVIEW · {{ designReceipt?.id || 'KCD-2026-XXXX' }} ]
          </div>

          <!-- Receipt reference card -->
          <div class="mt-4 border border-[#bfc3bf] bg-white p-4 text-left">
            <p class="text-xs font-semibold text-[#626662]">Design Reference</p>
            <div class="mt-1 flex flex-wrap items-center justify-between gap-3">
              <code class="font-mono text-2xl font-black tracking-tight text-[#202220]">{{ designReceipt?.id || 'KCD-2026-XXXX' }}</code>
              <span class="border border-[#c97d1e] bg-[#fcf5eb] px-2 py-0.5 font-mono text-[11px] font-bold text-[#c97d1e]">AWAITING REVIEW</span>
            </div>
            <p class="mt-2 text-xs leading-5 text-[#626662]">
              <span class="font-bold text-[#202220]">{{ designReceipt?.designName || designName }}</span> by {{ designReceipt?.designerName || customerName }}
            </p>
          </div>

          <!-- Design preview details -->
          <div class="mt-3 grid grid-cols-[96px_1fr] border border-[#d9dcd8] bg-[#f8f9f7] text-left">
            <div class="grid min-h-28 place-items-center border-r border-[#d9dcd8] bg-[#e9ece9] p-2">
              <img v-if="selectedShoe.image" :src="selectedShoe.image" :alt="`${selectedShoe.name} design preview`" class="h-full w-full object-contain" />
              <span v-else class="font-display text-lg font-black text-[#6a6e6a]">3D</span>
            </div>
            <div class="p-4">
              <h3 class="font-display text-lg font-black text-[#202220]">{{ selectedShoe.name }}</h3>
              <p class="mt-1 text-xs text-[#626662]">{{ selectedCharm.label }} charm · {{ customizedCount }} customized parts</p>
              <div class="mt-3 flex flex-wrap gap-1.5" aria-label="Reserved part colors">
                <span
                  v-for="part in selectedParts"
                  :key="part.id"
                  class="size-5 border border-black/15"
                  :style="{ backgroundColor: partColors[part.id]?.value || '#ffffff' }"
                  :title="`${part.label}: ${partColors[part.id]?.name || 'Original color'}`"
                />
              </div>
            </div>
          </div>

          <p class="mt-4 text-xs leading-5 text-[#626662]">
            Once approved by our curators, your colorway will be published to the Community Gallery for others to browse and customize.
          </p>

          <div class="mt-6 flex flex-col gap-2.5">
            <button
              type="button"
              class="h-11 w-full bg-[#292b2d] font-bold text-white transition-colors hover:bg-[#1a1b1c] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#245fa8]"
              @click="goToGallery"
            >
              View Gallery
            </button>
            <button
              type="button"
              class="h-11 w-full border border-[#8e938e] font-bold hover:bg-[#f1f3f0] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#245fa8]"
              @click="closeDesignModal"
            >
              Continue Designing
            </button>
          </div>
        </div>
      </div>
    </div>

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

