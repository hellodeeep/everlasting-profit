import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'

const CACHE_KEY = 'everlasting_cache_v3'
const MAX_CACHE_ENTRIES = 45  // 31 days + multi-day ranges from Dashboard

const DataContext = createContext(null)

function loadCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY)) || {}
  } catch { return {} }
}

function saveCache(cache) {
  try {
    // Keep only the most recent MAX_CACHE_ENTRIES
    const keys = Object.keys(cache).sort((a, b) => {
      const ta = cache[a]?.fetchedAt || 0
      const tb = cache[b]?.fetchedAt || 0
      return tb - ta
    })
    const trimmed = {}
    keys.slice(0, MAX_CACHE_ENTRIES).forEach(k => { trimmed[k] = cache[k] })
    localStorage.setItem(CACHE_KEY, JSON.stringify(trimmed))
  } catch {}
}

export function DataProvider({ children }) {
  const [cache, setCache] = useState(loadCache)
  const [activeKey, setActiveKey] = useState(null)

  // Save to localStorage whenever cache changes
  useEffect(() => { saveCache(cache) }, [cache])

  const getCachedData = useCallback((since, until) => {
    const key = `${since}_${until}`
    return cache[key] || null
  }, [cache])

  const setCachedData = useCallback((since, until, data) => {
    const key = `${since}_${until}`
    setCache(prev => ({
      ...prev,
      [key]: { ...data, fetchedAt: Date.now() }
    }))
    setActiveKey(key)
  }, [])

  const getActiveData = useCallback(() => {
    return activeKey ? cache[activeKey] : null
  }, [activeKey, cache])

  return (
    <DataContext.Provider value={{ cache, getCachedData, setCachedData, activeKey, setActiveKey, getActiveData }}>
      {children}
    </DataContext.Provider>
  )
}

export function useDataStore() {
  return useContext(DataContext)
}
