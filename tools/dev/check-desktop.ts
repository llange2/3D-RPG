/**
 * Checks the desktop build (installer/, docs/RELEASE.md) by starting the real program and talking to it over the debugging port:
 *  1. the title screen shows, no script or stylesheet failed and no file of the game is missing (`MM3_LOG_MISSING`);
 *  2. a new game starts in the overworld and draws models (the originals of `models-original` are in the package);
 *  3. media: an `.mp4` range request is answered with 206, `.js` and `.glb` come with their own type;
 *  4. a value in `localStorage` is still there after the program was closed and started again (saves and settings).
 *
 * Usage: tsx tools/dev/check-desktop.ts <outDir> [exe]   (default exe: ../release/dist/win-unpacked/MM3 Seed RPG.exe next to the project folder)
 * The program runs with its own user-data folder in <outDir>, the real saves are not touched.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import puppeteer, { type Browser, type Page } from "puppeteer-core";

const outDir = process.argv[2];
if (!outDir) throw new Error("usage: tsx tools/dev/check-desktop.ts <outDir> [exe]");
const exe = process.argv[3] ?? resolve(process.cwd(), "..", "release", "dist", "win-unpacked", "MM3 Seed RPG.exe");
if (!existsSync(exe)) throw new Error(`no program at ${exe}`);
mkdirSync(outDir, { recursive: true });
const userData = join(resolve(outDir), "user-data");
const PORT = 9333;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const problems: string[] = [];
const missing: string[] = [];
const expect = (ok: boolean, what: string) => {
  if (!ok) problems.push(what);
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
};

function start(): ChildProcess {
  const child = spawn(exe, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${userData}`], {
    env: { ...process.env, MM3_LOG_MISSING: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const onText = (chunk: Buffer) => {
    for (const line of chunk.toString().split(/\r?\n/)) if (line.includes("[missing]")) missing.push(line.trim());
  };
  child.stdout?.on("data", onText);
  child.stderr?.on("data", onText);
  return child;
}

async function connect(): Promise<{ browser: Browser; page: Page }> {
  for (let i = 0; i < 60; i++) {
    try {
      const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${PORT}`, defaultViewport: null });
      const page = (await browser.pages()).find((p) => p.url().startsWith("app://"));
      if (page) return { browser, page };
      browser.disconnect();
    } catch {
      // not listening yet
    }
    await sleep(500);
  }
  throw new Error("the program did not open its window");
}

async function stop(browser: Browser, child: ChildProcess): Promise<void> {
  await browser.close().catch(() => undefined);
  await new Promise<void>((done) => {
    if (child.exitCode !== null) return done();
    child.once("exit", () => done());
    setTimeout(() => {
      child.kill();
      done();
    }, 5000);
  });
}

// ---- 1. title screen
let child = start();
let { browser, page } = await connect();
page.on("pageerror", (e) => problems.push(`[pageerror] ${(e as Error).message}`));
page.on("console", (m) => {
  if (m.type() === "error") problems.push(`[console] ${m.text()}`);
  else if (m.text().startsWith("range headers")) console.log(m.text());
});
page.on("requestfailed", (r) => {
  // a request that the page itself gave up (the test video when the page is left) is no failure of the program
  const why = r.failure()?.errorText ?? "";
  if (!why.includes("ERR_ABORTED")) problems.push(`[requestfailed] ${r.url()} ${why}`);
});
await page.waitForFunction("window.__game !== undefined", { timeout: 120000 });
await sleep(3000);
await page.screenshot({ path: join(outDir, "title.png") });
const title = await page.evaluate(`document.title`);
expect(title === "MM3 Seed RPG", `the window shows the title screen (${title})`);
expect((await page.evaluate(`!!document.querySelector(".title")`)) as boolean, "the title menu is on screen");

// full screen from the start, and no system pointer before the game's own one is there (the loading phase: `html.custom-cursor` is not set yet)
const screenInfo = (await page.evaluate(`({ w: innerWidth, sw: screen.width, h: innerHeight, sh: screen.height })`)) as { w: number; sw: number; h: number; sh: number };
expect(screenInfo.w === screenInfo.sw && screenInfo.h === screenInfo.sh, `the window starts in full screen (${screenInfo.w}x${screenInfo.h} of ${screenInfo.sw}x${screenInfo.sh})`);
const pointer = (await page.evaluate(`(() => {
  const root = document.documentElement;
  const had = root.classList.contains("custom-cursor");
  root.classList.remove("custom-cursor", "loading-on", "ending-on");
  const seen = getComputedStyle(document.body).cursor + "/" + getComputedStyle(document.querySelector(".title .btn") ?? document.body).cursor;
  if (had) root.classList.add("custom-cursor");
  return seen;
})()`)) as string;
expect(pointer === "none/none", `the system pointer is hidden while the game's own is not there yet (${pointer})`);

// ---- 3. types and ranges
const net = (await page.evaluate(`(async () => {
  const range = await fetch("/assets/ui/outro.mp4", { headers: { Range: "bytes=0-99" } });
  const bytes = (await range.arrayBuffer()).byteLength;
  console.log("range headers " + JSON.stringify([...range.headers.entries()]));
  const glb = await fetch("/assets/models-original/blk_cave_wall.glb");
  const scripts = [...document.querySelectorAll("script[src]")].map((s) => s.src);
  const js = await fetch(scripts[0]);
  return { status: range.status, bytes, glb: glb.status, glbType: glb.headers.get("content-type"), jsType: js.headers.get("content-type") };
})()`)) as { status: number; bytes: number; glb: number; glbType: string; jsType: string };
expect(net.status === 206 && net.bytes === 100, `a range request on the outro video gives 206 with 100 bytes (${net.status}, ${net.bytes})`);
expect(net.glb === 200 && net.glbType === "model/gltf-binary", `models are served (${net.glb}, ${net.glbType})`);
expect(/javascript/.test(net.jsType), `scripts come as JavaScript (${net.jsType})`);

// a video element plays and seeks (the outro, the town films, the capybara clip)
const video = (await page.evaluate(`(async () => {
  const v = document.createElement("video");
  v.muted = true;
  v.src = "/assets/ui/outro.mp4";
  const meta = await new Promise((res) => {
    v.onloadedmetadata = () => res("meta " + v.duration.toFixed(1) + "s " + v.videoWidth + "x" + v.videoHeight);
    v.onerror = () => res("error " + (v.error ? v.error.code : "?"));
    setTimeout(() => res("timeout"), 10000);
  });
  v.currentTime = Math.min(3, v.duration / 2);
  const seek = await new Promise((res) => {
    v.onseeked = () => res("seeked at " + v.currentTime.toFixed(1));
    setTimeout(() => res("seek timeout"), 10000);
  });
  return meta + " / " + seek;
})()`)) as string;
expect(video.startsWith("meta") && video.includes("seeked"), `a video loads and seeks (${video})`);

// ---- 2. a game in the overworld
await page.goto("app://game/index.html?autostart=1&outside=1&seed=test", { waitUntil: "load", timeout: 120000 });
await page.waitForFunction("window.__game !== undefined", { timeout: 120000 });
await sleep(8000);
await page.screenshot({ path: join(outDir, "overworld.png") });
const perf = (await page.evaluate(`__game.perf()`)) as { chunks: number };
expect(perf.chunks > 0, `the overworld is built (${perf.chunks} chunks)`);
for (const key of ["w", "w", "a"] as const) {
  await page.keyboard.press(key);
  await sleep(400);
}
await page.screenshot({ path: join(outDir, "overworld-walk.png") });

// ---- 4. storage across a restart
await page.evaluate(`localStorage.setItem("mm3-check-desktop", "kept")`);
await stop(browser, child);
child = start();
({ browser, page } = await connect());
await page.waitForFunction("window.__game !== undefined", { timeout: 120000 });
const kept = (await page.evaluate(`localStorage.getItem("mm3-check-desktop")`)) as string | null;
expect(kept === "kept", `localStorage survives a restart (${kept})`);
await page.evaluate(`localStorage.removeItem("mm3-check-desktop")`);
await stop(browser, child);

expect(missing.length === 0, `no file of the game is missing (${missing.length}${missing.length ? `: ${missing.slice(0, 5).join(" | ")}` : ""})`);
if (problems.length) {
  console.log(`\n${problems.length} problem(s):`);
  for (const p of problems) console.log(`  ${p}`);
  process.exit(1);
}
console.log("\nall ok");
