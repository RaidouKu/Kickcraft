import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const COMPONENT_PATH = path.resolve('src/components/ProductCustomizer.vue')

test('ProductCustomizer component file exists and defines required props and emits', () => {
  assert.ok(fs.existsSync(COMPONENT_PATH), 'src/components/ProductCustomizer.vue must exist')
  const content = fs.readFileSync(COMPONENT_PATH, 'utf8')

  // Vue 3 script setup
  assert.match(content, /<script setup>/, 'Must use Vue 3 <script setup>')

  // Props contract: glbPath, meshMap, initialColors, initialCharm
  assert.match(content, /defineProps/, 'Must define props')
  assert.match(content, /glbPath\s*:\s*\{[^}]*type\s*:\s*String[^}]*required\s*:\s*true/s, 'glbPath prop must be required String')
  assert.match(content, /meshMap\s*:\s*\{[^}]*type\s*:\s*Object[^}]*required\s*:\s*true/s, 'meshMap prop must be required Object')
  assert.match(content, /initialColors\s*:\s*\{[^}]*type\s*:\s*Object/s, 'initialColors prop must accept Object')
  assert.match(content, /initialCharm\s*:\s*\{[^}]*type\s*:\s*String/s, 'initialCharm prop must accept String')

  // Emits contract: complete, back
  assert.match(content, /defineEmits/, 'Must define emits')
  assert.match(content, /['"]complete['"]/, 'Must emit complete')
  assert.match(content, /['"]back['"]/, 'Must emit back')
})

test('ProductCustomizer renders 3D model-viewer and extra-model charms', () => {
  assert.ok(fs.existsSync(COMPONENT_PATH), 'src/components/ProductCustomizer.vue must exist')
  const content = fs.readFileSync(COMPONENT_PATH, 'utf8')

  // model-viewer element
  assert.match(content, /<model-viewer/i, 'Must render <model-viewer> tag')
  assert.match(content, /:src="glbPath"/, 'Must bind :src="glbPath"')
  assert.match(content, /camera-controls/, 'Must enable camera-controls')
  assert.match(content, /auto-rotate/, 'Must enable auto-rotate')

  // extra-model or charm preview
  assert.match(content, /<extra-model/i, 'Must render <extra-model> for charms preview')
})

test('ProductCustomizer defines signature KickCraft color palette', () => {
  assert.ok(fs.existsSync(COMPONENT_PATH), 'src/components/ProductCustomizer.vue must exist')
  const content = fs.readFileSync(COMPONENT_PATH, 'utf8')

  // Signature colors
  assert.match(content, /#f1efe8/i, 'Chalk / Bone color #f1efe8')
  assert.match(content, /#292b2d/i, 'Graphite / Charcoal color #292b2d')
  assert.match(content, /#b94d27/i, 'Terracotta / Clay color #b94d27')
  assert.match(content, /#245fa8/i, 'Cobalt / Electric color #245fa8')
  assert.match(content, /#7d9b76/i, 'Sage / Mint color #7d9b76')
  assert.match(content, /#d4af37/i, 'Gold / Mustard color #d4af37')
  assert.match(content, /#963a20/i, 'Crimson / Brick color #963a20')
  assert.match(content, /#ffffff/i, 'Pure White color #ffffff')
})

test('ProductCustomizer defines charm options: None, Star, K-Tag, Lightning', () => {
  assert.ok(fs.existsSync(COMPONENT_PATH), 'src/components/ProductCustomizer.vue must exist')
  const content = fs.readFileSync(COMPONENT_PATH, 'utf8')

  const expectedCharms = ['none', 'star', 'k-tag', 'lightning']
  for (const charmId of expectedCharms) {
    const charmRegex = new RegExp(`['"]?id['"]?\\s*:\\s*['"]${charmId}['"]|['"]${charmId}['"]`)
    assert.match(content, charmRegex, `Must define charm ID: ${charmId}`)
  }

  assert.match(content, /Star/i, 'Must have Star charm label')
  assert.match(content, /K-Tag|K\s*tag/i, 'Must have K-Tag charm label')
  assert.match(content, /Lightning/i, 'Must have Lightning charm label')
})

test('ProductCustomizer manages part selection, color updating, and live recoloring', () => {
  assert.ok(fs.existsSync(COMPONENT_PATH), 'src/components/ProductCustomizer.vue must exist')
  const content = fs.readFileSync(COMPONENT_PATH, 'utf8')

  // Reactive state
  assert.match(content, /partColors\s*=\s*ref\(/, 'Must track reactive partColors')
  assert.match(content, /selectedCharm\s*=\s*ref\(/, 'Must track reactive selectedCharm')
  assert.match(content, /activePart\s*=\s*ref\(/, 'Must track reactive activePart')

  // Part selection & color assignment
  assert.match(content, /function\s+selectPart|const\s+selectPart\s*=/, 'Must implement selectPart')
  assert.match(content, /function\s+setColor|const\s+setColor\s*=|function\s+chooseColor|const\s+chooseColor\s*=/, 'Must implement setColor / chooseColor')

  // Live model recoloring
  assert.match(content, /function\s+applyColorToViewer|const\s+applyColorToViewer\s*=/, 'Must implement applyColorToViewer')
  assert.match(content, /setBaseColorFactor/, 'Must update material baseColorFactor in viewer')
})

test('ProductCustomizer emits complete with { partColors, charmId } and back events', () => {
  assert.ok(fs.existsSync(COMPONENT_PATH), 'src/components/ProductCustomizer.vue must exist')
  const content = fs.readFileSync(COMPONENT_PATH, 'utf8')

  // Complete action & payload
  assert.match(content, /emit\(\s*['"]complete['"]\s*,\s*\{[\s\S]*?partColors[\s\S]*?charmId[\s\S]*?\}\s*\)/, 'Must emit complete with { partColors, charmId }')
  assert.match(content, /Save\s*&\s*Continue|Save\s*&\s*Next/i, 'Must have Save & Continue button')

  // Back action
  assert.match(content, /emit\(\s*['"]back['"]\s*\)/, 'Must emit back')
  assert.match(content, /Back/i, 'Must have Back button')
})

test('ProductCustomizer adheres to KickCraft brutalist design tokens', () => {
  assert.ok(fs.existsSync(COMPONENT_PATH), 'src/components/ProductCustomizer.vue must exist')
  const content = fs.readFileSync(COMPONENT_PATH, 'utf8')

  // Brutalist styling tokens
  assert.match(content, /border-stone-900|border-2 border-stone-900/, 'Must use border-stone-900')
  assert.match(content, /shadow-\[6px_6px_0px_#202220\]/, 'Must use shadow-[6px_6px_0px_#202220]')
  assert.match(content, /#b94d27/, 'Must use KickCraft terracotta accent color #b94d27')
  assert.match(content, /bg-\[#fcfdfb\]/, 'Card background must use #fcfdfb')
  assert.match(content, /font-mono/, 'Must use font-mono for badges and buttons')
})
