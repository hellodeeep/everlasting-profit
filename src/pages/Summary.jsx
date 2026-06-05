import React, { useState, useMemo } from 'react'
import { Eye, EyeOff, ChevronLeft, ChevronRight, BarChart } from 'lucide-react'
import { useDataStore } from '../lib/dataStore'
import { formatExact } from '../lib/profitEngine'
import { calculateFullPnL } from '../lib/profitEngine'
import { getProducts, buildCampaignMap, buildVendorPriceMap, allocateMetaSpend } from '../lib/productDB'
import { getDaysInMonth, getDaysElapsed, buildTargets, DEFAULT_RAW_TARGETS, TARGETS_CACHE_KEY } from '../lib/targets'

const GST = 1.18
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const FIRST = { y: 2025, m: 4 } // May 2025 (0-indexed)

function compactINR(n) {
  const v = Math.abs(Math.round(n))
  const s = n < 0 ? '-' : ''
  if (v >= 10000000) return `${s}${(v / 10000000).toFixed(2)}Cr`
  if (v >= 100000) return `${s}${(v / 100000).toFixed(2)}L`
  if (v >= 1000) return `${s}${(v / 1000).toFixed(1)}K`
  return `${s}${v}`
}
const pctTo = (t, a) => (!t ? 0 : Math.round((a / t) * 100))

// A roomy SKU row: code on the left, four metric columns each with its own space
function SkuRow({ t, actual, proRate, redact }) {
  const aO = actual?.totalUnits || 0
  const aM = (actual?.metaSpend || 0) / GST
  const aP = actual?.profit || 0
  const aRev = actual?.revenue || 0
  const hasSpend = aM > 0
  const aCAC = aO > 0 && hasSpend ? aM / aO : 0
  const aAOV = aO > 0 ? aRev / aO : 0

  const tOrders = Math.round(t.ordersMonthly * proRate)
  const tProfit = Math.round((t.profitMonthly || 0) * proRate)

  const ordGood = pctTo(tOrders, aO) >= 90
  const cacGood = hasSpend && aCAC <= t.cac
  const aovGood = aAOV >= t.aov * 0.95
  const profitGood = pctTo(tProfit, aP) >= 90
  const goalPct = pctTo(tProfit, aP)

  const green = '#16a34a', red = '#dc2626'

  const Col = ({ label, value, target, good, warn, hide }) => (
    <div className="flex-1 min-w-0 px-2">
      <p className="uppercase tracking-wider mb-1 text-txt-muted" style={{ fontSize: '10px' }}>{label}</p>
      <p className="font-mono font-bold leading-none truncate" style={{ fontSize: '18px', color: warn ? red : good ? green : '#1f2937' }}>
        {hide ? '•••' : value}
      </p>
      <p className="font-mono text-txt-muted mt-1 truncate" style={{ fontSize: '10px' }}>tgt {hide ? '•••' : target}</p>
    </div>
  )

  return (
    <div className="glass-card px-4 py-3.5 flex items-center gap-3">
      <div className="flex flex-col items-start gap-1.5" style={{ width: '92px' }}>
        <span className="font-mono font-bold px-2.5 py-1 rounded-lg" style={{ fontSize: '15px', background: '#e9d5f6', color: '#372348' }}>{t.code}</span>
        <span className="font-mono font-bold" style={{ fontSize: '11px', color: hasSpend ? (profitGood ? green : goalPct >= 70 ? '#ca8a04' : red) : red }}>
          {hasSpend ? `${goalPct}% goal` : 'no spend'}
        </span>
      </div>
      <div className="flex flex-1 min-w-0" style={{ borderLeft: '1px solid rgba(55,35,72,0.08)' }}>
        <Col label="Orders" value={formatExact(aO)} target={formatExact(tOrders)} good={ordGood} hide={false} />
        <Col label="CAC" value={hasSpend ? `₹${formatExact(Math.round(aCAC))}` : '--'} target={`₹${formatExact(Math.round(t.cac))}`} good={cacGood} warn={!hasSpend} hide={false} />
        <Col label="AOV" value={`₹${formatExact(Math.round(aAOV))}`} target={`₹${formatExact(Math.round(t.aov))}`} good={aovGood} hide={redact} />
        <Col label="Profit" value={`₹${compactINR(aP)}`} target={`₹${compactINR(tProfit)}`} good={profitGood} hide={redact} />
      </div>
    </div>
  )
}

