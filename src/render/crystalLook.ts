/**
 * How the crystals of quest_8 look (quest document 1.10): the numbers of their placement in one place, measured on the user's models (`.ignore` → `tools/assets/sources/models`: `Crystal.glb`
 * 0.69 x 1.9 x 0.68, `Crystal_Holder.glb` 1.9 x 1.41 x 1.9, `Wall_Crystal_Holder.glb` 1.37 x 1.9 x 0.66, all centred on their middle, +y up). No Babylon in here.
 */

/** The scale of the wall holder (the pharaoh with the open mouth) and of the crystal in the floor holder. */
export const CRYSTAL_SCALE = 0.9;
/** The scale of the floor holder: its hole is as wide as the crystal that stands in it (measured below). */
export const FLOOR_HOLDER_SCALE = 0.5;

// What was measured on the user's files (model units, around the middle of each file; the crystal is 0.69 wide and 1.9 long, both ends pointed):
// the floor holder is a vase, its hollow 0.68 in radius at the rim and 0.50 at the narrowest, from y = -0.05 to the rim at y = 0.70, 1.41 high in all;
// the wall holder is a pharaoh's head, its open mouth a round hole 0.26 across, its middle at y = -0.175 and x = 0, the lips at z = 0.17 and the back of the hollow at z = -0.05.
export const CRYSTAL_WIDTH = 0.685;
export const CRYSTAL_LENGTH = 1.9;
const FLOOR_HOLDER_HEIGHT = 1.409;
export const MOUTH_WIDTH = 0.26;
export const MOUTH_Y = -0.175;
export const MOUTH_LIPS_Z = 0.17;
export const MOUTH_BACK_Z = -0.05;

/** The scale of the crystal in a wall holder's mouth: exactly as wide as the round hole (user's wish, 16. 11. 2026). */
export const WALL_CRYSTAL_SCALE = (MOUTH_WIDTH * CRYSTAL_SCALE) / CRYSTAL_WIDTH;
/** How deep the crystal lies in the hollow of the mouth, in the crystal's own length (game units): about three quarters of the hollow. */
const MOUTH_INSERT = (MOUTH_LIPS_Z - MOUTH_BACK_Z) * CRYSTAL_SCALE * 0.75;
/**
 * Where the middle of the wall crystal lies in front of the holder's own middle (game units, along the way out of the wall): the crystal lies in the mouth with its tip out of the wall,
 * so its middle is half its length minus the part in the hollow beyond the lips.
 */
export const WALL_CRYSTAL_ALONG = MOUTH_LIPS_Z * CRYSTAL_SCALE + (CRYSTAL_LENGTH * WALL_CRYSTAL_SCALE) / 2 - MOUTH_INSERT;
/** How far the tip of the wall crystal reaches beyond the middle of the holder (the line of light starts there: no gap between crystal and light). */
export const WALL_CRYSTAL_TIP = WALL_CRYSTAL_ALONG + (CRYSTAL_LENGTH * WALL_CRYSTAL_SCALE) / 2;

/** The height of the lowest point of the crystal in the floor holder: it sits where the hollow is as wide as it is (model y 0.5, where the hollow is 0.60 in radius: 0.30 after scaling, the crystal 0.31). */
export const STAND_LIFT = (0.5 + FLOOR_HOLDER_HEIGHT / 2) * FLOOR_HOLDER_SCALE;
/**
 * The height of the middle of the crystals over the floor, and so of the line of light that runs from crystal to crystal (the lines of the showcase lie on the floor; these shine between the
 * crystals, not at the height of their holders). The crystal of the floor holder has its middle there; the wall holder hangs with its mouth there.
 */
export const CRYSTAL_MID = STAND_LIFT + (CRYSTAL_LENGTH * CRYSTAL_SCALE) / 2;
/** The height of the wall holder's own middle over the floor: its mouth lies at `CRYSTAL_MID`. */
export const WALL_HOLDER_MID = CRYSTAL_MID - MOUTH_Y * CRYSTAL_SCALE;
/** How far a wall holder's back plane lies inside a flat wall (the reliefs' `DECO_BURY`): none, so the head does not sink into the wall (16. 11. 2026). */
export const CRYSTAL_BURY = 0;
/**
 * How far a wall holder stands out of the wall in front of the rock of a cave: the pieces of a cave wall are bulging rock, whose face lies up to a quarter of a cell in front of the cell's edge
 * (the model is 2 x 1.75 = 3.5 wide in a cell of 3), so a plate on the edge sank into it.
 */
export const CAVE_HOLDER_OUT = 0.3;

/** How much a lit crystal glows (1 = its colour at full strength, nothing but the colour), a target that waits, and the plain white one of a dark crystal. */
export const GLOW_LIT = 1;
export const GLOW_WAITING = 0.35;
export const GLOW_DARK = 0.15;
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

/** The soft glow around a crystal that carries light (`GlowLines` halos): its width, a waiting target's, and how far in front of a wall crystal's tip it hangs (game units). */
export const HALO_SIZE = 3.2;
export const HALO_SIZE_WAITING = 1.1;
export const HALO_OUT = 0.1;
