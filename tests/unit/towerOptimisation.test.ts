import { describe, expect, it } from "vitest";
import { Rng, seedFromString } from "../../src/core/rng";
import { towerName } from "../../src/data/names";
import { MONSTERS, SPELLS, walksOnLand } from "../../src/data/tables";
import { FACING_DELTA, CELL } from "../../src/interiors/types";
import { towerFloorAt } from "../../src/interiors/stairs";
import { FLOOR_GAP } from "../../src/interiors/tower";
import { doorLook } from "../../src/render/interiorDoors";
import { DOOR_OPENING_HEIGHT, DOOR_OPENING_WIDTH, meshInterior, TOWER_CEILING_DROP, wallHeightOf } from "../../src/render/interiorMesher";
import { areaSpell, createEncounter, createMonster, type GridView } from "../../src/sim/encounter";
import { createDefaultParty } from "../../src/sim/party";
import { World } from "../../src/world/world";
import { questInterior } from "../helpers/quests";

const QUESTS = ["quest_2", "quest_4", "quest_5"] as const;
/** Every tower the tests build: three quests, five levels, several variants. */
function towers(variants = 4) {
  const out: ReturnType<typeof questInterior>[] = [];
  for (const quest of QUESTS) for (let tier = 1; tier <= 5; tier++) for (let variant = 0; variant < variants; variant++) out.push(questInterior(quest, "dungeon_5", tier, variant));
  return out;
}

