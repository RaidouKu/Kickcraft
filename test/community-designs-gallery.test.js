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

const adminSrc = fs.readFileSync('src/components/AdminPanel.vue', 'utf8')

describe('Community Designs — Admin Moderation', () => {
  it('AdminPanel has designs tab', () => {
    assert.ok(
      adminSrc.includes("'designs'") || adminSrc.includes('"designs"'),
      'AdminPanel must have designs as an adminSection value'
    )
    assert.ok(
      adminSrc.includes('Community Designs') || adminSrc.includes('community-designs'),
      'AdminPanel must have Community Designs tab label'
    )
  })

  it('AdminPanel fetches all designs for admin moderation', () => {
    assert.ok(adminSrc.includes('designs/list.php'), 'must call designs/list.php')
    assert.ok(adminSrc.includes('include_all'), 'must pass include_all for admin view')
  })

  it('AdminPanel has status filter tabs for designs', () => {
    assert.ok(adminSrc.includes('designStatusFilter') || adminSrc.includes('design-status-filter'), 'must have design status filter')
    assert.ok(adminSrc.includes('pending'), 'must filter by pending')
    assert.ok(adminSrc.includes('approved'), 'must filter by approved')
    assert.ok(adminSrc.includes('rejected'), 'must filter by rejected')
    assert.ok(adminSrc.includes('featured'), 'must filter by featured')
  })

  it('AdminPanel calls designs/review.php for status updates', () => {
    assert.ok(adminSrc.includes('designs/review.php'), 'must call designs/review.php')
  })

  it('AdminPanel renders design cards with color swatches in moderation view', () => {
    assert.ok(adminSrc.includes('partColors') || adminSrc.includes('part_colors'), 'must render part color swatches')
    assert.ok(adminSrc.includes('designerName') || adminSrc.includes('designer_name'), 'must show designer name')
  })

  it('AdminPanel has approve, reject, and feature actions', () => {
    assert.ok(adminSrc.includes('Approve') || adminSrc.includes('approve'), 'must have approve action')
    assert.ok(adminSrc.includes('Reject') || adminSrc.includes('reject'), 'must have reject action')
    assert.ok(adminSrc.includes('Feature') || adminSrc.includes('feature'), 'must have feature action')
  })

  it('AdminPanel listens for NEW_DESIGN BroadcastChannel events', () => {
    assert.ok(adminSrc.includes('kickcraft_designs_channel') || adminSrc.includes('NEW_DESIGN'), 'must listen for NEW_DESIGN broadcasts')
  })

  it('AdminPanel does NOT contain DELETE FROM', () => {
    assert.ok(!adminSrc.match(/DELETE\s+FROM/i), 'physical DELETE FROM is forbidden')
  })
})

describe('Community Designs — Navigation & Integration', () => {
  it('App.vue header navigation includes Gallery link', () => {
    assert.ok(
      appSrc.includes('Gallery') || appSrc.includes('Community'),
      'Header must include a Gallery or Community navigation link'
    )
    assert.ok(
      appSrc.includes('goToGallery') || (appSrc.includes("view = 'gallery'") || appSrc.includes("view.value = 'gallery'")),
      'Gallery link must navigate to gallery view'
    )
  })

  it('App.vue loads community designs when switching to gallery view', () => {
    assert.ok(
      appSrc.includes('loadCommunityDesigns'),
      'must call loadCommunityDesigns when entering gallery view'
    )
  })

  it('App.vue has design preview modal', () => {
    assert.ok(appSrc.includes('showDesignPreview') || appSrc.includes('previewDesign'), 'must have design preview modal state')
  })

  it('App.vue design preview has Use This Design action', () => {
    assert.ok(appSrc.includes('Use This Design'), 'preview modal must have Use This Design button')
  })

  it('App.vue header navigation positions Gallery link after Track reservation', () => {
    const headerNav = appSrc.match(/<nav[\s\S]*?<\/nav>/)?.[0] || ''
    const navTrack = headerNav.indexOf('goToTrackReservation')
    const navGallery = headerNav.indexOf('goToGallery')
    assert.ok(navTrack > -1 && navGallery > -1, 'both links must be in <nav>')
    assert.ok(navGallery > navTrack, 'Gallery link must be positioned after Track Reservation link')
  })

  it('App.vue design preview modal supports backdrop dismissal and escape key handling', () => {
    assert.ok(appSrc.includes('closeDesignPreview'), 'must have closeDesignPreview helper')
    assert.ok(appSrc.includes('click.self="closeDesignPreview"'), 'must support backdrop click dismissal')
    assert.ok(appSrc.includes('Escape') && appSrc.includes('showDesignPreview'), 'must handle Escape key to close modal')
  })

  it('App.vue design preview modal renders zone-by-zone colorway breakdown and charm info', () => {
    assert.ok(appSrc.includes('Zone-by-Zone') || appSrc.includes('Colorway Breakdown'), 'must have zone-by-zone breakdown header')
    assert.ok(appSrc.includes('normalizeColorInfo'), 'must normalize color info for preview')
    assert.ok(appSrc.includes('Charm'), 'must display charm info')
  })
})


