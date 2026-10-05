export function resolveAssetUrl(path) {
  if (!path || typeof path !== 'string') return ''
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) return path
  // Strip leading slash so assets load relative to current deployment directory
  return path.replace(/^\/+/, './')
}

export const PARTS = [
  { id: 'upper', label: 'Upper', material: 'UpperMaterial' },
  { id: 'toe-cap', label: 'Toe cap', material: 'ToeCapMaterial' },
  { id: 'tongue', label: 'Tongue', material: 'TongueMaterial' },
  { id: 'laces', label: 'Laces', material: 'LacesMaterial' },
  { id: 'heel-panel', label: 'Heel panel', material: 'HeelPanelMaterial' },
  { id: 'side-accents', label: 'Side accents', material: 'SideAccentsMaterial' },
  { id: 'midsole', label: 'Midsole', material: 'MidsoleMaterial' },
  { id: 'outsole', label: 'Outsole', material: 'OutsoleMaterial' },
]

export const AIR_MAX_PARTS = [
  { id: 'upper', label: 'Upper', material: 'UpperMaterial' },
  { id: 'laces', label: 'Laces', material: 'LacesMaterial' },
  { id: 'midsole', label: 'Midsole', material: 'MidsoleMaterial' },
]

export const DUNK_PARTS = [
  { id: 'upper', label: 'Upper', material: 'UpperMaterial' },
  { id: 'laces', label: 'Laces', material: 'LacesMaterial' },
  { id: 'midsole', label: 'Midsole', material: 'MidsoleMaterial' },
]

export const SHOES = [
  {
    id: 'kickcraft-one',
    name: 'KickCraft One',
    summary: 'Original concept · 8 customizable parts',
    description: 'Our original customizable sneaker concept.',
    price: '₱4,890',
    image: '/images/kickcraft-one-card.png',
    src: '/models/shoe-soleview-final.glb',
    parts: PARTS,
    charmOffset: null,
    charmScale: '1 1 1',
    charmDir: null,
  },
  {
    id: 'nike-air-max',
    name: 'Nike Air Max',
    summary: 'Air Max model · 3 customizable parts',
    description: 'A 3D shoe with three simple customization zones.',
    price: '₱4,890',
    image: '/images/nike-air-max-card.png',
    src: '/models/nike-air-max-custom.glb',
    parts: AIR_MAX_PARTS,
    charmOffset: '0.003800 0.005100 0.085800',
    charmScale: '0.25 0.25 0.25',
    charmDir: '/models/charms/air-max/',
  },
  {
    id: 'nike-dunk',
    name: 'Nike Dunk',
    summary: 'Dunk Low model · 3 customizable parts',
    description: 'An iconic silhouette with customizable upper, laces, and midsole.',
    price: '₱4,890',
    image: '/images/nike-dunk-card.png',
    src: '/models/nike-dunk.glb',
    parts: DUNK_PARTS,
    charmOffset: null,
    charmScale: '0.35 0.35 0.35',
    charmDir: null,
  },
]

export function setMaterialColor(model, materialName, color) {
  const material = model?.getMaterialByName(materialName)
  if (!material) return false
  material.pbrMetallicRoughness.setBaseColorFactor(color)
  return true
}

export function buildPartColorway(parts, palette) {
  if (!Array.isArray(parts) || !Array.isArray(palette) || palette.length === 0) return {}
  return Object.fromEntries(parts.map((part, index) => [part.id, palette[index % palette.length]]))
}

export function parseMeshMap(raw) {
  if (!raw) return {}
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch {
      return {}
    }
  }
  return typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
}

// AI 2D->3D shoes are a single mesh with one baked texture, so their parts are not
// independently addressable. Only shoes with tagged, separate meshes support part colors.
export function isPartCustomizable(product) {
  if (!product) return false
  const method = product.creationMethod || product.creation_method
  if (method === 'ai_generate') return false
  return Object.keys(parseMeshMap(product.meshMap ?? product.mesh_map)).length > 0
}

