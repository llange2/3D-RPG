import { describe, expect, it } from "vitest";
import { STAIRCASE_ITEM } from "../../src/data/quest-table";
import { CELL, FACING_DELTA } from "../../src/interiors/types";
import { CELL_SIZE, TOWER_CEILING_DROP, TOWER_STOREY, cellX, cellZ, meshInterior, towerShafts, wallHeightOf } from "../../src/render/interiorMesher";
import { OWN_MODELS, stairsScale, themedProp } from "../../src/render/interiorProps";
import { questInterior } from "../helpers/quests";

/** Several towers: the quests that build them, two levels, two variants. */
function towers() {
  const out: ReturnType<typeof questInterior>[] = [];
  for (const quest of ["quest_2", "quest_4", "quest_5"] as const) for (const tier of [1, 4]) for (let variant = 0; variant < 2; variant++) out.push(questInterior(quest, "dungeon_5", tier, variant));
  return out;
}

describe("the wooden stairs of a tower (49th playtest, point 3)", () => {
  const all = towers();

  it("is a shaft one storey higher over every stair cell, open towards the room in front of it", () => {
    for (const { map, ref } of all) {
      const shafts = towerShafts(map);
      expect(shafts.size).toBe(ref.tower!.stairs.length);
      for (const s of ref.tower!.stairs) expect(shafts.get(s.up.y * map.width + s.up.x), map.key).toBe(s.facing);
      // the shaft is floor in the map (the party bumps into the stairs there), the door above the stairs of the floor above is not a shaft
      for (const s of ref.tower!.stairs) {
        expect(map.cells[s.up.y * map.width + s.up.x]).toBe(CELL.FLOOR);
        expect(shafts.has(s.down.y * map.width + s.down.x)).toBe(false);
      }
    }
  });

  it("draws walls twice as high round the stair cell and nowhere else, and the ceiling on top of them", () => {
    for (const { map, ref } of all) {
      const H = wallHeightOf(map);
      expect(H).toBe(TOWER_STOREY);
      const geo = meshInterior(map);
      const rects = ref.tower!.stairs.map((s) => ({ x0: cellX(s.up.x), x1: cellX(s.up.x) + CELL_SIZE, z1: cellZ(s.up.y), z0: cellZ(s.up.y) - CELL_SIZE, s }));
      const inRect = (x: number, z: number) => rects.some((r) => x >= r.x0 - 1e-4 && x <= r.x1 + 1e-4 && z >= r.z0 - 1e-4 && z <= r.z1 + 1e-4);
      const vertices = (material: string) => {
        const out: [number, number, number][] = [];
        for (const g of geo.groups.filter((q) => q.material === material)) for (let k = g.start; k < g.start + g.count; k++) out.push([geo.positions[geo.indices[k]! * 3]!, geo.positions[geo.indices[k]! * 3 + 1]!, geo.positions[geo.indices[k]! * 3 + 2]!]);
        return out;
      };
      // no wall rises above the storey except at a stair cell
      for (const [x, y, z] of vertices("wall")) if (y > H + 1e-4) expect(inRect(x, z), `${map.key} wall at ${x},${y},${z}`).toBe(true);
      for (const r of rects) {
        // four faces up to 2H: the back wall and both sides, and the wall over the opening towards the room in front
        const tops = vertices("wall").filter(([x, y, z]) => Math.abs(y - 2 * H) < 1e-4 && inRect(x, z));
        const on = (pred: (x: number, z: number) => boolean) => tops.some(([x, , z]) => pred(x, z));
        expect(on((x) => Math.abs(x - r.x0) < 1e-4), `${map.key} west`).toBe(true);
        expect(on((x) => Math.abs(x - r.x1) < 1e-4), `${map.key} east`).toBe(true);
        expect(on((_, z) => Math.abs(z - r.z1) < 1e-4), `${map.key} north`).toBe(true);
        expect(on((_, z) => Math.abs(z - r.z0) < 1e-4), `${map.key} south`).toBe(true);
        // the opening is a wall from the room's ceiling up only: nothing under H on that side
        // (the two corners of that edge belong to the side walls as well, which reach the floor: the floor level is no sign of a wall in the opening; the heights between 0 and H are)
        const d = FACING_DELTA[r.s.facing];
        const edge = d.dx !== 0 ? (v: [number, number, number]) => Math.abs(v[0] - (d.dx > 0 ? r.x1 : r.x0)) < 1e-4 : (v: [number, number, number]) => Math.abs(v[2] - (d.dy > 0 ? r.z0 : r.z1)) < 1e-4;
        const openFace = vertices("wall").filter((v) => edge(v) && inRect(v[0], v[2]));
        expect(openFace.some((v) => Math.abs(v[1] - 2 * H) < 1e-4), `${map.key} lintel top`).toBe(true);
        expect(openFace.some((v) => Math.abs(v[1] - H) < 1e-4), `${map.key} lintel bottom`).toBe(true);
        expect(openFace.filter((v) => v[1] > 1e-4 && v[1] < H - 1e-4), `${map.key} opening`).toHaveLength(0);
      }
      // the ceiling over the stairs is the high one
      const ceilings = vertices("ceiling").filter(([x, , z]) => inRect(x, z));
      expect(ceilings.length).toBeGreaterThan(0);
      expect(Math.max(...ceilings.map((v) => v[1]))).toBeCloseTo(2 * H - TOWER_CEILING_DROP, 3);
    }
  });

  it("stretches the stairs over a cell and a storey, rising towards the wall", () => {
    // the user's file: 0.97 wide, 1.26 high, 1.9 long
    const [sx, sy, sz] = stairsScale([-0.488, -0.63, -0.952, 0.483, 0.625, 0.95]);
    expect(0.971 * sx).toBeCloseTo(CELL_SIZE, 2);
    expect(1.255 * sy).toBeCloseTo(TOWER_STOREY, 2);
    expect(1.902 * sz).toBeCloseTo(CELL_SIZE, 2);
    const { content, map, ref } = all[0]!;
    const up = content.actions.find((a) => a.kind === "stairs" && a.params.up === true)!;
    expect(OWN_MODELS[STAIRCASE_ITEM]!.model).toBe("obj_wooden_stairs");
    const prop = themedProp(up, 0, 0, 0, {}, new Set(), content)!;
    expect(prop.model).toBe("obj_wooden_stairs");
    expect(prop.scaleXYZ).toEqual(stairsScale(undefined));
    // the compass bearing of the party's view when it arrives is the prop's yaw
    const facing = ref.tower!.stairs[0]!.facing;
    expect(prop.rotY).toBeCloseTo(({ N: 0, E: 90, S: 180, W: 270 }[facing] * Math.PI) / 180, 6);
    expect(map.cells.length).toBeGreaterThan(0);
  });
});
