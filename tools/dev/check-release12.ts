/**
 * Release 1.2 in the real browser (needs a dev server and Chrome):
 *  1. Options > Controls > Key bindings has Back, Reset to defaults and Apply; a key changed there and Apply stores the keys at once and closes both windows.
 *  2. The Orb mascot lights the party like the Light spell (the sight radius in the dark is the one of the spell, and the spell's timed effect is not needed).
 *  3. Ctrl + click on a ring of the backpack wears it in the off-hand ring slot when both ring slots are taken.
 *
 * Usage: GAME_URL=http://localhost:<port>/ npx tsx tools/dev/check-release12.ts <outDir>
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer, { type ElementHandle } from "puppeteer-core";

const base = process.env.GAME_URL ?? "http://localhost:5173/";
const outDir = process.argv[2] ?? "release12-shots";
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
  const evalJs = <T>(code: string) => page.evaluate(code) as Promise<T>;
  const click = (selector: string, text?: string) =>
    evalJs<boolean>(`(() => {
      const els = [...document.querySelectorAll(${JSON.stringify(selector)})].filter((e) => !${JSON.stringify(text ?? "")} || e.textContent.includes(${JSON.stringify(text ?? "")}));
      if (!els[0]) return false;
      els[0].click();
      return true;
    })()`);
  const stored = () => evalJs<Record<string, unknown> | null>(`(() => { const v = localStorage.getItem(${JSON.stringify(SETTINGS_KEY)}); return v ? JSON.parse(v) : null; })()`);

  // ---- 1. key bindings
  await page.goto(base, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction("window.__game !== undefined", { timeout: 60000 });
  await sleep(2500);
  await evalJs(`localStorage.removeItem(${JSON.stringify(SETTINGS_KEY)})`);
  await click(".title .btn", "Options");
  await sleep(300);
  await click(".modal-back:last-child .parchment .opt", "Controls");
  await sleep(300);
  await click(".modal-back:last-child .parchment .opt", "Key bindings");
  await sleep(300);
  const buttons = await evalJs<string[]>(`[...document.querySelector(".modal-back:last-child .parchment .buttons").querySelectorAll(".btn")].map((b) => b.textContent)`);
  expect(JSON.stringify(buttons) === JSON.stringify(["Back", "Reset to defaults", "Apply"]), `the key page has Back, Reset to defaults and Apply (${buttons.join(" | ")})`);
  const quick = await evalJs<string>(`[...document.querySelectorAll(".keyrow")].find((r) => r.firstChild.textContent === "Quicksave").querySelector("button").textContent`);
  expect(quick === "F5", `the quick save key is F5 (${quick})`);
  await page.screenshot({ path: join(outDir, "keys.png") });
  await evalJs(`[...document.querySelectorAll(".keyrow")].find((r) => r.firstChild.textContent === "Spells").querySelector("button").click()`);
  await sleep(100);
  await page.keyboard.press("r");
  await sleep(200);
  expect((await stored()) === null, "nothing is stored before Apply");
  await click(".modal-back:last-child .parchment .buttons .btn", "Apply");
  await sleep(400);
  const keys = (await stored())?.keys as Record<string, string[]> | undefined;
  expect(keys?.cast?.[0] === "r", `Apply on the key page stores the keys (${JSON.stringify(keys?.cast)})`);
  expect(await evalJs<number>(`document.querySelectorAll(".modal-back .keyrow, .modal-back .settings").length`) === 0, "Apply closes the key page and the Controls window");

  // ---- 2 and 3. in the game
  await evalJs(`localStorage.removeItem(${JSON.stringify(SETTINGS_KEY)})`);
  await page.goto(`${base}?autostart=1&outside=1&seed=test`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction("window.__game !== undefined", { timeout: 60000 });
  await sleep(4000);
  const torch = () => evalJs<string>(`JSON.stringify((() => { const l = __game.scene.lights.find((x) => x.name === "torch"); return l ? { range: l.range, intensity: +l.intensity.toFixed(2) } : null; })())`);
  // night, so that the party's own light is all there is
  await evalJs(`(() => { const p = __game.state.party; p.minutes = 24 * 60 + 23 * 60; __game.game.refresh(); })()`);
  await sleep(3500);
  const plain = await torch();
  await evalJs(`(() => { const p = __game.state.party; p.mascot = "Orb"; })()`);
  await sleep(3500);
  const orb = await torch();
  console.log("torch without the Orb:", plain, "with the Orb:", orb);
  expect(orb.includes('"range":25') && plain.includes('"range":13.5'), "the Orb gives the party the ring of the Light spell (range 25 against 13.5)");
  await page.screenshot({ path: join(outDir, "orb-night.png") });

  // two rings worn, a third in the backpack: Ctrl + click wears it in the other slot
  await evalJs(`(() => {
    const inv = __game.state.party.characters[0].inventory;
    const ring = (name, bonus) => ({ id: "", material: 1, texture: "mm3_icon_33", value: 1, quest: false, spellId: 0, name, type: "ring", bonus });
    inv.left_ring = ring("Left Ring", { lck: 1 });
    inv.right_ring = ring("Right Ring", { lck: 2 });
    inv.slot1 = ring("Spare Ring", { lck: 3 });
  })()`);
  await page.keyboard.press("c");
  await sleep(600);
  const spare = await evalJs<boolean>(`!![...document.querySelectorAll(".slot")].find((s) => s.title === "Spare Ring")`);
  expect(spare, "the inventory shows the spare ring");
  const handle = (await page.evaluateHandle(`[...document.querySelectorAll(".slot")].find((s) => s.title === "Spare Ring")`)) as ElementHandle<Element>;
  await page.keyboard.down("Control");
  await handle.click();
  await page.keyboard.up("Control");
  await sleep(400);
  const worn = await evalJs<string[]>(`(() => { const i = __game.state.party.characters[0].inventory; return [i.left_ring?.name, i.right_ring?.name, i.slot1?.name]; })()`);
  console.log("rings after Ctrl + click:", JSON.stringify(worn));
  // the plain choice would be the left ring (a free slot first, else the first); Ctrl takes the other one
  expect(worn[1] === "Spare Ring" && worn[0] === "Left Ring" && worn[2] === "Right Ring", `Ctrl + click wears the ring in the off-hand slot (${worn.join(" | ")})`);
  await page.screenshot({ path: join(outDir, "rings.png") });
} finally {
  await browser.close();
}
console.log(problems.length ? `PROBLEMS:\n${problems.join("\n")}` : "all ok");
