// Profit Engine v3 - Order-level, variant-level, C2P-aware
import { findVendorPrice, detectBuyMultiplier, detectPackMultiplier, C2P_AMOUNT, COD_DELIVERY_RATE, LOGISTICS_COSTS, FEE_RATES } from './vendorPrices'

/**
 * Get product family from full title
 * "Name Necklace - Gold / Buy 2 @ 1899" -> "Name Necklace"
 */
export function getProductFamily(title) {
  // Strip color/variant suffix
  let name = title
    .replace(/\s*-\s*(Gold|Silver|Rose Gold|Maroon|Gullabi|Blue|Black|White|Red|Pink|Green|Purple|Couple).*$/i, '')
    .replace(/\s*\/\s*.+$/, '')
    .replace(/\s*\(.*?\)/g, '')
    .trim()
  if (!name) name = title.split(' - ')[0].split(' / ')[0].trim()
  return name
}

/**
 * Get full variant key for detailed breakdown
 * "Name Necklace - Gold / Buy 2 @ 1899" -> "Name Necklace - Gold / Buy 2"
 */
export function getVariantKey(title, variantTitle) {
  if (variantTitle) return `${title.split(' / ')[0]} / ${variantTitle}`
  return title
}

/**
 * Process all orders into full P&L with product + variant breakdown
 */
