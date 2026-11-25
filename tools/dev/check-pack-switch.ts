/**
 * Browser check of the two versions of the game (Classic and Fantastic Islands, `docs/PLAN_FANTASTIC_ISLANDS.md`): the switch in Options > Controls, the reload, the title of each version
 * and the saves, which the two keep apart. Needs a dev server (`VITE_FROZEN=1 VITE_PORT=<free port> npx vite --port <free port> --strictPort`).
 *
 * Usage: GAME_URL=http://localhost:<port>/ npx tsx tools/dev/check-pack-switch.ts <folder for the screenshots>
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer, { type Page } from "puppeteer-core";

const base = process.env.GAME_URL ?? "http://localhost:5199/";
const shots = process.argv[2];
if (shots) mkdirSync(shots, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const problems: string[] = [];
const expect = (ok: boolean, what: string) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) problems.push(what);
};

const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  protocolTimeout: 240000,
  args: ["--window-size=1280,720", "--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-webgl"],
  defaultViewport: { width: 1280, height: 720 },
});

const evalJs = <T>(page: Page, code: string) => page.evaluate(code) as Promise<T>;
const shot = async (page: Page, name: string) => {
  if (shots) await page.screenshot({ path: join(shots, `${name}.png`) });
};
/** Clicks the first button whose text starts with `text`. */
const clickButton = (page: Page, text: string) => evalJs<boolean>(page, `(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim().startsWith(${JSON.stringify(text)})); if (b) b.click(); return !!b; })()`);
/** Clicks the settings row (toggle or button) whose label starts with `text`. */
const clickRow = (page: Page, text: string) => evalJs<boolean>(page, `(() => { const r = [...document.querySelectorAll(".opt")].find((x) => x.textContent.trim().startsWith(${JSON.stringify(text)})); if (r) r.click(); return !!r; })()`);
const rowText = (page: Page, text: string) => evalJs<string>(page, `(() => { const r = [...document.querySelectorAll(".opt")].find((x) => x.textContent.trim().startsWith(${JSON.stringify(text)})); return r ? r.textContent.trim() : ""; })()`);
const store = (page: Page, key: string) => evalJs<string | null>(page, `localStorage.getItem(${JSON.stringify(key)})`);
const stored = async (page: Page) => JSON.parse((await store(page, "mm3-seed-rpg:settings:v1")) ?? "{}") as { pack?: string };

try {
  const page = await browser.newPage();
  page.on("pageerror", (e) => problems.push(`[pageerror] ${(e as Error).message}`));

  // ---- Classic: a game in progress
  await page.goto(`${base}?autostart=1&outside=1&seed=pack-check&size=small&dungeons=few`, { waitUntil: "load", timeout: 60000 });
  await evalJs(page, `localStorage.clear()`);
  await page.goto(`${base}?autostart=1&outside=1&seed=pack-check&size=small&dungeons=few`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction("window.__game !== undefined", { timeout: 60000 });
  await sleep(4000);
  expect((await evalJs<number>(page, `document.querySelectorAll(".title-version").length`)) === 0, "Classic shows no version mark on the title");
  expect((await evalJs<string>(page, `__game.state.seed`)) === "pack-check", "Classic game started");

  // ---- Options > Controls: the version row
  await page.keyboard.press("Escape");
  await sleep(600);
  expect(await clickRow(page, "Options"), "the menu has Options");
  await sleep(500);
  expect(await clickRow(page, "Controls"), "Options has Controls");
  await sleep(500);
  expect((await rowText(page, "Version")) === "Version: Classic", `the Controls window shows "Version: Classic" (${await rowText(page, "Version")})`);
  await shot(page, "1-controls-classic");
  await clickRow(page, "Version");
  await sleep(200);
  const flipped = await rowText(page, "Version");
  expect(flipped === "Version: Fantastic Islands (the game reloads)", `the row flips to Fantastic Islands and says it reloads (${flipped})`);
  await shot(page, "2-controls-flipped");
  // another click takes it back, and Back leaves nothing behind
  await clickRow(page, "Version");
  expect((await rowText(page, "Version")) === "Version: Classic", "a second click flips it back");
  await clickRow(page, "Version");

  // ---- Apply: the game is saved in Classic, the page reloads to the title of Fantastic Islands
  const reloaded = page.waitForNavigation({ waitUntil: "load", timeout: 60000 });
  await clickButton(page, "Apply");
  await reloaded;
  await page.waitForFunction("document.querySelector('.title') !== null", { timeout: 60000 });
  await sleep(1500);
  expect((await evalJs<string>(page, `document.querySelector(".title-version")?.textContent ?? ""`)) === "Fantastic Islands", "the title of the other version names itself");
  expect((await stored(page)).pack === "fantastic", "the choice is stored");
  expect((await store(page, "mm3-seed-rpg:save:v1")) !== null, "the game in progress was saved as Classic's autosave");
  expect((await store(page, "mm3-seed-rpg:fantastic:save:v1")) === null, "Fantastic Islands has no save yet");
  expect(await evalJs<boolean>(page, `[...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Load game")?.disabled === true`), "Fantastic Islands offers no save to load (Classic's stay out of its list)");
  await shot(page, "3-title-fantastic");

  // ---- Fantastic Islands: a game of its own, saved under its own keys
  await page.goto(`${base}?autostart=1&outside=1&seed=other-world&size=small&dungeons=few`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction("window.__game !== undefined", { timeout: 60000 });
  await sleep(4000);
  expect((await evalJs<string>(page, `__game.state.seed`)) === "other-world", "a game starts in Fantastic Islands");
  await evalJs(page, `__game.game.save("auto")`);
  expect((await store(page, "mm3-seed-rpg:fantastic:save:v1")) !== null, "its autosave is under Fantastic's key");
  const classicSave = await evalJs<string>(page, `(() => { const raw = localStorage.getItem("mm3-seed-rpg:save:v1"); return raw ? "present" : "missing"; })()`);
  expect(classicSave === "present", "Classic's autosave is untouched");

  // ---- back to Classic: its game is still there
  await page.keyboard.press("Escape");
  await sleep(600);
  await clickRow(page, "Options");
  await sleep(500);
  await clickRow(page, "Controls");
  await sleep(500);
  expect((await rowText(page, "Version")) === "Version: Fantastic Islands", `the window shows the version in use (${await rowText(page, "Version")})`);
  await clickRow(page, "Version");
  const back = page.waitForNavigation({ waitUntil: "load", timeout: 60000 });
  await clickButton(page, "Apply");
  await back;
  await page.waitForFunction("document.querySelector('.title') !== null", { timeout: 60000 });
  await sleep(1500);
  expect((await evalJs<number>(page, `document.querySelectorAll(".title-version").length`)) === 0, "Classic's title is as it was (no mark)");
  expect((await stored(page)).pack === "classic", "the choice is stored again as Classic");
  expect(await evalJs<boolean>(page, `[...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Load game")?.disabled === false`), "Classic offers its own saves again");
  await shot(page, "4-title-classic");

  // ---- an address parameter wins for one session and is dropped by a switch
  await page.goto(`${base}?pack=fantastic`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction("document.querySelector('.title') !== null", { timeout: 60000 });
  await sleep(1000);
  expect((await evalJs<string>(page, `document.querySelector(".title-version")?.textContent ?? ""`)) === "Fantastic Islands", "?pack=fantastic starts that version");
  expect((await stored(page)).pack === "classic", "and does not change the stored choice");
} finally {
  await browser.close();
}
if (problems.length) {
  console.log("PROBLEMS:\n" + problems.join("\n"));
  process.exitCode = 1;
} else console.log("OK");
