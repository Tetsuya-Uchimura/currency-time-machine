/**
 * Tests for the ambient music's scores (src/audio/score.ts): the harmony and
 * registers each piece promises. They do not say the music sounds good: that is
 * judged by ear (the audition panel and the rendered files, docs/bgm.md).
 * Run: node --test tests/score.test.ts
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chordNotes, chordSeconds, D_MAJOR, leftHand, loopSeconds, SCORES, STYLES } from '../src/audio/score.ts';

const pc = (m: number) => ((m % 12) + 12) % 12;

for (const style of STYLES) {
  const s = SCORES[style];

  test(`${style}: every note is in D major; no melody note a half step above a sounding chord tone`, () => {
    s.chords.forEach((ch, i) => {
      const harmony = [...ch.pad, ...(ch.bass === null ? [] : [ch.bass])];
      for (const m of harmony) assert.ok(D_MAJOR.has(pc(m)), `${i} ${ch.name}: ${m}`);
      for (const verse of [0, 1]) {
        for (const n of chordNotes(s, ch, verse, false)) {
          assert.ok(D_MAJOR.has(pc(n.m)), `${i} ${ch.name}: note ${n.m}`);
          // (A note at or below the pad is the bass's role, the chord's root: a seventh above it is consonant.)
          if (n.m <= Math.min(...ch.pad)) continue;
          for (const h of harmony) assert.notEqual(pc(n.m - h), 1, `${i} ${ch.name}: ${n.m} is a minor 9th over ${h}`);
        }
      }
    });
  });

  test(`${style}: pads have no half steps; voices stay in their registers`, () => {
    for (const ch of s.chords) {
      const p = [...ch.pad].sort((a, b) => a - b);
      for (let i = 1; i < p.length; i++) assert.ok(p[i] - p[i - 1] >= 2, `${ch.name}: ${p[i - 1]}-${p[i]}`);
      assert.ok(p[0] >= 54 && p[p.length - 1] <= 73, `${ch.name}: pad ${p}`);
      if (ch.bass !== null) assert.ok(ch.bass >= 42 && ch.bass <= 55, `${ch.name}: bass ${ch.bass} (no deep rumble)`);
      for (const n of ch.notes) assert.ok(n.m >= 50 && n.m <= 86, `${ch.name}: ${n.m}`);
      for (const n of ch.notes) assert.ok(n.v > 0 && n.v <= 0.5, 'soft');
    }
  });

  test(`${style}: voice leading - each change keeps or moves most voices by step, never all by leaps`, () => {
    const n = s.chords.length;
    for (let i = 0; i < n; i++) {
      const a = s.chords[i].pad;
      const b = s.chords[(i + 1) % n].pad;
      // Each new pad note is close (<= 3 semitones) to a note of the previous chord.
      const near = b.filter((m) => a.some((x) => Math.abs(x - m) <= 3)).length;
      assert.ok(near >= b.length - 1, `${s.chords[i].name} -> ${s.chords[(i + 1) % n].name}`);
      // And the chord actually changes (no two identical chords in a row).
      assert.notDeepEqual(a, b);
    }
  });

  test(`${style}: chords of different lengths, none longer than 20 s; a loop of at least a minute`, () => {
    const lengths = new Set(s.chords.map((ch) => ch.bars));
    assert.ok(lengths.size >= 2, 'not one fixed length');
    for (const ch of s.chords) assert.ok(chordSeconds(s, ch) <= 20, `${ch.name}: ${chordSeconds(s, ch).toFixed(1)} s`);
    assert.ok(loopSeconds(s) >= 55, `${loopSeconds(s).toFixed(0)} s`);
  });

  test(`${style}: under the voice, fewer notes but never silence for a whole chord of two bars or more`, () => {
    for (const ch of s.chords) {
      const all = chordNotes(s, ch, 0, false).length;
      const sparse = chordNotes(s, ch, 0, true).length;
      assert.ok(sparse <= all);
      if (ch.bars >= 2) assert.ok(sparse >= 1, `${ch.name}: something answers each long chord`);
    }
    const total = (sp: boolean) => s.chords.reduce((n, ch) => n + chordNotes(s, ch, 0, sp).length, 0);
    assert.ok(total(true) < total(false), 'sparser under the voice');
  });
}

test('the three pieces differ: tempo, density, bass', () => {
  const [a, b, c] = STYLES.map((s) => SCORES[s]);
  assert.ok(new Set([a.bpm, b.bpm, c.bpm]).size === 3);
  assert.ok(b.leftHand && !a.leftHand && !c.leftHand, 'the piano piece has a left hand');
  assert.ok(c.echo && c.bass === 0 && c.chords.every((ch) => ch.bass === null), 'the cosmic piece has no bass, an echo');
  assert.ok(b.pad < a.pad, 'the piano piece keeps the pad as a halo');
});

test('the piano left hand: the chord broken over each bar, a calmer second verse', () => {
  const ch = SCORES.piano.chords[0];
  assert.deepEqual(leftHand(ch, 0).map((n) => n.b), [0, 1, 2, 3]);
  assert.deepEqual(leftHand(ch, 1).map((n) => n.b), [0, 2]);
  assert.ok(leftHand(ch, 0).every((n) => n.m >= 48 && n.m <= 71));
});
