/**
 * Tests for the Japanese review translation (src/i18n, content/i18n,
 * scripts/i18n.ts): nothing missing or stale, the same journey in both
 * languages, and no number lost in translation.
 * Run: node --test tests/i18n.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buildStatus } from '../scripts/i18n.ts';
import { SLOTS } from '../src/config.ts';
import { annualChanges, yearSpan, yearWindow } from '../src/data/annual-currency.ts';
import { eventsInYear, featuredRegions, leadersInYear, observationNote, REGIONS, regionName, sourcesNote, type AnnualEvent, type LeadersFile, type RegionId } from '../src/data/annual-history.ts';
import { eraAt } from '../src/data/eras.ts';
import { readoutLine } from '../src/data/history-content.ts';
import { Timeline, type HistoryFile } from '../src/data/timeline.ts';
import { buildYearScript, STORIES, summaryLines, type YearContext } from '../src/guide/guide-scripts.ts';
import { EN } from '../src/i18n/en.ts';
import { JA } from '../src/i18n/ja.ts';
import { dayText, getLang, missing, setLang, setTextCatalog, t, templateStatus, tr, weekdayText, wrapTokens } from '../src/i18n/i18n.ts';

const json = <T>(path: string): T => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
const catalog = json<{ text: Record<string, string>; names: Record<string, string> }>('../public/data/i18n-ja.json');
setTextCatalog({ ...catalog.text, ...catalog.names });

/** Numbers as written (1,700 / 2.84 / 1985 / 27): the same in both languages. */
const numbers = (s: string) => (s.match(/\d[\d,.]*\d|\d/g) ?? []).map((n) => n.replace(/,/g, ''));

/** Japanese that gives a number in another form, checked by hand (English: Japanese). */
const NUMBER_FORMS: Record<string, string> = {
  'The Federal Reserve raises its target range for interest rates to 1/4 to 1/2 percent and expects further increases.': '1/4 and 1/2 percent written as 0.25 and 0.5%',
  'Over the next two years': '',
};

test('templates: every English line has its Japanese, none translates an older English', () => {
  const s = templateStatus();
  assert.deepEqual(s.missing, [], 'missing');
  assert.deepEqual(s.stale, [], 'stale: translate again and copy the new English into src/i18n/ja.ts');
  for (const [k, v] of Object.entries(JA)) {
    const placeholders = (x: string) => (x.match(/\{\w+\}/g) ?? []).sort().join();
    assert.equal(placeholders(v!.ja), placeholders(EN[k as keyof typeof EN]), `${k}: the same placeholders`);
  }
});

test('data texts: everything the app can show is translated; the shipped catalog is current', () => {
  const s = buildStatus();
  assert.deepEqual(s.missing.map((m) => m.en), [], 'run node scripts/i18n.ts --todo F and translate');
  assert.deepEqual(s.unused, [], 'translations whose English changed or was removed');
  assert.deepEqual(catalog.text, s.catalog.text, 'public/data/i18n-ja.json is out of date: run npm run i18n');
});

test('data texts keep every number (years, dates, amounts, rates)', () => {
  for (const [en, ja] of Object.entries(catalog.text)) {
    if (en in NUMBER_FORMS) continue;
    for (const n of numbers(en)) assert.ok(numbers(ja).includes(n), `"${en}" -> "${ja}": ${n} is missing`);
  }
});

test('fallback: missing Japanese shows the English (and is recorded); numbers alone pass through', () => {
  assert.equal(tr('Not a text the app has', 'ja'), 'Not a text the app has');
  assert.ok([...missing].some((m) => m.includes('Not a text the app has')));
  assert.equal(tr('1984-1987', 'ja'), '1984-1987');
  assert.equal(tr('The Plaza Accord', 'ja'), 'プラザ合意');
  assert.equal(tr('The Plaza Accord', 'en'), 'The Plaza Accord');
});

test('the display language can change at any time; English is the default', () => {
  assert.equal(getLang(), 'en');
  setLang('ja');
  assert.equal(t('select.start'), '出発  ▶');
  setLang('en');
  assert.equal(t('select.start'), 'Start Travel  ▶');
});

test('dates: the same ISO day in both languages (and the weekday)', () => {
  assert.equal(dayText('2022-09-22', 'en'), 'September 22');
  assert.equal(dayText('2022-09-22', 'ja'), '9月22日');
  assert.equal(weekdayText('1985-09-22', 'en'), 'Sunday, September 22');
  assert.equal(weekdayText('1985-09-22', 'ja'), '9月22日（日）');
});

test('Japanese line breaking: between characters, never before a closing mark; Latin words and numbers stay whole', () => {
  const tokens = wrapTokens('ウォンは1ドル約1,700ウォンに下落しました。IMF（国際通貨基金）');
  const ts = tokens.map((x) => x.t);
  assert.ok(ts.includes('1,700'), 'numbers whole');
  assert.ok(ts.includes('IMF'), 'Latin words whole');
  assert.ok(!ts.some((x) => /^[、。）]/.test(x)), 'no token starts with a closing mark');
  assert.ok(ts.some((x) => x.endsWith('た。')), 'the full stop stays with its character');
  assert.ok(ts.some((x) => x === '（国'), 'an opening mark stays with the next character');
  const en = wrapTokens('Hold on tight! Setting the dial');
  assert.deepEqual(
    en.map((x) => x.t),
    ['Hold', 'on', 'tight!', 'Setting', 'the', 'dial'],
  );
  assert.ok(en.slice(1).every((x) => x.space));
});

