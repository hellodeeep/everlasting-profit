// Vercel Serverless Function: /api/shopify/auth
// Step 1: Redirects to Shopify OAuth consent screen

export default async function handler(req, res) {
  const { SHOPIFY_CLIENT_ID, SHOPIFY_STORE } = process.env;
  const host = req.headers.host;
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const redirectUri = `${protocol}://${host}/api/shopify/callback`;

  if (!SHOPIFY_CLIENT_ID || !SHOPIFY_STORE) {
    return res.status(500).send(`
      <h2>Missing environment variables</h2>
      <p>Set SHOPIFY_CLIENT_ID and SHOPIFY_STORE in Vercel.</p>
    `);
  }

  const scopes = 'read_orders,read_products';
  const nonce = Math.random().toString(36).substring(2, 15);

  const authUrl = `https://${SHOPIFY_STORE}.myshopify.com/admin/oauth/authorize?client_id=${SHOPIFY_CLIENT_ID}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${nonce}`;

  res.redirect(302, authUrl);
}
