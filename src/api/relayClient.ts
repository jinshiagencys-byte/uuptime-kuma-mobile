// src/api/relayClient.ts
import { io, type Socket } from 'socket.io-client';

const RELAY_URL = process.env.EXPO_PUBLIC_RELAY_URL ?? 'https://kuma-relay.up.railway.app';
const RELAY_SECRET = process.env.EXPO_PUBLIC_RELAY_SECRET ?? '';

export interface DiscoveredPage {
  url: string;
  name: string;
}

export interface CreateMonitorGroupResult {
  groupId: string | number;
  created: (string | number)[];
  errors: string[];
}

export class RelayError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'RelayError';
    this.status = status;
  }
}

export type MonitorStatus = 'up' | 'down' | 'pending' | 'maintenance' | 'paused';

export interface MonitorItem {
  id: number;
  name: string;
  type: string;
  parent: number | null;
  parentName: string | null;
  active: boolean;
  status: MonitorStatus;
  msg: string | null;
  time: string | null;
  url?: string | null;
  avgPing?: number | null;
  uptime24h?: number | null;
  logoUrl?: string | null;
}

export interface MonitorsStats {
  up: number;
  down: number;
  pending: number;
  maintenance: number;
  paused: number;
}

export interface HeartbeatPoint {
  status: MonitorStatus;
  time: string;
  ping: number | null;
  msg: string | null;
}

export interface MonitorTlsInfo {
  daysRemaining: number;
  validTo: string;
  issuer: string | null;
}

export interface RecentIncident {
  title: string;       // ex: "Too Many Requests"
  startedAt: string;   // Date ISO
  durationMinutes: number;
  httpCode: number | null;
}

export interface OpenClawCrawlPage {
  url: string;
  status: 'UP' | 'DOWN' | string;
  http_code: number | null;
  action_tested: string | null;
  note: string | null;
}

export interface MonitorDetail {
  id: number;
  name: string;
  type: string;
  url: string | null;
  hostname: string | null;
  port: number | null;
  interval: number | null;
  notificationInterval: number | null;
  retryInterval: number | null;
  parent: number | null;
  parentName: string | null;
  active: boolean;
  status: MonitorStatus;
  msg: string | null;
  lastCheckedAt: string | null;
  uptime24h: number | null;
  uptime30d: number | null;
  logoUrl: string | null;
  clientName: string | null;
  assignee: string | null;
  lastCrawlStatus: string | null;
  lastCrawlReport: OpenClawCrawlPage[] | string | null;
  lastCrawledAt: string | null;
  sslValidTo: string | null;
  sslDaysRemaining: number | null;
  sslIssuer: string | null;
  loadTimeMs: number | null;
  metricsCheckedAt: string | null;
  crawlAcknowledged: boolean | null;
  lastHttpCode: number | null;
  recentIncidents: RecentIncident[];
}

