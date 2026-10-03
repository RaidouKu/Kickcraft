import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const COMPONENT_PATH = path.resolve('src/components/TutorialOverlay.vue')

test('TutorialOverlay component file exists and defines props and emits', () => {
  assert.ok(fs.existsSync(COMPONENT_PATH), 'TutorialOverlay.vue must exist')
  const content = fs.readFileSync(COMPONENT_PATH, 'utf8')

  // Vue 3 script setup
  assert.match(content, /<script setup>/, 'Must use Vue 3 <script setup>')

  // Props contract
  assert.match(content, /defineProps/, 'Must define props')
  assert.match(content, /active\s*:/, 'Must declare active prop')
  assert.match(content, /forceStep\s*:/, 'Must declare forceStep prop')
  assert.match(content, /currentUser\s*:/, 'Must declare currentUser prop')

  // Emits contract
  assert.match(content, /defineEmits/, 'Must define emits')
  assert.match(content, /['"]step-changed['"]/, 'Must emit step-changed')
  assert.match(content, /['"]tutorial-completed['"]/, 'Must emit tutorial-completed')
  assert.match(content, /['"]tutorial-skipped['"]/, 'Must emit tutorial-skipped')
  assert.match(content, /['"]close['"]/, 'Must emit close')
})

test('TutorialOverlay defines all 8 tutorial steps in sequence', () => {
  assert.ok(fs.existsSync(COMPONENT_PATH), 'TutorialOverlay.vue must exist')
  const content = fs.readFileSync(COMPONENT_PATH, 'utf8')

  const expectedSteps = [
    'welcome',
    'create_product',
    'choose_method',
    'tag_meshes',
    'customize_colors',
    'set_details',
    'submit_product',
    'manage_orders'
  ]

  for (const stepId of expectedSteps) {
    const stepRegex = new RegExp(`id:\\s*['"]${stepId}['"]|['"]${stepId}['"]`)
    assert.match(content, stepRegex, `Must define tutorial step: ${stepId}`)
  }

  // Check titles and guidance text
  assert.match(content, /Welcome to Seller Studio|Welcome to KickCraft/i, 'Step 1 title')
  assert.match(content, /Create New Product/i, 'Step 2 title')
  assert.match(content, /Select Creation Method|Choose Creation Method/i, 'Step 3 title')
  assert.match(content, /Tag (?:3D )?Shoe Meshes/i, 'Step 4 title')
  assert.match(content, /Default Colors & Charms|Colors & Charms/i, 'Step 5 title')
  assert.match(content, /Product Details & Pricing|Details & Pricing/i, 'Step 6 title')
  assert.match(content, /Submit for (?:Store )?Approval/i, 'Step 7 title')
  assert.match(content, /Fulfill Pickup Orders|Manage Orders/i, 'Step 8 title')
})

test('TutorialOverlay implements step navigation: nextStep, prevStep, and skipAll', () => {
  assert.ok(fs.existsSync(COMPONENT_PATH), 'TutorialOverlay.vue must exist')
  const content = fs.readFileSync(COMPONENT_PATH, 'utf8')

  // Methods
  assert.match(content, /function\s+nextStep|const\s+nextStep\s*=/, 'Must implement nextStep')
  assert.match(content, /function\s+prevStep|const\s+prevStep\s*=/, 'Must implement prevStep')
  assert.match(content, /function\s+skipAll|const\s+skipAll\s*=|function\s+skipTutorial|const\s+skipTutorial\s*=/, 'Must implement skipAll/skipTutorial')

  // Step advancement & completion check
  assert.match(content, /currentStepIndex|currentStep|stepIndex/, 'Must track active step index')
  assert.match(content, /completedSteps/, 'Must track completed steps array')
})

test('TutorialOverlay integrates with tutorial API endpoints', () => {
  assert.ok(fs.existsSync(COMPONENT_PATH), 'TutorialOverlay.vue must exist')
  const content = fs.readFileSync(COMPONENT_PATH, 'utf8')

  // Import api
  assert.match(content, /import\s+.*api.*from\s+['"].*api(?:\.js)?['"]/, 'Must import api client')

  // Load progress on mount
  assert.match(content, /api\(\s*['"]tutorial\/progress\.php['"]\)/, 'Must call tutorial/progress.php')

  // Update progress on advance/skip
  assert.match(content, /api\(\s*['"]tutorial\/update\.php['"]/, 'Must call tutorial/update.php')
  assert.match(content, /currentStep/, 'Must pass currentStep to update endpoint')
  assert.match(content, /completedSteps/, 'Must pass completedSteps to update endpoint')
})

test('TutorialOverlay tracks DOM targets with [data-tutorial] selector and computes spotlight', () => {
  assert.ok(fs.existsSync(COMPONENT_PATH), 'TutorialOverlay.vue must exist')
  const content = fs.readFileSync(COMPONENT_PATH, 'utf8')

  // Query selector
  assert.match(content, /data-tutorial/, 'Must query elements using data-tutorial')
  assert.match(content, /getBoundingClientRect/, 'Must calculate spotlight geometry with getBoundingClientRect')

  // Responsive event listeners
  assert.match(content, /addEventListener\(\s*['"]resize['"]|window\.addEventListener/, 'Must handle window resize')
  assert.match(content, /removeEventListener/, 'Must clean up event listeners on unmount')

  // Spotlight element styling
  assert.match(content, /border-4\s+border-\[#b94d27\]/, 'Spotlight must use border-4 border-[#b94d27]')
  assert.match(content, /pointer-events-none/, 'Spotlight must have pointer-events-none')
})

test('TutorialOverlay adheres to KickCraft brutalist design tokens', () => {
  assert.ok(fs.existsSync(COMPONENT_PATH), 'TutorialOverlay.vue must exist')
  const content = fs.readFileSync(COMPONENT_PATH, 'utf8')

  // Brutalist styling tokens
  assert.match(content, /border-stone-900|border-2 border-stone-900/, 'Must use border-stone-900')
  assert.match(content, /shadow-\[6px_6px_0px_#202220\]/, 'Must use shadow-[6px_6px_0px_#202220]')
  assert.match(content, /#b94d27/, 'Must use KickCraft terracotta accent color #b94d27')
  assert.match(content, /bg-\[#fcfdfb\]/, 'Card background must use #fcfdfb')
  assert.match(content, /font-mono/, 'Must use font-mono for badges and buttons')

  // Step counter badge
  assert.match(content, /STEP\s+\d+|STEP\s*\{\{/i, 'Must render step indicator badge')

  // Button styles
  assert.match(content, /hover:bg-\[#b94d27\]/, 'Button hover state must use terracotta accent')
})
