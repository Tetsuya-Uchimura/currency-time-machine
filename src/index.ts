/**
 * Currency Time Machine - entry point.
 *
 * Boot order: create the IWSDK world, load the bundled history (static JSON),
 * build the scene, then wait for the user to enter VR (or watch in the
 * browser). The first user gesture also unlocks Web Audio.
 */
import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { SLOTS } from './config.js';
import { loadAnnualData } from './data/annual-history.js';
import { loadHistoryContent } from './data/history-content.js';
import { loadTimeline } from './data/timeline.js';
import { ExperienceSystem, type JourneyMode } from './experience.js';
import { PANEL_STORAGE_KEY } from './interaction/panel-placement.js';
import { STYLES, type BgmStyle } from './audio/score.js';
import { getLang, onLangChange, setLang, setTextCatalog, t, type Lang } from './i18n/i18n.js';
import { loadWorldMap } from './visual/world-currency-map.js';

const overlay = document.getElementById('start-overlay');
const enterVr = document.getElementById('enter-vr') as HTMLButtonElement | null;
const watch = document.getElementById('watch-browser') as HTMLButtonElement | null;
const status = document.getElementById('start-status');

/** The start screen in the display language (English, or the Japanese review translation). */
function translatePage(): void {
  document.documentElement.lang = getLang();
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n as Parameters<typeof t>[0]);
  });
}

/** English is the default; `?lang=ja` (for review) or the start screen's choice switches the display language. */
function initLanguage(): void {
  const asked = new URLSearchParams(location.search).get('lang');
  const radios = document.querySelectorAll<HTMLInputElement>('input[name="lang"]');
  if (asked === 'ja' || asked === 'en') {
    setLang(asked);
    radios.forEach((r) => (r.checked = r.value === asked));
  }
  radios.forEach((r) => r.addEventListener('change', () => r.checked && setLang(r.value as Lang)));
  // Any change (start screen or the lap panel's Lang button) keeps the radios in step.
  onLangChange((lang) => {
    radios.forEach((r) => (r.checked = r.value === lang));
    translatePage();
  });
  translatePage();
}

/** The Japanese data texts (events, places, names): public/data/i18n-ja.json. Missing: English is shown. */
async function loadTranslations(baseUrl: string): Promise<void> {
  try {
    const res = await fetch(`${baseUrl}data/i18n-ja.json`);
    if (!res.ok) return;
    const c = (await res.json()) as { text?: Record<string, string>; names?: Record<string, string> };
    setTextCatalog({ ...(c.text ?? {}), ...(c.names ?? {}) });
  } catch {
    /* English only */
  }
}

