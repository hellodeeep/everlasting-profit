// Product Database - localStorage backed
// Each product has: name, vendorPrice, campaignCode, matchPatterns

const STORAGE_KEY = 'everlasting_products'

export function getProducts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

export function saveProducts(products) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(products))
}

export function upsertProduct(product) {
  const products = getProducts()
  const idx = products.findIndex(p => p.id === product.id)
  if (idx >= 0) products[idx] = product
  else products.push({ ...product, id: crypto.randomUUID() })
  saveProducts(products)
  return products
}

export function deleteProduct(id) {
  const products = getProducts().filter(p => p.id !== id)
  saveProducts(products)
  return products
}

// Build a vendor price map from product database
// Returns { "product name pattern": vendorPrice }
export function buildVendorPriceMap(products) {
  const map = {}
  products.forEach(p => {
    if (p.name && p.vendorPrice) {
      map[p.name.toLowerCase()] = p.vendorPrice
      // Also add any extra match patterns
      if (p.matchPatterns) {
        p.matchPatterns.split(',').forEach(pat => {
          const trimmed = pat.trim().toLowerCase()
          if (trimmed) map[trimmed] = p.vendorPrice
        })
      }
    }
  })
  return map
}

// Build campaign code -> product name mapping
export function buildCampaignMap(products) {
  const map = {}
  products.forEach(p => {
    if (p.campaignCode && p.name) {
      map[p.campaignCode.toUpperCase()] = p.name
    }
  })
  return map
}

// Allocate Meta campaigns to products using campaign codes
// Returns { productName: spendAmount, _unallocated: spendAmount }
export function allocateMetaSpend(campaigns, campaignMap) {
  const allocation = { _unallocated: 0, _total: 0, _totalWithGST: 0 }
  const metaPurchases = {}   // product -> Meta-attributed purchase count
  const GST_RATE = 0.18

  campaigns.forEach(c => {
    const name = (c.campaignName || c.campaign_name || '').toUpperCase()
    const spend = c.spend || 0
    const purchases = c.purchases || 0
    let matched = false

    for (const [code, productName] of Object.entries(campaignMap)) {
      if (name.includes(code)) {
        if (!allocation[productName]) allocation[productName] = 0
        if (!metaPurchases[productName]) metaPurchases[productName] = 0
        allocation[productName] += spend
        metaPurchases[productName] += purchases
        matched = true
        break
      }
    }

    if (!matched) {
      allocation._unallocated += spend
    }
    allocation._total += spend
  })

  // Add 18% GST
  allocation._totalWithGST = allocation._total * (1 + GST_RATE)
  Object.keys(allocation).forEach(key => {
    if (key !== '_total' && key !== '_totalWithGST' && !key.startsWith('_')) {
      allocation[key + '_withGST'] = allocation[key] * (1 + GST_RATE)
    }
  })
  allocation._metaPurchases = metaPurchases

  return allocation
}
