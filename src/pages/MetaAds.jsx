import React, { useState, useMemo, useCallback } from 'react'
import { RefreshCw, Calendar, ChevronDown, ChevronUp, TrendingUp, TrendingDown, AlertTriangle, Zap, ArrowUpDown } from 'lucide-react'
import { formatExact, formatPercent } from '../lib/profitEngine'
import { getProducts, buildCampaignMap } from '../lib/productDB'

function getDateRange(preset) {
  const today = new Date()
  const fmt = d => d.toISOString().split('T')[0]
  switch (preset) {
    case 'today': return { since: fmt(today), until: fmt(today) }
    case 'yesterday': { const y = new Date(today); y.setDate(y.getDate()-1); return { since: fmt(y), until: fmt(y) } }
    case '7d': { const d = new Date(today); d.setDate(d.getDate()-6); return { since: fmt(d), until: fmt(today) } }
    case '30d': { const d = new Date(today); d.setDate(d.getDate()-29); return { since: fmt(d), until: fmt(today) } }
    case 'mtd': { const d = new Date(today.getFullYear(), today.getMonth(), 1); return { since: fmt(d), until: fmt(today) } }
    default: return null
  }
}

function Stat({ label, value, sub, color = 'text-accent' }) {
  return (
    <div className="glass-card p-4">
      <p className="text-[10px] text-brand-400 uppercase tracking-wider mb-1.5">{label}</p>
      <p className={`text-xl font-bold font-mono ${color}`}>{value}</p>
      {sub && <p className="text-[11px] text-brand-400 mt-1">{sub}</p>}
    </div>
  )
}

function SortHeader({ label, sortKey, currentSort, onSort, align = 'right' }) {
  const active = currentSort.key === sortKey
  return (
    <th className={`py-2.5 px-2 text-${align} cursor-pointer hover:text-accent transition-colors`} onClick={() => onSort(sortKey)}>
      <div className={`flex items-center gap-0.5 ${align === 'right' ? 'justify-end' : ''}`}>
        <span>{label}</span>
        {active && (currentSort.dir === 'desc' ? <ChevronDown size={10} /> : <ChevronUp size={10} />)}
        {!active && <ArrowUpDown size={8} className="text-brand-600" />}
      </div>
    </th>
  )
}

