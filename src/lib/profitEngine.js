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
    activeOrders.forEach(o => {
      const rev = o.lineItems.filter(i => getProductFamily(i.title) === productFilter)
        .reduce((s, i) => s + (i.lineTotal || parseFloat(i.price) * i.quantity), 0)
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

    items.forEach(item => {
      const vendorPrice = findVendorPrice(item.title, customVendorPrices)
      const buyMult = detectBuyMultiplier(item.title, item.variantTitle)
      const packMult = detectPackMultiplier(item.title, item.variantTitle)
      const totalUnits = item.quantity * buyMult
      const vendorCost = vendorPrice * packMult * buyMult * item.quantity
      orderCOGS += vendorCost

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
          orderIds: new Set(), variants: {},
        }
      }
      const pf = productMap[family]
      pf.totalUnits += totalUnits; pf.totalOrders += item.quantity
      pf.revenue += item.lineTotal; pf.vendorCost += vendorCost
      pf.orderIds.add(order.id)
      if (order.paymentType === 'prepaid') { pf.prepaidUnits += totalUnits; pf.prepaidOrders += item.quantity; pf.prepaidRevenue += item.lineTotal }
      else if (order.paymentType === 'c2p') { pf.c2pUnits += totalUnits; pf.c2pOrders += item.quantity; pf.c2pRevenue += item.lineTotal }
      else { pf.codUnits += totalUnits; pf.codOrders += item.quantity; pf.codRevenue += item.lineTotal }

      if (!pf.variants[variantKey]) {
        pf.variants[variantKey] = { name: variantKey, vendorPrice: vendorPrice * packMult * buyMult,
          prepaidQty: 0, codQty: 0, c2pQty: 0, totalQty: 0, revenue: 0, vendorCost: 0 }
      }
      const vr = pf.variants[variantKey]
      vr.totalQty += item.quantity; vr.revenue += item.lineTotal; vr.vendorCost += vendorCost
      if (order.paymentType === 'prepaid') vr.prepaidQty += item.quantity
      else if (order.paymentType === 'c2p') vr.c2pQty += item.quantity
      else vr.codQty += item.quantity

      processedItems.push({ title: item.title, variantTitle: item.variantTitle, family,
        quantity: item.quantity, buyMultiplier: buyMult, totalUnits,
        sellingPrice: item.price, lineTotal: item.lineTotal, vendorPriceBase: vendorPrice, vendorCost })
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

    return { ...p, orderCount: p.orderIds.size, expectedRevenue: pExpRev,
      allocatedLogistics: pLogistics, allocatedFees: pFees,
      metaSpend: pAds, hasCampaignCode,
      totalExpense: pExpense, profit: pProfit,
      margin: pExpRev > 0 ? pProfit / pExpRev : 0,
      variants: Object.values(p.variants).sort((a, b) => b.revenue - a.revenue) }
  }).sort((a, b) => b.revenue - a.revenue)

  const allFamilies = [...new Set(allOrders.flatMap(o => o.lineItems.map(i => getProductFamily(i.title))))].sort()

  return {
    overview: { totalOrders: allOrders.length, boxOrders: nAllForBoxes,
      activeOrders: activeOrders.length, cancelledOrders: cancelledCount,
      prepaidOrders: nPrepaid, c2pOrders: c2pOrders.length, codOrders: codOrders.length,
      codC2pOrders: nCodC2p,
      prepaidRate: activeOrders.length > 0 ? nPrepaid / activeOrders.length : 0 },
    revenue: { totalRevenue, expectedRevenue, prepaidRevenue, c2pRevenue, c2pUpfront, c2pExpected, codRevenue, codExpected, cashfreeCollection },
    expenses: { metaAds: metaSpendForView, metaAdsPreGST: metaSpendForView / 1.18,
      cogs: totalCOGS, logistics: totalLogistics, totalFees, total: totalExpense,
      boxes: totalBoxes, warrantyCard: totalWarranty,
      freeRing: totalFreeRing, packingBags: totalPackingBags,
      shipping: totalShipping,
      cashfree: feeBaseTotal * FEE_RATES.cashfree, engage: feeBaseTotal * FEE_RATES.engage, checkout: feeBaseTotal * FEE_RATES.checkout },
    profit: { expected: expectedProfit, margin: expectedRevenue > 0 ? expectedProfit / expectedRevenue : 0,
      perOrder: activeOrders.length > 0 ? expectedProfit / activeOrders.length : 0 },
    metrics: { cpp: activeOrders.length > 0 ? metaSpendForView / activeOrders.length : 0,
      aov: activeOrders.length > 0 ? totalRevenue / activeOrders.length : 0,
      adSpendRatio: expectedRevenue > 0 ? metaSpendForView / expectedRevenue : 0 },
    products, orderDetails, allFamilies,
    metaAllocation,
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
