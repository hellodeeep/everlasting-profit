export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { username, password } = req.body || {};
  const validUser = process.env.APP_USERNAME || 'deep';
  const validPass = process.env.APP_PASSWORD || 'everlasting2026';

  if (username === validUser && password === validPass) {
    const crypto = require('crypto');
    const token = crypto.createHash('sha256').update(`${validUser}:${validPass}:${process.env.APP_SECRET || 'ev-profit-secret'}`).digest('hex');
    return res.status(200).json({ success: true, token });
  }

  return res.status(401).json({ error: 'Invalid credentials' });
}
