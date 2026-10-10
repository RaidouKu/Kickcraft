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

const TUTORIAL_TRACKS = [
  {
    id: 'glb-upload',
    method: 'upload',
    number: '01',
    badge: '3D MODEL FILE · MULTI-PART',
    title: '3D GLB Upload & Mesh Tagging',
    subtitle: 'Upload a 3D sneaker file, map customizable parts (Upper, Midsole, Laces), and set default colors.',
    readTime: '5 min read',
    difficulty: 'Intermediate',
    ctaText: 'Create with GLB Upload',
    ctaAction: 'upload',
    heroDescription:
      'Learn how to import your own 3D sneaker model, tag its parts using our visual clicker, attach 3D charms, and submit it for store approval.',
    steps: [
      {
        stepNumber: 1,
        title: 'Choose "Upload GLB Model" in Creation Step 0',
        goal: 'Select the 3D GLB creation path in the seller product wizard.',
        mockupType: 'creation_methods',
        whatYouSee: [
          'A three-card selection screen: Upload GLB Model, AI 2D→3D Generation, and KickCraft Templates.',
          'The GLB card displays "Max 20MB · .glb format" and a dark "Select Upload GLB" button.',
        ],
        whatToDo: [
          'Click the "+ Create New Product" button in your Seller Dashboard.',
          'Click on the "Upload GLB Model" card or its "Select Upload GLB" button.',
          'The wizard advances to Step 1: 3D Model & Mesh Tagging.',
        ],
        proTip:
          'Make sure your 3D model is exported in binary GLB format (.glb), not separated .gltf with external texture files. Keep your file size under 20MB for fast mobile rendering.',
      },
      {
        stepNumber: 2,
        title: 'Upload Your GLB & Inspect in the 3D Canvas',
        goal: 'Drop your .glb sneaker file and preview it in real-time.',
        mockupType: 'file_dropzone',
        whatYouSee: [
          'A large dashed drag-and-drop box labeled "Drop your sneaker .glb here".',
          'Once uploaded, an interactive 3D model-viewer canvas renders your sneaker on a clean studio stage.',
        ],
        whatToDo: [
          'Click inside the dashed upload box and pick your .glb sneaker file from your computer.',
          'Wait 1–2 seconds for the 3D preview to load.',
          'Click and drag with your mouse (or swipe on touchscreens) to rotate and inspect every angle of your shoe.',
        ],
        proTip:
          'If your model appears upside down or too small, ensure your 3D modeling tool (like Blender) exported with Y-up orientation and uniform 1.0 scale.',
      },
      {
        stepNumber: 3,
        title: 'Tag 3D Shoe Meshes (The Visual Mesh Tagger)',
        goal: 'Map your 3D shoe meshes to KickCraft’s 8 customizable color zones.',
        mockupType: 'mesh_tagger',
        whatYouSee: [
          'On the left: The interactive 3D shoe with an "Auto-Detect Meshes" button.',
          'On the right: The 8 KickCraft customizable zones: Upper, ToeCap, Tongue, Laces, HeelPanel, SideAccents, Midsole, and Outsole.',
        ],
        whatToDo: [
          'Click "Auto-Detect Meshes" first. KickCraft will automatically match meshes named "upper", "sole", "laces", etc.',
          'For any unassigned part, click on the shoe zone on the right (e.g. "Laces"), then click directly on the 3D mesh in the preview canvas.',
          'Assigned zones turn green with a checkmark badge.',
          'Click "Continue to Customizer" once your main zones are mapped.',
        ],
        proTip:
          'You don’t have to tag all 8 parts if your shoe design has fewer meshes. Tag at least 2 zones (like Upper and Midsole) so customers have fun customizing colors!',
      },
      {
        stepNumber: 4,
        title: 'Set Default Colors & Attach Signature 3D Charms',
        goal: 'Configure your signature colorway and accessory charm.',
        mockupType: 'customizer',
        whatYouSee: [
          'The 3D shoe viewer updates live as you click colors.',
          'A color palette strip featuring KickCraft street palettes (Terracotta, Obsidian, Bone White, Emerald, Cobalt).',
          'A signature charm selector: Star Charm, Lightning Charm, and K-Tag Charm.',
        ],
        whatToDo: [
          'Click a shoe zone (e.g. Upper) and pick your preferred default color.',
          'Select a signature charm from the charm options. The 3D charm snaps directly to the shoelace anchor.',
          'Click "Next: Details & Pricing" to proceed to final submission.',
        ],
        proTip:
          'Customers will be able to recolor these parts in the marketplace, but your default colors become the initial hero colorway shown on catalog cards.',
      },
      {
        stepNumber: 5,
        title: 'Enter Product Details, Pricing, Stock & Thumbnail',
        goal: 'Set your shoe listing details, pickup stock, and card thumbnail photo.',
        mockupType: 'details_form',
        whatYouSee: [
          'Product Name, Category (Sneakers, Basketball, Running, Fashion), and Description fields.',
          'Price in Philippine Pesos (₱) and available Counter Pickup Stock quantity.',
          'Size checkboxes (Sizes 36 through 46) and a custom Thumbnail Upload box.',
        ],
        whatToDo: [
          'Type an eye-catching name for your sneaker (e.g. "Cyber Runner 2026").',
          'Set your price in PHP (e.g. ₱4,999) and the number of physical pairs you have ready for pickup in stock.',
          'Check all sizes you can fulfill.',
          'Optional: Click "Upload Image" to upload a custom catalog card photo (PNG or JPG). If skipped, an auto-snapshot is used.',
        ],
        proTip:
          'KickCraft uses In-Store Pickup only. Make sure your stock reflects actual pairs available for customers to pick up at the counter.',
      },
      {
        stepNumber: 6,
        title: 'Submit for Store Owner Moderation',
        goal: 'Send your finished sneaker listing to the store owner for review.',
        mockupType: 'admin_review',
        whatYouSee: [
          'A review summary card showing your 3D silhouette, default colors, signature charm, and stock.',
          'A dark "Submit for Review" button.',
        ],
        whatToDo: [
          'Review your pricing, sizes, and 3D preview in the summary card.',
          'Click "Submit for Review". Your product status updates to "[ PENDING REVIEW ]".',
          'Once the store admin reviews your 3D model, your shoe is published directly to the public KickCraft Marketplace (#shop)!',
        ],
        proTip:
          'You can track review status right from your "My Products" dashboard tab. If the owner requests changes, admin notes will appear directly on your card.',
      },
    ],
  },
  {
    id: 'ai-generate',
    method: 'ai_generate',
    number: '02',
    badge: 'ZERO 3D SKILLS · 2D TO 3D AI',
    title: 'AI 2D→3D Sneaker Synthesizer',
    subtitle: 'Upload a 2D shoe photo, let AI generate a 3D model in Charm-Only Mode, and sell instantly.',
    readTime: '4 min read',
    difficulty: 'Easiest for Beginners',
    ctaText: 'Create with AI Generator',
    ctaAction: 'ai_generate',
    heroDescription:
      'Turn standard sneaker photos into interactive 3D marketplace products in minutes using KickCraft’s built-in AI 3D synthesizer.',
    steps: [
      {
        stepNumber: 1,
        title: 'Take a Clear Photo of Your Sneaker',
        goal: 'Prepare a high-contrast side-profile photo of your shoe.',
        mockupType: 'photo_tips',
        whatYouSee: [
          'Visual guides demonstrating a clean profile photograph: side-angle, neutral plain background, well-lit, no clutter.',
        ],
        whatToDo: [
          'Place your sneaker on a flat surface with a plain background (white wall, clean floor, or table).',
          'Position your camera directly at the side profile of the shoe.',
          'Take a crisp photo in JPG, PNG, or WebP format (max 10MB).',
        ],
        proTip:
          'Avoid photos with heavy shadows or busy backgrounds. The cleaner your background, the crisper the AI 3D model will turn out!',
      },
      {
        stepNumber: 2,
        title: 'Upload Photo Angles in AI Generator (Step 1)',
        goal: 'Upload your primary side view, plus optional front and back views.',
        mockupType: 'ai_upload_slots',
        whatYouSee: [
          'Three upload slots: "Primary Side View (Required)", "Front Angle (Optional)", and "Heel/Back (Optional)".',
          'Live image preview thumbnails appearing as you select photos.',
        ],
        whatToDo: [
          'Click "Select AI 2D→3D" in Step 0.',
          'Click "Upload Side View" and select your main photo.',
          'Optional: Upload front or heel photos to give the AI extra perspective.',
          'Click "Synthesize 3D Model".',
        ],
        proTip:
          'Even a single side-view photo produces great results! Extra angles help the AI capture tongue and heel contours more accurately.',
      },
      {
        stepNumber: 3,
        title: 'AI Reconstructs Your 3D Sneaker',
        goal: 'Watch the real-time AI generation status and inspect the output model.',
        mockupType: 'ai_progress',
        whatYouSee: [
          'An animated progress indicator: "Synthesizing 3D geometry with AI GPU...".',
          'Once completed (typically 15–45 seconds), your newly generated 3D shoe loads in the 3D viewer.',
        ],
        whatToDo: [
          'Keep the browser tab open while the AI processes your image.',
          'Once generated, drag to rotate your 3D shoe and inspect the 360° geometry.',
          'Click "Proceed to Customizer" to move forward.',
        ],
        proTip:
          'Free AI GPU quota is provided. If the GPU is temporarily busy, wait 2–3 minutes and try again.',
      },
      {
        stepNumber: 4,
        title: 'Understanding "Charm-Only Mode" for AI Shoes',
        goal: 'Learn why AI shoes use authentic photographic textures and 3D charms.',
        mockupType: 'charm_only_mode',
        whatYouSee: [
          'A notice: "[ CHARM-ONLY MODE ACTIVE ]".',
          'Original photographic colors and textures displayed authentically without whole-shoe darkening.',
          'Interactive 3D Charms (Star, Lightning, K-Tag) enabled for customer attachment.',
        ],
        whatToDo: [
          'Observe that individual mesh recoloring is disabled to preserve your photo’s realistic leather and stitching textures.',
          'Select a signature 3D accessory charm to pair with the shoe.',
          'Customers in the public marketplace will be able to rotate your 3D sneaker, choose charms, and reserve sizes.',
        ],
        proTip:
          'Why Charm-Only Mode? AI creates a single continuous mesh with photographed textures baked in. Keeping the authentic texture looks photorealistic and premium!',
      },
      {
        stepNumber: 5,
        title: 'Set Price, Sizing, Stock & Submit',
        goal: 'Add store details and submit your AI sneaker for review.',
        mockupType: 'details_form',
        whatYouSee: [
          'The Product Details form pre-filled with your AI thumbnail image.',
          'Size picker buttons and stock counter.',
        ],
        whatToDo: [
          'Give your AI sneaker an exciting name (e.g. "Retro Drift Low").',
          'Set your price in PHP and available pickup stock.',
          'Select available shoe sizes and click "Submit for Review".',
        ],
        proTip:
          'Your original uploaded photo automatically serves as the catalog card thumbnail, ensuring sharp presentation in the store.',
      },
    ],
  },
  {
    id: 'template-orders',
    method: 'template',
    number: '03',
    badge: 'FAST LAUNCH · FULFILLMENT GUIDE',
    title: 'Template Builder & Pickup Orders',
    subtitle: 'Build colorways from KickCraft verified templates and manage customer pickup reservations.',
    readTime: '6 min read',
    difficulty: 'Recommended for All Sellers',
    ctaText: 'View My Orders & Templates',
    ctaAction: 'template',
    heroDescription:
      'Launch products in under 2 minutes using pre-tagged KickCraft modular templates, and master the customer pickup order lifecycle.',
    steps: [
      {
        stepNumber: 1,
        title: 'Select a Verified KickCraft Template Silhouette',
        goal: 'Choose from pre-built, production-ready 3D shoe models.',
        mockupType: 'template_selector',
        whatYouSee: [
          'Three verified silhouettes:',
          '1. KickCraft Flagship Soleview (8 customizable zones, low-cut street sneaker).',
          '2. Air Max Edition (Athletic runner with visible air pocket cushion).',
          '3. Dunk Low Retro (Basketball heritage court silhouette with multi-panel blocking).',
        ],
        whatToDo: [
          'Click "+ Create New Product" and choose "Start from Template".',
          'Click on your preferred silhouette.',
          'Because templates are pre-tagged, mesh tagging is already completed for you!',
        ],
        proTip:
          'Templates are guaranteed lightweight (< 5MB) and load instantly on mobile devices, ensuring fast customer browsing in the public marketplace.',
      },
      {
        stepNumber: 2,
        title: 'Recolor Your Signature Colorway & Add Charms',
        goal: 'Create an eye-catching color combination in the 3D customizer.',
        mockupType: 'template_recolor',
        whatYouSee: [
          'The 3D template with all 8 zones pre-mapped and clickable.',
          'Real-time color swatch selector and interchangeable charms.',
        ],
        whatToDo: [
          'Click each shoe zone (Upper, Laces, Midsole, Outsole, etc.) and assign custom colors.',
          'Select an accessory charm.',
          'Click "Proceed to Details" and enter your price, name, and stock.',
          'Submit for review!',
        ],
        proTip:
          'Templates have verified matching catalog card illustrations, so your product cards look ultra-clean on https://kickcraft.kesug.com/#shop.',
      },
      {
        stepNumber: 3,
        title: 'How Customers Reserve in the Public Marketplace',
        goal: 'Understand the customer reservation experience at https://kickcraft.kesug.com/#shop.',
        mockupType: 'customer_checkout',
        whatYouSee: [
          'Customers view your sneaker card with your store name badge: [ BY YOUR STORE ].',
          'The customer opens the 3D Order Modal, customizes colors and charms, picks their shoe size, and enters guest pickup information.',
        ],
        whatToDo: [
          'No customer account is needed: guest checkout requires only name, email, pickup date, and size.',
          'Customers do NOT pay online. Payment happens at your store counter upon physical pickup.',
          'Submitting an order automatically decrements your product stock by 1.',
        ],
        proTip:
          'KickCraft strictly operates on In-Store Pickup. You never have to worry about packaging, couriers, or shipping fees.',
      },
      {
        stepNumber: 4,
        title: 'Managing Orders in "My Orders" Dashboard',
        goal: 'Track, confirm, and update customer pickup reservations.',
        mockupType: 'orders_management',
        whatYouSee: [
          'Your "My Orders" dashboard tab displaying all customer reservations.',
          'Order ID (e.g. KCO-2026-8812), customer name, email, shoe size, requested pickup date, and current status.',
          'Action buttons: "Confirm", "Mark Ready", "Complete", and "Cancel".',
        ],
        whatToDo: [
          'When a new order arrives, status starts as "[ PENDING ]".',
          'Step A: Click "Confirm" when you review the design and begin shoe preparation.',
          'Step B: Click "Mark Ready" when the shoe is ready at your counter.',
          'Step C: When the customer arrives, receives the shoe, and pays, click "Complete"!',
        ],
        proTip:
          'If a customer cancels or does not arrive, click "Cancel Order". KickCraft automatically restores the stock (+1) back to your product inventory!',
      },
    ],
  },
]

