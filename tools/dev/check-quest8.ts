/**
 * quest_8, the crystal paths (quest document 1.10), seen in the browser (needs a dev server, `VITE_FROZEN=1 VITE_PORT=<free port> npx vite --port <free port> --strictPort`):
 * the party goes to a place with the crystal paths, looks at its wall crystals, then the crystals of the solution are set down one after another and the light is shot at each step.
 *
 * Usage: GAME_URL=http://localhost:<port>/ npx tsx tools/dev/check-quest8.ts <folder> <seed> <place name> <flat|floor|full> [night]
 * (`night` leaves the daylight alone and takes the shots from the cells of the puzzle; the files are `q8-<n>-<what>.png`)
 */
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
import { buildMapContent } from "../../src/actions";
import { simulateCrystals, staticBlockers } from "../../src/actions/crystals";
import { crystalFlag } from "../../src/game/crystalPlay";
import { generateInterior } from "../../src/interiors";
import { CELL, FACING_DELTA, type Facing } from "../../src/interiors/types";
import { World } from "../../src/world/world";

const base = process.env.GAME_URL ?? "http://localhost:5191/";
const [outDir = "q8-shots", seed = "birch-reach-493", name = "Maw of Xanimaa", environment = "full"] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const OPPOSITE: Record<Facing, Facing> = { N: "S", S: "N", E: "W", W: "E" };

const world = new World(seed, "default", (process.env.DUNGEONS ?? "default") as never);
const poi = world.allPois().find((p) => p.name.toLowerCase() === name.toLowerCase() || p.id === name);
if (!poi) throw new Error(`no place named ${name}`);
const map = generateInterior(world, poi, 0);
const content = buildMapContent(world, poi, map);
const walls = content.actions.filter((a) => a.kind === "crystal");
const first = walls.find((a) => typeof a.params.solution === "string");
if (!first) throw new Error(`${name} has no crystal paths (quest ${map.dungeon?.quest})`);
const solution = String(first.params.solution).split(";").map((c) => c.split(",").map(Number) as [number, number]);
console.log(`${poi.name} (${map.dungeon?.layout}, tier ${poi.tier}) key ${map.key}: ${walls.length} wall crystals, solution ${String(first.params.solution)}`);

/** The cell that looks at a wall crystal from `steps` cells away (the nearest one with floor under it). */
const viewOf = (x: number, y: number, dir: Facing): { x: number; y: number; f: Facing } => {
  for (let k = Number(process.env.VIEW_K ?? 3); k >= 1; k--) {
    const cx = x + FACING_DELTA[dir].dx * k;
    const cy = y + FACING_DELTA[dir].dy * k;
    if (map.cells[cy * map.width + cx] === CELL.FLOOR) return { x: cx, y: cy, f: OPPOSITE[dir] };
  }
  return { x, y, f: OPPOSITE[dir] };
};

