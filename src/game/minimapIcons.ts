import { assetPath } from "../ui/dom";

/**
 * The symbols of the map: the old game's `tex_mm_*` pictures as one sheet (`public/assets/ui/minimap.webp`, built by
 * `tools/assets/build-minimap.ts`). Meadow, desert, dirt, snow, swamp, lava and cobblestone are one neutral tile that this class multiplies by
 * the register's colours; mountains, trees and palms are drawings on a transparent ground that go on top. Tiles made this way are cached, so the
 * map draws from a handful of small canvases and the page loads one picture instead of 38.
 */
export type GroundName = "grass" | "forest" | "desert" | "snow" | "swamp" | "volcanic" | "dirt" | "bridge" | "floor" | "lava" | "cobble" | "shore";
export type DrawingName = "mountain" | "trees" | "palms";
export type SymbolName =
  | "wall" | "floor" | "water" | "door" | "door_open" | "event" | "info" | "persona" | "trap" | "maptransfer"
  | "inn" | "training" | "tavern" | "smith" | "temple" | "bank" | "guild" | "unknown" | "pos1" | "pos2" | "teleporter_city";

interface Register {
  cell: number;
  icons: Record<string, { x: number; y: number }>;
  tints: Record<string, [number, number, number]>;
}

/** Grounds that are another ground made darker (the register has the eight the old game painted). */
const DERIVED: Partial<Record<GroundName, { from: string; by: [number, number, number] }>> = {
  forest: { from: "grass", by: [0.78, 0.85, 0.78] },
  volcanic: { from: "dirt", by: [0.62, 0.52, 0.5] },
  bridge: { from: "dirt", by: [0.72, 0.68, 0.64] },
  shore: { from: "desert", by: [0.95, 0.95, 0.95] },
};

export class MinimapIcons {
  /** Side of one symbol on the sheet, in pixels. */
  readonly cell: number;
  private readonly tiles = new Map<string, HTMLCanvasElement>();

  private constructor(
    private readonly sheet: HTMLImageElement,
    private readonly register: Register,
  ) {
    this.cell = register.cell;
  }

  /** Loads the sheet; null when it is not there (the maps then fall back to coloured squares). */
  static async load(): Promise<MinimapIcons | null> {
    try {
      const [register, sheet] = await Promise.all([
        fetch(assetPath("ui/minimap.json")).then((r) => (r.ok ? (r.json() as Promise<Register>) : Promise.reject(new Error("no minimap register")))),
        new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error("no minimap sheet"));
          img.src = assetPath("ui/minimap.webp");
        }),
      ]);
      return new MinimapIcons(sheet, register);
    } catch {
      return null;
    }
  }

  private source(name: string): { x: number; y: number } {
    const at = this.register.icons[name];
    if (!at) throw new Error(`minimap symbol ${name} is not on the sheet`);
    return at;
  }

  private tint(ground: GroundName): [number, number, number] {
    const derived = DERIVED[ground];
    if (!derived) return this.register.tints[ground] ?? [1, 1, 1];
    const base = this.register.tints[derived.from] ?? [1, 1, 1];
    return [base[0] * derived.by[0], base[1] * derived.by[1], base[2] * derived.by[2]];
  }

  /** A ground tile, with a drawing on it if asked for: a canvas of the sheet's cell size, made once. */
  ground(name: GroundName, drawing?: DrawingName): HTMLCanvasElement {
    const key = `${name}+${drawing ?? ""}`;
    let tile = this.tiles.get(key);
    if (tile) return tile;
    const n = this.cell;
    tile = document.createElement("canvas");
    tile.width = n;
    tile.height = n;
    const ctx = tile.getContext("2d")!;
    // the neutral ground, multiplied by the colour of this ground (a multiplication can brighten a channel, which the canvas blend mode cannot do)
    const base = this.source("ground");
    ctx.drawImage(this.sheet, base.x, base.y, n, n, 0, 0, n, n);
    const px = ctx.getImageData(0, 0, n, n);
    const t = this.tint(name);
    for (let i = 0; i < px.data.length; i += 4) for (let c = 0; c < 3; c++) px.data[i + c] = Math.min(255, Math.round(px.data[i + c]! * t[c]!));
    ctx.putImageData(px, 0, 0);
    if (drawing) {
      const d = this.source(drawing);
      ctx.drawImage(this.sheet, d.x, d.y, n, n, 0, 0, n, n);
    }
    this.tiles.set(key, tile);
    return tile;
  }

  /** Draws a ground tile (with its drawing) into the square at `x, y` of side `w`. */
  drawGround(ctx: CanvasRenderingContext2D, name: GroundName, drawing: DrawingName | undefined, x: number, y: number, w: number): void {
    ctx.drawImage(this.ground(name, drawing), x, y, w, w);
  }

  /** Draws a symbol of the sheet into a rectangle (a place of 3 x 3 tiles is one symbol over three tiles). */
  drawSymbol(ctx: CanvasRenderingContext2D, name: SymbolName, x: number, y: number, w: number, h = w, alpha = 1): void {
    const at = this.source(name);
    const old = ctx.globalAlpha;
    ctx.globalAlpha = old * alpha;
    ctx.drawImage(this.sheet, at.x, at.y, this.cell, this.cell, x, y, w, h);
    ctx.globalAlpha = old;
  }

  /** A symbol or a ground as a small picture for the legend (a data URL). */
  legendIcon(what: { symbol: SymbolName; frame?: string; veil?: boolean } | { ground: GroundName; drawing?: DrawingName }): string {
    const out = document.createElement("canvas");
    out.width = this.cell;
    out.height = this.cell;
    const ctx = out.getContext("2d")!;
    if ("symbol" in what) {
      this.drawSymbol(ctx, what.symbol, 0, 0, this.cell);
      // shallow water is the deep water's picture under a light veil, as on the map
      if (what.veil) {
        ctx.fillStyle = "rgba(255,255,255,0.32)";
        ctx.fillRect(0, 0, this.cell, this.cell);
      }
      if (what.frame) {
        ctx.strokeStyle = what.frame;
        ctx.lineWidth = 6;
        ctx.strokeRect(3, 3, this.cell - 6, this.cell - 6);
      }
    } else this.drawGround(ctx, what.ground, what.drawing, 0, 0, this.cell);
    return out.toDataURL("image/png");
  }
}
