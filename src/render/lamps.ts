import { runeActive } from "../actions/quests";
import { heapGone } from "../actions/registry";
import { LANTERN_BODY_TOP, LANTERN_DROP, LANTERN_ITEM, lanternOriginY } from "../data/item-tuning";
import { ENGINE_CRYSTAL_FLAG, LIFE_FLAG } from "../data/quest-table";
import type { ActionInstance, MapContent } from "../actions/types";
import { cellCenterX, cellCenterZ } from "./interiorMesher";
import { shownItem } from "./interiorProps";
import { TRAP_OBJECT, elementOf } from "./interiorTraps";

/** The little things that rise round a lamp (`LampKind.fx`). */
export type LampFx = "torch" | "lava" | "acid" | "magic" | "crystal" | "portal" | "gold" | "pool" | "lantern" | "rune";

/** A kind of map object that gives light. `y` is the height of the light; `range` and `intensity` replace the usual ones for a lamp that shines further or stronger. */
export interface LampKind {
  y: number;
  color: [number, number, number];
  /** What the effects add round it besides its halo (`Effects.setLamps`): sparks and smoke of a flame, embers of lava, bubbles of acid, wisps of magic, glints of a crystal, motes of a portal, twinkles of gold. */
  fx?: LampFx;
  /** The height over the ground where what rises from it starts, when that is not the height of the light: the light of a pool of lava hangs a metre over it, its embers rise from the surface (the user, 18. 11. 2026). */
  fxY?: number;
  /** A soft disc of its colour round the lamp (`Effects.setLamps`): the light of the pool is shared by two lamps, a halo is what shows the rest (the runes, 59th playtest point 2; the crystal paths have one by their key). */
  halo?: boolean;
  range?: number;
  intensity?: number;
  /** The share of its light the lamp keeps by day outside (0 = none, the default: by day lamps add nothing). A spell's light must show in the sun as well (48th playtest, point 6). */
  daylight?: number;
}

/** A lamp on a map: where it hangs and what it gives (`Game.updateLamps` hands the lights of the pool to the nearest ones). */
export interface LampSource extends LampKind {
  x: number;
  z: number;
  /** What the lamp is, so that a light of the pool stays with the same lamp from one frame to the next (a lamp that moves, a monster, keeps its key). */
  key: string;
  /** Seconds the light needs to fade in and out, instead of `LAMP_FADE` (a laser bolt lives for half a second and must shine from the start). */
  fade?: number;
  /** How far from the party the lamp still counts, instead of `LAMP_REACH`: a shot lights the ground as far as the monsters act (52nd playtest, point 3). */
  reach?: number;
  /** The lamp gets a light of the pool before the lamps of the map, whatever their distance: a shot is only there for a moment and must shine from the muzzle on (point 2). */
  priority?: boolean;
}

/** The crystals shine in their own colour, strongly, one to two cells around (30th playtest, point 5); the texture of both is a teal. */
export const CRYSTAL_LAMP: LampKind = { y: 1.4, color: [0.15, 0.85, 1], range: 7.5, intensity: 4.5, fx: "crystal" };

/** Lava, acid and magic fire glow in their own colour like the crystals, a little weaker (31st playtest, point 1); the puddles lie on the floor, the flames stand higher. */
export const LAVA_LAMP: LampKind = { y: 0.9, color: [1, 0.42, 0.12], range: 6.5, intensity: 3.2, fx: "lava", fxY: 0.12 };
export const ACID_LAMP: LampKind = { y: 0.9, color: [0.45, 1, 0.15], range: 6.5, intensity: 3.2, fx: "acid", fxY: 0.15 };
export const MAGIC_FIRE_LAMP: LampKind = { y: 1.2, color: [0.68, 0.38, 1], range: 6.5, intensity: 3.2, fx: "magic", fxY: 0.55 };

/**
 * Everything else that glows (31st playtest, the second half of point 1), weaker than the crystals: the chalice gold, the magic wells and the altar in their
 * colour, the runes and the portal, the orb, and the fireplace and the lantern, which the campaign had before.
 */
