/**
 * 60th playtest, point 2: the big map zoomed out must not show lines over shallow water. Draws the overworld map in the page at a fractional cell size, once with the old veil (a translucent
 * rectangle at the fractional position of the cell) and once with the new one (`MinimapIcons.drawVeil`, whole pixels), over the stretch of the world with the most shallow water, and counts the
 * pixels of the shallow water that are darker than their neighbours' mean (the seams). Needs a dev server and Chrome.
 *
 * Usage: GAME_URL=http://localhost:<port>/ npx tsx tools/dev/check-map-water.ts <outDir> [cells]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const base = process.env.GAME_URL ?? "http://localhost:5173/";
const outDir = process.argv[2];
if (!outDir) throw new Error("usage: tsx tools/dev/check-map-water.ts <outDir> [cells]");
const cells = Number(process.argv[3] ?? 37);
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
  page.on("pageerror", (e) => console.log(`[pageerror] ${(e as Error).message}`));
  await page.goto(`${base}?autostart=1&outside=1&seed=pearl-shore-794&size=default&dungeons=default`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction("window.__game !== undefined", { timeout: 60000 });
  await sleep(3000);
  await page.waitForFunction(`!document.querySelector(".loading.on")`, { timeout: 90000 });
  const result = (await page.evaluate(`(async () => {
    const g = __game.game;
    const mm = await import("/src/game/minimap.ts");
    const mi = await import("/src/game/minimapIcons.ts");
    const types = await import("/src/world/types.ts");
    const icons = await mi.MinimapIcons.load();
    const world = g.world;
    // the stretch with the most shallow water
    let best = { n: -1, x: 0, y: 0 };
    for (let y = ${cells}; y < world.height - ${cells}; y += 9) {
      for (let x = ${cells}; x < world.width - ${cells}; x += 9) {
        let n = 0;
        for (let dy = -9; dy <= 9; dy += 3) for (let dx = -9; dx <= 9; dx += 3) if (world.tile(x + dx, y + dy).ground === types.GROUND.SHALLOW) n++;
        if (n > best.n) best = { n, x, y };
      }
    }
    const draw = (veil) => {
      const proto = mi.MinimapIcons.prototype;
      const keep = proto.drawVeil;
      if (veil === "old") proto.drawVeil = function (ctx, x, y, w) { ctx.fillStyle = "rgba(255,255,255,0.32)"; ctx.fillRect(x, y, w, w); };
      const canvas = document.createElement("canvas");
      canvas.width = 640; canvas.height = 640;
      mm.drawOverworldMap(canvas, world, g.state.explored, best.x, best.y, "N", [], ${cells}, true, { x: best.x, y: best.y }, icons);
      proto.drawVeil = keep;
      return canvas;
    };
    // seams: in the middle of a long run of shallow water, a pixel that is darker than the pixel two to either side of it, along a row or a column
    const seams = (canvas) => {
      const c = canvas.getContext("2d");
      const d = c.getImageData(0, 0, 640, 640).data;
      const lum = (x, y) => { const i = (y * 640 + x) * 4; return d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11; };
      let n = 0, total = 0;
      for (let y = 4; y < 636; y++) for (let x = 4; x < 636; x++) {
        const l = lum(x, y);
        // the shallow water's colour: light blue (high blue, green over red)
        const i = (y * 640 + x) * 4;
        if (!(d[i + 2] > 150 && d[i + 2] > d[i] + 40)) continue;
        total++;
        for (const [dx, dy] of [[1, 0], [0, 1]]) {
          const a = lum(x - 2 * dx, y - 2 * dy), b = lum(x + 2 * dx, y + 2 * dy);
          if (l < a - 6 && l < b - 6 && Math.abs(a - b) < 6) { n++; break; }
        }
      }
      return { n, total };
    };
    const oldCanvas = draw("old");
    const newCanvas = draw("new");
    return { at: best, old: seams(oldCanvas), now: seams(newCanvas), oldPng: oldCanvas.toDataURL("image/png"), newPng: newCanvas.toDataURL("image/png") };
  })()`)) as { at: unknown; old: { n: number; total: number }; now: { n: number; total: number }; oldPng: string; newPng: string };
  console.log("view:", JSON.stringify(result.at), "old veil seams:", JSON.stringify(result.old), "new veil seams:", JSON.stringify(result.now));
  writeFileSync(join(outDir, "map-old.png"), Buffer.from(result.oldPng.split(",")[1]!, "base64"));
  writeFileSync(join(outDir, "map-new.png"), Buffer.from(result.newPng.split(",")[1]!, "base64"));
} finally {
  await browser.close();
}
