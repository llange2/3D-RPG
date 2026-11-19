/**
 * 60th playtest, point 1: which way do the statues of a place look, and is it into the room or at the wall? Prints, for every `lore`/`machine` action with an item (statues), the
 * yaw `faceOpenYaw` gives it, the cell it looks at and what lies there (floor, wall, object).
 *
 * Usage: DUNGEONS=default tsx tools/dev/check-statue-facing.ts seed size place name
 */
import { buildMapContent } from "../../src/actions";
import { hash2 } from "../../src/core/noise";
import { generateInterior } from "../../src/interiors";
import { CELL, FACING_DELTA, type Facing } from "../../src/interiors/types";
import { facingSets, faceOpenYaw } from "../../src/render/facing";
import type { WorldSize } from "../../src/world/types";
import { World } from "../../src/world/world";

const [seed = "pearl-wood-803", size = "small", name = "Underhalls of Yarula"] = process.argv.slice(2);
const world = new World(seed, size as WorldSize, (process.env.DUNGEONS ?? "default") as never);
const poi = world.allPois().find((p) => p.name.toLowerCase() === name.toLowerCase() || p.id === name);
if (!poi) throw new Error("no such place");
const map = generateInterior(world, poi);
const content = buildMapContent(world, poi, map);
const sets = facingSets(map, content.actions, new Set());
const F: Record<number, Facing> = { 0: "N", 90: "E", 180: "S", 270: "W" };
for (const a of content.actions) {
  if (!((a.kind === "lore" || a.kind === "machine") && typeof a.params.item === "number")) continue;
  const h = hash2(0x51, a.x, a.y) >>> 0;
  const yaw = faceOpenYaw(map, sets, a, h >>> 8, false);
  const deg = Math.round((yaw * 180) / Math.PI);
  const f = F[((deg % 360) + 360) % 360]!;
  const at = (x: number, y: number) => {
    const c = map.cells[y * map.width + x];
    const obj = content.actions.find((b) => b.x === x && b.y === y && b.kind !== "trap");
    return c === CELL.FLOOR ? (obj ? `object(${obj.kind})` : "floor") : "wall";
  };
  const front = at(a.x + FACING_DELTA[f].dx, a.y + FACING_DELTA[f].dy);
  const around = (["N", "E", "S", "W"] as const).map((g) => `${g}:${at(a.x + FACING_DELTA[g].dx, a.y + FACING_DELTA[g].dy)}`).join(" ");
  console.log(`${a.kind} item ${String(a.params.item)} at ${a.x}/${a.y}: looks ${f} at ${front} | ${around}`);
}
