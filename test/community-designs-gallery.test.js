import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const appSrc = fs.readFileSync('src/App.vue', 'utf8')

describe('Community Designs — Submission UI', () => {
  it('App.vue contains Share to Community button in studio', () => {
    assert.ok(
      appSrc.includes('Share to Community') || appSrc.includes('share-to-community') || appSrc.includes('shareDesign'),
      'Studio must have a Share to Community button or action'
    )
  })

  it('App.vue has design submission modal with required fields', () => {
    assert.ok(appSrc.includes('designName') || appSrc.includes('design-name'), 'must have designName field')
    assert.ok(appSrc.includes('showDesignSubmitModal') || appSrc.includes('show-design-submit-modal'), 'must have modal toggle state')
  })

  it('App.vue has submitDesign function that calls designs/submit.php', () => {
    assert.ok(appSrc.includes('submitDesign'), 'must have submitDesign function')
    assert.ok(appSrc.includes('designs/submit.php'), 'must call designs/submit.php endpoint')
  })

  it('submission requires at least one customized part', () => {
    assert.ok(
      appSrc.includes('customizedCount') || appSrc.includes('partColors'),
      'must check that at least one part has been customized before submitting'
    )
  })

  it('shows success confirmation with design ID after submission', () => {
    assert.ok(appSrc.includes('designSubmitted') || appSrc.includes('designReceipt'), 'must show success state after submission')
    assert.ok(appSrc.includes('KCD-'), 'must display KCD design ID format')
  })

  it('broadcasts NEW_DESIGN event via BroadcastChannel', () => {
    assert.ok(appSrc.includes('NEW_DESIGN'), 'must broadcast NEW_DESIGN event for admin alerts')
  })
})

describe('Community Designs — Gallery View', () => {
  it('App.vue supports gallery view route', () => {
    assert.ok(appSrc.includes("'gallery'") || appSrc.includes('"gallery"'), 'must support gallery as a view value')
    assert.ok(appSrc.includes('#gallery') || appSrc.includes("=== 'gallery'"), 'must support #gallery hash route')
  })

  it('App.vue has communityDesigns reactive state', () => {
    assert.ok(appSrc.includes('communityDesigns'), 'must have communityDesigns ref')
  })

  it('App.vue has loadCommunityDesigns function calling designs/list.php', () => {
    assert.ok(appSrc.includes('loadCommunityDesigns'), 'must have loadCommunityDesigns function')
    assert.ok(appSrc.includes('designs/list.php'), 'must call designs/list.php endpoint')
  })

  it('App.vue has useDesign function to load design into studio', () => {
    assert.ok(appSrc.includes('useDesign'), 'must have useDesign function')
  })

  it('gallery view renders design cards with color swatches', () => {
    assert.ok(appSrc.includes('designerName') || appSrc.includes('designer-name'), 'must display designer name')
    assert.ok(appSrc.includes('designName') || appSrc.includes('design-name'), 'must display design name')
  })

  it('gallery view has featured designs section', () => {
    assert.ok(appSrc.includes('featured') && appSrc.includes('gallery'), 'must have featured designs handling')
  })

  it('gallery view has empty state', () => {
    assert.ok(
      appSrc.includes('No community designs') || appSrc.includes('no designs') || appSrc.includes('Be the first'),
      'must show empty state when no designs exist'
    )
  })

  it('gallery view has Use This Design button', () => {
    assert.ok(
      appSrc.includes('Use This Design') || appSrc.includes('useDesign'),
      'must have Use This Design action'
    )
  })
})
