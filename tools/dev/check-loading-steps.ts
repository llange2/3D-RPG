/**
 * Writes down every number the loading screen shows while a new game starts and the party leaves Starthaven, with the time (54th playtest, point 5: the screen
 * showed only 0 %, 60 % and 100 %). Needs the dev server and Chrome, like check:render.
 *
 * Usage: tsx tools/dev/check-loading-steps.ts [size] [url]      (default size small, url http://localhost:5173/; GAME_URL names the server too)
 */
import puppeteer from "puppeteer-core";

const size = process.argv[2] ?? "small";
const base = process.argv[3] ?? process.env.GAME_URL ?? "http://localhost:5173/";
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
  await page.evaluateOnNewDocument(`
    window.__events = [];
    const t0 = performance.now();
    window.__downs = 0;
    const watch = () => {
      const pct = document.querySelector(".loading .percent");
      const el = document.querySelector(".loading");
      if (!pct || !el) return requestAnimationFrame(watch);
      // what the screen shows is what the player sees: the text of the number, each change with its time
      new MutationObserver(() => window.__events.push(Math.round(performance.now() - t0) + " ms  " + pct.textContent)).observe(pct, { childList: true, characterData: true, subtree: true });
      let up = el.classList.contains("on");
      new MutationObserver(() => {
        const now = el.classList.contains("on") && !el.classList.contains("out");
        if (now !== up) { up = now; window.__events.push(Math.round(performance.now() - t0) + " ms  --- screen " + (now ? "up" : "down")); if (!now) window.__downs++; }
      }).observe(el, { attributes: true, attributeFilter: ["class"] });
    };
    watch();
  `);
  await page.goto(`${base}?seed=loading-check&autostart=1&size=${size}`, { waitUntil: "load", timeout: 120000 });
  await page.waitForFunction("window.__game && window.__game.state && window.__game.state.at.mode === 'interior'", { timeout: 240000 });
  // the first screen (the game start) has come up and gone down again
  await page.waitForFunction("window.__downs >= 1 && !window.__game.game.ui.loading.active", { timeout: 240000 });
  await sleep(1200);
  await page.evaluate("window.__events.push('--- the party leaves Starthaven')");
  await page.evaluate("window.__game.leave()");
  await page.waitForFunction("window.__downs >= 2", { timeout: 240000 });
  await sleep(1000);
  const events = (await page.evaluate("window.__events")) as string[];
  for (const e of events) console.log(e);
  const numbers = new Set(events.filter((e) => e.includes("%")).map((e) => e.split("  ")[1]));
  console.log(`\n${numbers.size} different numbers shown in all`);
} finally {
  await browser.close();
}
