/**
 * Does the music of the title screen start without a click (18. 11. 2026)? Needs a dev server (`VITE_FROZEN=1 VITE_PORT=<free port> npx vite --port <free port> --strictPort`).
 *
 * Usage: GAME_URL=http://localhost:<port>/ npx tsx tools/dev/check-title-music.ts
 * Opens the title screen twice, once in a browser that lets pages play without a gesture (as the game's own window does, `autoplay-policy` in `installer/main.mjs`) and once in one that does not
 * (the normal policy of Chrome for a site that was never touched): the first must be playing the title music before any click, the second must start it with the first click.
 */
import puppeteer from "puppeteer-core";

const base = process.env.GAME_URL ?? "http://localhost:5173/";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function run(label: string, args: string[]): Promise<boolean> {
  const browser = await puppeteer.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
    args: ["--window-size=1280,720", "--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-webgl", ...args],
    defaultViewport: { width: 1280, height: 720 },
  });
  try {
    const page = await browser.newPage();
    await page.goto(`${base}?debug=1`, { waitUntil: "load", timeout: 60000 });
    await page.waitForFunction("window.__game !== undefined", { timeout: 60000 });
    await sleep(4000);
    // `warm`: the title track that runs muted, loaded and decoded (readyState 4), while the browser does not let the page make sound
    const state = () => page.evaluate(`(() => { const a = __game.game.audio; const w = a.warm; return { unlocked: a.unlocked, track: a.currentTrack, pending: a.pendingTrack, playing: !!a.music && !a.music.paused && !a.music.muted && a.music.currentTime > 0, warm: w ? { muted: w.el.muted, running: !w.el.paused && w.el.currentTime > 0, paused: w.el.paused, t: w.el.currentTime, ready: w.el.readyState } : null }; })()`) as Promise<{ unlocked: boolean; track: number | null; pending: number | null; playing: boolean; warm: { muted: boolean; running: boolean; ready: number } | null }>;
    const before = await state();
    await page.mouse.click(640, 360);
    // 400 ms after the click the music must already be heard (the file is loaded by then, not fetched at the click; the strictest policy even stops the muted element from running, the loading still happens)
    await sleep(400);
    const soon = await state();
    await sleep(2100);
    const after = await state();
    console.log(`${label}: before the click`, JSON.stringify(before), "400 ms after", JSON.stringify(soon), "after", JSON.stringify(after));
    const prepared = before.playing || (before.warm !== null && before.warm.ready >= 3);
    return prepared && (before.playing || soon.playing) && after.playing;
  } finally {
    await browser.close();
  }
}

const open = await run("autoplay allowed", ["--autoplay-policy=no-user-gesture-required"]);
const closed = await run("autoplay blocked", ["--autoplay-policy=document-user-activation-required"]);
console.log(open && closed ? "OK: the music plays where the browser allows it, and after the first click where it does not" : "PROBLEM: see above");
