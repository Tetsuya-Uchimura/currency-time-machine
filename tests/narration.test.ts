/**
 * Tests for Tock's voice (src/a11y/narration.ts): sentence chunks, the voice
 * choice, spoken words, the recording hash, and the speech state machine
 * against a fake speech engine that behaves like Chrome's (start and end
 * events, an "interrupted" error for every utterance a cancel() drops).
 * Run: node --test tests/narration.test.ts
 */
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

// --- A fake browser speech engine -------------------------------------------

interface FakeUtterance {
  text: string;
  lang: string;
  voice: unknown;
  rate: number;
  pitch: number;
  volume: number;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onboundary: ((e: { charIndex: number }) => void) | null;
}

class FakeEngine {
  queue: FakeUtterance[] = [];
  current: FakeUtterance | null = null;
  spoken: string[] = [];
  voices: { name: string; lang: string; localService: boolean; default?: boolean }[] = [];
  get speaking(): boolean {
    return this.current !== null;
  }
  get pending(): boolean {
    return this.queue.length > 0;
  }
  speak(u: FakeUtterance): void {
    this.queue.push(u);
  }
  cancel(): void {
    const dropped = [...(this.current ? [this.current] : []), ...this.queue];
    this.current = null;
    this.queue = [];
    for (const u of dropped) u.onerror?.({ error: 'interrupted' });
  }
  getVoices() {
    return this.voices;
  }
  addEventListener(): void {}
  /** The engine starts the next queued utterance. */
  start(): FakeUtterance {
    const u = this.queue.shift();
    assert.ok(u, 'something to start');
    this.current = u;
    u.onstart?.();
    return u;
  }
  /** The current utterance ends normally. */
  end(): void {
    const u = this.current;
    assert.ok(u, 'something to end');
    this.current = null;
    this.spoken.push(u.text);
    u.onend?.();
  }
}

const engine = new FakeEngine();
mock.timers.enable({ apis: ['setTimeout'] });
const g = globalThis as Record<string, unknown>;
g.window = { speechSynthesis: engine, setTimeout, clearTimeout };
g.SpeechSynthesisUtterance = class {
  text: string;
  lang = '';
  voice: unknown = null;
  rate = 1;
  pitch = 1;
  volume = 1;
  onstart = null;
  onend = null;
  onerror = null;
  onboundary = null;
  constructor(text: string) {
    this.text = text;
  }
};

const { chooseVoice, Narration, speechChunks, spokenText, textHash } = await import('../src/a11y/narration.ts');

function fresh() {
  engine.queue = [];
  engine.current = null;
  engine.spoken = [];
  const n = new Narration();
  n.enabled = true;
  return n;
}

// --- Pure helpers -------------------------------------------------------------

test('chunks: one sentence at a time, short ones together, long ones at a comma; nothing lost', () => {
  const text =
    'September 22: The Plaza Accord. Finance ministers and central bank governors of five major economies, meeting at the Plaza Hotel, say a further orderly rise of other currencies against the dollar is desirable. Watch the yen.';
  const c = speechChunks(text);
  assert.ok(c.length >= 3);
  assert.ok(c.every((x) => x.length <= 170));
  assert.equal(c.join(' ').replace(/\s+/g, ' '), text);
  assert.deepEqual(speechChunks('Here we are: 1985.'), ['Here we are: 1985.']);
  assert.deepEqual(speechChunks('Hi. Yes.'), ['Hi. Yes.'], 'short sentences share a breath');
});

test('voice choice: natural American English first; novelty voices and other languages never', () => {
  const v = (name: string, lang = 'en-US', localService = true) => ({ name, lang, localService });
  assert.equal(chooseVoice([v('Microsoft David - English (United States)'), v('Microsoft Aria Online (Natural) - English (United States)', 'en-US', false)])?.name, 'Microsoft Aria Online (Natural) - English (United States)');
  assert.equal(chooseVoice([v('Microsoft Zira Desktop'), v('Google US English', 'en-US', false)])?.name, 'Google US English');
  assert.equal(chooseVoice([v('Zarvox'), v('Samantha')])?.name, 'Samantha');
  assert.equal(chooseVoice([v('Daniel', 'en-GB'), v('Alex', 'en-US')])?.name, 'Alex', 'American first');
  assert.equal(chooseVoice([v('Kyoko', 'ja-JP')]), null, 'never a Japanese voice for English lines');
});

