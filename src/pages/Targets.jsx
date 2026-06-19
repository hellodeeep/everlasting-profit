import React, { useState, useMemo, useCallback, useEffect } from 'react'
import { Target, TrendingUp, Calendar, Zap, RefreshCw, ChevronDown, ChevronUp, Info, ArrowUp, ArrowDown, Plus, Trash2, Settings, Save, X } from 'lucide-react'
import { getDaysInMonth, getDaysElapsed, getCurrentMonth, buildTargets, estimateProfit, DEFAULT_RAW_TARGETS, TARGETS_CACHE_KEY, targetsKeyForMonth } from '../lib/targets'
import { useDataStore } from '../lib/dataStore'
import { calculateFullPnL, formatExact, formatPercent, getProductFamily } from '../lib/profitEngine'
import { getProducts, buildCampaignMap, buildVendorPriceMap, allocateMetaSpend } from '../lib/productDB'
import { detectBuyMultiplier } from '../lib/vendorPrices'
import { fetchShopifyOrders, fetchMetaSpend } from '../lib/api'

function Bar({ pct, color = 'bg-brand-500', h = 'h-2.5' }) {
  return (
    <div className={`w-full ${h} rounded-full bg-brand-200 overflow-hidden`}>
      <div className={`${h} rounded-full transition-all duration-500 ${color}`} style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }} />
    </div>
  )
}
function Tip({ children }) {
  return <p className="text-[10px] text-txt-muted mt-1 leading-relaxed">{children}</p>
}

