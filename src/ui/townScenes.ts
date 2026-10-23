import { assetPath } from "./dom";

/**
 * The animated pictures of the town services (the old game's `town_*.mp4`, 10 s loops, here small VP9 clips): the picture of the inn, the
 * smith and the rest. They are an option (`Settings.animatedTown`); off, a service shows its still picture.
 *
 * Opening a window must not wait for a file: a clip is one `<video>` element that is made once, filled from a blob that was fetched when the
 * option was switched on (or at start-up), and kept for the whole session; the window only takes it out of the pool, plays it and puts it back
 * (paused, so that a closed window costs nothing). Until its first frame is decoded the element shows the still picture as its poster.
 */
export const SERVICE_SCENES = ["bank", "guild", "inn", "smith", "tavern", "temple", "training_grounds"] as const;
export type SceneName = (typeof SERVICE_SCENES)[number];

const still = (name: string): string => assetPath(`ui/town/town_${name}.webp`);

let enabled = false;
const pool = new Map<string, HTMLVideoElement>();
let priming: Promise<void> | null = null;

function makeVideo(name: SceneName): HTMLVideoElement {
  const v = document.createElement("video");
  v.muted = true;
  v.loop = true;
  v.playsInline = true;
  v.preload = "auto";
  v.poster = still(name);
  v.disablePictureInPicture = true;
  v.setAttribute("aria-hidden", "true");
  v.className = "svc-video";
  return v;
}

/** The `<video>` of a scene, made on first use. */
function videoOf(name: SceneName): HTMLVideoElement {
  let v = pool.get(name);
  if (!v) {
    v = makeVideo(name);
    pool.set(name, v);
  }
  return v;
}

/**
 * Fetches every clip into memory, one after the other and while the browser is idle, so that the game's own loading is not slowed down, and
 * decodes the first frame of each. Calling it again returns the same promise.
 */
export function preloadTownScenes(): Promise<void> {
  priming ??= (async () => {
    const idle = () => new Promise<void>((resolve) => (typeof requestIdleCallback === "function" ? requestIdleCallback(() => resolve(), { timeout: 1500 }) : setTimeout(resolve, 50)));
    for (const name of SERVICE_SCENES) {
      if (!enabled) break;
      await idle();
      try {
        const response = await fetch(assetPath(`ui/town/town_${name}.webm`));
        if (!response.ok) continue;
        const url = URL.createObjectURL(await response.blob());
        const v = videoOf(name);
        if (v.dataset.blob) URL.revokeObjectURL(v.dataset.blob);
        v.dataset.blob = url;
        v.src = url;
        v.load();
        // the first frame is decoded now; the clip stays paused until a window shows it
        await new Promise<void>((resolve) => {
          v.addEventListener("loadeddata", () => resolve(), { once: true });
          v.addEventListener("error", () => resolve(), { once: true });
        });
      } catch {
        // without the clip the window shows the still picture: still usable
      }
    }
  })();
  return priming;
}

/** Switches the animated scenes on or off. Off, the clips are let go of (memory) and every window shows its still picture. */
export function setAnimatedTown(on: boolean): void {
  if (on === enabled) return;
  enabled = on;
  if (on) {
    priming = null;
    void preloadTownScenes();
    return;
  }
  for (const v of pool.values()) {
    v.pause();
    if (v.dataset.blob) URL.revokeObjectURL(v.dataset.blob);
    v.removeAttribute("src");
    v.load();
  }
  pool.clear();
  priming = null;
}

/** The picture of a service window: its clip when the option is on (playing from the start), else its still. */
export function townArt(name: SceneName): HTMLElement {
  if (enabled) {
    const v = videoOf(name);
    v.currentTime = 0;
    void v.play().catch(() => undefined);
    return v;
  }
  const img = document.createElement("img");
  img.src = still(name);
  img.alt = "";
  return img;
}

/** The window of a service closed: its clip stops, so that nothing runs behind the game. */
export function stopTownScene(name: SceneName): void {
  pool.get(name)?.pause();
}
