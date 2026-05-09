import React, { useState, useEffect, useMemo } from 'react'
import { Plus, Trash2, Save, X, Edit2, Package, AlertTriangle, Search, Zap, Check } from 'lucide-react'
import { getProducts, upsertProduct, deleteProduct } from '../lib/productDB'
import { DEFAULT_VENDOR_PRICES } from '../lib/vendorPrices'
import { getProductFamily } from '../lib/profitEngine'
import { useDataStore } from '../lib/dataStore'

const EMPTY = { name: '', vendorPrice: '', campaignCode: '', matchPatterns: '' }

function ProductForm({ product, onSave, onCancel }) {
  const [form, setForm] = useState(product || EMPTY)
  const u = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  const handleSave = () => {
    if (!form.name.trim()) return
    onSave({ ...form, vendorPrice: parseFloat(form.vendorPrice) || 0 })
  }

  return (
    <div className="glass-card p-5 fade-in">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-base font-semibold text-accent">{product?.id ? 'Edit Product' : 'Add Product'}</h3>
        <button onClick={onCancel} className="text-brand-400 hover:text-accent"><X size={18} /></button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-[10px] text-brand-400 uppercase tracking-wider mb-1 block">Product Family Name</label>
          <input className="input-field" placeholder="e.g. Name Necklace" value={form.name} onChange={e => u('name', e.target.value)} />
          <p className="text-[10px] text-brand-500 mt-1">Must match how Shopify product title starts</p>
        </div>
        <div>
          <label className="text-[10px] text-brand-400 uppercase tracking-wider mb-1 block">Meta Campaign Code</label>
          <input className="input-field" placeholder="e.g. PNN" value={form.campaignCode} onChange={e => u('campaignCode', e.target.value.toUpperCase())} />
          <p className="text-[10px] text-brand-500 mt-1">Matches Meta campaign names containing this code</p>
        </div>
        <div>
          <label className="text-[10px] text-brand-400 uppercase tracking-wider mb-1 block">Vendor Price (per unit)</label>
          <input className="input-field" type="number" placeholder="115" value={form.vendorPrice} onChange={e => u('vendorPrice', e.target.value)} />
        </div>
        <div>
          <label className="text-[10px] text-brand-400 uppercase tracking-wider mb-1 block">Extra Match Patterns (comma-sep)</label>
          <input className="input-field" placeholder="e.g. arabic name necklace, flower name" value={form.matchPatterns} onChange={e => u('matchPatterns', e.target.value)} />
        </div>
      </div>
      <div className="flex justify-end mt-5 gap-3">
        <button onClick={onCancel} className="btn-ghost text-sm">Cancel</button>
        <button onClick={handleSave} disabled={!form.name.trim()} className="btn-primary text-sm flex items-center gap-2">
          <Save size={14} /> Save
        </button>
      </div>
    </div>
  )
}

