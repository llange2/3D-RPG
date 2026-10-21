/**
 * Checks the options dialog and the training grounds' "Train all" in the real browser (needs the dev server and Chrome, like check:render):
 *  1. The title screen has an Options button; the dialog holds the seven switches in order, a click only turns the draft over,
 *     Back drops it and Apply stores it.
 *  2. In the game the menu has Options (no separate Graphics and Music), Apply puts view distance, resolution and the frame counter into
 *     effect at once, without a reload.
 *  3. Switching the models restarts the page once and the game continues; the original set also brings the full ground tiles.
 *  4. The training grounds train every hero who can rise, the lowest level first, as far as the gold reaches.
 *
 * Usage: tsx tools/dev/check-options.ts <outDir> [url]      (default url http://localhost:5173/)
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const outDir = process.argv[2];
if (!outDir) throw new Error("usage: tsx tools/dev/check-options.ts <outDir> [url]");
const base = process.argv[3] ?? "http://localhost:5173/";
mkdirSync(outDir, { recursive: true });

const SETTINGS_KEY = "mm3-seed-rpg:settings:v1";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: ["--window-size=1280,800", "--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-webgl", "--autoplay-policy=no-user-gesture-required"],
  defaultViewport: { width: 1280, height: 800 },
});
const problems: string[] = [];
const expect = (ok: boolean, what: string) => {
  if (!ok) problems.push(what);
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
};
try {
  const page = await browser.newPage();
  page.on("pageerror", (e) => problems.push(`[pageerror] ${(e as Error).message}`));
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`[console] ${m.text()}`);
  });
  const evalJs = <T>(code: string) => page.evaluate(code) as Promise<T>;
  const click = (selector: string, text?: string) =>
    evalJs<boolean>(`(() => {
      const els = [...document.querySelectorAll(${JSON.stringify(selector)})].filter((e) => !${JSON.stringify(text ?? "")} || e.textContent.includes(${JSON.stringify(text ?? "")}));
      if (!els[0]) return false;
      els[0].click();
      return true;
    })()`);
  const rows = () => evalJs<string[]>(`[...document.querySelectorAll(".parchment .opt")].map((e) => e.textContent.trim())`);
  const stored = () => evalJs<Record<string, unknown> | null>(`(() => { const v = localStorage.getItem(${JSON.stringify(SETTINGS_KEY)}); return v ? JSON.parse(v) : null; })()`);

  // ---- 1. title screen
  await page.goto(base, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction("window.__game !== undefined", { timeout: 60000 });
  await sleep(2500);
  await evalJs(`localStorage.removeItem(${JSON.stringify(SETTINGS_KEY)})`);
  expect(await click(".title .btn", "Options"), "the title screen has an Options button");
  await sleep(300);
  const first = await rows();
  expect(
    JSON.stringify(first) === JSON.stringify(["Ground and floors: 3D", "Models: low poly", "Distance: Medium", "Resolution: normal", "Show FPS: off", "Music: on", "Sound effects: on"]),
    `the options list the switches in order (${first.join(" | ")})`,
  );
  await page.screenshot({ path: join(outDir, "options-title.png") });
  await click(".parchment .opt", "Ground and floors");
  await click(".parchment .opt", "Distance");
  await click(".parchment .opt", "Show FPS");
  const turned = await rows();
  expect(turned[0] === "Ground and floors: flat" && turned[2] === "Distance: Far" && turned[4] === "Show FPS: on", `a click turns the switch over (${turned.join(" | ")})`);
  expect((await stored()) === null, "nothing is stored before Apply");
  await click(".parchment .buttons .btn", "Back");
  await sleep(200);
  expect((await stored()) === null, "Back drops the draft");
  await click(".title .btn", "Options");
  await sleep(200);
  expect((await rows())[0] === "Ground and floors: 3D", "after Back the options show the old values again");
  await click(".parchment .opt", "Distance");
  await click(".parchment .opt", "Distance");
  await click(".parchment .opt", "Resolution");
  await click(".parchment .buttons .btn", "Apply");
  await sleep(300);
  const saved = await stored();
  expect(saved?.viewDistance === "close" && saved?.resolution === "low", `Apply stores the draft (${JSON.stringify(saved)})`);
  expect((await evalJs<number>("__game.game.internals.r.engine.getHardwareScalingLevel()")) === 1.5, "low resolution scales the picture at once, without a reload");

  // ---- 2. in the game
  await page.goto(`${base}?autostart=1&outside=1&seed=test`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction("window.__game !== undefined", { timeout: 60000 });
  await sleep(4000);
  const closeChunks = await evalJs<number>("__game.perf().chunks");
  await page.keyboard.press("Escape");
  await sleep(400);
  const menu = await rows();
  expect(menu.some((r) => r.startsWith("Options")) && !menu.some((r) => r.startsWith("Graphics") || r.startsWith("Music")), `the menu has Options and no Graphics or Music (${menu.join(" | ")})`);
  await click(".parchment .opt", "Options");
  await sleep(300);
  await click(".parchment .opt", "Resolution");
  await click(".parchment .opt", "Distance"); // close -> medium
  await click(".parchment .opt", "Distance"); // medium -> far
  await click(".parchment .opt", "Show FPS");
  await click(".parchment .opt", "Music");
  await page.screenshot({ path: join(outDir, "options-game.png") });
  await click(".parchment .buttons .btn", "Apply");
  await sleep(4000);
  expect((await evalJs<string>(`document.querySelector(".fps")?.textContent ?? ""`)).includes("FPS"), "the frame counter shows");
  expect((await evalJs<number>("__game.game.internals.r.engine.getHardwareScalingLevel()")) === 1, "resolution back to normal");
  const farChunks = await evalJs<number>("__game.perf().chunks");
  expect(farChunks > closeChunks, `far draws more chunks than close (${farChunks} against ${closeChunks})`);
  expect(closeChunks <= 25 + 8 && farChunks >= 49, "close keeps a 5x5 window of chunks, far a 9x9 one");
  const after = await stored();
  expect(after?.viewDistance === "far" && after?.showFps === true && after?.music === false, `the settings are stored (${JSON.stringify(after)})`);
  await page.screenshot({ path: join(outDir, "game-far-fps.png") });

  // ---- 2b. the three ranges of fog and view
  for (const view of ["close", "medium", "far"] as const) {
    await page.goto(`${base}?autostart=1&outside=1&seed=test&view=${view}`, { waitUntil: "load", timeout: 60000 });
    await page.waitForFunction("window.__game !== undefined", { timeout: 60000 });
    await sleep(4500);
    await page.screenshot({ path: join(outDir, `view-${view}.png`) });
  }

  // ---- 3. the model set: one reload, the game goes on
  await page.goto(`${base}?autostart=1&outside=1&seed=test`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction("window.__game !== undefined", { timeout: 60000 });
  await sleep(3000);
  await page.keyboard.press("Escape");
  await sleep(300);
  await click(".parchment .opt", "Options");
  await sleep(300);
  await click(".parchment .opt", "Models");
  const navigated = page.waitForNavigation({ waitUntil: "load", timeout: 60000 });
  await click(".parchment .buttons .btn", "Apply");
  await navigated;
  await page.waitForFunction("window.__game !== undefined", { timeout: 60000 });
  await sleep(5000);
  expect((await evalJs<string>("__game.modelSet")) === "original", "the original models are loaded after the reload");
  expect((await evalJs<string>("__game.game.mode")) === "overworld", "the game went on after the reload");
  await page.screenshot({ path: join(outDir, "models-original.png") });
  // back to the reduced set so that the next run starts as usual
  await evalJs(`localStorage.setItem("mm3-seed-rpg:models:v1", "lowpoly")`);

  // ---- 4. train all
  await page.goto(`${base}?autostart=1&outside=1&seed=test`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction("window.__game !== undefined", { timeout: 60000 });
  await sleep(3000);
  await evalJs(`(async () => { await __game.enter("p:0:0:0"); })()`);
  await sleep(2500);
  // levels 3, 1, 2, 5 with enough experience for all; the gold reaches the first three only (250 a level: 500 + 250 + 750 = 1500, the level 5 hero would need 1250 more)
  await evalJs(`(() => {
    const p = __game.state.party;
    const levels = [2, 1, 3, 5];
    p.characters.forEach((c, i) => { c.level = levels[i]; c.xp = 99999999; });
    p.gold = 1500;
  })()`);
  if (!(await evalJs<boolean>(`__game.goto("service", "training")`))) problems.push("the start town has no training grounds");
  await sleep(500);
  await page.keyboard.press("w");
  await sleep(1200);
  const label = await evalJs<string>(`[...document.querySelectorAll(".service .btn")].map((e) => e.textContent).find((t) => t.startsWith("Train all")) ?? ""`);
  console.log("button:", label);
  expect(label.startsWith("Train all (3 of 4, 1'500 gold)") || label.includes("3 of 4"), "the button names who is trained and what it costs");
  await page.screenshot({ path: join(outDir, "train-all-1.png") });
  await click(".service .btn", "Train all");
  await sleep(400);
  const state = await evalJs<{ levels: number[]; gold: number }>(`({ levels: __game.state.party.characters.map((c) => c.level), gold: __game.state.party.gold })`);
  console.log("after:", JSON.stringify(state));
  expect(JSON.stringify(state.levels) === JSON.stringify([3, 2, 4, 5]) && state.gold === 0, "the three lowest heroes rose one level, the one at level 5 waits for gold");
  await page.screenshot({ path: join(outDir, "train-all-2.png") });
} finally {
  console.log(`problems (${problems.length}):`);
  for (const p of problems) console.log("  " + p);
  await browser.close();
}
process.exit(problems.length ? 1 : 0);
