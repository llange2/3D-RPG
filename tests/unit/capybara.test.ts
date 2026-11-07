import { describe, expect, it } from "vitest";
import { buildMapContent, validateContent } from "../../src/actions";
import { CAPYBARA_ITEM, MASCOT_ASK, MASCOT_ITEM, mascotSpotItem, isSolidSpotItem } from "../../src/data/mascots";
import { CELL, FACING_DELTA, generateInterior, type Facing } from "../../src/interiors";
import { MASCOTS } from "../../src/ui/panels";
import { CAPYBARA_EVERY, CAPYBARA_HOLD, waitMs } from "../../src/ui/capybaraClip";
import { capybaraSpot, townMascotSpot } from "../../src/world/mascots";
import { World } from "../../src/world/world";

const SIDES: Facing[] = ["N", "E", "S", "W"];
const SEEDS = Array.from({ length: 40 }, (_, i) => `capybara-${i}`);

describe("the Capybara, a mascot in a pocket behind a brittle wall of the start town (7. 11. 2026)", () => {
  it("hides one in every start town: a one-cell pocket in thick houses, behind a brittle wall that a free street cell faces", () => {
    for (const seed of SEEDS) {
      const world = new World(seed);
      const poi = world.poiById("p:0:0:0")!;
      const map = generateInterior(world, poi);
      const content = buildMapContent(world, poi, map);
      const spot = capybaraSpot(map);
      expect(spot, seed).not.toBeNull();
      const brittle = (map.sites ?? []).filter((s) => s.kind === "brittle");
      expect(brittle, seed).toHaveLength(1);
      const wall = brittle[0]!;
      // the pocket lies straight behind the wall, which a street cell faces
      const d = FACING_DELTA[SIDES.find((f) => FACING_DELTA[f].dx === spot!.x - wall.x && FACING_DELTA[f].dy === spot!.y - wall.y)!];
      expect(map.cells[(wall.y - d.dy) * map.width + wall.x - d.dx], `${seed}: the street cell in front of the wall`).toBe(CELL.FLOOR);
      expect(map.cells[wall.y * map.width + wall.x], `${seed}: the wall`).not.toBe(CELL.FLOOR);
      expect(map.cells[spot!.y * map.width + spot!.x], `${seed}: the pocket`).toBe(CELL.FLOOR);
      // no other floor round the pocket: the wall is the only way in
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx !== 0 || dy !== 0) expect(map.cells[(spot!.y + dy) * map.width + spot!.x + dx], `${seed}: ${dx},${dy}`).not.toBe(CELL.FLOOR);
      // it looks at the wall
      expect([spot!.faceX - spot!.x, spot!.faceY - spot!.y], seed).toEqual([0 - d.dx, 0 - d.dy]);
      // the wall is an action that gives way, nothing else stands on the pocket, and the content is sound
      expect(content.actions.filter((a) => a.kind === "breakable_wall" && a.x === wall.x && a.y === wall.y), seed).toHaveLength(1);
      expect(content.actions.some((a) => a.x === spot!.x && a.y === spot!.y), `${seed}: nothing else on the pocket`).toBe(false);
      expect(content.spawns.some((s) => s.x === spot!.x && s.y === spot!.y), seed).toBe(false);
      expect(validateContent(map, content), seed).toEqual([]);
      // the Crow still has its perch
      expect(townMascotSpot(map, content)?.mascot, seed).toBe("Crow");
    }
  });

  it("is not in the other towns", () => {
    const world = new World("capybara-others");
    for (const id of ["p:0:0:1", "p:0:0:2", "p:1:0:0"]) {
      const poi = world.poiById(id);
      if (!poi || poi.kind !== "town") continue;
      expect(capybaraSpot(generateInterior(world, poi)), id).toBeNull();
    }
  });

  it("is a mascot without a power: it joins like the others, and leaves its place empty", () => {
    expect(MASCOT_ITEM.Capybara).toBe(CAPYBARA_ITEM);
    expect(MASCOT_ASK.Capybara).toContain("Let the capybara join");
    expect(MASCOTS.Capybara!.text).toContain("does not seem to have any capabilities except from being the cutest thing ever");
    expect(MASCOTS.Capybara!.text).toContain("\u{1F60D}");
    expect(mascotSpotItem(CAPYBARA_ITEM, "Crow")).toBe(CAPYBARA_ITEM);
    expect(isSolidSpotItem(mascotSpotItem(CAPYBARA_ITEM, "Crow"))).toBe(true);
    expect(mascotSpotItem(CAPYBARA_ITEM, "Capybara")).toBe(0);
  });

  it("turns round every 60 to 180 seconds and looks away for 5 to 15", () => {
    expect([waitMs(CAPYBARA_EVERY, 0), waitMs(CAPYBARA_EVERY, 1)]).toEqual([60_000, 180_000]);
    expect([waitMs(CAPYBARA_HOLD, 0), waitMs(CAPYBARA_HOLD, 1)]).toEqual([5_000, 15_000]);
    expect(waitMs(CAPYBARA_EVERY, 0.5)).toBe(120_000);
  });
});
