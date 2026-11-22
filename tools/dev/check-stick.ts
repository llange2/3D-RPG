/**
 * Tunes how the Evil Ranger (24) holds his staff (bug_fix_79): puts the staff (`wpn_stick`, 1.91 long, its middle at the origin, its long axis along y) into the right hand joint with its
 * middle at the palm plus a shift, its long axis along a direction given in the hand joint's frame, at a given item scale, and takes a screenshot of the Ranger from the front.
 * Several variants (separated by `;`, each `ax,ay,az:shiftX,shiftY,shiftZ:scale`, shift in centimetres) come out side by side in one picture. The printed quaternion and position are the
 * numbers for `MIXAMO_GRIP` in `render/equipment.ts`.
 *
 * Usage: GAME_URL=http://localhost:<port>/ VARIANTS="1,0,0:0,0,0:0.4;0,0,1:0,0,0:0.4" npx tsx tools/dev/check-stick.ts <screenshot folder> <name>
 *        (without VARIANTS the staff stays as the game puts it; needs a dev server and Chrome)
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
import sharp from "sharp";

const base = process.env.GAME_URL ?? "http://localhost:5179/";
const outDir = process.argv[2] ?? "stick-shots";
const name = process.argv[3] ?? "try";
const variants = (process.env.VARIANTS ?? "").split(";").filter((v) => v).map((v) => v.split(":").map((t) => t.split(",").map(Number)));
const distance = Number(process.env.DISTANCE ?? "4.2");
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
  const evalJs = <T>(code: string) => page.evaluate(code) as Promise<T>;
  await page.goto(`${base}?seed=test&autostart=1&outside=1`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction("window.__game && window.__game.state", { timeout: 60000 });
  await sleep(4000);
  const spot = await evalJs<{ x: number; y: number }>(`(() => { const g = __game.game; const w = g.world; const p = g.player; for (let r = 0; r < 40; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; let ok = true; for (let ky = -2; ky <= 6 && ok; ky++) for (let kx = -2; kx <= 2 && ok; kx++) { const t = w.tile(p.tx + dx + kx, p.ty + dy + ky); if (t.deco !== 0 || t.ground !== w.tile(p.tx, p.ty).ground || t.poiId !== null) ok = false; } if (ok) return { x: p.tx + dx, y: p.ty + dy }; } return { x: p.tx, y: p.ty }; })()`);
  await evalJs(`(async () => { const g = __game; g.teleport(${spot.x}, ${spot.y}, "N"); await new Promise((r) => setTimeout(r, 1500)); g.game.internals.monsters.clear(); })()`);
  await evalJs(`(async () => { const g = __game; const cam = g.camera; await g.game.internals.monsters.add("m", ${monster}, cam.position.x, cam.position.y - 1.7, cam.position.z + ${distance}); })()`);
  await sleep(1500);
  // the idle clip moves the arm between two shots: stop it where it is
  await evalJs(`__game.scene.animationGroups.forEach((g) => g.pause())`);
  await sleep(200);
  const clip = { x: 340, y: 60, width: 600, height: 600 };
  const frames: Buffer[] = [];
  const list = variants.length ? variants : [null];
  for (const v of list) {
    if (v) {
      const [axis, shift, scale] = v as [number[], number[], number[]];
      const result = await evalJs<string>(`(() => {
        const stick = __game.scene.meshes.find((m) => m.name.startsWith("m:right:") && m.getTotalVertices() > 0);
        if (!stick) return "no staff mesh";
        const Q = stick.rotationQuaternion.constructor;
        const V = stick.position.constructor;
        let to = new V(${axis[0]}, ${axis[1]}, ${axis[2]}).normalize();
        if (${process.env.SCREEN === "1"}) {
          // the axis is given in the camera's screen frame (x right, y up, z away); the joint's world matrix mirrors, so it goes through the inverse matrix
          const cm = __game.camera.getWorldMatrix();
          const col = (i) => new V(cm.m[i], cm.m[i + 4], cm.m[i + 8]).normalize();
          const D = col(0).scale(to.x).add(col(1).scale(to.y)).add(col(2).scale(to.z)).normalize();
          const inv = stick.parent.computeWorldMatrix(true).clone().invert();
          to = V.TransformNormal(D, inv).normalize();
        }
        const q = Q.FromUnitVectorsToRef(new V(0, 1, 0), to, new Q());
        const unit = 0.01;
        stick.rotationQuaternion = q;
        stick.position.set(${shift[0]} * unit, (6 + ${shift[1]}) * unit, ${shift[2]} * unit);
        stick.scaling.setAll(${scale[0]});
        return JSON.stringify({ rotation: [q.x, q.y, q.z, q.w].map((n) => Number(n.toFixed(4))), position: [stick.position.x, stick.position.y, stick.position.z].map((n) => Number((n / unit).toFixed(2))), scale: ${scale[0]} });
      })()`);
      console.log(result);
      await sleep(300);
    } else {
      console.log("as the game puts it", await evalJs<string>(`(() => { const s = __game.scene.meshes.find((m) => m.name.startsWith("m:right:") && m.getTotalVertices() > 0); if (!s) return "no staff mesh"; const q = s.rotationQuaternion; return JSON.stringify({ q: [q.x, q.y, q.z, q.w], p: [s.position.x, s.position.y, s.position.z], s: s.scaling.x }); })()`));
    }
    frames.push((await page.screenshot({ clip })) as Buffer);
  }
  const cols = Math.min(2, frames.length);
  const rows = Math.ceil(frames.length / cols);
  await sharp({ create: { width: cols * 602, height: rows * 602, channels: 3, background: "#222" } })
    .composite(frames.map((input, i) => ({ input, left: (i % cols) * 602, top: Math.floor(i / cols) * 602 })))
    .png()
    .toFile(join(outDir, `${name}.png`));
} finally {
  await browser.close();
}
