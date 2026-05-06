import React, { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Calendar, TrendingUp, TrendingDown, AlertCircle, DollarSign, ShoppingBag, Truck, Megaphone, BarChart, ChevronDown, ChevronUp } from 'lucide-react'
import { fetchShopifyOrders, fetchMetaSpend } from '../lib/api'
import { calculateFullPnL, formatINR, formatPercent } from '../lib/profitEngine'

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

function StatCard({ label, value, sub, icon: Icon, color = 'default' }) {
  const colorMap = { default: 'text-accent', green: 'text-cash-green', red: 'text-cash-red', muted: 'text-brand-300' }
  return (
    <div className="glass-card glass-card-hover p-5 fade-in">
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs text-brand-400 uppercase tracking-wider font-medium">{label}</span>
        {Icon && <Icon size={16} className="text-brand-500" />}
      </div>
      <p className={`text-2xl font-bold font-mono stat-glow ${colorMap[color]}`}>{value}</p>
      {sub && <p className="text-xs text-brand-400 mt-1.5">{sub}</p>}
    </div>
  )
}

function PnLRow({ label, expected, actual, indent = false, bold = false, negative = false }) {
  const cls = bold ? 'font-bold' : ''
  const sign = negative ? '-' : ''
  return (
    <div className={`flex items-center justify-between py-2 ${indent ? 'pl-6' : ''} ${bold ? 'border-t border-brand-800/30 pt-3' : ''}`}>
      <span className={`text-sm ${bold ? 'text-accent' : 'text-brand-300'} ${cls}`}>{label}</span>
      <div className="flex gap-8">
        <span className={`font-mono text-sm ${cls} ${bold && expected > 0 ? 'text-cash-green' : bold && expected < 0 ? 'text-cash-red' : 'text-brand-200'}`}>
          {sign}{formatINR(Math.abs(expected))}
        </span>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [preset, setPreset] = useState('today')
  const [customRange, setCustomRange] = useState({ since: '', until: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [pnl, setPnl] = useState(null)
  const [metaSpend, setMetaSpend] = useState(0)
  const [lastFetch, setLastFetch] = useState(null)
  const [showPnL, setShowPnL] = useState(true)
  const [showProducts, setShowProducts] = useState(true)

  const dateRange = preset === 'custom' ? customRange : getDateRange(preset)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const shopify = await fetchShopifyOrders(dateRange.since, dateRange.until)

      let meta = null
      let spend = 0
      try {
        meta = await fetchMetaSpend(dateRange.since, dateRange.until)
        spend = meta?.summary?.totalSpend || 0
      } catch (e) { console.warn('Meta unavailable:', e.message) }

      setMetaSpend(spend)
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

  return (
    <div className="space-y-6 fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-accent">Profit Dashboard</h2>
          <p className="text-sm text-brand-400 mt-1">
            {dateRange.since === dateRange.until ? dateRange.since : `${dateRange.since} to ${dateRange.until}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastFetch && (
            <div className="flex items-center gap-2 text-xs text-brand-500">
              <div className="pulse-dot" />
              {lastFetch.toLocaleTimeString('en-IN')}
            </div>
          )}
          <button onClick={fetchData} disabled={loading} className="btn-primary flex items-center gap-2">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Fetching...' : 'Fetch Data'}
          </button>
        </div>
      </div>

      {/* Date Range */}
      <div className="glass-card p-4 flex items-center gap-2 flex-wrap">
        <Calendar size={16} className="text-brand-400" />
        {presets.map(p => (
          <button key={p.key} onClick={() => setPreset(p.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${preset === p.key ? 'bg-brand-700 text-accent border border-brand-500/30' : 'text-brand-400 hover:text-accent hover:bg-brand-800/40'}`}>
            {p.label}
          </button>
        ))}
        {preset === 'custom' && (
          <div className="flex gap-2 ml-2">
            <input type="date" value={customRange.since} onChange={e => setCustomRange(p => ({ ...p, since: e.target.value }))} className="input-field !w-40 !py-1.5 !text-xs" />
            <input type="date" value={customRange.until} onChange={e => setCustomRange(p => ({ ...p, until: e.target.value }))} className="input-field !w-40 !py-1.5 !text-xs" />
          </div>
        )}
      </div>

      {error && (
        <div className="glass-card p-4 border-cash-red/30 flex items-start gap-3 bg-red-900/10">
          <AlertCircle size={18} className="text-cash-red mt-0.5" />
          <div>
            <p className="text-sm font-medium text-cash-red">Error</p>
            <p className="text-xs text-brand-400 mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Top Stats */}
      {pnl && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Expected Revenue" value={`₹${formatINR(pnl.revenue.expectedRevenue)}`}
              sub={`Total: ₹${formatINR(pnl.revenue.totalRevenue)} | Prepaid: ₹${formatINR(pnl.revenue.prepaidRevenue)}`}
              icon={DollarSign} />
            <StatCard label="Meta Ad Spend" value={`₹${formatINR(pnl.expenses.metaAds)}`}
              sub={`CPP: ₹${formatINR(pnl.metrics.cpp)} | ${formatPercent(pnl.metrics.adSpendRatio)} of rev`}
              icon={Megaphone} color={pnl.metrics.adSpendRatio > 0.5 ? 'red' : 'muted'} />
            <StatCard label="Expected Profit" value={`₹${formatINR(pnl.profit.expected)}`}
              sub={`${formatPercent(pnl.profit.margin)} margin | ₹${formatINR(pnl.profit.perOrder)}/order`}
              icon={pnl.profit.expected >= 0 ? TrendingUp : TrendingDown}
              color={pnl.profit.expected >= 0 ? 'green' : 'red'} />
            <StatCard label="Orders" value={pnl.overview.activeOrders}
              sub={`Prepaid: ${pnl.overview.prepaidOrders} (${formatPercent(pnl.overview.prepaidRate)}) | COD: ${pnl.overview.codOrders}`}
              icon={ShoppingBag} color="muted" />
          </div>

          {/* P&L Breakdown */}
          <div className="glass-card overflow-hidden">
            <button onClick={() => setShowPnL(!showPnL)}
              className="w-full px-5 py-4 flex items-center justify-between border-b border-brand-800/20 hover:bg-brand-900/20 transition-colors">
              <h3 className="text-sm font-semibold text-accent">P&L Breakdown (Expected)</h3>
              {showPnL ? <ChevronUp size={16} className="text-brand-400" /> : <ChevronDown size={16} className="text-brand-400" />}
            </button>
            {showPnL && (
              <div className="px-5 py-3">
                <PnLRow label="Prepaid Revenue (Cashfree)" expected={pnl.revenue.prepaidRevenue} />
                <PnLRow label="COD Revenue (Expected @ 50% delivery)" expected={pnl.revenue.codRevenue * 0.5} />
                <PnLRow label="Total Expected Revenue" expected={pnl.revenue.expectedRevenue} bold />

                <div className="mt-4 mb-2">
                  <span className="text-xs text-brand-500 uppercase tracking-wider">Expenses</span>
                </div>
                <PnLRow label="Meta Ads" expected={pnl.expenses.metaAds} indent negative />
                <PnLRow label="COGS (Vendor Cost)" expected={pnl.expenses.cogs} indent negative />
                <PnLRow label="Boxes" expected={pnl.expenses.boxes} indent negative />
                <PnLRow label="Warranty Card" expected={pnl.expenses.warrantyCard} indent negative />
                <PnLRow label="Free Ring" expected={pnl.expenses.freeRing} indent negative />
                <PnLRow label="Packing Bags" expected={pnl.expenses.packingBags} indent negative />
                <PnLRow label="Shipping" expected={pnl.expenses.shipping} indent negative />
                <PnLRow label="Cashfree Fees" expected={pnl.expenses.cashfree} indent negative />
                <PnLRow label="Engage" expected={pnl.expenses.engage} indent negative />
                <PnLRow label="Checkout (Fastrr)" expected={pnl.expenses.checkout} indent negative />
                <PnLRow label="Total Expenses" expected={pnl.expenses.total} bold negative />

                <div className="mt-2" />
                <PnLRow label="Expected Profit" expected={pnl.profit.expected} bold />
                <PnLRow label="Profit Margin" expected={0} />
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-brand-300">Profit %</span>
                  <span className={`font-mono text-sm font-bold ${pnl.profit.margin >= 0.2 ? 'text-cash-green' : pnl.profit.margin >= 0.1 ? 'text-yellow-400' : 'text-cash-red'}`}>
                    {formatPercent(pnl.profit.margin)}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Product Breakdown */}
          <div className="glass-card overflow-hidden">
            <button onClick={() => setShowProducts(!showProducts)}
              className="w-full px-5 py-4 flex items-center justify-between border-b border-brand-800/20 hover:bg-brand-900/20 transition-colors">
              <h3 className="text-sm font-semibold text-accent">Product Breakdown ({pnl.products.length} products)</h3>
              {showProducts ? <ChevronUp size={16} className="text-brand-400" /> : <ChevronDown size={16} className="text-brand-400" />}
            </button>
            {showProducts && (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-brand-800/30 text-xs text-brand-400 uppercase tracking-wider">
                      <th className="py-3 px-4">Product</th>
                      <th className="py-3 px-4 text-right">Vendor ₹</th>
                      <th className="py-3 px-4 text-right">Prepaid</th>
                      <th className="py-3 px-4 text-right">COD</th>
                      <th className="py-3 px-4 text-right">Total Units</th>
                      <th className="py-3 px-4 text-right">Revenue</th>
                      <th className="py-3 px-4 text-right">Vendor Cost</th>
                      <th className="py-3 px-4 text-right">Expected Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pnl.products.map(p => (
                      <tr key={p.name} className="border-b border-brand-800/10 hover:bg-brand-900/20 transition-colors">
                        <td className="py-3 px-4 font-medium text-accent text-sm">{p.name}</td>
                        <td className="py-3 px-4 text-right font-mono text-sm text-brand-300">₹{p.vendorPrice}</td>
                        <td className="py-3 px-4 text-right font-mono text-sm text-brand-200">{p.prepaidQty}</td>
                        <td className="py-3 px-4 text-right font-mono text-sm text-brand-200">{p.codQty}</td>
                        <td className="py-3 px-4 text-right font-mono text-sm text-brand-200 font-bold">{p.totalQty}</td>
                        <td className="py-3 px-4 text-right font-mono text-sm text-brand-200">₹{formatINR(p.totalRevenue)}</td>
                        <td className="py-3 px-4 text-right font-mono text-sm text-brand-300">₹{formatINR(p.totalVendorCost)}</td>
                        <td className="py-3 px-4 text-right font-mono text-sm text-brand-300">₹{formatINR(p.expectedRate)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-brand-700/30 bg-brand-950/30">
                      <td className="py-3 px-4 font-bold text-accent text-sm">TOTAL</td>
                      <td className="py-3 px-4"></td>
                      <td className="py-3 px-4 text-right font-mono text-sm font-bold text-brand-200">
                        {pnl.products.reduce((s, p) => s + p.prepaidQty, 0)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-sm font-bold text-brand-200">
                        {pnl.products.reduce((s, p) => s + p.codQty, 0)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-sm font-bold text-brand-200">
                        {pnl.products.reduce((s, p) => s + p.totalQty, 0)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-sm font-bold text-accent">
                        ₹{formatINR(pnl.products.reduce((s, p) => s + p.totalRevenue, 0))}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-sm font-bold text-brand-300">
                        ₹{formatINR(pnl.products.reduce((s, p) => s + p.totalVendorCost, 0))}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-sm font-bold text-brand-300">
                        ₹{formatINR(pnl.products.reduce((s, p) => s + p.expectedRate, 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="AOV" value={`₹${formatINR(pnl.metrics.aov)}`} color="muted" />
            <StatCard label="Total COGS" value={`₹${formatINR(pnl.expenses.cogs)}`} icon={Truck} color="muted" />
            <StatCard label="Logistics" value={`₹${formatINR(pnl.expenses.logistics)}`} color="muted" />
            <StatCard label="Fees" value={`₹${formatINR(pnl.expenses.totalFees)}`} color="muted" />
          </div>
        </>
      )}

      {/* Empty State */}
      {!pnl && !loading && (
        <div className="glass-card p-12 text-center">
          <BarChart size={48} className="text-brand-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-accent mb-2">No data yet</h3>
          <p className="text-sm text-brand-400 max-w-md mx-auto">
            Select a date range and click Fetch Data. Vendor prices are pre-loaded from your Validation sheet.
          </p>
        </div>
      )}
    </div>
  )
}
