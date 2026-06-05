import React, { useState } from 'react'
import { Camera, Eye, EyeOff, X } from 'lucide-react'
import { formatExact } from '../lib/profitEngine'

const GST = 1.18

// Compact INR for hero numbers: 693120 -> "6.93L", 12400000 -> "1.24Cr"
function compactINR(n) {
  const v = Math.abs(Math.round(n))
  const sign = n < 0 ? '-' : ''
  if (v >= 10000000) return `${sign}${(v / 10000000).toFixed(2)}Cr`
  if (v >= 100000) return `${sign}${(v / 100000).toFixed(2)}L`
  if (v >= 1000) return `${sign}${(v / 1000).toFixed(1)}K`
  return `${sign}${v}`
}

function pctTo(target, actual) {
  if (!target) return 0
  return Math.round((actual / target) * 100)
}

// One SKU row: target vs actual for Orders, CAC, AOV, Profit
function SkuRow({ t, actual, daysElapsed, daysTotal, redact }) {
  const aO = actual?.totalUnits || 0
  const aM = (actual?.metaSpend || 0) / GST
  const aP = actual?.profit || 0
  const aRev = actual?.revenue || 0
  const aCAC = aO > 0 ? aM / aO : 0
  const aAOV = aO > 0 ? aRev / aO : 0

  // Targets are monthly; for a closed month compare full month, for in-progress compare pro-rated
  const proRate = daysElapsed >= daysTotal ? 1 : daysElapsed / daysTotal
  const tOrders = Math.round(t.ordersMonthly * proRate)
  const tProfit = Math.round((t.profitMonthly || 0) * proRate)

  const ordPct = pctTo(tOrders, aO)
  const profitPct = pctTo(tProfit, aP)
  const cacGood = aCAC > 0 && aCAC <= t.cac
  const aovGood = aAOV >= t.aov * 0.95

  const cell = (label, target, actualStr, good, hide) => (
    <div className="flex-1 min-w-0">
      <p className="text-[9px] uppercase tracking-wider opacity-50 mb-0.5">{label}</p>
      <p className="text-[13px] font-bold font-mono leading-none" style={{ color: good ? '#16a34a' : '#dc2626' }}>
        {hide ? '•••' : actualStr}
      </p>
      <p className="text-[9px] font-mono opacity-40 mt-0.5">tgt {hide ? '•••' : target}</p>
    </div>
  )

  return (
    <div className="rounded-xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(55,35,72,0.10)' }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-mono font-bold px-2 py-0.5 rounded" style={{ background: '#e9d5f6', color: '#372348' }}>{t.code}</span>
        <span className="text-[10px] font-mono font-bold" style={{ color: profitPct >= 90 ? '#16a34a' : profitPct >= 70 ? '#ca8a04' : '#dc2626' }}>
          {profitPct}% of profit goal
        </span>
      </div>
      <div className="flex gap-2">
        {cell('Orders', formatExact(tOrders), formatExact(aO), ordPct >= 90, false)}
        {cell('CAC', `₹${formatExact(Math.round(t.cac))}`, `₹${formatExact(Math.round(aCAC))}`, cacGood, false)}
        {cell('AOV', `₹${formatExact(Math.round(t.aov))}`, `₹${formatExact(Math.round(aAOV))}`, aovGood, redact)}
        {cell('Profit', redact ? '•••' : `₹${compactINR(tProfit)}`, `₹${compactINR(aP)}`, profitPct >= 90, redact)}
      </div>
    </div>
  )
}

