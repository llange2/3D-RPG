/**
 * Browser checks of the 47th playtest (needs a dev server, `VITE_FROZEN=1 VITE_PORT=<free port> npx vite --port <free port> --strictPort`):
 *   floor   the floor of the level 5 town beside the one of a level 1 town (point 1)
 *   deco    the lion of the Catacombs of Nora, 50/37 (point 6)
 *   spells  the light of a fireball at night (point 8)
 *
 * Usage: GAME_URL=http://localhost:<port>/ npx tsx tools/dev/check-playtest47.ts <screenshot folder> <floor|deco|spells> [flat|floor|full]
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
import { generateInterior } from "../../src/interiors";
import { World } from "../../src/world/world";

const base = process.env.GAME_URL ?? "http://localhost:5391/";
const outDir = process.argv[2] ?? "playtest47-shots";
const part = process.argv[3] ?? "floor";
const environment = process.argv[4] ?? "full";
mkdirSync(outDir, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
  await page.evaluateOnNewDocument((v: string) => localStorage.setItem("mm3-seed-rpg:settings:v1", v), JSON.stringify({ environment }));
  const evalJs = <T>(code: string) => page.evaluate(code) as Promise<T>;
  const shot = (name: string) => page.screenshot({ path: join(outDir, `${part}-${environment}-${name}.png`) });
  const open = async (seed: string) => {
    await page.goto(`${base}?autostart=1&seed=${seed}&size=default${part === "spells" ? "&outside=1" : ""}`, { waitUntil: "load", timeout: 60000 });
    await page.waitForFunction("window.__game !== undefined", { timeout: 60000 });
    await sleep(5000);
  };

  if (part === "floor") {
    const seed = "cedar-peak-198";
    const world = new World(seed, "default");
    for (const tier of [1, 5]) {
      const town = world.allPois().find((p) => p.kind === "town" && p.tier === tier);
      if (!town) throw new Error(`no town of level ${tier}`);
      const map = generateInterior(world, town);
      console.log(`level ${tier}: ${town.id} ${town.name}, theme ${map.theme.id}, spawn`, JSON.stringify(map.spawn));
      await open(seed);
      await evalJs(`(async () => { await __game.enter(${JSON.stringify(town.id)}); })()`);
      await sleep(3500);
      await shot(`level${tier}-start`);
      // looking down at the floor: the pitch cannot be set, so a second shot a few steps in
      await page.keyboard.press("w");
      await sleep(900);
      await shot(`level${tier}-step`);
    }
  }
  if (part === "deco") {
    const seed = "frost-mere-472";
    const world = new World(seed, "default", "default");
    const poi = world.allPois().find((p) => p.name === "Catacombs of Nora")!;
    await page.goto(`${base}?autostart=1&seed=${seed}&size=default&dungeons=default`, { waitUntil: "load", timeout: 60000 });
    await page.waitForFunction("window.__game !== undefined", { timeout: 60000 });
    await sleep(5000);
    await evalJs(`(async () => { await __game.enter(${JSON.stringify(poi.id)}); })()`);
    await sleep(3500);
    // stand at 49/37 looking east at the lion on 50/37 (its back must be to the wall in the east), then from the north and the south
    for (const [x, y, f, name] of [[48, 37, "E", "from-west"], [50, 35, "S", "from-north"], [49, 39, "N", "from-south"]] as [number, number, string, string][]) {
      await evalJs(`__game.teleport(${x}, ${y}, "${f}")`);
      await sleep(1200);
      await shot(name);
    }
  }
  if (part === "spells") {
    const seed = "cedar-peak-198";
    await open(seed);
    // night, so that the light of a flying spell shows
    await evalJs(`(() => { const p = __game.state.party; p.minutes = 24 * 60 + 23 * 60; __game.game.refresh(); })()`);
    await sleep(1500);
    await shot("night-before");
    const kinds = ["fire", "acid", "ice", "magic"];
    for (const kind of kinds) {
      await evalJs(`(() => { const g = __game.game; const p = g.player; const s = { x: p.x, y: 1.4, z: p.z }; const e = { x: p.x + 2, y: 1.4, z: p.z - 18 }; g.projectiles.launch(${JSON.stringify(kind)}, s, e, 1, 3); })()`);
      await sleep(1200);
      await shot(`flying-${kind}`);
      await sleep(2500);
    }
  }
  if (problems.length) console.log("PROBLEMS:\n" + problems.join("\n"));
} finally {
  await browser.close();
}
console.log("done");
