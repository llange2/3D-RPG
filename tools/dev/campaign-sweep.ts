/**
 * Opens every campaign map in Chrome, takes a screenshot of the start and reports console errors, the draw calls and
 * whether the party stands on free ground. Needs `npm run dev`.
 * Usage: tsx tools/dev/campaign-sweep.ts <outDir>
 */
import { mkdirSync } from "node:fs";
import puppeteer from "puppeteer-core";

const outDir = process.argv[2];
if (!outDir) throw new Error("usage: campaign-sweep <outDir>");
mkdirSync(outDir, { recursive: true });
const base = process.env.GAME_URL ?? "http://localhost:5173/";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: ["--window-size=1280,720", "--use-angle=d3d11", "--ignore-gpu-blocklist"],
  defaultViewport: { width: 1280, height: 720 },
});
let failures = 0;
try {
  const page = await browser.newPage();
  const problems: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warn") problems.push(`[${m.type()}] ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`[pageerror] ${(e as Error).message}`));
  page.on("response", (r) => {
    if (r.status() >= 400) problems.push(`[http ${r.status()}] ${r.url()}`);
  });
  await page.goto(`${base}?seed=sweep&autostart=1&campaign=1&debug=1`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction("window.__game && window.__game.state", { timeout: 60000 });
  await sleep(1500);
  const slugs = (await page.evaluate("fetch('/assets/campaign/index.json').then(r => r.json()).then(j => j.maps.map(m => m.slug))")) as string[];
  for (const slug of slugs) {
    const before = problems.length;
    await page.evaluate(`window.__game.campaign(${JSON.stringify(slug)}).then(() => 1)`);
    await sleep(700);
    const info = (await page.evaluate(`(() => {
      const g = window.__game.game;
      const m = window.__game.campaignModel;
      const p = g.internals.player;
      const abs = m.toAbsolute(p.tx, p.ty);
      return { drawCalls: window.__game.perf().drawCalls, triangles: Math.round(window.__game.perf().triangles / 1000), free: m.isFree(abs.x, abs.y), monsters: g.internals.enc.monsters.length, name: m.name };
    })()`)) as { drawCalls: number; triangles: number; free: boolean; monsters: number; name: string };
    await page.screenshot({ path: `${outDir}/${slug}.png` });
    const newProblems = problems.slice(before);
    const bad = !info.free || newProblems.length > 0;
    if (bad) failures++;
    console.log(`${bad ? "FAIL" : "ok  "} ${slug.padEnd(28)} draw ${String(info.drawCalls).padStart(3)}  ${String(info.triangles).padStart(4)}k tris  ${String(info.monsters).padStart(3)} monsters${info.free ? "" : "  START NOT FREE"}${newProblems.length ? `\n      ${[...new Set(newProblems)].slice(0, 3).join("\n      ")}` : ""}`);
  }
} finally {
  await browser.close();
}
console.log(failures === 0 ? "all campaign maps open cleanly" : `${failures} maps with problems`);
process.exit(failures === 0 ? 0 : 1);
