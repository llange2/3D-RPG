/**
 * Looks at the effects (`render/fx.ts`): the water of a town fountain, the impacts of the four elements, and the same with the effects off.
 * Needs a dev server (`VITE_FROZEN=1 VITE_PORT=<free port> npx vite --port <free port> --strictPort`).
 *
 * Usage: GAME_URL=http://localhost:<port>/ npx tsx tools/dev/check-fx.ts <folder> [seed] [what]    what = fountain | impacts | night | dark | mermaid | world | shore | off | perf | leave | all (default; night, dark and mermaid are not part of it)
 * The shots are `<folder>/fountain-<n>.png`, `impact-<element>-<n>.png`, `fountain-off.png`, `night-<n>.png`, `dark-<item>-<n>.png`. Prints what the page logged (errors, warnings).
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
import { buildMapContent } from "../../src/actions";
import { generateInterior } from "../../src/interiors";
import { CELL } from "../../src/interiors/types";
import { landmarkItemAt } from "../../src/render/terrainMesher";
import { DECO, GROUND } from "../../src/world/types";
import { World } from "../../src/world/world";

const base = process.env.GAME_URL ?? "http://localhost:5191/";
const [outDir = "fx-shots", seed = "birch-reach-493", what = "all"] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// a town that has a fountain, and a floor cell three steps from it with a free line, looking at it
const world = new World(seed, "default", "default");
interface Target { id: string; name: string; x: number; y: number; facing: string; fx: number; fy: number }
let target = null as Target | null;
const FACING: [string, number, number][] = [["N", 0, -1], ["E", 1, 0], ["S", 0, 1], ["W", -1, 0]];
for (const poi of world.allPois().filter((p) => p.kind === "town")) {
  const map = generateInterior(world, poi);
  const content = buildMapContent(world, poi, map);
  const fountain = content.actions.find((a) => a.kind === "fountain");
  if (!fountain) continue;
  const floor = (x: number, y: number) => map.cells[y * map.width + x] === CELL.FLOOR && !content.actions.some((a) => a.x === x && a.y === y);
  for (const [facing, dx, dy] of FACING) {
    // stand `dist` cells away on the side opposite to where we look
    for (const dist of [3, 2]) {
      const sx = fountain.x - dx * dist;
      const sy = fountain.y - dy * dist;
      const clear = Array.from({ length: dist }, (_, i) => floor(fountain.x - dx * (i + 1), fountain.y - dy * (i + 1))).every(Boolean);
      if (clear && !target) target = { id: poi.id, name: poi.name, x: sx, y: sy, facing, fx: fountain.x, fy: fountain.y };
    }
  }
  if (target) break;
}
if (!target) throw new Error("no town with a reachable fountain");
console.log("fountain in", target.name, target.id, "at", target.fx, target.fy, "party at", target.x, target.y, target.facing);

/** A land field on the coast near the start with water two fields to the east: the party stands on it and looks east over the foam. */
function shoreSpot(w: World): { x: number; y: number } {
  const start = w.startPosition();
  let best: { x: number; y: number; d: number } | null = null;
  for (let y = start.y - 60; y <= start.y + 60; y++) {
    for (let x = start.x - 60; x <= start.x + 60; x++) {
      const here = w.tile(x, y).ground;
      if (here !== GROUND.LAND || !w.isOpenGround(x, y)) continue;
      const wet = (dx: number) => [GROUND.WATER, GROUND.SHALLOW].includes(w.tile(x + dx, y).ground as never);
      if (!wet(2) || !wet(3) || !wet(4)) continue;
      const d = Math.hypot(x - start.x, y - start.y);
      if (!best || d < best.d) best = { x, y, d };
    }
  }
  if (!best) throw new Error("no shore near the start of this world");
  return best;
}

/** The landmark fountain (old item 2) with open ground four tiles south of it that lies nearest to the middle of the world. */
function fountainLandmark(w: World): { x: number; y: number } {
  let best: { x: number; y: number; d: number } | null = null;
  for (let y = 4; y < w.height - 6; y++) {
    for (let x = 4; x < w.width - 4; x++) {
      if (w.tile(x, y).deco !== DECO.LANDMARK || landmarkItemAt(x, y) !== 2 || !w.isOpenGround(x, y + 4)) continue;
      const d = Math.hypot(x - w.width / 2, y - w.height / 2);
      if (!best || d < best.d) best = { x, y, d };
    }
  }
  if (!best) throw new Error("no landmark fountain in this world");
  return best;
}