export default function Summary() {
  const { cache, getCachedData, getCacheByKey, ready } = useDataStore()
  const [redact, setRedact] = useState(false)

  // Month navigation, default to current month
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
  const proRate = daysElapsed >= daysTotal ? 1 : (daysElapsed > 0 ? daysElapsed / daysTotal : 1)
  const isClosed = daysElapsed >= daysTotal

  // Targets config (uses saved month's target shape; codes + per-SKU targets)
  const rawTargets = useMemo(() => {
    const saved = getCacheByKey(TARGETS_CACHE_KEY)
    return saved?.data || DEFAULT_RAW_TARGETS
  }, [getCacheByKey, ready])
  const targets = useMemo(() => buildTargets({ ...rawTargets, month: monthStr }), [rawTargets, monthStr])

  // Aggregate actuals for the selected month from cached daily data
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
    // Also try a full-month single-range cache (from the Dashboard monthly tabs)
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

  // Totals
  const tProfitTotal = Math.round(targets.totalProfit * proRate)
  const aOrders = mtdPnl?.overview.activeOrders || 0
  const aProfit = mtdPnl?.profit.expected || 0
  const aRev = mtdPnl?.revenue.expectedRevenue || 0
  const aSpend = (mtdPnl?.expenses.metaAds || 0) / GST
  const aCAC = aOrders > 0 ? aSpend / aOrders : 0
  const aMargin = aRev > 0 ? aProfit / aRev : 0
  const profitPct = pctTo(tProfitTotal, aProfit)
  const goalColor = profitPct >= 90 ? '#34d399' : profitPct >= 70 ? '#fbbf24' : '#f87171'

  return (
    <div className="space-y-4 fade-in">
      {/* Page header + controls (not part of the shareable card) */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-accent">Monthly Summary</h2>
          <p className="text-sm text-txt-muted mt-0.5">Target vs achievement, built to screenshot and share</p>
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
          <button onClick={() => setRedact(r => !r)} className="btn-ghost text-sm flex items-center gap-1.5">
            {redact ? <EyeOff size={14} /> : <Eye size={14} />}
            {redact ? 'Redacted' : 'Full numbers'}
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
          {/* THE SHAREABLE CARD */}
          <div id="summary-card" className="rounded-3xl overflow-hidden shadow-2xl"
            style={{ background: 'linear-gradient(135deg, #2d1c3c 0%, #3d2750 45%, #543470 100%)' }}>

            {/* Brand bar */}
            <div className="flex items-center justify-between px-7 pt-6">
              <span className="font-black tracking-[0.25em] uppercase" style={{ fontSize: '18px', color: '#e9d5f6' }}>Everlasting</span>
              <span className="font-medium px-3.5 py-1.5 rounded-full" style={{ fontSize: '13px', background: 'rgba(233,213,246,0.14)', color: '#e9d5f6' }}>
                {monthName} {isClosed ? '· Final' : `· Day ${daysElapsed}/${daysTotal}`}
              </span>
            </div>

            {/* Hero strip */}
            <div className="px-7 pt-5 pb-5 flex items-end justify-between flex-wrap gap-4"
              style={{ borderBottom: '1px solid rgba(233,213,246,0.12)' }}>
              <div>
                <p className="uppercase tracking-wider mb-1.5" style={{ fontSize: '13px', color: 'rgba(233,213,246,0.6)' }}>
                  {isClosed ? 'Net Profit' : 'Profit so far'}
                </p>
                <div className="flex items-end gap-3">
                  <span className="font-black leading-none" style={{ fontSize: 'clamp(44px, 7vw, 68px)', color: '#fff' }}>
                    {redact ? '••••' : `₹${compactINR(aProfit)}`}
                  </span>
                  <span className="font-bold mb-1.5" style={{ fontSize: '20px', color: goalColor }}>{profitPct}% of target</span>
                </div>
              </div>
              <div className="flex gap-7 pb-1">
                <div>
                  <p className="uppercase tracking-wider" style={{ fontSize: '11px', color: 'rgba(233,213,246,0.5)' }}>Margin</p>
                  <p className="font-mono font-bold" style={{ fontSize: '20px', color: '#fff' }}>{(aMargin * 100).toFixed(1)}%</p>
                </div>
                <div>
                  <p className="uppercase tracking-wider" style={{ fontSize: '11px', color: 'rgba(233,213,246,0.5)' }}>Orders</p>
                  <p className="font-mono font-bold" style={{ fontSize: '20px', color: '#fff' }}>{formatExact(aOrders)}</p>
                </div>
                <div>
                  <p className="uppercase tracking-wider" style={{ fontSize: '11px', color: 'rgba(233,213,246,0.5)' }}>Blended CAC</p>
                  <p className="font-mono font-bold" style={{ fontSize: '20px', color: '#fff' }}>₹{formatExact(Math.round(aCAC))}</p>
                </div>
              </div>
            </div>

            {/* SKU rows on a white panel for clarity */}
            <div className="px-7 py-6 space-y-3" style={{ background: 'rgba(248,245,251,0.97)' }}>
              {targets.products.map(t => {
                const actual = mtdPnl?.products.find(pr => pr.name === t.name)
                return <SkuRow key={t.code} t={t} actual={actual} proRate={proRate} redact={redact} />
              })}
            </div>

            {/* Footer */}
            <div className="px-7 py-3 flex items-center justify-between" style={{ background: 'rgba(0,0,0,0.2)' }}>
              <span style={{ fontSize: '12px', color: 'rgba(233,213,246,0.6)' }}>Target vs Actual · vibecoded in-house</span>
              <span className="font-mono" style={{ fontSize: '12px', color: 'rgba(233,213,246,0.45)' }}>everlasting.shop</span>
            </div>
          </div>

          <p className="text-center text-xs text-txt-muted">Screenshot the card above to post. Use the month arrows to switch months, and Redacted to hide rupee figures.</p>
        </>
      )}
    </div>
  )
}
