/**
 * Optional spoken captions (accessibility): reads each caption aloud with the
 * browser's built-in speech synthesis. Off by default; toggled from the hand
 * panel. If the browser has no speech synthesis, the toggle is hidden.
 */
export class Narration {
  enabled = false;
  readonly available = typeof window !== 'undefined' && 'speechSynthesis' in window;

  speak(text: string): void {
    if (!this.enabled || !this.available) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      u.rate = 0.95;
      u.volume = 0.9;
      window.speechSynthesis.speak(u);
    } catch {
      /* speech is best-effort */
    }
  }

  stop(): void {
    if (!this.available) return;
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
  }
}
