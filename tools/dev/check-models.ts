/**
 * Checks the model switch of the menu in the real browser (needs the dev server, Chrome and `npm run assets:originals`):
 *  1. A fresh browser loads only low-poly models; the options offer "Models: low poly"; Back keeps the page.
 *  2. Apply with the switch turned over saves, reloads and continues the same game (position, party, no title screen) with originals only:
 *     overworld, a town and a monster all come from models-original/, nothing from models/.
 *  3. Switching back loads the low-poly set again, again with the same game.
 *  4. Without the original registry (blocked here), ?models=original falls back to low poly and Apply refuses to switch.
 *  5. The campaign starts with originals.
 *
 * Usage: tsx tools/dev/check-models.ts <outDir> [url]      (default url http://localhost:5173/)
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer, { type Page } from "puppeteer-core";

const outDir = process.argv[2] ?? "";
if (!outDir) throw new Error("usage: tsx tools/dev/check-models.ts <outDir> [url]");
const base = process.argv[3] ?? "http://localhost:5173/";
mkdirSync(outDir, { recursive: true });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: ["--window-size=1280,800", "--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-webgl", "--autoplay-policy=no-user-gesture-required"],
  defaultViewport: { width: 1280, height: 800 },
});
const problems: string[] = [];
const expect = (ok: boolean, what: string) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) problems.push(what);
};

interface Probe {
  page: Page;
  /** glb files requested since the last `reset`, by folder */
  glbs: () => { lowpoly: string[]; original: string[] };
  reset: () => void;
}

