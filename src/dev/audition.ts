/**
 * BGM audition panel: compare the three ambient pieces by ear, in the app.
 * Opened with `?audition` in the address (any build) or the `O` key (dev).
 *
 *   A / B / C          switch the piece now (the old one fades, the new one starts)
 *   Mode               Auto (the journey decides) or hold Selection / Guide / Summary / Flowing
 *   Narration test     the browser's English voice reads guide lines over the music,
 *                      with the same duck as Tock (to judge clarity and balance)
 *   Render             a 48 s WAV of a piece (selection, then guide with the duck),
 *                      to download; in the dev server it is also saved to audition/
 *
 * English-only labels (a developer tool). Nothing here changes the journey.
 */
import type { SoundEngine } from '../audio/engine.js';
import type { SoundMode } from '../audio/mix.js';
import { renderPreview, type RenderResult } from '../audio/render.js';
import { STYLE_LABEL, STYLES, type BgmStyle } from '../audio/score.js';

const LINES = [
  "Welcome aboard the Currency Time Machine! I'm Tock, your guide to the history of money.",
  '1985. The dollar is strong. Since 1980 the Mark has lost 46% of its value against it, and the yen 6%. In September, five major economies say other currencies should rise against it, and stand ready to cooperate.',
  'September 22: The Plaza Accord. Finance ministers and central bank governors of five major economies, meeting at the Plaza Hotel, say a further orderly rise of other currencies against the dollar is desirable.',
  'Over the year, the Mark gained the most against the dollar, 27%, and the Australian dollar lost the most, 16%.',
];

let panel: HTMLElement | null = null;

export function toggleAudition(sound: SoundEngine): void {
  if (panel) {
    panel.remove();
    panel = null;
    return;
  }
  panel = build(sound);
  document.body.appendChild(panel);
}

