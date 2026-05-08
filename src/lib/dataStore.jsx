import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'

const DB_NAME = 'everlasting_profit'
const STORE_NAME = 'cache'
const DB_VERSION = 1

// ---- IndexedDB helpers (no size limit like localStorage) ----
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE_NAME) }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbGet(key) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).get(key)
    req.onsuccess = () => resolve(req.result || null)
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
  const pendingSaves = useRef(new Set())

  // Load all cached data from IndexedDB on mount
  useEffect(() => {
    idbGetAll().then(data => {
      setCache(data)
      setReady(true)
    }).catch(() => setReady(true))
  }, [])

  const getCachedData = useCallback((since, until) => {
    const key = `${since}_${until}`
    return cache[key] || null
  }, [cache])

  const setCachedData = useCallback((since, until, data) => {
    const key = `${since}_${until}`
    const entry = { ...data, fetchedAt: Date.now() }

    // Update React state immediately
    setCache(prev => ({ ...prev, [key]: entry }))

    // Persist to IndexedDB in background (non-blocking)
    if (!pendingSaves.current.has(key)) {
      pendingSaves.current.add(key)
      idbSet(key, entry).catch(e => console.warn('Cache save failed:', e)).finally(() => {
        pendingSaves.current.delete(key)
      })
    }
  }, [])

  return (
    <DataContext.Provider value={{ cache, getCachedData, setCachedData, ready }}>
      {children}
    </DataContext.Provider>
  )
}

export function useDataStore() {
  return useContext(DataContext)
}
