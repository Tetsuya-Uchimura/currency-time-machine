/**
 * What the guide robot says, and when. Pure (type-only imports), unit tested
 * in tests/guide.test.ts.
 *
 * Every line is built from verified data: the year's events (sources checked
 * by scripts/build_events.py), the leaders of the year (scripts/
 * build_leaders.py) and numbers computed from the weekly rates. The five
 * featured years add a short opening of their own; any number in it is
 * computed here, never typed in.
 *
 * Language: every line is English (the voice says it) with its Japanese
 * review translation built from the same data and the same decisions
 * (`Beat.ja`): the sentence patterns are in src/i18n/en.ts and ja.ts, data
 * text (titles, summaries, places, names) goes through `tr`. The beats, their
 * order and their moments are built once, so both languages tell the same
 * journey at the same time.
 *
 * A year is told in five parts, in this order:
 *   A world     the year and its era, and the two or three places to watch
 *   B leaders   who governed those places (names only in the full build)
 *   C events    each dated event, at its date on the timeline
 *   D currency  the sharpest stretch while it happens; the year's result
 *   E summary   the year in two or three sentences (the summary panel)
 */
import type { AnnualChange, SlotLike, YearWindow } from '../data/annual-currency.ts';
import type { AnnualEvent, OfficeYear, RegionId } from '../data/annual-history.ts';
import { EN, type Key } from '../i18n/en.ts';
import { dayText, fmt, fullDateText, listText, monthText, t, tr, type Lang, type Params } from '../i18n/i18n.ts';

/** A line in both languages: `en` is said and shown in English, `ja` is its review translation. */
export interface Line {
  en: string;
  ja: string;
}

/** A fixed line or pattern from src/i18n in both languages. */
export function lineOf(key: Key, params?: Params): Line {
  return { en: t(key, params, 'en'), ja: t(key, params, 'ja') };
}

/** Build a text in both languages with one function. */
export function both(f: (lang: Lang) => string): Line {
  return { en: f('en'), ja: f('ja') };
}

/** Joins sentences: a space in English, nothing in Japanese. */
const sp = (lang: Lang) => (lang === 'ja' ? '' : ' ');

export type Mood = 'idle' | 'talking' | 'pointing' | 'excited' | 'traveling' | 'thinking';
export type Part = 'world' | 'leaders' | 'event' | 'currency' | 'summary';

export interface Beat {
  id: string;
  /** Week index at which the year's clock stops for this beat. */
  at: number;
  part: Part;
  /** English: said by the voice, shown in English. */
  text: string;
  /** The same line in Japanese (review translation, shown only). */
  ja: string;
  mood: Mood;
  /** The top band shows this region's leaders... */
  region?: RegionId;
  /** ...or this event. */
  eventId?: string;
  /** An event whose sources give no day: told without a moment, marker or gong of its own. */
  undated?: boolean;
  /** Slots lit on the chart and the map (others dim). */
  focus: string[];
  /** Map marker the robot points at ('USD' or a slot id). */
  point?: string;
}

/** The fixed lines in English (the same as src/i18n/en.ts). */
export const STRINGS = {
  intro: [EN['guide.intro.1'], EN['guide.intro.2'], EN['guide.intro.3']] as string[],
  select: EN['guide.select'] as string,
  warp: (year: number) => fmt(EN['guide.warp'], { year }),
  arrive: (year: number) => fmt(EN['guide.arrive'], { year }),
  full: EN['guide.full'] as string,
  noEvents: EN['guide.noEvents'] as string,
  ongoing: (date: string) => fmt(EN['guide.ongoing'], { date }),
  peopleHidden: EN['guide.peopleHidden'] as string,
};

/** The intro's keys, in order. */
export const INTRO_KEYS: Key[] = ['guide.intro.1', 'guide.intro.2', 'guide.intro.3'];

/** The guide's words for each currency ("the yen", "the Mark"). */
export const CURRENCY_NAMES: Record<string, string> = Object.fromEntries(
  ['CAD', 'GBP', 'DEM', 'EUR', 'CHF', 'INR', 'CNY', 'KRW', 'JPY', 'AUD'].map((c) => [c, EN[`cur.${c}` as Key]]),
);

