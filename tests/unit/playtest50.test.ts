import { describe, expect, it } from "vitest";
import { SOUNDS, filesOf } from "../../src/audio/sound-table";
import { CELL } from "../../src/interiors/types";
import { CELL_SIZE, meshInterior, towerShafts, wallHeightOf } from "../../src/render/interiorMesher";
import { TOWER_TORCH_LAMP } from "../../src/render/lamps";
import { towerTorchSpots } from "../../src/render/terrainMesher";
import { stairsScale } from "../../src/render/interiorProps";
import { questInterior } from "../helpers/quests";

describe("50th playtest", () => {
  it("point 1: the swimming sound takes its three strokes in turn, not by chance", () => {
    const entry = SOUNDS[9051]!;
    expect(typeof entry !== "string" && "alternate" in entry).toBe(true);
    expect(filesOf(entry)).toEqual(["swimming1", "swimming2", "swimming3"]);
    // the footsteps still alternate left and right
    expect(filesOf(SOUNDS[9010]!)).toEqual(["foot_left", "foot_right"]);
  });

  it("point 2a: no wall of no thickness stands between two floor cells beside the stairs of a tower", () => {
    let seen = 0;
    for (const quest of ["quest_2", "quest_4", "quest_5"] as const) {
      for (const tier of [1, 4]) {
        for (let variant = 0; variant < 2; variant++) {
          const { map } = questInterior(quest, "dungeon_5", tier, variant);
          const shafts = towerShafts(map);
          const geo = meshInterior(map);
          const H = wallHeightOf(map);
          const floorAt = (cx: number, cy: number): boolean => cx >= 0 && cy >= 0 && cx < map.width && cy < map.height && map.cells[cy * map.width + cx] === CELL.FLOOR;
          for (const g of geo.groups.filter((q) => q.material !== "floor" && q.material !== "ceiling")) {
            for (let k = g.start; k < g.start + g.count; k += 3) {
              const i = [0, 1, 2].map((j) => geo.indices[k + j]!);
              const nx = geo.normals[i[0]! * 3]!;
              const ny = geo.normals[i[0]! * 3 + 1]!;
              const nz = geo.normals[i[0]! * 3 + 2]!;
              if (Math.abs(ny) > 0.1) continue;
              const ymin = Math.min(...i.map((v) => geo.positions[v * 3 + 1]!));
              if (ymin > H - 0.01) continue; // the upper storey of a shaft is seen from the shaft only
              // the face points into a cell: the cell in front of it and the cell behind it
              const px = i.reduce((s, v) => s + geo.positions[v * 3]!, 0) / 3;
              const pz = i.reduce((s, v) => s + geo.positions[v * 3 + 2]!, 0) / 3;
              const front = [px + nx * 0.5, pz + nz * 0.5];
              const back = [px - nx * 0.5, pz - nz * 0.5];
              const cellOf = (p: number[]): [number, number] => [Math.floor(p[0]! / CELL_SIZE), Math.floor(-p[1]! / CELL_SIZE)];
              const [fx, fy] = cellOf(front);
              const [bx, by] = cellOf(back);
              if (floorAt(fx, fy) && floorAt(bx, by)) throw new Error(`${map.key}: a wall between the floor cells ${fx},${fy} and ${bx},${by}`);
              if (shafts.has(fy * map.width + fx)) seen++;
            }
          }
        }
      }
    }
    // (the stairs still have their walls where rock lies behind them)
    expect(seen).toBeGreaterThan(0);
  });

  it("point 2b: the stairs are stretched from the new file's measure over a cell", () => {
    const [sx, , sz] = stairsScale([-0.4877, -0.6304, -0.9517, 0.483, 0.6247, 0.9496]);
    expect(0.9707 * sx).toBeCloseTo(CELL_SIZE, 2);
    expect(1.9013 * sz).toBeCloseTo(CELL_SIZE, 2);
  });

  it("point 4: the light of a tower's torches hangs on the wall of the ground floor, weak but wide", () => {
    expect(TOWER_TORCH_LAMP.y).toBeLessThan(3);
    expect(TOWER_TORCH_LAMP.intensity!).toBeLessThan(3.6);
    expect(TOWER_TORCH_LAMP.range!).toBeGreaterThanOrEqual(8);
    const [a, b] = towerTorchSpots({ x: 10, y: 10, size: 2, side: "E" });
    // either side of the door, one apart from the other on the front line
    expect(Math.abs(a!.z - b!.z)).toBeCloseTo(3.6, 1);
    expect(a!.x).toBeCloseTo(b!.x, 5);
  });
});
