import test from 'node:test'
import assert from 'node:assert/strict'
import { CATALOG, CATEGORIES, filterCatalog, prioritizeLiveCatalog } from '../src/customization.js'

test('defines all 6 required categories', () => {
  assert.deepEqual(CATEGORIES.map(c => c.id), [
    'all',
    'kickcraft',
    'fashion',
    'sneakers',
    'basketball',
    'running',
  ])
  assert.equal(CATEGORIES.length, 6)
  assert.equal(CATEGORIES[0].label, 'All')
})

test('defines catalog with 9 shoes and correct schema', () => {
  assert.equal(CATALOG.length, 9)
  for (const card of CATALOG) {
    assert.ok(card.id, 'card must have id')
    assert.ok(card.name, 'card must have name')
    assert.ok(card.subtitle, 'card must have subtitle')
    assert.ok(card.price, 'card must have price')
    assert.ok(Array.isArray(card.categories), 'categories must be array')
    assert.ok(card.status === 'live' || card.status === 'soon', 'status must be live or soon')
  }

  const liveShoes = CATALOG.filter(c => c.status === 'live')
  assert.equal(liveShoes.length, 3)
  assert.deepEqual(liveShoes.map(c => c.id), ['kickcraft-one', 'nike-air-max', 'nike-dunk'])

  const soonShoes = CATALOG.filter(c => c.status === 'soon')
  assert.equal(soonShoes.length, 6)
})

test('filters catalog by category correctly', () => {
  const all = filterCatalog(CATALOG, '', 'all')
  assert.equal(all.length, CATALOG.length)

  const kickcraftOnly = filterCatalog(CATALOG, '', 'kickcraft')
  assert.ok(kickcraftOnly.length > 0)
  assert.ok(kickcraftOnly.every(shoe => shoe.categories.includes('kickcraft') || shoe.name.toLowerCase().includes('kickcraft')))
  assert.ok(kickcraftOnly.some(shoe => shoe.id === 'kickcraft-one'))
  assert.ok(!kickcraftOnly.some(shoe => shoe.id === 'nike-air-max'))

  const basketball = filterCatalog(CATALOG, '', 'basketball')
  assert.ok(basketball.every(shoe => shoe.categories.includes('basketball')))

  const running = filterCatalog(CATALOG, '', 'running')
  assert.ok(running.some(shoe => shoe.id === 'nike-air-max'))
  assert.ok(running.some(shoe => shoe.id === 'run-one'))

  const fashion = filterCatalog(CATALOG, '', 'fashion')
  assert.ok(fashion.some(shoe => shoe.id === 'nike-air-max'))
  assert.ok(fashion.some(shoe => shoe.id === 'fashion-one'))
  assert.ok(fashion.some(shoe => shoe.id === 'fashion-two'))
})

test('filters catalog by search query across name, subtitle, and categories', () => {
  const searchAir = filterCatalog(CATALOG, 'air max', 'all')
  assert.equal(searchAir.length, 1)
  assert.equal(searchAir[0].id, 'nike-air-max')

  const searchBasketball = filterCatalog(CATALOG, 'basketball', 'all')
  assert.ok(searchBasketball.length >= 2)
  assert.ok(searchBasketball.every(shoe => shoe.name.toLowerCase().includes('basketball') || shoe.subtitle.toLowerCase().includes('basketball') || shoe.categories.includes('basketball')))

  const searchSneakers = filterCatalog(CATALOG, 'sneakers', 'all')
  assert.ok(searchSneakers.some(shoe => shoe.id === 'kickcraft-one'))
  assert.ok(searchSneakers.some(shoe => shoe.id === 'nike-air-max'))

  const searchTrim = filterCatalog(CATALOG, '  STRIDE  ', 'all')
  assert.equal(searchTrim.length, 1)
  assert.equal(searchTrim[0].id, 'run-one')
})

test('combines search query and category filters', () => {
  const result = filterCatalog(CATALOG, 'running', 'kickcraft')
  assert.ok(result.length > 0)
  assert.ok(result.every(shoe => shoe.categories.includes('kickcraft') && (shoe.name.toLowerCase().includes('running') || shoe.subtitle.toLowerCase().includes('running') || shoe.categories.includes('running'))))
  assert.ok(!result.some(shoe => shoe.id === 'nike-air-max'))
})

test('returns empty array when nothing matches', () => {
  const result = filterCatalog(CATALOG, 'nonexistent shoe xyz', 'all')
  assert.deepEqual(result, [])

  const mismatchResult = filterCatalog(CATALOG, 'air max', 'basketball')
  assert.deepEqual(mismatchResult, [])
})

test('prioritizes customizable shoes without mutating catalog order', () => {
  const catalog = [
    { id: 'soon', status: 'soon' },
    { id: 'live-1', status: 'live' },
    { id: 'out', status: 'out_of_stock' },
    { id: 'live-2', status: 'live' },
  ]

  assert.deepEqual(prioritizeLiveCatalog(catalog).map(card => card.id), ['live-1', 'live-2', 'soon', 'out'])
  assert.equal(catalog[0].id, 'soon')
})
