const BASE = import.meta.env.VITE_API_URL || ''

export async function fetchShopifyOrders(since, until) {
  const res = await fetch(`${BASE}/api/shopify/orders?since=${since}&until=${until}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || 'Failed to fetch Shopify data')
  }
  return res.json()
}

export async function fetchMetaSpend(since, until) {
  const res = await fetch(`${BASE}/api/meta/spend?since=${since}&until=${until}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || 'Failed to fetch Meta data')
  }
  return res.json()
}
