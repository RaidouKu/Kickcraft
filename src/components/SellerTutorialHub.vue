<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: true,
  },
  initialGuideId: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['close', 'select-method', 'go-to-tab', 'start-walkthrough'])

// Selected guide ID ('glb-upload', 'ai-generate', 'template-orders', or '' for hub overview)
const selectedGuideId = ref(props.initialGuideId || '')
const currentStepIndex = ref(0)

const TUTORIAL_TRACKS = [
  {
    id: 'glb-upload',
    method: 'upload',
    number: '01',
    badge: '3D MODEL FILE · MULTI-PART',
    title: '3D GLB Upload & Mesh Tagging',
    subtitle: 'Upload a 3D sneaker file, map customizable parts (Upper, Midsole, Laces), and set default colors.',
    readTime: '3 min read',
    difficulty: 'Easy · Step-by-Step',
    ctaText: 'Upload GLB Now',
    ctaAction: 'upload',
    heroDescription:
      'Turn your 3D shoe file into an interactive product that buyers can color and inspect in 360° before reserving for store pickup.',
    steps: [
      {
        stepNumber: 1,
        title: 'Choose "Upload GLB Model"',
        goal: 'Pick the GLB creation path in the seller wizard.',
        mockupType: 'creation_methods',
        whatYouSee: 'A 3-card screen showing your creation options. The "Upload GLB Model" card is on the left.',
        whatToDo: [
          'Click "+ Create New Product" on your seller dashboard.',
          'Click the "Upload GLB Model" card to start.',
          'Click "Next Step" to proceed to file upload.',
        ],
        proTip: 'Binary .glb files contain 3D models and textures in one single package for fast loading.',
      },
      {
        stepNumber: 2,
        title: 'Drop Your 3D Shoe File',
        goal: 'Upload your .glb file and inspect it on the 3D stage.',
        mockupType: 'file_dropzone',
        whatYouSee: 'A dashed drag-and-drop box. Once dropped, your 3D shoe appears on a turntable stage.',
        whatToDo: [
          'Drag and drop your .glb shoe file into the dashed box (or click to browse).',
          'Wait 2 seconds while KickCraft checks the file integrity.',
          'Inspect the 3D preview by dragging with your mouse to rotate 360°.',
        ],
        proTip: 'Keep your 3D shoe file under 20MB so customers on mobile phones can load it instantly.',
      },
      {
        stepNumber: 3,
        title: 'Tag Shoe Parts & Pick Colors',
        goal: 'Assign shoe parts (Upper, Sole, Laces) and choose base colors.',
        mockupType: 'mesh_tagger',
        whatYouSee: 'The interactive 3D shoe on the left and 8 part chips on the right.',
        whatToDo: [
          'Click "Auto-Detect Meshes" to match shoe parts automatically.',
          'Click any shoe part (Upper, Midsole, Laces) and choose its default color.',
          'Pick an optional 3D accessory charm (Star, Lightning, or K-Tag).',
        ],
        proTip: 'Each tagged part can be recolored by customers in the marketplace before pickup reservation.',
      },
      {
        stepNumber: 4,
        title: 'Set Price & Submit for Approval',
        goal: 'Enter shoe details and submit to store admin.',
        mockupType: 'details_form',
        whatYouSee: 'A simple form with shoe name, counter pickup price, inventory stock, and shoe sizes.',
        whatToDo: [
          'Enter a shoe name and your store pickup price (₱).',
          'Select the sizes you have in stock at your counter (e.g., 40 to 44).',
          'Click "Submit for Review" — the store owner will approve it for the marketplace!',
        ],
        proTip: 'Customers reserve their exact shoe size and pay at your store counter upon pickup.',
      },
    ],
  },
  {
    id: 'ai-generate',
    method: 'ai_generate',
    number: '02',
    badge: 'AI 2D→3D · ZERO 3D SKILLS NEEDED',
    title: 'AI Sneaker Generator (Photos to 3D)',
    subtitle: 'Upload real shoe photos and let our AI build an authentic 3D sneaker in Charm-Only mode.',
    readTime: '3 min read',
    difficulty: 'Super Simple',
    ctaText: 'Synthesize Shoe with AI',
    ctaAction: 'ai_generate',
    heroDescription:
      'No 3D modeling skills needed! Snap clean photos of your physical shoe, and AI builds an interactive 3D sneaker ready for customer pickup.',
    steps: [
      {
        stepNumber: 1,
        title: 'Take 3 Clean Shoe Photos',
        goal: 'Capture clear photos on a plain background.',
        mockupType: 'photo_tips',
        whatYouSee: 'Photo guidelines showing clean side profile photos on plain neutral backgrounds.',
        whatToDo: [
          'Place your shoe on a plain table or clean floor with good lighting.',
          'Take 1 side profile photo (required) showing the whole silhouette.',
          'Optional: Take 1 front photo and 1 heel photo for sharper 3D reconstruction.',
        ],
        proTip: 'Avoid messy backgrounds or heavy shadows. Clean photos give the cleanest 3D shoes.',
      },
      {
        stepNumber: 2,
        title: 'Upload Photos to AI Slots',
        goal: 'Drop photos into the Side, Front, and Heel slots.',
        mockupType: 'ai_upload_slots',
        whatYouSee: 'Three photo upload boxes labeled Side View, Front Angle, and Heel/Back.',
        whatToDo: [
          'Choose "AI 2D→3D Generation" in Step 0 of the wizard.',
          'Click Slot 1 and upload your side profile photo.',
          'Click "Generate 3D Model with AI" to begin synthesis.',
        ],
        proTip: 'AI reconstruction takes about 30–60 seconds on cloud GPU processors.',
      },
      {
        stepNumber: 3,
        title: 'Understand Charm-Only Mode',
        goal: 'Learn how AI shoes preserve real photo textures.',
        mockupType: 'charm_only_mode',
        whatYouSee: 'A badge confirming "Charm-Only Mode" is active for authentic photo realism.',
        whatToDo: [
          'Notice your shoe displays the exact real photographed colors and fabric textures.',
          'Because textures are baked authentically, recoloring is locked to keep it looking real.',
          'Customers can still add interchangeable 3D charms and reserve their size!',
        ],
        proTip: 'Charm-Only Mode keeps your real-life leather, stitching, and logos 100% authentic.',
      },
      {
        stepNumber: 4,
        title: 'Set Price & Submit for Store Pickup',
        goal: 'Launch your AI shoe in the public marketplace.',
        mockupType: 'details_form',
        whatYouSee: 'Details form with instant photo thumbnail preview.',
        whatToDo: [
          'Enter your shoe name, counter price, and available inventory.',
          'Your original uploaded photo automatically becomes the crisp store thumbnail.',
          'Click "Submit for Review" to submit to store admin.',
        ],
        proTip: 'Once approved, your AI shoe appears live in the public marketplace at kickcraft.kesug.com/#shop.',
      },
    ],
  },
  {
    id: 'template-orders',
    method: 'template',
    number: '03',
    badge: 'FAST LAUNCH · FULFILLMENT GUIDE',
    title: 'Templates & Order Management',
    subtitle: 'Launch colorways from verified templates and fulfill customer counter pickup orders.',
    readTime: '3 min read',
    difficulty: 'Beginner Friendly',
    ctaText: 'Build from Template Now',
    ctaAction: 'template',
    heroDescription:
      'Launch products in under 2 minutes using pre-tagged modular templates, and master the customer pickup order lifecycle.',
    steps: [
      {
        stepNumber: 1,
        title: 'Pick a Verified Shoe Silhouette',
        goal: 'Select a ready-made 3D shoe template.',
        mockupType: 'template_selector',
        whatYouSee: 'Three verified silhouettes: Soleview Flagship, Air Max Edition, and Dunk Low Retro.',
        whatToDo: [
          'Click "+ Create New Product" and choose "Start from Template".',
          'Click on your preferred shoe silhouette.',
          'All 8 shoe parts are pre-tagged and ready for instant coloring!',
        ],
        proTip: 'Templates are lightweight (< 5MB) and load instantly on all smartphones.',
      },
      {
        stepNumber: 2,
        title: 'Color Your Signature Shoe',
        goal: 'Create your unique colorway in the 3D studio.',
        mockupType: 'template_recolor',
        whatYouSee: 'The 3D template with clickable parts and real-time color swatches.',
        whatToDo: [
          'Click any shoe part (Upper, Sole, Laces, Tongue) and select a color.',
          'Add an optional accessory charm to make it special.',
          'Click "Next Step", enter your price and stock, and submit for review.',
        ],
        proTip: 'Use bright contrasting colors to make your design pop on the marketplace storefront.',
      },
      {
        stepNumber: 3,
        title: 'Customer Pickup Reservation Flow',
        goal: 'Understand how buyers reserve shoes at the store.',
        mockupType: 'customer_checkout',
        whatYouSee: 'A customer reserving your sneaker card with your badge: [ BY YOUR STORE ].',
        whatToDo: [
          'Customers customize colors, pick their shoe size, and submit guest info.',
          'Zero online payment! Customers pay cash or card at your counter upon pickup.',
          'Each reservation automatically holds 1 pair from your product inventory.',
        ],
        proTip: 'In-store pickup means no shipping delays, no courier fees, and no packaging hassles.',
      },
      {
        stepNumber: 4,
        title: 'Fulfill Orders in "My Orders"',
        goal: 'Confirm, prepare, and complete customer pickups.',
        mockupType: 'orders_management',
        whatYouSee: 'Your "My Orders" dashboard tab displaying customer name, size, and pickup date.',
        whatToDo: [
          'Step ① [ Pending ]: Click "Confirm" when you accept the reservation.',
          'Step ② [ Ready ]: Click "Mark Ready" when the shoe is waiting at your counter.',
          'Step ③ [ Completed ]: When the customer arrives, pays, and picks up, click "Complete"!',
        ],
        proTip: 'If a customer does not show up, click "Cancel Order" to automatically return the shoe to stock.',
      },
    ],
  },
]

