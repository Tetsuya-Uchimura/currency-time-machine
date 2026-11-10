/**
 * Year Journey: who led, and what happened, in any year from 1948 to today.
 * Pure (no runtime imports), unit tested in tests/annual.test.ts.
 *
 * Data (both built offline, committed, and verified; see the scripts):
 *   public/data/leaders.json        scripts/build_leaders.py: offices and terms
 *                                   from Wikidata, cross-checked against each
 *                                   person's English Wikipedia infobox
 *   public/data/annual-events.json  scripts/build_events.py: events whose date
 *                                   and keywords were found in their sources
 *
 * Nothing is filled in: a period with no recorded holder is shown as "no
 * verified record", and a year without a verified event says so.
 *
 * Regions and political systems: every place is described by its own system
 * (presidents, prime ministers, chancellors, a collective Federal Council, a
 * party leader), never "a president for everyone". The euro area has no head
 * of government: its common institution is the European Central Bank, and
 * member states keep their own leaders (Germany is shown with its own).
 */

import { dayText, monthText, shortDayText, t, tr, weekdayText, type Lang } from '../i18n/i18n.ts';

export type RegionId = 'USA' | 'CAN' | 'GBR' | 'DEU' | 'EA' | 'CHE' | 'IND' | 'CHN' | 'KOR' | 'JPN' | 'AUS';

export interface RegionInfo {
  id: RegionId;
  /** Currency slot (config SLOTS id), or 'USD' for the base. */
  slot: string;
  /** How the place is governed (shown with its leaders). */
  system: string;
}

export const REGIONS: Record<RegionId, RegionInfo> = {
  USA: { id: 'USA', slot: 'USD', system: 'Presidential republic: the President leads the government. The Federal Reserve sets interest rates.' },
  CAN: { id: 'CAN', slot: 'CAD', system: 'Constitutional monarchy: the Prime Minister leads the government.' },
  GBR: { id: 'GBR', slot: 'GBP', system: 'Constitutional monarchy: the Prime Minister leads the government.' },
  DEU: { id: 'DEU', slot: 'EUR', system: 'Federal parliamentary republic: the Chancellor leads the government.' },
  EA: { id: 'EA', slot: 'EUR', system: 'No single government: member states keep their own leaders. The European Central Bank sets monetary policy for all.' },
  CHE: { id: 'CHE', slot: 'CHF', system: 'Collective government: the seven-member Federal Council. Its presidency rotates every year.' },
  IND: { id: 'IND', slot: 'INR', system: 'Parliamentary republic: the Prime Minister leads the government.' },
  CHN: { id: 'CHN', slot: 'CNY', system: "One-party state: the Communist Party's leader, and the Premier who heads the government." },
  KOR: { id: 'KOR', slot: 'KRW', system: 'Presidential republic: the President leads the government.' },
  JPN: { id: 'JPN', slot: 'JPY', system: 'Constitutional monarchy: the Prime Minister leads the government.' },
  AUS: { id: 'AUS', slot: 'AUD', system: 'Constitutional monarchy: the Prime Minister leads the government.' },
};

/** The region's name on a date (Germany's changes with its history). */
export function regionName(id: RegionId, iso: string): string {
  switch (id) {
    case 'USA':
      return 'United States';
    case 'CAN':
      return 'Canada';
    case 'GBR':
      return 'United Kingdom';
    case 'DEU':
      if (iso < '1949-05-23') return 'Western zones of Germany';
      return iso < '1990-10-03' ? 'West Germany' : 'Germany';
    case 'EA':
      return 'Euro area';
    case 'CHE':
      return 'Switzerland';
    case 'IND':
      return 'India';
    case 'CHN':
      return 'China';
    case 'KOR':
      return 'South Korea';
    case 'JPN':
      return 'Japan';
    case 'AUS':
      return 'Australia';
  }
}

/** The regions a currency slot stands for on a date (the euro: the area, and Germany within it). */
export function regionsOfSlot(slot: string, iso: string): RegionId[] {
  if (slot === 'EUR') return iso >= '1999-01-01' ? ['EA', 'DEU'] : ['DEU'];
  const r = (Object.values(REGIONS) as RegionInfo[]).find((x) => x.slot === slot);
  return r ? [r.id] : [];
}

