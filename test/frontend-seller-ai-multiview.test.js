import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

test('SellerDashboard.vue contains multi-angle photo upload slots and tips', () => {
  const content = fs.readFileSync(path.resolve('src/components/SellerDashboard.vue'), 'utf8')

  // Verify 3 distinct angle slots in the template
  assert.match(content, /Side Profile/i, 'Must contain Side Profile slot')
  assert.match(content, /Front View/i, 'Must contain Front View slot')
  assert.match(content, /Back View/i, 'Must contain Back View slot')

  // Verify multi-file formData append or slot management
  assert.match(content, /image_side|image_front|image_back/, 'Must handle distinct angle keys for upload')

  // Verify quality guidance tips
  assert.match(content, /Tips for Best 3D Quality|Clean Background/i, 'Must provide 3D quality tips')
})
