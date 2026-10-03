<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { api } from '../api.js'

const props = defineProps({
  active: {
    type: Boolean,
    default: true,
  },
  forceStep: {
    type: String,
    default: '',
  },
  currentUser: {
    type: Object,
    default: () => null,
  },
})

const emit = defineEmits(['step-changed', 'tutorial-completed', 'tutorial-skipped', 'close'])

export const TUTORIAL_STEPS = [
  {
    id: 'welcome',
    title: 'Welcome to Seller Studio',
    text: 'Welcome! This guided walkthrough will help you list your first 3D customizable sneaker on KickCraft.',
    badge: 'Overview',
  },
  {
    id: 'create_product',
    title: 'Create New Product',
    text: "Start by clicking '+ Create New Product' to open the 3D product builder wizard.",
    badge: 'Step 1',
  },
  {
    id: 'choose_method',
    title: 'Select Creation Method',
    text: 'Choose how to create your shoe: upload an existing GLB, generate a 3D model from a 2D photo with AI, or use KickCraft modular templates.',
    badge: 'Step 2',
  },
  {
    id: 'tag_meshes',
    title: 'Tag 3D Shoe Meshes',
    text: 'Map your 3D shoe meshes to customizable zones (Upper, Midsole, Laces, etc.) using auto-detection or manual assignment.',
    badge: 'Step 3',
  },
  {
    id: 'customize_colors',
    title: 'Set Default Colors & Charms',
    text: 'Configure default part colors and attach an accessory charm (star, k-tag, etc.) to your shoe.',
    badge: 'Step 4',
  },
  {
    id: 'set_details',
    title: 'Product Details & Pricing',
    text: 'Set your shoe name, store description, price in PHP, available sizes, and counter pickup stock.',
    badge: 'Step 5',
  },
  {
    id: 'submit_product',
    title: 'Submit for Store Approval',
    text: 'Submit your shoe for admin moderation. Once approved, it appears in the public 3D marketplace!',
    badge: 'Step 6',
  },
  {
    id: 'manage_orders',
    title: 'Fulfill Pickup Orders',
    text: 'When customers reserve your design, manage and update pickup orders directly from your orders dashboard.',
    badge: 'Step 7',
  },
]

// ── State ───────────────────────────────────────────────────
const currentStepIndex = ref(0)
const completedSteps = ref([])
const isSaving = ref(false)

// Target tracking & Spotlight geometry
const targetRect = ref(null)
const hasTarget = ref(false)

const currentStep = computed(() => {
  return TUTORIAL_STEPS[currentStepIndex.value] || TUTORIAL_STEPS[0]
})

const isFirstStep = computed(() => currentStepIndex.value === 0)
const isLastStep = computed(() => currentStepIndex.value === TUTORIAL_STEPS.length - 1)

