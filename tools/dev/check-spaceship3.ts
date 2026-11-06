/**
 * Browser check of the spaceship feedback of 6. 11. 2026: the rounded corner at 60/12 of seed jade-shore-568 (no step in the wall any more), the inner curves of Life Support at 34/34 (no
 * wall texture in the ceiling), the crates a fifth bigger, the robots, the console asking before the card goes in, the black screen with the closing words. Needs a dev server
 * (`VITE_FROZEN=1 VITE_PORT=<free port> npx vite --port <free port> --strictPort`).
 *
 * Usage: GAME_URL=http://localhost:<port>/ npx tsx tools/dev/check-spaceship3.ts <screenshot folder>
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
import { planDungeon } from "../../src/interiors";
import { World } from "../../src/world/world";

const base = process.env.GAME_URL ?? "http://localhost:5197/";
const outDir = process.argv[2] ?? "spaceship3-shots";
mkdirSync(outDir, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const problems: string[] = [];

const seed = "jade-shore-568";
const world = new World(seed, "default");
const pyramid = world.allPois().find((p) => planDungeon(world, p)?.klass === "C" && planDungeon(world, p)?.section === 3)!;

const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: ["--window-size=1280,720", "--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-webgl", "--autoplay-policy=no-user-gesture-required"],
  defaultViewport: { width: 1280, height: 720 },
});
try {
  const page = await browser.newPage();
  page.on("pageerror", (e) => problems.push(`[pageerror] ${(e as Error).message}`));
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`[console] ${m.text()}`);
  });
  const evalJs = <T>(code: string) => page.evaluate(code) as Promise<T>;
  const shot = (name: string) => page.screenshot({ path: join(outDir, name) });
  await page.goto(`${base}?autostart=1&seed=${seed}&size=default&outside=1`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction("window.__game !== undefined", { timeout: 60000 });
  await sleep(4000);
  await evalJs(`(async () => { await __game.enter("${pyramid.id}"); })()`);
  await sleep(6000);
  await shot("0-enter.png");
  // the light of life support, so that the ceiling can be seen
  await evalJs(`(() => { __game.state.opened.add("ship:life"); __game.game.syncShip(true); return 0; })()`);
  const spots: [string, number, number, string][] = [
    ["1-corner-60-12", 63, 12, "W"],
    ["2-life-support-curve-a", 31, 37, "N"],
    ["3-life-support-curve-b", 33, 36, "N"],
  ];
  for (const [name, x, y, facing] of spots) {
    await evalJs(`__game.teleport(${x}, ${y}, "${facing}")`);
    await sleep(2500);
    await shot(`${name}.png`);
  }
  // the ceiling: look up is not possible, so the wall of the curve is shown from two cells away at the bend
  console.log(problems.length ? `PROBLEMS:\n${problems.join("\n")}` : "no browser errors");
} finally {
  await browser.close();
}
