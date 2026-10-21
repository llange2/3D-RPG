/**
 * Vocabulary of the flat ground tiles (graphics mode "flat"): hand-painted squares, one per terrain and one per transition between two
 * terrains. The pipeline (`tools/assets/build-flat-terrain.ts`) turns them into `terrain/flat/*.webp` and the register `tiles.json`;
 * the game reads the register through `render/flatGround.ts`. Pure data and name rules, no DOM, no Babylon.
 *
 * File names are `<terrain>_full` or `<first>_<second>_<shape>`. Every transition tile is cut into four quarters (top left, top right,
 * bottom left, bottom right) and each quarter shows one of the two terrains; the border between them crosses the middle of each side,
 * so tiles of the same pair line up whichever way they are laid next to each other. The 14 shapes are all the ways to colour four
 * quarters with two terrains (the two plain ones are the `full` tiles):
 *   corner-xx   the second terrain fills the quarter xx, the first the rest
 *   edge-xx     the second fills the two quarters of the side xx
 *   diag-xxyy   the second fills the two opposite quarters xx and yy
 *   inner-xx    the first fills the quarter xx, the second the rest
 * `island` and `pond` have the same border as a full tile (one terrain all round, a blob of the other in the middle).
 * A tile counts as the terrain that covers most of it, on a tie as the first one in the file name (measured on the pictures: the share
 * of the first terrain is 75 % for corner, 50 % for edge and diag, 25 % for inner, and a blob of 15 to 20 % for island and pond).
 */

export const FLAT_TERRAINS = ["cobblestone", "desert", "dirt", "grass", "lava", "snow", "swamp", "water"] as const;
export type FlatTerrain = (typeof FLAT_TERRAINS)[number];

export const FLAT_SHAPES = ["corner", "diag", "edge", "inner", "island", "pond"] as const;
export type FlatShape = (typeof FLAT_SHAPES)[number];

export type Quadrant = "tl" | "tr" | "bl" | "br";

/** Where a shape's position name puts the quarters of its minority terrain. */
const QUADRANTS_AT: Record<string, readonly Quadrant[]> = {
  tl: ["tl"],
  tr: ["tr"],
  bl: ["bl"],
  br: ["br"],
  top: ["tl", "tr"],
  bottom: ["bl", "br"],
  left: ["tl", "bl"],
  right: ["tr", "br"],
  tlbr: ["tl", "br"],
  trbl: ["tr", "bl"],
};

/** The positions a shape comes in; `island` and `pond` have none. */
export const FLAT_POSITIONS: Record<FlatShape, readonly string[]> = {
  corner: ["tl", "tr", "bl", "br"],
  diag: ["tlbr", "trbl"],
  edge: ["top", "bottom", "left", "right"],
  inner: ["tl", "tr", "bl", "br"],
  island: [],
  pond: [],
};

export interface FlatTile {
  /** The terrain the tile counts as: the one that covers most of it. */
  terrain: FlatTerrain;
  /** The other terrain on the tile (absent on a full tile). */
  other?: FlatTerrain;
  shape: FlatShape | "full";
  /** Where `other` is: a corner (tl, tr, bl, br), a side (top, bottom, left, right) or both corners of a diagonal (tlbr, trbl). Absent for full, island and pond. */
  at?: string;
}

export interface FlatRegister {
  version: 1;
  size: number;
  tiles: Record<string, FlatTile>;
}

const isTerrain = (s: string): s is FlatTerrain => (FLAT_TERRAINS as readonly string[]).includes(s);
const isShape = (s: string): s is FlatShape => (FLAT_SHAPES as readonly string[]).includes(s);

/** Reads what a tile shows from its file name (without extension). Throws on a name that does not fit, so a typo cannot slip into the register. */
export function parseFlatName(name: string): FlatTile {
  const parts = name.split("_");
  if (parts.length === 2 && parts[1] === "full" && isTerrain(parts[0]!)) return { terrain: parts[0], shape: "full" };
  if (parts.length !== 3) throw new Error(`flat terrain: cannot read "${name}"`);
  const [first, second, rest] = parts as [string, string, string];
  const [shape, at] = rest.split("-") as [string, string | undefined];
  if (!isTerrain(first) || !isTerrain(second) || first === second || !isShape(shape)) throw new Error(`flat terrain: cannot read "${name}"`);
  const places = FLAT_POSITIONS[shape];
  if (places.length === 0 ? at !== undefined : at === undefined || !places.includes(at)) throw new Error(`flat terrain: "${name}" has no valid position`);
  const secondIsMajority = shape === "inner" || shape === "island";
  return {
    terrain: secondIsMajority ? second : first,
    other: secondIsMajority ? first : second,
    shape,
    ...(at ? { at } : {}),
  };
}

/** The terrain of each quarter of a tile (top left, top right, bottom left, bottom right); null for island and pond, whose border is that of a full tile. */
export function quartersOf(tile: FlatTile): [FlatTerrain, FlatTerrain, FlatTerrain, FlatTerrain] | null {
  if (tile.shape === "island" || tile.shape === "pond") return null;
  const q: Record<Quadrant, FlatTerrain> = { tl: tile.terrain, tr: tile.terrain, bl: tile.terrain, br: tile.terrain };
  if (tile.other && tile.at) for (const quadrant of QUADRANTS_AT[tile.at]!) q[quadrant] = tile.other;
  return [q.tl, q.tr, q.bl, q.br];
}

/**
 * Transitions a pair should have (the 14 colourings of four quarters; `island` and `pond` are not used, so they are not asked for); the
 * ones a pair lacks are listed so a forgotten picture shows.
 */
export function missingFlatTiles(names: string[]): string[] {
  const have = new Set(names);
  const pairs = new Set(names.filter((n) => !n.endsWith("_full")).map((n) => n.split("_").slice(0, 2).join("_")));
  const missing: string[] = [];
  for (const pair of [...pairs].sort()) {
    for (const shape of FLAT_SHAPES) {
      if (shape === "island" || shape === "pond") continue;
      for (const at of FLAT_POSITIONS[shape].length ? FLAT_POSITIONS[shape] : [""]) {
        const name = `${pair}_${shape}${at ? `-${at}` : ""}`;
        if (!have.has(name)) missing.push(name);
      }
    }
  }
  return missing;
}
