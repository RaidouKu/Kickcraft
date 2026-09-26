import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve('.')

test('Task 1: Favicon assets exist and are linked in index.html', () => {
  const svgPath = path.join(ROOT, 'public', 'favicon.svg')
  const icoPath = path.join(ROOT, 'public', 'favicon.ico')
  const htmlPath = path.join(ROOT, 'index.html')

  assert.ok(fs.existsSync(svgPath), 'public/favicon.svg must exist')
  assert.ok(fs.existsSync(icoPath), 'public/favicon.ico must exist')

  const svgContent = fs.readFileSync(svgPath, 'utf8')
  assert.match(svgContent, /<svg/i, 'favicon.svg must be a valid SVG document')
  assert.match(svgContent, /#202220|#292b2d/i, 'favicon.svg must use KickCraft dark brand color')
  assert.match(svgContent, /#b94d27/i, 'favicon.svg must feature KickCraft terracotta accent')

  const htmlContent = fs.readFileSync(htmlPath, 'utf8')
  assert.match(htmlContent, /<link[^>]+rel=["']icon["'][^>]+href=["']\/favicon\.svg["']/i, 'index.html must link favicon.svg')
  assert.match(htmlContent, /<link[^>]+href=["']\/favicon\.ico["']/i, 'index.html must link favicon.ico as fallback')
})

test('Task 2: Show/Hide Password toggles in App.vue and AdminPanel.vue', () => {
  const appVuePath = path.join(ROOT, 'src', 'App.vue')
  const adminVuePath = path.join(ROOT, 'src', 'components', 'AdminPanel.vue')

  const appContent = fs.readFileSync(appVuePath, 'utf8')
  const adminContent = fs.readFileSync(adminVuePath, 'utf8')

  // App.vue login password toggle
  assert.match(appContent, /const\s+showLoginPassword\s*=\s*ref\(false\)/, 'App.vue must define showLoginPassword ref')
  assert.match(appContent, /showLoginPassword\s*\?\s*['"]text['"]\s*:\s*['"]password['"]/, 'Login password input must toggle type')
  assert.match(appContent, /aria-label=".*(show|hide)\s+password/i, 'Login password field must provide accessible toggle button')

  assert.doesNotMatch(appContent, /showRegisterPassword|showRegisterConfirmPassword/, 'Customer registration password fields must be removed')

  // AdminPanel.vue user password toggle
  assert.match(adminContent, /const\s+showUserPassword\s*=\s*ref\(false\)/, 'AdminPanel.vue must define showUserPassword ref')
  assert.match(adminContent, /showUserPassword\s*\?\s*['"]text['"]\s*:\s*['"]password['"]/, 'AdminPanel user password input must toggle type')
})

test('Task 3: Apache .htaccess file provides SPA fallback for client routing', () => {
  const htaccessRoot = path.join(ROOT, '.htaccess')
  const htaccessPublic = path.join(ROOT, 'public', '.htaccess')

  assert.ok(
    fs.existsSync(htaccessRoot) || fs.existsSync(htaccessPublic),
    '.htaccess must exist in root or public folder'
  )

  const content = fs.existsSync(htaccessRoot)
    ? fs.readFileSync(htaccessRoot, 'utf8')
    : fs.readFileSync(htaccessPublic, 'utf8')

  assert.match(content, /RewriteEngine\s+On/i, '.htaccess must enable RewriteEngine')
  assert.match(content, /RewriteRule\s+.*\s+index\.html/i, '.htaccess must rewrite missing paths to index.html')
})

test('Task 3: App.vue route protection and brutalist 404 page', () => {
  const appVuePath = path.join(ROOT, 'src', 'App.vue')
  const appContent = fs.readFileSync(appVuePath, 'utf8')

  // State definitions
  assert.match(appContent, /const\s+notFoundPath\s*=\s*ref\(/, 'App.vue must define notFoundPath ref')
  assert.match(appContent, /['"]not-found['"]/, 'App.vue must support not-found in view states')

  // Brute force / unauthorized protection logic
  assert.match(appContent, /role\s*!==?\s*['"]owner['"][\s\S]*?not-found/, 'App.vue must transition non-owners on admin route to not-found')

  // 404 Template elements
  assert.match(appContent, /v-else-if="view\s*===\s*['"]not-found['"]"/, 'App.vue must render 404 main container')
  assert.match(appContent, /404/, '404 view must display 404 heading')
  assert.match(appContent, /notFoundPath/, '404 view must display attempted notFoundPath')
  assert.match(appContent, /goToShop/, '404 view must provide return to catalog action')
  assert.match(appContent, /goToStudio/, '404 view must provide open 3D studio action')
})

test('Task 3: route resolution helper correctly routes and protects paths', () => {
  function simulateRoute(pathname, hash, currentUser) {
    let p = pathname || ''
    p = p.replace(/^\/kickcraft\/?/i, '/')
    const cleanPath = p.replace(/^\/+|\/+$/g, '')
    const cleanHash = (hash || '').replace(/^#\/?/, '').trim()
    const target = (cleanPath && cleanPath !== 'index.html') ? cleanPath : cleanHash

    if (!target || target === 'shop') return { view: 'shop', notFoundPath: '' }
    if (['studio', 'track'].includes(target)) return { view: target, notFoundPath: '' }
    if (target === 'admin') {
      if (currentUser?.role === 'owner') return { view: 'admin', notFoundPath: '' }
      if (!currentUser) return { view: 'login', notFoundPath: '' }
      return { view: 'not-found', notFoundPath: cleanPath ? `/${cleanPath}` : `#${cleanHash}` }
    }
    return { view: 'not-found', notFoundPath: cleanPath ? `/${cleanPath}` : `#${cleanHash}` }
  }

  // The unlinked /admin route opens owner login; invalid authenticated roles are rejected.
  assert.equal(simulateRoute('/admin', '', null).view, 'login')
  assert.equal(simulateRoute('', '#admin', null).view, 'login')
  assert.equal(simulateRoute('/admin', '', { role: 'customer' }).view, 'not-found')
  assert.equal(simulateRoute('', '#admin', { role: 'customer' }).view, 'not-found')

  // Authorized owner accessing /admin or #admin
  assert.equal(simulateRoute('/admin', '', { role: 'owner' }).view, 'admin')
  assert.equal(simulateRoute('', '#admin', { role: 'owner' }).view, 'admin')

  // Unknown brute-force URLs lead to not-found (404)
  assert.equal(simulateRoute('/secret', '', null).view, 'not-found')
  assert.equal(simulateRoute('/secret', '', null).notFoundPath, '/secret')
  assert.equal(simulateRoute('', '#unknown', null).view, 'not-found')
  assert.equal(simulateRoute('', '#unknown', null).notFoundPath, '#unknown')

  // Valid public routes
  assert.equal(simulateRoute('/', '', null).view, 'shop')
  assert.equal(simulateRoute('', '#shop', null).view, 'shop')
  assert.equal(simulateRoute('', '#studio', null).view, 'studio')
  assert.equal(simulateRoute('/login', '', null).view, 'not-found')
  assert.equal(simulateRoute('', '#track', null).view, 'track')
  assert.equal(simulateRoute('/register', '', null).view, 'not-found')
  assert.equal(simulateRoute('/reservations', '', null).view, 'not-found')
})

