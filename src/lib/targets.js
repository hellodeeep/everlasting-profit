const STORAGE_KEY = 'everlasting_targets'

// Default May 2026 targets from sheet
const DEFAULT_TARGETS = {
  month: '2026-05',
  totalRevenue: 8554630,
  totalProfit: 1910967,
  products: [
    { name: 'Name Necklace', code: 'PNN', cac: 500, ordersMonthly: 3000, ordersDaily: 96, spendMonthly: 1500000, spendDaily: 48387, aov: 1100, revenueMonthly: 3165000, revenueDaily: 102097, profitMonthly: 674000, profitDaily: 21742, profitPct: 0.213 },
    { name: 'Snake Anklet', code: 'SA', cac: 350, ordersMonthly: 3000, ordersDaily: 96, spendMonthly: 1050000, spendDaily: 33871, aov: 949, revenueMonthly: 2049840, revenueDaily: 66124, profitMonthly: 489545, profitDaily: 15792, profitPct: 0.239 },
    { name: 'Butterfly Anklet', code: 'BFA', cac: 350, ordersMonthly: 3000, ordersDaily: 96, spendMonthly: 1050000, spendDaily: 33871, aov: 949, revenueMonthly: 2049840, revenueDaily: 66124, profitMonthly: 489545, profitDaily: 15792, profitPct: 0.239 },
    { name: 'Personalised Car Keychain', code: 'PCK', cac: 450, ordersMonthly: 1500, ordersDaily: 48, spendMonthly: 675000, spendDaily: 21774, aov: 875, revenueMonthly: 1289950, revenueDaily: 41611, profitMonthly: 257877, profitDaily: 8319, profitPct: 0.200 },
  ]
}

export function getTargets() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : DEFAULT_TARGETS
  } catch { return DEFAULT_TARGETS }
}

export function saveTargets(targets) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(targets))
}

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

export { DEFAULT_TARGETS }