test('spoken words: codes become names, arrows and symbols become words', () => {
  assert.equal(spokenText('at 1,152 KRW per US dollar.'), 'at 1,152 won per US dollar.');
  assert.equal(spokenText('Yen 242 (Sep 20) → 219 (Sep 27) per USD'), 'Yen 242 (Sep 20) to 219 (Sep 27) per US dollars');
  assert.equal(spokenText('Hold on tight! Setting the dial to 1985...'), 'Hold on tight! Setting the dial to 1985.');
});

test('recording hash: FNV-1a 64 of the UTF-8 text (same as scripts/voice_tool.py)', () => {
  assert.equal(textHash(''), 'cbf29ce484222325');
  assert.equal(textHash('a'), 'af63dc4c8601ec8c');
  assert.notEqual(textHash('Here we are: 1985.'), textHash('Here we are: 1986.'));
});

// --- The state machine ----------------------------------------------------------

test('a line is speaking until its last sentence ends (not when an estimate runs out)', () => {
  const n = fresh();
  n.speak('First sentence is here and it is long enough to stand alone. Second sentence is also here and it is long enough too.');
  assert.equal(n.state, 'starting');
  assert.ok(n.speaking);
  engine.start();
  assert.equal(n.state, 'speaking');
  mock.timers.tick(30000); // far beyond any reading estimate: still speaking while the engine speaks
  assert.ok(n.speaking);
  engine.end();
  assert.ok(n.speaking, 'the second sentence follows');
  engine.start();
  engine.end();
  assert.ok(!n.speaking);
  assert.equal(engine.spoken.length, 2);
});

test("a new line stops the old one, and the old one's late events never touch the new one", () => {
  const n = fresh();
  n.speak('An old line that will be replaced before it ends, because the user skipped it.');
  const old = engine.start();
  n.speak('The new line.');
  assert.equal(n.state, 'starting');
  old.onend?.(); // a stale end event (Chrome can deliver one after cancel)
  old.onerror?.({ error: 'interrupted' });
  assert.equal(n.state, 'starting', 'unchanged by the old line');
  engine.start();
  engine.end();
  assert.ok(!n.speaking);
  assert.deepEqual(engine.spoken, ['The new line.']);
});

test('pause and resume: the voice goes on from the interrupted sentence, not from the start', () => {
  const n = fresh();
  n.speak('Sentence one is long enough to be said on its own, for this test. Sentence two is also long enough to be said alone. Sentence three ends it, again long enough here.');
  engine.start();
  engine.end(); // one said
  engine.start(); // two begins
  n.pause();
  assert.equal(n.state, 'paused');
  assert.ok(n.speaking, 'a paused line is not over');
  assert.ok(!engine.speaking, 'the engine is quiet while paused');
  n.resume();
  const u = engine.start();
  assert.match(u.text, /^Sentence two/);
  engine.end();
  engine.start();
  engine.end();
  assert.ok(!n.speaking);
  assert.deepEqual(engine.spoken.map((s) => s.split(' ')[1]), ['one', 'two', 'three']);
});

test('an engine that never starts: the line fails after a few seconds; after two, subtitles only until the voice is switched on again', () => {
  const n = fresh();
  n.speak('Nobody will say this.');
  mock.timers.tick(4100);
  assert.ok(!n.speaking);
  assert.equal(n.failures, 1);
  assert.ok(n.live);
  n.speak('Nor this.');
  mock.timers.tick(4100);
  assert.equal(n.failures, 2);
  assert.ok(!n.live, 'the journey falls back to reading time');
  engine.queue = [];
  n.speak('Not even tried.');
  assert.ok(!n.speaking);
  assert.equal(engine.queue.length, 0);
  n.enabled = true; // the user switches the voice on again
  assert.ok(n.live);
});

test('a sentence whose end event never comes: the voice moves on once the engine is quiet', () => {
  const n = fresh();
  n.speak('This sentence will lose its end event, as Chrome sometimes does.');
  engine.start();
  engine.current = null; // the engine finished but never told us
  for (let i = 0; i < 30; i++) mock.timers.tick(1000);
  assert.ok(!n.speaking, 'the line ended anyway');
});

test('stop: nothing speaks, nothing is queued', () => {
  const n = fresh();
  n.speak('A line. Another line that is long enough to be a chunk of its own here.');
  engine.start();
  n.stop();
  assert.ok(!n.speaking);
  assert.ok(!engine.speaking && !engine.pending);
});
