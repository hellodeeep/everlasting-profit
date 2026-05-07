import React, { useState, useMemo } from 'react'
import { Target, TrendingUp, TrendingDown, AlertTriangle, ChevronDown, Calendar, Zap, ArrowRight } from 'lucide-react'
import { getTargets, getDaysInMonth, getDaysElapsed } from '../lib/targets'
import { useDataStore } from '../lib/dataStore'
import { calculateFullPnL, formatExact, formatPercent, getProductFamily } from '../lib/profitEngine'
import { getProducts, buildCampaignMap, buildVendorPriceMap, allocateMetaSpend } from '../lib/productDB'

function ProgressBar({ value, max, color = 'bg-brand-500', height = 'h-2' }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 150) : 0
  const over = pct > 100
  return (
    <div className={`w-full ${height} rounded-full bg-brand-800/40 overflow-hidden relative`}>
      <div className={`${height} rounded-full transition-all duration-500 ${over ? 'bg-cash-green' : color}`}
        style={{ width: `${Math.min(pct, 100)}%` }} />
      {/* Time marker */}
    </div>
  )
}

function MetricCard({ label, actual, target, unit = '₹', inverse = false, sub }) {
  const pct = target > 0 ? actual / target : 0
  const isGood = inverse ? pct <= 1 : pct >= 1
  const nearTarget = Math.abs(pct - 1) < 0.15
  const color = isGood ? 'text-cash-green' : nearTarget ? 'text-yellow-400' : 'text-cash-red'
  const barColor = isGood ? 'bg-cash-green' : nearTarget ? 'bg-yellow-500' : 'bg-red-500'

  return (
    <div className="glass-card p-4 fade-in">
      <p className="text-[10px] text-brand-400 uppercase tracking-wider font-medium mb-2">{label}</p>
      <div className="flex items-end justify-between mb-2">
        <span className={`text-lg font-bold font-mono ${color}`}>
          {unit === '₹' ? `₹${formatExact(actual)}` : unit === '%' ? `${(actual*100).toFixed(1)}%` : formatExact(actual)}
        </span>
        <span className="text-xs text-brand-500 font-mono">
          / {unit === '₹' ? `₹${formatExact(target)}` : unit === '%' ? `${(target*100).toFixed(1)}%` : formatExact(target)}
        </span>
      </div>
      <ProgressBar value={actual} max={target} color={barColor} />
      <div className="flex justify-between mt-1.5">
        <span className={`text-[10px] font-mono ${color}`}>{(pct * 100).toFixed(0)}%</span>
        {sub && <span className="text-[10px] text-brand-500">{sub}</span>}
      </div>
    </div>
  )
}

