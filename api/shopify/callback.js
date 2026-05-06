// Vercel Serverless Function: /api/shopify/callback
// Step 2: Receives OAuth code, exchanges for access token, stores in Supabase

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  const { code, shop, state } = req.query;
  const { SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET, SHOPIFY_STORE } = process.env;
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!code) {
    return res.status(400).send('<h2>Error: No authorization code received</h2>');
  }

  try {
    // Exchange code for permanent access token
    const tokenRes = await fetch(`https://${SHOPIFY_STORE}.myshopify.com/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: SHOPIFY_CLIENT_ID,
        client_secret: SHOPIFY_CLIENT_SECRET,
        code,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      return res.status(500).send(`<h2>Token exchange failed</h2><pre>${errText}</pre>`);
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    // Store token in Supabase
    if (supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey);

      // Check if settings row exists
      const { data: existing } = await supabase
        .from('profit_settings')
        .select('id, data')
        .limit(1)
        .single();

      if (existing) {
        await supabase
          .from('profit_settings')
          .update({
            data: {
              ...existing.data,
              shopify_access_token: accessToken,
              shopify_store: SHOPIFY_STORE,
              shopify_connected_at: new Date().toISOString(),
            },
          })
          .eq('id', existing.id);
      } else {
        await supabase.from('profit_settings').insert({
          data: {
            shopify_access_token: accessToken,
            shopify_store: SHOPIFY_STORE,
            shopify_connected_at: new Date().toISOString(),
          },
        });
      }
    }

    // Success page
    res.status(200).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Shopify Connected</title>
        <style>
          body { font-family: system-ui; background: #0e0a14; color: #e9d5f6; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
          .card { background: rgba(55,35,72,0.4); border: 1px solid rgba(233,213,246,0.1); border-radius: 16px; padding: 48px; text-align: center; max-width: 500px; }
          h1 { color: #22c55e; margin-bottom: 8px; }
          p { color: #c4a3d9; line-height: 1.6; }
          code { background: rgba(14,10,20,0.6); padding: 2px 8px; border-radius: 4px; font-size: 13px; color: #e9d5f6; }
          a { color: #9b74b8; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>Shopify Connected</h1>
          <p>Access token has been saved. Your profit tracker can now pull order data.</p>
          <p style="margin-top: 24px; font-size: 14px;">
            Token: <code>${accessToken.substring(0, 8)}...${accessToken.substring(accessToken.length - 4)}</code>
          </p>
          <p style="margin-top: 24px;"><a href="/">Go to Dashboard</a></p>
        </div>
      </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send(`<h2>Error</h2><pre>${err.message}</pre>`);
  }
}
