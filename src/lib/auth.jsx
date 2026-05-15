import React, { createContext, useContext, useState, useEffect } from 'react'

const AuthContext = createContext(null)
const TOKEN_KEY = 'ev_auth_token'

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY))
  const [verified, setVerified] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    if (!token) { setChecking(false); return }
    fetch('/api/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    }).then(r => r.json()).then(d => {
      if (d.valid) setVerified(true)
      else { localStorage.removeItem(TOKEN_KEY); setToken(null) }
    }).catch(() => {
      // Offline - trust cached token
      setVerified(true)
    }).finally(() => setChecking(false))
  }, [token])

  const login = async (username, password) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json()
      if (data.success && data.token) {
        localStorage.setItem(TOKEN_KEY, data.token)
        setToken(data.token)
        setVerified(true)
        return { ok: true }
      }
      return { ok: false, error: data.error || 'Invalid credentials' }
    } catch (e) {
      return { ok: false, error: 'Connection failed. Try again.' }
    }
  }

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY)
    setToken(null)
    setVerified(false)
  }

  return (
    <AuthContext.Provider value={{ isLoggedIn: verified, checking, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
