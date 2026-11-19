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
import { FACING_DELTA } from "../../src/interiors/types";
import { faceOpenYaw, facingSets } from "../../src/render/facing";
import { createDefaultParty } from "../../src/sim/party";
import { World } from "../../src/world/world";
import { planDungeon } from "../../src/interiors/dungeonPlan";

/** The 60th playtest: the statues look into the room (point 1), no lines in shallow water on the zoomed-out map (2), the dwarf's Crazy portrait (4), Seth Squirm names the points of a coin (5). */

describe("60th playtest, point 1: a statue at a wall looks into the room, though a beam stands in front of it", () => {
  it("the statue of the Underhalls of Yarula (41/40, pearl-wood-803, small) has its back to the wall on its west and looks east", { timeout: 120_000 }, () => {
    const world = new World("pearl-wood-803", "small", "default");
    const poi = world.allPois().find((p) => p.name === "Underhalls of Yarula")!;
    const map = generateInterior(world, poi);
    const content = buildMapContent(world, poi, map);
    const statue = content.actions.find((a) => a.kind === "lore" && a.x === 41 && a.y === 40 && a.params.item === 28)!;
    expect(statue).toBeDefined();
    const sets = facingSets(map, content.actions, new Set());
    const yaw = faceOpenYaw(map, sets, statue, (hash2(0x51, statue.x, statue.y) >>> 0) >>> 8, false);
    // yaw is the compass bearing: 90 degrees = east
    expect(Math.round((yaw * 180) / Math.PI)).toBe(90);
    expect(FACING_DELTA.E).toEqual({ dx: 1, dy: 0 });
  });
});

describe("60th playtest, point 2: the veil of shallow water lies on the pixels of its tile", () => {
  it("fills the whole pixels of the cell, not the fractional rectangle that blended the seams between two cells", () => {
    const fills: number[][] = [];
    const ctx = { fillStyle: "", fillRect: (...a: number[]) => fills.push(a) } as unknown as CanvasRenderingContext2D;
    const icons = Object.create(MinimapIcons.prototype) as MinimapIcons;
    icons.drawVeil(ctx, 17.3, 34.6, 18);
    expect(fills).toEqual([[17, 34, 19, 19]]);
    fills.length = 0;
    icons.drawVeil(ctx, 20, 40, 20);
    expect(fills).toEqual([[20, 40, 20, 20]]);
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
