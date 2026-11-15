/**
 * bug_fix_64, point 2: the stone of a cave wall that has been broken goes down into the floor as long as the sound lasts (9007), and the party cannot walk through before it is gone.
 * Finds a cave with a treasure chamber behind a brittle wall, breaks the wall with the Perceptive talent, steps at the opening at once (must be a bump) and again after the sound (must walk in).
 * Needs a dev server (`VITE_FROZEN=1 VITE_PORT=<free port> npx vite --port <free port> --strictPort`).
 *
 * Usage: GAME_URL=http://localhost:<port>/ npx tsx tools/dev/check-cave-wall.ts <screenshot folder> [seed]
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
import { generateInterior } from "../../src/interiors";
import { CELL, FACING_DELTA, type Facing } from "../../src/interiors/types";
import { World } from "../../src/world/world";

const base = process.env.GAME_URL ?? "http://localhost:5180/";
const outDir = process.argv[2] ?? "cave-wall-shots";
const SEED = process.argv[3] ?? "pearl-shore-794";
mkdirSync(outDir, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const world = new World(SEED, "default", (process.env.DUNGEONS ?? "default") as never);
const FACINGS: Facing[] = ["N", "E", "S", "W"];
interface Found {
  id: string;
  wall: { x: number; y: number };
  stand: { x: number; y: number };
  facing: Facing;
}
let first: Found | null = null;
for (const poi of world.allPois().filter((p) => p.kind === "cave")) {
  const map = generateInterior(world, poi);
  for (const v of map.dungeon?.vaults ?? []) {
    for (const f of FACINGS) {
      const d = FACING_DELTA[f];
      // the party stands on a floor cell next to the wall (outside the chamber) and looks at it
      const sx = v.seal.x - d.dx;
      const sy = v.seal.y - d.dy;
      const ahead = map.cells[(v.seal.y + d.dy) * map.width + v.seal.x + d.dx];
      if (map.cells[sy * map.width + sx] === CELL.FLOOR && ahead === CELL.FLOOR && map.cells[v.seal.y * map.width + v.seal.x] === CELL.SOLID && !first) first = { id: poi.id, wall: v.seal, stand: { x: sx, y: sy }, facing: f };
    }
  }
  if (first) break;
}
if (!first) throw new Error("no cave with a treasure chamber in this seed");
const found: Found = first;
console.log("cave", found.id, "wall", found.wall, "stand", found.stand, found.facing);

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
  const evalJs = <T>(code: string) => page.evaluate(code) as Promise<T>;
  const press = async (label: string) => evalJs<boolean>(`(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === ${JSON.stringify(label)}); if (b) b.click(); return !!b; })()`);
  const at = () => evalJs<[number, number]>(`[__game.game.player.tx, __game.game.player.ty]`);
  await page.goto(`${base}?autostart=1&seed=${SEED}&size=default&dungeons=${process.env.DUNGEONS ?? "default"}&outside=1`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction("window.__game !== undefined", { timeout: 60000 });
  await sleep(5000);
  await evalJs(`(async () => { await __game.enter(${JSON.stringify(found.id)}); })()`);
  await sleep(3000);
  await evalJs(`__game.teleport(${found.stand.x}, ${found.stand.y}, "${found.facing}")`);
  await sleep(1000);
  await evalJs(`__game.state.party.talents.push("talent_perceptive")`);
  await page.keyboard.press("w");
  await sleep(1000);
  await press("Yes");
  // 0.25 s later the stone is still on its way down: a step into the opening is a bump
  await sleep(250);
  await page.screenshot({ path: join(outDir, "1-sinking.png") });
  // (the arrow key: the game takes the "w" of the question for a key that is still down and ignores the next one)
  await page.keyboard.press("ArrowUp");
  await sleep(700);
  const during = await at();
  console.log("during the sound, at", during, "(must still be", [found.stand.x, found.stand.y], ")");
  // the stone has gone down when the sound is over (4.27 s from the break, `Game.holdStone`): a little later the way is free
  await sleep(Number(process.env.SOUND_MS ?? 4800) - 950);
  await page.keyboard.press("ArrowUp");
  await sleep(1500);
  const after = await at();
  console.log("after the sound, at", after, "(must be the wall cell", [found.wall.x, found.wall.y], ")");
  await page.screenshot({ path: join(outDir, "2-open.png") });
  if (problems.length > 0) console.log("PROBLEMS:\n" + problems.join("\n"));
  const ok = during[0] === found.stand.x && during[1] === found.stand.y && after[0] === found.wall.x && after[1] === found.wall.y;
  console.log(ok ? "OK" : "FAILED");
} finally {
  await browser.close();
}
