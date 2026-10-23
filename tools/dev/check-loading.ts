/**
 * Watches the loading screen while a new game starts in Starthaven and the party leaves the town (needs the dev server and Chrome, like
 * check:render). Every change of the picture, every time the screen goes up or down and every frame of the party's way out is written to the
 * log; a screen that shows one picture and then another during one scene change is the bug of the 24th playtest, point 1.
 *
 * Usage: [FROM_TITLE=1] tsx tools/dev/check-loading.ts [size] [url]      (default size huge, url http://localhost:5173/; FROM_TITLE=1 starts through the title screen like a player)
 */
import puppeteer from "puppeteer-core";

const size = process.argv[2] ?? "huge";
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
  // THROTTLE=4 slows the page down to a quarter, a slow machine shows races a fast one hides
  if (process.env.THROTTLE) await (await page.createCDPSession()).send("Emulation.setCPUThrottlingRate", { rate: Number(process.env.THROTTLE) });
  page.on("pageerror", (e) => console.log("[pageerror]", (e as Error).message));
  // the observer is in place before the game starts, so the very first screen is seen too
  await page.evaluateOnNewDocument(`
    window.__events = [];
    const t0 = performance.now();
    const note = (what) => window.__events.push(Math.round(performance.now() - t0) + " ms  " + what);
    const watch = () => {
      const el = document.querySelector(".loading");
      if (!el) return requestAnimationFrame(watch);
      const picture = () => el.querySelector("img");
      const name = () => (picture() ? picture().src.split("/").pop() : "no picture");
      const state = () => (el.classList.contains("on") ? (el.classList.contains("out") ? "fading out" : "up") : "down");
      let last = state();
      let shownPicture = name();
      // the screen swaps its picture for a new element (childList) or sets a new src on the old one
      new MutationObserver(() => {
        const s = state();
        if (s !== last) { last = s; note("screen " + s + " (" + name() + ")"); }
        if (name() !== shownPicture) { shownPicture = name(); note("picture -> " + shownPicture + " while the screen is " + s); }
      }).observe(el, { attributes: true, childList: true, subtree: true, attributeFilter: ["class", "src"] });
    };
    watch();
  `);
  if (process.env.FROM_TITLE === "1") {
    // the way a player starts: the title screen, "New game", the size, "New game" again
    await page.goto(`${base}?seed=loading-check`, { waitUntil: "load", timeout: 120000 });
    await page.waitForSelector(".title .btn");
    const click = (text: string) => page.evaluate(`(() => { const b = [...document.querySelectorAll(".title .btn")].find((e) => e.textContent.trim() === ${JSON.stringify(text)}); if (b) b.click(); return !!b; })()`);
    await click("New game");
    await sleep(300);
    await click(size[0]!.toUpperCase() + size.slice(1));
    await click("New game");
  } else await page.goto(`${base}?seed=loading-check&autostart=1&size=${size}`, { waitUntil: "load", timeout: 120000 });
  await page.waitForFunction("window.__game && window.__game.state && window.__game.state.at.mode === 'interior'", { timeout: 240000 });
  // the screen of the game start has to be gone before the party can leave, as it is for a player
  await page.waitForFunction("!document.querySelector('.loading').classList.contains('on') && !window.__game.game.ui.loading.active", { timeout: 240000 });
  await sleep(Number(process.env.WAIT_MS ?? 1200));
  await page.evaluate("window.__events.push('--- the party leaves Starthaven')");
  await page.evaluate("window.__game.leave()");
  await sleep(6000);
  const events = (await page.evaluate("window.__events")) as string[];
  for (const e of events) console.log(e);
  const pictures = events.filter((e) => e.includes("picture ->")).length;
  console.log(`\n${pictures} picture change(s) in all (one per scene change is right: the game start and the way out)`);
} finally {
  await browser.close();
}
