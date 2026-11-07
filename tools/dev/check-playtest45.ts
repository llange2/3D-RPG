/**
 * Browser check of the 45th playtest: the wall decorations in a dungeon of each kind (a screenshot of every relief on its wall), the portrait sheets of the party
 * (all states ready as soon as the game stands), the sliders of the bank, and the closing words with the OK button. Needs a dev server
 * (`VITE_FROZEN=1 VITE_PORT=<free port> npx vite --port <free port> --strictPort`).
 *
 * Usage: GAME_URL=http://localhost:<port>/ npx tsx tools/dev/check-playtest45.ts <screenshot folder>
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
import { buildMapContent } from "../../src/actions";
import { WALL_DECO_ITEMS } from "../../src/data/wall-deco";
import { generateInterior, planDungeon } from "../../src/interiors";
import { CELL, FACING_DELTA, type Facing } from "../../src/interiors/types";
import { World } from "../../src/world/world";

const base = process.env.GAME_URL ?? "http://localhost:5185/";
const outDir = process.argv[2] ?? "playtest45-shots";
const SEED = "cedar-peak-198";
mkdirSync(outDir, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const problems: string[] = [];
const fail = (msg: string) => problems.push(msg);

// 1. in Node (the world is the same in the browser): one dungeon and one wall cell for each kind of decoration
const world = new World(SEED, "default");
const found = new Map<number, { poi: string; x: number; y: number; stand: { x: number; y: number }; facing: Facing }>();
for (const poi of world.allPois().filter((p) => p.kind === "dungeon" && planDungeon(world, p)?.klass !== "C")) {
  if (found.size === WALL_DECO_ITEMS.length) break;
  const map = generateInterior(world, poi);
  const content = buildMapContent(world, poi, map);
  const floor = (x: number, y: number) => map.cells[y * map.width + x] === CELL.FLOOR;
  for (const a of content.actions) {
    const item = Number(a.params.item);
    if (a.kind !== "decor" || !WALL_DECO_ITEMS.includes(item) || found.has(item)) continue;
    // the party stands two cells in front of the relief and looks at it: the wall is behind the cell (a, opposite of the front)
    for (const front of ["N", "E", "S", "W"] as Facing[]) {
      const d = FACING_DELTA[front];
      const back = { N: "S", E: "W", S: "N", W: "E" }[front] as Facing;
      const stand = { x: a.x + d.dx * 2, y: a.y + d.dy * 2 };
      if (floor(a.x + d.dx, a.y + d.dy) && floor(stand.x, stand.y) && !floor(a.x - d.dx, a.y - d.dy)) {
        found.set(item, { poi: poi.id, x: a.x, y: a.y, stand, facing: back });
        break;
      }
    }
  }
}
console.log("decorations found:", [...found.keys()].join(", "), "of", WALL_DECO_ITEMS.join(", "));

const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  protocolTimeout: 240000,
  args: ["--window-size=1280,720", "--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-webgl", "--autoplay-policy=no-user-gesture-required"],
  defaultViewport: { width: 1280, height: 720 },
});
try {
  const page = await browser.newPage();
  const sheetRequests: string[] = [];
  page.on("pageerror", (e) => fail(`[pageerror] ${(e as Error).message}`));
  page.on("response", (r) => {
    if (r.url().includes("/icons/portraits/sheets/")) sheetRequests.push(r.url().split("/").pop()!);
    if (r.status() >= 400) fail(`[http ${r.status()}] ${r.url()}`);
  });
  const evalJs = <T>(code: string) => page.evaluate(code) as Promise<T>;
  const shot = (name: string) => page.screenshot({ path: join(outDir, name) });
  await page.goto(`${base}?autostart=1&seed=${SEED}&size=default`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction("window.__game !== undefined", { timeout: 60000 });
  await sleep(6000);

  // 1. the portrait sheets: one request for each hero of the party, and the HUD shows cut-out pictures (blob URLs) as soon as the game stands
  const avatars = await evalJs<string[]>(`__game.state.party.characters.map((c) => c.avatar)`);
  console.log("sheets fetched:", sheetRequests.join(", "));
  for (const avatar of new Set(avatars)) if (!sheetRequests.includes(`${avatar}.webp`)) fail(`the sheet of ${avatar} was not fetched`);
  await evalJs(`(() => { const c = __game.state.party.characters[1]; c.conditions = ["Poisoned"]; __game.game.refresh(); })()`);
  await sleep(500);
  const srcs = await evalJs<string[]>(`[...document.querySelectorAll("#ui .portrait")].map((i) => i.src)`);
  console.log("portrait sources:", srcs.map((s) => s.slice(0, 40)).join(" | "));
  if (!srcs.some((s) => s.startsWith("blob:"))) fail("the HUD shows no portrait from a sheet");
  const poisoned = await evalJs<boolean>(`(() => { const imgs = [...document.querySelectorAll("#ui .portrait")]; return imgs[1] ? imgs[1].src.startsWith("blob:") : false; })()`);
  if (!poisoned) fail("the poisoned hero's picture is not the ready one");
  await shot("1-portraits.png");
  await evalJs(`(() => { __game.state.party.characters[1].conditions = ["Healthy"]; __game.game.refresh(); })()`);

  // 3. the bank: one slider for the deposit and one for the withdrawal, each with its button to the right; the sums run from a few hundred to millions
  await evalJs(`(async () => { await __game.enter("p:0:0:0"); })()`);
  await sleep(2500);
  if (!(await evalJs<boolean>(`__game.goto("service", "bank")`))) fail("the start town has no bank");
  await sleep(500);
  await page.keyboard.press("w");
  await sleep(1200);
  await evalJs(`(() => { const p = __game.state.party; p.gold = 4_300_000; p.bankGold = 250; })()`);
  // (the window reads the sums when it is drawn: leave it and come back)
  await page.keyboard.press("Escape");
  await sleep(500);
  await evalJs(`__game.goto("service", "bank")`);
  await page.keyboard.press("w");
  await sleep(1200);
  const rows = await evalJs<number>(`document.querySelectorAll(".service .bank-row input[type=range]").length`);
  if (rows !== 2) fail(`the bank has ${rows} sliders, not 2`);
  await shot("2-bank.png");
  // move the deposit slider to a third of its way and press its button: the amount on the button is what moves
  const moved = await evalJs<{ label: string; gold: number; bank: number }>(`(() => {
    const row = document.querySelector(".service .bank-row");
    const input = row.querySelector("input"); const button = row.querySelector("button");
    input.value = "300"; input.dispatchEvent(new Event("input", { bubbles: true }));
    const label = button.textContent; const before = __game.state.party.gold;
    button.click();
    return { label, gold: before - __game.state.party.gold, bank: __game.state.party.bankGold };
  })()`);
  console.log("bank:", JSON.stringify(moved));
  if (moved.gold <= 0 || moved.bank !== 250 + moved.gold) fail(`the deposit button moved ${moved.gold} gold, the vault holds ${moved.bank}`);
  await sleep(300);
  await shot("2-bank-after.png");
  await page.keyboard.press("Escape");
  await sleep(500);

  // 4. the closing words: they rise, stop in the middle of the screen and an OK button appears below them
  await evalJs(`(() => { window.__ending = __game.game.endingScroll().then(() => { window.__endingDone = true; }); })()`);
  await sleep(1500);
  await shot("3-ending-rising.png");
  const cursorHidden = await evalJs<boolean>(`document.documentElement.classList.contains("ending-on")`);
  console.log("cursor hidden during the words:", cursorHidden);
  await sleep(12000);
  const state = await evalJs<{ textMid: number; screenMid: number; button: boolean; hidden: boolean }>(`(() => {
    const screen = [...document.body.children].find((e) => e.style.zIndex === "9999");
    const text = screen.children[0]; const r = text.getBoundingClientRect();
    return { textMid: Math.round(r.top + r.height / 2), screenMid: Math.round(window.innerHeight / 2), button: !!screen.querySelector("button"), hidden: screen.querySelector("button").hidden };
  })()`);
  console.log("ending:", JSON.stringify(state));
  if (Math.abs(state.textMid - state.screenMid) > 2) fail(`the closing words stop at ${state.textMid}, not in the middle (${state.screenMid})`);
  if (state.hidden) fail("the OK button is not there when the words have stopped");
  await shot("3-ending-stopped.png");
  await evalJs(`document.querySelector("button.btn.primary").click()`);
  await sleep(500);
  if (!(await evalJs<boolean>(`window.__endingDone === true`))) fail("OK did not end the closing words");

  // 5. every wall decoration
  for (const [item, spot] of found) {
    await evalJs(`(async () => { await __game.enter("${spot.poi}"); })()`);
    await sleep(3500);
    await evalJs(`__game.teleport(${spot.stand.x}, ${spot.stand.y}, "${spot.facing}")`);
    await sleep(1200);
    await shot(`deco-${item}.png`);
    console.log("deco", item, "in", spot.poi, "at", spot.x, spot.y);
  }
} finally {
  await browser.close();
}
if (problems.length) {
  console.log("PROBLEMS:\n" + problems.join("\n"));
  process.exitCode = 1;
} else console.log("OK");
