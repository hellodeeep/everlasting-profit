import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null

// Fallback to localStorage if Supabase not configured
const LOCAL_KEY = 'everlasting_profit_data'

function getLocal() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}')
  } catch { return {} }
}
function setLocal(data) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(data))
}

// Products CRUD
export async function getProducts() {
  if (supabase) {
    const { data, error } = await supabase.from('products').select('*').order('created_at', { ascending: true })
    if (error) throw error
    return (data || []).map(row => ({ id: row.id, ...row.data, created_at: row.created_at }))
  }
  return getLocal().products || []
}

export async function upsertProduct(product) {
  if (supabase) {
    const { id, created_at, ...rest } = product
    if (id) {
      const { data, error } = await supabase.from('products').update({ name: rest.name, data: rest }).eq('id', id).select().single()
      if (error) throw error
      return { id: data.id, ...data.data }
    }
    const { data, error } = await supabase.from('products').insert({ name: rest.name, data: rest }).select().single()
    if (error) throw error
    return { id: data.id, ...data.data }
  }
  const local = getLocal()
  const products = local.products || []
  const idx = products.findIndex(p => p.id === product.id)
  if (idx >= 0) products[idx] = product
  else products.push({ ...product, id: product.id || crypto.randomUUID(), created_at: new Date().toISOString() })
  setLocal({ ...local, products })
  return product
}

export async function deleteProduct(id) {
  if (supabase) {
    const { error } = await supabase.from('products').delete().eq('id', id)
    if (error) throw error
    return
  }
  const local = getLocal()
  local.products = (local.products || []).filter(p => p.id !== id)
  setLocal(local)
}

// Settings CRUD
export async function getSettings() {
  if (supabase) {
    const { data, error } = await supabase.from('profit_settings').select('*').limit(1).single()
    if (error && error.code !== 'PGRST116') throw error
    return data?.data || {}
  }
  return getLocal().settings || {}
}

export async function saveSettings(settings) {
  if (supabase) {
    const { data: existing } = await supabase.from('profit_settings').select('id').limit(1).single()
    if (existing) {
      const { data, error } = await supabase.from('profit_settings').update({ data: settings }).eq('id', existing.id).select().single()
      if (error) throw error
      return data.data
    }
    const { data, error } = await supabase.from('profit_settings').insert({ data: settings }).select().single()
    if (error) throw error
    return data.data
  }
  const local = getLocal()
  setLocal({ ...local, settings })
  return settings
}

// ---- Shared data cache (keyed by date range) ----
// Lives in Supabase so the same cache is available across all browsers/devices.

// Pull every cached range at once (used on app load)
export async function getAllCache() {
  if (supabase) {
    const { data, error } = await supabase.from('profit_cache').select('*')
    if (error) throw error
    const result = {}
    ;(data || []).forEach(row => {
      result[row.cache_key] = { ...row.data, fetchedAt: row.fetched_at ? new Date(row.fetched_at).getTime() : Date.now() }
    })
    return result
  }
  try {
    return JSON.parse(localStorage.getItem('everlasting_profit_cache') || '{}')
  } catch { return {} }
}

// Write/overwrite one cached range
export async function setCacheEntry(key, data) {
  const entry = { ...data, fetchedAt: Date.now() }
  if (supabase) {
    const { fetchedAt, ...payload } = entry
    const { error } = await supabase.from('profit_cache').upsert({
      cache_key: key,
      data: payload,
      fetched_at: new Date().toISOString(),
    }, { onConflict: 'cache_key' })
    if (error) throw error
    return entry
  }
  try {
    const all = JSON.parse(localStorage.getItem('everlasting_profit_cache') || '{}')
    all[key] = entry
    localStorage.setItem('everlasting_profit_cache', JSON.stringify(all))
  } catch (e) { console.warn('Local cache save failed:', e) }
  return entry
}
