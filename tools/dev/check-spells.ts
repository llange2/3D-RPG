/**
 * Checks the spell window and a handful of the new spells in the real browser (needs a dev server and Chrome, like check:effects):
 *  1. The spell window shows every plate of the school with the most spells (36) at once, inside the window, with a cost on each.
 *  2. It opens without waiting for pictures (the sheet is decoded at start-up) and reads a spell when the pointer is over its plate.
 *  3. Casting through the window works for spells that need a hero (Half For Me), the map (Detect Monster), a monster (Dimensional
 *     Phasing paints it purple) and for Lloyd's Beacon (Set), without errors in the console.
 *
 * Usage: tsx tools/dev/check-spells.ts <outDir> [url]      (default url http://localhost:5173/)
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const outDir = process.argv[2];
if (!outDir) throw new Error("usage: tsx tools/dev/check-spells.ts <outDir> [url]");
const base = process.argv[3] ?? "http://localhost:5173/";
mkdirSync(outDir, { recursive: true });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const width = Number(process.env.CHECK_WIDTH ?? 1280);
const height = Number(process.env.CHECK_HEIGHT ?? 720);
const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: [`--window-size=${width},${height}`, "--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-webgl", "--autoplay-policy=no-user-gesture-required"],
  defaultViewport: { width, height },
});
const problems: string[] = [];
let shot: (name: string) => Promise<void> = async () => undefined;
try {
  const page = await browser.newPage();
  shot = async (name) => {
    await page.screenshot({ path: join(outDir, name) });
  };
  page.on("pageerror", (e) => problems.push(`[pageerror] ${(e as Error).message}`));
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`[console] ${m.text()}`);
  });
  await page.goto(`${base}?autostart=1&outside=1&seed=test`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction("window.__game !== undefined", { timeout: 60000 });
  await sleep(3000);

  // the party's cleric knows all 36 spells of the Clerical school
  await page.evaluate(`(() => {
    const p = __game.state.party;
    const c = p.characters[3];
    c.classType = "Cleric";
    c.spells = ${JSON.stringify([] as number[])};
    c.mana = c.sp = 900;
    c.level = 12;
    p.food = 3;
  })()`);
  const clerical = (await page.evaluate(`(() => {
    const out = [];
    for (let id = 1; id <= 78; id++) out.push(id);
    return out;
  })()`)) as number[];
  const learn = async (ids: number[]) =>
    page.evaluate(`(() => { const c = __game.state.party.characters[3]; c.spells = ${JSON.stringify(ids)}; })()`);
  // the ids of the school come from the game's own table: the Clerical spells
  const ids = (await page.evaluate(`(async () => {
    const m = await import("/src/data/tables.ts");
    return Object.values(m.SPELLS).filter((s) => s.type.includes("Clerical")).map((s) => s.id);
  })()`)) as number[];
  void clerical;
  console.log("clerical spells:", ids.length);
  await learn(ids);

  const clickOptionWith = (text: string) =>
    page.evaluate(`(() => { const o = [...document.querySelectorAll(".modal-back .opt")].find((e) => e.textContent.includes(${JSON.stringify(text)})); if (!o) return false; o.click(); return true; })()`) as Promise<boolean>;

  /** Presses F until the "Who casts?" list is there (the game may still be busy with a step or a loading screen), then picks Lyneth. */
  const openMenu = async (): Promise<boolean> => {
    for (let attempt = 0; attempt < 8; attempt++) {
      await page.keyboard.press("f");
      await sleep(350);
      if (await clickOptionWith("Lyneth")) return true;
      const state = await page.evaluate(`({ busy: __game.game.busy, over: __game.game.over, modals: document.querySelectorAll(".modal-back").length, text: (document.querySelector(".modal-back") || {}).innerText })`);
      console.log("menu not open yet:", JSON.stringify(state));
      await page.evaluate(`(() => { const b = document.querySelector(".modal-back .btn:last-child"); if (b) b.click(); })()`);
      await sleep(600);
    }
    return false;
  };

  // ---- 1 + 2. the window
  const picked = await openMenu();
  const t0 = Date.now();
  await page.waitForSelector(".spell-grid .spell-slot", { timeout: 5000 });
  console.log("window open after", Date.now() - t0, "ms (picked the caster:", picked, ")");
  await sleep(300);
  const layout = (await page.evaluate(`(() => {
    const slots = [...document.querySelectorAll(".spell-grid .spell-slot")];
    const rect = (e) => e.getBoundingClientRect();
    const box = document.querySelector(".parchment.spells");
    const inside = slots.every((s) => { const r = rect(s); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; });
    const painted = slots.filter((s) => { const i = s.querySelector(".spell-icon"); return i && getComputedStyle(i).backgroundImage !== "none"; }).length;
    const costs = slots.filter((s) => s.querySelector(".spell-cost")).length;
    return { slots: slots.length, inside, painted, costs, box: box ? { w: rect(box).width, h: rect(box).height, scroll: box.scrollHeight > box.clientHeight + 2 } : null, slotW: slots[0] ? rect(slots[0]).width : 0, rows: new Set(slots.map((s) => Math.round(rect(s).top))).size };
  })()`)) as { slots: number; inside: boolean; painted: number; costs: number; box: { w: number; h: number; scroll: boolean } | null; slotW: number; rows: number };
  console.log("layout:", JSON.stringify(layout));
  if (layout.slots !== 36) problems.push(`expected 36 plates, saw ${layout.slots}`);
  if (!layout.inside) problems.push("some plates lie outside the window");
  if (layout.painted !== layout.slots) problems.push(`only ${layout.painted} of ${layout.slots} plates have a picture`);
  if (layout.costs !== layout.slots) problems.push("a plate has no cost");
  if (layout.box?.scroll) problems.push("the spell window needs to scroll");
  if (layout.rows > 4) problems.push(`the plates take ${layout.rows} rows`);
  await page.hover(".spell-grid .spell-slot:nth-child(5)");
  await sleep(150);
  const info = (await page.evaluate(`document.querySelector(".spell-info").innerText`)) as string;
  console.log("info:", info.replace(/\n/g, " | "));
  if (!/level \d+/.test(info)) problems.push("the info line shows nothing for the plate under the pointer");
  await page.screenshot({ path: join(outDir, "spell-window.png") });
  await page.keyboard.press("Escape");
  await sleep(300);

  // ---- 3. casting
  const cast = async (spellId: number, then?: () => Promise<void>, keepHurt = false) => {
    // wild monsters wake up around the party and would end the test: the heroes are whole and nobody is about
    await page.evaluate(`(() => { const p = __game.state.party; for (const c of p.characters) { if (!${keepHurt}) c.hp = c.health = Math.max(c.health, 9999); c.conditions = ["Healthy"]; } if (window.__keepMonsters !== true) { const e = __game.game.internals.enc; e.monsters.length = 0; e.battleMode = false; e.sequence = []; e.attacker = null; } })()`);
    await openMenu();
    await page.waitForSelector(".spell-grid .spell-slot", { timeout: 5000 });
    const ok = (await page.evaluate(`(() => { const t = ${JSON.stringify(SPELL_TITLES)}[${spellId}]; const s = [...document.querySelectorAll(".spell-grid .spell-slot")].find((e) => e.title.startsWith(t + " (")); if (!s) return false; s.click(); return true; })()`)) as boolean;
    if (!ok) {
      problems.push(`spell ${spellId} is not in the window`);
      await page.keyboard.press("Escape");
      return;
    }
    await sleep(300);
    if (then) await then();
    await sleep(500);
  };
  const SPELL_TITLES: Record<number, string> = {
    36: "Detect Monster", 56: "Half For Me", 33: "Power Shield", 57: "Emergency rations", 52: "Super Shelter", 32: "Lloyd's Beacon", 45: "Nature's Gate", 47: "Teleport",
    42: "Time Distortion", 22: "Gravity", 2: "Pandora's box", 55: "Combine", 66: "Town Portal", 13: "Dimensional Phasing", 26: "Identify Monster",
  };
  const state = () => page.evaluate(`(() => { const p = __game.state.party; return { food: p.food, hp: p.characters.map((c) => c.hp), effects: p.effects.map((e) => e.kind), beacon: !!p.characters[3].beacon }; })()`) as Promise<{ food: number; hp: number[]; effects: string[]; beacon: boolean }>;

  // Detect Monster and Power Shield are Arcane: the cleric learns them for this part
  await page.evaluate(`(() => { const c = __game.state.party.characters[3]; c.spells = [33, 36, 56, 57, 52]; c.sp = 900; })()`);
  await cast(36);
  console.log("after Detect Monster:", JSON.stringify(await state()));
  if (!(await state()).effects.includes("detect_monster")) problems.push("Detect Monster left no effect");
  await cast(33);
  if (!(await state()).effects.includes("power_shield")) problems.push("Power Shield left no effect");
  const shield = (await page.evaluate(`!!document.querySelector('.status-icons img[src*="power_shield"]')`)) as boolean;
  if (!shield) problems.push("Power Shield shows no status icon");
  await page.screenshot({ path: join(outDir, "power-shield.png") });
  await page.evaluate(`(() => { __game.state.party.food = 0; })()`);
  await cast(57);
  if ((await state()).food !== 1) problems.push("Emergency rations made no food");

  // a hero hurt, the cleric pays for Half For Me
  await page.evaluate(`(() => { const p = __game.state.party; p.characters[0].hp = Math.max(1, p.characters[0].health - 30); })()`);
  const before = await state();
  await cast(
    56,
    async () => {
      await clickOptionWith("Maximus");
    },
    true,
  );
  const after = await state();
  console.log("Half For Me:", before.hp.join("/"), "->", after.hp.join("/"));
  if (!(after.hp[0]! > before.hp[0]!) || !(after.hp[3]! < before.hp[3]!)) problems.push("Half For Me did not move hit points from the caster to the hero");

  // a monster: Dimensional Phasing paints it purple and stops it
  await page.evaluate(`window.__keepMonsters = true`);
  await page.evaluate(`(async () => { await __game.enter(__game.firstPoi("dungeon")); })()`);
  await sleep(2500);
  if (!(await page.evaluate(`__game.gotoMonster(2)`))) problems.push("no monster to cast at");
  else {
    await sleep(1000);
    await page.evaluate(`(() => { const c = __game.state.party.characters[3]; c.spells.push(13); c.sp = 900; })()`);
    SPELL_TITLES[13] = "Dimensional Phasing";
    await cast(13);
    await sleep(600);
    const phased = (await page.evaluate(`__game.game.internals.enc.monsters.filter((m) => m.phased > 0).length`)) as number;
    console.log("phased monsters:", phased);
    if (phased < 1) problems.push("Dimensional Phasing caught no monster");
    await page.screenshot({ path: join(outDir, "phased.png") });
  }

  // Jump clears open floor but not a wall; Etherealise passes it (the monsters are gone for this part)
  await page.evaluate(`window.__keepMonsters = false`);
  const spots = (await page.evaluate(`(() => {
    const rt = __game.game.internals.interior;
    const w = rt.map.width, h = rt.map.height;
    const free = (x, y) => x >= 0 && y >= 0 && x < w && y < h && rt.map.cells[y * w + x] === 1 && !rt.blocked.has(y * w + x);
    const dirs = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
    const out = { open: null, wall: null };
    for (let y = 0; y < h && !(out.open && out.wall); y++) for (let x = 0; x < w && !(out.open && out.wall); x++) {
      if (!free(x, y)) continue;
      for (const [f, [dx, dy]] of Object.entries(dirs)) {
        const mid = free(x + dx, y + dy);
        const far = free(x + 2 * dx, y + 2 * dy);
        const sx = rt.slabs && rt.slabs.size > 0;
        if (mid && far && !out.open) out.open = { x, y, f, to: [x + 2 * dx, y + 2 * dy] };
        if (!mid && far && !out.wall && !sx && !__game.game.isClosedDoor(x + dx, y + dy) && rt.map.cells[(y + dy) * w + x + dx] !== undefined) out.wall = { x, y, f, to: [x + 2 * dx, y + 2 * dy] };
      }
    }
    return out;
  })()`)) as { open: { x: number; y: number; f: string; to: number[] } | null; wall: { x: number; y: number; f: string; to: number[] } | null };
  console.log("jump spots:", JSON.stringify(spots));
  await page.evaluate(`(() => { const c = __game.state.party.characters[3]; c.spells.push(16, 62); c.sp = c.mana = 9000; })()`);
  SPELL_TITLES[16] = "Jump";
  SPELL_TITLES[62] = "Etherealise";
  const at = () => page.evaluate(`({ x: __game.state.at.x, y: __game.state.at.y })`) as Promise<{ x: number; y: number }>;
  if (spots.open) {
    await page.evaluate(`__game.teleport(${spots.open.x}, ${spots.open.y}, "${spots.open.f}")`);
    await sleep(400);
    await cast(16);
    const a = await at();
    if (a.x !== spots.open.to[0] || a.y !== spots.open.to[1]) problems.push(`Jump over open floor ended at ${a.x}/${a.y}, not ${spots.open.to.join("/")}`);
  } else problems.push("no open floor found to jump over");
  if (spots.wall) {
    await page.evaluate(`__game.teleport(${spots.wall.x}, ${spots.wall.y}, "${spots.wall.f}")`);
    await sleep(400);
    await cast(16);
    const a = await at();
    if (a.x !== spots.wall.x || a.y !== spots.wall.y) problems.push(`Jump went through a wall: ${a.x}/${a.y}`);
    await page.evaluate(`__game.teleport(${spots.wall.x}, ${spots.wall.y}, "${spots.wall.f}")`);
    await sleep(400);
    await cast(62);
    const b = await at();
    if (b.x !== spots.wall.to[0] || b.y !== spots.wall.to[1]) problems.push(`Etherealise ended at ${b.x}/${b.y}, not ${spots.wall.to.join("/")}`);
    console.log("wall: Jump stayed, Etherealise ->", b.x, b.y);
  } else console.log("no wall with floor behind it found in this map; wall part skipped");

  // ---- 4. the spells that carry the party off, in the open country
  await page.evaluate(`window.__keepMonsters = false`);
  await page.evaluate(`(async () => { await __game.leave(); })()`);
  await sleep(2500);
  const where = () => page.evaluate(`(() => { const s = __game.state; const t = __game.world.tile(s.at.x, s.at.y); return { x: s.at.x, y: s.at.y, mode: s.at.mode, biome: t.biome, minutes: s.party.minutes, food: s.party.food, gold: s.party.gold }; })()`) as Promise<{ x: number; y: number; mode: string; biome: number; minutes: number; food: number; gold: number }>;
  const all = [32, 45, 47, 42, 22, 2, 55, 52, 66, 13, 26, 57, 56, 36, 33];
  await page.evaluate(`(() => { const c = __game.state.party.characters[3]; c.spells = ${JSON.stringify(all)}; c.sp = c.mana = 9000; __game.state.party.food = 5; })()`);
  const start = await where();
  console.log("start:", JSON.stringify(start));
  await cast(32, async () => {
    await clickOptionWith("Set");
  });
  const beacon = (await page.evaluate(`__game.state.party.characters[3].beacon`)) as { x: number; y: number } | undefined;
  console.log("beacon:", JSON.stringify(beacon));
  if (!beacon || beacon.x !== start.x || beacon.y !== start.y) problems.push("Lloyd's Beacon did not remember the place");
  await page.evaluate(`__game.teleport(${start.x + 6}, ${start.y}, "N")`);
  await sleep(1500);
  // a place may stand there: its "enter?" question would be in the way
  await page.evaluate(`(() => { const o = document.querySelector(".modal-back .btn:last-child"); if (o) o.click(); })()`);
  await sleep(400);
  await cast(32, async () => {
    await clickOptionWith("Return");
  });
  await sleep(3500);
  const back = await where();
  console.log("after Return:", JSON.stringify(back));
  if (back.x !== start.x || back.y !== start.y) problems.push("Lloyd's Beacon did not bring the party back");

  const before45 = await where();
  await cast(45);
  await sleep(4000);
  const after45 = await where();
  console.log("Nature's Gate:", JSON.stringify(before45), "->", JSON.stringify(after45));
  if (after45.biome === before45.biome) problems.push("Nature's Gate stayed in the same biome");
  if (Math.abs(after45.x - before45.x) + Math.abs(after45.y - before45.y) < 5) problems.push("Nature's Gate did not take the party anywhere");
  await page.screenshot({ path: join(outDir, "gate.png") });

  const before47 = await where();
  await cast(47);
  await sleep(1500);
  const after47 = await where();
  console.log("Teleport:", before47.x, before47.y, "->", after47.x, after47.y);
  if (Math.abs(after47.x - before47.x) + Math.abs(after47.y - before47.y) < 2) problems.push("Teleport did not move the party");

  const before52 = await where();
  await cast(52);
  await sleep(500);
  const after52 = await where();
  console.log("Super Shelter: minutes", before52.minutes, "->", after52.minutes, " food", before52.food, "->", after52.food);
  // resting eats a ration only when a day ends in it (the clock does that, like the old rest)
  if (after52.minutes - before52.minutes < 400) problems.push("Super Shelter did not rest the party");

  // Pandora's box a few times: gold, an item or a monster, never an error
  const goldBefore = (await where()).gold;
  for (let i = 0; i < 6; i++) await cast(2);
  const pandoraOut = (await page.evaluate(`(() => ({ gold: __game.state.party.gold, monsters: __game.game.internals.enc.monsters.length, log: [...document.querySelectorAll(".log div")].map((d) => d.textContent).slice(-6) }))()`)) as { gold: number; monsters: number; log: string[] };
  console.log("Pandora:", JSON.stringify(pandoraOut), "gold before", goldBefore);

  // Combine: three iron short swords in Maximus's backpack become one steel short sword
  await page.evaluate(`(async () => {
    const m = await import("/src/sim/items.ts");
    const { Rng } = await import("/src/core/rng.ts");
    const c = __game.state.party.characters[0];
    for (let i = 1; i <= 3; i++) { const it = m.generateItem(new Rng(i), 1, { forcedMaterial: 3, forcedType: 18 }); it.id = "cmb" + i; c.inventory["slot" + i] = it; }
  })()`);
  await cast(55, async () => {
    await clickOptionWith("Maximus");
    await page.waitForSelector(".panel .slots .slot", { timeout: 3000 });
    await sleep(200);
    for (const i of [1, 2, 3]) await page.click(`.panel .slots .slot:nth-child(${i})`);
    await sleep(200);
    await page.screenshot({ path: join(outDir, "combine.png") });
    await page.evaluate(`(() => { const b = [...document.querySelectorAll(".panel .btn")].find((e) => e.textContent === "Combine"); if (b) b.click(); })()`);
  });
  const combined = (await page.evaluate(`(() => { const c = __game.state.party.characters[0]; return [c.inventory.slot1 && c.inventory.slot1.material, c.inventory.slot2, c.inventory.slot3]; })()`)) as unknown[];
  console.log("Combine:", JSON.stringify(combined));
  if (combined[0] !== 4 || combined[1] !== null || combined[2] !== null) problems.push("Combine did not make one better item out of three");

  // ---- 5. the campaign's open country
  await page.evaluate(`(async () => { await __game.game.newCampaign("test"); })()`);
  await sleep(4000);
  await page.evaluate(`(() => { const c = __game.state.party.characters[3]; c.spells = ${JSON.stringify(all)}; c.sp = c.mana = 9000; __game.state.party.food = 5; })()`);
  await page.evaluate(`(async () => { await __game.campaign("outside"); })()`);
  await sleep(4000);
  const c0 = (await page.evaluate(`(() => ({ x: __game.state.at.x, y: __game.state.at.y }))()`)) as { x: number; y: number };
  await cast(45);
  await sleep(1500);
  const c1 = (await page.evaluate(`(() => ({ x: __game.state.at.x, y: __game.state.at.y }))()`)) as { x: number; y: number };
  console.log("campaign Nature's Gate:", JSON.stringify(c0), "->", JSON.stringify(c1));
  if (Math.abs(c1.x - c0.x) + Math.abs(c1.y - c0.y) < 3) problems.push("Nature's Gate did nothing in the campaign");
  // Lloyd's Beacon in the campaign: light a fire, let the gate carry the party off, come back
  await cast(32, async () => {
    await clickOptionWith("Set");
  });
  const fire = (await page.evaluate(`(() => ({ x: __game.state.at.x, y: __game.state.at.y }))()`)) as { x: number; y: number };
  await cast(45);
  await sleep(1500);
  await cast(32, async () => {
    await clickOptionWith("Return");
  });
  await sleep(5000);
  const home = (await page.evaluate(`(() => ({ x: __game.state.at.x, y: __game.state.at.y }))()`)) as { x: number; y: number };
  console.log("campaign Beacon:", JSON.stringify(fire), "->", JSON.stringify(home));
  if (home.x !== fire.x || home.y !== fire.y) problems.push("Lloyd's Beacon did not bring the party back in the campaign");
  await cast(2);
  await cast(26);
  await page.keyboard.press("Escape");
} catch (e) {
  await shot("failure.png");
  console.error(`problems so far: ${problems.join(" | ")}`);
  throw e;
} finally {
  await browser.close();
}
if (problems.length) {
  console.error("PROBLEMS:\n" + problems.join("\n"));
  process.exit(1);
}
console.log("spell checks passed");
