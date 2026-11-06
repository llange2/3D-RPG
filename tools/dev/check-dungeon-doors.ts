/**
 * Browser check of the dungeon's wooden doors (6. 11. 2026): the user's frame and leaf, the leaf swings on its hinge axis in the length of the sound (`squeaky_door`, 2.672 s), the party
 * cannot walk through before the leaf is open far enough, and the open pose is the one of the old game's `blk_door_open` (a second picture with that model drawn in the same place).
 * Needs a dev server (`VITE_FROZEN=1 VITE_PORT=<free port> npx vite --port <free port> --strictPort`).
 *
 * Usage: GAME_URL=http://localhost:<port>/ npx tsx tools/dev/check-dungeon-doors.ts <screenshot folder>
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
import { buildMapContent } from "../../src/actions";
import { generateInterior } from "../../src/interiors";
import { doorLook } from "../../src/render/interiorDoors";
import { World } from "../../src/world/world";

const base = process.env.GAME_URL ?? "http://localhost:5191/";
const outDir = process.argv[2] ?? "dungeon-doors-shots";
mkdirSync(outDir, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const problems: string[] = [];

const seed = process.env.SEED ?? "door-a";
const world = new World(seed, "default");
// the first dungeon with a wooden door
const found = world
  .allPois()
  .filter((p) => p.kind === "dungeon")
  .map((poi) => {
    const map = generateInterior(world, poi);
    const door = buildMapContent(world, poi, map).actions.find((a) => a.kind === "door" && doorLook(map, a.x, a.y) === "door");
    return door ? { poi, door } : null;
  })
  .find((f) => f !== null);
if (!found) throw new Error("no dungeon with a wooden door");
const { poi, door } = found;
console.log(`dungeon ${poi.id}, door ${door.uid} at ${door.x},${door.y} axis ${String(door.params.axis)}`);

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
  await evalJs(`(async () => { await __game.enter("${poi.id}"); })()`);
  await sleep(5000);
  await evalJs(`import("/src/sim/cheats.ts").then((m) => { m.cheats.god = true; })`);
  const ax = door.params.axis === "x" ? 1 : 0;
  const ay = door.params.axis === "x" ? 0 : 1;
  const facing = door.params.axis === "x" ? "E" : "S";
  const go = (x: number, y: number, f: string) => evalJs(`(async () => { __game.teleport(${x}, ${y}, "${f}"); await __game.game.onArrived(${x}, ${y}); })()`);
  const state = () => evalJs<{ open: boolean; t: number; passable: boolean }>(`(() => { const v = __game.game.interiorView; const d = v.doors.doors.get("${door.uid}"); return { open: __game.state.opened.has("${door.uid}"), t: d.t, passable: v.isDoorPassable("${door.uid}") }; })()`);

  await go(door.x - ax * 2, door.y - ay * 2, facing);
  await sleep(1500);
  await shot("1-closed.png");
  console.log("closed:", JSON.stringify(await state()), "swing seconds", await evalJs("__game.game.interiorView.doors.swingSeconds"));
  // open it the way a bump does (the action opens it and plays the sound); sample the swing
  await evalJs(`__game.game.onBlocked(${door.x}, ${door.y})`);
  const started = Date.now();
  for (const ms of [300, 700, 1200, 1800, 2400]) {
    await sleep(Math.max(0, ms - (Date.now() - started)));
    const s = await state();
    await shot(`2-swing-${ms}.png`);
    console.log(`after ${Date.now() - started} ms:`, JSON.stringify(s));
  }
  await sleep(1500);
  await shot("3-open.png");
  console.log("open:", JSON.stringify(await state()));

  // the same view with the old game's open door in the frame's place: the two pictures must show the same
  const same = `(async () => { const g = __game.game; await g.props.ensure(g.staticInfo, ["blk_door_open"]); const v = g.interiorView; const d = v.doors.doors.get("${door.uid}");
    g.props.setInstances("test:old", [{ model: "blk_door_open", x: d.x, y: 0, z: d.z, rotY: d.yaw * Math.PI / 180, scale: 1.5, scaleXYZ: [1.5, 1.473, 1.5] }]); g.props.flush(); v.doors.dispose(); return 0; })()`;
  // standing in the doorway and looking back into the corridor, the open leaf lies along one wall in front of the camera
  const back = door.params.axis === "x" ? "W" : "N";
  await go(door.x, door.y, back);
  await sleep(1200);
  await shot("4-open-from-doorway.png");
  await go(door.x, door.y, facing);
  await sleep(1200);
  await shot("4b-open-from-doorway-forward.png");
  await go(door.x - ax, door.y - ay, facing);
  await sleep(1200);
  await shot("4c-open-one-before.png");
  await go(door.x, door.y, back);
  await evalJs(same);
  await sleep(800);
  await shot("5-old-open-from-doorway.png");
  await go(door.x, door.y, facing);
  await sleep(1200);
  await shot("5b-old-open-from-doorway-forward.png");
  await go(door.x - ax, door.y - ay, facing);
  await sleep(1200);
  await shot("5c-old-open-one-before.png");
  console.log(problems.length ? `PROBLEMS:\n${problems.join("\n")}` : "no browser errors");
} finally {
  await browser.close();
}
