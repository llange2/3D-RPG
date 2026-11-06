/**
 * Browser check of the spaceship's sliding doors (6. 11. 2026): the frame is always there, the two leaves part in the middle in the length of the sound, a door that is no airlock shuts
 * again when the party has moved away from it, an airlock stays open. Needs a dev server (`VITE_FROZEN=1 VITE_PORT=<free port> npx vite --port <free port> --strictPort`).
 *
 * Usage: GAME_URL=http://localhost:<port>/ npx tsx tools/dev/check-spaceship-doors.ts <screenshot folder>
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
import { planDungeon } from "../../src/interiors";
import { World } from "../../src/world/world";

const base = process.env.GAME_URL ?? "http://localhost:5198/";
const outDir = process.argv[2] ?? "spaceship-doors-shots";
mkdirSync(outDir, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const problems: string[] = [];

const seed = process.env.SEED ?? "ship-a";
const world = new World(seed, "default");
const pyramid = world.allPois().find((p) => planDungeon(world, p)?.klass === "C" && planDungeon(world, p)?.section === 3)!;

const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: ["--window-size=1280,720", "--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-webgl", "--autoplay-policy=no-user-gesture-required"],
  defaultViewport: { width: 1280, height: 720 },
});
try {
  const page = await browser.newPage();
  page.on("pageerror", (e) => problems.push(`[pageerror] ${(e as Error).message}`));
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`[console] ${m.text()}`);
  });
  const evalJs = <T>(code: string) => page.evaluate(code) as Promise<T>;
  const shot = (name: string) => page.screenshot({ path: join(outDir, name) });
  await page.goto(`${base}?autostart=1&seed=${seed}&size=default&outside=1`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction("window.__game !== undefined", { timeout: 60000 });
  await sleep(4000);
  await evalJs(`(async () => { await __game.enter("${pyramid.id}"); })()`);
  await sleep(6000);
  // the terminators shoot a level 1 party dead within a few steps: god mode (the same module the game runs, through the dev server)
  await evalJs(`import("/src/sim/cheats.ts").then((m) => { m.cheats.god = true; })`);
  // (no robot is alive for the door tests; the one that tests the monsters comes back to life below)
  await evalJs(`(() => { for (const m of __game.game.enc.monsters) m.hp = 0; return 0; })()`);
  // the light of the ship on, so that the doors can be seen
  await evalJs(`(() => { __game.state.opened.add("ship:life"); __game.game.syncShip(true); return 0; })()`);
  type Door = { uid: string; x: number; y: number; axis: string; airlock: boolean };
  const doors = await evalJs<Door[]>(`__game.game.interior.content.actions.filter((a) => a.kind === "door").map((a) => ({ uid: a.uid, x: a.x, y: a.y, axis: a.params.axis, airlock: a.params.airlock === true }))`);
  console.log(`${doors.length} doors, ${doors.filter((d) => d.airlock).length} airlocks, slide seconds ${await evalJs("__game.game.interiorView.doors.slideSeconds")}`);
  const door = doors.find((d) => !d.airlock)!;
  const ax = door.axis === "x" ? 1 : 0;
  const ay = door.axis === "x" ? 0 : 1;
  const facing = door.axis === "x" ? "E" : "S";
  // a step arrives (`onArrived`): that is where the doors are shut behind the party
  const go = (x: number, y: number, f: string) => evalJs(`(async () => { __game.teleport(${x}, ${y}, "${f}"); await __game.game.onArrived(${x}, ${y}); })()`);
  const state = () => evalJs<{ open: boolean; t: number; passable: boolean; closed: boolean }>(`(() => { const v = __game.game.interiorView; const d = v.doors.doors.get("${door.uid}"); return { open: __game.state.opened.has("${door.uid}"), t: d.t, passable: v.isDoorPassable("${door.uid}"), closed: __game.game.isClosedDoor(${door.x}, ${door.y}) }; })()`);

  // 3 cells before the door, looking at it: the frame stands there and the leaves are shut
  await go(door.x - ax * 3, door.y - ay * 3, facing);
  await sleep(1500);
  await shot("1-closed-far.png");
  console.log("closed:", JSON.stringify(await state()));
  await go(door.x - ax, door.y - ay, facing);
  await sleep(1200);
  await shot("2-closed-near.png");
  // bump: the door opens, the party cannot go in before it is open far enough
  console.log("before the bump:", await evalJs(`JSON.stringify({ busy: __game.game.busy, over: __game.game.over, battle: __game.game.enc.battleMode, locked: __game.game.player.locked, at: [__game.game.player.tx, __game.game.player.ty], door: [${door.x}, ${door.y}] })`));
  await evalJs(`__game.game.onBlocked(${door.x}, ${door.y})`);
  for (const [name, ms] of [["3-opening-a", 250], ["4-opening-b", 400], ["5-opening-c", 400]] as const) {
    await sleep(ms);
    await shot(`${name}.png`);
    console.log(name, JSON.stringify(await state()));
  }
  await sleep(1200);
  await shot("6-open.png");
  console.log("open:", JSON.stringify(await state()));
  // walk through: the door stays open while the party is within a cell, it shuts at two cells
  await go(door.x, door.y, facing);
  console.log("in the door:", JSON.stringify(await state()));
  await go(door.x + ax, door.y + ay, facing);
  await sleep(300);
  console.log("one cell behind:", JSON.stringify(await state()));
  await go(door.x + ax * 2, door.y + ay * 2, facing === "E" ? "W" : "N");
  await sleep(300);
  await shot("7-closing-a.png");
  console.log("two cells behind:", JSON.stringify(await state()));
  await sleep(700);
  await shot("8-closing-b.png");
  await sleep(1400);
  await shot("9-closed-again-from-behind.png");
  console.log("closed again:", JSON.stringify(await state()));

  // the other side of a door that no robot stands near (the picture is mirrored on the back; the door is symmetrical)
  const spawns = await evalJs<{ x: number; y: number }[]>(`__game.game.interior.content.spawns.map((s) => ({ x: s.x, y: s.y }))`);
  const quiet = doors.filter((d) => !d.airlock).sort((p, q) => Math.min(...spawns.map((s) => Math.abs(q.x - s.x) + Math.abs(q.y - s.y))) - Math.min(...spawns.map((s) => Math.abs(p.x - s.x) + Math.abs(p.y - s.y))))[0]!;
  const qx = quiet.axis === "x" ? 1 : 0;
  const qy = quiet.axis === "x" ? 0 : 1;
  await go(quiet.x + qx * 3, quiet.y + qy * 3, quiet.axis === "x" ? "W" : "N");
  await sleep(1500);
  await shot("9b-back-side.png");
  // a monster that has noticed the party opens a shut door: one that is asleep behind it does not (the first robot of the level stands in for both)
  const other = doors.filter((d) => !d.airlock && d.uid !== door.uid && d.uid !== quiet.uid)[0]!;
  const ox = other.axis === "x" ? 1 : 0;
  const oy = other.axis === "x" ? 0 : 1;
  const ofacing = other.axis === "x" ? "E" : "S";
  await evalJs(`(() => { const e = __game.game.enc; for (const m of e.monsters.slice(1)) m.hp = 0; const m = e.monsters[0]; m.hp = 50; m.x = ${other.x + ox}; m.y = ${other.y + oy}; delete m.alerted; return 0; })()`);
  await go(other.x - ox * 3, other.y - oy * 3, ofacing);
  await sleep(1500);
  const door2 = () => evalJs<string>(`JSON.stringify({ open: __game.state.opened.has("${other.uid}"), alerted: __game.game.enc.monsters[0].alerted ?? false, monster: [__game.game.enc.monsters[0].x, __game.game.enc.monsters[0].y] })`);
  console.log("asleep behind the shut door:", await door2());
  await evalJs(`(() => { __game.game.enc.monsters[0].alerted = true; return 0; })()`);
  for (let i = 0; i < 4; i++) {
    await go(other.x - ox * 3, other.y - oy * 3, ofacing);
    await sleep(1300);
    console.log(`awake, turn ${i + 1}:`, await door2());
    if (i === 0) await shot("11-monster-opens-door.png");
  }
  await shot("12-monster-came-through.png");
  // an airlock: opened by hand (both levers pulled), it stays open when the party goes away
  const lock = doors.find((d) => d.airlock)!;
  const lx = lock.axis === "x" ? 1 : 0;
  const ly = lock.axis === "x" ? 0 : 1;
  await evalJs(`(() => { __game.state.opened.add("${lock.uid}"); __game.game.interiorView.setDoor("${lock.uid}", true); return 0; })()`);
  await go(lock.x - lx * 3, lock.y - ly * 3, lock.axis === "x" ? "E" : "S");
  await sleep(2500);
  await shot("10-airlock-open.png");
  await go(lock.x - lx * 9, lock.y - ly * 9, lock.axis === "x" ? "E" : "S");
  await sleep(500);
  console.log("airlock after leaving:", await evalJs(`__game.state.opened.has("${lock.uid}")`));
  console.log(problems.length ? `PROBLEMS:\n${problems.join("\n")}` : "no browser errors");
} finally {
  await browser.close();
}
