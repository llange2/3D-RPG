/**
 * 62nd playtest in the real browser (needs a dev server and Chrome):
 *   map    point 2: the big map at a cell size that keeps the grid, over the stretch with the most shallow water: the dark lines between the cells must stay dark under the veil
 *   swamp  point 1: a swamp island by day (and, for comparison, a meadow one) from the party's view
 *
 * Usage: GAME_URL=http://localhost:<port>/ npx tsx tools/dev/check-playtest62.ts <outDir> map|swamp [seed] [size]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const base = process.env.GAME_URL ?? "http://localhost:5173/";
const [outDir, mode = "map", seed = "pearl-shore-794", size = "default"] = process.argv.slice(2);
if (!outDir) throw new Error("usage: tsx tools/dev/check-playtest62.ts <outDir> map|swamp [seed] [size]");
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
  await page.goto(`${base}?autostart=1&outside=1&seed=${seed}&size=${size}&dungeons=default`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction("window.__game !== undefined", { timeout: 60000 });
  await sleep(3000);
  await page.waitForFunction(`!document.querySelector(".loading.on")`, { timeout: 90000 });

  if (mode === "map") {
    const cells = Number(process.env.CELLS ?? 25);
    const png = (await page.evaluate(`(async () => {
      const g = __game.game;
      const mm = await import("/src/game/minimap.ts");
      const mi = await import("/src/game/minimapIcons.ts");
      const types = await import("/src/world/types.ts");
      const icons = await mi.MinimapIcons.load();
      const world = g.world;
      let best = { n: -1, x: 0, y: 0 };
      for (let y = ${cells}; y < world.height - ${cells}; y += 9) {
        for (let x = ${cells}; x < world.width - ${cells}; x += 9) {
          let n = 0;
          for (let dy = -9; dy <= 9; dy += 3) for (let dx = -9; dx <= 9; dx += 3) if (world.tile(x + dx, y + dy).ground === types.GROUND.SHALLOW) n++;
          if (n > best.n) best = { n, x, y };
        }
      }
      // WHOLE=1: the whole world on one picture (the cell count is the width of the world), for the spread of the places
      if (${process.env.WHOLE ? 1 : 0}) best = { n: 0, x: Math.floor(world.width / 2), y: Math.floor(world.height / 2) };
      const canvas = document.createElement("canvas");
      canvas.width = 640; canvas.height = 640;
      mm.drawOverworldMap(canvas, world, g.state.explored, best.x, best.y, "N", [], ${cells}, true, { x: best.x, y: best.y }, icons);
      return canvas.toDataURL("image/png");
    })()`)) as string;
    writeFileSync(join(outDir, "map.png"), Buffer.from(png.split(",")[1]!, "base64"));
    console.log("saved map.png at", cells, "cells");
  } else {
    // the swamp island nearest to the start with a plain land tile that has land all round it
    const spots = (await page.evaluate(`(async () => {
      const types = await import("/src/world/types.ts");
      const w = __game.world;
      const found = { swamp: null, meadow: null };
      for (let y = 6; y < w.height - 6; y += 3) for (let x = 6; x < w.width - 6; x += 3) {
        const t = w.tile(x, y);
        if (t.ground !== types.GROUND.LAND || t.deco === types.DECO.TREE) continue;
        let ok = true;
        for (let dy = -3; dy <= 3 && ok; dy++) for (let dx = -3; dx <= 3; dx++) if (w.tile(x + dx, y + dy).biome !== t.biome || w.tile(x + dx, y + dy).ground !== types.GROUND.LAND) { ok = false; break; }
        if (!ok) continue;
        if (t.biome === types.BIOME.SWAMP && !found.swamp) found.swamp = { x, y };
        if (t.biome === types.BIOME.MEADOW && !found.meadow) found.meadow = { x, y };
      }
      return found;
    })()`)) as { swamp: { x: number; y: number } | null; meadow: { x: number; y: number } | null };
    console.log("spots", JSON.stringify(spots));
    for (const [name, at] of Object.entries(spots)) {
      if (!at) continue;
      await page.evaluate(`(() => { const p = __game.state.party; p.minutes = ${24 * 60 + 12 * 60}; __game.teleport(${at.x}, ${at.y}, "N"); })()`);
      await sleep(2500);
      await page.evaluate(`(() => { const p = __game.state.party; p.minutes = ${24 * 60 + 12 * 60}; __game.game.refresh(); })()`);
      await sleep(1500);
      await page.screenshot({ path: join(outDir, `${name}.png`) });
      const rgb = (await page.evaluate(`(() => {
        const c = document.createElement("canvas"); const v = document.getElementById("view"); c.width = 64; c.height = 64;
        return null;
      })()`)) as null;
      void rgb;
    }
  }
} finally {
  await browser.close();
}