function ProductRow({ product, actual, daysElapsed, daysTotal, timeProgress }) {
  const t = product
  const ordersTarget = Math.round(t.ordersDaily * daysElapsed)
  const revenueTarget = Math.round(t.revenueDaily * daysElapsed)
  const spendTarget = Math.round(t.spendDaily * daysElapsed)
  const profitTarget = Math.round(t.profitDaily * daysElapsed)

  const actualOrders = actual?.totalUnits || 0
  const actualRevenue = actual?.revenue || 0
  const actualProfit = actual?.profit || 0
  const actualMeta = actual?.metaSpend || 0
  const actualCAC = actualOrders > 0 ? actualMeta / actualOrders : 0
  const actualAOV = actualOrders > 0 ? actualRevenue / actualOrders : 0

  const ordersPct = ordersTarget > 0 ? actualOrders / ordersTarget : 0
  const revenuePct = revenueTarget > 0 ? actualRevenue / revenueTarget : 0

  // Projected month-end
  const dailyRunRate = daysElapsed > 0 ? actualOrders / daysElapsed : 0
  const projectedOrders = Math.round(dailyRunRate * daysTotal)
  const revenueRunRate = daysElapsed > 0 ? actualRevenue / daysElapsed : 0
  const projectedRevenue = Math.round(revenueRunRate * daysTotal)

  const orderColor = ordersPct >= timeProgress ? 'text-cash-green' : ordersPct >= timeProgress * 0.8 ? 'text-yellow-400' : 'text-cash-red'
  const revColor = revenuePct >= timeProgress ? 'text-cash-green' : revenuePct >= timeProgress * 0.8 ? 'text-yellow-400' : 'text-cash-red'

  return (
    <div className="glass-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-accent">{t.name}</h3>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-brand-800/40 text-brand-400">{t.code}</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <p className="text-[10px] text-brand-500 mb-1">Orders</p>
          <p className={`text-base font-bold font-mono ${orderColor}`}>{actualOrders}</p>
          <ProgressBar value={actualOrders} max={ordersTarget} color={ordersPct >= timeProgress ? 'bg-cash-green' : 'bg-red-500'} height="h-1.5" />
          <p className="text-[10px] text-brand-500 mt-1">Target: {ordersTarget} | Monthly: {t.ordersMonthly}</p>
        </div>
        <div>
          <p className="text-[10px] text-brand-500 mb-1">Revenue</p>
          <p className={`text-base font-bold font-mono ${revColor}`}>₹{formatExact(actualRevenue)}</p>
          <ProgressBar value={actualRevenue} max={revenueTarget} color={revenuePct >= timeProgress ? 'bg-cash-green' : 'bg-red-500'} height="h-1.5" />
          <p className="text-[10px] text-brand-500 mt-1">Target: ₹{formatExact(revenueTarget)}</p>
        </div>
        <div>
          <p className="text-[10px] text-brand-500 mb-1">CAC</p>
          <p className={`text-base font-bold font-mono ${actualCAC <= t.cac ? 'text-cash-green' : 'text-cash-red'}`}>₹{formatExact(actualCAC)}</p>
          <p className="text-[10px] text-brand-500 mt-1">Target: ₹{t.cac}</p>
        </div>
        <div>
          <p className="text-[10px] text-brand-500 mb-1">AOV</p>
          <p className={`text-base font-bold font-mono ${actualAOV >= t.aov ? 'text-cash-green' : 'text-yellow-400'}`}>₹{formatExact(actualAOV)}</p>
          <p className="text-[10px] text-brand-500 mt-1">Target: ₹{t.aov}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-2 border-t border-brand-800/20">
        <Zap size={12} className="text-brand-500" />
        <p className="text-[11px] text-brand-400">
          Run rate: <span className="text-accent font-mono">{Math.round(dailyRunRate)}/day</span> (need {t.ordersDaily}/day).
          Projected: <span className={`font-mono ${projectedOrders >= t.ordersMonthly * 0.9 ? 'text-cash-green' : 'text-cash-red'}`}>
            {formatExact(projectedOrders)} orders
          </span> and <span className={`font-mono ${projectedRevenue >= t.revenueMonthly * 0.9 ? 'text-cash-green' : 'text-cash-red'}`}>
            ₹{formatExact(projectedRevenue)} revenue
          </span> by month end.
        </p>
      </div>
    </div>
  )
}