export const CHARMS = [
  { id: 'none', label: 'None', src: null },
  { id: 'star', label: 'Star', src: '/models/charms/star-charm.glb' },
  { id: 'lightning', label: 'Lightning', src: '/models/charms/lightning-charm.glb' },
  { id: 'k-tag', label: 'K tag', src: '/models/charms/k-tag-charm.glb' },
]

export function charmSource(charm, shoe) {
  if (!charm?.src || !shoe?.charmDir) return charm?.src || null
  return `${shoe.charmDir}${charm.src.split('/').pop()}`
}

export function charmScale(charmId, selectedCharmId, scale = '1 1 1') {
  return charmId === selectedCharmId ? scale : '0 0 0'
}

export const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'kickcraft', label: 'KickCraft Original' },
  { id: 'fashion', label: 'Fashion' },
  { id: 'sneakers', label: 'Sneakers' },
  { id: 'basketball', label: 'Basketball Shoes' },
  { id: 'running', label: 'Running Shoes' },
]

export const CATALOG = [
  {
    id: 'kickcraft-one',
    name: 'KickCraft One',
    subtitle: 'Original concept · 8 customizable parts',
    price: '₱4,890',
    categories: ['kickcraft', 'sneakers'],
    image: '/images/kickcraft-one-card.png',
    shoeId: 'kickcraft-one',
    status: 'live',
  },
  {
    id: 'nike-air-max',
    name: 'Nike Air Max',
    subtitle: 'Air Max model · 3 customizable parts',
    price: '₱4,890',
    categories: ['sneakers', 'running', 'fashion'],
    image: '/images/nike-air-max-card.png',
    shoeId: 'nike-air-max',
    status: 'live',
  },
  {
    id: 'nike-dunk',
    name: 'Nike Dunk',
    subtitle: 'Dunk Low model · 3 customizable parts',
    price: '₱4,890',
    categories: ['sneakers', 'fashion', 'basketball'],
    image: '/images/nike-dunk-card.png',
    shoeId: 'nike-dunk',
    status: 'live',
  },
  {
    id: 'hoop-one',
    name: 'KickCraft Hoop',
    subtitle: 'High-top basketball · ankle support',
    price: '₱5,290',
    categories: ['kickcraft', 'basketball'],
    image: null,
    shoeId: null,
    status: 'soon',
  },
  {
    id: 'hoop-two',
    name: 'KickCraft Court',
    subtitle: 'Low-cut basketball · lightweight grip',
    price: '₱5,190',
    categories: ['kickcraft', 'basketball'],
    image: null,
    shoeId: null,
    status: 'soon',
  },
  {
    id: 'run-one',
    name: 'KickCraft Stride',
    subtitle: 'Road running · responsive cushion',
    price: '₱5,490',
    categories: ['kickcraft', 'running'],
    image: null,
    shoeId: null,
    status: 'soon',
  },
  {
    id: 'run-two',
    name: 'KickCraft Pace',
    subtitle: 'Trail running · rugged outsole',
    price: '₱5,390',
    categories: ['kickcraft', 'running'],
    image: null,
    shoeId: null,
    status: 'soon',
  },
  {
    id: 'fashion-one',
    name: 'KickCraft Luxe',
    subtitle: 'Fashion · premium leather upper',
    price: '₱6,290',
    categories: ['kickcraft', 'fashion'],
    image: null,
    shoeId: null,
    status: 'soon',
  },
  {
    id: 'fashion-two',
    name: 'KickCraft Drift',
    subtitle: 'Fashion · canvas slip-on silhouette',
    price: '₱5,890',
    categories: ['kickcraft', 'fashion'],
    image: '/images/kickcraft-canvas-card.png',
    shoeId: null,
    status: 'soon',
  },
]

