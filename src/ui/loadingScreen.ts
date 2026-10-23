import { assetPath, h } from "./dom";

/** The old game had four loading pictures (`loading_screen1` to `4`) and drew one at random for every map. */
const PICTURES = 4;
/** The old game kept the screen at 100 % for 0.3 seconds before it took it down. */
const LINGER_MS = 300;
const FADE_MS = 250;

/** Resolves after the browser has painted what changed so far; the work that follows blocks the page for a while. */
function painted(): Promise<void> {
  return new Promise((resolve) => {
    // a hidden tab does not paint at all
    const timer = setTimeout(resolve, 150);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        clearTimeout(timer);
        resolve();
      }),
    );
  });
}

/**
 * The old game's loading screen: one of its four pictures with the percentage on it. The game shows it while a map is built
 * and keeps it until everything on the map can be drawn, so the party never sees a chest hang in the air before the walls
 * around it have arrived.
 */
export class LoadingScreen {
  readonly element: HTMLElement;
  private picture: HTMLImageElement;
  private readonly percent: HTMLElement;
  private shown = false;
  private value = 0;
  private last = 0;
  private fade: ReturnType<typeof setTimeout> | null = null;

  constructor(parent: HTMLElement) {
    this.picture = h("img", { alt: "" });
    this.percent = h("div", { class: "percent", text: "0%" });
    this.element = h("div", { class: "loading" }, this.picture, this.percent);
    parent.append(this.element);
  }

  /** Is the screen up? Input is ignored meanwhile. */
  get active(): boolean {
    return this.shown;
  }

  /** Puts a random picture up at 0 %. Resolves once it is on screen, so the work that follows cannot delay it. */
  async show(): Promise<void> {
    if (this.shown) return;
    this.shown = true;
    this.value = 0;
    this.percent.textContent = "0%";
    // a screen that is still up or fading out from the last map keeps its picture, a second one would flash by
    const visible = this.element.classList.contains("on");
    if (this.fade !== null) clearTimeout(this.fade);
    this.fade = null;
    if (!visible) {
      // the picture is a few hundred KB: it is loaded and decoded in an element of its own while the screen is still hidden. The same
      // `<img>` with a new `src` shows the old picture until the new one has arrived, and a decode that fails (a big world has the page short
      // of memory) would let the last map's picture, or none, show first and then switch
      const next = await this.fetchPicture();
      this.picture.replaceWith(next);
      this.picture = next;
    }
    this.element.classList.remove("out");
    this.element.classList.add("on");
    await painted();
  }

  private async fetchPicture(): Promise<HTMLImageElement> {
    const img = h("img", { alt: "" }) as HTMLImageElement;
    // not the picture of the map before, so that a scene change is always told by a new picture
    let n = 1 + Math.floor(Math.random() * PICTURES);
    if (n === this.last) n = (n % PICTURES) + 1;
    this.last = n;
    img.src = assetPath(`ui/loading_screen${n}.webp`);
    await img.decode().catch(() => (img.complete ? undefined : new Promise<void>((resolve) => { img.onload = img.onerror = () => resolve(); })));
    return img;
  }

  /** Sets the share of the work that is done (0 to 1). The percentage never goes back. */
  set(fraction: number): void {
    if (!this.shown) return;
    const pct = Math.max(this.value, Math.min(100, Math.floor(fraction * 100)));
    if (pct === this.value) return;
    this.value = pct;
    this.percent.textContent = `${pct}%`;
  }

  /** Shows 100 %, waits a moment like the old game (`lingerMs`) and takes the screen down. */
  async hide(lingerMs = LINGER_MS): Promise<void> {
    if (!this.shown) return;
    this.set(1);
    if (lingerMs > 0) await new Promise((r) => setTimeout(r, lingerMs));
    this.shown = false;
    this.element.classList.add("out");
    if (this.fade !== null) clearTimeout(this.fade);
    this.fade = setTimeout(() => {
      this.element.classList.remove("on");
      this.fade = null;
    }, FADE_MS);
  }
}