export function calculateFullPnL(orders, metaSpend = 0, customVendorPrices = {}) {
  const activeOrders = orders.filter(o => !o.cancelled)
  const cancelledOrders = orders.filter(o => o.cancelled)

  // Classify orders
  const prepaidOrders = activeOrders.filter(o => o.paymentType === 'prepaid')
  const c2pOrders = activeOrders.filter(o => o.paymentType === 'c2p')
  const codOrders = activeOrders.filter(o => o.paymentType === 'cod')

  // ====== REVENUE ======
  const prepaidRevenue = prepaidOrders.reduce((s, o) => s + o.totalPrice, 0)
  const c2pRevenue = c2pOrders.reduce((s, o) => s + o.totalPrice, 0)
  const codRevenue = codOrders.reduce((s, o) => s + o.totalPrice, 0)
  const totalRevenue = prepaidRevenue + c2pRevenue + codRevenue

  // Expected revenue:
  // Prepaid = 100% collected
  // C2P = Rs.150 collected upfront + (total - 150) * delivery_rate
  // COD = total * delivery_rate
  const c2pExpected = c2pOrders.reduce((s, o) => {
    return s + C2P_AMOUNT + Math.max(0, o.totalPrice - C2P_AMOUNT) * COD_DELIVERY_RATE
  }, 0)
  const codExpected = codOrders.reduce((s, o) => s + o.totalPrice * COD_DELIVERY_RATE, 0)
  const expectedRevenue = prepaidRevenue + c2pExpected + codExpected

  // Cashfree collection (what hits bank today): prepaid full + C2P Rs.150 per order
  const cashfreeCollection = prepaidRevenue + (c2pOrders.length * C2P_AMOUNT)

  // ====== COGS (Order-level with line items) ======
  let totalCOGS = 0
  const productMap = {} // family -> aggregated data
  const variantMap = {} // variantKey -> aggregated data
  const orderDetails = [] // processed order array

  activeOrders.forEach(order => {
    let orderCOGS = 0
    const processedItems = []

    order.lineItems.forEach(item => {
      const vendorPrice = findVendorPrice(item.title, customVendorPrices)
      const buyMult = detectBuyMultiplier(item.title, item.variantTitle)
      const packMult = detectPackMultiplier(item.title, item.variantTitle)

      // Total units = quantity * buyMultiplier (Buy 2 = 2 necklaces)
      const totalUnits = item.quantity * buyMult
      // Vendor cost = base_price * pack_multiplier * buy_multiplier * quantity
      const vendorCost = vendorPrice * packMult * buyMult * item.quantity

      orderCOGS += vendorCost

      const family = getProductFamily(item.title)
      const variantKey = item.variantTitle
        ? `${item.title.split(' - ')[0].trim()} [${item.variantTitle}]`
        : item.title

      // Aggregate into product family
      if (!productMap[family]) {
        productMap[family] = {
          name: family,
          vendorPriceBase: vendorPrice,
          prepaidUnits: 0, codUnits: 0, c2pUnits: 0, totalUnits: 0,
          prepaidOrders: 0, codOrders: 0, c2pOrders: 0, totalOrders: 0,
          revenue: 0, vendorCost: 0,
          variants: {},
        }
      }
      const pf = productMap[family]
      pf.totalUnits += totalUnits
      pf.totalOrders += item.quantity
      pf.revenue += item.lineTotal
      pf.vendorCost += vendorCost
      if (order.paymentType === 'prepaid') { pf.prepaidUnits += totalUnits; pf.prepaidOrders += item.quantity }
      else if (order.paymentType === 'c2p') { pf.c2pUnits += totalUnits; pf.c2pOrders += item.quantity }
      else { pf.codUnits += totalUnits; pf.codOrders += item.quantity }

      // Aggregate into variant
      if (!pf.variants[variantKey]) {
        pf.variants[variantKey] = {
          name: variantKey,
          vendorPrice: vendorPrice * packMult * buyMult,
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
        title: item.title,
        variantTitle: item.variantTitle,
        family,
        quantity: item.quantity,
        buyMultiplier: buyMult,
        packMultiplier: packMult,
        totalUnits,
        sellingPrice: item.price,
        lineTotal: item.lineTotal,
        vendorPriceBase: vendorPrice,
        vendorCost,
      })
    })

    totalCOGS += orderCOGS

    // Logistics per shipment
    const hasNecklace = order.lineItems.some(i => i.title.toLowerCase().includes('necklace'))
    const logistics = LOGISTICS_COSTS.box + LOGISTICS_COSTS.warrantyCard + LOGISTICS_COSTS.packingBag + LOGISTICS_COSTS.shipping + (hasNecklace ? LOGISTICS_COSTS.freeRing : 0)

    // Fees on prepaid/c2p collected amount
    let feeBase = 0
    if (order.paymentType === 'prepaid') feeBase = order.totalPrice
    else if (order.paymentType === 'c2p') feeBase = C2P_AMOUNT
    const fees = feeBase * (FEE_RATES.cashfree + FEE_RATES.engage + FEE_RATES.checkout)

    orderDetails.push({
      id: order.id,
      name: order.name,
      paymentType: order.paymentType,
      totalPrice: order.totalPrice,
      cancelled: false,
      tags: order.tags,
      cogs: orderCOGS,
      logistics,
      fees,
      totalExpense: orderCOGS + logistics + fees,
      lineItems: processedItems,
    })
  })

  // ====== LOGISTICS (aggregate) ======
  const necklaceOrders = activeOrders.filter(o => o.lineItems.some(i => i.title.toLowerCase().includes('necklace')))
  const totalBoxes = activeOrders.length * LOGISTICS_COSTS.box
  const totalWarranty = activeOrders.length * LOGISTICS_COSTS.warrantyCard
  const totalFreeRing = necklaceOrders.length * LOGISTICS_COSTS.freeRing
  const totalPacking = activeOrders.length * LOGISTICS_COSTS.packingBag
  const totalShipping = activeOrders.length * LOGISTICS_COSTS.shipping
  const totalLogistics = totalBoxes + totalWarranty + totalFreeRing + totalPacking + totalShipping

  // ====== FEES (aggregate) ======
  const feeBaseTotal = prepaidRevenue + (c2pOrders.length * C2P_AMOUNT)
  const totalCashfree = feeBaseTotal * FEE_RATES.cashfree
  const totalEngage = feeBaseTotal * FEE_RATES.engage
  const totalCheckout = feeBaseTotal * FEE_RATES.checkout
  const totalFees = totalCashfree + totalEngage + totalCheckout

  // ====== TOTAL EXPENSE & PROFIT ======
  const totalExpenseBeforeAds = totalCOGS + totalLogistics + totalFees
  const totalExpense = totalExpenseBeforeAds + metaSpend
  const expectedProfit = expectedRevenue - totalExpense

  // Sort products by revenue desc, convert variants to arrays
  const products = Object.values(productMap)
    .map(p => ({
      ...p,
      variants: Object.values(p.variants).sort((a, b) => b.revenue - a.revenue),
    }))
    .sort((a, b) => b.revenue - a.revenue)

  return {
    overview: {
      totalOrders: orders.length,
      activeOrders: activeOrders.length,
      cancelledOrders: cancelledOrders.length,
      prepaidOrders: prepaidOrders.length,
      c2pOrders: c2pOrders.length,
      codOrders: codOrders.length,
      prepaidRate: activeOrders.length > 0 ? prepaidOrders.length / activeOrders.length : 0,
    },
    revenue: {
      totalRevenue,
      expectedRevenue,
      prepaidRevenue,
      c2pRevenue,
      c2pExpected,
      codRevenue,
      codExpected,
      cashfreeCollection,
    },
    expenses: {
      metaAds: metaSpend,
      cogs: totalCOGS,
      boxes: totalBoxes,
      warrantyCard: totalWarranty,
      freeRing: totalFreeRing,
      packingBags: totalPacking,
      shipping: totalShipping,
      logistics: totalLogistics,
      cashfree: totalCashfree,
      engage: totalEngage,
      checkout: totalCheckout,
      totalFees,
      totalBeforeAds: totalExpenseBeforeAds,
      total: totalExpense,
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

export function formatPercent(value) {
  if (value === null || value === undefined || isNaN(value)) return '--'
  return `${(value * 100).toFixed(1)}%`
}

export function formatExact(amount) {
  if (amount === null || amount === undefined || isNaN(amount)) return '--'
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.round(amount))
}
