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
export function termText(t: LeaderTerm, today: string): string {
  const s = t.start.slice(0, 4);
  if (t.end === null || t.end > today) return `since ${s}`;
  return s === t.end.slice(0, 4) ? `${monthName(t.start)} to ${monthName(t.end)} ${s}` : `${s} to ${t.end.slice(0, 4)}`;
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
  sources: { title: string; url: string }[];
}

/** Events of a year that the data has reached (nothing after the last observation). */
export function eventsInYear(events: AnnualEvent[], year: number, lastDate: string): AnnualEvent[] {
  return events.filter((e) => Number(e.date.slice(0, 4)) === year && e.date <= lastDate).sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** "September 22" / "December" / "During the year". */
export function eventDateText(e: AnnualEvent): string {
  if (e.precision === 'year') return 'During the year';
  if (e.precision === 'month') return MONTHS[Number(e.date.slice(5, 7)) - 1];
  return `${MONTHS[Number(e.date.slice(5, 7)) - 1]} ${Number(e.date.slice(8, 10))}`;
}

/** Only day-precision events get a dated marker and a moment in the timeline. */
export function isDated(e: AnnualEvent): boolean {
  return (e.precision ?? 'day') === 'day';
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

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function monthName(iso: string): string {
  return MONTHS[Number(iso.slice(5, 7)) - 1].slice(0, 3);
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
