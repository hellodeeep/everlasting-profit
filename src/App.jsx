import React from 'react'
import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom'
import { BarChart, Database, Settings, Zap, Target, Activity } from 'lucide-react'
import { DataProvider } from './lib/dataStore'
import Dashboard from './pages/Dashboard'
import Products from './pages/Products'
import Targets from './pages/Targets'
import MetaAds from './pages/MetaAds'
import SettingsPage from './pages/Settings'

const NAV_ITEMS = [
  { to: '/', icon: BarChart, label: 'Dashboard', end: true },
  { to: '/targets', icon: Target, label: 'Targets' },
  { to: '/meta', icon: Activity, label: 'Meta Ads' },
  { to: '/products', icon: Database, label: 'Products' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

function MobileNav() {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t border-brand-300/50 z-50 safe-bottom">
      <div className="flex justify-around py-1">
        {NAV_ITEMS.map(item => (
          <NavLink key={item.to} to={item.to} end={item.end}
            className={({ isActive }) => `flex flex-col items-center gap-0.5 px-3 py-2 rounded-lg text-[10px] font-medium transition-all ${isActive ? 'text-accent' : 'text-txt-muted'}`}>
            <item.icon size={20} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

function DesktopSidebar() {
  const linkClass = ({ isActive }) =>
    `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
      isActive
        ? 'bg-white/15 text-white'
        : 'text-brand-300 hover:text-white hover:bg-white/10'
    }`

  return (
    <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-60 bg-brand-950 flex-col z-50">
      <div className="px-5 py-6 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
          <Zap size={16} className="text-brand-300" />
        </div>
        <div>
          <h1 className="text-sm font-bold text-white tracking-wide">EVERLASTING</h1>
          <p className="text-[10px] text-brand-400 tracking-widest uppercase">Profit Tracker</p>
        </div>
      </div>
      <nav className="flex-1 px-3 space-y-1 mt-4">
        {NAV_ITEMS.map(item => (
          <NavLink key={item.to} to={item.to} className={linkClass} end={item.end}>
            <item.icon size={18} /> {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="px-5 py-4 border-t border-white/10">
        <p className="text-[10px] text-brand-500">9 Figures Club Pvt Ltd</p>
      </div>
    </aside>
  )
}

function MobileHeader() {
  const location = useLocation()
  const current = NAV_ITEMS.find(n => n.end ? location.pathname === n.to : location.pathname.startsWith(n.to))
  return (
    <header className="md:hidden fixed top-0 left-0 right-0 bg-white/95 backdrop-blur border-b border-brand-300/50 z-50 safe-top">
      <div className="flex items-center px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-brand-950 flex items-center justify-center">
            <Zap size={14} className="text-brand-300" />
          </div>
          <div>
            <h1 className="text-xs font-bold text-accent tracking-wide">EVERLASTING</h1>
            <p className="text-[8px] text-txt-muted tracking-widest uppercase">{current?.label || 'Profit Tracker'}</p>
          </div>
        </div>
      </div>
    </header>
  )
}

export default function App() {
  return (
    <DataProvider>
      <BrowserRouter>
        <DesktopSidebar />
        <MobileHeader />
        <MobileNav />
        <main className="md:ml-60 md:p-8 p-4 pt-16 pb-24 md:pt-8 md:pb-8 min-h-screen">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/targets" element={<Targets />} />
            <Route path="/meta" element={<MetaAds />} />
            <Route path="/products" element={<Products />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
      </BrowserRouter>
    </DataProvider>
  )
}
