/**
 * Japanese review translation: build and check.
 *
 * Collects every English data text the app can show (events, portal texts,
 * places, offices, eras, the Full Journey's captions, currency names), looks
 * each up in
 *   content/i18n/ja-text.json   translations written for this app, keyed by the English
 *   content/i18n/names-ja.json  people's names: Wikidata's Japanese labels (scripts/build_names_ja.py)
 * and writes public/data/i18n-ja.json (only texts the app uses, only current
 * English). The templates of src/i18n/en.ts are checked against src/i18n/ja.ts.
 *
 * Reports, and with --check fails on:
 *   missing   English with no translation (the app shows it in English)
 *   stale     templates whose Japanese translates an older English
 * and lists unused translations (English that changed or was removed).
 * People without a Japanese label on Wikidata are listed, not failed: their
 * name stays in English (no name is transliterated by hand).
 *
 * Run:  node scripts/i18n.ts            write public/data/i18n-ja.json and docs/translation-status.md
 *       node scripts/i18n.ts --check    the same, exit 1 if anything is missing or stale
 *       node scripts/i18n.ts --todo F   also write the missing texts (with where they appear) to F
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { SLOTS } from '../src/config.ts';
import { REGIONS, regionName, type AnnualEvent, type LeadersFile, type RegionId } from '../src/data/annual-history.ts';
import { ERAS } from '../src/data/eras.ts';
import { EVENTS, HINT_TEXT } from '../src/data/events.ts';
import { PORTAL_SCENES } from '../src/data/portals.ts';
import { MAP_CURRENCIES } from '../src/data/world-map.ts';
import { templateStatus } from '../src/i18n/i18n.ts';

const root = new URL('..', import.meta.url);
const read = <T>(path: string): T => JSON.parse(readFileSync(new URL(path, root), 'utf8')) as T;

interface HistoryEventContent {
  id: string;
  title: string;
  where: { city: string; country: string; note?: string };
  summary: string;
  policies: string[];
  people: { name: string; role: string; involvement: string }[];
  portal?: { period?: string };
}

/** English text -> where it appears (e.g. "event plaza-accord: title"). */
export function collectTexts(): { texts: Map<string, string[]>; names: Map<string, string[]> } {
  const texts = new Map<string, string[]>();
  const names = new Map<string, string[]>();
  const add = (m: Map<string, string[]>, en: string | undefined, where: string) => {
    if (!en || !/[A-Za-z]/.test(en)) return;
    const list = m.get(en) ?? [];
    if (list.length < 4) list.push(where);
    m.set(en, list);
  };
  for (const e of read<{ events: AnnualEvent[] }>('public/data/annual-events.json').events) {
    add(texts, e.title, `event ${e.id}: title`);
    add(texts, e.summary, `event ${e.id}: summary`);
    add(texts, e.city, `event ${e.id}: city`);
    add(texts, e.country, `event ${e.id}: country`);
    for (const s of e.sources) add(texts, s.publisher ?? 'Wikipedia', `event ${e.id}: source publisher`);
  }
  for (const e of read<{ events: HistoryEventContent[] }>('public/data/history-content.json').events) {
    add(texts, e.title, `portal ${e.id}: title`);
    add(texts, e.summary, `portal ${e.id}: summary`);
    add(texts, e.where.city, `portal ${e.id}: city`);
    add(texts, e.where.country, `portal ${e.id}: country`);
    add(texts, e.where.note, `portal ${e.id}: where note`);
    add(texts, e.portal?.period, `portal ${e.id}: photo period`);
    e.policies.forEach((p, k) => add(texts, p, `portal ${e.id}: policy ${k + 1}`));
    for (const p of e.people) {
      add(names, p.name, `portal ${e.id}: person`);
      add(texts, p.role, `portal ${e.id}: role of ${p.name}`);
      add(texts, p.involvement, `portal ${e.id}: involvement of ${p.name}`);
    }
  }
  const leaders = read<LeadersFile>('public/data/leaders.json');
  for (const o of leaders.offices) add(texts, o.title, `office ${o.id}`);
  for (const t of leaders.terms) add(names, t.name, `leader (${t.office})`);
  for (const r of Object.keys(REGIONS) as RegionId[]) {
    add(texts, REGIONS[r].system, `region ${r}: how it is governed`);
    for (const d of ['1948-01-01', '1960-01-01', '1995-01-01', '2005-01-01']) add(texts, regionName(r, d), `region ${r}: name`);
  }
  for (const e of ERAS) {
    add(texts, e.name, 'era name');
    add(texts, e.text, `era "${e.name}": text`);
  }
  for (const e of EVENTS) {
    add(texts, e.label, `Full Journey ${e.id}: label`);
    add(texts, e.text, `Full Journey ${e.id}: caption`);
    add(texts, e.short, `Full Journey ${e.id}: chart marker`);
  }
  add(texts, HINT_TEXT, 'Full Journey: hint');
  for (const s of PORTAL_SCENES) {
    add(texts, s.city, `portal scene ${s.eventId}: city`);
    add(texts, s.region, `portal scene ${s.eventId}: country`);
    add(texts, s.period, `portal scene ${s.eventId}: period`);
    add(texts, s.title, `portal scene ${s.eventId}: title`);
    add(texts, s.detail, `portal scene ${s.eventId}: detail`);
  }
  for (const c of MAP_CURRENCIES) for (const p of c.places) add(texts, p.name, `map ${c.id}: place`);
  for (const s of SLOTS) for (const n of Object.values(s.names)) add(texts, n, `currency name (${s.slot})`);
  return { texts, names };
}