describe("the tower optimisation (48th playtest, second list)", () => {
  const all = towers();

  it("has no guillotine, and pits and spear traps only on the ground floor (point 1)", () => {
    let magical = 0;
    for (const { content, ref } of all) {
      for (const a of content.actions) {
        if (a.kind !== "trap" || a.uid.includes("trapfield")) continue;
        expect(a.params.trap, a.uid).not.toBe("guillotine");
        // (no pit at all since the 56th playtest)
        expect(a.params.trap, a.uid).not.toBe("pit");
        if (a.params.trap === "spring") expect(towerFloorAt(ref.tower, a.x), a.uid).toBe(0);
        if (a.params.trap === "generic") magical++;
      }
    }
    expect(magical).toBeGreaterThan(0);
  });

  it("turns the wooden stairs to rise towards the wall and keeps the door away from them (point 2, 49th playtest)", () => {
    for (const { map, content, ref } of all) {
      ref.tower!.stairs.forEach((s, i) => {
        const up = content.actions.find((a) => a.uid === `${map.key}#stairs:${i}:up`)!;
        // the stairs rise towards the wall, which is behind the way the party looks when it arrives: their bearing is that of the party's view
        expect(up.params.bearing).toBe({ N: 0, E: 90, S: 180, W: 270 }[s.facing]);
        // the wall lies behind the stair cell, and the cell in front is open floor
        const inward = FACING_DELTA[s.facing];
        expect(map.cells[(s.up.y - inward.dy) * map.width + (s.up.x - inward.dx)]).not.toBe(CELL.FLOOR);
        expect(map.cells[(s.up.y + inward.dy) * map.width + (s.up.x + inward.dx)]).toBe(CELL.FLOOR);
        expect(s.front).toEqual({ x: s.up.x + inward.dx, y: s.up.y + inward.dy });
        // no door within two cells of the staircase or of the door on the floor above
        for (const end of [s.up, s.down]) for (const d of content.actions.filter((a) => a.kind === "door")) expect(Math.max(Math.abs(d.x - end.x), Math.abs(d.y - end.y)), `${map.key} door ${d.x},${d.y}`).toBeGreaterThan(2);
      });
    }
  });

  it("tells the floor of a column, the rock between two floors belonging half to either (point 7)", () => {
    const { ref } = all[0]!;
    const [lo, hi] = [ref.tower!.floors[0]!, ref.tower!.floors[1]!];
    expect(towerFloorAt(ref.tower, lo.x)).toBe(0);
    expect(towerFloorAt(ref.tower, lo.x + lo.size - 1)).toBe(0);
    expect(towerFloorAt(ref.tower, hi.x)).toBe(1);
    // the column just before the middle of the rock is the lower floor's, the middle itself the upper floor's
    const middle = (lo.x + lo.size + hi.x) / 2;
    expect(towerFloorAt(ref.tower, Math.ceil(middle) - 1)).toBe(0);
    expect(towerFloorAt(ref.tower, Math.ceil(middle))).toBe(1);
    expect(hi.x - (lo.x + lo.size)).toBeGreaterThanOrEqual(FLOOR_GAP);
    expect(towerFloorAt(undefined, 5)).toBe(0);
  });

  it("names every tower \"Tower of ...\" (point 5)", () => {
    expect(towerName("Depths of Elvaa")).toBe("Tower of Elvaa");
    expect(towerName("Warren of Siloa")).toBe("Tower of Siloa");
    expect(towerName("Elvaa")).toBe("Tower of Elvaa");
    const world = new World("birch-reach-493", "default", "default");
    const towers = world.allPois().filter((p) => world.dungeonRef(p.id)?.layout === "dungeon_5");
    expect(towers.length).toBeGreaterThan(0);
    for (const t of towers) expect(t.name.startsWith("Tower of "), t.name).toBe(true);
  });

  it("has wooden doors only in a tower (point 8)", () => {
    for (const { map, content } of all) for (const d of content.actions.filter((a) => a.kind === "door")) expect(doorLook(map, d.x, d.y)).toBe("door");
  });

  it("builds the doorway of a tower from boxes in the wall's texture, the opening as big as the old frame's (point 11)", () => {
    const { map, content } = all.find((t) => t.content.actions.some((a) => a.kind === "door"))!;
    const doors = content.actions.filter((a) => a.kind === "door").map((a) => ({ x: a.x, y: a.y, axis: a.params.axis === "x" ? ("x" as const) : ("y" as const) }));
    const without = meshInterior(map, new Set(), {});
    const withFrames = meshInterior(map, new Set(), { doorFrames: doors });
    // 6 sides + 3 reveals of faces (a quad each) per door, all in the wall's material
    const quads = (g: ReturnType<typeof meshInterior>) => g.groups.filter((x) => x.material === "wall").reduce((n, x) => n + x.count / 6, 0);
    expect(quads(withFrames) - quads(without)).toBe(doors.length * 9);
    expect(withFrames.groups.every((g) => !g.material.startsWith("door"))).toBe(true);
    expect(DOOR_OPENING_WIDTH).toBeCloseTo(1.875, 3);
    expect(DOOR_OPENING_HEIGHT).toBeCloseTo(2.78, 2);
  });

  it("hangs a tower's ceiling a little lower than its walls end (point 3)", () => {
    const { map } = all[0]!;
    const geo = meshInterior(map);
    const ceiling = geo.groups.filter((g) => g.material === "ceiling");
    expect(ceiling.length).toBeGreaterThan(0);
    const heights = new Set<number>();
    for (const g of ceiling) for (let k = g.start; k < g.start + g.count; k++) heights.add(Math.round(geo.positions[geo.indices[k]! * 3 + 1]! * 1000) / 1000);
    // (and over the stairs, a storey higher: `towerStairs.test.ts`)
    expect([...heights].sort((a, b) => a - b)).toEqual([Math.round((wallHeightOf(map) - TOWER_CEILING_DROP) * 1000) / 1000, Math.round((2 * wallHeightOf(map) - TOWER_CEILING_DROP) * 1000) / 1000]);
  });

  it("keeps the Kudo crab and the other water monsters on water (point 9)", () => {
    expect(MONSTERS[37]!.name).toBe("Kudo crab");
    const water = Object.values(MONSTERS).filter((m) => m.terrain === "water").map((m) => m.name).sort();
    expect(water).toEqual(["Dragon Worm", "Kudo crab", "Octobeast", "Piranha"]);
    for (const m of Object.values(MONSTERS)) if (m.terrain === "water") expect(walksOnLand(m), m.name).toBe(false);
    // none of them is drawn for a dungeon of any group, at any level
    for (const { ref } of all) for (const id of [...ref.look.monsters, ref.look.boss]) expect(MONSTERS[id]!.terrain, MONSTERS[id]!.name).not.toBe("water");
  });

  it("describes Prismatic Light as hitting the monsters in view, and hits none behind a wall (point 12)", () => {
    expect(SPELLS[73]!.text).toContain("Hits all monsters in view");
    const party = createDefaultParty();
    for (const c of party.characters) c.hp = c.health = 99999;
    const open: GridView = { walkable: () => true, water: () => false, opaque: () => false };
    const enc = createEncounter();
    const goblin = Object.values(MONSTERS).find((m) => m.name === "Goblin")!.id;
    enc.monsters.push(createMonster("seen", goblin, 3, 0), createMonster("hidden", goblin, -3, 0), createMonster("far", goblin, 0, 3));
    const inView = (m: { x: number }): boolean => m.x >= 0;
    const events = areaSpell(party, open, enc, 0, 0, new Rng(seedFromString("prism")), "prismatic_light", { damage: 95, type: "magic" }, inView);
    expect(events.filter((e) => e.type === "party_attack").map((e) => (e as { uid: string }).uid).sort()).toEqual(["far", "seen"]);
    // without a view filter the spell hits all (the old rule, for the callers that have none)
    const enc2 = createEncounter();
    enc2.monsters.push(createMonster("a", goblin, 3, 0), createMonster("b", goblin, -3, 0));
    const all2 = areaSpell(party, open, enc2, 0, 0, new Rng(seedFromString("prism")), "prismatic_light", { damage: 95, type: "magic" });
    expect(all2.filter((e) => e.type === "party_attack")).toHaveLength(2);
  });
});
