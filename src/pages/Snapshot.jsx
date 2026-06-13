import React, { useState } from 'react'
import { Eye, EyeOff, X } from 'lucide-react'
import { formatExact } from '../lib/profitEngine'

const GST = 1.18

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

function SkuCard({ t, actual, proRate, redact }) {
  const aO = actual?.totalUnits || 0
  const aM = (actual?.metaSpend || 0) / GST
  const aP = actual?.profit || 0
  const aRev = actual?.revenue || 0
  const hasSpend = aM > 0
  const aCAC = aO > 0 && hasSpend ? aM / aO : 0
  const aAOV = aO > 0 ? aRev / aO : 0

  const tOrders = Math.round(t.ordersMonthly * proRate)
  const tProfit = Math.round((t.profitMonthly || 0) * proRate)

  const ordGood = pctTo(tOrders, aO) >= 90
  const cacGood = hasSpend && aCAC <= t.cac
  const aovGood = aAOV >= t.aov * 0.95
  const profitGood = pctTo(tProfit, aP) >= 90

  const green = '#34d399', red = '#f87171', dim = 'rgba(233,213,246,0.45)'

  const Metric = ({ label, value, target, good, hide, warn }) => (
    <div className="flex-1 min-w-0">
      <p className="uppercase tracking-wider mb-1" style={{ fontSize: '13px', color: 'rgba(233,213,246,0.5)' }}>{label}</p>
      <p className="font-bold font-mono leading-none" style={{ fontSize: '26px', color: warn ? red : good ? green : '#ffffff' }}>
        {hide ? '•••' : value}
      </p>
      <p className="font-mono mt-1.5" style={{ fontSize: '13px', color: dim }}>tgt {hide ? '•••' : target}</p>
    </div>
  )

  return (
    <div className="rounded-2xl px-6 py-5 h-full flex flex-col justify-center"
      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(233,213,246,0.14)' }}>
      <div className="flex items-center justify-between mb-4">
        <span className="font-mono font-bold px-3 py-1 rounded-lg" style={{ fontSize: '18px', background: '#e9d5f6', color: '#372348' }}>{t.code}</span>
        <span className="font-mono font-bold" style={{ fontSize: '14px', color: profitGood ? green : pctTo(tProfit, aP) >= 70 ? '#fbbf24' : red }}>
          {hasSpend ? `${pctTo(tProfit, aP)}% to goal` : 'no spend mapped'}
        </span>
      </div>
      <div className="flex gap-3">
        <Metric label="Orders" value={formatExact(aO)} target={formatExact(tOrders)} good={ordGood} hide={false} />
        <Metric label="CAC" value={hasSpend ? `₹${formatExact(Math.round(aCAC))}` : '--'} target={`₹${formatExact(Math.round(t.cac))}`} good={cacGood} hide={false} warn={!hasSpend} />
        <Metric label="AOV" value={`₹${formatExact(Math.round(aAOV))}`} target={`₹${formatExact(Math.round(t.aov))}`} good={aovGood} hide={redact} />
        <Metric label="Profit" value={`₹${compactINR(aP)}`} target={`₹${compactINR(tProfit)}`} good={profitGood} hide={redact} />
      </div>
    </div>
  )
}

