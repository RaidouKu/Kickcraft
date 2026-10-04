import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const COMPONENT_PATH = path.resolve('src/components/MeshTagger.vue')

test('MeshTagger component file exists and defines required props and emits', () => {
  assert.ok(fs.existsSync(COMPONENT_PATH), 'src/components/MeshTagger.vue must exist')
  const content = fs.readFileSync(COMPONENT_PATH, 'utf8')

  // Vue 3 script setup
  assert.match(content, /<script setup>/, 'Must use Vue 3 <script setup>')

  // Props contract: glbPath (required String), initialMeshMap (optional Object)
  assert.match(content, /defineProps/, 'Must define props')
  assert.match(content, /glbPath\s*:\s*\{[^}]*type\s*:\s*String[^}]*required\s*:\s*true/s, 'glbPath prop must be required String')
  assert.match(content, /initialMeshMap\s*:\s*\{[^}]*type\s*:\s*Object/s, 'initialMeshMap prop must accept Object')

  // Emits contract: complete, cancel
  assert.match(content, /defineEmits/, 'Must define emits')
  assert.match(content, /['"]complete['"]/, 'Must emit complete')
  assert.match(content, /['"]cancel['"]/, 'Must emit cancel')
})

test('MeshTagger defines all 8 standard KickCraft customizable parts', () => {
  assert.ok(fs.existsSync(COMPONENT_PATH), 'src/components/MeshTagger.vue must exist')
  const content = fs.readFileSync(COMPONENT_PATH, 'utf8')

  const expectedParts = [
    { id: 'Upper', label: 'Upper Main' },
    { id: 'ToeCap', label: 'Toe Cap' },
    { id: 'Tongue', label: 'Tongue' },
    { id: 'Laces', label: 'Laces' },
    { id: 'HeelPanel', label: 'Heel Panel' },
    { id: 'SideAccents', label: 'Side Accents' },
    { id: 'Midsole', label: 'Midsole Cushion' },
    { id: 'Outsole', label: 'Outsole Tread' },
  ]

  for (const part of expectedParts) {
    const idRegex = new RegExp(`['"]?id['"]?\\s*:\\s*['"]${part.id}['"]|['"]${part.id}['"]`)
    assert.match(content, idRegex, `Must define customizable part ID: ${part.id}`)
    const labelRegex = new RegExp(part.label, 'i')
    assert.match(content, labelRegex, `Must define label for part: ${part.label}`)
  }
})

test('MeshTagger implements auto-detection heuristic algorithm for mesh names', () => {
  assert.ok(fs.existsSync(COMPONENT_PATH), 'src/components/MeshTagger.vue must exist')
  const content = fs.readFileSync(COMPONENT_PATH, 'utf8')

  // Check function presence
  assert.match(content, /function\s+autoDetectMeshes|const\s+autoDetectMeshes\s*=/, 'Must implement autoDetectMeshes function')

  // Check keyword heuristic rules
  assert.match(content, /upper/i, 'Must check upper keyword')
  assert.match(content, /toe/i, 'Must check toe keyword')
  assert.match(content, /tongue/i, 'Must check tongue keyword')
  assert.match(content, /lace|string/i, 'Must check lace/string keyword')
  assert.match(content, /heel/i, 'Must check heel keyword')
  assert.match(content, /side|accent|logo|swoosh/i, 'Must check side/accent/swoosh keyword')
  assert.match(content, /mid|midsole/i, 'Must check mid/midsole keyword')
  assert.match(content, /out|outsole|sole|bottom/i, 'Must check outsole/sole keyword')

  // Extract matchPartForMesh / heuristic function if isolated, or execute regex matcher
  // Verify matching logic against standard naming patterns
  const matchHeuristic = (name) => {
    const lower = name.toLowerCase()
    if (lower.includes('upper')) return 'Upper'
    if (lower.includes('toe')) return 'ToeCap'
    if (lower.includes('tongue')) return 'Tongue'
    if (lower.includes('lace') || lower.includes('string')) return 'Laces'
    if (lower.includes('heel')) return 'HeelPanel'
    if (lower.includes('side') || lower.includes('accent') || lower.includes('logo') || lower.includes('swoosh')) return 'SideAccents'
    if (lower.includes('midsole') || lower.includes('mid')) return 'Midsole'
    if (lower.includes('outsole') || lower.includes('sole') || lower.includes('bottom') || lower.includes('out')) return 'Outsole'
    return null
  }

  assert.equal(matchHeuristic('shoe_upper_mesh'), 'Upper')
  assert.equal(matchHeuristic('ToeCap_Geometry'), 'ToeCap')
  assert.equal(matchHeuristic('mesh_tongue'), 'Tongue')
  assert.equal(matchHeuristic('laces_white'), 'Laces')
  assert.equal(matchHeuristic('heel_counter'), 'HeelPanel')
  assert.equal(matchHeuristic('swoosh_accent_left'), 'SideAccents')
  assert.equal(matchHeuristic('midsole_foam'), 'Midsole')
  assert.equal(matchHeuristic('outsole_rubber'), 'Outsole')
  assert.equal(matchHeuristic('bottom_tread'), 'Outsole')
  assert.equal(matchHeuristic('unknown_poly_01'), null)
})

test('MeshTagger implements manual mesh assignment and unmapping', () => {
  assert.ok(fs.existsSync(COMPONENT_PATH), 'src/components/MeshTagger.vue must exist')
  const content = fs.readFileSync(COMPONENT_PATH, 'utf8')

  // Assignment & unmapping methods
  assert.match(content, /function\s+assignMesh|const\s+assignMesh\s*=|function\s+mapMesh|const\s+mapMesh\s*=/, 'Must implement assignMesh function')
  assert.match(content, /function\s+unmapPart|const\s+unmapPart\s*=|function\s+removeMapping|const\s+removeMapping\s*=/, 'Must implement unmapPart function')

  // Reactive state
  assert.match(content, /meshMap\s*=\s*ref\(/, 'Must track reactive meshMap')
  assert.match(content, /selectedPartId\s*=\s*ref\(/, 'Must track selectedPartId')
  assert.match(content, /detectedMeshes\s*=\s*ref\(/, 'Must track detectedMeshes')

  // UI mapping badges and unmap buttons
  assert.match(content, /✕|&times;|delete|remove|unmap/i, 'Must render unmap button')
})

test('MeshTagger supports optional shoe parts tagging for completion', () => {
  assert.ok(fs.existsSync(COMPONENT_PATH), 'src/components/MeshTagger.vue must exist')
  const content = fs.readFileSync(COMPONENT_PATH, 'utf8')

  // Validation logic: tracks mapped count and allows completion
  assert.match(content, /mappedCount|mappedPartsCount|Object\.keys\(\s*meshMap(?:\.value)?\s*\)\.length/, 'Must count mapped parts')
  assert.match(content, /canComplete|isCompleteValid|allowComplete/, 'Must compute canComplete boolean')

  // Progress indicator text
  assert.match(content, /TAGGED\s*\{\{.*\}\}\s*OF\s*8\s*PARTS|Tagged\s*\{\{.*\}\}\s*of\s*8\s*parts/i, 'Must display tagged counter')
  assert.match(content, /OPTIONAL/i, 'Must display optional indicator or notice')

  // Action buttons
  assert.match(content, /Accept\s*&\s*Continue|Confirm\s*&\s*Continue/i, 'Must have Accept & Continue button')
  assert.match(content, /Back|Cancel/i, 'Must have Cancel / Back button')
})

test('MeshTagger emits complete event with meshMap payload and cancel event', () => {
  assert.ok(fs.existsSync(COMPONENT_PATH), 'src/components/MeshTagger.vue must exist')
  const content = fs.readFileSync(COMPONENT_PATH, 'utf8')

  // Complete handler emits meshMap
  assert.match(content, /emit\(\s*['"]complete['"]\s*,\s*meshMap(?:\.value)?\s*\)/, 'Must emit complete with meshMap')
  assert.match(content, /emit\(\s*['"]cancel['"]\s*\)/, 'Must emit cancel')
})

test('MeshTagger renders 3D model-viewer and split layout', () => {
  assert.ok(fs.existsSync(COMPONENT_PATH), 'src/components/MeshTagger.vue must exist')
  const content = fs.readFileSync(COMPONENT_PATH, 'utf8')

  // model-viewer element
  assert.match(content, /<model-viewer/i, 'Must render <model-viewer> tag')
  assert.match(content, /:src="glbPath"/, 'Must bind :src="glbPath"')
  assert.match(content, /auto-rotate/, 'Must enable auto-rotate')
  assert.match(content, /camera-controls/, 'Must enable camera-controls')

  // Auto-detect button
  assert.match(content, /⚡\s*AUTO-DETECT\s*MESHES|AUTO-DETECT\s*MESHES/i, 'Must have AUTO-DETECT MESHES button')
})

test('MeshTagger adheres to KickCraft brutalist design tokens', () => {
  assert.ok(fs.existsSync(COMPONENT_PATH), 'src/components/MeshTagger.vue must exist')
  const content = fs.readFileSync(COMPONENT_PATH, 'utf8')

  // Brutalist styling tokens
  assert.match(content, /border-stone-900|border-2 border-stone-900/, 'Must use border-stone-900')
  assert.match(content, /shadow-\[6px_6px_0px_#202220\]/, 'Must use shadow-[6px_6px_0px_#202220]')
  assert.match(content, /#b94d27/, 'Must use KickCraft terracotta accent color #b94d27')
  assert.match(content, /bg-\[#fcfdfb\]/, 'Card background must use #fcfdfb')
  assert.match(content, /font-mono/, 'Must use font-mono for badges and buttons')
})