export const CHALICE_LAMP: LampKind = { y: 1.0, color: [1, 0.82, 0.4], range: 5, intensity: 2.2, fx: "gold", fxY: 1.3 };
// (the magic pools: smoke in their colour rises from the water, which stands at 0.45 in the basin)
export const RED_WELL_LAMP: LampKind = { y: 1.2, color: [1, 0.3, 0.25], range: 5.5, intensity: 2.6, fx: "pool", fxY: 0.45 };
export const YELLOW_WELL_LAMP: LampKind = { y: 1.2, color: [1, 0.85, 0.3], range: 5.5, intensity: 2.6, fx: "pool", fxY: 0.45 };
export const ALTAR_LAMP: LampKind = { y: 1.0, color: [0.75, 0.4, 1], range: 5, intensity: 2.4, fx: "magic" };
// (59th playtest, point 2: the runes were hard to make out; they shine orange now, stronger, with glints and sparks rising from them like the crystals' glints)
export const RUNES_LAMP: LampKind = { y: 0.7, color: [1, 0.55, 0.16], range: 8.5, intensity: 3.4, fx: "rune", fxY: 0.1, halo: true };
export const PORTAL_LAMP: LampKind = { y: 1.5, color: [0.45, 0.55, 1], range: 6, intensity: 3, fx: "portal" };
/** What is worth taking glows gold (32nd playtest, point 3): the orb a little stronger than the keys, the heap of treasure, and the loot a monster leaves (point 14). */
export const ORB_LAMP: LampKind = { y: 1.0, color: [1, 0.8, 0.3], range: 5.5, intensity: 3, fx: "gold", fxY: 0.7 };
/** The Magical Orb mascot (item 10) waiting for the party glows gold, clearly stronger than the orb of ultimate power (40th playtest, point 2). */
export const MASCOT_ORB_LAMP: LampKind = { y: 1.2, color: [1, 0.78, 0.25], range: 9, intensity: 5, fx: "gold", fxY: 2 };
/** Prefix of the key of the mascot orb's lamp: it goes out while the Orb is the party's mascot (`Game.updateLamps`). */
export const MASCOT_ORB_KEY = "mo:";
export const GOLD_LAMP: LampKind = { y: 0.9, color: [1, 0.8, 0.3], range: 4.5, intensity: 2.2, fx: "gold", fxY: 0.55 };
/** The loot of a monster twinkles like the heap of treasure (the user, 18. 11. 2026: the same particles), at the height of a small pile. */
export const LOOT_LAMP: LampKind = { y: 0.6, color: [1, 0.8, 0.3], range: 4, intensity: 1.9, fx: "gold", fxY: 0.45 };
/** The quest keys and key cards float at 1.1 to 1.9 over the floor: their twinkles start at their middle. */
export const KEY_LAMP: LampKind = { ...GOLD_LAMP, fxY: 1.5 };
/**
 * The power crystals of the spaceship (quest document 1.5): weak while the ship is dead, strong (three cells around, blue) once the crystal of their section has been mended.
 * The broken crystal gives no light before it is mended.
 */
export const SHIP_CRYSTAL_WEAK: LampKind = { y: 1.4, color: [0.15, 0.6, 1], range: 4.5, intensity: 1.1 };
export const SHIP_CRYSTAL_STRONG: LampKind = { y: 1.4, color: [0.15, 0.6, 1], range: 9, intensity: 4.5, fx: "crystal" };
/** The console of the bridge is lit (document 1.5: "soll beleuchtet sein"). */
export const CONSOLE_LAMP: LampKind = { y: 1.4, color: [0.35, 0.85, 1], range: 8, intensity: 3.2 };
/** The computer terminal of the spaceship glows blue (point 4). */
export const COMPUTER_LAMP: LampKind = { y: 1.3, color: [0.3, 0.55, 1], range: 5, intensity: 2.3 };

/**
 * The light of the two torches on the wall beside a tower's door (49th playtest, 50th: the model has the torches itself, only their light is placed, at the height of the ground floor,
 * `TORCH_LIGHT_HEIGHT` in `terrainMesher.ts`). It is weak and wide: a faint warm glow on the ground that a party sees from five tiles away (the pool takes a lamp from 18 units away, at full
 * strength from 14), not a floodlight. By day it adds nothing like every lamp.
 */
export const TOWER_TORCH_LAMP: LampKind = { y: 2.5, color: [1, 0.62, 0.26], range: 10, intensity: 1.5 };

/**
 * The light of the crystal paths of quest_8 (quest document 1.10, 16. 11. 2026: it was too dark and too weak): a crystal that carries light and the lamps along its line shine far and strong in the colour
 * of the line, so that the walls and the floor around it take the colour even with the Light spell on (its ring is 25 wide), and the glow is seen from across the room. A target that waits has a faint light.
 */
