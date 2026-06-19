// Compute actual per-product metrics over a date range from the daily cache.
// Used to auto-populate a target's baseline assumptions (AOV, mix, CAC).
import { calculateFullPnL } from './profitEngine'
import { getProducts, buildCampaignMap, buildVendorPriceMap, allocateMetaSpend } from './productDB'

const GST = 1.18

export function computeBaseline(getCachedData, start, end) {
  if (!start || !end) return { products: {}, daysWithData: 0, missing: [], orders: 0 }
  const dbP = getProducts()
  const campaignMap = buildCampaignMap(dbP)
  const vendorPriceMap = buildVendorPriceMap(dbP)

  let allOrders = [], allCampaigns = []
  let daysWithData = 0
  const missing = []
  const s = new Date(start + 'T00:00:00'), e = new Date(end + 'T00:00:00')
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    const ds = d.toISOString().split('T')[0]
    const data = getCachedData(ds, ds)
    if (!data?.orders) { missing.push(ds); continue }
    daysWithData++
    allOrders.push(...data.orders)
    allCampaigns.push(...(data.metaCampaigns || []))
  }

  if (allOrders.length === 0) return { products: {}, daysWithData, missing, orders: 0 }

  const meta = allocateMetaSpend(allCampaigns, campaignMap)
  const pnl = calculateFullPnL(allOrders, meta, vendorPriceMap)

  const products = {}
  pnl.products.forEach(p => {
    const metaPreGST = (p.metaSpend || 0) / GST
    const orders = p.orderCount || p.totalUnits || 0
    products[p.name] = {
      name: p.name,
      orders,
      ordersPerDay: daysWithData > 0 ? orders / daysWithData : 0,
      aov: p.aovWithUpsells || (orders > 0 ? p.fullOrderRevenue / orders : 0) || (orders > 0 ? p.revenue / orders : 0),
      cac: orders > 0 ? metaPreGST / orders : 0,
      prepaidRate: p.prepaidPct || 0,
      c2pRate: p.c2pPct || 0,
      codRate: p.codPct || 0,
      revenue: p.revenue,
      profit: p.profit || 0,
      margin: p.margin || 0,
    }
  })

  return {
    products,
    daysWithData,
    missing,
    orders: pnl.overview.activeOrders,
    rangeStart: start,
    rangeEnd: end,
  }
}
