/**
 * How the crystals of quest_8 look (quest document 1.10): the numbers of their placement in one place, measured on the user's models (`.ignore` → `tools/assets/sources/models`: `Crystal.glb`
 * 0.69 x 1.9 x 0.68, `Crystal_Holder.glb` 1.9 x 1.41 x 1.9, `Wall_Crystal_Holder.glb` 1.37 x 1.9 x 0.66, all centred on their middle, +y up). No Babylon in here.
 */

/** The scale of all three models. */
export const CRYSTAL_SCALE = 0.9;
/**
 * The height of the middle of a crystal over the floor, and so of the line of light that runs from crystal to crystal (the lines of the showcase lie on the floor; these shine between the
 * crystals, not at the height of their holders). The wall holder hangs with its middle there, and its mouth is at its middle.
 */
export const CRYSTAL_MID = 1.7;
/** How far a wall holder's back plane lies inside the wall (the reliefs' `DECO_BURY`). */
export const CRYSTAL_BURY = 0.03;

/** The height of the crystal's own middle over the floor when it stands in the floor holder: its base lies in the holder's hollow. */
export const STAND_LIFT = 0.55;
/** The colour of a crystal that carries no light: the plain white of the file. */
export const DARK_CRYSTAL = "#ffffff";
/** The colour mixed into the target's required colour while it waits (a faint tint of the colour it wants, the document's "shimmer"). */
export const WAITING_SHARE = 0.35;

const hex = (n: number): string => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, "0");
const rgb = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/** A colour with white mixed in: `share` of the colour, the rest white (the target's faint shimmer). */
export function faint(color: string, share = WAITING_SHARE): string {
  const [r, g, b] = rgb(color);
  return `#${hex(255 - (255 - r) * share)}${hex(255 - (255 - g) * share)}${hex(255 - (255 - b) * share)}`;
}
