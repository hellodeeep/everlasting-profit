import React, { useState, useEffect } from 'react'
import { Plus, Trash2, Save, Package, X, Edit2 } from 'lucide-react'
import { getProducts, upsertProduct, deleteProduct } from '../lib/supabase'
import { formatINR } from '../lib/profitEngine'

const EMPTY_PRODUCT = {
  name: '',
  shopifyTitle: '',
  sellingPrice: '',
  sellingPriceCOD: '',
  deliveryRate: '0.7',
  softwarePercent: '0.05',
  c2pPayment: '150',
  cogs: {
    product: '',
    box: '17',
    card: '3',
    packingBag: '3',
    shipping: '60',
    prepaidRing: '17',
    codFee: '50',
  },
}

function ProductForm({ product, onSave, onCancel }) {
  const [form, setForm] = useState(product || EMPTY_PRODUCT)
  const [saving, setSaving] = useState(false)

  const updateField = (field, value) => setForm(prev => ({ ...prev, [field]: value }))
  const updateCogs = (field, value) => setForm(prev => ({
    ...prev,
    cogs: { ...prev.cogs, [field]: value },
  }))

  const handleSave = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const payload = {
        ...form,
        sellingPrice: parseFloat(form.sellingPrice) || 0,
        sellingPriceCOD: parseFloat(form.sellingPriceCOD || form.sellingPrice) || 0,
        deliveryRate: parseFloat(form.deliveryRate) || 0.7,
        softwarePercent: parseFloat(form.softwarePercent) || 0.05,
        c2pPayment: parseFloat(form.c2pPayment) || 150,
        cogs: Object.fromEntries(
          Object.entries(form.cogs).map(([k, v]) => [k, parseFloat(v) || 0])
        ),
      }
      await onSave(payload)
    } finally {
      setSaving(false)
    }
  }

  const cogsTotal = Object.values(form.cogs).reduce((s, v) => s + (parseFloat(v) || 0), 0)
  const prepaidCOGS = cogsTotal + (parseFloat(form.cogs.prepaidRing) || 0) - (parseFloat(form.cogs.codFee) || 0)
  const sp = parseFloat(form.sellingPrice) || 0

  return (
    <div className="glass-card p-6 fade-in">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-accent">
          {product?.id ? 'Edit Product' : 'Add Product'}
        </h3>
        <button onClick={onCancel} className="text-brand-400 hover:text-accent">
          <X size={20} />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left: Basic Info */}
        <div className="space-y-4">
          <div>
            <label className="text-xs text-brand-400 uppercase tracking-wider mb-1.5 block">Product Name</label>
            <input
              className="input-field"
              placeholder="e.g. Name Necklace"
              value={form.name}
              onChange={e => updateField('name', e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-brand-400 uppercase tracking-wider mb-1.5 block">
              Shopify Product Title <span className="text-brand-600">(for matching)</span>
            </label>
            <input
              className="input-field"
              placeholder="Exact title from Shopify"
              value={form.shopifyTitle}
              onChange={e => updateField('shopifyTitle', e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-brand-400 uppercase tracking-wider mb-1.5 block">Selling Price (Prepaid)</label>
              <input
                className="input-field"
                type="number"
                placeholder="1100"
                value={form.sellingPrice}
                onChange={e => updateField('sellingPrice', e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-brand-400 uppercase tracking-wider mb-1.5 block">Selling Price (COD)</label>
              <input
                className="input-field"
                type="number"
                placeholder="1100"
                value={form.sellingPriceCOD}
                onChange={e => updateField('sellingPriceCOD', e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-brand-400 uppercase tracking-wider mb-1.5 block">Delivery Rate</label>
              <input
                className="input-field"
                type="number"
                step="0.01"
                placeholder="0.7"
                value={form.deliveryRate}
                onChange={e => updateField('deliveryRate', e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-brand-400 uppercase tracking-wider mb-1.5 block">Software %</label>
              <input
                className="input-field"
                type="number"
                step="0.01"
                placeholder="0.05"
                value={form.softwarePercent}
                onChange={e => updateField('softwarePercent', e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-brand-400 uppercase tracking-wider mb-1.5 block">C2P Payment</label>
              <input
                className="input-field"
                type="number"
                placeholder="150"
                value={form.c2pPayment}
                onChange={e => updateField('c2pPayment', e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Right: COGS Breakdown */}
        <div>
          <h4 className="text-xs text-brand-400 uppercase tracking-wider mb-3">COGS Breakdown</h4>
          <div className="space-y-2.5">
            {[
              ['product', 'Product Cost'],
              ['box', 'Box'],
              ['card', 'Card'],
              ['packingBag', 'Packing Bag'],
              ['shipping', 'Shipping'],
              ['prepaidRing', 'Prepaid Ring/Extra'],
              ['codFee', 'COD Fee'],
            ].map(([key, label]) => (
              <div key={key} className="flex items-center gap-3">
                <span className="text-sm text-brand-300 w-32">{label}</span>
                <input
                  className="input-field !w-28"
                  type="number"
                  value={form.cogs[key]}
                  onChange={e => updateCogs(key, e.target.value)}
                />
              </div>
            ))}
          </div>

          {/* Live Summary */}
          <div className="mt-4 p-3 rounded-lg bg-brand-950/50 border border-brand-800/20 space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-brand-400">Prepaid COGS</span>
              <span className="font-mono text-brand-200">₹{prepaidCOGS}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-brand-400">Prepaid Profit/Unit</span>
              <span className={`font-mono font-bold ${sp - prepaidCOGS > 0 ? 'text-cash-green' : 'text-cash-red'}`}>
                ₹{sp - prepaidCOGS}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-brand-400">Margin/Unit</span>
              <span className="font-mono text-brand-200">
                {sp > 0 ? `${(((sp - prepaidCOGS) / sp) * 100).toFixed(1)}%` : '--'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end mt-6 gap-3">
        <button onClick={onCancel} className="btn-ghost">Cancel</button>
        <button onClick={handleSave} disabled={saving || !form.name.trim()} className="btn-primary flex items-center gap-2">
          <Save size={14} />
          {saving ? 'Saving...' : 'Save Product'}
        </button>
      </div>
    </div>
  )
}

function ProductCard({ product, onEdit, onDelete }) {
  const cogs = product.cogs || {}
  const prepaidCOGS = (cogs.product || 0) + (cogs.box || 0) + (cogs.card || 0) + (cogs.packingBag || 0) + (cogs.shipping || 0) + (cogs.prepaidRing || 0)
  const margin = product.sellingPrice > 0 ? ((product.sellingPrice - prepaidCOGS) / product.sellingPrice) : 0

  return (
    <div className="glass-card glass-card-hover p-5 fade-in">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-800/50 flex items-center justify-center">
            <Package size={18} className="text-brand-400" />
          </div>
          <div>
            <h4 className="font-semibold text-accent">{product.name}</h4>
            {product.shopifyTitle && (
              <p className="text-xs text-brand-500">{product.shopifyTitle}</p>
            )}
          </div>
        </div>
        <div className="flex gap-1">
          <button onClick={() => onEdit(product)} className="p-2 rounded-lg text-brand-400 hover:text-accent hover:bg-brand-800/30 transition-all">
            <Edit2 size={14} />
          </button>
          <button onClick={() => onDelete(product.id)} className="p-2 rounded-lg text-brand-400 hover:text-cash-red hover:bg-red-900/20 transition-all">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 text-center">
        <div>
          <p className="text-xs text-brand-400">SP</p>
          <p className="font-mono text-sm font-bold text-brand-200">₹{product.sellingPrice}</p>
        </div>
        <div>
          <p className="text-xs text-brand-400">COGS</p>
          <p className="font-mono text-sm font-bold text-brand-200">₹{prepaidCOGS}</p>
        </div>
        <div>
          <p className="text-xs text-brand-400">Margin</p>
          <p className={`font-mono text-sm font-bold ${margin >= 0.5 ? 'text-cash-green' : 'text-yellow-400'}`}>
            {(margin * 100).toFixed(1)}%
          </p>
        </div>
      </div>
    </div>
  )
}

export default function Products() {
  const [products, setProducts] = useState([])
  const [editing, setEditing] = useState(null) // null = not editing, 'new' = new product, object = editing
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadProducts()
  }, [])

  async function loadProducts() {
    setLoading(true)
    try {
      const data = await getProducts()
      setProducts(data)
    } catch (err) {
      console.error('Failed to load products:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleSave(product) {
    await upsertProduct(product)
    await loadProducts()
    setEditing(null)
  }

  async function handleDelete(id) {
    if (!confirm('Delete this product?')) return
    await deleteProduct(id)
    await loadProducts()
  }

  return (
    <div className="space-y-6 fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-accent">Products</h2>
          <p className="text-sm text-brand-400 mt-1">Manage your products and their COGS breakdown</p>
        </div>
        {!editing && (
          <button onClick={() => setEditing('new')} className="btn-primary flex items-center gap-2">
            <Plus size={14} />
            Add Product
          </button>
        )}
      </div>

      {/* Form */}
      {editing && (
        <ProductForm
          product={editing === 'new' ? null : editing}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
        />
      )}

      {/* Product Grid */}
      {!editing && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map(p => (
            <ProductCard
              key={p.id}
              product={p}
              onEdit={setEditing}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!editing && products.length === 0 && !loading && (
        <div className="glass-card p-12 text-center">
          <Package size={48} className="text-brand-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-accent mb-2">No products yet</h3>
          <p className="text-sm text-brand-400 mb-4">Add your first product with its COGS to start tracking profit.</p>
          <button onClick={() => setEditing('new')} className="btn-primary">
            <Plus size={14} className="inline mr-1" /> Add Product
          </button>
        </div>
      )}
    </div>
  )
}
