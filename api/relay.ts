import type { VercelRequest, VercelResponse } from '@vercel/node';

// Whitelist des routes autorisées, par méthode.
// Le rewrite de vercel.json place le chemin demandé dans ?path=...
// (voir la regle "/api/relay/:path*" -> "/api/relay?path=:path*").
const ROUTES: Record<string, RegExp[]> = {
  GET: [/^\/monitors$/, /^\/monitors\/[\w-]+$/],
  POST: [
    /^\/discover-pages$/,
    /^\/discover-apis$/,
    /^\/create-monitor-group$/,
    /^\/create-monitor$/,
    /^\/monitors\/[\w-]+\/(pause|resume)$/,
    /^\/pages\/[\w-]+\/(pause|resume)$/,
    /^\/sites\/[\w-]+\/acknowledge$/,
  ],
  DELETE: [/^\/monitors\/[\w-]+$/, /^\/pages\/[\w-]+$/],
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const method = req.method || 'GET';
  const allowed = ROUTES[method];

  if (!allowed) {
    return res.status(405).json({ error: 'Method not allowed', method });
  }

  // Le rewrite place le chemin demandé dans ?path=...
  const raw = Array.isArray(req.query.path) ? req.query.path.join('/') : req.query.path ?? '';
  const path = '/' + String(raw).replace(/^\/+|\/+$/g, '');

  if (!allowed.some((r) => r.test(path))) {
    return res.status(403).json({ error: 'Path not allowed', path });
  }

  const relayUrl = process.env.RELAY_URL;
  const relaySecret = process.env.RELAY_SECRET;

  if (!relayUrl || !relaySecret) {
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  try {
    const upstream = await fetch(`${relayUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-relay-secret': relaySecret,
      },
      body: method === 'POST' ? JSON.stringify(req.body ?? {}) : undefined,
    });

    const data = await upstream.json();
    return res.status(upstream.status).json(data);
  } catch {
    return res.status(502).json({ error: 'Gateway error' });
  }
}
