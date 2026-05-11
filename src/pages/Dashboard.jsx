import React, { useState, useCallback, useMemo, useEffect } from 'react'
import { RefreshCw, Calendar, AlertCircle, BarChart, ChevronDown, ChevronRight, ChevronLeft, X, Filter, AlertTriangle, Download, Clock, Check } from 'lucide-react'
import { fetchShopifyOrders, fetchMetaSpend } from '../lib/api'
import { calculateFullPnL, formatINR, formatPercent, formatExact } from '../lib/profitEngine'
import { getProducts, buildCampaignMap, buildVendorPriceMap, allocateMetaSpend } from '../lib/productDB'
import { useDataStore } from '../lib/dataStore'

function getDateRange(preset) {
  const today = new Date()
  const fmt = (d) => d.toISOString().split('T')[0]
  switch (preset) {
    case 'today': return { since: fmt(today), until: fmt(today) }
    case 'yesterday': { const y = new Date(today); y.setDate(y.getDate() - 1); return { since: fmt(y), until: fmt(y) } }
    case '7d': { const d = new Date(today); d.setDate(d.getDate() - 6); return { since: fmt(d), until: fmt(today) } }
    case '30d': { const d = new Date(today); d.setDate(d.getDate() - 29); return { since: fmt(d), until: fmt(today) } }
    case 'mtd': { const d = new Date(today.getFullYear(), today.getMonth(), 1); return { since: fmt(d), until: fmt(today) } }
    default: return null
  }
}

