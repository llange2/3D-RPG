/**
 * Browser checks of the 48th playtest (needs a dev server, `VITE_FROZEN=1 VITE_PORT=<free port> npx vite --port <free port> --strictPort`):
 *   pillars  the town's new column (point 1)
 *   lights   the light of every flying spell element by day and by night (point 6)
 *
 * Usage: GAME_URL=http://localhost:<port>/ npx tsx tools/dev/check-playtest48.ts <screenshot folder> <pillars|lights|cast|ice|tower> [flat|floor|full]
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
import { generateInterior } from "../../src/interiors";
import { isTower } from "../../src/world/types";
import { World } from "../../src/world/world";

const base = process.env.GAME_URL ?? "http://localhost:5183/";
const outDir = process.argv[2] ?? "playtest48-shots";
const part = process.argv[3] ?? "pillars";
const environment = process.argv[4] ?? "full";
mkdirSync(outDir, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
  page.on("response", (r) => {
    if (r.status() >= 400) problems.push(`[http ${r.status()}] ${r.url()}`);
  });
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warn") problems.push(`[console ${m.type()}] ${m.text().slice(0, 300)}`);
  });
  await page.evaluateOnNewDocument((v: string) => localStorage.setItem("mm3-seed-rpg:settings:v1", v), JSON.stringify({ environment }));
  const evalJs = <T>(code: string) => page.evaluate(code) as Promise<T>;
  const shot = (name: string) => page.screenshot({ path: join(outDir, `${part}-${environment}-${name}.png`) });
  const open = async (seed: string, outside = false) => {
    await page.goto(`${base}?autostart=1&seed=${seed}&size=default${outside ? "&outside=1" : ""}`, { waitUntil: "load", timeout: 60000 });
    await page.waitForFunction("window.__game !== undefined", { timeout: 60000 });
    await sleep(5000);
  };

  if (part === "pillars") {
    const seed = "cedar-peak-198";
    const world = new World(seed, "default");
    // the first town (any level) that has a pillar cell
    const withPillars = world.allPois().filter((p) => p.kind === "town").map((p) => ({ p, map: generateInterior(world, p) })).find((e) => (e.map.pillars?.length ?? 0) > 0);
    if (!withPillars) throw new Error("no town with pillars in this world");
    const town = withPillars.p;
    const map = withPillars.map;
    const pillar = map.pillars?.[0];
    console.log(`${town.id} ${town.name}: ${map.pillars?.length ?? 0} pillar cells, first`, JSON.stringify(pillar));
    if (!pillar) throw new Error("no pillar in the town");
    await open(seed);
    await evalJs(`(async () => { await __game.enter(${JSON.stringify(town.id)}); })()`);
    await sleep(3500);
    // two cells in front of the pillar cell, looking at it, whichever side is open
    for (const [dx, dy, f] of [[0, 3, "N"], [3, 0, "W"], [0, -3, "S"], [-3, 0, "E"]] as [number, number, string][]) {
      const x = pillar.x + dx;
      const y = pillar.y + dy;
      if (map.cells[y * map.width + x] === undefined) continue;
      await evalJs(`__game.teleport(${x}, ${y}, "${f}")`);
      await sleep(1200);
      await shot(`pillar-${f}`);
    }
  }
  if (part === "lights") {
    const seed = "cedar-peak-198";
    await open(seed, true);
    for (const [label, minutes] of [["night", 24 * 60 + 23 * 60], ["day", 24 * 60 + 12 * 60]] as [string, number][]) {
      await evalJs(`(() => { const p = __game.state.party; p.minutes = ${minutes}; __game.game.refresh(); })()`);
      await sleep(1500);
      for (const kind of ["fire", "acid", "ice", "magic"]) {
        await evalJs(`(() => { const g = __game.game; const p = g.player; const s = { x: p.x, y: 1.4, z: p.z }; const e = { x: p.x + 2, y: 1.4, z: p.z - 18 }; g.projectiles.launch(${JSON.stringify(kind)}, s, e, 1, 3); })()`);
        await sleep(1200);
        await shot(`${label}-${kind}`);
        await sleep(2500);
      }
    }
  }
  if (part === "tower") {
    // a tower of the world: from outside, from inside, and up the stairs and down again (quest document 1.7)
    let found: { seed: string; poiId: string; x: number; y: number; side: string } | null = null;
    for (const seed of ["cedar-peak-198", "amber-gate-204", "frost-mere-472", "alpha", "beta", "gamma", "delta"]) {
      const world = new World(seed, "default");
      const poi = world.allPois().find((p) => isTower(p));
      if (poi) {
        found = { seed, poiId: poi.id, x: poi.x, y: poi.y, side: poi.side };
        break;
      }
    }
    if (!found) throw new Error("no tower in the seeds tried");
    const world = new World(found.seed, "default");
    const poi = world.poiById(found.poiId)!;
    const map = generateInterior(world, poi);
    const tower = map.dungeon!.tower!;
    console.log(`${found.seed}: ${poi.name} (${poi.id}) at ${poi.x}/${poi.y}, side ${poi.side}, ${tower.floors.length} floors of ${tower.floors[0]!.size}, quest ${map.dungeon!.quest}`);
    await open(found.seed, true);
    const front = world.frontOf(poi);
    const toward = { N: "S", S: "N", E: "W", W: "E" }[poi.side]!;
    const away = { N: { dx: 0, dy: -1 }, S: { dx: 0, dy: 1 }, E: { dx: 1, dy: 0 }, W: { dx: -1, dy: 0 } }[poi.side]!;
    for (const [dist, name] of [[4, "outside-near"], [9, "outside-far"]] as [number, string][]) {
      await evalJs(`__game.teleport(${front.x + away.dx * dist}, ${front.y + away.dy * dist}, "${toward}")`);
      await sleep(2500);
      await shot(name);
    }
    await evalJs(`(async () => { await __game.enter(${JSON.stringify(poi.id)}); })()`);
    await sleep(4500);
    await shot("inside-start");
    // the way in is the Fort door of the castle: from the cell in front of it, looking back at it
    await evalJs(`__game.teleport(${map.spawn.x}, ${map.spawn.y}, "S")`);
    await sleep(1500);
    await shot("inside-entrance-door");
    // the models the tower needs are loaded, and the staircase and the Fort door are drawn
    const models = await evalJs<string>(`JSON.stringify({ info: ["obj_spiral_staircase", "ci_100", "blk_wooden_floor"].map((k) => [k, !!__game.game.staticInfo[k]]), instances: __game.game.internals.props.instanceCount() })`);
    console.log("models:", models);
    console.log("loaded:", await evalJs<string>(`JSON.stringify(["obj_spiral_staircase", "ci_100", "blk_wooden_floor", "obj_chest", "ci_73"].map((k) => [k, __game.game.internals.props.models.has(k)]))`));
    console.log("ensure:", await evalJs<string>(`(async () => { try { await __game.game.internals.props.ensure(__game.game.staticInfo, ["obj_spiral_staircase"]); return "ok " + __game.game.internals.props.models.has("obj_spiral_staircase"); } catch (e) { return "ERROR " + (e && e.message); } })()`));
    console.log("themed keys:", await evalJs<string>(`JSON.stringify(__game.game.interior.content.actions.filter((a) => a.kind === "stairs").map((a) => [a.uid, a.params.item]))`));
    console.log("staircase:", await evalJs<string>(`(() => { const m = __game.game.internals.props.models.get("obj_spiral_staircase"); const info = __game.game.staticInfo["obj_spiral_staircase"]; return JSON.stringify({ meshes: m && m.meshes.length, buffers: m && [...m.buffers.entries()].map(([k, b]) => [k, b.length / 16, Array.from(b.slice(0, 16)).map((n) => +n.toFixed(2))]), base: m && m.base, centre: m && m.centre, bounds: info && info.bounds, visible: m && m.meshes.map((x) => [x.isEnabled(), x.isVisible, x.getTotalVertices(), x.visibility, x.thinInstanceCount]) }); })()`));
    // look along the first staircase from the cell in front of it, then step onto it
    const opposite = { N: "S", S: "N", E: "W", W: "E" } as Record<string, string>;
    const s0 = tower.stairs[0]!;
    const inward = { N: { dx: 0, dy: -1 }, S: { dx: 0, dy: 1 }, E: { dx: 1, dy: 0 }, W: { dx: -1, dy: 0 } }[s0.facing]!;
    for (const [steps, name] of [[1, "stairs-up-front"], [3, "stairs-up-far"]] as [number, string][]) {
      await evalJs(`__game.teleport(${s0.up.x + inward.dx * steps}, ${s0.up.y + inward.dy * steps}, "${opposite[s0.facing]}")`);
      await sleep(1500);
      await shot(name);
    }
    // the Fort door on the floor above: from the cell in front of it, and from three cells away
    const hi = tower.stairs[0]!;
    for (const [steps, name] of [[1, "door-down-front"], [3, "door-down-far"]] as [number, string][]) {
      await evalJs(`__game.teleport(${hi.down.x + inward.dx * steps}, ${hi.down.y + inward.dy * steps}, "${opposite[s0.facing]}")`);
      await sleep(1500);
      await shot(name);
    }
    await evalJs(`__game.teleport(${s0.front.x}, ${s0.front.y}, "${opposite[s0.facing]}")`);
    await sleep(800);
    await evalJs(`__game.teleport(${s0.front.x + 0}, ${s0.front.y + 0}, "${opposite[s0.facing]}")`);
    await page.keyboard.press("w");
    await sleep(2500);
    const at = await evalJs<string>(`JSON.stringify({ x: __game.game.player.tx, y: __game.game.player.ty, f: __game.game.player.facing })`);
    console.log("after the staircase:", at, "expected", JSON.stringify({ x: s0.land.x, y: s0.land.y, f: s0.facing }));
    await shot("stairs-up-arrived");
    // back down: the door is behind the party (it arrived facing into the room), so a step back goes through it
    await page.keyboard.press("s");
    await sleep(2500);
    const down = await evalJs<string>(`JSON.stringify({ x: __game.game.player.tx, y: __game.game.player.ty, f: __game.game.player.facing })`);
    console.log("after the door down:", down, "expected", JSON.stringify({ x: s0.front.x, y: s0.front.y, f: s0.facing }));
    await shot("stairs-down-arrived");
    // the party must not arrive on the other end's cell again (no loop)
    await sleep(1000);
  }
  if (part === "ice") {
    // the icicle as the party sees it from behind: almost still, just ahead of the party (a flight of 1000 s); `tag` names the shot
    await open("cedar-peak-198", true);
    await sleep(6000);
    // the model placed by hand with the pose of the game (pitch 90 about x, flying straight ahead) and a spin of 0, +45 and -45 degrees about its long axis
    for (const spin of [0, 45, -45]) {
      await evalJs(`(() => { const g = __game.game; const p = g.player; const yaw = __game.camera.rotation.y; const x = p.x + Math.sin(yaw) * 5; const z = p.z + Math.cos(yaw) * 5;
        g.internals.props.setInstances("test:ice", [{ model: "proj_ice", x, y: 1.9, z, rotY: yaw, rotX: Math.PI / 2, rotZ: 0, spin: ${spin} * Math.PI / 180, scale: 0.6, atOrigin: true }]); g.internals.props.flush(); })()`);
      await sleep(1200);
      await shot(`ice-spin${spin}`);
    }
    await evalJs(`__game.game.internals.props.removeOwner("test:ice")`);
  }
  if (part === "cast") {
    // the real spells at real monsters: Star Burst, Prismatic Light, Meteor Shower, Acid Spray, Cold Ray, Fireball. `time` = day | night, `spells` = ids separated by commas
    const seed = process.argv[5] ?? "cedar-peak-198";
    const time = process.argv[6] ?? "day";
    const ids = (process.argv[7] ?? "76,73,72,38,39,44").split(",").map(Number);
    await open(seed, true);
    await evalJs(`(() => { const p = __game.state.party; p.minutes = ${time === "night" ? 24 * 60 + 23 * 60 : 24 * 60 + 12 * 60}; __game.game.refresh(); })()`);
    const found = await evalJs<boolean>(`__game.gotoMonster(3)`);
    if (!found) throw new Error("no monster with three free tiles in front of it near the start");
    await sleep(5000);
    // slow motion (argv[8], the share of real time): a screenshot takes longer than the 0.7 s an effect lives
    const slow = Number(process.argv[8] ?? 0.15);
    await evalJs(`(() => { const pr = __game.game.projectiles; const run = pr.update.bind(pr); pr.update = (dt) => run(dt * ${slow}); })()`);
    await evalJs(`(() => { const p = __game.state.party; const c = p.characters[3]; c.spells = ${JSON.stringify(ids)}; c.mana = c.sp = 99999; for (const h of p.characters) { h.hp = h.health = 99999; h.conditions = ["Healthy"]; } p.food = 3; })()`);
    for (const id of ids) {
      await evalJs(`(() => { for (const m of __game.game.enc.monsters) m.hp = 99999; })()`);
      await evalJs(`__game.game.debugCast(3, ${id})`);
      // the tint of Star Burst runs on the page's own clock: freeze it a third of the way through, so that a shot shows it
      // (the red tint of a monster's hit would lie over it)
      await evalJs(`document.querySelector(".dim-overlay").style.display = "none"`);
      if (id === 76) await evalJs(`document.querySelector(".light-flash").getAnimations().forEach((a) => { a.pause(); a.currentTime = 250; })`);
      for (const [ms, tag] of [[200, "a"], [500, "b"], [800, "c"], [1100, "d"]] as [number, string][]) {
        await sleep(ms);
        await shot(`${time}-spell${id}-${tag}`);
      }
      await sleep(5000);
    }
  }
  if (problems.length) console.log("PROBLEMS:\n" + problems.join("\n"));
} finally {
  await browser.close();
}
console.log("done");
