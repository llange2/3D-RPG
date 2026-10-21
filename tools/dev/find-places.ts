/** Lists interesting places of a world for visual checks: one standing spot per biome, water, mountains and the nearest POI of each kind. */
import { BIOME_NAMES, GROUND, isTileWalkable, poiBounds } from "../../src/world/types";
import { World } from "../../src/world/world";

const seed = process.argv[2] ?? "alpha";
const world = new World(seed);
const found = new Map<string, string>();

const near = (x: number, y: number, pred: (x: number, y: number) => boolean) => {
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (pred(x + dx, y + dy)) return true;
  return false;
};

for (let r = 0; r < 600 && found.size < 14; r += 2) {
  for (let a = 0; a < 360; a += 9) {
    const x = Math.round(Math.cos((a * Math.PI) / 180) * r);
    const y = Math.round(Math.sin((a * Math.PI) / 180) * r);
    const t = world.tile(x, y);
    if (!isTileWalkable(t) || t.poiId) continue;
    const biome = BIOME_NAMES[t.biome]!;
    const key = (k: string, extra: string) => {
      if (!found.has(k)) found.set(k, `${x},${y} (${extra})`);
    };
    if (t.ground === GROUND.LAND) key(`biome ${biome}`, `r=${r}`);
    if (t.ground === GROUND.LAND && near(x, y, (px, py) => world.tile(px, py).ground === GROUND.WATER)) key(`shore near ${biome}`, "water within 3 tiles");
    if (t.ground === GROUND.LAND && near(x, y, (px, py) => world.tile(px, py).ground === GROUND.MOUNTAIN)) key(`mountains near ${biome}`, "mountain within 3 tiles");
    if (t.ground === GROUND.BRIDGE) key("bridge", "");
    if (t.ground === GROUND.PASS) key("mountain pass", "");
  }
}
for (const [k, v] of [...found].sort()) console.log(k.padEnd(28), v);

console.log("--- POIs (closest per kind, standing south of the object looking north) ---");
const best = new Map<string, { d: number; line: string }>();
for (const ry of [0]) {
  for (const rx of world.islands.map((i) => i.index)) {
    for (const p of world.region(rx, ry).pois) {
      const d = Math.max(Math.abs(p.x), Math.abs(p.y));
      const cur = best.get(p.kind);
      const standY = poiBounds(p).y1 + 3;
      if (!cur || d < cur.d) best.set(p.kind, { d, line: `${p.kind.padEnd(8)} ${p.name.padEnd(22)} stand ${p.x},${standY} N  (centre ${p.x},${p.y} tier ${p.tier} biome ${BIOME_NAMES[p.biome]})` });
    }
  }
}
for (const v of best.values()) console.log(v.line);
