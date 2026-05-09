import { findVendorPrice, detectBuyMultiplier, detectPackMultiplier, C2P_AMOUNT, COD_DELIVERY_RATE, COD_DISPATCH_RATE, LOGISTICS_COSTS, FEE_RATES } from './vendorPrices'

export function getProductFamily(title) {
  let name = title
    .replace(/\s*-\s*(Gold|Silver|Rose Gold|Maroon|Gullabi|Blue|Black|White|Red|Pink|Green|Purple|Couple).*$/i, '')
    .replace(/\s*\/\s*.+$/, '')
    .replace(/\s*\(.*?\)/g, '')
    .trim()
  if (!name) name = title.split(' - ')[0].split(' / ')[0].trim()
  return name
}

export function calculateFullPnL(orders, metaAllocation = {}, customVendorPrices = {}, productFilter = null) {
  const allOrders = orders
  // Don't filter cancelled - the 50% COD delivery rate and 70% dispatch rate already account for cancellations
  const cancelledCount = allOrders.filter(o => o.cancelled).length

  let activeOrders = allOrders
  if (productFilter) {
    activeOrders = allOrders.filter(o =>
      o.lineItems.some(i => getProductFamily(i.title) === productFilter)
    )
  }

  const prepaidOrders = activeOrders.filter(o => o.paymentType === 'prepaid')
  const c2pOrders = activeOrders.filter(o => o.paymentType === 'c2p')
  const codOrders = activeOrders.filter(o => o.paymentType === 'cod')
  const codC2pOrders = [...c2pOrders, ...codOrders]

  // ====== REVENUE ======
  let prepaidRevenue = 0, c2pRevenue = 0, codRevenue = 0
  if (productFilter) {
    // Proportional revenue: distribute order total based on line item price share
    activeOrders.forEach(o => {
      const orderLineTotal = o.lineItems.reduce((s, i) => s + (parseFloat(i.price) * i.quantity), 0)
      const productLineTotal = o.lineItems
        .filter(i => getProductFamily(i.title) === productFilter)
        .reduce((s, i) => s + (parseFloat(i.price) * i.quantity), 0)
      const share = orderLineTotal > 0 ? productLineTotal / orderLineTotal : 0
      const rev = o.totalPrice * share
      if (o.paymentType === 'prepaid') prepaidRevenue += rev
      else if (o.paymentType === 'c2p') c2pRevenue += rev
      else codRevenue += rev
    })
  } else {
    prepaidRevenue = prepaidOrders.reduce((s, o) => s + o.totalPrice, 0)
    c2pRevenue = c2pOrders.reduce((s, o) => s + o.totalPrice, 0)
    codRevenue = codOrders.reduce((s, o) => s + o.totalPrice, 0)
  }
  const totalRevenue = prepaidRevenue + c2pRevenue + codRevenue

  // Expected revenue: prepaid 100%, C2P = 150 upfront + remaining at 50%, COD = 50%
  const c2pUpfront = c2pOrders.length * C2P_AMOUNT
  const c2pExpected = productFilter
    ? (c2pRevenue > 0 ? c2pOrders.length * C2P_AMOUNT * (c2pRevenue / (c2pOrders.reduce((s,o) => s+o.totalPrice,0)||1)) + (c2pRevenue - c2pOrders.length * C2P_AMOUNT * (c2pRevenue / (c2pOrders.reduce((s,o) => s+o.totalPrice,0)||1))) * COD_DELIVERY_RATE : 0)
    : c2pOrders.reduce((s, o) => s + C2P_AMOUNT + Math.max(0, o.totalPrice - C2P_AMOUNT) * COD_DELIVERY_RATE, 0)
  const codExpected = codRevenue * COD_DELIVERY_RATE
  const expectedRevenue = prepaidRevenue + c2pExpected + codExpected
  const cashfreeCollection = prepaidRevenue + c2pUpfront

  // ====== META SPEND ======
  const metaTotalWithGST = metaAllocation._totalWithGST || 0
  let metaSpendForView = metaTotalWithGST
  if (productFilter) {
    const key = productFilter + '_withGST'
    metaSpendForView = metaAllocation[key] || 0
  }

  // ====== COGS ======
  let totalCOGS = 0
  const productMap = {}
  const orderDetails = []

  activeOrders.forEach(order => {
    let orderCOGS = 0
    const processedItems = []
    const items = productFilter
      ? order.lineItems.filter(i => getProductFamily(i.title) === productFilter)
      : order.lineItems

    // Calculate proportional revenue share for each line item
    const orderLineTotal = order.lineItems.reduce((s, i) => s + (parseFloat(i.price) * i.quantity), 0)

    items.forEach(item => {
      const vendorPrice = findVendorPrice(item.title, customVendorPrices)
      const buyMult = detectBuyMultiplier(item.title, item.variantTitle)
      const packMult = detectPackMultiplier(item.title, item.variantTitle)
      const totalUnits = item.quantity * buyMult
      const vendorCost = vendorPrice * packMult * buyMult * item.quantity
      orderCOGS += vendorCost

      // Proportional revenue: item's share of order total
      const itemRawTotal = parseFloat(item.price) * item.quantity
      const share = orderLineTotal > 0 ? itemRawTotal / orderLineTotal : 0
      const proportionalRevenue = order.totalPrice * share

      const family = getProductFamily(item.title)
      const variantKey = item.variantTitle
        ? `${item.title.split(' - ')[0].trim()} [${item.variantTitle}]`
        : item.title

      if (!productMap[family]) {
        productMap[family] = {
          name: family, vendorPriceBase: vendorPrice,
          prepaidUnits: 0, codUnits: 0, c2pUnits: 0, totalUnits: 0,
          prepaidOrders: 0, codOrders: 0, c2pOrders: 0, totalOrders: 0,
          revenue: 0, vendorCost: 0,
          prepaidRevenue: 0, c2pRevenue: 0, codRevenue: 0,
          // Full order tracking (includes upsell items like gift box)
          orderIds: new Set(), prepaidOrderIds: new Set(), c2pOrderIds: new Set(), codOrderIds: new Set(),
          fullOrderRevenue: 0, fullPrepaidRevenue: 0, fullC2pRevenue: 0, fullCodRevenue: 0,
          variants: {},
        }
      }
      const pf = productMap[family]
      pf.totalUnits += totalUnits; pf.totalOrders += item.quantity
      pf.revenue += proportionalRevenue; pf.vendorCost += vendorCost

      // Track unique orders + full order totals (for AOV including upsells)
      if (!pf.orderIds.has(order.id)) {
        pf.orderIds.add(order.id)
        pf.fullOrderRevenue += order.totalPrice
        if (order.paymentType === 'prepaid') { pf.prepaidOrderIds.add(order.id); pf.fullPrepaidRevenue += order.totalPrice }
        else if (order.paymentType === 'c2p') { pf.c2pOrderIds.add(order.id); pf.fullC2pRevenue += order.totalPrice }
        else { pf.codOrderIds.add(order.id); pf.fullCodRevenue += order.totalPrice }
      }

      if (order.paymentType === 'prepaid') { pf.prepaidUnits += totalUnits; pf.prepaidOrders += item.quantity; pf.prepaidRevenue += proportionalRevenue }
      else if (order.paymentType === 'c2p') { pf.c2pUnits += totalUnits; pf.c2pOrders += item.quantity; pf.c2pRevenue += proportionalRevenue }
      else { pf.codUnits += totalUnits; pf.codOrders += item.quantity; pf.codRevenue += proportionalRevenue }

      if (!pf.variants[variantKey]) {
        pf.variants[variantKey] = { name: variantKey, vendorPrice: vendorPrice * packMult * buyMult,
          prepaidQty: 0, codQty: 0, c2pQty: 0, totalQty: 0, revenue: 0, vendorCost: 0 }
      }
      const vr = pf.variants[variantKey]
      vr.totalQty += item.quantity; vr.revenue += proportionalRevenue; vr.vendorCost += vendorCost
      if (order.paymentType === 'prepaid') vr.prepaidQty += item.quantity
      else if (order.paymentType === 'c2p') vr.c2pQty += item.quantity
      else vr.codQty += item.quantity

      processedItems.push({ title: item.title, variantTitle: item.variantTitle, family,
        quantity: item.quantity, buyMultiplier: buyMult, totalUnits,
        sellingPrice: item.price, lineTotal: proportionalRevenue, vendorPriceBase: vendorPrice, vendorCost })
    })

    totalCOGS += orderCOGS
    const logistics = calcOrderLogistics(order)
    let feeBase = order.paymentType === 'prepaid' ? order.totalPrice : order.paymentType === 'c2p' ? C2P_AMOUNT : 0
    const fees = feeBase * (FEE_RATES.cashfree + FEE_RATES.engage + FEE_RATES.checkout)

    if (processedItems.length > 0) {
      orderDetails.push({ id: order.id, name: order.name, paymentType: order.paymentType,
        totalPrice: order.totalPrice, tags: order.tags, cogs: orderCOGS, logistics, fees,
        totalExpense: orderCOGS + logistics + fees, lineItems: processedItems })
    }
  })

  // ====== UPSELL ANALYSIS ======
  const UPSELL_PATTERNS = ['premium gift box', 'gift wrap', '5 in 1 gift box']
  const isUpsellItem = (title) => UPSELL_PATTERNS.some(p => title.toLowerCase().includes(p))

  // For each product family, analyze upsell attach rate and AOV impact
  const upsellAnalysis = {}
  const heroFamilies = Object.keys(productMap).filter(f => !UPSELL_PATTERNS.some(p => f.toLowerCase().includes(p)))

  heroFamilies.forEach(family => {
    const ordersWithHero = []

    activeOrders.forEach(order => {
      const hasHero = order.lineItems.some(i => getProductFamily(i.title) === family)
      if (!hasHero) return

      const upsellItems = order.lineItems.filter(i => isUpsellItem(i.title))
      const hasUpsell = upsellItems.length > 0
      const upsellRevenue = upsellItems.reduce((s, i) => s + parseFloat(i.price) * i.quantity, 0)

      ordersWithHero.push({
        id: order.id, name: order.name, total: order.totalPrice,
        paymentType: order.paymentType, hasUpsell, upsellRevenue,
        items: order.lineItems.map(i => ({ title: i.title, qty: i.quantity, price: parseFloat(i.price) })),
      })
    })

    if (ordersWithHero.length === 0) return

    const totalOrderValue = ordersWithHero.reduce((s, o) => s + o.total, 0)
    const totalUpsellRevenue = ordersWithHero.reduce((s, o) => s + o.upsellRevenue, 0)
    const ordersWithBox = ordersWithHero.filter(o => o.hasUpsell)
    const ordersWithoutBox = ordersWithHero.filter(o => !o.hasUpsell)
    const n = ordersWithHero.length

    // AOV current = total order value / orders (includes gift box revenue)
    // AOV without gift box = (total order value - all gift box revenue) / orders
    const aovCurrent = totalOrderValue / n
    const aovWithoutBox = (totalOrderValue - totalUpsellRevenue) / n
    const aovLiftAmount = totalUpsellRevenue / n  // gift box adds this much per order on average

    upsellAnalysis[family] = {
      totalOrders: n,
      withUpsellCount: ordersWithBox.length,
      withoutUpsellCount: ordersWithoutBox.length,
      attachRate: ordersWithBox.length / n,
      aovCurrent,
      aovWithoutBox,
      aovLiftAmount,
      aovLiftPct: aovWithoutBox > 0 ? aovLiftAmount / aovWithoutBox : 0,
      totalUpsellRevenue,
      avgUpsellPerBoxOrder: ordersWithBox.length > 0 ? totalUpsellRevenue / ordersWithBox.length : 0,
      // Order details for drill-down
      orders: ordersWithHero,
    }
  })

  // ====== LOGISTICS (new logic: COD/C2P at 70% dispatch rate) ======
  const nPrepaid = prepaidOrders.length
  const nCodC2p = codC2pOrders.length
  const nAllForBoxes = productFilter ? activeOrders.length : allOrders.length

  // Boxes: per order (all orders when unfiltered, filtered orders when filtered)
  const totalBoxes = nAllForBoxes * LOGISTICS_COSTS.box

  // Warranty Card: prepaid full + COD/C2P at 70%
  const totalWarranty = nPrepaid * LOGISTICS_COSTS.warrantyCard + nCodC2p * COD_DISPATCH_RATE * LOGISTICS_COSTS.warrantyCard

  // Free Ring: prepaid orders ONLY
  const totalFreeRing = nPrepaid * LOGISTICS_COSTS.freeRing

  // Packing Bags: prepaid full + COD/C2P at 70%
  const totalPackingBags = nPrepaid * LOGISTICS_COSTS.packingBag + nCodC2p * COD_DISPATCH_RATE * LOGISTICS_COSTS.packingBag

  // Shipping: prepaid at 60, COD/C2P at 100 * 70%
  const totalShipping = nPrepaid * LOGISTICS_COSTS.shippingPrepaid + nCodC2p * COD_DISPATCH_RATE * LOGISTICS_COSTS.shippingCOD

  const totalLogistics = totalBoxes + totalWarranty + totalFreeRing + totalPackingBags + totalShipping

  // ====== FEES (on Cashfree collection: prepaid full + C2P upfront) ======
  const feeBaseTotal = cashfreeCollection
  const totalFees = feeBaseTotal * (FEE_RATES.cashfree + FEE_RATES.engage + FEE_RATES.checkout)

  const totalExpense = totalCOGS + totalLogistics + totalFees + metaSpendForView
  const expectedProfit = expectedRevenue - totalExpense

  // ====== PER-PRODUCT PROFIT ======
  const totalRevForAlloc = Object.values(productMap).reduce((s, p) => s + p.revenue, 0) || 1
  const products = Object.values(productMap).map(p => {
    const share = p.revenue / totalRevForAlloc
    const pExpRev = p.prepaidRevenue
      + (p.c2pOrders > 0 ? (C2P_AMOUNT * p.c2pOrders) + Math.max(0, p.c2pRevenue - C2P_AMOUNT * p.c2pOrders) * COD_DELIVERY_RATE : 0)
      + p.codRevenue * COD_DELIVERY_RATE

    const metaKey = p.name + '_withGST'
    const hasCampaignCode = metaAllocation.hasOwnProperty(p.name)
    const pAds = metaAllocation[metaKey] || 0
    const pLogistics = totalLogistics * share
    const pFees = totalFees * share
    const pExpense = p.vendorCost + pLogistics + pFees + pAds
    const pProfit = pExpRev - pExpense

    // Unique order counts by payment type
    const orderCount = p.orderIds.size
    const prepaidOrderCount = p.prepaidOrderIds.size
    const c2pOrderCount = p.c2pOrderIds.size
    const codOrderCount = p.codOrderIds.size

    // Payment split %
    const prepaidPct = orderCount > 0 ? prepaidOrderCount / orderCount : 0
    const c2pPct = orderCount > 0 ? c2pOrderCount / orderCount : 0
    const codPct = orderCount > 0 ? codOrderCount / orderCount : 0

    // AOV including upsells (full order total / unique orders)
    const aovWithUpsells = orderCount > 0 ? p.fullOrderRevenue / orderCount : 0

    // CAC with GST (Meta spend including GST / unique orders)
    const cacWithGST = orderCount > 0 ? pAds / orderCount : 0

    // Prepaid Revenue (full order totals) + C2P upfront
    const prepaidRevenueTotal = p.fullPrepaidRevenue + (c2pOrderCount * C2P_AMOUNT)

    // COD expected revenue (full order totals for COD at 30%)
    const codRevenueExpected = p.fullCodRevenue * COD_DELIVERY_RATE
      + Math.max(0, p.fullC2pRevenue - c2pOrderCount * C2P_AMOUNT) * COD_DELIVERY_RATE

    // Prepaid Revenue to Meta Spend %
    const prepaidToAdSpend = pAds > 0 ? prepaidRevenueTotal / pAds : 0

    return { ...p, orderCount, prepaidOrderCount, c2pOrderCount, codOrderCount,
      expectedRevenue: pExpRev,
      allocatedLogistics: pLogistics, allocatedFees: pFees,
      metaSpend: pAds, hasCampaignCode,
      totalExpense: pExpense, profit: pProfit,
      margin: pExpRev > 0 ? pProfit / pExpRev : 0,
      // New metrics
      prepaidPct, c2pPct, codPct,
      aovWithUpsells, cacWithGST,
      prepaidRevenueTotal, codRevenueExpected, prepaidToAdSpend,
      fullOrderRevenue: p.fullOrderRevenue,
      variants: Object.values(p.variants).sort((a, b) => b.revenue - a.revenue) }
  }).sort((a, b) => b.revenue - a.revenue)

  const allFamilies = [...new Set(allOrders.flatMap(o => o.lineItems.map(i => getProductFamily(i.title))))].sort()

  return {
    overview: { totalOrders: allOrders.length, boxOrders: nAllForBoxes,
      activeOrders: activeOrders.length, cancelledOrders: cancelledCount,
      prepaidOrders: nPrepaid, c2pOrders: c2pOrders.length, codOrders: codOrders.length,
      codC2pOrders: nCodC2p,
      prepaidRate: activeOrders.length > 0 ? nPrepaid / activeOrders.length : 0,
      c2pRate: activeOrders.length > 0 ? c2pOrders.length / activeOrders.length : 0,
      codRate: activeOrders.length > 0 ? codOrders.length / activeOrders.length : 0 },
    revenue: { totalRevenue, expectedRevenue, prepaidRevenue, c2pRevenue, c2pUpfront, c2pExpected, codRevenue, codExpected, cashfreeCollection,
      // Prepaid Revenue including C2P upfront
      prepaidRevenueTotal: prepaidRevenue + c2pUpfront,
      // COD expected revenue
      codRevenueExpected: codExpected + (c2pExpected - c2pUpfront) },
    expenses: { metaAds: metaSpendForView, metaAdsPreGST: metaSpendForView / 1.18,
      cogs: totalCOGS, logistics: totalLogistics, totalFees, total: totalExpense,
      boxes: totalBoxes, warrantyCard: totalWarranty,
      freeRing: totalFreeRing, packingBags: totalPackingBags,
      shipping: totalShipping,
      cashfree: feeBaseTotal * FEE_RATES.cashfree, engage: feeBaseTotal * FEE_RATES.engage, checkout: feeBaseTotal * FEE_RATES.checkout },
    profit: { expected: expectedProfit, margin: expectedRevenue > 0 ? expectedProfit / expectedRevenue : 0,
      perOrder: activeOrders.length > 0 ? expectedProfit / activeOrders.length : 0 },
    metrics: { cpp: activeOrders.length > 0 ? metaSpendForView / activeOrders.length : 0,
      cacWithGST: activeOrders.length > 0 ? metaSpendForView / activeOrders.length : 0,
      cacPreGST: activeOrders.length > 0 ? (metaSpendForView / 1.18) / activeOrders.length : 0,
      aov: activeOrders.length > 0 ? totalRevenue / activeOrders.length : 0,
      adSpendRatio: expectedRevenue > 0 ? metaSpendForView / expectedRevenue : 0,
      prepaidToAdSpend: metaSpendForView > 0 ? (prepaidRevenue + c2pUpfront) / metaSpendForView : 0 },
    products, orderDetails, allFamilies,
    metaAllocation, upsellAnalysis,
  }
}

