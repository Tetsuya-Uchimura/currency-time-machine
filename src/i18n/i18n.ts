/**
 * Display language. English is the app's language and the source of every
 * text; Japanese is a review aid: a translation of the same English, shown in
 * subtitles and panels. The voice always speaks English, and the journey's
 * script, events and timing are the same in both (they are built once, in
 * English terms; only the words shown change).
 *
 * Two kinds of text, both looked up from English:
 *   templates  fixed lines and sentence patterns of the app (src/i18n/en.ts),
 *              translated in src/i18n/ja.ts next to a copy of the English they
 *              translate. A Japanese entry whose copy no longer equals the
 *              English is stale: it is not used (English is shown) and the
 *              tests fail until it is translated again.
 *   data text  event titles and summaries, portal texts, places, offices and
 *              people's names. Keyed by the English itself
 *              (content/i18n/ja-text.json, names from Wikidata's Japanese
 *              labels), built into public/data/i18n-ja.json by
 *              `npm run i18n`. Changed English simply has no translation yet:
 *              English is shown, and `npm run i18n -- --check` (and the
 *              tests) list it.
 *
 * Missing translations fall back to English; dev builds log each one once.
 * Numbers, currency codes, rates and dates are never translated: dates are
 * formatted from the same ISO date in each language.
 *
 * Pure (no DOM); state is the current language and the loaded data catalog.
 */
import { EN, type Key } from './en.ts';
import { JA } from './ja.ts';

export type Lang = 'en' | 'ja';
export type Params = Record<string, string | number>;

let current: Lang = 'en';
let text: Record<string, string> = {};
const listeners = new Set<(lang: Lang) => void>();
/** Lookups that fell back to English (dev log, and the tests). */
export const missing = new Set<string>();
const dev = typeof import.meta !== 'undefined' && !!(import.meta as { env?: { DEV?: boolean } }).env?.DEV;

export function getLang(): Lang {
  return current;
}

export function setLang(lang: Lang): void {
  if (lang === current) return;
  current = lang;
  for (const f of listeners) f(lang);
}

export function onLangChange(f: (lang: Lang) => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

/** The data catalog (English text -> Japanese), from public/data/i18n-ja.json. */
export function setTextCatalog(map: Record<string, string>): void {
  text = map;
}

function miss(what: string): void {
  if (missing.has(what)) return;
  missing.add(what);
  if (dev) console.warn(`[i18n] no Japanese for ${what}`);
}

/** Fill `{name}` placeholders. */
export function fmt(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));
}

/** A template (or fixed line) in a language; English when the translation is missing or stale. */
export function t(key: Key, params?: Params, lang: Lang = current): string {
  if (lang === 'ja') {
    const j = JA[key];
    if (j && j.en === EN[key]) return fmt(j.ja, params);
    miss(`template ${key}`);
  }
  return fmt(EN[key], params);
}

/** Data text (English source) in a language; the English itself when there is no translation. */
export function tr(english: string, lang: Lang = current): string {
  // (Numbers and codes alone, like "1984-1987", are the same in both.)
  if (lang !== 'ja' || !english || !/[A-Za-z]/.test(english)) return english;
  const j = text[english];
  if (j !== undefined) return j;
  miss(`text "${english.slice(0, 60)}"`);
  return english;
}

/** Japanese templates that are missing or translate an older English (for the tests and the check script). */
export function templateStatus(): { missing: Key[]; stale: Key[] } {
  const keys = Object.keys(EN) as Key[];
  return {
    missing: keys.filter((k) => !JA[k]),
    stale: keys.filter((k) => JA[k] && JA[k]!.en !== EN[k]),
  };
}

// ---------------------------------------------------------------------------
// Dates, lists and numbers in each language (from the same ISO date)
// ---------------------------------------------------------------------------

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAYS_JA = ['日', '月', '火', '水', '木', '金', '土'];

const parts = (iso: string) => ({ y: Number(iso.slice(0, 4)), m: Number(iso.slice(5, 7)), d: Number(iso.slice(8, 10)) });

/** "September" / "9月" */
export function monthText(iso: string, lang: Lang = current): string {
  const { m } = parts(iso);
  return lang === 'ja' ? `${m}月` : MONTHS[m - 1];
}

/** "September 22" / "9月22日" */
export function dayText(iso: string, lang: Lang = current): string {
  const { m, d } = parts(iso);
  return lang === 'ja' ? `${m}月${d}日` : `${MONTHS[m - 1]} ${d}`;
}

/** "Sep 22" / "9月22日" */
export function shortDayText(iso: string, lang: Lang = current): string {
  const { m, d } = parts(iso);
  return lang === 'ja' ? `${m}月${d}日` : `${MONTHS[m - 1].slice(0, 3)} ${d}`;
}

/** "September 22, 1985" / "1985年9月22日" */
export function fullDateText(iso: string, lang: Lang = current): string {
  const { y, m, d } = parts(iso);
  return lang === 'ja' ? `${y}年${m}月${d}日` : `${MONTHS[m - 1]} ${d}, ${y}`;
}

/** "22 September 1985" / "1985年9月22日" (the portals' style) */
export function longDateText(iso: string, lang: Lang = current): string {
  const { y, m, d } = parts(iso);
  return lang === 'ja' ? `${y}年${m}月${d}日` : `${d} ${MONTHS[m - 1]} ${y}`;
}

/** "Sunday, September 22" / "9月22日（日）" */
export function weekdayText(iso: string, lang: Lang = current): string {
  const day = new Date(`${iso.slice(0, 10)}T00:00:00Z`).getUTCDay();
  return lang === 'ja' ? `${dayText(iso, 'ja')}（${WEEKDAYS_JA[day]}）` : `${WEEKDAYS_EN[day]}, ${dayText(iso, 'en')}`;
}

/** "September 1985" / "1985年9月" */
export function monthYearText(iso: string, lang: Lang = current): string {
  const { y, m } = parts(iso);
  return lang === 'ja' ? `${y}年${m}月` : `${MONTHS[m - 1]} ${y}`;
}

/** "a, b and c" / "a、b、c" */
export function listText(items: string[], lang: Lang = current): string {
  if (lang === 'ja') return items.join('、');
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

// ---------------------------------------------------------------------------
// Line breaking (canvas text in both languages)
// ---------------------------------------------------------------------------

const CJK = '\u3000-\u303f\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\uff00-\uffef';
const TOKEN = new RegExp(`\\s+|[${CJK}]|[^\\s${CJK}]+`, 'g');
/** Never at the start of a line (Japanese line-breaking rules, kinsoku): closing marks, small kana. */
const NO_START = /^[、。，．・：；！？）」』】〕〉》ー々ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮ％～]/;
/** Never at the end of a line: opening marks. */
const NO_END = /[（「『【〔〈《]$/;

/**
 * Pieces a line may break between, each with whether a space precedes it.
 * English breaks at spaces; Japanese (which has none) between any two
 * characters, except before closing marks and after opening ones. Latin words
 * and numbers inside Japanese stay whole ("1,700", "IMF").
 */
export function wrapTokens(text: string): { t: string; space: boolean }[] {
  const out: { t: string; space: boolean }[] = [];
  let space = false;
  for (const m of text.match(TOKEN) ?? []) {
    if (/^\s+$/.test(m)) {
      space = true;
      continue;
    }
    const prev = out[out.length - 1];
    if (prev && !space && (NO_START.test(m) || NO_END.test(prev.t))) prev.t += m;
    else out.push({ t: m, space });
    space = false;
  }
  return out;
}
