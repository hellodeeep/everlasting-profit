import React, { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight, BarChart, EyeOff, Eye } from 'lucide-react'
import { useDataStore } from '../lib/dataStore'
import { calculateFullPnL, formatExact } from '../lib/profitEngine'
import { getProducts, buildCampaignMap, buildVendorPriceMap, allocateMetaSpend } from '../lib/productDB'
import { getDaysInMonth, getDaysElapsed, buildTargets, DEFAULT_RAW_TARGETS, TARGETS_CACHE_KEY } from '../lib/targets'

const GST = 1.18
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const FIRST = { y: 2025, m: 4 }

function compactINR(n) {
  const v = Math.abs(Math.round(n))
  const s = n < 0 ? '-' : ''
  if (v >= 10000000) return `${s}${(v / 10000000).toFixed(2)}Cr`
  if (v >= 100000) return `${s}${(v / 100000).toFixed(2)}L`
  if (v >= 1000) return `${s}${(v / 1000).toFixed(1)}K`
  return `${s}${v}`
}
const pctTo = (t, a) => (!t ? 0 : Math.round((a / t) * 100))

// Achievement vs target: returns {text, cls} for absolute variance
function variance(target, actual, lowerIsBetter = false) {
  if (!target) return { pct: 0, cls: 'text-txt-muted' }
  const pct = Math.round((actual / target) * 100)
  let good
  if (lowerIsBetter) good = actual <= target
  else good = pct >= 90
  return { pct, cls: good ? 'text-cash-green' : pct >= 70 && !lowerIsBetter ? 'text-yellow-600' : 'text-cash-red' }
}

