/**
 * bug_fix_64: the overworld models of a cave entrance (the user's `Cave_Entrance.glb`) and of a castle that lies in ruins (`Castle_destroyed.glb`, after a king holds the eleventh orb).
 * Needs a dev server (`VITE_FROZEN=1 VITE_PORT=<free port> npx vite --port <free port> --strictPort`).
 *
 * Usage: GAME_URL=http://localhost:<port>/ npx tsx tools/dev/check-bugfix64.ts <folder> <seed> <flat|floor|full> <cave|castle|ruin> <place name or id> [<distance in tiles>]
 *   cave:   the party stands `distance` tiles in front of the entrance and looks at it
 *   castle: the same for a castle
 *   ruin:   the flag `king:winner=<kind of the first other castle>` is set, the party goes into the castle that won and out again (the overworld is built anew), then looks at the named castle
 */
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
import { SIDE_DELTA } from "../../src/world/types";
import { World, poiFront } from "../../src/world/world";

const base = process.env.GAME_URL ?? "http://localhost:5180/";
const [outDir = "bugfix64-shots", seed = "pearl-shore-794", environment = "flat", what = "cave", name = "Cavern of Duna", distance = "4"] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const world = new World(seed, "default", (process.env.DUNGEONS ?? "default") as never);
const poi = world.allPois().find((p) => p.name.toLowerCase() === name.toLowerCase() || p.id === name);
if (!poi) throw new Error(`no place named ${name}`);
const front = poiFront(poi);
const d = SIDE_DELTA[front.side];
const dist = Number(distance);
// the party stands in front of the place and looks at it: the opposite of the side the entrance is on
const OPPOSITE = { N: "S", E: "W", S: "N", W: "E" } as const;
// BACK=1 stands behind the place instead (to see which way a new model faces)
const sign = process.env.BACK ? -1 : 1;
const stand = { x: front.x + d.dx * dist * sign, y: front.y + d.dy * dist * sign, facing: sign === 1 ? OPPOSITE[front.side] : front.side };
const winner = world.allPois().filter((p) => p.kind === "castle" && p.id !== poi.id).map((p) => world.castleAlignment(p.id))[0];

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
  await page.evaluateOnNewDocument((v: string) => localStorage.setItem("mm3-seed-rpg:settings:v1", v), JSON.stringify({ environment }));
  await page.goto(`${base}?autostart=1&seed=${seed}&size=default&dungeons=${process.env.DUNGEONS ?? "default"}&outside=1`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction("window.__game !== undefined", { timeout: 60000 });
  await sleep(5000);
  if (what === "ruin") {
    // another castle than the one that is looked at wins: the named one (and the third) are rubble. The party has to be in a place and out again for the chunks to be built anew
    const kinds = world.allPois().filter((p) => p.kind === "castle").map((p) => world.castleAlignment(p.id));
    const keep = kinds.find((k) => k !== world.castleAlignment(poi.id)) ?? winner;
    await page.evaluate(`__game.state.opened.add(${JSON.stringify(`king:winner=${keep}`)})`);
    const first = world.allPois().find((p) => p.kind === "castle" && world.castleAlignment(p.id) === keep)!;
    await page.evaluate(`(async () => { await __game.enter(${JSON.stringify(first.id)}); })()`);
    await sleep(4000);
    await page.evaluate(`(async () => { await __game.leave(); })()`);
    await sleep(6000);
  }
  await page.evaluate(`__game.teleport(${stand.x}, ${stand.y}, ${JSON.stringify(stand.facing)})`);
  await sleep(5000);
  // SCRIPT=<js file> runs in the page before the shot (its result is printed)
  if (process.env.SCRIPT) console.log("script:", JSON.stringify(await page.evaluate(readFileSync(process.env.SCRIPT, "utf8"))));
  await sleep(1500);
  await page.screenshot({ path: join(outDir, `${what}-${environment}-${poi.id.replaceAll(":", "_")}-${dist}${process.env.BACK ? "-back" : ""}.png`) });
  if (problems.length > 0) console.log("PROBLEMS:\n" + problems.join("\n"));
  console.log("done", poi.id, poi.name, front, stand);
} finally {
  await browser.close();
}
