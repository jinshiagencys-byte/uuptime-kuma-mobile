import type { VercelRequest, VercelResponse } from '@vercel/node';

// Whitelist chemins publics (lecture seule - GET uniquement)
const ALLOWED_PATHS = [/^\/monitors$/, /^\/monitors\/[A-Za-z0-9_-]+$/];

const ALLOWED_METHODS = ['GET'];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 1. Vérifier méthode
  const method = req.method || 'GET';
  if (!ALLOWED_METHODS.includes(method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 2. Normaliser chemin (req.query.path peut être string ou string[])
  let pathArray = Array.isArray(req.query.path)
    ? req.query.path
    : req.query.path
    ? [req.query.path]
    : [];
  let path = '/' + pathArray.join('/');

  // 3. Vérifier chemin
  if (!ALLOWED_PATHS.some((regex) => regex.test(path))) {
    return res.status(403).json({ error: 'Path not allowed' });
  }

  // 4. Relayer au relay backend
  const relayUrl = process.env.RELAY_URL;
  const relaySecret = process.env.RELAY_SECRET;

  if (!relayUrl || !relaySecret) {
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  try {
    const upstreamRes = await fetch(`${relayUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-relay-secret': relaySecret,
      },
    });

    const data = await upstreamRes.json();
    return res.status(upstreamRes.status).json(data);
  } catch (err) {
    return res.status(502).json({ error: 'Gateway error' });
  }
}
