/**
 * What the guide robot says, and when. Pure (type-only imports), unit tested
 * in tests/guide.test.ts.
 *
 * Every line is built from verified data: the year's events (sources checked
 * by scripts/build_events.py), the leaders of the year (scripts/
 * build_leaders.py) and numbers computed from the weekly rates. The five
 * featured years add a short opening of their own; any number in it is
 * computed here, never typed in. Text is English; `STRINGS` holds the fixed
 * lines so another language can be added in one place.
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

export type Mood = 'idle' | 'talking' | 'pointing' | 'excited' | 'traveling' | 'thinking';
export type Part = 'world' | 'leaders' | 'event' | 'currency' | 'summary';

export interface Beat {
  id: string;
  /** Week index at which the year's clock stops for this beat. */
  at: number;
  part: Part;
  text: string;
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

export const STRINGS = {
  intro: [
    'Welcome aboard the Currency Time Machine!',
    "I'm Tock, your guide to the history of money.",
    "Pick a year, and we'll travel back to see who shaped the world, what happened, and how currencies changed.",
  ],
  select: 'Which year shall we visit? Turn the dial, or pick a famous year. Then press Start Travel.',
  warp: (year: number) => `Hold on tight! Setting the dial to ${year}...`,
  arrive: (year: number) => `Here we are: ${year}.`,
  full: 'The full journey: every year from 1948 to today, in about four minutes. Pinch a currency to hear it alone.',
  noEvents: 'Our history file has no verified event for this year, so let us watch the currencies themselves.',
  ongoing: (date: string) => `This year is not over yet: our data runs to ${date}.`,
  peopleHidden: 'Names and portraits are not shown in this version.',
};

/** The guide's words for each currency ("the yen", "the Mark"). */
export const CURRENCY_NAMES: Record<string, string> = {
  CAD: 'the Canadian dollar',
  GBP: 'the pound',
  DEM: 'the Mark',
  EUR: 'the euro',
  CHF: 'the Swiss franc',
  INR: 'the rupee',
  CNY: 'the yuan',
  KRW: 'the won',
  JPY: 'the yen',
  AUD: 'the Australian dollar',
};

/** How a holder is named in a sentence, per office (others use the title). */
const ROLE: Record<string, { before?: string; after?: string }> = {
  'us-president': { before: 'President' },
  'us-fed': { after: 'chairs the Federal Reserve' },
  'ca-pm': { before: 'Prime Minister' },
  'ca-boc': { after: 'leads the Bank of Canada' },
  'uk-pm': { before: 'Prime Minister' },
  'uk-boe': { after: 'leads the Bank of England' },
  'de-chancellor': { before: 'Chancellor' },
  'de-bundesbank': { after: 'leads the Bundesbank' },
  'ea-ecb': { after: 'leads the European Central Bank' },
  'ch-president': { after: 'presides over the Federal Council' },
  'ch-snb': { after: 'leads the Swiss National Bank' },
  'in-pm': { before: 'Prime Minister' },
  'in-rbi': { after: 'leads the Reserve Bank of India' },
  'cn-chairman': { after: 'leads the Communist Party' },
  'cn-gensec': { after: 'leads the Communist Party' },
  'cn-premier': { before: 'Premier' },
  'cn-pboc': { after: "leads the People's Bank of China" },
  'kr-president': { before: 'President' },
  'kr-bok': { after: 'leads the Bank of Korea' },
  'jp-pm': { before: 'Prime Minister' },
  'jp-boj': { after: 'leads the Bank of Japan' },
  'au-pm': { before: 'Prime Minister' },
  'au-rba': { after: 'leads the Reserve Bank of Australia' },
};

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
  opening: (ctx: YearContext) => string;
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
    opening: () =>
      '1971. For more than twenty years, most major currencies have been fixed to the dollar, and the dollar to gold. This is the year that system breaks.',
  },
  1985: {
    featured: ['USA', 'JPN', 'DEU'],
    opening: (ctx) => {
      const mark = changeBetween(ctx, 'EUR', '1980-01-01', ctx.window.first);
      const yen = changeBetween(ctx, 'JPY', '1980-01-01', ctx.window.first);
      const since =
        mark !== null && yen !== null && mark < 0 && yen < 0
          ? ` Since 1980 the Mark has lost ${Math.abs(mark).toFixed(0)}% of its value against it, and the yen ${Math.abs(yen).toFixed(0)}%.`
          : '';
      return `1985. The dollar is strong.${since} In September, five major economies say other currencies should rise against it, and stand ready to cooperate.`;
    },
  },
  1997: {
    featured: ['KOR', 'JPN', 'USA'],
    opening: () =>
      '1997. From the middle of this year, money flows out of several East and Southeast Asian economies, and their currencies fall. Watch South Korea.',
  },
  2008: {
    featured: ['USA', 'GBR', 'KOR'],
    opening: () => '2008. A financial crisis that began in the United States is about to spread around the world.',
  },
  2022: {
    featured: ['USA', 'JPN', 'GBR'],
    opening: () => '2022. Prices rise fast around the world, and central banks raise interest rates. Watch the yen.',
  },
};