/** The region shown first for a map marker (slot or USD) on a date. */
export function regionOfMarker(id: string, iso: string): RegionId | null {
  return regionsOfSlot(id === 'USD' ? 'USD' : id, iso)[0] ?? null;
}

// ---------------------------------------------------------------------------
// Leaders
// ---------------------------------------------------------------------------

export interface Office {
  id: string;
  region: RegionId;
  qid: string;
  title: string;
  /** head: head of government (or of state and government); party: party leader; cb: central bank. */
  kind: 'head' | 'party' | 'cb';
}

export interface Portrait {
  src: string;
  license: string;
  licenseUrl: string;
  artist: string;
  sourceUrl: string;
}

export interface LeaderTerm {
  office: string;
  name: string;
  qid: string;
  start: string;
  end: string | null;
  portrait: Portrait | null;
  /** both: Wikidata and Wikipedia agree; wikidata / wikipedia: one source. */
  verified: 'both' | 'wikidata' | 'wikipedia';
}

export interface LeadersFile {
  source: string;
  generated: string;
  offices: Office[];
  terms: LeaderTerm[];
  gaps: { office: string; from: string; to: string }[];
}

export interface OfficeYear {
  office: Office;
  /** Terms overlapping the year (or its observed part), in order. */
  terms: LeaderTerm[];
  /** Parts of the year with no recorded holder. */
  gaps: { from: string; to: string }[];
}

const KIND_ORDER = { head: 0, party: 1, cb: 2 } as const;

/**
 * Offices of a region in a year, each with the people who held it during the
 * year (two or more when it changed hands) and any unrecorded stretch.
 * `until` caps the year at the last observed day (the latest year).
 */
export function leadersInYear(file: LeadersFile, region: RegionId, year: number, until?: string): OfficeYear[] {
  const y0 = `${year}-01-01`;
  let y1 = `${year}-12-31`;
  if (until && until < y1) y1 = until;
  const out: OfficeYear[] = [];
  for (const office of file.offices) {
    if (office.region !== region) continue;
    const terms = file.terms
      .filter((t) => t.office === office.id && t.start <= y1 && (t.end === null || t.end >= y0))
      .sort((a, b) => (a.start < b.start ? -1 : 1));
    const gaps = file.gaps.filter((g) => g.office === office.id && g.from < y1 && g.to > y0).map((g) => ({ from: g.from, to: g.to }));
    if (terms.length || gaps.length) out.push({ office, terms, gaps });
  }
  return out.sort((a, b) => KIND_ORDER[a.office.kind] - KIND_ORDER[b.office.kind]);
}

