/**
 * bug_fix_81: looks at the new spell pictures in the browser: the swarm of Deadly Swarm, Moon Ray and Sun Ray with the particles along a ray (Cold Ray, Acid Spray), Star Burst (fire), Fantastic Freeze (a cloud),
 * the landing of a meteor, the fade of the snakes, and the red and the yellow flower. A monster is put in front of the camera and the same calls are made that `Game.launchPartyShots` makes.
 *
 * Usage: GAME_URL=http://localhost:<port>/ npx tsx tools/dev/check-bugfix81.ts <screenshot folder> [what,what,...]   (needs a dev server and Chrome)
 * `what`: swarm, moon, sun, cold, acid, burst, freeze, meteor, snakes, flowers (all by default)
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
import sharp from "sharp";

const base = process.env.GAME_URL ?? "http://localhost:5181/";
const outDir = process.argv[2] ?? "bugfix81-shots";
const wanted = (process.argv[3] ?? "swarm,moon,sun,cold,acid,burst,freeze,meteor,snakes,flowers").split(",");
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
  const spot = await evalJs<{ x: number; y: number }>(
    `(() => { const g = __game.game; const w = g.world; const p = g.player; for (let r = 0; r < 40; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const x = p.tx + dx, y = p.ty + dy; if (w.isLandWalkable && w.isLandWalkable(x, y)) return { x, y }; } return { x: p.tx, y: p.ty }; })()`,
  ).catch(() => ({ x: 0, y: 0 }));
  await evalJs(`(async () => { const g = __game; ${spot.x || spot.y ? `g.teleport(${spot.x}, ${spot.y}, "N");` : ""} await new Promise((r) => setTimeout(r, 1500)); g.game.internals.monsters.clear(); })()`);
  // two monsters in a line, 2 and 3 tiles ahead
  await evalJs(`(async () => { const g = __game; const cam = g.camera; const m = g.game.internals.monsters; await m.add("m", ${monster}, cam.position.x, cam.position.y - 1.7, cam.position.z + 6); await m.add("n", ${monster}, cam.position.x, cam.position.y - 1.7, cam.position.z + 9); })()`);
  await sleep(1500);
  await evalJs(`__game.scene.animationGroups.forEach((g) => g.pause())`);
  const clip = { x: 240, y: 60, width: 800, height: 600 };
  const shoot = async (name: string, call: string, waits: number[]) => {
    const frames: Buffer[] = [];
    await evalJs(`(() => { const i = __game.game.internals; const cam = __game.camera.position; const from = { x: cam.x, y: cam.y - 0.5, z: cam.z + 0.9 }; const spot = i.monsters.hitSpot("m"); const at = i.monsters.anchor("m"); const far = i.monsters.anchor("n"); const P = i.projectiles, E = i.effects; ${call} })()`);
    let last = 0;
    for (const w of waits) {
      await sleep(w - last);
      last = w;
      frames.push((await page.screenshot({ clip })) as Buffer);
    }
    await sharp({ create: { width: frames.length * 802, height: 600, channels: 3, background: "#222" } })
      .composite(frames.map((input, i) => ({ input, left: i * 802, top: 0 })))
      .png()
      .toFile(join(outDir, `${name}.png`));
    await sleep(2800);
  };
  const jobs: Record<string, [string, number[]]> = {
    swarm: ["P.swarm({ x: spot.x, y: spot.y, z: spot.z }, 5); const s2 = i.monsters.hitSpot('n'); P.swarm({ x: s2.x, y: s2.y, z: s2.z }, 5);", [100, 700, 1500, 2300]],
    moon: ["P.beam('magic', from, at, true, { look: { color: [0.72, 0.5, 1], core: [1, 0.95, 1], width: 2 } }); P.beam('magic', from, far, true, { look: { color: [0.72, 0.5, 1], core: [1, 0.95, 1], width: 2 }, particles: false });", [60, 250, 500]],
    sun: ["P.beam('fire', from, at, true, { look: { color: [1, 0.5, 0.06], core: [1, 0.78, 0.38], width: 2 } });", [60, 250, 500]],
    cold: ["P.beam('ice', from, at, true);", [60, 250, 500]],
    acid: ["P.beam('acid', from, at, true);", [60, 250, 500]],
    burst: ["E.fireNova({ x: cam.x, y: cam.y, z: cam.z }, 9); P.impactAt('fire', at);", [80, 300, 600]],
    freeze: ["E.cloud({ x: cam.x, y: cam.y, z: cam.z }, 7.5, [0.55, 0.8, 1]); P.impactAt('ice', at);", [200, 800, 1600]],
    meteor: ["E.meteorImpact(at, spot.floor); E.impact('fire', at);", [100, 500, 1200, 2000]],
    snakes: ["P.snakes({ x: spot.x, y: spot.floor, z: spot.z }, from);", [150, 500, 1000, 1500]],
  };
  for (const name of wanted) {
    const job = jobs[name];
    if (job) await shoot(name, job[0], job[1]);
  }
  if (wanted.includes("flowers")) {
    // the flowers close to the camera, from the showcase models: red and yellow side by side
    await evalJs(`(() => { const i = __game.game.internals; const cam = __game.camera.position; i.monsters.clear(); i.props.setInstances("check81", [ { model: "obj_flower_red", x: cam.x - 0.5, y: cam.y - 1.7, z: cam.z + ${process.env.FZ ?? "2.5"}, rotY: 0, rotX: 0, rotZ: 0, scale: ${process.env.FS ?? "1.05"} }, { model: "obj_flower_yellow", x: cam.x + 0.5, y: cam.y - 1.7, z: cam.z + ${process.env.FZ ?? "2.5"}, rotY: 0.6, rotX: 0, rotZ: 0, scale: ${process.env.FS ?? "1.05"} } ]); i.props.flush(); })()`);
    await sleep(2000);
    await page.screenshot({ path: join(outDir, "flowers.png"), clip });
  }
} finally {
  await browser.close();
}
