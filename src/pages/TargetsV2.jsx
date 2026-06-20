import React, { useState, useMemo, useCallback } from 'react'
import { Target, Calendar, Plus, Trash2, ChevronLeft, RefreshCw, TrendingUp, AlertCircle, X, Check } from 'lucide-react'
import { useDataStore } from '../lib/dataStore'
import { calculateFullPnL, formatExact, getProductFamily } from '../lib/profitEngine'
import { getProducts, buildCampaignMap, buildVendorPriceMap, allocateMetaSpend } from '../lib/productDB'
import { newTargetId, targetKey, TARGETS_INDEX_KEY, dayCountBetween, buildTargetEconomics, solveCAC, perOrderBreakdown } from '../lib/targets'
import { computeBaseline } from '../lib/baseline'
import { detectBuyMultiplier } from '../lib/vendorPrices'

const GST = 1.18
const fmtD = (ds) => ds ? new Date(ds + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''
const fmtDY = (ds) => ds ? new Date(ds + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
const todayStr = () => new Date().toISOString().split('T')[0]

function compactINR(n) {
  const v = Math.abs(Math.round(n)); const s = n < 0 ? '-' : ''
  if (v >= 10000000) return `${s}${(v / 10000000).toFixed(2)}Cr`
  if (v >= 100000) return `${s}${(v / 100000).toFixed(2)}L`
  if (v >= 1000) return `${s}${(v / 1000).toFixed(1)}K`
  return `${s}${v}`
}

const DEFAULT_PRODUCTS = [
  { name: 'Name Necklace', code: 'PNN' },
  { name: 'Snake Anklet', code: 'SA' },
  { name: 'Butterfly Anklet', code: 'BFA' },
  { name: 'Personalised Car Keychain', code: 'PCK' },
]

export default function TargetsV2() {
  const { cache, getCachedData, getCacheByKey, setCacheByKey, ready } = useDataStore()
  const [openId, setOpenId] = useState(null)
  const [creating, setCreating] = useState(false)

  // Target index: list of {id, name, windowStart, windowEnd}
  const index = useMemo(() => {
    const idx = getCacheByKey(TARGETS_INDEX_KEY)
    return idx?.data?.targets || []
  }, [getCacheByKey, cache, ready])

  const loadTarget = useCallback((id) => {
    const t = getCacheByKey(targetKey(id))
    return t?.data || null
  }, [getCacheByKey, cache])

  const saveTarget = useCallback((target) => {
    setCacheByKey(targetKey(target.id), { data: target })
    const idx = getCacheByKey(TARGETS_INDEX_KEY)?.data?.targets || []
    const summary = { id: target.id, name: target.name, windowStart: target.windowStart, windowEnd: target.windowEnd }
    const next = idx.filter(t => t.id !== target.id).concat(summary)
    setCacheByKey(TARGETS_INDEX_KEY, { data: { targets: next } })
  }, [getCacheByKey, setCacheByKey])

  const deleteTarget = useCallback((id) => {
    const idx = getCacheByKey(TARGETS_INDEX_KEY)?.data?.targets || []
    setCacheByKey(TARGETS_INDEX_KEY, { data: { targets: idx.filter(t => t.id !== id) } })
    setCacheByKey(targetKey(id), { data: null })
    setOpenId(null)
  }, [getCacheByKey, setCacheByKey])

  if (creating) {
    return <TargetEditor onCancel={() => setCreating(false)} onSave={(t) => { saveTarget(t); setCreating(false); setOpenId(t.id) }}
      getCachedData={getCachedData} existing={null} />
  }

  if (openId) {
    const target = loadTarget(openId)
    if (!target) { setOpenId(null); return null }
    return <TargetDetail target={target} onBack={() => setOpenId(null)} onDelete={() => deleteTarget(openId)}
      onEdit={(t) => saveTarget(t)} getCachedData={getCachedData} cache={cache} ready={ready} />
  }

  // LIST VIEW
  return (
    <div className="space-y-5 fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-accent">Targets</h2>
          <p className="text-sm text-txt-muted mt-1">Set milestones with realistic baselines, then track them live.</p>
        </div>
        <button onClick={() => setCreating(true)} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> New Target
        </button>
      </div>

      {index.length === 0 && (
        <div className="glass-card p-12 text-center">
          <Target size={44} className="text-txt-muted mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-accent mb-2">No targets yet</h3>
          <p className="text-sm text-txt-muted mb-4">Create your first target. Pick a date window, a comparison baseline, and per-product goals.</p>
          <button onClick={() => setCreating(true)} className="btn-primary inline-flex items-center gap-2"><Plus size={16} /> New Target</button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {index.map(t => {
          const full = loadTarget(t.id)
          const econ = full ? buildTargetEconomics(full) : null
          const today = todayStr()
          const started = today >= t.windowStart
          const ended = today > t.windowEnd
          const status = ended ? 'Completed' : started ? 'Live' : 'Upcoming'
          const statusColor = ended ? 'text-txt-muted bg-ev-light' : started ? 'text-cash-green bg-green-50' : 'text-accent bg-ev-light'
          return (
            <button key={t.id} onClick={() => setOpenId(t.id)} className="glass-card p-5 text-left hover:shadow-lg transition-all">
              <div className="flex items-start justify-between mb-2">
                <h3 className="text-base font-semibold text-accent">{t.name}</h3>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusColor}`}>{status}</span>
              </div>
              <p className="text-xs text-txt-muted mb-3 flex items-center gap-1"><Calendar size={11} /> {fmtD(t.windowStart)} - {fmtDY(t.windowEnd)} · {dayCountBetween(t.windowStart, t.windowEnd)} days</p>
              {econ && (
                <div className="flex gap-4 text-xs">
                  <div><span className="text-txt-muted">Goal orders</span><p className="font-mono font-bold text-txt-primary">{formatExact(econ.totalGoalOrders)}</p></div>
                  <div><span className="text-txt-muted">Exp. profit</span><p className="font-mono font-bold text-cash-green">₹{compactINR(econ.totalExpectedProfit)}</p></div>
                  <div><span className="text-txt-muted">Exp. spend</span><p className="font-mono font-bold text-txt-primary">₹{compactINR(econ.totalExpectedSpend)}</p></div>
                </div>
              )}
              <p className="text-[10px] text-txt-muted mt-3 font-mono">ID {t.id}</p>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ============ TARGET EDITOR (create / edit) ============
function TargetEditor({ onCancel, onSave, getCachedData, existing }) {
  const [step, setStep] = useState(1)
  const [name, setName] = useState(existing?.name || '')
  const [windowStart, setWindowStart] = useState(existing?.windowStart || todayStr())
  const [windowEnd, setWindowEnd] = useState(existing?.windowEnd || '')
  const [baselineStart, setBaselineStart] = useState(existing?.baselineStart || '')
  const [baselineEnd, setBaselineEnd] = useState(existing?.baselineEnd || '')
  const [selected, setSelected] = useState(existing?.products?.map(p => p.name) || DEFAULT_PRODUCTS.map(p => p.name))
  const [goals, setGoals] = useState(() => {
    const g = {}
    ;(existing?.products || []).forEach(p => { g[p.name] = { goalOrders: p.goalOrders, targetProfitPct: p.targetProfitPct } })
    return g
  })

  const baseline = useMemo(() => computeBaseline(getCachedData, baselineStart, baselineEnd),
    [getCachedData, baselineStart, baselineEnd])
  const baselineReady = baseline.daysWithData > 0
  const winDays = dayCountBetween(windowStart, windowEnd)
  const baseDays = dayCountBetween(baselineStart, baselineEnd)

  const productList = DEFAULT_PRODUCTS.filter(p => selected.includes(p.name))

  // Build live preview economics from current inputs + baseline
  const preview = useMemo(() => {
    const products = productList.map(p => {
      const b = baseline.products[p.name] || {}
      const g = goals[p.name] || {}
      return {
        name: p.name, code: p.code,
        goalOrders: g.goalOrders || 0,
        targetProfitPct: g.targetProfitPct ?? 15,
        aov: Math.round(b.aov || 0),
        prepaidRate: Math.round((b.prepaidRate || 0) * 100),
        c2pRate: Math.round((b.c2pRate || 0) * 100),
        vendorPrice: getVendorPrice(p.name),
      }
    })
    return buildTargetEconomics({ windowStart, windowEnd, products })
  }, [productList, baseline, goals, windowStart, windowEnd])

  const canSave = name && windowStart && windowEnd && winDays > 0 && baselineReady && preview.totalGoalOrders > 0

  const doSave = () => {
    const products = preview.products.map(p => ({
      name: p.name, code: p.code, goalOrders: p.goalOrders, targetProfitPct: p.targetProfitPct,
      aov: p.aov, prepaidRate: p.prepaidRate, c2pRate: p.c2pRate, vendorPrice: p.vendorPrice,
    }))
    onSave({
      id: existing?.id || newTargetId(),
      name, windowStart, windowEnd, baselineStart, baselineEnd, products,
      createdAt: existing?.createdAt || Date.now(),
    })
  }

  return (
    <div className="space-y-5 fade-in max-w-4xl">
      <div className="flex items-center gap-3">
        <button onClick={onCancel} className="btn-ghost p-2"><ChevronLeft size={18} /></button>
        <h2 className="text-2xl font-bold text-accent">{existing ? 'Edit Target' : 'New Target'}</h2>
      </div>

      {/* Step 1: basics + window */}
      <div className="glass-card p-5 space-y-4">
        <h3 className="text-sm font-semibold text-accent">1. Target window</h3>
        <div>
          <label className="text-[10px] text-txt-muted uppercase tracking-wider mb-1 block">Target name</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. June second-half push" className="input-field !text-sm" />
        </div>
        <div className="flex gap-4 flex-wrap">
          <div><label className="text-[10px] text-txt-muted uppercase tracking-wider mb-1 block">Start</label>
            <input type="date" value={windowStart} onChange={e => setWindowStart(e.target.value)} className="input-field !w-44 !text-sm" /></div>
          <div><label className="text-[10px] text-txt-muted uppercase tracking-wider mb-1 block">End</label>
            <input type="date" value={windowEnd} onChange={e => setWindowEnd(e.target.value)} className="input-field !w-44 !text-sm" /></div>
          {winDays > 0 && <p className="text-sm text-accent self-end pb-2">{winDays} days</p>}
        </div>
      </div>

      {/* Step 2: baseline */}
      <div className="glass-card p-5 space-y-4">
        <h3 className="text-sm font-semibold text-accent">2. Comparison baseline</h3>
        <p className="text-xs text-txt-muted">Pick a past date range. Its actual AOV, payment mix, and CAC become the realistic assumptions for this target.</p>
        <div className="flex gap-4 flex-wrap items-end">
          <div><label className="text-[10px] text-txt-muted uppercase tracking-wider mb-1 block">From</label>
            <input type="date" value={baselineStart} onChange={e => setBaselineStart(e.target.value)} className="input-field !w-44 !text-sm" /></div>
          <div><label className="text-[10px] text-txt-muted uppercase tracking-wider mb-1 block">To</label>
            <input type="date" value={baselineEnd} onChange={e => setBaselineEnd(e.target.value)} className="input-field !w-44 !text-sm" /></div>
          {baselineStart && baselineEnd && (
            baselineReady
              ? <p className="text-xs text-cash-green self-end pb-2">{baseline.daysWithData}/{baseDays} days synced{baseline.missing.length ? ` · ${baseline.missing.length} missing` : ''}</p>
              : <p className="text-xs text-cash-red self-end pb-2">No synced data in this range. Fetch it on the Dashboard first.</p>
          )}
        </div>
        {baselineReady && (
          <div className="text-[11px] text-txt-muted">Baseline ran {baseline.orders} total orders over {baseline.daysWithData} days ({Math.round(baseline.orders / baseline.daysWithData)}/day).</div>
        )}
      </div>

      {/* Step 3: products + goals */}
      <div className="glass-card p-5 space-y-4">
        <h3 className="text-sm font-semibold text-accent">3. Products & goals</h3>
        <div className="flex gap-2 flex-wrap">
          {DEFAULT_PRODUCTS.map(p => (
            <button key={p.code} onClick={() => setSelected(s => s.includes(p.name) ? s.filter(x => x !== p.name) : [...s, p.name])}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${selected.includes(p.name) ? 'bg-accent text-white' : 'text-txt-muted border border-brand-300/50'}`}>
              {selected.includes(p.name) && <Check size={12} className="inline mr-1" />}{p.code}
            </button>
          ))}
        </div>

        {!baselineReady && <p className="text-xs text-yellow-600">Pick a synced baseline above to unlock realistic goal-setting.</p>}

        {baselineReady && productList.map(p => {
          const b = baseline.products[p.name] || {}
          const g = goals[p.name] || {}
          const prev = preview.products.find(x => x.name === p.name)
          return (
            <div key={p.code} className="rounded-xl p-4 border border-brand-300/50">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm font-semibold text-accent">{p.name}</span>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-ev-light text-accent">{p.code}</span>
                {b.orders ? <span className="text-[10px] text-txt-muted ml-auto">baseline: {b.orders} orders · ₹{formatExact(Math.round(b.cac))} CAC · ₹{formatExact(Math.round(b.aov))} AOV · {Math.round((b.prepaidRate||0)*100)}% prepaid</span>
                  : <span className="text-[10px] text-cash-red ml-auto">no baseline data for this product</span>}
              </div>
              <div className="flex gap-4 flex-wrap items-end">
                <div>
                  <label className="text-[10px] text-txt-muted uppercase block mb-1">Goal orders (window)</label>
                  <input type="number" value={g.goalOrders ?? ''} placeholder={b.ordersPerDay ? String(Math.round(b.ordersPerDay * winDays)) : '0'}
                    onChange={e => setGoals(gg => ({ ...gg, [p.name]: { ...gg[p.name], goalOrders: parseInt(e.target.value) || 0 } }))}
                    className="input-field !w-36 !py-1.5 !text-sm" />
                  {b.ordersPerDay > 0 && <p className="text-[9px] text-txt-muted mt-0.5">baseline pace = {Math.round(b.ordersPerDay * winDays)}</p>}
                </div>
                <div>
                  <label className="text-[10px] text-txt-muted uppercase block mb-1">Target profit %</label>
                  <input type="number" value={g.targetProfitPct ?? ''} placeholder="15"
                    onChange={e => setGoals(gg => ({ ...gg, [p.name]: { ...gg[p.name], targetProfitPct: parseFloat(e.target.value) || 0 } }))}
                    className="input-field !w-28 !py-1.5 !text-sm" />
                </div>
                {prev && prev.goalOrders > 0 && (
                  <div className="flex gap-4 text-xs pb-1.5">
                    <div><span className="text-txt-muted block text-[10px]">Required CAC</span><span className={`font-mono font-bold ${prev.feasible ? 'text-cash-green' : 'text-cash-red'}`}>{prev.feasible ? `₹${formatExact(Math.round(prev.requiredCAC))}` : 'impossible'}</span></div>
                    <div><span className="text-txt-muted block text-[10px]">Exp. spend</span><span className="font-mono text-txt-primary">₹{compactINR(prev.expectedSpend)}</span></div>
                    <div><span className="text-txt-muted block text-[10px]">Exp. profit</span><span className="font-mono text-cash-green">₹{compactINR(prev.expectedProfit)}</span></div>
                  </div>
                )}
              </div>
              {prev && !prev.feasible && prev.goalOrders > 0 &&
                <p className="text-[11px] text-cash-red mt-2">At {prev.targetProfitPct}% profit and ₹{formatExact(prev.aov)} AOV, there's no room for ad spend. Lower the profit target or raise AOV.</p>}
              {prev && prev.feasible && b.cac > 0 && prev.requiredCAC < b.cac &&
                <p className="text-[11px] text-yellow-600 mt-2">Required CAC ₹{formatExact(Math.round(prev.requiredCAC))} is below your baseline CAC ₹{formatExact(Math.round(b.cac))}. You'll need to improve efficiency to hit this.</p>}
            </div>
          )
        })}
      </div>

      {/* Summary + save */}
      {baselineReady && preview.totalGoalOrders > 0 && (
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-accent mb-3">Target summary</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div><p className="metric-label">Goal orders</p><p className="text-xl font-bold font-mono text-txt-primary">{formatExact(preview.totalGoalOrders)}</p></div>
            <div><p className="metric-label">Exp. revenue</p><p className="text-xl font-bold font-mono text-txt-primary">₹{compactINR(preview.totalExpectedRevenue)}</p></div>
            <div><p className="metric-label">Exp. ad spend</p><p className="text-xl font-bold font-mono text-txt-primary">₹{compactINR(preview.totalExpectedSpend)}</p></div>
            <div><p className="metric-label">Exp. profit</p><p className="text-xl font-bold font-mono text-cash-green">₹{compactINR(preview.totalExpectedProfit)}</p></div>
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <button onClick={doSave} disabled={!canSave} className="btn-primary flex items-center gap-2 disabled:opacity-40"><Check size={16} /> Save Target</button>
        <button onClick={onCancel} className="btn-ghost">Cancel</button>
      </div>
    </div>
  )
}

function getVendorPrice(name) {
  const map = { 'Name Necklace': 115, 'Snake Anklet': 35, 'Butterfly Anklet': 31, 'Personalised Car Keychain': 75 }
  return map[name] || 0
}

// ============ TARGET DETAIL (live tracking) ============
function TargetDetail({ target, onBack, onDelete, getCachedData, cache, ready }) {
  const [tab, setTab] = useState('overview')
  const econ = useMemo(() => buildTargetEconomics(target), [target])
  const today = todayStr()
  const winDays = dayCountBetween(target.windowStart, target.windowEnd)
  const started = today >= target.windowStart
  const ended = today > target.windowEnd

  // elapsed days within window
  const winElapsed = (() => {
    if (!started) return 0
    const s = new Date(target.windowStart + 'T00:00:00')
    const last = new Date((today < target.windowEnd ? today : target.windowEnd) + 'T00:00:00')
    return Math.round((last - s) / 86400000) + 1
  })()
  const winRemaining = Math.max(0, winDays - winElapsed)

  // actuals over elapsed window days
  const { actual, dailyRows, windowOrders } = useMemo(() => {
    const dbP = getProducts()
    const campaignMap = buildCampaignMap(dbP)
    const vendorPriceMap = buildVendorPriceMap(dbP)
    let allOrders = [], allCampaigns = []
    const rows = []
    if (started) {
      const s = new Date(target.windowStart + 'T00:00:00')
      const last = new Date((today < target.windowEnd ? today : target.windowEnd) + 'T00:00:00')
      for (let d = new Date(s); d <= last; d.setDate(d.getDate() + 1)) {
        const ds = d.toISOString().split('T')[0]
        const data = getCachedData(ds, ds)
        if (!data?.orders) { rows.push({ date: ds, empty: true }); continue }
        const meta = allocateMetaSpend(data.metaCampaigns || [], campaignMap)
        const pnl = calculateFullPnL(data.orders, meta, vendorPriceMap)
        rows.push({ date: ds, products: pnl.products, orders: pnl.overview.activeOrders, profit: pnl.profit.expected })
        allOrders.push(...data.orders)
        allCampaigns.push(...(data.metaCampaigns || []))
      }
    }
    let actual = null
    if (allOrders.length > 0) {
      const meta = allocateMetaSpend(allCampaigns, campaignMap)
      actual = calculateFullPnL(allOrders, meta, vendorPriceMap)
    }
    return { actual, dailyRows: rows, windowOrders: allOrders }
  }, [cache, target, started, today])

  // per-product live status
  const productStatus = (ep) => {
    const a = actual?.products.find(pr => pr.name === ep.name)
    const aO = a?.totalUnits || 0
    const aOrders = a?.orderCount || aO   // unique orders for AOV
    const aSpend = (a?.metaSpend || 0) / GST
    const aRev = a?.revenue || 0
    const aProfit = a?.profit || 0
    const aCAC = aO > 0 ? aSpend / aO : 0
    // Gross AOV (what customer pays), same field the Dashboard uses — NOT discounted expected revenue.
    const aAOV = a?.aovWithUpsells || (aOrders > 0 ? (a?.fullOrderRevenue || 0) / aOrders : 0)
    const expectedByNow = winDays > 0 ? ep.goalOrders * (winElapsed / winDays) : 0
    const pacePct = expectedByNow > 0 ? aO / expectedByNow * 100 : 0
    const onPace = aO >= expectedByNow * 0.95
    const needDaily = winRemaining > 0 ? Math.ceil((ep.goalOrders - aO) / winRemaining) : 0
    const avgDaily = winElapsed > 0 ? aO / winElapsed : 0
    // Projection: if current daily pace holds, where do we land at window end
    const projOrders = Math.round(avgDaily * winDays)
    const projProfit = aO > 0 ? (aProfit / aO) * projOrders : 0
    const willHit = projOrders >= ep.goalOrders * 0.98
    // Break-even + headroom
    const breakEven = ep.breakEvenCAC || 0
    const headroom = breakEven - aCAC      // how far below break-even we are (positive = safe)
    // Sensitivity: profit change if CAC drops ₹50 / AOV lifts ₹100 over remaining goal orders
    const remOrders = Math.max(0, ep.goalOrders - aO)
    const dProfitCAC50 = remOrders * 50            // ₹50 lower CAC saves ₹50/order pre-GST... approx *1.18
    const dProfitAOV100 = remOrders * 100 * (ep.targetProfitPct || 0.15)
    // Payment mix + bundle mix from window orders
    let prepaid = 0, c2p = 0, cod = 0, b1 = 0, b2 = 0, b3 = 0
    ;(windowOrders || []).forEach(o => {
      ;(o.lineItems || []).forEach(li => {
        if (getProductFamily(li.title) !== ep.name) return
        const qty = li.quantity || 1
        const m = detectBuyMultiplier(li.title, li.variantTitle)
        if (m >= 3) b3 += qty; else if (m === 2) b2 += qty; else b1 += qty
        const pt = (o.paymentType || '').toLowerCase()
        if (pt.includes('prepaid')) prepaid += qty
        else if (pt.includes('c2p') || pt.includes('partial')) c2p += qty
        else cod += qty
      })
    })
    const bt = b1 + b2 + b3, pt = prepaid + c2p + cod
    return { a, aO, aSpend, aRev, aProfit, aCAC, aAOV, expectedByNow, pacePct, onPace, needDaily, avgDaily,
      projOrders, projProfit, willHit, breakEven, headroom, dProfitCAC50, dProfitAOV100,
      mix: { prepaid: pt?prepaid/pt:0, c2p: pt?c2p/pt:0, cod: pt?cod/pt:0 },
      bundle: { b1, b2, b3, b1Pct: bt?b1/bt:0, b2Pct: bt?b2/bt:0, b3Pct: bt?b3/bt:0, total: bt } }
  }

  // overall live
  const aOrders = actual?.overview.activeOrders || 0
  const aProfit = actual?.profit.expected || 0
  const aSpend = (actual?.expenses.metaAds || 0) / GST
  const aRev = actual?.revenue.expectedRevenue || 0
  const aCAC = aOrders > 0 ? aSpend / aOrders : 0
  const expOrdersByNow = winDays > 0 ? econ.totalGoalOrders * (winElapsed / winDays) : 0
  const overallPace = expOrdersByNow > 0 ? aOrders / expOrdersByNow * 100 : 0
  const onTrack = aOrders >= expOrdersByNow * 0.95

  return (
    <div className="space-y-5 fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="btn-ghost p-2"><ChevronLeft size={18} /></button>
          <div>
            <h2 className="text-2xl font-bold text-accent">{target.name}</h2>
            <p className="text-sm text-txt-muted mt-0.5">
              {fmtDY(target.windowStart)} - {fmtDY(target.windowEnd)} · {winDays} days ·
              {ended ? ' completed' : started ? ` day ${winElapsed} of ${winDays}` : ' not started'} · <span className="font-mono">ID {target.id}</span>
            </p>
          </div>
        </div>
        <button onClick={() => { if (confirm('Delete this target?')) onDelete() }} className="btn-ghost text-cash-red p-2"><Trash2 size={16} /></button>
      </div>

      {/* status banner */}
      {started && actual && (
        <div className={`glass-card p-5 border-l-4 ${onTrack ? 'border-cash-green' : 'border-cash-red'}`}>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className={`text-lg font-bold ${onTrack ? 'text-cash-green' : 'text-cash-red'}`}>{onTrack ? 'On track' : 'Behind target'}</p>
              <p className="text-sm text-txt-muted mt-0.5">
                {formatExact(aOrders)} orders so far · expected {formatExact(Math.round(expOrdersByNow))} by now ({overallPace.toFixed(0)}% of pace)
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold font-mono text-accent">₹{compactINR(aProfit)}</p>
              <p className="text-xs text-txt-muted">profit · target ₹{compactINR(econ.totalExpectedProfit)}</p>
            </div>
          </div>
          {winRemaining > 0 && (
            <p className="text-sm text-txt-secondary mt-3 pt-3 border-t border-brand-300/50">
              {aOrders < econ.totalGoalOrders
                ? `Need ${formatExact(econ.totalGoalOrders - aOrders)} more orders in ${winRemaining} days = ${Math.ceil((econ.totalGoalOrders - aOrders) / winRemaining)}/day (running ${Math.round(aOrders / winElapsed)}/day now).`
                : `Goal already hit. ${winRemaining} days left to build cushion.`}
            </p>
          )}
          {winElapsed > 0 && (() => {
            const projO = Math.round((aOrders / winElapsed) * winDays)
            const projP = aOrders > 0 ? (aProfit / aOrders) * projO : 0
            const hit = projO >= econ.totalGoalOrders * 0.98
            return (
              <div className="mt-3 pt-3 border-t border-brand-300/50 flex items-center gap-2 flex-wrap">
                <TrendingUp size={15} className={hit ? 'text-cash-green' : 'text-cash-red'} />
                <span className="text-sm text-txt-secondary">
                  Projected at current pace: <b className={hit ? 'text-cash-green' : 'text-cash-red'}>{formatExact(projO)} orders</b> ({Math.round(projO/econ.totalGoalOrders*100)}% of goal), <b className="text-accent">₹{compactINR(projP)}</b> profit by {fmtD(target.windowEnd)}.
                </span>
              </div>
            )
          })()}
        </div>
      )}

      {!started && (
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-accent mb-3 flex items-center gap-2"><Calendar size={16} /> Daily plan (starts {fmtDY(target.windowStart)})</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead><tr className="border-b border-brand-300/50 text-[10px] text-txt-muted uppercase tracking-wider">
                <th className="py-2 px-3">Product</th><th className="py-2 px-3 text-right">Orders/day</th><th className="py-2 px-3 text-right">Req. CAC</th>
                <th className="py-2 px-3 text-right">Budget/day (GST)</th><th className="py-2 px-3 text-right">AOV</th><th className="py-2 px-3 text-right">Exp. profit</th>
              </tr></thead>
              <tbody>
                {econ.products.map(ep => (
                  <tr key={ep.code} className="border-b border-brand-300/50/50">
                    <td className="py-2.5 px-3 text-sm text-accent font-medium">{ep.code}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-sm font-bold text-txt-primary">{Math.round(ep.ordersPerDay)}</td>
                    <td className={`py-2.5 px-3 text-right font-mono text-sm ${ep.feasible ? 'text-cash-green' : 'text-cash-red'}`}>{ep.feasible ? `₹${formatExact(Math.round(ep.requiredCAC))}` : 'n/a'}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-xs text-txt-secondary">₹{formatExact(Math.round(ep.spendPerDayGst))}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-xs text-txt-muted">₹{formatExact(ep.aov)}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-xs text-cash-green">₹{compactINR(ep.expectedProfit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* tabs */}
      {started && actual && (<>
        <div className="flex items-center gap-1.5 flex-wrap glass-card p-1.5">
          <button onClick={() => setTab('overview')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${tab === 'overview' ? 'bg-accent text-white' : 'text-txt-muted hover:text-accent'}`}>Overview</button>
          {econ.products.map(ep => {
            const st = productStatus(ep)
            return <button key={ep.code} onClick={() => setTab(ep.code)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 ${tab === ep.code ? 'bg-accent text-white' : 'text-txt-muted hover:text-accent'}`}>
              {ep.code}<span className={`w-1.5 h-1.5 rounded-full ${st.onPace ? 'bg-cash-green' : 'bg-cash-red'}`} /></button>
          })}
        </div>

        {tab === 'overview' && (<>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="glass-card p-4"><p className="metric-label mb-1">Orders</p><p className="text-xl font-bold font-mono text-txt-primary">{formatExact(aOrders)}</p><p className="text-[11px] text-txt-muted">goal {formatExact(econ.totalGoalOrders)} · {Math.round(aOrders/econ.totalGoalOrders*100)}%</p></div>
            <div className="glass-card p-4"><p className="metric-label mb-1">Revenue</p><p className="text-xl font-bold font-mono text-txt-primary">₹{compactINR(aRev)}</p><p className="text-[11px] text-txt-muted">exp ₹{compactINR(econ.totalExpectedRevenue)}</p></div>
            <div className="glass-card p-4"><p className="metric-label mb-1">Ad spend</p><p className="text-xl font-bold font-mono text-txt-primary">₹{compactINR(aSpend)}</p><p className="text-[11px] text-txt-muted">budget ₹{compactINR(econ.totalExpectedSpend)}</p></div>
            <div className="glass-card p-4"><p className="metric-label mb-1">Profit</p><p className="text-xl font-bold font-mono text-cash-green">₹{compactINR(aProfit)}</p><p className="text-[11px] text-txt-muted">target ₹{compactINR(econ.totalExpectedProfit)}</p></div>
            <div className="glass-card p-4"><p className="metric-label mb-1">Blended CAC</p><p className="text-xl font-bold font-mono text-txt-primary">₹{formatExact(Math.round(aCAC))}</p><p className="text-[11px] text-txt-muted">{aRev>0?(aProfit/aRev*100).toFixed(1):0}% margin</p></div>
          </div>
          <div className="glass-card overflow-hidden">
            <table className="w-full text-left">
              <thead><tr className="border-b border-brand-300/50 text-[10px] text-txt-muted uppercase tracking-wider">
                <th className="py-2.5 px-4">Product</th><th className="py-2.5 px-3 text-right">Orders</th><th className="py-2.5 px-3 text-right">Pace</th>
                <th className="py-2.5 px-3 text-right">CAC vs req.</th><th className="py-2.5 px-3 text-right">Profit</th><th className="py-2.5 px-3 text-right">Need/day</th>
              </tr></thead>
              <tbody>
                {econ.products.map(ep => {
                  const st = productStatus(ep)
                  return <tr key={ep.code} className="border-b border-brand-300/50/50 hover:bg-ev-light cursor-pointer" onClick={() => setTab(ep.code)}>
                    <td className="py-3 px-4 text-sm text-accent font-medium">{ep.code}</td>
                    <td className="py-3 px-3 text-right font-mono text-xs"><b className="text-txt-primary">{formatExact(st.aO)}</b><span className="text-txt-muted">/{formatExact(ep.goalOrders)}</span></td>
                    <td className={`py-3 px-3 text-right font-mono text-xs font-bold ${st.pacePct >= 95 ? 'text-cash-green' : st.pacePct >= 75 ? 'text-yellow-600' : 'text-cash-red'}`}>{st.pacePct.toFixed(0)}%</td>
                    <td className={`py-3 px-3 text-right font-mono text-xs ${st.aCAC <= ep.requiredCAC ? 'text-cash-green' : 'text-cash-red'}`}>₹{formatExact(Math.round(st.aCAC))}<span className="text-txt-muted">/{formatExact(Math.round(ep.requiredCAC))}</span></td>
                    <td className="py-3 px-3 text-right font-mono text-xs text-txt-secondary">₹{compactINR(st.aProfit)}</td>
                    <td className="py-3 px-3 text-right font-mono text-xs text-txt-secondary">{st.needDaily > 0 ? st.needDaily : '-'}</td>
                  </tr>
                })}
              </tbody>
            </table>
          </div>
        </>)}

        {econ.products.map(ep => {
          if (tab !== ep.code) return null
          const st = productStatus(ep)
          return (
            <div key={ep.code} className="space-y-4">
              <div className="glass-card p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-accent">{ep.name} <span className="text-xs font-mono px-2 py-0.5 rounded bg-ev-light">{ep.code}</span></h3>
                  <span className={`text-sm font-bold px-3 py-1 rounded-lg ${st.onPace ? 'bg-green-50 text-cash-green' : 'bg-red-50 text-cash-red'}`}>{st.onPace ? 'On pace' : 'Behind'} · {st.pacePct.toFixed(0)}%</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Stat label="Orders" val={formatExact(st.aO)} sub={`goal ${formatExact(ep.goalOrders)} · ${Math.round(st.avgDaily)}/day`} good={st.onPace} />
                  <Stat label="CAC (pre-GST)" val={st.aCAC > 0 ? `₹${formatExact(Math.round(st.aCAC))}` : 'no spend'} sub={`required ≤₹${formatExact(Math.round(ep.requiredCAC))}`} good={st.aCAC > 0 && st.aCAC <= ep.requiredCAC} />
                  <Stat label="AOV" val={`₹${formatExact(Math.round(st.aAOV))}`} sub={`assumed ₹${formatExact(ep.aov)}`} good={st.aAOV >= ep.aov * 0.95} />
                  <Stat label="Profit" val={`₹${compactINR(st.aProfit)}`} sub={`target ₹${compactINR(ep.expectedProfit)}`} good={st.aProfit >= ep.expectedProfit * (winElapsed / winDays) * 0.9} />
                </div>
              </div>
              <div className="glass-card p-5">
                <h4 className="text-sm font-semibold text-accent mb-3">What to do</h4>
                <div className="space-y-2 text-sm text-txt-secondary">
                  {winRemaining > 0 ? <>
                    <p>1. Need <b className="text-accent">{Math.max(0, ep.goalOrders - st.aO)}</b> more orders in <b className="text-accent">{winRemaining}</b> days = <b className="text-accent">{st.needDaily > 0 ? st.needDaily : 0}/day</b> (running {Math.round(st.avgDaily)}/day).</p>
                    {st.aCAC > ep.requiredCAC && <p>2. CAC ₹{formatExact(Math.round(st.aCAC))} is above the ₹{formatExact(Math.round(ep.requiredCAC))} you need for {ep.targetProfitPct}% profit — tighten ad sets.</p>}
                    {st.aCAC > 0 && st.aCAC <= ep.requiredCAC && <p>2. CAC ₹{formatExact(Math.round(st.aCAC))} is within the ₹{formatExact(Math.round(ep.requiredCAC))} budget — scale spend.</p>}
                    {st.aAOV < ep.aov * 0.95 && <p>3. AOV ₹{formatExact(Math.round(st.aAOV))} is below the assumed ₹{formatExact(ep.aov)} — push bundles/upsells.</p>}
                  </> : <p>Window complete. Final: {formatExact(st.aO)} orders ({Math.round(st.aO / ep.goalOrders * 100)}% of goal), ₹{compactINR(st.aProfit)} profit.</p>}
                  {st.aCAC === 0 && st.aO > 0 && <p className="text-cash-red">No Meta spend mapped to {ep.code} — fix the campaign code, profit is overstated.</p>}
                </div>
              </div>

              {/* Per-order economics: where every rupee goes */}
              <div className="glass-card p-5">
                <h4 className="text-sm font-semibold text-accent mb-3">Per-order economics</h4>
                <div className="space-y-1.5 text-sm">
                  {(() => {
                    const bd = ep.breakdown || {}
                    const adSpendPerOrder = (ep.requiredCAC || 0) * 1.18
                    const row = (label, val, sign, strong) => (
                      <div className={`flex justify-between ${strong ? 'pt-1.5 border-t border-brand-300/50' : ''}`}>
                        <span className={strong ? 'font-semibold text-accent' : 'text-txt-muted'}>{label}</span>
                        <span className={`font-mono ${strong ? 'font-bold text-cash-green' : 'text-txt-secondary'}`}>{sign}₹{formatExact(Math.round(val))}</span>
                      </div>
                    )
                    return <>
                      {row('Gross AOV', ep.aov)}
                      {row('Expected revenue (after COD discount)', bd.expectedRevPerOrder)}
                      {row('COGS (vendor)', bd.cogsPerOrder, '-')}
                      {row('Logistics (box, ship, packing)', bd.logisticsPerOrder, '-')}
                      {row('Payment fees', bd.feesPerOrder, '-')}
                      {row('Ad spend (at required CAC, incl GST)', adSpendPerOrder, '-')}
                      {row('Profit per order', ep.profitPerOrder, '', true)}
                    </>
                  })()}
                </div>
              </div>

              {/* Break-even + headroom + sensitivity */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="glass-card p-4">
                  <p className="metric-label mb-1">Break-even CAC</p>
                  <p className="text-xl font-bold font-mono text-txt-primary">₹{formatExact(Math.round(ep.breakEvenCAC))}</p>
                  <p className="text-[11px] text-txt-muted mt-0.5">above this, {ep.code} loses money</p>
                </div>
                <div className="glass-card p-4">
                  <p className="metric-label mb-1">CAC headroom</p>
                  <p className={`text-xl font-bold font-mono ${st.headroom >= 0 ? 'text-cash-green' : 'text-cash-red'}`}>{st.aCAC > 0 ? `₹${formatExact(Math.round(st.headroom))}` : '--'}</p>
                  <p className="text-[11px] text-txt-muted mt-0.5">gap from your CAC to break-even</p>
                </div>
                <div className="glass-card p-4">
                  <p className="metric-label mb-1">Levers (remaining orders)</p>
                  <p className="text-[11px] text-txt-secondary mt-1">CAC −₹50 → <b className="text-cash-green">+₹{compactINR(st.dProfitCAC50)}</b></p>
                  <p className="text-[11px] text-txt-secondary">AOV +₹100 → <b className="text-cash-green">+₹{compactINR(st.dProfitAOV100)}</b></p>
                </div>
              </div>

              {/* Payment + bundle mix */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="glass-card p-5">
                  <h4 className="text-sm font-semibold text-accent mb-3">Payment mix</h4>
                  {st.mix.prepaid + st.mix.c2p + st.mix.cod > 0 ? (
                    <div className="grid grid-cols-3 gap-2">
                      <div><p className="text-[10px] text-txt-muted uppercase">Prepaid</p><p className="text-lg font-bold font-mono text-txt-primary">{Math.round(st.mix.prepaid*100)}%</p></div>
                      <div><p className="text-[10px] text-txt-muted uppercase">C2P</p><p className="text-lg font-bold font-mono text-txt-primary">{Math.round(st.mix.c2p*100)}%</p></div>
                      <div><p className="text-[10px] text-txt-muted uppercase">COD</p><p className="text-lg font-bold font-mono text-txt-primary">{Math.round(st.mix.cod*100)}%</p></div>
                    </div>
                  ) : <p className="text-xs text-txt-muted">No data yet.</p>}
                </div>
                <div className="glass-card p-5">
                  <h4 className="text-sm font-semibold text-accent mb-3">Bundle mix (Buy 1/2/3)</h4>
                  {st.bundle.total > 0 ? (<>
                    <div className="flex h-6 rounded-lg overflow-hidden mb-2">
                      {st.bundle.b1Pct > 0 && <div style={{ width: `${st.bundle.b1Pct*100}%` }} className="bg-brand-400" />}
                      {st.bundle.b2Pct > 0 && <div style={{ width: `${st.bundle.b2Pct*100}%` }} className="bg-brand-600" />}
                      {st.bundle.b3Pct > 0 && <div style={{ width: `${st.bundle.b3Pct*100}%` }} className="bg-accent" />}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div><p className="text-[10px] text-txt-muted uppercase">Buy 1</p><p className="text-base font-bold font-mono text-txt-primary">{Math.round(st.bundle.b1Pct*100)}%</p></div>
                      <div><p className="text-[10px] text-txt-muted uppercase">Buy 2</p><p className="text-base font-bold font-mono text-txt-primary">{Math.round(st.bundle.b2Pct*100)}%</p></div>
                      <div><p className="text-[10px] text-txt-muted uppercase">Buy 3</p><p className="text-base font-bold font-mono text-txt-primary">{Math.round(st.bundle.b3Pct*100)}%</p></div>
                    </div>
                  </>) : <p className="text-xs text-txt-muted">No data yet.</p>}
                </div>
              </div>
            </div>
          )
        })}
      </>)}
    </div>
  )
}

function Stat({ label, val, sub, good }) {
  return (
    <div className="glass-card p-4">
      <p className="metric-label mb-1">{label}</p>
      <p className={`text-xl font-bold font-mono ${good === undefined ? 'text-txt-primary' : good ? 'text-cash-green' : 'text-cash-red'}`}>{val}</p>
      {sub && <p className="text-[11px] text-txt-muted mt-0.5">{sub}</p>}
    </div>
  )
}
