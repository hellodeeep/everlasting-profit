// Actual profit: replaces modelled assumptions with real per-order outcomes.
//   Revenue  = what was actually collected (prepaid - refunds; COD/C2P only if delivered)
//   Freight  = charged only for orders that shipped, + RTO charge on returns (modelled rates until NimbusPost API key)
//   COGS     = shipped units only; RTO'd COGS reported separately
//   Maturity = share of shipped COD/C2P orders that reached a terminal state
import { findVendorPrice, detectBuyMultiplier, detectPackMultiplier, C2P_AMOUNT, LOGISTICS_COSTS, FEE_RATES } from './vendorPrices'
import { getProductFamily } from './profitEngine'

export const ACTUAL_DEFAULTS = {
  rtoCharge: 100,          // Rs per RTO shipment (courier charges return freight)
  shippingPrepaid: LOGISTICS_COSTS.shippingPrepaid,
  shippingCOD: LOGISTICS_COSTS.shippingCOD,
}

// Resolve a single order's real outcome
export function orderOutcome(order, tracking) {
  const awbs = order.awbs || []
  const shipped = awbs.length > 0
  const trk = awbs.map(a => tracking[a]).filter(Boolean)
  // Worst-case across multiple AWBs: any delivered counts as delivered; else any rto; else in_transit
  let norm = 'unshipped'
  if (shipped) {
    if (trk.some(t => t.norm === 'delivered')) norm = 'delivered'
    else if (trk.some(t => t.norm === 'rto')) norm = 'rto'
    else if (trk.some(t => t.norm === 'lost')) norm = 'lost'
    else if (trk.some(t => t.norm === 'cancelled')) norm = 'cancelled'
    else if (trk.length === 0) norm = 'untracked'
    else norm = 'in_transit'
  }
  const terminal = ['delivered', 'rto', 'lost', 'cancelled'].includes(norm) && (norm !== 'rto' || trk.some(t => t.terminal))
  const refunded = order.refunded || 0
  const total = order.totalPrice || 0
  let collected = 0, collectedUpfront = 0, atStake = 0
  if (order.paymentType === 'prepaid') {
    collectedUpfront = total
    collected = total - refunded
  } else if (order.paymentType === 'c2p') {
    collectedUpfront = C2P_AMOUNT
    const remaining = Math.max(0, total - C2P_AMOUNT)
    collected = C2P_AMOUNT - refunded + (norm === 'delivered' ? remaining : 0)
    if (shipped && !terminal) atStake = remaining
  } else {
    collected = norm === 'delivered' ? total : 0
    if (shipped && !terminal) atStake = total
  }
  return { norm, terminal, shipped, refunded, collected, collectedUpfront, atStake, awbs }
}