// --- Fonctions HTTP génériques ---
async function relayFetch<T>(path: string, body: Record<string, unknown>): Promise<T> {
  if (!RELAY_SECRET) {
    throw new RelayError("EXPO_PUBLIC_RELAY_SECRET n'est pas défini.");
  }
  let response: Response;
  try {
    response = await fetch(`${RELAY_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-relay-secret': RELAY_SECRET },
      body: JSON.stringify(body),
    });
  } catch {
    throw new RelayError(`Impossible de joindre le relay (${RELAY_URL}).`);
  }
  let data: any = null;
  try {
    data = await response.json();
  } catch {
    throw new RelayError(`Réponse invalide du relay (status ${response.status}).`, response.status);
  }
  if (!response.ok || data?.success !== true) {
    throw new RelayError(data?.error || data?.message || `Erreur relay (status ${response.status})`, response.status);
  }
  return data as T;
}

async function relayFetchGet<T>(path: string): Promise<T> {
  if (!RELAY_SECRET) {
    throw new RelayError("EXPO_PUBLIC_RELAY_SECRET n'est pas défini.");
  }
  let response: Response;
  try {
    response = await fetch(`${RELAY_URL}${path}`, {
      method: 'GET',
      headers: { 'x-relay-secret': RELAY_SECRET },
    });
  } catch {
    throw new RelayError(`Impossible de joindre le relay (${RELAY_URL}).`);
  }
  let data: any = null;
  try {
    data = await response.json();
  } catch {
    throw new RelayError(`Réponse invalide du relay (status ${response.status}).`, response.status);
  }
  if (!response.ok || data?.success !== true) {
    throw new RelayError(data?.error || data?.message || `Erreur relay (status ${response.status})`, response.status);
  }
  return data as T;
}

async function relayFetchDelete<T>(path: string): Promise<T> {
  if (!RELAY_SECRET) {
    throw new RelayError("EXPO_PUBLIC_RELAY_SECRET n'est pas défini.");
  }
  let response: Response;
  try {
    response = await fetch(`${RELAY_URL}${path}`, {
      method: 'DELETE',
      headers: { 'x-relay-secret': RELAY_SECRET },
    });
  } catch {
    throw new RelayError(`Impossible de joindre le relay (${RELAY_URL}).`);
  }
  let data: any = null;
  try {
    data = await response.json();
  } catch {
    throw new RelayError(`Réponse invalide du relay (status ${response.status}).`, response.status);
  }
  if (!response.ok || data?.success !== true) {
    throw new RelayError(data?.error || data?.message || `Erreur relay (status ${response.status})`, response.status);
  }
  return data as T;
}

// --- API Métier ---
export async function getMonitors(): Promise<{ stats: MonitorsStats; monitors: MonitorItem[] }> {
  const data = await relayFetchGet<{ success: true; stats: MonitorsStats; monitors: MonitorItem[] }>('/monitors');
  return { stats: data.stats, monitors: data.monitors };
}

export async function getMonitorDetail(monitorId: number | string): Promise<{ monitor: MonitorDetail; history: HeartbeatPoint[] }> {
  const data = await relayFetchGet<{ success: true; monitor: MonitorDetail; history: HeartbeatPoint[] }>(`/monitors/${monitorId}`);
  return { monitor: data.monitor, history: data.history };
}

export async function discoverPages(url: string): Promise<DiscoveredPage[]> {
  const data = await relayFetch<{ success: true; pages: DiscoveredPage[] }>('/discover-pages', { url });
  return data.pages;
}

export async function discoverApis(url: string): Promise<string[]> {
  const data = await relayFetch<{ success: true; domains: string[] }>('/discover-apis', { url });
  return data.domains;
}

export async function createMonitorGroup(
  clientName: string,
  groupName: string,
  siteUrl: string,
  pages: DiscoveredPage[],
  assignee: string,
  frequency?: string,
  notificationFrequency?: string,
  apiEndpoints?: { url: string; name?: string }[]
): Promise<CreateMonitorGroupResult> {
  const data = await relayFetch<{ success: true } & CreateMonitorGroupResult>(
    '/create-monitor-group',
    {
      clientName,
      siteUrl,
      assignee,
      groupName,
      pages,
      frequency,
      notificationFrequency,
      apiEndpoints,
    }
  );
  return { groupId: data.groupId, created: data.created, errors: data.errors };
}

export async function createMonitor(
  name: string,
  url: string,
  assignee: string,
  frequency?: string,
  notificationFrequency?: string,
  groupName?: string
): Promise<{ monitorId: string | number }> {
  const data = await relayFetch<{ success: true; monitorId: string | number }>('/create-monitor', { name, url, assignee, frequency, notificationFrequency, groupName });
  return { monitorId: data.monitorId };
}

// --- Gestion des Monitors / Sites ---
export async function pauseMonitor(monitorId: number | string): Promise<{ success: true }> {
  return relayFetch<{ success: true }>(`/monitors/${monitorId}/pause`, {});
}

export async function resumeMonitor(monitorId: number | string): Promise<{ success: true }> {
  return relayFetch<{ success: true }>(`/monitors/${monitorId}/resume`, {});
}

export async function deleteMonitor(monitorId: number | string): Promise<{ success: true }> {
  return relayFetchDelete<{ success: true }>(`/monitors/${monitorId}`);
}

// Marque le site parent d'une page comme acquitté (crawl_acknowledged = true),
// ce qui réactive les checks OpenClaw sur ce site — route réelle du relay,
// à appeler avec le site_id (monitor.parent pour une page), pas l'id de la page.
export async function acknowledgeSite(siteId: number | string): Promise<{ success: true }> {
  return relayFetch<{ success: true }>(`/sites/${siteId}/acknowledge`, {});
}

// Alias de commodité pour la lisibilité dans les vues 'Site'
export const pauseSite = pauseMonitor;
export const resumeSite = resumeMonitor;
export const deleteSite = deleteMonitor;

// --- Gestion des Pages individuelles ---
export async function pausePage(pageId: number | string): Promise<{ success: true }> {
  return relayFetch<{ success: true }>(`/pages/${pageId}/pause`, {});
}

export async function resumePage(pageId: number | string): Promise<{ success: true }> {
  return relayFetch<{ success: true }>(`/pages/${pageId}/resume`, {});
}

export async function deletePage(pageId: number | string): Promise<{ success: true }> {
  return relayFetchDelete<{ success: true }>(`/pages/${pageId}`);
}

// --- Socket.IO Temps Réel ---
let socket: Socket | null = null;

export function subscribeToMonitors(
  onUpdate: (data: { stats: MonitorsStats; monitors: MonitorItem[] }) => void,
  onError?: (message: string) => void
): () => void {
  if (!RELAY_SECRET) {
    onError?.("EXPO_PUBLIC_RELAY_SECRET n'est pas défini, temps réel désactivé.");
    return () => {};
  }
  socket = io(RELAY_URL, {
    auth: { secret: RELAY_SECRET },
    reconnection: true,
  });
  socket.on('monitors:update', (data: { stats: MonitorsStats; monitors: MonitorItem[] }) => {
    onUpdate(data);
  });

  let hasLoggedError = false;
  socket.on('connect_error', () => {
    if (!hasLoggedError) {
      // Silencieux : le repli sur polling HTTP est automatique
      onError?.('Connexion temps réel indisponible, repli sur le rafraîchissement périodique.');
      hasLoggedError = true;
    }
  });
  return () => {
    socket?.disconnect();
    socket = null;
  };
}