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
    // Use broader time window to avoid missing orders at boundaries
    // Shopify stores timestamps in UTC, so IST 00:00 = UTC 18:30 previous day
    const sinceISO = `${since}T00:00:00+05:30`;
    const untilISO = `${until}T23:59:59+05:30`;

    let url = `https://${creds.store}.myshopify.com/admin/api/2024-10/orders.json?status=any&limit=${limit}&created_at_min=${encodeURIComponent(sinceISO)}&created_at_max=${encodeURIComponent(untilISO)}&order=created_at+asc`;

    let pages = 0;
    while (url && pages < 50) {
      pages++;
      const response = await fetch(url, {
        headers: { 'X-Shopify-Access-Token': creds.token, 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        const errText = await response.text();
        return res.status(response.status).json({ error: `Shopify API error (${response.status}): ${errText.substring(0, 500)}` });
      }
      const data = await response.json();
      const batch = data.orders || [];
      allOrders = allOrders.concat(batch);

      // Pagination via Link header
      const linkHeader = response.headers.get('Link') || response.headers.get('link');
      if (linkHeader && linkHeader.includes('rel="next"')) {
        const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
        url = match ? match[1] : null;
      } else {
        url = null;
      }
    }

    // Process each order into clean structure
    const orders = allOrders.map(order => {
      const isCancelled = !!order.cancelled_at || (order.tags || '').toLowerCase().includes('order-cancelled');
      const tags = (order.tags || '').toLowerCase();
      const tagList = tags.split(',').map(t => t.trim());
      const gateways = (order.payment_gateway_names || []).map(g => g.toLowerCase());
      const gateway = (order.gateway || '').toLowerCase();

      // Payment classification:
      // 1. Check if prepaid (not COD at all)
      // 2. Check if C2P/PPCOD (partial payment collected)
      // 3. Pure COD (nothing collected upfront)
      const isCODGateway = gateway.includes('cod') || gateway === 'manual'
        || gateways.some(g => g.includes('cod') || g === 'manual');
      const isPPCOD = tagList.includes('ppcod');

      let paymentType;
      if (!isCODGateway) {
        paymentType = 'prepaid';
      } else if (isPPCOD) {
        paymentType = 'c2p'; // Cash to Prepaid - Rs.150 collected
      } else {
        paymentType = 'cod'; // Pure COD
      }

      return {
        id: order.order_number || order.id,
        shopifyId: order.id,
        name: order.name, // e.g., "#EV1234"
        createdAt: order.created_at,
        totalPrice: parseFloat(order.total_price || 0),
        subtotalPrice: parseFloat(order.subtotal_price || 0),
        totalDiscounts: parseFloat(order.total_discounts || 0),
        paymentType,
        gateway: order.gateway,
        financialStatus: order.financial_status,
        fulfillmentStatus: order.fulfillment_status,
        cancelled: isCancelled,
        tags: order.tags || '',
        lineItems: (order.line_items || []).map(item => ({
          id: item.id,
          title: item.title || '',
          variantTitle: item.variant_title || '',
          quantity: item.quantity || 1,
          price: parseFloat(item.price || 0),
          lineTotal: parseFloat(item.price || 0) * (item.quantity || 1),
          sku: item.sku || '',
          productId: item.product_id,
          variantId: item.variant_id,
        })),
        noteAttributes: order.note_attributes || [],
      };
    });

    // Summary
    const active = orders.filter(o => !o.cancelled);
    const prepaid = active.filter(o => o.paymentType === 'prepaid');
    const c2p = active.filter(o => o.paymentType === 'c2p');
    const cod = active.filter(o => o.paymentType === 'cod');

    return res.status(200).json({
      orders,
      summary: {
        totalOrders: orders.length,
        activeOrders: active.length,
        cancelledOrders: orders.length - active.length,
        prepaidOrders: prepaid.length,
        c2pOrders: c2p.length,
        codOrders: cod.length,
        prepaidRate: active.length > 0 ? prepaid.length / active.length : 0,
        totalRevenue: active.reduce((s, o) => s + o.totalPrice, 0),
        prepaidRevenue: prepaid.reduce((s, o) => s + o.totalPrice, 0),
        c2pRevenue: c2p.reduce((s, o) => s + o.totalPrice, 0),
        codRevenue: cod.reduce((s, o) => s + o.totalPrice, 0),
      },
      meta: {
        pagesLoaded: pages,
        rawOrderCount: allOrders.length,
        apiVersion: '2024-10',
        sinceISO,
        untilISO,
      }
    });
  } catch (err) {
    return res.status(500).json({ error: err.message, stack: err.stack?.substring(0, 300) });
  }
}