function shiftDate(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

function Stat({ label, value, sub, color = 'text-txt-primary' }) {
  return (
    <div className="glass-card glass-card-hover p-4 fade-in">
      <p className="metric-label mb-2">{label}</p>
      <p className={`metric-value ${color}`}>{value}</p>
      {sub && <p className="metric-sub">{sub}</p>}
    </div>
  )
}

function PnLLine({ label, value, indent, bold }) {
  return (
    <div className={`flex justify-between py-1.5 ${indent ? 'pl-6' : ''} ${bold ? 'border-t border-brand-300/50 pt-2.5 mt-1.5' : ''}`}>
      <span className={`text-sm ${bold ? 'text-txt-primary font-semibold' : 'text-txt-muted'}`}>{label}</span>
      <span className={`font-mono text-sm ${bold ? 'font-bold text-txt-primary' : 'text-txt-secondary'}`}>{value}</span>
    </div>
  )
}

function exportCSV(pnl, dateLabel) {
  if (!pnl) return
  const rows = [
    ['Everlasting Profit Report', dateLabel],
    [],
    ['Metric', 'Value'],
    ['Orders', pnl.overview.activeOrders],
    ['Prepaid', pnl.overview.prepaidOrders],
    ['C2P', pnl.overview.c2pOrders],
    ['COD', pnl.overview.codOrders],
    ['Cancelled', pnl.overview.cancelledOrders],
    [],
    ['Revenue', ''],
    ['Prepaid Revenue', Math.round(pnl.revenue.prepaidRevenue)],
    ['C2P Expected', Math.round(pnl.revenue.c2pExpected)],
    ['COD Expected', Math.round(pnl.revenue.codExpected)],
    ['Expected Revenue', Math.round(pnl.revenue.expectedRevenue)],
    [],
    ['Expenses', ''],
    ['Meta Ads (incl GST)', Math.round(pnl.expenses.metaAds)],
    ['COGS', Math.round(pnl.expenses.cogs)],
    ['Boxes', Math.round(pnl.expenses.boxes)],
    ['Warranty Card', Math.round(pnl.expenses.warrantyCard)],
    ['Free Ring', Math.round(pnl.expenses.freeRing)],
    ['Packing Bags', Math.round(pnl.expenses.packingBags)],
    ['Shipping', Math.round(pnl.expenses.shipping)],
    ['Cashfree Fee', Math.round(pnl.expenses.cashfree)],
    ['Engage', Math.round(pnl.expenses.engage)],
    ['Checkout', Math.round(pnl.expenses.checkout)],
    ['Total Expenses', Math.round(pnl.expenses.total)],
    [],
    ['Expected Profit', Math.round(pnl.profit.expected)],
    ['Margin %', (pnl.profit.margin * 100).toFixed(1) + '%'],
    ['Per Order', Math.round(pnl.profit.perOrder)],
    [],
    ['Product', 'Units', 'Revenue', 'COGS', 'Meta', 'Profit', 'Margin'],
    ...pnl.products.map(p => [
      p.name, p.totalUnits, Math.round(p.revenue),
      Math.round(p.vendorCost), Math.round(p.metaSpend),
      Math.round(p.profit), (p.margin * 100).toFixed(1) + '%'
    ])
  ]
  const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `everlasting-profit-${dateLabel.replace(/\s/g, '-')}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function Dashboard() {
  const { getCachedData, setCachedData, ready } = useDataStore()
  const [preset, setPreset] = useState('today')
  const [customRange, setCustomRange] = useState({ since: '', until: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [productFilter, setProductFilter] = useState(null)
  const [showPnL, setShowPnL] = useState(false)
  const [showVariants, setShowVariants] = useState(true)

  const dateRange = preset === 'custom' ? customRange : (getDateRange(preset) || customRange)
  const dateLabel = dateRange.since === dateRange.until ? dateRange.since : `${dateRange.since} to ${dateRange.until}`
  const cacheKey = `${dateRange.since}_${dateRange.until}`

  // Get cached data for current date range
  const rawData = dateRange.since ? getCachedData(dateRange.since, dateRange.until) : null
  const lastFetch = rawData?.fetchedAt ? new Date(rawData.fetchedAt) : null
  const isCached = !!rawData

  // Product database
  const dbProducts = useMemo(() => getProducts(), [rawData])
  const campaignMap = useMemo(() => buildCampaignMap(dbProducts), [dbProducts])
  const vendorPriceMap = useMemo(() => buildVendorPriceMap(dbProducts), [dbProducts])

  const metaAllocation = useMemo(() => {
    if (!rawData?.metaCampaigns) return {}
    return allocateMetaSpend(rawData.metaCampaigns, campaignMap)
  }, [rawData, campaignMap])

  const pnl = useMemo(() => {
    if (!rawData?.orders) return null
    return calculateFullPnL(rawData.orders, metaAllocation, vendorPriceMap, productFilter)
  }, [rawData, metaAllocation, vendorPriceMap, productFilter])

  const allPnl = useMemo(() => {
    if (!rawData?.orders) return null
    return calculateFullPnL(rawData.orders, metaAllocation, vendorPriceMap)
  }, [rawData, metaAllocation, vendorPriceMap])

  const fetchData = useCallback(async () => {
    if (!dateRange.since || !dateRange.until) return
    setLoading(true)
    setError(null)
    setProductFilter(null)
    try {
      // Fetch Shopify and Meta in parallel for speed
      const [shopifyResult, metaResult] = await Promise.allSettled([
        fetchShopifyOrders(dateRange.since, dateRange.until),
        fetchMetaSpend(dateRange.since, dateRange.until),
      ])

      if (shopifyResult.status === 'rejected') throw new Error(shopifyResult.reason?.message || 'Shopify fetch failed')
      const shopify = shopifyResult.value

      let metaCampaigns = []
      let metaRawSpend = 0
      if (metaResult.status === 'fulfilled' && metaResult.value) {
        metaCampaigns = metaResult.value.campaigns || []
        metaRawSpend = metaResult.value.summary?.totalSpend || 0
      }

      setCachedData(dateRange.since, dateRange.until, {
        orders: shopify.orders,
        metaCampaigns,
        metaRawSpend,
        apiMeta: shopify.meta,
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [dateRange.since, dateRange.until, setCachedData])

  // Auto-fetch if no cache exists for this range (only on preset change, not custom)
  useEffect(() => {
    if (preset !== 'custom' && dateRange.since && !getCachedData(dateRange.since, dateRange.until) && !loading) {
      // Don't auto-fetch, just clear product filter
      setProductFilter(null)
    }
  }, [preset])

  // Navigate single day forward/backward
  const canNavigateDay = dateRange.since === dateRange.until
  const goDay = (dir) => {
    const newDate = shiftDate(dateRange.since, dir)
    const today = new Date().toISOString().split('T')[0]
    if (newDate > today) return
    setCustomRange({ since: newDate, until: newDate })
    setPreset('custom')
    setProductFilter(null)
  }

  const p = pnl
  const ap = allPnl
  const missingCodes = ap?.products.filter(pr => !pr.hasCampaignCode) || []

  // Sort product families by order count (descending)
  const sortedFamilies = ap?.products.map(p => p.name).filter(Boolean) || []

  const presets = [
    { key: 'today', label: 'Today' }, { key: 'yesterday', label: 'Yesterday' },
    { key: '7d', label: '7 Days' }, { key: '30d', label: '30 Days' },
    { key: 'mtd', label: 'MTD' }, { key: 'custom', label: 'Custom' },
  ]

  return (
    <div className="space-y-4 fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-txt-primary">{productFilter || 'Profit Dashboard'}</h2>
          <p className="text-sm text-txt-muted mt-0.5">
            {dateLabel || 'Select a date range'}
            {rawData?.apiMeta && <span className="text-txt-muted ml-2">({rawData.apiMeta.rawOrderCount} orders)</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isCached && <div className="flex items-center gap-1.5 text-xs text-cash-green bg-green-50 px-2.5 py-1 rounded-lg">
            <Check size={10} /> Cached {lastFetch && <span className="text-txt-muted">{lastFetch.toLocaleTimeString('en-IN', {hour:'2-digit',minute:'2-digit'})}</span>}
          </div>}
          {ap && <button onClick={() => exportCSV(ap, dateLabel)} className="btn-ghost flex items-center gap-1.5 text-xs">
            <Download size={12} /> CSV
          </button>}
          <button onClick={fetchData} disabled={loading || !dateRange.since} className="btn-primary flex items-center gap-2">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Fetching...' : isCached ? 'Refresh' : 'Fetch Data'}
          </button>
        </div>
      </div>

      {/* Date Range */}
      <div className="glass-card p-3 flex items-center gap-2 flex-wrap">
        {canNavigateDay && (
          <button onClick={() => goDay(-1)} className="p-1.5 rounded-lg text-txt-muted hover:text-accent hover:bg-ev-light">
            <ChevronLeft size={16} />
          </button>
        )}
        <Calendar size={16} className="text-txt-muted" />
        {presets.map(pr => {
          const range = pr.key !== 'custom' ? getDateRange(pr.key) : null
          const hasCached = range ? !!getCachedData(range.since, range.until) : false
          return (
            <button key={pr.key} onClick={() => { setPreset(pr.key); setProductFilter(null) }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all relative ${preset === pr.key ? 'bg-accent text-white' : 'text-txt-muted hover:text-accent hover:bg-ev-light'}`}>
              {pr.label}
              {hasCached && preset !== pr.key && <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-cash-green" />}
            </button>
          )
        })}
        {canNavigateDay && (
          <button onClick={() => goDay(1)} disabled={dateRange.since >= new Date().toISOString().split('T')[0]}
            className="p-1.5 rounded-lg text-txt-muted hover:text-accent hover:bg-ev-light disabled:opacity-30 disabled:cursor-not-allowed">
            <ChevronRight size={16} />
          </button>
        )}
        {preset === 'custom' && (
          <div className="flex gap-2 ml-2">
            <input type="date" value={customRange.since} onChange={e => setCustomRange(c => ({ ...c, since: e.target.value }))} className="input-field !w-40 !py-1.5 !text-xs" />
            <input type="date" value={customRange.until} onChange={e => setCustomRange(c => ({ ...c, until: e.target.value }))} className="input-field !w-40 !py-1.5 !text-xs" />
          </div>
        )}
      </div>

      {/* Not cached notice */}
      {!isCached && dateRange.since && !loading && (
        <div className="glass-card p-3 bg-brand-800/40 text-sm text-txt-muted flex items-center gap-2">
          <Clock size={14} /> No data for {dateLabel}. Click {isCached ? 'Refresh' : 'Fetch Data'} to load.
        </div>
      )}

      {/* Product Filter - top 6 as pills, rest as dropdown */}
      {ap && (
        <div className="glass-card p-3 flex items-center gap-2 flex-wrap">
          <Filter size={14} className="text-txt-muted" />
          <button onClick={() => setProductFilter(null)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${!productFilter ? 'bg-accent text-white' : 'text-txt-muted hover:text-accent hover:bg-ev-light border border-brand-300/50'}`}>
            All Products
          </button>
          {sortedFamilies.slice(0, 6).map(f => {
            const prod = ap.products.find(p => p.name === f)
            return (
              <button key={f} onClick={() => setProductFilter(productFilter === f ? null : f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${productFilter === f ? 'bg-accent text-white' : 'text-txt-muted hover:text-accent hover:bg-ev-light border border-brand-300/50'}`}>
                {f}
                <span className={`text-[10px] font-mono ${productFilter === f ? 'text-brand-200' : 'text-txt-muted'}`}>
                  {prod?.totalUnits || 0}
                </span>
              </button>
            )
          })}
          {sortedFamilies.length > 6 && (
            <select
              value={productFilter && !sortedFamilies.slice(0, 6).includes(productFilter) ? productFilter : ''}
              onChange={e => setProductFilter(e.target.value || null)}
              className="input-field !w-auto !py-1.5 !px-2 !text-xs !rounded-lg"
            >
              <option value="">+{sortedFamilies.length - 6} more</option>
              {sortedFamilies.slice(6).map(f => {
                const prod = ap.products.find(p => p.name === f)
                return <option key={f} value={f}>{f} ({prod?.totalUnits || 0})</option>
              })}
            </select>
          )}
        </div>
      )}

      {productFilter && <div className="glass-card p-2.5 flex items-center justify-between bg-ev-light">
        <span className="text-sm text-accent font-medium">Filtered: {productFilter}</span>
        <button onClick={() => setProductFilter(null)} className="flex items-center gap-1 text-xs text-txt-muted hover:text-accent"><X size={12} /> Clear</button>
      </div>}

      {error && <div className="glass-card p-4 border-red-200 bg-red-50 flex items-start gap-3">
        <AlertCircle size={18} className="text-cash-red mt-0.5" />
        <div><p className="text-sm text-cash-red font-medium">Error</p><p className="text-xs text-txt-muted mt-1">{error}</p></div>
      </div>}

      {/* Missing campaign codes - compact */}
      {!productFilter && missingCodes.length > 0 && rawData?.metaCampaigns?.length > 0 && (
        <div className="glass-card p-2.5 bg-yellow-50 border-yellow-200 text-xs text-yellow-700 flex items-center gap-2">
          <AlertTriangle size={12} className="shrink-0" />
          <span>{missingCodes.length} products missing campaign codes. </span>
          <button onClick={() => window.location.href = '/products'} className="underline font-medium">Fix in Products</button>
          {metaAllocation._unallocated_withGST > 0 && (
            <span className="ml-auto font-mono">₹{formatExact(metaAllocation._unallocated_withGST)} unallocated</span>
          )}
        </div>
      )}

      {p && (
        <>
          {/* Row 1: Orders & Payment Split */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <Stat label="Total Orders" value={p.overview.activeOrders} sub={`Cancelled: ${p.overview.cancelledOrders}`} />
            <Stat label="Prepaid %" value={formatPercent(p.overview.prepaidRate)} sub={`${p.overview.prepaidOrders} orders`} color="text-cash-green" />
            <Stat label="C2P %" value={formatPercent(p.overview.c2pRate)} sub={`${p.overview.c2pOrders} orders (₹150 ea)`} color="text-yellow-600" />
            <Stat label="COD %" value={formatPercent(p.overview.codRate)} sub={`${p.overview.codOrders} orders (30% del)`} color="text-txt-muted" />
            <Stat label="AOV (incl. upsells)" value={`₹${formatExact(p.metrics.aov)}`} sub="Full order value / orders" />
            <Stat label="CAC (incl. GST)" value={`₹${formatExact(p.metrics.cacWithGST)}`}
              sub={`Pre-GST: ₹${formatExact(p.metrics.cacPreGST)}`}
              color={p.metrics.cacPreGST > 0 && p.metrics.cacPreGST <= 500 ? 'text-cash-green' : p.metrics.cacPreGST > 500 ? 'text-cash-red' : 'text-txt-muted'} />
          </div>

          {/* Row 2: Revenue & Profit */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Stat label="Prepaid Revenue (incl. C2P)" value={`₹${formatExact(p.revenue.prepaidRevenueTotal)}`}
              sub={`Prepaid: ₹${formatExact(p.revenue.prepaidRevenue)} + C2P: ₹${formatExact(p.revenue.c2pUpfront)}`} color="text-cash-green" />
            <Stat label="COD Expected Revenue" value={`₹${formatExact(p.revenue.codRevenueExpected)}`}
              sub="COD + C2P remaining at 30%" color="text-txt-muted" />
            <Stat label="Meta Spend (incl. GST)" value={`₹${formatExact(p.expenses.metaAds)}`}
              sub={`Prepaid Rev / Ad Spend: ${p.metrics.prepaidToAdSpend > 0 ? (p.metrics.prepaidToAdSpend * 100).toFixed(0) + '%' : '--'}`}
              color={p.metrics.prepaidToAdSpend > 1.5 ? 'text-cash-green' : p.metrics.prepaidToAdSpend > 0 ? 'text-cash-red' : 'text-txt-muted'} />
            <Stat label="Expected Profit" value={`₹${formatExact(p.profit.expected)}`}
              sub={`${formatPercent(p.profit.margin)} margin | ₹${Math.round(p.profit.perOrder)}/order`}
              color={p.profit.expected >= 0 ? 'text-cash-green' : 'text-cash-red'} />
            <Stat label="Expected Revenue" value={`₹${formatExact(p.revenue.expectedRevenue)}`}
              sub={`COGS+Logistics: ₹${formatExact(p.expenses.cogs + p.expenses.logistics + p.expenses.totalFees)}`} />
          </div>

          {/* P&L */}
          <div className="glass-card overflow-hidden">
            <button onClick={() => setShowPnL(!showPnL)} className="w-full px-5 py-3 flex items-center justify-between hover:bg-ev-light">
              <h3 className="text-sm font-semibold text-accent">P&L Statement</h3>
              <ChevronDown size={16} className={`text-txt-muted transition-transform ${showPnL ? 'rotate-180' : ''}`} />
            </button>
            {showPnL && (
              <div className="px-5 py-3 border-t border-brand-300/50">
                <div className="text-[10px] text-txt-muted uppercase tracking-wider mb-1">Income</div>
                <PnLLine label="Prepaid (Cashfree)" value={`₹${formatExact(p.revenue.prepaidRevenue)}`} indent />
                <PnLLine label={`C2P upfront (${p.overview.c2pOrders} x ₹150)`} value={`₹${formatExact(p.revenue.c2pUpfront)}`} indent />
                <PnLLine label="C2P COD portion (30%)" value={`₹${formatExact(Math.max(0, p.revenue.c2pExpected - (p.revenue.c2pUpfront || p.overview.c2pOrders * 150)))}`} indent />
                <PnLLine label="COD revenue (30%)" value={`₹${formatExact(p.revenue.codExpected)}`} indent />
                <PnLLine label="Expected Revenue" value={`₹${formatExact(p.revenue.expectedRevenue)}`} bold />
                <div className="text-[10px] text-txt-muted uppercase tracking-wider mt-3 mb-1">Expenses</div>
                <PnLLine label="Meta Ads (incl. 18% GST)" value={`-₹${formatExact(p.expenses.metaAds)}`} indent />
                <PnLLine label="COGS (Vendor)" value={`-₹${formatExact(p.expenses.cogs)}`} indent />
                <PnLLine label={`Boxes (${p.overview.boxOrders || p.overview.totalOrders} orders x ₹34.3)`} value={`-₹${formatExact(p.expenses.boxes)}`} indent />
                <PnLLine label="Warranty Card (prepaid + COD@70%)" value={`-₹${formatExact(p.expenses.warrantyCard)}`} indent />
                <PnLLine label={`Free Ring (${p.overview.prepaidOrders} prepaid x ₹17.51)`} value={`-₹${formatExact(p.expenses.freeRing)}`} indent />
                <PnLLine label="Packing Bags (prepaid + COD@70%)" value={`-₹${formatExact(p.expenses.packingBags)}`} indent />
                <PnLLine label={`Shipping (${p.overview.prepaidOrders}x₹60 + ${p.overview.codC2pOrders || 0}x₹100@70%)`} value={`-₹${formatExact(p.expenses.shipping)}`} indent />
                <PnLLine label="Cashfree (1.34%)" value={`-₹${formatExact(p.expenses.cashfree)}`} indent />
                <PnLLine label="Engage" value={`-₹${formatExact(p.expenses.engage)}`} indent />
                <PnLLine label="Checkout (Fastrr)" value={`-₹${formatExact(p.expenses.checkout)}`} indent />
                <PnLLine label="Total Expenses" value={`-₹${formatExact(p.expenses.total)}`} bold />
                <div className="mt-2" />
                <PnLLine label="EXPECTED PROFIT" value={`${p.profit.expected < 0 ? '-' : ''}₹${formatExact(Math.abs(p.profit.expected))}`} bold />
                <PnLLine label="Margin %" value={formatPercent(p.profit.margin)} />
                <PnLLine label="Per Order" value={`₹${Math.round(p.profit.perOrder)}`} />
              </div>
            )}
          </div>

          {/* Product Table */}
          {!productFilter && ap && (
            <div className="glass-card overflow-hidden">
              <div className="px-5 py-3 border-b border-brand-300/50">
                <h3 className="text-sm font-semibold text-accent">Product Breakdown -- click to drill in</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left whitespace-nowrap">
                  <thead>
                    <tr className="border-b border-brand-300/50 text-[10px] text-txt-muted uppercase tracking-wider">
                      <th className="py-2.5 px-3">Product</th>
                      <th className="py-2.5 px-2 text-right">Orders</th>
                      <th className="py-2.5 px-2 text-right">Prepaid%</th>
                      <th className="py-2.5 px-2 text-right">C2P%</th>
                      <th className="py-2.5 px-2 text-right">COD%</th>
                      <th className="py-2.5 px-2 text-right">AOV</th>
                      <th className="py-2.5 px-2 text-right">Prepaid Rev</th>
                      <th className="py-2.5 px-2 text-right">COD Rev</th>
                      <th className="py-2.5 px-2 text-right">Meta ₹</th>
                      <th className="py-2.5 px-2 text-right">CAC+GST</th>
                      <th className="py-2.5 px-2 text-right">Prep/Ad%</th>
                      <th className="py-2.5 px-2 text-right">Profit</th>
                      <th className="py-2.5 px-2 text-right">Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ap.products.map(prod => (
                      <tr key={prod.name} onClick={() => setProductFilter(prod.name)}
                        className="border-b border-brand-300/50/50 hover:bg-ev-light cursor-pointer group">
                        <td className="py-2.5 px-3 text-sm font-medium group-hover:text-txt-primary">
                          <div className="flex items-center gap-1.5">
                            <ChevronRight size={12} className="text-txt-muted group-hover:text-accent" />
                            <span className="text-accent">{prod.name}</span>
                            {!prod.hasCampaignCode && rawData?.metaCampaigns?.length > 0 && <AlertTriangle size={10} className="text-yellow-600" />}
                          </div>
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono text-xs font-bold text-txt-primary">{prod.orderCount}</td>
                        <td className="py-2.5 px-2 text-right font-mono text-xs text-cash-green">{(prod.prepaidPct*100).toFixed(0)}%</td>
                        <td className="py-2.5 px-2 text-right font-mono text-xs text-yellow-600">{(prod.c2pPct*100).toFixed(0)}%</td>
                        <td className="py-2.5 px-2 text-right font-mono text-xs text-txt-muted">{(prod.codPct*100).toFixed(0)}%</td>
                        <td className="py-2.5 px-2 text-right font-mono text-xs text-txt-secondary">₹{formatExact(prod.aovWithUpsells)}</td>
                        <td className="py-2.5 px-2 text-right font-mono text-xs text-cash-green">₹{formatExact(prod.prepaidRevenueTotal)}</td>
                        <td className="py-2.5 px-2 text-right font-mono text-xs text-txt-muted">₹{formatExact(prod.codRevenueExpected)}</td>
                        <td className="py-2.5 px-2 text-right font-mono text-xs text-txt-muted">
                          {prod.hasCampaignCode ? `₹${formatExact(prod.metaSpend)}` : <span className="text-yellow-600">--</span>}
                        </td>
                        <td className={`py-2.5 px-2 text-right font-mono text-xs ${prod.hasCampaignCode ? (prod.cacWithGST > 0 ? 'text-txt-secondary' : 'text-txt-muted') : 'text-yellow-600'}`}>
                          {prod.hasCampaignCode ? (prod.cacWithGST > 0 ? `₹${formatExact(prod.cacWithGST)}` : '--') : '--'}
                        </td>
                        <td className={`py-2.5 px-2 text-right font-mono text-xs ${prod.prepaidToAdSpend >= 1.5 ? 'text-cash-green' : prod.prepaidToAdSpend > 0 ? 'text-cash-red' : 'text-txt-muted'}`}>
                          {prod.hasCampaignCode && prod.prepaidToAdSpend > 0 ? `${(prod.prepaidToAdSpend*100).toFixed(0)}%` : '--'}
                        </td>
                        <td className={`py-2.5 px-2 text-right font-mono text-xs font-bold ${prod.hasCampaignCode ? (prod.profit >= 0 ? 'text-cash-green' : 'text-cash-red') : 'text-yellow-600'}`}>
                          {prod.hasCampaignCode ? `₹${formatExact(prod.profit)}` : '--'}
                        </td>
                        <td className={`py-2.5 px-2 text-right font-mono text-xs ${prod.hasCampaignCode ? (prod.margin >= 0.2 ? 'text-cash-green' : prod.margin >= 0 ? 'text-yellow-600' : 'text-cash-red') : 'text-yellow-600'}`}>
                          {prod.hasCampaignCode ? formatPercent(prod.margin) : '--'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-brand-300 bg-ev-light">
                      <td className="py-2.5 px-3 font-bold text-accent text-sm">TOTAL</td>
                      <td className="py-2.5 px-2 text-right font-mono text-xs font-bold text-txt-primary">{ap.overview.activeOrders}</td>
                      <td className="py-2.5 px-2 text-right font-mono text-xs font-bold text-cash-green">{(ap.overview.prepaidRate*100).toFixed(0)}%</td>
                      <td className="py-2.5 px-2 text-right font-mono text-xs font-bold text-yellow-600">{(ap.overview.c2pRate*100).toFixed(0)}%</td>
                      <td className="py-2.5 px-2 text-right font-mono text-xs font-bold">{(ap.overview.codRate*100).toFixed(0)}%</td>
                      <td className="py-2.5 px-2 text-right font-mono text-xs font-bold">₹{formatExact(ap.metrics.aov)}</td>
                      <td className="py-2.5 px-2 text-right font-mono text-xs font-bold text-cash-green">₹{formatExact(ap.revenue.prepaidRevenueTotal)}</td>
                      <td className="py-2.5 px-2 text-right font-mono text-xs font-bold">₹{formatExact(ap.revenue.codRevenueExpected)}</td>
                      <td className="py-2.5 px-2 text-right font-mono text-xs font-bold">₹{formatExact(ap.expenses.metaAds)}</td>
                      <td className="py-2.5 px-2 text-right font-mono text-xs font-bold">₹{formatExact(ap.metrics.cacWithGST)}</td>
                      <td className={`py-2.5 px-2 text-right font-mono text-xs font-bold ${ap.metrics.prepaidToAdSpend >= 1.5 ? 'text-cash-green' : 'text-cash-red'}`}>
                        {ap.metrics.prepaidToAdSpend > 0 ? `${(ap.metrics.prepaidToAdSpend*100).toFixed(0)}%` : '--'}
                      </td>
                      <td className={`py-2.5 px-2 text-right font-mono text-xs font-bold ${ap.profit.expected>=0?'text-cash-green':'text-cash-red'}`}>₹{formatExact(ap.profit.expected)}</td>
                      <td className="py-2.5 px-2 text-right font-mono text-xs font-bold">{formatPercent(ap.profit.margin)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Upsell Analysis */}
          {ap && ap.upsellAnalysis && Object.keys(ap.upsellAnalysis).length > 0 && !productFilter && (
            <div className="glass-card overflow-hidden">
              <div className="px-5 py-3 border-b border-brand-300/50">
                <h3 className="text-sm font-semibold text-accent">Gift Box Upsell Performance</h3>
                <p className="text-[10px] text-txt-muted mt-0.5">AOV = all orders with this product / order count. "Without Box" subtracts gift box revenue from the same orders. Lift = what the gift box adds per order on average.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left whitespace-nowrap">
                  <thead><tr className="border-b border-brand-300/50 text-[10px] text-txt-muted uppercase tracking-wider">
                    <th className="py-2.5 px-3">Product</th>
                    <th className="py-2.5 px-2 text-right">Orders</th>
                    <th className="py-2.5 px-2 text-right">Bought Box</th>
                    <th className="py-2.5 px-2 text-right">Attach Rate</th>
                    <th className="py-2.5 px-2 text-right">AOV (current)</th>
                    <th className="py-2.5 px-2 text-right">AOV (w/o box)</th>
                    <th className="py-2.5 px-2 text-right">Lift / Order</th>
                    <th className="py-2.5 px-2 text-right">Lift %</th>
                    <th className="py-2.5 px-2 text-right">Box Revenue</th>
                  </tr></thead>
                  <tbody>
                    {Object.entries(ap.upsellAnalysis).map(([family, u]) => (
                      <tr key={family} className="border-b border-brand-300/50/50 hover:bg-ev-light cursor-pointer" onClick={() => setProductFilter(family)}>
                        <td className="py-2.5 px-3 text-sm text-accent font-medium">{family}</td>
                        <td className="py-2.5 px-2 text-right font-mono text-xs text-txt-secondary">{u.totalOrders}</td>
                        <td className="py-2.5 px-2 text-right font-mono text-xs text-cash-green">{u.withUpsellCount}</td>
                        <td className={`py-2.5 px-2 text-right font-mono text-xs font-bold ${u.attachRate >= 0.2 ? 'text-cash-green' : u.attachRate >= 0.1 ? 'text-yellow-600' : 'text-cash-red'}`}>
                          {(u.attachRate * 100).toFixed(1)}%
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono text-xs text-txt-primary font-bold">₹{formatExact(u.aovCurrent)}</td>
                        <td className="py-2.5 px-2 text-right font-mono text-xs text-txt-muted">₹{formatExact(u.aovWithoutBox)}</td>
                        <td className="py-2.5 px-2 text-right font-mono text-xs text-cash-green font-bold">+₹{formatExact(u.aovLiftAmount)}</td>
                        <td className={`py-2.5 px-2 text-right font-mono text-xs ${u.aovLiftPct > 0 ? 'text-cash-green' : 'text-txt-muted'}`}>
                          +{(u.aovLiftPct * 100).toFixed(1)}%
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono text-xs text-txt-primary">₹{formatExact(u.totalUpsellRevenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-5 py-2 border-t border-brand-300/50/50 text-[10px] text-txt-muted">Click a product to see order-level breakdown</div>
            </div>
          )}

          {/* Upsell drill-down for filtered product */}
          {productFilter && ap?.upsellAnalysis?.[productFilter] && (() => {
            const u = ap.upsellAnalysis[productFilter]
            return (
              <div className="glass-card overflow-hidden">
                <div className="px-5 py-3 border-b border-brand-300/50">
                  <h3 className="text-sm font-semibold text-accent">Gift Box Upsell: {productFilter}</h3>
                  <p className="text-[10px] text-txt-muted mt-0.5">
                    AOV Current = total value of all {u.totalOrders} orders with {productFilter} / {u.totalOrders} = ₹{formatExact(u.aovCurrent)}.{' '}
                    AOV Without Box = (total value - ₹{formatExact(u.totalUpsellRevenue)} gift box revenue) / {u.totalOrders} = ₹{formatExact(u.aovWithoutBox)}.{' '}
                    Gift box adds ₹{formatExact(u.aovLiftAmount)} per order on average.
                  </p>
                </div>

                {/* Summary cards */}
                <div className="p-4 grid grid-cols-2 md:grid-cols-5 gap-4 border-b border-brand-300/50">
                  <div>
                    <p className="text-[10px] text-txt-muted mb-1">Attach Rate</p>
                    <p className={`text-xl font-bold font-mono ${u.attachRate >= 0.2 ? 'text-cash-green' : u.attachRate >= 0.1 ? 'text-yellow-600' : 'text-cash-red'}`}>
                      {(u.attachRate * 100).toFixed(1)}%
                    </p>
                    <p className="text-[10px] text-txt-muted mt-1">{u.withUpsellCount} of {u.totalOrders} orders</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-txt-muted mb-1">AOV (current)</p>
                    <p className="text-xl font-bold font-mono text-txt-primary">₹{formatExact(u.aovCurrent)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-txt-muted mb-1">AOV (without box)</p>
                    <p className="text-xl font-bold font-mono text-txt-muted">₹{formatExact(u.aovWithoutBox)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-txt-muted mb-1">Lift per Order</p>
                    <p className="text-xl font-bold font-mono text-cash-green">+₹{formatExact(u.aovLiftAmount)}</p>
                    <p className="text-[10px] text-txt-muted mt-1">+{(u.aovLiftPct * 100).toFixed(1)}%</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-txt-muted mb-1">Total Box Revenue</p>
                    <p className="text-xl font-bold font-mono text-txt-primary">₹{formatExact(u.totalUpsellRevenue)}</p>
                    <p className="text-[10px] text-txt-muted mt-1">Avg ₹{formatExact(u.avgUpsellPerBoxOrder)}/box order</p>
                  </div>
                </div>

                {/* Order-level drill-down */}
                <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                  <table className="w-full text-left">
                    <thead className="sticky top-0 bg-white/95 backdrop-blur">
                      <tr className="border-b border-brand-300/50 text-[10px] text-txt-muted uppercase tracking-wider">
                        <th className="py-2 px-3">Order #</th>
                        <th className="py-2 px-3">Payment</th>
                        <th className="py-2 px-3 text-right">Order Total</th>
                        <th className="py-2 px-3">Gift Box?</th>
                        <th className="py-2 px-3 text-right">Box Value</th>
                        <th className="py-2 px-3">Line Items</th>
                      </tr>
                    </thead>
                    <tbody>
                      {u.orders.sort((a, b) => (b.hasUpsell ? 1 : 0) - (a.hasUpsell ? 1 : 0) || b.total - a.total).map(o => (
                        <tr key={o.id} className={`border-b border-brand-300/50/5 hover:bg-ev-light ${o.hasUpsell ? '' : 'opacity-60'}`}>
                          <td className="py-2 px-3 font-mono text-xs text-txt-primary">#{o.id}</td>
                          <td className="py-2 px-3">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${o.paymentType === 'prepaid' ? 'bg-green-50 text-cash-green' : o.paymentType === 'c2p' ? 'bg-yellow-900/30 text-yellow-600' : 'bg-ev-light text-txt-muted'}`}>
                              {o.paymentType.toUpperCase()}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-xs text-txt-secondary">₹{formatExact(o.total)}</td>
                          <td className="py-2 px-3">
                            {o.hasUpsell
                              ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-cash-green font-medium">Yes</span>
                              : <span className="text-[10px] px-1.5 py-0.5 rounded bg-ev-light text-txt-muted">No</span>
                            }
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-xs text-cash-green">
                            {o.upsellRevenue > 0 ? `₹${formatExact(o.upsellRevenue)}` : '--'}
                          </td>
                          <td className="py-2 px-3 text-xs text-txt-muted">
                            {o.items.map((li, i) => (
                              <span key={i} className={`${li.title.toLowerCase().includes('gift') ? 'text-cash-green' : 'text-txt-muted'}`}>
                                {i > 0 ? ' + ' : ''}{li.title.split(' - ')[0]}{li.qty > 1 ? ` x${li.qty}` : ''}
                              </span>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="px-5 py-2 border-t border-brand-300/50/50 text-[10px] text-txt-muted">
                  {u.totalOrders} orders | {u.withUpsellCount} with gift box (shown first) | {u.withoutUpsellCount} without (faded)
                </div>
              </div>
            )
          })()}

          {/* Variant + Order detail when filtered */}
          {productFilter && p.products.length > 0 && (
            <>
              {!p.products[0].hasCampaignCode && rawData?.metaCampaigns?.length > 0 && (
                <div className="glass-card p-3 bg-yellow-50 border-yellow-200 text-sm text-yellow-600 flex items-center gap-2">
                  <AlertTriangle size={14} /> Campaign code missing for {productFilter}. Add it in Product Database.
                </div>
              )}
              <div className="glass-card overflow-hidden">
                <button onClick={() => setShowVariants(!showVariants)} className="w-full px-5 py-3 flex items-center justify-between hover:bg-ev-light border-b border-brand-300/50">
                  <h3 className="text-sm font-semibold text-accent">Variants: {productFilter} ({p.products[0]?.variants.length || 0})</h3>
                  <ChevronDown size={16} className={`text-txt-muted transition-transform ${showVariants ? 'rotate-180' : ''}`} />
                </button>
                {showVariants && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead><tr className="border-b border-brand-300/50 text-[10px] text-txt-muted uppercase tracking-wider">
                        <th className="py-2.5 px-4">Variant</th><th className="py-2.5 px-3 text-right">Vendor ₹</th>
                        <th className="py-2.5 px-3 text-right">Prepaid</th><th className="py-2.5 px-3 text-right">C2P</th>
                        <th className="py-2.5 px-3 text-right">COD</th><th className="py-2.5 px-3 text-right">Total</th>
                        <th className="py-2.5 px-3 text-right">Revenue</th><th className="py-2.5 px-3 text-right">Vendor Cost</th>
                      </tr></thead>
                      <tbody>
                        {p.products[0]?.variants.map(v => (
                          <tr key={v.name} className="border-b border-brand-300/50/50 hover:bg-ev-light">
                            <td className="py-2.5 px-4 text-sm text-txt-secondary">{v.name}</td>
                            <td className="py-2.5 px-3 text-right font-mono text-xs text-txt-muted">₹{v.vendorPrice}</td>
                            <td className="py-2.5 px-3 text-right font-mono text-xs text-txt-secondary">{v.prepaidQty}</td>
                            <td className="py-2.5 px-3 text-right font-mono text-xs text-yellow-600">{v.c2pQty}</td>
                            <td className="py-2.5 px-3 text-right font-mono text-xs text-txt-muted">{v.codQty}</td>
                            <td className="py-2.5 px-3 text-right font-mono text-xs font-bold text-txt-primary">{v.totalQty}</td>
                            <td className="py-2.5 px-3 text-right font-mono text-xs text-txt-secondary">₹{formatExact(v.revenue)}</td>
                            <td className="py-2.5 px-3 text-right font-mono text-xs text-txt-muted">₹{formatExact(v.vendorCost)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <div className="glass-card overflow-hidden">
                <div className="px-5 py-3 border-b border-brand-300/50">
                  <h3 className="text-sm font-semibold text-accent">Orders ({p.orderDetails.length})</h3>
                </div>
                <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                  <table className="w-full text-left">
                    <thead className="sticky top-0 bg-white/95 backdrop-blur">
                      <tr className="border-b border-brand-300/50 text-[10px] text-txt-muted uppercase tracking-wider">
                        <th className="py-2 px-3">Order #</th><th className="py-2 px-3">Payment</th>
                        <th className="py-2 px-3 text-right">Total</th><th className="py-2 px-3">Items</th>
                        <th className="py-2 px-3 text-right">COGS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.orderDetails.map(o => (
                        <tr key={o.id} className="border-b border-brand-300/50/5 hover:bg-ev-light">
                          <td className="py-2 px-3 font-mono text-xs text-txt-primary">#{o.id}</td>
                          <td className="py-2 px-3"><span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${o.paymentType==='prepaid'?'bg-green-50 text-cash-green':o.paymentType==='c2p'?'bg-yellow-900/30 text-yellow-600':'bg-ev-light text-txt-muted'}`}>{o.paymentType.toUpperCase()}</span></td>
                          <td className="py-2 px-3 text-right font-mono text-xs text-txt-secondary">₹{formatExact(o.totalPrice)}</td>
                          <td className="py-2 px-3 text-xs text-txt-muted">{o.lineItems.map((li,i) => <div key={i}>{li.title.split(' - ')[0]} x{li.quantity}</div>)}</td>
                          <td className="py-2 px-3 text-right font-mono text-xs text-txt-muted">₹{formatExact(o.cogs)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {!ready && <div className="glass-card p-8 text-center"><RefreshCw size={24} className="text-txt-muted mx-auto mb-3 animate-spin" /><p className="text-sm text-txt-muted">Loading cached data...</p></div>}

      {ready && !pnl && !loading && <div className="glass-card p-12 text-center">
        <BarChart size={48} className="text-txt-muted mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-accent mb-2">No data yet</h3>
        <p className="text-sm text-txt-muted">Select a date range and hit Fetch Data.</p>
      </div>}
    </div>
  )
}
