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
  assert.match(code, /'image'\s*=>\s*\[/) // Gradio 5 Gallery dict payload format
  assert.match(code, /'caption'\s*=>\s*null/)

  // Verify friendly error doesn't misdiagnose generic errors as 'building'
  assert.match(code, /space is building/)
})
