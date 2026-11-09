/**
 * Spoken lines (accessibility, and the guide robot's voice): the browser's
 * built-in speech synthesis. Subtitles are always shown; speech is optional,
 * switched on by a user action (the start screen's checkbox or the Voice
 * button), and the app never depends on it: if the browser has no voices or
 * blocks speech, `speaking` simply stays false and the subtitles carry on.
 *
 * Language: English (en-US). `lang` can be changed for a translated script.
 */
export class Narration {
  enabled = false;
  lang = 'en-US';
  readonly available = typeof window !== 'undefined' && 'speechSynthesis' in window;
  /** True from the start of a line until it ends (or fails). */
  speaking = false;
  /** Called when speech starts and stops (the music ducks under the voice). */
  onSpeaking: ((on: boolean) => void) | null = null;
  private token = 0;
  private watchdog: number | undefined;

  speak(text: string): void {
    if (!this.enabled || !this.available) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = this.lang;
      u.rate = 0.97;
      u.volume = 0.95;
      const token = ++this.token;
      const done = () => {
        if (token !== this.token) return;
        window.clearTimeout(this.watchdog);
        this.set(false);
      };
      u.onend = done;
      u.onerror = done;
      this.set(true);
      // If the engine never starts (no voices, blocked), do not wait for it.
      window.clearTimeout(this.watchdog);
      this.watchdog = window.setTimeout(() => {
        if (token === this.token && !window.speechSynthesis.speaking) done();
      }, 1500);
      window.speechSynthesis.speak(u);
    } catch {
      this.set(false);
    }
  }

  stop(): void {
    this.token++;
    window.clearTimeout(this.watchdog);
    this.set(false);
    if (!this.available) return;
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
  }

  private set(on: boolean): void {
    if (this.speaking === on) return;
    this.speaking = on;
    this.onSpeaking?.(on);
  }
}