/** A page in its own browser context (clean localStorage and sessionStorage). */
async function openPage(query: string, block?: RegExp): Promise<Probe> {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  let urls: string[] = [];
  page.on("pageerror", (e) => problems.push(`[pageerror] ${(e as Error).message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !(block && m.text().includes("Failed to load resource"))) problems.push(`[console] ${m.text()}`);
  });
  page.on("response", (r) => {
    if (r.status() >= 400 && !(block && block.test(r.url()))) problems.push(`[http ${r.status()}] ${r.url()}`);
  });
  page.on("request", (r) => {
    if (r.url().endsWith(".glb")) urls.push(new URL(r.url()).pathname);
  });
  if (block) {
    await page.setRequestInterception(true);
    page.on("request", (r) => void (block.test(r.url()) ? r.respond({ status: 404, body: "" }) : r.continue()));
  }
  await page.goto(`${base}${query}`, { waitUntil: "load", timeout: 60000 });
  await ready(page);
  return {
    page,
    glbs: () => ({ lowpoly: urls.filter((u) => /\/assets\/models\//.test(u)), original: urls.filter((u) => /\/assets\/models-original\//.test(u)) }),
    reset: () => void (urls = []),
  };
}

const ready = async (page: Page) => {
  await page.waitForFunction("window.__game !== undefined && window.__game.state !== undefined", { timeout: 60000 });
  await sleep(2500);
};
const evalJs = <T>(page: Page, code: string) => page.evaluate(code) as Promise<T>;
const click = (page: Page, selector: string, text: string) =>
  evalJs<boolean>(
    page,
    `(() => {
      const els = [...document.querySelectorAll(${JSON.stringify(selector)})].filter((e) => e.textContent.includes(${JSON.stringify(text)}));
      if (!els[0]) return false;
      els[0].click();
      return true;
    })()`,
  );
// the camera, not state.at: the state only learns the position when it is saved
const where = (page: Page) =>
  evalJs<string>(
    page,
    `JSON.stringify({ mode: __game.game.mode, x: Math.round(__game.camera.position.x * 10), z: Math.round(__game.camera.position.z * 10), yaw: Math.round(__game.camera.rotation.y * 100), party: __game.state.party.characters.map((c) => c.name), seed: __game.state.seed })`,
  );

/**
 * Opens the menu and the options, turns the models switch over and answers: Apply puts it into effect, Back drops it. Returns the label the
 * switch showed after the click ("" when there is none).
 */
async function pressModels(page: Page, answer: "Apply" | "Back", shot?: string): Promise<string> {
  await page.keyboard.press("Escape");
  await sleep(400);
  if (shot) await page.screenshot({ path: join(outDir, `${shot}-menu.png`) });
  if (!(await click(page, ".parchment .opt", "Options"))) return "";
  await sleep(300);
  if (!(await click(page, ".parchment .opt", "Models:"))) return "";
  await sleep(200);
  const label = await evalJs<string>(page, `[...document.querySelectorAll(".parchment .opt")].map((e) => e.textContent.trim()).find((t) => t.startsWith("Models:")) ?? ""`);
  if (shot) await page.screenshot({ path: join(outDir, `${shot}-options.png`) });
  await click(page, ".parchment .buttons .btn", answer);
  if (answer === "Back") {
    // back in the menu, which closes with Escape
    await sleep(200);
    await page.keyboard.press("Escape");
  }
  return label;
}

const reloaded = async (page: Page, marker: string) => {
  await page.waitForFunction(`window.${marker} === undefined && window.__game !== undefined && window.__game.state !== undefined`, { timeout: 60000 });
  await sleep(3500);
};

try {
  // ---- 1. low poly in a fresh browser
  const a = await openPage("?autostart=1&outside=1&seed=test");
  expect((await evalJs<string>(a.page, "__game.modelSet")) === "lowpoly", "a fresh browser starts with the low-poly set");
  expect(a.glbs().original.length === 0 && a.glbs().lowpoly.length > 0, `only low-poly models were requested (${a.glbs().lowpoly.length})`);
  // a few steps and a turn, so that the position to come back to is not the start
  for (const key of ["w", "w", "e", "w"] as const) {
    await a.page.keyboard.press(key);
    await sleep(600);
  }
  await sleep(500);
  const before = await where(a.page);
  console.log("before:", before);
  await evalJs(a.page, "window.marker = 1");

  expect((await pressModels(a.page, "Back", "0")) === "Models: original", "the options offer the switch to original models");
  await sleep(500);
  expect((await evalJs<number>(a.page, "window.marker")) === 1, "Back keeps the page");
  await a.page.screenshot({ path: join(outDir, "1-low-poly-overworld.png") });

  // ---- 2. to the originals
  a.reset();
  await pressModels(a.page, "Apply");
  await reloaded(a.page, "marker");
  expect((await evalJs<string>(a.page, "__game.modelSet")) === "original", "after the reload the original set is active");
  expect((await where(a.page)) === before, "the same game continues (mode, position, party, seed), without the title screen");
  expect(!new URL(a.page.url()).searchParams.has("models"), "no ?models= is left in the address");
  const o1 = a.glbs();
  expect(o1.lowpoly.length === 0 && o1.original.length > 0, `the overworld loads only original models (${o1.original.length})`);
  await a.page.screenshot({ path: join(outDir, "2-original-overworld.png") });

  a.reset();
  await evalJs(a.page, `(async () => { await __game.enter("p:0:0:0"); })()`);
  await sleep(3000);
  await a.page.screenshot({ path: join(outDir, "3-original-town.png") });
  await evalJs(a.page, "__game.leave()");
  await sleep(1500);
  await evalJs(a.page, "__game.gotoMonster(3)");
  await sleep(3000);
  await a.page.screenshot({ path: join(outDir, "4-original-monster.png") });
  const o2 = a.glbs();
  // the monsters of the overworld were loaded with the first look (`o1`), so a monster counts from either list
  expect(o2.lowpoly.length === 0 && [...o1.original, ...o2.original].some((u) => /monster_\d+\.glb$/.test(u)) && o2.original.some((u) => /\/obj_/.test(u)), `town objects and a monster come from the originals (${o2.original.length} files, none from models/)`);

  // ---- 3. back to low poly
  await evalJs(a.page, "window.marker2 = 1");
  const mid = await where(a.page);
  a.reset();
  expect((await pressModels(a.page, "Apply")) === "Models: low poly", "the options offer the way back");
  await reloaded(a.page, "marker2");
  expect((await evalJs<string>(a.page, "__game.modelSet")) === "lowpoly", "after the second reload the low-poly set is active again");
  expect((await where(a.page)) === mid, "the game continues again");
  expect(a.glbs().original.length === 0 && a.glbs().lowpoly.length > 0, "only low-poly models were requested again");
  await a.page.screenshot({ path: join(outDir, "5-low-poly-again.png") });
  await a.page.browserContext().close();

  // ---- 4. originals not built (registry answers 404)
  const b = await openPage("?autostart=1&outside=1&seed=test&models=original", /models\.(static|monsters)\.original\.json/);
  expect((await evalJs<string>(b.page, "__game.modelSet")) === "lowpoly", "?models=original without built originals falls back to the low-poly set");
  expect(b.glbs().original.length === 0, "and loads no original file");
  await evalJs(b.page, "window.marker = 1");
  await pressModels(b.page, "Apply");
  await sleep(600);
  const toast = await evalJs<string>(b.page, `document.querySelector(".toast")?.textContent ?? ""`);
  expect(toast.includes("not built"), `Apply refuses with a message (${JSON.stringify(toast)})`);
  expect((await evalJs<number>(b.page, "window.marker")) === 1, "and does not reload");
  await b.page.screenshot({ path: join(outDir, "6-originals-missing.png") });
  await b.page.browserContext().close();

  // ---- 5. the campaign with originals
  const c = await openPage("?autostart=1&outside=1&campaign=1&seed=test&models=original");
  const co = c.glbs();
  expect((await evalJs<string>(c.page, "__game.modelSet")) === "original" && co.lowpoly.length === 0 && co.original.length > 0, `the campaign loads original models only (${co.original.length})`);
  await c.page.screenshot({ path: join(outDir, "7-original-campaign.png") });
  await c.page.browserContext().close();
} finally {
  await browser.close();
}

if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):\n${[...new Set(problems)].join("\n")}`);
  process.exit(1);
}
console.log("\nmodel switch ok");
