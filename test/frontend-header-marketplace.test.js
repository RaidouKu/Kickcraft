import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const APP_PATH = path.resolve('src/App.vue')

test('Header navigation: App.vue contains Marketplace navigation link pointing to #marketplace', () => {
  const content = fs.readFileSync(APP_PATH, 'utf8')
  const headerNav = content.match(/<nav[^>]*aria-label="Main navigation"[\s\S]*?<\/nav>/)?.[0] || ''
  assert.ok(headerNav, 'App.vue must contain main navigation <nav>')

  // Checks header navigation contains Marketplace link
  assert.match(headerNav, /Marketplace/, 'Header navigation must contain "Marketplace" text')
  // Checks link points to #marketplace
  assert.match(headerNav, /href=["']#marketplace["']/, 'Marketplace link in header must have href="#marketplace"')
  // Checks click handler navigates to marketplace
  assert.match(headerNav, /navigateTo\(['"]marketplace['"]\)|goToMarketplace/, 'Marketplace link must navigate to marketplace')
})

test('Header navigation: App.vue defines navigateTo helper and supports marketplace route', () => {
  const content = fs.readFileSync(APP_PATH, 'utf8')
  assert.match(content, /function\s+navigateTo\s*\(/, 'App.vue must define navigateTo helper function')
  assert.match(content, /function\s+goToMarketplace\s*\(/, 'App.vue must define goToMarketplace helper function')
})

test('Header navigation: Marketplace link applies active styling when view === "marketplace"', () => {
  const content = fs.readFileSync(APP_PATH, 'utf8')
  const headerNav = content.match(/<nav[^>]*aria-label="Main navigation"[\s\S]*?<\/nav>/)?.[0] || ''

  // Checks active class / styling is applied when view === 'marketplace'
  assert.match(
    headerNav,
    /view\s*===\s*['"]marketplace['"]\s*\?\s*['"][^'"]*(?:text-\[#b94d27\]|border-\[#b94d27\])[^'"]*['"]/,
    'Marketplace link must apply active styling (e.g. text-[#b94d27] or border-[#b94d27]) when view === "marketplace"'
  )
})

test('Header navigation: App.vue includes mobile navigation menu with Marketplace link', () => {
  const content = fs.readFileSync(APP_PATH, 'utf8')

  // Mobile menu state and toggle
  assert.match(content, /(?:isMobileMenuOpen|showMobileMenu|mobileMenuOpen)\s*=\s*ref\(/, 'App.vue must declare reactive ref for mobile menu state')
  assert.match(content, /aria-label=["'](?:Mobile navigation|mobile navigation|Toggle mobile menu|Toggle navigation)["']|data-mobile-menu/, 'App.vue must include accessible mobile navigation elements')

  // Mobile menu contains Marketplace link pointing to #marketplace
  const mobileNav = content.match(/<nav[^>]*aria-label=["']Mobile navigation["'][\s\S]*?<\/nav>|<div[^>]*data-mobile-menu[\s\S]*?<\/div>/)?.[0] || content
  assert.match(mobileNav, /href=["']#marketplace["']|goToMarketplace|navigateTo\(['"]marketplace['"]\)/, 'Mobile navigation menu must include Marketplace navigation')
  assert.match(mobileNav, /Marketplace/, 'Mobile navigation menu must contain "Marketplace" text')
})

test('Header navigation: Navigation order follows Catalog -> Studio -> Track -> Gallery -> Marketplace -> Auth', () => {
  const content = fs.readFileSync(APP_PATH, 'utf8')
  const headerNav = content.match(/<nav[^>]*aria-label="Main navigation"[\s\S]*?<\/nav>/)?.[0] || ''
  assert.ok(headerNav, 'Header navigation <nav> must exist')

  const posCatalog = headerNav.search(/goToShop|navigateTo\(['"]shop['"]\)|href=["']#shop["']|Shop/i)
  const posStudio = headerNav.search(/goToStudio|navigateTo\(['"]studio['"]\)|href=["']#studio["']|Studio|Design studio/i)
  const posTrack = headerNav.search(/goToTrackReservation|navigateTo\(['"]track['"]\)|href=["']#track["']|Track/i)
  const posGallery = headerNav.search(/goToGallery|navigateTo\(['"]gallery['"]\)|href=["']#gallery["']|Gallery/i)
  const posMarketplace = headerNav.search(/href=["']#marketplace["']|goToMarketplace|navigateTo\(['"]marketplace['"]\)|Marketplace/i)

  assert.ok(posCatalog > -1, 'Catalog/Shop must be in header nav')
  assert.ok(posTrack > -1, 'Track must be in header nav')
  assert.ok(posGallery > -1, 'Gallery must be in header nav')
  assert.ok(posMarketplace > -1, 'Marketplace must be in header nav')

  assert.ok(posCatalog < posTrack, 'Catalog/Shop must be before Track')
  assert.ok(posTrack < posGallery, 'Track must be before Gallery')
  assert.ok(posGallery < posMarketplace, 'Gallery must be before Marketplace')

  // If Studio is explicitly present in headerNav before Track
  if (posStudio > -1) {
    assert.ok(posCatalog <= posStudio, 'Catalog must precede or equal Studio position')
    assert.ok(posStudio < posTrack, 'Studio must precede Track')
  }
})

test('Header navigation: Contains zero physical DELETE SQL statements', () => {
  const content = fs.readFileSync(APP_PATH, 'utf8')
  assert.doesNotMatch(content, /DELETE\s+FROM/i, 'App.vue must NOT contain physical SQL DELETE statements')
})
