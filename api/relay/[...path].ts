import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';

// Whitelist chemins publics (lecture seule - GET uniquement)
const ALLOWED_PATHS = [/^\/monitors$/, /^\/monitors\/[A-Za-z0-9_-]+$/];

const ALLOWED_METHODS = ['GET'];

function timingSafeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  try {
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    // Buffers of different length
    return false;
  }
}

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 1. Vérifier le mot de passe (header x-app-password)
  const clientPassword = (req.headers['x-app-password'] as string) || '';
  const expectedPassword = process.env.APP_PASSWORD || '';

  if (!expectedPassword) {
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  // Comparer hash SHA256 en timing-safe
  const clientHash = hashPassword(clientPassword);
  const expectedHash = hashPassword(expectedPassword);

  if (!timingSafeCompare(clientHash, expectedHash)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // 2. Vérifier méthode
  const method = req.method || 'GET';
  if (!ALLOWED_METHODS.includes(method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 3. Normaliser chemin (req.query.path peut être string ou string[])
  let pathArray = Array.isArray(req.query.path)
    ? req.query.path
    : req.query.path
    ? [req.query.path]
    : [];
  let path = '/' + pathArray.join('/');

  // 4. Vérifier chemin
  if (!ALLOWED_PATHS.some((regex) => regex.test(path))) {
    return res.status(403).json({ error: 'Path not allowed' });
  }

  // 5. Relayer au relay backend
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
