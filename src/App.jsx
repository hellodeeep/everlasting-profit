import React from 'react'
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import { BarChart, Database, Settings, Zap } from 'lucide-react'
import { DataProvider } from './lib/dataStore'
import Dashboard from './pages/Dashboard'
import Products from './pages/Products'
import SettingsPage from './pages/Settings'

function Sidebar() {
  const linkClass = ({ isActive }) =>
    `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
      isActive
        ? 'bg-brand-800/60 text-accent border border-brand-600/30'
        : 'text-brand-300 hover:text-accent hover:bg-brand-900/40'
    }`

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-60 bg-brand-950/80 border-r border-brand-800/30 flex flex-col z-50">
      <div className="px-5 py-6 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-800 flex items-center justify-center">
          <Zap size={16} className="text-accent" />
        </div>
        <div>
          <h1 className="text-sm font-bold text-accent tracking-wide">EVERLASTING</h1>
          <p className="text-[10px] text-brand-400 tracking-widest uppercase">Profit Tracker</p>
        </div>
      </div>
      <nav className="flex-1 px-3 space-y-1 mt-4">
        <NavLink to="/" className={linkClass} end>
          <BarChart size={18} /> Dashboard
        </NavLink>
        <NavLink to="/products" className={linkClass}>
          <Database size={18} /> Product Database
        </NavLink>
        <NavLink to="/settings" className={linkClass}>
          <Settings size={18} /> Settings
        </NavLink>
      </nav>
      <div className="px-5 py-4 border-t border-brand-800/30">
        <p className="text-[10px] text-brand-500">9 Figures Club Pvt Ltd</p>
      </div>
    </aside>
  )
}

export default function App() {
  return (
    <DataProvider>
      <BrowserRouter>
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 ml-60 p-8">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/products" element={<Products />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </DataProvider>
  )
}
