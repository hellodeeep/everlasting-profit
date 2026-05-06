import React, { useState } from 'react'
import { Search, Edit2, Check, X, Package } from 'lucide-react'
import { DEFAULT_VENDOR_PRICES, LOGISTICS_COSTS, FEE_RATES } from '../lib/vendorPrices'

export default function Products() {
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState(null)
  const [editValue, setEditValue] = useState('')

  const entries = Object.entries(DEFAULT_VENDOR_PRICES)
    .filter(([key]) => key.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a[0].localeCompare(b[0]))

  return (
    <div className="space-y-6 fade-in max-w-3xl">
      <div>
        <h2 className="text-2xl font-bold text-accent">Vendor Prices</h2>
        <p className="text-sm text-brand-400 mt-1">
          {entries.length} products loaded from Validation sheet. These are used to auto-calculate COGS.
        </p>
      </div>

      {/* Logistics Costs */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold text-accent mb-4">Fixed Costs Per Shipment</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[
            ['Box', LOGISTICS_COSTS.box],
            ['Warranty Card', LOGISTICS_COSTS.warrantyCard],
            ['Free Ring', LOGISTICS_COSTS.freeRing],
            ['Packing Bag', LOGISTICS_COSTS.packingBag],
            ['Shipping', LOGISTICS_COSTS.shipping],
          ].map(([label, val]) => (
            <div key={label} className="flex justify-between items-center">
              <span className="text-sm text-brand-300">{label}</span>
              <span className="font-mono text-sm text-brand-200">₹{val}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Fee Rates */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold text-accent mb-4">Fee Rates (on Prepaid Revenue)</h3>
        <div className="grid grid-cols-3 gap-4">
          {[
            ['Cashfree', FEE_RATES.cashfree],
            ['Engage', FEE_RATES.engage],
            ['Checkout (Fastrr)', FEE_RATES.checkout],
          ].map(([label, val]) => (
            <div key={label} className="flex justify-between items-center">
              <span className="text-sm text-brand-300">{label}</span>
              <span className="font-mono text-sm text-brand-200">{(val * 100).toFixed(2)}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-500" />
        <input
          className="input-field !pl-10"
          placeholder="Search products..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Vendor Price Table */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-y-auto max-h-[600px]">
          <table className="w-full text-left">
            <thead className="sticky top-0 bg-brand-900/90 backdrop-blur-sm">
              <tr className="border-b border-brand-800/30 text-xs text-brand-400 uppercase tracking-wider">
                <th className="py-3 px-4">Product</th>
                <th className="py-3 px-4 text-right">Vendor Price (₹)</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(([key, price]) => (
                <tr key={key} className="border-b border-brand-800/10 hover:bg-brand-900/20 transition-colors">
                  <td className="py-2.5 px-4 text-sm text-brand-200 capitalize">{key}</td>
                  <td className="py-2.5 px-4 text-right font-mono text-sm text-accent">₹{price}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Info */}
      <div className="glass-card p-5">
        <div className="flex items-start gap-3">
          <Package size={18} className="text-brand-400 mt-0.5" />
          <div className="text-sm text-brand-300 space-y-2">
            <p>
              <strong className="text-accent">How matching works:</strong> When an order comes in from Shopify,
              the product title is matched against these vendor prices using the longest matching keyword.
            </p>
            <p>
              "Name Necklace - Gold / Buy 2 @ 1899" matches "name necklace" = ₹115 vendor cost.
              The "Buy 2" multiplier doubles it to ₹230 total vendor cost.
            </p>
            <p>
              To update prices, edit <code className="text-xs bg-brand-950/50 px-1 py-0.5 rounded">src/lib/vendorPrices.js</code> and redeploy.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
