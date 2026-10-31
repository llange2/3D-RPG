/**
 * Checks the options window and the training grounds' "Train all" in the real browser (needs the dev server and Chrome, like check:render):
 *  1. The title screen has an Options button; Options lists Controls, Graphics and Sound. Graphics starts at the quality "Medium", the quality slider
 *     sets the switches below it and a switch that leaves a preset moves the slider to "Custom". A change only turns the draft over, Back drops it and Apply stores it.
 *  2. In the game Apply puts view distance, resolution, the frame counter and the sound into effect at once, without a reload; the volume sliders start in the middle.
 *  3. Controls: Key bindings rebinds an action (the key is taken from the action that had it) and "Show action keys in GUI" takes the key names off the buttons.
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
  // the topmost window only: the options windows stack on the menu
  const rows = () => evalJs<string[]>(`(() => { const w = [...document.querySelectorAll(".modal-back")].pop(); return [...(w?.querySelectorAll(".parchment .opt") ?? [])].map((e) => (e.querySelector("span") ?? e).textContent.trim()); })()`);
  const slide = (index: number, value: number) =>
    evalJs<boolean>(`(() => { const w = [...document.querySelectorAll(".modal-back")].pop(); const s = w?.querySelectorAll("input[type=range]")[${index}]; if (!s) return false; s.value = ${value}; s.dispatchEvent(new Event("input")); return true; })()`);
  const sliderValue = (index: number) => evalJs<number>(`Number([...document.querySelectorAll(".modal-back")].pop().querySelectorAll("input[type=range]")[${index}].value)`);
  const stored = () => evalJs<Record<string, unknown> | null>(`(() => { const v = localStorage.getItem(${JSON.stringify(SETTINGS_KEY)}); return v ? JSON.parse(v) : null; })()`);
  const back = () => click(".modal-back:last-child .parchment .buttons .btn", "Back");
  const apply = () => click(".modal-back:last-child .parchment .buttons .btn", "Apply");

  // ---- 1. title screen
  await page.goto(base, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction("window.__game !== undefined", { timeout: 60000 });
  await sleep(2500);
  await evalJs(`localStorage.removeItem(${JSON.stringify(SETTINGS_KEY)})`);
  expect(await click(".title .btn", "Options"), "the title screen has an Options button");
  await sleep(300);
  const top = await rows();
  expect(JSON.stringify(top) === JSON.stringify(["Controls", "Graphics", "Sound"]), `Options lists Controls, Graphics and Sound (${top.join(" | ")})`);
  await click(".modal-back:last-child .parchment .opt", "Graphics");
  await sleep(300);
  const first = await rows();
  expect(
    JSON.stringify(first) === JSON.stringify(["Quality: Medium", "Ground and floors: flat", "Textures: normal", "Distance: Medium", "Resolution: normal", "Animated town scenes: on", "Show FPS: off"]),
    `Graphics starts at Medium (${first.join(" | ")})`,
  );
  await page.screenshot({ path: join(outDir, "options-graphics.png") });
  await slide(0, 0);
  const low = await rows();
  expect(low[0] === "Quality: Low" && low[1] === "Ground and floors: flat" && low[3] === "Distance: Close" && low[4] === "Resolution: low" && low[5] === "Animated town scenes: off", `the slider at Low sets the switches (${low.join(" | ")})`);
  await slide(0, 2);
  const high = await rows();
  expect(high[0] === "Quality: High" && high[1] === "Ground and floors: 3D" && high[2] === "Textures: high" && high[3] === "Distance: Far", `the slider at High sets the switches (${high.join(" | ")})`);
  await slide(0, 1);
  await click(".modal-back:last-child .parchment .opt", "Show FPS");
  await click(".modal-back:last-child .parchment .opt", "Distance");
  const custom = await rows();
  expect(custom[0] === "Quality: Custom" && (await sliderValue(0)) === 3, `a switch that leaves a preset moves the slider to Custom (${custom.join(" | ")})`);
  expect((await stored()) === null, "nothing is stored before Apply");
  await back();
  await sleep(200);
  expect((await stored()) === null, "Back drops the draft");
  await click(".modal-back:last-child .parchment .opt", "Graphics");
  await sleep(200);
  expect((await rows())[0] === "Quality: Medium", "after Back Graphics shows Medium again");
  await slide(0, 0);
  await apply();
  await sleep(300);
  const saved = await stored();
  expect(saved?.viewDistance === "close" && saved?.resolution === "low" && saved?.animatedTown === false, `Apply stores the draft (${JSON.stringify(saved)})`);
  expect((await evalJs<number>("__game.game.internals.r.engine.getHardwareScalingLevel()")) === 1.5, "low resolution scales the picture at once, without a reload");

  // ---- 2. in the game
  await page.goto(`${base}?autostart=1&outside=1&seed=test`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction("window.__game !== undefined", { timeout: 60000 });
  await sleep(4000);
  const closeChunks = await evalJs<number>("__game.perf().chunks");
  await page.keyboard.press("Escape");
  await sleep(400);
  const menu = await rows();
  expect(menu.some((r) => r.startsWith("Options")), `the menu has Options (${menu.join(" | ")})`);
  await click(".modal-back:last-child .parchment .opt", "Options");
  await sleep(300);
  await click(".modal-back:last-child .parchment .opt", "Sound");
  await sleep(300);
  const sound = await rows();
  expect(JSON.stringify(sound) === JSON.stringify(["Music: on", "Music volume: 50", "Sound effects: on", "Sound volume: 50"]), `Sound lists switches and volume sliders (${sound.join(" | ")})`);
  expect((await sliderValue(0)) === 50 && (await sliderValue(1)) === 50, "the volume sliders start in the middle");
  await slide(0, 80);
  await click(".modal-back:last-child .parchment .opt", "Sound effects");
  await page.screenshot({ path: join(outDir, "options-sound.png") });
  await apply();
  await sleep(400);
  await click(".modal-back:last-child .parchment .opt", "Graphics");
  await sleep(300);
  await click(".modal-back:last-child .parchment .opt", "Resolution");
  await click(".modal-back:last-child .parchment .opt", "Distance"); // close -> medium
  await click(".modal-back:last-child .parchment .opt", "Distance"); // medium -> far
  await click(".modal-back:last-child .parchment .opt", "Show FPS");
  await apply();
  await sleep(4000);
  expect((await evalJs<string>(`document.querySelector(".fps")?.textContent ?? ""`)).includes("FPS"), "the frame counter shows");
  expect((await evalJs<number>("__game.game.internals.r.engine.getHardwareScalingLevel()")) === 1, "resolution back to normal");
  const farChunks = await evalJs<number>("__game.perf().chunks");
  expect(farChunks > closeChunks, `far draws more chunks than close (${farChunks} against ${closeChunks})`);
  expect(closeChunks <= 25 + 8 && farChunks >= 49, "close keeps a 5x5 window of chunks, far a 9x9 one");
  const after = await stored();
  expect(after?.viewDistance === "far" && after?.showFps === true && after?.sfx === false && after?.musicVolume === 80, `the settings are stored (${JSON.stringify(after)})`);
  await page.screenshot({ path: join(outDir, "game-far-fps.png") });

  // ---- 3. controls
  await click(".modal-back:last-child .parchment .opt", "Controls");
  await sleep(300);
  const controls = await rows();
  expect(JSON.stringify(controls) === JSON.stringify(["Key bindings", "Fade out cursor, if unused: on", "Show action keys in GUI: on"]), `Controls lists its three rows (${controls.join(" | ")})`);
  await click(".modal-back:last-child .parchment .opt", "Key bindings");
  await sleep(300);
  await page.screenshot({ path: join(outDir, "options-keys.png") });
  // Spells: its first key button (F) gets the key of Rest (R)
  const spellsRow = `[...document.querySelectorAll(".keyrow")].find((r) => r.firstChild.textContent === "Spells")`;
  await evalJs(`${spellsRow}.querySelector("button").click()`);
  await sleep(100);
  await page.keyboard.press("r");
  await sleep(200);
  const keysAfter = await evalJs<string[]>(`(() => { const rowOf = (n) => [...document.querySelectorAll(".keyrow")].find((r) => r.firstChild.textContent === n); return [rowOf("Spells").querySelectorAll("button")[0].textContent, rowOf("Rest").querySelectorAll("button")[0].textContent]; })()`);
  expect(keysAfter[0] === "R" && keysAfter[1] === "-", `Spells took R from Rest (${keysAfter.join(" | ")})`);
  await click(".modal-back:last-child .parchment .buttons .btn", "Back");
  await sleep(200);
  await click(".modal-back:last-child .parchment .opt", "Show action keys");
  await apply();
  await sleep(300);
  const attackButton = await evalJs<string>(`[...document.querySelectorAll(".actions .btn")].map((b) => b.textContent.trim()).join(" | ")`);
  expect(attackButton === "Attack | Spells | Inventory | Rest | Map | Menu", `the action buttons show no keys (${attackButton})`);
  const storedKeys = (await stored())?.keys as Record<string, string[]> | undefined;
  expect(storedKeys?.cast?.[0] === "r" && storedKeys?.rest?.length === 0, "the new keys are stored");
  await page.keyboard.press("Escape");
  await sleep(200);
  await page.keyboard.press("Escape");
  await sleep(200);

  // ---- 4. train all
  await page.goto(`${base}?autostart=1&outside=1&seed=test`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction("window.__game !== undefined", { timeout: 60000 });
  await sleep(3000);
  await evalJs(`(async () => { await __game.enter("p:0:0:0"); })()`);
  await sleep(2500);
  // levels 2, 1, 3, 5 with enough experience for all; since balance v4 a level costs 10 x level squared (90 + 40 + 160 + 360 gold = 650 for the four), so 1500 gold is enough for all of them
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
  expect(label.includes("4 of 4"), "the button names who is trained and what it costs");
  await page.screenshot({ path: join(outDir, "train-all-1.png") });
  await click(".service .btn", "Train all");
  await sleep(400);
  const state = await evalJs<{ levels: number[]; gold: number }>(`({ levels: __game.state.party.characters.map((c) => c.level), gold: __game.state.party.gold })`);
  console.log("after:", JSON.stringify(state));
  expect(JSON.stringify(state.levels) === JSON.stringify([3, 2, 4, 6]) && state.gold === 1110, "every hero rose one level and the gold paid for it (390)");
  await page.screenshot({ path: join(outDir, "train-all-2.png") });
} finally {
  console.log(`problems (${problems.length}):`);
  for (const p of problems) console.log("  " + p);
  await browser.close();
}
process.exit(problems.length ? 1 : 0);