export default function Summary() {
  const { cache, getCachedData, getCacheByKey, ready } = useDataStore()
  const [anon, setAnon] = useState(false)

  const now = new Date()
  const [sel, setSel] = useState({ y: now.getFullYear(), m: now.getMonth() })
  const monthStr = `${sel.y}-${String(sel.m + 1).padStart(2, '0')}`
  const monthName = `${MONTH_NAMES[sel.m]} ${sel.y}`

  const atFirst = sel.y === FIRST.y && sel.m === FIRST.m
  const atLast = sel.y === now.getFullYear() && sel.m === now.getMonth()
  const stepMonth = (dir) => {
    let y = sel.y, m = sel.m + dir
    if (m < 0) { m = 11; y-- }
    if (m > 11) { m = 0; y++ }
    if (y < FIRST.y || (y === FIRST.y && m < FIRST.m)) return
    if (y > now.getFullYear() || (y === now.getFullYear() && m > now.getMonth())) return
    setSel({ y, m })
  }

  const daysTotal = getDaysInMonth(monthStr)
  const daysElapsed = getDaysElapsed(monthStr)
  const isClosed = daysElapsed >= daysTotal
  const proRate = isClosed ? 1 : (daysElapsed > 0 ? daysElapsed / daysTotal : 1)

  const rawTargets = useMemo(() => {
    const saved = getCacheByKey(TARGETS_CACHE_KEY)
    return saved?.data || DEFAULT_RAW_TARGETS
  }, [getCacheByKey, ready])
  const targets = useMemo(() => buildTargets({ ...rawTargets, month: monthStr }), [rawTargets, monthStr])

  const { mtdPnl, hasData } = useMemo(() => {
    const dbP = getProducts()
    const campaignMap = buildCampaignMap(dbP)
    const vendorPriceMap = buildVendorPriceMap(dbP)
    let allOrders = [], allCampaigns = []
    const dayCount = isClosed ? daysTotal : daysElapsed
    for (let i = 1; i <= dayCount; i++) {
      const ds = `${monthStr}-${String(i).padStart(2, '0')}`
      const data = getCachedData(ds, ds)
      if (!data?.orders) continue
      allOrders.push(...data.orders)
      allCampaigns.push(...(data.metaCampaigns || []))
    }
    if (allOrders.length === 0) {
      const since = `${monthStr}-01`
      const until = `${monthStr}-${String(daysTotal).padStart(2, '0')}`
      const monthData = getCachedData(since, until)
      if (monthData?.orders) {
        allOrders.push(...monthData.orders)
        allCampaigns.push(...(monthData.metaCampaigns || []))
      }
    }
    if (allOrders.length === 0) return { mtdPnl: null, hasData: false }
    const meta = allocateMetaSpend(allCampaigns, campaignMap)
    return { mtdPnl: calculateFullPnL(allOrders, meta, vendorPriceMap), hasData: true }
  }, [cache, monthStr, daysElapsed, daysTotal, isClosed, getCachedData])

  // Per-SKU rows merging target + actual
  const rows = useMemo(() => {
    return targets.products.map((t, i) => {
      const a = mtdPnl?.products.find(pr => pr.name === t.name)
      const aO = a?.totalUnits || 0
      const aSpend = (a?.metaSpend || 0) / GST
      const aRev = a?.revenue || 0
      const aProfit = a?.profit || 0
      const hasSpend = aSpend > 0
      const aCAC = aO > 0 && hasSpend ? aSpend / aO : 0
      const aAOV = aO > 0 ? aRev / aO : 0
      const aPPO = aO > 0 ? aProfit / aO : 0
      const aMargin = aRev > 0 ? aProfit / aRev : 0
      const tOrders = Math.round(t.ordersMonthly * proRate)
      const tProfit = Math.round((t.profitMonthly || 0) * proRate)
      const tRevenue = Math.round((t.revenueMonthly || 0) * proRate)
      const tSpend = Math.round((t.spendMonthly || 0) * proRate)
      return {
        label: anon ? `SKU ${i + 1}` : t.code,
        tOrders, aO, tCAC: t.cac, aCAC, hasSpend,
        tAOV: t.aov, aAOV, tRevenue, aRev, tSpend, aSpend,
        tProfit, aProfit, aPPO, aMargin,
        prepaidPct: a?.prepaidPct || 0, c2pPct: a?.c2pPct || 0, codPct: a?.codPct || 0,
      }
    })
  }, [targets, mtdPnl, proRate, anon])

  // Totals
  const tProfitTotal = Math.round(targets.totalProfit * proRate)
  const tRevTotal = Math.round(targets.totalRevenue * proRate)
  const tOrdTotal = Math.round(targets.products.reduce((s, t) => s + t.ordersMonthly, 0) * proRate)
  const aOrders = mtdPnl?.overview.activeOrders || 0
  const aProfit = mtdPnl?.profit.expected || 0
  const aRev = mtdPnl?.revenue.expectedRevenue || 0
  const aSpend = (mtdPnl?.expenses.metaAds || 0) / GST
  const aCAC = aOrders > 0 ? aSpend / aOrders : 0
  const aMargin = aRev > 0 ? aProfit / aRev : 0
  const profitPct = pctTo(tProfitTotal, aProfit)

  // KPI tile
  const Kpi = ({ label, actual, target, sub, color }) => (
    <div className="glass-card p-4">
      <p className="metric-label mb-1">{label}</p>
      <p className={`text-2xl font-bold font-mono ${color || 'text-txt-primary'}`}>{actual}</p>
      {target && <p className="text-[11px] text-txt-muted mt-1">target {target}</p>}
      {sub && <p className="text-[11px] text-txt-muted mt-0.5">{sub}</p>}
    </div>
  )

  const cell = (val, cls = 'text-txt-secondary') => <td className={`py-3 px-3 text-right font-mono text-xs ${cls}`}>{val}</td>
  const tgtCell = (val) => <td className="py-3 px-3 text-right font-mono text-[11px] text-txt-muted">{val}</td>

  return (
    <div className="space-y-4 fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-accent">Monthly Summary</h2>
          <p className="text-sm text-txt-muted mt-0.5">Target vs reality · {isClosed ? 'final' : `day ${daysElapsed} of ${daysTotal}, targets pro-rated`}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 glass-card px-1.5 py-1">
            <button onClick={() => stepMonth(-1)} disabled={atFirst} className="p-1.5 rounded-lg text-txt-muted hover:text-accent hover:bg-ev-light disabled:opacity-30">
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-semibold text-accent px-2 min-w-[110px] text-center">{monthName}</span>
            <button onClick={() => stepMonth(1)} disabled={atLast} className="p-1.5 rounded-lg text-txt-muted hover:text-accent hover:bg-ev-light disabled:opacity-30">
              <ChevronRight size={16} />
            </button>
          </div>
          <button onClick={() => setAnon(a => !a)} className={`btn-ghost text-sm flex items-center gap-1.5 ${anon ? 'text-accent' : ''}`}>
            {anon ? <EyeOff size={14} /> : <Eye size={14} />}
            {anon ? 'SKU codes hidden' : 'Show SKU codes'}
          </button>
        </div>
      </div>

      {!hasData && (
        <div className="glass-card p-12 text-center">
          <BarChart size={44} className="text-txt-muted mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-accent mb-2">No data for {monthName}</h3>
          <p className="text-sm text-txt-muted">Fetch this month from the Dashboard or sync it on the Targets page, then it will appear here.</p>
        </div>
      )}

      {hasData && (
        <>
          {/* KPI band */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Kpi label={isClosed ? 'Net Profit' : 'Profit so far'} actual={`₹${compactINR(aProfit)}`} target={`₹${compactINR(tProfitTotal)}`}
              sub={`${profitPct}% of target`} color={profitPct >= 90 ? 'text-cash-green' : profitPct >= 70 ? 'text-yellow-600' : 'text-cash-red'} />
            <Kpi label="Revenue" actual={`₹${compactINR(aRev)}`} target={`₹${compactINR(tRevTotal)}`} sub={`${pctTo(tRevTotal, aRev)}% of target`} />
            <Kpi label="Orders" actual={formatExact(aOrders)} target={formatExact(tOrdTotal)} sub={`${pctTo(tOrdTotal, aOrders)}% of target`} />
            <Kpi label="Blended CAC" actual={`₹${formatExact(Math.round(aCAC))}`} sub="pre-GST" />
            <Kpi label="Margin" actual={`${(aMargin * 100).toFixed(1)}%`} sub={`₹${compactINR(aSpend)} ad spend`} />
          </div>

          {/* Detailed per-SKU table */}
          <div className="glass-card overflow-hidden">
            <div className="px-5 py-3 border-b border-brand-300/50 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-accent">Per-SKU: Target vs Actual</h3>
              <span className="text-[11px] text-txt-muted">{monthName} {isClosed ? '· final' : '· MTD'}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-brand-300/50 text-[10px] text-txt-muted uppercase tracking-wider">
                    <th className="py-2.5 px-4">SKU</th>
                    <th className="py-2.5 px-3 text-right">Orders</th>
                    <th className="py-2.5 px-3 text-right">CAC</th>
                    <th className="py-2.5 px-3 text-right">AOV</th>
                    <th className="py-2.5 px-3 text-right">Revenue</th>
                    <th className="py-2.5 px-3 text-right">Ad Spend</th>
                    <th className="py-2.5 px-3 text-right">Profit</th>
                    <th className="py-2.5 px-3 text-right">₹/order</th>
                    <th className="py-2.5 px-3 text-right">Margin</th>
                    <th className="py-2.5 px-3 text-right">Pre/C2P/COD</th>
                    <th className="py-2.5 px-3 text-right">Goal</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => {
                    const ordV = variance(r.tOrders, r.aO)
                    const cacV = variance(r.tCAC, r.aCAC, true)
                    const aovV = variance(r.tAOV, r.aAOV)
                    const profV = variance(r.tProfit, r.aProfit)
                    return (
                      <tr key={r.label} className="border-b border-brand-300/50/50 hover:bg-ev-light align-top">
                        <td className="py-3 px-4">
                          <span className="font-mono font-bold text-xs px-2 py-1 rounded-lg bg-ev-light text-accent">{r.label}</span>
                        </td>
                        <td className="py-3 px-3 text-right">
                          <div className={`font-mono text-xs font-bold ${ordV.cls}`}>{formatExact(r.aO)}</div>
                          <div className="font-mono text-[10px] text-txt-muted">tgt {formatExact(r.tOrders)}</div>
                        </td>
                        <td className="py-3 px-3 text-right">
                          <div className={`font-mono text-xs font-bold ${r.hasSpend ? cacV.cls : 'text-cash-red'}`}>{r.hasSpend ? `₹${formatExact(Math.round(r.aCAC))}` : 'no spend'}</div>
                          <div className="font-mono text-[10px] text-txt-muted">tgt ₹{formatExact(r.tCAC)}</div>
                        </td>
                        <td className="py-3 px-3 text-right">
                          <div className={`font-mono text-xs font-bold ${aovV.cls}`}>₹{formatExact(Math.round(r.aAOV))}</div>
                          <div className="font-mono text-[10px] text-txt-muted">tgt ₹{formatExact(r.tAOV)}</div>
                        </td>
                        <td className="py-3 px-3 text-right">
                          <div className="font-mono text-xs text-txt-secondary">₹{compactINR(r.aRev)}</div>
                          <div className="font-mono text-[10px] text-txt-muted">tgt ₹{compactINR(r.tRevenue)}</div>
                        </td>
                        <td className="py-3 px-3 text-right">
                          <div className="font-mono text-xs text-txt-secondary">₹{compactINR(r.aSpend)}</div>
                          <div className="font-mono text-[10px] text-txt-muted">tgt ₹{compactINR(r.tSpend)}</div>
                        </td>
                        <td className="py-3 px-3 text-right">
                          <div className={`font-mono text-xs font-bold ${profV.cls}`}>₹{compactINR(r.aProfit)}</div>
                          <div className="font-mono text-[10px] text-txt-muted">tgt ₹{compactINR(r.tProfit)}</div>
                        </td>
                        {cell(`₹${formatExact(Math.round(r.aPPO))}`)}
                        {cell(`${(r.aMargin * 100).toFixed(1)}%`, r.aMargin >= 0.15 ? 'text-cash-green' : 'text-yellow-600')}
                        <td className="py-3 px-3 text-right font-mono text-[11px] text-txt-muted">
                          {Math.round(r.prepaidPct * 100)}/{Math.round(r.c2pPct * 100)}/{Math.round(r.codPct * 100)}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${profV.cls} ${profV.pct >= 90 ? 'bg-green-50' : profV.pct >= 70 ? 'bg-yellow-50' : 'bg-red-50'}`}>
                            {r.hasSpend ? `${profV.pct}%` : '--'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-brand-300 bg-ev-light font-bold">
                    <td className="py-3 px-4 text-xs text-accent">TOTAL</td>
                    <td className="py-3 px-3 text-right font-mono text-xs text-txt-primary">{formatExact(aOrders)}<div className="text-[10px] text-txt-muted font-normal">tgt {formatExact(tOrdTotal)}</div></td>
                    <td className="py-3 px-3 text-right font-mono text-xs text-txt-primary">₹{formatExact(Math.round(aCAC))}</td>
                    <td className="py-3 px-3 text-right font-mono text-xs text-txt-primary">₹{aOrders > 0 ? formatExact(Math.round(aRev / aOrders)) : 0}</td>
                    <td className="py-3 px-3 text-right font-mono text-xs text-txt-primary">₹{compactINR(aRev)}<div className="text-[10px] text-txt-muted font-normal">tgt ₹{compactINR(tRevTotal)}</div></td>
                    <td className="py-3 px-3 text-right font-mono text-xs text-txt-primary">₹{compactINR(aSpend)}</td>
                    <td className="py-3 px-3 text-right font-mono text-xs text-txt-primary">₹{compactINR(aProfit)}<div className="text-[10px] text-txt-muted font-normal">tgt ₹{compactINR(tProfitTotal)}</div></td>
                    <td className="py-3 px-3 text-right font-mono text-xs text-txt-primary">₹{aOrders > 0 ? formatExact(Math.round(aProfit / aOrders)) : 0}</td>
                    <td className="py-3 px-3 text-right font-mono text-xs text-txt-primary">{(aMargin * 100).toFixed(1)}%</td>
                    <td className="py-3 px-3"></td>
                    <td className="py-3 px-3 text-right">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${profitPct >= 90 ? 'text-cash-green bg-green-50' : profitPct >= 70 ? 'text-yellow-600 bg-yellow-50' : 'text-cash-red bg-red-50'}`}>{profitPct}%</span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <p className="text-[11px] text-txt-muted px-1">
            CAC and ad spend are pre-GST. Green means at or above 90% of target (CAC green when at or below target). "no spend" means no Meta spend mapped to that SKU's campaign code, so its profit is overstated. Pre/C2P/COD is the order-count split. {!isClosed && 'Targets are pro-rated to days elapsed.'}
          </p>
        </>
      )}
    </div>
  )
}
