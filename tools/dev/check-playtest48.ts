/**
 * Browser checks of the 48th playtest (needs a dev server, `VITE_FROZEN=1 VITE_PORT=<free port> npx vite --port <free port> --strictPort`):
 *   pillars  the town's new column (point 1)
 *   lights   the light of every flying spell element by day and by night (point 6)
 *
 * Usage: GAME_URL=http://localhost:<port>/ npx tsx tools/dev/check-playtest48.ts <screenshot folder> <pillars|lights> [flat|floor|full]
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
import { generateInterior } from "../../src/interiors";
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
