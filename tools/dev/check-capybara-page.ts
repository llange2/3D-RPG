/**
 * The Capybara's page in the party window (the mascot tab): the clip must be there, loaded and playing in a loop (bug_fix_71 follow-up).
 * Needs a dev server (`VITE_FROZEN=1 VITE_PORT=<free port> npx vite --port <free port> --strictPort`).
 *
 * Usage: GAME_URL=http://localhost:<port>/ npx tsx tools/dev/check-capybara-page.ts <screenshot folder>
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const base = process.env.GAME_URL ?? "http://localhost:5192/";
const outDir = process.argv[2] ?? "capybara-page-shots";
mkdirSync(outDir, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const problems: string[] = [];

const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  // no `--autoplay-policy` switch on purpose: a player's Chrome has the default policy (a muted video may start by itself, a video with sound may not)
  args: ["--window-size=1280,800", "--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-webgl"],
  defaultViewport: { width: 1280, height: 800 },
});
try {
  const page = await browser.newPage();
  page.on("pageerror", (e) => problems.push(`[pageerror] ${(e as Error).message}`));
  page.on("response", (r) => {
    if (r.status() >= 400 && !r.url().includes("@fontsource")) problems.push(`[http ${r.status()}] ${r.url()}`);
  });
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("403")) problems.push(`[console] ${m.text()}`);
  });
  const evalJs = <T>(code: string) => page.evaluate(code) as Promise<T>;
  await page.goto(`${base}?autostart=1&seed=test`, { waitUntil: "load", timeout: 90000 });
  await page.waitForFunction("window.__game !== undefined", { timeout: 90000 });
  await sleep(4000);
  await evalJs(`(() => { const p = __game.state.party; p.mascot = "Capybara"; __game.game.refresh(); })()`);
  await sleep(500);
  await page.keyboard.press("5");
  await sleep(2500);
  const info = await evalJs<unknown>(`(() => {
    const view = document.querySelector(".mascot-view");
    const v = view?.querySelector("video");
    const img = view?.querySelector("img.mascot-pic");
    return {
      view: !!view, video: !!v, img: !!img,
      video_state: v ? { ready: v.readyState, paused: v.paused, error: v.error ? v.error.code + " " + v.error.message : null, src: v.currentSrc, w: v.videoWidth, h: v.videoHeight, time: v.currentTime, rect: JSON.stringify(v.getBoundingClientRect()), poster: v.poster } : null,
      html: view ? view.innerHTML.slice(0, 600) : null,
    };
  })()`);
  console.log(JSON.stringify(info, null, 1));
  await page.screenshot({ path: join(outDir, "mascot-page.png") });
  // the clip is painted, not only running: the picture of the video changes while it plays (the poster would stay the same), so a later shot must differ in the video's rectangle
  const clip = { x: 139, y: 158, width: 154, height: 154 };
  const first = await page.screenshot({ clip });
  await page.waitForFunction(`document.querySelector(".mascot-view video")?.currentTime > 6`, { timeout: 20000 }).catch(() => problems.push("the clip never got past six seconds"));
  const second = await page.screenshot({ path: join(outDir, "mascot-page-later.png"), clip });
  console.log("video picture changed while playing:", Buffer.compare(Buffer.from(first), Buffer.from(second)) !== 0);
  console.log("time later:", await evalJs<number>(`document.querySelector(".mascot-view video")?.currentTime ?? -1`));
} finally {
  await browser.close();
}
console.log(problems.length ? "PROBLEMS:\n" + [...new Set(problems)].join("\n") : "no http/page errors");
