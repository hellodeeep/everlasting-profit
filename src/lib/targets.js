// Target management - stored in IndexedDB via dataStore

export function getDaysInMonth(month) {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

export function getDaysElapsed(month) {
  const now = new Date()
  const [y, m] = month.split('-').map(Number)
  if (now.getFullYear() === y && now.getMonth() + 1 === m) {
    return now.getDate()
  }
  if (now > new Date(y, m, 0)) return getDaysInMonth(month)
  return 0
}

export function getCurrentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

// Compute derived fields from user inputs
export function computeProduct(p, daysInMonth) {
  const ordersDaily = Math.round(p.ordersMonthly / daysInMonth)
  const spendMonthly = p.ordersMonthly * p.cac
  const spendDaily = Math.round(spendMonthly / daysInMonth)
  const revenueMonthly = p.ordersMonthly * p.aov
  const revenueDaily = Math.round(revenueMonthly / daysInMonth)
  const profitDaily = Math.round(p.profitMonthly / daysInMonth)
  const profitPct = revenueMonthly > 0 ? p.profitMonthly / revenueMonthly : 0

  return {
    ...p,
    ordersDaily,
    spendDaily,
    spendMonthly,
    revenueMonthly,
    revenueDaily,
    profitDaily,
    profitPct,
  }
}

// Build a full target object with computed fields
export function buildTargets(raw) {
  const daysInMonth = getDaysInMonth(raw.month)
  const products = (raw.products || []).map(p => computeProduct(p, daysInMonth))
  const totalRevenue = products.reduce((s, p) => s + p.revenueMonthly, 0)
  const totalProfit = products.reduce((s, p) => s + p.profitMonthly, 0)

  return {
    month: raw.month,
    totalRevenue,
    totalProfit,
    products,
  }
}

// Default May 2026 targets (used as initial data if nothing saved)
export const DEFAULT_RAW_TARGETS = {
  month: '2026-05',
  products: [
    { name: 'Name Necklace', code: 'PNN', ordersMonthly: 3000, cac: 500, aov: 1100, profitMonthly: 674000 },
    { name: 'Snake Anklet', code: 'SA', ordersMonthly: 3000, cac: 350, aov: 949, profitMonthly: 489545 },
    { name: 'Butterfly Anklet', code: 'BFA', ordersMonthly: 3000, cac: 350, aov: 949, profitMonthly: 489545 },
    { name: 'Personalised Car Keychain', code: 'PCK', ordersMonthly: 1500, cac: 450, aov: 875, profitMonthly: 257877 },
  ],
}

export const TARGETS_CACHE_KEY = 'targets_config'
