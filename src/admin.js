import { CATALOG, SHOES } from './customization.js'

export function slugify(text) {
  if (!text) return ''
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function validateShoe(shoe) {
  const errors = []
  if (!shoe.name || !shoe.name.trim()) errors.push('Shoe name is required.')
  if (!shoe.description || !shoe.description.trim()) errors.push('Description is required.')
  if (shoe.price === undefined || shoe.price === null || isNaN(Number(shoe.price)) || Number(shoe.price) <= 0) {
    errors.push('Valid price is required.')
  }
  if (shoe.stock !== undefined && (isNaN(Number(shoe.stock)) || Number(shoe.stock) < 0)) {
    errors.push('Stock cannot be negative.')
  }
  if (!Array.isArray(shoe.categories) || shoe.categories.length === 0) {
    errors.push('At least one category is required.')
  }
  if (!Array.isArray(shoe.parts) || shoe.parts.length === 0) {
    errors.push('At least one customizable part is required.')
  }
  if (!Array.isArray(shoe.colors) || shoe.colors.length === 0) {
    errors.push('At least one color is required in the palette.')
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

export function loadInitialShoes() {
  const defaultColors = [
    { name: 'Chalk', value: '#f1efe8' },
    { name: 'Graphite', value: '#292b2d' },
    { name: 'Cobalt', value: '#245fa8' },
    { name: 'Rust', value: '#b94d27' },
    { name: 'Moss', value: '#52684f' },
    { name: 'Burgundy', value: '#713741' },
  ]

  return SHOES.map(shoe => {
    const catalogEntry = CATALOG.find(c => c.id === shoe.id)
    const priceNum = parseInt(String(shoe.price || '4890').replace(/[^0-9]/g, ''), 10) || 4890
    return {
      id: shoe.id,
      name: shoe.name,
      description: shoe.description || shoe.summary || '',
      price: priceNum,
      formattedPrice: `₱${priceNum.toLocaleString()}`,
      status: catalogEntry?.status === 'live' ? 'available' : 'coming_soon',
      stock: 50,
      glbPath: shoe.src,
      thumbnailPath: shoe.image || catalogEntry?.image || '/images/kickcraft-one-card.png',
      charmsEnabled: true,
      charmOffset: shoe.charmOffset || null,
      charmScale: shoe.charmScale || '1 1 1',
      charmDir: shoe.charmDir || null,
      categories: catalogEntry?.categories || ['kickcraft', 'sneakers'],
      parts: shoe.parts || [],
      colors: defaultColors,
    }
  })
}

export function createShoeRecord(list, shoeData) {
  const baseId = slugify(shoeData.name) || `shoe-${Date.now()}`
  let id = baseId
  let counter = 1
  while (list.some(s => s.id === id)) {
    id = `${baseId}-${counter++}`
  }

  const priceNum = Number(shoeData.price) || 0
  const stockNum = Number(shoeData.stock) >= 0 ? Number(shoeData.stock) : 0
  const newShoe = {
    id,
    name: (shoeData.name || '').trim(),
    description: (shoeData.description || '').trim(),
    price: priceNum,
    formattedPrice: `₱${priceNum.toLocaleString()}`,
    status: shoeData.status || (stockNum > 0 ? 'available' : 'out_of_stock'),
    stock: stockNum,
    glbPath: shoeData.glbPath || '',
    thumbnailPath: shoeData.thumbnailPath || '/images/kickcraft-one-card.png',
    charmsEnabled: Boolean(shoeData.charmsEnabled),
    charmOffset: shoeData.charmOffset || null,
    charmScale: shoeData.charmScale || '1 1 1',
    charmDir: shoeData.charmDir || null,
    categories: Array.isArray(shoeData.categories) && shoeData.categories.length ? shoeData.categories : ['kickcraft'],
    parts: Array.isArray(shoeData.parts) ? shoeData.parts : [],
    colors: Array.isArray(shoeData.colors) ? shoeData.colors : [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  return newShoe
}

export function updateShoeRecord(list, shoeId, updates) {
  return list.map(shoe => {
    if (shoe.id !== shoeId) return shoe
    const priceNum = updates.price !== undefined ? Number(updates.price) : shoe.price
    return {
      ...shoe,
      ...updates,
      price: priceNum,
      formattedPrice: `₱${priceNum.toLocaleString()}`,
      updatedAt: new Date().toISOString(),
    }
  })
}

export function restockShoeRecord(list, shoeId, newStock) {
  const stockNum = Math.max(0, Number(newStock) || 0)
  return list.map(shoe => {
    if (shoe.id !== shoeId) return shoe
    const currentStatus = shoe.status
    const updatedStatus = stockNum > 0 && currentStatus === 'out_of_stock' ? 'available' : currentStatus
    return {
      ...shoe,
      stock: stockNum,
      status: updatedStatus,
      updatedAt: new Date().toISOString(),
    }
  })
}

export function deleteShoeRecord(list, shoeId) {
  return list.filter(shoe => shoe.id !== shoeId)
}

export function highlightMaterial(model, materialName, highlightColor = '#ff2222') {
  if (!model) return
  const materials = model.materials || []
  for (const mat of materials) {
    if (mat.name === materialName) {
      mat.pbrMetallicRoughness?.setBaseColorFactor(highlightColor)
    } else {
      mat.pbrMetallicRoughness?.setBaseColorFactor('#ffffff')
    }
  }
}

export function adminShoeToCatalogCard(shoe) {
  return {
    id: shoe.id,
    name: shoe.name,
    subtitle: shoe.description || `${shoe.parts?.length || 0} customizable parts`,
    price: shoe.formattedPrice || `₱${Number(shoe.price || 4890).toLocaleString()}`,
    categories: shoe.categories || ['kickcraft'],
    image: shoe.thumbnailPath || '/images/kickcraft-one-card.png',
    shoeId: shoe.id,
    status: shoe.status === 'available' || shoe.status === 'in_stock'
      ? 'live'
      : (shoe.status === 'out_of_stock' ? 'out_of_stock' : 'soon'),
    stock: shoe.stock,
  }
}
