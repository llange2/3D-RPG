/**
 * How often each wall decoration (the moose king and the reliefs, `data/wall-deco.ts`) hangs in the dungeons of some worlds, how often in total (pieces on the walls),
 * and which monster groups the dungeons have (the group decides which decorations fit). 47th playtest, point 10: the moose turned up far more often than the others.
 *
 * Usage: npx tsx tools/dev/deco-stats.ts [seeds=6] [size=default] [dungeons=maximum]
 */
import { buildMapContent } from "../../src/actions";
import { DECO_NAMES, MOOSE_KING_ITEM, WALL_DECO_ITEMS } from "../../src/data/wall-deco";
import { monsterGroup } from "../../src/data/tables";
import { generateInterior, planDungeon } from "../../src/interiors";
import { World } from "../../src/world/world";
import type { DungeonDensity, WorldSize } from "../../src/world/types";

const seeds = Number(process.argv[2] ?? 6);
const size = (process.argv[3] ?? "default") as WorldSize;
const dungeons = (process.argv[4] ?? "maximum") as DungeonDensity;
const places = new Map<number, number>();
const pieces = new Map<number, number>();
const groups = new Map<string, number>();
let total = 0;
for (let s = 0; s < seeds; s++) {
  const world = new World(`deco-stats-${s}`, size, dungeons);
  for (const poi of world.allPois().filter((p) => p.kind === "dungeon" && planDungeon(world, p)?.klass !== "C")) {
    const map = generateInterior(world, poi);
    const look = map.dungeon?.look;
    if (!look) continue;
    total++;
    const group = String(monsterGroup(look.monsters[0]!));
    groups.set(group, (groups.get(group) ?? 0) + 1);
    const hung = buildMapContent(world, poi, map).actions.filter((a) => a.kind === "decor" && WALL_DECO_ITEMS.includes(Number(a.params.item)));
    if (hung.length === 0) continue;
    const item = Number(hung[0]!.params.item);
    places.set(item, (places.get(item) ?? 0) + 1);
    pieces.set(item, (pieces.get(item) ?? 0) + hung.length);
  }
}
console.log(`${seeds} worlds (${size}, ${dungeons}), ${total} dungeons`);
console.log("monster groups of the dungeons:", [...groups].sort((a, b) => b[1] - a[1]).map(([g, n]) => `${g} ${n}`).join(", "));
const hungTotal = [...places.values()].reduce((a, b) => a + b, 0);
for (const item of WALL_DECO_ITEMS) {
  const n = places.get(item) ?? 0;
  console.log(`${String(item).padStart(3)} ${(item === MOOSE_KING_ITEM ? "Moose king" : DECO_NAMES[item] ?? "?").padEnd(26)} dungeons ${String(n).padStart(3)} (${((100 * n) / Math.max(1, hungTotal)).toFixed(0)} %), pieces ${pieces.get(item) ?? 0}`);
}
