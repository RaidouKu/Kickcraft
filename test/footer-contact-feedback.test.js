import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const APP_PATH = path.resolve('src/App.vue')

test('Footer removes Silhouettes and Account & Portal columns and replaces them with Contact Numbers and Feedback', () => {
  assert.ok(fs.existsSync(APP_PATH), 'src/App.vue must exist')
  const content = fs.readFileSync(APP_PATH, 'utf8')

  // Extract footer
  const footerMatch = content.match(/<footer[\s\S]*?<\/footer>/)
  assert.ok(footerMatch, 'src/App.vue must contain a <footer> element')
  const footerContent = footerMatch[0]

  // 1. Must NOT contain Silhouettes column heading or list
  assert.doesNotMatch(
    footerContent,
    /<h3[^>]*>Silhouettes<\/h3>/i,
    'Footer must not contain "Silhouettes" column heading'
  )
  assert.doesNotMatch(
    footerContent,
    /KickCraft Hoop/i,
    'Footer must not contain "KickCraft Hoop"'
  )
  assert.doesNotMatch(
    footerContent,
    /KickCraft Stride/i,
    'Footer must not contain "KickCraft Stride"'
  )
  assert.doesNotMatch(
    footerContent,
    /KickCraft Luxe/i,
    'Footer must not contain "KickCraft Luxe"'
  )

  // 2. Must NOT contain Account & Portal column heading
  assert.doesNotMatch(
    footerContent,
    /<h3[^>]*>Account\s*(&amp;|&)\s*Portal<\/h3>/i,
    'Footer must not contain "Account & Portal" column heading'
  )

  // 3. Must contain Contact Numbers column
  assert.match(
    footerContent,
    /Contact Numbers/i,
    'Footer must contain "Contact Numbers" heading'
  )
  assert.match(
    footerContent,
    /\(02\)\s*8888-5425/,
    'Footer must display hotline (02) 8888-5425'
  )
  assert.match(
    footerContent,
    /\+63\s*917\s*123\s*4567/,
    'Footer must display mobile +63 917 123 4567'
  )

  // 4. Must contain Feedback column and modal trigger
  assert.match(
    footerContent,
    /Feedback/i,
    'Footer must contain "Feedback" heading'
  )
  assert.match(
    footerContent,
    /feedback@kickcraft\.local/i,
    'Footer must contain feedback email'
  )
  assert.match(
    footerContent,
    /Send Quick Feedback/i,
    'Footer must include a "Send Quick Feedback" button'
  )

  // 5. Reservation starts from the studio, not from a context-free footer shortcut
  assert.doesNotMatch(
    footerContent,
    /@click="openReservation"/,
    'Footer must not bypass the design workflow'
  )
})

test('Feedback modal is defined and interactive in src/App.vue', () => {
  const content = fs.readFileSync(APP_PATH, 'utf8')

  // Script setup must define feedback state/handlers
  assert.match(content, /showFeedbackModal\s*=\s*ref\(/, 'Must define showFeedbackModal ref')
  assert.match(content, /feedbackForm\s*=\s*ref\(/, 'Must define feedbackForm ref')
  assert.match(content, /handleFeedbackSubmit/, 'Must define handleFeedbackSubmit function')

  // Template must render feedback modal dialog / backdrop
  assert.match(content, /v-if="showFeedbackModal"/, 'Template must render feedback modal when showFeedbackModal is true')
})
