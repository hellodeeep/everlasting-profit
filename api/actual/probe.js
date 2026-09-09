// Diagnostic: GET /api/actual/probe?order=EL12345&id=1234567890
// Tries NimbusPost + Cashfree with several ID forms and returns raw responses.

import { createClient } from '@supabase/supabase-js';

async function getShopifyCredentials() {
  if (process.env.SHOPIFY_STORE && process.env.SHOPIFY_ACCESS_TOKEN) {
    return { store: process.env.SHOPIFY_STORE, token: process.env.SHOPIFY_ACCESS_TOKEN };
  }
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (url && key) {
    const sb = createClient(url, key);
    const { data } = await sb.from('profit_settings').select('data').limit(1).single();
    if (data?.data?.shopify_access_token) return { store: data.data.shopify_store || process.env.SHOPIFY_STORE, token: data.data.shopify_access_token };
  }
  return null;
}

async function shopifyGet(creds, path) {
  const r = await fetch(`https://${creds.store}.myshopify.com/admin/api/2024-10/${path}`, { headers: { 'X-Shopify-Access-Token': creds.token } });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

const NP = 'https://api.nimbuspost.com/v1/';
const CF = 'https://api.cashfree.com/pg/';
const NP_OLD = 'https://ship.nimbuspost.com/api/';

// V1 (ship.nimbuspost.com) uses the panel API key, not the login token
async function npOldGet(path) {
  const r = await fetch(NP_OLD + path, { headers: { 'NP-API-KEY': process.env.NIMBUS_API_KEY } });
  const j = await r.json().catch(async () => ({ text: (await r.text()).slice(0, 500) }));
  return { status: r.status, body: j };
}

async function npLogin() {
  const r = await fetch(NP + 'users/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.NIMBUS_EMAIL, password: process.env.NIMBUS_PASSWORD }),
  });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, token: j?.data?.token || j?.data || null, raw: j };
}

async function npGet(token, path) {
  const r = await fetch(NP + path, { headers: { Authorization: `Bearer ${token}` } });
  const j = await r.json().catch(async () => ({ text: (await r.text()).slice(0, 500) }));
  return { status: r.status, body: j };
}

async function cfGet(path) {
  const r = await fetch(CF + path, {
    headers: {
      'x-client-id': process.env.CASHFREE_APP_ID,
      'x-client-secret': process.env.CASHFREE_SECRET_KEY,
      'x-api-version': '2023-08-01',
    },
  });
  const j = await r.json().catch(async () => ({ text: (await r.text()).slice(0, 500) }));
  return { status: r.status, body: j };
}