export function filterCatalog(catalog, query = '', category = 'all') {
  const q = query.trim().toLowerCase()
  return catalog.filter(card => {
    const matchesCategory =
      category === 'all'
        ? true
        : category === 'kickcraft'
          ? card.categories.includes('kickcraft') || card.name.toLowerCase().includes('kickcraft')
          : card.categories.includes(category)

    const matchesSearch =
      !q ||
      card.name.toLowerCase().includes(q) ||
      card.subtitle.toLowerCase().includes(q) ||
      card.categories.some(c => c.toLowerCase().includes(q))

    return matchesCategory && matchesSearch
  })
}

export function prioritizeLiveCatalog(catalog) {
  return [...catalog].sort((a, b) => Number(b.status === 'live') - Number(a.status === 'live'))
}

export function normalizeCatalogItem(item, type = 'shoe') {
  if (!item) return null

  const isShoe = type === 'shoe' || item.isOriginal || (!item.sellerId && !item.seller_id && !item.storeName && !item.store_name)
  
  let price = 0
  let formattedPrice = item.formattedPrice || ''
  if (typeof item.price === 'number') {
    price = item.price
    if (!formattedPrice) {
      formattedPrice = '₱' + price.toLocaleString('en-US')
    }
  } else if (typeof item.price === 'string') {
    const cleaned = item.price.replace(/[^\d.]/g, '')
    price = cleaned ? Number(cleaned) : 0
    if (!formattedPrice) {
      formattedPrice = item.price.startsWith('₱') ? item.price : ('₱' + (price ? price.toLocaleString('en-US') : '0'))
    }
  } else if (formattedPrice) {
    const cleaned = formattedPrice.replace(/[^\d.]/g, '')
    price = cleaned ? Number(cleaned) : 0
  }
  if (!formattedPrice) {
    formattedPrice = '₱' + price.toLocaleString('en-US')
  }

  if (isShoe) {
    return {
      id: String(item.id || ''),
      shoeId: String(item.id || ''),
      name: String(item.name || ''),
      description: String(item.description || ''),
      price,
      formattedPrice,
      image: item.thumbnailPath || item.thumbnail_path || item.image || '/images/kickcraft-one-card.png',
      isOriginal: true,
      storeName: 'KickCraft Original',
      attributionBadge: '[ KICKCRAFT ORIGINAL ]',
      actionType: 'studio',
      category: Array.isArray(item.categories) && item.categories[0] ? item.categories[0] : (item.category || 'sneakers'),
      categories: Array.isArray(item.categories) ? item.categories : ['sneakers', 'kickcraft'],
      status: item.status || 'live',
      rawItem: item,
    }
  }

  const rawStoreName = item.storeName || item.store_name || 'Independent Seller'
  const storeName = String(rawStoreName).trim()
  const cleanStoreForBadge = storeName.toUpperCase().replace(/^BY\s+/i, '')

  return {
    id: String(item.id || ''),
    productId: String(item.id || ''),
    name: String(item.name || ''),
    description: String(item.description || ''),
    price,
    formattedPrice,
    image: item.thumbnailPath || item.thumbnail_path || item.glbPath || item.glb_path || '/images/kickcraft-one-card.png',
    glbPath: item.glbPath || item.glb_path || null,
    isOriginal: false,
    storeName,
    attributionBadge: `[ BY ${cleanStoreForBadge} ]`,
    creationMethod: item.creationMethod || item.creation_method || 'upload',
    actionType: 'order_modal',
    category: item.category || (Array.isArray(item.categories) && item.categories[0]) || 'sneakers',
    categories: Array.isArray(item.categories) ? item.categories : ['sneakers'],
    status: item.status === 'approved' ? 'live' : (item.status || 'draft'),
    stock: Number(item.stock ?? 0),
    sizesAvailable: item.sizesAvailable || item.sizes_available || [],
    rawItem: item,
  }
}

export function buildUnifiedCatalog(shoes = [], products = []) {
  const normalizedShoes = (shoes || []).map((s) => normalizeCatalogItem(s, 'shoe')).filter(Boolean)
  const normalizedProducts = (products || []).map((p) => normalizeCatalogItem(p, 'product')).filter(Boolean)
  return [...normalizedShoes, ...normalizedProducts]
}

