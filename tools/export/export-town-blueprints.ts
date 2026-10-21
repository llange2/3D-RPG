/**
 * Reads the five hand-built towns of the old game (campaign maps `fountain-head`, `baywatch`, `wildabar`, `swamp-town`,
 * `blistering-heights`) and writes their ground plans to `src/data/town-blueprints.ts`: the generated towns of the endless world are
 * built from them (`src/interiors/town.ts`), tier 1 after Fountain Head up to tier 5 after Blistering Heights.
 *
 * What is taken over: where the walls and streets are, where the shops and the people who sell talents stand, the chests, the fountains and
 * statues. What is not: monsters, quests, gates and the cavern's trap doors. The shape stays, the content is generated.
 *
 * Usage: tsx tools/export/export-town-blueprints.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
const CAMPAIGN = join(ROOT, "public", "assets", "campaign");
const OUT = join(ROOT, "src", "data", "town-blueprints.ts");

interface Cell {
  x: number;
  y: number;
  b?: number;
  i?: number;
  a?: number;
  ax?: Record<string, unknown>;
}

const TOWNS = [
  { id: "fountain_head", slug: "fountain-head", name: "Fountain Head", tier: 1 },
  { id: "baywatch", slug: "baywatch", name: "Baywatch", tier: 2 },
  { id: "wildabar", slug: "wildabar", name: "Wildabar", tier: 3 },
  { id: "swamp_town", slug: "swamp-town", name: "Swamp Town", tier: 4 },
  { id: "blistering_heights", slug: "blistering-heights", name: "Blistering Heights", tier: 5 },
];

/** Blocks 1 and 2 are walls (the first with the door texture), 3 and 4 and 12 streets, 5 and 6 the brittle and the broken wall, 19 a gate frame. */
const WALLS = new Set([1, 2]);
const FLOORS = new Set([3, 4, 5, 6, 12, 19]);

/** Items that are pure decoration: fountains and statues, gravestones. The rest on a cell is a shop sign, a person, a gate or a chest. */
const DECOR_ITEMS = new Set([2, 89, 95, 34, 32]);
/** Old items that are a chest (or look like one): the chest sites of a town. */
const CHEST_ITEMS = new Set([1, 13, 72, 96, 32]);

const out: string[] = [];
for (const town of TOWNS) {
  const map = JSON.parse(readFileSync(join(CAMPAIGN, `${town.slug}.json`), "utf-8")) as { cells: Cell[] };
  const cells = new Map<string, Cell>();
  for (const c of map.cells) if (c.b !== undefined) cells.set(`${c.x},${c.y}`, c);
  const xs = [...cells.values()].map((c) => c.x);
  const ys = [...cells.values()].map((c) => c.y);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const w = Math.max(...xs) - x0 + 1;
  const h = Math.max(...ys) - y0 + 1;
  const grid: string[][] = Array.from({ length: h }, () => Array.from({ length: w }, () => " "));
  for (const c of cells.values()) grid[c.y - y0]![c.x - x0] = WALLS.has(c.b!) ? "#" : FLOORS.has(c.b!) ? "." : " ";

  const at = (x: number, y: number) => grid[y]?.[x] ?? " ";
  const services: [number, number][] = [];
  const talents: { x: number; y: number; talent: string }[] = [];
  const chests: { x: number; y: number; item: number }[] = [];
  const exits: [number, number][] = [];
  const decor: { x: number; y: number; item: number }[] = [];
  for (const c of cells.values()) {
    const x = c.x - x0;
    const y = c.y - y0;
    if (at(x, y) !== ".") continue;
    if (c.a !== undefined && c.a >= 1 && c.a <= 7) services.push([x, y]);
    else if (c.a === 15 && typeof c.ax?.talent_name === "string") talents.push({ x, y, talent: c.ax.talent_name });
    else if (c.a === 11 && String(c.ax?.map_to_load ?? "").toLowerCase() === "outside") exits.push([x, y]);
    else if (c.a === 21 && c.i !== undefined && CHEST_ITEMS.has(c.i)) chests.push({ x, y, item: c.i });
    else if (c.i !== undefined && DECOR_ITEMS.has(c.i)) decor.push({ x, y, item: c.i });
  }

  // what the party cannot reach from a way out is not part of the town (the old maps keep their trigger cells outside the walls)
  const seen = new Set<string>();
  const queue: [number, number][] = [...exits];
  for (const [x, y] of exits) seen.add(`${x},${y}`);
  for (let head = 0; head < queue.length; head++) {
    const [x, y] = queue[head]!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (at(nx, ny) !== "." || seen.has(`${nx},${ny}`)) continue;
      seen.add(`${nx},${ny}`);
      queue.push([nx, ny]);
    }
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (at(x, y) === "." && !seen.has(`${x},${y}`)) grid[y]![x] = "#";
  const reach = <T extends { x: number; y: number }>(list: T[]) => list.filter((p) => seen.has(`${p.x},${p.y}`));
  const reachPairs = (list: [number, number][]) => list.filter(([x, y]) => seen.has(`${x},${y}`));
  const lost = services.length + talents.length + chests.length + decor.length - reachPairs(services).length - reach(talents).length - reach(chests).length - reach(decor).length;

  // reading order, so the file does not change when the order of the cells in the map files does
  const byReading = <T extends { x: number; y: number }>(list: T[]) => [...list].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows = grid.map((r) => r.join("").replace(/\s+$/, ""));
  out.push(`  {
    id: ${JSON.stringify(town.id)},
    name: ${JSON.stringify(town.name)},
    tier: ${town.tier},
    rows: [
${rows.map((r) => `      ${JSON.stringify(r)},`).join("\n")}
    ],
    services: ${JSON.stringify(reachPairs(services).sort((a, b) => a[1] - b[1] || a[0] - b[0]))},
    exits: ${JSON.stringify(reachPairs(exits).sort((a, b) => a[1] - b[1] || a[0] - b[0]))},
    talents: ${JSON.stringify(byReading(reach(talents)))},
    chests: ${JSON.stringify(byReading(reach(chests)))},
    decor: ${JSON.stringify(byReading(reach(decor)))},
  },`);
  console.log(`${town.name}: ${w} x ${h}, ${reachPairs(services).length} shops, ${reach(talents).length} talent sellers (${talents.map((t) => t.talent).join(", ")}), ${reach(chests).length} chests, ${reach(decor).length} decor, ${exits.length} exits${lost ? `, ${lost} sites outside the reachable streets dropped` : ""}`);
}

writeFileSync(
  OUT,
  `/**
 * Ground plans of the five hand-built towns of the old game, one per tier of the generated world. Written by
 * \`tools/export/export-town-blueprints.ts\` from the campaign maps: do not edit by hand.
 *
 * \`rows\`: \`#\` wall, \`.\` street, a space is nothing. The sites are cells of the street: shops (the old maps' service cells), the people who sell
 * talents (\`talent\` is the id in TALENTS), chests (\`item\` the old object), ways out, and decoration (fountains, statues, gravestones).
 */
export interface TownBlueprint {
  id: string;
  /** The old map it comes from. */
  name: string;
  tier: number;
  rows: readonly string[];
  services: readonly (readonly [number, number])[];
  exits: readonly (readonly [number, number])[];
  talents: readonly { x: number; y: number; talent: string }[];
  chests: readonly { x: number; y: number; item: number }[];
  decor: readonly { x: number; y: number; item: number }[];
}

export const TOWN_BLUEPRINTS: readonly TownBlueprint[] = [
${out.join("\n")}
];
`,
);
console.log("wrote", OUT);
