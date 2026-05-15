export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { token } = req.body || {};
  const validUser = process.env.APP_USERNAME || 'deep';
  const secret = process.env.APP_SECRET || 'ev-profit-secret';
  const validToken = Buffer.from(`${validUser}:${secret}`).toString('base64');

  if (token === validToken) return res.status(200).json({ valid: true });
  return res.status(401).json({ valid: false });
}
