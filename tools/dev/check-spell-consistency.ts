/**
 * Browser check of the spell consistency pass (8. 11. 2026): Wizard's Eye shows no monsters (only Detect Monster does), Awaken wakes the whole party,
 * Resurrect leaves one hit point, Levitate carries over no water. Needs a dev server (`VITE_FROZEN=1 VITE_PORT=<free port> npx vite --port <free port> --strictPort`).
 *
 * Usage: GAME_URL=http://localhost:<port>/ npx tsx tools/dev/check-spell-consistency.ts <screenshot folder>
 * The cold ray, dragon breath and turn undead are seen with `check-playtest48.ts <folder> cast flat cedar-peak-198 day 39,50,19`.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const base = process.env.GAME_URL ?? "http://localhost:5195/";
const outDir = process.argv[2] ?? "spell-consistency-shots";
mkdirSync(outDir, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  protocolTimeout: 240000,
  args: ["--window-size=1280,720", "--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-webgl", "--autoplay-policy=no-user-gesture-required"],
  defaultViewport: { width: 1280, height: 720 },
});
let failed = false;
const expectThat = (what: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}${detail ? ` (${detail})` : ""}`);
  if (!ok) failed = true;
};
try {
  const page = await browser.newPage();
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(`[pageerror] ${(e as Error).message}`));
  const evalJs = <T>(code: string) => page.evaluate(code) as Promise<T>;
  await page.goto(`${base}?autostart=1&seed=cedar-peak-198&size=default&outside=1`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction("window.__game !== undefined", { timeout: 60000 });
  await sleep(5000);
  await evalJs(`__game.gotoMonster(3)`);
  await sleep(4000);

  // Wizard's Eye: the maps list the monsters inside the viewing cone only, as without the spell; Detect Monster lists all of them
  const count = () => evalJs<number>(`__game.game.mappedMonsters().length`);
  const total = await evalJs<number>(`__game.game.enc.monsters.filter((m) => m.hp > 0).length`);
  const plain = await count();
  await evalJs(`(() => { const p = __game.state.party; p.effects.push({ kind: "wizard_eye", until: p.minutes + 600 }); __game.game.refresh(); })()`);
  const eye = await count();
  expectThat("Wizard's Eye adds no monster to the map", eye === plain, `${plain} -> ${eye} of ${total}`);
  await sleep(500);
  await page.screenshot({ path: join(outDir, "eye.png") });
  await evalJs(`(() => { const p = __game.state.party; p.effects.push({ kind: "detect_monster", until: p.minutes + 600 }); __game.game.refresh(); })()`);
  const detect = await count();
  expectThat("Detect Monster shows every monster", detect === total, `${detect} of ${total}`);
  await sleep(500);
  await page.screenshot({ path: join(outDir, "eye-and-detect.png") });

  // Awaken: two sleeping heroes wake at once, nobody is asked
  await evalJs(`(() => { const p = __game.state.party; const c = p.characters[3]; c.spells = [1, 70]; c.mana = c.sp = 99999; p.characters[0].conditions = ["Sleeping"]; p.characters[2].conditions = ["Sleeping"]; for (const m of __game.game.enc.monsters) m.hp = 99999; })()`);
  await evalJs(`__game.game.debugCast(3, 1)`);
  await sleep(800);
  const awake = await evalJs<string>(`JSON.stringify(__game.state.party.characters.map((c) => c.conditions))`);
  expectThat("Awaken wakes everybody", !awake.includes("Sleeping"), awake);
  await page.screenshot({ path: join(outDir, "awaken.png") });

  // Resurrect: a rotten hero comes back with one hit point (the monsters' answer to the first cast has to be over, or the second cast is refused as busy)
  await sleep(4000);
  await evalJs(`(() => { const p = __game.state.party; const h = p.characters[1]; h.conditions = ["Rotten"]; h.hp = 0; })()`);
  // `debugCast` has no target, Resurrect asks for one
  await evalJs(`__game.game.castSpells({ who: 3, pick: { spellId: 70, target: 1 } })`);
  await sleep(800);
  const back = await evalJs<string>(`JSON.stringify({ c: __game.state.party.characters[1].conditions, hp: __game.state.party.characters[1].hp })`);
  expectThat("Resurrect leaves 1 hit point", back.includes(`"hp":1`) && !back.includes("Rotten"), back);
  await page.screenshot({ path: join(outDir, "resurrect.png") });

  if (problems.length) console.log("PROBLEMS:\n" + problems.join("\n"));
  console.log(failed ? "FAILED" : "done");
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
