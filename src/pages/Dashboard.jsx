import React, { useState, useCallback, useMemo, useEffect } from 'react'
import { RefreshCw, Calendar, TrendingUp, TrendingDown, AlertCircle, DollarSign, ShoppingBag, BarChart, ChevronDown, ChevronRight, X, Filter } from 'lucide-react'
import { fetchShopifyOrders, fetchMetaSpend } from '../lib/api'
import { calculateFullPnL, formatINR, formatPercent, formatExact } from '../lib/profitEngine'

function getDateRange(preset) {
  const today = new Date()
  const fmt = (d) => d.toISOString().split('T')[0]
  switch (preset) {
    case 'today': return { since: fmt(today), until: fmt(today) }
    case 'yesterday': { const y = new Date(today); y.setDate(y.getDate() - 1); return { since: fmt(y), until: fmt(y) } }
    case '7d': { const d = new Date(today); d.setDate(d.getDate() - 6); return { since: fmt(d), until: fmt(today) } }
    case '30d': { const d = new Date(today); d.setDate(d.getDate() - 29); return { since: fmt(d), until: fmt(today) } }
    case 'mtd': { const d = new Date(today.getFullYear(), today.getMonth(), 1); return { since: fmt(d), until: fmt(today) } }
    default: return { since: fmt(today), until: fmt(today) }
  }
}

function Stat({ label, value, sub, color = 'text-accent' }) {
  return (
    <div className="glass-card glass-card-hover p-4 fade-in">
      <p className="text-[10px] text-brand-400 uppercase tracking-wider font-medium mb-1.5">{label}</p>
      <p className={`text-xl font-bold font-mono stat-glow ${color}`}>{value}</p>
      {sub && <p className="text-[11px] text-brand-400 mt-1">{sub}</p>}
    </div>
  )
}

function PnLLine({ label, value, indent, bold }) {
  return (
    <div className={`flex justify-between py-1.5 ${indent ? 'pl-6' : ''} ${bold ? 'border-t border-brand-800/30 pt-2 mt-1' : ''}`}>
      <span className={`text-sm ${bold ? 'text-accent font-semibold' : 'text-brand-300'}`}>{label}</span>
      <span className={`font-mono text-sm ${bold ? (parseFloat(value.replace(/[^\d.-]/g,'')) < 0 ? 'text-cash-red' : 'text-cash-green') + ' font-bold' : 'text-brand-200'}`}>{value}</span>
    </div>
  )
}

