import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { normalizeCatalogItem, buildUnifiedCatalog } from '../src/customization.js'

const CUSTOMIZATION_FILE_PATH = path.resolve('src/customization.js')

test('normalizeCatalogItem: formats KickCraft Original shoe correctly', () => {
  const shoe = {
    id: 'kickcraft-one',
    name: 'KickCraft One',
    description: 'Our original customizable sneaker.',
    price: 4890,
    categories: ['sneakers', 'kickcraft'],
    thumbnailPath: '/images/kickcraft-one-card.png',
  }

  const normalized = normalizeCatalogItem(shoe, 'shoe')

  assert.equal(normalized.id, 'kickcraft-one')
  assert.equal(normalized.shoeId, 'kickcraft-one')
  assert.equal(normalized.name, 'KickCraft One')
  assert.equal(normalized.isOriginal, true)
  assert.equal(normalized.storeName, 'KickCraft Original')
  assert.equal(normalized.attributionBadge, '[ KICKCRAFT ORIGINAL ]')
  assert.match(normalized.formattedPrice, /₱/)
  assert.equal(normalized.formattedPrice, '₱4,890')
  assert.equal(normalized.actionType, 'studio')
  assert.equal(normalized.image, '/images/kickcraft-one-card.png')
  assert.deepEqual(normalized.categories, ['sneakers', 'kickcraft'])
})

test('normalizeCatalogItem: formats Independent Seller product correctly', () => {
  const product = {
    id: 'KCP-2026-0001',
    name: 'Apex Runner 90',
    description: 'Streetwear sneaker.',
    price: 5200,
    storeName: 'Apex Footwear',
    creationMethod: 'upload',
    glbPath: '/uploads/products/apex.glb',
    thumbnailPath: '/uploads/products/apex.png',
    categories: ['running'],
    stock: 5,
  }

  const normalized = normalizeCatalogItem(product, 'product')

  assert.equal(normalized.id, 'KCP-2026-0001')
  assert.equal(normalized.productId, 'KCP-2026-0001')
  assert.equal(normalized.name, 'Apex Runner 90')
  assert.equal(normalized.isOriginal, false)
  assert.equal(normalized.storeName, 'Apex Footwear')
  assert.equal(normalized.attributionBadge, '[ BY APEX FOOTWEAR ]')
  assert.match(normalized.formattedPrice, /₱/)
  assert.equal(normalized.formattedPrice, '₱5,200')
  assert.equal(normalized.actionType, 'order_modal')
  assert.equal(normalized.image, '/uploads/products/apex.png')
  assert.equal(normalized.stock, 5)
})

test('normalizeCatalogItem: handles snake_case store_name and pre-formatted prices', () => {
  const product = {
    id: 'KCP-2026-0002',
    name: 'Solar Flare',
    price: 6100,
    formattedPrice: '₱6,100',
    store_name: 'Solar Soles',
    thumbnail_path: '/uploads/products/flare.png',
  }

  const normalized = normalizeCatalogItem(product, 'product')

  assert.equal(normalized.isOriginal, false)
  assert.equal(normalized.storeName, 'Solar Soles')
  assert.equal(normalized.attributionBadge, '[ BY SOLAR SOLES ]')
  assert.equal(normalized.formattedPrice, '₱6,100')
  assert.equal(normalized.image, '/uploads/products/flare.png')
})

test('normalizeCatalogItem: handles null or undefined input gracefully', () => {
  assert.equal(normalizeCatalogItem(null), null)
  assert.equal(normalizeCatalogItem(undefined), null)
})

test('buildUnifiedCatalog: combines shoes and products with originals first', () => {
  const shoes = [
    { id: 'kickcraft-one', name: 'KickCraft One', price: 4890 },
  ]
  const products = [
    { id: 'KCP-2026-0001', name: 'Apex Runner', price: 5200, storeName: 'Apex Footwear' },
  ]

  const catalog = buildUnifiedCatalog(shoes, products)

  assert.equal(catalog.length, 2)
  assert.equal(catalog[0].id, 'kickcraft-one')
  assert.equal(catalog[0].isOriginal, true)
  assert.equal(catalog[0].attributionBadge, '[ KICKCRAFT ORIGINAL ]')
  assert.equal(catalog[1].id, 'KCP-2026-0001')
  assert.equal(catalog[1].isOriginal, false)
  assert.equal(catalog[1].attributionBadge, '[ BY APEX FOOTWEAR ]')
})

test('buildUnifiedCatalog: handles empty or null inputs gracefully', () => {
  assert.deepEqual(buildUnifiedCatalog(), [])
  assert.deepEqual(buildUnifiedCatalog(null, null), [])
  assert.deepEqual(buildUnifiedCatalog([], []), [])

  const shoes = [{ id: 'shoe-1', name: 'Shoe 1', price: 1000 }]
  assert.equal(buildUnifiedCatalog(shoes, null).length, 1)
  assert.equal(buildUnifiedCatalog(null, [{ id: 'prod-1', name: 'Prod 1', price: 2000, storeName: 'Store' }]).length, 1)
})

test('src/customization.js: contains zero physical SQL DELETE statements', () => {
  const content = fs.readFileSync(CUSTOMIZATION_FILE_PATH, 'utf8')
  assert.doesNotMatch(content, /DELETE\s+FROM/i, 'customization.js must contain zero physical SQL DELETE statements')
})
