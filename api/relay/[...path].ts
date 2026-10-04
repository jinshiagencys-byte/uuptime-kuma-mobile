import type { VercelRequest, VercelResponse } from '@vercel/node';

// Whitelist des routes autorisées, par méthode.
// GET  : lecture des monitors
// POST : actions (discovery, création, pause/resume, acknowledge)
// DELETE: suppression monitors/pages
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

  // Chemin dérivé de req.url : indépendant de l'emplacement du fichier sur Vercel
  const pathname = new URL(req.url || '/', 'http://localhost').pathname;
  const path = pathname.replace(/^\/api\/relay/, '').replace(/\/$/, '') || '/';

  if (!allowed.some((r) => r.test(path))) {
    return res.status(403).json({ error: 'Path not allowed', path });
  }

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
      body: method === 'POST' ? JSON.stringify(req.body ?? {}) : undefined,
    });

    const data = await upstreamRes.json();
    return res.status(upstreamRes.status).json(data);
  } catch (err) {
    return res.status(502).json({ error: 'Gateway error' });
  }
}
