/**
 * 59th playtest, in the browser (needs a dev server, `VITE_FROZEN=1 VITE_PORT=<free port> npx vite --port <free port> --strictPort`).
 *
 *   runes   <folder> <seed> <size> <place>   quest_8 with a far end room: the solution is set down, the runes appear next to the target, a step on them carries the party into the end room
 *   lantern <folder> <seed> <size> <place> <x,y,F> [<x,y,F> ...]   the party stands on the cells and looks at the lantern (item 76) hanging from the ceiling; a pitch of the camera shows its top
 *
 * Usage: GAME_URL=http://localhost:<port>/ DUNGEONS=default npx tsx tools/dev/check-playtest59.ts <mode> <folder> <seed> <size> <place> ...
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
import { buildMapContent } from "../../src/actions";
import { generateInterior } from "../../src/interiors";
import { World } from "../../src/world/world";
import type { WorldSize } from "../../src/world/types";

const base = process.env.GAME_URL ?? "http://localhost:5201/";
const [mode = "runes", outDir = "p59", seed = "pearl-wood-803", size = "small", name = "Shaft of Falelaa", ...views] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const dungeons = process.env.DUNGEONS ?? "default";

const world = new World(seed, size as WorldSize, dungeons as never);
const poi = world.allPois().find((p) => p.name.toLowerCase() === name.toLowerCase() || p.id === name);
if (!poi) throw new Error(`no place named ${name}`);
const map = generateInterior(world, poi, 0);
const content = buildMapContent(world, poi, map);

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
  await page.evaluateOnNewDocument((v: string) => localStorage.setItem("mm3-seed-rpg:settings:v1", v), JSON.stringify({ environment: process.env.ENV ?? "full" }));
  await page.goto(`${base}?autostart=1&seed=${seed}&size=${size}&dungeons=${dungeons}&outside=1`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction("window.__game !== undefined", { timeout: 60000 });
  await sleep(5000);
  await page.evaluate(`(async () => { await __game.enter(${JSON.stringify(poi.id)}); })()`);
  await sleep(4500);
  await page.evaluate("__game.game.enc.monsters.splice(0)");
  const info = async (): Promise<string> => String(await page.evaluate("JSON.stringify({ at: [__game.game.player.tx, __game.game.player.ty], opened: [...__game.state.opened].filter((k) => k.includes('@crystals') || k.includes('@end')) })"));

  if (mode === "runes") {
    const targets = content.actions.filter((a) => a.kind === "crystal" && a.params.role === "target");
    const first = content.actions.find((a) => a.kind === "crystal" && typeof a.params.solution === "string")!;
    const runes = content.actions.filter((a) => a.kind === "rune" && a.params.need === "crystals");
    const end = map.dungeon!.endRoom!;
    console.log(`${poi.name} (${map.dungeon?.quest}): targets ${targets.map((t) => `${t.x}/${t.y}`).join(", ")}, end room ${end.x}/${end.y} ${end.w}x${end.h}, runes ${runes.map((r) => `${r.x}/${r.y}`).join(", ") || "none"}`);
    const solution = String(first.params.solution).split(";").map((c, i) => `crystal:${map.key}@${c}#${i + 1}`);
    // a spot to look at a rune from: two cells away, looking at it
    const rune = runes[0];
    if (rune) {
      await page.evaluate(`__game.teleport(${rune.x}, ${rune.y + 2}, "N")`);
      await sleep(1500);
      await page.screenshot({ path: join(outDir, "01-before-solved.png") });
    }
    console.log("before     ", await info());
    // the crystals of the solution stand: the light is worked out again
    await page.evaluate(`(() => { const g = __game.game; for (const k of ${JSON.stringify(solution)}) g.state.opened.add(k); g.loadCrystals(); g.syncCrystals(true); })()`);
    await sleep(2500);
    console.log("solved     ", await info());
    await page.screenshot({ path: join(outDir, "02-runes-up.png") });
    if (rune) {
      // look at the rune from the side the party came from, closer
      await page.evaluate(`__game.teleport(${rune.x}, ${rune.y + 2}, "N")`);
      // (looking down at the floor: the runes lie there)
      await page.evaluate(`__game.camera.rotation.x = ${process.env.LOOK_DOWN ?? "0.3"}`);
      await sleep(1500);
      await page.screenshot({ path: join(outDir, "03-runes-close.png") });
      // a step on the rune
      await page.evaluate(`(async () => { const g = __game.game; g.teleport(${rune.x}, ${rune.y}, "N"); await g.onArrived(${rune.x}, ${rune.y}); })()`);
      await sleep(2500);
      console.log("on the rune", await info());
      await page.screenshot({ path: join(outDir, "04-in-end-room.png") });
    }
  } else if (mode === "lantern") {
    const lanterns = content.actions.filter((a) => a.params.item === 76);
    console.log(`${poi.name}: ${map.kind}, ${lanterns.length} lanterns at ${lanterns.map((a) => `${a.x}/${a.y}`).join(", ")}`);
    let n = 0;
    for (const v of views) {
      const [x, y, f] = v.split(",") as [string, string, string];
      await page.evaluate(`__game.teleport(${x}, ${y}, ${JSON.stringify(f)})`);
      // pitched up so that the ceiling is in the picture
      await page.evaluate(`(() => { const c = __game.camera; c.rotation.x = -${process.env.PITCH ?? "0.45"}; })()`);
      await sleep(1500);
      await page.screenshot({ path: join(outDir, `lantern-${++n}-${x}_${y}_${f}.png`) });
    }
  }
  if (problems.length > 0) console.log("PROBLEMS:\n" + problems.join("\n"));
  console.log("done");
} finally {
  await browser.close();
}
