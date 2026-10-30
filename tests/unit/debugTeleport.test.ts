import { describe, expect, it } from "vitest";
import { teleportTargets } from "../../src/game/debug";
import { World } from "../../src/world/world";

describe("Debug > Teleport to Level", () => {
  const world = new World("debug-teleport", "small");
  const targets = teleportTargets(world.allPois());

  it("lists every place of the world once, towns, caves, dungeons and castles", () => {
    expect(targets).toHaveLength(world.allPois().length);
    expect(new Set(targets.map((t) => t.poi.id)).size).toBe(targets.length);
    for (const kind of ["town", "cave", "dungeon", "castle"]) expect(targets.some((t) => t.poi.kind === kind)).toBe(true);
  });

  it("is sorted by level", () => {
    for (let i = 1; i < targets.length; i++) expect(targets[i]!.poi.tier).toBeGreaterThanOrEqual(targets[i - 1]!.poi.tier);
  });
});