const currentGuide = computed(() => {
  return TUTORIAL_TRACKS.find((t) => t.id === selectedGuideId.value) || null
})

function openGuide(guideId) {
  selectedGuideId.value = guideId
}

function backToHub() {
  selectedGuideId.value = ''
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
  <div class="space-y-8">
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
            Detailed, jargon-free visual guides designed for anyone to launch 3D footwear on KickCraft. Learn the three creation methods and how to fulfill customer store pickup orders.
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

      <!-- Quick Metrics Strip -->
      <div class="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3 font-mono text-xs">
        <div class="border border-stone-200 bg-[#f7f8f6] p-3">
          <span class="text-stone-500 uppercase text-[10px] block">Track 01</span>
          <span class="font-bold text-[#202220]">3D GLB Upload &amp; Mesh Tagging</span>
        </div>
        <div class="border border-stone-200 bg-[#f7f8f6] p-3">
          <span class="text-stone-500 uppercase text-[10px] block">Track 02</span>
          <span class="font-bold text-[#202220]">AI 2D&rarr;3D Image Synthesis</span>
        </div>
        <div class="border border-stone-200 bg-[#f7f8f6] p-3">
          <span class="text-stone-500 uppercase text-[10px] block">Track 03</span>
          <span class="font-bold text-[#202220]">Templates &amp; Pickup Order Management</span>
        </div>
      </div>
    </div>

    <!-- ── HUB VIEW: 3 Tutorial Cards Grid (When no guide is open) ── -->
    <div v-if="!currentGuide" class="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div
        v-for="track in TUTORIAL_TRACKS"
        :key="track.id"
        class="flex flex-col justify-between border-2 border-stone-900 bg-white p-6 shadow-[4px_4px_0px_#202220] transition-all hover:-translate-y-1 hover:shadow-[6px_6px_0px_#202220]"
      >
        <div>
          <!-- Card Header Badges -->
          <div class="flex items-center justify-between border-b border-stone-200 pb-3">
            <span class="border border-stone-900 bg-stone-100 px-2 py-0.5 font-mono text-[10px] font-black uppercase text-stone-700">
              GUIDE {{ track.number }}
            </span>
            <div class="flex items-center gap-2 font-mono text-[10px] text-stone-500 font-bold">
              <span>{{ track.readTime }}</span>
              <span>&bull;</span>
              <span class="text-[#b94d27]">{{ track.difficulty }}</span>
            </div>
          </div>

          <!-- Title & Subtitle -->
          <h3 class="mt-4 font-display text-xl font-black uppercase tracking-tight text-[#202220]">
            {{ track.title }}
          </h3>
          <p class="mt-2 text-xs leading-relaxed text-[#5f635f]">
            {{ track.subtitle }}
          </p>

          <!-- Visual Snapshot Card Representation -->
          <div class="mt-5 border border-stone-300 bg-stone-50 p-4 font-mono text-xs">
            <div class="flex items-center justify-between text-[11px] font-bold text-stone-700 border-b border-stone-200 pb-2">
              <span class="uppercase">What You'll Learn:</span>
              <span class="text-[#b94d27]">{{ track.steps.length }} Steps</span>
            </div>
            <ul class="mt-2.5 space-y-1.5 text-[11px] text-[#202220]">
              <li v-for="step in track.steps.slice(0, 3)" :key="step.stepNumber" class="flex items-start gap-1.5">
                <span class="font-bold text-[#b94d27]">&bull;</span>
                <span class="line-clamp-1">{{ step.title }}</span>
              </li>
              <li v-if="track.steps.length > 3" class="text-stone-400 text-[10px] pt-1">
                + {{ track.steps.length - 3 }} more detailed step breakdowns
              </li>
            </ul>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="mt-6 flex flex-col gap-2 pt-2 border-t border-stone-200">
          <button
            type="button"
            class="w-full border-2 border-stone-900 bg-[#292b2d] py-3 text-center font-mono text-xs font-black uppercase tracking-wider text-white shadow-[2px_2px_0px_#202220] transition-colors hover:bg-[#b94d27]"
            @click="openGuide(track.id)"
          >
            Read Visual Guide &rarr;
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

    <!-- ── GUIDE READER VIEW (Deep Dive into Selected Tutorial) ── -->
    <div v-else class="space-y-8">
      <!-- Guide Title Bar -->
      <div class="border-2 border-stone-900 bg-[#f7f8f6] p-6 shadow-[4px_4px_0px_#202220]">
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
            <h2 class="mt-2 font-display text-2xl font-black uppercase text-[#202220] md:text-3xl">
              {{ currentGuide.title }}
            </h2>
            <p class="mt-1 text-xs text-[#5f635f] max-w-xl">
              {{ currentGuide.heroDescription }}
            </p>
          </div>

          <div class="flex items-center gap-3 shrink-0">
            <button
              type="button"
              class="border-2 border-stone-900 bg-[#b94d27] px-4 py-2.5 font-mono text-xs font-bold uppercase tracking-wider text-white shadow-[3px_3px_0px_#202220] transition-all hover:-translate-y-0.5 hover:bg-[#202220]"
              @click="handleCtaClick(currentGuide.ctaAction)"
            >
              {{ currentGuide.ctaText }} &rarr;
            </button>
          </div>
        </div>

        <!-- Quick Jump Track Steps -->
        <div class="mt-4 flex flex-wrap items-center gap-2 font-mono text-[11px]">
          <span class="text-stone-500 font-bold uppercase">Steps in this track:</span>
          <span
            v-for="s in currentGuide.steps"
            :key="s.stepNumber"
            class="border border-stone-300 bg-white px-2 py-0.5 text-stone-700 font-bold"
          >
            {{ s.stepNumber }}. {{ s.title.split(' ')[0] }}
          </span>
        </div>
      </div>

      <!-- Step-by-Step Breakdown Cards -->
      <div class="space-y-8">
        <div
          v-for="step in currentGuide.steps"
          :key="step.stepNumber"
          class="border-2 border-stone-900 bg-white p-6 md:p-8 shadow-[4px_4px_0px_#202220]"
        >
          <!-- Step Header -->
          <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b-2 border-stone-900 pb-4">
            <div class="flex items-center gap-3">
              <span class="flex size-9 items-center justify-center border-2 border-stone-900 bg-[#292b2d] font-mono text-sm font-black text-white shadow-[2px_2px_0px_#b94d27]">
                0{{ step.stepNumber }}
              </span>
              <h3 class="font-display text-lg font-black uppercase tracking-tight text-[#202220] md:text-xl">
                {{ step.title }}
              </h3>
            </div>
            <span class="inline-block border border-stone-300 bg-stone-100 px-2 py-0.5 font-mono text-[10px] font-bold text-stone-600 uppercase">
              Step Goal: {{ step.goal }}
            </span>
          </div>

          <!-- Visual UI Mockup (Replicating Site Screen) -->
          <div class="mt-6 border-2 border-stone-900 bg-stone-100 p-4 shadow-[3px_3px_0px_#202220]">
            <div class="flex items-center justify-between border-b border-stone-300 pb-2 font-mono text-[10px] text-stone-500 uppercase">
              <span>Site Screenshot &middot; UI Visualization</span>
              <span>KickCraft Studio Screen</span>
            </div>

            <!-- Dynamic UI Mockup Renderers based on step.mockupType -->
            <div class="mt-3 overflow-hidden rounded border border-stone-300 bg-white p-4">
              <!-- Mockup 1: Creation Methods -->
              <div v-if="step.mockupType === 'creation_methods'" class="grid grid-cols-1 gap-3 sm:grid-cols-3 font-mono text-xs">
                <div class="border-2 border-[#b94d27] bg-[#fdf2ef] p-3 text-center shadow-[2px_2px_0px_#b94d27]">
                  <span class="block font-black uppercase text-[#b94d27]">[ SELECTED ]</span>
                  <span class="mt-1 block font-bold text-stone-900">1. Upload GLB</span>
                  <span class="mt-1 block text-[10px] text-stone-600">Max 20MB &middot; .glb</span>
                </div>
                <div class="border border-stone-300 bg-stone-50 p-3 text-center">
                  <span class="block font-bold text-stone-700">2. AI 2D&rarr;3D</span>
                  <span class="mt-1 block text-[10px] text-stone-500">From Photo</span>
                </div>
                <div class="border border-stone-300 bg-stone-50 p-3 text-center">
                  <span class="block font-bold text-stone-700">3. Template</span>
                  <span class="mt-1 block text-[10px] text-stone-500">Flagship / Air Max</span>
                </div>
              </div>

              <!-- Mockup 2: File Dropzone -->
              <div v-else-if="step.mockupType === 'file_dropzone'" class="flex flex-col items-center justify-center border-2 border-dashed border-stone-900 bg-[#f7f8f6] py-8 font-mono text-xs">
                <div class="flex size-12 items-center justify-center border border-stone-900 bg-white shadow-[2px_2px_0px_#202220]">
                  <span class="font-bold text-lg text-[#b94d27]">&uarr;</span>
                </div>
                <span class="mt-3 font-bold uppercase text-stone-800">Drop your sneaker .glb here</span>
                <span class="text-[10px] text-stone-500">or click to browse from your computer</span>
                <span class="mt-2 border border-stone-300 bg-white px-2 py-0.5 text-[9px] text-stone-600 uppercase">Supports binary GLB up to 20MB</span>
              </div>

              <!-- Mockup 3: Visual Mesh Tagger -->
              <div v-else-if="step.mockupType === 'mesh_tagger'" class="grid grid-cols-1 gap-4 sm:grid-cols-2 font-mono text-xs">
                <div class="flex items-center justify-center border border-stone-300 bg-stone-100 p-6 text-center">
                  <div>
                    <span class="block text-2xl">&#128095;</span>
                    <span class="mt-2 block font-bold uppercase text-stone-800">3D Interactive Shoe Stage</span>
                    <span class="text-[10px] text-stone-500">Drag mouse to rotate 360&deg;</span>
                    <button type="button" class="mt-3 border border-stone-900 bg-stone-900 px-3 py-1 text-[10px] font-bold text-white uppercase">
                      Auto-Detect Meshes
                    </button>
                  </div>
                </div>
                <div class="space-y-1.5 border border-stone-200 bg-white p-3 text-[11px]">
                  <div class="font-bold uppercase text-stone-500 border-b pb-1 text-[10px]">8 Customizable Zones:</div>
                  <div class="flex items-center justify-between bg-emerald-50 border border-emerald-300 px-2 py-1 text-emerald-800 font-bold">
                    <span>Upper Main</span>
                    <span>&check; Assigned</span>
                  </div>
                  <div class="flex items-center justify-between bg-emerald-50 border border-emerald-300 px-2 py-1 text-emerald-800 font-bold">
                    <span>Midsole Cushion</span>
                    <span>&check; Assigned</span>
                  </div>
                  <div class="flex items-center justify-between bg-stone-100 border border-stone-300 px-2 py-1 text-stone-700">
                    <span>Laces</span>
                    <span class="text-stone-400">Click mesh to map</span>
                  </div>
                  <div class="flex items-center justify-between bg-stone-100 border border-stone-300 px-2 py-1 text-stone-700">
                    <span>Outsole Tread</span>
                    <span class="text-stone-400">Click mesh to map</span>
                  </div>
                </div>
              </div>

              <!-- Mockup 4: Color Customizer & Charms -->
              <div v-else-if="step.mockupType === 'customizer'" class="grid grid-cols-1 gap-4 sm:grid-cols-2 font-mono text-xs">
                <div class="border border-stone-200 bg-stone-50 p-4">
                  <span class="font-bold uppercase text-stone-700 text-[10px] block">Part Color Palette:</span>
                  <div class="mt-2 flex flex-wrap gap-2">
                    <span class="size-6 border-2 border-stone-900 bg-[#b94d27]"></span>
                    <span class="size-6 border border-stone-400 bg-[#292b2d]"></span>
                    <span class="size-6 border border-stone-400 bg-[#f7f8f6]"></span>
                    <span class="size-6 border border-stone-400 bg-[#3f7652]"></span>
                    <span class="size-6 border border-stone-400 bg-[#1d4ed8]"></span>
                  </div>
                  <span class="mt-3 block text-[10px] text-stone-500">Selected: Terracotta (#b94d27)</span>
                </div>
                <div class="border border-stone-200 bg-stone-50 p-4">
                  <span class="font-bold uppercase text-stone-700 text-[10px] block">3D Charm Accessories:</span>
                  <div class="mt-2 space-y-1.5 text-[11px]">
                    <div class="border border-stone-900 bg-stone-900 px-2 py-1 text-white font-bold">&starf; Star Charm [ Active ]</div>
                    <div class="border border-stone-300 bg-white px-2 py-1 text-stone-700">&uArr; Lightning Charm</div>
                    <div class="border border-stone-300 bg-white px-2 py-1 text-stone-700">&#10065; KickCraft K-Tag</div>
                  </div>
                </div>
              </div>

              <!-- Mockup 5: Details & Form -->
              <div v-else-if="step.mockupType === 'details_form'" class="space-y-3 font-mono text-xs">
                <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div class="border border-stone-300 bg-white p-2.5">
                    <span class="text-[10px] text-stone-500 block uppercase">Product Name</span>
                    <span class="font-bold text-stone-900">Cyber Runner 2026</span>
                  </div>
                  <div class="border border-stone-300 bg-white p-2.5">
                    <span class="text-[10px] text-stone-500 block uppercase">Price &amp; Stock</span>
                    <span class="font-bold text-[#b94d27]">&#8369;4,999 &middot; 10 Pairs</span>
                  </div>
                </div>
                <div class="border border-stone-300 bg-stone-50 p-2.5">
                  <span class="text-[10px] text-stone-500 block uppercase">Sizes Available for Pickup:</span>
                  <div class="mt-1 flex flex-wrap gap-1.5 font-bold text-[10px]">
                    <span class="border border-stone-900 bg-stone-900 px-2 py-0.5 text-white">40</span>
                    <span class="border border-stone-900 bg-stone-900 px-2 py-0.5 text-white">41</span>
                    <span class="border border-stone-900 bg-stone-900 px-2 py-0.5 text-white">42</span>
                    <span class="border border-stone-900 bg-stone-900 px-2 py-0.5 text-white">43</span>
                    <span class="border border-stone-900 bg-stone-900 px-2 py-0.5 text-white">44</span>
                  </div>
                </div>
              </div>

              <!-- Mockup 6: Admin Review -->
              <div v-else-if="step.mockupType === 'admin_review'" class="border border-amber-300 bg-amber-50 p-4 font-mono text-xs">
                <div class="flex items-center justify-between border-b border-amber-200 pb-2">
                  <span class="font-bold text-amber-900">[ PENDING REVIEW ]</span>
                  <span class="text-[10px] text-amber-700">Awaiting Store Owner</span>
                </div>
                <p class="mt-2 text-[11px] text-amber-800 leading-relaxed">
                  Your shoe is submitted! The store admin reviews the 3D model for quality. Once approved, it appears live in the public KickCraft Marketplace (#shop).
                </p>
              </div>

              <!-- Mockup 7: Photo Tips -->
              <div v-else-if="step.mockupType === 'photo_tips'" class="grid grid-cols-1 gap-3 sm:grid-cols-2 font-mono text-xs">
                <div class="border border-emerald-400 bg-emerald-50 p-3 text-emerald-900">
                  <span class="font-bold block">&check; DO:</span>
                  <span class="text-[11px] block mt-1">Direct side profile photo, flat plain background, bright natural lighting, entire shoe in frame.</span>
                </div>
                <div class="border border-rose-400 bg-rose-50 p-3 text-rose-900">
                  <span class="font-bold block">&cross; DON'T:</span>
                  <span class="text-[11px] block mt-1">Blurry, top-down angle, busy carpet/clutter, dark shadows, hands holding the shoe.</span>
                </div>
              </div>

              <!-- Mockup 8: AI Upload Slots -->
              <div v-else-if="step.mockupType === 'ai_upload_slots'" class="grid grid-cols-1 gap-3 sm:grid-cols-3 font-mono text-xs">
                <div class="border-2 border-stone-900 bg-white p-3 text-center">
                  <span class="text-[10px] text-[#b94d27] font-bold block">1. SIDE VIEW (REQUIRED)</span>
                  <span class="mt-2 block font-bold text-stone-800">[ Photo Attached &check; ]</span>
                </div>
                <div class="border border-stone-300 bg-stone-50 p-3 text-center">
                  <span class="text-[10px] text-stone-500 font-bold block">2. FRONT ANGLE (OPTIONAL)</span>
                  <span class="mt-2 block text-stone-400">+ Add front</span>
                </div>
                <div class="border border-stone-300 bg-stone-50 p-3 text-center">
                  <span class="text-[10px] text-stone-500 font-bold block">3. HEEL/BACK (OPTIONAL)</span>
                  <span class="mt-2 block text-stone-400">+ Add heel</span>
                </div>
              </div>

              <!-- Mockup 9: AI Progress -->
              <div v-else-if="step.mockupType === 'ai_progress'" class="border border-stone-900 bg-[#292b2d] p-6 text-center text-white font-mono text-xs">
                <div class="inline-block animate-pulse text-[#b94d27] font-bold text-sm">
                  &#9679; Synthesizing 3D Geometry with AI GPU...
                </div>
                <span class="mt-2 block text-[10px] text-stone-400">Reconstructing mesh surfaces from photographed angles</span>
              </div>

              <!-- Mockup 10: Charm-Only Mode -->
              <div v-else-if="step.mockupType === 'charm_only_mode'" class="border border-blue-300 bg-blue-50 p-4 font-mono text-xs text-blue-950">
                <div class="font-bold uppercase text-blue-900">[ CHARM-ONLY MODE ACTIVE ]</div>
                <p class="mt-1 text-[11px] leading-relaxed">
                  Genuine photograph textures preserved! Single continuous AI mesh displays authentic photographed colors. Multi-part recoloring is disabled; 3D charms, size selection, and counter pickup reservations are 100% enabled.
                </p>
              </div>

              <!-- Mockup 11: Template Selector -->
              <div v-else-if="step.mockupType === 'template_selector'" class="grid grid-cols-1 gap-3 sm:grid-cols-3 font-mono text-xs">
                <div class="border-2 border-stone-900 bg-white p-3 text-center shadow-[2px_2px_0px_#202220]">
                  <span class="font-bold text-stone-900 block">Flagship Soleview</span>
                  <span class="text-[10px] text-stone-500">8 Customizable Parts</span>
                </div>
                <div class="border-2 border-stone-900 bg-white p-3 text-center shadow-[2px_2px_0px_#202220]">
                  <span class="font-bold text-stone-900 block">Air Max Edition</span>
                  <span class="text-[10px] text-stone-500">Athletic Runner</span>
                </div>
                <div class="border-2 border-stone-900 bg-white p-3 text-center shadow-[2px_2px_0px_#202220]">
                  <span class="font-bold text-stone-900 block">Dunk Low Retro</span>
                  <span class="text-[10px] text-stone-500">Court Heritage</span>
                </div>
              </div>

              <!-- Mockup 12: Template Recolor -->
              <div v-else-if="step.mockupType === 'template_recolor'" class="border border-stone-200 bg-stone-50 p-4 font-mono text-xs">
                <div class="flex items-center justify-between border-b pb-2">
                  <span class="font-bold uppercase">Pre-Mapped 3D Silhouette</span>
                  <span class="text-emerald-700 font-bold">&check; All 8 Parts Ready</span>
                </div>
                <span class="mt-2 block text-[11px] text-stone-600">
                  Click any part &rarr; Pick color &rarr; Real-time 3D model recoloring instantly.
                </span>
              </div>

              <!-- Mockup 13: Customer Checkout -->
              <div v-else-if="step.mockupType === 'customer_checkout'" class="border border-stone-900 bg-white p-4 font-mono text-xs shadow-[2px_2px_0px_#202220]">
                <div class="flex items-center justify-between border-b pb-2">
                  <span class="font-bold text-stone-900">Guest Pickup Reservation</span>
                  <span class="border border-stone-900 bg-stone-100 px-2 py-0.5 text-[10px] font-bold">NO ONLINE PAYMENT</span>
                </div>
                <p class="mt-2 text-[11px] text-stone-600">
                  Buyer: Juan Dela Cruz &middot; Size 42 &middot; Pickup Date: Oct 18, 2026 &middot; Pay at counter upon arrival.
                </p>
              </div>

              <!-- Mockup 14: Orders Management -->
              <div v-else-if="step.mockupType === 'orders_management'" class="border border-stone-300 bg-white p-4 font-mono text-xs">
                <div class="flex items-center justify-between border-b pb-2 font-bold">
                  <span>Order #KCO-2026-8812</span>
                  <span class="border border-amber-500 bg-amber-50 text-amber-800 px-2 py-0.5 text-[10px]">[ PENDING ]</span>
                </div>
                <div class="mt-3 flex flex-wrap gap-2 pt-1 text-[10px]">
                  <span class="border border-stone-900 bg-[#292b2d] text-white px-2.5 py-1 font-bold">Confirm Order</span>
                  <span class="border border-stone-400 bg-white text-stone-700 px-2.5 py-1 font-bold">Mark Ready</span>
                  <span class="border border-stone-400 bg-white text-stone-700 px-2.5 py-1 font-bold">Complete</span>
                  <span class="border border-rose-300 text-rose-700 px-2.5 py-1 font-bold">Cancel</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Plain-English Breakdown ("Average Joe" Layout) -->
          <div class="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
            <!-- Left: What You See -->
            <div class="border-2 border-stone-900 bg-stone-50 p-5 shadow-[2px_2px_0px_#202220]">
              <div class="flex items-center gap-2 border-b border-stone-300 pb-2">
                <span class="text-sm">&#128065;</span>
                <h4 class="font-mono text-xs font-black uppercase tracking-wider text-stone-900">
                  What You See on Screen
                </h4>
              </div>
              <ul class="mt-3 space-y-2 text-xs text-[#202220]">
                <li v-for="(item, i) in step.whatYouSee" :key="i" class="flex items-start gap-2">
                  <span class="font-bold text-[#b94d27] mt-0.5">&bull;</span>
                  <span class="leading-relaxed">{{ item }}</span>
                </li>
              </ul>
            </div>

            <!-- Right: What You Need to Do -->
            <div class="border-2 border-stone-900 bg-white p-5 shadow-[2px_2px_0px_#202220]">
              <div class="flex items-center gap-2 border-b border-stone-300 pb-2">
                <span class="text-sm">&#9997;</span>
                <h4 class="font-mono text-xs font-black uppercase tracking-wider text-stone-900">
                  What You Need to Do (Action Steps)
                </h4>
              </div>
              <ol class="mt-3 space-y-2 text-xs text-[#202220]">
                <li v-for="(item, i) in step.whatToDo" :key="i" class="flex items-start gap-2">
                  <span class="font-mono font-bold text-xs text-stone-500">{{ i + 1 }}.</span>
                  <span class="leading-relaxed">{{ item }}</span>
                </li>
              </ol>
            </div>
          </div>

          <!-- Pro-Tip / Warning Box -->
          <div class="mt-5 border-2 border-stone-900 bg-amber-50 p-4 font-mono text-xs shadow-[2px_2px_0px_#202220]">
            <div class="flex items-center gap-2 text-amber-900 font-bold uppercase text-[11px]">
              <span>&#9888; Pro-Tip &amp; Important Rule:</span>
            </div>
            <p class="mt-1 text-amber-900 text-xs leading-relaxed">
              {{ step.proTip }}
            </p>
          </div>
        </div>
      </div>

      <!-- Guide Bottom Navigation & Actions -->
      <div class="flex flex-col sm:flex-row items-center justify-between gap-4 border-2 border-stone-900 bg-white p-6 shadow-[4px_4px_0px_#202220]">
        <button
          type="button"
          class="border-2 border-stone-900 bg-white px-5 py-3 font-mono text-xs font-bold uppercase text-[#202220] shadow-[2px_2px_0px_#202220] transition-colors hover:bg-stone-100"
          @click="backToHub"
        >
          &larr; Back to Academy Hub
        </button>

        <button
          type="button"
          class="border-2 border-stone-900 bg-[#292b2d] px-6 py-3 font-mono text-xs font-black uppercase tracking-wider text-white shadow-[3px_3px_0px_#b94d27] transition-all hover:-translate-y-0.5 hover:bg-[#b94d27]"
          @click="handleCtaClick(currentGuide.ctaAction)"
        >
          {{ currentGuide.ctaText }} &rarr;
        </button>
      </div>
    </div>
  </div>
</template>
