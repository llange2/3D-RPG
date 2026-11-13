/**
 * Looks at the locks of the level lever in the real browser (needs a dev server and Chrome, like check:spells):
 *  - a party of level 10 in a dungeon of the second tier tries the locked chests again and again (a step between the attempts, so every attempt rolls anew),
 *  - the difficulty the game asks (`window.__thievery`) against the skills of the heroes, the share of picked locks (the old tables: 100 %),
 *  - a failed attempt now and then sets off the trap of the chest (a line of the log, a hit on a hero), screenshots of both cases.
 *
 * Usage: tsx tools/dev/check-thievery.ts <outDir> [url]      (default url http://localhost:5173/)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
import { unpackSave } from "../../src/game/saveCodec";

const outDir = process.argv[2];
if (!outDir) throw new Error("usage: tsx tools/dev/check-thievery.ts <outDir> [url]");
const base = process.argv[3] ?? "http://localhost:5173/";
mkdirSync(outDir, { recursive: true });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const width = 1280;
const height = 720;
const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: [`--window-size=${width},${height}`, "--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-webgl", "--autoplay-policy=no-user-gesture-required"],
  defaultViewport: { width, height },
});
const problems: string[] = [];
const notes: string[] = [];
try {
  const page = await browser.newPage();
  const shot = (name: string) => page.screenshot({ path: join(outDir, name) });
  page.on("pageerror", (e) => problems.push(`[pageerror] ${(e as Error).message}`));
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`[console] ${m.text()}`);
  });
  await page.goto(`${base}?autostart=1&outside=1&seed=test`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction("window.__game !== undefined", { timeout: 60000 });
  await page.waitForFunction("window.__game.state !== undefined && window.__game.state !== null", { timeout: 120000 });
  await sleep(8000);

  // a party of level 10, every hero alive and well
  await page.evaluate(`(() => { for (const c of __game.state.party.characters) { c.level = 10; c.hp = c.health; } })()`);

  // a dungeon of the second tier with a locked chest that has a trap
  const places = (await page.evaluate(`__game.world.allPois().filter((p) => p.kind === "dungeon" && p.tier === 2).map((p) => p.id)`)) as string[];
  notes.push(`dungeons of the second tier: ${places.length}`);
  let chest = null as { uid: string; tier: number; params?: unknown } | null;
  for (const id of places.slice(0, 8)) {
    await page.evaluate(`__game.enter(${JSON.stringify(id)})`);
    await sleep(2500);
    chest = (await page.evaluate(`(() => { const a = __game.game.interior.content.actions.find((x) => x.kind === "treasure" && x.params.difficulty > 0 && x.params.lockTrap); return a ? { uid: a.uid, tier: __game.game.interior.content.tier, params: a.params } : null; })()`)) as typeof chest;
    if (chest) {
      notes.push(`chest ${chest.uid} in ${id}: ${JSON.stringify(chest.params)}`);
      break;
    }
    await page.evaluate(`__game.leave?.()`);
    await sleep(1500);
  }
  if (!chest) throw new Error("no locked chest with a trap found");

  // the balance journal (`src/sim/journal.ts`) lives in the state; start from an empty one
  await page.evaluate(`(() => { __game.state.journal.length = 0; })()`);
  const fumbleWords = "slips in the lock|turns the pick the wrong way|forces the lock";
  let fumbles = 0;
  let picked = 0;
  let shotFumble = false;
  let shotPick = false;
  const attempts = 60;
  for (let i = 0; i < attempts; i++) {
    const before = (await page.evaluate(`(document.body.innerText.match(/${fumbleWords}/g) ?? []).length`)) as number;
    await page.evaluate(`(async () => {
      const g = __game.game;
      __game.state.steps += 1;
      // a hit of the trap may leave a condition (poison, weakness) that takes the hero out of the roll: every attempt starts with a fresh party
      for (const c of __game.state.party.characters) { c.hp = c.health; c.conditions = ["Healthy"]; }
      __game.state.opened.delete(${JSON.stringify(chest.uid)});
      const a = g.interior.content.actions.find((x) => x.uid === ${JSON.stringify(chest.uid)});
      await g.useAction(a);
    })()`);
    await sleep(120);
    const after = (await page.evaluate(`(document.body.innerText.match(/${fumbleWords}/g) ?? []).length`)) as number;
    const last = (await page.evaluate(`__game.state.journal.filter((e) => e.t === "lock").slice(-1)[0]`)) as { ok: boolean } | undefined;
    if (last?.ok) picked++;
    if (after > before) {
      fumbles++;
      if (!shotFumble) {
        shotFumble = true;
        await shot("fumble.png");
      }
    } else if (last?.ok && !shotPick) {
      shotPick = true;
      await shot("picked.png");
    }
    // a hero that fell to the trap or a window the chest opened: close it and go on
    await page.keyboard.press("Escape");
  }
  const locks = (await page.evaluate(`__game.state.journal.filter((e) => e.t === "lock")`)) as { diff: number; ok: boolean; p: number; heroes: { name: string; cls: string; lvl: number; skill: number; p: number; a: number[]; roll: number }[] }[];
  const lastEntry = locks[0]!;
  notes.push(`lock asks ${lastEntry.diff}; heroes: ${lastEntry.heroes.map((h) => `${h.cls} L${h.lvl} attrs ${h.a.join("/")} skill ${h.skill} roll ${h.roll} ${(h.p * 100).toFixed(0)} %`).join("; ")}`);
  const expected = (locks.reduce((s, l) => s + l.p, 0) / locks.length) * 100;
  const actual = (locks.filter((l) => l.ok).length / locks.length) * 100;
  notes.push(`${attempts} attempts: picked ${picked} (${((picked / attempts) * 100).toFixed(0)} %), journal: ${locks.length} locks, expected ${expected.toFixed(0)} %, actual ${actual.toFixed(0)} %`);
  // the journal must be in the save (what the tester exports)
  const inSave = (await page.evaluate(`__game.state.journal.length`)) as number;
  notes.push(`journal entries in the state: ${inSave}`);
  await page.evaluate(`__game.game.save("quick")`);
  const rawSave = (await page.evaluate(`localStorage.getItem("mm3-seed-rpg:quicksave:v1")`)) as string;
  writeFileSync(join(outDir, "saves.json"), JSON.stringify({ format: "mm3-saves", exportedAt: new Date().toISOString(), saves: [{ kind: "world", slot: "quick", save: JSON.parse(unpackSave(rawSave)) }], named: [] }));
  notes.push(`traps set off by a failed attempt: ${fumbles} of ${attempts - picked} failures (aim: one in five)`);
} finally {
  await browser.close();
}
console.log(notes.join("\n"));
if (problems.length > 0) {
  console.log(`\n${problems.length} problem(s):\n${problems.slice(0, 15).join("\n")}`);
  process.exitCode = 1;
} else console.log("\nno console errors");
