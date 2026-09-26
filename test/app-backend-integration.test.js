import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const ROOT_DIR = path.resolve(import.meta.dirname, '..')
const APP_VUE_PATH = path.join(ROOT_DIR, 'src', 'App.vue')

test('src/App.vue imports api from ./api.js and onMounted from vue', () => {
  assert.ok(fs.existsSync(APP_VUE_PATH), 'src/App.vue must exist')
  const content = fs.readFileSync(APP_VUE_PATH, 'utf8')
  assert.match(content, /import\s+{[^}]*onMounted[^}]*}\s+from\s+['"]vue['"]/, 'App.vue must import onMounted from vue')
  assert.match(content, /import\s+{[^}]*api[^}]*}\s+from\s+['"]\.\/api\.js['"]|import\s+api\s+from\s+['"]\.\/api\.js['"]/, 'App.vue must import api from ./api.js')
})

test('src/App.vue onMounted checks session via auth/session.php and populates currentUser', () => {
  const content = fs.readFileSync(APP_VUE_PATH, 'utf8')
  assert.match(content, /onMounted\s*\(\s*async/, 'onMounted should be registered as async')
  assert.match(content, /api\(\s*['"]auth\/session\.php['"]\s*\)/, 'onMounted must call api(auth/session.php)')
  assert.match(content, /currentUser\.value\s*=\s*(?:sessionRes|res)\.user/, 'onMounted must assign currentUser.value from session user')
})

test('src/App.vue onMounted loads catalog shoes via API', () => {
  const content = fs.readFileSync(APP_VUE_PATH, 'utf8')
  assert.match(content, /api\(\s*['"]shoes\/list\.php['"]\s*\)/, 'onMounted must call api(shoes/list.php)')
  assert.match(content, /adminShoes\.value\s*=\s*(?:shoesRes|res)\.shoes/, 'onMounted must assign adminShoes.value from API shoes')
  assert.doesNotMatch(content, /getStoredShoes\(\)/, 'catalog records must not use localStorage fallback')
})

test('src/App.vue handleLoginSubmit makes async POST to auth/login.php and manages auth state', () => {
  const content = fs.readFileSync(APP_VUE_PATH, 'utf8')
  assert.match(content, /async\s+function\s+handleLoginSubmit\s*\(/, 'handleLoginSubmit must be an async function')
  assert.match(content, /api\(\s*['"]auth\/login\.php['"]\s*,\s*\{[\s\S]*?method:\s*['"]POST['"][\s\S]*?body:\s*\{[\s\S]*?email:[\s\S]*?password:[\s\S]*?\}\s*\}\s*\)/, 'handleLoginSubmit must call api(auth/login.php, { method: POST, body: { email, password } })')
  assert.match(content, /loginError\.value\s*=/, 'handleLoginSubmit must set loginError on failure')
  assert.match(content, /currentUser\.value\s*=\s*(?:res|loginRes)\.user/, 'handleLoginSubmit must update currentUser.value with authenticated user')
})

test('src/App.vue exposes owner login only and no customer registration', () => {
  const content = fs.readFileSync(APP_VUE_PATH, 'utf8')
  assert.match(content, /Owner Portal/)
  assert.doesNotMatch(content, /auth\/register\.php|Create Customer Account|authRole/)
})

test('src/App.vue handleLogout makes async POST to auth/logout.php and resets user session', () => {
  const content = fs.readFileSync(APP_VUE_PATH, 'utf8')
  assert.match(content, /async\s+function\s+handleLogout\s*\(/, 'handleLogout must be an async function')
  assert.match(content, /api\(\s*['"]auth\/logout\.php['"]\s*,\s*\{\s*method:\s*['"]POST['"]\s*\}\s*\)/, 'handleLogout must call api(auth/logout.php, { method: POST })')
  assert.match(content, /currentUser\.value\s*=\s*null/, 'handleLogout must clear currentUser')
  assert.match(content, /goToShop\(\)/, 'handleLogout must redirect to shop')
})

test('src/App.vue submitReservation makes async POST to reservations/create.php with full payload and error handling', () => {
  const content = fs.readFileSync(APP_VUE_PATH, 'utf8')
  assert.match(content, /async\s+function\s+submitReservation\s*\(/, 'submitReservation must be an async function')
  assert.match(content, /const\s+isSubmitting\s*=\s*ref\(false\)/, 'App.vue must define isSubmitting ref')
  assert.match(content, /const\s+reservationError\s*=\s*ref\(['"]['"]\)/, 'App.vue must define reservationError ref')
  assert.match(content, /api\(\s*['"]reservations\/create\.php['"]\s*,\s*\{[\s\S]*?method:\s*['"]POST['"][\s\S]*?body:\s*\{[\s\S]*?customerName:[\s\S]*?email:[\s\S]*?pickupDate:[\s\S]*?shoeId:[\s\S]*?size:[\s\S]*?partColors:[\s\S]*?charmId:[\s\S]*?charmLabel:[\s\S]*?\}\s*\}\s*\)/, 'submitReservation must call api(reservations/create.php) with expected payload')
  assert.match(content, /reservationReceipt\.value\s*=\s*(?:res|reservationRes)\.reservation/, 'submitReservation must set reservationReceipt from response')
  assert.match(content, /reserved\.value\s*=\s*true/, 'submitReservation must set reserved to true on success')
  assert.match(content, /reservationError\.value\s*=\s*err\.message/, 'submitReservation must capture reservationError on error')
})

test('src/App.vue reservation dialog displays reservationError and binds isSubmitting', () => {
  const content = fs.readFileSync(APP_VUE_PATH, 'utf8')
  assert.match(content, /id="reservation-dialog"[\s\S]*?reservationError[\s\S]*?<\/dialog>/, 'Reservation dialog must include reservationError alert')
  assert.match(content, /:disabled=["']isSubmitting["']/, 'Reservation dialog button must bind :disabled="isSubmitting"')
})
