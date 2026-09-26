import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const content = fs.readFileSync(path.resolve('src/App.vue'), 'utf8')

test('customer account routes and interface are removed', () => {
  assert.doesNotMatch(content, /auth\/register\.php|Create Customer Account|My Reservations|goToMyReservations/)
  assert.doesNotMatch(content, /view === ['"]register['"]|view === ['"]reservations['"]|role === ['"]customer['"]/)
  assert.doesNotMatch(content, /@click="goToLogin"|>Owner Login<|>Owner login</)
  assert.match(content, /Track Reservation/i)
})

test('guests track reservations with receipt and email', () => {
  assert.match(content, /reservations\/lookup\.php/)
  assert.match(content, /trackReceiptId/)
  assert.match(content, /trackEmail/)
})

test('tracking shows reservation progress, cancelled state, and reserved colors', () => {
  assert.match(content, /const\s+trackingSteps\s*=\s*\[[\s\S]*?'pending'[\s\S]*?'approved'[\s\S]*?'ready'[\s\S]*?'completed'/)
  assert.match(content, /trackingSteps\.findIndex\(step\s*=>\s*step\.status\s*===\s*trackedReservation\.value\?\.status\)/)
  assert.match(content, /aria-label="Reservation progress"/)
  assert.match(content, /:aria-current="index === trackingStepIndex \? 'step' : undefined"/)
  assert.match(content, /trackedReservation\.status === 'cancelled'[\s\S]*?Reservation cancelled/)
  assert.match(content, /Reserved colors[\s\S]*?trackedReservation\.partColors/)
})

test('guests can cancel pending reservations through the verified endpoint', () => {
  assert.match(content, /function\s+requestCancelTrackedReservation\s*\(/)
  assert.match(content, /reservations\/cancel\.php/)
  assert.match(content, /trackedReservation\.status === 'pending'/)
  assert.match(content, /Cancel reservation/i)
  assert.doesNotMatch(content, /getStoredOrders|setStoredOrders/)
})
