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

export function calculateFullPnL(orders, metaSpend = 0, customVendorPrices = {}, productFilter = null) {
  const allOrders = orders
  const activeAll = allOrders.filter(o => !o.cancelled)

  // If product filter is set, only include orders that contain that product
  let activeOrders = activeAll
  if (productFilter) {
    activeOrders = activeAll.filter(o =>
      o.lineItems.some(i => getProductFamily(i.title) === productFilter)
    )
  }
  const cancelledOrders = allOrders.filter(o => o.cancelled)

  const prepaidOrders = activeOrders.filter(o => o.paymentType === 'prepaid')
  const c2pOrders = activeOrders.filter(o => o.paymentType === 'c2p')
  const codOrders = activeOrders.filter(o => o.paymentType === 'cod')

  // ====== REVENUE ======
  // When filtered, only count revenue from the filtered product's line items
  let prepaidRevenue = 0, c2pRevenue = 0, codRevenue = 0
  let totalLineRevenue = 0

  if (productFilter) {
    activeOrders.forEach(o => {
      const matchingItems = o.lineItems.filter(i => getProductFamily(i.title) === productFilter)
      const itemRevenue = matchingItems.reduce((s, i) => s + (parseFloat(i.price) * i.quantity), 0)
      totalLineRevenue += itemRevenue
      if (o.paymentType === 'prepaid') prepaidRevenue += itemRevenue
      else if (o.paymentType === 'c2p') c2pRevenue += itemRevenue
      else codRevenue += itemRevenue
    })
  } else {
    prepaidRevenue = prepaidOrders.reduce((s, o) => s + o.totalPrice, 0)
    c2pRevenue = c2pOrders.reduce((s, o) => s + o.totalPrice, 0)
    codRevenue = codOrders.reduce((s, o) => s + o.totalPrice, 0)
  }
  const totalRevenue = prepaidRevenue + c2pRevenue + codRevenue

  // Expected revenue
  let c2pExpected, codExpected
  if (productFilter) {
    // For filtered view, allocate C2P expected proportionally
    const c2pUpfront = c2pOrders.length * C2P_AMOUNT
    c2pExpected = c2pRevenue > 0 ? c2pUpfront * (c2pRevenue / (c2pOrders.reduce((s, o) => s + o.totalPrice, 0) || 1)) + (c2pRevenue - c2pUpfront * (c2pRevenue / (c2pOrders.reduce((s, o) => s + o.totalPrice, 0) || 1))) * COD_DELIVERY_RATE : 0
    codExpected = codRevenue * COD_DELIVERY_RATE
  } else {
    c2pExpected = c2pOrders.reduce((s, o) => s + C2P_AMOUNT + Math.max(0, o.totalPrice - C2P_AMOUNT) * COD_DELIVERY_RATE, 0)
    codExpected = codOrders.reduce((s, o) => s + o.totalPrice * COD_DELIVERY_RATE, 0)
  }
  const expectedRevenue = prepaidRevenue + c2pExpected + codExpected
  const cashfreeCollection = prepaidRevenue + (c2pOrders.length * C2P_AMOUNT)

  // ====== PROCESS ORDERS & BUILD PRODUCT MAP ======
  let totalCOGS = 0
  const productMap = {}
  const orderDetails = []

  activeOrders.forEach(order => {
    let orderCOGS = 0
    const processedItems = []
    const itemsToProcess = productFilter
      ? order.lineItems.filter(i => getProductFamily(i.title) === productFilter)
      : order.lineItems

    itemsToProcess.forEach(item => {
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
          name: family,
          vendorPriceBase: vendorPrice,
          prepaidUnits: 0, codUnits: 0, c2pUnits: 0, totalUnits: 0,
          prepaidOrders: 0, codOrders: 0, c2pOrders: 0, totalOrders: 0,
          revenue: 0, vendorCost: 0,
          prepaidRevenue: 0, c2pRevenue: 0, codRevenue: 0,
          orderIds: new Set(),
          variants: {},
        }
      }
      const pf = productMap[family]
      pf.totalUnits += totalUnits
      pf.totalOrders += item.quantity
      pf.revenue += item.lineTotal
      pf.vendorCost += vendorCost
      pf.orderIds.add(order.id)
      if (order.paymentType === 'prepaid') { pf.prepaidUnits += totalUnits; pf.prepaidOrders += item.quantity; pf.prepaidRevenue += item.lineTotal }
      else if (order.paymentType === 'c2p') { pf.c2pUnits += totalUnits; pf.c2pOrders += item.quantity; pf.c2pRevenue += item.lineTotal }
      else { pf.codUnits += totalUnits; pf.codOrders += item.quantity; pf.codRevenue += item.lineTotal }

      if (!pf.variants[variantKey]) {
        pf.variants[variantKey] = {
          name: variantKey, vendorPrice: vendorPrice * packMult * buyMult,
          prepaidQty: 0, codQty: 0, c2pQty: 0, totalQty: 0,
          revenue: 0, vendorCost: 0,
        }
      }
      const vr = pf.variants[variantKey]
      vr.totalQty += item.quantity
      vr.revenue += item.lineTotal
      vr.vendorCost += vendorCost
      if (order.paymentType === 'prepaid') vr.prepaidQty += item.quantity
      else if (order.paymentType === 'c2p') vr.c2pQty += item.quantity
      else vr.codQty += item.quantity

      processedItems.push({
        title: item.title, variantTitle: item.variantTitle, family,
        quantity: item.quantity, buyMultiplier: buyMult, packMultiplier: packMult,
        totalUnits, sellingPrice: item.price, lineTotal: item.lineTotal,
        vendorPriceBase: vendorPrice, vendorCost,
      })
    })

    totalCOGS += orderCOGS
    const hasNecklace = order.lineItems.some(i => i.title.toLowerCase().includes('necklace'))
    const logistics = LOGISTICS_COSTS.box + LOGISTICS_COSTS.warrantyCard + LOGISTICS_COSTS.packingBag + LOGISTICS_COSTS.shipping + (hasNecklace ? LOGISTICS_COSTS.freeRing : 0)
    let feeBase = 0
    if (order.paymentType === 'prepaid') feeBase = order.totalPrice
    else if (order.paymentType === 'c2p') feeBase = C2P_AMOUNT
    const fees = feeBase * (FEE_RATES.cashfree + FEE_RATES.engage + FEE_RATES.checkout)

    if (processedItems.length > 0) {
      orderDetails.push({
        id: order.id, name: order.name, paymentType: order.paymentType,
        totalPrice: order.totalPrice, tags: order.tags,
        cogs: orderCOGS, logistics, fees,
        totalExpense: orderCOGS + logistics + fees,
        lineItems: processedItems,
      })
    }
  })

  // ====== LOGISTICS ======
  const necklaceOrders = activeOrders.filter(o => o.lineItems.some(i => i.title.toLowerCase().includes('necklace')))
  const totalBoxes = activeOrders.length * LOGISTICS_COSTS.box
  const totalWarranty = activeOrders.length * LOGISTICS_COSTS.warrantyCard
  const totalFreeRing = necklaceOrders.length * LOGISTICS_COSTS.freeRing
  const totalPacking = activeOrders.length * LOGISTICS_COSTS.packingBag
  const totalShipping = activeOrders.length * LOGISTICS_COSTS.shipping
  const totalLogistics = totalBoxes + totalWarranty + totalFreeRing + totalPacking + totalShipping

  // ====== FEES ======
  const feeBaseTotal = prepaidRevenue + (c2pOrders.length * C2P_AMOUNT)
  const totalCashfree = feeBaseTotal * FEE_RATES.cashfree
  const totalEngage = feeBaseTotal * FEE_RATES.engage
  const totalCheckout = feeBaseTotal * FEE_RATES.checkout
  const totalFees = totalCashfree + totalEngage + totalCheckout

  // ====== TOTAL ======
  const totalExpense = totalCOGS + totalLogistics + totalFees + metaSpend
  const expectedProfit = expectedRevenue - totalExpense

  // ====== PER-PRODUCT PROFIT ======
  const totalRevForAlloc = Object.values(productMap).reduce((s, p) => s + p.revenue, 0) || 1
  const products = Object.values(productMap)
    .map(p => {
      const share = p.revenue / totalRevForAlloc
      const pExpRev = p.prepaidRevenue
        + (p.c2pOrders > 0 ? (C2P_AMOUNT * p.c2pOrders) + Math.max(0, p.c2pRevenue - C2P_AMOUNT * p.c2pOrders) * COD_DELIVERY_RATE : 0)
        + p.codRevenue * COD_DELIVERY_RATE
      const pLogistics = totalLogistics * share
      const pFees = totalFees * share
      const pAds = metaSpend * share
      const pExpense = p.vendorCost + pLogistics + pFees + pAds
      const pProfit = pExpRev - pExpense
      return {
        ...p,
        orderCount: p.orderIds.size,
        expectedRevenue: pExpRev,
        allocatedLogistics: pLogistics,
        allocatedFees: pFees,
        allocatedAdSpend: pAds,
        totalExpense: pExpense,
        profit: pProfit,
        margin: pExpRev > 0 ? pProfit / pExpRev : 0,
        variants: Object.values(p.variants).sort((a, b) => b.revenue - a.revenue),
      }
    })
    .sort((a, b) => b.revenue - a.revenue)

  // Product family list for filter dropdown (always from ALL orders)
  const allFamilies = []
  const famSet = new Set()
  activeAll.forEach(o => {
    o.lineItems.forEach(i => {
      const f = getProductFamily(i.title)
      if (!famSet.has(f)) { famSet.add(f); allFamilies.push(f) }
    })
  })

  return {
    overview: {
      totalOrders: productFilter ? activeOrders.length : allOrders.length,
      activeOrders: activeOrders.length,
      cancelledOrders: cancelledOrders.length,
      prepaidOrders: prepaidOrders.length,
      c2pOrders: c2pOrders.length,
      codOrders: codOrders.length,
      prepaidRate: activeOrders.length > 0 ? prepaidOrders.length / activeOrders.length : 0,
    },
    revenue: {
      totalRevenue, expectedRevenue, prepaidRevenue,
      c2pRevenue, c2pExpected, codRevenue, codExpected, cashfreeCollection,
    },
    expenses: {
      metaAds: metaSpend, cogs: totalCOGS,
      boxes: totalBoxes, warrantyCard: totalWarranty, freeRing: totalFreeRing,
      packingBags: totalPacking, shipping: totalShipping, logistics: totalLogistics,
      cashfree: totalCashfree, engage: totalEngage, checkout: totalCheckout,
      totalFees, total: totalExpense,
    },
    profit: {
      expected: expectedProfit,
      margin: expectedRevenue > 0 ? expectedProfit / expectedRevenue : 0,
      perOrder: activeOrders.length > 0 ? expectedProfit / activeOrders.length : 0,
    },
    metrics: {
      cpp: activeOrders.length > 0 ? metaSpend / activeOrders.length : 0,
      aov: activeOrders.length > 0 ? totalRevenue / activeOrders.length : 0,
      adSpendRatio: expectedRevenue > 0 ? metaSpend / expectedRevenue : 0,
    },
    products,
    orderDetails,
    allFamilies: allFamilies.sort(),
  }
}

export function formatINR(amount) {
  if (amount === null || amount === undefined || isNaN(amount)) return '--'
  const abs = Math.abs(amount)
  const sign = amount < 0 ? '-' : ''
  if (abs >= 10000000) return `${sign}${(abs / 10000000).toFixed(2)} Cr`
  if (abs >= 100000) return `${sign}${(abs / 100000).toFixed(2)} L`
  if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(1)}K`
  return `${sign}${Math.round(abs)}`
}
export function formatPercent(v) { return v == null || isNaN(v) ? '--' : `${(v * 100).toFixed(1)}%` }
export function formatExact(n) { return n == null || isNaN(n) ? '--' : new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.round(n)) }
