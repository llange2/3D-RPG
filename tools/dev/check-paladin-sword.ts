/**
 * Tunes how the Evil Paladin holds his sword (63rd playtest): puts the sword's blade along a direction given in the camera's screen frame (x right, y up, z away from the viewer) with a roll
 * about the blade, the grip in the palm shifted by `PALM_SHIFT` (centimetres in the hand joint's frame, along the fingers / across / out of the palm), takes a screenshot of the Paladin from the front and
 * prints the local rotation (a quaternion in the hand joint's frame) and the position that gave it, for `MIXAMO_GRIP` in `render/equipment.ts`.
 *
 * Usage: GAME_URL=http://localhost:<port>/ DIR=0.75,0.66,0 ROLL=0 PALM_SHIFT=0,0,0 npx tsx tools/dev/check-paladin-sword.ts <screenshot folder> <name>
 *        (without DIR the sword stays as the game puts it; needs a dev server and Chrome)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
import sharp from "sharp";

const base = process.env.GAME_URL ?? "http://localhost:5201/";
const outDir = process.argv[2] ?? "paladin-shots";
const name = process.argv[3] ?? "try";
const dir = (process.env.DIR ?? "").split(",").map(Number);
const roll = Number(process.env.ROLL ?? "0");
const shifts = (process.env.PALM_SHIFT ?? "0,0,0").split(";").map((t) => t.split(",").map(Number));
const zoom = process.env.ZOOM === "1";
const distance = Number(process.env.DISTANCE ?? "3.2");
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
  await evalJs(`(async () => { const g = __game; const cam = g.camera; await g.game.internals.monsters.add("m", 54, cam.position.x, cam.position.y - 1.7, cam.position.z + ${distance}); })()`);
  await sleep(1200);
  // the idle clip moves the arm between two shots: stop it where it is
  await evalJs(`__game.scene.animationGroups.forEach((g) => g.pause())`);
  await sleep(200);
  const apply = async (shift: number[]) => {
  if (dir.length === 3) {
    const result = await evalJs<string>(`(() => {
      const scene = __game.scene;
      const sword = scene.meshes.find((m) => m.name.startsWith("m:right:") && m.getTotalVertices() > 0);
      if (!sword) return "no sword mesh";
      const joint = sword.parent;
      const Q = sword.rotationQuaternion.constructor;
      const V = sword.position.constructor;
      const cam = __game.camera;
      const cm = cam.getWorldMatrix();
      const col = (i) => new V(cm.m[i], cm.m[i + 4], cm.m[i + 8]).normalize();
      const right = col(0), up = col(1), fwd = col(2);
      const D = right.scale(${dir[0]}).add(up.scale(${dir[1]})).add(fwd.scale(${dir[2]})).normalize();
      // the joint's world matrix mirrors (negative scale: glTF is mirrored in x here), so the direction goes through its inverse, not through a decomposed rotation
      const jm = joint.computeWorldMatrix(true);
      const inv = jm.clone().invert();
      const v = V.TransformNormal(D, inv).normalize();
      const q1 = Q.FromUnitVectorsToRef(new V(0, 1, 0), v, new Q());
      const rl = Q.RotationAxis(v, ${roll} * Math.PI / 180).multiply(q1);
      rl.normalize();
      const s = new V(0, 0, 0); const jq = new Q(); const jp = new V(0, 0, 0);
      jm.decompose(s, jq, jp);
      // grip in the palm: the grip (item y = -0.78, scale 0.4) at the palm (0, 0.06, 0) in metres plus the shift
      const unit = 0.01;
      const palm = new V(${shift[0]} * unit, (6 + ${shift[1]}) * unit, ${shift[2]} * unit);
      const along = new V(0, 0.78 * 0.4, 0).rotateByQuaternionToRef(rl, new V(0, 0, 0));
      const pos = palm.add(along);
      sword.rotationQuaternion = rl;
      sword.position.copyFrom(pos);
      return JSON.stringify({ rl: [rl.x, rl.y, rl.z, rl.w].map((v) => Number(v.toFixed(4))), pos: [pos.x, pos.y, pos.z].map((v) => Number(v.toFixed(4))), jq: [jq.x, jq.y, jq.z, jq.w].map((v) => Number(v.toFixed(3))), scale: [s.x, s.y, s.z].map((v) => Number(v.toFixed(3))) });
    })()`);
    console.log(result);
    await sleep(300);
  } else {
    const info = await evalJs<string>(`(() => { const sword = __game.scene.meshes.find((m) => m.name.startsWith("m:right:") && m.getTotalVertices() > 0); const q = sword.rotationQuaternion; return JSON.stringify({ q: [q.x, q.y, q.z, q.w], p: [sword.position.x, sword.position.y, sword.position.z], s: sword.scaling.x }); })()`);
    console.log("as the game puts it", info);
  }
  };
  const frames: Buffer[] = [];
  for (const shift of shifts) {
    await apply(shift);
    const clip = zoom ? { x: 480, y: 380, width: 200, height: 140, scale: 3 } : { x: 340, y: 150, width: 600, height: 500 };
    frames.push((await page.screenshot({ clip })) as Buffer);
  }
  if (frames.length === 1) writeFileSync(join(outDir, `${name}.png`), frames[0]!);
  else {
    const w = zoom ? 600 : 600;
    const h = zoom ? 420 : 500;
    const cols = Math.min(2, frames.length);
    const rows = Math.ceil(frames.length / cols);
    await sharp({ create: { width: cols * (w + 2), height: rows * (h + 2), channels: 3, background: "#222" } })
      .composite(frames.map((input, i) => ({ input, left: (i % cols) * (w + 2), top: Math.floor(i / cols) * (h + 2) })))
      .png()
      .toFile(join(outDir, `${name}.png`));
  }
} finally {
  await browser.close();
}
