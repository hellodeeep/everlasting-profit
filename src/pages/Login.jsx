import React, { useState } from 'react'
import { Zap, LogIn } from 'lucide-react'
import { useAuth } from '../lib/auth'

export default function Login() {
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const ok = await login(username, password)
    if (!ok) setError('Invalid username or password')
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-page p-4">
      <div className="glass-card p-8 w-full max-w-sm">
        <div className="flex items-center gap-3 mb-6 justify-center">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-ev-primary to-ev-glow flex items-center justify-center">
            <Zap size={20} className="text-ev-secondary" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-accent">EVERLASTING</h1>
            <p className="text-[10px] text-txt-muted tracking-widest uppercase">Profit Tracker</p>
          </div>
        </div>

        <div>
          <div className="space-y-4">
            <div>
              <label className="text-[11px] text-txt-muted uppercase tracking-wider mb-1.5 block">Username</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSubmit(e)}
                className="input-field"
                placeholder="Enter username"
                autoFocus
              />
            </div>
            <div>
              <label className="text-[11px] text-txt-muted uppercase tracking-wider mb-1.5 block">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSubmit(e)}
                className="input-field"
                placeholder="Enter password"
              />
            </div>

            {error && <p className="text-sm text-cash-red">{error}</p>}

            <button
              onClick={handleSubmit}
              disabled={loading || !username || !password}
              className="btn-primary w-full flex items-center justify-center gap-2 py-2.5"
            >
              <LogIn size={16} />
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </div>
        </div>

        <p className="text-[10px] text-txt-muted text-center mt-6">9 Figures Club Pvt Ltd</p>
      </div>
    </div>
  )
}
