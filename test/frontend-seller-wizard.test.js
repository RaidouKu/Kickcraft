import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const DASHBOARD_PATH = path.resolve('src/components/SellerDashboard.vue')

test('SellerDashboard exists and imports MeshTagger, ProductCustomizer, and TutorialOverlay', () => {
  assert.ok(fs.existsSync(DASHBOARD_PATH), 'SellerDashboard.vue must exist')
  const content = fs.readFileSync(DASHBOARD_PATH, 'utf8')

  assert.match(content, /import\s+MeshTagger\s+from\s+['"]\.\/MeshTagger\.vue['"]/, 'Must import MeshTagger')
  assert.match(content, /import\s+ProductCustomizer\s+from\s+['"]\.\/ProductCustomizer\.vue['"]/, 'Must import ProductCustomizer')
  assert.match(content, /import\s+TutorialOverlay\s+from\s+['"]\.\/TutorialOverlay\.vue['"]/, 'Must import TutorialOverlay')
})

test('SellerDashboard defines product creation wizard reactive state', () => {
  const content = fs.readFileSync(DASHBOARD_PATH, 'utf8')

  // activeTab supports 'create'
  assert.match(content, /activeTab\s*=\s*ref\(/, 'Must declare activeTab')
  // wizardStep (0: Method, 1: Tagging, 2: Customizer, 3: Details)
  assert.match(content, /wizardStep\s*=\s*ref\(0\)/, 'Must declare wizardStep ref initialized to 0')
  // creationMethod ('upload' | 'ai_generate' | 'template')
  assert.match(content, /creationMethod\s*=\s*ref\(/, 'Must declare creationMethod ref')
  // draft paths, maps, and selections
  assert.match(content, /draftGlbPath\s*=\s*ref\(/, 'Must declare draftGlbPath ref')
  assert.match(content, /draftMeshMap\s*=\s*ref\(/, 'Must declare draftMeshMap ref')
  assert.match(content, /draftPartColors\s*=\s*ref\(/, 'Must declare draftPartColors ref')
  assert.match(content, /draftCharmId\s*=\s*ref\(/, 'Must declare draftCharmId ref')
  assert.match(content, /draftProduct\s*=\s*ref\(/, 'Must declare draftProduct ref')
  // loading and feedback states
  assert.match(content, /isUploadingGlb\s*=\s*ref\(false\)|uploadingGlb\s*=\s*ref\(false\)/, 'Must track GLB upload loading state')
  assert.match(content, /isGeneratingAi\s*=\s*ref\(false\)|generatingAi\s*=\s*ref\(false\)/, 'Must track AI generation loading state')
  assert.match(content, /isSubmittingProduct\s*=\s*ref\(false\)|submittingProduct\s*=\s*ref\(false\)/, 'Must track product submit state')
})

test('SellerDashboard "+ Create New Product" switches activeTab to create and resets wizardStep to 0', () => {
  const content = fs.readFileSync(DASHBOARD_PATH, 'utf8')

  assert.match(content, /startWizard|openWizard|createProduct/, 'Must define function to start/open product wizard')
  assert.match(content, /@click="[^"]*startWizard|@click="[^"]*activeTab\s*=\s*['"]create['"]/, 'Button must trigger wizard start')
})

test('Step 0 renders 3 creation methods with data-tutorial="choose_method"', () => {
  const content = fs.readFileSync(DASHBOARD_PATH, 'utf8')

  // Tutorial hook
  assert.match(content, /data-tutorial="choose_method"/, 'Must have data-tutorial="choose_method"')
  // 3 creation methods
  assert.match(content, /['"]upload['"]/, 'Must offer GLB Upload method')
  assert.match(content, /['"]ai_generate['"]/, 'Must offer AI 2D to 3D Generation method')
  assert.match(content, /['"]template['"]/, 'Must offer Template Builder method')
})

test('Step 1 implements GLB Upload, AI 2D Generation, and Template Selection', () => {
  const content = fs.readFileSync(DASHBOARD_PATH, 'utf8')

  // Upload GLB file input calling upload-glb.php
  assert.match(content, /type="file"[^>]*accept="(?:\.glb|application\/octet-stream)"|accept="\.glb"[^>]*type="file"/, 'Must have file input for .glb')
  assert.match(content, /products\/upload-glb\.php/, 'Must call products/upload-glb.php')

  // AI 2D image file input calling ai/generate.php
  assert.match(content, /type="file"[^>]*accept="image\/\*"|accept="image\/\*"[^>]*type="file"/, 'Must have file input for images')
  assert.match(content, /ai\/generate\.php/, 'Must call ai/generate.php')

  // Template options: SoleView, Air Max, Dunk Low
  assert.match(content, /shoe-soleview-final\.glb/, 'Must offer SoleView template')
  assert.match(content, /shoe-airmax-final\.glb/, 'Must offer Air Max template')
  assert.match(content, /shoe-dunk-final\.glb/, 'Must offer Dunk Low template')

  // Renders MeshTagger when draftGlbPath is ready
  assert.match(content, /<MeshTagger/, 'Must mount MeshTagger component')
  assert.match(content, /:glb-path="draftGlbPath"/, 'Must bind :glb-path="draftGlbPath"')
  assert.match(content, /@complete="onMeshTagged"/, 'Must handle @complete="onMeshTagged"')
  assert.match(content, /@cancel="cancelWizard"/, 'Must handle @cancel="cancelWizard"')
  assert.match(content, /data-tutorial="tag_meshes"/, 'Must attach data-tutorial="tag_meshes"')
})

test('Step 2 renders ProductCustomizer and receives draftGlbPath and draftMeshMap', () => {
  const content = fs.readFileSync(DASHBOARD_PATH, 'utf8')

  assert.match(content, /<ProductCustomizer/, 'Must mount ProductCustomizer component')
  assert.match(content, /:glb-path="draftGlbPath"/, 'Must pass :glb-path="draftGlbPath"')
  assert.match(content, /:mesh-map="draftMeshMap"/, 'Must pass :mesh-map="draftMeshMap"')
  assert.match(content, /@complete="onColorsCustomized"/, 'Must handle @complete="onColorsCustomized"')
  assert.match(content, /@back="[^"]*wizardStep\s*=\s*1|@back="[^"]*prevWizardStep/, 'Must handle @back event')
  assert.match(content, /data-tutorial="customize_colors"/, 'Must attach data-tutorial="customize_colors"')
})

test('Step 3 renders Product Details form and submits to products/create.php and products/submit.php', () => {
  const content = fs.readFileSync(DASHBOARD_PATH, 'utf8')

  // Form fields
  assert.match(content, /draftProduct\.name/, 'Must bind product name')
  assert.match(content, /draftProduct\.description/, 'Must bind product description')
  assert.match(content, /draftProduct\.price/, 'Must bind product price')
  assert.match(content, /draftProduct\.stock/, 'Must bind product stock')
  assert.match(content, /draftProduct\.sizesAvailable/, 'Must bind product available sizes')

  // Tutorial hooks
  assert.match(content, /data-tutorial="set_details"/, 'Must attach data-tutorial="set_details"')
  assert.match(content, /data-tutorial="submit_product"/, 'Must attach data-tutorial="submit_product"')

  // API calls
  assert.match(content, /products\/create\.php/, 'Must call products/create.php')
  assert.match(content, /products\/submit\.php/, 'Must call products/submit.php')
  assert.match(content, /function\s+submitProduct|const\s+submitProduct\s*=/, 'Must define submitProduct function')
})

test('SellerDashboard wires all data-tutorial attributes for guided walkthrough', () => {
  const content = fs.readFileSync(DASHBOARD_PATH, 'utf8')

  assert.match(content, /data-tutorial="create_product"/, 'create_product hook')
  assert.match(content, /data-tutorial="choose_method"/, 'choose_method hook')
  assert.match(content, /data-tutorial="tag_meshes"/, 'tag_meshes hook')
  assert.match(content, /data-tutorial="customize_colors"/, 'customize_colors hook')
  assert.match(content, /data-tutorial="set_details"/, 'set_details hook')
  assert.match(content, /data-tutorial="submit_product"/, 'submit_product hook')
  assert.match(content, /data-tutorial="manage_orders"/, 'manage_orders hook')
})

test('SellerDashboard creation wizard adheres to KickCraft brutalist design tokens', () => {
  const content = fs.readFileSync(DASHBOARD_PATH, 'utf8')

  assert.match(content, /border-stone-900|border-2 border-stone-900/, 'Must use border-stone-900')
  assert.match(content, /shadow-\[6px_6px_0px_#202220\]/, 'Must use shadow-[6px_6px_0px_#202220]')
  assert.match(content, /#b94d27/, 'Must use KickCraft terracotta accent color #b94d27')
  assert.match(content, /font-mono/, 'Must use font-mono')
  assert.match(content, /font-display/, 'Must use font-display')
})

test('Step 2 Customizer removes "Back to Mesh Tagging" button from seller studio design', () => {
  const content = fs.readFileSync(DASHBOARD_PATH, 'utf8')
  assert.doesNotMatch(
    content,
    /Back to Mesh Tagging/i,
    'SellerDashboard must not render "Back to Mesh Tagging" button'
  )
})

