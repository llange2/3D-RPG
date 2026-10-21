/**
 * A 3 x 5 pixel font for the digits that the walls of a hall draw (the picture riddle of Dark Warriors Keep, chapter 2a.6 of
 * docs/DUNGEON_THEMES.md). One cell wide strokes, one cell between the characters. The same table decides what is built and what the
 * test reads back from the map.
 */
export const GLYPH_W = 3;
export const GLYPH_H = 5;

const DIGITS: Record<string, readonly string[]> = {
  "0": ["###", "#.#", "#.#", "#.#", "###"],
  "1": [".#.", "##.", ".#.", ".#.", "###"],
  "2": ["###", "..#", "###", "#..", "###"],
  "3": ["###", "..#", "###", "..#", "###"],
  "4": ["#.#", "#.#", "###", "..#", "..#"],
  "5": ["###", "#..", "###", "..#", "###"],
  "6": ["###", "#..", "###", "#.#", "###"],
  "7": ["###", "..#", "..#", "..#", "..#"],
  "8": ["###", "#.#", "###", "#.#", "###"],
  "9": ["###", "#.#", "###", "..#", "###"],
};

/**
 * The digits a picture may use: the ones whose strokes enclose no cell. A 0, 6, 8 or 9 drawn in the walls of a hall would close off the
 * floor cells in its loop, and a floor cell nobody can reach is a defect of the map.
 */
export const GLYPH_DIGITS = "123457";

/** Width of a text in cells: the characters and one gap between each two. */
export const glyphWidth = (text: string): number => text.length * GLYPH_W + (text.length - 1);

/** The cells (relative to the top left corner) that are wall in the picture of `text`. */
export function glyphCells(text: string): [number, number][] {
  const cells: [number, number][] = [];
  [...text].forEach((ch, i) => {
    const rows = DIGITS[ch];
    if (!rows) throw new Error(`no glyph for "${ch}"`);
    rows.forEach((row, y) => {
      for (let x = 0; x < GLYPH_W; x++) if (row[x] === "#") cells.push([i * (GLYPH_W + 1) + x, y]);
    });
  });
  return cells;
}

/**
 * Reads a picture back: `wall(x, y)` says whether a cell is wall, `x0`/`y0` is the top left corner, `count` the number of characters.
 * Returns the digits that match, "?" for a pattern that is none. Used by the tests, and a model for how a player reads the map.
 */
export function readGlyphs(wall: (x: number, y: number) => boolean, x0: number, y0: number, count: number): string {
  let out = "";
  for (let i = 0; i < count; i++) {
    const pattern: string[] = [];
    for (let y = 0; y < GLYPH_H; y++) {
      let row = "";
      for (let x = 0; x < GLYPH_W; x++) row += wall(x0 + i * (GLYPH_W + 1) + x, y0 + y) ? "#" : ".";
      pattern.push(row);
    }
    out += Object.entries(DIGITS).find(([, rows]) => rows.every((r, y) => r === pattern[y]))?.[0] ?? "?";
  }
  return out;
}
