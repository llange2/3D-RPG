/**
 * Visits a list of spots in the running game, one screenshot and one perf reading per spot.
 * Usage: tsx tools/dev/tour.ts <outDir> <seed> "name:x,y,F[,pitch]" ...   (F = N|E|S|W, pitch in radians, negative = up)
 */
import { mkdirSync } from "node:fs";
import puppeteer from "puppeteer-core";

const [outDir, seed, ...spots] = process.argv.slice(2);
if (!outDir || !seed) throw new Error("usage: tour <outDir> <seed> spots...");
mkdirSync(outDir, { recursive: true });
const base = process.env.GAME_URL ?? "http://localhost:5173/";
const extra = process.env.GAME_QUERY ?? "&autostart=1";

const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: ["--window-size=1280,720", "--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-webgl"],
  defaultViewport: { width: 1280, height: 720 },
});
try {
  const page = await browser.newPage();
  const problems: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warn") problems.push(`[${m.type()}] ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`[pageerror] ${(e as Error).message}`));
  await page.goto(`${base}?seed=${encodeURIComponent(seed)}&debug=1${extra}`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction("window.__game !== undefined", { timeout: 60000 });
  await new Promise((r) => setTimeout(r, 2500));
  for (const spot of spots) {
    const [name, rest] = spot.split(":") as [string, string];
    const [x, y, f = "N", pitch = "0"] = rest.split(",");
    await page.evaluate(`window.__game.teleport(${Number(x)}, ${Number(y)}, "${f}"); window.__pitch = ${Number(pitch)};`);
    await new Promise((r) => setTimeout(r, 2200));
    await page.screenshot({ path: `${outDir}/${name}.png` });
    const perf = (await page.evaluate("window.__game.perf()")) as { fps: number; drawCalls: number; chunks: number; instances: number; triangles: number; maxBuildMs: number };
    console.log(`${name.padEnd(14)} ${perf.fps.toFixed(0).padStart(3)} fps  ${String(perf.drawCalls).padStart(3)} draws  ${String(Math.round(perf.triangles / 1000)).padStart(5)}k tris  chunks ${perf.chunks}  max build ${perf.maxBuildMs.toFixed(1)} ms`);
  }
  console.log(`problems (${problems.length}):`);
  for (const p of [...new Set(problems)].slice(0, 20)) console.log("  " + p);
} finally {
  await browser.close();
}
