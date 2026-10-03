// src/utils/monitors.ts
// Helpers partagés entre l'accueil (liste plate de groupes/monitors) et l'écran
// de détail (onglet « Monitor » qui liste les sous-moniteurs d'un groupe).
import type { MonitorItem, MonitorStatus } from '../api/relayClient';

/** Partie d'un monitor nécessaire aux calculs de disponibilité. */
export type AvailabilitySource = Pick<MonitorItem, 'uptime24h' | 'status'>;

/** Palette de couleurs par statut (le thème sombre et le thème clair ont la leur). */
export type StatusPalette = Record<MonitorStatus, string>;

/**
 * Seuil « jamais hors ligne ».
 * `uptime24h` est une fraction (0 → 1) et une moyenne de plusieurs
 * sous-moniteurs peut introduire du bruit flottant (0.9999999…), on considère
 * donc 100% à partir de 99.995%.
 */
export const FULL_AVAILABILITY_THRESHOLD = 99.995;

/**
 * Disponibilité d'un monitor en pourcentage (0 → 100).
 * Quand `uptime24h` est absente on se rabat sur le statut : un monitor actif
 * n'est jamais passé hors ligne, donc 100%.
 */
export function getAvailabilityPercent(monitor: AvailabilitySource): number {
  const value = monitor.uptime24h;
  if (value == null || Number.isNaN(value)) {
    return monitor.status === 'up' ? 100 : 0;
  }
  return clampPercent(Number(value) * 100);
}

/** `100%`, `99.95%` — 2 décimales utiles, comme sur la maquette. */
export function formatAvailabilityPercent(percent: number): string {
  return `${clampPercent(percent).toFixed(2).replace(/\.00$/, '')}%`;
}

/** true si le groupe/monitor n'a jamais été hors ligne. */
export function isFullyAvailable(percent: number): boolean {
  return percent >= FULL_AVAILABILITY_THRESHOLD;
}

/**
 * Moyenne de disponibilité : pour un groupe c'est la moyenne de ses
 * sous-moniteurs, sinon celle du monitor seul.
 * Un groupe sans sous-moniteur retombe sur sa propre disponibilité, et une
 * liste vide sans repli vaut 100% (rien à signaler).
 */
export function getAverageAvailability(
  monitors: AvailabilitySource[],
  fallback?: AvailabilitySource | null
): number {
  const source = monitors.length > 0 ? monitors : fallback ? [fallback] : [];
  if (source.length === 0) return 100;
  const total = source.reduce((sum, monitor) => sum + getAvailabilityPercent(monitor), 0);
  return clampPercent(total / source.length);
}

/**
 * Couleur d'une ligne « groupe / monitor » :
 * l'état prime (pause, maintenance, en attente, hors ligne), puis la
 * disponibilité décide — 100% = jamais hors ligne (vert), sinon rouge.
 */
export function getStatusTone(percent: number, status: MonitorStatus, palette: StatusPalette): string {
  if (status !== 'up') {
    return palette[status] ?? palette.up;
  }
  return isFullyAvailable(percent) ? palette.up : palette.down;
}

/** `https://api.exemple.com/ping/` → `api.exemple.com/ping` */
export function formatUrlLabel(url?: string | null): string | null {
  if (!url) return null;
  const label = url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/\/+$/, '');
  return label.length > 0 ? label : null;
}

/** Partie d'un monitor nécessaire pour retrouver son URL. */
export type UrlSource = { url?: string | null };

