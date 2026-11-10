/**
 * Tock's voice. English is the only spoken language; subtitles carry the
 * line in the chosen display language (src/i18n), always.
 *
 * Three ways to say a line, best first:
 *   1. a pre-generated recording (public/voice/, looked up by the hash of the
 *      spoken text, so a recording can never say something else than the line);
 *   2. the browser's speech synthesis, with an English voice chosen explicitly
 *      (natural or neural voices first), one sentence at a time;
 *   3. nothing: `speaking` stays false and the subtitles carry on alone.
 *
 * What a line's end means: the end of the recording, or of its last sentence.
 * Callers wait for it (`speaking`), and only fall back to an estimate of the
 * reading time when no voice is working (`live` is false).
 *
 * Why one sentence at a time: Chrome stops long utterances after about 15
 * seconds with some voices and sometimes never fires their `end` event; short
 * utterances avoid both, sound less flat, and let Pause resume at the sentence
 * that was interrupted instead of the start of the line.
 *
 * Every callback carries the token of its line: a cancelled line can never
 * end, advance or fail the next one.
 */

/** The parts of SpeechSynthesisVoice the choice needs (testable without a browser). */
export interface VoiceInfo {
  name: string;
  lang: string;
  localService: boolean;
  default?: boolean;
}

/** Novelty or very old voices (macOS, eSpeak): never chosen when anything else exists. */
const ODD_VOICES =
  /albert|bad news|bahh|bells|boing|bubbles|cellos|deranged|good news|hysterical|jester|organ|superstar|trinoids|whisper|wobble|zarvox|junior|ralph|fred|kathy|espeak|robot/i;

/** Score an English voice: higher is more natural for an American-English guide. */
export function voiceScore(v: VoiceInfo): number {
  const lang = v.lang.replace('_', '-').toLowerCase();
  if (!lang.startsWith('en')) return -1;
  let s = 0;
  if (lang === 'en-us') s += 30;
  else if (lang === 'en-gb' || lang === 'en-ca' || lang === 'en-au') s += 12;
  else s += 6;
  const n = v.name;
  // Neural voices: Edge "... Online (Natural)", Windows 11 "Natural", Apple "(Premium)"/"(Enhanced)".
  if (/natural|neural/i.test(n)) s += 50;
  if (/premium|enhanced/i.test(n)) s += 40;
  if (/^Google US English$/i.test(n)) s += 35;
  else if (/google/i.test(n)) s += 20;
  // Good standard voices.
  if (/\b(aria|jenny|guy|ava|andrew|emma|brian|samantha|allison|evan|nathan|joelle|zoe|susan|tom|nicky)\b/i.test(n)) s += 15;
  // Older desktop SAPI voices are the robotic ones.
  if (/microsoft (david|zira|mark)( desktop)?/i.test(n) && !/natural|online/i.test(n)) s -= 10;
  if (ODD_VOICES.test(n)) s -= 80;
  if (v.default) s += 2;
  return s;
}

/** The best English voice, or null (then the line is spoken with the browser's default for en-US). */
export function chooseVoice<V extends VoiceInfo>(voices: readonly V[]): V | null {
  let best: V | null = null;
  let bestScore = -1;
  for (const v of voices) {
    const s = voiceScore(v);
    if (s > bestScore) {
      best = v;
      bestScore = s;
    }
  }
  return bestScore >= 0 ? best : null;
}

/**
 * Split a line into sentences for speech (and long sentences at a comma,
 * semicolon or colon), each at most about `max` characters. Joined with
 * spaces, the chunks give the line back.
 */
