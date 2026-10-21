/**
 * Screenshots of the overworld's tile models from a raised camera: one tree tile and one mountain tile per biome, in both ground modes
 * ("3D" = old ground models, "flat" = painted tiles). It shows what lies under and around the models (the base quad, the slabs).
 *
 * Usage: tsx tools/dev/tile-sheet.ts <out-dir> [--url=http://localhost:5174/] [--seed=test] [--only=tree:meadow,mountain:snow] [--modes=3d,flat]
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const args = process.argv.slice(2);
const outDir = args[0] ?? ".";
const opt = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const base = opt("url") ?? "http://localhost:5174/";
const seed = opt("seed") ?? "test";
const only = opt("only")?.split(",");
const modes = (opt("modes") ?? "3d,flat").split(",");
// biome numbers of src/world/types.ts
const CASES: { kind: "tree" | "mountain"; biome: number; name: string }[] = [
  { kind: "tree", biome: 0, name: "meadow" },
  { kind: "tree", biome: 1, name: "forest" },
  { kind: "tree", biome: 3, name: "snow" },
  { kind: "tree", biome: 2, name: "desert" },
  { kind: "tree", biome: 4, name: "swamp" },
  { kind: "mountain", biome: 0, name: "meadow" },
  { kind: "mountain", biome: 3, name: "snow" },
  { kind: "mountain", biome: 2, name: "desert" },
  { kind: "mountain", biome: 4, name: "swamp" },
  { kind: "mountain", biome: 5, name: "lava" },
];

/** Runs in the page: finds a lone tile of the kind, puts the party beside it and looks at it from a raised camera. */
const FIND = (kind: string, biome: number) => `(() => {
  const g = window.__game;
  const w = g.world;
  const start = w.startPosition();
  const isIt = (x, y) => {
    const t = w.tile(x, y);
    return "${kind}" === "tree" ? t.deco === 1 && t.biome === ${biome} && t.ground === 0 : t.ground === 3 && t.biome === ${biome};
  };
  const free = (x, y) => { const t = w.tile(x, y); return t.ground === 0 && t.deco === 0; };
  for (let r = 1; r < 400; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = start.x + dx, y = start.y + dy;
        if (!isIt(x, y)) continue;
        // alone with free ground in front and to the sides, so the slab's edges can be seen
        if (!free(x, y + 1) || !free(x, y + 2) || !free(x - 1, y) || !free(x + 1, y) || !free(x, y - 1)) continue;
        g.teleport(x, y + 2, "N");
        const scene = g.scene;
        const main = scene.activeCamera;
        const V = main.position.constructor;
        const cam = scene.getCameraByName("dbg") ?? new main.constructor("dbg", main.position.clone(), scene);
        if (!window.__dbgOn) {
          window.__dbgOn = true;
          scene.onBeforeRenderObservable.add(() => {
            const p = main.position;
            cam.position.set(p.x + 3.5, 4.2, p.z - 1.5);
            cam.setTarget(new V(p.x, 0.5, p.z + 3));
          });
          cam.fov = 1.0;
          scene.activeCamera = cam;
        }
        return { x, y };
      }
    }
  }
  return null;
})()`;

mkdirSync(outDir, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: ["--window-size=1280,720", "--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-webgl"],
  defaultViewport: { width: 1280, height: 720 },
});
try {
  for (const mode of modes) {
    const page = await browser.newPage();
    // the setting is read at start: floorModel true = 3D ground, false = painted tiles
    await page.evaluateOnNewDocument((v: string) => localStorage.setItem("mm3-seed-rpg:settings:v1", v), JSON.stringify({ floorModel: mode === "3d" }));
    await page.goto(`${base}?autostart=1&seed=${seed}`, { waitUntil: "load", timeout: 60000 });
    await page.waitForFunction("window.__game !== undefined", { timeout: 60000 });
    await new Promise((r) => setTimeout(r, 5000));
    for (const c of CASES) {
      const id = `${c.kind}:${c.name}`;
      if (only && !only.includes(id)) continue;
      const at = await page.evaluate(FIND(c.kind, c.biome));
      if (!at) {
        console.log(`${mode} ${id}: no tile found`);
        continue;
      }
      await new Promise((r) => setTimeout(r, 2500));
      const file = join(outDir, `${mode}-${c.kind}-${c.name}.png`);
      await page.screenshot({ path: file });
      console.log(`${mode} ${id}: ${JSON.stringify(at)} -> ${file}`);
    }
    await page.close();
  }
} finally {
  await browser.close();
}
