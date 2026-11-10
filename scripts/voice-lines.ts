/**
 * Every line Tock can say from a script, as the voice says it: the input of
 * pre-generated recordings (scripts/voice_tool.py) and of their cost estimate.
 *
 * Runs the app's own script builder (src/guide/guide-scripts.ts) for every
 * year, in the full build and in the contest-safe build (no names), so a
 * recording can only ever say a line the app shows. Each line has an id, the
 * spoken words (src/a11y/narration.ts spokenText), their hash (textHash: how
 * the app finds a recording) and the builds it belongs to. Lines that depend
 * on the moment (the ending's live rates, a pinched place) are left to the
 * browser's speech synthesis.
 *
 * Run:  node scripts/voice-lines.ts [--years 1985,1997]   -> content/voice/lines.json
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spokenText, textHash } from '../src/a11y/narration.ts';
import { SLOTS } from '../src/config.ts';
import { annualChanges, yearSpan, yearWindow } from '../src/data/annual-currency.ts';
import { eventsInYear, featuredRegions, leadersInYear, REGIONS, regionName, type AnnualEvent, type LeadersFile, type RegionId } from '../src/data/annual-history.ts';
import { eraAt } from '../src/data/eras.ts';
import { EVENTS, HINT_TEXT } from '../src/data/events.ts';
import type { HistoryContent } from '../src/data/history-content.ts';
import { Timeline, type HistoryFile } from '../src/data/timeline.ts';
import { buildYearScript, STORIES, summaryLine, type YearContext } from '../src/guide/guide-scripts.ts';
import { EN } from '../src/i18n/en.ts';
import { fmt } from '../src/i18n/i18n.ts';

const root = new URL('..', import.meta.url);
const read = <T>(path: string): T => JSON.parse(readFileSync(new URL(path, root), 'utf8')) as T;

export interface VoiceLine {
  id: string;
  /** The words the voice says. */
  text: string;
  hash: string;
  /** Builds that can say it: "full" (names shown) and/or "contest" (contest-safe). */
  modes: ('full' | 'contest')[];
}

export function collectLines(years?: number[]): VoiceLine[] {
  const history = read<HistoryFile>('public/data/history.json');
  const leaders = read<LeadersFile>('public/data/leaders.json');
  const events = read<{ events: AnnualEvent[] }>('public/data/annual-events.json').events;
  const content = read<{ events: { id: string; people: { name: string }[] }[] }>('public/data/history-content.json');
  const people = new Map(content.events.map((e) => [e.id, e.people.map((p) => p.name)]));
  const tl = new Timeline(
    history,
    SLOTS.map((s) => s.slot),
  );
  const iso = (k: number) => tl.dateAt(k).toISOString().slice(0, 10);
  const lastIso = iso(tl.count - 1);
  const byHash = new Map<string, VoiceLine>();
  const add = (id: string, en: string, mode: 'full' | 'contest') => {
    const text = spokenText(en);
    if (!text) return;
    const hash = textHash(text);
    const line = byHash.get(hash) ?? { id, text, hash, modes: [] };
    if (!line.modes.includes(mode)) line.modes.push(mode);
    byHash.set(hash, line);
  };
  const both = (id: string, en: string) => {
    add(id, en, 'full');
    add(id, en, 'contest');
  };

  // Fixed lines.
  for (const k of ['guide.intro.1', 'guide.intro.2', 'guide.intro.3', 'guide.select', 'guide.full'] as const) both(k, EN[k]);
  for (const e of EVENTS) both(`full.${e.id}`, `${e.label}. ${e.text}`);
  both('full.hint', HINT_TEXT);

  const span = yearSpan(tl);
  const list = years ?? Array.from({ length: span.max - span.min + 1 }, (_, i) => span.min + i);
  for (const year of list) {
    both(`warp.${year}`, fmt(EN['guide.warp'], { year }));
    both(`arrive.${year}`, fmt(EN['guide.arrive'], { year }));
    for (const mode of ['full', 'contest'] as const) {
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
      const ctx: YearContext = {
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
        showPeople: mode === 'full',
        eventPeople: (id) => people.get(id) ?? [],
        lastDate: lastIso,
      };
      for (const b of buildYearScript(ctx)) add(`year.${year}.${b.id}`, b.text, mode);
      add(`year.${year}.summary`, summaryLine(ctx), mode);
    }
  }
  return [...byHash.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

const isMain = process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/voice-lines.ts');
if (isMain) {
  const at = process.argv.indexOf('--years');
  const years = at > 0 ? process.argv[at + 1].split(',').map(Number) : undefined;
  const lines = collectLines(years);
  mkdirSync(new URL('content/voice/', root), { recursive: true });
  writeFileSync(
    new URL('content/voice/lines.json', root),
    JSON.stringify({ generatedBy: 'scripts/voice-lines.ts', years: years ?? 'all', lines }, null, 1) + '\n',
  );
  const chars = (m: string) => lines.filter((l) => l.modes.includes(m as 'full')).reduce((n, l) => n + l.text.length, 0);
  console.log(`${lines.length} lines; full build ${chars('full')} characters, contest build ${chars('contest')}; all distinct ${lines.reduce((n, l) => n + l.text.length, 0)}`);
}
