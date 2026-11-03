/**
 * The "Environment" option of Options > Graphics: how much of the surroundings is drawn with the 3D models of the old game and of the user's own
 * floors, ceilings and walls (`tools/assets/sources/models`), and how much with painted tiles and textured quads.
 *
 * - `flat`: the painted ground tiles of the overworld, flat floors, ceilings and walls (the cave's rock stays a model, as ever).
 * - `floor`: "3D Floor/Ceiling": the ground models of the overworld and the models of the floors and ceilings of the interiors.
 * - `full`: "Full 3D": the same, and the wall pieces of the places that have one.
 *
 * Pure data and no engine types, so the mesher and the tests can read it.
 */
export type Environment = "flat" | "floor" | "full";

export const ENVIRONMENTS: readonly Environment[] = ["flat", "floor", "full"];

export const ENVIRONMENT_NAMES: Record<Environment, string> = { flat: "Flat", floor: "3D Floor/Ceiling", full: "Full 3D" };

/** Ground models, and the floor and ceiling models of the interiors. */
export const hasGroundModels = (e: Environment): boolean => e !== "flat";

/** Wall models. */
export const hasWallModels = (e: Environment): boolean => e === "full";

/** The texture name without the folder a campaign map writes in front of it (`tex/tex_dungeon_floor`). */
export const textureName = (file: string | null | undefined): string => (file ?? "").replace(/^tex\//, "");

/**
 * Floor textures that have a 3D floor model, one per cell. `replacesQuad`: the model has a ground of its own and takes the place of the flat quad (the
 * old dungeon floor, which is drawn in a window round the party only, where the fog hides what lies farther); otherwise the quad stays below it, because
 * the model is drawn in a window and the town beyond it is seen in daylight.
 */
export const FLOOR_MODELS: Readonly<Record<string, { model: string; replacesQuad: boolean }>> = {
  tex_dungeon_floor: { model: "blk_floor", replacesQuad: true },
  tex_city_floor: { model: "blk_city_floor", replacesQuad: false },
  tex_fortress_floor: { model: "blk_fortress_floor", replacesQuad: false },
};

/** Ceiling textures that have a 3D ceiling model (the flat ceiling stays above it as the backing of the gaps). */
export const CEILING_MODELS: Readonly<Record<string, string>> = {
  tex_dungeon_ceiling: "blk_dungeon_ceiling",
  tex_cave_ceiling: "blk_cave_ceiling",
  tex_cyber_ceiling: "blk_cyber_ceiling",
};

/** Wall textures that have a 3D wall piece (one per wall face, in front of the flat wall). */
export const WALL_MODELS: Readonly<Record<string, string>> = {
  tex_fortress_wall: "blk_fortress_wall",
};

export const floorModelOfTexture = (file: string | null | undefined): { model: string; replacesQuad: boolean } | undefined => FLOOR_MODELS[textureName(file)];
export const ceilingModelOfTexture = (file: string | null | undefined): string | undefined => CEILING_MODELS[textureName(file)];
export const wallModelOfTexture = (file: string | null | undefined): string | undefined => WALL_MODELS[textureName(file)];

/** The models that an environment can ask for, to load them beside the other models of an interior. */
export function environmentModelKeys(e: Environment): string[] {
  if (e === "flat") return [];
  return [...Object.values(FLOOR_MODELS).map((f) => f.model), ...Object.values(CEILING_MODELS), ...(e === "full" ? Object.values(WALL_MODELS) : [])];
}
