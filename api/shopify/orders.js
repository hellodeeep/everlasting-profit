import { createClient } from '@supabase/supabase-js';

async function getShopifyCredentials() {
  if (process.env.SHOPIFY_STORE && process.env.SHOPIFY_ACCESS_TOKEN) {
    return { store: process.env.SHOPIFY_STORE, token: process.env.SHOPIFY_ACCESS_TOKEN };
  }
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (supabaseUrl && supabaseKey) {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data } = await supabase.from('profit_settings').select('data').limit(1).single();
    if (data?.data?.shopify_access_token) {
      return { store: data.data.shopify_store || process.env.SHOPIFY_STORE, token: data.data.shopify_access_token };
    }
  }
  return null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const creds = await getShopifyCredentials();
  if (!creds) {
    return res.status(500).json({ error: 'Shopify not connected. Visit /api/shopify/auth to connect.' });
  }

  const { since, until, limit = 250 } = req.query;
  if (!since || !until) {
    return res.status(400).json({ error: 'since and until query params required (YYYY-MM-DD)' });
  }

  try {
    let allOrders = [];
    let url = `https://${creds.store}.myshopify.com/admin/api/2024-01/orders.json?status=any&limit=${limit}&created_at_min=${since}T00:00:00+05:30&created_at_max=${until}T23:59:59+05:30`;

    while (url) {
      const response = await fetch(url, {
        headers: { 'X-Shopify-Access-Token': creds.token, 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        const errText = await response.text();
        return res.status(response.status).json({ error: `Shopify API error: ${errText}` });
      }
      const data = await response.json();
      allOrders = allOrders.concat(data.orders || []);
      const linkHeader = response.headers.get('Link');
      if (linkHeader && linkHeader.includes('rel="next"')) {
        const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
        url = match ? match[1] : null;
      } else { url = null; }
    }

    const orders = allOrders.map(order => {
      const isCancelled = !!order.cancelled_at;
      const tags = order.tags || '';
      const gateways = order.payment_gateway_names || [];
      const isCOD = order.gateway === 'Cash on Delivery (COD)'
        || order.gateway === 'manual'
        || gateways.some(g => g.toLowerCase().includes('cod'))
        || tags.toLowerCase().includes('ppcod');

      return {
        id: order.order_number || order.id,
        createdAt: order.created_at,
        totalPrice: parseFloat(order.total_price || 0),
        paymentMethod: isCOD ? 'cod' : 'prepaid',
        fulfillmentStatus: order.fulfillment_status,
        cancelled: isCancelled,
        tags,
        lineItems: (order.line_items || []).map(item => ({
          title: item.title || '',
          variantTitle: item.variant_title || '',
          quantity: item.quantity || 1,
          price: parseFloat(item.price || 0),
          lineTotal: parseFloat(item.price || 0) * (item.quantity || 1),
        })),
      };
    });

    const active = orders.filter(o => !o.cancelled);
    const prepaid = active.filter(o => o.paymentMethod === 'prepaid');
    const cod = active.filter(o => o.paymentMethod === 'cod');

    return res.status(200).json({
      orders,
      summary: {
        totalOrders: orders.length,
        activeOrders: active.length,
        cancelledOrders: orders.length - active.length,
        prepaidOrders: prepaid.length,
        codOrders: cod.length,
        prepaidRate: active.length > 0 ? prepaid.length / active.length : 0,
        totalRevenue: active.reduce((s, o) => s + o.totalPrice, 0),
        prepaidRevenue: prepaid.reduce((s, o) => s + o.totalPrice, 0),
        codRevenue: cod.reduce((s, o) => s + o.totalPrice, 0),
      },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
