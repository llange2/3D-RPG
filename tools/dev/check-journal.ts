/**
 * TEMPORARY (balance journal, `src/sim/journal.ts`): plays a short stretch in the real browser (needs a dev server and Chrome) and looks at what the journal of the save holds:
 *  - a fight (a monster next to the party, the party attacks until nothing is left), a level-up, a snapshot of the time line, the way into a place and out of it,
 *  - the quick save (`localStorage`), the journal in it, and the file that `tools/balance/read-journal.ts` reads.
 *
 * Usage: tsx tools/dev/check-journal.ts <outDir> [url]      (default url http://localhost:5173/)
 * Writes <outDir>/saves.json, a bundle like Esc > Debug > Export saves.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const outDir = process.argv[2];
if (!outDir) throw new Error("usage: tsx tools/dev/check-journal.ts <outDir> [url]");
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
  page.on("pageerror", (e) => problems.push(`[pageerror] ${(e as Error).message}`));
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`[console] ${m.text()}`);
  });
  await page.goto(`${base}?autostart=1&outside=1&seed=test`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction("window.__game !== undefined", { timeout: 60000 });
  await page.waitForFunction("window.__game.state !== undefined && window.__game.state !== null", { timeout: 120000 });
  await sleep(8000);

  const journal = () => page.evaluate(`__game.state.journal.map((e) => e.t)`) as Promise<string[]>;
  notes.push(`after the start: ${(await journal()).join(",") || "(empty)"}`);

  // ---- a fight: next to a monster, attack until it is gone (the heroes stay alive, the numbers are not the point)
  const near = await page.evaluate(`__game.gotoMonster(1)`);
  notes.push(`gotoMonster: ${near}`);
  await sleep(3000);
  for (let i = 0; i < 60; i++) {
    const left = (await page.evaluate(`(() => { const g = __game.game; const p = g.internals.player; return g.internals.enc.monsters.filter((m) => m.hp > 0 && Math.max(Math.abs(m.x - p.tx), Math.abs(m.y - p.ty)) <= 6).length; })()`)) as number;
    if (left === 0) break;
    await page.evaluate(`(() => { for (const c of __game.state.party.characters) { c.hp = c.health; c.conditions = ["Healthy"]; } })()`);
    await page.evaluate(`__game.game.attackFocus()`);
    await sleep(500);
  }
  await sleep(1500);

  // ---- a level-up and a snapshot by walking: the journal is stamped with step, minute and place
  await page.evaluate(`(async () => { const ch = await import("/src/sim/character.ts"); const c = __game.state.party.characters[0]; ch.levelUp(c, __game.state.party.talents, 1); })()`);
  await page.evaluate(`__game.state.steps += 250`);
  await page.evaluate(`__game.game.journalSnap("check")`);

  // ---- a place and back: the snapshot "scene" when the loading screen goes
  const dungeon = (await page.evaluate(`__game.firstPoi("dungeon")`)) as string | null;
  if (dungeon) {
    await page.evaluate(`__game.enter(${JSON.stringify(dungeon)})`);
    await sleep(5000);
    await page.evaluate(`__game.leave()`);
    await sleep(4000);
  } else problems.push("no dungeon");

  const types = await journal();
  const counts: Record<string, number> = {};
  for (const t of types) counts[t] = (counts[t] ?? 0) + 1;
  notes.push(`journal: ${JSON.stringify(counts)}`);
  for (const t of ["fight", "level", "snap"]) if (!counts[t]) problems.push(`no "${t}" entry in the journal`);

  // ---- the save carries it
  await page.evaluate(`__game.game.save("quick")`);
  const raw = (await page.evaluate(`localStorage.getItem("mm3-seed-rpg:quicksave:v1")`)) as string | null;
  if (!raw) throw new Error("no quick save in the storage");
  const save = JSON.parse(raw) as { state: { journal?: { t: string; s: number; m: number; at: string }[] } };
  const saved = save.state.journal ?? [];
  notes.push(`quick save: ${raw.length} bytes, journal ${saved.length} entries (${JSON.stringify(saved).length} bytes), first stamp ${JSON.stringify(saved[0] ? { s: saved[0].s, m: saved[0].m, at: saved[0].at } : null)}`);
  if (saved.length === 0) problems.push("the save has no journal");
  writeFileSync(join(outDir, "saves.json"), JSON.stringify({ format: "mm3-saves", exportedAt: new Date().toISOString(), saves: [{ kind: "world", slot: "quick", save: JSON.parse(raw) }], named: [] }));
  const fight = saved.find((e) => e.t === "fight");
  if (fight) notes.push(`first fight: ${JSON.stringify(fight)}`);
} finally {
  await browser.close();
}
console.log(notes.join("\n"));
if (problems.length > 0) {
  console.log(`\n${problems.length} problem(s):\n${problems.slice(0, 15).join("\n")}`);
  process.exitCode = 1;
} else console.log("\nno console errors");
