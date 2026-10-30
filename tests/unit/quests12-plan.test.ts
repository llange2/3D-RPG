import { describe, expect, it } from "vitest";
import { buildMapContent, validateContent } from "../../src/actions";
import { MAX_ITEMS_PER_ROOM, ORBS_IN_WORLD, ORBS_PER_SECTION, SECTIONS } from "../../src/data/quest-table";
import { checkKeyChain, generateInterior, planDungeon } from "../../src/interiors";
import { WORLD_SIZE_NAMES } from "../../src/world/types";
import { World } from "../../src/world/world";

const places = (world: World) => world.allPois().filter((p) => p.kind === "dungeon" || p.kind === "cave");

describe("the quest plan of a world (quest document 1.2)", () => {
  for (const size of WORLD_SIZE_NAMES) {
    it(`${size}: five pyramids, keys in level 1 and 2, key cards in level 4 and 5 dungeons, 21 orbs on level 5, a chain without holes`, () => {
      for (const seed of ["plan-a", "plan-b", "plan-c"]) {
        const world = new World(seed, size);
        const all = places(world);
        const refs = all.map((p) => ({ poi: p, ref: planDungeon(world, p)! }));
        const pyramids = refs.filter((r) => r.ref.klass === "C");
        expect(pyramids.length, `${seed} ${size}`).toBe(SECTIONS);
        expect(pyramids.every((r) => r.poi.kind === "dungeon" && r.poi.size === 3)).toBe(true);
        expect(new Set(pyramids.map((r) => r.ref.section)).size).toBe(SECTIONS);
        // spread over the islands: no island holds more than one while another has a dungeon to spare
        const perIsland = new Map<number, number>();
        for (const r of pyramids) perIsland.set(r.poi.region.rx, (perIsland.get(r.poi.region.rx) ?? 0) + 1);
        const islandsWithDungeons = new Set(refs.filter((r) => r.poi.kind === "dungeon").map((r) => r.poi.region.rx)).size;
        expect(Math.max(...perIsland.values())).toBeLessThanOrEqual(Math.ceil(SECTIONS / islandsWithDungeons));
        expect(checkKeyChain(refs.map((r) => ({ id: r.poi.id, ref: r.ref })), (id) => all.find((p) => p.id === id)!.tier), `${seed} ${size}`).toEqual([]);
        // caves are free, level 1 and 2 are free, the rest of the dungeons are locked as far as there are keys
        for (const r of refs) {
          if (r.ref.klass !== "C" && (r.poi.kind === "cave" || r.poi.tier <= 2)) expect(r.ref.requires, r.poi.id).toBeNull();
          expect(r.ref.gives.filter((g) => g.startsWith("quest_key_")).length, r.poi.id).toBeLessThanOrEqual(MAX_ITEMS_PER_ROOM[size]!);
          expect(r.ref.gives.length, r.poi.id).toBeLessThanOrEqual(3);
        }
        const keys = refs.flatMap((r) => r.ref.gives).filter((g) => g.startsWith("quest_key_"));
        expect(new Set(keys).size).toBe(keys.length);
        expect(refs.filter((r) => r.ref.requires?.startsWith("quest_key_")).length).toBe(keys.length);
        const orbsInDungeons = refs.reduce((n, r) => n + (r.ref.klass === "C" ? 0 : r.ref.orbs), 0);
        expect(orbsInDungeons).toBe(ORBS_IN_WORLD - ORBS_PER_SECTION * SECTIONS);
        expect(refs.every((r) => r.ref.klass === "C" || r.ref.orbs === 0 || (r.poi.kind === "dungeon" && r.poi.tier >= 4))).toBe(true);
        // the orbs are spread: no level 5 dungeon holds more than one over the least
        const holders = refs.filter((r) => r.ref.klass !== "C" && r.ref.orbs > 0).map((r) => r.ref.orbs);
        expect(Math.max(...holders) - Math.min(...holders)).toBeLessThanOrEqual(1);
      }
    });
  }

  it("is deterministic", { timeout: 180_000 }, () => {
    const a = places(new World("det", "default")).map((p) => JSON.stringify(planDungeon(new World("det", "default"), p)));
    const b = places(new World("det", "default")).map((p) => JSON.stringify(planDungeon(new World("det", "default"), p)));
    expect(a).toEqual(b);
  });

  it("shows every quest in a default world", () => {
    const world = new World("variety", "default");
    const quests = new Set(places(world).map((p) => planDungeon(world, p)!.quest));
    for (const q of ["quest_1", "quest_2", "quest_3", "quest_4", "quest_5", "quest_6"]) expect(quests.has(q as never), q).toBe(true);
  });

  it("makes valid interiors with their quest and end room for every cave and dungeon of a default world", { timeout: 240_000 }, () => {
    const world = new World("alpha", "default");
    let checked = 0;
    for (const poi of places(world)) {
      const ref = planDungeon(world, poi)!;
      if (ref.klass === "C") continue; // the spaceship has its own generator
      const map = generateInterior(world, poi);
      const content = buildMapContent(world, poi, map);
      expect(validateContent(map, content), poi.id).toEqual([]);
      expect(map.dungeon!.endRoom, poi.id).toBeDefined();
      // the keys, key cards and orbs the plan promised lie in the end room
      const found = content.actions.filter((a) => typeof a.params.quest === "string").flatMap((a) => Array.from({ length: Number(a.params.count ?? 1) }, () => String(a.params.quest)));
      expect(found.sort(), poi.id).toEqual([...ref.gives, ...Array.from({ length: ref.orbs }, () => "quest_orb")].sort());
      checked++;
    }
    expect(checked).toBeGreaterThan(30);
  });
});