// ── Target Element & Spotlight Calculation ──────────────────
function updateSpotlight() {
  if (!props.active || typeof document === 'undefined') return

  const stepId = currentStep.value.id
  const targetElement = document.querySelector(`[data-tutorial="${stepId}"]`)

  if (targetElement) {
    const rect = targetElement.getBoundingClientRect()
    // Add padding around highlighted element
    const padding = 8
    targetRect.value = {
      top: Math.max(0, rect.top - padding),
      left: Math.max(0, rect.left - padding),
      width: rect.width + padding * 2,
      height: rect.height + padding * 2,
      bottom: rect.bottom + padding,
      right: rect.right + padding,
    }
    hasTarget.value = true

    // Gently scroll target into view if outside viewport
    const inView =
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
      rect.right <= (window.innerWidth || document.documentElement.clientWidth)

    if (!inView && typeof targetElement.scrollIntoView === 'function') {
      targetElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  } else {
    targetRect.value = null
    hasTarget.value = false
  }
}

// ── Dynamic Tooltip Card Positioning ────────────────────────
const cardStyle = computed(() => {
  if (!hasTarget.value || !targetRect.value || typeof window === 'undefined') {
    return {}
  }

  // Small screens: dock nicely near bottom
  if (window.innerWidth < 640) {
    return {
      position: 'fixed',
      bottom: '16px',
      left: '16px',
      right: '16px',
      maxWidth: 'calc(100vw - 32px)',
    }
  }

  const rect = targetRect.value
  const cardWidth = 420
  const cardEstimatedHeight = 240
  const margin = 16

  // Position vertically: below target if space permits, else above
  let top = rect.bottom + margin
  if (top + cardEstimatedHeight > window.innerHeight - 20) {
    top = Math.max(20, rect.top - cardEstimatedHeight - margin)
  }

  // Position horizontally: align with target left, clamp within viewport
  let left = rect.left
  if (left + cardWidth > window.innerWidth - 20) {
    left = Math.max(20, window.innerWidth - cardWidth - 20)
  }

  return {
    position: 'fixed',
    top: `${Math.round(top)}px`,
    left: `${Math.round(left)}px`,
    width: `${cardWidth}px`,
  }
})

// ── API Operations ──────────────────────────────────────────
async function loadProgress() {
  try {
    const res = await api('tutorial/progress.php')
    if (res?.success && res?.progress) {
      if (Array.isArray(res.progress.completed_steps)) {
        completedSteps.value = res.progress.completed_steps
      }

      if (props.forceStep) {
        jumpToStep(props.forceStep)
      } else if (res.progress.current_step && res.progress.current_step !== 'welcome') {
        jumpToStep(res.progress.current_step)
      }
    }
  } catch (err) {
    // Non-blocking fallback for dev / unauthenticated guests
    console.warn('Tutorial progress could not be loaded from API:', err?.message || err)
  }
}

async function persistProgress(stepId, updatedCompleted) {
  isSaving.value = true
  try {
    await api('tutorial/update.php', {
      method: 'POST',
      body: {
        currentStep: stepId,
        completedSteps: updatedCompleted,
      },
    })
  } catch (err) {
    console.warn('Tutorial progress could not be saved to API:', err?.message || err)
  } finally {
    isSaving.value = false
  }
}

function jumpToStep(stepIdentifier) {
  const index = TUTORIAL_STEPS.findIndex(s => s.id === stepIdentifier)
  if (index !== -1) {
    currentStepIndex.value = index
    nextTick(() => updateSpotlight())
  }
}

// ── Navigation Methods ──────────────────────────────────────
function nextStep() {
  const stepId = currentStep.value.id

  if (!completedSteps.value.includes(stepId)) {
    completedSteps.value.push(stepId)
  }

  if (isLastStep.value) {
    // Complete tutorial
    persistProgress('completed', [...completedSteps.value, 'manage_orders'])
    emit('step-changed', {
      step: 'completed',
      stepIndex: TUTORIAL_STEPS.length,
      totalSteps: TUTORIAL_STEPS.length,
    })
    emit('tutorial-completed')
    emit('close')
  } else {
    currentStepIndex.value++
    const nextStepId = currentStep.value.id
    persistProgress(nextStepId, completedSteps.value)
    emit('step-changed', {
      step: nextStepId,
      stepIndex: currentStepIndex.value,
      totalSteps: TUTORIAL_STEPS.length,
    })
    nextTick(() => updateSpotlight())
  }
}

function prevStep() {
  if (currentStepIndex.value > 0) {
    currentStepIndex.value--
    const prevStepId = currentStep.value.id
    emit('step-changed', {
      step: prevStepId,
      stepIndex: currentStepIndex.value,
      totalSteps: TUTORIAL_STEPS.length,
    })
    nextTick(() => updateSpotlight())
  }
}

function skipAll() {
  persistProgress('skipped', completedSteps.value)
  emit('tutorial-skipped')
  emit('close')
}

// Alias for flexibility
const skipTutorial = skipAll

function handleClose() {
  emit('close')
}

// ── Event Handlers ──────────────────────────────────────────
function handleResize() {
  updateSpotlight()
}

function handleScroll() {
  updateSpotlight()
}

function handleKeyDown(e) {
  if (!props.active) return
  if (e.key === 'Escape') {
    handleClose()
  } else if (e.key === 'ArrowRight' && !isLastStep.value) {
    nextStep()
  } else if (e.key === 'ArrowLeft' && !isFirstStep.value) {
    prevStep()
  }
}

// ── Watchers & Lifecycle ────────────────────────────────────
watch(
  () => props.forceStep,
  newStep => {
    if (newStep) {
      jumpToStep(newStep)
    }
  }
)

watch(
  () => props.active,
  isActive => {
    if (isActive) {
      nextTick(() => updateSpotlight())
    }
  }
)

onMounted(() => {
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', handleResize, { passive: true })
    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('keydown', handleKeyDown)
  }

  loadProgress()
  nextTick(() => updateSpotlight())
})

onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', handleResize)
    window.removeEventListener('scroll', handleScroll)
    window.removeEventListener('keydown', handleKeyDown)
  }
})
</script>