// Keep responses readable: return object if small, else a truncated string preview
const cap = (o, n = 6000) => { const s = JSON.stringify(o); return s.length > n ? { preview: s.slice(0, n) + ' ...TRUNCATED', size: s.length } : o; };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { order = '', id = '', awb = '' } = req.query;
  const name = String(order).replace(/^#/, '');
  const out = { input: { order, id }, env: {
    nimbus: !!process.env.NIMBUS_EMAIL && !!process.env.NIMBUS_PASSWORD,
    nimbusApiKey: !!process.env.NIMBUS_API_KEY,
    cashfree: !!process.env.CASHFREE_APP_ID && !!process.env.CASHFREE_SECRET_KEY,
  }, nimbus: {}, cashfree: {} };

  // ---- Shopify: find order by name, pull transactions + fulfillments ----
  let awbs = [], cfCandidates = [];
  try {
    const creds = await getShopifyCredentials();
    if (creds && name) {
      const found = await shopifyGet(creds, `orders.json?name=${encodeURIComponent(name)}&status=any&limit=1`);
      const o = found.body?.orders?.[0];
      if (!o) { out.shopify = { status: found.status, error: 'order not found by name', body: cap(found.body) }; }
      else {
        const tx = await shopifyGet(creds, `orders/${o.id}/transactions.json`);
        awbs = (o.fulfillments || []).flatMap(f => f.tracking_number ? [f.tracking_number] : (f.tracking_numbers || []));
        out.shopify = {
          id: o.id, name: o.name, order_number: o.order_number, financial_status: o.financial_status, fulfillment_status: o.fulfillment_status,
          gateway: o.gateway, payment_gateway_names: o.payment_gateway_names, total_price: o.total_price, tags: o.tags,
          note_attributes: o.note_attributes,
          fulfillments: (o.fulfillments || []).map(f => ({ status: f.status, shipment_status: f.shipment_status, tracking_company: f.tracking_company, tracking_number: f.tracking_number, tracking_numbers: f.tracking_numbers, tracking_url: f.tracking_url })),
          refunds: (o.refunds || []).map(r => ({ id: r.id, created_at: r.created_at, note: r.note, transactions: (r.transactions || []).map(t => ({ kind: t.kind, amount: t.amount, gateway: t.gateway, status: t.status })) })),
          transactions: (tx.body?.transactions || []).map(t => ({ kind: t.kind, status: t.status, gateway: t.gateway, amount: t.amount, authorization: t.authorization, receipt: cap(t.receipt, 1500), payment_id: t.payment_id })),
        };
        // Harvest possible Cashfree order ids from transactions
        for (const t of (tx.body?.transactions || [])) {
          if (t.authorization) cfCandidates.push(String(t.authorization));
          if (t.payment_id) cfCandidates.push(String(t.payment_id));
          const rc = t.receipt || {};
          for (const k of ['order_id','orderId','cf_order_id','cfOrderId','x_order_id','order_token','reference','id','txnid']) if (rc[k]) cfCandidates.push(String(rc[k]));
        }
        for (const na of (o.note_attributes || [])) if (/cashfree|cf_|order/i.test(na.name)) cfCandidates.push(String(na.value));
      }
    } else if (!creds) out.shopify = { error: 'no shopify creds' };
  } catch (e) { out.shopify = { error: e.message }; }

  // ---- NimbusPost ----
  try {
    const login = await npLogin();
    out.nimbus.login = { status: login.status, gotToken: !!login.token, raw: login.token ? undefined : login.raw };
    if (login.token) {
      const t = login.token;
      const trackAwb = awb || awbs[0];
      if (trackAwb) {
        out.nimbus.trackByAwb = { awb: trackAwb, result: cap((await npGet(t, `shipments/track/${encodeURIComponent(trackAwb)}`)).body) };
      } else out.nimbus.trackByAwb = 'no AWB on the Shopify fulfillment';
      out.nimbus.loginTokenPreview = String(t).slice(0, 12) + '...';
    }
    if (process.env.NIMBUS_API_KEY) {
      out.nimbus.v1 = {};
      const tries = [
        `shipments?order_id=${encodeURIComponent(name)}`,
        `shipments?order_number=${encodeURIComponent(name)}`,
        `orders?order_id=${encodeURIComponent(name)}`,
        `shipments?per_page=3`,
      ];
      for (const p of tries) {
        const r = await npOldGet(p);
        out.nimbus.v1[p] = { status: r.status, body: cap(r.body) };
      }
    } else {
      out.nimbus.v1 = 'NIMBUS_API_KEY not set (needed for shipment list + freight charges)';
    }
  } catch (e) { out.nimbus.error = e.message; }

  // ---- Cashfree ----
  try {
    const cands = [...new Set([...cfCandidates, name, id].filter(Boolean))];
    out.cashfree.candidates = cands;
    out.cashfree.tries = {};
    for (const c of cands) {
      const r = await cfGet(`orders/${encodeURIComponent(c)}`);
      out.cashfree.tries[c] = { status: r.status, body: r.body };
      if (r.status === 200) {
        out.cashfree.payments = (await cfGet(`orders/${encodeURIComponent(c)}/payments`)).body;
        out.cashfree.refunds = (await cfGet(`orders/${encodeURIComponent(c)}/refunds`)).body;
        break;
      }
    }
  } catch (e) { out.cashfree.error = e.message; }

  return res.status(200).json(out);
}