function build(sound: SoundEngine): HTMLElement {
  const root = document.createElement('section');
  root.setAttribute('aria-label', 'BGM audition');
  root.style.cssText =
    'position:fixed;top:12px;right:12px;z-index:30;width:min(380px,calc(100vw - 32px));max-height:calc(100vh - 24px);overflow:auto;' +
    'background:rgba(6,10,22,0.94);color:#e8eef8;border:1px solid #3a4a6a;border-radius:12px;padding:12px 14px;' +
    'font:14px/1.4 system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,0.5)';
  const h = document.createElement('h2');
  h.textContent = 'BGM audition';
  h.style.cssText = 'font-size:16px;margin:0 0 8px';
  root.appendChild(h);

  const start = async () => {
    await sound.unlock();
    sound.setPaused(false);
  };
  const row = (label: string) => {
    const d = document.createElement('div');
    d.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:6px 0';
    const l = document.createElement('span');
    l.textContent = label;
    l.style.cssText = 'width:100%;color:#9fb3d1;font-size:12px';
    d.appendChild(l);
    root.appendChild(d);
    return d;
  };
  const button = (parent: HTMLElement, text: string, on: () => void) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.style.cssText =
      'font:inherit;font-size:13px;font-weight:600;padding:6px 10px;min-width:0;border-radius:8px;border:1px solid #4a5a7a;background:#111a2e;color:#e8eef8;cursor:pointer';
    b.addEventListener('click', on);
    parent.appendChild(b);
    return b;
  };
  const mark = (buttons: HTMLButtonElement[], active: HTMLButtonElement) => {
    for (const b of buttons) {
      const on = b === active;
      b.setAttribute('aria-pressed', String(on));
      b.style.background = on ? '#ffd84a' : '#111a2e';
      b.style.color = on ? '#0b0f1a' : '#e8eef8';
    }
  };

  // Pieces.
  const styles = row('Piece');
  const styleButtons: HTMLButtonElement[] = [];
  for (const s of STYLES) {
    const b = button(styles, STYLE_LABEL[s], async () => {
      await start();
      sound.setStyle(s);
      try {
        localStorage.setItem('ctm-bgm', s);
      } catch {
        /* private mode */
      }
      mark(styleButtons, b);
    });
    styleButtons.push(b);
  }
  mark(styleButtons, styleButtons[STYLES.indexOf(sound.style)]);

  // Modes.
  const modes = row('Mode (Auto: the journey decides)');
  const modeButtons: HTMLButtonElement[] = [];
  const modeList: [string, SoundMode | null][] = [['Auto', null], ['Selection', 'selection'], ['Guide', 'guide'], ['Summary', 'summary'], ['Flowing', 'flowing']];
  for (const [label, mode] of modeList) {
    const b = button(modes, label, async () => {
      await start();
      sound.forcedMode = mode;
      if (mode) sound.setMode(mode);
      mark(modeButtons, b);
    });
    modeButtons.push(b);
  }
  mark(modeButtons, modeButtons[0]);

  // Narration test: the browser's English voice over the music, with Tock's duck.
  const voice = row('Narration test (English voice over the music)');
  let reading = false;
  let k = 0;
  const readNext = () => {
    if (!reading || !('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(LINES[k++ % LINES.length]);
    u.lang = 'en-US';
    u.onstart = () => sound.duck(true);
    u.onend = u.onerror = () => {
      sound.duck(false);
      window.setTimeout(readNext, 1200);
    };
    window.speechSynthesis.speak(u);
  };
  const voiceButton = button(voice, 'Start reading', async () => {
    await start();
    reading = !reading;
    voiceButton.textContent = reading ? 'Stop reading' : 'Start reading';
    if (reading) readNext();
    else {
      window.speechSynthesis?.cancel();
      sound.duck(false);
    }
  });

  // Where the piece is.
  const info = document.createElement('p');
  info.style.cssText = 'margin:6px 0;color:#cfe0f5;font-size:13px;min-height:2.6em';
  root.appendChild(info);
  const tick = window.setInterval(() => {
    if (!root.isConnected) return window.clearInterval(tick);
    const p = sound.bedPosition;
    info.textContent = `${STYLE_LABEL[sound.style]} · chord ${p.chord} (${p.index + 1}, verse ${p.verse + 1}) · mode ${sound.currentMode}${sound.forcedMode ? ' (held)' : ''} · ${sound.meterText()}`;
  }, 500);

  // Render files.
  const files = row('Render a 48 s preview (WAV): 18 s selection, then guide with the voice duck');
  const out = document.createElement('div');
  out.style.cssText = 'font-size:12px;color:#cfe0f5';
  const render = async (s: BgmStyle) => {
    const note = document.createElement('div');
    note.textContent = `${STYLE_LABEL[s]}: rendering...`;
    out.appendChild(note);
    const r = await renderPreview(s);
    const name = `bgm-${STYLES.indexOf(s) === 0 ? 'A' : STYLES.indexOf(s) === 1 ? 'B' : 'C'}-${s}.wav`;
    const url = URL.createObjectURL(r.wav);
    note.innerHTML = '';
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.textContent = name;
    a.style.color = '#ffd84a';
    note.append(a, ` peak ${r.peakDb} dBFS, RMS ${r.rmsDb} (selection ${r.selectionRmsDb}, guide ${r.guideRmsDb}) · ${r.chords.map((c) => c.name).join(' → ')}`);
    await save(name, r);
  };
  for (const s of STYLES) button(files, s === 'cinematic' ? 'A' : s === 'piano' ? 'B' : 'C', () => void render(s));
  button(files, 'All three', async () => {
    for (const s of STYLES) await render(s);
  });
  root.appendChild(out);
  button(root, 'Close', () => toggleAudition(sound));
  return root;
}

/** In the dev server, also save the file and its numbers to audition/ (scripts read them). */
async function save(name: string, r: RenderResult): Promise<void> {
  if (!import.meta.env.DEV) return;
  try {
    await fetch(`/__bgm-save?name=${encodeURIComponent(name)}`, { method: 'POST', body: r.wav });
    const { wav: _wav, ...numbers } = r;
    await fetch(`/__bgm-save?name=${encodeURIComponent(name.replace(/\.wav$/, '.json'))}`, { method: 'POST', body: JSON.stringify(numbers, null, 1) });
  } catch {
    /* not the dev server */
  }
}
