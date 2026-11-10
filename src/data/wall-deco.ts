/**
 * The wall decorations of the dungeons (45th playtest, point 4): the carving of the moose king (old item 125) and the user's reliefs of an evil wizard, an evil witch, a barbarian,
 * two demons and a lion. They are pseudo item numbers above the old table (like the crate of the spaceship, `quest-table.ts`), so that the actions keep their `item` param; the
 * models are `obj_deco_*` (`OWN_MODELS` in `render/interiorProps.ts`). Pure data: no DOM, no Babylon.
 *
 * The rule of the user: the decoration follows the kind of monster that lives in the dungeon. Humanoids get the wizard, the witch and the barbarian, beasts the two demons; the lion and
 * the moose go with any monster. A dungeon uses ONE of them, never a mixture (only the witch, or only the first demon), and hangs it regularly along its walls, about every ten cells.
 */
import type { Rng } from "../core/rng";
import type { MonsterGroup } from "./quest-table";

export const MOOSE_KING_ITEM = 125;
export const DECO_EVIL_WIZARD = 304;
export const DECO_EVIL_WITCH = 305;
export const DECO_BARBARIAN = 306;
export const DECO_DEMON_1 = 307;
export const DECO_DEMON_2 = 308;
export const DECO_LION = 309;

/** The new reliefs and the models of the interior view that show them. */
export const DECO_MODELS: Readonly<Record<number, string>> = {
  [DECO_EVIL_WIZARD]: "obj_deco_evil_wizard",
  [DECO_EVIL_WITCH]: "obj_deco_evil_witch",
  [DECO_BARBARIAN]: "obj_deco_barbarian",
  [DECO_DEMON_1]: "obj_deco_demon_1",
  [DECO_DEMON_2]: "obj_deco_demon_2",
  [DECO_LION]: "obj_deco_lion",
};

/** The names of the objects, for the list of objects (`docs/OBJECTS.md`), the showcase and the tests. */
export const DECO_NAMES: Readonly<Record<number, string>> = {
  [DECO_EVIL_WIZARD]: "Decoration: Evil Wizard",
  [DECO_EVIL_WITCH]: "Decoration: Evil Witch",
  [DECO_BARBARIAN]: "Decoration: Barbarian",
  [DECO_DEMON_1]: "Decoration: Demon 1",
  [DECO_DEMON_2]: "Decoration: Demon 2",
  [DECO_LION]: "Decoration: Lion",
};

/** Every wall decoration of a dungeon: the moose king and the new reliefs. */
export const WALL_DECO_ITEMS: readonly number[] = [MOOSE_KING_ITEM, ...Object.keys(DECO_MODELS).map(Number)];

/** The reliefs are as big as the moose king's carving (scale 1.2 of a file that is 1.3 x 1.9). */
export const DECO_SCALE = 1.2;

/**
 * Where the wall may cut a relief (53rd playtest, point 4: the second demon of the Undercroft of Siletha stood 0.78 out of the wall): the z of the file (model units, the back at the
 * lowest z, the front towards +z) of the lowest part of the relief that is seen from the front, the plane of its backing plate. Below it the wall hides what the relief shows, above it the
 * relief stands free; the view sinks each relief into the wall exactly up to this plane and no deeper. Measured with `tools/dev/measure-relief.mjs` (the 1st percentile of the front-most
 * surface over the silhouette: at most one hundredth of the picture lies lower, where the rounded edge falls away).
 */
export const DECO_PLATE: Readonly<Record<string, number>> = {
  obj_deco_evil_wizard: -0.171,
  obj_deco_evil_witch: -0.12,
  obj_deco_barbarian: -0.158,
  obj_deco_demon_1: -0.156,
  obj_deco_demon_2: -0.132,
  obj_deco_lion: -0.003,
};

/** Cells between two decorations on the walls of a dungeon ("every 10 fields"). */
export const WALL_DECO_SPACING = 10;

/** The decoration that goes with a kind of monster only. The undead have the wizard and the witch (necromancers; 47th playtest, point 10: with nothing of their own they took the moose or the lion). */
const BY_GROUP: Readonly<Partial<Record<MonsterGroup, readonly number[]>>> = {
  // (a decoration listed twice is picked twice as often: the wizard and the witch also go with the undead, the barbarian only with these, so he gets half of the humanoids)
  humanoid: [DECO_EVIL_WIZARD, DECO_EVIL_WITCH, DECO_BARBARIAN, DECO_BARBARIAN],
  monster_humanoid: [DECO_EVIL_WIZARD, DECO_EVIL_WITCH, DECO_BARBARIAN, DECO_BARBARIAN],
  undead: [DECO_EVIL_WIZARD, DECO_EVIL_WITCH],
  beast: [DECO_DEMON_1, DECO_DEMON_2],
};

/**
 * How many permille of the dungeons of a group hang the lion or the moose (the two equally) although the group has decorations of its own. Every decoration should turn up about
 * equally often in a world (47th playtest, point 10: the moose and the lion were a third each, the reliefs 4 to 10 %, because a group without reliefs had only those two). The beasts
 * are 38 % of the dungeons and would give each demon 19 %, so a quarter of them take the lion or the moose; the others (humanoids and undead: the wizard, the witch and the barbarian)
 * keep to their own, and a group with nothing of its own (constructs, plants, robots) always hangs the lion or the moose.
 */
const ANY_PERMILLE: Readonly<Partial<Record<MonsterGroup, number>>> = { beast: 260 };

/** The decorations that fit a dungeon whose first monster is of this group: the ones of its kind, and the lion and the moose, which fit any. */
export function wallDecoChoices(group: MonsterGroup | undefined): number[] {
  return [...new Set([...((group && BY_GROUP[group]) || []), DECO_LION, MOOSE_KING_ITEM])];
}

/** The one decoration a dungeon hangs on its walls (the random stream is the dungeon's own, so that nothing else in the world shifts). */
export function pickWallDeco(group: MonsterGroup | undefined, rng: Rng): number {
  const own = (group && BY_GROUP[group]) || [];
  const any = [DECO_LION, MOOSE_KING_ITEM];
  const takesAny = own.length === 0 || rng.int(1000) < (ANY_PERMILLE[group!] ?? 0);
  const pool = takesAny ? any : own;
  return pool[rng.int(pool.length)]!;
}
