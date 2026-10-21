/**
 * Runs the in-game benchmark (src/game/bench.ts) in Chrome and prints the result as JSON.
 * Usage: tsx tools/dev/bench.ts <overworld|interior> [seed] [view close|medium|far]      (GAME_QUERY="&tiles=flat" adds URL parameters)
 */
import puppeteer from "puppeteer-core";

const [scenario = "overworld", seed = "alpha", view = "far"] = process.argv.slice(2);
const base = process.env.GAME_URL ?? "http://localhost:5173/";

const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: ["--window-size=1920,1080", "--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-webgl", "--disable-frame-rate-limit", "--disable-gpu-vsync"],
  defaultViewport: { width: 1920, height: 1080 },
});
try {
  const page = await browser.newPage();
  const problems: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(m.text());
  });
  page.on("pageerror", (e) => problems.push(String((e as Error).message)));
  await page.goto(`${base}?bench=1&scenario=${scenario}&seed=${encodeURIComponent(seed)}&view=${view}${process.env.GAME_QUERY ?? ""}`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction("window.__bench && window.__bench.done === true", { timeout: 300000, polling: 1000 });
  const result = await page.evaluate("window.__bench.result");
  console.log(JSON.stringify(result, null, 2));
  console.log(`console errors: ${problems.length}`);
  for (const p of [...new Set(problems)].slice(0, 10)) console.log("  " + p);
} finally {
  await browser.close();
}
