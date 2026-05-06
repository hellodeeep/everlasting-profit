import { findVendorPrice, detectBuyMultiplier, detectPackMultiplier, C2P_AMOUNT, COD_DELIVERY_RATE, LOGISTICS_COSTS, FEE_RATES } from './vendorPrices'

export function getProductFamily(title) {
  let name = title
    .replace(/\s*-\s*(Gold|Silver|Rose Gold|Maroon|Gullabi|Blue|Black|White|Red|Pink|Green|Purple|Couple).*$/i, '')
    .replace(/\s*\/\s*.+$/, '')
    .replace(/\s*\(.*?\)/g, '')
    .trim()
  if (!name) name = title.split(' - ')[0].split(' / ')[0].trim()
  return name
}

/**
 * @param orders - array of orders from Shopify
 * @param metaAllocation - from allocateMetaSpend(): { productName: spend, _totalWithGST, _unallocated_withGST }
 * @param customVendorPrices - override map from product database
 * @param productFilter - optional product family name to filter by
 */
export function calculateFullPnL(orders, metaAllocation = {}, customVendorPrices = {}, productFilter = null) {
  const allOrders = orders
  const activeAll = allOrders.filter(o => !o.cancelled)

  let activeOrders = activeAll
  if (productFilter) {
    activeOrders = activeAll.filter(o =>
      o.lineItems.some(i => getProductFamily(i.title) === productFilter)
    )
  }

  const prepaidOrders = activeOrders.filter(o => o.paymentType === 'prepaid')
  const c2pOrders = activeOrders.filter(o => o.paymentType === 'c2p')
  const codOrders = activeOrders.filter(o => o.paymentType === 'cod')

  // ====== REVENUE ======
  let prepaidRevenue = 0, c2pRevenue = 0, codRevenue = 0
  if (productFilter) {
    activeOrders.forEach(o => {
      const rev = o.lineItems.filter(i => getProductFamily(i.title) === productFilter)
        .reduce((s, i) => s + (parseFloat(i.price) * i.quantity), 0)
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

  const c2pExpected = productFilter
    ? (c2pRevenue > 0 ? c2pOrders.length * C2P_AMOUNT * (c2pRevenue / (c2pOrders.reduce((s,o) => s+o.totalPrice,0)||1)) + (c2pRevenue - c2pOrders.length * C2P_AMOUNT * (c2pRevenue / (c2pOrders.reduce((s,o) => s+o.totalPrice,0)||1))) * COD_DELIVERY_RATE : 0)
    : c2pOrders.reduce((s, o) => s + C2P_AMOUNT + Math.max(0, o.totalPrice - C2P_AMOUNT) * COD_DELIVERY_RATE, 0)
  const codExpected = codRevenue * COD_DELIVERY_RATE
  const expectedRevenue = prepaidRevenue + c2pExpected + codExpected
  const cashfreeCollection = prepaidRevenue + (c2pOrders.length * C2P_AMOUNT)

  // ====== META SPEND (campaign-code based) ======
  const metaTotalWithGST = metaAllocation._totalWithGST || 0
  // For overall view: use total with GST
  // For product filter: use product-specific spend with GST (or unallocated share)
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
    const hasNecklace = order.lineItems.some(i => i.title.toLowerCase().includes('necklace'))
    const logistics = LOGISTICS_COSTS.box + LOGISTICS_COSTS.warrantyCard + LOGISTICS_COSTS.packingBag + LOGISTICS_COSTS.shipping + (hasNecklace ? LOGISTICS_COSTS.freeRing : 0)
    let feeBase = order.paymentType === 'prepaid' ? order.totalPrice : order.paymentType === 'c2p' ? C2P_AMOUNT : 0
    const fees = feeBase * (FEE_RATES.cashfree + FEE_RATES.engage + FEE_RATES.checkout)

    if (processedItems.length > 0) {
      orderDetails.push({ id: order.id, name: order.name, paymentType: order.paymentType,
        totalPrice: order.totalPrice, tags: order.tags, cogs: orderCOGS, logistics, fees,
        totalExpense: orderCOGS + logistics + fees, lineItems: processedItems })
    }
  })

  // ====== LOGISTICS & FEES ======
  const necklaceOrders = activeOrders.filter(o => o.lineItems.some(i => i.title.toLowerCase().includes('necklace')))
  const totalLogistics = activeOrders.length * (LOGISTICS_COSTS.box + LOGISTICS_COSTS.warrantyCard + LOGISTICS_COSTS.packingBag + LOGISTICS_COSTS.shipping) + necklaceOrders.length * LOGISTICS_COSTS.freeRing
  const feeBaseTotal = prepaidRevenue + (c2pOrders.length * C2P_AMOUNT)
  const totalFees = feeBaseTotal * (FEE_RATES.cashfree + FEE_RATES.engage + FEE_RATES.checkout)

  const totalExpense = totalCOGS + totalLogistics + totalFees + metaSpendForView
  const expectedProfit = expectedRevenue - totalExpense

  // ====== PER-PRODUCT PROFIT with campaign-based Meta spend ======
  const totalRevForAlloc = Object.values(productMap).reduce((s, p) => s + p.revenue, 0) || 1
  const products = Object.values(productMap).map(p => {
    const share = p.revenue / totalRevForAlloc
    const pExpRev = p.prepaidRevenue
      + (p.c2pOrders > 0 ? (C2P_AMOUNT * p.c2pOrders) + Math.max(0, p.c2pRevenue - C2P_AMOUNT * p.c2pOrders) * COD_DELIVERY_RATE : 0)
      + p.codRevenue * COD_DELIVERY_RATE

    // Campaign-based Meta spend for this product
    const metaKey = p.name + '_withGST'
    const hasCampaignCode = metaAllocation.hasOwnProperty(p.name)
    const pAds = metaAllocation[metaKey] || 0
    // Logistics & fees proportional
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

  // All product families
  const allFamilies = [...new Set(activeAll.flatMap(o => o.lineItems.map(i => getProductFamily(i.title))))].sort()

  return {
    overview: { totalOrders: productFilter ? activeOrders.length : allOrders.length,
      activeOrders: activeOrders.length, cancelledOrders: allOrders.filter(o => o.cancelled).length,
      prepaidOrders: prepaidOrders.length, c2pOrders: c2pOrders.length, codOrders: codOrders.length,
      prepaidRate: activeOrders.length > 0 ? prepaidOrders.length / activeOrders.length : 0 },
    revenue: { totalRevenue, expectedRevenue, prepaidRevenue, c2pRevenue, c2pExpected, codRevenue, codExpected, cashfreeCollection },
    expenses: { metaAds: metaSpendForView, metaAdsPreGST: metaSpendForView / 1.18,
      cogs: totalCOGS, logistics: totalLogistics, totalFees, total: totalExpense,
      boxes: activeOrders.length * LOGISTICS_COSTS.box, warrantyCard: activeOrders.length * LOGISTICS_COSTS.warrantyCard,
      freeRing: necklaceOrders.length * LOGISTICS_COSTS.freeRing, packingBags: activeOrders.length * LOGISTICS_COSTS.packingBag,
      shipping: activeOrders.length * LOGISTICS_COSTS.shipping,
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

export function formatINR(n) { if (n == null || isNaN(n)) return '--'; const a = Math.abs(n), s = n < 0 ? '-' : ''; if (a >= 1e7) return `${s}${(a/1e7).toFixed(2)} Cr`; if (a >= 1e5) return `${s}${(a/1e5).toFixed(2)} L`; if (a >= 1e3) return `${s}${(a/1e3).toFixed(1)}K`; return `${s}${Math.round(a)}` }
export function formatPercent(v) { return v == null || isNaN(v) ? '--' : `${(v*100).toFixed(1)}%` }
export function formatExact(n) { return n == null || isNaN(n) ? '--' : new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.round(n)) }
