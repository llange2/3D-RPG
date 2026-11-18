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
    const state = () => page.evaluate(`(() => { const a = __game.game.audio; return { unlocked: a.unlocked, track: a.currentTrack, pending: a.pendingTrack, playing: !!a.music && !a.music.paused && a.music.currentTime > 0 }; })()`) as Promise<{ unlocked: boolean; track: number | null; pending: number | null; playing: boolean }>;
    const before = await state();
    await page.mouse.click(640, 360);
    await sleep(2500);
    const after = await state();
    console.log(`${label}: before the click`, JSON.stringify(before), "after the click", JSON.stringify(after));
    return before.playing || after.playing;
  } finally {
    await browser.close();
  }
}

const open = await run("autoplay allowed", ["--autoplay-policy=no-user-gesture-required"]);
const closed = await run("autoplay blocked", ["--autoplay-policy=document-user-activation-required"]);
console.log(open && closed ? "OK: the music plays where the browser allows it, and after the first click where it does not" : "PROBLEM: see above");
