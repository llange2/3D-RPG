import type { MapContent } from "../actions/types";
import { cellCenterX, cellCenterZ } from "./interiorMesher";
import { shownItem } from "./interiorProps";
import { TRAP_OBJECT, elementOf } from "./interiorTraps";

/** A kind of map object that gives light. `y` is the height of the light; `range` and `intensity` replace the usual ones for a lamp that shines further or stronger. */
export interface LampKind {
  y: number;
  color: [number, number, number];
  range?: number;
  intensity?: number;
}

/** A lamp on a map: where it hangs and what it gives (`Game.updateLamps` hands the lights of the pool to the nearest ones). */
export interface LampSource extends LampKind {
  x: number;
  z: number;
  /** What the lamp is, so that a light of the pool stays with the same lamp from one frame to the next (a lamp that moves, a monster, keeps its key). */
  key: string;
}

/** The crystals shine in their own colour, strongly, one to two cells around (30th playtest, point 5); the texture of both is a teal. */
export const CRYSTAL_LAMP: LampKind = { y: 1.4, color: [0.15, 0.85, 1], range: 7.5, intensity: 4.5 };

/** Lava, acid and magic fire glow in their own colour like the crystals, a little weaker (31st playtest, point 1); the puddles lie on the floor, the flames stand higher. */
export const LAVA_LAMP: LampKind = { y: 0.9, color: [1, 0.42, 0.12], range: 6.5, intensity: 3.2 };
export const ACID_LAMP: LampKind = { y: 0.9, color: [0.45, 1, 0.15], range: 6.5, intensity: 3.2 };
export const MAGIC_FIRE_LAMP: LampKind = { y: 1.2, color: [0.68, 0.38, 1], range: 6.5, intensity: 3.2 };

/**
 * Everything else that glows (31st playtest, the second half of point 1), weaker than the crystals: the chalice gold, the magic wells and the altar in their
 * colour, the runes and the portal, the orb, and the fireplace and the lantern, which the campaign had before.
 */
export const CHALICE_LAMP: LampKind = { y: 1.0, color: [1, 0.82, 0.4], range: 5, intensity: 2.2 };
export const RED_WELL_LAMP: LampKind = { y: 1.2, color: [1, 0.3, 0.25], range: 5.5, intensity: 2.6 };
export const YELLOW_WELL_LAMP: LampKind = { y: 1.2, color: [1, 0.85, 0.3], range: 5.5, intensity: 2.6 };
export const ALTAR_LAMP: LampKind = { y: 1.0, color: [0.75, 0.4, 1], range: 5, intensity: 2.4 };
export const RUNES_LAMP: LampKind = { y: 0.6, color: [0.5, 0.8, 1], range: 4.5, intensity: 2 };
export const PORTAL_LAMP: LampKind = { y: 1.5, color: [0.45, 0.55, 1], range: 6, intensity: 3 };
/** What is worth taking glows gold (32nd playtest, point 3): the orb a little stronger than the keys, the heap of treasure, and the loot a monster leaves (point 14). */
export const ORB_LAMP: LampKind = { y: 1.0, color: [1, 0.8, 0.3], range: 5.5, intensity: 3 };
export const GOLD_LAMP: LampKind = { y: 0.9, color: [1, 0.8, 0.3], range: 4.5, intensity: 2.2 };
export const LOOT_LAMP: LampKind = { y: 0.6, color: [1, 0.8, 0.3], range: 4, intensity: 1.9 };
/** The computer terminal of the spaceship glows blue (point 4). */
export const COMPUTER_LAMP: LampKind = { y: 1.3, color: [0.3, 0.55, 1], range: 5, intensity: 2.3 };

/** The map objects that give light, by the number of the old item: the crystals, the traps' elements, the chalice, wells, altar, runes, portal, orb, fireplace and lantern. */
export const ITEM_LAMPS: Readonly<Record<number, LampKind>> = {
  117: CRYSTAL_LAMP,
  67: CRYSTAL_LAMP,
  120: LAVA_LAMP,
  92: ACID_LAMP,
  121: MAGIC_FIRE_LAMP,
  86: CHALICE_LAMP,
  37: RED_WELL_LAMP,
  88: YELLOW_WELL_LAMP,
  35: ALTAR_LAMP,
  73: RUNES_LAMP,
  3: PORTAL_LAMP,
  109: ORB_LAMP,
  4: GOLD_LAMP, // heap of treasure
  ...Object.fromEntries([17, 18, 19, 20, 21, 22, 23, 24, 25, 64, 65, 66, 122, 123, 124].map((item) => [item, GOLD_LAMP])), // quest keys and key cards
  68: COMPUTER_LAMP,
  76: { y: 3.2, color: [1, 0.78, 0.45] }, // Rustic lantern, hangs from the ceiling
  71: { y: 1.4, color: [1, 0.6, 0.3] }, // Abandoned fireplace
};

/** A monster that glows (`MONSTER_LAMPS`): the light follows it, at the height of its body. */
export type MonsterLamp = Omit<LampKind, "y">;

const BLUISH: MonsterLamp = { color: [0.35, 0.6, 1], range: 5, intensity: 2.2 };

/** The glowing monsters by their name in the monster table (the ids are looked up in `game.ts`): flames, ghosts, ice and the magicians. */
export const MONSTER_LAMPS: Readonly<Record<string, MonsterLamp>> = {
  "Candle Creep": { color: [1, 0.7, 0.3], range: 5, intensity: 2.2 },
  "Fire Lizard": { color: [1, 0.45, 0.15], range: 5, intensity: 2.2 },
  "Fire Stalker": { color: [1, 0.4, 0.12], range: 5.5, intensity: 2.6 },
  Ghost: { color: [0.7, 0.85, 1], range: 5, intensity: 1.8 },
  Phantom: { color: [0.65, 0.8, 1], range: 5, intensity: 1.8 },
  "Cryo Spore": { color: [0.4, 0.8, 1], range: 5, intensity: 2.2 },
  Plasmoid: { color: [0.4, 1, 0.6], range: 5, intensity: 2.2 },
  Sprite: { color: [0.3, 0.95, 0.75], range: 4.5, intensity: 2 }, // blue-green
  "Top Jouster": { color: [1, 0.5, 0.15], range: 5.5, intensity: 2.6 },
  "Carnage Hand": BLUISH,
  Guardian: BLUISH,
  Jouster: BLUISH,
  Sorcerer: BLUISH,
  "Wicked Witch": { color: [0.45, 1, 0.3], range: 5, intensity: 2.2 },
  Wizard: { color: [0.78, 0.8, 0.82], range: 5, intensity: 2 }, // greyish
};

/** The lamp a cell of the old maps gives, or null. */
export function lampSource(kind: LampKind, x: number, z: number, key = `${x.toFixed(2)},${z.toFixed(2)}`): LampSource {
  return { x, z, key, y: kind.y, color: kind.color, ...(kind.range !== undefined ? { range: kind.range } : {}), ...(kind.intensity !== undefined ? { intensity: kind.intensity } : {}) };
}

/** The glowing objects of a generated place (crystals of shrines, riddles and decoration, the objects of the elemental traps): each lights its cell. */
export function crystalLamps(content: MapContent): LampSource[] {
  const out: LampSource[] = [];
  for (const a of content.actions) {
    const element = elementOf(a);
    const item = element !== null ? TRAP_OBJECT[element] : shownItem(a);
    const kind = item === null ? undefined : ITEM_LAMPS[item];
    if (kind) out.push(lampSource(kind, cellCenterX(a.x), cellCenterZ(a.y)));
  }
  return out;
}
