import React, { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Calendar, TrendingUp, TrendingDown, AlertCircle, IndianRupee, ShoppingBag, Truck, Megaphone } from 'lucide-react'
import { fetchShopifyOrders, fetchMetaSpend } from '../lib/api'
import { getProducts } from '../lib/supabase'
import { calculateProfit, calculateAggregate, formatINR, formatPercent } from '../lib/profitEngine'

function getDateRange(preset) {
  const today = new Date()
  const fmt = (d) => d.toISOString().split('T')[0]
  switch (preset) {
    case 'today':
      return { since: fmt(today), until: fmt(today) }
    case 'yesterday': {
      const y = new Date(today); y.setDate(y.getDate() - 1)
      return { since: fmt(y), until: fmt(y) }
    }
    case '7d': {
      const d = new Date(today); d.setDate(d.getDate() - 6)
      return { since: fmt(d), until: fmt(today) }
    }
    case '30d': {
      const d = new Date(today); d.setDate(d.getDate() - 29)
      return { since: fmt(d), until: fmt(today) }
    }
    case 'mtd': {
      const d = new Date(today.getFullYear(), today.getMonth(), 1)
      return { since: fmt(d), until: fmt(today) }
    }
    default:
      return { since: fmt(today), until: fmt(today) }
  }
}

function StatCard({ label, value, sub, icon: Icon, trend, color = 'default' }) {
  const colorMap = {
    default: 'text-accent',
    green: 'text-cash-green',
    red: 'text-cash-red',
    muted: 'text-brand-300',
  }
  return (
    <div className="glass-card glass-card-hover p-5 fade-in">
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs text-brand-400 uppercase tracking-wider font-medium">{label}</span>
        {Icon && <Icon size={16} className="text-brand-500" />}
      </div>
      <p className={`text-2xl font-bold font-mono stat-glow ${colorMap[color]}`}>{value}</p>
      {sub && (
        <p className="text-xs text-brand-400 mt-1.5 flex items-center gap-1">
          {trend === 'up' && <TrendingUp size={12} className="text-cash-green" />}
          {trend === 'down' && <TrendingDown size={12} className="text-cash-red" />}
          {sub}
        </p>
      )}
    </div>
  )
}

function ProductRow({ product, result }) {
  const r = result
  const margin = r.profit.netMargin
  const marginColor = margin >= 0.2 ? 'text-cash-green' : margin >= 0.1 ? 'text-yellow-400' : 'text-cash-red'

  return (
    <tr className="border-b border-brand-800/20 hover:bg-brand-900/20 transition-colors">
      <td className="py-3 px-4">
        <span className="font-medium text-accent">{product.name}</span>
      </td>
      <td className="py-3 px-4 font-mono text-sm">{r.orders.totalOrders}</td>
      <td className="py-3 px-4 font-mono text-sm">{r.orders.totalDelivered}</td>
      <td className="py-3 px-4 font-mono text-sm text-brand-200">{formatINR(r.revenue.netRevenue)}</td>
      <td className="py-3 px-4 font-mono text-sm text-brand-300">{formatINR(r.expenses.adSpend)}</td>
      <td className="py-3 px-4 font-mono text-sm text-brand-300">{formatINR(r.expenses.totalCOG)}</td>
      <td className={`py-3 px-4 font-mono text-sm font-bold ${r.profit.netProfit >= 0 ? 'text-cash-green' : 'text-cash-red'}`}>
        {formatINR(r.profit.netProfit)}
      </td>
      <td className={`py-3 px-4 font-mono text-sm font-bold ${marginColor}`}>
        {formatPercent(margin)}
      </td>
      <td className="py-3 px-4 font-mono text-sm text-brand-400">{formatINR(r.metrics.cpp)}</td>
    </tr>
  )
}

