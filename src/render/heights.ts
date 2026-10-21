import { MOUNTAIN_LEVEL, SEA_LEVEL } from "../world/world";
import { GROUND, TILE_SIZE, type TileInfo } from "../world/types";

/**
 * Coordinate convention of the renderer: tile x grows east (+x), tile y grows south, which is -z, so north is +z
 * and the map looks like a normal map from above. A tile occupies [tx*3, tx*3+3] in x and [-ty*3-3, -ty*3] in z.
 */
export function tileToWorldX(tx: number): number {
  return tx * TILE_SIZE;
}
export function tileToWorldZ(ty: number): number {
  return -ty * TILE_SIZE;
}
export function tileCenterX(tx: number): number {
  return tx * TILE_SIZE + TILE_SIZE / 2;
}
export function tileCenterZ(ty: number): number {
  return -ty * TILE_SIZE - TILE_SIZE / 2;
}

export const WATER_HEIGHT = -0.7;
export const SHALLOW_HEIGHT = -0.2;
export const BRIDGE_HEIGHT = 0.3;
export const LAVA_HEIGHT = -0.25;

/**
 * The overworld is drawn in one of two ways. With tile models (the default) it is flat, like the old outside map: grass and road
 * are level, mountains and woods stand on it as the old game's tile models (`veg_*`, `mtn_*`), and the water lies a hair
 * below. Without them the ground rolls with the elevation noise and the mountains are heaps of terrain. The choice is made once
 * when the game starts (`setTileModels`): the chunk meshes and the height of the party's eyes both depend on it.
 */
let tileModels = true;
export function setTileModels(on: boolean): void {
  tileModels = on;
}
export const usesTileModels = (): boolean => tileModels;

/**
 * Surface height of the flat world: none. The models of the old game (woods, mountains, ground tiles, places, mascots) stand on level
 * ground; a lowered lake or a sloped shore tilted whatever stood next to it, so water, shallows and lava lie at the height of the land.
 */
function flatHeight(_ground: TileInfo["ground"]): number {
  return 0;
}

/** Surface height of one tile in world units. Corner heights are averages of these. */
export function tileHeight(t: Pick<TileInfo, "ground" | "elevation">): number {
  if (tileModels) return flatHeight(t.ground);
  switch (t.ground) {
    case GROUND.WATER:
      return WATER_HEIGHT;
    case GROUND.SHALLOW:
      return SHALLOW_HEIGHT;
    case GROUND.LAVA_POOL:
      return LAVA_HEIGHT;
    case GROUND.BRIDGE:
      return BRIDGE_HEIGHT;
    case GROUND.MOUNTAIN:
    case GROUND.PASS: {
      const t01 = Math.min(1, Math.max(0, (t.elevation - MOUNTAIN_LEVEL) / (65535 - MOUNTAIN_LEVEL)));
      // Most mountain tiles lie just above MOUNTAIN_LEVEL (t01 near 0), so the base height decides what the party sees. The
      // land below rises to 2.35, the party's eyes to 4.05: a base of 6 puts the foot of a range two units above the eyes
      // and nobody looks over it. A pass stays low and becomes a gorge between the slopes.
      return t.ground === GROUND.PASS ? 1.6 : 6 + t01 * 8;
    }
    default: {
      const t01 = Math.min(1, Math.max(0, (t.elevation - SEA_LEVEL) / (MOUNTAIN_LEVEL - SEA_LEVEL)));
      return 0.15 + t01 * 2.2;
    }
  }
}

/** Height of the ground under the middle of a tile: the average of its four corner heights. */
export function groundHeightAt(tileAt: (x: number, y: number) => TileInfo, tx: number, ty: number): number {
  let sum = 0;
  for (let dy = 0; dy <= 1; dy++) {
    for (let dx = 0; dx <= 1; dx++) {
      let corner = 0;
      for (let oy = -1; oy <= 0; oy++) for (let ox = -1; ox <= 0; ox++) corner += tileHeight(tileAt(tx + dx + ox, ty + dy + oy));
      sum += corner / 4;
    }
  }
  return sum / 4;
}