const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  protocolTimeout: 240000,
  args: ["--window-size=1280,720", "--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-webgl", "--autoplay-policy=no-user-gesture-required"],
  defaultViewport: { width: 1280, height: 720 },
});
try {
  const page = await browser.newPage();
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(`[pageerror] ${(e as Error).message}`));
  page.on("console", (m) => {
    if ((m.type() === "error" || m.type() === "warn") && !/403|Failed to load resource/.test(m.text())) problems.push(`[console ${m.type()}] ${m.text().slice(0, 300)}`);
  });
  await page.goto(`${base}?autostart=1&seed=${seed}&size=default&dungeons=default&outside=1`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction("window.__game !== undefined", { timeout: 60000 });
  await sleep(5000);
  // BLOOM=1 looks at the glow of the High quality (the shots of the other modes are taken with it on)
  if (process.env.BLOOM) await page.evaluate(`__game.game.internals.r.setBloom(true)`);
  if (what === "shore") {
    // the foam of the shore (bug_fix_68): by day, at night, and with the effects off
    const spot = shoreSpot(world);
    console.log("shore at", JSON.stringify(spot));
    await page.evaluate(`__game.teleport(${spot.x}, ${spot.y}, "E")`);
    await sleep(4000);
    for (const [label, minutes] of [["day", 24 * 60 + 12 * 60], ["night", 24 * 60 + 23 * 60]] as const) {
      await page.evaluate(`(() => { const p = __game.state.party; p.minutes = ${minutes}; __game.game.refresh(); })()`);
      await sleep(2500);
      await page.screenshot({ path: join(outDir, `shore-${label}.png`) });
      console.log(`${label}: foam meshes`, await page.evaluate(`__game.scene.meshes.filter((m) => m.name.startsWith("fx:foam") && m.isEnabled()).length`), "alpha", await page.evaluate(`(__game.scene.getMaterialByName("fx:foam") || {}).alpha`));
    }
    await page.evaluate(`__game.game.internals.effects.setLevel("off")`);
    await sleep(500);
  } else if (what === "world") {
    // the fountain of the open land (item 2): three tiles south of the nearest one with open ground there, looking north, by day and at night
    const spot = fountainLandmark(world);
    console.log("landmark fountain at", JSON.stringify(spot));
    await page.evaluate(`__game.teleport(${spot.x}, ${spot.y + 4}, "N")`);
    await sleep(3500);
    for (const [label, minutes] of [["day", 24 * 60 + 12 * 60], ["night", 24 * 60 + 23 * 60]] as const) {
      await page.evaluate(`(() => { const p = __game.state.party; p.minutes = ${minutes}; __game.game.refresh(); })()`);
      await sleep(2500);
      await page.screenshot({ path: join(outDir, `world-${label}.png`) });
      console.log(`${label}: fountain light`, await page.evaluate(`JSON.stringify([...__game.game.internals.effects.sites.values()].map((s) => +s.light.toFixed(3)))`));
    }
  } else {
    await page.evaluate(`(async () => { await __game.enter(${JSON.stringify(target.id)}); })()`);
    await sleep(4000);
    await page.evaluate(`__game.teleport(${target.x}, ${target.y}, ${JSON.stringify(target.facing)})`);
    await sleep(1500);
  }

  if (what === "fountain" || what === "all") {
    for (let n = 1; n <= 4; n++) {
      // CLIP=x,y,w,h cuts a part out and shows it three times larger (the water is small on the screen)
      const clip = process.env.CLIP?.split(",").map(Number);
      await page.screenshot({ path: join(outDir, `fountain-${n}.png`), ...(clip && clip.length === 4 ? { clip: { x: clip[0]!, y: clip[1]!, width: clip[2]!, height: clip[3]!, scale: 3 } } : {}) });
      await sleep(450);
    }
  }
  if (what === "impacts" || what === "all") {
    // an impact two cells ahead, shot several times while it plays (the whole burst lasts 0.6 s)
    for (const element of ["fire", "ice", "acid", "magic", "water"]) {
      await page.evaluate(`(() => { const g = __game; const c = g.camera; const f = { x: Math.sin(c.rotation.y), z: Math.cos(c.rotation.y) }; g.game.internals.effects.impact(${JSON.stringify(element)}, { x: c.position.x + f.x * 6, y: c.position.y - 0.4, z: c.position.z + f.z * 6 }); })()`);
      // (a shot takes a while in a headless browser and the whole burst lasts 0.6 s: take them back to back, as fast as possible)
      for (let n = 1; n <= 3; n++) await page.screenshot({ path: join(outDir, `impact-${element}-${n}.png`), optimizeForSpeed: true });
      await sleep(700);
    }
  }
  if (what === "beams") {
    // Prismatic Light: a line of every damage type to a point six metres ahead, with the burst of the element where it ends (17. 11. 2026)
    for (const element of ["fire", "ice", "acid", "magic"]) {
      await page.evaluate(`(() => { const g = __game; const c = g.camera; const f = { x: Math.sin(c.rotation.y), z: Math.cos(c.rotation.y) }; g.game.internals.projectiles.beam(${JSON.stringify(element)}, { x: c.position.x + f.x * 0.9, y: c.position.y - 0.5, z: c.position.z + f.z * 0.9 }, { x: c.position.x + f.x * 6, y: c.position.y - 0.4, z: c.position.z + f.z * 6 }, true); })()`);
      for (let n = 1; n <= 2; n++) await page.screenshot({ path: join(outDir, `beam-${element}-${n}.png`), optimizeForSpeed: true });
      await sleep(900);
    }
  }
  if (what === "night") {
    // the same square at night: the water must be as dark as the stone (bug_fix_68), shots with and without the party's torch far from the fountains
    await page.evaluate(`(() => { const p = __game.state.party; p.minutes = ${24 * 60 + 23 * 60}; __game.game.refresh(); })()`);
    await sleep(2500);
    for (let n = 1; n <= 2; n++) {
      await page.screenshot({ path: join(outDir, `night-${n}.png`) });
      await sleep(450);
    }
    console.log("fountain light at night:", await page.evaluate(`JSON.stringify([...__game.game.internals.effects.sites.values()].map((s) => +s.light.toFixed(3)))`));
  }
  if (what === "dark" || what === "mermaid" || what === "lamps") {
    // the debug showcase is a dark dungeon in which every object stands on its own cell: the town's fountain, the landmark's and the mermaid's (or, with `lamps`, the objects named in
    // ITEMS, by default the ones that give light), seen from three cells away
    await page.evaluate(`(async () => { await __game.leave(); await __game.enter("showcase"); })()`);
    await sleep(6000);
    const wanted = (process.env.ITEMS ?? (what === "lamps" ? "117,120,92,121,3,71,4,86" : "2,89")).split(",").map(Number);
    const spots = JSON.parse((await page.evaluate(`JSON.stringify(__game.game.internals.interior.map.showcase.items.filter((i) => ${JSON.stringify(wanted)}.includes(i.item)).concat(${what === "lamps" ? "[]" : `__game.game.internals.interior.map.showcase.extras.filter((e) => e.model === "obj_fountain")`}).map((i) => ({ name: i.item ?? i.model, x: i.x, y: i.y })))`)) as string) as { name: string | number; x: number; y: number }[];
    console.log("showcase fountains:", JSON.stringify(spots));
    for (const spot of spots) {
      if (what === "mermaid" && spot.name !== 89) continue;
      const dist = Number(process.env.DIST ?? 3);
      await page.evaluate(`__game.teleport(${spot.x + 1}, ${spot.y + dist}, "N")`);
      await sleep(2500);
      // BRIGHT=1 lights the hall as by day (the water follows the light of the scene), CLIP=x,y,w,h cuts a part out and shows it three times larger
      if (process.env.BRIGHT) await page.evaluate(`__game.scene.lights.forEach((l) => { l.intensity = Math.max(l.intensity, 1.6); })`);
      const clip = process.env.CLIP?.split(",").map(Number);
      for (let n = 1; n <= (Number(process.env.SHOTS) || 2); n++) {
        await page.screenshot({ path: join(outDir, `dark-${spot.name}-${n}.png`), ...(clip && clip.length === 4 ? { clip: { x: clip[0]!, y: clip[1]!, width: clip[2]!, height: clip[3]!, scale: 3 } } : {}) });
        await sleep(450);
      }
      console.log(`light at ${spot.name}:`, await page.evaluate(`JSON.stringify([...__game.game.internals.effects.sites.values()].filter((s) => Math.abs(s.x - ${spot.x * 3 + 1.5}) < 2).map((s) => +s.light.toFixed(3)))`));
    }
  }
  if (what === "off" || what === "all") {
    await page.evaluate(`__game.game.internals.effects.setLevel("off")`);
    await sleep(700);
    await page.screenshot({ path: join(outDir, "fountain-off.png") });
    await page.evaluate(`__game.game.internals.effects.setLevel("full")`);
  }
  if (what === "perf" || what === "all") {
    // the cost of one frame of the effects with the fountains of the square in range (CPU only: the quads are rebuilt every frame)
    const ms = await page.evaluate(`(() => { const e = __game.game.internals.effects; e.update(0.016); const t0 = performance.now(); for (let i = 0; i < 500; i++) e.update(0.016); return (performance.now() - t0) / 500; })()`);
    const drawn = await page.evaluate(`__game.scene.meshes.filter((m) => m.name.startsWith("fx:") && m.isEnabled()).map((m) => m.name)`);
    console.log(`effects.update: ${(ms as number).toFixed(3)} ms per frame; fx meshes drawn:`, JSON.stringify(drawn));
  }
  if (what === "leave" || what === "all") {
    // leaving the town takes the fountains with it: no fx mesh of a fountain is left enabled and nothing is in the air
    await page.evaluate(`(async () => { await __game.leave(); })()`);
    await sleep(3500);
    const left = await page.evaluate(`__game.scene.meshes.filter((m) => m.name.startsWith("fx:") && m.isEnabled()).map((m) => m.name)`);
    console.log("after leaving the town, fx meshes drawn:", JSON.stringify(left));
  }
  console.log(problems.length ? problems.join("\n") : "no errors or warnings logged");
} finally {
  await browser.close();
}
