import React, { useState, useMemo, useCallback, useEffect } from 'react'
import { Target, TrendingUp, Calendar, Zap, RefreshCw, ChevronDown, ChevronUp, Info, ArrowUp, ArrowDown, Plus, Trash2, Settings, Save, X } from 'lucide-react'
import { getDaysInMonth, getDaysElapsed, getCurrentMonth, buildTargets, estimateProfit, DEFAULT_RAW_TARGETS, TARGETS_CACHE_KEY, targetsKeyForMonth } from '../lib/targets'
import { useDataStore } from '../lib/dataStore'
import { calculateFullPnL, formatExact, formatPercent, getProductFamily } from '../lib/profitEngine'
import { getProducts, buildCampaignMap, buildVendorPriceMap, allocateMetaSpend } from '../lib/productDB'
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
function TargetEditor({ rawTargets, onSave, onCancel, dbProducts, referenceData }) {
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

  const daysInMonth = getDaysInMonth(form.month)
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

      <div className="mb-4">
        <label className="text-[10px] text-txt-muted uppercase tracking-wider mb-1 block">Target Month</label>
        <input type="month" value={form.month} onChange={e => setForm(prev => ({ ...prev, month: e.target.value }))} className="input-field !w-48 !py-1.5 !text-sm" />
      </div>

      {(() => {
        const anyRef = Object.values(referenceData)[0]
        if (!anyRef) return null
        return (
          <div className="mb-4 px-3 py-2 rounded-lg bg-ev-light border border-brand-300/50 flex items-center justify-between flex-wrap gap-2">
            <p className="text-[11px] text-accent">
              <span className="font-semibold">Reference window:</span> {anyRef.rangeLabel} ({anyRef.daysWithData} days synced)
              <span className="text-txt-muted"> — set Meta to this exact range to compare</span>
            </p>
            {anyRef.missingDates.length > 0 && (
              <p className="text-[11px] text-yellow-600">
                ⚠ {anyRef.missingDates.length} gap{anyRef.missingDates.length > 1 ? 's' : ''} inside the window — sync from Dashboard for a clean match
              </p>
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
                  <label className="text-[9px] text-txt-muted uppercase block mb-1">Monthly Orders</label>
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
                  <label className="text-[9px] text-txt-muted uppercase block mb-1">Est. Monthly Profit</label>
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

  // Which month's targets we're working with (default: current month)
  const [activeMonth, setActiveMonth] = useState(getCurrentMonth())

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
    const today = new Date().toISOString().split('T')[0]
    const days = []
    for (let i = 1; i <= daysElapsed; i++) days.push(`${month}-${String(i).padStart(2, '0')}`)
    const toFetch = days.filter(ds => ds === today || !getCachedData(ds, ds))
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
    const dbP = getProducts()
    const campaignMap = buildCampaignMap(dbP)
    const vendorPriceMap = buildVendorPriceMap(dbP)
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
  const GST = 1.18
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

  // Build last 30 days reference data per product from dashboard cache
  const referenceData = useMemo(() => {
    const today = new Date()
    const ref = {}
    let allOrders = [], allCampaigns = []
    let daysWithData = 0
    const syncedDates = []
    const missingDates = []

    // True rolling 30-day window (yesterday back 30 days)
    for (let i = 1; i <= 30; i++) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
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
  }, [cache])

  const [y, m] = month.split('-')
  const monthName = new Date(parseInt(y), parseInt(m) - 1).toLocaleString('en', { month: 'long', year: 'numeric' })

  return (
    <div className="space-y-5 fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-accent">Target vs Reality</h2>
          <p className="text-sm text-txt-muted mt-1">{monthName} | Day {daysElapsed}/{daysTotal} | {cachedDays}/{daysElapsed} days synced</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setEditing(!editing)} className={`btn-ghost text-sm flex items-center gap-1.5 ${editing ? 'text-yellow-600' : ''}`}>
            <Settings size={14} /> {editing ? 'Editing...' : 'Edit Targets'}
          </button>
          <button onClick={syncMTD} disabled={syncing} className="btn-primary flex items-center gap-2">
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
            {syncing ? `Day ${syncProgress.current}/${syncProgress.total}` : cachedDays < daysElapsed ? `Sync ${daysElapsed - cachedDays} Missing Days` : 'Refresh Today'}
          </button>
        </div>
      </div>

      {/* Target Editor */}
      {editing && <TargetEditor rawTargets={rawTargets} onSave={saveTargets} onCancel={() => setEditing(false)} dbProducts={dbProducts} referenceData={referenceData} />}

      {syncing && (
        <div className="glass-card p-3">
          <div className="flex justify-between mb-1.5">
            <span className="text-xs text-txt-muted">Fetching {syncProgress.day}...</span>
            <span className="text-xs font-mono text-txt-primary">{syncProgress.current}/{syncProgress.total}</span>
          </div>
          <Bar pct={syncProgress.total > 0 ? syncProgress.current / syncProgress.total * 100 : 0} />
        </div>
      )}

      {/* Month Progress */}
      <div className="glass-card p-4">
        <div className="flex justify-between mb-2">
          <span className="text-xs text-txt-muted flex items-center gap-1"><Calendar size={12} /> Month Progress</span>
          <span className="text-xs font-mono text-txt-primary">{timePct.toFixed(0)}% done | {daysRemaining} days left</span>
        </div>
        <Bar pct={timePct} color="bg-brand-500" h="h-3" />
      </div>

      {!ready && <div className="glass-card p-8 text-center"><RefreshCw size={24} className="text-txt-muted mx-auto mb-3 animate-spin" /><p className="text-sm text-txt-muted">Loading cached data...</p></div>}

      {ready && !hasFetched && !syncing && (
        <div className="glass-card p-10 text-center">
          <Target size={48} className="text-txt-muted mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-accent mb-2">Sync your data first</h3>
          <p className="text-sm text-txt-muted">Click "Sync Missing Days" above. Each day takes ~2 seconds.</p>
        </div>
      )}

      {p && (<>
        {/* ============ ACTION SUMMARY ============ */}
        {(() => {
          const overallOnTrack = aOrd >= tOrdMTD * 0.9
          const productActions = targets.products.map(t => {
            const actual = p.products.find(pr => pr.name === t.name)
            const aO = actual?.totalUnits || 0
            const aR = actual?.revenue || 0
            const aM = (actual?.metaSpend || 0) / GST
            const aC = aO > 0 ? aM / aO : t.cac
            const aA = aO > 0 ? aR / aO : 0
            const tO = Math.round(t.ordersDaily * daysElapsed)
            const pct = tO > 0 ? aO / tO : 0
            const avgDaily = daysElapsed > 0 ? aO / daysElapsed : 0
            const avgSpend = daysElapsed > 0 ? aM / daysElapsed : 0
            const actualCAC = aO > 0 ? aM / aO : t.cac
            const needOrders = daysRemaining > 0 ? Math.ceil((t.ordersMonthly - aO) / daysRemaining) : t.ordersDaily
            const needSpend = needOrders * actualCAC
            const onTrack = pct >= 0.9
            const steps = []
            if (onTrack) {
              steps.push(`Maintain daily budget at ₹${formatExact(Math.round(avgSpend))}/day -- your CAC of ₹${formatExact(Math.round(actualCAC))} is delivering ${Math.round(avgDaily)} orders/day`)
            } else {
              steps.push(`Set daily budget to ₹${formatExact(Math.round(needSpend))} (${needOrders} orders × ₹${formatExact(Math.round(actualCAC))} CAC)`)
            }
            if (!onTrack) steps.push(`Get ${needOrders} orders tomorrow (averaging ${Math.round(avgDaily)}/day, target is ${t.ordersDaily}/day)`)
            else steps.push(`Maintain ${t.ordersDaily} orders/day -- you're on pace`)
            if (aC > t.cac && aC > 0) steps.push(`Bring CAC down from ₹${Math.round(aC)} to ₹${t.cac} -- pause ad sets with CAC above ₹${Math.round(t.cac * 1.2)}, duplicate winners`)
            else if (aC > 0) steps.push(`CAC ₹${Math.round(aC)} is within target ₹${t.cac} -- keep running current winners`)
            if (aA > 0 && aA < t.aov * 0.85) steps.push(`Lift AOV from ₹${Math.round(aA)} to ₹${t.aov} -- push Buy 2/3 bundles, Gift Box upsells`)
            return { ...t, aO, tO, pct, onTrack, needOrders, needSpend, avgDaily, avgSpend, steps }
          })
          return (
            <div className="glass-card p-5 border-l-4 border-l-accent">
              <h3 className="text-base font-bold text-accent mb-1">Tomorrow's Game Plan</h3>
              <p className="text-xs text-txt-muted mb-4">
                {overallOnTrack ? `You're on track overall (${aOrd}/${tOrdMTD} orders by Day ${daysElapsed}). Stay consistent.` : `You're behind by ${formatExact(tOrdMTD - aOrd)} orders. Here's what each product needs:`}
              </p>
              <div className="space-y-4">
                {productActions.map(pa => (
                  <div key={pa.name} className={`p-4 rounded-xl ${pa.onTrack ? 'bg-green-50 border border-green-100' : 'bg-red-50 border border-red-100'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm ${pa.onTrack ? 'text-cash-green' : 'text-cash-red'}`}>{pa.onTrack ? '✓' : '✗'}</span>
                        <h4 className="text-sm font-semibold text-accent">{pa.name}</h4>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-ev-light text-accent">{pa.code}</span>
                      </div>
                      <span className={`text-xs font-mono font-bold ${pa.onTrack ? 'text-cash-green' : 'text-cash-red'}`}>{pa.aO}/{pa.tO} ({(pa.pct*100).toFixed(0)}%)</span>
                    </div>
                    <div className="space-y-1.5 ml-6">
                      {pa.steps.map((step, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <span className="text-yellow-600 text-xs mt-0.5">{i+1}.</span>
                          <p className="text-xs text-txt-muted leading-relaxed">{step}</p>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-4 ml-6 mt-2 pt-2 border-t border-brand-300/50/15">
                      <span className="text-[10px] text-txt-muted">Avg: {Math.round(pa.avgDaily)} orders/day</span>
                      <span className="text-[10px] text-txt-muted">Spend: ₹{formatExact(pa.avgSpend)}/day</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-3 border-t border-brand-300/50 flex flex-wrap gap-4">
                <div className="text-center"><p className="text-[9px] text-txt-muted uppercase">Total Budget</p><p className="text-sm font-bold font-mono text-txt-primary">₹{formatExact(productActions.reduce((s,pa)=>s+pa.needSpend,0))}</p></div>
                <div className="text-center"><p className="text-[9px] text-txt-muted uppercase">Total Orders</p><p className="text-sm font-bold font-mono text-txt-primary">{productActions.reduce((s,pa)=>s+pa.needOrders,0)}/day</p></div>
                <div className="text-center"><p className="text-[9px] text-txt-muted uppercase">Revenue Needed</p><p className="text-sm font-bold font-mono text-txt-primary">₹{formatExact(neededRevDay)}/day</p></div>
              </div>
            </div>
          )
        })()}

        {/* ============ PRODUCT TRACKER TABLE ============ */}
        <div className="glass-card overflow-hidden">
          <div className="px-5 py-3 border-b border-brand-300/50"><h3 className="text-sm font-semibold text-accent">Product Tracker</h3></div>
          <div className="overflow-x-auto">
            <table className="w-full text-left whitespace-nowrap">
              <thead>
                <tr className="border-b border-brand-300/50 text-[10px] text-txt-muted uppercase tracking-wider">
                  <th className="py-2.5 px-3" rowSpan={2}>Product</th>
                  <th className="py-1.5 px-2 text-center border-b border-brand-300/50" colSpan={5}>Orders / Day</th>
                  <th className="py-1.5 px-2 text-center border-b border-brand-300/50" colSpan={4}>Meta Spend / Day (pre-GST)</th>
                  <th className="py-1.5 px-2 text-center border-b border-brand-300/50" colSpan={3}>AOV (full order)</th>
                  <th className="py-1.5 px-2 text-center border-b border-brand-300/50" colSpan={4}>Profit / Day</th>
                </tr>
                <tr className="border-b border-brand-300/50 text-[9px] text-txt-muted uppercase">
                  <th className="py-1.5 px-2 text-right">Monthly</th><th className="py-1.5 px-2 text-right">Target</th><th className="py-1.5 px-2 text-right">Avg</th><th className="py-1.5 px-2 text-right">Status</th><th className="py-1.5 px-2 text-right">Need*</th>
                  <th className="py-1.5 px-2 text-right">Target</th><th className="py-1.5 px-2 text-right">Avg</th><th className="py-1.5 px-2 text-right">CAC</th><th className="py-1.5 px-2 text-right">Need*</th>
                  <th className="py-1.5 px-2 text-right">Prepaid</th><th className="py-1.5 px-2 text-right">C2P</th><th className="py-1.5 px-2 text-right">COD</th>
                  <th className="py-1.5 px-2 text-right">Monthly</th><th className="py-1.5 px-2 text-right">Target</th><th className="py-1.5 px-2 text-right">Avg</th><th className="py-1.5 px-2 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {targets.products.map(t => {
                  const actual = p.products.find(pr => pr.name === t.name)
                  const aO = actual?.totalUnits || 0
                  const aM = (actual?.metaSpend || 0) / GST
                  const aP = actual?.profit || 0
                  const avgOrd = daysElapsed > 0 ? aO / daysElapsed : 0
                  const avgSpd = daysElapsed > 0 ? aM / daysElapsed : 0
                  const avgProfit = daysElapsed > 0 ? aP / daysElapsed : 0
                  const actualCAC = aO > 0 ? aM / aO : t.cac
                  const needOrd = daysRemaining > 0 ? Math.ceil((t.ordersMonthly - aO) / daysRemaining) : t.ordersDaily
                  const needSpd = needOrd * actualCAC
                  const ordOnTrack = avgOrd >= t.ordersDaily * 0.9
                  const profitOnTrack = avgProfit >= t.profitDaily * 0.9
                  const aPrepaidAOV = actual?.aovPrepaid || 0
                  const aC2pAOV = actual?.aovC2p || 0
                  const aCodAOV = actual?.aovCod || 0
                  return (
                    <tr key={t.name} className="border-b border-brand-300/50/50 hover:bg-ev-light">
                      <td className="py-2.5 px-3"><div className="flex items-center gap-2"><span className="text-sm font-medium text-accent">{t.name}</span><span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-ev-light text-accent">{t.code}</span></div></td>
                      <td className="py-2.5 px-2 text-right font-mono text-xs text-txt-muted">{formatExact(t.ordersMonthly)}</td>
                      <td className="py-2.5 px-2 text-right font-mono text-xs text-txt-muted">{t.ordersDaily}</td>
                      <td className={`py-2.5 px-2 text-right font-mono text-xs font-bold ${ordOnTrack ? 'text-cash-green' : 'text-cash-red'}`}>{Math.round(avgOrd)}</td>
                      <td className="py-2.5 px-2 text-right"><span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${ordOnTrack ? 'bg-green-50 text-cash-green' : 'bg-red-50 text-cash-red'}`}>{ordOnTrack ? 'On Track' : `Behind ${Math.round(t.ordersDaily - avgOrd)}`}</span></td>
                      <td className={`py-2.5 px-2 text-right font-mono text-xs font-bold ${needOrd > t.ordersDaily * 1.3 ? 'text-cash-red' : needOrd > t.ordersDaily ? 'text-yellow-600' : 'text-cash-green'}`}>{needOrd <= 0 ? '-' : needOrd}</td>
                      <td className="py-2.5 px-2 text-right font-mono text-xs text-txt-muted">₹{formatExact(t.spendDaily)}</td>
                      <td className={`py-2.5 px-2 text-right font-mono text-xs font-bold ${avgSpd > 0 ? 'text-txt-secondary' : 'text-txt-muted'}`}>₹{formatExact(Math.round(avgSpd))}</td>
                      <td className={`py-2.5 px-2 text-right font-mono text-xs ${actualCAC <= t.cac ? 'text-cash-green' : 'text-cash-red'}`}>₹{formatExact(Math.round(actualCAC))}</td>
                      <td className={`py-2.5 px-2 text-right font-mono text-xs font-bold ${needSpd > t.spendDaily * 1.3 ? 'text-cash-red' : needSpd > t.spendDaily ? 'text-yellow-600' : 'text-cash-green'}`}>₹{formatExact(Math.round(needSpd))}</td>
                      <td className={`py-2.5 px-2 text-right font-mono text-xs ${aPrepaidAOV >= t.aov * 0.9 ? 'text-cash-green' : aPrepaidAOV > 0 ? 'text-yellow-600' : 'text-txt-muted'}`}>{aPrepaidAOV > 0 ? `₹${formatExact(aPrepaidAOV)}` : '--'}</td>
                      <td className={`py-2.5 px-2 text-right font-mono text-xs ${aC2pAOV >= t.aov * 0.9 ? 'text-cash-green' : aC2pAOV > 0 ? 'text-yellow-600' : 'text-txt-muted'}`}>{aC2pAOV > 0 ? `₹${formatExact(aC2pAOV)}` : '--'}</td>
                      <td className={`py-2.5 px-2 text-right font-mono text-xs ${aCodAOV >= t.aov * 0.9 ? 'text-cash-green' : aCodAOV > 0 ? 'text-yellow-600' : 'text-txt-muted'}`}>{aCodAOV > 0 ? `₹${formatExact(aCodAOV)}` : '--'}</td>
                      <td className="py-2.5 px-2 text-right font-mono text-xs text-txt-muted">₹{formatExact(t.profitMonthly)}</td>
                      <td className="py-2.5 px-2 text-right font-mono text-xs text-txt-muted">₹{formatExact(t.profitDaily)}</td>
                      <td className={`py-2.5 px-2 text-right font-mono text-xs font-bold ${profitOnTrack ? 'text-cash-green' : 'text-cash-red'}`}>₹{formatExact(Math.round(avgProfit))}</td>
                      <td className="py-2.5 px-2 text-right"><span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${profitOnTrack ? 'bg-green-50 text-cash-green' : 'bg-red-50 text-cash-red'}`}>{profitOnTrack ? 'On Track' : avgProfit > 0 ? `Short ₹${formatExact(Math.round(t.profitDaily - avgProfit))}` : 'Loss'}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-2 border-t border-brand-300/50/50">
            <Tip>Need/Day for orders = remaining orders / {daysRemaining} days. Need/Day for spend = orders needed × your actual CAC. Profit/Day shows daily average vs target.</Tip>
          </div>
        </div>

        {/* ============ DAILY BREAKDOWN ============ */}
        <div className="glass-card overflow-hidden">
          <button onClick={() => setShowDaily(!showDaily)} className="w-full px-5 py-3 flex items-center justify-between hover:bg-ev-light">
            <h3 className="text-sm font-semibold text-accent">Daily Breakdown</h3>
            <ChevronDown size={16} className={`text-txt-muted transition-transform ${showDaily ? 'rotate-180' : ''}`} />
          </button>
          {showDaily && (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead><tr className="border-b border-brand-300/50 text-[10px] text-txt-muted uppercase tracking-wider">
                  <th className="py-2 px-3">Date</th><th className="py-2 px-3 text-right">Orders</th><th className="py-2 px-3 text-right">Revenue</th>
                  <th className="py-2 px-3 text-right">Meta (pre-GST)</th><th className="py-2 px-3 text-right">CAC</th><th className="py-2 px-3 text-right">AOV</th>
                  <th className="py-2 px-3 text-right">Profit</th><th className="py-2 px-3 text-right">Margin</th>
                </tr></thead>
                <tbody>
                  {dailyRows.map(r => (
                    <tr key={r.date} className={`border-b border-brand-300/50/50 ${r.empty ? 'opacity-30' : 'hover:bg-ev-light'}`}>
                      <td className="py-2 px-3 text-xs font-mono text-txt-muted">
                        {new Date(r.date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', weekday: 'short' })}
                      </td>
                      {r.empty ? <td colSpan={7} className="py-2 px-3 text-xs text-txt-muted text-center">Not synced</td> : <>
                        <td className={`py-2 px-3 text-right font-mono text-xs ${r.orders >= tOrdDaily ? 'text-cash-green' : 'text-cash-red'}`}>{r.orders}</td>
                        <td className="py-2 px-3 text-right font-mono text-xs text-txt-secondary">₹{formatExact(r.revenue)}</td>
                        <td className="py-2 px-3 text-right font-mono text-xs text-txt-muted">₹{formatExact(r.metaSpend / GST)}</td>
                        <td className={`py-2 px-3 text-right font-mono text-xs ${(r.cpp/GST) <= tCACavg ? 'text-cash-green' : 'text-cash-red'}`}>₹{formatExact(r.cpp / GST)}</td>
                        <td className="py-2 px-3 text-right font-mono text-xs text-txt-muted">₹{formatExact(r.aov)}</td>
                        <td className={`py-2 px-3 text-right font-mono text-xs font-bold ${r.profit >= 0 ? 'text-cash-green' : 'text-cash-red'}`}>₹{formatExact(r.profit)}</td>
                        <td className={`py-2 px-3 text-right font-mono text-xs ${r.margin >= 0.2 ? 'text-cash-green' : r.margin >= 0 ? 'text-yellow-600' : 'text-cash-red'}`}>{(r.margin*100).toFixed(1)}%</td>
                      </>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </>)}
    </div>
  )
}
