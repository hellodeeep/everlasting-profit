import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'

const DB_NAME = 'everlasting_profit'
const STORE_NAME = 'cache'
const DB_VERSION = 1

// ---- IndexedDB helpers ----
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
    setCache(prev => ({ ...prev, [key]: entry }))
    idbSet(key, entry).catch(e => console.warn('IDB save failed:', e))
  }, [])

  // Generic cache for any key (used by Meta Ads etc)
  const getCacheByKey = useCallback((key) => cache[key] || null, [cache])

  const setCacheByKey = useCallback((key, data) => {
    const entry = { ...data, fetchedAt: Date.now() }
    setCache(prev => ({ ...prev, [key]: entry }))
    idbSet(key, entry).catch(e => console.warn('IDB save failed:', e))
  }, [])

  return (
    <DataContext.Provider value={{ cache, getCachedData, setCachedData, getCacheByKey, setCacheByKey, ready }}>
      {children}
    </DataContext.Provider>
  )
}

export function useDataStore() {
  return useContext(DataContext)
}
