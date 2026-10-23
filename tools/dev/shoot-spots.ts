/**
 * Screenshots of the game at given spots. Needs a frozen dev server on 5175 (VITE_FROZEN=1 VITE_PORT=5175 npx vite --port 5175 --strictPort)
 * and Chrome.
 *
 * Usage: tsx tools/dev/shoot-spots.ts <url-query> <poi id or -> <outPrefix> x,y,F [x,y,F ...]
 */
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import puppeteer from "puppeteer-core";

const [query, poi, prefix, ...spots] = process.argv.slice(2);
mkdirSync(dirname(prefix!), { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: ["--window-size=1280,720", "--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-webgl", "--autoplay-policy=no-user-gesture-required"],
  defaultViewport: { width: 1280, height: 720 },
});
try {
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.log("[pageerror]", (e as Error).message));
  await page.goto(`http://localhost:5175/?autostart=1&${query}`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction("window.__game !== undefined", { timeout: 60000 });
  await sleep(3000);
  if (poi !== "-") {
    await page.evaluate(`(async () => { await __game.enter(${JSON.stringify(poi)}); })()`);
    await sleep(2500);
  }
  let i = 0;
  for (const s of spots) {
    const [x, y, f] = s.split(",");
    await page.evaluate(`__game.teleport(${x}, ${y}, ${JSON.stringify(f)})`);
    await sleep(1500);
    await page.screenshot({ path: `${prefix}-${i++}.png` });
  }
} finally {
  await browser.close();
}
