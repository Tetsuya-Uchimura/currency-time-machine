/**
 * Historical content for the cards and portals: people (verified offices,
 * portraits), places (city photos) and policies. Built offline by
 * scripts/build_media.py from content/history.json; only facts that passed
 * verification and images whose license was checked are in the file.
 *
 * Pure (only the i18n templates), so the helpers can be unit tested with node:test.
 */

import { t, type Lang } from '../i18n/i18n.ts';

export interface MediaCredit {
  src: string;
  license: string;
  licenseUrl: string;
  artist: string;
  sourceUrl: string;
}

export interface HistoryPerson {
  key: string;
  name: string;
  /** Office at the time of the event, as shown. */
  role: string;
  involvement: string;
  verified: { source: string; qid: string; position: string; start: string | null; end: string | null };
  portrait: (MediaCredit & { date: string }) | null;
}

export interface HistoryPhoto extends MediaCredit {
  key: string;
  width: number;
  height: number;
  caption: string;
  taken: string;
}

export interface HistoryEventContent {
  id: string;
  /** The actual date of the decision (may differ from the weekly grid date). */
  date: string;
  title: string;
  where: { city: string; country: string; note?: string };
  summary: string;
  policies: string[];
  currencies: string[];
  people: HistoryPerson[];
  portal?: { period: string; photos: HistoryPhoto[] };
}

export type HistoryContent = Map<string, HistoryEventContent>;

/** Load the bundled content; null if missing (the app then uses impressions). */
export async function loadHistoryContent(baseUrl: string): Promise<HistoryContent | null> {
  try {
    const res = await fetch(`${baseUrl}data/history-content.json`);
    if (!res.ok) return null;
    const json = (await res.json()) as { events: HistoryEventContent[] };
    return new Map(json.events.map((e) => [e.id, e]));
  } catch {
    return null;
  }
}

/** Display names used in the live readout. */
export const CURRENCY_WORDS: Record<string, string> = {
  CAD: 'Canadian dollar',
  GBP: 'Pound',
  DEM: 'Mark',
  EUR: 'Euro',
  CHF: 'Swiss franc',
  INR: 'Rupee',
  CNY: 'Yuan',
  KRW: 'Won',
  JPY: 'Yen',
  AUD: 'Australian dollar',
};

/** Rates per USD with sensible precision: 1,743 / 241.6 -> 242 / 2.89 / 0.677. */
export function formatRate(r: number): string {
  if (r >= 100) return Math.round(r).toLocaleString('en-US');
  if (r >= 10) return r.toFixed(1);
  if (r >= 1) return r.toFixed(2);
  return r.toFixed(3);
}

/**
 * One line of "what happened": the currency's rate on the event date and at
 * the playhead, and the change in the currency's value against the dollar.
 * Before the date it only reports the current rate (nothing is anticipated).
 *   "Yen 242 → 198 per USD (+22% vs USD)"
 * `atEvent` and `now` are units of the currency per 1 USD.
 */
export function readoutLine(
  word: string,
  atEvent: number,
  now: number,
  reached: boolean,
  /** Dates of the two weekly observations ("Sep 20"), so the event's date is not mistaken for the rate's. */
  dates?: { event: string; now: string },
  lang: Lang = 'en',
): string {
  const paren = (d: string) => (lang === 'ja' ? `（${d}）` : ` (${d})`);
  const nowText = dates ? paren(dates.now) : '';
  if (!reached) return t('portal.readoutAt', { word, rate: formatRate(now), date: nowText }, lang);
  const pct = (atEvent / now - 1) * 100;
  const sign = pct >= 0 ? '+' : '-';
  const p = Math.abs(pct) < 9.95 ? Math.abs(pct).toFixed(1) : Math.abs(pct).toFixed(0);
  const eventText = dates ? paren(dates.event) : '';
  return t('portal.readout', { word, from: formatRate(atEvent), fromDate: eventText, to: formatRate(now), toDate: nowText, pct: `${sign}${p}` }, lang);
}
