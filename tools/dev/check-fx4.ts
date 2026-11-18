/**
 * Looks at the effects of the 4th round (18. 11. 2026, `render/fx.ts`, `render/hitFx.ts`): the flames of the tower's and the cave's torches from the side and the front, the lamps (lava, acid, the
 * magic pools, the heap of treasure) and the loot, and what flies off a monster that is hit. Needs a dev server (`VITE_FROZEN=1 VITE_PORT=<free port> npx vite --port <free port> --strictPort`).
 *
 * Usage: GAME_URL=http://localhost:<port>/ npx tsx tools/dev/check-fx4.ts <folder> [seed] [what]    what = tower | cave | hits | all (default)
 * The shots are `<folder>/tower-<n>.png`, `cave-<n>.png`, `hit-<group>-<n>.png`. Prints what the page logged (errors, warnings).
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
import { MONSTERS } from "../../src/data/tables";
import { isTower } from "../../src/world/types";
import { World } from "../../src/world/world";

const base = process.env.GAME_URL ?? "http://localhost:5231/";
const [outDir = "fx4-shots", seed = "birch-reach-493", what = "all"] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const world = new World(seed, "default", "default");
const away = { N: { dx: 0, dy: -1 }, S: { dx: 0, dy: 1 }, E: { dx: 1, dy: 0 }, W: { dx: -1, dy: 0 } } as const;
const toward = { N: "S", S: "N", E: "W", W: "E" } as const;
const left = { N: { dx: -1, dy: 0 }, S: { dx: 1, dy: 0 }, E: { dx: 0, dy: -1 }, W: { dx: 0, dy: 1 } } as const;

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
  await page.evaluate(`__game.game.internals.effects.setLevel("full")`);
  const night = process.env.DAY ? 24 * 60 + 12 * 60 : 24 * 60 + 23 * 60;
  await page.evaluate(`(() => { const p = __game.state.party; p.minutes = ${night}; __game.game.refresh(); })()`);

  /** Stands `dist` tiles in front of a place and `side` tiles to its left (seen from the front), looking at it from a slant or straight on. */
  const look = async (name: string, id: string, planned: { dist: number; side: number; facing?: "N" | "E" | "S" | "W" }[]) => {
    // SPOTS="dist:side,dist:side" replaces the planned spots; CLIP=x,y,w,h cuts a part out of the picture and shows it three times larger
    const shots: typeof planned = process.env.SPOTS ? process.env.SPOTS.split(",").map((s) => ({ dist: Number(s.split(":")[0]), side: Number(s.split(":")[1]) })) : planned;
    const clip = process.env.CLIP?.split(",").map(Number);
    const poi = world.poiById(id)!;
    const front = world.frontOf(poi);
    let n = 0;
    for (const s of shots) {
      const x = front.x + away[poi.side].dx * s.dist + left[poi.side].dx * s.side;
      const y = front.y + away[poi.side].dy * s.dist + left[poi.side].dy * s.side;
      if (!world.isOpenGround(x, y)) {
        console.log(`${name}: skipped (${x},${y}) not open ground`);
        continue;
      }
      await page.evaluate(`__game.teleport(${x}, ${y}, "${s.facing ?? toward[poi.side]}")`);
      await sleep(Number(process.env.WAIT ?? 6000));
      if (process.env.DEBUG_FX) console.log(await page.evaluate(`JSON.stringify({ flames: __game.game.towerFlames.map((f) => [f.key, +f.x.toFixed(2), +f.y.toFixed(2), +f.z.toFixed(2)]), lights: __game.game.towerLamps.length, particles: __game.game.internals.effects.particles.length, lamps: __game.game.internals.effects.lamps.length, level: __game.game.internals.effects.level, player: [__game.game.player.x, __game.game.player.z] })`));
      // MARK=1 puts a small red dot on every flame spot (a marker 0.12 across that does not move), to see whether the spot is on the torch
      if (process.env.MARK) await page.evaluate(`(() => { const e = __game.game.internals.effects; for (const f of __game.game.towerFlames) e.particles.push({ kind: "puff", cell: 0, x: f.x, y: f.y + ${Number(process.env.MARK_UP ?? 0)}, z: f.z, vx: 0, vy: 0, vz: 0, age: 20, life: 60, size0: 0.12, size1: 0.12, peak: 1, floor: -1e9, lands: "none", scale: 1, site: null, tint: [0.2, 1, 0.3] }); })()`);
      if (process.env.MARK) {
        await sleep(600);
        console.log(await page.evaluate(`JSON.stringify({ n: __game.game.internals.effects.particles.length, marks: __game.game.internals.effects.particles.filter((p) => p.life === 60).map((p) => [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2), +p.age.toFixed(1)]).slice(0, 3), main: __game.game.internals.effects.main.mesh.isEnabled(), cam: __game.scene.activeCamera.globalPosition.asArray().map((v) => +v.toFixed(2)) })`));
      }
      for (let k = 0; k < (Number(process.env.FRAMES) || 1); k++) {
        await page.screenshot({ path: join(outDir, `${name}-${n + 1}${k ? `-${k}` : ""}.png`), ...(clip && clip.length === 4 ? { clip: { x: clip[0]!, y: clip[1]!, width: clip[2]!, height: clip[3]!, scale: 3 } } : {}) });
        await sleep(350);
      }
      n++;
    }
  };

  if (what === "tower" || what === "all") {
    const tower = world.allPois().find((p) => isTower(p))!;
    console.log("tower", tower.id, tower.side);
    await look("tower", tower.id, [{ dist: 4, side: 0 }, { dist: 2, side: 4, facing: toward[tower.side] }, { dist: 5, side: -5 }, { dist: 3, side: 3 }]);
  }
  if (what === "cave" || what === "all") {
    const cave = world.poiById(process.env.CAVE ?? "p:0:0:110")!;
    console.log("cave", cave.id, cave.side);
    await look("cave", cave.id, [{ dist: 4, side: 0 }, { dist: 2, side: 3 }, { dist: 3, side: -3 }, { dist: 5, side: 2 }]);
  }
  if (what === "hits" || what === "all") {
    // one monster of each group two tiles ahead of the party, hit once (`Game.monsterHitFx`, what a blow or an arrow does), four pictures 0.15 s apart
    const names = (process.env.HITS ?? "Goblin,Dino Beetle,ED-409,Candle Creep,Wild Fungus,Skeleton").split(",");
    const start = world.startPosition();
    await page.evaluate(`__game.teleport(${start.x + 3}, ${start.y + 3}, "N")`);
    await sleep(2500);
    for (const name of names) {
      const defId = Object.values(MONSTERS).find((m) => m.name === name)?.id;
      if (defId === undefined) {
        console.log("no monster", name);
        continue;
      }
      const spot = JSON.parse((await page.evaluate(`(async () => {
        const enc = await import("/src/sim/encounter.ts");
        const g = __game.game;
        const p = g.internals.player;
        const e = g.internals.enc;
        e.monsters.length = 0;
        const dirs = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
        const [dx, dy] = dirs[p.facing];
        const m = enc.createMonster("check:hit", ${defId}, p.tx + dx * 2, p.ty + dy * 2);
        e.monsters.push(m);
        g.addMonsterView(m);
        return JSON.stringify({ x: m.x, y: m.y, facing: p.facing });
      })()`)) as string) as { x: number; y: number; facing: string };
      await sleep(Number(process.env.WAIT ?? 3500));
      const kind = await page.evaluate(`(() => { const g = __game.game; g.monsterHitFx("check:hit", ${defId}); return JSON.stringify(g.internals.effects.debris.length) + " bits, " + JSON.stringify(g.internals.effects.particles.length) + " particles"; })()`);
      console.log(`${name} (${defId}) at`, JSON.stringify(spot), "->", kind);
      const clip = process.env.CLIP?.split(",").map(Number);
      for (let k = 0; k < (Number(process.env.FRAMES) || 4); k++) {
        await page.screenshot({ path: join(outDir, `hit-${name.replace(/\W+/g, "_")}-${k + 1}.png`), ...(clip && clip.length === 4 ? { clip: { x: clip[0]!, y: clip[1]!, width: clip[2]!, height: clip[3]!, scale: 2 } } : {}) });
        await sleep(100);
      }
    }
  }
  if (what === "lamps" || what === "all") {
    // the debug showcase is a dark dungeon in which every object stands on its own cell: the party stands three cells south of each object named in ITEMS and looks north at it
    await page.evaluate(`(async () => { await __game.leave(); await __game.enter("showcase"); })()`);
    await sleep(6000);
    await page.evaluate(`__game.game.internals.effects.setLevel("full")`);
    const wanted = (process.env.ITEMS ?? "120,92,121,37,88,4,71").split(",").map(Number);
    const spots = JSON.parse((await page.evaluate(`JSON.stringify(__game.game.internals.interior.map.showcase.items.filter((i) => ${JSON.stringify(wanted)}.includes(i.item)).map((i) => ({ name: i.item, x: i.x, y: i.y })))`)) as string) as { name: number; x: number; y: number }[];
    const clip = process.env.CLIP?.split(",").map(Number);
    for (const spot of spots) {
      await page.evaluate(`__game.teleport(${spot.x + Number(process.env.OFFX ?? 0)}, ${spot.y + Number(process.env.DIST ?? 3)}, "N")`);
      await sleep(1500);
      // where do the particles of this object start? Every newborn particle within two units of it is noted for five seconds (its height over the floor)
      const born = (await page.evaluate(`new Promise((done) => { const e = __game.game.internals.effects; const out = []; const cx = ${spot.x * 3 + 1.5}, cz = ${-(spot.y * 3 + 1.5)}; const t0 = performance.now(); const seen = new Set(); const id = setInterval(() => { for (const p of e.particles) if (p.age < 0.1 && !seen.has(p) && Math.hypot(p.x - cx, p.z - cz) < 2) { seen.add(p); out.push(+p.y.toFixed(2)); } if (performance.now() - t0 > 5000) { clearInterval(id); done(out); } }, 30); })`)) as number[];
      console.log(`item ${spot.name}: ${born.length} particles started, height ${born.length ? `${Math.min(...born)} .. ${Math.max(...born)}` : "-"}`);
      for (let k = 0; k < (Number(process.env.FRAMES) || 2); k++) {
        await page.screenshot({ path: join(outDir, `lamp-${spot.name}-${k + 1}.png`), ...(clip && clip.length === 4 ? { clip: { x: clip[0]!, y: clip[1]!, width: clip[2]!, height: clip[3]!, scale: 2 } } : {}) });
        await sleep(500);
      }
    }
    console.log("lamps of", JSON.stringify(spots));
  }
  console.log(problems.length ? problems.join("\n") : "no errors or warnings logged");
} finally {
  await browser.close();
}
