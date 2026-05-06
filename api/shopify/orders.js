// Vercel Serverless Function: /api/shopify/orders
// Fetches orders from Shopify Admin API for a given date range

import { createClient } from '@supabase/supabase-js';

async function getShopifyCredentials() {
  // First try env vars
  if (process.env.SHOPIFY_STORE && process.env.SHOPIFY_ACCESS_TOKEN) {
    return { store: process.env.SHOPIFY_STORE, token: process.env.SHOPIFY_ACCESS_TOKEN };
  }
  // Fall back to Supabase (OAuth token stored there)
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
  const SHOPIFY_STORE = creds.store;
  const SHOPIFY_ACCESS_TOKEN = creds.token;

  const { since, until, limit = 250 } = req.query;
  if (!since || !until) {
    return res.status(400).json({ error: 'since and until query params required (YYYY-MM-DD)' });
  }

  try {
    let allOrders = [];
    let url = `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/orders.json?status=any&limit=${limit}&created_at_min=${since}T00:00:00+05:30&created_at_max=${until}T23:59:59+05:30`;

    // Paginate through all orders
    while (url) {
      const response = await fetch(url, {
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errText = await response.text();
        return res.status(response.status).json({ error: `Shopify API error: ${errText}` });
      }

      const data = await response.json();
      allOrders = allOrders.concat(data.orders || []);

      // Check for next page via Link header
      const linkHeader = response.headers.get('Link');
      if (linkHeader && linkHeader.includes('rel="next"')) {
        const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
        url = match ? match[1] : null;
      } else {
        url = null;
      }
    }

    // Process orders into a clean summary
    const summary = processOrders(allOrders);
    return res.status(200).json(summary);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

function processOrders(orders) {
  const productMap = {};
  let totalOrders = 0;
  let cancelledOrders = 0;
  let prepaidOrders = 0;
  let codOrders = 0;
  let fulfilledOrders = 0;
  let refundedOrders = 0;

  orders.forEach((order) => {
    totalOrders++;

    if (order.cancelled_at) { cancelledOrders++; return; }
    if (order.financial_status === 'refunded') { refundedOrders++; }

    const isCOD = order.gateway === 'Cash on Delivery (COD)'
      || order.gateway === 'manual'
      || order.payment_gateway_names?.some(g => g.toLowerCase().includes('cod'));

    if (isCOD) codOrders++;
    else prepaidOrders++;

    if (order.fulfillment_status === 'fulfilled') fulfilledOrders++;

    // Break down by product (line items)
    order.line_items?.forEach((item) => {
      const title = item.title || 'Unknown Product';
      const variant = item.variant_title || '';
      const key = title;

      if (!productMap[key]) {
        productMap[key] = {
          title,
          variant,
          totalQty: 0,
          totalRevenue: 0,
          prepaidQty: 0,
          codQty: 0,
          prepaidRevenue: 0,
          codRevenue: 0,
          cancelledQty: 0,
          orders: [],
        };
      }

      const qty = item.quantity || 1;
      const lineTotal = parseFloat(item.price) * qty;

      productMap[key].totalQty += qty;
      productMap[key].totalRevenue += lineTotal;

      if (isCOD) {
        productMap[key].codQty += qty;
        productMap[key].codRevenue += lineTotal;
      } else {
        productMap[key].prepaidQty += qty;
        productMap[key].prepaidRevenue += lineTotal;
      }
    });
  });

  return {
    overview: {
      totalOrders,
      cancelledOrders,
      prepaidOrders,
      codOrders,
      fulfilledOrders,
      refundedOrders,
      prepaidRate: totalOrders > 0 ? prepaidOrders / totalOrders : 0,
    },
    products: Object.values(productMap),
    rawOrderCount: orders.length,
  };
}