const URL_WITH_SCHEME = /^([a-z][a-z0-9+.-]*:\/\/[^/?#]+)([^?#]*)/i;
const URL_WITHOUT_SCHEME = /^([^/?#]+)([^?#]*)/;

/** Découpe une URL en origine (`https://exemple.com`) et chemin (`/tarifs`). */
function splitUrl(url: string): { origin: string; path: string } {
  const withScheme = URL_WITH_SCHEME.exec(url);
  if (withScheme) return { origin: withScheme[1], path: withScheme[2] ?? '' };
  // URL sans protocole (`exemple.com/tarifs`) : on garde ce qu'on peut.
  const withoutScheme = URL_WITHOUT_SCHEME.exec(url);
  return { origin: withoutScheme?.[1] ?? url, path: withoutScheme?.[2] ?? '' };
}

/** Remet une URL propre (`null` si vide). */
function normalizeUrl(url?: string | null): string | null {
  const trimmed = url?.trim();
  return trimmed ? trimmed : null;
}

/** true si l'URL pointe vers la racine du site, donc la page d'accueil. */
export function isHomePageUrl(url?: string | null): boolean {
  if (!url) return false;
  const { path } = splitUrl(url.trim());
  return path === '' || path === '/';
}

/**
 * URL principale d'un groupe / monitor : celle qui renvoie vers la page
 * d'accueil du site (`https://exemple.com`).
 * Un groupe n'expose pas toujours d'URL : on cherche alors parmi ses
 * sous-moniteurs celui qui pointe vers la racine, sinon on retombe sur
 * l'origine du premier (`https://exemple.com/tarifs` → `https://exemple.com`).
 * Renvoie `null` quand aucune URL n'est disponible.
 */
export function getPrimaryUrl(
  source: UrlSource | null | undefined,
  children: readonly UrlSource[] = []
): string | null {
  const own = normalizeUrl(source?.url);
  if (own) return own;

  const childUrls = children
    .map((child) => normalizeUrl(child.url))
    .filter((url): url is string => url !== null);
  if (childUrls.length === 0) return null;

  const homePage = childUrls.find(isHomePageUrl);
  if (homePage) return homePage;

  return splitUrl(childUrls[0]).origin;
}

/**
 * Chemin d'une sous-page : uniquement la partie située après le domaine,
 * pour distinguer les sous-moniteurs d'un même site.
 * `https://exemple.com/tarifs?x=1` → `/tarifs`, `https://exemple.com` → `/`.
 * Renvoie `null` quand la chaîne n'est pas une URL (ex. un nom de monitor).
 */
export function formatSubPagePath(url?: string | null): string | null {
  const normalized = normalizeUrl(url);
  if (!normalized) return null;

  const { path } = splitUrl(normalized);
  // Sans protocole et sans chemin, ce n'est pas une URL (`Tarifs` → null).
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(normalized) && path === '') return null;
  return path === '' ? '/' : path;
}

/**
 * Domaine d'une URL, sans protocole : `https://markhorus.com/tarifs` →
 * `markhorus.com`. Renvoie `null` quand la chaîne n'est pas une URL.
 */
export function formatUrlDomain(url?: string | null): string | null {
  const normalized = normalizeUrl(url);
  if (!normalized) return null;

  const { origin, path } = splitUrl(normalized);
  // Sans protocole et sans chemin, ce n'est pas une URL (`Tarifs` → null).
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(normalized) && path === '') return null;
  return origin.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
}

/** Textes affichés pour une sous-page d'un groupe. */
export interface SubPageLabels {
  /** Titre principal : le nom du monitor, ou son URL quand le nom est l'URL. */
  title: string;
  /** Domaine du site, affiché à côté du nom (`markhorus.com`). */
  site: string | null;
  /** Partie après le domaine (`/tarifs`), `null` si le nom est déjà l'URL. */
  path: string | null;
}

/**
 * Libellés d'une sous-page : le nom revient avec le domaine du site à côté et
 * le chemin ne garde que ce qui suit le domaine (ex. « /tarifs »).
 * Un monitor dont le nom vaut déjà l'URL n'est pas répété : on n'affiche que
 * `markhorus.com/tarifs` sans `https://`.
 */
export function getSubPageLabels(monitor: { name: string; url?: string | null }): SubPageLabels {
  const source = monitor.url ?? monitor.name;
  const urlLabel = formatUrlLabel(source) ?? monitor.name;
  const rawName = (monitor.name ?? '').trim();
  const nameIsUrl = rawName.length === 0 || formatUrlLabel(rawName) === urlLabel;

  if (nameIsUrl) return { title: urlLabel, site: null, path: null };
  return { title: rawName, site: formatUrlDomain(source), path: formatSubPagePath(source) };
}

function clampPercent(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, value));
}
