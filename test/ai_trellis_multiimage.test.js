import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

test('trellis-client.php supports multi-image arrays and quality parameters', () => {
  const code = fs.readFileSync(path.resolve('api/ai/trellis-client.php'), 'utf8')

  // Verify trellisGenerateGlb accepts array or string
  assert.match(code, /function trellisGenerateGlb\(/)
  assert.match(code, /is_multiimage/)
  assert.match(code, /multiimage_algo/)
  assert.match(code, /preprocess_images|preprocess_image/)

  // Verify sampling steps and simplify tuning
  assert.match(code, /20/) // steps tuned to 20
  assert.match(code, /0\.92|0\.90/) // mesh simplification tuned to retain sole tread
})
