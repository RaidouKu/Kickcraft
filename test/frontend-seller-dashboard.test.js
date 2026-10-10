import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const COMPONENT_PATH = path.resolve('src/components/SellerDashboard.vue')

test('SellerDashboard component file exists and defines props and emits', () => {
  assert.ok(fs.existsSync(COMPONENT_PATH), 'SellerDashboard.vue must exist')
  const content = fs.readFileSync(COMPONENT_PATH, 'utf8')

  assert.match(content, /<script setup>/, 'Must use Vue 3 <script setup>')
  assert.match(content, /defineProps/, 'Must define props')
  assert.match(content, /currentUser/, 'Must accept currentUser prop')
  assert.match(content, /sellerProfile/, 'Must accept sellerProfile prop')
  assert.match(content, /defineEmits/, 'Must define emits')
  assert.match(content, /['"]logout['"]/, 'Must emit logout event')
})

test('SellerDashboard renders Pending state correctly', () => {
  assert.ok(fs.existsSync(COMPONENT_PATH), 'SellerDashboard.vue must exist')
  const content = fs.readFileSync(COMPONENT_PATH, 'utf8')

  assert.match(content, /status\s*===\s*['"]pending['"]/, 'Must conditionally check for pending status')
  assert.match(content, /Application Under Review/i, 'Must display Application Under Review title')
  assert.match(content, /reviewed by our team/i, 'Must include application review explanation')
  assert.match(content, /storeName|store_name/i, 'Must display store name in pending state')
  assert.match(content, /createdAt|created_at|Applied/i, 'Must display applied date in pending info card')
  assert.match(content, /logout|Sign Out|Log Out/i, 'Must provide logout button in pending state')
})

test('SellerDashboard renders Rejected state with admin notes and support contact', () => {
  assert.ok(fs.existsSync(COMPONENT_PATH), 'SellerDashboard.vue must exist')
  const content = fs.readFileSync(COMPONENT_PATH, 'utf8')

  assert.match(content, /status\s*===\s*['"]rejected['"]/, 'Must conditionally check for rejected status')
  assert.match(content, /Application Not Approved/i, 'Must display Application Not Approved title')
  assert.match(content, /adminNotes|admin_notes/i, 'Must display reviewer notes/feedback if available')
  assert.match(content, /admin@kickcraft\.local/, 'Must include support email admin@kickcraft.local')
  assert.match(content, /logout|Sign Out|Log Out/i, 'Must provide logout button in rejected state')
})

test('SellerDashboard renders Suspended state with warning and notes', () => {
  assert.ok(fs.existsSync(COMPONENT_PATH), 'SellerDashboard.vue must exist')
  const content = fs.readFileSync(COMPONENT_PATH, 'utf8')

  assert.match(content, /status\s*===\s*['"]suspended['"]/, 'Must conditionally check for suspended status')
  assert.match(content, /Account Suspended/i, 'Must display Account Suspended title')
  assert.match(content, /adminNotes|admin_notes/i, 'Must display admin notes if available')
  assert.match(content, /logout|Sign Out|Log Out/i, 'Must provide logout button in suspended state')
})

test('SellerDashboard renders Approved state header and tabs', () => {
  assert.ok(fs.existsSync(COMPONENT_PATH), 'SellerDashboard.vue must exist')
  const content = fs.readFileSync(COMPONENT_PATH, 'utf8')

  assert.match(content, /status\s*===\s*['"]approved['"]/, 'Must conditionally check for approved status')
  assert.match(content, /KICKCRAFT SELLER STUDIO/i, 'Must have header KICKCRAFT SELLER STUDIO')
  assert.match(content, /My Products\s*\(0\)/i, 'Must include My Products (0) tab')
  assert.match(content, /My Orders\s*\(0\)/i, 'Must include My Orders (0) tab')
  assert.match(content, /Store Settings/i, 'Must include Store Settings tab')
})

test('SellerDashboard renders My Products tab empty state with action buttons', () => {
  assert.ok(fs.existsSync(COMPONENT_PATH), 'SellerDashboard.vue must exist')
  const content = fs.readFileSync(COMPONENT_PATH, 'utf8')

  assert.match(content, /You haven't listed any products yet/i, 'Must have My Products empty state text')
  assert.match(content, /\+\s*Create New Product/i, 'Must have + Create New Product button')
  assert.match(content, /Start Tutorial/i, 'Must have Start Tutorial button')
})

test('SellerDashboard renders My Orders tab empty state', () => {
  assert.ok(fs.existsSync(COMPONENT_PATH), 'SellerDashboard.vue must exist')
  const content = fs.readFileSync(COMPONENT_PATH, 'utf8')

  assert.match(content, /No incoming orders yet/i, 'Must have My Orders empty state text')
})

test('SellerDashboard implements Store Settings form calling sellers/update-profile.php', () => {
  assert.ok(fs.existsSync(COMPONENT_PATH), 'SellerDashboard.vue must exist')
  const content = fs.readFileSync(COMPONENT_PATH, 'utf8')

  assert.match(content, /sellers\/update-profile\.php/, 'Must call sellers/update-profile.php')
  assert.match(content, /Save Changes/i, 'Must have Save Changes button')
  assert.match(content, /storeName|store_name/i, 'Must bind Store Name field')
  assert.match(content, /storeDescription|store_description/i, 'Must bind Store Description field')
})

test('SellerDashboard adheres to KickCraft brutalist aesthetic', () => {
  assert.ok(fs.existsSync(COMPONENT_PATH), 'SellerDashboard.vue must exist')
  const content = fs.readFileSync(COMPONENT_PATH, 'utf8')

  assert.match(content, /#b94d27/, 'Must use KickCraft terracotta accent color #b94d27')
  assert.match(content, /border-stone-900|border-black|border-\[#202220\]|border-\[#cfd2ce\]/, 'Must use solid brutalist borders')
  assert.match(content, /font-mono|font-display/, 'Must use KickCraft typography classes')
})

test('SellerDashboard integrates SellerTutorialHub component and Tutorials tab', () => {
  assert.ok(fs.existsSync(COMPONENT_PATH), 'SellerDashboard.vue must exist')
  const content = fs.readFileSync(COMPONENT_PATH, 'utf8')

  assert.match(content, /import\s+SellerTutorialHub\s+from\s+['"]\.\/SellerTutorialHub\.vue['"]/, 'Must import SellerTutorialHub')
  assert.match(content, /Tutorials &amp; Guides|Tutorials & Guides/i, 'Must include Tutorials & Guides tab in navigation')
  assert.match(content, /<SellerTutorialHub/, 'Must mount SellerTutorialHub component')
  assert.match(content, /@select-method=/, 'Must listen to @select-method emit')
  assert.match(content, /@go-to-tab=/, 'Must listen to @go-to-tab emit')
  assert.match(content, /@start-walkthrough=/, 'Must listen to @start-walkthrough emit')
})

