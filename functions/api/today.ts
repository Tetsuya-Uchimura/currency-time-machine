/**
 * Cloudflare Pages Function: GET /api/today
 *
 * Returns the latest business-day USD rates and the previous business day's
 * rates for the currencies in the experience. Uses Frankfurter's default
 * composite rates only (no `providers` parameter).
 *
 * Resilience (the app must never break during judging):
 *   - Responses are cached at the edge for 3 hours.
 *   - Frankfurter can be slow; we answer within ~2.5 s. If the upstream call
 *     is still running, we reply 503 and let it finish in the background to
 *     fill the cache for the next visitor. The client then falls back to the
 *     snapshot bundled at build time (public/data/snapshot.json).
 *
 * Exchange rate data: Frankfurter (frankfurter.dev)
 * (No TS parameter properties/enums here: tests run it via Node type stripping.)
 */

export const CODES = ['EUR', 'GBP', 'CHF', 'CAD', 'JPY', 'AUD', 'INR', 'CNY', 'KRW'];
const API = 'https://api.frankfurter.dev/v2/rates';
const CACHE_SECONDS = 3 * 60 * 60;
const ANSWER_WITHIN_MS = 2500;
const LOOKBACK_DAYS = 14;

export interface RateRecord {
  date: string;
  base: string;
  quote: string;
  rate: number;
}

export interface TodayRate {
  date: string;
  rate: number;
  prev: number;
  prevDate: string;
}

/**
 * Latest weekday rate and the previous weekday's (different) rate.
 * Mirrors latest_and_previous() in scripts/build_history.py.
 */
export function latestAndPrevious(series: Map<string, number>): TodayRate | null {
  const isWeekday = (d: string) => {
    const day = new Date(d + 'T00:00:00Z').getUTCDay();
    return day !== 0 && day !== 6;
  };
  let dates = [...series.keys()].filter(isWeekday).sort();
  if (dates.length === 0) dates = [...series.keys()].sort();
  if (dates.length === 0) return null;
  const last = dates[dates.length - 1];
  const rate = series.get(last)!;
  for (let i = dates.length - 2; i >= 0; i--) {
    const v = series.get(dates[i])!;
    if (v !== rate) return { date: last, rate, prev: v, prevDate: dates[i] };
  }
  return { date: last, rate, prev: rate, prevDate: last };
}

/** Builds the response body from raw API records; throws if any code is missing. */
export function buildToday(records: RateRecord[], codes: string[] = CODES) {
  const byCode = new Map<string, Map<string, number>>();
  for (const r of records) {
    if (r.base !== 'USD' || !(r.rate > 0)) continue;
    if (!byCode.has(r.quote)) byCode.set(r.quote, new Map());
    byCode.get(r.quote)!.set(r.date, r.rate);
  }
  const rates: Record<string, TodayRate> = {};
  for (const code of codes) {
    const info = latestAndPrevious(byCode.get(code) ?? new Map());
    if (!info) throw new Error(`no data for ${code}`);
    rates[code] = info;
  }
  const asOf = Object.values(rates)
    .map((r) => r.date)
    .sort()
    .pop()!;
  return {
    attribution: 'Exchange rate data: Frankfurter (frankfurter.dev)',
    base: 'USD',
    asOf,
    source: 'live',
    rates,
  };
}

async function fetchToday(now: Date): Promise<Response> {
  const from = new Date(now.getTime() - LOOKBACK_DAYS * 86400000).toISOString().slice(0, 10);
  const url = `${API}?base=USD&quotes=${CODES.join(',')}&from=${from}`;
  const upstream = await fetch(url, { headers: { 'User-Agent': 'currency-time-machine/1.0' } });
  if (!upstream.ok) throw new Error(`upstream HTTP ${upstream.status}`);
  const body = buildToday((await upstream.json()) as RateRecord[]);
  return json(body, 200, `public, max-age=${CACHE_SECONDS}`);
}

function json(body: unknown, status: number, cacheControl: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cacheControl,
      'Access-Control-Allow-Origin': '*',
    },
  });
}

interface PagesContext {
  request: Request;
  waitUntil(promise: Promise<unknown>): void;
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  // `caches.default` is the Workers edge cache (not part of the DOM typings).
  const cache = (globalThis as unknown as { caches: { default: Cache } }).caches.default;
  const key = new Request(new URL('/api/today?v=1', context.request.url).toString());
  const hit = await cache.match(key);
  if (hit) return hit;

  const work = fetchToday(new Date()).then(async (res) => {
    await cache.put(key, res.clone());
    return res;
  });
  // Keep filling the cache even if we answer the client early.
  context.waitUntil(work.catch(() => undefined));

  const fallback = work.catch(() => json({ error: 'upstream unavailable' }, 502, 'no-store'));
  const slow = new Promise<Response>((resolve) =>
    setTimeout(() => resolve(json({ error: 'upstream slow, try again shortly' }, 503, 'no-store')), ANSWER_WITHIN_MS),
  );
  return Promise.race([fallback, slow]);
}
