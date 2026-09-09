// POST /api/actual/track  { awbs: ["..."] , force?: boolean }
// Returns { results: { [awb]: {norm, status, terminal, deliveredDate, rtoInitiateDate, rtoStatus, courier, orderNumber, eventTime} }, tracked, cached }
// Terminal statuses are served from Supabase; others are re-tracked via NimbusPost and upserted.
import { createClient } from '@supabase/supabase-js';

const NP = 'https://api.nimbuspost.com/v1/';
let tokenCache = { token: null, at: 0 };

async function npLogin() {
  if (tokenCache.token && Date.now() - tokenCache.at < 50 * 60 * 1000) return tokenCache.token;
  const r = await fetch(NP + 'users/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.NIMBUS_EMAIL, password: process.env.NIMBUS_PASSWORD }),
  });
  const j = await r.json().catch(() => ({}));
  const token = typeof j?.data === 'string' ? j.data : j?.data?.token;
  if (!token) throw new Error('NimbusPost login failed: ' + JSON.stringify(j).slice(0, 200));
  tokenCache = { token, at: Date.now() };
  return token;
}

export function normalizeStatus(d) {
  const s = String(d?.status || '').toLowerCase();
  const rto = String(d?.rto_status || '').toLowerCase();
  const rtoDate = d?.rto_initiate_date;
  if (s.includes('rto') || rto || rtoDate) {
    const delivered = s.includes('delivered') || rto.includes('delivered');
    return { norm: 'rto', terminal: delivered || s.includes('rto delivered') };
  }
  if (s === 'delivered' || s.includes('delivered')) return { norm: 'delivered', terminal: true };
  if (s.includes('cancel')) return { norm: 'cancelled', terminal: true };
  if (s.includes('lost') || s.includes('damage')) return { norm: 'lost', terminal: true };
  if (!s) return { norm: 'unknown', terminal: false };
  return { norm: 'in_transit', terminal: false };
}

function shape(d) {
  const n = normalizeStatus(d);
  return {
    awb: String(d.awb_number || d.awb || ''),
    orderNumber: d.order_number ? String(d.order_number) : null,
    status: d.status || null, norm: n.norm, terminal: n.terminal,
    courier: d.courier_name || null, paymentType: d.payment_type || null,
    deliveredDate: d.delivered_date || null, rtoInitiateDate: d.rto_initiate_date || null,
    rtoStatus: d.rto_status || null, eventTime: d.event_time || null,
  };
}

async function trackOne(token, awb) {
  const r = await fetch(NP + `shipments/track/${encodeURIComponent(awb)}`, { headers: { Authorization: `Bearer ${token}` } });
  const j = await r.json().catch(() => null);
  if (!j?.data) return { awb, status: null, norm: 'unknown', terminal: false, error: j?.message || `HTTP ${r.status}` };
  return shape({ ...j.data, awb_number: j.data.awb_number || awb });
}

async function trackBulk(token, awbs) {
  // Try the documented bulk endpoint first; fall back to parallel singles.
  try {
    const r = await fetch(NP + 'shipments/track/bulk', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ awb: awbs }),
    });
    const j = await r.json().catch(() => null);
    const arr = Array.isArray(j?.data) ? j.data : (j?.data && typeof j.data === 'object' ? Object.values(j.data) : null);
    if (r.ok && arr && arr.length) {
      const out = arr.filter(d => d && (d.awb_number || d.awb)).map(shape);
      if (out.length >= Math.min(awbs.length, 1)) return out;
    }
  } catch { /* fall through */ }
  const out = [];
  const CONC = 8;
  for (let i = 0; i < awbs.length; i += CONC) {
    const batch = awbs.slice(i, i + CONC);
    out.push(...(await Promise.all(batch.map(a => trackOne(token, a)))));
  }
  return out;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const awbs = [...new Set((req.body?.awbs || []).map(String).filter(Boolean))].slice(0, 300);
  const force = !!req.body?.force;
  if (!awbs.length) return res.status(200).json({ results: {}, tracked: 0, cached: 0 });
  if (!process.env.NIMBUS_EMAIL || !process.env.NIMBUS_PASSWORD) return res.status(500).json({ error: 'NimbusPost credentials not configured' });

  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const sb = url && key ? createClient(url, key) : null;

  const results = {};
  let cached = 0, tableMissingRead = false;
  let toTrack = awbs;

  if (sb && !force) {
    const { data, error } = await sb.from('shipment_tracking').select('*').in('awb', awbs);
    const missing = error && /does not exist|could not find the table|schema cache/i.test(error.message);
    if (error && !missing) return res.status(500).json({ error: 'Supabase read failed: ' + error.message });
    if (missing) tableMissingRead = error.message;
    const stale = Date.now() - 6 * 60 * 60 * 1000; // re-check non-terminal rows older than 6h
    (data || []).forEach(row => {
      const fresh = row.terminal || (row.updated_at && new Date(row.updated_at).getTime() > stale);
      if (fresh) {
        results[row.awb] = { awb: row.awb, orderNumber: row.order_number, status: row.status, norm: row.norm, terminal: row.terminal,
          courier: row.courier, paymentType: row.payment_type, deliveredDate: row.delivered_date, rtoInitiateDate: row.rto_initiate_date,
          rtoStatus: row.rto_status, eventTime: row.event_time };
        cached++;
      }
    });
    toTrack = awbs.filter(a => !results[a]);
  }

  let tracked = 0, tableMissing = false;
  if (toTrack.length) {
    const token = await npLogin();
    const fresh = await trackBulk(token, toTrack);
    fresh.forEach(r => { if (r.awb) { results[r.awb] = r; tracked++; } });
    if (sb) {
      const rows = fresh.filter(r => r.awb && !r.error).map(r => ({
        awb: r.awb, order_number: r.orderNumber, status: r.status, norm: r.norm, terminal: r.terminal,
        courier: r.courier, payment_type: r.paymentType, delivered_date: r.deliveredDate || null,
        rto_initiate_date: r.rtoInitiateDate || null, rto_status: r.rtoStatus, event_time: r.eventTime ? new Date(r.eventTime.replace(' ', 'T') + '+05:30').toISOString() : null,
        raw: null, updated_at: new Date().toISOString(),
      }));
      if (rows.length) {
        const { error } = await sb.from('shipment_tracking').upsert(rows, { onConflict: 'awb' });
        if (error) tableMissing = error.message;
      }
    }
  }

  return res.status(200).json({ results, tracked, cached, persisted: sb ? (tableMissing === false) : false,
    warning: (tableMissing || tableMissingRead) ? 'Tracking not saved to Supabase: ' + (tableMissing || tableMissingRead) : undefined });
}