function calcOrderLogistics(order) {
  const isCOD = order.paymentType === 'cod' || order.paymentType === 'c2p'
  const dispatchMult = isCOD ? COD_DISPATCH_RATE : 1
  const shippingRate = isCOD ? LOGISTICS_COSTS.shippingCOD : LOGISTICS_COSTS.shippingPrepaid
  return LOGISTICS_COSTS.box
    + LOGISTICS_COSTS.warrantyCard * dispatchMult
    + (order.paymentType === 'prepaid' ? LOGISTICS_COSTS.freeRing : 0)
    + LOGISTICS_COSTS.packingBag * dispatchMult
    + shippingRate * dispatchMult
}

export function formatINR(n) { if (n == null || isNaN(n)) return '--'; const a = Math.abs(n), s = n < 0 ? '-' : ''; if (a >= 1e7) return `${s}${(a/1e7).toFixed(2)} Cr`; if (a >= 1e5) return `${s}${(a/1e5).toFixed(2)} L`; if (a >= 1e3) return `${s}${(a/1e3).toFixed(1)}K`; return `${s}${Math.round(a)}` }
export function formatPercent(v) { return v == null || isNaN(v) ? '--' : `${(v*100).toFixed(1)}%` }
export function formatExact(n) { return n == null || isNaN(n) ? '--' : new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.round(n)) }
