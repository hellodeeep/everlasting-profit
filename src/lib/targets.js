import { LOGISTICS_COSTS, COD_DISPATCH_RATE, COD_DELIVERY_RATE, C2P_AMOUNT, FEE_RATES, findVendorPrice } from './vendorPrices'

export function getDaysInMonth(month) {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

export function getDaysElapsed(month) {
  const now = new Date()
  const [y, m] = month.split('-').map(Number)
  if (now.getFullYear() === y && now.getMonth() + 1 === m) return now.getDate()
  if (now > new Date(y, m, 0)) return getDaysInMonth(month)
  return 0
}

export function getCurrentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

// Auto-calculate profit from orders, CAC, AOV, vendor price, and prepaid rate
export function estimateProfit(p, daysInMonth) {
  const orders = p.ordersMonthly || 0
  const cac = p.cac || 0
  const aov = p.aov || 0
  const prepaidRate = (p.prepaidRate || 75) / 100
  const c2pRate = (p.c2pRate || 10) / 100
  const codRate = 1 - prepaidRate - c2pRate
  const vendorPrice = p.vendorPrice || 0
  const isNecklace = (p.name || '').toLowerCase().includes('necklace')

  // Expected revenue per order
  const prepaidRev = prepaidRate * aov
  const c2pRev = c2pRate * (C2P_AMOUNT + Math.max(0, aov - C2P_AMOUNT) * COD_DELIVERY_RATE)
  const codRev = codRate * aov * COD_DELIVERY_RATE
  const expectedRevPerOrder = prepaidRev + c2pRev + codRev

  // Meta spend per order (with GST)
  const metaPerOrder = cac * 1.18

  // COGS per order
  const cogsPerOrder = vendorPrice

  // Logistics per order
  const codC2pRate = c2pRate + codRate
  const box = LOGISTICS_COSTS.box
  const warranty = prepaidRate * LOGISTICS_COSTS.warrantyCard + codC2pRate * COD_DISPATCH_RATE * LOGISTICS_COSTS.warrantyCard
  const freeRing = isNecklace ? prepaidRate * LOGISTICS_COSTS.freeRing : 0
  const packing = prepaidRate * LOGISTICS_COSTS.packingBag + codC2pRate * COD_DISPATCH_RATE * LOGISTICS_COSTS.packingBag
  const shipping = prepaidRate * LOGISTICS_COSTS.shippingPrepaid + codC2pRate * COD_DISPATCH_RATE * LOGISTICS_COSTS.shippingCOD
  const logisticsPerOrder = box + warranty + freeRing + packing + shipping

  // Fees per order (on cashfree collection = prepaid + C2P upfront)
  const cashfreeBase = prepaidRate * aov + c2pRate * C2P_AMOUNT
  const feesPerOrder = cashfreeBase * (FEE_RATES.cashfree + FEE_RATES.engage + FEE_RATES.checkout)

  const profitPerOrder = expectedRevPerOrder - metaPerOrder - cogsPerOrder - logisticsPerOrder - feesPerOrder
  const profitMonthly = Math.round(profitPerOrder * orders)
  const profitPct = expectedRevPerOrder > 0 ? profitPerOrder / expectedRevPerOrder : 0

  return { profitPerOrder, profitMonthly, profitPct, expectedRevPerOrder }
}

export function computeProduct(p, daysInMonth) {
  const ordersDaily = Math.round((p.ordersMonthly || 0) / daysInMonth)
  const spendMonthly = (p.ordersMonthly || 0) * (p.cac || 0)
  const spendDaily = Math.round(spendMonthly / daysInMonth)
  const revenueMonthly = (p.ordersMonthly || 0) * (p.aov || 0)
  const revenueDaily = Math.round(revenueMonthly / daysInMonth)

  const est = estimateProfit(p, daysInMonth)

  return {
    ...p,
    ordersDaily, spendDaily, spendMonthly, revenueMonthly, revenueDaily,
    profitMonthly: est.profitMonthly,
    profitDaily: Math.round(est.profitMonthly / daysInMonth),
    profitPct: est.profitPct,
    profitPerOrder: est.profitPerOrder,
  }
}

// Day count for a target config: explicit window if set, else calendar month
export function targetDayCount(raw) {
  if (raw.windowStart && raw.windowEnd) {
    const s = new Date(raw.windowStart + 'T00:00:00')
    const e = new Date(raw.windowEnd + 'T00:00:00')
    return Math.max(1, Math.round((e - s) / 86400000) + 1)
  }
  return getDaysInMonth(raw.month)
}

export function buildTargets(raw) {
  // When a custom window is set, typed numbers are window totals, so we treat
  // the window's day count as the period. Otherwise it's the calendar month.
  const periodDays = targetDayCount(raw)
  const products = (raw.products || []).map(p => computeProduct(p, periodDays))
  return {
    month: raw.month,
    windowStart: raw.windowStart || null,
    windowEnd: raw.windowEnd || null,
    periodDays,
    isWindow: !!(raw.windowStart && raw.windowEnd),
    totalRevenue: products.reduce((s, p) => s + p.revenueMonthly, 0),
    totalProfit: products.reduce((s, p) => s + p.profitMonthly, 0),
    products,
  }
}

export const DEFAULT_RAW_TARGETS = {
  month: '2026-05',
  products: [
    { name: 'Name Necklace', code: 'PNN', ordersMonthly: 3000, cac: 500, aov: 1100, vendorPrice: 115, prepaidRate: 78, c2pRate: 8 },
    { name: 'Snake Anklet', code: 'SA', ordersMonthly: 3000, cac: 350, aov: 949, vendorPrice: 35, prepaidRate: 75, c2pRate: 10 },
    { name: 'Butterfly Anklet', code: 'BFA', ordersMonthly: 3000, cac: 350, aov: 949, vendorPrice: 31, prepaidRate: 75, c2pRate: 10 },
    { name: 'Personalised Car Keychain', code: 'PCK', ordersMonthly: 1500, cac: 450, aov: 875, vendorPrice: 75, prepaidRate: 80, c2pRate: 5 },
  ],
}

export const TARGETS_CACHE_KEY = 'targets_config'

// Per-month targets key so each month keeps its own targets (history preserved)
export function targetsKeyForMonth(month) {
  return `targets_config_${month}`
}

// ============================================================
// MULTI-TARGET MODEL (v63+)
// Each target is an independent object with a unique id, its own
// date window, a baseline comparison window, and per-product goals.
// ============================================================

import { C2P_AMOUNT as _C2P, COD_DELIVERY_RATE as _CODdel, COD_DISPATCH_RATE as _CODdis, LOGISTICS_COSTS as _LOG, FEE_RATES as _FEE } from './vendorPrices'

export const TARGETS_INDEX_KEY = 'targets_index'      // list of target ids + summaries
export function targetKey(id) { return `target_${id}` } // one row per target

export function newTargetId() {
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

export function dayCountBetween(start, end) {
  if (!start || !end) return 0
  const s = new Date(start + 'T00:00:00'), e = new Date(end + 'T00:00:00')
  return Math.max(0, Math.round((e - s) / 86400000) + 1)
}

// Cost-per-order pieces given AOV and payment mix (shared with estimateProfit logic)
function perOrderCosts({ aov, prepaidRate, c2pRate, vendorPrice, isNecklace }) {
  const codRate = Math.max(0, 1 - prepaidRate - c2pRate)
  const prepaidRev = prepaidRate * aov
  const c2pRev = c2pRate * (_C2P + Math.max(0, aov - _C2P) * _CODdel)
  const codRev = codRate * aov * _CODdel
  const expectedRevPerOrder = prepaidRev + c2pRev + codRev

  const cogsPerOrder = vendorPrice
  const codC2pRate = c2pRate + codRate
  const box = _LOG.box
  const warranty = prepaidRate * _LOG.warrantyCard + codC2pRate * _CODdis * _LOG.warrantyCard
  const freeRing = isNecklace ? prepaidRate * _LOG.freeRing : 0
  const packing = prepaidRate * _LOG.packingBag + codC2pRate * _CODdis * _LOG.packingBag
  const shipping = prepaidRate * _LOG.shippingPrepaid + codC2pRate * _CODdis * _LOG.shippingCOD
  const logisticsPerOrder = box + warranty + freeRing + packing + shipping

  const cashfreeBase = prepaidRate * aov + c2pRate * _C2P
  const feesPerOrder = cashfreeBase * (_FEE.cashfree + _FEE.engage + _FEE.checkout)

  return { expectedRevPerOrder, cogsPerOrder, logisticsPerOrder, feesPerOrder }
}

// Given a target profit % (of revenue), solve for the max pre-GST CAC that still hits it.
// profitPerOrder = targetPct * expectedRevPerOrder
// profitPerOrder = expectedRevPerOrder - cac*1.18 - cogs - logistics - fees
// => cac = (expectedRevPerOrder*(1-targetPct) - cogs - logistics - fees) / 1.18
export function solveCAC({ aov, prepaidRate, c2pRate, vendorPrice, isNecklace, targetProfitPct }) {
  const { expectedRevPerOrder, cogsPerOrder, logisticsPerOrder, feesPerOrder } =
    perOrderCosts({ aov, prepaidRate, c2pRate, vendorPrice, isNecklace })
  const allowedSpendPerOrder = expectedRevPerOrder * (1 - targetProfitPct) - cogsPerOrder - logisticsPerOrder - feesPerOrder
  const cac = allowedSpendPerOrder / 1.18
  return {
    cac: Math.max(0, cac),
    expectedRevPerOrder,
    profitPerOrder: expectedRevPerOrder * targetProfitPct,
    feasible: cac > 0,
  }
}

// Build the full derived economics for a target's product list.
// Each product carries: goalOrders, targetProfitPct, and baseline-derived aov/mix/vendorPrice.
export function buildTargetEconomics(target) {
  const days = dayCountBetween(target.windowStart, target.windowEnd)
  const products = (target.products || []).map(p => {
    const aov = p.aov || 0
    const prepaidRate = (p.prepaidRate ?? 75) / 100
    const c2pRate = (p.c2pRate ?? 10) / 100
    const vendorPrice = p.vendorPrice || 0
    const isNecklace = (p.name || '').toLowerCase().includes('necklace')
    const targetProfitPct = (p.targetProfitPct ?? 15) / 100
    const goalOrders = p.goalOrders || 0

    const solved = solveCAC({ aov, prepaidRate, c2pRate, vendorPrice, isNecklace, targetProfitPct })
    const expectedRevenue = goalOrders * aov
    const expectedSpend = goalOrders * solved.cac          // pre-GST
    const expectedSpendGst = expectedSpend * 1.18
    const expectedProfit = goalOrders * solved.profitPerOrder
    const ordersPerDay = days > 0 ? goalOrders / days : 0

    return {
      ...p,
      aov, prepaidRate, c2pRate, vendorPrice, targetProfitPct, goalOrders,
      requiredCAC: solved.cac,
      feasible: solved.feasible,
      expectedRevenue, expectedSpend, expectedSpendGst, expectedProfit,
      ordersPerDay,
      spendPerDayGst: days > 0 ? expectedSpendGst / days : 0,
      profitPerOrder: solved.profitPerOrder,
    }
  })
  return {
    days,
    products,
    totalGoalOrders: products.reduce((s, p) => s + p.goalOrders, 0),
    totalExpectedRevenue: products.reduce((s, p) => s + p.expectedRevenue, 0),
    totalExpectedSpend: products.reduce((s, p) => s + p.expectedSpend, 0),
    totalExpectedProfit: products.reduce((s, p) => s + p.expectedProfit, 0),
  }
}
