import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const APP_PATH = path.resolve('src/App.vue')

test('Task 7: App.vue imports SellerDashboard component asynchronously', () => {
  const content = fs.readFileSync(APP_PATH, 'utf8')
  assert.match(
    content,
    /const\s+SellerDashboard\s*=\s*defineAsyncComponent\(\s*\(\)\s*=>\s*import\(['"]\.\/components\/SellerDashboard\.vue['"]\)\s*\)/,
    'App.vue must define SellerDashboard async component'
  )
})

test('Task 7: App.vue maintains sellerProfile reactive ref and syncs session', () => {
  const content = fs.readFileSync(APP_PATH, 'utf8')
  assert.match(content, /const\s+sellerProfile\s*=\s*ref\(null\)/, 'App.vue must define sellerProfile ref')
  assert.match(content, /sellerProfile\.value\s*=\s*sessionRes\.sellerProfile/, 'App.vue must set sellerProfile from session response')
  assert.match(content, /function\s+handleProfileUpdated/, 'App.vue must define handleProfileUpdated handler')
})

test('Task 7: App.vue handles seller and seller-register routes in route resolution and watch', () => {
  const content = fs.readFileSync(APP_PATH, 'utf8')

  // Route resolution
  assert.match(content, /view\.value\s*===\s*['"]seller-register['"]|target\s*===\s*['"]seller-register['"]/, 'Must handle seller-register route')
  assert.match(content, /target\s*===\s*['"]seller['"]/, 'Must handle seller route')
  assert.match(content, /view\.value\s*=\s*['"]seller['"]/, 'Must be able to set view to seller')

  // getInitialView
  assert.match(content, /['"]seller-register['"]/, 'getInitialView must support seller-register')

  // watch(view) route sync
  assert.match(content, /watch\(view,/, 'Must watch view to synchronize routes')
})

test('Task 7: App.vue login view redirects by role and links to seller registration', () => {
  const content = fs.readFileSync(APP_PATH, 'utf8')

  // Login redirects by role
  assert.match(content, /res\.user\.role\s*===\s*['"]seller['"]|currentUser\.value\.role\s*===\s*['"]seller['"]/, 'Must check seller role on login')
  assert.match(content, /goToSeller|#seller|view\.value\s*=\s*['"]seller['"]/, 'Must navigate to seller dashboard on seller login')

  // Link to register as seller
  assert.match(content, /Want to sell on KickCraft\?|Register as a seller/i, 'Must have link to seller registration in login view')
  assert.match(content, /seller-register/i, 'Link must navigate to seller-register')
})

test('Task 7: App.vue implements seller registration view with form and brutalist stamp', () => {
  const content = fs.readFileSync(APP_PATH, 'utf8')

  // Template container
  assert.match(content, /v-else-if="view\s*===\s*['"]seller-register['"]"/, 'Must render seller registration view')
  assert.match(content, /JOIN KICKCRAFT SELLER STUDIO/i, 'Must contain header JOIN KICKCRAFT SELLER STUDIO')

  // Form fields
  assert.match(content, /registerName|sellerName/i, 'Must have seller name field')
  assert.match(content, /registerEmail|sellerEmail/i, 'Must have seller email field')
  assert.match(content, /registerPassword|sellerPassword/i, 'Must have seller password field')
  assert.match(content, /registerConfirmPassword|sellerConfirmPassword/i, 'Must have seller confirm password field')
  assert.match(content, /storeName/i, 'Must have store name field')
  assert.match(content, /storeDescription/i, 'Must have store description field')

  // API call
  assert.match(content, /api\(\s*(?:SELLER_REGISTER_ENDPOINT|['"]auth\/register\.php['"])/, 'Must submit to seller registration endpoint')

  // Brutalist stamp
  assert.match(content, /\[\s*✓\s*APPLICATION SUBMITTED\s*·\s*UNDER REVIEW\s*\]/, 'Must render verification stamp on success')

  // Error alert banner
  assert.match(content, /role=["']alert["']/, 'Must render role="alert" banner for errors')
})

test('Task 7: App.vue renders SellerDashboard with props and emits', () => {
  const content = fs.readFileSync(APP_PATH, 'utf8')

  assert.match(content, /<SellerDashboard/i, 'Must mount SellerDashboard component')
  assert.match(content, /:current-user="currentUser"/, 'Must pass current-user prop')
  assert.match(content, /:seller-profile="sellerProfile"/, 'Must pass seller-profile prop')
  assert.match(content, /@logout="handleLogout"/, 'Must handle logout emit')
  assert.match(content, /@profile-updated="handleProfileUpdated"/, 'Must handle profile-updated emit')
})

test('Task 7: Header navigation adapts for seller and unauthenticated seller registration', () => {
  const content = fs.readFileSync(APP_PATH, 'utf8')

  // Sell on KickCraft link when not logged in
  assert.match(content, /Sell on KickCraft/i, 'Header must contain Sell on KickCraft link')

  // My Store link for seller
  assert.match(content, /My Store/i, 'Header must contain My Store link for seller')
  assert.match(content, /currentUser\??\.role\s*===\s*['"]seller['"]/, 'My Store must check for seller role')
})
