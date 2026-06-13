import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { getAllCache, setCacheEntry } from './supabase'

const DB_NAME = 'everlasting_profit'
const STORE_NAME = 'cache'
const DB_VERSION = 1

// ---- IndexedDB helpers (local fast-cache layer) ----
let dbInstance = null

function openDB() {
  if (dbInstance) return Promise.resolve(dbInstance)
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE_NAME) }
    req.onsuccess = () => { dbInstance = req.result; resolve(dbInstance) }
    req.onerror = () => reject(req.error)
  })
}

async function idbSet(key, value) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function idbGetAll() {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const keys = store.getAllKeys()
    const values = store.getAll()
    tx.oncomplete = () => {
      const result = {}
      keys.result.forEach((k, i) => { result[k] = values.result[i] })
      resolve(result)
    }
    tx.onerror = () => reject(tx.error)
  })
}

// ---- React Context ----
const DataContext = createContext(null)

export function DataProvider({ children }) {
  const [cache, setCache] = useState({})
  const [ready, setReady] = useState(false)
  const [syncing, setSyncing] = useState(false)

  // On mount: show local IndexedDB cache immediately (fast), then merge in the
  // shared Supabase cache so every browser/device sees the same fetched data.
  useEffect(() => {
    let cancelled = false

    // 1. Local cache first for instant paint
    idbGetAll().then(local => {
      if (!cancelled && local && Object.keys(local).length) {
        setCache(prev => ({ ...local, ...prev }))
      }
    }).catch(() => {})

    // 2. Shared cache from Supabase (source of truth)
    setSyncing(true)
    getAllCache().then(remote => {
      if (cancelled) return
      if (remote && Object.keys(remote).length) {
        setCache(prev => {
          const merged = { ...prev }
          for (const [k, v] of Object.entries(remote)) {
            const remoteHasOrders = Array.isArray(v?.orders) && v.orders.length > 0
            const localHasOrders = Array.isArray(merged[k]?.orders) && merged[k].orders.length > 0
            // Never let an empty/broken remote entry clobber a good local one
            if (!remoteHasOrders && localHasOrders) continue
            merged[k] = v
          }
          return merged
        })
        Object.entries(remote).forEach(([k, v]) => {
          if (Array.isArray(v?.orders) && v.orders.length > 0) idbSet(k, v).catch(() => {})
        })
      }
      setReady(true)
      setSyncing(false)
    }).catch(() => {
      // If Supabase is unreachable, fall back to whatever local cache we have
      setReady(true)
      setSyncing(false)
    })

    return () => { cancelled = true }
  }, [])

  const getCachedData = useCallback((since, until) => {
    const key = `${since}_${until}`
    return cache[key] || null
  }, [cache])

  // Assemble a date range from individual daily cache entries.
  // Returns null if ANY day in the range is missing (so callers know it's incomplete).
  const getAssembledRange = useCallback((since, until) => {
    const start = new Date(since + 'T00:00:00')
    const end = new Date(until + 'T00:00:00')
    let orders = [], metaCampaigns = [], metaRawSpend = 0
    let missing = 0, present = 0
    const d = new Date(start)
    while (d <= end) {
      const ds = d.toISOString().split('T')[0]
      const entry = cache[`${ds}_${ds}`]
      if (entry?.orders) {
        orders = orders.concat(entry.orders)
        metaCampaigns = metaCampaigns.concat(entry.metaCampaigns || [])
        metaRawSpend += entry.metaRawSpend || 0
        present++
      } else {
        missing++
      }
      d.setDate(d.getDate() + 1)
    }
    if (present === 0) return null
    return { orders, metaCampaigns, metaRawSpend, _assembled: true, _missingDays: missing, _presentDays: present }
  }, [cache])

  const setCachedData = useCallback((since, until, data) => {
    const key = `${since}_${until}`
    const entry = { ...data, fetchedAt: Date.now() }
    setCache(prev => ({ ...prev, [key]: entry }))
    idbSet(key, entry).catch(e => console.warn('IDB save failed:', e))
    setCacheEntry(key, data).catch(e => console.warn('Shared cache save failed:', e))
  }, [])

  // Generic cache for any key (used by Meta Ads etc)
  const getCacheByKey = useCallback((key) => cache[key] || null, [cache])

  const setCacheByKey = useCallback((key, data) => {
    const entry = { ...data, fetchedAt: Date.now() }
    setCache(prev => ({ ...prev, [key]: entry }))
    idbSet(key, entry).catch(e => console.warn('IDB save failed:', e))
    setCacheEntry(key, data).catch(e => console.warn('Shared cache save failed:', e))
  }, [])

  return (
    <DataContext.Provider value={{ cache, getCachedData, getAssembledRange, setCachedData, getCacheByKey, setCacheByKey, ready, syncing }}>
      {children}
    </DataContext.Provider>
  )
}

export function useDataStore() {
  return useContext(DataContext)
}
