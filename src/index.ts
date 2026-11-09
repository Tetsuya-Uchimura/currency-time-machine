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
import { loadHistoryContent } from './data/history-content.js';
import { loadTimeline } from './data/timeline.js';
import { ExperienceSystem } from './experience.js';

const overlay = document.getElementById('start-overlay');
const enterVr = document.getElementById('enter-vr') as HTMLButtonElement | null;
const watch = document.getElementById('watch-browser') as HTMLButtonElement | null;
const status = document.getElementById('start-status');

async function main(): Promise<void> {
  const world = await World.create(document.getElementById('scene-container') as HTMLDivElement, projectOptions);
  world.registerSystem(ExperienceSystem, { priority: 10 });
  const experience = world.getSystem(ExperienceSystem)!;
  const [timeline, content] = await Promise.all([
    loadTimeline(SLOTS.map((s) => s.slot)),
    loadHistoryContent(import.meta.env.BASE_URL),
  ]);
  await experience.setup(timeline, content);

  const hideOverlay = () => overlay?.classList.add('hidden');
  if (status) status.textContent = '';
  if (enterVr) {
    enterVr.disabled = !world.xrEnabled;
    enterVr.addEventListener('click', () => {
      experience.unlockAudio(); // inside the click: allowed to start audio
      world.launchXR();
    });
  }
  watch?.addEventListener('click', () => {
    hideOverlay();
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
  if (status) status.textContent = 'Something went wrong while loading. Please reload the page.';
});