export interface Status {
  catalog: { text: Record<string, string>; names: Record<string, string> };
  missing: { en: string; where: string[] }[];
  unused: string[];
  noJapaneseName: string[];
  stale: string[];
  missingTemplates: string[];
}

export function buildStatus(): Status {
  const { texts, names } = collectTexts();
  const ja = read<Record<string, { ja: string; where?: string }>>('content/i18n/ja-text.json');
  const nameFile = read<{ names: Record<string, { qid: string; ja: string }> }>('content/i18n/names-ja.json');
  const text: Record<string, string> = {};
  const missing: Status['missing'] = [];
  for (const [en, where] of [...texts].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const j = ja[en]?.ja;
    if (j) text[en] = j;
    else missing.push({ en, where });
  }
  const nameMap: Record<string, string> = {};
  const noJapaneseName: string[] = [];
  for (const en of [...names.keys()].sort()) {
    const j = nameFile.names[en]?.ja;
    if (j) nameMap[en] = j;
    else noJapaneseName.push(en);
  }
  const unused = Object.keys(ja).filter((en) => !texts.has(en) && !en.startsWith('_'));
  const tpl = templateStatus();
  return { catalog: { text, names: nameMap }, missing, unused, noJapaneseName, stale: tpl.stale, missingTemplates: tpl.missing };
}

function report(s: Status): string {
  const lines = [
    '# Japanese review translation: status',
    '',
    'Generated by `npm run i18n` (scripts/i18n.ts). English is the source; Japanese is a review aid shown in',
    'subtitles and panels, never spoken. See README, "Languages".',
    '',
    `- Data texts translated: ${Object.keys(s.catalog.text).length}; missing: ${s.missing.length}`,
    `- Templates (src/i18n/en.ts): missing ${s.missingTemplates.length}, stale ${s.stale.length}`,
    `- People's names from Wikidata's Japanese labels: ${Object.keys(s.catalog.names).length}; without a Japanese label (shown in English): ${s.noJapaneseName.length}`,
    `- Translations no longer used (their English changed or was removed): ${s.unused.length}`,
    '',
  ];
  if (s.missing.length) lines.push('## Missing', '', ...s.missing.map((m) => `- ${m.en} (${m.where.join('; ')})`), '');
  if (s.stale.length) lines.push('## Stale templates', '', ...s.stale.map((k) => `- ${k}`), '');
  if (s.missingTemplates.length) lines.push('## Missing templates', '', ...s.missingTemplates.map((k) => `- ${k}`), '');
  if (s.noJapaneseName.length) lines.push('## Names without a Japanese label on Wikidata (shown in English)', '', ...s.noJapaneseName.map((n) => `- ${n}`), '');
  if (s.unused.length) lines.push('## Unused translations', '', ...s.unused.map((n) => `- ${n}`), '');
  return lines.join('\n');
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop()!);
if (isMain) {
  const s = buildStatus();
  writeFileSync(new URL('public/data/i18n-ja.json', root), JSON.stringify(s.catalog, null, 0) + '\n');
  writeFileSync(new URL('docs/translation-status.md', root), report(s));
  const todo = process.argv.indexOf('--todo');
  if (todo > 0) {
    const out = Object.fromEntries(s.missing.map((m) => [m.en, { ja: '', where: m.where.join('; ') }]));
    writeFileSync(process.argv[todo + 1], JSON.stringify(out, null, 1) + '\n');
  }
  console.log(
    `i18n: ${Object.keys(s.catalog.text).length} texts, ${Object.keys(s.catalog.names).length} names; ` +
      `missing ${s.missing.length}, stale templates ${s.stale.length}, missing templates ${s.missingTemplates.length}, unused ${s.unused.length}`,
  );
  if (process.argv.includes('--check') && (s.missing.length || s.stale.length || s.missingTemplates.length)) process.exit(1);
}
