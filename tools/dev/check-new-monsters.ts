/**
 * Looks at monsters in the debug showcase (the dark hall where every monster of the version stands on its own cell) from the cell three steps south of each, the way the party sees them, and
 * writes contact sheets of 12 (4 x 3) with the monster id in the corner. The way to see whether a model faces the party, how big it is next to a known monster and how it is lit.
 *
 * Usage: GAME_URL=http://localhost:<port>/ PACK=fantastic IDS=92,93,54 [DIST=3] [DX=0] npx tsx tools/dev/check-new-monsters.ts <outDir>   (needs a dev server and Chrome)
 * IDS defaults to every monster of the extension (92 to 116) and three of Classic to compare the size with (31 Goblin, 54 Evil Paladin, 3 Black Knight).
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
import sharp from "sharp";

const outDir = process.argv[2];
if (!outDir) throw new Error("usage: check-new-monsters <outDir>");
mkdirSync(outDir, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ids = (process.env.IDS ?? [...Array.from({ length: 25 }, (_, i) => 92 + i), 31, 54, 3].join(",")).split(",").map(Number);
const dist = Number(process.env.DIST ?? 3);
const dx = Number(process.env.DX ?? 0);

const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: ["--window-size=1280,720", "--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-webgl"],
  defaultViewport: { width: 1280, height: 720 },
});
try {
  const page = await browser.newPage();
  const problems: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warn") problems.push(`${m.type()}: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`pageerror: ${String(e)}`));
  const pack = process.env.PACK ? `&pack=${process.env.PACK}` : "";
  await page.goto(`${process.env.GAME_URL ?? "http://localhost:5173/"}?seed=test&autostart=1${pack}`, { waitUntil: "load" });
  await page.waitForFunction("window.__game && window.__game.state", { timeout: 90000 });
  // the new game begins in the street of Starthaven: wait until the town is in (the overworld's chunks are made when the party leaves it)
  await page.waitForFunction("window.__game.game.internals.interior", { timeout: 120000 });
  await sleep(6000);
  await page.evaluate(`(async () => { await __game.leave(); await __game.enter("showcase"); })()`);
  await sleep(7000);
  const spots = JSON.parse((await page.evaluate(`JSON.stringify(__game.game.internals.interior.map.showcase.monsters)`)) as string) as { defId: number; x: number; y: number }[];
  console.log(`showcase: ${spots.length} monsters`);
  // the hall is dark and its monsters stand in rows that hide each other: clear them and show one at a time in front of the party, the hall lit as by day (BRIGHT=0 leaves it dark)
  await page.evaluate(`(() => { __game.game.internals.monsters.clear(); if (${process.env.BRIGHT !== "0"}) __game.scene.lights.forEach((l) => { l.intensity = Math.max(l.intensity, 1.6); }); })()`);
  const tiles: { id: number; png: Buffer }[] = [];
  for (const id of ids) {
    await page.evaluate(
      `(async () => { const c = __game.camera; const f = { x: Math.sin(c.rotation.y), z: Math.cos(c.rotation.y) }; await __game.game.internals.monsters.add("m", ${id}, c.position.x + f.x * ${dist} + ${dx}, c.position.y - 1.7, c.position.z + f.z * ${dist}); })()`,
    );
    // WAIT=<ms> lets the monster stand (cold breath comes every five seconds: WAIT=5500 SHOTS=4 shows a cloud), SHOTS pictures of it 400 ms apart
    await sleep(Number(process.env.WAIT ?? 900));
    if (process.env.DEBUG_BREATH) {
      console.log(
        await page.evaluate(
          `JSON.stringify({ fx: typeof __game.game.internals.effects.breath, view: typeof __game.game.internals.monsters.breathers, level: __game.game.internals.effects.level, found: typeof __game.game.internals.monsters.breathers === "function" ? __game.game.internals.monsters.breathers({ ${id}: { z: 0.9, y: 0.3, size: 1 } }) : null })`,
        ),
      );
    }
    for (let n = 0; n < Number(process.env.SHOTS ?? 1); n++) {
      tiles.push({ id, png: (await page.screenshot({ clip: { x: 340, y: 110, width: 600, height: 500 } })) as Buffer });
      if (n > 0 || Number(process.env.SHOTS ?? 1) > 1) await sleep(400);
    }
    await page.evaluate(`__game.game.internals.monsters.remove("m")`);
  }
  for (let s = 0; s * 12 < tiles.length; s++) {
    const part = tiles.slice(s * 12, s * 12 + 12);
    const comps: { input: Buffer; left: number; top: number }[] = [];
    for (let i = 0; i < part.length; i++) {
      const left = (i % 4) * 402;
      const top = Math.floor(i / 4) * 342;
      const label = Buffer.from(`<svg width="70" height="30"><rect width="70" height="30" fill="#000a"/><text x="6" y="22" font-size="22" fill="#fff" font-family="Arial">${part[i]!.id}</text></svg>`);
      comps.push({ input: await sharp(part[i]!.png).resize(400, 340).png().toBuffer(), left, top }, { input: label, left, top });
    }
    const file = join(outDir, `new-monsters_${s}.png`);
    await sharp({ create: { width: 4 * 402, height: 3 * 342, channels: 3, background: "#222" } }).composite(comps).png().toFile(file);
    console.log("wrote", file);
  }
  console.log(problems.length ? problems.slice(0, 30).join("\n") : "no errors or warnings logged");
} finally {
  await browser.close();
}
