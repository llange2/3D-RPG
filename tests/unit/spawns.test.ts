import { describe, expect, it } from "vitest";
import { MONSTERS } from "../../src/data/tables";
import { wrapDist2 } from "../../src/world/islands";
import { CHUNK_SIZE, GROUND, isTileWalkable, wrap } from "../../src/world/types";
import { SAFE_RADIUS, chunkSpawns, inSafeZone } from "../../src/world/spawns";
import { World } from "../../src/world/world";

describe("overworld spawns", () => {
  const world = new World("spawns", "large");
  const across = world.width / CHUNK_SIZE;
  const down = world.height / CHUNK_SIZE;

  /** Every group of the world once (the chunks of the globe, 21 x 30 on a large one). */
  function collect() {
    const all: ReturnType<typeof chunkSpawns> = [];
    for (let cy = 0; cy < down; cy++) for (let cx = 0; cx < across; cx++) all.push(...chunkSpawns(world, cx, cy));
    return all;
  }

  it("is deterministic and independent of other chunks", () => {
    const a = JSON.stringify(chunkSpawns(world, 7, 3));
    collect(); // generate lots of other chunks first
    expect(JSON.stringify(chunkSpawns(new World("spawns", "large"), 7, 3))).toBe(a);
    expect(JSON.stringify(chunkSpawns(world, 7, 3))).toBe(a);
  });

  it("places groups on valid ground inside their chunk, never in the safe zone or on POIs", () => {
    const all = collect();
    expect(all.length).toBeGreaterThan(60);
    const start = world.anchorOf(0, 0);
    for (const s of all) {
      expect(s.uid.startsWith(`c:${Math.floor(s.x / CHUNK_SIZE)}:${Math.floor(s.y / CHUNK_SIZE)}:`)).toBe(true);
      expect(wrapDist2(s.x, s.y, start.x, start.y, world.width, world.height)).toBeGreaterThan(SAFE_RADIUS * SAFE_RADIUS);
      expect(inSafeZone(world, s.x, s.y)).toBe(false);
      const t = world.tile(s.x, s.y);
      expect(t.poiId).toBeNull();
      const water = MONSTERS[s.monsterIds[0]!]!.terrain === "water";
      if (water) expect(t.ground).toBe(GROUND.WATER);
      else expect(isTileWalkable(t)).toBe(true);
      expect(s.monsterIds.length).toBeGreaterThan(0);
      expect(s.monsterIds.length).toBeLessThanOrEqual(4);
    }
  });

  it("keeps land monsters out of the water and aquatic monsters in it", () => {
    for (const s of collect()) {
      const t = world.tile(s.x, s.y);
      for (const id of s.monsterIds) {
        const m = MONSTERS[id]!;
        if (t.ground === GROUND.WATER) expect(m.terrain).toBe("water");
        // the Dragon Worm (terrain "both") walks on land as well
        else expect(m.terrain).not.toBe("water");
      }
    }
  });

  it("holds the same groups, with the same uids, in a chunk and in its copies one world away (the globe)", () => {
    for (const [cx, cy] of [[2, 3], [7, 7], [0, 19]] as const) {
      const home = chunkSpawns(world, cx, cy);
      const away = chunkSpawns(world, cx + across, cy - down);
      expect(away.map((g) => [g.uid, g.x - world.width, g.y + world.height, g.monsterIds])).toEqual(home.map((g) => [g.uid, g.x, g.y, g.monsterIds]));
      expect(wrap(cx + across, across)).toBe(cx);
    }
  });

  it("builds the groups for the level of their island: the monsters never exceed the level (plus the biome's bias)", () => {
    for (const s of collect()) {
      const tier = Math.min(5, world.tierAt(s.x, s.y) + 2);
      for (const id of s.monsterIds) {
        // the water monsters are all there is in the sea: their weakest is the Piranha, level 2
        if (MONSTERS[id]!.terrain === "land") expect(MONSTERS[id]!.treasure_level, `${s.uid} on tier ${tier}`).toBeLessThanOrEqual(tier);
      }
    }
  });

  it("gets stronger with the level of the island", () => {
    const meanLevel = (min: number, max: number) => {
      let sum = 0;
      let n = 0;
      for (const s of collect()) {
        const tier = world.tierAt(s.x, s.y);
        if (tier < min || tier > max) continue;
        for (const id of s.monsterIds) {
          if (MONSTERS[id]!.terrain !== "land") continue;
          sum += MONSTERS[id]!.treasure_level;
          n++;
        }
      }
      return sum / n;
    };
    expect(meanLevel(4, 5)).toBeGreaterThan(meanLevel(1, 2) + 0.5);
  });
});