function currencyWord(code: string, lang: Lang): string {
  const key = `cur.${code}` as Key;
  return key in EN ? t(key, undefined, lang) : code;
}

export interface YearContext {
  year: number;
  window: YearWindow;
  /** Week index of an ISO date. */
  indexOf: (iso: string) => number;
  slots: SlotLike[];
  /** Per slot (same order as `slots`). */
  changes: (AnnualChange | null)[];
  /** The year's events (verified), in date order. */
  events: AnnualEvent[];
  featured: RegionId[];
  leaders: (r: RegionId) => OfficeYear[];
  regionName: (r: RegionId) => string;
  /** How a region is governed (said instead of names in the contest-safe build). */
  regionSystem?: (r: RegionId) => string;
  /** Slots that stand for a region on this date (the euro area and Germany share EUR). */
  regionSlot: (r: RegionId) => string;
  era: { name: string; text: string };
  /** Show people's names (false in the contest-safe build). */
  showPeople: boolean;
  /** People named on an event card (verified), e.g. "James A. Baker III". */
  eventPeople?: (eventId: string) => string[];
  /** Last observed date (ISO). */
  lastDate: string;
}

/** A featured year's own opening (numbers computed from `ctx`). */
interface YearStory {
  featured: RegionId[];
  opening: (ctx: YearContext, lang?: Lang) => string;
}

const changeBetween = (ctx: YearContext, slot: string, fromIso: string, toIndex: number): number | null => {
  const s = ctx.slots.find((x) => x.slot === slot);
  if (!s) return null;
  const a = Math.ceil(ctx.indexOf(fromIso) - 1e-9);
  if (a < s.first || toIndex < a) return null;
  return (Math.exp(s.strength[toIndex] - s.strength[a]) - 1) * 100;
};

export const STORIES: Record<number, YearStory> = {
  1971: {
    featured: ['USA', 'JPN', 'DEU'],
    opening: (_ctx, lang = 'en') => t('story.1971', undefined, lang),
  },
  1985: {
    featured: ['USA', 'JPN', 'DEU'],
    opening: (ctx, lang = 'en') => {
      const mark = changeBetween(ctx, 'EUR', '1980-01-01', ctx.window.first);
      const yen = changeBetween(ctx, 'JPY', '1980-01-01', ctx.window.first);
      const since =
        mark !== null && yen !== null && mark < 0 && yen < 0
          ? t('story.1985.since', { mark: Math.abs(mark).toFixed(0), yen: Math.abs(yen).toFixed(0) }, lang)
          : '';
      return t('story.1985', { since }, lang);
    },
  },
  1997: {
    featured: ['KOR', 'JPN', 'USA'],
    opening: (_ctx, lang = 'en') => t('story.1997', undefined, lang),
  },
  2008: {
    featured: ['USA', 'GBR', 'KOR'],
    opening: (_ctx, lang = 'en') => t('story.2008', undefined, lang),
  },
  2022: {
    featured: ['USA', 'JPN', 'GBR'],
    opening: (_ctx, lang = 'en') => t('story.2022', undefined, lang),
  },
};

export const FEATURED_YEARS = [1971, 1985, 1997, 2008, 2022] as const;

/** Words for a slot on a date ("the Mark" before 1999). */
function word(ctx: YearContext, slot: string, k: number, lang: Lang = 'en'): string {
  const s = ctx.slots.find((x) => x.slot === slot);
  if (!s) return slot;
  let code = s.segments[0].code;
  for (const seg of s.segments) if (k >= seg.fromIndex) code = seg.code;
  return currencyWord(code, lang);
}

