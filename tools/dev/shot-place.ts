/**
 * Screenshots of cells of one place of a seed (needs a dev server, `VITE_FROZEN=1 VITE_PORT=<free port> npx vite --port <free port> --strictPort`):
 * the party enters the place, is set down on each cell given and looks the way given.
 *
 * Usage: GAME_URL=http://localhost:<port>/ npx tsx tools/dev/shot-place.ts <folder> <seed> <place name> <flat|floor|full> <x,y,F> [<x,y,F> ...]
 * (the world is the default size with the default number of dungeons, like `?size=default&dungeons=default`; the file is `<name>-<env>-<x>_<y>_<F>.png`)
 */
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
import { World } from "../../src/world/world";

const base = process.env.GAME_URL ?? "http://localhost:5183/";
const [outDir = "place-shots", seed = "birch-reach-493", name = "Tower of Elvaa", environment = "full", ...views] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const world = new World(seed, "default", (process.env.DUNGEONS ?? "default") as never);
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
  page.on("console", (m) => {
    if ((m.type() === "error" || m.type() === "warn") && !/403|Failed to load resource/.test(m.text())) problems.push(`[console ${m.type()}] ${m.text().slice(0, 300)}`);
  });
  await page.evaluateOnNewDocument((v: string) => localStorage.setItem("mm3-seed-rpg:settings:v1", v), JSON.stringify({ environment }));
  await page.goto(`${base}?autostart=1&seed=${seed}&size=default&dungeons=${process.env.DUNGEONS ?? "default"}&outside=1`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction("window.__game !== undefined", { timeout: 60000 });
  await sleep(5000);
  await page.evaluate(`(async () => { await __game.enter(${JSON.stringify(poi.id)}); })()`);
  await sleep(4500);
  for (const view of views) {
    const [x, y, f] = view.split(",");
    await page.evaluate(`__game.teleport(${Number(x)}, ${Number(y)}, ${JSON.stringify(f)})`);
    await sleep(1800);
    // EVAL=<js> runs in the page after the party has been set down (its result is printed)
    const code = process.env.EVAL_FILE ? readFileSync(process.env.EVAL_FILE, "utf8") : process.env.EVAL;
    if (code) console.log(`eval ${x},${y},${f}:`, JSON.stringify(await page.evaluate(code)));
    // KEYS=w,w,d presses keys one after another (a step takes about a second), then the shot is taken
    for (const key of process.env.KEYS?.split(",") ?? []) {
      await page.keyboard.press(key as Parameters<typeof page.keyboard.press>[0]);
      await sleep(Number(process.env.KEY_WAIT ?? 1400));
    }
    // AFTER_FILE=<js file> runs once more after the keys (to read what the page shows)
    if (process.env.AFTER_FILE) console.log(`after keys:`, await page.evaluate(readFileSync(process.env.AFTER_FILE, "utf8")));
    // CLIP=x,y,w,h cuts a part out of the shot; PITCH=<radians> tilts the camera down (a floor seen from above shows its flaws)
    const clip = process.env.CLIP?.split(",").map(Number);
    if (process.env.PITCH) {
      // (the game sets the camera every frame: the pitch is set again just before each render)
      await page.evaluate(`(() => { const c = __game.camera; c.getScene().onBeforeCameraRenderObservable.add(() => { c.rotation.x = ${Number(process.env.PITCH)}; ${process.env.LOWER ? `c.position.y = ${Number(process.env.LOWER)};` : ""} }); })()`);
      await sleep(400);
    }
    await page.screenshot({ path: join(outDir, `place-${environment}-${x}_${y}_${f}.png`), ...(clip ? { clip: { x: clip[0]!, y: clip[1]!, width: clip[2]!, height: clip[3]! } } : {}) });
  }
  if (problems.length > 0) console.log("PROBLEMS:\n" + problems.join("\n"));
  console.log("done");
} finally {
  await browser.close();
}
