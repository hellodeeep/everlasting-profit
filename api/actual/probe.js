// Diagnostic: GET /api/actual/probe?order=EL12345&id=1234567890
// Tries NimbusPost + Cashfree with several ID forms and returns raw responses.

const NP = 'https://api.nimbuspost.com/v1/';
const CF = 'https://api.cashfree.com/pg/';

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
  const { order = '', id = '' } = req.query;
  const name = String(order).replace(/^#/, '');
  const out = { input: { order, id }, env: {
    nimbus: !!process.env.NIMBUS_EMAIL && !!process.env.NIMBUS_PASSWORD,
    cashfree: !!process.env.CASHFREE_APP_ID && !!process.env.CASHFREE_SECRET_KEY,
  }, nimbus: {}, cashfree: {} };

  // ---- NimbusPost ----
  try {
    const login = await npLogin();
    out.nimbus.login = { status: login.status, gotToken: !!login.token, raw: login.token ? undefined : login.raw };
    if (login.token) {
      const t = login.token;
      const tries = [
        `shipments?order_id=${encodeURIComponent(name)}`,
        `shipments?order_number=${encodeURIComponent(name)}`,
        `shipments?order_id=${encodeURIComponent('#' + name)}`,
        `orders?order_id=${encodeURIComponent(name)}`,
        `orders?order_number=${encodeURIComponent(name)}`,
        `shipments?per_page=5`,
      ];
      out.nimbus.tries = {};
      for (const p of tries) {
        const r = await npGet(t, p);
        out.nimbus.tries[p] = { status: r.status, body: cap(r.body) };
      }
    }
  } catch (e) { out.nimbus.error = e.message; }

  // ---- Cashfree ----
  try {
    const cands = [...new Set([name, '#' + name, id, `EL${name}`, `${name}`].filter(Boolean))];
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