/** One sentence about who governs a region in the year (or how, without names). */
export function leaderSentence(ctx: YearContext, r: RegionId, lang: Lang = 'en'): string {
  const name = tr(ctx.regionName(r), lang);
  const offices = ctx.leaders(r);
  if (!ctx.showPeople) {
    // No names: say how the place is governed instead.
    const system = ctx.regionSystem?.(r);
    if (system) return t('leaders.system', { name, system: tr(system, lang) }, lang);
    const titles = offices.map((o) => t('leaders.office', { title: tr(o.office.title, lang) }, lang));
    return titles.length ? t('leaders.lookFor', { name, titles: listText(titles.slice(0, 2), lang) }, lang) : `${name}${lang === 'ja' ? '。' : '.'}`;
  }
  const parts: string[] = [];
  for (const o of offices.slice(0, 2)) {
    if (!o.terms.length) continue;
    const names = o.terms.map((x) => tr(x.name, lang));
    const who = names.length > 1 ? t('leaders.then', { first: names[0], rest: listText(names.slice(1), lang) }, lang) : names[0];
    const key = `role.${o.office.id}` as Key;
    parts.push(key in EN ? t(key, { who }, lang) : t('role.default', { title: tr(o.office.title, lang), who }, lang));
  }
  if (!parts.length) return t('leaders.none', { name }, lang);
  const joined = parts.join(t('leaders.sep', undefined, lang));
  if (r === 'EA') return t('leaders.inEuroArea', { parts: joined }, lang);
  if (r === 'CHE') return t('leaders.inSwitzerland', { parts: joined }, lang);
  return t('leaders.in', { name, parts: joined }, lang);
}

/** Events whose sources give no day, told once the year is over: "Also in 1950, on a day our sources don't give: ..." */
function undatedText(ctx: YearContext, events: AnnualEvent[], lang: Lang): string {
  return events
    .map((e) =>
      e.precision === 'month'
        ? t('event.undatedMonth', { month: monthText(e.date, lang), title: tr(e.title, lang), summary: tr(e.summary, lang) }, lang)
        : t('event.undatedYear', { year: ctx.year, title: tr(e.title, lang), summary: tr(e.summary, lang) }, lang),
    )
    .join(sp(lang));
}

function eventText(ctx: YearContext, e: AnnualEvent, lang: Lang): string {
  let text = t('event.line', { date: dayText(e.date, lang), title: tr(e.title, lang), summary: tr(e.summary, lang) }, lang);
  const people = ctx.showPeople ? (ctx.eventPeople?.(e.id) ?? []).slice(0, 2) : [];
  if (people.length) text += t('event.people', { people: listText(people.map((n) => tr(n, lang)), lang) }, lang);
  const k = Math.round(ctx.indexOf(e.date));
  const watch = e.currencies.filter((c) => c !== 'USD' && ctx.changes[ctx.slots.findIndex((s) => s.slot === c)]).slice(0, 3);
  if (watch.length) text += t('event.watch', { currencies: listText(watch.map((c) => word(ctx, c, k, lang)), lang) }, lang);
  return text;
}

/** Biggest comparable gainer and loser of the year. */
function extremes(ctx: YearContext): { up: AnnualChange | null; down: AnnualChange | null } {
  const comp = ctx.changes.filter((c): c is AnnualChange => !!c && c.comparable);
  let up: AnnualChange | null = null;
  let down: AnnualChange | null = null;
  for (const c of comp) {
    if (!up || c.pct > up.pct) up = c;
    if (!down || c.pct < down.pct) down = c;
  }
  return { up: up && up.pct > 0 ? up : null, down: down && down.pct < 0 ? down : null };
}

function pctWords(p: number): string {
  return `${Math.abs(p) < 9.95 ? Math.abs(p).toFixed(1) : Math.abs(p).toFixed(0)}%`;
}

/** The year's result in one or two sentences (Part D and the summary). */
export function resultSentence(ctx: YearContext, lang: Lang = 'en'): string {
  const { up, down } = extremes(ctx);
  const k = ctx.window.last;
  const span = t(ctx.window.ongoing ? 'result.soFar' : 'result.overYear', undefined, lang);
  // A "gain" under 1% is not worth naming as the year's winner.
  const bigUp = up && up.pct >= 1 ? up : null;
  const upWords = bigUp ? { up: word(ctx, bigUp.slot, k, lang), upPct: pctWords(bigUp.pct) } : null;
  const downWords = down ? { down: word(ctx, down.slot, k, lang), downPct: pctWords(down.pct) } : null;
  if (upWords && downWords) return t('result.both', { span, ...upWords, ...downWords }, lang);
  if (upWords) return t('result.up', { span, ...upWords }, lang);
  if (downWords) return t('result.down', { span, ...downWords }, lang);
  return t('result.flat', { span }, lang);
}

