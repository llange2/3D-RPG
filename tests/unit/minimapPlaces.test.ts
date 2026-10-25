import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { OVERWORLD_LEGEND } from "../../src/game/minimap";
import { placeGroundOf } from "../../src/game/minimapIcons";

const ASSETS = join(import.meta.dirname, "..", "..", "public", "assets");
const KINDS = ["town", "castle", "dungeon", "pyramid", "event", "exit"];
const GROUNDS = ["desert", "forest", "snow", "lava", "meadow", "swamp"];

interface Register {
  cell: number;
  width: number;
  height: number;
  icons: Record<string, { x: number; y: number }>;
}
const register = JSON.parse(readFileSync(join(ASSETS, "ui", "minimap.json"), "utf-8")) as Register;

/** Mean colour of the bright inner part of a place tile (its ground, without the black of symbol and frame). */
async function groundOf(name: string): Promise<[number, number, number]> {
  const { data, info } = await sharp(join(ASSETS, "ui", "minimap.webp")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const at = register.icons[name]!;
  const n = register.cell;
  const sum = [0, 0, 0];
  let count = 0;
  for (let y = Math.floor(n * 0.12); y < Math.floor(n * 0.88); y++) {
    for (let x = Math.floor(n * 0.12); x < Math.floor(n * 0.88); x++) {
      const i = ((at.y + y) * info.width + at.x + x) * 4;
      if (data[i + 3]! < 200 || 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]! < 70) continue;
      for (let c = 0; c < 3; c++) sum[c]! += data[i + c]!;
      count++;
    }
  }
  return [sum[0]! / count, sum[1]! / count, sum[2]! / count];
}

describe("the painted tiles of places, events and ways out on the map sheet", () => {
  it("has every symbol in every ground, inside the sheet", () => {
    for (const kind of KINDS) {
      for (const ground of GROUNDS) {
        const at = register.icons[`${kind}:${ground}`];
        expect(at, `${kind}:${ground}`).toBeDefined();
        expect(at!.x + register.cell, `${kind}:${ground}`).toBeLessThanOrEqual(register.width);
        expect(at!.y + register.cell, `${kind}:${ground}`).toBeLessThanOrEqual(register.height);
      }
    }
    // the interior's question mark and way out have their own ground (the old floor's colour)
    for (const name of ["event:town", "exit:town"]) expect(register.icons[name], name).toBeDefined();
    // the plain old symbols for these were replaced
    expect(register.icons.maptransfer).toBeUndefined();
    expect(register.icons.event).toBeUndefined();
  });

  it("makes the meadow a light green and the swamp a dark one, both from the painted ground", async () => {
    const [forest, meadow, swamp] = await Promise.all([groundOf("event:forest"), groundOf("event:meadow"), groundOf("event:swamp")]);
    expect(meadow[1], "meadow is green").toBeGreaterThan(meadow[0]!);
    expect(meadow[1], "meadow is green").toBeGreaterThan(meadow[2]! * 1.8);
    expect(meadow[1], "meadow is lighter than the forest").toBeGreaterThan(forest[1]! + 25);
    expect(swamp[1], "swamp is darker than the forest").toBeLessThan(forest[1]!);
    expect(swamp[1], "swamp is darker than the meadow").toBeLessThan(meadow[1]! - 60);
  });

  it("stands a place on the ground of its region and gives every kind of place a symbol of its own", () => {
    expect(placeGroundOf("grass")).toBe("meadow");
    expect(placeGroundOf("volcanic")).toBe("lava");
    expect(placeGroundOf("shore")).toBe("desert");
    const places = OVERWORLD_LEGEND.flatMap((e) => (e.icon && "place" in e.icon ? [e.icon.place] : []));
    expect(places).toEqual(expect.arrayContaining(["town", "castle", "dungeon", "pyramid", "event"]));
    expect(OVERWORLD_LEGEND.some((e) => e.icon && "frame" in e.icon)).toBe(false);
  });
});
