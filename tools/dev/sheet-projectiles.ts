/**
 * Contact sheet of the six projectiles in flight, seen from the side (needs the dev server and Chrome). Each kind flies
 * across the picture from left to right; the shot is taken half way. Use it to check that the models point the way they
 * fly: the arrow's tip, the tail of the fireball and the icicle must trail behind.
 *
 * Usage: tsx tools/dev/sheet-projectiles.ts <outDir> [url]
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
import sharp from "sharp";

const outDir = process.argv[2];
if (!outDir) throw new Error("usage: tsx tools/dev/sheet-projectiles.ts <outDir> [url]");
const base = process.argv[3] ?? "http://localhost:5173/";
mkdirSync(outDir, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const kinds = ["arrow", "fire", "ice", "magic", "physical", "acid"];

const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: ["--window-size=1280,720", "--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-webgl"],
  defaultViewport: { width: 1280, height: 720 },
});
try {
  const page = await browser.newPage();
  await page.goto(`${base}?autostart=1&outside=1&seed=test`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction("window.__game !== undefined", { timeout: 60000 });
  await sleep(3000);
  // the open meadow around the start: daylight, nothing in the way
  const tiles: Buffer[] = [];
  for (const kind of kinds) {
    // 12 tiles of flight take 1.56 s; across the view 6 units in front of the camera
    await page.evaluate(`(() => {
      const g = __game.game.internals;
      const c = g.r.camera.position;
      g.projectiles.launch(${JSON.stringify(kind)}, { x: c.x - 9, y: c.y - 0.5, z: c.z + 7 }, { x: c.x + 27, y: c.y - 0.5, z: c.z + 7 });
    })()`);
    await sleep(380);
    const shot = (await page.screenshot({ clip: { x: 440, y: 290, width: 400, height: 200 } })) as Buffer;
    tiles.push(Buffer.from(await sharp(shot).png().toBuffer()));
    await sleep(1500);
  }
  const sheet = sharp({ create: { width: 1200, height: 400, channels: 3, background: "#222" } }).composite(tiles.map((input, i) => ({ input, left: (i % 3) * 400, top: Math.floor(i / 3) * 200 })));
  await sheet.png().toFile(join(outDir, "projectiles.png"));
  console.log("saved", join(outDir, "projectiles.png"), "order:", kinds.join(", "));
} finally {
  await browser.close();
}
