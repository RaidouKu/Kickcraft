import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const COMPONENT_PATH = path.resolve('src/components/SellerTutorialHub.vue')

test('SellerTutorialHub component exists and defines props and emits', () => {
  assert.ok(fs.existsSync(COMPONENT_PATH), 'src/components/SellerTutorialHub.vue must exist')
  const content = fs.readFileSync(COMPONENT_PATH, 'utf8')

  assert.match(content, /<script setup>/, 'Must use Vue 3 <script setup>')
  assert.match(content, /defineProps/, 'Must define props')
  assert.match(content, /defineEmits/, 'Must define emits')

  // Check emits: close, select-method, go-to-tab, start-walkthrough
  assert.match(content, /['"]close['"]/, 'Must emit close')
  assert.match(content, /['"]select-method['"]/, 'Must emit select-method')
  assert.match(content, /['"]go-to-tab['"]/, 'Must emit go-to-tab')
  assert.match(content, /['"]start-walkthrough['"]/, 'Must emit start-walkthrough')
})

test('SellerTutorialHub defines all three distinct tutorial tracks with required metadata', () => {
  assert.ok(fs.existsSync(COMPONENT_PATH), 'src/components/SellerTutorialHub.vue must exist')
  const content = fs.readFileSync(COMPONENT_PATH, 'utf8')

  // 1. GLB Upload track
  assert.match(content, /glb-upload|upload_glb/i, 'Must define GLB Upload tutorial track')
  assert.match(content, /Mesh Tag/i, 'Must cover 3D Mesh Tagging in GLB Upload guide')

  // 2. AI 2D→3D track
  assert.match(content, /ai-generate|ai_generate/i, 'Must define AI 2D→3D tutorial track')
  assert.match(content, /Charm-Only|single-mesh/i, 'Must explain Charm-Only mode in AI guide')

  // 3. Template & Order Fulfillment track
  assert.match(content, /template-orders|templates_orders/i, 'Must define Template & Orders tutorial track')
  assert.match(content, /pickup|order/i, 'Must cover customer pickup orders')
})

test('SellerTutorialHub contains beginner-friendly step guides with visual UI mockups', () => {
  assert.ok(fs.existsSync(COMPONENT_PATH), 'src/components/SellerTutorialHub.vue must exist')
  const content = fs.readFileSync(COMPONENT_PATH, 'utf8')

  // Beginner-friendly guidance keywords
  assert.match(content, /What You See/i, 'Must include visual explanation for beginners')
  assert.match(content, /What To Do|Action/i, 'Must include clear action steps for beginners')
  assert.match(content, /Pro-Tip|Tip|Important/i, 'Must include helpful tips/rules')

  // UI mockups / visualizations
  assert.match(content, /mockup|preview|canvas|dropzone/i, 'Must provide visual mockups representing site UI')

  // Interactive CTAs
  assert.match(content, /Upload GLB|Create with GLB/i, 'Must have CTA for GLB creation')
  assert.match(content, /AI|Synthesize/i, 'Must have CTA for AI creation')
  assert.match(content, /Template|Orders/i, 'Must have CTA for Templates or Orders')
})

test('SellerTutorialHub strictly avoids physical SQL DELETE FROM statements', () => {
  assert.ok(fs.existsSync(COMPONENT_PATH), 'src/components/SellerTutorialHub.vue must exist')
  const content = fs.readFileSync(COMPONENT_PATH, 'utf8')

  assert.doesNotMatch(content, /DELETE\s+FROM/i, 'Must not contain physical SQL DELETE FROM statements')
})

test('SellerTutorialHub provides interactive step slider with visual callout badges', () => {
  assert.ok(fs.existsSync(COMPONENT_PATH), 'src/components/SellerTutorialHub.vue must exist')
  const content = fs.readFileSync(COMPONENT_PATH, 'utf8')

  assert.match(content, /currentStepIndex|activeStepIndex/, 'Must maintain active step index state')
  assert.match(content, /nextStep|prevStep|goToStep/, 'Must provide step navigation methods')
  assert.match(content, /Next Step|Previous Step/i, 'Must have Previous/Next step navigation buttons')
  assert.match(content, /[①②③]|badge-pin|callout-badge|pointer-badge/, 'Must include visual callout pointer badges')
})

