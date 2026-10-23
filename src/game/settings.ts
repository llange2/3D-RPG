/**
 * Preferences that belong to the player and not to a save: kept in the browser's storage, so they survive new games.
 * Storage can be missing (private window, blocked site data): a failed read gives the default, a failed write just means the
 * choice is not remembered. (The model set is stored on its own, see `render/modelSet.ts`: the page is reloaded for it.)
 */
import type { Resolution, ViewDistance } from "../render/engine";

export interface Settings {
  /**
   * The ground and floors: the old 3D models (the ground tile models of the overworld and the campaign's outdoor maps, the dungeon floor
   * model) or the flat painted tiles and textured quads. A town's floor is the same in both: the old game's city floor is a flat slab.
   */
  floorModel: boolean;
  /** How much of the world is drawn around the party (chunks, windows of models, fog). */
  viewDistance: ViewDistance;
  /** `low` renders the picture smaller and lets the browser scale it up. */
  resolution: Resolution;
  /** Frames per second in the corner of the screen. */
  showFps: boolean;
  music: boolean;
  /** Sound effects and the background sounds of the surroundings. */
  sfx: boolean;
  /** The service windows of the towns show the old game's moving pictures (`ui/townScenes.ts`) instead of stills. */
  animatedTown: boolean;
}

const KEY = "mm3-seed-rpg:settings:v1";
export const DEFAULT_SETTINGS: Settings = { floorModel: true, viewDistance: "medium", resolution: "normal", showFps: false, music: true, sfx: true, animatedTown: false };

/** The chunk radius of the old quality setting (`low` 2, `med` 3, `high` and `ultra` 4) is what the view distance is now. */
const OLD_QUALITY_VIEW: Record<string, ViewDistance> = { low: "close", med: "medium", high: "far", ultra: "far" };

/** Settings from the stored text; older versions kept a `quality` (view and resolution in one) that is split up here. */
export function parseSettings(raw: string | null): Settings {
  const out: Settings = { ...DEFAULT_SETTINGS };
  if (!raw) return out;
  let stored: Record<string, unknown>;
  try {
    stored = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return out; // corrupt: start from the defaults
  }
  if (typeof stored !== "object" || stored === null) return out;
  const quality = typeof stored.quality === "string" ? stored.quality : undefined;
  if (quality) {
    out.resolution = quality === "low" ? "low" : "normal";
    out.viewDistance = OLD_QUALITY_VIEW[quality] ?? out.viewDistance;
  }
  if (typeof stored.floorModel === "boolean") out.floorModel = stored.floorModel;
  if (stored.viewDistance === "close" || stored.viewDistance === "medium" || stored.viewDistance === "far") {
    if (!quality) out.viewDistance = stored.viewDistance;
    else {
      // the old view setting was relative to the quality: far was the quality's own radius, medium one less, close half of it
      const base = quality === "low" ? 2 : quality === "high" || quality === "ultra" ? 4 : 3;
      const radius = stored.viewDistance === "far" ? base : stored.viewDistance === "medium" ? Math.max(1, base - 1) : Math.max(1, Math.floor(base / 2));
      out.viewDistance = radius <= 2 ? "close" : radius === 3 ? "medium" : "far";
    }
  }
  if (stored.resolution === "normal" || stored.resolution === "low") out.resolution = stored.resolution;
  if (typeof stored.showFps === "boolean") out.showFps = stored.showFps;
  if (typeof stored.music === "boolean") out.music = stored.music;
  if (typeof stored.sfx === "boolean") out.sfx = stored.sfx;
  if (typeof stored.animatedTown === "boolean") out.animatedTown = stored.animatedTown;
  return out;
}

export function readSettings(): Settings {
  try {
    return parseSettings(localStorage.getItem(KEY));
  } catch {
    return { ...DEFAULT_SETTINGS }; // storage blocked
  }
}

export function writeSettings(settings: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // not remembered
  }
}