<template>
  <div v-if="active" class="fixed inset-0 z-50 overflow-hidden font-sans">
    <!-- ══════════════════════════════════════════════════════════ -->
    <!-- 1. FULLSCREEN BACKDROP (Dark Translucent Stone)            -->
    <!-- ══════════════════════════════════════════════════════════ -->
    <div
      class="fixed inset-0 bg-stone-900/60 transition-opacity duration-300"
      @click="handleClose"
    />

    <!-- ══════════════════════════════════════════════════════════ -->
    <!-- 2. SPOTLIGHT CUTOUT / HIGHLIGHT BOX                         -->
    <!-- ══════════════════════════════════════════════════════════ -->
    <div
      v-if="hasTarget && targetRect"
      class="fixed z-50 border-4 border-[#b94d27] bg-transparent pointer-events-none transition-all duration-300 ease-out shadow-[0_0_0_9999px_rgba(28,25,23,0.7)]"
      :style="{
        top: `${targetRect.top}px`,
        left: `${targetRect.left}px`,
        width: `${targetRect.width}px`,
        height: `${targetRect.height}px`,
      }"
    >
      <!-- Pulsing Terracotta Corner Stamp -->
      <span class="absolute -top-3 -right-3 flex h-6 w-6 items-center justify-center border-2 border-stone-900 bg-[#b94d27] text-white">
        <span class="h-2 w-2 animate-ping bg-white" />
      </span>
    </div>

    <!-- ══════════════════════════════════════════════════════════ -->
    <!-- 3. TUTORIAL TOOLTIP CARD (Centered or Smart Positioned)    -->
    <!-- ══════════════════════════════════════════════════════════ -->
    <div
      :class="[
        'z-50',
        hasTarget && targetRect
          ? ''
          : 'fixed inset-0 flex items-center justify-center p-4 pointer-events-none'
      ]"
    >
      <div
        class="w-full max-w-md pointer-events-auto border-2 border-stone-900 bg-[#fcfdfb] p-6 shadow-[6px_6px_0px_#202220] transition-all duration-200"
        :style="hasTarget && targetRect ? cardStyle : {}"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="'tutorial-step-title'"
      >
        <!-- Card Header: Step Badge & Close Button -->
        <div class="flex items-center justify-between border-b-2 border-stone-900 pb-3">
          <div class="flex items-center gap-2">
            <span class="inline-block h-2.5 w-2.5 bg-[#b94d27]" />
            <span class="font-mono text-xs font-black tracking-widest text-[#202220] uppercase">
              [ STEP {{ currentStepIndex + 1 }} OF {{ TUTORIAL_STEPS.length }} ]
            </span>
          </div>

          <button
            type="button"
            class="flex h-7 w-7 items-center justify-center border border-stone-900 bg-white text-[#202220] transition-colors hover:bg-stone-900 hover:text-white"
            aria-label="Close tutorial"
            @click="handleClose"
          >
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <!-- Progress Track (8 Segments) -->
        <div class="mt-3 flex gap-1" aria-hidden="true">
          <div
            v-for="(_, idx) in TUTORIAL_STEPS"
            :key="idx"
            class="h-1.5 flex-1 transition-colors duration-200"
            :class="idx <= currentStepIndex ? 'bg-[#b94d27]' : 'bg-[#e5e7eb]'"
          />
        </div>

        <!-- Step Content -->
        <div class="mt-4">
          <h3
            id="tutorial-step-title"
            class="font-display text-lg font-black tracking-tight text-[#202220] uppercase sm:text-xl"
          >
            {{ currentStep.title }}
          </h3>

          <p class="mt-2 text-sm leading-relaxed text-[#5f635f]">
            {{ currentStep.text }}
          </p>
        </div>

        <!-- Card Actions -->
        <div class="mt-6 flex flex-wrap items-center justify-between gap-3 border-t-2 border-stone-900 pt-4">
          <button
            type="button"
            class="font-mono text-xs font-semibold text-[#5f635f] uppercase tracking-wider underline underline-offset-4 transition-colors hover:text-[#b94d27]"
            @click="skipTutorial"
          >
            Skip Tutorial
          </button>

          <div class="flex items-center gap-2">
            <button
              v-if="!isFirstStep"
              type="button"
              class="border-2 border-stone-900 bg-white px-3.5 py-2 font-mono text-xs font-bold uppercase tracking-wider text-[#202220] transition-colors hover:bg-[#f1f3f0] focus-visible:outline-2 focus-visible:outline-[#245fa8]"
              @click="prevStep"
            >
              &larr; Back
            </button>

            <button
              type="button"
              class="border-2 border-stone-900 bg-stone-900 px-5 py-2 font-mono text-xs font-bold uppercase tracking-wider text-white transition-colors hover:bg-[#b94d27] focus-visible:outline-2 focus-visible:outline-[#245fa8]"
              @click="nextStep"
            >
              {{ isLastStep ? 'Finish &check;' : 'Next &rarr;' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
