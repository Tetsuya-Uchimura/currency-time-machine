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
    enterVr.disabled = !world.xrEnabled;
    enterVr.addEventListener('click', () => {
      experience.configure(options());
      experience.unlockAudio(); // inside the click: allowed to start audio
      world.launchXR();
    });
  }
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

main().catch((err) => {
  console.error(err);
  if (status) status.textContent = t('start.failed');
});