export default function Snapshot({ targets, mtdPnl, monthName, daysElapsed, daysTotal, onClose }) {
  const [redact, setRedact] = useState(false)

  // Totals
  const proRate = daysElapsed >= daysTotal ? 1 : daysElapsed / daysTotal
  const tOrdersTotal = Math.round(targets.products.reduce((s, t) => s + t.ordersMonthly, 0) * proRate)
  const tProfitTotal = Math.round(targets.totalProfit * proRate)

  const aOrders = mtdPnl?.overview.activeOrders || 0
  const aProfit = mtdPnl?.profit.expected || 0
  const aRev = mtdPnl?.revenue.expectedRevenue || 0
  const aSpend = (mtdPnl?.expenses.metaAds || 0) / GST
  const aCAC = aOrders > 0 ? aSpend / aOrders : 0
  const aAOV = aOrders > 0 ? aRev / aOrders : 0
  const aMargin = aRev > 0 ? aProfit / aRev : 0

  const ordPct = pctTo(tOrdersTotal, aOrders)
  const profitPct = pctTo(tProfitTotal, aProfit)
  const isClosed = daysElapsed >= daysTotal

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto" style={{ background: 'rgba(20,12,28,0.55)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full max-w-md mt-6">
        {/* Controls (not part of screenshot) */}
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => setRedact(r => !r)}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg"
            style={{ background: 'rgba(255,255,255,0.9)', color: '#372348' }}>
            {redact ? <EyeOff size={13} /> : <Eye size={13} />}
            {redact ? 'Redacted (₹ hidden)' : 'Full numbers'}
          </button>
          <button onClick={onClose} className="p-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.9)', color: '#372348' }}>
            <X size={16} />
          </button>
        </div>

        {/* The shareable card */}
        <div id="snapshot-card" className="rounded-3xl overflow-hidden shadow-2xl"
          style={{ background: 'linear-gradient(160deg, #372348 0%, #4a2f5e 55%, #5d3a76 100%)' }}>
          <div className="px-6 pt-6 pb-5">
            {/* Brand line */}
            <div className="flex items-center justify-between mb-5">
              <span className="text-[11px] font-bold tracking-[0.2em] uppercase" style={{ color: '#e9d5f6' }}>Everlasting</span>
              <span className="text-[10px] font-medium px-2.5 py-1 rounded-full" style={{ background: 'rgba(233,213,246,0.15)', color: '#e9d5f6' }}>
                {monthName} {isClosed ? '· Final' : `· Day ${daysElapsed}/${daysTotal}`}
              </span>
            </div>

            {/* Hero: profit */}
            <p className="text-[11px] uppercase tracking-wider mb-1" style={{ color: 'rgba(233,213,246,0.7)' }}>
              {isClosed ? 'Net Profit' : 'Profit so far'}
            </p>
            <div className="flex items-end gap-3 mb-1">
              <span className="text-5xl font-black leading-none" style={{ color: '#ffffff' }}>
                {redact ? '••••' : `₹${compactINR(aProfit)}`}
              </span>
              <span className="text-sm font-bold mb-1.5" style={{ color: profitPct >= 90 ? '#4ade80' : profitPct >= 70 ? '#fbbf24' : '#f87171' }}>
                {profitPct}% of goal
              </span>
            </div>
            <p className="text-[11px] mb-5" style={{ color: 'rgba(233,213,246,0.6)' }}>
              {(aMargin * 100).toFixed(1)}% margin · {formatExact(aOrders)} orders · ₹{formatExact(Math.round(aCAC))} blended CAC
            </p>

            {/* Per-SKU breakdown */}
            <div className="space-y-2">
              {targets.products.map(t => {
                const actual = mtdPnl?.products.find(pr => pr.name === t.name)
                return <SkuRow key={t.code} t={t} actual={actual} daysElapsed={daysElapsed} daysTotal={daysTotal} redact={redact} />
              })}
            </div>
          </div>

          {/* Footer strip */}
          <div className="px-6 py-3 flex items-center justify-between" style={{ background: 'rgba(0,0,0,0.18)' }}>
            <span className="text-[10px]" style={{ color: 'rgba(233,213,246,0.65)' }}>Target vs Actual · built in-house</span>
            <span className="text-[10px] font-mono" style={{ color: 'rgba(233,213,246,0.5)' }}>everlasting.shop</span>
          </div>
        </div>

        <p className="text-center text-[11px] mt-3" style={{ color: 'rgba(255,255,255,0.6)' }}>
          Screenshot this card to post. Toggle redact to hide rupee figures.
        </p>
      </div>
    </div>
  )
}