async function main(): Promise<void> {
  const world = await World.create(document.getElementById('scene-container') as HTMLDivElement, projectOptions);
  world.registerSystem(ExperienceSystem, { priority: 10 });
  const experience = world.getSystem(ExperienceSystem)!;
  initLanguage();
  const [timeline, content, worldMap, annual] = await Promise.all([
    loadTimeline(SLOTS.map((s) => s.slot)),
    loadHistoryContent(import.meta.env.BASE_URL),
    loadWorldMap(import.meta.env.BASE_URL),
    loadAnnualData(import.meta.env.BASE_URL),
    loadTranslations(import.meta.env.BASE_URL),
  ]);
  await experience.setup(timeline, content, worldMap, annual, import.meta.env.BASE_URL);
  initMusic(experience);
  // Start-screen options, read inside the click (a user gesture: audio and speech may start).
  const options = () => ({
    mode: ((document.querySelector('input[name="mode"]:checked') as HTMLInputElement | null)?.value ?? 'year') as JourneyMode,
    voice: (document.getElementById('opt-voice') as HTMLInputElement | null)?.checked ?? false,
    calm: (document.getElementById('opt-calm') as HTMLInputElement | null)?.checked ?? false,
    lang: getLang(),
  });

  const hideOverlay = () => overlay?.classList.add('hidden');
  if (status) {
    status.textContent = '';
    delete status.dataset.i18n;
  }
  if (enterVr) {
    // The world is configured for VR, but this device may not be able to run it (a PC browser
    // without a headset): ask the browser, and say so instead of a button that silently fails.
    enterVr.disabled = !world.xrEnabled;
    void vrSupported().then((ok) => {
      if (ok) return;
      enterVr.disabled = true;
      showStatus('start.noVr');
    });
    enterVr.addEventListener('click', () => {
      experience.configure(options());
      experience.unlockAudio(); // inside the click: allowed to start audio
      world.launchXR();
      // launchXR reports a refused session only in the console: tell the user if no session came.
      window.setTimeout(() => {
        if (!world.session && !world.sessionRequestPending && !overlay?.classList.contains('hidden')) showStatus('start.vrFailed');
      }, 2500);
    });
  }
  // A moved hand panel can always be put back from here (its saved place is forgotten).
  const resetRow = document.getElementById('reset-panel-row');
  const hasSavedPanel = () => {
    try {
      return localStorage.getItem(PANEL_STORAGE_KEY) !== null;
    } catch {
      return false;
    }
  };
  if (resetRow) resetRow.hidden = !hasSavedPanel();
  document.getElementById('reset-panel')?.addEventListener('click', () => {
    experience.resetPanel();
    try {
      localStorage.removeItem(PANEL_STORAGE_KEY);
    } catch {
      /* private mode */
    }
    if (resetRow) resetRow.hidden = true;
    showStatus('start.panelReset');
  });
  watch?.addEventListener('click', () => {
    hideOverlay();
    experience.configure(options());
    experience.unlockAudio();
    experience.start();
  });
  // Entering XR by any route (button or the browser's own offer) hides the overlay.
  world.visibilityState.subscribe((state) => {
    if (state !== 'non-immersive') hideOverlay();
  });
  if (watch) watch.disabled = false;
}

/**
 * The ambient piece: `?bgm=A|B|C` (or cinematic, piano, cosmic), else the one last chosen in the audition
 * panel on this browser, else A. `?audition` (any build) or `O` (dev) opens the audition panel.
 */
function initMusic(experience: ExperienceSystem): void {
  const params = new URLSearchParams(location.search);
  const asked = (params.get('bgm') ?? '').toLowerCase();
  const byLetter: Record<string, BgmStyle> = { a: 'cinematic', b: 'piano', c: 'cosmic' };
  let style: BgmStyle | undefined = byLetter[asked] ?? STYLES.find((s) => s === asked);
  if (!style) {
    try {
      style = STYLES.find((s) => s === localStorage.getItem('ctm-bgm'));
    } catch {
      /* private mode */
    }
  }
  if (style) experience.sound.setStyle(style);
  const open = () => void import('./dev/audition.js').then((m) => m.toggleAudition(experience.sound));
  if (params.has('audition')) open();
  if (import.meta.env.DEV) {
    window.addEventListener('keydown', (e) => {
      if (e.key.toLowerCase() === 'o' && !e.ctrlKey && !e.metaKey && !e.altKey) open();
    });
  }
}

/** Can this browser start an immersive VR session (a headset, Quest Browser, or the dev emulator)? */
async function vrSupported(): Promise<boolean> {
  const xr = (navigator as Navigator & { xr?: { isSessionSupported(mode: string): Promise<boolean> } }).xr;
  if (!xr) return false;
  try {
    return await xr.isSessionSupported('immersive-vr');
  } catch {
    return false;
  }
}

/** A start-screen message in the display language (kept translated when the language changes). */
function showStatus(key: 'start.noVr' | 'start.vrFailed' | 'start.panelReset'): void {
  if (!status) return;
  status.dataset.i18n = key;
  status.textContent = t(key);
}

main().catch((err) => {
  console.error(err);
  if (status) status.textContent = t('start.failed');
});
