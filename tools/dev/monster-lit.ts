/**
 * Puts every monster (or the given ids) in front of the party inside a generated dungeon, under the party's torch, and measures how
 * bright it comes out: the mean luma of the pixels the monster changes against the empty view. A model that is lit wrongly (normals turned
 * inside out, a missing texture) stays close to black while the walls around it are visible. Writes contact sheets of 20 like
 * `monster-sheet.ts` and prints the dark ones.
 *
 * Usage: tsx tools/dev/monster-lit.ts <outDir> [--ids=6,10,81] [--url=http://localhost:5174/] [--dist=4.5] [--seed=test]
 */
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
import sharp from "sharp";

const args = process.argv.slice(2);
const outDir = args[0];
if (!outDir) throw new Error("usage: monster-lit <outDir> [--ids=..] [--url=..]");
const opt = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const base = opt("url") ?? "http://localhost:5174/";
const seed = opt("seed") ?? "test";
const dist = Number(opt("dist") ?? 4.5);
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
  page.on("pageerror", (e) => console.log("[pageerror]", (e as Error).message));
  await page.goto(`${base}?seed=${seed}&autostart=1&outside=1`, { waitUntil: "load" });
  await page.waitForFunction("window.__game && window.__game.state", { timeout: 60000 });
  await sleep(2500);
  const poi = (await page.evaluate("window.__game.firstPoi('dungeon')")) as string | null;
  if (!poi) throw new Error("no dungeon found");
  await page.evaluate(async (id) => {
    await (window as any).__game.enter(id);
  }, poi);
  await sleep(1500);
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.game.internals.monsters.clear();
    g.game.internals.enc.monsters.length = 0;
  });
  const info = JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "public", "assets", "models.monsters.json"), "utf-8")) as Record<string, { fromObj?: boolean; mean?: number }>;
  const ids = opt("ids")?.split(",").map(Number) ?? Object.keys(info).map(Number).filter((n) => n < 1000).sort((a, b) => a - b);
  const clip = { x: 440, y: 180, width: 400, height: 400 };
  const shot = async () => (await page.screenshot({ clip })) as Buffer;
  const empty = await shot();
  const emptyRaw = await sharp(empty).raw().toBuffer({ resolveWithObject: true });
  const tiles: { id: number; png: Buffer; luma: number; pixels: number }[] = [];
  for (const id of ids) {
    await page.evaluate(
      async (id, dist) => {
        const g = (window as any).__game;
        const cam = g.camera;
        const yaw = cam.rotation.y;
        await g.game.internals.monsters.add("m", id, cam.position.x + Math.sin(yaw) * dist, cam.position.y - 1.7, cam.position.z + Math.cos(yaw) * dist);
      },
      id,
      dist,
    );
    await sleep(450);
    const png = await shot();
    await page.evaluate(() => (window as any).__game.game.internals.monsters.remove("m"));
    const raw = await sharp(png).raw().toBuffer({ resolveWithObject: true });
    let sum = 0;
    let n = 0;
    const ch = raw.info.channels;
    for (let i = 0; i < raw.data.length; i += ch) {
      const dr = Math.abs(raw.data[i]! - emptyRaw.data[i]!) + Math.abs(raw.data[i + 1]! - emptyRaw.data[i + 1]!) + Math.abs(raw.data[i + 2]! - emptyRaw.data[i + 2]!);
      if (dr < 30) continue;
      sum += (0.299 * raw.data[i]! + 0.587 * raw.data[i + 1]! + 0.114 * raw.data[i + 2]!) / 255;
      n++;
    }
    tiles.push({ id, png, luma: n > 0 ? sum / n : 0, pixels: n });
  }
  const names = JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "src", "data", "raw", "MONSTER_DATA.json"), "utf-8")) as Record<string, { name: string }>;
  for (const t of tiles) console.log(String(t.id).padStart(3), (names[String(t.id)]?.name ?? "?").padEnd(18), info[String(t.id)]?.fromObj ? "obj " : "glb ", "luma", t.luma.toFixed(3), "pixels", t.pixels);
  for (let s = 0; s * 20 < tiles.length; s++) {
    const part = tiles.slice(s * 20, s * 20 + 20);
    const comps: { input: Buffer; left: number; top: number }[] = [];
    for (let i = 0; i < part.length; i++) {
      const left = (i % 5) * 302;
      const top = Math.floor(i / 5) * 302;
      const label = Buffer.from(`<svg width="150" height="30"><rect width="150" height="30" fill="#000a"/><text x="6" y="22" font-size="20" fill="#fff" font-family="Arial">${part[i]!.id} ${part[i]!.luma.toFixed(2)}</text></svg>`);
      comps.push({ input: await sharp(part[i]!.png).resize(300, 300).png().toBuffer(), left, top }, { input: label, left, top });
    }
    const file = join(outDir, `lit_${s}.png`);
    await sharp({ create: { width: 5 * 302, height: 4 * 302, channels: 3, background: "#222" } }).composite(comps).png().toFile(file);
    console.log("wrote", file);
  }
} finally {
  await browser.close();
}