export function speechChunks(text: string, max = 170): string[] {
  const sentences = text.match(/[^.!?]+(?:[.!?]+["')\]]*|$)\s*/g) ?? [text];
  const out: string[] = [];
  for (const raw of sentences) {
    const s = raw.trim();
    if (!s) continue;
    // Keep short sentences together ("Here we are: 1985." is one breath).
    const prev = out[out.length - 1];
    if (prev && prev.length + s.length < 60) {
      out[out.length - 1] = `${prev} ${s}`;
      continue;
    }
    if (s.length <= max) {
      out.push(s);
      continue;
    }
    // A long sentence: break after a comma, semicolon or colon near the limit.
    let rest = s;
    while (rest.length > max) {
      const window = rest.slice(0, max);
      const cut = Math.max(window.lastIndexOf('; '), window.lastIndexOf(': '), window.lastIndexOf(', '));
      const at = cut > max * 0.35 ? cut + 1 : (window.lastIndexOf(' ') > 0 ? window.lastIndexOf(' ') : max);
      out.push(rest.slice(0, at).trim());
      rest = rest.slice(at).trim();
    }
    if (rest) out.push(rest);
  }
  return out.length ? out : [text];
}

/** Currency codes as a listener hears them. */
const SPOKEN_CODES: Record<string, string> = {
  USD: 'US dollars',
  JPY: 'yen',
  DEM: 'Deutsche Marks',
  EUR: 'euros',
  GBP: 'pounds',
  CHF: 'Swiss francs',
  CAD: 'Canadian dollars',
  AUD: 'Australian dollars',
  CNY: 'yuan',
  KRW: 'won',
  INR: 'rupees',
};

/**
 * The words the voice says for a subtitle line: currency codes become their
 * names, symbols become words. (The subtitle keeps the written form.)
 */
export function spokenText(text: string): string {
  return text
    .replace(/\b(USD|JPY|DEM|EUR|GBP|CHF|CAD|AUD|CNY|KRW|INR)\b/g, (c) => SPOKEN_CODES[c])
    .replace(/\s*→\s*/g, ' to ')
    .replace(/(\d)\s*[−–]\s*(\d)/g, '$1 to $2')
    .replace(/[−]/g, 'minus ')
    .replace(/\bvs\.?\s/g, 'versus ')
    .replace(/\.{3}|…/g, '.')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * FNV-1a 64-bit hash of a text's UTF-8 bytes, as 16 hex digits. The same in
 * scripts/voice_tool.py: a recording is found by the hash of the exact words
 * it says.
 */
export function textHash(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (const b of bytes) {
    h ^= BigInt(b);
    h = (h * prime) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, '0');
}

/** Rough seconds a voice needs for a text (about 15 characters a second). */
export function speechSeconds(text: string): number {
  return 0.6 + text.length / 15;
}

/** Recordings available for this build: hash of the spoken text -> file (relative to the base URL). */
export interface VoiceManifest {
  voice?: string;
  lines: Record<string, { file: string; id?: string; seconds?: number }>;
}

export type NarrationState = 'idle' | 'starting' | 'speaking' | 'paused';

/** How the voice should sound for a line (Web Speech only has rate and pitch). */
export type Delivery = 'normal' | 'excited' | 'serious';

const DELIVERY: Record<Delivery, { rate: number; pitch: number }> = {
  normal: { rate: 1.0, pitch: 1.0 },
  excited: { rate: 1.04, pitch: 1.04 },
  serious: { rate: 0.95, pitch: 0.98 },
};

/** A browser speech engine never started a line within this time: give up (and say so). */
const START_TIMEOUT_MS = 4000;

export class Narration {
  private on = false;
  readonly lang = 'en-US';
  readonly available = typeof window !== 'undefined' && 'speechSynthesis' in window;
  state: NarrationState = 'idle';
  /** Called when speech starts and stops (the music ducks under the voice). */
  onSpeaking: ((on: boolean) => void) | null = null;
  /** Engine events, for the dev log ("start", "end 2/3", "error ...", "timeout"). */
  onDebug: ((msg: string) => void) | null = null;
  /** The voice in use (for the dev log and the README's checks). */
  voiceName = '';
  /** Lines that failed in a row (no voice, blocked): after 2, `live` turns false. */
  failures = 0;

  private token = 0;
  private pick: () => void = () => {};
  private voice: SpeechSynthesisVoice | null = null;
  private chunks: string[] = [];
  private chunk = 0;
  private chunkChars = 0;
  private boundary = 0;
  private total = 1;
  private delivery: Delivery = 'normal';
  private startTimer: number | undefined;
  private chunkTimer: number | undefined;
  /** Utterances are kept referenced while queued: Chrome may drop the `end` event of a collected one. */
  private keep: SpeechSynthesisUtterance[] = [];
  private manifest: VoiceManifest | null = null;
  private baseUrl = '/';
  private clip: HTMLAudioElement | null = null;
  private clipFailed = new Set<string>();

  /** Voice on or off (switching it on gives a failed engine another chance). */
  get enabled(): boolean {
    return this.on;
  }

  set enabled(on: boolean) {
    this.on = on;
    if (on) this.failures = 0;
  }

  constructor() {
    if (!this.available) return;
    this.pick = () => {
      try {
        const v = chooseVoice(window.speechSynthesis.getVoices());
        this.voice = v;
        this.voiceName = v ? `${v.name} (${v.lang}${v.localService ? '' : ', online'})` : '';
        if (v) this.failures = 0; // voices arrived: try speaking again
      } catch {
        this.voice = null;
      }
    };
    this.pick();
    // Voices often arrive after the page loads (Chrome, Edge): choose again then (and before a line, if none yet).
    window.speechSynthesis.addEventListener?.('voiceschanged', () => this.pick());
  }

  /** Recordings for this build (missing or empty: speech synthesis only). */
  async loadManifest(baseUrl: string): Promise<void> {
    this.baseUrl = baseUrl;
    try {
      const res = await fetch(`${baseUrl}voice/manifest.json`);
      if (!res.ok) return;
      const m = (await res.json()) as VoiceManifest;
      if (m && m.lines && Object.keys(m.lines).length) this.manifest = m;
    } catch {
      /* no recordings: fine */
    }
  }

  get recordings(): number {
    return this.manifest ? Object.keys(this.manifest.lines).length : 0;
  }

  /** Something can speak: a recording or a speech engine that has not kept failing. */
  get live(): boolean {
    return this.enabled && (this.available || this.recordings > 0) && this.failures < 2;
  }

  /** From the moment a line is handed over until it ends, fails or is stopped (paused counts: it will go on). */
  get speaking(): boolean {
    return this.state !== 'idle';
  }

  /** How far through the current line the voice is (0..1), for paging subtitles. */
  get progress(): number {
    if (this.state === 'idle') return 1;
    if (this.clip && this.clipToken === this.token) {
      const d = this.clip.duration;
      return d > 0 && Number.isFinite(d) ? Math.min(1, this.clip.currentTime / d) : 0;
    }
    return Math.min(1, (this.chunkChars + this.boundary) / this.total);
  }

  private clipToken = -1;

  /** Say a line (English). Any line still running is stopped first. */
  speak(text: string, delivery: Delivery = 'normal'): void {
    this.halt();
    if (!this.enabled) return;
    const words = spokenText(text);
    if (!words) return;
    const token = ++this.token;
    this.delivery = delivery;
    this.total = Math.max(1, words.length);
    this.chunkChars = 0;
    this.boundary = 0;
    const rec = this.manifest?.lines[textHash(words)];
    if (rec && !this.clipFailed.has(rec.file)) {
      this.playClip(token, words, rec.file);
      return;
    }
    // The speech engine failed twice in a row (no voice installed, speech blocked): subtitles only,
    // until the voice is switched on again or voices arrive.
    if (this.failures >= 2) return;
    this.speakChunks(token, words);
  }

  /** Pause: a recording stops where it is; speech stops and resumes at the interrupted sentence. */
  pause(): void {
    if (this.state === 'idle' || this.state === 'paused') return;
    this.state = 'paused';
    window.clearTimeout(this.startTimer);
    window.clearTimeout(this.chunkTimer);
    if (this.clip && this.clipToken === this.token) this.clip.pause();
    else {
      // Invalidate the queued sentences' callbacks, keep the line and its position.
      const token = ++this.token;
      this.clipToken = -1;
      this.pausedToken = token;
      this.cancelSpeech();
    }
    this.onSpeaking?.(false);
  }

  private pausedToken = -1;

  resume(): void {
    if (this.state !== 'paused') return;
    if (!this.enabled) {
      this.stop();
      return;
    }
    if (this.clip && this.clipToken === this.token) {
      this.state = 'speaking';
      this.onSpeaking?.(true);
      this.clip.play().catch(() => this.finish(this.token, true));
      return;
    }
    if (this.pausedToken !== this.token) {
      this.stop();
      return;
    }
    this.state = 'starting';
    this.onSpeaking?.(true);
    this.speakFrom(this.token, this.chunk);
  }

  /** Stop the line now (Skip, a new phase, Voice off). */
  stop(): void {
    this.halt();
  }

  private halt(): void {
    this.token++;
    window.clearTimeout(this.startTimer);
    window.clearTimeout(this.chunkTimer);
    if (this.clip) {
      try {
        this.clip.pause();
      } catch {
        /* ignore */
      }
    }
    this.clipToken = -1;
    if (this.available && (this.keep.length || window.speechSynthesis.speaking || window.speechSynthesis.pending)) this.cancelSpeech();
    this.keep = [];
    this.set('idle');
  }

  private cancelSpeech(): void {
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
    this.keep = [];
  }

  // --- Recordings ---------------------------------------------------------

  private playClip(token: number, words: string, file: string): void {
    if (!this.clip) {
      this.clip = new Audio();
      this.clip.preload = 'auto';
    }
    const a = this.clip;
    this.clipToken = token;
    this.set('starting');
    a.onplaying = () => {
      if (token !== this.token) return;
      this.onDebug?.(`recording plays ${file}`);
      this.set('speaking');
    };
    a.onended = () => {
      if (token === this.token) this.onDebug?.(`recording ends ${file}`);
      this.finish(token, false);
    };
    a.onerror = () => {
      if (token !== this.token) return;
      // The file is missing or unplayable: say the line with speech synthesis instead.
      this.onDebug?.(`recording failed ${file}: speech synthesis instead`);
      this.clipFailed.add(file);
      this.clipToken = -1;
      this.speakChunks(token, words);
    };
    a.src = `${this.baseUrl}${file}`;
    a.currentTime = 0;
    a.play().catch(() => {
      if (token !== this.token) return;
      this.clipToken = -1;
      this.speakChunks(token, words);
    });
  }

  // --- Speech synthesis ---------------------------------------------------

  private speakChunks(token: number, words: string): void {
    if (!this.available) {
      this.finish(token, true);
      return;
    }
    if (!this.voice) this.pick();
    this.chunks = speechChunks(words);
    this.chunk = 0;
    this.set('starting');
    this.speakFrom(token, 0);
  }

  private speakFrom(token: number, index: number): void {
    if (token !== this.token) return;
    if (index >= this.chunks.length) {
      this.finish(token, false);
      return;
    }
    this.chunk = index;
    this.chunkChars = this.chunks.slice(0, index).reduce((n, c) => n + c.length + 1, 0);
    this.boundary = 0;
    const text = this.chunks[index];
    const u = new SpeechSynthesisUtterance(text);
    u.lang = this.voice?.lang ?? this.lang;
    if (this.voice) u.voice = this.voice;
    const d = DELIVERY[this.delivery];
    u.rate = d.rate;
    u.pitch = d.pitch;
    u.volume = 1;
    u.onstart = () => {
      if (token !== this.token) return;
      this.onDebug?.(`start ${index + 1}/${this.chunks.length} voice=${this.voiceName || 'default'}`);
      window.clearTimeout(this.startTimer);
      this.failures = 0;
      this.set('speaking');
    };
    u.onboundary = (e) => {
      if (token === this.token) this.boundary = e.charIndex;
    };
    u.onend = () => {
      if (token !== this.token) return;
      this.onDebug?.(`end ${index + 1}/${this.chunks.length}`);
      window.clearTimeout(this.chunkTimer);
      this.speakFrom(token, index + 1);
    };
    u.onerror = (e) => {
      if (token !== this.token) return;
      // 'interrupted' / 'canceled' come from our own cancel (the token already moved on).
      const err = (e as SpeechSynthesisErrorEvent).error;
      if (err === 'interrupted' || err === 'canceled') return;
      this.onDebug?.(`error ${err} ${index + 1}/${this.chunks.length}`);
      window.clearTimeout(this.chunkTimer);
      if (this.state === 'speaking') this.speakFrom(token, index + 1); // skip a bad sentence, keep the line
      else this.finish(token, true);
    };
    this.keep.push(u);
    // A line that never starts (no voice installed, speech blocked) must not hold the journey.
    if (index === 0 || this.state === 'starting') {
      window.clearTimeout(this.startTimer);
      // (Every engine we target fires `start`: one that has not is not speaking, whatever
      // speechSynthesis.speaking says. Chromium without voices reports speaking forever.)
      this.startTimer = window.setTimeout(() => {
        if (token !== this.token || this.state !== 'starting') return;
        this.onDebug?.('timeout: never started');
        this.cancelSpeech();
        this.finish(token, true);
      }, START_TIMEOUT_MS);
    }
    // A sentence whose `end` never comes: move on once the engine is quiet, or after a hard limit.
    const expect = speechSeconds(text) / d.rate;
    const check = (waited: number) => {
      this.chunkTimer = window.setTimeout(() => {
        if (token !== this.token || this.chunk !== index || this.state === 'paused') return;
        const quiet = !window.speechSynthesis.speaking && !window.speechSynthesis.pending;
        if (quiet || waited > expect * 4 + 10) {
          this.onDebug?.(`no end event ${index + 1}/${this.chunks.length} (${quiet ? 'engine quiet' : 'hard limit'})`);
          this.speakFrom(token, index + 1);
        }
        else check(waited + 1.5);
      }, 1500);
    };
    window.clearTimeout(this.chunkTimer);
    this.chunkTimer = window.setTimeout(() => check(expect * 2 + 3), (expect * 2 + 3) * 1000);
    try {
      window.speechSynthesis.speak(u);
    } catch {
      this.finish(token, true);
    }
  }

  private finish(token: number, failed: boolean): void {
    if (token !== this.token) return;
    window.clearTimeout(this.startTimer);
    window.clearTimeout(this.chunkTimer);
    this.keep = [];
    this.clipToken = -1;
    if (failed) this.failures++;
    this.set('idle');
  }

  private set(state: NarrationState): void {
    const was = this.state !== 'idle' && this.state !== 'paused';
    this.state = state;
    const now = state !== 'idle' && state !== 'paused';
    if (was !== now) this.onSpeaking?.(now);
  }
}
