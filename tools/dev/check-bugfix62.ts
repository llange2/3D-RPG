/**
 * Browser check of bug_fix_62 (needs a dev server, `VITE_FROZEN=1 VITE_PORT=<free port> npx vite --port <free port> --strictPort`):
 *   models   the Evil Paladin (54, Draconi's sword and the Castle Guard's shield) and the Evil Wizard (79), in front, resting and in their attack clip
 *
 * Usage: GAME_URL=http://localhost:<port>/ npx tsx tools/dev/check-bugfix62.ts <screenshot folder> models
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
import sharp from "sharp";

const base = process.env.GAME_URL ?? "http://localhost:5201/";
const outDir = process.argv[2] ?? "bugfix62-shots";
const part = process.argv[3] ?? "models";
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
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(`[pageerror] ${(e as Error).message}`));
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`[console error] ${m.text().slice(0, 300)}`);
  });
  const evalJs = <T>(code: string) => page.evaluate(code) as Promise<T>;
  await page.goto(`${base}?seed=test&autostart=1&outside=1`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction("window.__game && window.__game.state", { timeout: 60000 });
  await sleep(4000);
  // a spot of open ground: the nearest tile to the start with no tree, mountain or water within two tiles (the camera stood inside a tree at 60/40)
  const spot = await evalJs<{ x: number; y: number }>(`(() => { const g = __game.game; const w = g.world; const p = g.player; for (let r = 0; r < 40; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; let ok = true; for (let ky = -2; ky <= 6 && ok; ky++) for (let kx = -2; kx <= 2 && ok; kx++) { const t = w.tile(p.tx + dx + kx, p.ty + dy + ky); if (t.deco !== 0 || t.ground !== w.tile(p.tx, p.ty).ground || t.poiId !== null) ok = false; } if (ok) return { x: p.tx + dx, y: p.ty + dy }; } return { x: p.tx, y: p.ty }; })()`);
  console.log("spot", spot);
  await evalJs(`(async () => { const g = __game; g.teleport(${spot.x}, ${spot.y}, "N"); await new Promise((r) => setTimeout(r, 1500)); g.game.internals.monsters.clear(); })()`);
  if (part === "models") {
    for (const [id, name] of [[54, "paladin"], [79, "wizard"]] as const) {
      for (const dist of [3.2, 5.5]) {
        await evalJs(`(async () => { const g = __game; const cam = g.camera; await g.game.internals.monsters.add("m", ${id}, cam.position.x, cam.position.y - 1.7, cam.position.z + ${dist}); })()`);
        await sleep(900);
        await page.screenshot({ path: join(outDir, `${name}-${dist}-rest.png`) });
        await evalJs(`__game.game.internals.monsters.attack("m")`);
        for (const t of [250, 250, 250]) {
          await sleep(t);
          await page.screenshot({ path: join(outDir, `${name}-${dist}-attack-${t}-${Date.now() % 100000}.png`) });
        }
        await evalJs(`__game.game.internals.monsters.remove("m")`);
      }
    }
  }
  if (part === "attack") {
    // the attack clip of each model as a strip of frames: does it keep its face to the party?
    for (const [id, name] of [[54, "paladin"], [79, "wizard"]] as const) {
      await evalJs(`(async () => { const g = __game; const cam = g.camera; await g.game.internals.monsters.add("m", ${id}, cam.position.x, cam.position.y - 1.7, cam.position.z + 3.6); })()`);
      await sleep(900);
      await evalJs(`__game.game.internals.monsters.attack("m")`);
      const frames: Buffer[] = [];
      for (let i = 0; i < 10; i++) {
        frames.push((await page.screenshot({ clip: { x: 440, y: 220, width: 400, height: 400 } })) as Buffer);
        await sleep(110);
      }
      await evalJs(`__game.game.internals.monsters.remove("m")`);
      const comps = await Promise.all(frames.map(async (f, i) => ({ input: await sharp(f).resize(240, 240).png().toBuffer(), left: (i % 5) * 242, top: Math.floor(i / 5) * 242 })));
      await sharp({ create: { width: 5 * 242, height: 2 * 242, channels: 3, background: "#222" } }).composite(comps).png().toFile(join(outDir, `strip-${name}.png`));
    }
  }
  if (part === "rings") {
    // Janso-San of the 58th playtest's save: Cooling Ring of the Warrior (+50 Strength) and Wardening Ring of the Thief (+15 Accuracy) worn, Healthy Ring of Accuracy in the backpack
    await evalJs(`(() => {
      const c = __game.state.party.characters[1];
      const ring = (name, bonus) => ({ id: "", material: 1, texture: "mm3_icon_33", value: 100, quest: false, spellId: 0, name, type: "ring", bonus });
      c.level = 40;
      c.inventory.left_ring = ring("Cooling Ring of the Warrior", { res_fire: 10, str: 50, int: -10, per: -10 });
      c.inventory.right_ring = ring("Wardening Ring of the Thief", { res_magic: 10, acc: 15, lck: 15 });
      c.inventory.slot1 = ring("Healthy Ring of Accuracy", { end: 10, spd: 10, acc: 15 });
      c.inventory.ranged_weapon = { id: "", material: 1, texture: "mm3_icon_33", value: 100, quest: false, spellId: 0, name: "Crossbow", type: "crossbow", bonus: { ranged_dam_min: 29, ranged_dam_max: 33 } };
      __game.game.refresh();
    })()`);
    await page.keyboard.press("c");
    await sleep(1200);
    await page.keyboard.press("2");
    await sleep(800);
    const slot = await evalJs<{ x: number; y: number } | null>(`(() => { const el = [...document.querySelectorAll(".slots .slot")][0]; if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    console.log("slot", slot);
    if (slot) {
      await page.mouse.move(slot.x, slot.y);
      await sleep(500);
      await page.screenshot({ path: join(outDir, "rings-plain.png") });
      await page.keyboard.down("Control");
      await sleep(500);
      await page.screenshot({ path: join(outDir, "rings-ctrl.png") });
      await page.keyboard.up("Control");
    }
  }
  console.log(problems.length ? problems.join("\n") : "no problems");
} finally {
  await browser.close();
}