export default function Dashboard() {
  const [preset, setPreset] = useState('today')
  const [customRange, setCustomRange] = useState({ since: '', until: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [rawData, setRawData] = useState(null)
  const [lastFetch, setLastFetch] = useState(null)
  const [productFilter, setProductFilter] = useState(null)
  const [showPnL, setShowPnL] = useState(false)
  const [expandedProducts, setExpandedProducts] = useState({})

  // Load cached data on mount
  useEffect(() => {
    try {
      const cached = localStorage.getItem('everlasting_dashboard')
      if (cached) {
        const parsed = JSON.parse(cached)
        if (parsed.rawData) setRawData(parsed.rawData)
        if (parsed.lastFetch) setLastFetch(new Date(parsed.lastFetch))
        if (parsed.preset) setPreset(parsed.preset)
      }
    } catch (e) { console.warn('Cache load failed:', e) }
  }, [])

  // Save to cache whenever rawData changes
  useEffect(() => {
    if (rawData) {
      try {
        localStorage.setItem('everlasting_dashboard', JSON.stringify({
          rawData, lastFetch: lastFetch?.toISOString(), preset,
        }))
      } catch (e) { console.warn('Cache save failed:', e) }
    }
  }, [rawData, lastFetch, preset])

  const dateRange = preset === 'custom' ? customRange : getDateRange(preset)

  // Recalculate P&L whenever filter changes
  const pnl = useMemo(() => {
    if (!rawData) return null
    return calculateFullPnL(rawData.orders, rawData.metaSpend, {}, productFilter)
  }, [rawData, productFilter])

  // All products P&L (for the product table - always unfiltered)
  const allPnl = useMemo(() => {
    if (!rawData) return null
    return calculateFullPnL(rawData.orders, rawData.metaSpend)
  }, [rawData])

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    setProductFilter(null)
    try {
      const shopify = await fetchShopifyOrders(dateRange.since, dateRange.until)
      let spend = 0
      try {
        const meta = await fetchMetaSpend(dateRange.since, dateRange.until)
        spend = meta?.summary?.totalSpend || 0
      } catch (e) { console.warn('Meta unavailable:', e.message) }

      setRawData({ orders: shopify.orders, metaSpend: spend, apiMeta: shopify.meta })
      setLastFetch(new Date())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [dateRange.since, dateRange.until])

  const presets = [
    { key: 'today', label: 'Today' },
    { key: 'yesterday', label: 'Yesterday' },
    { key: '7d', label: '7 Days' },
    { key: '30d', label: '30 Days' },
    { key: 'mtd', label: 'MTD' },
    { key: 'custom', label: 'Custom' },
  ]

  const p = pnl
  const ap = allPnl

  return (
    <div className="space-y-4 fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-accent">
            {productFilter ? productFilter : 'Profit Dashboard'}
          </h2>
          <p className="text-sm text-brand-400 mt-0.5">
            {dateRange.since === dateRange.until ? dateRange.since : `${dateRange.since} to ${dateRange.until}`}
            {rawData?.apiMeta && <span className="text-brand-600 ml-2">({rawData.apiMeta.rawOrderCount} from Shopify)</span>}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastFetch && <div className="flex items-center gap-2 text-xs text-brand-500"><div className="pulse-dot" />{lastFetch.toLocaleTimeString('en-IN')}</div>}
          <button onClick={fetchData} disabled={loading} className="btn-primary flex items-center gap-2">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Fetching...' : 'Fetch Data'}
          </button>
        </div>
      </div>

      {/* Date Range */}
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
            <input type="date" value={customRange.since} onChange={e => setCustomRange(c => ({ ...c, since: e.target.value }))} className="input-field !w-40 !py-1.5 !text-xs" />
            <input type="date" value={customRange.until} onChange={e => setCustomRange(c => ({ ...c, until: e.target.value }))} className="input-field !w-40 !py-1.5 !text-xs" />
          </div>
        )}
      </div>

      {/* Product Filter Bar */}
      {ap && (
        <div className="glass-card p-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Filter size={14} className="text-brand-400" />
            <button onClick={() => setProductFilter(null)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${!productFilter ? 'bg-brand-600 text-white' : 'text-brand-400 hover:text-accent hover:bg-brand-800/40 border border-brand-800/20'}`}>
              All Products
            </button>
            {ap.allFamilies.map(f => (
              <button key={f} onClick={() => setProductFilter(productFilter === f ? null : f)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${productFilter === f ? 'bg-brand-600 text-white' : 'text-brand-400 hover:text-accent hover:bg-brand-800/40 border border-brand-800/20'}`}>
                {f}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Active Filter Banner */}
      {productFilter && (
        <div className="glass-card p-3 flex items-center justify-between bg-brand-800/20 border-brand-500/20">
          <span className="text-sm text-accent font-medium">Showing: {productFilter}</span>
          <button onClick={() => setProductFilter(null)} className="flex items-center gap-1 text-xs text-brand-400 hover:text-accent">
            <X size={12} /> Clear filter
          </button>
        </div>
      )}

      {error && (
        <div className="glass-card p-4 border-cash-red/30 bg-red-900/10 flex items-start gap-3">
          <AlertCircle size={18} className="text-cash-red mt-0.5" />
          <div><p className="text-sm text-cash-red font-medium">Error</p><p className="text-xs text-brand-400 mt-1">{error}</p></div>
        </div>
      )}

      {p && (
        <>
          {/* Key Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Stat label="Orders" value={p.overview.activeOrders}
              sub={`Cancelled: ${p.overview.cancelledOrders}`} />
            <Stat label="Prepaid" value={p.overview.prepaidOrders}
              sub={formatPercent(p.overview.prepaidRate)} color="text-cash-green" />
            <Stat label="C2P (PPCOD)" value={p.overview.c2pOrders}
              sub={`₹150 x ${p.overview.c2pOrders} upfront`} color="text-yellow-400" />
            <Stat label="COD" value={p.overview.codOrders}
              sub="50% delivery assumed" color="text-brand-300" />
            <Stat label="AOV" value={`₹${formatExact(p.metrics.aov)}`}
              sub={`CPP: ₹${formatINR(p.metrics.cpp)}`} />
          </div>

          {/* Revenue + Profit */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Expected Revenue" value={`₹${formatExact(p.revenue.expectedRevenue)}`}
              sub={`Cashfree: ₹${formatExact(p.revenue.cashfreeCollection)}`} />
            <Stat label="Meta Spend" value={`₹${formatExact(p.expenses.metaAds)}`}
              sub={`${formatPercent(p.metrics.adSpendRatio)} of rev`}
              color={p.metrics.adSpendRatio > 0.55 ? 'text-cash-red' : 'text-brand-300'} />
            <Stat label="Expected Profit" value={`₹${formatExact(p.profit.expected)}`}
              sub={`${formatPercent(p.profit.margin)} margin | ₹${Math.round(p.profit.perOrder)}/order`}
              color={p.profit.expected >= 0 ? 'text-cash-green' : 'text-cash-red'} />
            <Stat label="COGS + Logistics + Fees" value={`₹${formatExact(p.expenses.cogs + p.expenses.logistics + p.expenses.totalFees)}`}
              sub={`COGS: ₹${formatExact(p.expenses.cogs)} | Ship: ₹${formatExact(p.expenses.shipping)}`} />
          </div>

          {/* P&L Breakdown */}
          <div className="glass-card overflow-hidden">
            <button onClick={() => setShowPnL(!showPnL)}
              className="w-full px-5 py-3 flex items-center justify-between hover:bg-brand-900/20 transition-colors">
              <h3 className="text-sm font-semibold text-accent">P&L Statement</h3>
              <ChevronDown size={16} className={`text-brand-400 transition-transform ${showPnL ? 'rotate-180' : ''}`} />
            </button>
            {showPnL && (
              <div className="px-5 py-3 border-t border-brand-800/20">
                <div className="text-[10px] text-brand-500 uppercase tracking-wider mb-1">Income</div>
                <PnLLine label="Prepaid (Cashfree)" value={`₹${formatExact(p.revenue.prepaidRevenue)}`} indent />
                <PnLLine label={`C2P upfront (${p.overview.c2pOrders} x ₹150)`} value={`₹${formatExact(p.overview.c2pOrders * 150)}`} indent />
                <PnLLine label="C2P COD portion (50%)" value={`₹${formatExact(p.revenue.c2pExpected - p.overview.c2pOrders * 150)}`} indent />
                <PnLLine label="COD revenue (50%)" value={`₹${formatExact(p.revenue.codExpected)}`} indent />
                <PnLLine label="Expected Revenue" value={`₹${formatExact(p.revenue.expectedRevenue)}`} bold />

                <div className="text-[10px] text-brand-500 uppercase tracking-wider mt-3 mb-1">Expenses</div>
                <PnLLine label="Meta Ads" value={`-₹${formatExact(p.expenses.metaAds)}`} indent />
                <PnLLine label="COGS (Vendor)" value={`-₹${formatExact(p.expenses.cogs)}`} indent />
                <PnLLine label="Boxes" value={`-₹${formatExact(p.expenses.boxes)}`} indent />
                <PnLLine label="Warranty Card" value={`-₹${formatExact(p.expenses.warrantyCard)}`} indent />
                <PnLLine label="Free Ring" value={`-₹${formatExact(p.expenses.freeRing)}`} indent />
                <PnLLine label="Packing Bags" value={`-₹${formatExact(p.expenses.packingBags)}`} indent />
                <PnLLine label="Shipping" value={`-₹${formatExact(p.expenses.shipping)}`} indent />
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

          {/* Product Table (always shows all products, click to filter) */}
          {!productFilter && ap && (
            <div className="glass-card overflow-hidden">
              <div className="px-5 py-3 border-b border-brand-800/20">
                <h3 className="text-sm font-semibold text-accent">Product Breakdown -- click a product to drill in</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-brand-800/30 text-[10px] text-brand-400 uppercase tracking-wider">
                      <th className="py-2.5 px-4">Product</th>
                      <th className="py-2.5 px-3 text-right">Prepaid</th>
                      <th className="py-2.5 px-3 text-right">C2P</th>
                      <th className="py-2.5 px-3 text-right">COD</th>
                      <th className="py-2.5 px-3 text-right">Total</th>
                      <th className="py-2.5 px-3 text-right">Revenue</th>
                      <th className="py-2.5 px-3 text-right">COGS</th>
                      <th className="py-2.5 px-3 text-right">Exp. Profit</th>
                      <th className="py-2.5 px-3 text-right">Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ap.products.map(prod => (
                      <tr key={prod.name} onClick={() => setProductFilter(prod.name)}
                        className="border-b border-brand-800/10 hover:bg-brand-700/20 transition-colors cursor-pointer group">
                        <td className="py-2.5 px-4 text-sm text-accent font-medium group-hover:text-white flex items-center gap-1.5">
                          <ChevronRight size={12} className="text-brand-500 group-hover:text-accent" />
                          {prod.name}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-xs text-brand-200">{prod.prepaidUnits}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-xs text-yellow-400">{prod.c2pUnits}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-xs text-brand-300">{prod.codUnits}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-xs font-bold text-accent">{prod.totalUnits}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-xs text-brand-200">₹{formatExact(prod.revenue)}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-xs text-brand-300">₹{formatExact(prod.vendorCost)}</td>
                        <td className={`py-2.5 px-3 text-right font-mono text-xs font-bold ${prod.profit >= 0 ? 'text-cash-green' : 'text-cash-red'}`}>
                          ₹{formatExact(prod.profit)}
                        </td>
                        <td className={`py-2.5 px-3 text-right font-mono text-xs ${prod.margin >= 0.2 ? 'text-cash-green' : prod.margin >= 0 ? 'text-yellow-400' : 'text-cash-red'}`}>
                          {formatPercent(prod.margin)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-brand-700/50 bg-brand-950/40">
                      <td className="py-2.5 px-4 font-bold text-accent text-sm">TOTAL</td>
                      <td className="py-2.5 px-3 text-right font-mono text-xs font-bold">{ap.products.reduce((s, p) => s + p.prepaidUnits, 0)}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-xs font-bold text-yellow-400">{ap.products.reduce((s, p) => s + p.c2pUnits, 0)}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-xs font-bold">{ap.products.reduce((s, p) => s + p.codUnits, 0)}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-xs font-bold text-accent">{ap.products.reduce((s, p) => s + p.totalUnits, 0)}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-xs font-bold text-accent">₹{formatExact(ap.products.reduce((s, p) => s + p.revenue, 0))}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-xs font-bold">₹{formatExact(ap.products.reduce((s, p) => s + p.vendorCost, 0))}</td>
                      <td className={`py-2.5 px-3 text-right font-mono text-xs font-bold ${ap.profit.expected >= 0 ? 'text-cash-green' : 'text-cash-red'}`}>
                        ₹{formatExact(ap.profit.expected)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-xs font-bold">{formatPercent(ap.profit.margin)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Variant Detail (when product is filtered) */}
          {productFilter && p.products.length > 0 && (
            <div className="glass-card overflow-hidden">
              <div className="px-5 py-3 border-b border-brand-800/20">
                <h3 className="text-sm font-semibold text-accent">Variant Breakdown: {productFilter}</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-brand-800/30 text-[10px] text-brand-400 uppercase tracking-wider">
                      <th className="py-2.5 px-4">Variant</th>
                      <th className="py-2.5 px-3 text-right">Vendor ₹</th>
                      <th className="py-2.5 px-3 text-right">Prepaid</th>
                      <th className="py-2.5 px-3 text-right">C2P</th>
                      <th className="py-2.5 px-3 text-right">COD</th>
                      <th className="py-2.5 px-3 text-right">Total</th>
                      <th className="py-2.5 px-3 text-right">Revenue</th>
                      <th className="py-2.5 px-3 text-right">Vendor Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.products[0]?.variants.map(v => (
                      <tr key={v.name} className="border-b border-brand-800/10 hover:bg-brand-900/20">
                        <td className="py-2.5 px-4 text-sm text-brand-200">{v.name}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-xs text-brand-400">₹{v.vendorPrice}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-xs text-brand-200">{v.prepaidQty}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-xs text-yellow-400">{v.c2pQty}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-xs text-brand-300">{v.codQty}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-xs font-bold text-accent">{v.totalQty}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-xs text-brand-200">₹{formatExact(v.revenue)}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-xs text-brand-300">₹{formatExact(v.vendorCost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Order List (when product is filtered) */}
          {productFilter && p.orderDetails.length > 0 && (
            <div className="glass-card overflow-hidden">
              <div className="px-5 py-3 border-b border-brand-800/20">
                <h3 className="text-sm font-semibold text-accent">Orders containing {productFilter} ({p.orderDetails.length})</h3>
              </div>
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                <table className="w-full text-left">
                  <thead className="sticky top-0 bg-brand-900/95 backdrop-blur">
                    <tr className="border-b border-brand-800/30 text-[10px] text-brand-400 uppercase tracking-wider">
                      <th className="py-2 px-3">Order #</th>
                      <th className="py-2 px-3">Payment</th>
                      <th className="py-2 px-3 text-right">Total</th>
                      <th className="py-2 px-3">Items</th>
                      <th className="py-2 px-3 text-right">COGS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.orderDetails.map(o => (
                      <tr key={o.id} className="border-b border-brand-800/5 hover:bg-brand-900/20">
                        <td className="py-2 px-3 font-mono text-xs text-accent">#{o.id}</td>
                        <td className="py-2 px-3">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${
                            o.paymentType === 'prepaid' ? 'bg-green-900/30 text-cash-green' :
                            o.paymentType === 'c2p' ? 'bg-yellow-900/30 text-yellow-400' :
                            'bg-brand-800/30 text-brand-300'
                          }`}>{o.paymentType.toUpperCase()}</span>
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-xs text-brand-200">₹{formatExact(o.totalPrice)}</td>
                        <td className="py-2 px-3 text-xs text-brand-300">
                          {o.lineItems.map((li, i) => (
                            <div key={i}>{li.title.split(' - ')[0]} {li.variantTitle ? `(${li.variantTitle})` : ''} x{li.quantity}</div>
                          ))}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-xs text-brand-400">₹{formatExact(o.cogs)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {!pnl && !loading && (
        <div className="glass-card p-12 text-center">
          <BarChart size={48} className="text-brand-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-accent mb-2">No data yet</h3>
          <p className="text-sm text-brand-400">Select a date range and hit Fetch Data.</p>
        </div>
      )}
    </div>
  )
}