export default function Dashboard() {
  const [preset, setPreset] = useState('today')
  const [customRange, setCustomRange] = useState({ since: '', until: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [shopifyData, setShopifyData] = useState(null)
  const [metaData, setMetaData] = useState(null)
  const [products, setProducts] = useState([])
  const [results, setResults] = useState([])
  const [aggregate, setAggregate] = useState(null)
  const [lastFetch, setLastFetch] = useState(null)

  const dateRange = preset === 'custom' ? customRange : getDateRange(preset)

  // Load products on mount
  useEffect(() => {
    getProducts().then(setProducts).catch(console.error)
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [shopify, meta] = await Promise.all([
        fetchShopifyOrders(dateRange.since, dateRange.until),
        fetchMetaSpend(dateRange.since, dateRange.until),
      ])
      setShopifyData(shopify)
      setMetaData(meta)
      setLastFetch(new Date())

      // Match Shopify products with our COGS products and calculate profit
      const productResults = products.map(prod => {
        // Find matching Shopify product data
        const shopifyProduct = shopify.products?.find(
          sp => sp.title.toLowerCase().includes(prod.name.toLowerCase())
            || prod.shopifyTitle?.toLowerCase() === sp.title.toLowerCase()
        ) || { totalQty: 0, prepaidQty: 0, codQty: 0, prepaidRevenue: 0, codRevenue: 0 }

        // Allocate ad spend proportionally by revenue share
        const totalShopifyRevenue = shopify.products?.reduce((s, p) => s + p.totalRevenue, 0) || 1
        const revenueShare = shopifyProduct.totalRevenue / totalShopifyRevenue
        const allocatedAdSpend = (meta.summary?.totalSpend || 0) * revenueShare

        return {
          product: prod,
          result: calculateProfit({
            shopify: shopifyProduct,
            cogs: prod.cogs || {},
            adSpend: allocatedAdSpend,
            softwarePercent: prod.softwarePercent || 0.05,
            deliveryRate: prod.deliveryRate || 0.7,
            c2pPayment: prod.c2pPayment || 150,
            sellingPrice: {
              prepaid: prod.sellingPrice || 0,
              cod: prod.sellingPriceCOD || prod.sellingPrice || 0,
            },
          }),
        }
      })

      setResults(productResults)
      setAggregate(calculateAggregate(productResults.map(r => r.result)))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [dateRange.since, dateRange.until, products])

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
            {dateRange.since === dateRange.until
              ? dateRange.since
              : `${dateRange.since} to ${dateRange.until}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastFetch && (
            <div className="flex items-center gap-2 text-xs text-brand-500">
              <div className="pulse-dot" />
              Last updated {lastFetch.toLocaleTimeString('en-IN')}
            </div>
          )}
          <button onClick={fetchData} disabled={loading} className="btn-primary flex items-center gap-2">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Fetching...' : 'Fetch Data'}
          </button>
        </div>
      </div>

      {/* Date Range Selector */}
      <div className="glass-card p-4 flex items-center gap-2 flex-wrap">
        <Calendar size={16} className="text-brand-400" />
        {presets.map(p => (
          <button
            key={p.key}
            onClick={() => setPreset(p.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              preset === p.key
                ? 'bg-brand-700 text-accent border border-brand-500/30'
                : 'text-brand-400 hover:text-accent hover:bg-brand-800/40'
            }`}
          >
            {p.label}
          </button>
        ))}
        {preset === 'custom' && (
          <div className="flex gap-2 ml-2">
            <input
              type="date"
              value={customRange.since}
              onChange={e => setCustomRange(prev => ({ ...prev, since: e.target.value }))}
              className="input-field !w-40 !py-1.5 !text-xs"
            />
            <input
              type="date"
              value={customRange.until}
              onChange={e => setCustomRange(prev => ({ ...prev, until: e.target.value }))}
              className="input-field !w-40 !py-1.5 !text-xs"
            />
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="glass-card p-4 border-cash-red/30 flex items-start gap-3 bg-red-900/10">
          <AlertCircle size={18} className="text-cash-red mt-0.5" />
          <div>
            <p className="text-sm font-medium text-cash-red">Error fetching data</p>
            <p className="text-xs text-brand-400 mt-1">{error}</p>
            <p className="text-xs text-brand-500 mt-2">Check Settings to ensure your API keys are configured.</p>
          </div>
        </div>
      )}

      {/* Aggregate Stats */}
      {aggregate && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Net Revenue"
            value={`₹${formatINR(aggregate.netRevenue)}`}
            sub={`${aggregate.totalDelivered} units delivered`}
            icon={IndianRupee}
          />
          <StatCard
            label="Ad Spend"
            value={`₹${formatINR(aggregate.totalAdSpend)}`}
            sub={`${formatPercent(aggregate.adSpendRatio)} of revenue`}
            icon={Megaphone}
            color={aggregate.adSpendRatio > 0.5 ? 'red' : 'muted'}
          />
          <StatCard
            label="Net Profit"
            value={`₹${formatINR(aggregate.netProfit)}`}
            sub={`${formatPercent(aggregate.netMargin)} margin`}
            icon={aggregate.netProfit >= 0 ? TrendingUp : TrendingDown}
            color={aggregate.netProfit >= 0 ? 'green' : 'red'}
            trend={aggregate.netProfit >= 0 ? 'up' : 'down'}
          />
          <StatCard
            label="Cash In"
            value={`₹${formatINR(aggregate.totalCashIn)}`}
            sub={`Prepaid ₹${formatINR(aggregate.prepaidCashIn)} | COD ₹${formatINR(aggregate.codCashIn)}`}
            icon={ShoppingBag}
          />
        </div>
      )}

      {/* Secondary Stats */}
      {aggregate && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Orders" value={aggregate.totalOrders} icon={ShoppingBag} color="muted" />
          <StatCard label="Total COGS" value={`₹${formatINR(aggregate.totalCOG)}`} icon={Truck} color="muted" />
          <StatCard label="Software Exp" value={`₹${formatINR(aggregate.totalSoftwareExp)}`} color="muted" />
          <StatCard
            label="Gross Margin"
            value={formatPercent(aggregate.grossMargin)}
            color={aggregate.grossMargin >= 0.5 ? 'green' : 'muted'}
          />
        </div>
      )}

      {/* Product Breakdown Table */}
      {results.length > 0 && (
        <div className="glass-card overflow-hidden">
          <div className="px-5 py-4 border-b border-brand-800/20">
            <h3 className="text-sm font-semibold text-accent">Product Breakdown</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-brand-800/30 text-xs text-brand-400 uppercase tracking-wider">
                  <th className="py-3 px-4">Product</th>
                  <th className="py-3 px-4">Orders</th>
                  <th className="py-3 px-4">Delivered</th>
                  <th className="py-3 px-4">Revenue</th>
                  <th className="py-3 px-4">Ad Spend</th>
                  <th className="py-3 px-4">COGS</th>
                  <th className="py-3 px-4">Net Profit</th>
                  <th className="py-3 px-4">Margin</th>
                  <th className="py-3 px-4">CPP</th>
                </tr>
              </thead>
              <tbody>
                {results.map(({ product, result }) => (
                  <ProductRow key={product.id} product={product} result={result} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Shopify Raw Data */}
      {shopifyData && (
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-accent mb-3">Shopify Overview</h3>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-4 text-center">
            {[
              ['Total Orders', shopifyData.overview?.totalOrders],
              ['Prepaid', shopifyData.overview?.prepaidOrders],
              ['COD', shopifyData.overview?.codOrders],
              ['Cancelled', shopifyData.overview?.cancelledOrders],
              ['Fulfilled', shopifyData.overview?.fulfilledOrders],
              ['Prepaid Rate', formatPercent(shopifyData.overview?.prepaidRate)],
            ].map(([label, val]) => (
              <div key={label}>
                <p className="text-xs text-brand-400">{label}</p>
                <p className="text-lg font-mono font-bold text-brand-200">{val}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Meta Raw Data */}
      {metaData && (
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-accent mb-3">Meta Ads Overview</h3>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-4 text-center">
            {[
              ['Total Spend', `₹${formatINR(metaData.summary?.totalSpend)}`],
              ['Purchases', metaData.summary?.totalPurchases],
              ['Avg CPP', `₹${formatINR(metaData.summary?.avgCPP)}`],
              ['Impressions', formatINR(metaData.summary?.totalImpressions)],
              ['Clicks', formatINR(metaData.summary?.totalClicks)],
              ['CTR', `${(metaData.summary?.ctr || 0).toFixed(2)}%`],
            ].map(([label, val]) => (
              <div key={label}>
                <p className="text-xs text-brand-400">{label}</p>
                <p className="text-lg font-mono font-bold text-brand-200">{val}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!shopifyData && !metaData && !loading && (
        <div className="glass-card p-12 text-center">
          <BarChart3 size={48} className="text-brand-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-accent mb-2">No data yet</h3>
          <p className="text-sm text-brand-400 max-w-md mx-auto">
            Add your products with COGS in the Products tab, configure your API keys in Settings, then hit Fetch Data.
          </p>
        </div>
      )}
    </div>
  )
}
