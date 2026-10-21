/**
 * Drives the installed Chrome: opens a URL, waits for the game, optionally runs scripts and keys, saves screenshots,
 * prints console errors and the perf object. Used for automated visual and performance checks.
 *
 * Usage: tsx tools/dev/shot.ts <url> <out.png> [--wait=ms] [--eval="js"] [--keys="w,w,e"] [--size=1280x720] [--then="js;;js"] [--storage=key=value]
 */
import { mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import puppeteer from "puppeteer-core";

const args = process.argv.slice(2);
const url = args[0]!;
const out = args[1]!;
const opt = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const wait = Number(opt("wait") ?? 4000);
const [w, h] = (opt("size") ?? "1280x720").split("x").map(Number) as [number, number];
const evalFile = opt("evalfile");
const evalCode = evalFile ? readFileSync(evalFile, "utf-8") : opt("eval");
const keys = opt("keys")?.split(",") ?? [];
const thenFile = opt("thenfile");
const sequence = thenFile ? readFileSync(thenFile, "utf-8").split(";;") : (opt("then")?.split(";;") ?? []);

mkdirSync(dirname(out), { recursive: true });
const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: [`--window-size=${w},${h}`, "--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-webgl", "--autoplay-policy=no-user-gesture-required"],
  defaultViewport: { width: w, height: h },
});
try {
  const page = await browser.newPage();
  const problems: string[] = [];
  page.on("console", (m) => {
    const t = m.type();
    if (t === "error" || t === "warn") problems.push(`[${t}] ${m.text()}`);
    else if (args.includes("--logs")) problems.push(`[${t}] ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`[pageerror] ${(e as Error).message}`));
  page.on("requestfailed", (r) => problems.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`));
  page.on("response", (r) => {
    if (r.status() >= 400) problems.push(`[http ${r.status()}] ${r.url()}`);
  });
  // browser storage set before the game boots (its settings are read at start), e.g. --storage=mm3-seed-rpg:settings:v1={"floorModel":false}
  for (const entry of args.filter((a) => a.startsWith("--storage="))) {
    const [key, ...value] = entry.slice("--storage=".length).split("=");
    await page.evaluateOnNewDocument((k: string, v: string) => localStorage.setItem(k, v), key!, value.join("="));
  }
  await page.goto(url, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction("window.__game !== undefined", { timeout: 60000 }).catch(() => problems.push("[timeout] window.__game never appeared"));
  await new Promise((r) => setTimeout(r, wait));
  if (evalCode) {
    const result = await page.evaluate(evalCode);
    console.log("eval:", JSON.stringify(result));
    await new Promise((r) => setTimeout(r, 800));
  }
  for (const k of keys) {
    await page.keyboard.press(k as Parameters<typeof page.keyboard.press>[0]);
    await new Promise((r) => setTimeout(r, 450));
  }
  for (const code of sequence) {
    const result = await page.evaluate(code);
    if (result !== undefined) console.log("then:", JSON.stringify(result));
    await new Promise((r) => setTimeout(r, 900));
  }
  await page.screenshot({ path: out });
  const perf = await page.evaluate("window.__game && window.__game.perf ? window.__game.perf() : null");
  console.log("perf:", JSON.stringify(perf));
  console.log(`problems (${problems.length}):`);
  for (const p of [...new Set(problems)].slice(0, 25)) console.log("  " + p);
  console.log("saved", out);
} finally {
  await browser.close();
}
