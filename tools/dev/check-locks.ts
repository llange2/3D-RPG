/**
 * Checks the lock of an ordinary chest in the real browser (needs the dev server and Chrome, like check:render): in a dungeon of tier 3 or more a
 * party of level 1 cannot pick the lock (the chest stays shut and says so), a party of level 60 can ("<name> picks the lock", the gold arrives).
 *
 * Usage: tsx tools/dev/check-locks.ts <outDir> [url]      (default url http://localhost:5173/)
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const outDir = process.argv[2];
if (!outDir) throw new Error("usage: tsx tools/dev/check-locks.ts <outDir> [url]");
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
  if (!ok) problems.push(what);
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
};
try {
  const page = await browser.newPage();
  page.on("pageerror", (e) => problems.push(`[pageerror] ${(e as Error).message}`));
  await page.goto(`${base}?autostart=1&seed=test`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction("window.__game !== undefined", { timeout: 60000 });
  await sleep(3000);
  const evalJs = <T>(code: string) => page.evaluate(code) as Promise<T>;
  const logText = () => evalJs<string>(`document.querySelector(".log")?.textContent ?? ""`);

  const place = await evalJs<string | null>(`(() => { const p = __game.world.allPois().find((p) => (p.kind === "dungeon" || p.kind === "cave") && p.tier >= 3); return p ? p.id : null; })()`);
  expect(place !== null, "the world has a dungeon of tier 3 or more");
  await evalJs(`(async () => { await __game.enter(${JSON.stringify(place)}); })()`);
  await sleep(2500);

  // the nearest chest that has a lock, and the cell in front of it
  const found = await evalJs<{ uid: string; difficulty: number } | null>(`(() => {
    const g = __game.game;
    const rt = g.interior;
    const a = rt.content.actions.find((x) => x.kind === "treasure" && x.params.difficulty > 0 && !g.state.opened.has(x.uid));
    if (!a) return null;
    const view = g.gridView();
    for (const [d, dx, dy] of [["N", 0, -1], ["E", 1, 0], ["S", 0, 1], ["W", -1, 0]]) {
      if (view.walkable(a.x - dx, a.y - dy)) { g.teleport(a.x - dx, a.y - dy, d); window.__chest = a; return { uid: a.uid, difficulty: a.params.difficulty }; }
    }
    return null;
  })()`);
  expect(found !== null, "the dungeon has a locked chest with a free cell in front of it");
  if (!found) throw new Error("no chest");
  console.log(`chest ${found.uid}, difficulty ${found.difficulty}`);
  const gold = () => evalJs<number>(`__game.state.party.gold`);

  // level 1: skill of a few points, the lock of tier 3 or more holds
  await evalJs(`for (const c of __game.state.party.characters) c.level = 1`);
  const before = await gold();
  await evalJs(`__game.game.useAction(window.__chest)`);
  await sleep(600);
  expect((await logText()).includes("nobody in your party can pick the lock"), "a party of level 1 does not pick the lock");
  expect((await gold()) === before, "no gold from a chest that stays shut");
  await page.screenshot({ path: join(outDir, "lock-shut.png") });

  // level 60: the lock opens
  await evalJs(`for (const c of __game.state.party.characters) c.level = 60`);
  await evalJs(`__game.game.useAction(window.__chest)`);
  await sleep(800);
  expect((await logText()).includes("picks the lock."), "a party of level 60 picks the lock");
  expect((await gold()) > before, "the gold of the chest arrives");
  await page.screenshot({ path: join(outDir, "lock-open.png") });
} catch (e) {
  problems.push(`[script] ${(e as Error).message}`);
} finally {
  await browser.close();
}
if (problems.length > 0) {
  console.log("\nPROBLEMS:\n" + problems.join("\n"));
  process.exit(1);
}
console.log("\nOK");