export const FEATURED_YEARS = [1971, 1985, 1997, 2008, 2022] as const;

/** Words for a slot on a date ("the Mark" before 1999). */
function word(ctx: YearContext, slot: string, k: number): string {
  const s = ctx.slots.find((x) => x.slot === slot);
  if (!s) return slot;
  let code = s.segments[0].code;
  for (const seg of s.segments) if (k >= seg.fromIndex) code = seg.code;
  return CURRENCY_NAMES[code] ?? code;
}

function list(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** One sentence about who governs a region in the year (or how, without names). */
export function leaderSentence(ctx: YearContext, r: RegionId): string {
  const name = ctx.regionName(r);
  const offices = ctx.leaders(r);
  if (!ctx.showPeople) {
    // No names: say how the place is governed instead.
    const system = ctx.regionSystem?.(r);
    if (system) return `${name}. ${system}`;
    const titles = offices.map((o) => `the ${o.office.title}`);
    return titles.length ? `In ${name}, look for ${list(titles.slice(0, 2))}.` : `${name}.`;
  }
  const parts: string[] = [];
  for (const o of offices.slice(0, 2)) {
    if (!o.terms.length) continue;
    const role = ROLE[o.office.id] ?? { before: o.office.title };
    const names = o.terms.map((t) => t.name);
    const who = names.length > 1 ? `${names[0]}, then ${list(names.slice(1))}` : names[0];
    parts.push(role.before ? `${role.before} ${who}` : `${who} ${role.after}`);
  }
  if (!parts.length) return `In ${name}, we have no verified record of who governed this year.`;
  const lead = r === 'EA' ? 'In the euro area' : r === 'CHE' ? 'In Switzerland, the Federal Council governs together' : `In ${name}`;
  return `${lead}: ${parts.join('; ')}.`;
}

/** Events whose sources give no day, told once the year is over: "Also in 1950, on a day our sources don't give: ..." */
function undatedText(ctx: YearContext, events: AnnualEvent[]): string {
  return events
    .map((e) =>
      e.precision === 'month'
        ? `Also in ${monthOf(e.date)}, on a day our sources do not give: ${e.title}. ${e.summary}`
        : `Also in ${ctx.year}, on a date our sources do not give: ${e.title}. ${e.summary}`,
    )
    .join(' ');
}

function eventText(ctx: YearContext, e: AnnualEvent): string {
  const date = `${monthOf(e.date)} ${Number(e.date.slice(8, 10))}`;
  let text = `${date}: ${e.title}. ${e.summary}`;
  const people = ctx.showPeople ? (ctx.eventPeople?.(e.id) ?? []).slice(0, 2) : [];
  if (people.length) text += ` Among those involved: ${list(people)}.`;
  const k = Math.round(ctx.indexOf(e.date));
  const watch = e.currencies.filter((c) => c !== 'USD' && ctx.changes[ctx.slots.findIndex((s) => s.slot === c)]).slice(0, 3);
  if (watch.length) text += ` Watch ${list(watch.map((c) => word(ctx, c, k)))}.`;
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
export function resultSentence(ctx: YearContext): string {
  const { up, down } = extremes(ctx);
  const k = ctx.window.last;
  const span = ctx.window.ongoing ? 'So far this year' : 'Over the year';
  const parts: string[] = [];
  // A "gain" under 1% is not worth naming as the year's winner.
  const bigUp = up && up.pct >= 1 ? up : null;
  if (bigUp) parts.push(`${word(ctx, bigUp.slot, k)} gained the most against the dollar, ${pctWords(bigUp.pct)}`);
  if (down) parts.push(`${word(ctx, down.slot, k)} lost the most${bigUp ? '' : ' against the dollar'}, ${pctWords(down.pct)}`);
  if (!parts.length) return `${span}, the currencies we follow barely moved against the dollar.`;
  const tail = !bigUp && down ? ' None of the others gained more than 1%.' : '';
  return `${span}, ${parts.join(', and ')}.${tail}`;
}

export function buildYearScript(ctx: YearContext): Beat[] {
  const w = ctx.window;
  const story = STORIES[ctx.year];
  const beats: Beat[] = [];
  const featuredSlots = ctx.featured.map((r) => ctx.regionSlot(r)).filter((s) => s !== 'USD');
  const clamp = (k: number) => Math.min(w.last, Math.max(w.first, k));

  // A. The world.
  const opening = story ? story.opening(ctx) : `${ctx.year}. ${ctx.era.name}. ${ctx.era.text}`;
  const watch = ctx.featured.map((r) => ctx.regionName(r));
  let worldText = opening;
  if (!story && watch.length) worldText += ` This year, let's look at ${list(watch)}.`;
  if (w.ongoing) worldText += ` ${STRINGS.ongoing(fullDate(ctx.lastDate))}`;
  if (!ctx.events.length) worldText += ` ${STRINGS.noEvents}`;
  beats.push({ id: 'world', at: w.first, part: 'world', text: worldText, mood: 'excited', focus: featuredSlots });

  // B. Leaders of the featured places, a few weeks apart.
  ctx.featured.forEach((r, k) => {
    const slot = ctx.regionSlot(r);
    beats.push({
      id: `leaders-${r}`,
      at: clamp(w.first + 1 + 3 * k),
      part: 'leaders',
      text: leaderSentence(ctx, r),
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
      text: eventText(ctx, e),
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
      text: `${capital(word(ctx, s.slot, s.first))} joins our data here, at ${rateText(c.rateFrom)} ${c.codeFrom} per US dollar.`,
      mood: 'pointing',
      focus: [s.slot],
      point: s.slot,
    });
  });

  // D2. The sharpest stretch among the places to watch, unless an event is already there.
  const sharp = sharpestAmong(ctx, featuredSlots.length ? featuredSlots : ctx.slots.map((s) => s.slot));
  if (sharp && Math.abs(sharp.pct) >= 3 && !beats.some((b) => b.part === 'event' && Math.abs(b.at - sharp.end) < 5)) {
    const name = word(ctx, sharp.slot, sharp.end);
    beats.push({
      id: 'sharpest',
      at: clamp(sharp.end),
      part: 'currency',
      text: `Look at ${name}: in the eight weeks to ${monthOf(isoAt(ctx, sharp.end))}, it ${sharp.pct >= 0 ? 'gained' : 'lost'} ${pctWords(sharp.pct)} against the dollar.`,
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
      text: undatedText(ctx, undated),
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
    text: resultSentence(ctx),
    mood: 'pointing',
    focus: resultFocus,
    point: resultFocus[0],
  });

  // Stable order: by week, then by the order above (world, leaders, events, ...).
  return beats.map((b, k) => ({ b, k })).sort((x, y) => x.b.at - y.b.at || x.k - y.k).map((x) => x.b);
}

/** The guide's closing words over the summary panel (well under 30 seconds). */
export function summaryLine(ctx: YearContext): string {
  // (A title inside the sentence starts in lower case: 'and the Fed starts raising rates'.)
  const titles = ctx.events.slice(0, 2).map((e, k) => e.title.replace(/^"|"$/g, '').replace(/^The /, k > 0 ? 'the ' : 'The '));
  const head = titles.length ? `That was ${ctx.year}: ${list(titles)}.` : `That was ${ctx.year}.`;
  return `${head} ${resultSentence(ctx)} Where shall we go next?`;
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

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function monthOf(iso: string): string {
  return MONTHS[Number(iso.slice(5, 7)) - 1];
}

function fullDate(iso: string): string {
  return `${monthOf(iso)} ${Number(iso.slice(8, 10))}, ${iso.slice(0, 4)}`;
}

function isoAt(ctx: YearContext, k: number): string {
  // Week k's date, from the year's axis (7 days per week).
  const days = Math.round((k - ctx.window.axisStart) * 7);
  const d = new Date(Date.UTC(ctx.year, 0, 1) + days * 86400000);
  return d.toISOString().slice(0, 10);
}

function capital(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
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