export const CRYSTAL_PATH_LIT: Omit<LampKind, "y" | "color"> = { range: 16, intensity: 7 };
export const CRYSTAL_PATH_LINE: Omit<LampKind, "y" | "color"> = { range: 11, intensity: 5.5 };
export const CRYSTAL_PATH_WAITING: Omit<LampKind, "y" | "color"> = { range: 7, intensity: 2 };
/** How far from the party a lamp of the crystal paths still counts (the pool's usual 18 would let the glow of a far line go out before it is seen). */
export const CRYSTAL_LAMP_REACH = 34;
/** The lamps of a line stand on every second cell of it. */
export const LINE_LAMP_EVERY = 2;

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
  10: MASCOT_ORB_LAMP, // Mascot: Magical Orb (the campaign's maps; the generated world adds it in `Game.syncMascots`)
  4: GOLD_LAMP, // heap of treasure
  ...Object.fromEntries([17, 18, 19, 20, 21, 22, 23, 24, 25, 64, 65, 66, 122, 123, 124].map((item) => [item, KEY_LAMP])), // quest keys and key cards
  68: COMPUTER_LAMP,
  // Rustic lantern, hangs from the ceiling on its chain; since the 51st playtest (point 2) it shines like the torches of the tower: warm, weak and wide
  76: { y: 3.2 - LANTERN_DROP, color: TOWER_TORCH_LAMP.color, range: TOWER_TORCH_LAMP.range, intensity: TOWER_TORCH_LAMP.intensity },
  71: { y: 1.4, color: [1, 0.6, 0.3], fx: "torch", fxY: 0.6 }, // Abandoned fireplace (the fire burns in the hearth, low in the model)
};

/**
 * The lantern of a generated place (item 76) under a ceiling at `ceiling` (59th playtest, point 3): its light hangs 0.6 under the origin as before, but the origin follows the ceiling
 * (`lanternOriginY`), and a thread of smoke rises from the top of the glass body, along the chain to the ceiling (`fx: "lantern"`).
 */
export function lanternLamp(ceiling: number): LampKind {
  const origin = lanternOriginY(ceiling);
  return { y: origin - LANTERN_DROP, color: TOWER_TORCH_LAMP.color, range: TOWER_TORCH_LAMP.range, intensity: TOWER_TORCH_LAMP.intensity, fx: "lantern", fxY: origin + LANTERN_BODY_TOP };
}

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
  return { x, z, key, y: kind.y, color: kind.color, ...(kind.range !== undefined ? { range: kind.range } : {}), ...(kind.intensity !== undefined ? { intensity: kind.intensity } : {}), ...(kind.fx ? { fx: kind.fx } : {}), ...(kind.fxY !== undefined ? { fxY: kind.fxY } : {}), ...(kind.halo ? { halo: true } : {}) };
}

/** The key of the lamp that an action's object carries. */
export const lampKeyOf = (a: Pick<ActionInstance, "uid">): string => `a:${a.uid}`;

/** The object of this action is gone from the map: its key or key card is in a backpack, or its heap of treasure is empty. */
export function objectTaken(a: Pick<ActionInstance, "uid" | "kind" | "params">, opened: ReadonlySet<string>): boolean {
  return heapGone(a, opened) || (a.kind === "treasure" && opened.has(a.uid) && typeof a.params.quest === "string");
}

/** The glowing objects of a generated place (crystals of shrines, riddles and decoration, the objects of the elemental traps): each lights its cell. */
export function crystalLamps(content: MapContent, opened: ReadonlySet<string> = new Set(), ceiling?: number): LampSource[] {
  const out: LampSource[] = [];
  for (const a of content.actions) {
    // a key or key card that was taken, and a heap that was emptied, take their glow with them (36th playtest, points 6 and 23)
    if (objectTaken(a, opened)) continue;
    // the runes of quest 3 are not there before the last gong rings, and the middle of the field of quest 1 stays bare (Tomb of Aldena 61/51 glowed with nothing to see)
    if (a.kind === "rune") {
      if (a.params.need === "moan") continue;
      if (!runeActive(a, content, opened)) continue;
    }
    // the crystals of the spaceship's engine room and life support: weak until their section is mended, strong after (the broken one only after)
    if (typeof a.params.reactor === "string") {
      const mended = opened.has(a.params.reactor === "life" ? LIFE_FLAG : ENGINE_CRYSTAL_FLAG);
      if (mended || a.params.terminal !== "crystal") out.push(lampSource(mended ? SHIP_CRYSTAL_STRONG : SHIP_CRYSTAL_WEAK, cellCenterX(a.x), cellCenterZ(a.y), lampKeyOf(a)));
      continue;
    }
    if (a.params.terminal === "console") {
      out.push(lampSource(CONSOLE_LAMP, cellCenterX(a.x), cellCenterZ(a.y), lampKeyOf(a)));
      continue;
    }
    const element = elementOf(a);
    const item = element !== null ? TRAP_OBJECT[element] : shownItem(a);
    const kind = item === null ? undefined : item === LANTERN_ITEM && ceiling !== undefined ? lanternLamp(ceiling) : ITEM_LAMPS[item];
    if (kind) out.push(lampSource(kind, cellCenterX(a.x), cellCenterZ(a.y), lampKeyOf(a)));
  }
  return out;
}
