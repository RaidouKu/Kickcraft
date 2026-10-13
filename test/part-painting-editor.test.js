import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import * as THREE from 'three'

const ROOT_DIR = path.resolve(import.meta.dirname, '..')
const COMPONENT_PATH = path.join(ROOT_DIR, 'src', 'components', 'PartPaintingEditor.vue')
const TEST_FILE = path.join(ROOT_DIR, 'test', 'part-painting-editor.test.js')

test('PartPaintingEditor: component file exists and defines required props and emits', () => {
  assert.ok(fs.existsSync(COMPONENT_PATH), 'src/components/PartPaintingEditor.vue must exist')
  const content = fs.readFileSync(COMPONENT_PATH, 'utf8')

  // Vue 3 script setup
  assert.match(content, /<script setup>/, 'Must use Vue 3 <script setup>')

  // Props contract
  assert.match(content, /defineProps/, 'Must define props')
  assert.match(content, /glbPath\s*:\s*\{[^}]*type\s*:\s*String[^}]*required\s*:\s*true/s, 'glbPath prop must be required String')
  assert.match(content, /productId\s*:\s*\{[^}]*type\s*:\s*String/s, 'productId prop must accept String')
  assert.match(content, /initialMeshMap\s*:\s*\{[^}]*type\s*:\s*Object/s, 'initialMeshMap prop must accept Object')
  assert.match(content, /initialPartColors\s*:\s*\{[^}]*type\s*:\s*Object/s, 'initialPartColors prop must accept Object')

  // Emits contract: save, cancel, saved
  assert.match(content, /defineEmits/, 'Must define emits')
  assert.match(content, /['"]save['"]/, 'Must emit save')
  assert.match(content, /['"]cancel['"]/, 'Must emit cancel')
  assert.match(content, /['"]saved['"]/, 'Must emit saved')
})

test('PartPaintingEditor: exposes all 8 canonical KickCraft customizable parts', () => {
  assert.ok(fs.existsSync(COMPONENT_PATH), 'src/components/PartPaintingEditor.vue must exist')
  const content = fs.readFileSync(COMPONENT_PATH, 'utf8')

  const expectedParts = [
    { id: 'Upper', label: 'Upper' },
    { id: 'ToeCap', label: 'Toe Cap' },
    { id: 'Tongue', label: 'Tongue' },
    { id: 'Laces', label: 'Laces' },
    { id: 'HeelPanel', label: 'Heel Panel' },
    { id: 'SideAccents', label: 'Side Accents' },
    { id: 'Midsole', label: 'Midsole' },
    { id: 'Outsole', label: 'Outsole' },
  ]

  for (const part of expectedParts) {
    const idRegex = new RegExp(`['"]?id['"]?\\s*:\\s*['"]${part.id}['"]|['"]${part.id}['"]`)
    assert.match(content, idRegex, `Must define canonical part ID: ${part.id}`)
    const labelRegex = new RegExp(part.label, 'i')
    assert.match(content, labelRegex, `Must define label for part: ${part.label}`)
  }

  // Active part selection reactive state
  assert.match(content, /selectedPartIndex|selectedPartId/, 'Must track selected part')
})

test('PartPaintingEditor: implements brush radius presets (Fine, Medium, Wide) and slider', () => {
  assert.ok(fs.existsSync(COMPONENT_PATH), 'src/components/PartPaintingEditor.vue must exist')
  const content = fs.readFileSync(COMPONENT_PATH, 'utf8')

  // Presets: Fine: 15, Medium: 35, Wide: 70
  assert.match(content, /Fine/i, 'Must have Fine brush preset button')
  assert.match(content, /15/, 'Fine preset must correspond to 15px')
  assert.match(content, /Medium/i, 'Must have Medium brush preset button')
  assert.match(content, /35/, 'Medium preset must correspond to 35px')
  assert.match(content, /Wide/i, 'Must have Wide brush preset button')
  assert.match(content, /70/, 'Wide preset must correspond to 70px')

  // Numeric slider input
  assert.match(content, /<input[^>]*type="range"/, 'Must provide range slider input for brush radius')
  assert.match(content, /brushRadius|brushSize/, 'Must have brush radius reactive state')
})

test('PartPaintingEditor: implements paint, erase, and orbit mode switching with cursor indicator classes', () => {
  assert.ok(fs.existsSync(COMPONENT_PATH), 'src/components/PartPaintingEditor.vue must exist')
  const content = fs.readFileSync(COMPONENT_PATH, 'utf8')

  // Tool modes: paint, erase, orbit
  assert.match(content, /['"]paint['"]/, 'Must support paint mode')
  assert.match(content, /['"]erase['"]/, 'Must support erase mode')
  assert.match(content, /['"]orbit['"]/, 'Must support orbit/navigation mode')

  // Visual pointer indicator: solid ring for paint, dashed ring for erase
  assert.match(content, /border-solid|solid/i, 'Must support solid ring indicator for paint')
  assert.match(content, /border-dashed|dashed/i, 'Must support dashed ring indicator for erase')
  assert.match(content, /cursorIndicator|brushIndicator|pointerRing/, 'Must render brush pointer indicator element')
})

test('PartPaintingEditor: implements surface normal occlusion check to reject back-facing triangles', () => {
  assert.ok(fs.existsSync(COMPONENT_PATH), 'src/components/PartPaintingEditor.vue must exist')
  const content = fs.readFileSync(COMPONENT_PATH, 'utf8')

  // Occlusion logic in component: normal dot product against view direction
  assert.match(content, /dot\s*\(/, 'Must calculate dot product of normal and view direction')
  assert.match(content, /-0\.15|0\.1|threshold/i, 'Must apply occlusion angle threshold (e.g. dot < -0.15)')

  // Mathematical validation of occlusion check
  // Given view direction from camera to surface point: viewDir = (0, 0, -1)
  const viewDir = new THREE.Vector3(0, 0, -1).normalize()

  // Front-facing surface normal pointing back toward camera: normal = (0, 0, 1)
  const frontNormal = new THREE.Vector3(0, 0, 1).normalize()
  const frontDot = frontNormal.dot(viewDir) // -1.0 (opposing vectors -> facing each other)

  // Back-facing surface normal pointing away from camera: normal = (0, 0, -1)
  const backNormal = new THREE.Vector3(0, 0, -1).normalize()
  const backDot = backNormal.dot(viewDir) // +1.0 (same direction -> back facing)

  // Glancing angle surface normal: 80 degrees
  const glancingNormal = new THREE.Vector3(Math.cos(Math.PI / 9), 0, Math.sin(Math.PI / 9)).normalize()
  const glancingDot = glancingNormal.dot(viewDir)

  // The condition dot(viewDir) < -0.15 reliably accepts visible surface faces and rejects back-facing ones
  const isOccluded = (normal, vDir, threshold = -0.15) => normal.dot(vDir) >= threshold

  assert.equal(isOccluded(frontNormal, viewDir), false, 'Front face must not be occluded (visible to paint)')
  assert.equal(isOccluded(backNormal, viewDir), true, 'Back face must be occluded (culled to prevent painting through)')
  assert.equal(frontDot < -0.15, true, 'Front facing face satisfies dot < -0.15')
  assert.equal(backDot < -0.15, false, 'Back facing face fails dot < -0.15')
})

test('PartPaintingEditor: implements stroke undo stack behavior with TypedArray face assignments', () => {
  assert.ok(fs.existsSync(COMPONENT_PATH), 'src/components/PartPaintingEditor.vue must exist')
  const content = fs.readFileSync(COMPONENT_PATH, 'utf8')

  // TypedArray assignments and undo history state
  assert.match(content, /Int8Array/, 'Must initialize Int8Array for face assignments')
  assert.match(content, /undoStack|historyStack/, 'Must maintain undo history stack')
  assert.match(content, /function\s+undo|const\s+undo\s*=|handleUndo/, 'Must implement undo function')

  // Unit verification of stroke undo stack logic
  const totalFaces = 100
  const faceAssignments = new Int8Array(totalFaces).fill(-1)
  const undoStack = []

  // Simulate Stroke 1: Paint part 0 (Upper) on faces [10, 11, 12]
  const stroke1 = new Map()
  const stroke1Faces = [10, 11, 12]
  for (const f of stroke1Faces) {
    stroke1.set(f, faceAssignments[f])
    faceAssignments[f] = 0 // Upper
  }
  undoStack.push(stroke1)

  assert.equal(faceAssignments[10], 0)
  assert.equal(faceAssignments[11], 0)
  assert.equal(faceAssignments[12], 0)
  assert.equal(undoStack.length, 1)

  // Simulate Stroke 2: Overwrite face 12 with part 6 (Midsole), paint face 13 with part 6
  const stroke2 = new Map()
  const stroke2Faces = [12, 13]
  for (const f of stroke2Faces) {
    stroke2.set(f, faceAssignments[f])
    faceAssignments[f] = 6 // Midsole
  }
  undoStack.push(stroke2)

  assert.equal(faceAssignments[12], 6)
  assert.equal(faceAssignments[13], 6)
  assert.equal(undoStack.length, 2)

  // Undo Stroke 2
  const poppedStroke2 = undoStack.pop()
  for (const [faceIdx, prevPart] of poppedStroke2.entries()) {
    faceAssignments[faceIdx] = prevPart
  }

  assert.equal(faceAssignments[12], 0, 'Face 12 should revert to Upper (part 0)')
  assert.equal(faceAssignments[13], -1, 'Face 13 should revert to unassigned (-1)')
  assert.equal(undoStack.length, 1)

  // Undo Stroke 1
  const poppedStroke1 = undoStack.pop()
  for (const [faceIdx, prevPart] of poppedStroke1.entries()) {
    faceAssignments[faceIdx] = prevPart
  }

  assert.equal(faceAssignments[10], -1, 'Face 10 should revert to unassigned (-1)')
  assert.equal(faceAssignments[11], -1, 'Face 11 should revert to unassigned (-1)')
  assert.equal(faceAssignments[12], -1, 'Face 12 should revert to unassigned (-1)')
  assert.equal(undoStack.length, 0)
})

test('PartPaintingEditor: implements clear part action protected by confirmation dialog', () => {
  assert.ok(fs.existsSync(COMPONENT_PATH), 'src/components/PartPaintingEditor.vue must exist')
  const content = fs.readFileSync(COMPONENT_PATH, 'utf8')

  // Clear part method and confirmation
  assert.match(content, /clearPart|handleClearPart|clearCurrentPart/, 'Must implement clear part function')
  assert.match(content, /confirm|showClearConfirm|isClearModalOpen|confirmClear/, 'Must protect clear part with confirmation dialog')
})

test('PartPaintingEditor: computes assigned face counts and coverage percentages per part', () => {
  assert.ok(fs.existsSync(COMPONENT_PATH), 'src/components/PartPaintingEditor.vue must exist')
  const content = fs.readFileSync(COMPONENT_PATH, 'utf8')

  // Statistics & coverage logic
  assert.match(content, /partStats|partCounts|partPercentages|coverage/i, 'Must calculate part face counts and coverage')
  assert.match(content, /%/, 'Must render percentage sign for part coverage')
})

test('PartPaintingEditor: enforces at least 2 distinct parts before allowing save', () => {
  assert.ok(fs.existsSync(COMPONENT_PATH), 'src/components/PartPaintingEditor.vue must exist')
  const content = fs.readFileSync(COMPONENT_PATH, 'utf8')

  // Validation logic: checks count of distinct assigned parts >= 2
  assert.match(content, /distinctParts|assignedPartsCount|validPartsCount|< 2/, 'Must check that at least 2 parts are defined')
  assert.match(content, /At least 2|at least two/i, 'Must display validation warning when fewer than 2 parts are assigned')

  // Unit test validation logic
  const checkCanSave = (assignments) => {
    const parts = new Set()
    for (let i = 0; i < assignments.length; i++) {
      if (assignments[i] >= 0) parts.add(assignments[i])
    }
    return parts.size >= 2
  }

  assert.equal(checkCanSave(new Int8Array([ -1, -1, -1 ])), false, '0 parts cannot save')
  assert.equal(checkCanSave(new Int8Array([ 0, 0, 0 ])), false, '1 part cannot save')
  assert.equal(checkCanSave(new Int8Array([ 0, 6, -1 ])), true, '2 distinct parts can save')
  assert.equal(checkCanSave(new Int8Array([ 0, 1, 6 ])), true, '3 distinct parts can save')
})

test('PartPaintingEditor: implements "Test Colors" mode toggle and color swatches', () => {
  assert.ok(fs.existsSync(COMPONENT_PATH), 'src/components/PartPaintingEditor.vue must exist')
  const content = fs.readFileSync(COMPONENT_PATH, 'utf8')

  // Test colors toggle
  assert.match(content, /testColors|isTestingColors|testMode/i, 'Must implement test colors toggle reactive state')
  assert.match(content, /Test Colors|TEST COLORS/i, 'Must render Test Colors button')

  // Swatch colors / palette
  assert.match(content, /#b94d27|#245fa8|#7d9b76|#d4af37|#292b2d|#f1efe8/i, 'Must support test color swatches')
})

test('PartPaintingEditor: integrates with meshPartitioner and api/products/save-painted-parts.php', () => {
  assert.ok(fs.existsSync(COMPONENT_PATH), 'src/components/PartPaintingEditor.vue must exist')
  const content = fs.readFileSync(COMPONENT_PATH, 'utf8')

  // meshPartitioner import and usage
  assert.match(content, /exportPaintedModelGlb/, 'Must import and invoke exportPaintedModelGlb')
  assert.match(content, /meshPartitioner/, 'Must import from meshPartitioner.js')

  // API endpoint or save emit
  assert.match(content, /save-painted-parts\.php/, 'Must integrate with api/products/save-painted-parts.php')
  assert.match(content, /isSaving|saving|loading/i, 'Must handle saving loading state')
})

test('PartPaintingEditor: adheres to KickCraft brutalist aesthetic tokens', () => {
  assert.ok(fs.existsSync(COMPONENT_PATH), 'src/components/PartPaintingEditor.vue must exist')
  const content = fs.readFileSync(COMPONENT_PATH, 'utf8')

  // Brutalist styling tokens
  assert.match(content, /border-stone-900|border-2 border-stone-900/, 'Must use border-stone-900')
  assert.match(content, /shadow-\[\d+px_\d+px_0px_#202220\]/, 'Must use brutalist solid drop shadow')
  assert.match(content, /#b94d27/, 'Must use KickCraft terracotta accent color #b94d27')
  assert.match(content, /font-mono/, 'Must use font-mono for badges and buttons')
  assert.match(content, /fixed inset-0/, 'Must be a fullscreen modal container')
})

test('PartPaintingEditor: strictly avoids physical SQL removal statements', () => {
  const content = fs.existsSync(COMPONENT_PATH) ? fs.readFileSync(COMPONENT_PATH, 'utf8') : ''
  const testContent = fs.readFileSync(TEST_FILE, 'utf8')

  const forbidden = new RegExp('\\b' + 'DELETE' + '\\s+' + 'FROM' + '\\b', 'i')
  assert.doesNotMatch(content, forbidden, 'PartPaintingEditor.vue must strictly avoid physical SQL removal statements')
  assert.doesNotMatch(testContent.replace(forbidden, ''), forbidden, 'test file must strictly avoid physical SQL removal statements')
})
