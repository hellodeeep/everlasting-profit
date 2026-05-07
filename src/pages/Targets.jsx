import React, { useState, useMemo, useCallback } from 'react'
import { Target, TrendingUp, Calendar, Zap, RefreshCw, ChevronDown, Info, ArrowUp, ArrowDown } from 'lucide-react'
import { getTargets, getDaysInMonth, getDaysElapsed } from '../lib/targets'
import { useDataStore } from '../lib/dataStore'
import { calculateFullPnL, formatExact, formatPercent, getProductFamily } from '../lib/profitEngine'
import { getProducts, buildCampaignMap, buildVendorPriceMap, allocateMetaSpend } from '../lib/productDB'
import { fetchShopifyOrders, fetchMetaSpend } from '../lib/api'

function Bar({ pct, color = 'bg-brand-500', h = 'h-2.5' }) {
  return (
    <div className={`w-full ${h} rounded-full bg-brand-800/40 overflow-hidden`}>
      <div className={`${h} rounded-full transition-all duration-500 ${color}`} style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }} />
    </div>
  )
}

function Tip({ children }) {
  return <p className="text-[10px] text-brand-600 mt-1 leading-relaxed">{children}</p>
}

function Delta({ actual, target, inverse, prefix = '₹', suffix = '' }) {
  const diff = actual - target
  const isGood = inverse ? diff <= 0 : diff >= 0
  if (Math.abs(diff) < 1) return <span className="text-[10px] text-brand-500">On target</span>
  return (
    <span className={`text-[10px] font-mono flex items-center gap-0.5 ${isGood ? 'text-cash-green' : 'text-cash-red'}`}>
      {isGood ? <ArrowUp size={8} /> : <ArrowDown size={8} />}
      {diff > 0 ? '+' : ''}{prefix}{formatExact(Math.abs(diff))}{suffix}
    </span>
  )
}

