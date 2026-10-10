<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

const props = defineProps({
  show: {
    type: Boolean,
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  confirmText: {
    type: String,
    default: 'Confirm',
  },
  cancelText: {
    type: String,
    default: 'Cancel',
  },
  variant: {
    type: String,
    default: 'default',
    validator: value => ['danger', 'warning', 'default'].includes(value),
  },
  icon: {
    type: String,
    default: 'warning',
    validator: value => ['logout', 'trash', 'reset', 'warning'].includes(value),
  },
})

const emit = defineEmits(['confirm', 'cancel'])

const cancelButtonRef = ref(null)

const iconBadgeClass = computed(() => {
  switch (props.icon) {
    case 'logout':
      return 'bg-[#292b2d] text-white border-[#202220]'
    case 'trash':
      return 'bg-[#b94d27] text-white border-[#8f391b]'
    case 'reset':
      return 'bg-[#d97706] text-white border-[#b45309]'
    case 'warning':
    default:
      return 'bg-[#d97706] text-white border-[#b45309]'
  }
})

const confirmButtonClass = computed(() => {
  switch (props.variant) {
    case 'danger':
    case 'warning':
      return 'bg-[#b94d27] hover:bg-[#963a20] text-white'
    case 'default':
    default:
      return 'bg-[#292b2d] hover:bg-[#1a1b1c] text-white'
  }
})

function handleConfirm() {
  emit('confirm')
}

function handleCancel() {
  emit('cancel')
}

function handleKeydown(event) {
  if (event.key === 'Escape' && props.show) {
    handleCancel()
  }
}

watch(
  () => props.show,
  newVal => {
    if (newVal) {
      nextTick(() => {
        cancelButtonRef.value?.focus()
      })
    }
  }
)

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
  if (props.show) {
    nextTick(() => {
      cancelButtonRef.value?.focus()
    })
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div
    v-if="show"
    class="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
    role="dialog"
    aria-modal="true"
    aria-labelledby="confirm-modal-title"
    @click.self="handleCancel"
  >
    <div
      class="w-full max-w-md border border-[#8e938e] bg-[#fcfdfb] p-6 shadow-2xl text-[#292b2d]"
      @click.stop
    >
      <div class="flex items-start gap-4">
        <!-- Contextual Icon Badge -->
        <div
          class="flex size-11 shrink-0 items-center justify-center border shadow-inner"
          :class="iconBadgeClass"
          aria-hidden="true"
        >
          <!-- Logout Icon -->
          <svg
            v-if="icon === 'logout'"
            class="size-6"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>

          <!-- Trash / Danger Icon -->
          <svg
            v-else-if="icon === 'trash'"
            class="size-6"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <line x1="10" y1="11" x2="10" y2="17" />
            <line x1="14" y1="11" x2="14" y2="17" />
          </svg>

          <!-- Reset Icon -->
          <svg
            v-else-if="icon === 'reset'"
            class="size-6"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <polyline points="3 3 3 8 8 8" />
          </svg>

          <!-- Warning / Default Alert Icon -->
          <svg
            v-else
            class="size-6"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>

        <!-- Title & Explanatory Body -->
        <div class="flex-1 min-w-0 pt-0.5">
          <h3
            id="confirm-modal-title"
            class="font-display text-lg font-black text-[#202220] tracking-tight"
          >
            {{ title }}
          </h3>
          <p class="mt-2 text-sm leading-6 text-[#5f635f]">
            {{ message }}
          </p>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="mt-6 flex items-center justify-end gap-3">
        <button
          ref="cancelButtonRef"
          type="button"
          class="border border-[#bfc3bf] bg-white px-5 py-2.5 text-sm font-semibold text-[#292b2d] hover:bg-[#f1f3f0] transition-colors focus-visible:outline-2 focus-visible:outline-[#245fa8]"
          @click="handleCancel"
        >
          {{ cancelText }}
        </button>
        <button
          type="button"
          class="px-5 py-2.5 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-[#245fa8]"
          :class="confirmButtonClass"
          @click="handleConfirm"
        >
          {{ confirmText }}
        </button>
      </div>
    </div>
  </div>
</template>