export default function Products() {
  const [products, setProducts] = useState([])
  const [editing, setEditing] = useState(null)
  const [search, setSearch] = useState('')
  const [showDefaults, setShowDefaults] = useState(false)
  const { cache, ready } = useDataStore()

  useEffect(() => { setProducts(getProducts()) }, [])

  // Auto-detect product families from cached order data
  const detectedProducts = useMemo(() => {
    const families = new Map()
    Object.values(cache || {}).forEach(data => {
      (data?.orders || []).forEach(order => {
        (order.lineItems || []).forEach(item => {
          const family = getProductFamily(item.title)
          if (!family) return
          if (!families.has(family)) families.set(family, { count: 0, titles: new Set() })
          const f = families.get(family)
          f.count += item.quantity || 1
          f.titles.add(item.title)
        })
      })
    })
    return Array.from(families.entries())
      .map(([name, data]) => ({ name, count: data.count, sampleTitles: Array.from(data.titles).slice(0, 3) }))
      .sort((a, b) => b.count - a.count)
  }, [cache])

  // Products not yet in database
  const existingNames = new Set(products.map(p => p.name.toLowerCase()))
  const missingProducts = detectedProducts.filter(d => !existingNames.has(d.name.toLowerCase()))

  const handleSave = (product) => {
    const updated = upsertProduct(product)
    setProducts(updated)
    setEditing(null)
  }

  const handleDelete = (id) => {
    if (!confirm('Delete this product?')) return
    setProducts(deleteProduct(id))
  }

  const handleQuickAdd = (name) => {
    // Find default vendor price
    const lower = name.toLowerCase()
    let vendorPrice = 0
    for (const [key, price] of Object.entries(DEFAULT_VENDOR_PRICES)) {
      if (lower.includes(key)) { vendorPrice = price; break }
    }
    const updated = upsertProduct({ name, vendorPrice, campaignCode: '', matchPatterns: '' })
    setProducts(updated)
  }

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.campaignCode || '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-5 fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-accent">Product Database</h2>
          <p className="text-sm text-brand-400 mt-1">{products.length} products configured</p>
        </div>
        {!editing && (
          <button onClick={() => setEditing('new')} className="btn-primary flex items-center gap-2 text-sm">
            <Plus size={14} /> Add Product
          </button>
        )}
      </div>

      {editing && (
        <ProductForm
          product={editing === 'new' ? null : editing}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
        />
      )}

      {!editing && (
        <>
          {/* Auto-detected missing products */}
          {missingProducts.length > 0 && (
            <div className="glass-card p-4 bg-brand-900/20 border-brand-600/20">
              <div className="flex items-center gap-2 mb-3">
                <Zap size={14} className="text-yellow-400" />
                <h3 className="text-sm font-semibold text-accent">Detected from orders -- click to add</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {missingProducts.map(mp => (
                  <button key={mp.name} onClick={() => handleQuickAdd(mp.name)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-brand-800/40 text-brand-300 hover:text-accent hover:bg-brand-700/40 border border-brand-700/20 transition-all">
                    <Plus size={10} />
                    {mp.name}
                    <span className="text-[10px] text-brand-500 font-mono">{mp.count}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* How it works */}
          <div className="glass-card p-4 bg-brand-900/20 border-brand-600/20">
            <div className="flex items-start gap-3">
              <Package size={16} className="text-brand-400 mt-0.5" />
              <div className="text-xs text-brand-300 space-y-1">
                <p><strong className="text-accent">Campaign Code</strong> matches Meta campaigns. If campaign name contains "PNN", spend goes to the product with code PNN.</p>
                <p><strong className="text-accent">Vendor Price</strong> overrides built-in defaults. Click edit to change.</p>
                <p><strong className="text-accent">18% GST</strong> auto-added on Meta spend.</p>
              </div>
            </div>
          </div>

          {/* Search */}
          {products.length > 5 && (
            <div className="relative">
              <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-500" />
              <input className="input-field !pl-10 !text-sm" placeholder="Search products or codes..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          )}

          {/* Product Table */}
          {filtered.length > 0 && (
            <div className="glass-card overflow-hidden">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-brand-800/30 text-[10px] text-brand-400 uppercase tracking-wider">
                    <th className="py-2.5 px-4">Product</th>
                    <th className="py-2.5 px-3">Campaign Code</th>
                    <th className="py-2.5 px-3 text-right">Vendor</th>
                    <th className="py-2.5 px-3">Match Patterns</th>
                    <th className="py-2.5 px-3 w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(p => (
                    <tr key={p.id} className="border-b border-brand-800/10 hover:bg-brand-900/20 group">
                      <td className="py-2.5 px-4 text-sm text-accent font-medium">{p.name}</td>
                      <td className="py-2.5 px-3">
                        {p.campaignCode
                          ? <span className="text-xs font-mono px-2 py-0.5 rounded bg-green-900/20 text-cash-green border border-green-800/20">{p.campaignCode}</span>
                          : <span className="flex items-center gap-1 text-xs text-yellow-500"><AlertTriangle size={10} /> Add code</span>
                        }
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-sm text-brand-200">{p.vendorPrice ? `₹${p.vendorPrice}` : '--'}</td>
                      <td className="py-2.5 px-3 text-xs text-brand-400 max-w-[200px] truncate">{p.matchPatterns || '--'}</td>
                      <td className="py-2.5 px-3">
                        <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => setEditing(p)} className="p-1.5 rounded text-brand-400 hover:text-accent hover:bg-brand-800/30"><Edit2 size={12} /></button>
                          <button onClick={() => handleDelete(p.id)} className="p-1.5 rounded text-brand-400 hover:text-cash-red hover:bg-red-900/20"><Trash2 size={12} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {filtered.length === 0 && !search && (
            <div className="glass-card p-10 text-center">
              <Package size={40} className="text-brand-600 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-accent mb-1">No products yet</h3>
              <p className="text-sm text-brand-400 mb-4">Fetch some orders first, then products will auto-detect here.</p>
            </div>
          )}

          {/* Default Vendor Prices Reference */}
          <div className="glass-card overflow-hidden">
            <button onClick={() => setShowDefaults(!showDefaults)}
              className="w-full px-5 py-3 flex items-center justify-between hover:bg-brand-900/20 transition-colors">
              <h3 className="text-sm text-brand-300">Built-in Default Vendor Prices ({Object.keys(DEFAULT_VENDOR_PRICES).length})</h3>
              <span className="text-xs text-brand-500">{showDefaults ? 'Hide' : 'Show'}</span>
            </button>
            {showDefaults && (
              <div className="max-h-[400px] overflow-y-auto">
                <table className="w-full text-left">
                  <tbody>
                    {Object.entries(DEFAULT_VENDOR_PRICES).sort((a,b) => a[0].localeCompare(b[0])).map(([key, price]) => (
                      <tr key={key} className="border-b border-brand-800/5">
                        <td className="py-1.5 px-4 text-xs text-brand-300 capitalize">{key}</td>
                        <td className="py-1.5 px-4 text-right font-mono text-xs text-brand-400">₹{price}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
