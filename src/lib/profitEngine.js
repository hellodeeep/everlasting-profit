// Profit Engine v2 - Order-level processing
// Mirrors the manual Excel sheet logic exactly

import { findVendorPrice, detectMultiplier, isPackProduct, LOGISTICS_COSTS, FEE_RATES } from './vendorPrices'

/**
 * Normalize a product title into a "family" name
 * "Name Necklace - Gold / Buy 2 @ 1899" -> "Name Necklace"
 * "Snake Anklet - Pack of 2 ( Both Leg ) / Silver" -> "Snake Anklet"
 * "Premium Gift Box with Gift Wrap" -> "Premium Gift Box"
 */
export function getProductFamily(title) {
  let name = title
    .replace(/\s*-\s*(Gold|Silver|Rose Gold|Maroon|Gullabi|Blue|Black|White|Red|Pink|Green|Purple).*$/i, '')
    .replace(/\s*\/\s*(Buy|Pack|Gold|Silver|Rose|Single|Both|Male|Female|R|One|Two).*$/i, '')
    .replace(/\s*-\s*(Pack of|Buy).*$/i, '')
    .replace(/\s+with\s+(Gift Wrap|Message Card|Personalised).*$/i, '')
    .replace(/\s*\(.*?\)\s*/g, '')
    .trim()

  // Normalize known families
  const lower = name.toLowerCase()
  if (lower.includes('premium gift box')) return 'Premium Gift Box'
  if (lower.includes('name necklace') && !lower.includes('arabic') && !lower.includes('flower') && !lower.includes('queen') && !lower.includes('angel') && !lower.includes('fairy') && !lower.includes('butterfly') && !lower.includes('cross') && !lower.includes('mangalsutra') && !lower.includes('hindi') && !lower.includes('punjabi') && !lower.includes('indic') && !lower.includes('double') && !lower.includes('couple') && !lower.includes('signature') && !lower.includes('fimo') && !lower.includes('photo')) return 'Name Necklace'

  return name
}

/**
 * Process a single order and calculate its expected profit contribution
 */
export function processOrder(order, customVendorPrices = {}) {
  if (order.cancelled) {
    return {
      orderId: order.id,
      cancelled: true,
      paymentMethod: order.paymentMethod,
      revenue: 0,
      expectedRevenue: 0,
      totalCOGS: 0,
      logistics: 0,
      lineItems: [],
    }
  }

  const isPrepaid = order.paymentMethod === 'prepaid'

  // Process each line item
  const processedItems = order.lineItems.map(item => {
    const vendorPrice = findVendorPrice(item.title, customVendorPrices)
    const multiplier = detectMultiplier(item.title, item.variantTitle)
    const isPack = isPackProduct(item.title)

    // For "Pack of 2 (Both Leg)" products, vendor price is already for the pack
    let unitVendorCost = vendorPrice
    if (isPack) {
      unitVendorCost = vendorPrice * 2 // e.g., Snake Anklet 35*2 = 70 for pack of 2
    }

    // For "Buy 2 @ 1899" - multiply vendor cost by buy quantity
    const totalVendorCost = unitVendorCost * multiplier * item.quantity

    return {
      title: item.title,
      variantTitle: item.variantTitle,
      family: getProductFamily(item.title),
      quantity: item.quantity,
      multiplier,
      sellingPrice: item.price,
      lineTotal: item.lineTotal,
      vendorPricePerUnit: vendorPrice,
      totalVendorCost,
      isGiftBox: item.title.toLowerCase().includes('premium gift box'),
    }
  })

  // Logistics: 1 shipment per order, regardless of items
  const hasNecklace = processedItems.some(i =>
    i.title.toLowerCase().includes('necklace') && !i.isGiftBox
  )
  const logisticsCost =
    LOGISTICS_COSTS.box +
    LOGISTICS_COSTS.warrantyCard +
    LOGISTICS_COSTS.packingBag +
    LOGISTICS_COSTS.shipping +
    (hasNecklace ? LOGISTICS_COSTS.freeRing : 0)

  const totalCOGS = processedItems.reduce((s, i) => s + i.totalVendorCost, 0)

  // Revenue calculation
  // Prepaid: full order total
  // COD Expected: order total * 0.5 (50% delivery assumption from your sheet)
  const orderRevenue = order.totalPrice
  const expectedRevenue = isPrepaid ? orderRevenue : orderRevenue * 0.5

  // Fees on prepaid revenue
  const cashfreeFee = isPrepaid ? orderRevenue * FEE_RATES.cashfree : 0
  const engageFee = isPrepaid ? orderRevenue * FEE_RATES.engage : 0
  const checkoutFee = isPrepaid ? orderRevenue * FEE_RATES.checkout : 0
  const totalFees = cashfreeFee + engageFee + checkoutFee

  // Expected profit for this order (before ad spend)
  const totalExpense = totalCOGS + logisticsCost + totalFees
  const expectedProfit = expectedRevenue - totalExpense

  return {
    orderId: order.id,
    cancelled: false,
    paymentMethod: order.paymentMethod,
    revenue: orderRevenue,
    expectedRevenue,
    totalCOGS,
    logistics: logisticsCost,
    fees: totalFees,
    cashfreeFee,
    engageFee,
    checkoutFee,
    totalExpense,
    expectedProfit,
    lineItems: processedItems,
  }
}