export default function MetaAds() {
  const [preset, setPreset] = useState('today')
  const [customRange, setCustomRange] = useState({ since: '', until: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [campaignData, setCampaignData] = useState(null)
  const [adsetData, setAdsetData] = useState(null)
  const [adData, setAdData] = useState(null)
  const [view, setView] = useState('ads') // ads, campaigns, adsets, products
  const [sort, setSort] = useState({ key: 'spend', dir: 'desc' })
  const [showZeroSpend, setShowZeroSpend] = useState(false)
  const [dateLabel, setDateLabel] = useState('')
  const [productFilter, setProductFilter] = useState(null)

  const dateRange = preset === 'custom' ? customRange : (getDateRange(preset) || customRange)
  const dbProducts = useMemo(() => getProducts(), [])
  const campaignMap = useMemo(() => buildCampaignMap(dbProducts), [dbProducts])

  const fetchData = useCallback(async () => {
    if (!dateRange.since || !dateRange.until) return
    setLoading(true)
    setError(null)
    try {
      const [campRes, adsetRes, adRes] = await Promise.allSettled([
        fetch(`/api/meta/campaigns?since=${dateRange.since}&until=${dateRange.until}&level=campaign`).then(r => r.json()),
        fetch(`/api/meta/campaigns?since=${dateRange.since}&until=${dateRange.until}&level=adset`).then(r => r.json()),
        fetch(`/api/meta/campaigns?since=${dateRange.since}&until=${dateRange.until}&level=ad`).then(r => r.json()),
      ])
      if (campRes.status === 'fulfilled' && !campRes.value.error) setCampaignData(campRes.value.data)
      else setError(campRes.value?.error || 'Campaign fetch failed')
      if (adsetRes.status === 'fulfilled' && !adsetRes.value.error) setAdsetData(adsetRes.value.data)
      if (adRes.status === 'fulfilled' && !adRes.value.error) setAdData(adRes.value.data)
      setDateLabel(dateRange.since === dateRange.until ? dateRange.since : `${dateRange.since} to ${dateRange.until}`)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [dateRange.since, dateRange.until])

  const handleSort = (key) => {
    setSort(prev => ({ key, dir: prev.key === key && prev.dir === 'desc' ? 'asc' : 'desc' }))
  }

  const sortRows = (rows) => {
    return [...rows].sort((a, b) => {
      const va = a[sort.key] ?? 0, vb = b[sort.key] ?? 0
      return sort.dir === 'desc' ? vb - va : va - vb
    })
  }

  // Product aggregation from campaign data
  const productBreakdown = useMemo(() => {
    if (!campaignData) return []
    const products = {}
    let unmatched = { name: 'Unmatched', code: '--', spend: 0, impressions: 0, clicks: 0, purchases: 0, atc: 0, ic: 0, campaigns: 0 }

    campaignData.forEach(c => {
      const name = (c.campaignName || '').toUpperCase()
      let matched = false
      for (const [code, productName] of Object.entries(campaignMap)) {
        if (name.includes(code)) {
          if (!products[productName]) {
            products[productName] = { name: productName, code, spend: 0, impressions: 0, clicks: 0, purchases: 0, atc: 0, ic: 0, campaigns: 0 }
          }
          const p = products[productName]
          p.spend += c.spend; p.impressions += c.impressions; p.clicks += c.clicks
          p.purchases += c.purchases; p.atc += c.atc; p.ic += c.ic; p.campaigns++
          matched = true; break
        }
      }
      if (!matched) {
        unmatched.spend += c.spend; unmatched.impressions += c.impressions; unmatched.clicks += c.clicks
        unmatched.purchases += c.purchases; unmatched.atc += c.atc; unmatched.ic += c.ic; unmatched.campaigns++
      }
    })

    const result = Object.values(products).map(p => ({
      ...p,
      ctr: p.impressions > 0 ? p.clicks / p.impressions * 100 : 0,
      cpc: p.clicks > 0 ? p.spend / p.clicks : 0,
      cpp: p.purchases > 0 ? p.spend / p.purchases : 0,
      convRate: p.clicks > 0 ? p.purchases / p.clicks * 100 : 0,
      atcRate: p.clicks > 0 ? p.atc / p.clicks * 100 : 0,
    }))

    if (unmatched.spend > 0) {
      result.push({ ...unmatched,
        ctr: unmatched.impressions > 0 ? unmatched.clicks / unmatched.impressions * 100 : 0,
        cpc: unmatched.clicks > 0 ? unmatched.spend / unmatched.clicks : 0,
        cpp: unmatched.purchases > 0 ? unmatched.spend / unmatched.purchases : 0,
        convRate: unmatched.clicks > 0 ? unmatched.purchases / unmatched.clicks * 100 : 0,
        atcRate: unmatched.clicks > 0 ? unmatched.atc / unmatched.clicks * 100 : 0,
      })
    }
    return result.sort((a, b) => b.spend - a.spend)
  }, [campaignData, campaignMap])

  // Summary
  const summary = useMemo(() => {
    if (!campaignData) return null
    const s = campaignData.reduce((acc, c) => ({
      spend: acc.spend + c.spend, impressions: acc.impressions + c.impressions,
      clicks: acc.clicks + c.clicks, purchases: acc.purchases + c.purchases,
      atc: acc.atc + c.atc, ic: acc.ic + c.ic,
    }), { spend: 0, impressions: 0, clicks: 0, purchases: 0, atc: 0, ic: 0 })
    return {
      ...s,
      ctr: s.impressions > 0 ? s.clicks / s.impressions * 100 : 0,
      cpc: s.clicks > 0 ? s.spend / s.clicks : 0,
      cpp: s.purchases > 0 ? s.spend / s.purchases : 0,
      cpm: s.impressions > 0 ? s.spend / s.impressions * 1000 : 0,
      convRate: s.clicks > 0 ? s.purchases / s.clicks * 100 : 0,
      atcRate: s.clicks > 0 ? s.atc / s.clicks * 100 : 0,
      icRate: s.atc > 0 ? s.ic / s.atc * 100 : 0,
      purchaseRate: s.ic > 0 ? s.purchases / s.ic * 100 : 0,
      activeCampaigns: campaignData.filter(c => c.impressions > 0).length,
      totalCampaigns: campaignData.length,
    }
  }, [campaignData])

  // Filtered + sorted rows for current view
  const displayRows = useMemo(() => {
    let data = view === 'ads' ? (adData || []) : view === 'adsets' ? (adsetData || []) : (campaignData || [])
    // Product filter: match campaign name against campaign codes
    if (productFilter) {
      data = data.filter(r => {
        const name = (r.campaignName || '').toUpperCase()
        for (const [code, prodName] of Object.entries(campaignMap)) {
          if (name.includes(code) && prodName === productFilter) return true
        }
        return false
      })
    }
    const filtered = showZeroSpend ? data : data.filter(r => r.spend > 0 || r.impressions > 0)
    return sortRows(filtered)
  }, [view, campaignData, adsetData, adData, sort, showZeroSpend, productFilter, campaignMap])

  // Top/bottom performers (use ad-level if available, otherwise campaigns)
  const topPerformers = useMemo(() => {
    const data = adData || campaignData || []
    const active = data.filter(c => c.spend > 0 && c.purchases > 0)
    const winners = [...active].sort((a, b) => a.cpp - b.cpp).slice(0, 5)
    const losers = [...active].sort((a, b) => b.cpp - a.cpp).slice(0, 5)
    return { winners, losers }
  }, [adData, campaignData])

  const presets = [
    { key: 'today', label: 'Today' }, { key: 'yesterday', label: 'Yesterday' },
    { key: '7d', label: '7 Days' }, { key: '30d', label: '30 Days' }, { key: 'mtd', label: 'MTD' },
    { key: 'custom', label: 'Custom' },
  ]

  return (
    <div className="space-y-4 fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-accent">Meta Ads</h2>
          <p className="text-sm text-brand-400 mt-0.5">{dateLabel || 'Select date range and fetch'}</p>
        </div>
        <button onClick={fetchData} disabled={loading || !dateRange.since} className="btn-primary flex items-center gap-2">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Fetching...' : 'Fetch Meta Data'}
        </button>
      </div>

      {/* Date */}
      <div className="glass-card p-3 flex items-center gap-2 flex-wrap">
        <Calendar size={16} className="text-brand-400" />
        {presets.map(pr => (
          <button key={pr.key} onClick={() => setPreset(pr.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${preset === pr.key ? 'bg-brand-700 text-accent border border-brand-500/30' : 'text-brand-400 hover:text-accent hover:bg-brand-800/40'}`}>
            {pr.label}
          </button>
        ))}
        {preset === 'custom' && (
          <div className="flex gap-2 ml-2">
            <input type="date" value={customRange.since} onChange={e => setCustomRange(c => ({...c, since: e.target.value}))} className="input-field !w-40 !py-1.5 !text-xs" />
            <input type="date" value={customRange.until} onChange={e => setCustomRange(c => ({...c, until: e.target.value}))} className="input-field !w-40 !py-1.5 !text-xs" />
          </div>
        )}
      </div>

      {error && <div className="glass-card p-3 border-cash-red/30 bg-red-900/10 text-sm text-cash-red">{error}</div>}

      {summary && (<>
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <Stat label="Total Spend" value={`₹${formatExact(summary.spend)}`} sub={`${summary.activeCampaigns} active campaigns`} />
          <Stat label="Purchases" value={summary.purchases} sub={`CAC: ₹${formatExact(summary.cpp)}`} color="text-cash-green" />
          <Stat label="Clicks" value={formatExact(summary.clicks)} sub={`CPC: ₹${summary.cpc.toFixed(1)}`} />
          <Stat label="Impressions" value={formatExact(summary.impressions)} sub={`CPM: ₹${summary.cpm.toFixed(0)}`} />
          <Stat label="CTR" value={`${summary.ctr.toFixed(2)}%`} sub={`${formatExact(summary.clicks)} / ${formatExact(summary.impressions)}`} color={summary.ctr >= 1 ? 'text-cash-green' : 'text-yellow-400'} />
          <Stat label="Conv Rate" value={`${summary.convRate.toFixed(2)}%`} sub={`${summary.purchases} / ${formatExact(summary.clicks)} clicks`} color={summary.convRate >= 2 ? 'text-cash-green' : 'text-yellow-400'} />
        </div>

        {/* Funnel */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-accent mb-3">Purchase Funnel</h3>
          <div className="flex items-center gap-1">
            {[
              { label: 'Impressions', value: summary.impressions, rate: null },
              { label: 'Clicks', value: summary.clicks, rate: summary.ctr },
              { label: 'Add to Cart', value: summary.atc, rate: summary.atcRate },
              { label: 'Checkout', value: summary.ic, rate: summary.icRate },
              { label: 'Purchase', value: summary.purchases, rate: summary.purchaseRate },
            ].map((step, i, arr) => (
              <React.Fragment key={step.label}>
                <div className="flex-1 text-center">
                  <div className={`rounded-lg py-3 px-2 ${i === arr.length - 1 ? 'bg-green-900/20 border border-green-800/20' : 'bg-brand-800/30'}`}>
                    <p className="text-[10px] text-brand-400 uppercase mb-1">{step.label}</p>
                    <p className={`text-lg font-bold font-mono ${i === arr.length - 1 ? 'text-cash-green' : 'text-accent'}`}>{formatExact(step.value)}</p>
                  </div>
                  {step.rate !== null && <p className="text-[10px] text-brand-500 mt-1">{step.rate.toFixed(1)}% from prev</p>}
                </div>
                {i < arr.length - 1 && <div className="text-brand-600 text-xs px-1">→</div>}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Product Breakdown */}
        {productBreakdown.length > 0 && (
          <div className="glass-card overflow-hidden">
            <div className="px-5 py-3 border-b border-brand-800/20">
              <h3 className="text-sm font-semibold text-accent">Product Performance</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left whitespace-nowrap">
                <thead><tr className="border-b border-brand-800/30 text-[10px] text-brand-400 uppercase tracking-wider">
                  <th className="py-2.5 px-3">Product</th>
                  <th className="py-2.5 px-2 text-right">Camps</th>
                  <th className="py-2.5 px-2 text-right">Spend</th>
                  <th className="py-2.5 px-2 text-right">Impressions</th>
                  <th className="py-2.5 px-2 text-right">Clicks</th>
                  <th className="py-2.5 px-2 text-right">CTR</th>
                  <th className="py-2.5 px-2 text-right">CPC</th>
                  <th className="py-2.5 px-2 text-right">ATC</th>
                  <th className="py-2.5 px-2 text-right">Purchases</th>
                  <th className="py-2.5 px-2 text-right">CAC</th>
                  <th className="py-2.5 px-2 text-right">Conv%</th>
                </tr></thead>
                <tbody>
                  {productBreakdown.map(p => (
                    <tr key={p.name} className="border-b border-brand-800/10 hover:bg-brand-900/20">
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-accent">{p.name}</span>
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-brand-800/40 text-brand-500">{p.code}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono text-xs text-brand-400">{p.campaigns}</td>
                      <td className="py-2.5 px-2 text-right font-mono text-xs text-accent">₹{formatExact(p.spend)}</td>
                      <td className="py-2.5 px-2 text-right font-mono text-xs text-brand-300">{formatExact(p.impressions)}</td>
                      <td className="py-2.5 px-2 text-right font-mono text-xs text-brand-200">{formatExact(p.clicks)}</td>
                      <td className={`py-2.5 px-2 text-right font-mono text-xs ${p.ctr >= 1 ? 'text-cash-green' : 'text-yellow-400'}`}>{p.ctr.toFixed(2)}%</td>
                      <td className="py-2.5 px-2 text-right font-mono text-xs text-brand-300">₹{p.cpc.toFixed(1)}</td>
                      <td className="py-2.5 px-2 text-right font-mono text-xs text-brand-300">{p.atc}</td>
                      <td className="py-2.5 px-2 text-right font-mono text-xs font-bold text-cash-green">{p.purchases}</td>
                      <td className={`py-2.5 px-2 text-right font-mono text-xs font-bold ${p.cpp > 0 && p.cpp <= 500 ? 'text-cash-green' : p.cpp > 500 ? 'text-cash-red' : 'text-brand-500'}`}>
                        {p.purchases > 0 ? `₹${formatExact(p.cpp)}` : '--'}
                      </td>
                      <td className={`py-2.5 px-2 text-right font-mono text-xs ${p.convRate >= 2 ? 'text-cash-green' : 'text-yellow-400'}`}>
                        {p.clicks > 0 ? `${p.convRate.toFixed(2)}%` : '--'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr className="border-t-2 border-brand-700/50 bg-brand-950/40 text-xs font-mono font-bold">
                  <td className="py-2.5 px-3 text-accent">TOTAL</td>
                  <td className="py-2.5 px-2 text-right">{productBreakdown.reduce((s,p)=>s+p.campaigns,0)}</td>
                  <td className="py-2.5 px-2 text-right">₹{formatExact(summary.spend)}</td>
                  <td className="py-2.5 px-2 text-right">{formatExact(summary.impressions)}</td>
                  <td className="py-2.5 px-2 text-right">{formatExact(summary.clicks)}</td>
                  <td className="py-2.5 px-2 text-right">{summary.ctr.toFixed(2)}%</td>
                  <td className="py-2.5 px-2 text-right">₹{summary.cpc.toFixed(1)}</td>
                  <td className="py-2.5 px-2 text-right">{summary.atc}</td>
                  <td className="py-2.5 px-2 text-right text-cash-green">{summary.purchases}</td>
                  <td className="py-2.5 px-2 text-right">₹{formatExact(summary.cpp)}</td>
                  <td className="py-2.5 px-2 text-right">{summary.convRate.toFixed(2)}%</td>
                </tr></tfoot>
              </table>
            </div>
          </div>
        )}

        {/* Winners & Losers */}
        {topPerformers.winners.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="glass-card p-4">
              <h3 className="text-sm font-semibold text-cash-green mb-3 flex items-center gap-2"><TrendingUp size={14} /> Top 5 Lowest CAC Ads</h3>
              {topPerformers.winners.map((c, i) => (
                <div key={c.adId || c.campaignId} className="flex items-center justify-between py-2 border-b border-brand-800/10 last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-brand-200 truncate">{c.adName || c.campaignName}</p>
                    <p className="text-[10px] text-brand-500">{c.purchases} purchases | ₹{formatExact(c.spend)} spend | ROAS {c.roas > 0 ? c.roas.toFixed(1) + 'x' : '--'}</p>
                  </div>
                  <span className="text-sm font-bold font-mono text-cash-green ml-3">₹{formatExact(c.cpp)}</span>
                </div>
              ))}
            </div>
            <div className="glass-card p-4">
              <h3 className="text-sm font-semibold text-cash-red mb-3 flex items-center gap-2"><TrendingDown size={14} /> Top 5 Highest CAC Ads</h3>
              {topPerformers.losers.map((c, i) => (
                <div key={c.adId || c.campaignId} className="flex items-center justify-between py-2 border-b border-brand-800/10 last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-brand-200 truncate">{c.adName || c.campaignName}</p>
                    <p className="text-[10px] text-brand-500">{c.purchases} purchases | ₹{formatExact(c.spend)} spend | ROAS {c.roas > 0 ? c.roas.toFixed(1) + 'x' : '--'}</p>
                  </div>
                  <span className="text-sm font-bold font-mono text-cash-red ml-3">₹{formatExact(c.cpp)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Spend Wasters: campaigns with spend but 0 purchases */}
        {(() => {
          const data = adData || campaignData || []
          const wasters = data.filter(c => c.spend > 100 && c.purchases === 0).sort((a,b) => b.spend - a.spend)
          if (wasters.length === 0) return null
          const totalWasted = wasters.reduce((s,c) => s + c.spend, 0)
          return (
            <div className="glass-card p-4">
              <h3 className="text-sm font-semibold text-yellow-400 mb-1 flex items-center gap-2">
                <AlertTriangle size={14} /> Spend Wasters ({wasters.length} ads, ₹{formatExact(totalWasted)} spent with 0 purchases)
              </h3>
              <p className="text-[10px] text-brand-500 mb-3">These ads spent ₹100+ but got zero purchases. Consider pausing them.</p>
              <div className="space-y-1.5">
                {wasters.slice(0, 10).map((c, i) => (
                  <div key={c.adId || c.campaignId || i} className="flex items-center justify-between py-1.5 px-2 rounded bg-brand-800/20">
                    <span className="text-xs text-brand-300 truncate flex-1">{c.adName || c.campaignName}</span>
                    <div className="flex gap-4 ml-3 text-[10px] font-mono text-brand-400 shrink-0">
                      <span>₹{formatExact(c.spend)}</span>
                      <span>{formatExact(c.clicks)} clicks</span>
                      <span>{c.atc} ATC</span>
                    </div>
                  </div>
                ))}
                {wasters.length > 10 && <p className="text-[10px] text-brand-500 mt-1">...and {wasters.length - 10} more</p>}
              </div>
            </div>
          )
        })()}

        {/* View Toggle + Product Filter */}
        <div className="glass-card p-3 flex items-center gap-2 flex-wrap">
          {[{ key: 'ads', label: 'Ads' }, { key: 'adsets', label: 'Ad Sets' }, { key: 'campaigns', label: 'Campaigns' }].map(v => (
            <button key={v.key} onClick={() => setView(v.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${view === v.key ? 'bg-brand-700 text-accent border border-brand-500/30' : 'text-brand-400 hover:text-accent hover:bg-brand-800/40'}`}>
              {v.label}
            </button>
          ))}
          <div className="h-5 w-px bg-brand-800/30 mx-1" />
          <button onClick={() => setProductFilter(null)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium ${!productFilter ? 'bg-brand-600 text-white' : 'text-brand-400 hover:text-accent hover:bg-brand-800/40 border border-brand-800/20'}`}>
            All Products
          </button>
          {productBreakdown.filter(p => p.code !== '--').map(p => (
            <button key={p.name} onClick={() => setProductFilter(productFilter === p.name ? null : p.name)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${productFilter === p.name ? 'bg-brand-600 text-white' : 'text-brand-400 hover:text-accent hover:bg-brand-800/40 border border-brand-800/20'}`}>
              {p.name}
            </button>
          ))}
          <label className="ml-auto flex items-center gap-2 text-xs text-brand-400 cursor-pointer">
            <input type="checkbox" checked={showZeroSpend} onChange={e => setShowZeroSpend(e.target.checked)} className="rounded bg-brand-800 border-brand-600" />
            Show zero spend
          </label>
        </div>

        {/* Campaign / Adset / Ad Table */}
        <div className="glass-card overflow-hidden">
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full text-left whitespace-nowrap">
              <thead className="sticky top-0 bg-brand-900/95 backdrop-blur">
                <tr className="border-b border-brand-800/30 text-[10px] text-brand-400 uppercase tracking-wider">
                  <th className="py-2.5 px-3 text-left">
                    {view === 'ads' ? 'Ad' : view === 'adsets' ? 'Ad Set' : 'Campaign'}
                  </th>
                  {view === 'ads' && <th className="py-2.5 px-2 text-left">Campaign</th>}
                  <SortHeader label="Spend" sortKey="spend" currentSort={sort} onSort={handleSort} />
                  <SortHeader label="Impr" sortKey="impressions" currentSort={sort} onSort={handleSort} />
                  <SortHeader label="Clicks" sortKey="clicks" currentSort={sort} onSort={handleSort} />
                  <SortHeader label="CTR" sortKey="ctr" currentSort={sort} onSort={handleSort} />
                  <SortHeader label="CPC" sortKey="cpc" currentSort={sort} onSort={handleSort} />
                  <SortHeader label="ATC" sortKey="atc" currentSort={sort} onSort={handleSort} />
                  <SortHeader label="Purch" sortKey="purchases" currentSort={sort} onSort={handleSort} />
                  <SortHeader label="CAC" sortKey="cpp" currentSort={sort} onSort={handleSort} />
                  <SortHeader label="ROAS" sortKey="roas" currentSort={sort} onSort={handleSort} />
                  <th className="py-2.5 px-2 text-right">Verdict</th>
                </tr>
              </thead>
              <tbody>
                {displayRows.map((r, i) => {
                  const name = view === 'ads' ? r.adName : view === 'adsets' ? r.adsetName : r.campaignName
                  // Verdict: green if purchases > 0 and CAC is reasonable, red if spend > 0 and 0 purchases, yellow if CAC is high
                  let verdict = '', verdictColor = ''
                  if (r.purchases > 0 && r.cpp <= 500) { verdict = 'Winner'; verdictColor = 'bg-green-900/20 text-cash-green' }
                  else if (r.purchases > 0 && r.cpp <= 800) { verdict = 'OK'; verdictColor = 'bg-yellow-900/20 text-yellow-400' }
                  else if (r.purchases > 0) { verdict = 'Expensive'; verdictColor = 'bg-red-900/15 text-cash-red' }
                  else if (r.spend > 500) { verdict = 'Kill'; verdictColor = 'bg-red-900/20 text-cash-red' }
                  else if (r.spend > 0) { verdict = 'Testing'; verdictColor = 'bg-brand-800/30 text-brand-400' }
                  else { verdict = '--'; verdictColor = 'text-brand-600' }

                  return (
                    <tr key={`${r.campaignId}-${r.adsetId || ''}-${r.adId || i}`} className="border-b border-brand-800/5 hover:bg-brand-900/20">
                      <td className="py-2 px-3 text-xs text-brand-200 max-w-[250px] truncate" title={name}>{name}</td>
                      {view === 'ads' && <td className="py-2 px-2 text-xs text-brand-500 max-w-[150px] truncate" title={r.campaignName}>{r.campaignName}</td>}
                      <td className="py-2 px-2 text-right font-mono text-xs text-accent">₹{formatExact(r.spend)}</td>
                      <td className="py-2 px-2 text-right font-mono text-xs text-brand-400">{formatExact(r.impressions)}</td>
                      <td className="py-2 px-2 text-right font-mono text-xs text-brand-300">{formatExact(r.clicks)}</td>
                      <td className={`py-2 px-2 text-right font-mono text-xs ${r.ctr >= 1.5 ? 'text-cash-green' : r.ctr >= 0.8 ? 'text-yellow-400' : 'text-cash-red'}`}>{r.ctr.toFixed(2)}%</td>
                      <td className="py-2 px-2 text-right font-mono text-xs text-brand-300">₹{r.cpc.toFixed(1)}</td>
                      <td className="py-2 px-2 text-right font-mono text-xs text-brand-400">{r.atc}</td>
                      <td className={`py-2 px-2 text-right font-mono text-xs font-bold ${r.purchases > 0 ? 'text-cash-green' : 'text-brand-600'}`}>{r.purchases}</td>
                      <td className={`py-2 px-2 text-right font-mono text-xs ${r.cpp > 0 && r.cpp <= 500 ? 'text-cash-green' : r.cpp > 500 ? 'text-cash-red' : 'text-brand-600'}`}>
                        {r.purchases > 0 ? `₹${formatExact(r.cpp)}` : r.spend > 0 ? '∞' : '--'}
                      </td>
                      <td className={`py-2 px-2 text-right font-mono text-xs ${r.roas >= 2 ? 'text-cash-green' : r.roas > 0 ? 'text-yellow-400' : 'text-brand-600'}`}>
                        {r.roas > 0 ? `${r.roas.toFixed(2)}x` : '--'}
                      </td>
                      <td className="py-2 px-2 text-right">
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${verdictColor}`}>{verdict}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-2 border-t border-brand-800/10 flex items-center justify-between">
            <span className="text-[10px] text-brand-600">
              {displayRows.length} {view === 'ads' ? 'ads' : view === 'adsets' ? 'ad sets' : 'campaigns'}
              {productFilter && ` for ${productFilter}`} | Click headers to sort
            </span>
            <div className="flex gap-3 text-[10px]">
              <span className="text-cash-green">Winner: CAC under 500</span>
              <span className="text-yellow-400">OK: CAC under 800</span>
              <span className="text-cash-red">Expensive/Kill: high CAC or 0 purchases</span>
            </div>
          </div>
        </div>
      </>)}

      {!summary && !loading && (
        <div className="glass-card p-12 text-center">
          <Zap size={48} className="text-brand-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-accent mb-2">Meta Ad Analytics</h3>
          <p className="text-sm text-brand-400">Select a date range and click Fetch Meta Data to see campaign performance, product breakdown, and spend analysis.</p>
        </div>
      )}
    </div>
  )
}
