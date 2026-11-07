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

/** Cells between two decorations on the walls of a dungeon ("every 10 fields"). */
export const WALL_DECO_SPACING = 10;

/** The decoration that goes with a kind of monster only. */
const BY_GROUP: Readonly<Partial<Record<MonsterGroup, readonly number[]>>> = {
  humanoid: [DECO_EVIL_WIZARD, DECO_EVIL_WITCH, DECO_BARBARIAN],
  monster_humanoid: [DECO_EVIL_WIZARD, DECO_EVIL_WITCH, DECO_BARBARIAN],
  beast: [DECO_DEMON_1, DECO_DEMON_2],
};

/** The decorations that fit a dungeon whose first monster is of this group: the ones of its kind, and the lion and the moose, which fit any. */
export function wallDecoChoices(group: MonsterGroup | undefined): number[] {
  return [...((group && BY_GROUP[group]) || []), DECO_LION, MOOSE_KING_ITEM];
}

/** The one decoration a dungeon hangs on its walls (the random stream is the dungeon's own, so that nothing else in the world shifts). */
export function pickWallDeco(group: MonsterGroup | undefined, rng: Rng): number {
  const choices = wallDecoChoices(group);
  return choices[rng.int(choices.length)]!;
}