export default function Targets() {
  const targets = getTargets()
  const { cache, getCachedData, setCachedData } = useDataStore()
  const [syncing, setSyncing] = useState(false)
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0, day: '' })
  const [showDaily, setShowDaily] = useState(false)

  const month = targets.month
  const daysTotal = getDaysInMonth(month)
  const daysElapsed = getDaysElapsed(month)
  const daysRemaining = daysTotal - daysElapsed
  const timePct = daysElapsed / daysTotal * 100

  const cachedDays = useMemo(() => {
    let count = 0
    for (let i = 1; i <= daysElapsed; i++) {
      if (getCachedData(`${month}-${String(i).padStart(2, '0')}`, `${month}-${String(i).padStart(2, '0')}`)) count++
    }
    return count
  }, [cache, month, daysElapsed])

  const syncMTD = useCallback(async () => {
    setSyncing(true)
    const days = []
    for (let i = 1; i <= daysElapsed; i++) days.push(`${month}-${String(i).padStart(2, '0')}`)
    const toFetch = days.filter(ds => !getCachedData(ds, ds))
    setSyncProgress({ current: 0, total: toFetch.length, day: '' })
    for (let i = 0; i < toFetch.length; i++) {
      const ds = toFetch[i]
      setSyncProgress({ current: i + 1, total: toFetch.length, day: ds })
      try {
        const [shopRes, metaRes] = await Promise.allSettled([fetchShopifyOrders(ds, ds), fetchMetaSpend(ds, ds)])
        setCachedData(ds, ds, {
          orders: shopRes.status === 'fulfilled' ? shopRes.value.orders : [],
          metaCampaigns: metaRes.status === 'fulfilled' ? (metaRes.value?.campaigns || []) : [],
          metaRawSpend: metaRes.status === 'fulfilled' ? (metaRes.value?.summary?.totalSpend || 0) : 0,
          apiMeta: shopRes.status === 'fulfilled' ? shopRes.value.meta : {},
        })
      } catch (e) { console.warn(`Failed ${ds}:`, e) }
    }
    setSyncing(false)
  }, [month, daysElapsed, getCachedData, setCachedData])

  // Build daily + MTD data
  const { dailyRows, mtdPnl } = useMemo(() => {
    const dbProducts = getProducts()
    const campaignMap = buildCampaignMap(dbProducts)
    const vendorPriceMap = buildVendorPriceMap(dbProducts)
    const rows = []
    let allOrders = [], allCampaigns = []

    for (let i = 1; i <= daysElapsed; i++) {
      const ds = `${month}-${String(i).padStart(2, '0')}`
      const data = getCachedData(ds, ds)
      if (!data) { rows.push({ date: ds, day: i, empty: true }); continue }
      const meta = allocateMetaSpend(data.metaCampaigns || [], campaignMap)
      const pnl = calculateFullPnL(data.orders || [], meta, vendorPriceMap)
      rows.push({ date: ds, day: i, orders: pnl.overview.activeOrders, prepaid: pnl.overview.prepaidOrders,
        revenue: pnl.revenue.expectedRevenue, metaSpend: pnl.expenses.metaAds, profit: pnl.profit.expected,
        margin: pnl.profit.margin, aov: pnl.metrics.aov, cpp: pnl.metrics.cpp, products: pnl.products })
      allOrders.push(...(data.orders || []))
      allCampaigns.push(...(data.metaCampaigns || []))
    }

    let mtdPnl = null
    if (allOrders.length > 0) {
      const mtdMeta = allocateMetaSpend(allCampaigns, campaignMap)
      mtdPnl = calculateFullPnL(allOrders, mtdMeta, vendorPriceMap)
    }
    return { dailyRows: rows, mtdPnl }
  }, [cache, month, daysElapsed])

  const p = mtdPnl
  const hasFetched = dailyRows.some(r => !r.empty)

  // Targets
  const tOrdMonth = targets.products.reduce((s, t) => s + t.ordersMonthly, 0)
  const tOrdDaily = targets.products.reduce((s, t) => s + t.ordersDaily, 0)
  const tRevMonth = targets.totalRevenue
  const tProfitMonth = targets.totalProfit
  const tSpendMonth = targets.products.reduce((s, t) => s + t.spendMonthly, 0)
  const tSpendDaily = targets.products.reduce((s, t) => s + t.spendDaily, 0)

  // MTD targets (what you should have achieved by now)
  const tOrdMTD = Math.round(tOrdDaily * daysElapsed)
  const tRevMTD = Math.round(tRevMonth / daysTotal * daysElapsed)
  const tProfitMTD = Math.round(tProfitMonth / daysTotal * daysElapsed)
  const tSpendMTD = Math.round(tSpendDaily * daysElapsed)

  // Actuals
  const aOrd = p?.overview.activeOrders || 0
  const aRev = p?.revenue.expectedRevenue || 0
  const aProfit = p?.profit.expected || 0
  const aSpend = p?.expenses.metaAds || 0
  const aCAC = aOrd > 0 ? aSpend / aOrd : 0
  const aAOV = aOrd > 0 ? aRev / aOrd : 0
  const tCACavg = tOrdMonth > 0 ? tSpendMonth / tOrdMonth : 0
  const tAOVavg = tOrdMonth > 0 ? tRevMonth / tOrdMonth : 0

  // Projections
  const proj = (v) => daysElapsed > 0 ? Math.round(v / daysElapsed * daysTotal) : 0
  const pOrd = proj(aOrd), pRev = proj(aRev), pProfit = proj(aProfit), pSpend = proj(aSpend)

  // Needed for rest of month
  const neededOrdDay = daysRemaining > 0 ? Math.ceil((tOrdMonth - aOrd) / daysRemaining) : tOrdDaily
  const neededSpendDay = daysRemaining > 0 ? Math.ceil((tSpendMonth - aSpend) / daysRemaining) : tSpendDaily
  const neededRevDay = daysRemaining > 0 ? Math.ceil((tRevMonth - aRev) / daysRemaining) : Math.round(tRevMonth / daysTotal)
  const avgOrdDay = daysElapsed > 0 ? Math.round(aOrd / daysElapsed) : 0
  const avgSpendDay = daysElapsed > 0 ? Math.round(aSpend / daysElapsed) : 0
  const avgRevDay = daysElapsed > 0 ? Math.round(aRev / daysElapsed) : 0

  return (
    <div className="space-y-5 fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-accent">Target vs Reality</h2>
          <p className="text-sm text-brand-400 mt-1">May 2026 | Day {daysElapsed}/{daysTotal} | {cachedDays}/{daysElapsed} days synced</p>
        </div>
        <button onClick={syncMTD} disabled={syncing} className="btn-primary flex items-center gap-2">
          <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
          {syncing ? `Day ${syncProgress.current}/${syncProgress.total}` : cachedDays < daysElapsed ? `Sync ${daysElapsed - cachedDays} Missing Days` : 'Refresh All'}
        </button>
      </div>

      {syncing && (
        <div className="glass-card p-3">
          <div className="flex justify-between mb-1.5">
            <span className="text-xs text-brand-400">Fetching {syncProgress.day}...</span>
            <span className="text-xs font-mono text-accent">{syncProgress.current}/{syncProgress.total}</span>
          </div>
          <Bar pct={syncProgress.total > 0 ? syncProgress.current / syncProgress.total * 100 : 0} />
        </div>
      )}

      {/* Month Progress */}
      <div className="glass-card p-4">
        <div className="flex justify-between mb-2">
          <span className="text-xs text-brand-400 flex items-center gap-1"><Calendar size={12} /> Month Progress</span>
          <span className="text-xs font-mono text-accent">{timePct.toFixed(0)}% done | {daysRemaining} days left</span>
        </div>
        <Bar pct={timePct} color="bg-brand-500" h="h-3" />
      </div>

      {!hasFetched && !syncing && (
        <div className="glass-card p-10 text-center">
          <Target size={48} className="text-brand-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-accent mb-2">Sync your data first</h3>
          <p className="text-sm text-brand-400">Click "Sync Missing Days" above. Each day takes ~2 seconds.</p>
        </div>
      )}

      {p && (<>

        {/* ============ SECTION 1: SPEND PACING ============ */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-accent mb-1">Meta Ad Spend Pacing</h3>
          <Tip>Are you spending enough on ads to hit your targets? Underspending = missing orders. Overspending with high CAC = wasting money.</Tip>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
            <div>
              <p className="text-[10px] text-brand-500 mb-1">Spent So Far (MTD)</p>
              <p className="text-xl font-bold font-mono text-accent">₹{formatExact(aSpend)}</p>
              <Delta actual={aSpend} target={tSpendMTD} />
              <Tip>You should have spent ₹{formatExact(tSpendMTD)} by Day {daysElapsed}.</Tip>
            </div>
            <div>
              <p className="text-[10px] text-brand-500 mb-1">Avg Daily Spend</p>
              <p className="text-xl font-bold font-mono text-accent">₹{formatExact(avgSpendDay)}</p>
              <Delta actual={avgSpendDay} target={tSpendDaily} />
              <Tip>Target is ₹{formatExact(tSpendDaily)}/day. This is your total daily Meta budget.</Tip>
            </div>
            <div>
              <p className="text-[10px] text-brand-500 mb-1">Spend Needed Rest of Month</p>
              <p className={`text-xl font-bold font-mono ${neededSpendDay > tSpendDaily * 1.3 ? 'text-cash-red' : 'text-accent'}`}>₹{formatExact(neededSpendDay)}/day</p>
              <Tip>To hit ₹{formatExact(tSpendMonth)} monthly target, spend ₹{formatExact(neededSpendDay)}/day for the next {daysRemaining} days.</Tip>
            </div>
            <div>
              <p className="text-[10px] text-brand-500 mb-1">Projected Month Spend</p>
              <p className="text-xl font-bold font-mono text-brand-300">₹{formatExact(pSpend)}</p>
              <Tip>At current pace, you'll spend ₹{formatExact(pSpend)} this month vs target ₹{formatExact(tSpendMonth)}.</Tip>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-brand-800/20">
            <div className="flex justify-between mb-1.5">
              <span className="text-[10px] text-brand-500">Spend: ₹{formatExact(aSpend)} / ₹{formatExact(tSpendMonth)}</span>
              <span className="text-[10px] font-mono text-brand-400">{(aSpend / tSpendMonth * 100).toFixed(1)}%</span>
            </div>
            <div className="relative">
              <Bar pct={aSpend / tSpendMonth * 100} color="bg-brand-400" h="h-3" />
              {/* Time marker */}
              <div className="absolute top-0 bottom-0 border-l-2 border-yellow-500 border-dashed" style={{ left: `${timePct}%` }}>
                <span className="absolute -top-4 -translate-x-1/2 text-[8px] text-yellow-500">Day {daysElapsed}</span>
              </div>
            </div>
            <Tip>Yellow line = where you should be based on time elapsed. Bar = actual spend. If bar is behind the line, you're underspending.</Tip>
          </div>
        </div>

        {/* ============ SECTION 2: ORDERS & REVENUE PACING ============ */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-accent mb-1">Orders & Revenue Pacing</h3>
          <Tip>Orders come from ad spend. Revenue = Orders x AOV. If orders are low, either spend more or improve CAC.</Tip>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
            <div>
              <p className="text-[10px] text-brand-500 mb-1">Orders MTD</p>
              <p className={`text-xl font-bold font-mono ${aOrd >= tOrdMTD * 0.9 ? 'text-cash-green' : 'text-cash-red'}`}>{formatExact(aOrd)}</p>
              <Delta actual={aOrd} target={tOrdMTD} prefix="" />
              <Tip>Target by Day {daysElapsed}: {formatExact(tOrdMTD)} orders. Monthly target: {formatExact(tOrdMonth)}.</Tip>
            </div>
            <div>
              <p className="text-[10px] text-brand-500 mb-1">Revenue MTD</p>
              <p className={`text-xl font-bold font-mono ${aRev >= tRevMTD * 0.9 ? 'text-cash-green' : 'text-cash-red'}`}>₹{formatExact(aRev)}</p>
              <Delta actual={aRev} target={tRevMTD} />
              <Tip>Expected Revenue = Prepaid (100%) + C2P (₹150 upfront + remaining x 30%) + COD (x 30%).</Tip>
            </div>
            <div>
              <p className="text-[10px] text-brand-500 mb-1">Orders Needed/Day</p>
              <p className={`text-xl font-bold font-mono ${neededOrdDay <= tOrdDaily * 1.2 ? 'text-yellow-400' : 'text-cash-red'}`}>{neededOrdDay}/day</p>
              <Tip>You're doing {avgOrdDay}/day. Target is {tOrdDaily}/day. Need {neededOrdDay}/day for remaining {daysRemaining} days.</Tip>
            </div>
            <div>
              <p className="text-[10px] text-brand-500 mb-1">Profit MTD</p>
              <p className={`text-xl font-bold font-mono ${aProfit >= tProfitMTD * 0.9 ? 'text-cash-green' : 'text-cash-red'}`}>₹{formatExact(aProfit)}</p>
              <Delta actual={aProfit} target={tProfitMTD} />
              <Tip>Profit = Revenue - (Meta + COGS + Shipping + Packaging + Fees). Target margin: ~{(tProfitMonth/tRevMonth*100).toFixed(0)}%.</Tip>
            </div>
          </div>
        </div>

        {/* ============ SECTION 3: EFFICIENCY METRICS ============ */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-accent mb-1">Efficiency: CAC & AOV</h3>
          <Tip>CAC = how much you spend to get 1 order. AOV = how much each order is worth. Profit = AOV - CAC - COGS - other costs. Lower CAC or higher AOV = more profit.</Tip>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
            <div>
              <p className="text-[10px] text-brand-500 mb-1">Overall CAC</p>
              <p className={`text-xl font-bold font-mono ${aCAC <= tCACavg ? 'text-cash-green' : 'text-cash-red'}`}>₹{formatExact(aCAC)}</p>
              <Delta actual={aCAC} target={tCACavg} inverse />
              <Tip>CAC = Total Meta Spend (₹{formatExact(aSpend)}) / Total Orders ({aOrd}) = ₹{formatExact(aCAC)}. Target: ₹{formatExact(tCACavg)}. Lower is better.</Tip>
            </div>
            <div>
              <p className="text-[10px] text-brand-500 mb-1">Overall AOV</p>
              <p className={`text-xl font-bold font-mono ${aAOV >= tAOVavg * 0.9 ? 'text-cash-green' : 'text-yellow-400'}`}>₹{formatExact(aAOV)}</p>
              <Delta actual={aAOV} target={tAOVavg} />
              <Tip>AOV = Total Revenue (₹{formatExact(aRev)}) / Total Orders ({aOrd}) = ₹{formatExact(aAOV)}. Target: ₹{formatExact(tAOVavg)}. Higher is better.</Tip>
            </div>
            <div>
              <p className="text-[10px] text-brand-500 mb-1">Profit Margin</p>
              <p className={`text-xl font-bold font-mono ${(p?.profit.margin||0) >= 0.15 ? 'text-cash-green' : 'text-cash-red'}`}>{((p?.profit.margin||0)*100).toFixed(1)}%</p>
              <Tip>Margin = Profit / Revenue. Target: {(tProfitMonth/tRevMonth*100).toFixed(1)}%. Shows how much of every rupee earned is actual profit.</Tip>
            </div>
            <div>
              <p className="text-[10px] text-brand-500 mb-1">Ad Spend Ratio</p>
              <p className={`text-xl font-bold font-mono ${aRev > 0 && aSpend/aRev <= 0.55 ? 'text-cash-green' : 'text-cash-red'}`}>{aRev > 0 ? (aSpend/aRev*100).toFixed(1) : 0}%</p>
              <Tip>What % of revenue goes to Meta ads. Target: {(tSpendMonth/tRevMonth*100).toFixed(0)}%. Lower means more room for profit. Above 60% is dangerous.</Tip>
            </div>
          </div>
        </div>

        {/* ============ SECTION 4: MONTH-END PROJECTION ============ */}
        <div className="glass-card p-5 bg-brand-900/30">
          <h3 className="text-sm font-semibold text-accent mb-1 flex items-center gap-2"><TrendingUp size={14} /> Month-End Projection</h3>
          <Tip>Based on your average daily performance over {daysElapsed} days. If you scale up or down, this projection changes.</Tip>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
            {[
              { label: 'Orders', proj: pOrd, target: tOrdMonth, prefix: '' },
              { label: 'Revenue', proj: pRev, target: tRevMonth, prefix: '₹' },
              { label: 'Ad Spend', proj: pSpend, target: tSpendMonth, prefix: '₹' },
              { label: 'Profit', proj: pProfit, target: tProfitMonth, prefix: '₹' },
            ].map(({ label, proj: projected, target, prefix }) => {
              const pct = target > 0 ? projected / target * 100 : 0
              const gap = target - projected
              const willHit = pct >= 90
              return (
                <div key={label} className="text-center">
                  <p className="text-[10px] text-brand-500 uppercase mb-1">{label}</p>
                  <p className={`text-xl font-bold font-mono ${willHit ? 'text-cash-green' : 'text-cash-red'}`}>{prefix}{formatExact(projected)}</p>
                  <p className="text-[10px] text-brand-500">Target: {prefix}{formatExact(target)}</p>
                  <p className={`text-[10px] font-mono ${willHit ? 'text-cash-green' : 'text-cash-red'}`}>
                    {pct.toFixed(0)}% {gap > 0 ? `(short ${prefix}${formatExact(gap)})` : '(on track)'}
                  </p>
                </div>
              )
            })}
          </div>

          {/* Daily comparison strip */}
          <div className="mt-5 pt-4 border-t border-brand-800/20">
            <div className="overflow-x-auto">
              <table className="w-full text-center">
                <thead><tr className="text-[9px] text-brand-500 uppercase">
                  <td className="py-1 px-2"></td><td className="py-1 px-2">Orders/Day</td><td className="py-1 px-2">Spend/Day</td><td className="py-1 px-2">Revenue/Day</td><td className="py-1 px-2">CAC</td><td className="py-1 px-2">AOV</td>
                </tr></thead>
                <tbody className="text-xs font-mono">
                  <tr className="text-brand-300">
                    <td className="py-1.5 px-2 text-left text-[10px] text-brand-500 uppercase">Your Avg</td>
                    <td className="py-1.5 px-2">{avgOrdDay}</td>
                    <td className="py-1.5 px-2">₹{formatExact(avgSpendDay)}</td>
                    <td className="py-1.5 px-2">₹{formatExact(avgRevDay)}</td>
                    <td className={`py-1.5 px-2 ${aCAC <= tCACavg ? 'text-cash-green' : 'text-cash-red'}`}>₹{formatExact(aCAC)}</td>
                    <td className={`py-1.5 px-2 ${aAOV >= tAOVavg * 0.9 ? 'text-cash-green' : 'text-yellow-400'}`}>₹{formatExact(aAOV)}</td>
                  </tr>
                  <tr className="text-brand-500">
                    <td className="py-1.5 px-2 text-left text-[10px] uppercase">Target</td>
                    <td className="py-1.5 px-2">{tOrdDaily}</td>
                    <td className="py-1.5 px-2">₹{formatExact(tSpendDaily)}</td>
                    <td className="py-1.5 px-2">₹{formatExact(Math.round(tRevMonth / daysTotal))}</td>
                    <td className="py-1.5 px-2">₹{formatExact(tCACavg)}</td>
                    <td className="py-1.5 px-2">₹{formatExact(tAOVavg)}</td>
                  </tr>
                  <tr className={`font-bold ${neededOrdDay <= tOrdDaily * 1.3 ? 'text-yellow-400' : 'text-cash-red'}`}>
                    <td className="py-1.5 px-2 text-left text-[10px] uppercase">Need/Day</td>
                    <td className="py-1.5 px-2">{neededOrdDay}</td>
                    <td className="py-1.5 px-2">₹{formatExact(neededSpendDay)}</td>
                    <td className="py-1.5 px-2">₹{formatExact(neededRevDay)}</td>
                    <td className="py-1.5 px-2">-</td>
                    <td className="py-1.5 px-2">-</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <Tip>"Need/Day" = what you must average over the remaining {daysRemaining} days to hit monthly targets. If this is much higher than Target, you're behind and need to either scale spend or improve efficiency.</Tip>
          </div>
        </div>

        {/* ============ SECTION 5: PRODUCT-WISE BREAKDOWN ============ */}
        <h3 className="text-xs text-brand-400 uppercase tracking-wider font-semibold mt-2">Product-wise Breakdown</h3>
        <Tip>Each product has its own target. A product can be on track even if overall numbers are behind, and vice versa. Focus on the products that are furthest behind.</Tip>

        {targets.products.map(t => {
          const actual = p.products.find(pr => pr.name === t.name)
          const aO = actual?.totalUnits || 0
          const aR = actual?.revenue || 0
          const aM = actual?.metaSpend || 0
          const aC = aO > 0 ? aM / aO : 0
          const aA = aO > 0 ? aR / aO : 0
          const tO = Math.round(t.ordersDaily * daysElapsed)
          const tR = Math.round(t.revenueDaily * daysElapsed)
          const tM = Math.round(t.spendDaily * daysElapsed)
          const oPct = tO > 0 ? aO / tO * 100 : 0
          const rPct = tR > 0 ? aR / tR * 100 : 0
          const mPct = tM > 0 ? aM / tM * 100 : 0
          const dailyRate = daysElapsed > 0 ? aO / daysElapsed : 0
          const projO = Math.round(dailyRate * daysTotal)
          const needDay = daysRemaining > 0 ? Math.ceil((t.ordersMonthly - aO) / daysRemaining) : t.ordersDaily
          const needSpendDay = daysRemaining > 0 ? Math.ceil((t.spendMonthly - aM) / daysRemaining) : t.spendDaily

          return (
            <div key={t.name} className="glass-card p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <h4 className="text-base font-semibold text-accent">{t.name}</h4>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-brand-800/40 text-brand-400">{t.code}</span>
                </div>
                <span className={`text-sm font-bold font-mono px-2 py-0.5 rounded ${oPct >= 90 ? 'bg-green-900/20 text-cash-green' : oPct >= 70 ? 'bg-yellow-900/20 text-yellow-400' : 'bg-red-900/15 text-cash-red'}`}>
                  {oPct.toFixed(0)}%
                </span>
              </div>

              {/* Metrics grid */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead><tr className="text-[9px] text-brand-500 uppercase text-left">
                    <th className="py-1 px-2"></th><th className="py-1 px-2">Orders</th><th className="py-1 px-2">Revenue</th><th className="py-1 px-2">Meta Spend</th><th className="py-1 px-2">CAC</th><th className="py-1 px-2">AOV</th>
                  </tr></thead>
                  <tbody className="text-xs font-mono">
                    <tr>
                      <td className="py-1.5 px-2 text-[10px] text-brand-500 uppercase">Actual MTD</td>
                      <td className={`py-1.5 px-2 font-bold ${oPct >= 90 ? 'text-cash-green' : 'text-cash-red'}`}>{aO}</td>
                      <td className={`py-1.5 px-2 ${rPct >= 90 ? 'text-cash-green' : 'text-cash-red'}`}>₹{formatExact(aR)}</td>
                      <td className="py-1.5 px-2 text-brand-300">₹{formatExact(aM)}</td>
                      <td className={`py-1.5 px-2 ${aC > 0 && aC <= t.cac ? 'text-cash-green' : aC > 0 ? 'text-cash-red' : 'text-brand-600'}`}>{aC > 0 ? `₹${Math.round(aC)}` : '--'}</td>
                      <td className={`py-1.5 px-2 ${aA >= t.aov * 0.9 ? 'text-cash-green' : aA > 0 ? 'text-yellow-400' : 'text-brand-600'}`}>{aA > 0 ? `₹${Math.round(aA)}` : '--'}</td>
                    </tr>
                    <tr className="text-brand-500">
                      <td className="py-1.5 px-2 text-[10px] uppercase">Target MTD</td>
                      <td className="py-1.5 px-2">{tO}</td>
                      <td className="py-1.5 px-2">₹{formatExact(tR)}</td>
                      <td className="py-1.5 px-2">₹{formatExact(tM)}</td>
                      <td className="py-1.5 px-2">₹{t.cac}</td>
                      <td className="py-1.5 px-2">₹{t.aov}</td>
                    </tr>
                    <tr className="text-brand-600 border-t border-brand-800/20">
                      <td className="py-1.5 px-2 text-[10px] uppercase">Monthly Target</td>
                      <td className="py-1.5 px-2">{formatExact(t.ordersMonthly)}</td>
                      <td className="py-1.5 px-2">₹{formatExact(t.revenueMonthly)}</td>
                      <td className="py-1.5 px-2">₹{formatExact(t.spendMonthly)}</td>
                      <td className="py-1.5 px-2">₹{t.cac}</td>
                      <td className="py-1.5 px-2">₹{t.aov}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Action */}
              <div className={`mt-3 px-3 py-2.5 rounded-lg text-xs leading-relaxed ${oPct >= 90 ? 'bg-green-900/10 text-cash-green' : 'bg-red-900/10 text-brand-300'}`}>
                <Zap size={10} className="inline mr-1" />
                {oPct >= 95 ? (
                  <span>On track. Doing {Math.round(dailyRate)} orders/day vs target {t.ordersDaily}/day. Projected {formatExact(projO)}/{formatExact(t.ordersMonthly)} orders by month end.</span>
                ) : (
                  <span>
                    <strong className="text-accent">Behind by {tO - aO} orders.</strong>{' '}
                    Doing {Math.round(dailyRate)}/day, need <strong className="text-accent">{needDay}/day</strong> for the next {daysRemaining} days (target was {t.ordersDaily}/day).{' '}
                    {aM < tM * 0.85 && <><br/>Spend is also behind: ₹{formatExact(aM)} vs target ₹{formatExact(tM)}. Increase daily budget to ₹{formatExact(needSpendDay)}/day. </>}
                    {aC > t.cac && aC > 0 && <><br/>CAC is ₹{Math.round(aC)} vs target ₹{t.cac}. Optimize creatives or audiences to bring CAC down by ₹{Math.round(aC - t.cac)}. </>}
                    {aA > 0 && aA < t.aov * 0.85 && <><br/>AOV is ₹{Math.round(aA)} vs target ₹{t.aov}. Push higher-value bundles (Buy 2, Gift Box combos) to lift AOV. </>}
                  </span>
                )}
              </div>
            </div>
          )
        })}

        {/* ============ SECTION 6: DAILY TABLE ============ */}
        <div className="glass-card overflow-hidden">
          <button onClick={() => setShowDaily(!showDaily)} className="w-full px-5 py-3 flex items-center justify-between hover:bg-brand-900/20">
            <h3 className="text-sm font-semibold text-accent">Daily Breakdown</h3>
            <ChevronDown size={16} className={`text-brand-400 transition-transform ${showDaily ? 'rotate-180' : ''}`} />
          </button>
          {showDaily && (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead><tr className="border-b border-brand-800/30 text-[10px] text-brand-400 uppercase tracking-wider">
                  <th className="py-2 px-3">Date</th><th className="py-2 px-3 text-right">Orders</th><th className="py-2 px-3 text-right">Revenue</th>
                  <th className="py-2 px-3 text-right">Meta</th><th className="py-2 px-3 text-right">CPP</th><th className="py-2 px-3 text-right">AOV</th>
                  <th className="py-2 px-3 text-right">Profit</th><th className="py-2 px-3 text-right">Margin</th>
                </tr></thead>
                <tbody>
                  {dailyRows.map(r => (
                    <tr key={r.date} className={`border-b border-brand-800/10 ${r.empty ? 'opacity-30' : 'hover:bg-brand-900/20'}`}>
                      <td className="py-2 px-3 text-xs font-mono text-brand-300">
                        {new Date(r.date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', weekday: 'short' })}
                      </td>
                      {r.empty ? <td colSpan={7} className="py-2 px-3 text-xs text-brand-600 text-center">Not synced</td> : <>
                        <td className={`py-2 px-3 text-right font-mono text-xs ${r.orders >= tOrdDaily ? 'text-cash-green' : 'text-cash-red'}`}>{r.orders}</td>
                        <td className="py-2 px-3 text-right font-mono text-xs text-brand-200">₹{formatExact(r.revenue)}</td>
                        <td className="py-2 px-3 text-right font-mono text-xs text-brand-300">₹{formatExact(r.metaSpend)}</td>
                        <td className={`py-2 px-3 text-right font-mono text-xs ${r.cpp <= tCACavg ? 'text-cash-green' : 'text-cash-red'}`}>₹{formatExact(r.cpp)}</td>
                        <td className="py-2 px-3 text-right font-mono text-xs text-brand-300">₹{formatExact(r.aov)}</td>
                        <td className={`py-2 px-3 text-right font-mono text-xs font-bold ${r.profit >= 0 ? 'text-cash-green' : 'text-cash-red'}`}>₹{formatExact(r.profit)}</td>
                        <td className={`py-2 px-3 text-right font-mono text-xs ${r.margin >= 0.2 ? 'text-cash-green' : r.margin >= 0 ? 'text-yellow-400' : 'text-cash-red'}`}>{(r.margin*100).toFixed(1)}%</td>
                      </>}
                    </tr>
                  ))}
                </tbody>
                {hasFetched && <tfoot>
                  <tr className="border-t-2 border-brand-700/50 bg-brand-950/40 text-xs font-mono font-bold">
                    <td className="py-2.5 px-3 text-accent">MTD</td>
                    <td className="py-2.5 px-3 text-right text-accent">{aOrd}</td>
                    <td className="py-2.5 px-3 text-right">₹{formatExact(aRev)}</td>
                    <td className="py-2.5 px-3 text-right">₹{formatExact(aSpend)}</td>
                    <td className="py-2.5 px-3 text-right">₹{formatExact(aCAC)}</td>
                    <td className="py-2.5 px-3 text-right">₹{formatExact(aAOV)}</td>
                    <td className={`py-2.5 px-3 text-right ${aProfit >= 0 ? 'text-cash-green' : 'text-cash-red'}`}>₹{formatExact(aProfit)}</td>
                    <td className="py-2.5 px-3 text-right">{aRev > 0 ? (aProfit/aRev*100).toFixed(1) : 0}%</td>
                  </tr>
                </tfoot>}
              </table>
            </div>
          )}
        </div>

      </>)}
    </div>
  )
}