const currentGuide = computed(() => {
  return TUTORIAL_TRACKS.find((t) => t.id === selectedGuideId.value) || null
})

const currentStep = computed(() => {
  if (!currentGuide.value?.steps) return null
  return currentGuide.value.steps[currentStepIndex.value] || currentGuide.value.steps[0]
})

function openGuide(guideId) {
  selectedGuideId.value = guideId
  currentStepIndex.value = 0
}

function backToHub() {
  selectedGuideId.value = ''
  currentStepIndex.value = 0
}

function nextStep() {
  if (currentGuide.value && currentStepIndex.value < currentGuide.value.steps.length - 1) {
    currentStepIndex.value++
  }
}

function prevStep() {
  if (currentStepIndex.value > 0) {
    currentStepIndex.value--
  }
}

function goToStep(idx) {
  if (currentGuide.value && idx >= 0 && idx < currentGuide.value.steps.length) {
    currentStepIndex.value = idx
  }
}

function handleCtaClick(action) {
  if (action === 'upload') {
    emit('select-method', 'upload')
  } else if (action === 'ai_generate') {
    emit('select-method', 'ai_generate')
  } else if (action === 'template') {
    emit('select-method', 'template')
  } else if (action === 'orders') {
    emit('go-to-tab', 'orders')
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- ── Academy Hero Header ─────────────────────────────── -->
    <div class="border-2 border-stone-900 bg-white p-6 md:p-8 shadow-[6px_6px_0px_#202220]">
      <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b-2 border-stone-900 pb-5">
        <div>
          <div class="inline-flex items-center gap-2 border border-stone-900 bg-[#fdf2ef] px-2.5 py-0.5 font-mono text-xs font-black uppercase text-[#b94d27]">
            <span>KICKCRAFT SELLER ACADEMY</span>
            <span class="text-stone-400">&bull;</span>
            <span>BEGINNER ONBOARDING</span>
          </div>
          <h2 class="mt-2 font-display text-2xl font-black uppercase tracking-tight text-[#202220] md:text-3xl">
            How to Build, Customize, &amp; Sell 3D Shoes
          </h2>
          <p class="mt-1 text-sm text-[#5f635f] max-w-2xl">
            Simple, visual step-by-step guides for everyday sellers. Learn how to launch 3D footwear in 3 minutes and manage customer store pickup orders.
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-3 shrink-0">
          <button
            type="button"
            class="border-2 border-stone-900 bg-[#292b2d] px-4 py-2.5 font-mono text-xs font-bold uppercase tracking-wider text-white shadow-[3px_3px_0px_#b94d27] transition-all hover:-translate-y-0.5 hover:bg-[#b94d27]"
            @click="emit('start-walkthrough')"
          >
            Launch Interactive Tour
          </button>
          <button
            v-if="selectedGuideId"
            type="button"
            class="border-2 border-stone-900 bg-white px-3.5 py-2.5 font-mono text-xs font-bold uppercase tracking-wider text-[#202220] shadow-[3px_3px_0px_#202220] transition-colors hover:bg-stone-100"
            @click="backToHub"
          >
            &larr; All Guides
          </button>
        </div>
      </div>

      <!-- Quick Track Highlights -->
      <div class="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3 font-mono text-xs">
        <button
          type="button"
          class="border-2 p-3 text-left transition-all hover:border-stone-900"
          :class="selectedGuideId === 'glb-upload' ? 'border-[#b94d27] bg-[#fdf2ef]' : 'border-stone-200 bg-[#f7f8f6]'"
          @click="openGuide('glb-upload')"
        >
          <span class="text-stone-500 uppercase text-[10px] block font-bold">Track 01 &middot; 4 Steps</span>
          <span class="font-bold text-[#202220]">Upload 3D GLB Shoe &rarr;</span>
        </button>
        <button
          type="button"
          class="border-2 p-3 text-left transition-all hover:border-stone-900"
          :class="selectedGuideId === 'ai-generate' ? 'border-[#b94d27] bg-[#fdf2ef]' : 'border-stone-200 bg-[#f7f8f6]'"
          @click="openGuide('ai-generate')"
        >
          <span class="text-stone-500 uppercase text-[10px] block font-bold">Track 02 &middot; 4 Steps</span>
          <span class="font-bold text-[#202220]">AI 2D&rarr;3D from Photos &rarr;</span>
        </button>
        <button
          type="button"
          class="border-2 p-3 text-left transition-all hover:border-stone-900"
          :class="selectedGuideId === 'template-orders' ? 'border-[#b94d27] bg-[#fdf2ef]' : 'border-stone-200 bg-[#f7f8f6]'"
          @click="openGuide('template-orders')"
        >
          <span class="text-stone-500 uppercase text-[10px] block font-bold">Track 03 &middot; 4 Steps</span>
          <span class="font-bold text-[#202220]">Templates &amp; Store Pickup &rarr;</span>
        </button>
      </div>
    </div>

    <!-- ── HUB VIEW: 3 Track Selection Cards ───────────────── -->
    <div v-if="!currentGuide" class="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div
        v-for="track in TUTORIAL_TRACKS"
        :key="track.id"
        class="flex flex-col justify-between border-2 border-stone-900 bg-white p-6 shadow-[5px_5px_0px_#202220] transition-all hover:-translate-y-1 hover:shadow-[7px_7px_0px_#202220]"
      >
        <div>
          <div class="flex items-center justify-between border-b-2 border-stone-900 pb-3 font-mono text-xs">
            <span class="font-black text-white bg-stone-900 px-2 py-0.5">{{ track.number }}</span>
            <span class="font-bold text-[#b94d27]">{{ track.difficulty }}</span>
          </div>

          <h3 class="mt-4 font-display text-xl font-black uppercase text-[#202220]">
            {{ track.title }}
          </h3>
          <p class="mt-2 text-xs text-[#5f635f] leading-relaxed">
            {{ track.subtitle }}
          </p>

          <div class="mt-4 border-l-2 border-[#b94d27] bg-[#fdf2ef] p-2.5 font-mono text-[11px] text-[#202220]">
            <span class="font-bold block text-[#b94d27]">What You Will Learn:</span>
            <span>{{ track.heroDescription }}</span>
          </div>
        </div>

        <div class="mt-6 space-y-2 pt-4 border-t border-stone-200">
          <button
            type="button"
            class="w-full border-2 border-stone-900 bg-[#292b2d] py-3 text-center font-mono text-xs font-bold uppercase tracking-wider text-white shadow-[2px_2px_0px_#b94d27] transition-all hover:bg-[#b94d27]"
            @click="openGuide(track.id)"
          >
            Start Visual Guide ({{ track.steps.length }} Steps) &rarr;
          </button>
          <button
            type="button"
            class="w-full border border-stone-400 bg-white py-2 text-center font-mono text-[11px] font-bold uppercase tracking-wider text-stone-700 hover:border-stone-900 hover:text-black"
            @click="handleCtaClick(track.ctaAction)"
          >
            {{ track.ctaText }}
          </button>
        </div>
      </div>
    </div>

    <!-- ── GUIDE READER VIEW (Interactive Step Slider / Stepper) ── -->
    <div v-else-if="currentStep" class="space-y-6">
      <!-- Stepper Navigation Header -->
      <div class="border-2 border-stone-900 bg-[#f7f8f6] p-5 shadow-[4px_4px_0px_#202220]">
        <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between border-b border-stone-300 pb-4">
          <div>
            <div class="flex items-center gap-2">
              <span class="border border-stone-900 bg-stone-900 px-2 py-0.5 font-mono text-[10px] font-black uppercase text-white">
                GUIDE {{ currentGuide.number }}
              </span>
              <span class="font-mono text-xs font-bold text-[#b94d27] uppercase">
                {{ currentGuide.badge }}
              </span>
            </div>
            <h2 class="mt-1 font-display text-xl font-black uppercase text-[#202220] md:text-2xl">
              {{ currentGuide.title }}
            </h2>
          </div>

          <div class="flex items-center gap-2 shrink-0">
            <button
              type="button"
              class="border-2 border-stone-900 bg-white px-3 py-1.5 font-mono text-xs font-bold uppercase text-[#202220] hover:bg-stone-100"
              @click="backToHub"
            >
              &larr; Back to Guides
            </button>
            <button
              type="button"
              class="border-2 border-stone-900 bg-[#b94d27] px-4 py-1.5 font-mono text-xs font-bold uppercase tracking-wider text-white hover:bg-[#202220]"
              @click="handleCtaClick(currentGuide.ctaAction)"
            >
              {{ currentGuide.ctaText }} &rarr;
            </button>
          </div>
        </div>

        <!-- Interactive Step Indicator Pills -->
        <div class="mt-4 flex flex-wrap items-center gap-2 font-mono text-xs">
          <span class="font-bold text-stone-500 uppercase mr-1">Steps:</span>
          <button
            v-for="(s, idx) in currentGuide.steps"
            :key="s.stepNumber"
            type="button"
            class="flex items-center gap-1.5 border-2 px-3 py-1 font-bold uppercase transition-all"
            :class="currentStepIndex === idx
              ? 'border-stone-900 bg-[#292b2d] text-white shadow-[2px_2px_0px_#b94d27]'
              : 'border-stone-300 bg-white text-stone-700 hover:border-stone-900'"
            @click="goToStep(idx)"
          >
            <span>Step {{ s.stepNumber }}</span>
            <span class="hidden sm:inline text-[10px] opacity-80">&middot; {{ s.title.split(' ')[0] }}</span>
          </button>
        </div>
      </div>

      <!-- Focused Active Step Card (One Step at a Time) -->
      <div class="border-2 border-stone-900 bg-white p-6 md:p-8 shadow-[5px_5px_0px_#202220]">
        <!-- Step Header -->
        <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b-2 border-stone-900 pb-4">
          <div class="flex items-center gap-3">
            <span class="flex size-10 items-center justify-center border-2 border-stone-900 bg-[#b94d27] font-mono text-sm font-black text-white shadow-[2px_2px_0px_#202220]">
              0{{ currentStep.stepNumber }}
            </span>
            <div>
              <span class="font-mono text-[10px] font-bold text-stone-500 uppercase">
                Step {{ currentStepIndex + 1 }} of {{ currentGuide.steps.length }}
              </span>
              <h3 class="font-display text-xl font-black uppercase tracking-tight text-[#202220] md:text-2xl">
                {{ currentStep.title }}
              </h3>
            </div>
          </div>
          <span class="border border-stone-900 bg-stone-100 px-3 py-1 font-mono text-xs font-bold text-stone-700 uppercase">
            Goal: {{ currentStep.goal }}
          </span>
        </div>

        <!-- 2-Column Layout: Left Action Steps, Right Visual Screenshot with Pointer Badges -->
        <div class="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
          <!-- Left Column (5 Cols): Plain-English Actions & Tips -->
          <div class="lg:col-span-5 space-y-4">
            <!-- Action Steps Box -->
            <div class="border-2 border-stone-900 bg-[#fcfdfb] p-5 shadow-[3px_3px_0px_#202220]">
              <div class="flex items-center gap-2 border-b-2 border-stone-900 pb-2">
                <span class="text-base">&#9997;</span>
                <h4 class="font-mono text-xs font-black uppercase tracking-wider text-stone-900">
                  What To Do (Action Steps)
                </h4>
              </div>
              <ul class="mt-4 space-y-3 font-mono text-xs text-[#202220]">
                <li v-for="(item, i) in currentStep.whatToDo" :key="i" class="flex items-start gap-2.5">
                  <span class="inline-flex items-center justify-center size-5 shrink-0 rounded-full border border-stone-900 bg-[#292b2d] text-white font-bold text-[11px]">
                    {{ i === 0 ? '①' : i === 1 ? '②' : '③' }}
                  </span>
                  <span class="leading-relaxed font-sans text-xs text-stone-800">{{ item }}</span>
                </li>
              </ul>
            </div>

            <!-- What You See Box -->
            <div class="border-2 border-stone-900 bg-stone-50 p-4 shadow-[2px_2px_0px_#202220]">
              <div class="flex items-center gap-2 border-b border-stone-300 pb-1.5">
                <span class="text-sm">&#128065;</span>
                <h4 class="font-mono text-[11px] font-black uppercase tracking-wider text-stone-900">
                  What You See on Screen
                </h4>
              </div>
              <p class="mt-2 text-xs text-stone-600 leading-relaxed font-sans">
                {{ currentStep.whatYouSee }}
              </p>
            </div>

            <!-- Pro-Tip Box -->
            <div class="border-2 border-stone-900 bg-amber-50 p-4 font-mono text-xs shadow-[2px_2px_0px_#202220]">
              <div class="flex items-center gap-1.5 text-amber-900 font-bold uppercase text-[11px]">
                <span>&#128161; Pro-Tip:</span>
              </div>
              <p class="mt-1 text-amber-900 text-xs leading-relaxed font-sans">
                {{ currentStep.proTip }}
              </p>
            </div>
          </div>

          <!-- Right Column (7 Cols): Visual UI Mockup with Pointer Badges -->
          <div class="lg:col-span-7">
            <div class="border-2 border-stone-900 bg-stone-100 p-4 shadow-[4px_4px_0px_#202220]">
              <div class="flex items-center justify-between border-b border-stone-300 pb-2 font-mono text-[10px] text-stone-500 uppercase">
                <span class="font-bold text-stone-700">&bull; KickCraft Screen Visualization</span>
                <span>Look for the ① ② ③ badges</span>
              </div>

              <!-- Dynamic UI Mockup Renderers with Numbered Callout Badges -->
              <div class="mt-3 overflow-hidden border-2 border-stone-900 bg-white p-4 relative">
                <!-- Mockup 1: Creation Methods -->
                <div v-if="currentStep.mockupType === 'creation_methods'" class="grid grid-cols-1 gap-3 sm:grid-cols-3 font-mono text-xs">
                  <div class="border-2 border-[#b94d27] bg-[#fdf2ef] p-3 text-center shadow-[2px_2px_0px_#b94d27] relative">
                    <span class="absolute -top-3 -right-2 inline-flex items-center justify-center size-6 rounded-full border-2 border-stone-900 bg-[#b94d27] font-mono text-xs font-black text-white shadow-[1px_1px_0px_#202220]">①</span>
                    <span class="block font-black uppercase text-[#b94d27]">[ SELECT THIS ]</span>
                    <span class="mt-1 block font-bold text-stone-900">1. Upload GLB</span>
                    <span class="mt-1 block text-[10px] text-stone-600">Max 20MB &middot; .glb</span>
                  </div>
                  <div class="border border-stone-300 bg-stone-50 p-3 text-center opacity-60">
                    <span class="block font-bold text-stone-700">2. AI 2D&rarr;3D</span>
                    <span class="mt-1 block text-[10px] text-stone-500">From Photos</span>
                  </div>
                  <div class="border border-stone-300 bg-stone-50 p-3 text-center opacity-60">
                    <span class="block font-bold text-stone-700">3. Template</span>
                    <span class="mt-1 block text-[10px] text-stone-500">Fast Launch</span>
                  </div>
                </div>

                <!-- Mockup 2: File Dropzone -->
                <div v-else-if="currentStep.mockupType === 'file_dropzone'" class="flex flex-col items-center justify-center border-2 border-dashed border-stone-900 bg-[#f7f8f6] py-8 font-mono text-xs relative">
                  <span class="absolute top-2 left-2 inline-flex items-center justify-center size-6 rounded-full border-2 border-stone-900 bg-[#b94d27] font-mono text-xs font-black text-white shadow-[1px_1px_0px_#202220]">①</span>
                  <div class="flex size-12 items-center justify-center border border-stone-900 bg-white shadow-[2px_2px_0px_#202220]">
                    <span class="font-bold text-lg text-[#b94d27]">&uarr;</span>
                  </div>
                  <span class="mt-3 font-bold uppercase text-stone-800">Drop your sneaker .glb here</span>
                  <span class="text-[10px] text-stone-500">or click to browse file from your computer</span>
                  <div class="mt-3 flex items-center gap-2">
                    <span class="inline-flex items-center justify-center size-5 rounded-full border border-stone-900 bg-[#292b2d] font-mono text-[10px] font-black text-white">②</span>
                    <span class="border border-stone-300 bg-white px-2 py-0.5 text-[9px] text-stone-600 uppercase font-bold">Binary .GLB format &middot; Under 20MB</span>
                  </div>
                </div>

                <!-- Mockup 3: Visual Mesh Tagger -->
                <div v-else-if="currentStep.mockupType === 'mesh_tagger'" class="grid grid-cols-1 gap-4 sm:grid-cols-2 font-mono text-xs">
                  <div class="flex items-center justify-center border border-stone-300 bg-stone-100 p-5 text-center relative">
                    <span class="absolute top-2 left-2 inline-flex items-center justify-center size-6 rounded-full border-2 border-stone-900 bg-[#b94d27] font-mono text-xs font-black text-white shadow-[1px_1px_0px_#202220]">①</span>
                    <div>
                      <span class="block text-3xl">&#128095;</span>
                      <span class="mt-1 block font-bold uppercase text-stone-800">3D Interactive Shoe</span>
                      <span class="text-[10px] text-stone-500">Drag to rotate 360&deg;</span>
                    </div>
                  </div>
                  <div class="space-y-1.5 border border-stone-200 bg-white p-3 text-[11px] relative">
                    <span class="absolute top-2 right-2 inline-flex items-center justify-center size-6 rounded-full border-2 border-stone-900 bg-[#b94d27] font-mono text-xs font-black text-white shadow-[1px_1px_0px_#202220]">②</span>
                    <div class="font-bold uppercase text-stone-600 border-b pb-1 text-[10px]">Click to Color Parts:</div>
                    <div class="flex items-center justify-between bg-emerald-50 border border-emerald-300 px-2 py-1 text-emerald-800 font-bold">
                      <span>Upper Main</span>
                      <span class="size-3 bg-[#b94d27] border border-stone-900"></span>
                    </div>
                    <div class="flex items-center justify-between bg-emerald-50 border border-emerald-300 px-2 py-1 text-emerald-800 font-bold">
                      <span>Midsole Sole</span>
                      <span class="size-3 bg-white border border-stone-900"></span>
                    </div>
                    <div class="flex items-center justify-between bg-emerald-50 border border-emerald-300 px-2 py-1 text-emerald-800 font-bold">
                      <span>Laces</span>
                      <span class="size-3 bg-[#292b2d] border border-stone-900"></span>
                    </div>
                  </div>
                </div>

                <!-- Mockup 4: Details & Form -->
                <div v-else-if="currentStep.mockupType === 'details_form'" class="space-y-3 font-mono text-xs relative">
                  <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div class="border border-stone-300 bg-white p-2.5 relative">
                      <span class="absolute -top-2 -right-2 inline-flex items-center justify-center size-5 rounded-full border border-stone-900 bg-[#b94d27] font-mono text-[10px] font-black text-white">①</span>
                      <span class="text-[10px] text-stone-500 block uppercase">Product Name</span>
                      <span class="font-bold text-stone-900">KickCraft Low 2026</span>
                    </div>
                    <div class="border border-stone-300 bg-white p-2.5 relative">
                      <span class="absolute -top-2 -right-2 inline-flex items-center justify-center size-5 rounded-full border border-stone-900 bg-[#b94d27] font-mono text-[10px] font-black text-white">②</span>
                      <span class="text-[10px] text-stone-500 block uppercase">Price &amp; Stock</span>
                      <span class="font-bold text-[#b94d27]">&#8369;4,999 &middot; 10 Pairs</span>
                    </div>
                  </div>
                  <div class="border border-stone-300 bg-stone-50 p-2.5 relative">
                    <span class="absolute -top-2 -right-2 inline-flex items-center justify-center size-5 rounded-full border border-stone-900 bg-[#b94d27] font-mono text-[10px] font-black text-white">③</span>
                    <span class="text-[10px] text-stone-500 block uppercase">Sizes for Store Pickup:</span>
                    <div class="mt-1 flex flex-wrap gap-1.5 font-bold text-[10px]">
                      <span class="border border-stone-900 bg-[#292b2d] px-2 py-0.5 text-white">40</span>
                      <span class="border border-stone-900 bg-[#292b2d] px-2 py-0.5 text-white">41</span>
                      <span class="border border-stone-900 bg-[#292b2d] px-2 py-0.5 text-white">42</span>
                      <span class="border border-stone-900 bg-[#292b2d] px-2 py-0.5 text-white">43</span>
                      <span class="border border-stone-900 bg-[#292b2d] px-2 py-0.5 text-white">44</span>
                    </div>
                  </div>
                </div>

                <!-- Mockup 5: Photo Tips -->
                <div v-else-if="currentStep.mockupType === 'photo_tips'" class="grid grid-cols-1 gap-3 sm:grid-cols-2 font-mono text-xs">
                  <div class="border border-emerald-400 bg-emerald-50 p-3 text-emerald-900 relative">
                    <span class="absolute top-2 right-2 inline-flex items-center justify-center size-6 rounded-full border-2 border-stone-900 bg-emerald-600 font-mono text-xs font-black text-white">①</span>
                    <span class="font-bold block">&check; DO THIS:</span>
                    <span class="text-[11px] block mt-1">Direct side view, plain flat table/floor, bright even lighting, whole shoe visible.</span>
                  </div>
                  <div class="border border-rose-400 bg-rose-50 p-3 text-rose-900">
                    <span class="font-bold block">&cross; AVOID THIS:</span>
                    <span class="text-[11px] block mt-1">Blurry angles, messy carpet, dark shadows, or hands holding the shoe.</span>
                  </div>
                </div>

                <!-- Mockup 6: AI Upload Slots -->
                <div v-else-if="currentStep.mockupType === 'ai_upload_slots'" class="grid grid-cols-1 gap-3 sm:grid-cols-3 font-mono text-xs">
                  <div class="border-2 border-stone-900 bg-white p-3 text-center relative shadow-[2px_2px_0px_#b94d27]">
                    <span class="absolute -top-2 -right-2 inline-flex items-center justify-center size-6 rounded-full border-2 border-stone-900 bg-[#b94d27] font-mono text-xs font-black text-white">①</span>
                    <span class="text-[10px] text-[#b94d27] font-bold block">1. SIDE PROFILE (REQUIRED)</span>
                    <span class="mt-2 block font-bold text-stone-800">[ Photo Attached &check; ]</span>
                  </div>
                  <div class="border border-stone-300 bg-stone-50 p-3 text-center relative">
                    <span class="absolute -top-2 -right-2 inline-flex items-center justify-center size-5 rounded-full border border-stone-900 bg-stone-400 font-mono text-[10px] font-black text-white">②</span>
                    <span class="text-[10px] text-stone-500 font-bold block">2. FRONT (OPTIONAL)</span>
                    <span class="mt-2 block text-stone-400">+ Add front</span>
                  </div>
                  <div class="border border-stone-300 bg-stone-50 p-3 text-center relative">
                    <span class="absolute -top-2 -right-2 inline-flex items-center justify-center size-5 rounded-full border border-stone-900 bg-stone-400 font-mono text-[10px] font-black text-white">③</span>
                    <span class="text-[10px] text-stone-500 font-bold block">3. HEEL (OPTIONAL)</span>
                    <span class="mt-2 block text-stone-400">+ Add heel</span>
                  </div>
                </div>

                <!-- Mockup 7: Charm-Only Mode -->
                <div v-else-if="currentStep.mockupType === 'charm_only_mode'" class="border border-blue-300 bg-blue-50 p-4 font-mono text-xs text-blue-950 relative">
                  <div class="flex items-center justify-between border-b border-blue-200 pb-2">
                    <span class="font-bold uppercase text-blue-900">[ CHARM-ONLY MODE ACTIVE ]</span>
                    <span class="inline-flex items-center justify-center size-6 rounded-full border-2 border-stone-900 bg-[#b94d27] font-mono text-xs font-black text-white">①</span>
                  </div>
                  <p class="mt-2 text-[11px] leading-relaxed">
                    <strong>Genuine Real Photographed Texture:</strong> Your shoe shows authentic photographed colors and stitching. Customers customize 3D charms (Star, Lightning, Tag) and choose their size for pickup.
                  </p>
                </div>

                <!-- Mockup 8: Template Selector -->
                <div v-else-if="currentStep.mockupType === 'template_selector'" class="grid grid-cols-1 gap-3 sm:grid-cols-3 font-mono text-xs">
                  <div class="border-2 border-[#b94d27] bg-[#fdf2ef] p-3 text-center shadow-[2px_2px_0px_#b94d27] relative">
                    <span class="absolute -top-2 -right-2 inline-flex items-center justify-center size-6 rounded-full border-2 border-stone-900 bg-[#b94d27] font-mono text-xs font-black text-white">①</span>
                    <span class="font-bold text-stone-900 block">Flagship Soleview</span>
                    <span class="text-[10px] text-stone-500">8 Customizable Parts</span>
                  </div>
                  <div class="border border-stone-300 bg-white p-3 text-center">
                    <span class="font-bold text-stone-900 block">Air Max Edition</span>
                    <span class="text-[10px] text-stone-500">Athletic Runner</span>
                  </div>
                  <div class="border border-stone-300 bg-white p-3 text-center">
                    <span class="font-bold text-stone-900 block">Dunk Low Retro</span>
                    <span class="text-[10px] text-stone-500">Court Heritage</span>
                  </div>
                </div>

                <!-- Mockup 9: Template Recolor -->
                <div v-else-if="currentStep.mockupType === 'template_recolor'" class="border border-stone-200 bg-stone-50 p-4 font-mono text-xs relative">
                  <span class="absolute top-2 right-2 inline-flex items-center justify-center size-6 rounded-full border-2 border-stone-900 bg-[#b94d27] font-mono text-xs font-black text-white">①</span>
                  <div class="flex items-center justify-between border-b pb-2">
                    <span class="font-bold uppercase">Click Any Part &rarr; Pick Color</span>
                    <span class="text-emerald-700 font-bold">&check; Instant 3D Update</span>
                  </div>
                  <div class="mt-3 flex items-center gap-2">
                    <span class="size-6 bg-[#b94d27] border-2 border-stone-900"></span>
                    <span class="size-6 bg-[#292b2d] border border-stone-400"></span>
                    <span class="size-6 bg-white border border-stone-400"></span>
                    <span class="size-6 bg-[#3f7652] border border-stone-400"></span>
                    <span class="text-[10px] text-stone-500 font-bold ml-2">Click to recolor zones instantly</span>
                  </div>
                </div>

                <!-- Mockup 10: Customer Checkout -->
                <div v-else-if="currentStep.mockupType === 'customer_checkout'" class="border-2 border-stone-900 bg-white p-4 font-mono text-xs shadow-[2px_2px_0px_#202220] relative">
                  <span class="absolute -top-2 -right-2 inline-flex items-center justify-center size-6 rounded-full border-2 border-stone-900 bg-[#b94d27] font-mono text-xs font-black text-white">①</span>
                  <div class="flex items-center justify-between border-b pb-2">
                    <span class="font-bold text-stone-900">Guest Pickup Reservation</span>
                    <span class="border border-stone-900 bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900">PAY AT STORE COUNTER</span>
                  </div>
                  <p class="mt-2 text-[11px] text-stone-600">
                    Buyer reserves with name and email &middot; Size 42 &middot; Pays at your counter upon pickup. Zero online payment or shipping required.
                  </p>
                </div>

                <!-- Mockup 11: Orders Management -->
                <div v-else-if="currentStep.mockupType === 'orders_management'" class="border-2 border-stone-900 bg-white p-4 font-mono text-xs shadow-[2px_2px_0px_#202220] relative">
                  <span class="absolute -top-2 -right-2 inline-flex items-center justify-center size-6 rounded-full border-2 border-stone-900 bg-[#b94d27] font-mono text-xs font-black text-white">①</span>
                  <div class="flex items-center justify-between border-b pb-2 font-bold">
                    <span>Order #KCO-2026-8812</span>
                    <span class="border border-amber-500 bg-amber-50 text-amber-800 px-2 py-0.5 text-[10px]">[ PENDING ]</span>
                  </div>
                  <div class="mt-3 flex flex-wrap gap-2 pt-1 text-[10px]">
                    <span class="border-2 border-stone-900 bg-[#292b2d] text-white px-2.5 py-1 font-bold">① Confirm Order</span>
                    <span class="border border-stone-400 bg-white text-stone-700 px-2.5 py-1 font-bold">② Mark Ready</span>
                    <span class="border border-stone-400 bg-white text-stone-700 px-2.5 py-1 font-bold">③ Complete &amp; Paid</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Stepper Navigation Footer (Prev / Next buttons) -->
        <div class="mt-8 pt-5 border-t-2 border-stone-900 flex flex-col sm:flex-row items-center justify-between gap-4 font-mono">
          <button
            type="button"
            :disabled="currentStepIndex === 0"
            class="w-full sm:w-auto border-2 border-stone-900 bg-white px-5 py-2.5 text-xs font-bold uppercase text-[#202220] shadow-[2px_2px_0px_#202220] transition-colors hover:bg-stone-100 disabled:opacity-40 disabled:cursor-not-allowed"
            @click="prevStep"
          >
            &larr; Previous Step
          </button>

          <!-- Step Dots -->
          <div class="flex items-center gap-2">
            <span
              v-for="(_, idx) in currentGuide.steps"
              :key="idx"
              class="size-2.5 rounded-full border border-stone-900 transition-all cursor-pointer"
              :class="currentStepIndex === idx ? 'bg-[#b94d27] scale-125' : 'bg-stone-200'"
              @click="goToStep(idx)"
            ></span>
          </div>

          <div class="w-full sm:w-auto flex items-center gap-2">
            <button
              v-if="currentStepIndex < currentGuide.steps.length - 1"
              type="button"
              class="w-full sm:w-auto border-2 border-stone-900 bg-[#292b2d] px-6 py-2.5 text-xs font-black uppercase text-white shadow-[2px_2px_0px_#b94d27] hover:bg-[#b94d27]"
              @click="nextStep"
            >
              Next Step &rarr;
            </button>
            <button
              v-else
              type="button"
              class="w-full sm:w-auto border-2 border-stone-900 bg-[#b94d27] px-6 py-2.5 text-xs font-black uppercase text-white shadow-[3px_3px_0px_#202220] hover:bg-[#202220]"
              @click="handleCtaClick(currentGuide.ctaAction)"
            >
              {{ currentGuide.ctaText }} &rarr;
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
