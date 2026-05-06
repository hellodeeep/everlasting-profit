// Profit Engine - mirrors the Expected Profit Tracker spreadsheet logic
// All calculations are pure functions, no side effects

/**
 * Calculate profit for a single product given Shopify + Meta data + COGS
 *
 * @param {Object} params
 * @param {Object} params.shopify - Shopify data for this product
 *   { totalQty, prepaidQty, codQty, prepaidRevenue, codRevenue }
 * @param {Object} params.cogs - COGS breakdown
 *   { product, box, card, packingBag, shipping, prepaidRing, codFee }
 * @param {number} params.adSpend - Allocated ad spend for this product
 * @param {number} params.softwarePercent - Software expense as % of revenue (default 5%)
 * @param {number} params.deliveryRate - Delivery rate for COD (default 0.7)
 * @param {number} params.c2pPayment - C2P partial payment amount (default 150)
 * @param {Object} params.sellingPrice - { prepaid, cod }
 * @returns {Object} Full P&L breakdown
 */
export function calculateProfit({
  shopify = {},
  cogs = {},
  adSpend = 0,
  softwarePercent = 0.05,
  deliveryRate = 0.7,
  c2pPayment = 150,
  sellingPrice = { prepaid: 0, cod: 0 },
}) {
  // --- Unit Economics ---
  const productCost = cogs.product || 0
  const box = cogs.box || 0
  const card = cogs.card || 0
  const packingBag = cogs.packingBag || 0
  const shipping = cogs.shipping || 0
  const prepaidRing = cogs.prepaidRing || 0
  const codFee = cogs.codFee || 0

  const totalBase = productCost + box + card + packingBag + shipping
  const prepaidCOGS = totalBase + prepaidRing
  const codCOGS = totalBase + codFee

  const prepaidProfitPerUnit = sellingPrice.prepaid - prepaidCOGS
  const codProfitPerUnit = sellingPrice.cod - codCOGS

  // --- Order Metrics (from Shopify) ---
  const totalOrders = shopify.totalQty || 0
  const prepaidOrders = shopify.prepaidQty || 0
  const codOrders = shopify.codQty || 0

  // Estimated delivered COD (using delivery rate)
  const codDelivered = Math.floor(codOrders * deliveryRate)
  const totalDelivered = prepaidOrders + codDelivered

  // --- Revenue ---
  const prepaidRevenue = shopify.prepaidRevenue || (prepaidOrders * sellingPrice.prepaid)
  const codRevenue = codDelivered * sellingPrice.cod
  const netRevenue = prepaidRevenue + codRevenue

  // --- Expenses ---
  const totalCOG = (prepaidOrders * prepaidCOGS) + (codOrders * codCOGS)
  const softwareExp = netRevenue * softwarePercent
  const totalExpense = totalCOG + adSpend + softwareExp

  // --- Profit ---
  const grossProfit = netRevenue - totalCOG
  const netProfit = netRevenue - totalExpense

  // --- Ratios ---
  const grossMargin = netRevenue > 0 ? grossProfit / netRevenue : 0
  const netMargin = netRevenue > 0 ? netProfit / netRevenue : 0
  const adSpendRatio = netRevenue > 0 ? adSpend / netRevenue : 0
  const prepaidRate = totalOrders > 0 ? prepaidOrders / totalOrders : 0
  const rtoRate = 1 - deliveryRate

  // --- Per Order Metrics ---
  const cpp = totalOrders > 0 ? adSpend / totalOrders : 0
  const cppWithoutGST = cpp / 1.18
  const targetCAP = sellingPrice.prepaid > 0 ? cpp / sellingPrice.prepaid : 0

  // --- Cash Flow ---
  const prepaidCashIn = prepaidRevenue
  const codCashIn = codDelivered * sellingPrice.cod

  return {
    unitEconomics: {
      totalBase,
      prepaidCOGS,
      codCOGS,
      prepaidProfitPerUnit,
      codProfitPerUnit,
    },
    orders: {
      totalOrders,
      prepaidOrders,
      codOrders,
      codDelivered,
      totalDelivered,
      prepaidRate,
      rtoRate,
    },
    revenue: {
      prepaidRevenue,
      codRevenue,
      netRevenue,
    },
    expenses: {
      totalCOG,
      adSpend,
      softwareExp,
      totalExpense,
    },
    profit: {
      grossProfit,
      netProfit,
      grossMargin,
      netMargin,
    },
    metrics: {
      adSpendRatio,
      cpp,
      cppWithoutGST,
      targetCAP,
    },
    cashFlow: {
      prepaidCashIn,
      codCashIn,
      totalCashIn: prepaidCashIn + codCashIn,
    },
  }
}

/**
 * Calculate aggregate profit across all products
 */
export function calculateAggregate(productResults) {
  const agg = {
    totalOrders: 0,
    totalDelivered: 0,
    netRevenue: 0,
    totalCOG: 0,
    totalAdSpend: 0,
    totalSoftwareExp: 0,
    totalExpense: 0,
    grossProfit: 0,
    netProfit: 0,
    prepaidCashIn: 0,
    codCashIn: 0,
  }

  productResults.forEach(r => {
    agg.totalOrders += r.orders.totalOrders
    agg.totalDelivered += r.orders.totalDelivered
    agg.netRevenue += r.revenue.netRevenue
    agg.totalCOG += r.expenses.totalCOG
    agg.totalAdSpend += r.expenses.adSpend
    agg.totalSoftwareExp += r.expenses.softwareExp
    agg.totalExpense += r.expenses.totalExpense
    agg.grossProfit += r.profit.grossProfit
    agg.netProfit += r.profit.netProfit
    agg.prepaidCashIn += r.cashFlow.prepaidCashIn
    agg.codCashIn += r.cashFlow.codCashIn
  })

  agg.grossMargin = agg.netRevenue > 0 ? agg.grossProfit / agg.netRevenue : 0
  agg.netMargin = agg.netRevenue > 0 ? agg.netProfit / agg.netRevenue : 0
  agg.adSpendRatio = agg.netRevenue > 0 ? agg.totalAdSpend / agg.netRevenue : 0
  agg.totalCashIn = agg.prepaidCashIn + agg.codCashIn

  return agg
}

/**
 * Format currency in INR
 */
export function formatINR(amount, decimals = 0) {
  if (amount === null || amount === undefined || isNaN(amount)) return '--'
  const abs = Math.abs(amount)
  const sign = amount < 0 ? '-' : ''

  if (abs >= 10000000) return `${sign}${(abs / 10000000).toFixed(2)} Cr`
  if (abs >= 100000) return `${sign}${(abs / 100000).toFixed(2)} L`
  if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(1)}K`
  return `${sign}${abs.toFixed(decimals)}`
}

export function formatPercent(value) {
  if (value === null || value === undefined || isNaN(value)) return '--'
  return `${(value * 100).toFixed(1)}%`
}
