import React, { useState, useCallback } from 'react'
import { RefreshCw, Calendar, TrendingUp, TrendingDown, AlertCircle, DollarSign, ShoppingBag, Truck, Megaphone, BarChart, ChevronDown, ChevronRight, CreditCard, Banknote, Smartphone } from 'lucide-react'
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
    <div className="glass-card glass-card-hover p-5 fade-in">
      <p className="text-xs text-brand-400 uppercase tracking-wider font-medium mb-2">{label}</p>
      <p className={`text-2xl font-bold font-mono stat-glow ${color}`}>{value}</p>
      {sub && <p className="text-xs text-brand-400 mt-1.5">{sub}</p>}
    </div>
  )
}

function PnLLine({ label, value, indent, bold, divider }) {
  return (
    <div className={`flex justify-between py-1.5 ${indent ? 'pl-6' : ''} ${bold ? 'border-t border-brand-800/30 pt-2 mt-1' : ''} ${divider ? 'mt-3' : ''}`}>
      <span className={`text-sm ${bold ? 'text-accent font-semibold' : 'text-brand-300'}`}>{label}</span>
      <span className={`font-mono text-sm ${bold ? (value.startsWith('-') ? 'text-cash-red font-bold' : 'text-cash-green font-bold') : 'text-brand-200'}`}>{value}</span>
    </div>
  )
}

function ProductRow({ product, isExpanded, onToggle }) {
  return (
    <>
      <tr onClick={onToggle} className="border-b border-brand-800/10 hover:bg-brand-900/20 transition-colors cursor-pointer">
        <td className="py-3 px-4 flex items-center gap-2">
          {isExpanded ? <ChevronDown size={14} className="text-brand-400" /> : <ChevronRight size={14} className="text-brand-400" />}
          <span className="font-medium text-accent text-sm">{product.name}</span>
        </td>
        <td className="py-3 px-4 text-right font-mono text-xs text-brand-400">₹{product.vendorPriceBase}</td>
        <td className="py-3 px-4 text-right font-mono text-sm text-brand-200">{product.prepaidUnits}</td>
        <td className="py-3 px-4 text-right font-mono text-sm text-brand-200">{product.c2pUnits}</td>
        <td className="py-3 px-4 text-right font-mono text-sm text-brand-200">{product.codUnits}</td>
        <td className="py-3 px-4 text-right font-mono text-sm font-bold text-accent">{product.totalUnits}</td>
        <td className="py-3 px-4 text-right font-mono text-sm text-brand-200">₹{formatExact(product.revenue)}</td>
        <td className="py-3 px-4 text-right font-mono text-sm text-brand-300">₹{formatExact(product.vendorCost)}</td>
      </tr>
      {isExpanded && product.variants.map(v => (
        <tr key={v.name} className="bg-brand-950/30 border-b border-brand-800/5">
          <td className="py-2 px-4 pl-10 text-xs text-brand-400">{v.name}</td>
          <td className="py-2 px-4 text-right font-mono text-xs text-brand-500">₹{v.vendorPrice}</td>
          <td className="py-2 px-4 text-right font-mono text-xs text-brand-400">{v.prepaidQty}</td>
          <td className="py-2 px-4 text-right font-mono text-xs text-brand-400">{v.c2pQty}</td>
          <td className="py-2 px-4 text-right font-mono text-xs text-brand-400">{v.codQty}</td>
          <td className="py-2 px-4 text-right font-mono text-xs text-brand-300">{v.totalQty}</td>
          <td className="py-2 px-4 text-right font-mono text-xs text-brand-400">₹{formatExact(v.revenue)}</td>
          <td className="py-2 px-4 text-right font-mono text-xs text-brand-500">₹{formatExact(v.vendorCost)}</td>
        </tr>
      ))}
    </>
  )
}

