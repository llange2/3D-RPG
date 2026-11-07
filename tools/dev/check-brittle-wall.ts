/**
 * Browser check of a broken wall in a town (47th playtest, point 9): breaks the brittle wall of Starthaven and takes pictures of it from the street, from the side along the street,
 * and from inside the pocket. With "Full 3D" the broken wall must be as flat as the walls beside it (no blue strip when seen from the side), and the slopes of its hole must face the street.
 *
 * Usage: GAME_URL=http://localhost:<port>/ npx tsx tools/dev/check-brittle-wall.ts <screenshot folder> [flat|floor|full] [seed]
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
import { generateInterior } from "../../src/interiors";
import { FACING_DELTA, type Facing } from "../../src/interiors/types";
import { capybaraSpot } from "../../src/world/mascots";
import { World } from "../../src/world/world";

const base = process.env.GAME_URL ?? "http://localhost:5391/";
const outDir = process.argv[2] ?? "brittle-shots";
const environment = process.argv[3] ?? "full";
const SEED = process.argv[4] ?? "cedar-peak-198";
mkdirSync(outDir, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const world = new World(SEED, "default");
const map = generateInterior(world, world.poiById("p:0:0:0")!);
const pocket = capybaraSpot(map);
const wall = (map.sites ?? []).find((s) => s.kind === "brittle");
if (!pocket || !wall) throw new Error("the start town has no brittle wall");
const FACINGS: Facing[] = ["N", "E", "S", "W"];
const toWall = FACINGS.find((f) => FACING_DELTA[f].dx === pocket.x - wall.x && FACING_DELTA[f].dy === pocket.y - wall.y)!;
const stand = { x: wall.x - FACING_DELTA[toWall].dx, y: wall.y - FACING_DELTA[toWall].dy };
// the street runs across the way to the wall: both directions along it
const along = FACINGS.filter((f) => FACING_DELTA[f].dx * FACING_DELTA[toWall].dx + FACING_DELTA[f].dy * FACING_DELTA[toWall].dy === 0);
console.log("wall", wall.x, wall.y, "pocket", pocket.x, pocket.y, "stand", stand.x, stand.y, "to the wall", toWall, "along", along.join(","));
const opposite = (f: Facing): Facing => FACINGS[(FACINGS.indexOf(f) + 2) % 4]!;

const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  protocolTimeout: 240000,
  args: ["--window-size=1280,720", "--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-webgl", "--autoplay-policy=no-user-gesture-required"],
  defaultViewport: { width: 1280, height: 720 },
});
try {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument((v: string) => localStorage.setItem("mm3-seed-rpg:settings:v1", v), JSON.stringify({ environment }));
  const evalJs = <T>(code: string) => page.evaluate(code) as Promise<T>;
  const shot = (name: string) => page.screenshot({ path: join(outDir, `${environment}-${name}.png`) });
  const press = async (label: string) => evalJs<boolean>(`(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === ${JSON.stringify(label)}); if (b) b.click(); return !!b; })()`);
  await page.goto(`${base}?autostart=1&seed=${SEED}&size=default`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction("window.__game !== undefined", { timeout: 60000 });
  await sleep(5000);
  await evalJs(`(async () => { await __game.enter("p:0:0:0"); })()`);
  await sleep(3000);
  await evalJs(`__game.teleport(${stand.x}, ${stand.y}, "${toWall}")`);
  await sleep(1000);
  await evalJs(`__game.state.party.talents.push("talent_perceptive")`);
  await page.keyboard.press("w");
  await sleep(1000);
  await press("Yes");
  await sleep(2500);
  await shot("1-front");
  // the side: some cells away along the street, looking along it to the broken wall's column
  for (const dir of along) {
    for (const k of [2, 4]) {
      const x = stand.x + FACING_DELTA[dir].dx * k;
      const y = stand.y + FACING_DELTA[dir].dy * k;
      await evalJs(`__game.teleport(${x}, ${y}, "${opposite(dir)}")`);
      await sleep(900);
      await shot(`2-side-${dir}-${k}`);
    }
  }
  // from the pocket side
  await evalJs(`__game.teleport(${pocket.x}, ${pocket.y}, "${opposite(toWall)}")`);
  await sleep(900);
  await shot("3-from-pocket");
  // in the wall's cell, looking along the street both ways
  for (const dir of along) {
    await evalJs(`__game.teleport(${wall.x}, ${wall.y}, "${dir}")`);
    await sleep(900);
    await shot(`4-in-wall-${dir}`);
  }
} finally {
  await browser.close();
}
console.log("done");
