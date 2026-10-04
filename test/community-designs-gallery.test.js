import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const appSrc = fs.readFileSync('src/App.vue', 'utf8')
const adminSrc = fs.readFileSync('src/components/AdminPanel.vue', 'utf8')

describe('Community Designs & Gallery — Permanent Removal Verification', () => {
  it('App.vue does NOT contain Share to Community button in studio', () => {
    assert.ok(
      !appSrc.includes('Share to Community') && !appSrc.includes('share-to-community') && !appSrc.includes('submitDesign'),
      'Studio must NOT have a Share to Community button or submit action'
    )
  })

  it('App.vue does NOT have design submission modal or state', () => {
    assert.ok(!appSrc.includes('showDesignSubmitModal'), 'must NOT have showDesignSubmitModal ref')
    assert.ok(!appSrc.includes('designSubmitted'), 'must NOT have designSubmitted ref')
    assert.ok(!appSrc.includes('isSubmittingDesign'), 'must NOT have isSubmittingDesign ref')
  })

  it('App.vue does NOT route or resolve gallery view', () => {
    // Should not allow 'gallery' in resolveCurrentRoute or getInitialView
    assert.ok(!appSrc.includes("view.value = 'gallery'"), 'must NOT set view.value to gallery')
    assert.ok(!appSrc.includes("navigateTo('gallery')"), 'must NOT navigate to gallery')
    assert.ok(!appSrc.includes("goToGallery"), 'must NOT have goToGallery helper')
    assert.ok(!appSrc.includes("<main v-else-if=\"view === 'gallery'\""), 'must NOT have gallery main view container')
  })

  it('App.vue does NOT maintain communityDesigns state or loadCommunityDesigns', () => {
    assert.ok(!appSrc.includes('communityDesigns = ref('), 'must NOT have communityDesigns ref')
    assert.ok(!appSrc.includes('loadCommunityDesigns'), 'must NOT have loadCommunityDesigns method')
    assert.ok(!appSrc.includes('showDesignPreview'), 'must NOT have showDesignPreview modal')
    assert.ok(!appSrc.includes('previewDesign'), 'must NOT have previewDesign ref')
  })

  it('App.vue header and footer navigation do NOT include Gallery links', () => {
    const headerNav = appSrc.match(/<nav[^>]*aria-label="Main navigation"[\s\S]*?<\/nav>/)?.[0] || ''
    assert.ok(!headerNav.includes('Gallery') && !headerNav.includes('goToGallery'), 'Header nav must NOT have Gallery link')
    assert.ok(!headerNav.includes('#gallery'), 'Header nav must NOT have #gallery link')

    const mobileNav = appSrc.match(/<nav[^>]*aria-label=["']Mobile navigation["'][\s\S]*?<\/nav>/)?.[0] || ''
    assert.ok(!mobileNav.includes('Gallery'), 'Mobile nav must NOT have Gallery link')

    const footer = appSrc.match(/<footer[\s\S]*?<\/footer>/)?.[0] || ''
    assert.ok(!footer.includes('Community Gallery') && !footer.includes('goToGallery'), 'Footer must NOT have Community Gallery link')
  })

  it('AdminPanel does NOT have Community Designs moderation tab or adminSection', () => {
    const adminNav = adminSrc.match(/<div class="flex border-b border-\[#cfd2ce\][\s\S]*?<\/div>/)?.[0] || ''
    assert.ok(!adminNav.includes('Community Designs'), 'AdminPanel nav must NOT have Community Designs button')
    assert.ok(!adminNav.includes("adminSection = 'designs'"), 'AdminPanel must NOT switch to designs section')
  })

  it('AdminPanel does NOT have designs moderation view or reject modal', () => {
    assert.ok(!adminSrc.includes("adminSection === 'designs'"), 'AdminPanel must NOT have designs moderation section')
    assert.ok(!adminSrc.includes('showDesignRejectModal'), 'AdminPanel must NOT have showDesignRejectModal')
    assert.ok(!adminSrc.includes('loadAdminDesigns'), 'AdminPanel must NOT have loadAdminDesigns')
    assert.ok(!adminSrc.includes('reviewDesign'), 'AdminPanel must NOT have reviewDesign')
  })

  it('AdminPanel does NOT listen on designs broadcast channel or fetch designs in loadData', () => {
    assert.ok(!adminSrc.includes('kickcraft_designs_channel'), 'AdminPanel must NOT connect to kickcraft_designs_channel')
    assert.ok(!adminSrc.includes('designsChannel'), 'AdminPanel must NOT have designsChannel ref')
    assert.ok(!adminSrc.includes("api('designs/list.php"), 'AdminPanel loadData must NOT fetch designs/list.php')
  })

  it('App.vue and AdminPanel do NOT contain physical SQL DELETE statements', () => {
    const deletePattern = new RegExp(['DEL', 'ETE', '\\s+', 'FROM'].join(''), 'i')
    assert.ok(!deletePattern.test(appSrc), 'App.vue physical DELETE is forbidden')
    assert.ok(!deletePattern.test(adminSrc), 'AdminPanel physical DELETE is forbidden')
  })
})