export default function Snapshot({ targets, mtdPnl, monthName, daysElapsed, daysTotal, onClose }) {
  const [redact, setRedact] = useState(false)

  const proRate = daysElapsed >= daysTotal ? 1 : daysElapsed / daysTotal
  const isClosed = daysElapsed >= daysTotal
  const tProfitTotal = Math.round(targets.totalProfit * proRate)

  const aOrders = mtdPnl?.overview.activeOrders || 0
  const aProfit = mtdPnl?.profit.expected || 0
  const aRev = mtdPnl?.revenue.expectedRevenue || 0
  const aSpend = (mtdPnl?.expenses.metaAds || 0) / GST
  const aCAC = aOrders > 0 ? aSpend / aOrders : 0
  const aMargin = aRev > 0 ? aProfit / aRev : 0
  const profitPct = pctTo(tProfitTotal, aProfit)

  const green = '#34d399'
  const goalColor = profitPct >= 90 ? green : profitPct >= 70 ? '#fbbf24' : '#f87171'

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center p-4 overflow-auto"
      style={{ background: 'rgba(20,12,28,0.6)', backdropFilter: 'blur(4px)' }}>

      {/* Controls (excluded from screenshot) */}
      <div className="flex items-center gap-3 mb-4" style={{ width: 'min(95vw, 1100px)' }}>
        <button onClick={() => setRedact(r => !r)}
          className="flex items-center gap-1.5 font-medium px-4 py-2 rounded-lg"
          style={{ fontSize: '14px', background: 'rgba(255,255,255,0.92)', color: '#372348' }}>
          {redact ? <EyeOff size={15} /> : <Eye size={15} />}
          {redact ? 'Redacted (₹ hidden)' : 'Full numbers'}
        </button>
        <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.65)' }}>Screenshot the card below to post</span>
        <button onClick={onClose} className="ml-auto p-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.92)', color: '#372348' }}>
          <X size={18} />
        </button>
      </div>

      {/* 16:9 shareable card */}
      <div id="snapshot-card"
        style={{
          width: 'min(95vw, 1100px)',
          aspectRatio: '16 / 9',
          borderRadius: '28px',
          overflow: 'hidden',
          boxShadow: '0 30px 80px rgba(0,0,0,0.5)',
          background: 'linear-gradient(135deg, #2d1c3c 0%, #3d2750 45%, #543470 100%)',
          display: 'flex',
          flexDirection: 'column',
        }}>

        {/* Top brand bar */}
        <div className="flex items-center justify-between px-9 pt-7">
          <span className="font-black tracking-[0.25em] uppercase" style={{ fontSize: '20px', color: '#e9d5f6' }}>Everlasting</span>
          <span className="font-medium px-4 py-1.5 rounded-full" style={{ fontSize: '14px', background: 'rgba(233,213,246,0.14)', color: '#e9d5f6' }}>
            {monthName} {isClosed ? '· Final' : `· Day ${daysElapsed}/${daysTotal}`}
          </span>
        </div>

        {/* Body: hero left, sku grid right */}
        <div className="flex flex-1 px-9 pb-7 pt-5 gap-8" style={{ minHeight: 0 }}>

          {/* Hero panel */}
          <div className="flex flex-col justify-center" style={{ width: '34%' }}>
            <p className="uppercase tracking-wider mb-2" style={{ fontSize: '15px', color: 'rgba(233,213,246,0.65)' }}>
              {isClosed ? 'Net Profit' : 'Profit so far'}
            </p>
            <p className="font-black leading-none mb-3" style={{ fontSize: 'clamp(48px, 6vw, 76px)', color: '#ffffff' }}>
              {redact ? '••••' : `₹${compactINR(aProfit)}`}
            </p>
            <p className="font-bold mb-6" style={{ fontSize: '22px', color: goalColor }}>{profitPct}% of target</p>

            <div className="space-y-3">
              <div className="flex justify-between" style={{ borderTop: '1px solid rgba(233,213,246,0.14)', paddingTop: '12px' }}>
                <span style={{ fontSize: '15px', color: 'rgba(233,213,246,0.55)' }}>Margin</span>
                <span className="font-mono font-bold" style={{ fontSize: '15px', color: '#fff' }}>{(aMargin * 100).toFixed(1)}%</span>
              </div>
              <div className="flex justify-between">
                <span style={{ fontSize: '15px', color: 'rgba(233,213,246,0.55)' }}>Orders</span>
                <span className="font-mono font-bold" style={{ fontSize: '15px', color: '#fff' }}>{formatExact(aOrders)}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ fontSize: '15px', color: 'rgba(233,213,246,0.55)' }}>Blended CAC</span>
                <span className="font-mono font-bold" style={{ fontSize: '15px', color: '#fff' }}>₹{formatExact(Math.round(aCAC))}</span>
              </div>
            </div>
          </div>

          {/* SKU grid 2x2 */}
          <div className="grid grid-cols-2 grid-rows-2 gap-4 flex-1" style={{ minHeight: 0 }}>
            {targets.products.slice(0, 4).map(t => {
              const actual = mtdPnl?.products.find(pr => pr.name === t.name)
              return <SkuCard key={t.code} t={t} actual={actual} proRate={proRate} redact={redact} />
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-9 py-3 flex items-center justify-between" style={{ background: 'rgba(0,0,0,0.2)' }}>
          <span style={{ fontSize: '13px', color: 'rgba(233,213,246,0.6)' }}>Target vs Actual · vibecoded in-house</span>
          <span className="font-mono" style={{ fontSize: '13px', color: 'rgba(233,213,246,0.45)' }}>everlasting.shop</span>
        </div>
      </div>
    </div>
  )
}
