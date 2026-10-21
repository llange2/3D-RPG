/**
 * Plays the game in Chrome from a list of steps, taking screenshots on the way.
 * Steps: key:w  wait:500  click:Button text  shot:name  eval:js  log:js  repeat:3:key:w (repeat a key)
 * Usage: tsx tools/dev/play.ts <outDir> <seed> "step" "step" ...
 */
import { mkdirSync, readFileSync } from "node:fs";
import puppeteer from "puppeteer-core";

const [outDir, seed, ...steps] = process.argv.slice(2);
if (!outDir || !seed) throw new Error("usage: play <outDir> <seed> steps...");
mkdirSync(outDir, { recursive: true });
const base = process.env.GAME_URL ?? "http://localhost:5173/";

const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: ["--window-size=1280,720", "--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-webgl", "--autoplay-policy=no-user-gesture-required"],
  defaultViewport: { width: 1280, height: 720 },
});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
try {
  const page = await browser.newPage();
  const problems: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warn") problems.push(`[${m.type()}] ${m.text()}`);
  });
  page.on("response", (r) => {
    if (r.status() >= 400) problems.push(`[http ${r.status()}] ${r.url()}`);
  });
  page.on("pageerror", (e) => problems.push(`[pageerror] ${(e as Error).message}\n${(e as Error).stack?.split("\n").slice(0, 4).join("\n")}`));
  await page.goto(`${base}?seed=${encodeURIComponent(seed)}&autostart=1&debug=1${process.env.GAME_QUERY ?? ""}`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction("window.__game !== undefined && window.__game.state !== undefined", { timeout: 60000 });
  await sleep(2500);

  for (const step of steps) {
    const [cmd, ...rest] = step.split(":");
    const arg = rest.join(":");
    switch (cmd) {
      case "key":
        await page.keyboard.press(arg as Parameters<typeof page.keyboard.press>[0]);
        await sleep(450);
        break;
      case "repeat": {
        const [n, , key] = arg.split(":") as [string, string, string];
        for (let i = 0; i < Number(n); i++) {
          await page.keyboard.press(key as Parameters<typeof page.keyboard.press>[0]);
          await sleep(420);
        }
        break;
      }
      case "wait":
        await sleep(Number(arg));
        break;
      case "click": {
        const ok = await page.evaluate((text) => {
          // an open dialog takes the click: look inside the topmost one first
          const modals = document.querySelectorAll<HTMLElement>(".modal-back");
          const scope: ParentNode = modals.length > 0 ? modals[modals.length - 1]! : document;
          const els = [...scope.querySelectorAll<HTMLElement>("button, .opt, .tab, .slot, .card")];
          const el = els.find((e) => e.textContent?.trim().toLowerCase().includes(text.toLowerCase()));
          if (!el) return false;
          el.click();
          return true;
        }, arg);
        if (!ok) problems.push(`[play] click target not found: ${arg}`);
        await sleep(500);
        break;
      }
      case "shot":
        await page.screenshot({ path: `${outDir}/${arg}.png` });
        console.log("shot", arg);
        break;
      case "eval": {
        const r = await page.evaluate(arg);
        if (r !== undefined) console.log("eval:", JSON.stringify(r));
        await sleep(300);
        break;
      }
      case "evalfile": {
        const r = await page.evaluate(readFileSync(arg, "utf-8"));
        if (r !== undefined) console.log("evalfile:", JSON.stringify(r));
        await sleep(300);
        break;
      }
      default:
        problems.push(`[play] unknown step ${step}`);
    }
  }
  console.log(`problems (${problems.length}):`);
  for (const p of [...new Set(problems)].slice(0, 20)) console.log("  " + p);
} finally {
  await browser.close();
}
