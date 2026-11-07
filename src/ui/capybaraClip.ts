import { assetPath, h } from "./dom";

/** The pause of the picture between two turns (seconds): the Capybara turns round every one to three minutes. */
export const CAPYBARA_EVERY: readonly [number, number] = [60, 180];
/** How long it looks away, halfway through the turn (seconds). */
export const CAPYBARA_HOLD: readonly [number, number] = [5, 15];

/** A moment between `range[0]` and `range[1]` seconds, in milliseconds (`pick` is a number of [0, 1), the browser's own dice by default). */
export const waitMs = (range: readonly [number, number], pick: number = Math.random()): number => (range[0] + pick * (range[1] - range[0])) * 1000;

/**
 * The picture of the Capybara mascot (7. 11. 2026, the user's clip `capybara_turn.mp4`): it stands still, and every one to three minutes it plays the clip up to
 * the middle (where it looks over its shoulder), holds there for five to fifteen seconds and plays the rest, back to where it began. Used by the card beside the
 * heroes and by the mascot page; each takes its own clip. The timer runs from `start()` to `stop()`, and ends by itself once the picture has left the page.
 */
export class CapybaraClip {
  readonly el: HTMLVideoElement;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;

  constructor(className = "portrait") {
    this.el = Object.assign(h("video", { class: className, src: assetPath("ui/capybara_turn.webm") }), { poster: assetPath("icons/portraits/npc06.webp"), muted: true, playsInline: true, preload: "auto" });
    this.el.load();
  }

  /** Starts the wait for the first turn (a clip that is already waiting is left alone, so the card's rebuild does not restart it). */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.wait(CAPYBARA_EVERY, () => this.turn());
  }

  stop(): void {
    this.running = false;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.el.pause();
    this.el.currentTime = 0;
  }

  private wait(range: readonly [number, number], then: () => void): void {
    this.timer = setTimeout(() => {
      this.timer = null;
      // a picture that is no longer on the page is not worth the timer (the mascot page makes a new one each time it opens)
      if (!this.running) return;
      if (!this.el.isConnected) return this.stop();
      then();
    }, waitMs(range));
  }

  /** From the beginning to the middle of the clip. */
  private turn(): void {
    const half = (Number.isFinite(this.el.duration) ? this.el.duration : 10) / 2;
    this.el.currentTime = 0;
    void this.el.play().catch(() => undefined);
    // (a timer rather than `timeupdate`, which fires four times a second only: the clip would stop up to a quarter of a second late)
    this.timer = setTimeout(() => {
      this.timer = null;
      if (!this.running) return;
      this.el.pause();
      this.el.currentTime = half;
      this.wait(CAPYBARA_HOLD, () => this.finish());
    }, half * 1000);
  }

  /** From the middle to the end, then back to the first picture and the long wait. */
  private finish(): void {
    const left = (Number.isFinite(this.el.duration) ? this.el.duration : 10) - this.el.currentTime;
    void this.el.play().catch(() => undefined);
    this.timer = setTimeout(() => {
      this.timer = null;
      if (!this.running) return;
      this.el.pause();
      this.el.currentTime = 0;
      this.wait(CAPYBARA_EVERY, () => this.turn());
    }, left * 1000);
  }
}
