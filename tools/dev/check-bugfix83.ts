/**
 * bug_fix_83: looks at what is new in the browser: the three hits of Elemental Storm on one monster, Holy Word's flash, a Dancing Sword in flight, the pot over the fire with its flame tongues, and the torches along
 * the streets of a town. A monster is put in front of the camera and the same calls are made that `Game.launchPartyShots` makes.
 *
 * Usage: GAME_URL=http://localhost:<port>/ npx tsx tools/dev/check-bugfix83.ts <screenshot folder> [what,what,...]   (needs a dev server and Chrome)
 * `what`: storm, holy, sword, pot, town (all by default)
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
import sharp from "sharp";

const base = process.env.GAME_URL ?? "http://localhost:5183/";
const outDir = process.argv[2] ?? "bugfix83-shots";
const wanted = (process.argv[3] ?? "storm,follow,holy,sword,pot,town").split(",");
const monster = Number(process.env.MONSTER ?? "24");
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
  page.on("pageerror", (e) => console.log("pageerror", String(e)));
  const evalJs = <T>(code: string) => page.evaluate(code) as Promise<T>;
  await page.goto(`${base}?seed=test&autostart=1&outside=1`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction("window.__game && window.__game.state", { timeout: 60000 });
  await sleep(4000);
  const clip = { x: 240, y: 60, width: 800, height: 600 };
  const strip = async (name: string, frames: Buffer[]) => {
    await sharp({ create: { width: frames.length * 802, height: 600, channels: 3, background: "#222" } })
      .composite(frames.map((input, i) => ({ input, left: i * 802, top: 0 })))
      .png()
      .toFile(join(outDir, `${name}.png`));
  };
  if (["storm", "follow", "holy", "sword"].some((w) => wanted.includes(w))) {
    const spot = await evalJs<{ x: number; y: number }>(
      `(() => { const g = __game.game; const w = g.world; const p = g.player; for (let r = 0; r < 40; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const x = p.tx + dx, y = p.ty + dy; if (w.isLandWalkable && w.isLandWalkable(x, y)) return { x, y }; } return { x: p.tx, y: p.ty }; })()`,
    ).catch(() => ({ x: 0, y: 0 }));
    await evalJs(`(async () => { const g = __game; ${spot.x || spot.y ? `g.teleport(${spot.x}, ${spot.y}, "N");` : ""} await new Promise((r) => setTimeout(r, 1500)); g.game.internals.monsters.clear(); })()`);
    await evalJs(`(async () => { const g = __game; const cam = g.camera; const m = g.game.internals.monsters; await m.add("m", ${monster}, cam.position.x, cam.position.y - 1.7, cam.position.z + 6); })()`);
    await sleep(1500);
    await evalJs(`__game.scene.animationGroups.forEach((g) => g.pause())`);
    const shoot = async (name: string, call: string, waits: number[]) => {
      const frames: Buffer[] = [];
      await evalJs(`(() => { const i = __game.game.internals; const cam = __game.camera.position; const from = { x: cam.x, y: cam.y - 0.5, z: cam.z + 0.9 }; const spot = i.monsters.hitSpot("m"); const at = i.monsters.anchor("m"); const P = i.projectiles, E = i.effects; ${call} })()`);
      let last = 0;
      for (const w of waits) {
        await sleep(w - last);
        last = w;
        frames.push((await page.screenshot({ clip })) as Buffer);
      }
      await strip(name, frames);
      await sleep(2800);
    };
    // the three hits at the places Game.launchPartyShots gives them (high left, middle right, low), a little towards the party
    const storm = (kind: string, side: number, up: number) => `{ const body = Math.max(0.5, spot.y - spot.floor); const away = Math.hypot(from.x - spot.x, from.z - spot.z) || 1; const ux = (from.x - spot.x) / away, uz = (from.z - spot.z) / away; P.stormHit('${kind}', { x: spot.x + ux * 0.5 + uz * ${side} * body, y: spot.y + ${up} * body, z: spot.z + uz * 0.5 - ux * ${side} * body }); }`;
    const jobs: Record<string, [string, number[]]> = {
      storm: [`${storm("fire", -0.55, 0.5)} ${storm("ice", 0.55, 0.05)} ${storm("acid", -0.1, -0.5)}`, [150, 600, 1200, 1900, 2400]],
      follow: ["P.swarm({ x: spot.x, y: spot.y, z: spot.z }, 10, () => i.monsters.hitSpot('m')); i.monsters.moveTo('m', cam.x + 3, cam.y - 1.7, cam.z + 9, 1.5);", [100, 700, 1300, 1900]],
      holy: ["P.impactAt('magic', at); P.burst(at, { from: [1, 0.97, 0.8], to: [1, 0.78, 0.35], peak: 6, range: 12, seconds: 0.8, daylight: 0.7 });", [60, 250, 600]],
      sword: ["P.launchSword('wpn_sword2', from, at); P.launchSword('wpn_sword1', { x: from.x - 1, y: from.y + 0.4, z: from.z }, at); P.launchSword('wpn_sword3', { x: from.x + 1, y: from.y, z: from.z }, at);", [60, 140, 220, 300]],
    };
    for (const name of wanted) {
      const job = jobs[name];
      if (job) await shoot(name, job[0], job[1]);
    }
    await evalJs(`__game.game.internals.monsters.clear()`);
  }
  if (wanted.includes("pot")) {
    await evalJs(`(async () => { await __game.enter("showcase"); })()`);
    await sleep(7000);
    const spot = await evalJs<string>(`(() => { const it = __game.game.internals.interior.map.showcase.items.find((i) => i.item === 71); return JSON.stringify(it ? { x: it.x, y: it.y + 2 } : null); })()`);
    const at = JSON.parse(spot) as { x: number; y: number } | null;
    if (at) {
      const frames: Buffer[] = [];
      for (const [dx, dy, f] of [[0, 0, "N"], [0, -4, "S"], [2, -2, "W"], [-2, -2, "E"]] as const) {
        await evalJs(`__game.teleport(${at.x + dx}, ${at.y + dy}, "${f}")`);
        await sleep(1500);
        frames.push((await page.screenshot({ clip })) as Buffer);
      }
      await strip("pot", frames);
    } else console.log("no pot in the showcase");
    await evalJs(`(async () => { await __game.leave(); })()`);
    await sleep(3500);
  }
  if (wanted.includes("town")) {
    await evalJs(`(async () => { const g = __game; await g.enter(g.firstPoi("town")); })()`);
    await sleep(7000);
    const frames: Buffer[] = [];
    for (const f of ["N", "E", "S", "W"]) {
      await evalJs(`(() => { const p = __game.game.player; __game.teleport(p.tx, p.ty, "${f}"); })()`);
      await sleep(900);
      frames.push((await page.screenshot({ clip })) as Buffer);
    }
    await strip("town", frames);
  }
} finally {
  await browser.close();
}