/** "since 1982" / "1982 to 1987" / "to Nov 1987" for a term seen from a year. */
export function termText(t0: LeaderTerm, today: string, lang: Lang = 'en'): string {
  const s = t0.start.slice(0, 4);
  if (t0.end === null || t0.end > today) return t('term.since', { year: s }, lang);
  return s === t0.end.slice(0, 4)
    ? t('term.months', { from: monthShort(t0.start, lang), to: monthShort(t0.end, lang), year: s }, lang)
    : t('term.years', { from: s, to: t0.end.slice(0, 4) }, lang);
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export interface AnnualEvent {
  id: string;
  date: string;
  /** day (default), or month / year when the sources give no more. */
  precision?: 'day' | 'month' | 'year';
  title: string;
  city: string;
  country: string;
  regions: RegionId[];
  currencies: string[];
  summary: string;
  /**
   * reviewed: checked against quotes from named (mostly primary) sources; matched: only an automatic check that
   * a Wikipedia passage has the date and keywords (scripts/build_events.py).
   */
  status?: 'reviewed' | 'matched';
  sources: EventSource[];
}

export interface EventSource {
  publisher?: string;
  title: string;
  url: string;
  primary?: boolean;
}

/** Events of a year that the data has reached (nothing after the last observation). */
export function eventsInYear(events: AnnualEvent[], year: number, lastDate: string): AnnualEvent[] {
  return events.filter((e) => Number(e.date.slice(0, 4)) === year && e.date <= lastDate).sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** "September 22" / "December" / "During the year". */
export function eventDateText(e: AnnualEvent, lang: Lang = 'en'): string {
  if (e.precision === 'year') return t('date.duringYear', undefined, lang);
  if (e.precision === 'month') return monthText(e.date, lang);
  return dayText(e.date, lang);
}

export function isDated(e: AnnualEvent): boolean {
  return (e.precision ?? 'day') === 'day';
}

/** What the sources do not give, for an event without a day ('' for a dated one). */
export function undatedNote(e: AnnualEvent, lang: Lang = 'en'): string {
  if (e.precision === 'year') return t('undated.year', undefined, lang);
  if (e.precision === 'month') return t('undated.month', undefined, lang);
  return '';
}

/** "Sunday, September 22" (the day of the week matters: rates are observed on Fridays). */
export function weekdayDate(iso: string, lang: Lang = 'en'): string {
  return weekdayText(iso, lang);
}

/**
 * The line on an event's card that tells the event's date from the rates' date:
 * the year stops at the first weekly observation on or after the event.
 */
export function observationNote(e: AnnualEvent, observedIso: string | null, lang: Lang = 'en'): string {
  if (!isDated(e)) return t('obs.undated', { note: undatedNote(e, lang) }, lang);
  if (!observedIso) return t('obs.none', undefined, lang);
  if (observedIso === e.date) return t('obs.same', { date: weekdayDate(observedIso, lang) }, lang);
  return t('obs.after', { event: weekdayDate(e.date, lang), date: weekdayDate(observedIso, lang) }, lang);
}

/** How an event was checked, and against whom (publishers only: never article titles, which may name people). */
export function sourcesNote(e: AnnualEvent, lang: Lang = 'en'): string {
  const sep = lang === 'ja' ? '、' : '; ';
  const names = [...new Set(e.sources.map((s) => s.publisher ?? 'Wikipedia'))];
  if (e.status === 'reviewed') {
    const primary = [...new Set(e.sources.filter((s) => s.primary).map((s) => s.publisher ?? ''))].filter(Boolean);
    const other = names.filter((n) => !primary.includes(n));
    const list = [
      ...(primary.length ? [t('src.primary', { names: primary.map((n) => tr(n, lang)).join(sep) }, lang)] : []),
      ...other.map((n) => tr(n, lang)),
    ].join(sep);
    return t('src.reviewed', { list }, lang);
  }
  const what = t(e.precision === 'year' ? 'src.what.year' : e.precision === 'month' ? 'src.what.month' : 'src.what.date', undefined, lang);
  return t('src.matched', { names: names.map((n) => tr(n, lang)).join(sep), what }, lang);
}

/**
 * The two or three places the guide introduces for a year: those in the
 * year's events first (the first-named region of an event counts most), then
 * the currencies that moved most. Ties keep a stable west-to-east order.
 */
export function featuredRegions(
  events: AnnualEvent[],
  moves: { slot: string; pct: number }[],
  iso: string,
  max = 3,
): RegionId[] {
  const score = new Map<RegionId, number>();
  const add = (r: RegionId, v: number) => score.set(r, (score.get(r) ?? 0) + v);
  for (const e of events) e.regions.forEach((r, k) => add(r, k === 0 ? 4 : 2));
  for (const m of moves) for (const r of regionsOfSlot(m.slot, iso).slice(0, 1)) add(r, Math.min(3, Math.abs(m.pct) / 4));
  // The euro area exists only from 1999; Germany before.
  if (iso < '1999-01-01') score.delete('EA');
  const order = Object.keys(REGIONS) as RegionId[];
  const ranked = [...score.entries()].filter(([, v]) => v > 0.25).sort((a, b) => b[1] - a[1] || order.indexOf(a[0]) - order.indexOf(b[0]));
  return ranked.slice(0, max).map(([r]) => r);
}

function monthShort(iso: string, lang: Lang): string {
  return lang === 'ja' ? monthText(iso, 'ja') : shortDayText(iso, 'en').split(' ')[0];
}

export async function loadAnnualData(baseUrl: string): Promise<{ leaders: LeadersFile | null; events: AnnualEvent[] }> {
  const get = async <T>(path: string): Promise<T | null> => {
    try {
      const res = await fetch(`${baseUrl}data/${path}`);
      return res.ok ? ((await res.json()) as T) : null;
    } catch {
      return null;
    }
  };
  const [leaders, events] = await Promise.all([get<LeadersFile>('leaders.json'), get<{ events: AnnualEvent[] }>('annual-events.json')]);
  return { leaders, events: events?.events ?? [] };
}
