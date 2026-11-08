/**
 * Historical events and chapters.
 *
 * Two tiers keep the time-lapse moving:
 *   major  time slows down around the date, a low gong sounds, the sky shifts.
 *   minor  a caption only; time keeps flowing.
 *
 * Every event was checked against the bundled data (see README). Captions are
 * our own short factual sentences. Keep to plain ASCII punctuation: the UI
 * font is not guaranteed to have typographic glyphs.
 */

export type EventTier = 'major' | 'minor';

export interface HistoryEvent {
  id: string;
  /** Date the moment is anchored to (the slow-down is centered here). */
  date: string;
  tier: EventTier;
  /** Short heading shown above the caption, e.g. "1985". */
  label: string;
  text: string;
  /** Slots that react most visibly; they get a gentle highlight. */
  focus: string[];
  /** Optional custom slow-down (majors default to MAJOR_SLOWDOWN). */
  slow?: { width: number; depth: number };
}

export const EVENTS: HistoryEvent[] = [
  {
    id: 'dm-born',
    date: '1948-06-25',
    tier: 'minor',
    label: 'June 1948',
    text: 'West Germany launches a new currency, the Deutsche Mark. Rates are fixed to the dollar, and the dollar to gold.',
    focus: ['EUR'],
  },
  {
    id: 'sterling-1967',
    date: '1967-11-24',
    tier: 'minor',
    label: '1967',
    text: 'Britain devalues the pound from $2.80 to $2.40.',
    focus: ['GBP'],
  },
  {
    id: 'yen-joins',
    date: '1969-12-05',
    tier: 'minor',
    label: '1969',
    text: 'The yen joins the stream, held at 360 yen to the dollar since 1949.',
    focus: ['JPY'],
    // A gentle dip so the late-1960s captions do not crowd each other.
    slow: { width: 70, depth: 0.55 },
  },
  {
    id: 'nixon',
    date: '1971-08-20',
    tier: 'major',
    label: 'August 1971',
    text: 'The United States stops exchanging dollars for gold. The anchor is gone.',
    focus: ['JPY', 'EUR', 'CHF'],
  },
  {
    id: 'float',
    date: '1973-02-23',
    tier: 'major',
    label: '1973',
    text: 'Fixed exchange rates collapse. Currencies begin to float freely.',
    focus: ['JPY', 'EUR', 'CHF'],
  },
  {
    id: 'asia-arrives',
    date: '1981-01-09',
    tier: 'minor',
    label: '1981',
    text: 'The Chinese yuan and the Korean won enter the picture.',
    focus: ['CNY', 'KRW'],
  },
  {
    id: 'plaza',
    date: '1985-09-27',
    tier: 'major',
    label: 'September 1985',
    text: 'Five nations agree to push the dollar down. The yen and the mark soar.',
    focus: ['JPY', 'EUR'],
  },
  {
    id: 'black-wednesday',
    date: '1992-09-18',
    tier: 'minor',
    label: 'September 1992',
    text: "Speculators force the pound out of Europe's exchange-rate system.",
    focus: ['GBP'],
  },
  {
    id: 'asian-crisis',
    date: '1997-12-12',
    tier: 'major',
    label: '1997',
    text: 'A currency crisis sweeps across Asia. The Korean won loses almost half its value.',
    focus: ['KRW'],
  },
  {
    id: 'euro',
    date: '1999-01-01',
    tier: 'major',
    label: 'January 1999',
    text: 'Eleven countries adopt the euro. The Deutsche Mark passes on its light.',
    focus: ['EUR'],
  },
  {
    id: 'gfc',
    date: '2008-10-17',
    tier: 'major',
    label: '2008',
    text: 'A global financial crisis. Investors run to the dollar and the yen.',
    focus: ['JPY', 'KRW', 'AUD', 'GBP'],
  },
  {
    id: 'chf-shock',
    date: '2015-01-16',
    tier: 'minor',
    label: 'January 2015',
    text: 'Switzerland drops its cap on the franc, which jumps overnight.',
    focus: ['CHF'],
  },
  {
    id: 'brexit',
    date: '2016-06-24',
    tier: 'minor',
    label: 'June 2016',
    text: 'Britain votes to leave the European Union. The pound tumbles.',
    focus: ['GBP'],
  },
  {
    id: 'pandemic',
    date: '2020-03-20',
    tier: 'minor',
    label: 'March 2020',
    text: 'The pandemic sends investors rushing into dollars, for a few weeks.',
    focus: ['AUD', 'GBP', 'KRW'],
  },
  {
    id: 'yen-slide',
    date: '2022-10-21',
    tier: 'major',
    label: '2022',
    text: "US interest rates climb while Japan's stay near zero. The yen slides to its weakest in decades.",
    focus: ['JPY'],
  },
];

export interface Chapter {
  id: string;
  /** Button label (kept short for a small hand panel). */
  label: string;
  date: string;
}

export const CHAPTERS: Chapter[] = [
  { id: 'fixed', label: '1948', date: '1948-06-25' },
  { id: 'floating', label: '1971', date: '1971-06-04' },
  { id: 'crises', label: '1990', date: '1990-01-05' },
  { id: 'shocks', label: '2008', date: '2008-01-04' },
  { id: 'now', label: '2020', date: '2019-11-01' },
];

/** Date when the fixed-rate "era of silence" ends (Nixon Shock). */
export const FLOAT_START = '1971-08-13';

/** One-line onboarding hint, shown once before the first major event. */
export const HINT_TEXT = 'Pinch the panel to pause or jump in time. Pinch a light to hear it alone.';
