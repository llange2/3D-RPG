/**
 * The pictures of the effects (`tools/assets/sources/fx`, built to `public/assets/fx/*.webp` by `tools/assets/build-fx.ts`) and where things are on them. No Babylon here: the
 * numbers are shared with the tests, which compare them with the register of the sources (`fx_particles.json`).
 *
 * All pictures are additive and have straight alpha: alpha = intensity, rgb = the colour (white for the grey ones, which the code tints). They are blended with
 * SRC_ALPHA + ONE, so the colour under a transparent pixel never counts. A cell is counted row by row from the top left.
 */

/** How much of the effects the game draws (Options > Graphics): none, only what is cheap (impacts, the water of a fountain), or all of it. */
export type EffectsLevel = "off" | "low" | "full";
export const EFFECT_LEVELS: readonly EffectsLevel[] = ["off", "low", "full"];
export const EFFECT_NAMES: Record<EffectsLevel, string> = { off: "Off", low: "Low", full: "Full" };

/** The files under `public/assets/` (the paths `assetUrl` takes). */
export const FX_FILES = {
  particles: "fx/particles.webp",
  smoke: "fx/smoke.webp",
  ripple: "fx/water_ripple.webp",
  jet: "fx/water_jet.webp",
  impact: {
    fire: "fx/impact_fire.webp",
    ice: "fx/impact_ice.webp",
    acid: "fx/impact_acid.webp",
    magic: "fx/impact_magic.webp",
    water: "fx/impact_water.webp",
  },
} as const;

export type ImpactKind = keyof typeof FX_FILES.impact;
export const IMPACT_KINDS = Object.keys(FX_FILES.impact) as ImpactKind[];

/** The particle sheet: 8 x 8 cells of 128 px. */
export const PARTICLE_GRID = 8;
export const PARTICLE_CELL = 128;
/** The cells of the particle sheet by name (the order of `fx_particles.json`). */
export const PARTICLE_CELLS = {
  dot: 0, spark: 1, flame_tongue: 2, drop_teardrop: 3, drop_round: 4, splash_crown: 5, ripple_ring: 6, bubble: 7,
  mist_a: 8, mist_b: 9, mist_c: 10, steam_wisp: 11, dust: 12, light_ring: 13, snowflake: 14, flare: 15,
  ice_shard_a: 16, ice_shard_b: 17, frost_glint: 18, acid_blob: 19, acid_bubble: 20, magic_spark_8: 21, magic_wisp: 22, cross_glint: 23,
  magic_compass: 24, magic_cross_glow: 25, soft_star: 26, lightning_bolt: 27, lightning_arc: 28, flame_jet: 29, slash_crescent: 30, burst_sparks: 31,
  fire_puff_a: 32, fire_puff_b: 33, flame_cloud_a: 34, flame_cloud_b: 35, glow_rings: 36, ring_soft: 37, ring_double: 38, swirl: 39,
} as const;
export type ParticleName = keyof typeof PARTICLE_CELLS;

/** The impact flipbooks: 4 x 4 frames of 256 px, played once from the first to the last frame; the middle of a frame is the point of impact. */
export const IMPACT_GRID = 4;
export const IMPACT_FRAMES = 16;

/** The corners of a cell in texture coordinates, `v` growing upwards (textures are loaded flipped, so the top row of the picture is at v = 1). */
export interface CellUv {
  u0: number;
  u1: number;
  /** The bottom edge and the top edge of the cell. */
  v0: number;
  v1: number;
}

export function cellUv(cell: number, grid: number): CellUv {
  const col = cell % grid;
  const row = Math.floor(cell / grid);
  return { u0: col / grid, u1: (col + 1) / grid, v0: 1 - (row + 1) / grid, v1: 1 - row / grid };
}

/**
 * The fountains the effects know: the model of the town square (`obj_fountain`) and of the landmark in the open country (item 2, the same file). Heights are in model units over the
 * lowest point (the instance's scale makes them world units), measured on the file (`node tools/dev/model-profile.mjs public/assets/models-original/obj_fountain.glb`): the lower basin holds its water at 0.70, the column
 * carries a small upper bowl whose rim is at 1.5, the finial on top ends at 1.91 (the jet leaves a little below).
 */
export interface FountainShape {
  /** Water level and inner radius of the lower basin. */
  basinY: number;
  basinR: number;
  /** Rim height and radius of the upper bowl, where the water runs over. */
  upperY: number;
  upperR: number;
  /** Where the jet leaves (the top of the finial). */
  topY: number;
}

const BASIN: FountainShape = { basinY: 0.7, basinR: 0.6, upperY: 1.5, upperR: 0.31, topY: 1.9 };
export const FOUNTAIN_SHAPES: Readonly<Record<string, FountainShape>> = { obj_fountain: BASIN, ci_2: BASIN };
