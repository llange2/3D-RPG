import MONSTER_TINTS from "../data/monster-tints.json";

/**
 * What flies off a monster that is hit by a blow or an arrow (the user, 18. 11. 2026), by what it is made of. No Babylon here: the numbers are shared with the tests, the pictures are drawn by `Effects.hit`.
 *
 * - `blood`: drops of blood that burst from the point of impact in all directions and fall to the floor: the humanoids, the monster humanoids and the beasts.
 * - `cogs`: the same, but cogwheels in tones of grey and silver: the robots.
 * - `chunks`: the same, but bits of the monster's own colour (read from its model, `monster-tints.json`): the magical constructs and the plants.
 * - `smoke`: grey smoke that does not fall but thins out where it came from: the undead.
 */
export type HitKind = "blood" | "cogs" | "chunks" | "smoke";

const BY_GROUP: Readonly<Record<string, HitKind>> = {
  humanoid: "blood",
  monster_humanoid: "blood",
  beast: "blood",
  robot: "cogs",
  magical_construct: "chunks",
  plant: "chunks",
  undead: "smoke",
};

/** The kind of a monster by the group of the user's monster sheet (an unknown group bleeds). */
export const hitKindOf = (group: string): HitKind => BY_GROUP[group] ?? "blood";

/** Drops of blood, dark and bright reds. */
export const BLOOD_COLOURS: readonly (readonly [number, number, number])[] = [[0.72, 0.04, 0.05], [0.58, 0.02, 0.04], [0.82, 0.07, 0.06], [0.46, 0.02, 0.03]];

/** Steel, silver and gunmetal for the cogwheels (the picture itself is grey, the colour multiplies it). */
export const COG_COLOURS: readonly (readonly [number, number, number])[] = [[1, 1, 1], [0.82, 0.85, 0.9], [0.62, 0.67, 0.74], [0.5, 0.52, 0.55], [0.78, 0.75, 0.72], [0.9, 0.9, 0.92]];

const GREY: readonly [number, number, number] = [0.6, 0.6, 0.6];

/**
 * The colour of the bits of a monster: the average colour of its model, brightened so that a dark monster still throws bits that can be seen (the strongest channel at 0.75 at least) and
 * not shifting the hue.
 */
export function chunkTint(defId: number): [number, number, number] {
  const t = (MONSTER_TINTS as Record<string, readonly number[]>)[String(defId)];
  if (!t || t.length !== 3) return [...GREY];
  const top = Math.max(t[0]!, t[1]!, t[2]!, 0.001);
  const k = Math.max(1, 0.75 / top);
  return [Math.min(1, t[0]! * k), Math.min(1, t[1]! * k), Math.min(1, t[2]! * k)];
}

/** How many pieces fly: with the effects on "Full" and on "Low" (a bit of grey smoke is a few puffs, a cluster of bits is one picture of many). */
export const HIT_COUNTS: Readonly<Record<HitKind, readonly [full: number, low: number]>> = { blood: [14, 8], cogs: [7, 4], chunks: [7, 4], smoke: [4, 3] };
