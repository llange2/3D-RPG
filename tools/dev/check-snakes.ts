/**
 * Summon Snakes (bug_fix_79): puts a monster in front of the camera, lets `Projectiles.snakes` stand a coil of snakes at its feet (as `Game.launchPartyShots` does for every monster the spell hits),
 * and takes screenshots at the start and while it fades, so that the size, the place and the way the heads look can be compared with the user's mock-up `.ignore/Placement.jpg`.
 *
 * Usage: GAME_URL=http://localhost:<port>/ MONSTER=24 DISTANCE=4.2 npx tsx tools/dev/check-snakes.ts <screenshot folder> <name>   (needs a dev server and Chrome)
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
import sharp from "sharp";

const base = process.env.GAME_URL ?? "http://localhost:5179/";
const outDir = process.argv[2] ?? "snake-shots";
const name = process.argv[3] ?? "try";
const monster = Number(process.env.MONSTER ?? "24");
const distance = Number(process.env.DISTANCE ?? "4.2");
mkdirSync(outDir, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  protocolTimeout: 240000,
  args: ["--window-size=1280,720", "--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-webgl"],
  defaultViewport: { width: 1280, height: 720 },
});
try {
  const page = await browser.newPage();
  const evalJs = <T>(code: string) => page.evaluate(code) as Promise<T>;
  await page.goto(`${base}?seed=test&autostart=1&outside=1`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction("window.__game && window.__game.state", { timeout: 60000 });
  await sleep(4000);
  const spot = await evalJs<{ x: number; y: number }>(`(() => { const g = __game.game; const w = g.world; const p = g.player; for (let r = 0; r < 40; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; let ok = true; for (let ky = -2; ky <= 6 && ok; ky++) for (let kx = -2; kx <= 2 && ok; kx++) { const t = w.tile(p.tx + dx + kx, p.ty + dy + ky); if (t.deco !== 0 || t.ground !== w.tile(p.tx, p.ty).ground || t.poiId !== null) ok = false; } if (ok) return { x: p.tx + dx, y: p.ty + dy }; } return { x: p.tx, y: p.ty }; })()`);
  await evalJs(`(async () => { const g = __game; g.teleport(${spot.x}, ${spot.y}, "N"); await new Promise((r) => setTimeout(r, 1500)); g.game.internals.monsters.clear(); })()`);
  await evalJs(`(async () => { const g = __game; const cam = g.camera; await g.game.internals.monsters.add("m", ${monster}, cam.position.x, cam.position.y - 1.7, cam.position.z + ${distance}); })()`);
  await sleep(1500);
  await evalJs(`__game.scene.animationGroups.forEach((g) => g.pause())`);
  const clip = { x: 240, y: 60, width: 800, height: 600 };
  const frames: Buffer[] = [];
  // the coil as the game places it: at the floor of the monster, seen from the camera
  await evalJs(`(() => { const i = __game.game.internals; const spot = i.monsters.hitSpot("m"); const cam = __game.camera.position; i.projectiles.snakes({ x: spot.x, y: spot.floor, z: spot.z }, { x: cam.x, y: cam.y, z: cam.z }); })()`);
  for (const wait of [40, 120]) {
    await sleep(wait);
    frames.push((await page.screenshot({ clip })) as Buffer);
  }
  await sleep(900);
  frames.push((await page.screenshot({ clip })) as Buffer);
  await sharp({ create: { width: 3 * 802, height: 600, channels: 3, background: "#222" } })
    .composite(frames.map((input, i) => ({ input, left: i * 802, top: 0 })))
    .png()
    .toFile(join(outDir, `${name}.png`));
} finally {
  await browser.close();
}
