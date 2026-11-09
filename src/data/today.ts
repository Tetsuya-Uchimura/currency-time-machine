/**
 * "Today" rates for the ending.
 *
 * 1. Try the live endpoint (/api/today, a Cloudflare Pages Function that
 *    proxies Frankfurter and caches for a few hours).
 * 2. On any failure or timeout, fall back to the snapshot bundled at build
 *    time. The experience never breaks if the API is down.
 */

export interface TodayRate {
  /** Business day of the latest rate (YYYY-MM-DD). */
  date: string;
  /** Units per 1 USD. */
  rate: number;
  /** Units per 1 USD on the previous business day. */
  prev: number;
  prevDate: string;
}

export interface TodayData {
  base: string;
  asOf: string;
  source: 'live' | 'bundled';
  /** When this data was fetched from the API (ISO, UTC); set in the snapshot. */
  fetchedAt?: string;
  rates: Record<string, TodayRate>;
}

const LIVE_TIMEOUT_MS = 3500;

function isValid(d: unknown, codes: string[]): d is TodayData {
  if (!d || typeof d !== 'object') return false;
  const rates = (d as TodayData).rates;
  if (!rates || typeof rates !== 'object') return false;
  return codes.every((c) => {
    const r = rates[c];
    return r && r.rate > 0 && r.prev > 0 && typeof r.date === 'string';
  });
}

async function fetchJson(url: string, timeoutMs: number): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function loadToday(codes: string[]): Promise<TodayData | null> {
  try {
    const live = await fetchJson('/api/today', LIVE_TIMEOUT_MS);
    if (isValid(live, codes)) return { ...live, source: 'live' };
  } catch {
    /* fall through to the bundled snapshot */
  }
  try {
    const snap = await fetchJson(`${import.meta.env.BASE_URL}data/snapshot.json`, 10000);
    if (isValid(snap, codes)) return { ...snap, source: 'bundled' };
  } catch {
    /* no ending data at all: the ending shows the last historical week */
  }
  return null;
}
