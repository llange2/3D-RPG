/**
 * Browser check of the 58th playtest, point 1 (15. 11. 2026): a giant, moving monster body stayed in the picture after a kill, and only a reload of the page took it away.
 * Two causes, both checked here:
 *  1. A monster that falls (or is removed) before its model has loaded came to life afterwards where it had stood, and nothing owned it any more (`MonsterRenderer.wanted`).
 *     The check adds a monster of a type that is not loaded yet, lets it die at once and counts the views and the nodes of the scene that are left.
 *  2. A load put a monster of the group on the party's own tile when the party stood on the middle of the group (`placeGroup` does not look at the party; `Game.onPartyTile`):
 *     the camera sat inside its body. The check stands the party on the middle of a wild group, quick-saves, loads and asks whether a monster shares the tile.
 * Needs a dev server and Chrome (`VITE_FROZEN=1 VITE_PORT=<free port> npx vite --port <free port> --strictPort`).
 *
 * Usage: GAME_URL=http://localhost:<port>/ npx tsx tools/dev/check-leftover.ts [outDir]
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const base = process.env.GAME_URL ?? "http://localhost:5173/";
const outDir = process.argv[2];
if (outDir) mkdirSync(outDir, { recursive: true });
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
  await page.goto(`${base}?autostart=1&outside=1&seed=test`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction("window.__game !== undefined", { timeout: 60000 });
  await sleep(3000);
  await page.waitForFunction(`!document.querySelector(".loading.on")`, { timeout: 90000 });
  await sleep(1000);

  // ---- 1. death before the model has arrived
  const race = (await page.evaluate(`(async () => {
    const g = __game.game;
    const m = g.monsters;
    const p = g.internals.player;
    const w = g.worldPos(p.tx + 2, p.ty);
    const out = [];
    // types the renderer has not loaded yet: the view is built after the model arrives, which is after the die() below
    const ids = Object.keys(m.info).map(Number).filter((id) => !m.containers.has(id)).slice(0, 6);
    for (const id of ids) {
      const uid = "race:" + id;
      const added = m.add(uid, id, w.x, w.y, w.z);
      let then = false;
      m.die(uid, () => { then = true; });
      await added;
      out.push({ id, view: m.has(uid), then });
    }
    await new Promise((r) => setTimeout(r, 1500));
    return { out, nodes: g.r.scene.transformNodes.filter((n) => n.name.startsWith("monster:race")).length };
  })()`)) as { out: { id: number; view: boolean; then: boolean }[]; nodes: number };
  console.log("race:", JSON.stringify(race));
  if (race.out.length === 0) problems.push("every monster model was loaded already: the race was not tried");
  for (const r of race.out) if (r.view || !r.then) problems.push(`monster type ${r.id}: view after its death ${r.view}, callback ${r.then}`);
  if (race.nodes > 0) problems.push(`${race.nodes} monster nodes of dead monsters are in the scene`);

  // ---- 2. a load with the party on the middle of a group
  const spot = (await page.evaluate(`(async () => {
    const g = __game.game;
    const sp = await import("/src/world/spawns.ts");
    const p = g.internals.player;
    const cx0 = Math.floor(p.tx / 10), cy0 = Math.floor(p.ty / 10);
    for (let cy = cy0 - 3; cy <= cy0 + 3; cy++) for (let cx = cx0 - 3; cx <= cx0 + 3; cx++) {
      for (const s of sp.chunkSpawns(g.world, cx, cy)) if (s.monsterIds.length >= 2 && g.world.tile(s.x, s.y).ground === 0) return { x: s.x, y: s.y, uid: s.uid };
    }
    return null;
  })()`)) as { x: number; y: number; uid: string } | null;
  if (!spot) throw new Error("no wild group near the start of this world");
  await page.evaluate(`__game.teleport(${spot.x}, ${spot.y}, "N")`);
  await sleep(1500);
  await page.evaluate(`(async () => { const g = __game.game; g.save("quick"); const mod = await import("/src/game/state.ts"); await g.loadFromFile(mod.readSave(mod.kindOfState(g.state), "quick")); })()`);
  await sleep(2000);
  await page.waitForFunction(`!document.querySelector(".loading.on")`, { timeout: 90000 });
  await sleep(1000);
  const after = (await page.evaluate(`(() => { const g = __game.game; const p = g.internals.player; return { party: [p.tx, p.ty], onParty: g.internals.enc.monsters.filter((m) => m.hp > 0 && m.x === p.tx && m.y === p.ty).map((m) => m.uid), group: g.internals.enc.monsters.filter((m) => m.uid.startsWith(${JSON.stringify(spot.uid)} + "#")).length }; })()`)) as { party: number[]; onParty: string[]; group: number };
  console.log("load:", JSON.stringify(after));
  if (after.group === 0) problems.push("the group was not there after the load: the check tried nothing");
  if (after.onParty.length > 0) problems.push(`a monster stands on the party's tile after the load: ${after.onParty.join(", ")}`);
  if (outDir) await page.screenshot({ path: join(outDir, "leftover-after-load.png") });
} finally {
  await browser.close();
}
if (problems.length > 0) {
  console.log("PROBLEMS:\n" + problems.join("\n"));
  process.exit(1);
}
console.log("OK");
