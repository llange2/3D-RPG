/**
 * Browser check of the tower on the overworld (49th playtest: the user's new Tower.glb and the two torches in front of it). Needs a dev server
 * (`VITE_FROZEN=1 VITE_PORT=<free port> npx vite --port <free port> --strictPort`).
 *
 * Usage: GAME_URL=http://localhost:<port>/ [DUNGEONS=few|default|maximum] npx tsx tools/dev/check-tower-torches.ts <screenshot folder> [seed] [tower id]
 * Takes the tower from the front, at 4 and 9 tiles, by day and by night, and prints how many lamps the pool holds.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
import { isTower } from "../../src/world/types";
import { World } from "../../src/world/world";

const base = process.env.GAME_URL ?? "http://localhost:5183/";
const outDir = process.argv[2] ?? "tower-shots";
const seed = process.argv[3] ?? "birch-reach-493";
mkdirSync(outDir, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const dungeons = process.env.DUNGEONS ?? "default";
const world = new World(seed, "default", dungeons as never);
const poi = (process.argv[4] ? world.poiById(process.argv[4]) : world.allPois().find((p) => isTower(p)))!;
const front = world.frontOf(poi);
const away = { N: { dx: 0, dy: -1 }, S: { dx: 0, dy: 1 }, E: { dx: 1, dy: 0 }, W: { dx: -1, dy: 0 } }[poi.side]!;
const toward = { N: "S", S: "N", E: "W", W: "E" }[poi.side]!;
console.log(`${poi.name} (${poi.id}) at ${poi.x}/${poi.y}, side ${poi.side}`);

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
  const evalJs = <T>(code: string) => page.evaluate(code) as Promise<T>;
  await page.goto(`${base}?autostart=1&seed=${seed}&size=default&dungeons=${dungeons}&outside=1`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction("window.__game !== undefined", { timeout: 60000 });
  await sleep(5000);
  for (const [label, minutes] of [["night", 24 * 60 + 23 * 60], ["day", 24 * 60 + 12 * 60]] as [string, number][]) {
    await evalJs(`(() => { const p = __game.state.party; p.minutes = ${minutes}; __game.game.refresh(); })()`);
    for (const dist of [4, 9]) {
      await evalJs(`__game.teleport(${front.x + away.dx * dist}, ${front.y + away.dy * dist}, "${toward}")`);
      await sleep(7000);
      console.log(`${label} ${dist}:`, await evalJs<string>(`JSON.stringify({ towerLamps: __game.game.towerLamps.length, lit: __game.game.r.lamps.map((l) => +l.intensity.toFixed(2)) })`));
      await page.screenshot({ path: join(outDir, `tower-${label}-${dist}.png`) });
    }
  }
  if (problems.length) console.log("PROBLEMS:\n" + problems.join("\n"));
} finally {
  await browser.close();
}
console.log("done");
