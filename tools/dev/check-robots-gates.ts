/**
 * Browser check of 6. 11. 2026: a robot behind a sliding door of the spaceship wakes the moment the party opens the door (with its alarm or "target acquired"), steps twice per tile
 * and shoots (laser, or the Titanic Automato's missile as a model of its own); an airlock lever sounds like the doors; an iron gate lets the party through only when it is open;
 * a broken wall falls with the noise of the pit's stones. Needs a dev server (`VITE_FROZEN=1 VITE_PORT=<free port> npx vite --port <free port> --strictPort`).
 *
 * Usage: GAME_URL=http://localhost:<port>/ npx tsx tools/dev/check-robots-gates.ts <screenshot folder>
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
import { buildMapContent } from "../../src/actions";
import { generateInterior, planDungeon } from "../../src/interiors";
import { doorLook } from "../../src/render/interiorDoors";
import { World } from "../../src/world/world";

const base = process.env.GAME_URL ?? "http://localhost:5198/";
const outDir = process.argv[2] ?? "robots-gates-shots";
mkdirSync(outDir, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const problems: string[] = [];

const seed = process.env.SEED ?? "ship-a";
const world = new World(seed, "default");
const pyramid = world.allPois().find((p) => planDungeon(world, p)?.klass === "C" && planDungeon(world, p)?.section === 3)!;
// a place with an iron gate (a castle's door, a dungeon's by the hash of its cell): the first one the generator makes
const castle = world.allPois().find((p) => {
  if (p.kind !== "castle" && p.kind !== "dungeon") return false;
  const map = generateInterior(world, p);
  return buildMapContent(world, p, map).actions.some((a) => a.kind === "door" && doorLook(map, a.x, a.y) === "gate" && a.params.locked !== true);
})!;

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
    if (m.type() === "error" && !m.text().includes("403")) problems.push(`[console] ${m.text()}`);
  });
  const evalJs = <T>(code: string) => page.evaluate(code) as Promise<T>;
  const shot = (name: string) => page.screenshot({ path: join(outDir, name) });
  await page.goto(`${base}?autostart=1&seed=${seed}&size=default&outside=1`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction("window.__game !== undefined", { timeout: 60000 });
  await sleep(4000);
  // every sound the game asks for is written down
  await evalJs(`(() => { const a = __game.game.audio; window.__played = []; const o = a.play.bind(a); a.play = (id, v) => { window.__played.push(id); return o(id, v); }; return 0; })()`);
  const played = async (clear = true) => {
    const list = await evalJs<number[]>(`(() => { const l = window.__played.slice(); ${clear ? "window.__played.length = 0;" : ""} return l; })()`);
    return list.filter((id) => id >= 9055).join(",");
  };
  const go = (x: number, y: number, f: string) => evalJs(`(async () => { __game.teleport(${x}, ${y}, "${f}"); await __game.game.onArrived(${x}, ${y}); })()`);

  // ---- the spaceship
  await evalJs(`(async () => { await __game.enter("${pyramid.id}"); })()`);
  await sleep(6000);
  await evalJs(`import("/src/sim/cheats.ts").then((m) => { m.cheats.god = true; })`);
  await evalJs(`(() => { __game.state.opened.add("ship:life"); __game.game.syncShip(true); return 0; })()`);
  type Door = { uid: string; x: number; y: number; axis: string; airlock: boolean };
  const doors = await evalJs<Door[]>(`__game.game.interior.content.actions.filter((a) => a.kind === "door").map((a) => ({ uid: a.uid, x: a.x, y: a.y, axis: a.params.axis, airlock: a.params.airlock === true }))`);
  const door = doors.filter((d) => !d.airlock)[1]!;
  const dx = door.axis === "x" ? 1 : 0;
  const dy = door.axis === "x" ? 0 : 1;
  const facing = door.axis === "x" ? "E" : "S";
  for (const [defId, label] of [[88, "Titanic Automato"], [22, "ED-409"], [35, "Iron Wizard"], [69, "Terminator"]] as const) {
    // one robot two cells behind the door, asleep; the party three cells before it, the door shut
    // (the same instance is reused for every robot of the list: it has to announce itself again)
    await evalJs(`(() => { const e = __game.game.enc; for (const m of e.monsters.slice(1)) m.hp = 0; const m = e.monsters[0]; m.defId = ${defId}; m.hp = 500; m.x = ${door.x + dx * 2}; m.y = ${door.y + dy * 2}; delete m.alerted; __game.game.announcedRobots = new WeakSet(); __game.state.opened.delete("${door.uid}"); __game.game.interiorView.setDoor("${door.uid}", false); return 0; })()`);
    await go(door.x - dx, door.y - dy, facing);
    await sleep(1800);
    await played();
    const before = await evalJs<string>(`String(__game.game.enc.monsters[0].alerted ?? false)`);
    await evalJs(`__game.game.onBlocked(${door.x}, ${door.y})`);
    await sleep(300);
    const woke = await evalJs<string>(`String(__game.game.enc.monsters[0].alerted ?? false)`);
    console.log(`${label}: alerted before the door opened ${before}, right after ${woke}; sounds ${await played()}`);
    await sleep(1500);
    // the party stands in front of the open door and lets a turn go by: the robot steps (twice per tile for 88 and 22) and shoots through the open door
    await go(door.x - dx, door.y - dy, facing);
    await sleep(350);
    if (defId === 88) await shot("1-missile-in-flight.png");
    await sleep(1500);
    await go(door.x - dx, door.y - dy, facing);
    await sleep(300);
    if (defId === 88) await shot("1b-missile-in-flight.png");
    await sleep(1200);
    console.log(`${label}: after one step back: sounds ${await played()}, robot at ${await evalJs(`__game.game.enc.monsters[0].x + "," + __game.game.enc.monsters[0].y`)}`);
  }
  // an airlock lever: the sound of the doors (9056), once
  const lever = await evalJs<{ x: number; y: number; uid: string } | null>(`(() => { const a = __game.game.interior.content.actions.find((l) => l.kind === "lever" && typeof l.params.airlock === "string"); return a ? { x: a.x, y: a.y, uid: a.uid } : null; })()`);
  if (lever) {
    await go(lever.x, lever.y + 1, "N");
    console.log("lever probe:", await evalJs<string>(`JSON.stringify({ lever: ${JSON.stringify(lever)}, busy: __game.game.busy, opened: __game.state.opened.has("${lever.uid}"), mode: __game.game.mode })`));
    await played();
    // (not awaited: the lever asks first and its text waits for a click)
    const pull = async (uid: string) => {
      await evalJs(`(() => { const a = __game.game.interior.content.actions.find((l) => l.uid === "${uid}"); void __game.game.useAction(a); return 0; })()`);
      await sleep(500);
      await evalJs(`(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent === "Switch it"); b?.click(); return 0; })()`);
      await sleep(900);
      // close the text of the lever
      await evalJs(`(() => { for (const b of document.querySelectorAll("button")) if (["OK", "Continue", "Close"].includes(b.textContent ?? "")) b.click(); return 0; })()`);
      await sleep(300);
    };
    await pull(lever.uid);
    console.log(`airlock lever (first of two): sounds ${await played()}`);
    const mate = await evalJs<string>(`__game.game.interior.content.actions.find((l) => l.kind === "lever" && l.params.airlock === ${JSON.stringify(await evalJs<string>(`__game.game.interior.content.actions.find((l) => l.uid === "${lever.uid}").params.airlock`))} && l.uid !== "${lever.uid}").uid`);
    await pull(mate);
    console.log(`airlock lever (second, the lock opens): sounds ${await played()}`);
  } else console.log("no airlock lever found");

  // ---- an iron gate: the party waits until it is open
  await evalJs(`(async () => { await __game.leave?.(); })()`).catch(() => undefined);
  await evalJs(`(async () => { await __game.enter("${castle.id}"); })()`);
  await sleep(6000);
  const gate = await evalJs<Door | null>(`(() => { const a = __game.game.interior.content.actions.find((d) => d.kind === "door" && d.params.locked !== true && __game.game.interiorView.doors.doors.get(d.uid)?.look === "gate"); return a ? { uid: a.uid, x: a.x, y: a.y, axis: a.params.axis, airlock: false } : null; })()`);
  if (gate) {
    const gx = gate.axis === "x" ? 1 : 0;
    const gy = gate.axis === "x" ? 0 : 1;
    await go(gate.x - gx, gate.y - gy, gate.axis === "x" ? "E" : "S");
    await sleep(800);
    const samples: string[] = [];
    await evalJs(`__game.game.onBlocked(${gate.x}, ${gate.y})`);
    for (let i = 0; i < 12; i++) {
      samples.push(await evalJs<string>(`(() => { const d = __game.game.interiorView.doors.doors.get("${gate.uid}"); return d.t.toFixed(2) + (__game.game.canEnter(${gate.x}, ${gate.y}) ? "+" : "-"); })()`));
      await sleep(350);
      if (i === 3) await shot("2-gate-rising.png");
    }
    console.log(`gate (t, + = the party may enter): ${samples.join(" ")}`);
  } else console.log("no door in the castle");
  console.log(problems.length ? `PROBLEMS:\n${problems.join("\n")}` : "no browser errors");
} finally {
  await browser.close();
}
