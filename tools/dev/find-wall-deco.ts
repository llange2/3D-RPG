/**
 * Finds places that hang a given wall decoration, with the cells of the pieces and the way each faces, to put the camera in front of one (bug_fix_59, point 1: the barbarian sat too deep in
 * the wall of the towers). Reads the game's own code and changes nothing.
 *
 * Usage: npx tsx tools/dev/find-wall-deco.ts <item=306> [layout=dungeon_5|any] [seeds=8] [size=default] [dungeons=default]
 */
import { buildMapContent } from "../../src/actions";
import { DECO_NAMES, MOOSE_KING_ITEM } from "../../src/data/wall-deco";
import { generateInterior, planDungeon } from "../../src/interiors";
import { CELL, FACING_DELTA, type Facing } from "../../src/interiors/types";
import { World } from "../../src/world/world";
import type { DungeonDensity, WorldSize } from "../../src/world/types";

const item = Number(process.argv[2] ?? 306);
const layout = process.argv[3] ?? "dungeon_5";
const seeds = Number(process.argv[4] ?? 8);
const size = (process.argv[5] ?? "default") as WorldSize;
const dungeons = (process.argv[6] ?? "default") as DungeonDensity;
/** The sides of a cell that have a wall (the relief hangs on one of them): stand on the cell and face that way. */
function wallsOf(map: { width: number; height: number; cells: Uint8Array }, x: number, y: number): string {
  const out: string[] = [];
  for (const f of ["N", "E", "S", "W"] as Facing[]) {
    const d = FACING_DELTA[f];
    const nx = x + d.dx;
    const ny = y + d.dy;
    if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height || map.cells[ny * map.width + nx] !== CELL.FLOOR) out.push(f);
  }
  return out.join("");
}

console.log(`item ${item} (${item === MOOSE_KING_ITEM ? "Moose king" : DECO_NAMES[item] ?? "?"}), layout ${layout}`);
for (let s = 0; s < seeds; s++) {
  const seed = `deco-find-${s}`;
  const world = new World(seed, size, dungeons);
  for (const poi of world.allPois().filter((p) => p.kind === "dungeon")) {
    const ref = planDungeon(world, poi);
    if (ref?.klass === "C") continue;
    if (layout !== "any" && ref?.layout !== layout) continue;
    const map = generateInterior(world, poi);
    const hung = buildMapContent(world, poi, map).actions.filter((a) => a.kind === "decor" && Number(a.params.item) === item);
    if (hung.length === 0) continue;
    console.log(`${seed} | ${poi.name} | ${ref?.layout} | ${hung.length} pieces: ${hung.slice(0, 6).map((a) => `${a.x},${a.y} wall to the ${wallsOf(map, a.x, a.y)}`).join("; ")}`);
  }
}
