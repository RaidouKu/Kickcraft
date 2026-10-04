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

test('ProductCustomizer implements owner-style Add Color with color wheel and name input', () => {
  assert.ok(fs.existsSync(CUSTOMIZER_PATH), 'ProductCustomizer.vue must exist')
  const content = fs.readFileSync(CUSTOMIZER_PATH, 'utf8')

  // 1. Color wheel input bound to newColorHex
  assert.match(
    content,
    /<input[^>]*v-model="newColorHex"[^>]*type="color"/i,
    'Must include visible <input v-model="newColorHex" type="color"> that opens color wheel'
  )

  // 2. Color name text input bound to newColorName
  assert.match(
    content,
    /<input[^>]*v-model="newColorName"[^>]*type="text"[^>]*placeholder="[^"]*Color Name/i,
    'Must include Color Name input like owner studio'
  )

  // 3. "Add Color" button triggering addColorToPalette
  assert.match(
    content,
    /@click="addColorToPalette"[^>]*>\s*Add Color/i,
    'Must include "Add Color" button calling addColorToPalette'
  )

  // 4. Reactive state: newColorHex, newColorName, customPalette / customColors
  assert.match(content, /newColorHex\s*=\s*ref\(/, 'Must declare newColorHex ref')
  assert.match(content, /newColorName\s*=\s*ref\(/, 'Must declare newColorName ref')

  // 5. Function addColorToPalette and removeCustomColor
  assert.match(
    content,
    /function\s+addColorToPalette|const\s+addColorToPalette\s*=/,
    'Must implement addColorToPalette'
  )
  assert.match(
    content,
    /function\s+removeCustomColor|const\s+removeCustomColor\s*=|function\s+removeColorFromPalette/,
    'Must implement removeCustomColor / removeColorFromPalette'
  )

  // 6. Renders swatches list with custom added swatches and remove button
  assert.match(
    content,
    /removeCustomColor|removeColorFromPalette/,
    'Must render removal trigger for custom added colors'
  )
})
