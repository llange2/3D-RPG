/**
 * The flat ground of graphics mode "flat": which painted tile (`terrain/flat/<name>.webp`, see `data/flatTerrain.ts`) lies where.
 * The tiles are laid on the corners of the map's tiles, half a tile off the grid: the four map tiles around a corner are the four
 * quarters of one picture, so the border between two terrains runs along the borders of the map tiles and every picture lines up with
 * its neighbours. Pure: no DOM, no Babylon.
 */
import { quartersOf, type FlatRegister, type FlatTerrain } from "../data/flatTerrain";
import { BIOME, GROUND, type Biome, type Ground } from "../world/types";

/**
 * Which terrain wins a tie when more than two meet at a corner (a road at a coast: grass, water, cobblestone): roads and the things
 * the party should see first before the land they lie on. Also decides which of two equally common terrains is the base.
 */
export const FLAT_PRIORITY: readonly FlatTerrain[] = ["cobblestone", "lava", "water", "snow", "swamp", "desert", "dirt", "grass"];

/** The painted terrain of an overworld tile: water and shallows are water, a road, pass or bridge is cobblestone, the land is by biome (the lava biome's land is dirt). */
export function flatTerrainOf(t: { ground: Ground; biome: Biome }): FlatTerrain {
  switch (t.ground) {
    case GROUND.WATER:
    case GROUND.SHALLOW:
      return "water";
    case GROUND.LAVA_POOL:
      return "lava";
    case GROUND.ROAD:
    case GROUND.PASS:
    case GROUND.BRIDGE:
      return "cobblestone";
    default:
  }
  switch (t.biome) {
    case BIOME.DESERT:
      return "desert";
    case BIOME.SNOW:
      return "snow";
    case BIOME.SWAMP:
      return "swamp";
    case BIOME.LAVA:
      return "dirt";
    default:
      return "grass";
  }
}

/**
 * What the floor of a campaign cell is in the painted tiles: a terrain, `inherit` for ground that takes the terrain of its neighbours (the
 * rock of a mountain model, a solid cell), or `other` for a floor that has no painted tile (a castle's flagstones, a pit).
 */
export type CampaignGround = FlatTerrain | "inherit" | "other";

const CAMPAIGN_FLOORS: Record<string, CampaignGround> = {
  "terrain/meadow": "grass",
  "terrain/forest": "grass",
  "terrain/cobble": "cobblestone",
  "terrain/road": "dirt",
  "terrain/lava_ground": "dirt",
  "terrain/snow": "snow",
  "terrain/swamp": "swamp",
  "terrain/desert": "desert",
  "terrain/rock": "inherit",
  "tex/tex_water": "water",
  "tex/tex_lava": "lava",
};

/**
 * The old terrain pictures (`terrain/meadow` and the like, cut out of the tile models) are gone: wherever one is asked for, the painted full
 * tile of the same ground stands in for it (`terrain/flat/<ground>_full`). Names that are not an old terrain picture come back as they are.
 */
export function groundTexture(file: string): string {
  if (!file.startsWith("terrain/") || file.startsWith("terrain/flat/")) return file;
  const ground = CAMPAIGN_FLOORS[file];
  // a rock or a floor that is no painted ground takes the bare earth
  return `terrain/flat/${ground && ground !== "inherit" && ground !== "other" ? ground : "dirt"}_full`;
}

export function campaignGroundOf(style: { floor: string | null; floorless?: boolean }): CampaignGround {
  if (style.floorless || !style.floor) return "other";
  return CAMPAIGN_FLOORS[style.floor] ?? "other";
}

const priorityOf = (t: FlatTerrain): number => FLAT_PRIORITY.indexOf(t);

/**
 * The terrains of the four cells around a corner of a campaign map, with the inheriting ones filled in by the most common of the others.
 * Null when the corner has nothing to draw: one of the cells has a floor without a painted tile (that floor stays as it is), or none has a terrain.
 */
export function resolveCorner(q: [CampaignGround, CampaignGround, CampaignGround, CampaignGround]): [FlatTerrain, FlatTerrain, FlatTerrain, FlatTerrain] | null {
  if (q.includes("other")) return null;
  const count = new Map<FlatTerrain, number>();
  for (const t of q) if (t !== "inherit") count.set(t as FlatTerrain, (count.get(t as FlatTerrain) ?? 0) + 1);
  const best = [...count.keys()].sort((a, b) => count.get(b)! - count.get(a)! || priorityOf(a) - priorityOf(b))[0];
  if (best === undefined) return null;
  return q.map((t) => (t === "inherit" ? best : t)) as [FlatTerrain, FlatTerrain, FlatTerrain, FlatTerrain];
}
const pairKey = (a: FlatTerrain, b: FlatTerrain): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Every tile of the register by the terrain of its four quarters. */
export class FlatTileSet {
  private readonly byQuarters = new Map<string, string>();
  private readonly pairs = new Set<string>();
  private readonly cache = new Map<string, string>();

  constructor(register: FlatRegister) {
    for (const [name, tile] of Object.entries(register.tiles)) {
      const q = quartersOf(tile);
      if (!q) continue; // island and pond: the border of a full tile
      // the plain picture of a terrain is the `full` tile; a pond or island would show a blob where the map has none
      this.byQuarters.set(q.join("|"), name);
      if (tile.other) this.pairs.add(pairKey(tile.terrain, tile.other));
    }
  }

  /** Does the set have a picture of this terrain alone? */
  has(terrain: FlatTerrain): boolean {
    return this.byQuarters.has(`${terrain}|${terrain}|${terrain}|${terrain}`);
  }

  /** Is there a painted tile for exactly these four quarters? (Without one `pick` has to leave a terrain out.) */
  hasExact(tl: FlatTerrain, tr: FlatTerrain, bl: FlatTerrain, br: FlatTerrain): boolean {
    return this.byQuarters.has(`${tl}|${tr}|${bl}|${br}`);
  }

  /**
   * The tile for the four map tiles around a corner (top left, top right, bottom left, bottom right). With one or two terrains there is
   * exactly one tile. Where three or more meet, or a pair has no pictures, the tile shows the most common terrain and the most common
   * other one it has transitions with; a quarter of anything else shows the first. Ties go by `FLAT_PRIORITY`.
   */
  pick(tl: FlatTerrain, tr: FlatTerrain, bl: FlatTerrain, br: FlatTerrain): string {
    const key = `${tl}|${tr}|${bl}|${br}`;
    const exact = this.byQuarters.get(key);
    if (exact) return exact;
    let name = this.cache.get(key);
    if (name === undefined) {
      name = this.reduce([tl, tr, bl, br]);
      this.cache.set(key, name);
    }
    return name;
  }

  private reduce(q: [FlatTerrain, FlatTerrain, FlatTerrain, FlatTerrain]): string {
    const count = new Map<FlatTerrain, number>();
    for (const t of q) count.set(t, (count.get(t) ?? 0) + 1);
    const ranked = [...count.keys()].sort((a, b) => count.get(b)! - count.get(a)! || priorityOf(a) - priorityOf(b));
    for (const base of ranked) {
      for (const other of ranked) {
        if (other === base || !this.pairs.has(pairKey(base, other))) continue;
        const tile = this.byQuarters.get(q.map((t) => (t === base || t === other ? t : base)).join("|"));
        if (tile) return tile;
      }
    }
    // nothing to blend with: the most common terrain alone
    const alone = this.byQuarters.get(`${ranked[0]}|${ranked[0]}|${ranked[0]}|${ranked[0]}`);
    if (!alone) throw new Error(`flat ground: no tile for ${ranked[0]}`);
    return alone;
  }
}