export function calculateActualPnL(orders, tracking = {}, metaAllocation = {}, customVendorPrices = {}, productFilter = null, opts = {}) {
  const cfg = { ...ACTUAL_DEFAULTS, ...opts }
  const famCache = new Map()
  const famOf = (t) => { let f = famCache.get(t); if (f === undefined) { f = getProductFamily(t); famCache.set(t, f) } return f }
  const priceCache = new Map()
  const priceOf = (t) => { let v = priceCache.get(t); if (v === undefined) { v = findVendorPrice(t, customVendorPrices); priceCache.set(t, v) } return v }

  const hasAwbField = orders.length > 0 && orders.some(o => 'awbs' in o)

  let scoped = orders
  if (productFilter) scoped = orders.filter(o => o.lineItems.some(i => famOf(i.title) === productFilter))

  // ---- per-order outcomes ----
  const statusCounts = { delivered: 0, rto: 0, in_transit: 0, untracked: 0, unshipped: 0, lost: 0, cancelled: 0 }
  const byType = {
    prepaid: { orders: 0, collected: 0, refunded: 0, revenueFace: 0 },
    c2p: { orders: 0, collected: 0, refunded: 0, revenueFace: 0, delivered: 0, rto: 0, pending: 0 },
    cod: { orders: 0, collected: 0, refunded: 0, revenueFace: 0, delivered: 0, rto: 0, pending: 0 },
  }
  let actualRevenue = 0, atStake = 0, cashfreeCollection = 0, totalRefunded = 0
  let shippedOrders = 0, rtoOrders = 0, deliveredOrders = 0
  let codC2pShipped = 0, codC2pTerminal = 0

  // logistics (actual-basis)
  let boxes = 0, warranty = 0, freeRing = 0, packing = 0, shipping = 0, rtoCharges = 0
  // cogs
  let totalCOGS = 0, cogsRto = 0, cogsUnshipped = 0
  const productMap = {}
  const orderDetails = []
  const unpriced = {}; let unpricedUnits = 0, unpricedRevenue = 0

  scoped.forEach(order => {
    const oc = orderOutcome(order, tracking)
    statusCounts[oc.norm] = (statusCounts[oc.norm] || 0) + 1
    const bt = byType[order.paymentType] || byType.cod
    bt.orders++; bt.refunded += oc.refunded; bt.revenueFace += order.totalPrice
    totalRefunded += oc.refunded
    cashfreeCollection += oc.collectedUpfront
    atStake += oc.atStake

    // Product-filter proportional share of the order
    const orderLineTotal = order.lineItems.reduce((s, i) => s + parseFloat(i.price) * i.quantity, 0)
    const items = productFilter ? order.lineItems.filter(i => famOf(i.title) === productFilter) : order.lineItems
    const scopedLineTotal = items.reduce((s, i) => s + parseFloat(i.price) * i.quantity, 0)
    const orderShare = orderLineTotal > 0 ? scopedLineTotal / orderLineTotal : 1
    const orderCollected = oc.collected * orderShare
    actualRevenue += orderCollected
    bt.collected += oc.collected
    if (order.paymentType !== 'prepaid') {
      if (oc.norm === 'delivered') bt.delivered++
      else if (oc.norm === 'rto') bt.rto++
      else if (oc.shipped && !oc.terminal) bt.pending++
    }
    if (oc.shipped) { shippedOrders++; if (order.paymentType !== 'prepaid') { codC2pShipped++; if (oc.terminal) codC2pTerminal++ } }
    if (oc.norm === 'delivered') deliveredOrders++
    if (oc.norm === 'rto') rtoOrders++

    // ---- logistics: only for shipped orders ----
    let orderLogistics = 0
    if (oc.shipped) {
      const isCOD = order.paymentType !== 'prepaid'
      const ship = isCOD ? cfg.shippingCOD : cfg.shippingPrepaid
      const ring = order.paymentType === 'prepaid' ? LOGISTICS_COSTS.freeRing : 0
      const rto = oc.norm === 'rto' ? cfg.rtoCharge : 0
      boxes += LOGISTICS_COSTS.box; warranty += LOGISTICS_COSTS.warrantyCard; packing += LOGISTICS_COSTS.packingBag
      freeRing += ring; shipping += ship; rtoCharges += rto
      orderLogistics = (LOGISTICS_COSTS.box + LOGISTICS_COSTS.warrantyCard + LOGISTICS_COSTS.packingBag + ring + ship + rto) * orderShare
    }

    // ---- COGS: shipped units cost money regardless of outcome ----
    let orderCOGS = 0
    const processed = []
    items.forEach(item => {
      const vendorPrice = priceOf(item.title)
      const buyMult = detectBuyMultiplier(item.title, item.variantTitle)
      const packMult = detectPackMultiplier(item.title, item.variantTitle)
      const totalUnits = item.quantity * buyMult
      const vendorCost = vendorPrice * packMult * buyMult * item.quantity
      const itemRaw = parseFloat(item.price) * item.quantity
      const share = orderLineTotal > 0 ? itemRaw / orderLineTotal : 0
      const itemCollected = oc.collected * share
      const family = famOf(item.title)
      if (vendorPrice === 0 && itemRaw > 0) {
        unpricedUnits += totalUnits; unpricedRevenue += itemCollected
        if (!unpriced[family]) unpriced[family] = { name: family, units: 0, revenue: 0 }
        unpriced[family].units += totalUnits; unpriced[family].revenue += itemCollected
      }
      if (oc.shipped) { orderCOGS += vendorCost; if (oc.norm === 'rto') cogsRto += vendorCost }
      else cogsUnshipped += vendorCost

      if (!productMap[family]) productMap[family] = { name: family, orderIds: new Set(), deliveredIds: new Set(), rtoIds: new Set(), pendingIds: new Set(),
        prepaidOrderIds: new Set(), c2pOrderIds: new Set(), codOrderIds: new Set(),
        totalUnits: 0, shippedUnits: 0, rtoUnits: 0, collected: 0, faceRevenue: 0, vendorCost: 0, vendorCostRto: 0, refunded: 0, fullOrderRevenue: 0, variants: {} }
      const pf = productMap[family]
      pf.totalUnits += totalUnits; pf.faceRevenue += order.totalPrice * share; pf.collected += itemCollected
      if (oc.shipped) { pf.shippedUnits += totalUnits; pf.vendorCost += vendorCost; if (oc.norm === 'rto') { pf.rtoUnits += totalUnits; pf.vendorCostRto += vendorCost } }
      if (!pf.orderIds.has(order.id)) {
        pf.orderIds.add(order.id); pf.fullOrderRevenue += order.totalPrice; pf.refunded += oc.refunded
        if (order.paymentType === 'prepaid') pf.prepaidOrderIds.add(order.id); else if (order.paymentType === 'c2p') pf.c2pOrderIds.add(order.id); else pf.codOrderIds.add(order.id)
        if (order.paymentType !== 'prepaid') {
          if (oc.norm === 'delivered') pf.deliveredIds.add(order.id); else if (oc.norm === 'rto') pf.rtoIds.add(order.id); else if (oc.shipped && !oc.terminal) pf.pendingIds.add(order.id)
        }
      }
      processed.push({ title: item.title, quantity: item.quantity, totalUnits, vendorCost, collected: itemCollected })
    })
    totalCOGS += orderCOGS

    const fees = (oc.collectedUpfront) * (FEE_RATES.cashfree + FEE_RATES.engage + FEE_RATES.checkout) * orderShare
    if (processed.length) orderDetails.push({ id: order.id, name: order.name, paymentType: order.paymentType, totalPrice: order.totalPrice,
      status: oc.norm, terminal: oc.terminal, awbs: oc.awbs, refunded: oc.refunded, collected: orderCollected,
      tracking: oc.awbs.map(a => tracking[a]).filter(Boolean)[0] || null,
      cogs: orderCOGS, logistics: orderLogistics, fees, lineItems: processed })
  })

  // ---- Meta ----
  const metaTotalWithGST = metaAllocation._totalWithGST || 0
  const metaSpend = productFilter ? (metaAllocation[productFilter + '_withGST'] || 0) : metaTotalWithGST

  // ---- Fees on actual Cashfree collection (prepaid + C2P upfront), net of refunds ----
  const feeBase = Math.max(0, cashfreeCollection - totalRefunded)
  const totalFees = feeBase * (FEE_RATES.cashfree + FEE_RATES.engage + FEE_RATES.checkout)

  const totalLogistics = boxes + warranty + freeRing + packing + shipping + rtoCharges
  const totalExpense = totalCOGS + totalLogistics + totalFees + metaSpend
  const actualProfit = actualRevenue - totalExpense

  // ---- maturity ----
  const maturity = codC2pShipped > 0 ? codC2pTerminal / codC2pShipped : 1
  const untracked = statusCounts.untracked || 0

  // ---- per product ----
  const totalCollectedForAlloc = Object.values(productMap).reduce((s, p) => s + p.collected, 0) || 1
  const products = Object.values(productMap).map(p => {
    const share = p.collected / totalCollectedForAlloc
    const orderCount = p.orderIds.size
    const pAds = metaAllocation[p.name + '_withGST'] || 0
    const hasCampaignCode = Object.prototype.hasOwnProperty.call(metaAllocation, p.name)
    const pLogistics = totalLogistics * share
    const pFees = totalFees * share
    const pExpense = p.vendorCost + pLogistics + pFees + pAds
    const pProfit = p.collected - pExpense
    const nonPrepaid = p.c2pOrderIds.size + p.codOrderIds.size
    return { ...p, orderCount, prepaidOrderCount: p.prepaidOrderIds.size, c2pOrderCount: p.c2pOrderIds.size, codOrderCount: p.codOrderIds.size,
      revenue: p.collected, expectedRevenue: p.collected, metaSpend: pAds, hasCampaignCode,
      allocatedLogistics: pLogistics, allocatedFees: pFees, totalExpense: pExpense, profit: pProfit,
      margin: p.collected > 0 ? pProfit / p.collected : 0,
      deliveredCount: p.deliveredIds.size, rtoCount: p.rtoIds.size, pendingCount: p.pendingIds.size,
      // resolved-only, consistent with the overall COD delivery rate
      deliveryRate: (p.deliveredIds.size + p.rtoIds.size) > 0 ? p.deliveredIds.size / (p.deliveredIds.size + p.rtoIds.size) : null,
      rtoRate: (p.deliveredIds.size + p.rtoIds.size) > 0 ? p.rtoIds.size / (p.deliveredIds.size + p.rtoIds.size) : null,
      prepaidPct: orderCount ? p.prepaidOrderIds.size / orderCount : 0, c2pPct: orderCount ? p.c2pOrderIds.size / orderCount : 0, codPct: orderCount ? p.codOrderIds.size / orderCount : 0,
      aovWithUpsells: orderCount ? p.fullOrderRevenue / orderCount : 0,
      cacWithGST: orderCount ? pAds / orderCount : 0,
      variants: [] }
  }).sort((a, b) => b.revenue - a.revenue)

  const nAll = scoped.length
  return {
    mode: 'actual', hasAwbField,
    overview: { totalOrders: nAll, activeOrders: nAll, cancelledOrders: scoped.filter(o => o.cancelled).length,
      prepaidOrders: byType.prepaid.orders, c2pOrders: byType.c2p.orders, codOrders: byType.cod.orders, codC2pOrders: byType.c2p.orders + byType.cod.orders,
      prepaidRate: nAll ? byType.prepaid.orders / nAll : 0, c2pRate: nAll ? byType.c2p.orders / nAll : 0, codRate: nAll ? byType.cod.orders / nAll : 0,
      shippedOrders, deliveredOrders, rtoOrders, boxOrders: shippedOrders },
    revenue: { totalRevenue: actualRevenue, expectedRevenue: actualRevenue, actualRevenue,
      prepaidRevenue: byType.prepaid.collected, c2pRevenue: byType.c2p.collected, codRevenue: byType.cod.collected,
      c2pUpfront: byType.c2p.orders * C2P_AMOUNT, cashfreeCollection, refunded: totalRefunded, atStake,
      prepaidRevenueTotal: byType.prepaid.collected + byType.c2p.orders * C2P_AMOUNT - byType.c2p.refunded,
      codRevenueExpected: byType.cod.collected + Math.max(0, byType.c2p.collected - byType.c2p.orders * C2P_AMOUNT + byType.c2p.refunded) },
    expenses: { metaAds: metaSpend, metaAdsPreGST: metaSpend / 1.18, cogs: totalCOGS, cogsRto, cogsUnshipped, logistics: totalLogistics, totalFees, total: totalExpense,
      boxes, warrantyCard: warranty, freeRing, packingBags: packing, shipping, rtoCharges,
      cashfree: feeBase * FEE_RATES.cashfree, engage: feeBase * FEE_RATES.engage, checkout: feeBase * FEE_RATES.checkout },
    profit: { expected: actualProfit, actual: actualProfit, margin: actualRevenue > 0 ? actualProfit / actualRevenue : 0, perOrder: nAll ? actualProfit / nAll : 0 },
    metrics: { cpp: nAll ? metaSpend / nAll : 0, cacWithGST: nAll ? metaSpend / nAll : 0, cacPreGST: nAll ? (metaSpend / 1.18) / nAll : 0,
      aov: nAll ? scoped.reduce((s, o) => s + o.totalPrice, 0) / nAll : 0,
      aovPrepaid: byType.prepaid.orders ? byType.prepaid.revenueFace / byType.prepaid.orders : 0,
      aovC2p: byType.c2p.orders ? byType.c2p.revenueFace / byType.c2p.orders : 0,
      aovCod: byType.cod.orders ? byType.cod.revenueFace / byType.cod.orders : 0,
      adSpendRatio: actualRevenue > 0 ? metaSpend / actualRevenue : 0,
      prepaidToAdSpend: metaSpend > 0 ? (byType.prepaid.collected + byType.c2p.orders * C2P_AMOUNT) / metaSpend : 0,
      codDeliveryRate: (byType.cod.delivered + byType.cod.rto) > 0 ? byType.cod.delivered / (byType.cod.delivered + byType.cod.rto) : null,
      c2pDeliveryRate: (byType.c2p.delivered + byType.c2p.rto) > 0 ? byType.c2p.delivered / (byType.c2p.delivered + byType.c2p.rto) : null },
    actual: { maturity, codC2pShipped, codC2pTerminal, statusCounts, byType, untracked, atStake, rtoOrders, deliveredOrders, shippedOrders, cfg },
    products, orderDetails,
    allFamilies: [...new Set(orders.flatMap(o => o.lineItems.map(i => famOf(i.title))))].sort(),
    metaAllocation, upsellAnalysis: {},
    unpriced: { units: unpricedUnits, revenue: unpricedRevenue, families: Object.values(unpriced).sort((a, b) => b.revenue - a.revenue) },
  }
}