const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  protocolTimeout: 240000,
  args: ["--window-size=1280,720", "--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-webgl", "--autoplay-policy=no-user-gesture-required"],
  defaultViewport: { width: 1280, height: 720 },
});
try {
  const page = await browser.newPage();
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(`[pageerror] ${(e as Error).message}`));
  page.on("console", (m) => {
    if ((m.type() === "error" || m.type() === "warn") && !/403|Failed to load resource/.test(m.text())) problems.push(`[console ${m.type()}] ${m.text().slice(0, 300)}`);
  });
  await page.evaluateOnNewDocument((v: string) => localStorage.setItem("mm3-seed-rpg:settings:v1", v), JSON.stringify({ environment }));
  await page.goto(`${base}?autostart=1&seed=${seed}&size=default&dungeons=${process.env.DUNGEONS ?? "default"}&outside=1`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction("window.__game !== undefined", { timeout: 60000 });
  await sleep(5000);
  await page.evaluate(`(async () => { await __game.enter(${JSON.stringify(poi.id)}); })()`);
  await sleep(4500);
  let n = 0;
  const shot = async (what: string): Promise<void> => {
    await sleep(1500);
    await page.screenshot({ path: join(outDir, `q8-${String(++n).padStart(2, "0")}-${what}.png`) });
  };
  const go = async (x: number, y: number, f: Facing): Promise<void> => {
    await page.evaluate(`__game.teleport(${x}, ${y}, ${JSON.stringify(f)})`);
    await sleep(1200);
  };
  // the wall crystals, one after the other, from three cells away
  for (const w of walls) {
    const v = viewOf(w.x, w.y, w.params.facing as Facing);
    await go(v.x, v.y, v.f);
    await shot(`${String(w.params.role)}-${w.x}_${w.y}`);
    // EVAL_FILE=<js file> runs in the page after each wall crystal was shot (its result is printed)
    if (process.env.EVAL_FILE) {
      console.log(`page ${w.x},${w.y}:`, JSON.stringify(await page.evaluate(readFileSync(process.env.EVAL_FILE, "utf8"))));
      await shot(`after-eval-${w.x}_${w.y}`);
    }
  }
  // the solution, set down crystal by crystal (the same strings a placed crystal leaves in the save)
  for (const [i, [x, y]] of solution.entries()) {
    await page.evaluate(`(() => { __game.state.opened.add(${JSON.stringify(crystalFlag(map.key, x, y, i + 1))}); __game.game.loadCrystals(); __game.game.refresh(); })()`);
    // look at the new crystal from a cell that stands on none of the rows and columns of the solution (the party in the way would cut the light), or from two cells away
    const onLine = (cx: number, cy: number): boolean => solution.slice(0, i + 1).some(([sx, sy]) => sx === cx || sy === cy) || walls.some((w) => w.x === cx || w.y === cy);
    const around: { f: Facing; x: number; y: number; ok: boolean }[] = [];
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const cx = x + dx;
      const cy = y + dy;
      if (map.cells[cy * map.width + cx] !== CELL.FLOOR || onLine(cx, cy)) continue;
      const f: Facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "W" : "E") : dy > 0 ? "N" : "S";
      around.push({ f, x: cx, y: cy, ok: true });
    }
    around.sort((a, b) => Math.abs(a.x - x) + Math.abs(a.y - y) - (Math.abs(b.x - x) + Math.abs(b.y - y)));
    const spot = around[0] ?? ([["N", 0, -1], ["S", 0, 1], ["E", 1, 0], ["W", -1, 0]] as const).map(([f, dx, dy]) => ({ f: OPPOSITE[f], x: x + dx * 2, y: y + dy * 2, ok: map.cells[(y + dy * 2) * map.width + x + dx * 2] === CELL.FLOOR && map.cells[(y + dy) * map.width + x + dx] === CELL.FLOOR })).find((s) => s.ok);
    if (spot) await go(spot.x, spot.y, spot.f);
    await shot(`set-${i + 1}-of-${solution.length}`);
  }
  // (a monster in the way cuts a line, as it should: NO_MONSTERS=1 clears them for the shots of the lines)
  if (process.env.NO_MONSTERS) await page.evaluate("__game.game.enc.monsters.splice(0); __game.game.crystalSignature = ''; __game.game.refresh()");
  // the lines of the finished solution, each seen from the side: one cell off its middle, looking across it
  const nodes = walls.map((w) => ({ uid: w.uid, x: w.x, y: w.y, dir: w.params.facing as Facing, role: w.params.role as "source" | "target", color: Number(w.params.color) }));
  const lit = simulateCrystals(nodes, solution.map(([x, y], i) => ({ x, y, seq: i + 1 })), staticBlockers(map, content.actions));
  for (const [i, l] of lit.links.entries()) {
    const mx = Math.round((l.from.x + l.to.x) / 2);
    const my = Math.round((l.from.y + l.to.y) / 2);
    const horizontal = l.from.y === l.to.y;
    const sides = horizontal ? ([["N", 0, 1], ["S", 0, -1]] as const) : ([["W", 1, 0], ["E", -1, 0]] as const);
    const view = sides.map(([f, dx, dy]) => ({ f, x: mx + dx, y: my + dy })).find((s) => map.cells[s.y * map.width + s.x] === CELL.FLOOR);
    if (!view) continue;
    await go(view.x, view.y, view.f);
    await shot(`line-${i + 1}-${l.from.x}_${l.from.y}-to-${l.to.x}_${l.to.y}`);
  }
  console.log("light:", lit.links.map((l) => `${l.from.x}/${l.from.y}>${l.to.x}/${l.to.y}:${l.color}`).join(" "), "solved", lit.solved);
  console.log("solved flag:", await page.evaluate(`__game.state.opened.has(${JSON.stringify(`${map.key}@end`)}) || [...__game.state.opened].filter((k) => k.includes("end")).slice(0, 3).join(",")`));
  if (problems.length > 0) console.log("PROBLEMS:\n" + problems.join("\n"));
  console.log("done");
} finally {
  await browser.close();
}
