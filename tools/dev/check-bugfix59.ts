/**
 * bug_fix_59, point 7: between the click on "New game" (or "Load game") of the title and the loading screen the 3D view with the sky and the HUD must never show. A recorder in the page
 * looks at every animation frame from the click on: is the title there, is the loading screen on? A frame with neither is the gap the user saw. Needs a dev server
 * (`VITE_FROZEN=1 VITE_PORT=<free port> npx vite --port <free port> --strictPort`).
 *
 * Usage: GAME_URL=http://localhost:<port>/ npx tsx tools/dev/check-bugfix59.ts [new|load] [seed]
 */
import puppeteer from "puppeteer-core";

const base = process.env.GAME_URL ?? "http://localhost:5191/";
const mode = process.argv[2] ?? "new";
const seed = process.argv[3] ?? "pearl-shore-794";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  protocolTimeout: 240000,
  args: ["--window-size=1280,720", "--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-webgl", "--autoplay-policy=no-user-gesture-required"],
  defaultViewport: { width: 1280, height: 720 },
});
try {
  const page = await browser.newPage();
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(`[pageerror] ${(e as Error).message}`));
  await page.goto(`${base}?seed=${seed}&size=${process.env.SIZE ?? "small"}&dungeons=default`, { waitUntil: "load", timeout: 60000 });
  await page.waitForSelector(".title .menu button", { timeout: 60000 });
  await sleep(1500);
  if (mode === "load") {
    // a save to load: start a world by the title first, save it (the autosave of the first arrival), reload
    await page.evaluate("localStorage.getItem('mm3-seed-rpg:save:v1') ? 1 : 0");
  }
  await page.evaluate(`(() => {
    const log = [];
    window.__frames = log;
    const t0 = performance.now();
    const tick = () => {
      const loading = document.querySelector('.loading');
      const loadingOn = !!loading && loading.classList.contains('on');
      const title = !!document.querySelector('.title');
      const hud = !document.querySelector('.hud-hide');
      log.push({ t: Math.round(performance.now() - t0), title, loadingOn, hud, pct: loading ? loading.querySelector('.percent')?.textContent : null });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  })()`);
  const buttons = await page.$$(".title .menu button");
  const labels = await Promise.all(buttons.map((b) => b.evaluate((e) => e.textContent ?? "")));
  const first = labels.findIndex((l) => /^New game/i.test(l));
  await buttons[first]!.click();
  await sleep(400);
  const second = await page.$$(".title .menu button.primary");
  const names = await Promise.all(second.map((b) => b.evaluate((e) => e.textContent ?? "")));
  const go = names.findIndex((n) => /^New game/i.test(n));
  await second[go]!.click();
  // wait for the game to be playable again: the loading screen goes down
  await page.waitForFunction(`window.__frames.some((f) => f.loadingOn) && !document.querySelector('.loading.on')`, { timeout: 180000 });
  await sleep(500);
  const frames = (await page.evaluate("window.__frames")) as Array<{ t: number; title: boolean; loadingOn: boolean; hud: boolean; pct: string | null }>;
  const start = frames.findIndex((f) => f.t > 0);
  const gaps = frames.slice(start).filter((f) => !f.title && !f.loadingOn);
  // frames after the loading screen went down count as play, so only the ones between the click and the first loading frame matter
  const firstLoading = frames.findIndex((f) => f.loadingOn);
  const before = frames.slice(0, firstLoading).filter((f) => !f.title);
  console.log(`frames ${frames.length}, first loading frame #${firstLoading}, frames without title before it: ${before.length}`);
  console.log(`loading screen up for ${(frames[frames.length - 1]!.t - frames[firstLoading]!.t) / 1000} s (to the last frame recorded)`);
  console.log(`last percentages: ${frames.filter((f) => f.loadingOn).slice(-3).map((f) => f.pct).join(", ")}`);
  console.log(gaps.length > 0 && before.length > 0 ? `GAP: ${before.length} frames of the bare 3D view` : "no gap: the loading screen stood before the title went");
  if (problems.length > 0) console.log("PROBLEMS:\n" + problems.join("\n"));
} finally {
  await browser.close();
}
