<script setup>
import { computed, ref, watch } from 'vue'
import { api } from '../api.js'

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

// ── Tab Navigation ──────────────────────────────────────────
const activeTab = ref('products') // 'products' | 'orders' | 'settings'

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
    }
  },
  { immediate: true }
)

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
          <span>My Products (0)</span>
        </button>

        <button
          type="button"
          class="flex items-center gap-2 border-b-2 px-6 py-4 font-mono text-xs font-bold uppercase tracking-wider transition-all"
          :class="activeTab === 'orders'
            ? 'border-[#b94d27] bg-white text-[#202220] shadow-[inset_0_-2px_0_#b94d27]'
            : 'border-transparent text-[#5f635f] hover:bg-[#f1f3f0] hover:text-[#202220]'"
          @click="activeTab = 'orders'"
        >
          <span>My Orders (0)</span>
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
      </nav>

      <!-- ════════════════════════════════════════════════════════ -->
      <!-- TAB 1: MY PRODUCTS (Placeholder for Sub-project 2)       -->
      <!-- ════════════════════════════════════════════════════════ -->
      <section v-if="activeTab === 'products'" class="mt-6 space-y-6">
        <div class="border-2 border-stone-900 bg-[#fcfdfb] p-8 shadow-[6px_6px_0px_#202220]">
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
                type="button"
                class="border-2 border-stone-900 bg-[#292b2d] px-6 py-3 font-mono text-xs font-bold text-white uppercase tracking-wider transition-colors hover:bg-[#b94d27] focus-visible:outline-2 focus-visible:outline-[#245fa8]"
              >
                + Create New Product
              </button>
              <button
                type="button"
                class="border-2 border-stone-900 bg-white px-6 py-3 font-mono text-xs font-bold text-[#202220] uppercase tracking-wider transition-colors hover:bg-[#f1f3f0] focus-visible:outline-2 focus-visible:outline-[#245fa8]"
              >
                Start Tutorial
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- ════════════════════════════════════════════════════════ -->
      <!-- TAB 2: MY ORDERS (Placeholder for Sub-project 3)         -->
      <!-- ════════════════════════════════════════════════════════ -->
      <section v-if="activeTab === 'orders'" class="mt-6 space-y-6">
        <div class="border-2 border-stone-900 bg-[#fcfdfb] p-8 shadow-[6px_6px_0px_#202220]">
          <div class="flex flex-col items-center justify-center py-12 text-center">
            <!-- Clipboard / Order icon -->
            <div class="flex h-16 w-16 items-center justify-center border-2 border-stone-900 bg-[#f7f8f6] text-[#202220]">
              <svg class="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
              </svg>
            </div>

            <h2 class="mt-5 font-display text-xl font-black tracking-tight text-[#202220] uppercase sm:text-2xl">
              No incoming orders yet.
            </h2>

            <p class="mt-2 max-w-md text-sm text-[#5f635f]">
              When customers configure and reserve your 3D custom silhouettes for store pickup, reservation details and colorway specifications will show up here.
            </p>
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

    </div>
  </div>
</template>
