/**
 * Looks at the first screen of the game (`index.html`: the logo clip, "Game is loading…" and the percentage). The clip plays once and stays on its last picture.
 * Needs a dev server (`VITE_FROZEN=1 VITE_PORT=<free port> npx vite --port <free port> --strictPort`).
 *
 * Usage: GAME_URL=http://localhost:<port>/ npx tsx tools/dev/check-boot.ts <folder>
 * Shots: `<folder>/boot-<n>.png`. The game's own start is held back (the page's script is blocked), so that the screen stays for as long as the clip takes.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const base = process.env.GAME_URL ?? "http://localhost:5173/";
const [outDir = "boot-shots"] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: ["--window-size=1280,720", "--autoplay-policy=no-user-gesture-required"],
  defaultViewport: { width: 1280, height: 720 },
});
try {
  const page = await browser.newPage();
  // the game's module is held back: the boot message is all there is
  await page.setRequestInterception(true);
  page.on("request", (r) => (r.url().includes("/src/game/main.ts") ? void r.abort() : void r.continue()));
  await page.goto(base, { waitUntil: "load", timeout: 60000 });
  await page.evaluate(`window.__boot.set(0.42)`);
  for (let n = 0; n < 4; n++) {
    await sleep(n === 0 ? 300 : 1700);
    const state = await page.evaluate(`(() => { const v = document.querySelector("#boot video"); return v ? { t: +v.currentTime.toFixed(2), ended: v.ended, loop: v.loop, paused: v.paused, w: v.videoWidth, bg: getComputedStyle(document.getElementById("boot")).backgroundColor, color: getComputedStyle(document.querySelector("#boot .text")).color } : null; })()`);
    console.log(n, JSON.stringify(state));
    await page.screenshot({ path: join(outDir, `boot-${n}.png`) });
  }
} finally {
  await browser.close();
}
