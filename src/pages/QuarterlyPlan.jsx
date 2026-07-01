import React, { useState, useMemo } from 'react'
import { Calendar, TrendingUp, RefreshCw, Info } from 'lucide-react'
import { useDataStore } from '../lib/dataStore'
import { formatExact } from '../lib/profitEngine'
import { computeBaseline } from '../lib/baseline'

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const CODES = { 'Name Necklace':'PNN', 'Snake Anklet':'SA', 'Butterfly Anklet':'BFA', 'Personalised Car Keychain':'PCK' }

function compactINR(n) {
  const v = Math.abs(Math.round(n)); const s = n < 0 ? '-' : ''
  if (v >= 10000000) return `${s}${(v/10000000).toFixed(2)}Cr`
  if (v >= 100000) return `${s}${(v/100000).toFixed(2)}L`
  if (v >= 1000) return `${s}${(v/1000).toFixed(1)}K`
  return `${s}${v}`
}

function monthRange(y, m) {
  const start = `${y}-${String(m+1).padStart(2,'0')}-01`
  const last = new Date(y, m+1, 0).getDate()
  const end = `${y}-${String(m+1).padStart(2,'0')}-${String(last).padStart(2,'0')}`
  return { start, end }
}

export default function QuarterlyPlan() {
  const { getCachedData, cache, ready } = useDataStore()
  const now = new Date()

  // Baseline month (default: last completed month)
  const defaultBase = now.getMonth() === 0 ? { y: now.getFullYear()-1, m: 11 } : { y: now.getFullYear(), m: now.getMonth()-1 }
  const [baseSel, setBaseSel] = useState(defaultBase)
  const [growth, setGrowth] = useState(30) // % MoM

  // Quarter start month (default: month after baseline)
  const [q1, setQ1] = useState(() => {
    let m = defaultBase.m + 1, y = defaultBase.y
    if (m > 11) { m = 0; y++ }
    return { y, m }
  })

  const baseRange = monthRange(baseSel.y, baseSel.m)
  const baseline = useMemo(() => computeBaseline(getCachedData, baseRange.start, baseRange.end),
    [getCachedData, baseRange.start, baseRange.end, cache])
  const baseName = `${MONTH_NAMES[baseSel.m]} ${baseSel.y}`
  const hasData = baseline.daysWithData > 0

  // Quarter months
  const qMonths = useMemo(() => {
    const out = []
    let m = q1.m, y = q1.y
    for (let i=0;i<3;i++){ out.push({ y, m, label: `${MONTH_NAMES[m]} ${y}` }); m++; if(m>11){m=0;y++} }
    return out
  }, [q1])

  // Per-product plan built from baseline's REAL per-order economics
  const plan = useMemo(() => {
    const g = growth/100
    const products = Object.keys(CODES).map(name => {
      const b = baseline.products[name] || {}
      const baseOrders = b.orders || 0
      // Realized (COD-adjusted) per-order economics straight from the engine
      const revPerOrder = baseOrders > 0 ? (b.revenue || 0) / baseOrders : 0
      const profitPerOrder = baseOrders > 0 ? (b.profit || 0) / baseOrders : 0
      const cac = b.cac || 0
      const aov = b.aov || 0
      // month order counts: Jul = base, Aug = base*(1+g), Sep = base*(1+g)^2
      const monthly = qMonths.map((_, i) => Math.round(baseOrders * Math.pow(1+g, i)))
      const rows = monthly.map(o => ({
        orders: o,
        revenue: o * revPerOrder,
        metaPreGST: o * cac,
        metaGST: o * cac * 1.18,
        profit: o * profitPerOrder,
      }))
      const qOrders = rows.reduce((s,r)=>s+r.orders,0)
      const qRev = rows.reduce((s,r)=>s+r.revenue,0)
      const qMeta = rows.reduce((s,r)=>s+r.metaGST,0)
      const qProfit = rows.reduce((s,r)=>s+r.profit,0)
      return { name, code: CODES[name], baseOrders, revPerOrder, profitPerOrder, cac, aov,
        rows, qOrders, qRev, qMeta, qProfit, qMargin: qRev>0?qProfit/qRev:0 }
    })
    // totals
    const tot = {
      qOrders: products.reduce((s,p)=>s+p.qOrders,0),
      qRev: products.reduce((s,p)=>s+p.qRev,0),
      qMeta: products.reduce((s,p)=>s+p.qMeta,0),
      qProfit: products.reduce((s,p)=>s+p.qProfit,0),
      monthly: qMonths.map((_,i)=>({
        orders: products.reduce((s,p)=>s+p.rows[i].orders,0),
        revenue: products.reduce((s,p)=>s+p.rows[i].revenue,0),
        metaGST: products.reduce((s,p)=>s+p.rows[i].metaGST,0),
        profit: products.reduce((s,p)=>s+p.rows[i].profit,0),
      })),
    }
    tot.qMargin = tot.qRev>0 ? tot.qProfit/tot.qRev : 0
    return { products, tot }
  }, [baseline, growth, qMonths])

  const baseProfit = baseline.products ? Object.values(baseline.products).reduce((s,p)=>s+(p.profit||0),0) : 0

  return (
    <div className="space-y-5 fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-accent">Quarterly Plan</h2>
          <p className="text-sm text-txt-muted mt-1">Baseline pulled live from your data. Revenue is COD-realized, not orders × AOV.</p>
        </div>
      </div>

      {/* Controls */}
      <div className="glass-card p-4 flex items-end gap-5 flex-wrap">
        <div>
          <label className="text-[10px] text-txt-muted uppercase tracking-wider mb-1 block">Baseline month</label>
          <select value={`${baseSel.y}-${baseSel.m}`} onChange={e=>{const [y,m]=e.target.value.split('-').map(Number); setBaseSel({y,m})}}
            className="input-field !w-40 !py-1.5 !text-sm">
            {Array.from({length:14}).map((_,i)=>{
              let d=new Date(now.getFullYear(), now.getMonth()-i, 1)
              return <option key={i} value={`${d.getFullYear()}-${d.getMonth()}`}>{MONTH_NAMES[d.getMonth()]} {d.getFullYear()}</option>
            })}
          </select>
        </div>
        <div>
          <label className="text-[10px] text-txt-muted uppercase tracking-wider mb-1 block">Quarter starts</label>
          <select value={`${q1.y}-${q1.m}`} onChange={e=>{const [y,m]=e.target.value.split('-').map(Number); setQ1({y,m})}}
            className="input-field !w-40 !py-1.5 !text-sm">
            {Array.from({length:12}).map((_,i)=>{
              let d=new Date(now.getFullYear(), now.getMonth()+i, 1)
              return <option key={i} value={`${d.getFullYear()}-${d.getMonth()}`}>{MONTH_NAMES[d.getMonth()]} {d.getFullYear()}</option>
            })}
          </select>
        </div>
        <div>
          <label className="text-[10px] text-txt-muted uppercase tracking-wider mb-1 block">MoM growth %</label>
          <input type="number" value={growth} onChange={e=>setGrowth(parseFloat(e.target.value)||0)} className="input-field !w-28 !py-1.5 !text-sm" />
        </div>
        <p className="text-[11px] text-txt-muted pb-2">Month 1 = baseline order level, then +{growth}% compounding.</p>
      </div>

      {!hasData && (
        <div className="glass-card p-10 text-center">
          <Calendar size={44} className="text-txt-muted mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-accent mb-2">No synced data for {baseName}</h3>
          <p className="text-sm text-txt-muted">Fetch {baseName} on the Dashboard first, then the plan builds from real numbers.</p>
        </div>
      )}

      {hasData && (<>
        {/* baseline readout */}
        <div className="glass-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Info size={15} className="text-accent" />
            <h3 className="text-sm font-semibold text-accent">{baseName} baseline (from your data · {baseline.daysWithData} days synced)</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead><tr className="border-b border-brand-300/50 text-[10px] text-txt-muted uppercase tracking-wider">
                <th className="py-2 px-3">Product</th><th className="py-2 px-3 text-right">Orders</th><th className="py-2 px-3 text-right">Rev/order (realized)</th>
                <th className="py-2 px-3 text-right">AOV (gross)</th><th className="py-2 px-3 text-right">CAC</th><th className="py-2 px-3 text-right">Profit/order</th>
              </tr></thead>
              <tbody>
                {plan.products.map(p => (
                  <tr key={p.code} className="border-b border-brand-300/50/50">
                    <td className="py-2 px-3 text-sm text-accent">{p.code}</td>
                    <td className="py-2 px-3 text-right font-mono text-sm font-bold text-txt-primary">{formatExact(p.baseOrders)}</td>
                    <td className="py-2 px-3 text-right font-mono text-xs text-txt-secondary">₹{formatExact(Math.round(p.revPerOrder))}</td>
                    <td className="py-2 px-3 text-right font-mono text-xs text-txt-muted">₹{formatExact(Math.round(p.aov))}</td>
                    <td className="py-2 px-3 text-right font-mono text-xs text-txt-muted">₹{formatExact(Math.round(p.cac))}</td>
                    <td className={`py-2 px-3 text-right font-mono text-xs ${p.profitPerOrder>=0?'text-cash-green':'text-cash-red'}`}>₹{formatExact(Math.round(p.profitPerOrder))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-txt-muted mt-2">Rev/order is COD-realized (accounts for undelivered COD), so it's lower than gross AOV. This is what prevents revenue inflation.</p>
        </div>

        {/* Quarter totals by product */}
        <div className="glass-card overflow-hidden">
          <div className="px-5 py-3 border-b border-brand-300/50"><h3 className="text-sm font-semibold text-accent">Quarter plan by product ({qMonths[0].label} – {qMonths[2].label})</h3></div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead><tr className="border-b border-brand-300/50 text-[10px] text-txt-muted uppercase tracking-wider">
                <th className="py-2.5 px-4">Product</th><th className="py-2.5 px-3 text-right">Q Orders</th><th className="py-2.5 px-3 text-right">Q Revenue</th>
                <th className="py-2.5 px-3 text-right">Q Meta (GST)</th><th className="py-2.5 px-3 text-right">Q Profit</th><th className="py-2.5 px-3 text-right">Margin</th>
              </tr></thead>
              <tbody>
                {plan.products.map(p => (
                  <tr key={p.code} className="border-b border-brand-300/50/50">
                    <td className="py-3 px-4 text-sm text-accent font-medium">{p.code}</td>
                    <td className="py-3 px-3 text-right font-mono text-sm font-bold text-txt-primary">{formatExact(p.qOrders)}</td>
                    <td className="py-3 px-3 text-right font-mono text-xs text-txt-secondary">₹{compactINR(p.qRev)}</td>
                    <td className="py-3 px-3 text-right font-mono text-xs text-txt-secondary">₹{compactINR(p.qMeta)}</td>
                    <td className="py-3 px-3 text-right font-mono text-xs font-bold text-cash-green">₹{compactINR(p.qProfit)}</td>
                    <td className="py-3 px-3 text-right font-mono text-xs text-txt-secondary">{(p.qMargin*100).toFixed(1)}%</td>
                  </tr>
                ))}
                <tr className="bg-ev-light font-bold border-t-2 border-brand-300">
                  <td className="py-3 px-4 text-sm text-accent">TOTAL</td>
                  <td className="py-3 px-3 text-right font-mono text-sm text-accent">{formatExact(plan.tot.qOrders)}</td>
                  <td className="py-3 px-3 text-right font-mono text-sm text-accent">₹{compactINR(plan.tot.qRev)}</td>
                  <td className="py-3 px-3 text-right font-mono text-sm text-accent">₹{compactINR(plan.tot.qMeta)}</td>
                  <td className="py-3 px-3 text-right font-mono text-sm text-cash-green">₹{compactINR(plan.tot.qProfit)}</td>
                  <td className="py-3 px-3 text-right font-mono text-sm text-accent">{(plan.tot.qMargin*100).toFixed(1)}%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Month by month */}
        <div className="glass-card overflow-hidden">
          <div className="px-5 py-3 border-b border-brand-300/50"><h3 className="text-sm font-semibold text-accent">Month by month (all products)</h3></div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead><tr className="border-b border-brand-300/50 text-[10px] text-txt-muted uppercase tracking-wider">
                <th className="py-2.5 px-4">Metric</th>
                {qMonths.map(m => <th key={m.label} className="py-2.5 px-3 text-right">{m.label}</th>)}
                <th className="py-2.5 px-3 text-right">Quarter</th>
              </tr></thead>
              <tbody>
                {[
                  {k:'orders', label:'Orders', fmt:(v)=>formatExact(Math.round(v))},
                  {k:'metaGST', label:'Meta spend (GST)', fmt:(v)=>`₹${compactINR(v)}`},
                  {k:'revenue', label:'Revenue (realized)', fmt:(v)=>`₹${compactINR(v)}`},
                  {k:'profit', label:'Profit', fmt:(v)=>`₹${compactINR(v)}`},
                ].map(row => (
                  <tr key={row.k} className="border-b border-brand-300/50/50">
                    <td className="py-3 px-4 text-sm text-txt-secondary">{row.label}</td>
                    {plan.tot.monthly.map((mm,i) => <td key={i} className="py-3 px-3 text-right font-mono text-xs text-txt-primary">{row.fmt(mm[row.k])}</td>)}
                    <td className="py-3 px-3 text-right font-mono text-xs font-bold text-accent">{row.fmt(plan.tot.monthly.reduce((s,mm)=>s+mm[row.k],0))}</td>
                  </tr>
                ))}
                <tr>
                  <td className="py-3 px-4 text-sm text-txt-secondary">Margin %</td>
                  {plan.tot.monthly.map((mm,i) => <td key={i} className="py-3 px-3 text-right font-mono text-xs text-txt-secondary">{mm.revenue>0?(mm.profit/mm.revenue*100).toFixed(1):0}%</td>)}
                  <td className="py-3 px-3 text-right font-mono text-xs font-bold text-accent">{(plan.tot.qMargin*100).toFixed(1)}%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* vs baseline */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-accent mb-3 flex items-center gap-2"><TrendingUp size={16} /> Plan vs {baseName} baseline</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div><p className="metric-label">{baseName} profit</p><p className="text-xl font-bold font-mono text-txt-primary">₹{compactINR(baseProfit)}</p></div>
            <div><p className="metric-label">{qMonths[0].label} profit</p><p className="text-xl font-bold font-mono text-cash-green">₹{compactINR(plan.tot.monthly[0].profit)}</p></div>
            <div><p className="metric-label">{qMonths[2].label} profit</p><p className="text-xl font-bold font-mono text-cash-green">₹{compactINR(plan.tot.monthly[2].profit)}</p></div>
            <div><p className="metric-label">{qMonths[2].label} vs {baseName}</p><p className="text-xl font-bold font-mono text-accent">{baseProfit>0?`+${Math.round((plan.tot.monthly[2].profit/baseProfit-1)*100)}%`:'--'}</p></div>
          </div>
        </div>
      </>)}
    </div>
  )
}
