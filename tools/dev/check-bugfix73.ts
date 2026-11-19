/**
 * bug_fix_73: the 3D ceiling must not pop in at the edge of the window. Sets the party down on two neighbouring cells of one place and takes a shot of each (the second shows
 * what the step brought into view); the ceiling window and the pieces drawn are printed.
 *
 * Needs a dev server (`VITE_FROZEN=1 VITE_PORT=<free port> npx vite --port <free port> --strictPort`).
 * Usage: GAME_URL=http://localhost:<port>/ npx tsx tools/dev/check-bugfix73.ts <folder> [<seed> <size> <place name> <x,y,F> <x,y,F>]
 * Defaults: pearl-wood-803, small, Tower of Varoa, 33,8,E then 34,8,E. VIEW=close|medium|far.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
import { World } from "../../src/world/world";
import { ceilingWindow } from "../../src/render/interiorMesher";

const base = process.env.GAME_URL ?? "http://localhost:5183/";
const [outDir = "bugfix73-shots", seed = "pearl-wood-803", size = "small", name = "Tower of Varoa", ...views] = process.argv.slice(2);
const spots = views.length > 0 ? views : ["33,8,E", "34,8,E"];
mkdirSync(outDir, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const world = new World(seed, size as never, "default" as never);
const poi = world.allPois().find((p) => p.name.toLowerCase() === name.toLowerCase() || p.id === name);
if (!poi) throw new Error(`no place named ${name}`);

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
  const view = process.env.VIEW ?? "far";
  await page.evaluateOnNewDocument((v: string) => localStorage.setItem("mm3-seed-rpg:settings:v1", v), JSON.stringify({ environment: "full", viewDistance: view }));
  await page.goto(`${base}?autostart=1&seed=${seed}&size=${size}&dungeons=default&outside=1&view=${view}`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction("window.__game !== undefined", { timeout: 60000 });
  await sleep(5000);
  await page.evaluate(`(async () => { await __game.enter(${JSON.stringify(poi.id)}); })()`);
  await sleep(4500);
  for (const spot of spots) {
    const [x, y, f] = spot.split(",");
    await page.evaluate(`__game.teleport(${Number(x)}, ${Number(y)}, ${JSON.stringify(f)})`);
    await sleep(2500);
    const info = await page.evaluate(`(() => { const v = __game.game.interiorView; return { near: v.fogDensity, share: v.viewShare, ceiling: v.ceilingShown }; })()`);
    console.log(`${spot}:`, JSON.stringify(info), "window", ceilingWindow((info as { near: number }).near, (info as { share: number }).share));
    await page.screenshot({ path: join(outDir, `ceiling-${view}-${x}_${y}_${f}.png`) });
  }
  if (problems.length > 0) console.log("PROBLEMS:\n" + problems.join("\n"));
  console.log("done");
} finally {
  await browser.close();
}