export default function Dashboard() {
  const [preset, setPreset] = useState('today')
  const [customRange, setCustomRange] = useState({ since: '', until: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [pnl, setPnl] = useState(null)
  const [apiMeta, setApiMeta] = useState(null)
  const [lastFetch, setLastFetch] = useState(null)
  const [expandedProducts, setExpandedProducts] = useState({})
  const [showPnL, setShowPnL] = useState(true)

  const dateRange = preset === 'custom' ? customRange : getDateRange(preset)

  const toggleProduct = (name) => {
    setExpandedProducts(prev => ({ ...prev, [name]: !prev[name] }))
  }

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const shopify = await fetchShopifyOrders(dateRange.since, dateRange.until)
      setApiMeta(shopify.meta)

      let spend = 0
      try {
        const meta = await fetchMetaSpend(dateRange.since, dateRange.until)
        spend = meta?.summary?.totalSpend || 0
      } catch (e) { console.warn('Meta unavailable:', e.message) }

      const result = calculateFullPnL(shopify.orders, spend)
      setPnl(result)
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

  const p = pnl // shorthand

  return (
    <div className="space-y-5 fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-accent">Profit Dashboard</h2>
          <p className="text-sm text-brand-400 mt-1">
            {dateRange.since === dateRange.until ? dateRange.since : `${dateRange.since} to ${dateRange.until}`}
            {apiMeta && <span className="ml-2 text-brand-600">({apiMeta.rawOrderCount} orders from Shopify)</span>}
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

      {error && (
        <div className="glass-card p-4 border-cash-red/30 bg-red-900/10 flex items-start gap-3">
          <AlertCircle size={18} className="text-cash-red mt-0.5" />
          <div><p className="text-sm text-cash-red font-medium">Error</p><p className="text-xs text-brand-400 mt-1">{error}</p></div>
        </div>
      )}

      {p && (
        <>
          {/* Top Row: Key Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Stat label="Orders" value={p.overview.activeOrders}
              sub={`${p.overview.cancelledOrders > 0 ? p.overview.cancelledOrders + ' cancelled | ' : ''}Total: ${p.overview.totalOrders}`} />
            <Stat label="Prepaid" value={p.overview.prepaidOrders}
              sub={`${formatPercent(p.overview.prepaidRate)} rate`} color="text-cash-green" />
            <Stat label="C2P (PPCOD)" value={p.overview.c2pOrders}
              sub={`₹150 x ${p.overview.c2pOrders} = ₹${formatExact(p.overview.c2pOrders * 150)}`} color="text-yellow-400" />
            <Stat label="COD" value={p.overview.codOrders}
              sub={`50% delivery assumed`} color="text-brand-300" />
            <Stat label="AOV" value={`₹${formatExact(p.metrics.aov)}`}
              sub={`CPP: ₹${formatINR(p.metrics.cpp)}`} />
          </div>

          {/* Revenue + Profit Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label="Expected Revenue" value={`₹${formatExact(p.revenue.expectedRevenue)}`}
              sub={`Cashfree: ₹${formatExact(p.revenue.cashfreeCollection)}`} />
            <Stat label="Meta Spend" value={`₹${formatExact(p.expenses.metaAds)}`}
              sub={`${formatPercent(p.metrics.adSpendRatio)} of expected rev`}
              color={p.metrics.adSpendRatio > 0.55 ? 'text-cash-red' : 'text-brand-300'} />
            <Stat label="Expected Profit" value={`₹${formatExact(p.profit.expected)}`}
              sub={`${formatPercent(p.profit.margin)} margin | ₹${Math.round(p.profit.perOrder)}/order`}
              color={p.profit.expected >= 0 ? 'text-cash-green' : 'text-cash-red'} />
            <Stat label="Total COGS" value={`₹${formatExact(p.expenses.cogs)}`}
              sub={`Logistics: ₹${formatExact(p.expenses.logistics)} | Fees: ₹${formatExact(p.expenses.totalFees)}`} />
          </div>

          {/* P&L Breakdown */}
          <div className="glass-card overflow-hidden">
            <button onClick={() => setShowPnL(!showPnL)}
              className="w-full px-5 py-4 flex items-center justify-between border-b border-brand-800/20 hover:bg-brand-900/20 transition-colors">
              <h3 className="text-sm font-semibold text-accent">P&L Statement (Expected)</h3>
              <ChevronDown size={16} className={`text-brand-400 transition-transform ${showPnL ? 'rotate-180' : ''}`} />
            </button>
            {showPnL && (
              <div className="px-5 py-3">
                <div className="text-xs text-brand-500 uppercase tracking-wider mb-2">Income</div>
                <PnLLine label="Cashfree (Prepaid collections)" value={`₹${formatExact(p.revenue.prepaidRevenue)}`} indent />
                <PnLLine label={`C2P upfront (${p.overview.c2pOrders} orders x ₹150)`} value={`₹${formatExact(p.overview.c2pOrders * 150)}`} indent />
                <PnLLine label={`C2P COD portion (expected @ 50%)`} value={`₹${formatExact(p.revenue.c2pExpected - p.overview.c2pOrders * 150)}`} indent />
                <PnLLine label={`COD revenue (expected @ 50%)`} value={`₹${formatExact(p.revenue.codExpected)}`} indent />
                <PnLLine label="Total Expected Revenue" value={`₹${formatExact(p.revenue.expectedRevenue)}`} bold />

                <div className="text-xs text-brand-500 uppercase tracking-wider mt-4 mb-2">Expenses</div>
                <PnLLine label="Meta Ads" value={`-₹${formatExact(p.expenses.metaAds)}`} indent />
                <PnLLine label="COGS (Vendor Cost)" value={`-₹${formatExact(p.expenses.cogs)}`} indent />
                <PnLLine label="Boxes" value={`-₹${formatExact(p.expenses.boxes)}`} indent />
                <PnLLine label="Warranty Card" value={`-₹${formatExact(p.expenses.warrantyCard)}`} indent />
                <PnLLine label="Free Ring" value={`-₹${formatExact(p.expenses.freeRing)}`} indent />
                <PnLLine label="Packing Bags" value={`-₹${formatExact(p.expenses.packingBags)}`} indent />
                <PnLLine label="Shipping" value={`-₹${formatExact(p.expenses.shipping)}`} indent />
                <PnLLine label="Cashfree Fees (1.34%)" value={`-₹${formatExact(p.expenses.cashfree)}`} indent />
                <PnLLine label="Engage" value={`-₹${formatExact(p.expenses.engage)}`} indent />
                <PnLLine label="Checkout (Fastrr)" value={`-₹${formatExact(p.expenses.checkout)}`} indent />
                <PnLLine label="Total Expenses" value={`-₹${formatExact(p.expenses.total)}`} bold />

                <div className="mt-3" />
                <PnLLine label="EXPECTED PROFIT" value={`${p.profit.expected >= 0 ? '' : '-'}₹${formatExact(Math.abs(p.profit.expected))}`} bold />
                <PnLLine label="Profit %" value={formatPercent(p.profit.margin)} />
                <PnLLine label="Per Order Profit" value={`₹${Math.round(p.profit.perOrder)}`} />
              </div>
            )}
          </div>

          {/* Product Breakdown */}
          <div className="glass-card overflow-hidden">
            <div className="px-5 py-4 border-b border-brand-800/20">
              <h3 className="text-sm font-semibold text-accent">Product Breakdown ({p.products.length} products) -- click to expand</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-brand-800/30 text-xs text-brand-400 uppercase tracking-wider">
                    <th className="py-3 px-4">Product</th>
                    <th className="py-3 px-4 text-right">Vendor ₹</th>
                    <th className="py-3 px-4 text-right">Prepaid</th>
                    <th className="py-3 px-4 text-right">C2P</th>
                    <th className="py-3 px-4 text-right">COD</th>
                    <th className="py-3 px-4 text-right">Total</th>
                    <th className="py-3 px-4 text-right">Revenue</th>
                    <th className="py-3 px-4 text-right">Vendor Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {p.products.map(prod => (
                    <ProductRow key={prod.name} product={prod}
                      isExpanded={!!expandedProducts[prod.name]}
                      onToggle={() => toggleProduct(prod.name)} />
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-brand-700/50 bg-brand-950/40">
                    <td className="py-3 px-4 font-bold text-accent text-sm">TOTAL</td>
                    <td></td>
                    <td className="py-3 px-4 text-right font-mono text-sm font-bold text-brand-200">{p.products.reduce((s, pr) => s + pr.prepaidUnits, 0)}</td>
                    <td className="py-3 px-4 text-right font-mono text-sm font-bold text-yellow-400">{p.products.reduce((s, pr) => s + pr.c2pUnits, 0)}</td>
                    <td className="py-3 px-4 text-right font-mono text-sm font-bold text-brand-300">{p.products.reduce((s, pr) => s + pr.codUnits, 0)}</td>
                    <td className="py-3 px-4 text-right font-mono text-sm font-bold text-accent">{p.products.reduce((s, pr) => s + pr.totalUnits, 0)}</td>
                    <td className="py-3 px-4 text-right font-mono text-sm font-bold text-accent">₹{formatExact(p.products.reduce((s, pr) => s + pr.revenue, 0))}</td>
                    <td className="py-3 px-4 text-right font-mono text-sm font-bold text-brand-300">₹{formatExact(p.products.reduce((s, pr) => s + pr.vendorCost, 0))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Empty State */}
      {!pnl && !loading && (
        <div className="glass-card p-12 text-center">
          <BarChart size={48} className="text-brand-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-accent mb-2">No data yet</h3>
          <p className="text-sm text-brand-400 max-w-md mx-auto">Select a date range and hit Fetch Data. All vendor prices are pre-loaded.</p>
        </div>
      )}
    </div>
  )
}
