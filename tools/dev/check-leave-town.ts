/**
 * Browser check of bug_fix_43 (7. 11. 2026): the party that leaves Starthaven on its exit cell was hit by a Kudo crab of the world's far corner before anybody had moved. The step onto the
 * exit cell asks "Leave?" and finishes its turn after the answer, when the overworld's monsters are there already; it called `monsterTurn` with the town's cell (1, 6), next to the
 * crab of the overworld tile (2, 6). Seed jade-wood-358, small. Needs a dev server (`VITE_FROZEN=1 VITE_PORT=<free port> npx vite --port <free port> --strictPort`).
 *
 * Usage: GAME_URL=http://localhost:<port>/ npx tsx tools/dev/check-leave-town.ts
 */
import puppeteer from "puppeteer-core";

const base = process.env.GAME_URL ?? "http://localhost:5194/";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const problems: string[] = [];

const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  protocolTimeout: 240000,
  args: ["--window-size=1280,720", "--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-webgl"],
  defaultViewport: { width: 1280, height: 720 },
});
try {
  const page = await browser.newPage();
  page.on("pageerror", (e) => problems.push(`[pageerror] ${(e as Error).message}`));
  const evalJs = <T>(code: string) => page.evaluate(code) as Promise<T>;
  await page.goto(`${base}?autostart=1&seed=jade-wood-358&size=small&dungeons=few`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction("window.__game !== undefined", { timeout: 60000 });
  await sleep(4000);
  // count every attack of a monster, wherever the party stands
  await evalJs(`(() => {
    const g = __game.game; const orig = g.handleEvents.bind(g);
    window.__attacks = 0;
    g.handleEvents = (events, ...r) => { window.__attacks += events.filter((e) => e.type === "monster_attack").length; return orig(events, ...r); };
  })()`);
  const { exit, spawn } = await evalJs<{ exit: { x: number; y: number }; spawn: { x: number; y: number } }>(`(() => { const m = __game.game.internals.interior.map; return { exit: m.exit, spawn: m.spawn }; })()`);
  // the cell in front of the exit, looking at it, then one step onto it
  await evalJs(`__game.teleport(${exit.x + 1}, ${exit.y}, "W")`);
  await sleep(800);
  await page.keyboard.press("w");
  await sleep(1500);
  const asked = await evalJs<boolean>(`(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Leave"); if (b) b.click(); return !!b; })()`);
  if (!asked) problems.push(`the exit cell (${exit.x}, ${exit.y}) asked nothing (spawn ${spawn.x}, ${spawn.y})`);
  await sleep(4000);
  // the first step in the open (the crab's blow came with it)
  await page.keyboard.press("w");
  await sleep(2000);
  const state = await evalJs<{ mode: string; attacks: number; hp: number[] }>(`({ mode: __game.state.at.mode, attacks: window.__attacks, hp: __game.state.party.characters.map((c) => c.hp) })`);
  console.log(JSON.stringify(state));
  if (state.mode !== "overworld") problems.push(`the party did not leave (${state.mode})`);
  if (state.attacks !== 0) problems.push(`${state.attacks} attacks on leaving the town`);
} finally {
  await browser.close();
}
if (problems.length) {
  console.log("PROBLEMS:\n" + problems.join("\n"));
  process.exitCode = 1;
} else console.log("OK");
