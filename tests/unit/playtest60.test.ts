import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildMapContent } from "../../src/actions";
import { resolveAction, type ActionContext } from "../../src/actions/handlers";
import { SETH } from "../../src/actions/machines";
import { COIN_POINTS, NEUTRAL_SCALE, coinPoints } from "../../src/actions/rewardScale";
import { hash2 } from "../../src/core/noise";
import { sethLine } from "../../src/data/prop-texts";
import { MinimapIcons } from "../../src/game/minimapIcons";
import { generateInterior } from "../../src/interiors";
import { CELL, FACING_DELTA } from "../../src/interiors/types";
import { faceOpenYaw, facingSets } from "../../src/render/facing";
import { createDefaultParty } from "../../src/sim/party";
import { World } from "../../src/world/world";
import { planDungeon } from "../../src/interiors/dungeonPlan";

/** The 60th playtest: the statues look into the room (point 1), no lines in shallow water on the zoomed-out map (2), the dwarf's Crazy portrait (4), Seth Squirm names the points of a coin (5). */

describe("60th playtest, point 1: a statue at a wall looks into the room, though a beam stands in front of it", () => {
  // (the places of the world moved with the 62nd playtest, and the Underhalls of Yarula of this seed no longer have the statue at 41/40 that this test was made for: every statue of the world is checked now,
  // and the ones with their back to a wall, which stand beside something that shuts out the cell in front, are the case of the report)
  it("every statue of the dungeons of three small worlds that has a wall on one side looks away from it, into the room", { timeout: 240_000 }, () => {
    const BEARING: Record<number, keyof typeof FACING_DELTA> = { 0: "N", 90: "E", 180: "S", 270: "W" };
    let checked = 0;
    for (const [seed, poi, world] of ["alpha", "beta", "gamma"].flatMap((s) => {
      const w = new World(s, "small", "default");
      return w.allPois().filter((p) => p.kind === "dungeon" && planDungeon(w, p)?.klass !== "C").map((p) => [s, p, w] as const);
    })) {
      const map = generateInterior(world, poi);
      const content = buildMapContent(world, poi, map);
      const sets = facingSets(map, content.actions, new Set());
      const floor = (x: number, y: number) => map.cells[y * map.width + x] === CELL.FLOOR && !sets.wallLike.has(y * map.width + x);
      for (const statue of content.actions.filter((a) => a.kind === "lore" && a.params.item === 28)) {
        const walls = (Object.keys(FACING_DELTA) as (keyof typeof FACING_DELTA)[]).filter((f) => !floor(statue.x + FACING_DELTA[f].dx, statue.y + FACING_DELTA[f].dy));
        if (walls.length !== 1) continue;
        const yaw = faceOpenYaw(map, sets, statue, (hash2(0x51, statue.x, statue.y) >>> 0) >>> 8, false);
        const front = BEARING[Math.round((yaw * 180) / Math.PI) % 360]!;
        // the back is the wall, the front the cell opposite to it
        expect(FACING_DELTA[front].dx + FACING_DELTA[walls[0]!].dx, `${seed} ${poi.name} ${statue.x}/${statue.y}`).toBe(0);
        expect(FACING_DELTA[front].dy + FACING_DELTA[walls[0]!].dy, `${seed} ${poi.name} ${statue.x}/${statue.y}`).toBe(0);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe("60th playtest, point 2: the veil of shallow water lies on the pixels of its tile", () => {
  it("fills the whole pixels of the cell, not the fractional rectangle that blended the seams between two cells", () => {
    const fills: number[][] = [];
    const ctx = { fillStyle: "", fillRect: (...a: number[]) => fills.push(a) } as unknown as CanvasRenderingContext2D;
    const icons = Object.create(MinimapIcons.prototype) as MinimapIcons;
    icons.drawVeil(ctx, 17.3, 34.6, 18);
    // (62nd playtest, point 2: the dark edge of the tile, 3 of 48 px, stays free of the veil: one pixel at this size)
    expect(fills).toEqual([[18, 35, 17, 17]]);
    fills.length = 0;
    icons.drawVeil(ctx, 20, 40, 20);
    expect(fills).toEqual([[21, 41, 18, 18]]);
    // a cell that is drawn without the edge (zoomed out) is veiled whole
    fills.length = 0;
    (icons as unknown as { gridMin: number }).gridMin = 20;
    icons.drawVeil(ctx, 8, 8, 10);
    expect(fills).toEqual([[8, 8, 10, 10]]);
  });
});

describe("60th playtest, point 4: every hero has a Crazy portrait", () => {
  it("the dwarf (character17) has one in the sheet register, like the others", () => {
    const sheets = JSON.parse(readFileSync("public/assets/icons/portraits/sheets/sheets.json", "utf8")) as { frames: string[]; avatars: Record<string, number[]> };
    const crazy = sheets.frames.indexOf("_Crazy");
    expect(crazy).toBeGreaterThan(0);
    for (const [avatar, frames] of Object.entries(sheets.avatars)) expect(frames, avatar).toContain(crazy);
  });
});

describe("60th playtest, point 5: Seth Squirm names the points of a coin of this world", () => {
  it("the line has the points of the world in it (one coin buys three points in the default world, more in a small one, fewer in a huge one)", () => {
    expect(sethLine(3)).toContain("one coin buys three points.");
    expect(sethLine(1)).toContain("one coin buys one point.");
    expect(sethLine(5)).toContain("one coin buys five points.");
    expect(sethLine(15)).toContain("one coin buys 15 points.");
  });

  it("is made when he is spoken to, from the reward factor of the game", { timeout: 240_000 }, () => {
    const world = new World("ue-a", "default");
    const poi = world.allPois().find((p) => p.kind === "dungeon" && planDungeon(world, p)?.seth)!;
    const map = generateInterior(world, poi);
    const content = buildMapContent(world, poi, map);
    const seth = content.actions.find((a) => a.kind === "lore" && a.params.persona === SETH)!;
    expect(seth.params.seth).toBe(true);
    expect(seth.params.text).toBeUndefined();
    const party = createDefaultParty();
    const ctx: ActionContext = { party, rootSeed: world.rootSeed, content, monsterThemes: {}, tier: 2 };
    const text = (scale?: ActionContext["scale"]) => (resolveAction(seth, { ...ctx, scale }).effects[0] as { text: string }).text;
    expect(text()).toContain(`one coin buys three points`);
    const small = { ...NEUTRAL_SCALE, coin: 2 };
    expect(coinPoints(small)).toBe(COIN_POINTS * 2);
    expect(text(small)).toContain("one coin buys six points");
    expect(text({ ...NEUTRAL_SCALE, coin: 1 / 3 })).toContain("one coin buys one point.");
  });
});