/**
 * Process all orders and generate full P&L
 */
export function calculateFullPnL(orders, metaSpend = 0, customVendorPrices = {}) {
  const processed = orders.map(o => processOrder(o, customVendorPrices))
  const active = processed.filter(o => !o.cancelled)
  const prepaid = active.filter(o => o.paymentMethod === 'prepaid')
  const cod = active.filter(o => o.paymentMethod === 'cod')

  // Overall P&L
  const totalRevenue = active.reduce((s, o) => s + o.revenue, 0)
  const expectedRevenue = active.reduce((s, o) => s + o.expectedRevenue, 0)
  const totalCOGS = active.reduce((s, o) => s + o.totalCOGS, 0)
  const totalLogistics = active.reduce((s, o) => s + o.logistics, 0)
  const totalFees = active.reduce((s, o) => s + o.fees, 0)
  const totalExpenseBeforeAds = totalCOGS + totalLogistics + totalFees
  const totalExpense = totalExpenseBeforeAds + metaSpend
  const expectedProfit = expectedRevenue - totalExpense
  const actualRevenuePrepaid = prepaid.reduce((s, o) => s + o.revenue, 0)

  // Product-wise breakdown
  const productMap = {}
  active.forEach(order => {
    order.lineItems.forEach(item => {
      const family = item.family
      if (!productMap[family]) {
        productMap[family] = {
          name: family,
          vendorPrice: item.vendorPricePerUnit,
          prepaidQty: 0,
          codQty: 0,
          totalQty: 0,
          totalUnits: 0, // accounting for multipliers
          prepaidRevenue: 0,
          codRevenue: 0,
          totalRevenue: 0,
          totalVendorCost: 0,
          expectedRate: 0, // vendor_cost * (prepaid + cod/2)
          orderCount: 0,
        }
      }
      const p = productMap[family]
      const qty = item.quantity
      const units = qty * item.multiplier

      if (order.paymentMethod === 'prepaid') {
        p.prepaidQty += units
      } else {
        p.codQty += units
      }
      p.totalQty += units
      p.totalUnits += units
      p.totalRevenue += item.lineTotal
      if (order.paymentMethod === 'prepaid') p.prepaidRevenue += item.lineTotal
      else p.codRevenue += item.lineTotal
      p.totalVendorCost += item.totalVendorCost
      p.orderCount++
    })
  })

  // Calculate expected rates per product (vendor_cost * (prepaid + cod/2))
  Object.values(productMap).forEach(p => {
    p.expectedRate = p.vendorPrice * (p.prepaidQty + p.codQty / 2)
  })

  // Sort by total revenue descending
  const products = Object.values(productMap).sort((a, b) => b.totalRevenue - a.totalRevenue)

  return {
    overview: {
      totalOrders: orders.length,
      activeOrders: active.length,
      cancelledOrders: orders.length - active.length,
      prepaidOrders: prepaid.length,
      codOrders: cod.length,
      prepaidRate: active.length > 0 ? prepaid.length / active.length : 0,
    },
    revenue: {
      totalRevenue,
      expectedRevenue,
      prepaidRevenue: actualRevenuePrepaid,
      codRevenue: cod.reduce((s, o) => s + o.revenue, 0),
    },
    expenses: {
      metaAds: metaSpend,
      cogs: totalCOGS,
      logistics: totalLogistics,
      boxes: active.length * LOGISTICS_COSTS.box,
      warrantyCard: active.length * LOGISTICS_COSTS.warrantyCard,
      freeRing: active.filter(o => o.lineItems.some(i => i.title.toLowerCase().includes('necklace'))).length * LOGISTICS_COSTS.freeRing,
      packingBags: active.length * LOGISTICS_COSTS.packingBag,
      shipping: active.length * LOGISTICS_COSTS.shipping,
      cashfree: prepaid.reduce((s, o) => s + o.cashfreeFee, 0),
      engage: prepaid.reduce((s, o) => s + o.engageFee, 0),
      checkout: prepaid.reduce((s, o) => s + o.checkoutFee, 0),
      totalFees,
      totalBeforeAds: totalExpenseBeforeAds,
      total: totalExpense,
    },
    profit: {
      expected: expectedProfit,
      margin: expectedRevenue > 0 ? expectedProfit / expectedRevenue : 0,
      perOrder: active.length > 0 ? expectedProfit / active.length : 0,
    },
    metrics: {
      cpp: active.length > 0 ? metaSpend / active.length : 0,
      aov: active.length > 0 ? totalRevenue / active.length : 0,
      adSpendRatio: expectedRevenue > 0 ? metaSpend / expectedRevenue : 0,
    },
    products,
    processedOrders: processed,
  }
}

// Formatting helpers
export function formatINR(amount) {
  if (amount === null || amount === undefined || isNaN(amount)) return '--'
  const abs = Math.abs(amount)
  const sign = amount < 0 ? '-' : ''
  if (abs >= 10000000) return `${sign}${(abs / 10000000).toFixed(2)} Cr`
  if (abs >= 100000) return `${sign}${(abs / 100000).toFixed(2)} L`
  if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(1)}K`
  return `${sign}${Math.round(abs)}`
}

export function formatPercent(value) {
  if (value === null || value === undefined || isNaN(value)) return '--'
  return `${(value * 100).toFixed(1)}%`
}
