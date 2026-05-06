import React, { createContext, useContext, useState, useEffect } from 'react'

const CACHE_KEY = 'everlasting_dashboard_v2'

const DataContext = createContext(null)

export function DataProvider({ children }) {
  const [rawData, setRawData] = useState(() => {
    try {
      const c = JSON.parse(localStorage.getItem(CACHE_KEY))
      return c || null
    } catch { return null }
  })

  // Save to localStorage whenever rawData changes
  useEffect(() => {
    if (rawData) {
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(rawData)) } catch {}
    }
  }, [rawData])

  return (
    <DataContext.Provider value={{ rawData, setRawData }}>
      {children}
    </DataContext.Provider>
  )
}

export function useDataStore() {
  return useContext(DataContext)
}
