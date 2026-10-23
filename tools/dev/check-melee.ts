/**
 * Checks the 25th playtest in the real browser (needs a dev server and Chrome, like check:spells):
 *  1. In melee (a monster next to the party) a step to a free tile is refused with the denied sound's message and the party stays where it is.
 *  2. Teleport, Jump, Town Portal and Lloyd's Beacon (return) are refused in melee through the spell window, without spending spell points.
 *  3. The scene of a Monster Hut names the monster.
 * (The queue of monsters behind the first one is a unit test: tests/unit/playtest25.test.ts.)
 *
 * Usage: tsx tools/dev/check-melee.ts <outDir> [url]      (default url http://localhost:5173/)
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const outDir = process.argv[2];
if (!outDir) throw new Error("usage: tsx tools/dev/check-melee.ts <outDir> [url]");
const base = process.argv[3] ?? "http://localhost:5173/";
mkdirSync(outDir, { recursive: true });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: ["--window-size=1280,720", "--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-webgl", "--autoplay-policy=no-user-gesture-required"],
  defaultViewport: { width: 1280, height: 720 },
});
const problems: string[] = [];
try {
  const page = await browser.newPage();
  page.on("pageerror", (e) => problems.push(`[pageerror] ${(e as Error).message}`));
  page.on("console", (m) => {
    // the fonts of the packages are served from outside the worktree when it links node_modules: not a game problem
    if (m.type() === "error" && !(m.location().url ?? "").includes("@fontsource")) problems.push(`[console] ${m.text()} ${m.location().url ?? ""}`);
  });
  await page.goto(`${base}?autostart=1&outside=1&seed=test`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction("window.__game !== undefined", { timeout: 60000 });
  await sleep(3000);
  // the loading screen is up until everything can be drawn
  await page.waitForFunction(`!document.querySelector(".loading.on")`, { timeout: 90000 });
  await sleep(1000);

  /** The log lines on screen. */
  const logText = () => page.evaluate(`document.body.innerText`) as Promise<string>;
  const here = () => page.evaluate(`({ x: __game.game.internals.player.tx, y: __game.game.internals.player.ty })`) as Promise<{ x: number; y: number }>;

  // ---- 1. a step in melee
  // one monster next to the party (on a side that is free), and another free tile to step to
  const setup = (await page.evaluate(`(async () => {
    const enc = await import("/src/sim/encounter.ts");
    const g = __game.game;
    const p = g.internals.player;
    const e = g.internals.enc;
    e.monsters.length = 0;
    const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    const open = dirs.map(([dx, dy]) => ({ x: p.tx + dx, y: p.ty + dy })).filter((c) => g.canEnter(c.x, c.y));
    if (open.length < 2) return null;
    const [a, b] = open;
    const m = enc.createMonster("check:melee", 31, a.x, a.y);
    e.monsters.push(m);
    g.addMonsterView(m);
    enc.updateBattleMode(e, p.tx, p.ty, g.gridView());
    return { monster: a, free: b, battle: e.battleMode };
  })()`)) as { monster: { x: number; y: number }; free: { x: number; y: number }; battle: boolean } | null;
  if (!setup) {
    const around = await page.evaluate(`(() => { const g = __game.game; const p = g.internals.player; return { at: [p.tx, p.ty, p.facing], mode: g.mode, free: [[0, -1], [1, 0], [0, 1], [-1, 0]].map(([dx, dy]) => g.canEnter(p.tx + dx, p.ty + dy)) }; })()`);
    throw new Error(`no free tile pair next to the party: ${JSON.stringify(around)}`);
  }
  console.log("setup:", JSON.stringify(setup));
  if (!setup.battle) problems.push("a monster next to the party did not start the fight");
  const before = await here();
  // step to the free tile: the facing is arbitrary, so ask the rig for the move that leads there
  await page.evaluate(`(() => {
    const p = __game.game.internals.player;
    const want = ${JSON.stringify(setup.free)};
    const vec = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
    for (const dir of ["forward", "right", "back", "left"]) {
      const i = ["N", "E", "S", "W"].indexOf(p.facing);
      const off = { forward: 0, right: 1, back: 2, left: 3 }[dir];
      const f = ["N", "E", "S", "W"][(i + off) % 4];
      if (p.tx + vec[f][0] === want.x && p.ty + vec[f][1] === want.y) { p.command({ type: "move", dir }); return; }
    }
  })()`);
  await sleep(700);
  const after = await here();
  console.log("step in melee:", JSON.stringify(before), "->", JSON.stringify(after));
  if (after.x !== before.x || after.y !== before.y) problems.push("the party stepped away from a fight");
  if (!(await logText()).includes("cannot step away from a fight")) problems.push("a refused step says nothing");
  await page.screenshot({ path: join(outDir, "melee-step.png") });

  // ---- 2. the spells that carry the party away
  await page.evaluate(`(() => { const c = __game.state.party.characters[3]; c.classType = "Cleric"; c.level = 12; c.mana = c.sp = 900; c.spells = [47, 16, 66, 32]; c.beacon = { mode: "overworld", x: 5, y: 5, facing: "N" }; })()`);
  const clickOptionWith = (text: string) =>
    page.evaluate(`(() => { const o = [...document.querySelectorAll(".modal-back .opt")].find((e) => e.textContent.includes(${JSON.stringify(text)})); if (!o) return false; o.click(); return true; })()`) as Promise<boolean>;
  const spellPoints = () => page.evaluate(`__game.state.party.characters[3].sp`) as Promise<number>;
  const TITLES: Record<number, string> = { 47: "Teleport", 16: "Jump", 66: "Town Portal", 32: "Lloyd's Beacon" };
  for (const id of [47, 16, 66, 32]) {
    const sp = await spellPoints();
    const start = await here();
    let opened = false;
    for (let attempt = 0; attempt < 8 && !opened; attempt++) {
      await page.keyboard.press("f");
      await sleep(350);
      if (await clickOptionWith("Lyneth")) opened = true;
      else {
        await page.evaluate(`(() => { const b = document.querySelector(".modal-back .btn:last-child"); if (b) b.click(); })()`);
        await sleep(500);
      }
    }
    await page.waitForSelector(".spell-grid .spell-slot", { timeout: 5000 });
    const clicked = await page.evaluate(`(() => { const s = [...document.querySelectorAll(".spell-grid .spell-slot")].find((e) => e.title.startsWith(${JSON.stringify(TITLES[id])} + " (")); if (!s) return false; s.click(); return true; })()`);
    if (!clicked) {
      problems.push(`${TITLES[id]} is not in the spell window`);
      await page.keyboard.press("Escape");
      continue;
    }
    await sleep(400);
    // Lloyd's Beacon asks whether to set the fire or go back
    if (id === 32) await clickOptionWith("back");
    await sleep(500);
    const text = await logText();
    const now = await here();
    const refused = text.includes("cannot be cast during a fight");
    console.log(`${TITLES[id]}: refused=${refused} sp ${sp} -> ${await spellPoints()} at ${JSON.stringify(now)}`);
    if (!refused) problems.push(`${TITLES[id]} was not refused in melee`);
    if ((await spellPoints()) !== sp) problems.push(`${TITLES[id]} cost spell points in melee`);
    if (now.x !== start.x || now.y !== start.y) problems.push(`${TITLES[id]} moved the party in melee`);
    await page.evaluate(`(() => { document.querySelectorAll(".modal-back").forEach((m) => m.remove()); __game.game.busy = false; })()`);
    await sleep(200);
  }
  await page.screenshot({ path: join(outDir, "melee-spell.png") });

  // ---- 3. the hut
  const hut = (await page.evaluate(`(async () => {
    const m = await import("/src/world/huts.ts");
    const t = await import("/src/data/hut-texts.ts");
    const tables = await import("/src/data/tables.ts");
    const world = __game.world;
    const h = m.hutsOf(world)[0];
    return { id: h.id, monster: tables.MONSTERS[h.monster].name, scene: t.hutScene(h.monster), slots: h.slots.length, per: m.hutMonsters(world.size), percent: m.hutXpPercent(world.size), size: world.size };
  })()`)) as { id: string; monster: string; scene: string; slots: number; per: number; percent: number; size: string };
  console.log("hut:", JSON.stringify(hut));
  if (!hut.scene.includes(`hut of the ${hut.monster}.`)) problems.push("the hut scene does not name its monster");
} catch (e) {
  problems.push(`[script] ${(e as Error).message}`);
} finally {
  await browser.close();
}

if (problems.length > 0) {
  console.log("PROBLEMS:\n" + problems.join("\n"));
  process.exit(1);
}
console.log("OK");
