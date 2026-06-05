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

export function buildTargets(raw) {
  const daysInMonth = getDaysInMonth(raw.month)
  const products = (raw.products || []).map(p => computeProduct(p, daysInMonth))
  return {
    month: raw.month,
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
