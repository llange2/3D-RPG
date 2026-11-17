/**
 * bug_fix_68, points 2 and 3: the spaceship has no door out (the wall behind the transporter tube is the plain spaceship wall), and every airlock has both levers (seed pearl-shore-794: life support
 * had one lever only). Takes the tube from its front and, at the airlock between the control room and life support, both levers. Needs a dev server
 * (`VITE_FROZEN=1 VITE_PORT=<free port> npx vite --port <free port> --strictPort`).
 *
 * Usage: GAME_URL=http://localhost:<port>/ npx tsx tools/dev/check-ship-entrance.ts <screenshot folder> [seed] [airlock index]
 * The shots are `<folder>/ship-tube.png`, `ship-lever-a.png`, `ship-lever-b.png`.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
import { planDungeon } from "../../src/interiors";
import { World } from "../../src/world/world";

const base = process.env.GAME_URL ?? "http://localhost:5193/";
const [outDir = "ship-shots", seed = "pearl-shore-794", lockArg = "1"] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const world = new World(seed, "default", "default" as never);
const pyramid = world.allPois().find((p) => planDungeon(world, p)?.klass === "C")!;

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
  await page.evaluate(`(async () => { await __game.enter(${JSON.stringify(pyramid.id)}); })()`);
  await sleep(6000);
  const info = JSON.parse((await page.evaluate(`JSON.stringify((() => { const m = __game.game.internals.interior.map; const s = m.spaceship; const a = __game.game.internals.interior.actionsOf ? null : null; return { spawn: m.spawn, locks: s.locks, tubes: s.tubes }; })())`)) as string) as {
    spawn: { x: number; y: number; facing: string };
    locks: { door: { x: number; y: number }; a: { x: number; y: number }; b: { x: number; y: number }; axis: string }[];
    tubes: { x: number; y: number; front: { x: number; y: number }; facing?: string }[];
  };
  console.log("spawn", JSON.stringify(info.spawn), "airlocks", info.locks.length);
  // (the party starts with its back to the tube: turn round and look at the tube and the wall behind it)
  const toward = { S: "N", N: "S", E: "W", W: "E" }[info.spawn.facing] ?? "N";
  await page.evaluate(`__game.teleport(${info.spawn.x}, ${info.spawn.y}, ${JSON.stringify(toward)})`);
  await sleep(2000);
  await page.screenshot({ path: join(outDir, "ship-tube.png") });
  const lock = info.locks[Number(lockArg)]!;
  console.log("airlock", lockArg, JSON.stringify(lock));
  for (const side of ["a", "b"] as const) {
    const lever = lock[side];
    // stand in the corridor beside the niche, looking into it
    const corridor = lock.axis === "y" ? { x: lock.door.x, y: lever.y } : { x: lever.x, y: lock.door.y };
    const dx = Math.sign(lever.x - corridor.x);
    const dy = Math.sign(lever.y - corridor.y);
    const facing = dx > 0 ? "E" : dx < 0 ? "W" : dy > 0 ? "S" : "N";
    await page.evaluate(`__game.teleport(${corridor.x}, ${corridor.y}, ${JSON.stringify(facing)})`);
    await sleep(2500);
    const levers = await page.evaluate(`JSON.stringify([...__game.game.internals.interior.actionAt.values()].filter((a) => a.kind === "lever" && a.x === ${lever.x} && a.y === ${lever.y}).length)`);
    console.log(`lever ${side} at ${lever.x},${lever.y}: ${levers} lever object(s)`);
    await page.screenshot({ path: join(outDir, `ship-lever-${side}.png`) });
  }
  console.log(problems.length ? problems.join("\n") : "no errors or warnings logged");
} finally {
  await browser.close();
}
