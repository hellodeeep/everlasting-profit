import React, { useState, useMemo, useCallback } from 'react'
import { Target, TrendingUp, Calendar, Zap, RefreshCw, AlertTriangle, ChevronDown } from 'lucide-react'
import { getTargets, getDaysInMonth, getDaysElapsed } from '../lib/targets'
import { useDataStore } from '../lib/dataStore'
import { calculateFullPnL, formatExact, formatPercent, getProductFamily } from '../lib/profitEngine'
import { getProducts, buildCampaignMap, buildVendorPriceMap, allocateMetaSpend } from '../lib/productDB'
import { fetchShopifyOrders, fetchMetaSpend } from '../lib/api'

function Bar({ pct, color = 'bg-brand-500', h = 'h-2.5' }) {
  return (
    <div className={`w-full ${h} rounded-full bg-brand-800/40 overflow-hidden`}>
      <div className={`${h} rounded-full transition-all duration-500 ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  )
}

function BigStat({ label, actual, target, prefix = '₹', good }) {
  const pct = target > 0 ? (actual / target * 100) : 0
  const isGood = good !== undefined ? good : pct >= 95
  return (
    <div className="glass-card p-5">
      <p className="text-[10px] text-brand-400 uppercase tracking-wider mb-2">{label}</p>
      <p className={`text-2xl font-bold font-mono ${isGood ? 'text-cash-green' : pct >= 75 ? 'text-yellow-400' : 'text-cash-red'}`}>
        {prefix}{formatExact(actual)}
      </p>
      <div className="flex items-center gap-2 mt-2">
        <div className="flex-1"><Bar pct={pct} color={isGood ? 'bg-cash-green' : pct >= 75 ? 'bg-yellow-500' : 'bg-red-500'} /></div>
        <span className="text-xs font-mono text-brand-400 w-10 text-right">{pct.toFixed(0)}%</span>
      </div>
      <p className="text-[10px] text-brand-500 mt-1.5">Target: {prefix}{formatExact(target)}</p>
    </div>
  )
}

export default function Targets() {
  const targets = getTargets()
  const { cache, getCachedData, setCachedData } = useDataStore()
  const [syncing, setSyncing] = useState(false)
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0, day: '' })
  const [showDaily, setShowDaily] = useState(true)

  const month = targets.month
  const daysTotal = getDaysInMonth(month)
  const daysElapsed = getDaysElapsed(month)
  const daysRemaining = daysTotal - daysElapsed
  const timePct = (daysElapsed / daysTotal * 100)

  // Count cached days
  const cachedDays = useMemo(() => {
    let count = 0
    for (let i = 1; i <= daysElapsed; i++) {
      const ds = `${month}-${String(i).padStart(2, '0')}`
      if (getCachedData(ds, ds)) count++
    }
    return count
  }, [cache, month, daysElapsed])

  // Day-by-day sync
  const syncMTD = useCallback(async () => {
    setSyncing(true)
    const days = []
    for (let i = 1; i <= daysElapsed; i++) {
      days.push(`${month}-${String(i).padStart(2, '0')}`)
    }
    const toFetch = days.filter(ds => !getCachedData(ds, ds))
    setSyncProgress({ current: 0, total: toFetch.length, day: '' })

    for (let i = 0; i < toFetch.length; i++) {
      const ds = toFetch[i]
      setSyncProgress({ current: i + 1, total: toFetch.length, day: ds })
      try {
        const [shopRes, metaRes] = await Promise.allSettled([
          fetchShopifyOrders(ds, ds),
          fetchMetaSpend(ds, ds),
        ])
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

  // Build daily breakdown + MTD aggregates
  const { dailyRows, mtdPnl, mtdMeta } = useMemo(() => {
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
      rows.push({
        date: ds, day: i,
        orders: pnl.overview.activeOrders,
        prepaid: pnl.overview.prepaidOrders,
        revenue: pnl.revenue.expectedRevenue,
        metaSpend: pnl.expenses.metaAds,
        profit: pnl.profit.expected,
        margin: pnl.profit.margin,
        aov: pnl.metrics.aov,
        cpp: pnl.metrics.cpp,
        products: pnl.products,
      })
      allOrders.push(...(data.orders || []))
      allCampaigns.push(...(data.metaCampaigns || []))
    }

    // MTD aggregate
    let mtdPnl = null, mtdMeta = {}
    if (allOrders.length > 0) {
      mtdMeta = allocateMetaSpend(allCampaigns, campaignMap)
      mtdPnl = calculateFullPnL(allOrders, mtdMeta, vendorPriceMap)
    }
    return { dailyRows: rows, mtdPnl, mtdMeta }
  }, [cache, month, daysElapsed])

  const p = mtdPnl
  const hasFetchedDays = dailyRows.some(r => !r.empty)

  // Target calculations
  const tOrdersMonthly = targets.products.reduce((s, t) => s + t.ordersMonthly, 0)
  const tRevenueMonthly = targets.totalRevenue
  const tProfitMonthly = targets.totalProfit
  const tSpendMonthly = targets.products.reduce((s, t) => s + t.spendMonthly, 0)

  const tOrdersMTD = Math.round(targets.products.reduce((s, t) => s + t.ordersDaily, 0) * daysElapsed)
  const tRevenueMTD = Math.round(tRevenueMonthly / daysTotal * daysElapsed)
  const tProfitMTD = Math.round(tProfitMonthly / daysTotal * daysElapsed)
  const tSpendMTD = Math.round(tSpendMonthly / daysTotal * daysElapsed)

  const aOrders = p?.overview.activeOrders || 0
  const aRevenue = p?.revenue.expectedRevenue || 0
  const aProfit = p?.profit.expected || 0
  const aSpend = p?.expenses.metaAds || 0

  // Projections
  const projOrders = daysElapsed > 0 ? Math.round(aOrders / daysElapsed * daysTotal) : 0
  const projRevenue = daysElapsed > 0 ? Math.round(aRevenue / daysElapsed * daysTotal) : 0
  const projProfit = daysElapsed > 0 ? Math.round(aProfit / daysElapsed * daysTotal) : 0
  const neededOrdersPerDay = daysRemaining > 0 ? Math.ceil((tOrdersMonthly - aOrders) / daysRemaining) : 0
  const currentOrdersPerDay = daysElapsed > 0 ? Math.round(aOrders / daysElapsed) : 0
  const targetOrdersPerDay = targets.products.reduce((s, t) => s + t.ordersDaily, 0)

  return (
    <div className="space-y-5 fade-in">
      {/* Header + Sync */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-accent">Target vs Reality</h2>
          <p className="text-sm text-brand-400 mt-1">May 2026 -- Day {daysElapsed}/{daysTotal} | {cachedDays}/{daysElapsed} days synced</p>
        </div>
        <button onClick={syncMTD} disabled={syncing} className="btn-primary flex items-center gap-2">
          <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
          {syncing ? `Day ${syncProgress.current}/${syncProgress.total}` : cachedDays < daysElapsed ? `Sync ${daysElapsed - cachedDays} Missing Days` : 'Refresh All'}
        </button>
      </div>

      {/* Sync Progress */}
      {syncing && (
        <div className="glass-card p-3">
          <div className="flex justify-between mb-1.5">
            <span className="text-xs text-brand-400">Fetching {syncProgress.day}...</span>
            <span className="text-xs font-mono text-accent">{syncProgress.current}/{syncProgress.total}</span>
          </div>
          <Bar pct={syncProgress.total > 0 ? syncProgress.current / syncProgress.total * 100 : 0} color="bg-brand-500" />
        </div>
      )}

      {/* Month Timeline */}
      <div className="glass-card p-4">
        <div className="flex justify-between mb-2">
          <span className="text-xs text-brand-400">Month Progress</span>
          <span className="text-xs font-mono text-accent">{timePct.toFixed(0)}% elapsed | {daysRemaining} days left</span>
        </div>
        <div className="w-full h-4 rounded-full bg-brand-800/40 relative overflow-hidden">
          <div className="h-4 rounded-full bg-brand-600/60 transition-all" style={{ width: `${timePct}%` }} />
          {/* Day markers */}
          <div className="absolute inset-0 flex">
            {dailyRows.map((r, i) => (
              <div key={i} className="flex-1 border-r border-brand-800/20 relative">
                {!r.empty && <div className={`absolute bottom-0 left-0 right-0 ${r.profit >= 0 ? 'bg-cash-green/40' : 'bg-red-500/40'}`} style={{ height: '100%' }} />}
              </div>
            ))}
          </div>
        </div>
        <div className="flex justify-between mt-1 text-[9px] text-brand-600">
          <span>May 1</span><span>May {Math.round(daysTotal/2)}</span><span>May {daysTotal}</span>
        </div>
      </div>

      {!hasFetchedDays && !syncing && (
        <div className="glass-card p-10 text-center">
          <Target size={48} className="text-brand-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-accent mb-2">Sync your data to see targets</h3>
          <p className="text-sm text-brand-400 mb-5">Click the sync button above. Each day fetches in ~2 seconds and gets cached for instant access later.</p>
        </div>
      )}

      {p && (
        <>
          {/* MTD vs Target: The Big Picture */}
          <h3 className="text-xs text-brand-400 uppercase tracking-wider font-semibold mt-2">MTD vs Target (Day {daysElapsed})</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <BigStat label="Orders" actual={aOrders} target={tOrdersMTD} prefix="" />
            <BigStat label="Revenue" actual={aRevenue} target={tRevenueMTD} />
            <BigStat label="Profit" actual={aProfit} target={tProfitMTD} />
            <BigStat label="Ad Spend" actual={aSpend} target={tSpendMTD} good={aSpend <= tSpendMTD * 1.1} />
          </div>

          {/* Projection Box */}
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold text-accent mb-4 flex items-center gap-2">
              <TrendingUp size={14} /> If you continue at this pace...
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { label: 'Orders', projected: projOrders, target: tOrdersMonthly, prefix: '' },
                { label: 'Revenue', projected: projRevenue, target: tRevenueMonthly, prefix: '₹' },
                { label: 'Profit', projected: projProfit, target: tProfitMonthly, prefix: '₹' },
              ].map(({ label, projected, target, prefix }) => {
                const willHit = projected >= target * 0.95
                const gap = target - projected
                return (
                  <div key={label} className="text-center">
                    <p className="text-[10px] text-brand-500 uppercase mb-1">Projected {label}</p>
                    <p className={`text-2xl font-bold font-mono ${willHit ? 'text-cash-green' : 'text-cash-red'}`}>
                      {prefix}{formatExact(projected)}
                    </p>
                    <p className="text-xs text-brand-400 mt-1">Target: {prefix}{formatExact(target)}</p>
                    {!willHit && <p className="text-xs text-cash-red mt-0.5">Short by {prefix}{formatExact(Math.abs(gap))}</p>}
                    {willHit && <p className="text-xs text-cash-green mt-0.5">On track</p>}
                  </div>
                )
              })}
            </div>

            {/* Daily run rate comparison */}
            <div className="mt-5 pt-4 border-t border-brand-800/20 grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-[10px] text-brand-500">YOUR DAILY AVG</p>
                <p className="text-lg font-bold font-mono text-accent">{currentOrdersPerDay} orders</p>
                <p className="text-[10px] text-brand-500">₹{formatExact(daysElapsed > 0 ? aRevenue / daysElapsed : 0)} rev/day</p>
              </div>
              <div>
                <p className="text-[10px] text-brand-500">TARGET DAILY</p>
                <p className="text-lg font-bold font-mono text-brand-300">{targetOrdersPerDay} orders</p>
                <p className="text-[10px] text-brand-500">₹{formatExact(tRevenueMonthly / daysTotal)} rev/day</p>
              </div>
              <div>
                <p className="text-[10px] text-brand-500">NEEDED REST OF MONTH</p>
                <p className={`text-lg font-bold font-mono ${neededOrdersPerDay <= targetOrdersPerDay * 1.2 ? 'text-yellow-400' : 'text-cash-red'}`}>
                  {neededOrdersPerDay} orders/day
                </p>
                <p className="text-[10px] text-brand-500">₹{formatExact(daysRemaining > 0 ? (tRevenueMonthly - aRevenue) / daysRemaining : 0)} rev/day</p>
              </div>
            </div>
          </div>

          {/* Per-Product Performance */}
          <h3 className="text-xs text-brand-400 uppercase tracking-wider font-semibold mt-2">Product Performance</h3>
          {targets.products.map(t => {
            const actual = p.products.find(pr => pr.name === t.name)
            const aOrd = actual?.totalUnits || 0
            const aRev = actual?.revenue || 0
            const aMeta = actual?.metaSpend || 0
            const aCAC = aOrd > 0 ? aMeta / aOrd : 0
            const aAOV = aOrd > 0 ? aRev / aOrd : 0
            const tOrd = Math.round(t.ordersDaily * daysElapsed)
            const tRev = Math.round(t.revenueDaily * daysElapsed)
            const ordPct = tOrd > 0 ? aOrd / tOrd * 100 : 0
            const revPct = tRev > 0 ? aRev / tRev * 100 : 0
            const dailyRate = daysElapsed > 0 ? aOrd / daysElapsed : 0
            const projOrd = Math.round(dailyRate * daysTotal)
            const needPerDay = daysRemaining > 0 ? Math.ceil((t.ordersMonthly - aOrd) / daysRemaining) : t.ordersDaily

            return (
              <div key={t.name} className="glass-card p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <h4 className="text-base font-semibold text-accent">{t.name}</h4>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-brand-800/40 text-brand-400">{t.code}</span>
                  </div>
                  <span className={`text-sm font-bold font-mono ${ordPct >= 90 ? 'text-cash-green' : ordPct >= 70 ? 'text-yellow-400' : 'text-cash-red'}`}>
                    {ordPct.toFixed(0)}% of target
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
                  <div>
                    <p className="text-[10px] text-brand-500 mb-1">Orders MTD</p>
                    <p className={`text-lg font-bold font-mono ${ordPct >= 90 ? 'text-cash-green' : 'text-cash-red'}`}>{aOrd}</p>
                    <Bar pct={ordPct} color={ordPct >= 90 ? 'bg-cash-green' : 'bg-red-500'} h="h-1.5" />
                    <p className="text-[10px] text-brand-600 mt-1">/ {tOrd} target</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-brand-500 mb-1">Revenue MTD</p>
                    <p className={`text-lg font-bold font-mono ${revPct >= 90 ? 'text-cash-green' : 'text-cash-red'}`}>₹{formatExact(aRev)}</p>
                    <Bar pct={revPct} color={revPct >= 90 ? 'bg-cash-green' : 'bg-red-500'} h="h-1.5" />
                    <p className="text-[10px] text-brand-600 mt-1">/ ₹{formatExact(tRev)} target</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-brand-500 mb-1">CAC</p>
                    <p className={`text-lg font-bold font-mono ${aCAC > 0 && aCAC <= t.cac ? 'text-cash-green' : aCAC === 0 ? 'text-brand-500' : 'text-cash-red'}`}>
                      {aCAC > 0 ? `₹${Math.round(aCAC)}` : '--'}
                    </p>
                    <p className="text-[10px] text-brand-600 mt-1">Target: ₹{t.cac}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-brand-500 mb-1">AOV</p>
                    <p className={`text-lg font-bold font-mono ${aAOV >= t.aov * 0.9 ? 'text-cash-green' : 'text-yellow-400'}`}>
                      {aAOV > 0 ? `₹${Math.round(aAOV)}` : '--'}
                    </p>
                    <p className="text-[10px] text-brand-600 mt-1">Target: ₹{t.aov}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-brand-500 mb-1">Projected Month</p>
                    <p className={`text-lg font-bold font-mono ${projOrd >= t.ordersMonthly * 0.9 ? 'text-cash-green' : 'text-cash-red'}`}>
                      {formatExact(projOrd)} orders
                    </p>
                    <p className="text-[10px] text-brand-600 mt-1">Target: {formatExact(t.ordersMonthly)}</p>
                  </div>
                </div>

                {/* Action line */}
                <div className={`px-3 py-2 rounded-lg text-xs ${ordPct >= 90 ? 'bg-green-900/15 text-cash-green' : 'bg-red-900/10 text-cash-red'}`}>
                  {ordPct >= 95 ? (
                    <span>On track. Maintain {Math.round(dailyRate)} orders/day to hit {formatExact(t.ordersMonthly)} by month end.</span>
                  ) : (
                    <span>
                      Behind by {tOrd - aOrd} orders. Currently {Math.round(dailyRate)}/day, need <strong>{needPerDay}/day</strong> for remaining {daysRemaining} days
                      {needPerDay > t.ordersDaily * 1.5 && ` (${((needPerDay / t.ordersDaily - 1) * 100).toFixed(0)}% above original daily target)`}.
                      {aCAC > t.cac && ` CAC is ₹${Math.round(aCAC)} vs target ₹${t.cac} -- consider optimizing creatives.`}
                    </span>
                  )}
                </div>
              </div>
            )
          })}

          {/* Daily Breakdown Table */}
          <div className="glass-card overflow-hidden">
            <button onClick={() => setShowDaily(!showDaily)} className="w-full px-5 py-3 flex items-center justify-between hover:bg-brand-900/20">
              <h3 className="text-sm font-semibold text-accent">Daily Breakdown</h3>
              <ChevronDown size={16} className={`text-brand-400 transition-transform ${showDaily ? 'rotate-180' : ''}`} />
            </button>
            {showDaily && (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-brand-800/30 text-[10px] text-brand-400 uppercase tracking-wider">
                      <th className="py-2 px-3">Date</th>
                      <th className="py-2 px-3 text-right">Orders</th>
                      <th className="py-2 px-3 text-right">Revenue</th>
                      <th className="py-2 px-3 text-right">Meta Spend</th>
                      <th className="py-2 px-3 text-right">CPP</th>
                      <th className="py-2 px-3 text-right">AOV</th>
                      <th className="py-2 px-3 text-right">Profit</th>
                      <th className="py-2 px-3 text-right">Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyRows.map(r => (
                      <tr key={r.date} className={`border-b border-brand-800/10 ${r.empty ? 'opacity-30' : 'hover:bg-brand-900/20'}`}>
                        <td className="py-2 px-3 text-xs font-mono text-brand-300">
                          {new Date(r.date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', weekday: 'short' })}
                        </td>
                        {r.empty ? (
                          <td colSpan={7} className="py-2 px-3 text-xs text-brand-600 text-center">Not synced</td>
                        ) : (<>
                          <td className="py-2 px-3 text-right font-mono text-xs text-accent">{r.orders}</td>
                          <td className="py-2 px-3 text-right font-mono text-xs text-brand-200">₹{formatExact(r.revenue)}</td>
                          <td className="py-2 px-3 text-right font-mono text-xs text-brand-300">₹{formatExact(r.metaSpend)}</td>
                          <td className={`py-2 px-3 text-right font-mono text-xs ${r.cpp <= 500 ? 'text-cash-green' : 'text-cash-red'}`}>₹{formatExact(r.cpp)}</td>
                          <td className="py-2 px-3 text-right font-mono text-xs text-brand-300">₹{formatExact(r.aov)}</td>
                          <td className={`py-2 px-3 text-right font-mono text-xs font-bold ${r.profit >= 0 ? 'text-cash-green' : 'text-cash-red'}`}>₹{formatExact(r.profit)}</td>
                          <td className={`py-2 px-3 text-right font-mono text-xs ${r.margin >= 0.2 ? 'text-cash-green' : r.margin >= 0 ? 'text-yellow-400' : 'text-cash-red'}`}>{(r.margin * 100).toFixed(1)}%</td>
                        </>)}
                      </tr>
                    ))}
                  </tbody>
                  {hasFetchedDays && (
                    <tfoot>
                      <tr className="border-t-2 border-brand-700/50 bg-brand-950/40">
                        <td className="py-2.5 px-3 font-bold text-accent text-xs">MTD TOTAL</td>
                        <td className="py-2.5 px-3 text-right font-mono text-xs font-bold text-accent">{aOrders}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-xs font-bold">₹{formatExact(aRevenue)}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-xs font-bold">₹{formatExact(aSpend)}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-xs font-bold">₹{formatExact(aOrders > 0 ? aSpend / aOrders : 0)}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-xs font-bold">₹{formatExact(aOrders > 0 ? aRevenue / aOrders : 0)}</td>
                        <td className={`py-2.5 px-3 text-right font-mono text-xs font-bold ${aProfit >= 0 ? 'text-cash-green' : 'text-cash-red'}`}>₹{formatExact(aProfit)}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-xs font-bold">{aRevenue > 0 ? (aProfit / aRevenue * 100).toFixed(1) : 0}%</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
