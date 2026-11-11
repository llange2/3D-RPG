/**
 * People and things the plan of the world puts into the towns (55th playtest, points 13 and 14). Pure data and words: the placement is in `actions/rules.ts`, the dealings
 * of the quartermaster are `Game.meetQuartermaster` and `ui/quartermaster.ts`.
 */

/** The quartermaster of the one town of level 3: not an old persona, his model is the user's `Quartermaster.glb` (`PERSONAS`, `tools/assets/sources/models`). */
export const QUARTERMASTER_PERSONA = 311;

/** The old item "Storage equipment": the two stacks beside the quartermaster, which belong to him. */
export const STORAGE_EQUIPMENT = 13;
export const QUARTERMASTER_GOODS = "This belongs to the quartermaster. You better talk to him directly.";

/** What the quartermaster asks for every piece he takes into his store (and nothing for giving it back). */
export const STORAGE_FEE = 1000;

/** What a person in a town of level 2 tells about the strange creature that collects Quatloo coins (the dungeon where Seth Squirm lives, with its name and position). */
export function sethHintText(dungeon: string, x: number, y: number): string {
  return `"Quatloo coins? Little round things, lost in the chests of the first dungeons and castles. If you find one, remember this: there is a strange creature in the ${dungeon} (${x}/${y}) who collects them, and he pays for them in a way you will like."`;
}

/** Words of the quartermaster. */
export const QUARTERMASTER_TEXTS = {
  greeting: `"Quartermaster of the road! I keep what you cannot carry. A thousand gold for every piece I take into my store, and there is no end to my shelves: swords, armor, rings, scrolls, even the odd quest trinket. Taking it back out again costs nothing."`,
  stored: (name: string, fee: number): string => `The quartermaster takes ${name} into his store for ${fee} gold.`,
  returned: (name: string): string => `The quartermaster hands ${name} back.`,
  noGold: "The quartermaster shakes his head. \"A thousand gold a piece. Come back when you can pay.\"",
  noRoom: "The backpacks are full: there is no room for this.",
};
