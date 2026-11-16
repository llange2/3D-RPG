/**
 * quest_8, the crystal paths (quest document 1.10): the way a player handles the crystals, in the browser (needs a dev server, `VITE_FROZEN=1 VITE_PORT=<free port> npx vite --port <free port> --strictPort`).
 * A crystal goes into a backpack, is set down with a right click in the character screen, taken back by bumping into it, and is left behind when the party goes out of the place.
 *
 * Usage: GAME_URL=http://localhost:<port>/ npx tsx tools/dev/check-quest8-play.ts <folder> <seed> <place name>
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
import { buildMapContent } from "../../src/actions";
import { generateInterior } from "../../src/interiors";
import { CELL, FACING_DELTA, type Facing } from "../../src/interiors/types";
import { World } from "../../src/world/world";

const base = process.env.GAME_URL ?? "http://localhost:5191/";
const [outDir = "q8-play", seed = "birch-reach-493", name = "Sepulchre of Dunora"] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const world = new World(seed, "default", (process.env.DUNGEONS ?? "default") as never);
const poi = world.allPois().find((p) => p.name.toLowerCase() === name.toLowerCase() || p.id === name);
if (!poi) throw new Error(`no place named ${name}`);
const map = generateInterior(world, poi, 0);
const content = buildMapContent(world, poi, map);
const first = content.actions.find((a) => a.kind === "crystal" && typeof a.params.solution === "string");
if (!first) throw new Error("no crystal paths here");
const [cx, cy] = String(first.params.solution).split(";")[0]!.split(",").map(Number) as [number, number];
// a floor cell next to the first crystal's cell, looking at it
const dirs: Facing[] = ["N", "E", "S", "W"];
const stand = dirs.map((f) => ({ f, x: cx - FACING_DELTA[f].dx, y: cy - FACING_DELTA[f].dy })).find((s) => map.cells[s.y * map.width + s.x] === CELL.FLOOR)!;
console.log(`${poi.name}: first crystal of the solution at ${cx}/${cy}, the party stands at ${stand.x}/${stand.y} looking ${stand.f}`);

const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  protocolTimeout: 240000,
  args: ["--window-size=1280,720", "--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-webgl", "--autoplay-policy=no-user-gesture-required"],
  defaultViewport: { width: 1280, height: 720 },
});
try {
  const page = await browser.newPage();
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(`[pageerror] ${(e as Error).message}`));
  page.on("console", (m) => {
    if ((m.type() === "error" || m.type() === "warn") && !/403|Failed to load resource/.test(m.text())) problems.push(`[console ${m.type()}] ${m.text().slice(0, 300)}`);
  });
  await page.goto(`${base}?autostart=1&seed=${seed}&size=default&dungeons=${process.env.DUNGEONS ?? "default"}&outside=1`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction("window.__game !== undefined", { timeout: 60000 });
  await sleep(5000);
  await page.evaluate(`(async () => { await __game.enter(${JSON.stringify(poi.id)}); })()`);
  await sleep(4500);
  await page.evaluate("__game.game.enc.monsters.splice(0)");
  await page.evaluate(`__game.teleport(${stand.x}, ${stand.y}, ${JSON.stringify(stand.f)})`);
  await sleep(1500);
  const crystalItem = `{ id: "", name: "Crystal inside Holder", type: "quest_crystal_holder", material: 0, texture: "quest_crystal_holder", value: -1, quest: true, spellId: 0, bonus: {} }`;
  const state = async (): Promise<string> => String(await page.evaluate("JSON.stringify({ flags: [...__game.state.opened].filter((k) => k.startsWith('crystal:')), bag: Object.values(__game.state.party.characters[0].inventory).filter((i) => i && i.type === 'quest_crystal_holder').length, loot: Object.values(__game.state.loot).flat().map((p) => p.items.length) })"));
  await page.evaluate(`(() => { const inv = __game.state.party.characters[0].inventory; inv.slot1 = ${crystalItem}; inv.slot2 = ${crystalItem}; __game.game.refresh(); })()`);
  console.log("start        ", await state());

  // set one down with a right click in the character screen
  await page.keyboard.press("c");
  await sleep(1200);
  await page.screenshot({ path: join(outDir, "01-inventory.png") });
  const slot = await page.$(".slots .slot");
  if (!slot) throw new Error("no slot in the character screen");
  await slot.hover();
  await sleep(500);
  await page.screenshot({ path: join(outDir, "02-tooltip.png") });
  await slot.click({ button: "right" });
  await sleep(1800);
  console.log("set down     ", await state());
  await page.screenshot({ path: join(outDir, "03-set-down.png") });

  // bump into it: the question comes, the crystal returns to the backpack
  await page.keyboard.press("w");
  await sleep(1500);
  await page.screenshot({ path: join(outDir, "04-take-back-question.png") });
  const take = await page.$$eval(".btn", (bs) => bs.map((b) => b.textContent));
  console.log("buttons      ", JSON.stringify(take));
  await page.evaluate("[...document.querySelectorAll('.btn')].find((b) => b.textContent === 'Take it')?.click()");
  await sleep(1200);
  console.log("taken back   ", await state());

  // leave the place with both crystals in the backpack: told, then left on the floor
  await page.evaluate(`(() => { __game.game.state.party.characters[0].inventory.slot3 = ${crystalItem}; })()`);
  console.log("before leaving", await state());
  const leaving = page.evaluate("__game.leave()");
  await sleep(1500);
  await page.screenshot({ path: join(outDir, "05-leave-question.png") });
  // the exit asks first; then the message about the crystals
  for (let i = 0; i < 6; i++) {
    const labels = await page.$$eval(".btn", (bs) => bs.map((b) => b.textContent ?? ""));
    const text = await page.$eval("body", (b) => b.innerText);
    if (/bound to this place/.test(text)) {
      await page.screenshot({ path: join(outDir, "06-bound.png") });
      console.log("message      ", "crystals are bound to this place");
    }
    const yes = labels.find((l) => ["OK", "Leave", "Yes"].includes(l.trim()));
    if (!yes) break;
    await page.evaluate(`[...document.querySelectorAll('.btn')].find((b) => b.textContent.trim() === ${JSON.stringify(yes.trim())})?.click()`);
    await sleep(1200);
  }
  await Promise.race([leaving, sleep(15000)]);
  await sleep(4000);
  console.log("after leaving", await state(), "mode", await page.evaluate("__game.game.mode"));
  if (problems.length > 0) console.log("PROBLEMS:\n" + problems.join("\n"));
  console.log("done");
} finally {
  await browser.close();
}