export function buildYearScript(ctx: YearContext): Beat[] {
  const w = ctx.window;
  const story = STORIES[ctx.year];
  const beats: Beat[] = [];
  const featuredSlots = ctx.featured.map((r) => ctx.regionSlot(r)).filter((s) => s !== 'USD');
  const clamp = (k: number) => Math.min(w.last, Math.max(w.first, k));

  // A. The world.
  const world = both((lang) => {
    const opening = story
      ? story.opening(ctx, lang)
      : t('guide.opening', { year: ctx.year, era: tr(ctx.era.name, lang), text: tr(ctx.era.text, lang) }, lang);
    const watch = ctx.featured.map((r) => tr(ctx.regionName(r), lang));
    let text = opening;
    if (!story && watch.length) text += sp(lang) + t('guide.lookAt', { places: listText(watch, lang) }, lang);
    if (w.ongoing) text += sp(lang) + t('guide.ongoing', { date: fullDateText(ctx.lastDate, lang) }, lang);
    if (!ctx.events.length) text += sp(lang) + t('guide.noEvents', undefined, lang);
    return text;
  });
  beats.push({ id: 'world', at: w.first, part: 'world', text: world.en, ja: world.ja, mood: 'excited', focus: featuredSlots });

  // B. Leaders of the featured places, a few weeks apart.
  ctx.featured.forEach((r, k) => {
    const slot = ctx.regionSlot(r);
    beats.push({
      id: `leaders-${r}`,
      at: clamp(w.first + 1 + 3 * k),
      part: 'leaders',
      ...texts(both((lang) => leaderSentence(ctx, r, lang))),
      mood: 'pointing',
      region: r,
      focus: slot === 'USD' ? [] : [slot],
      point: slot,
    });
  });

  // C. Dated events, at the first weekly observation on or after their day. Events whose sources give only the
  // month or the year get no moment of their own (see "undated" below): staging them on the 1st would invent a day.
  const dated = ctx.events.filter((e) => (e.precision ?? 'day') === 'day').slice(0, 5);
  for (const e of dated) {
    const k = clamp(Math.ceil(ctx.indexOf(e.date) - 1e-9));
    const focus = e.currencies.filter((c) => c !== 'USD');
    beats.push({
      id: `event-${e.id}`,
      at: k,
      part: 'event',
      ...texts(both((lang) => eventText(ctx, e, lang))),
      mood: 'excited',
      eventId: e.id,
      region: e.regions[0],
      focus,
      point: e.regions[0] ? ctx.regionSlot(e.regions[0]) : focus[0],
    });
  }

  // D1. Late starters: a currency's data begins inside the year.
  ctx.changes.forEach((c, i) => {
    if (!c || !c.late) return;
    const s = ctx.slots[i];
    beats.push({
      id: `joins-${s.slot}`,
      at: clamp(s.first),
      part: 'currency',
      ...texts(
        both((lang) =>
          t('joins', { currency: capitalIn(lang, word(ctx, s.slot, s.first, lang)), rate: rateText(c.rateFrom), code: c.codeFrom }, lang),
        ),
      ),
      mood: 'pointing',
      focus: [s.slot],
      point: s.slot,
    });
  });

  // D2. The sharpest stretch among the places to watch, unless an event is already there.
  const sharp = sharpestAmong(ctx, featuredSlots.length ? featuredSlots : ctx.slots.map((s) => s.slot));
  if (sharp && Math.abs(sharp.pct) >= 3 && !beats.some((b) => b.part === 'event' && Math.abs(b.at - sharp.end) < 5)) {
    beats.push({
      id: 'sharpest',
      at: clamp(sharp.end),
      part: 'currency',
      ...texts(
        both((lang) =>
          t(
            sharp.pct >= 0 ? 'sharpest.gained' : 'sharpest.lost',
            { currency: word(ctx, sharp.slot, sharp.end, lang), month: monthText(isoAt(ctx, sharp.end), lang), pct: pctWords(sharp.pct) },
            lang,
          ),
        ),
      ),
      mood: 'pointing',
      focus: [sharp.slot],
      point: sharp.slot,
    });
  }

  // C2. Events without a day: told together at the end of the year, said to be undated, with no stop of their own.
  const undated = ctx.events.filter((e) => (e.precision ?? 'day') !== 'day').slice(0, 2);
  if (undated.length) {
    const e = undated[0];
    beats.push({
      id: 'undated',
      at: w.last,
      part: 'event',
      ...texts(both((lang) => undatedText(ctx, undated, lang))),
      mood: 'thinking',
      eventId: e.id,
      undated: true,
      region: e.regions[0],
      focus: e.currencies.filter((c) => c !== 'USD'),
      point: e.regions[0] ? ctx.regionSlot(e.regions[0]) : undefined,
    });
  }

  // D3. The year's result, at its last week.
  const { up, down } = extremes(ctx);
  const resultFocus = [up?.slot, down?.slot].filter((s): s is string => !!s);
  beats.push({
    id: 'result',
    at: w.last,
    part: 'currency',
    ...texts(both((lang) => resultSentence(ctx, lang))),
    mood: 'pointing',
    focus: resultFocus,
    point: resultFocus[0],
  });

  // Stable order: by week, then by the order above (world, leaders, events, ...).
  return beats.map((b, k) => ({ b, k })).sort((x, y) => x.b.at - y.b.at || x.k - y.k).map((x) => x.b);
}