export default function Targets() {
  const targets = getTargets()
  const { cache } = useDataStore()
  const [showSetup, setShowSetup] = useState(false)

  const month = targets.month
  const daysTotal = getDaysInMonth(month)
  const daysElapsed = getDaysElapsed(month)
  const daysRemaining = daysTotal - daysElapsed
  const timeProgress = daysElapsed / daysTotal

  // Aggregate MTD data from cache
  const mtdData = useMemo(() => {
    const [y, m] = month.split('-').map(Number)
    const since = `${month}-01`
    const today = new Date().toISOString().split('T')[0]
    const until = today

    // Collect all orders from cached date ranges that fall within this month
    const allOrders = []
    const allCampaigns = []
    const seenOrderIds = new Set()

    Object.entries(cache || {}).forEach(([key, data]) => {
      if (!data?.orders) return
      const [s, u] = key.split('_')
      // Check if this range overlaps with our month
      if (s >= since && s <= until) {
        data.orders.forEach(o => {
          if (!seenOrderIds.has(o.id || o.shopifyId)) {
            seenOrderIds.add(o.id || o.shopifyId)
            allOrders.push(o)
          }
        })
        if (data.metaCampaigns) {
          // Only add if not a multi-day range (to avoid double counting)
          if (s === u) allCampaigns.push(...data.metaCampaigns)
        }
      }
    })

    if (allOrders.length === 0) return null

    const dbProducts = getProducts()
    const campaignMap = buildCampaignMap(dbProducts)
    const vendorPriceMap = buildVendorPriceMap(dbProducts)
    const metaAllocation = allocateMetaSpend(allCampaigns, campaignMap)

    const pnl = calculateFullPnL(allOrders, metaAllocation, vendorPriceMap)
    return { pnl, orderCount: allOrders.length, metaAllocation }
  }, [cache, month])

  // Fetch MTD data - user should fetch daily data from Dashboard
  // This page aggregates from cached daily data

  const p = mtdData?.pnl

  // Map actual product data to targets
  const productActuals = useMemo(() => {
    if (!p) return {}
    const map = {}
    p.products.forEach(prod => { map[prod.name] = prod })
    return map
  }, [p])

  // Overall actuals
  const totalActualOrders = p?.overview.activeOrders || 0
  const totalActualRevenue = p?.revenue.expectedRevenue || 0
  const totalActualProfit = p?.profit.expected || 0
  const totalActualSpend = p?.expenses.metaAds || 0

  const targetOrdersMTD = targets.products.reduce((s, t) => s + t.ordersDaily * daysElapsed, 0)
  const targetRevenueMTD = Math.round(targets.totalRevenue / daysTotal * daysElapsed)
  const targetProfitMTD = Math.round(targets.totalProfit / daysTotal * daysElapsed)
  const targetSpendMTD = targets.products.reduce((s, t) => s + t.spendDaily * daysElapsed, 0)

  return (
    <div className="space-y-5 fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-accent">Target vs Reality</h2>
          <p className="text-sm text-brand-400 mt-1">
            May 2026 -- Day {daysElapsed} of {daysTotal} ({daysRemaining} remaining)
          </p>
        </div>
      </div>

      {/* Time Progress */}
      <div className="glass-card p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Calendar size={14} className="text-brand-400" />
            <span className="text-sm text-brand-300">Month Progress</span>
          </div>
          <span className="text-sm font-mono text-accent">{(timeProgress * 100).toFixed(0)}%</span>
        </div>
        <div className="w-full h-3 rounded-full bg-brand-800/40 relative overflow-hidden">
          <div className="h-3 rounded-full bg-brand-500 transition-all" style={{ width: `${timeProgress * 100}%` }} />
        </div>
        <div className="flex justify-between mt-1.5 text-[10px] text-brand-500">
          <span>May 1</span>
          <span>Today: May {daysElapsed}</span>
          <span>May {daysTotal}</span>
        </div>
      </div>

      {!p && (
        <div className="glass-card p-8 text-center">
          <Target size={40} className="text-brand-600 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-accent mb-2">No MTD data yet</h3>
          <p className="text-sm text-brand-400 mb-4">Fetch daily data from the Dashboard for each day of the month. The more days cached, the more accurate the comparison.</p>
          <p className="text-xs text-brand-500">Cached dates with data will automatically aggregate here.</p>
        </div>
      )}

      {p && (
        <>
          {/* Overall MTD Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard label="MTD Orders" actual={totalActualOrders} target={targetOrdersMTD} unit="" sub={`${Math.round(totalActualOrders/Math.max(daysElapsed,1))}/day avg`} />
            <MetricCard label="MTD Revenue" actual={totalActualRevenue} target={targetRevenueMTD} sub={`₹${formatExact(totalActualRevenue/Math.max(daysElapsed,1))}/day`} />
            <MetricCard label="MTD Profit" actual={totalActualProfit} target={targetProfitMTD} sub={formatPercent(p.profit.margin) + ' margin'} />
            <MetricCard label="MTD Ad Spend" actual={totalActualSpend} target={targetSpendMTD} inverse sub={`CAC ₹${formatExact(totalActualOrders > 0 ? totalActualSpend/totalActualOrders : 0)}`} />
          </div>

          {/* Projection Banner */}
          <div className="glass-card p-4 bg-brand-900/30">
            <div className="flex items-start gap-3">
              <TrendingUp size={16} className="text-brand-400 mt-0.5" />
              <div className="text-sm text-brand-300">
                <p className="font-medium text-accent mb-1">Month-End Projection (at current run rate)</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2">
                  {[
                    { label: 'Orders', actual: totalActualOrders, target: targets.products.reduce((s,t) => s+t.ordersMonthly, 0) },
                    { label: 'Revenue', actual: totalActualRevenue, target: targets.totalRevenue, isCurrency: true },
                    { label: 'Profit', actual: totalActualProfit, target: targets.totalProfit, isCurrency: true },
                  ].map(({ label, actual, target, isCurrency }) => {
                    const projected = daysElapsed > 0 ? Math.round(actual / daysElapsed * daysTotal) : 0
                    const willHit = projected >= target * 0.95
                    return (
                      <div key={label}>
                        <p className="text-[10px] text-brand-500">{label}</p>
                        <p className={`font-mono text-sm font-bold ${willHit ? 'text-cash-green' : 'text-cash-red'}`}>
                          {isCurrency ? `₹${formatExact(projected)}` : formatExact(projected)}
                        </p>
                        <p className="text-[10px] text-brand-500">
                          Target: {isCurrency ? `₹${formatExact(target)}` : formatExact(target)}
                          <span className={`ml-1 ${willHit ? 'text-cash-green' : 'text-cash-red'}`}>
                            ({(projected/target*100).toFixed(0)}%)
                          </span>
                        </p>
                      </div>
                    )
                  })}
                  <div>
                    <p className="text-[10px] text-brand-500">Days Needed to Catch Up</p>
                    {(() => {
                      const gap = targets.totalRevenue - (daysElapsed > 0 ? totalActualRevenue / daysElapsed * daysTotal : 0)
                      const dailyRev = daysElapsed > 0 ? totalActualRevenue / daysElapsed : 0
                      if (gap <= 0) return <p className="font-mono text-sm font-bold text-cash-green">On track</p>
                      const extraDays = dailyRev > 0 ? Math.ceil(gap / dailyRev) : 999
                      return <p className={`font-mono text-sm font-bold ${extraDays <= daysRemaining ? 'text-yellow-400' : 'text-cash-red'}`}>
                        {extraDays > 100 ? 'N/A' : `+${extraDays} extra days`}
                      </p>
                    })()}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Per-Product Breakdown */}
          <h3 className="text-sm font-semibold text-accent mt-6 flex items-center gap-2">
            <Target size={14} /> Product-wise Performance
          </h3>

          {targets.products.map(t => (
            <ProductRow
              key={t.name}
              product={t}
              actual={productActuals[t.name]}
              daysElapsed={daysElapsed}
              daysTotal={daysTotal}
              timeProgress={timeProgress}
            />
          ))}

          {/* Action Items */}
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold text-accent mb-3 flex items-center gap-2">
              <Zap size={14} /> Key Takeaways
            </h3>
            <div className="space-y-2">
              {targets.products.map(t => {
                const actual = productActuals[t.name]
                const actualOrders = actual?.totalUnits || 0
                const targetOrders = Math.round(t.ordersDaily * daysElapsed)
                const pct = targetOrders > 0 ? actualOrders / targetOrders : 0
                const actualCAC = actual && actualOrders > 0 ? (actual.metaSpend || 0) / actualOrders : 0

                if (pct >= 1) {
                  return <div key={t.name} className="flex items-start gap-2 text-xs">
                    <span className="text-cash-green mt-0.5">&#10003;</span>
                    <span className="text-brand-300"><strong className="text-accent">{t.name}</strong> is on track ({actualOrders}/{targetOrders} orders, {(pct*100).toFixed(0)}%)</span>
                  </div>
                }
                const gap = targetOrders - actualOrders
                const neededPerDay = daysRemaining > 0 ? Math.ceil((t.ordersMonthly - actualOrders) / daysRemaining) : t.ordersDaily
                return <div key={t.name} className="flex items-start gap-2 text-xs">
                  <span className={`mt-0.5 ${pct >= 0.8 ? 'text-yellow-400' : 'text-cash-red'}`}>
                    {pct >= 0.8 ? '!' : '✗'}
                  </span>
                  <span className="text-brand-300">
                    <strong className="text-accent">{t.name}</strong> is {gap} orders behind.
                    Need <strong className="text-accent">{neededPerDay}/day</strong> for rest of month (vs target {t.ordersDaily}/day).
                    {actualCAC > t.cac && <span className="text-cash-red"> CAC ₹{Math.round(actualCAC)} exceeds target ₹{t.cac}.</span>}
                  </span>
                </div>
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