// ============ TARGET EDITOR ============
function TargetEditor({ rawTargets, onSave, onCancel, dbProducts, referenceData, refRange, setRefRange }) {
  const [form, setForm] = useState(JSON.parse(JSON.stringify(rawTargets)))

  const updateProduct = (idx, field, value) => {
    setForm(prev => {
      const next = { ...prev, products: [...prev.products] }
      next.products[idx] = { ...next.products[idx], [field]: value }
      return next
    })
  }

  const removeProduct = (idx) => {
    setForm(prev => ({ ...prev, products: prev.products.filter((_, i) => i !== idx) }))
  }

  const addFromDB = (dbProd) => {
    const ref = referenceData[dbProd.name]
    setForm(prev => ({
      ...prev,
      products: [...prev.products, {
        name: dbProd.name,
        code: dbProd.campaignCode || '',
        ordersMonthly: ref ? Math.round(ref.ordersPerDay * getDaysInMonth(prev.month)) : 1000,
        cac: ref ? Math.round(ref.cac) : 400,
        aov: ref ? Math.round(ref.aov) : 900,
        vendorPrice: dbProd.vendorPrice || 0,
        prepaidRate: ref ? Math.round(ref.prepaidRate * 100) : 75,
        c2pRate: ref ? Math.round(ref.c2pRate * 100) : 10,
      }]
    }))
  }

  const addBlank = () => {
    setForm(prev => ({ ...prev, products: [...prev.products, { name: '', code: '', ordersMonthly: 1000, cac: 400, aov: 900, vendorPrice: 0, prepaidRate: 75, c2pRate: 10 }] }))
  }

  // Pre-fill from reference when clicking "Use actual"
  const useActual = (idx) => {
    const p = form.products[idx]
    const ref = referenceData[p.name]
    if (!ref) return
    updateProduct(idx, 'cac', Math.round(ref.cac))
    updateProduct(idx, 'aov', Math.round(ref.aov))
    updateProduct(idx, 'prepaidRate', Math.round(ref.prepaidRate * 100))
    updateProduct(idx, 'c2pRate', Math.round(ref.c2pRate * 100))
    // Don't override orders - that's the target
  }

  const isWindow = !!(form.windowStart && form.windowEnd)
  const daysInMonth = isWindow
    ? Math.max(1, Math.round((new Date(form.windowEnd + 'T00:00:00') - new Date(form.windowStart + 'T00:00:00')) / 86400000) + 1)
    : getDaysInMonth(form.month)
  const periodLabel = isWindow ? `${form.windowStart} to ${form.windowEnd} (${daysInMonth} days)` : 'month'
  const existingNames = new Set(form.products.map(p => p.name))
  const availableProducts = dbProducts.filter(p => !existingNames.has(p.name) && p.name)

  return (
    <div className="glass-card p-5 border-l-4 border-l-accent">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-bold text-accent flex items-center gap-2"><Settings size={16} /> Edit Monthly Targets</h3>
        <div className="flex gap-2">
          <button onClick={onCancel} className="btn-ghost text-sm flex items-center gap-1"><X size={14} /> Cancel</button>
          <button onClick={() => onSave(form)} className="btn-primary text-sm flex items-center gap-1"><Save size={14} /> Save</button>
        </div>
      </div>

      <div className="mb-4 flex items-end gap-4 flex-wrap">
        <div>
          <label className="text-[10px] text-txt-muted uppercase tracking-wider mb-1 block">Target Period</label>
          <div className="flex gap-1 glass-card p-1 w-fit">
            <button
              onClick={() => setForm(prev => ({ ...prev, windowStart: null, windowEnd: null }))}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${!isWindow ? 'bg-accent text-white' : 'text-txt-muted hover:text-accent'}`}>
              Whole month
            </button>
            <button
              onClick={() => setForm(prev => {
                if (prev.windowStart && prev.windowEnd) return prev
                const mo = prev.month
                const dim = getDaysInMonth(mo)
                return { ...prev, windowStart: `${mo}-01`, windowEnd: `${mo}-${String(dim).padStart(2, '0')}` }
              })}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${isWindow ? 'bg-accent text-white' : 'text-txt-muted hover:text-accent'}`}>
              Custom date range
            </button>
          </div>
        </div>

        {!isWindow ? (
          <div>
            <label className="text-[10px] text-txt-muted uppercase tracking-wider mb-1 block">Month</label>
            <input type="month" value={form.month} onChange={e => setForm(prev => ({ ...prev, month: e.target.value }))} className="input-field !w-48 !py-1.5 !text-sm" />
          </div>
        ) : (
          <>
            <div>
              <label className="text-[10px] text-txt-muted uppercase tracking-wider mb-1 block">From</label>
              <input type="date" value={form.windowStart} onChange={e => setForm(prev => ({ ...prev, windowStart: e.target.value }))} className="input-field !w-40 !py-1.5 !text-sm" />
            </div>
            <div>
              <label className="text-[10px] text-txt-muted uppercase tracking-wider mb-1 block">To</label>
              <input type="date" value={form.windowEnd} onChange={e => setForm(prev => ({ ...prev, windowEnd: e.target.value }))} className="input-field !w-40 !py-1.5 !text-sm" />
            </div>
            <p className="text-[11px] text-accent pb-2">{daysInMonth} days · numbers below are totals for this window</p>
          </>
        )}
      </div>

      {(() => {
        const anyRef = Object.values(referenceData)[0]
        return (
          <div className="mb-4 px-3 py-2.5 rounded-lg bg-ev-light border border-brand-300/50">
            <div className="flex items-center gap-3 flex-wrap mb-1.5">
              <span className="text-[11px] font-semibold text-accent uppercase tracking-wider">Baseline reference</span>
              <div className="flex items-center gap-1.5">
                <input type="date" value={refRange.start} onChange={e => setRefRange(r => ({ ...r, start: e.target.value }))} className="input-field !w-36 !py-1 !text-xs" />
                <span className="text-txt-muted text-xs">to</span>
                <input type="date" value={refRange.end} onChange={e => setRefRange(r => ({ ...r, end: e.target.value }))} className="input-field !w-36 !py-1 !text-xs" />
              </div>
            </div>
            {anyRef ? (
              <p className="text-[11px] text-accent">
                Showing {anyRef.rangeLabel} ({anyRef.daysWithData} days synced) — the "Use actual" buttons and grey hints below pull from this window
                {anyRef.missingDates.length > 0 && <span className="text-yellow-600"> · ⚠ {anyRef.missingDates.length} day{anyRef.missingDates.length > 1 ? 's' : ''} not synced</span>}
              </p>
            ) : (
              <p className="text-[11px] text-yellow-600">No synced data in this range. Fetch these dates from the Dashboard first.</p>
            )}
          </div>
        )
      })()}

      {/* Products */}
      <div className="space-y-4">
        {form.products.map((p, idx) => {
          const daily = Math.round((p.ordersMonthly || 0) / daysInMonth)
          const spend = daily * (p.cac || 0)
          const est = estimateProfit(p, daysInMonth)
          const ref = referenceData[p.name]

          return (
            <div key={idx} className="p-4 rounded-xl bg-white border border-brand-300/50 shadow-card">
              {/* Header row */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <input className="input-field !py-1 !text-sm !w-44 font-semibold" value={p.name} onChange={e => updateProduct(idx, 'name', e.target.value)} placeholder="Product name" />
                  <input className="input-field !py-1 !text-sm !w-16 !text-center font-mono" value={p.code} onChange={e => updateProduct(idx, 'code', e.target.value.toUpperCase())} placeholder="CODE" />
                </div>
                <div className="flex items-center gap-2">
                  {ref && <button onClick={() => useActual(idx)} className="text-[10px] px-2 py-1 rounded bg-ev-light text-accent hover:bg-brand-200">Use actual CAC/AOV</button>}
                  <button onClick={() => removeProduct(idx)} className="p-1.5 rounded text-txt-muted hover:text-cash-red hover:bg-red-50"><Trash2 size={14} /></button>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                {/* Monthly Orders */}
                <div>
                  <label className="text-[9px] text-txt-muted uppercase block mb-1">{isWindow ? 'Window Orders' : 'Monthly Orders'}</label>
                  <input className="input-field !py-1.5 !text-sm font-mono text-right" type="number" value={p.ordersMonthly || ''} onChange={e => updateProduct(idx, 'ordersMonthly', parseInt(e.target.value) || 0)} />
                  <p className="text-[9px] text-txt-muted mt-0.5">{daily}/day</p>
                  {ref && <p className="text-[9px] text-yellow-600 mt-0.5">{ref.daysWithData}d synced: {Math.round(ref.ordersPerDay)}/day ({formatExact(ref.totalOrders)} total){ref.daysWithData < 30 ? ' ⚠' : ''}</p>}
                </div>

                {/* Target CAC */}
                <div>
                  <label className="text-[9px] text-txt-muted uppercase block mb-1">Target CAC (pre-GST)</label>
                  <input className="input-field !py-1.5 !text-sm font-mono text-right" type="number" value={p.cac || ''} onChange={e => updateProduct(idx, 'cac', parseInt(e.target.value) || 0)} />
                  <p className="text-[9px] text-txt-muted mt-0.5">Spend: ₹{formatExact(spend)}/day</p>
                  {ref && <p className={`text-[9px] mt-0.5 ${ref.cac <= (p.cac || 999) ? 'text-cash-green' : 'text-cash-red'}`}>{ref.daysWithData}d: ₹{Math.round(ref.cac)}</p>}
                </div>

                {/* Target AOV */}
                <div>
                  <label className="text-[9px] text-txt-muted uppercase block mb-1">Target AOV</label>
                  <input className="input-field !py-1.5 !text-sm font-mono text-right" type="number" value={p.aov || ''} onChange={e => updateProduct(idx, 'aov', parseInt(e.target.value) || 0)} />
                  <p className="text-[9px] text-txt-muted mt-0.5">Rev: ₹{formatExact((p.ordersMonthly||0) * (p.aov||0))}/mo</p>
                  {ref && <p className={`text-[9px] mt-0.5 ${ref.aov >= (p.aov || 0) * 0.9 ? 'text-cash-green' : 'text-yellow-600'}`}>{ref.daysWithData}d: ₹{Math.round(ref.aov)}</p>}
                </div>

                {/* Vendor Price */}
                <div>
                  <label className="text-[9px] text-txt-muted uppercase block mb-1">Vendor Price ₹</label>
                  <input className="input-field !py-1.5 !text-sm font-mono text-right" type="number" value={p.vendorPrice || ''} onChange={e => updateProduct(idx, 'vendorPrice', parseInt(e.target.value) || 0)} />
                  <p className="text-[9px] text-txt-muted mt-0.5">COGS per unit</p>
                </div>

                {/* Prepaid % */}
                <div>
                  <label className="text-[9px] text-txt-muted uppercase block mb-1">Prepaid %</label>
                  <input className="input-field !py-1.5 !text-sm font-mono text-right" type="number" value={p.prepaidRate || ''} onChange={e => updateProduct(idx, 'prepaidRate', parseInt(e.target.value) || 0)} />
                  <p className="text-[9px] text-txt-muted mt-0.5">C2P: {p.c2pRate || 10}% | COD: {100 - (p.prepaidRate||75) - (p.c2pRate||10)}%</p>
                  {ref && <p className="text-[9px] text-yellow-600 mt-0.5">{ref.daysWithData}d: {Math.round(ref.prepaidRate*100)}% prepaid</p>}
                </div>

                {/* Auto-calculated Profit */}
                <div className="bg-ev-light rounded-lg p-3">
                  <label className="text-[9px] text-txt-muted uppercase block mb-1">{isWindow ? 'Est. Window Profit' : 'Est. Monthly Profit'}</label>
                  <p className={`text-lg font-bold font-mono ${est.profitMonthly > 0 ? 'text-cash-green' : 'text-cash-red'}`}>₹{formatExact(est.profitMonthly)}</p>
                  <p className="text-[9px] text-txt-muted mt-0.5">
                    {(est.profitPct * 100).toFixed(1)}% margin | ₹{Math.round(est.profitPerOrder)}/order
                  </p>
                  {ref && ref.profitPerDay > 0 && <p className="text-[9px] text-yellow-600 mt-0.5">{ref.daysWithData}d: ₹{formatExact(Math.round(ref.profitPerDay * daysInMonth))}/mo</p>}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Totals */}
      {form.products.length > 0 && (() => {
        const totals = form.products.reduce((acc, p) => {
          const est = estimateProfit(p, daysInMonth)
          return {
            orders: acc.orders + (p.ordersMonthly || 0),
            revenue: acc.revenue + (p.ordersMonthly || 0) * (p.aov || 0),
            spend: acc.spend + (p.ordersMonthly || 0) * (p.cac || 0),
            profit: acc.profit + est.profitMonthly,
          }
        }, { orders: 0, revenue: 0, spend: 0, profit: 0 })
        return (
          <div className="mt-4 p-3 rounded-lg bg-ev-light border border-brand-300/50 flex flex-wrap gap-6">
            <div><p className="text-[9px] text-txt-muted uppercase">Total Orders</p><p className="text-sm font-bold font-mono text-txt-primary">{formatExact(totals.orders)}/mo ({Math.round(totals.orders/daysInMonth)}/day)</p></div>
            <div><p className="text-[9px] text-txt-muted uppercase">Total Revenue</p><p className="text-sm font-bold font-mono text-txt-primary">₹{formatExact(totals.revenue)}</p></div>
            <div><p className="text-[9px] text-txt-muted uppercase">Total Meta Spend</p><p className="text-sm font-bold font-mono text-txt-muted">₹{formatExact(totals.spend)} (pre-GST)</p></div>
            <div><p className="text-[9px] text-txt-muted uppercase">Total Est. Profit</p><p className={`text-sm font-bold font-mono ${totals.profit > 0 ? 'text-cash-green' : 'text-cash-red'}`}>₹{formatExact(totals.profit)}</p></div>
          </div>
        )
      })()}

      {/* Add products */}
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        {availableProducts.map(dp => (
          <button key={dp.name} onClick={() => addFromDB(dp)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-ev-light text-txt-secondary hover:text-accent hover:border-accent border border-brand-300/50">
            <Plus size={10} /> {dp.name} {dp.campaignCode && <span className="text-[9px] font-mono text-txt-muted">{dp.campaignCode}</span>}
          </button>
        ))}
        <button onClick={addBlank} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs text-txt-muted hover:text-accent border border-dashed border-brand-300/50 hover:border-brand-300">
          <Plus size={10} /> Custom
        </button>
      </div>

      <Tip>Profit is auto-calculated: Expected Revenue (based on prepaid/COD split) minus Meta Spend (CAC × 1.18 GST), COGS (vendor price), logistics (boxes, shipping, packing), and fees (Cashfree, Engage, Fastrr). Yellow "Last 30d" values show your actual performance as reference.</Tip>
    </div>
  )
}

// ============ MAIN PAGE ============
export default function Targets() {
  const { cache, getCachedData, setCachedData, getCacheByKey, setCacheByKey, ready } = useDataStore()
  const [syncing, setSyncing] = useState(false)
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0, day: '' })
  const [showDaily, setShowDaily] = useState(false)
  const [editing, setEditing] = useState(false)
  const [selectedTab, setSelectedTab] = useState('overview')

  // Which month's targets we're working with (default: current month)
  const [activeMonth, setActiveMonth] = useState(getCurrentMonth())

  // Reference baseline date range (defaults to last 30 days, user can pick exact dates)
  const [refRange, setRefRange] = useState(() => {
    const today = new Date()
    const end = new Date(today); end.setDate(end.getDate() - 1)
    const start = new Date(today); start.setDate(start.getDate() - 30)
    return { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] }
  })

  // Load targets for the active month, with fallback chain:
  // 1. this month's saved targets
  // 2. most recent prior month's saved targets (as a template)
  // 3. legacy single-slot targets (one-time migration)
  // 4. defaults
  const rawTargets = useMemo(() => {
    // 1. exact month
    const exact = getCacheByKey(targetsKeyForMonth(activeMonth))
    if (exact?.data) return { ...exact.data, month: activeMonth }

    // 2. most recent prior month
    let best = null, bestMonth = ''
    for (const key of Object.keys(cache)) {
      if (key.startsWith('targets_config_')) {
        const mo = key.replace('targets_config_', '')
        if (mo < activeMonth && mo > bestMonth) { bestMonth = mo; best = cache[key] }
      }
    }
    if (best?.data) return { ...best.data, month: activeMonth }

    // 3. legacy single slot
    const legacy = getCacheByKey(TARGETS_CACHE_KEY)
    if (legacy?.data) return { ...legacy.data, month: activeMonth }

    // 4. defaults
    return { ...DEFAULT_RAW_TARGETS, month: activeMonth }
  }, [getCacheByKey, cache, activeMonth, ready])

  const targets = useMemo(() => buildTargets(rawTargets), [rawTargets])

  const saveTargets = useCallback((newRaw) => {
    // Save under the month chosen inside the editor form
    const mo = newRaw.month || activeMonth
    setCacheByKey(targetsKeyForMonth(mo), { data: newRaw })
    setActiveMonth(mo)
    setEditing(false)
  }, [setCacheByKey, activeMonth])

  const dbProducts = useMemo(() => getProducts(), [])

  const month = targets.month
  const GST = 1.18

  // Effective window: explicit target window, else the whole calendar month
  const todayStr = new Date().toISOString().split('T')[0]
  const isWindow = targets.isWindow
  const winStart = isWindow ? targets.windowStart : `${month}-01`
  const winEnd = isWindow ? targets.windowEnd : `${month}-${String(getDaysInMonth(month)).padStart(2, '0')}`

  const winDays = (() => {
    const s = new Date(winStart + 'T00:00:00'), e = new Date(winEnd + 'T00:00:00')
    return Math.max(1, Math.round((e - s) / 86400000) + 1)
  })()
  // Days of the window that have already happened (start..min(today,end))
  const winElapsed = (() => {
    const s = new Date(winStart + 'T00:00:00')
    const today = new Date(todayStr + 'T00:00:00')
    const e = new Date(winEnd + 'T00:00:00')
    const last = today < e ? today : e
    if (last < s) return 0
    return Math.round((last - s) / 86400000) + 1
  })()
  const winRemaining = Math.max(0, winDays - winElapsed)
  const winStarted = winElapsed > 0
  const timePct = Math.min(100, winElapsed / winDays * 100)

  // Build list of window dates that have happened
  const windowDates = (() => {
    const out = []
    const s = new Date(winStart + 'T00:00:00')
    const today = new Date(todayStr + 'T00:00:00')
    const e = new Date(winEnd + 'T00:00:00')
    const last = today < e ? today : e
    for (let d = new Date(s); d <= last; d.setDate(d.getDate() + 1)) out.push(d.toISOString().split('T')[0])
    return out
  })()

  const fmtD = (ds) => new Date(ds + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  const winLabel = `${fmtD(winStart)} - ${fmtD(winEnd)}`

  // legacy aliases used by older code paths below
  const daysTotal = winDays
  const daysElapsed = winElapsed
  const daysRemaining = winRemaining

  const cachedDays = useMemo(() => {
    let count = 0
    for (const ds of windowDates) {
      if (getCachedData(ds, ds)) count++
    }
    return count
  }, [cache, windowDates])

  const syncMTD = useCallback(async () => {
    setSyncing(true)
    const today = todayStr
    const toFetch = windowDates.filter(ds => ds === today || !getCachedData(ds, ds))
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
  }, [windowDates, todayStr, getCachedData, setCachedData])

  // Build daily + MTD data
  const { dailyRows, mtdPnl, windowOrders } = useMemo(() => {
    const dbP = getProducts()
    const campaignMap = buildCampaignMap(dbP)
    const vendorPriceMap = buildVendorPriceMap(dbP)
    const rows = []
    let allOrders = [], allCampaigns = []

    windowDates.forEach((ds, idx) => {
      const data = getCachedData(ds, ds)
      if (!data) { rows.push({ date: ds, day: idx + 1, empty: true }); return }
      const meta = allocateMetaSpend(data.metaCampaigns || [], campaignMap)
      const pnl = calculateFullPnL(data.orders || [], meta, vendorPriceMap)
      rows.push({ date: ds, day: idx + 1, orders: pnl.overview.activeOrders, prepaid: pnl.overview.prepaidOrders,
        revenue: pnl.revenue.expectedRevenue, metaSpend: pnl.expenses.metaAds, profit: pnl.profit.expected,
        margin: pnl.profit.margin, aov: pnl.metrics.aov, cpp: pnl.metrics.cpp, products: pnl.products })
      allOrders.push(...(data.orders || []))
      allCampaigns.push(...(data.metaCampaigns || []))
    })

    let mtdPnl = null
    if (allOrders.length > 0) {
      const mtdMeta = allocateMetaSpend(allCampaigns, campaignMap)
      mtdPnl = calculateFullPnL(allOrders, mtdMeta, vendorPriceMap)
    }
    return { dailyRows: rows, mtdPnl, windowOrders: allOrders }
  }, [cache, windowDates])

  const p = mtdPnl
  const hasFetched = dailyRows.some(r => !r.empty)

  // Targets
  const tOrdDaily = targets.products.reduce((s, t) => s + t.ordersDaily, 0)
  const tOrdMTD = Math.round(tOrdDaily * daysElapsed)
  const tSpendDaily = targets.products.reduce((s, t) => s + t.spendDaily, 0)
  const tSpendMTD = Math.round(tSpendDaily * daysElapsed)
  const tRevMTD = Math.round(targets.totalRevenue / daysTotal * daysElapsed)
  const tProfitMTD = Math.round(targets.totalProfit / daysTotal * daysElapsed)

  // Actuals
  const aOrd = p?.overview.activeOrders || 0
  const aRev = p?.revenue.expectedRevenue || 0
  const aProfit = p?.profit.expected || 0
  const aSpendWithGST = p?.expenses.metaAds || 0
  const aSpend = aSpendWithGST / GST
  const aCAC = aOrd > 0 ? aSpend / aOrd : 0
  const aAOV = aOrd > 0 ? aRev / aOrd : 0
  const tCACavg = targets.products.length > 0 ? targets.products.reduce((s,t) => s+t.spendMonthly,0) / targets.products.reduce((s,t) => s+t.ordersMonthly,0) : 0
  const tAOVavg = targets.products.length > 0 ? targets.totalRevenue / targets.products.reduce((s,t) => s+t.ordersMonthly,0) : 0
  const avgOrdDay = daysElapsed > 0 ? Math.round(aOrd / daysElapsed) : 0
  const avgSpendDay = daysElapsed > 0 ? Math.round(aSpend / daysElapsed) : 0
  const avgRevDay = daysElapsed > 0 ? Math.round(aRev / daysElapsed) : 0
  const neededOrdDay = daysRemaining > 0 ? Math.ceil((targets.products.reduce((s,t) => s+t.ordersMonthly,0) - aOrd) / daysRemaining) : tOrdDaily
  const neededSpendDay = daysRemaining > 0 ? Math.ceil((targets.products.reduce((s,t) => s+t.spendMonthly,0) - aSpend) / daysRemaining) : tSpendDaily
  const neededRevDay = daysRemaining > 0 ? Math.ceil((targets.totalRevenue - aRev) / daysRemaining) : Math.round(targets.totalRevenue / daysTotal)

  // Build reference data per product from dashboard cache, over the chosen date range
  const referenceData = useMemo(() => {
    const ref = {}
    let allOrders = [], allCampaigns = []
    let daysWithData = 0
    const syncedDates = []
    const missingDates = []

    // Iterate the explicit reference window (refRange.start..refRange.end inclusive)
    const start = new Date(refRange.start + 'T00:00:00')
    const end = new Date(refRange.end + 'T00:00:00')
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const ds = d.toISOString().split('T')[0]
      const data = getCachedData(ds, ds)
      if (!data?.orders) { missingDates.push(ds); continue }
      daysWithData++
      syncedDates.push(ds)
      allOrders.push(...data.orders)
      allCampaigns.push(...(data.metaCampaigns || []))
    }

    if (allOrders.length === 0 || daysWithData === 0) return ref

    syncedDates.sort()
    const rangeStart = syncedDates[0]
    const rangeEnd = syncedDates[syncedDates.length - 1]
    const fmt = (ds) => {
      const [y, m, dd] = ds.split('-')
      return `${dd} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(m) - 1]}`
    }
    const rangeLabel = `${fmt(rangeStart)} - ${fmt(rangeEnd)}`

    const dbP = getProducts()
    const campaignMap = buildCampaignMap(dbP)
    const vendorPriceMap = buildVendorPriceMap(dbP)
    const metaAlloc = allocateMetaSpend(allCampaigns, campaignMap)
    const pnl = calculateFullPnL(allOrders, metaAlloc, vendorPriceMap)

    pnl.products.forEach(prod => {
      const metaPreGST = (prod.metaSpend || 0) / 1.18
      ref[prod.name] = {
        totalOrders: prod.orderCount,
        ordersPerDay: prod.orderCount / daysWithData,
        cac: prod.orderCount > 0 ? metaPreGST / prod.orderCount : 0,
        aov: prod.aovWithUpsells || (prod.orderCount > 0 ? prod.fullOrderRevenue / prod.orderCount : 0),
        prepaidRate: prod.prepaidPct || 0,
        c2pRate: prod.c2pPct || 0,
        codRate: prod.codPct || 0,
        revenue: prod.revenue,
        profit: prod.profit || 0,
        profitPerDay: (prod.profit || 0) / daysWithData,
        margin: prod.margin || 0,
        daysWithData,
        rangeStart, rangeEnd, rangeLabel,
        missingDates: missingDates.filter(d => d >= rangeStart && d <= rangeEnd),
      }
    })
    return ref
  }, [cache, refRange])

  const [y, m] = month.split('-')
  const monthName = new Date(parseInt(y), parseInt(m) - 1).toLocaleString('en', { month: 'long', year: 'numeric' })


  const winLabelLong = isWindow
    ? `${new Date(winStart+'T00:00:00').toLocaleDateString('en-IN',{day:'numeric',month:'short'})} to ${new Date(winEnd+'T00:00:00').toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}`
    : new Date(parseInt(month.split('-')[0]), parseInt(month.split('-')[1])-1).toLocaleString('en',{month:'long',year:'numeric'})

  // Per-product window stats helper
  const productStats = (t) => {
    const actual = p?.products.find(pr => pr.name === t.name)
    const aO = actual?.totalUnits || 0
    const aM = (actual?.metaSpend || 0) / GST
    const aR = actual?.revenue || 0
    const aP = actual?.profit || 0
    const aCAC = aO > 0 ? aM / aO : 0
    const aAOV = aO > 0 ? aR / aO : 0
    const aPPO = aO > 0 ? aP / aO : 0
    const aMargin = aR > 0 ? aP / aR : 0
    // target totals for the window (typed numbers ARE window totals)
    const tO = t.ordersMonthly || 0
    const tProfit = t.profitMonthly || 0
    const tRev = tO * (t.aov || 0)
    const tSpend = tO * (t.cac || 0)
    // pace: how far through the window are we, vs how far through the order goal
    const expectedByNow = winDays > 0 ? tO * (winElapsed / winDays) : 0
    const pacePct = expectedByNow > 0 ? aO / expectedByNow * 100 : 0
    const ordPct = tO > 0 ? aO / tO * 100 : 0
    const profitPct = tProfit > 0 ? aP / tProfit * 100 : 0
    const avgDaily = winElapsed > 0 ? aO / winElapsed : 0
    const needDaily = winRemaining > 0 ? Math.ceil((tO - aO) / winRemaining) : 0
    const needSpendDaily = needDaily * (aCAC > 0 ? aCAC : t.cac)
    const prepaidPct = actual?.prepaidPct || 0, c2pPct = actual?.c2pPct || 0, codPct = actual?.codPct || 0
    const aovPrepaid = actual?.aovPrepaid || 0, aovC2p = actual?.aovC2p || 0, aovCod = actual?.aovCod || 0

    // Bundle mix: of this product's line items, how many were Buy 1 / Buy 2 / Buy 3
    let b1 = 0, b2 = 0, b3 = 0
    ;(windowOrders || []).forEach(o => {
      ;(o.lineItems || []).forEach(li => {
        if (getProductFamily(li.title) !== t.name) return
        const mult = detectBuyMultiplier(li.title, li.variantTitle)
        const qty = li.quantity || 1
        if (mult >= 3) b3 += qty
        else if (mult === 2) b2 += qty
        else b1 += qty
      })
    })
    const bundleTotal = b1 + b2 + b3
    const bundle = {
      total: bundleTotal,
      b1, b2, b3,
      b1Pct: bundleTotal > 0 ? b1 / bundleTotal : 0,
      b2Pct: bundleTotal > 0 ? b2 / bundleTotal : 0,
      b3Pct: bundleTotal > 0 ? b3 / bundleTotal : 0,
    }

    // Princess Combo: necklace + butterfly anklet sold as one variant on this product.
    // Carve this product's orders into combo vs solo to compare AOV and profit/order.
    let comboOrders = 0, comboRevenue = 0, soloOrders = 0, soloRevenue = 0
    ;(windowOrders || []).forEach(o => {
      ;(o.lineItems || []).forEach(li => {
        if (getProductFamily(li.title) !== t.name) return
        const isCombo = `${li.title} ${li.variantTitle || ''}`.toLowerCase().includes('princess combo')
        const qty = li.quantity || 1
        const lineRev = parseFloat(li.price || 0) * qty
        if (isCombo) { comboOrders += qty; comboRevenue += lineRev }
        else { soloOrders += qty; soloRevenue += lineRev }
      })
    })
    const comboTotal = comboOrders + soloOrders
    const combo = {
      hasCombo: comboOrders > 0,
      comboOrders, soloOrders,
      attachPct: comboTotal > 0 ? comboOrders / comboTotal : 0,
      comboAOV: comboOrders > 0 ? comboRevenue / comboOrders : 0,
      soloAOV: soloOrders > 0 ? soloRevenue / soloOrders : 0,
    }

    return { actual, aO, aM, aR, aP, aCAC, aAOV, aPPO, aMargin, tO, tProfit, tRev, tSpend,
      expectedByNow, pacePct, ordPct, profitPct, avgDaily, needDaily, needSpendDaily,
      prepaidPct, c2pPct, codPct, aovPrepaid, aovC2p, aovCod, bundle, combo }
  }

  // Window totals across all products (for overview)
  const overall = (() => {
    const tO = targets.products.reduce((s,t)=>s+(t.ordersMonthly||0),0)
    const tProfit = targets.products.reduce((s,t)=>s+(t.profitMonthly||0),0)
    const tRev = targets.totalRevenue
    const aO = p?.overview.activeOrders || 0
    const aR = p?.revenue.expectedRevenue || 0
    const aP = p?.profit.expected || 0
    const aM = (p?.expenses.metaAds || 0) / GST
    const aCAC = aO > 0 ? aM / aO : 0
    const aAOV = aO > 0 ? aR / aO : 0
    const aMargin = aR > 0 ? aP / aR : 0
    const expectedByNow = winDays > 0 ? tO * (winElapsed / winDays) : 0
    const pacePct = expectedByNow > 0 ? aO / expectedByNow * 100 : 0
    return { tO, tProfit, tRev, aO, aR, aP, aM, aCAC, aAOV, aMargin, expectedByNow, pacePct }
  })()

  const StatBox = ({ label, actual, target, good, sub }) => (
    <div className="glass-card p-4">
      <p className="metric-label mb-1">{label}</p>
      <p className={`text-xl font-bold font-mono ${good === undefined ? 'text-txt-primary' : good ? 'text-cash-green' : 'text-cash-red'}`}>{actual}</p>
      {target !== undefined && <p className="text-[11px] text-txt-muted mt-0.5">target {target}</p>}
      {sub && <p className="text-[11px] text-txt-muted mt-0.5">{sub}</p>}
    </div>
  )

  return (
    <div className="space-y-5 fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-accent">Target vs Reality</h2>
          <p className="text-sm text-txt-muted mt-1">
            <span className="font-semibold text-accent">{winLabelLong}</span>
            {isWindow && <span className="ml-1 text-[11px] px-1.5 py-0.5 rounded bg-ev-light text-accent">custom window</span>}
            {' · '}{winStarted ? `day ${winElapsed} of ${winDays}` : 'not started yet'}{' · '}{cachedDays}/{windowDates.length} synced
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setEditing(!editing)} className={`btn-ghost text-sm flex items-center gap-1.5 ${editing ? 'text-yellow-600' : ''}`}>
            <Settings size={14} /> {editing ? 'Editing...' : 'Edit Targets'}
          </button>
          <button onClick={syncMTD} disabled={syncing || windowDates.length === 0} className="btn-primary flex items-center gap-2">
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
            {syncing ? `Day ${syncProgress.current}/${syncProgress.total}` : cachedDays < windowDates.length ? `Sync ${windowDates.length - cachedDays} Days` : 'Refresh Today'}
          </button>
        </div>
      </div>

      {/* Target Editor */}
      {editing && <TargetEditor rawTargets={rawTargets} onSave={saveTargets} onCancel={() => setEditing(false)} dbProducts={dbProducts} referenceData={referenceData} refRange={refRange} setRefRange={setRefRange} />}

      {syncing && (
        <div className="glass-card p-3">
          <div className="flex justify-between mb-1.5">
            <span className="text-xs text-txt-muted">Fetching {syncProgress.day}...</span>
            <span className="text-xs font-mono text-txt-primary">{syncProgress.current}/{syncProgress.total}</span>
          </div>
          <Bar pct={syncProgress.total > 0 ? syncProgress.current / syncProgress.total * 100 : 0} />
        </div>
      )}

      {/* Window progress */}
      <div className="glass-card p-4">
        <div className="flex justify-between mb-2">
          <span className="text-xs text-txt-muted flex items-center gap-1"><Calendar size={12} /> Window Progress</span>
          <span className="text-xs font-mono text-txt-primary">{timePct.toFixed(0)}% of window · {winRemaining} days left</span>
        </div>
        <Bar pct={timePct} color="bg-brand-500" h="h-3" />
      </div>

      {!ready && <div className="glass-card p-8 text-center"><RefreshCw size={24} className="text-txt-muted mx-auto mb-3 animate-spin" /><p className="text-sm text-txt-muted">Loading cached data...</p></div>}

      {ready && !winStarted && (
        <div className="space-y-4">
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 mb-1">
              <Calendar size={18} className="text-accent" />
              <h3 className="text-lg font-semibold text-accent">Daily plan for {winLabelLong}</h3>
            </div>
            <p className="text-sm text-txt-muted">{winDays} days · starts in {Math.max(0, Math.round((new Date(winStart+'T00:00:00') - new Date(todayStr+'T00:00:00'))/86400000))} day{Math.round((new Date(winStart+'T00:00:00') - new Date(todayStr+'T00:00:00'))/86400000) !== 1 ? 's' : ''}. Here's what each product needs every day to hit target.</p>
          </div>

          <div className="glass-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead><tr className="border-b border-brand-300/50 text-[10px] text-txt-muted uppercase tracking-wider">
                  <th className="py-2.5 px-4">Product</th>
                  <th className="py-2.5 px-3 text-right">Orders/day</th>
                  <th className="py-2.5 px-3 text-right">CAC benchmark<br/>(pre-GST)</th>
                  <th className="py-2.5 px-3 text-right">Daily budget<br/>(pre-GST)</th>
                  <th className="py-2.5 px-3 text-right">Daily budget<br/>(with GST)</th>
                  <th className="py-2.5 px-3 text-right">AOV target</th>
                  <th className="py-2.5 px-3 text-right">Revenue/day</th>
                  <th className="py-2.5 px-3 text-right">Profit/day</th>
                  <th className="py-2.5 px-3 text-right">Window orders</th>
                </tr></thead>
                <tbody>
                  {targets.products.map(t => {
                    const ordDay = (t.ordersMonthly || 0) / winDays
                    const budgetPre = ordDay * (t.cac || 0)
                    const budgetGst = budgetPre * GST
                    const revDay = ordDay * (t.aov || 0)
                    const profitDay = (t.profitMonthly || 0) / winDays
                    return (
                      <tr key={t.code} className="border-b border-brand-300/50/50 hover:bg-ev-light">
                        <td className="py-3 px-4"><div className="flex items-center gap-2"><span className="text-sm font-medium text-accent">{t.name}</span><span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-ev-light text-accent">{t.code}</span></div></td>
                        <td className="py-3 px-3 text-right font-mono text-sm font-bold text-txt-primary">{Math.round(ordDay)}</td>
                        <td className="py-3 px-3 text-right font-mono text-sm text-accent font-bold">₹{formatExact(t.cac)}</td>
                        <td className="py-3 px-3 text-right font-mono text-sm font-bold text-txt-primary">₹{formatExact(Math.round(budgetPre))}</td>
                        <td className="py-3 px-3 text-right font-mono text-xs text-txt-muted">₹{formatExact(Math.round(budgetGst))}</td>
                        <td className="py-3 px-3 text-right font-mono text-xs text-txt-secondary">₹{formatExact(t.aov)}</td>
                        <td className="py-3 px-3 text-right font-mono text-xs text-txt-secondary">₹{formatExact(Math.round(revDay))}</td>
                        <td className={`py-3 px-3 text-right font-mono text-xs font-bold ${profitDay >= 0 ? 'text-cash-green' : 'text-cash-red'}`}>₹{formatExact(Math.round(profitDay))}</td>
                        <td className="py-3 px-3 text-right font-mono text-xs text-txt-muted">{formatExact(t.ordersMonthly)}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-brand-300 bg-ev-light font-bold">
                    <td className="py-3 px-4 text-xs text-accent">TOTAL / DAY</td>
                    <td className="py-3 px-3 text-right font-mono text-sm text-txt-primary">{Math.round(targets.products.reduce((s,t)=>s+(t.ordersMonthly||0)/winDays,0))}</td>
                    <td className="py-3 px-3 text-right font-mono text-xs text-txt-muted">blended ₹{formatExact(Math.round(targets.products.reduce((s,t)=>s+(t.ordersMonthly||0)*(t.cac||0),0)/Math.max(1,targets.products.reduce((s,t)=>s+(t.ordersMonthly||0),0))))}</td>
                    <td className="py-3 px-3 text-right font-mono text-sm text-txt-primary">₹{formatExact(Math.round(targets.products.reduce((s,t)=>s+((t.ordersMonthly||0)/winDays)*(t.cac||0),0)))}</td>
                    <td className="py-3 px-3 text-right font-mono text-xs text-txt-muted">₹{formatExact(Math.round(targets.products.reduce((s,t)=>s+((t.ordersMonthly||0)/winDays)*(t.cac||0)*GST,0)))}</td>
                    <td className="py-3 px-3"></td>
                    <td className="py-3 px-3 text-right font-mono text-xs text-txt-primary">₹{formatExact(Math.round(targets.products.reduce((s,t)=>s+((t.ordersMonthly||0)/winDays)*(t.aov||0),0)))}</td>
                    <td className="py-3 px-3 text-right font-mono text-xs text-cash-green">₹{formatExact(Math.round(targets.totalProfit/winDays))}</td>
                    <td className="py-3 px-3 text-right font-mono text-xs text-txt-muted">{formatExact(targets.products.reduce((s,t)=>s+(t.ordersMonthly||0),0))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="px-5 py-2.5 border-t border-brand-300/50">
              <Tip>Orders/day = window target ÷ {winDays} days. Daily budget (pre-GST) = orders/day × CAC benchmark. Meta shows pre-GST spend, so use the pre-GST column when setting Meta budgets; the with-GST column is your actual cash outflow. Once the window starts, this page switches to live target-vs-actual tracking.</Tip>
            </div>
          </div>
        </div>
      )}

      {ready && winStarted && !hasFetched && !syncing && (
        <div className="glass-card p-10 text-center">
          <Target size={48} className="text-txt-muted mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-accent mb-2">Sync your data first</h3>
          <p className="text-sm text-txt-muted">Click "Sync Days" above to pull {windowDates.length} day{windowDates.length>1?'s':''} of this window.</p>
        </div>
      )}

      {p && winStarted && (<>
        {/* Tabs */}
        <div className="flex items-center gap-1.5 flex-wrap glass-card p-1.5">
          <button onClick={() => setSelectedTab('overview')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${selectedTab === 'overview' ? 'bg-accent text-white' : 'text-txt-muted hover:text-accent hover:bg-ev-light'}`}>
            Overview
          </button>
          {targets.products.map(t => {
            const st = productStats(t)
            const ok = st.pacePct >= 90
            return (
              <button key={t.code} onClick={() => setSelectedTab(t.code)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${selectedTab === t.code ? 'bg-accent text-white' : 'text-txt-muted hover:text-accent hover:bg-ev-light'}`}>
                {t.code}
                <span className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-cash-green' : 'bg-cash-red'}`} />
              </button>
            )
          })}
        </div>

        {/* OVERVIEW TAB */}
        {selectedTab === 'overview' && (<>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatBox label="Orders" actual={formatExact(overall.aO)} target={formatExact(overall.tO)} good={overall.aO >= overall.expectedByNow * 0.9} sub={`pace ${overall.pacePct.toFixed(0)}% · need ${winRemaining>0?Math.ceil((overall.tO-overall.aO)/winRemaining):0}/day`} />
            <StatBox label="Profit" actual={`₹${formatExact(overall.aP)}`} target={`₹${formatExact(overall.tProfit)}`} good={overall.tProfit>0 && overall.aP >= overall.tProfit*(winElapsed/winDays)*0.9} sub={`${overall.tProfit>0?Math.round(overall.aP/overall.tProfit*100):0}% of goal`} />
            <StatBox label="Blended CAC" actual={`₹${formatExact(Math.round(overall.aCAC))}`} sub="pre-GST · match Meta to window dates" />
            <StatBox label="Margin" actual={`${(overall.aMargin*100).toFixed(1)}%`} sub={`AOV ₹${formatExact(Math.round(overall.aAOV))}`} />
          </div>

          <div className="glass-card overflow-hidden">
            <div className="px-5 py-3 border-b border-brand-300/50 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-accent">All products · window totals</h3>
              <span className="text-[11px] text-txt-muted">{winLabel}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead><tr className="border-b border-brand-300/50 text-[10px] text-txt-muted uppercase tracking-wider">
                  <th className="py-2.5 px-4">Product</th><th className="py-2.5 px-3 text-right">Orders</th><th className="py-2.5 px-3 text-right">Pace</th>
                  <th className="py-2.5 px-3 text-right">CAC</th><th className="py-2.5 px-3 text-right">AOV</th><th className="py-2.5 px-3 text-right">Profit</th><th className="py-2.5 px-3 text-right">Need/day</th>
                </tr></thead>
                <tbody>
                  {targets.products.map(t => {
                    const st = productStats(t)
                    return (
                      <tr key={t.code} className="border-b border-brand-300/50/50 hover:bg-ev-light cursor-pointer" onClick={() => setSelectedTab(t.code)}>
                        <td className="py-3 px-4"><div className="flex items-center gap-2"><span className="text-sm font-medium text-accent">{t.name}</span><span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-ev-light text-accent">{t.code}</span></div></td>
                        <td className="py-3 px-3 text-right font-mono text-xs"><span className="font-bold text-txt-primary">{formatExact(st.aO)}</span><span className="text-txt-muted">/{formatExact(st.tO)}</span></td>
                        <td className="py-3 px-3 text-right"><span className={`text-xs font-bold font-mono ${st.pacePct>=90?'text-cash-green':st.pacePct>=70?'text-yellow-600':'text-cash-red'}`}>{st.pacePct.toFixed(0)}%</span></td>
                        <td className={`py-3 px-3 text-right font-mono text-xs ${st.aCAC>0 && st.aCAC<=t.cac?'text-cash-green':st.aCAC>0?'text-cash-red':'text-txt-muted'}`}>{st.aCAC>0?`₹${formatExact(Math.round(st.aCAC))}`:'--'}</td>
                        <td className={`py-3 px-3 text-right font-mono text-xs ${st.aAOV>=t.aov*0.95?'text-cash-green':'text-yellow-600'}`}>₹{formatExact(Math.round(st.aAOV))}</td>
                        <td className="py-3 px-3 text-right font-mono text-xs text-txt-secondary">₹{formatExact(st.aP)}</td>
                        <td className={`py-3 px-3 text-right font-mono text-xs ${st.needDaily>st.avgDaily*1.3?'text-cash-red':'text-txt-secondary'}`}>{st.needDaily>0?st.needDaily:'-'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>)}

        {/* PER-PRODUCT TABS */}
        {targets.products.map(t => {
          if (selectedTab !== t.code) return null
          const st = productStats(t)
          const onPace = st.pacePct >= 90
          return (
            <div key={t.code} className="space-y-4">
              {/* Product header */}
              <div className="glass-card p-5">
                <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-accent">{t.name}</h3>
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-ev-light text-accent">{t.code}</span>
                  </div>
                  <span className={`text-sm font-bold px-3 py-1 rounded-lg ${onPace?'bg-green-50 text-cash-green':'bg-red-50 text-cash-red'}`}>
                    {onPace ? 'On pace' : 'Behind pace'} · {st.pacePct.toFixed(0)}%
                  </span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <StatBox label="Orders (window)" actual={formatExact(st.aO)} target={formatExact(st.tO)} good={st.aO >= st.expectedByNow*0.9} sub={`${st.ordPct.toFixed(0)}% of goal · ${Math.round(st.avgDaily)}/day avg`} />
                  <StatBox label="CAC (pre-GST)" actual={st.aCAC>0?`₹${formatExact(Math.round(st.aCAC))}`:'no spend'} target={`₹${formatExact(t.cac)}`} good={st.aCAC>0 && st.aCAC<=t.cac} sub="match Meta to window dates" />
                  <StatBox label="AOV" actual={`₹${formatExact(Math.round(st.aAOV))}`} target={`₹${formatExact(t.aov)}`} good={st.aAOV>=t.aov*0.95} />
                  <StatBox label="Profit (window)" actual={`₹${formatExact(st.aP)}`} target={`₹${formatExact(st.tProfit)}`} good={st.tProfit>0 && st.aP>=st.tProfit*(winElapsed/winDays)*0.9} sub={`₹${formatExact(Math.round(st.aPPO))}/order · ${(st.aMargin*100).toFixed(1)}% margin`} />
                </div>
              </div>

              {/* What to do */}
              <div className="glass-card p-5">
                <h4 className="text-sm font-semibold text-accent mb-3">What to do for the rest of the window</h4>
                <div className="space-y-2 text-sm text-txt-secondary">
                  {winRemaining > 0 ? (<>
                    <p>1. You need <span className="font-bold text-accent">{Math.max(0, st.tO - st.aO)}</span> more orders across <span className="font-bold text-accent">{winRemaining}</span> remaining days = <span className="font-bold text-accent">{st.needDaily > 0 ? st.needDaily : 0}/day</span> (running {Math.round(st.avgDaily)}/day now).</p>
                    {st.aCAC > 0 && <p>2. At your CAC of ₹{formatExact(Math.round(st.aCAC))}, that's about <span className="font-bold text-accent">₹{formatExact(Math.round(st.needSpendDaily))}/day</span> of ad spend.</p>}
                    {st.aCAC > t.cac && <p>3. CAC ₹{formatExact(Math.round(st.aCAC))} is above target ₹{formatExact(t.cac)} — pause ad sets above ₹{formatExact(Math.round(t.cac*1.1))}, duplicate winners.</p>}
                    {st.aCAC > 0 && st.aCAC <= t.cac && <p>3. CAC ₹{formatExact(Math.round(st.aCAC))} is within target ₹{formatExact(t.cac)} — scale the winners.</p>}
                    {st.aAOV < t.aov*0.95 && <p>4. AOV ₹{formatExact(Math.round(st.aAOV))} is below target ₹{formatExact(t.aov)} — push bundles and upsells.</p>}
                  </>) : (
                    <p>Window complete. Final: {formatExact(st.aO)} orders ({st.ordPct.toFixed(0)}% of the {formatExact(st.tO)} goal), ₹{formatExact(st.aP)} profit.</p>
                  )}
                  {st.aCAC === 0 && st.aO > 0 && <p className="text-cash-red">No Meta spend mapped to {t.code}. Fix the campaign code in Product Database, otherwise CAC and profit here are overstated.</p>}
                </div>
              </div>

              {/* Payment mix */}
              <div className="glass-card p-5">
                <h4 className="text-sm font-semibold text-accent mb-3">Payment mix (this window)</h4>
                <div className="grid grid-cols-3 gap-3">
                  <div><p className="text-[10px] text-txt-muted uppercase">Prepaid</p><p className="text-lg font-bold font-mono text-txt-primary">{Math.round(st.prepaidPct*100)}%</p>{st.aovPrepaid>0 && <p className="text-[10px] text-txt-muted">AOV ₹{formatExact(st.aovPrepaid)}</p>}</div>
                  <div><p className="text-[10px] text-txt-muted uppercase">C2P</p><p className="text-lg font-bold font-mono text-txt-primary">{Math.round(st.c2pPct*100)}%</p>{st.aovC2p>0 && <p className="text-[10px] text-txt-muted">AOV ₹{formatExact(st.aovC2p)}</p>}</div>
                  <div><p className="text-[10px] text-txt-muted uppercase">COD</p><p className="text-lg font-bold font-mono text-txt-primary">{Math.round(st.codPct*100)}%</p>{st.aovCod>0 && <p className="text-[10px] text-txt-muted">AOV ₹{formatExact(st.aovCod)}</p>}</div>
                </div>
              </div>

              {/* Bundle mix: Buy 1 / Buy 2 / Buy 3 */}
              <div className="glass-card p-5">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-accent">Bundle mix (this window)</h4>
                  <span className="text-[11px] text-txt-muted">{formatExact(st.bundle.total)} line items</span>
                </div>
                {st.bundle.total > 0 ? (<>
                  <div className="flex h-7 rounded-lg overflow-hidden mb-3">
                    {st.bundle.b1Pct > 0 && <div style={{ width: `${st.bundle.b1Pct*100}%` }} className="bg-brand-400 flex items-center justify-center"><span className="text-[10px] font-bold text-white">{Math.round(st.bundle.b1Pct*100)}%</span></div>}
                    {st.bundle.b2Pct > 0 && <div style={{ width: `${st.bundle.b2Pct*100}%` }} className="bg-brand-600 flex items-center justify-center"><span className="text-[10px] font-bold text-white">{Math.round(st.bundle.b2Pct*100)}%</span></div>}
                    {st.bundle.b3Pct > 0 && <div style={{ width: `${st.bundle.b3Pct*100}%` }} className="bg-accent flex items-center justify-center"><span className="text-[10px] font-bold text-white">{Math.round(st.bundle.b3Pct*100)}%</span></div>}
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div><p className="text-[10px] text-txt-muted uppercase flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-brand-400 inline-block" />Buy 1</p><p className="text-lg font-bold font-mono text-txt-primary">{Math.round(st.bundle.b1Pct*100)}%</p><p className="text-[10px] text-txt-muted">{formatExact(st.bundle.b1)} orders</p></div>
                    <div><p className="text-[10px] text-txt-muted uppercase flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-brand-600 inline-block" />Buy 2</p><p className="text-lg font-bold font-mono text-txt-primary">{Math.round(st.bundle.b2Pct*100)}%</p><p className="text-[10px] text-txt-muted">{formatExact(st.bundle.b2)} orders</p></div>
                    <div><p className="text-[10px] text-txt-muted uppercase flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-accent inline-block" />Buy 3</p><p className="text-lg font-bold font-mono text-txt-primary">{Math.round(st.bundle.b3Pct*100)}%</p><p className="text-[10px] text-txt-muted">{formatExact(st.bundle.b3)} orders</p></div>
                  </div>
                </>) : (
                  <p className="text-xs text-txt-muted">No bundle data in this window yet.</p>
                )}
              </div>

              {/* Princess Combo performance (only if this product has combo orders) */}
              {st.combo.hasCombo && (
                <div className="glass-card p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold text-accent">Princess Combo vs solo</h4>
                    <span className="text-[11px] text-txt-muted">{(st.combo.attachPct*100).toFixed(1)}% of {t.code} orders are combo</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-xl p-4" style={{ background: 'rgba(233,213,246,0.25)' }}>
                      <p className="text-[10px] text-txt-muted uppercase tracking-wider mb-1">Princess Combo</p>
                      <p className="text-2xl font-bold font-mono text-accent">{formatExact(st.combo.comboOrders)}</p>
                      <p className="text-[11px] text-txt-muted mt-0.5">orders · AOV ₹{formatExact(Math.round(st.combo.comboAOV))}</p>
                    </div>
                    <div className="rounded-xl p-4" style={{ background: 'rgba(55,35,72,0.05)' }}>
                      <p className="text-[10px] text-txt-muted uppercase tracking-wider mb-1">Necklace solo</p>
                      <p className="text-2xl font-bold font-mono text-txt-primary">{formatExact(st.combo.soloOrders)}</p>
                      <p className="text-[11px] text-txt-muted mt-0.5">orders · AOV ₹{formatExact(Math.round(st.combo.soloAOV))}</p>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-brand-300/50">
                    <p className="text-xs text-txt-secondary">
                      {st.combo.comboAOV > st.combo.soloAOV
                        ? `Combo lifts AOV by ₹${formatExact(Math.round(st.combo.comboAOV - st.combo.soloAOV))} (${st.combo.soloAOV>0?Math.round((st.combo.comboAOV/st.combo.soloAOV-1)*100):0}% higher) on ${(st.combo.attachPct*100).toFixed(1)}% of orders.`
                        : `Combo AOV ₹${formatExact(Math.round(st.combo.comboAOV))} is not above solo ₹${formatExact(Math.round(st.combo.soloAOV))} — check pricing and vendor cost.`}
                    </p>
                    <p className="text-[11px] text-txt-muted mt-1">Note: combo ships necklace + anklet, so set its variant vendor cost to the sum (~₹146) in Product Database, or profit here is overstated.</p>
                  </div>
                </div>
              )}
              <div className="glass-card overflow-hidden">
                <div className="px-5 py-3 border-b border-brand-300/50"><h4 className="text-sm font-semibold text-accent">Day by day · {t.code}</h4></div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead><tr className="border-b border-brand-300/50 text-[10px] text-txt-muted uppercase tracking-wider">
                      <th className="py-2 px-4">Date</th><th className="py-2 px-3 text-right">Orders</th><th className="py-2 px-3 text-right">Spend</th><th className="py-2 px-3 text-right">CAC</th><th className="py-2 px-3 text-right">Profit</th>
                    </tr></thead>
                    <tbody>
                      {dailyRows.map(r => {
                        const pr = r.empty ? null : (r.products || []).find(x => x.name === t.name)
                        const o = pr?.totalUnits || 0
                        const sp = (pr?.metaSpend || 0) / GST
                        const pf = pr?.profit || 0
                        const cac = o > 0 ? sp/o : 0
                        return (
                          <tr key={r.date} className={`border-b border-brand-300/50/50 ${r.empty?'opacity-30':'hover:bg-ev-light'}`}>
                            <td className="py-2 px-4 text-xs font-mono text-txt-muted">{new Date(r.date+'T00:00:00').toLocaleDateString('en-IN',{day:'numeric',month:'short',weekday:'short'})}</td>
                            {r.empty ? <td colSpan={4} className="py-2 px-3 text-xs text-txt-muted text-center">Not synced</td> : <>
                              <td className="py-2 px-3 text-right font-mono text-xs font-bold text-txt-primary">{o}</td>
                              <td className="py-2 px-3 text-right font-mono text-xs text-txt-muted">₹{formatExact(Math.round(sp))}</td>
                              <td className={`py-2 px-3 text-right font-mono text-xs ${cac>0&&cac<=t.cac?'text-cash-green':cac>0?'text-cash-red':'text-txt-muted'}`}>{cac>0?`₹${formatExact(Math.round(cac))}`:'--'}</td>
                              <td className={`py-2 px-3 text-right font-mono text-xs ${pf>=0?'text-cash-green':'text-cash-red'}`}>₹{formatExact(Math.round(pf))}</td>
                            </>}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )
        })}
      </>)}
    </div>
  )
}
