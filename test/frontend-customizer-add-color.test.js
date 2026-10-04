import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const SELLER_DASHBOARD_PATH = path.resolve('src/components/SellerDashboard.vue')
const CUSTOMIZER_PATH = path.resolve('src/components/ProductCustomizer.vue')

test('SellerDashboard locks Creation Method during product edit', () => {
  assert.ok(fs.existsSync(SELLER_DASHBOARD_PATH), 'SellerDashboard.vue must exist')
  const content = fs.readFileSync(SELLER_DASHBOARD_PATH, 'utf8')

  // 1. Wizard tab shows locked label when editing
  assert.match(
    content,
    /isEditingProduct\s*\?\s*['"]1\.\s*Method\s*\(Locked\)['"]\s*:\s*['"]1\.\s*Method['"]/,
    'Wizard navigation must show "1. Method (Locked)" when isEditingProduct is true'
  )

  // 2. Wizard tab is disabled when editing
  assert.match(
    content,
    /:disabled="isEditingProduct"/,
    'Step 0 Method tab button must be disabled when editing'
  )

  // 3. Step 1 "Change Method" button is hidden when editing
  assert.match(
    content,
    /<button\s+v-if="!isEditingProduct"[^>]*>\s*&larr;\s*Change Method\s*<\/button>/,
    'Change Method button must be hidden when isEditingProduct is true'
  )

  // 4. selectCreationMethod guards against execution during edit
  assert.match(
    content,
    /function\s+selectCreationMethod\([^)]*\)\s*\{[\s\S]*?if\s*\(\s*isEditingProduct\.value\s*\)\s*return/,
    'selectCreationMethod must return early if isEditingProduct is true'
  )
})

test('ProductCustomizer removes "Select Part to Recolor" section and chips', () => {
  assert.ok(fs.existsSync(CUSTOMIZER_PATH), 'ProductCustomizer.vue must exist')
  const content = fs.readFileSync(CUSTOMIZER_PATH, 'utf8')

  // Must NOT render "Select Part to Recolor" heading in template
  assert.doesNotMatch(
    content,
    /Select Part to Recolor/,
    'ProductCustomizer template must not have "Select Part to Recolor"'
  )

  // Must NOT render mappedParts button chips loop in template
  assert.doesNotMatch(
    content,
    /v-for="part in mappedParts"/,
    'ProductCustomizer template must not render part selection buttons'
  )
})

test('ProductCustomizer includes Color Palette with "+ Add Color" custom color picker and hex input', () => {
  assert.ok(fs.existsSync(CUSTOMIZER_PATH), 'ProductCustomizer.vue must exist')
  const content = fs.readFileSync(CUSTOMIZER_PATH, 'utf8')

  // 1. Preserves PALETTE swatches
  assert.match(content, /v-for="color in PALETTE"/, 'Must render PALETTE preset swatches')

  // 2. Includes native color input for "+ Add Color"
  assert.match(
    content,
    /<input[^>]+type="color"[^>]*>/i,
    'Must include native <input type="color"> for full spectrum color picking'
  )

  // 3. Includes "+ Add Color" or "Custom Color" button/tile
  assert.match(
    content,
    /Add Color|Custom Color|\+\s*Custom/i,
    'Must render "+ Add Color" or "Custom Color" option'
  )

  // 4. Includes direct hex input field
  assert.match(
    content,
    /<input[^>]+placeholder=["']#?[A-Fa-f0-9]{3,6}["'][^>]*>/i,
    'Must include hex text input field'
  )

  // 5. Handles custom color reactive state and application
  assert.match(
    content,
    /customHex\s*=\s*ref\(/,
    'Must define reactive customHex state'
  )

  assert.match(
    content,
    /function\s+applyCustomColor|const\s+applyCustomColor\s*=|function\s+onCustomColorInput|const\s+onCustomColorInput\s*=/,
    'Must implement custom color handler'
  )
})