// ---------------------------------------------------------------------------
// The guide: the same journey in both languages
// ---------------------------------------------------------------------------

const history = json<HistoryFile>('../public/data/history.json');
const leaders = json<LeadersFile>('../public/data/leaders.json');
const events = json<{ events: AnnualEvent[] }>('../public/data/annual-events.json').events;
const content = json<{ events: { id: string; people: { name: string }[] }[] }>('../public/data/history-content.json');
const tl = new Timeline(
  history,
  SLOTS.map((s) => s.slot),
);
const iso = (k: number) => tl.dateAt(k).toISOString().slice(0, 10);
const lastIso = iso(tl.count - 1);

function context(year: number, showPeople: boolean): YearContext {
  const w = yearWindow(tl, year)!;
  const mid = iso(Math.round((w.first + w.last) / 2));
  const ev = eventsInYear(events, year, lastIso);
  const changes = annualChanges(tl, tl.slots, year);
  const featured =
    STORIES[year]?.featured ??
    featuredRegions(
      ev,
      changes.filter((c) => c && c.comparable).map((c) => ({ slot: c!.slot, pct: c!.pct })),
      mid,
    );
  return {
    year,
    window: w,
    indexOf: (d) => tl.indexOf(d),
    slots: tl.slots,
    changes,
    events: ev,
    featured: featured.length ? featured : (['USA'] as RegionId[]),
    leaders: (r) => leadersInYear(leaders, r, year, lastIso),
    regionName: (r) => regionName(r, mid),
    regionSlot: (r) => REGIONS[r].slot,
    regionSystem: (r) => REGIONS[r].system,
    era: eraAt(mid),
    showPeople,
    eventPeople: (id) => content.events.find((e) => e.id === id)?.people.map((p) => p.name) ?? [],
    lastDate: lastIso,
  };
}

/** Month names in English become numbers in Japanese ("September" -> 9月): compare after mapping. */
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const withMonthNumbers = (s: string) => MONTHS.reduce((x, m, i) => x.replace(new RegExp(`\\b${m}\\b`, 'g'), `${i + 1}月`), s);

test('every year, both builds: each beat has its Japanese, with the same numbers and no gaps', () => {
  const span = yearSpan(tl);
  for (let y = span.min; y <= span.max; y++) {
    for (const people of [true, false]) {
      const ctx = context(y, people);
      const lines = [...buildYearScript(ctx).map((b) => ({ en: b.text, ja: b.ja, id: b.id })), { ...summaryLines(ctx), id: 'summary' }];
      for (const l of lines) {
        assert.ok(l.ja && l.ja !== l.en, `${y} ${l.id}: translated`);
        assert.doesNotMatch(l.ja, /undefined|NaN|null|\{\w+\}/, `${y} ${l.id}: complete`);
        // Untranslated English inside Japanese: only codes, names without a Japanese label, and proper nouns.
        const english = l.ja.match(/[A-Za-z]{4,}(?: [A-Za-z]{2,})*/g) ?? [];
        for (const w of english) assert.ok(!/\b(the|and|of|in|is|was)\b/i.test(w), `${y} ${l.id}: English left in Japanese: "${w}"`);
        // (Names are compared as names: "1st Baron Cobbold" is not a number of the story.)
        const plain = [...Object.keys(catalog.names), ...Object.keys(NUMBER_FORMS)].reduce((x, n) => x.split(n).join(' '), l.en);
        const expected = numbers(withMonthNumbers(plain));
        const got = numbers(l.ja);
        for (const n of expected) assert.ok(got.includes(n), `${y} ${l.id}: ${n} missing in "${l.ja}"`);
      }
    }
  }
});

test('1985 in Japanese: the Plaza Accord on 22 September, the same result as in English', () => {
  const ctx = context(1985, true);
  const beats = buildYearScript(ctx);
  const plaza = beats.find((b) => b.eventId === 'dollar-adjustment')!;
  assert.match(plaza.ja, /^9月22日：プラザ合意。/);
  assert.match(plaza.ja, /ジェイムズ・ベイカー/);
  const result = beats.find((b) => b.id === 'result')!;
  assert.match(result.text, /the Mark gained the most against the dollar, 27%/);
  assert.match(result.ja, /最も上昇したのはマルク（27%）/);
  const leadersJa = beats.find((b) => b.id === 'leaders-JPN')!.ja;
  assert.match(leadersJa, /首相は中曽根康弘/);
});

test('contest build: no person is named in Japanese either', () => {
  const names = Object.values(catalog.names);
  const span = yearSpan(tl);
  for (let y = span.min; y <= span.max; y++) {
    const ctx = context(y, false);
    for (const b of [...buildYearScript(ctx), { ja: summaryLines(ctx).ja, id: 'summary' }]) {
      for (const n of names) assert.ok(!b.ja.includes(n), `${y} ${b.id} names ${n}`);
    }
  }
});

test('event cards: observation and sources lines in Japanese keep the dates', () => {
  const e = events.find((x) => x.id === 'yen-intervention-2022')!;
  assert.equal(observationNote(e, '2022-09-23', 'ja'), '出来事の日付は9月22日（木）。為替レートは週次のため、その後最初の観測日、9月23日（金）で年の進行が止まります。');
  assert.match(sourcesNote(e, 'ja'), /^引用した出典と照合済み：財務省（日本）（一次資料）/);
  assert.equal(readoutLine('円', 242.3, 219.1, true, { event: '9月20日', now: '9月27日' }, 'ja'), '円：1米ドル＝242（9月20日） → 219（9月27日）（対ドル+11%）');
});
