/**
 * Renders every monster model once, from the front of the party, and writes contact sheets of 20 (5 x 4) with the monster
 * id in the corner. Looking at them is the only way to see whether a model faces the party or shows its back: the facing
 * of the 91 models is not in any data file (it was wrong for all of them once).
 *
 * Usage: tsx tools/dev/monster-sheet.ts <outDir>      (needs the dev server and Chrome)
 */
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
import sharp from "sharp";

const outDir = process.argv[2];
if (!outDir) throw new Error("usage: monster-sheet <outDir>");
mkdirSync(outDir, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: ["--window-size=1280,720", "--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-webgl"],
  defaultViewport: { width: 1280, height: 720 },
});
try {
  const page = await browser.newPage();
  await page.goto(`${process.env.GAME_URL ?? "http://localhost:5173/"}?seed=test&autostart=1&outside=1`, { waitUntil: "load" });
  await page.waitForFunction("window.__game && window.__game.state", { timeout: 60000 });
  await sleep(2500);
  await page.evaluate(async () => {
    const g = (window as any).__game;
    g.teleport(60, 40, "N");
    await new Promise((r) => setTimeout(r, 1200));
    g.game.internals.monsters.clear();
  });
  const info = JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "public", "assets", "models.monsters.json"), "utf-8")) as Record<string, unknown>;
  const ids = Object.keys(info).map(Number).sort((a, b) => a - b);
  const tiles: { id: number; png: Buffer }[] = [];
  for (const id of ids) {
    await page.evaluate(async (id) => {
      const g = (window as any).__game;
      const cam = g.camera;
      await g.game.internals.monsters.add("m", id, cam.position.x, cam.position.y - 1.7, cam.position.z + 4.2);
    }, id);
    await sleep(450);
    const png = (await page.screenshot({ clip: { x: 440, y: 180, width: 400, height: 400 } })) as Buffer;
    await page.evaluate(() => (window as any).__game.game.internals.monsters.remove("m"));
    tiles.push({ id, png });
  }
  for (let s = 0; s * 20 < tiles.length; s++) {
    const part = tiles.slice(s * 20, s * 20 + 20);
    const comps: { input: Buffer; left: number; top: number }[] = [];
    for (let i = 0; i < part.length; i++) {
      const left = (i % 5) * 302;
      const top = Math.floor(i / 5) * 302;
      const label = Buffer.from(`<svg width="70" height="30"><rect width="70" height="30" fill="#000a"/><text x="6" y="22" font-size="22" fill="#fff" font-family="Arial">${part[i]!.id}</text></svg>`);
      comps.push({ input: await sharp(part[i]!.png).resize(300, 300).png().toBuffer(), left, top }, { input: label, left, top });
    }
    const file = join(outDir, `monsters_${s}.png`);
    await sharp({ create: { width: 5 * 302, height: 4 * 302, channels: 3, background: "#222" } }).composite(comps).png().toFile(file);
    console.log("wrote", file);
  }
} finally {
  await browser.close();
}
