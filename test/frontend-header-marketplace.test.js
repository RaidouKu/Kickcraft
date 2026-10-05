import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const APP_PATH = path.resolve('src/App.vue')

test('Header navigation: App.vue does NOT contain separate Marketplace navigation link in main nav', () => {
  const content = fs.readFileSync(APP_PATH, 'utf8')
  const headerNav = content.match(/<nav[^>]*aria-label="Main navigation"[\s\S]*?<\/nav>/)?.[0] || ''
  assert.ok(headerNav, 'App.vue must contain main navigation <nav>')

  // Checks header navigation does NOT contain Marketplace link (unified into Shop)
  assert.doesNotMatch(headerNav, />\s*Marketplace\s*</, 'Header navigation must not contain separate "Marketplace" text')
  assert.doesNotMatch(headerNav, /href=["']#marketplace["']/, 'Header navigation must not have href="#marketplace"')
})

test('Header navigation: App.vue defines navigateTo helper and redirects marketplace route to Shop', () => {
  const content = fs.readFileSync(APP_PATH, 'utf8')
  assert.match(content, /function\s+navigateTo\s*\(/, 'App.vue must define navigateTo helper function')
  assert.match(content, /function\s+goToMarketplace\s*\(/, 'App.vue must define goToMarketplace helper function')
  assert.match(content, /originFilter\.value\s*=\s*['"]sellers['"]/, 'goToMarketplace must set sellers filter on unified Shop')
})

test('Header navigation: App.vue mobile navigation menu excludes separate Marketplace link', () => {
  const content = fs.readFileSync(APP_PATH, 'utf8')

  // Mobile menu state and toggle
  assert.match(content, /(?:isMobileMenuOpen|showMobileMenu|mobileMenuOpen)\s*=\s*ref\(/, 'App.vue must declare reactive ref for mobile menu state')
  assert.match(content, /aria-label=["'](?:Mobile navigation|mobile navigation|Toggle mobile menu|Toggle navigation)["']|data-mobile-menu/, 'App.vue must include accessible mobile navigation elements')

  // Mobile menu does not contain separate Marketplace link
  const mobileNav = content.match(/<nav[^>]*aria-label=["']Mobile navigation["'][\s\S]*?<\/nav>|<div[^>]*data-mobile-menu[\s\S]*?<\/div>/)?.[0] || content
  assert.doesNotMatch(mobileNav, /href=["']#marketplace["']/, 'Mobile navigation menu must not have separate Marketplace link')
})

test('Header navigation: Navigation order follows Catalog -> Track -> Auth (unified storefront)', () => {
  const content = fs.readFileSync(APP_PATH, 'utf8')
  const headerNav = content.match(/<nav[^>]*aria-label="Main navigation"[\s\S]*?<\/nav>/)?.[0] || ''
  assert.ok(headerNav, 'Header navigation <nav> must exist')

  const posCatalog = headerNav.search(/goToShop|navigateTo\(['"]shop['"]\)|href=["']#shop["']|Shop/i)
  const posStudio = headerNav.search(/goToStudio|navigateTo\(['"]studio['"]\)|href=["']#studio["']|Studio|Design studio/i)
  const posTrack = headerNav.search(/goToTrackReservation|navigateTo\(['"]track['"]\)|href=["']#track["']|Track/i)
  const posGallery = headerNav.search(/goToGallery|navigateTo\(['"]gallery['"]\)|href=["']#gallery["']|Gallery/i)
  const posMarketplace = headerNav.search(/>\s*Marketplace\s*</i)

  assert.ok(posCatalog > -1, 'Catalog/Shop must be in header nav')
  assert.ok(posTrack > -1, 'Track must be in header nav')
  assert.equal(posStudio, -1, 'Studio must NOT be in header nav')
  assert.equal(posGallery, -1, 'Gallery must NOT be in header nav')
  assert.equal(posMarketplace, -1, 'Marketplace must NOT be in header nav')

  assert.ok(posCatalog < posTrack, 'Catalog/Shop must be before Track')
})

test('Header navigation: Contains zero physical DELETE SQL statements', () => {
  const content = fs.readFileSync(APP_PATH, 'utf8')
  assert.doesNotMatch(content, /DELETE\s+FROM/i, 'App.vue must NOT contain physical SQL DELETE statements')
})