/** The guide's closing words over the summary panel (well under 30 seconds). */
export function summaryLine(ctx: YearContext, lang: Lang = 'en'): string {
  // (A title inside the sentence starts in lower case: 'and the Fed starts raising rates'.)
  const titles = ctx.events
    .slice(0, 2)
    .map((e, k) => (lang === 'en' ? e.title.replace(/^"|"$/g, '').replace(/^The /, k > 0 ? 'the ' : 'The ') : tr(e.title, lang)));
  const head = titles.length ? t('summary.titles', { year: ctx.year, titles: listText(titles, lang) }, lang) : t('summary.plain', { year: ctx.year }, lang);
  return t('summary.line', { head, result: resultSentence(ctx, lang) }, lang);
}

/** The summary line in both languages. */
export function summaryLines(ctx: YearContext): Line {
  return both((lang) => summaryLine(ctx, lang));
}

/** Text fields of a beat from a line. */
function texts(l: Line): { text: string; ja: string } {
  return { text: l.en, ja: l.ja };
}

function sharpestAmong(ctx: YearContext, slots: string[]): { slot: string; end: number; pct: number } | null {
  let best: { slot: string; end: number; pct: number } | null = null;
  const w = ctx.window;
  for (const slot of slots) {
    const s = ctx.slots.find((x) => x.slot === slot);
    if (!s) continue;
    for (let a = Math.max(w.first, s.first); a + 8 <= w.last; a++) {
      const pct = (Math.exp(s.strength[a + 8] - s.strength[a]) - 1) * 100;
      if (!best || Math.abs(pct) > Math.abs(best.pct)) best = { slot, end: a + 8, pct };
    }
  }
  return best;
}

function isoAt(ctx: YearContext, k: number): string {
  // Week k's date, from the year's axis (7 days per week).
  const days = Math.round((k - ctx.window.axisStart) * 7);
  const d = new Date(Date.UTC(ctx.year, 0, 1) + days * 86400000);
  return d.toISOString().slice(0, 10);
}

function capitalIn(lang: Lang, s: string): string {
  return lang === 'en' ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function rateText(r: number): string {
  if (r >= 100) return Math.round(r).toLocaleString('en-US');
  if (r >= 10) return r.toFixed(1);
  if (r >= 1) return r.toFixed(2);
  return r.toFixed(3);
}

/** Seconds a line needs on screen (and roughly to be spoken): ~15 characters a second. */
export function lineSeconds(text: string): number {
  return Math.min(16, Math.max(3.2, 0.9 + text.length / 15));
}
