import type { TileInfo } from "../world/types";
import type { World } from "../world/world";
import type { Explored } from "./state";

/**
 * The big map of the overworld zoomed far out (52nd playtest, point 8). Drawing every tile as a picture of the sheet costs one `drawImage` with a smoothed shrink each: at the whole
 * 400 x 280 world that is over a hundred thousand of them for every step of the wheel, and the map stuttered. Beyond `OVERVIEW_CELLS` cells across the map is drawn from this
 * picture instead: one pixel per tile of the whole world, in the average colour of the tile's picture (roads, mountains and water stay in their own colours, a wood is the green
 * of its trees), made once while the map is open (the game stands still, so what the party has seen cannot change meanwhile), a few rows at a time so that the page does not
 * wait for it. A zoom step is then one `drawImage` of a window of it.
 */
export const OVERVIEW_CELLS = 81;

/** The colour of a tile as the packed pixel of a little-endian `ImageData` (opaque). */
export const packColor = (r: number, g: number, b: number): number => ((255 << 24) | (Math.round(b) << 16) | (Math.round(g) << 8) | Math.round(r)) >>> 0;
/** The dark of what the party has not seen (`#0a0705`, the map's background). */
const UNSEEN = packColor(10, 7, 5);
/** Rows made per slice of the background work. */
const ROWS_PER_SLICE = 14;

export class OverworldOverview {
  private readonly canvas: HTMLCanvasElement;
  private readonly image: ImageData;
  private readonly pixels: Uint32Array;
  private row = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly world: World,
    private readonly explored: Explored,
    private readonly revealAll: boolean,
    /** The packed colour of a tile (`packColor`). */
    private readonly colorOf: (t: TileInfo) => number,
  ) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = world.width;
    this.canvas.height = world.height;
    this.image = new ImageData(world.width, world.height);
    this.pixels = new Uint32Array(this.image.data.buffer);
  }

  get ready(): boolean {
    return this.row >= this.world.height;
  }

  /** Starts making the picture in the background. */
  start(): void {
    if (this.ready || this.timer !== null) return;
    this.timer = setTimeout(this.slice, 0);
  }

  /** Stops the background work (the map is closed). */
  stop(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private readonly slice = (): void => {
    this.timer = null;
    this.build(ROWS_PER_SLICE);
    if (!this.ready) this.timer = setTimeout(this.slice, 0);
  };

  private build(rows: number): void {
    const { width, height } = this.world;
    const end = Math.min(height, this.row + rows);
    for (let y = this.row; y < end; y++) {
      for (let x = 0; x < width; x++) {
        this.pixels[y * width + x] = !this.revealAll && !this.explored.hasOverworld(x, y) ? UNSEEN : this.colorOf(this.world.tile(x, y));
      }
    }
    this.row = end;
    if (this.ready) this.canvas.getContext("2d")!.putImageData(this.image, 0, 0);
  }

  /**
   * Draws the window of `cells` tiles across around (`mx`, `my`) into a square canvas context of `size` pixels, and returns the pixels one tile takes. What is not made yet is made now
   * (the first draw of a map that was opened and zoomed out within a moment). The world is shown once: tiles beyond its edge stay as the context was cleared.
   */
  draw(ctx: CanvasRenderingContext2D, size: number, mx: number, my: number, cells: number): number {
    if (!this.ready) this.build(this.world.height);
    const k = size / cells;
    const half = Math.floor(cells / 2);
    const x0 = mx - half;
    const y0 = my - half;
    const sx0 = Math.max(0, x0);
    const sy0 = Math.max(0, y0);
    const sx1 = Math.min(this.world.width, x0 + cells);
    const sy1 = Math.min(this.world.height, y0 + cells);
    if (sx1 > sx0 && sy1 > sy0) {
      // a plain stretch, not the high-quality one of the detailed map: a road one tile wide must stay a line, and this runs for every step of the wheel
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "low";
      ctx.drawImage(this.canvas, sx0, sy0, sx1 - sx0, sy1 - sy0, (sx0 - x0) * k, (sy0 - y0) * k, (sx1 - sx0) * k, (sy1 - sy0) * k);
    }
    return k;
  }
}
