/**
 * Browser check (45th playtest, point 9): when the quest of a place is solved and the wall of its end room moves, the grinding of stone (`stone_move`, sound 9050) plays.
 * Opens the first dungeon with a sealed end room, solves its quest the way the game does (`openEndRoom`) and counts the requests to the sound system. Needs a dev server
 * (`VITE_FROZEN=1 VITE_PORT=<free port> npx vite --port <free port> --strictPort`).
 *
 * Usage: GAME_URL=http://localhost:<port>/ npx tsx tools/dev/check-endroom-sound.ts
 */
import puppeteer from "puppeteer-core";
import { generateInterior, planDungeon } from "../../src/interiors";
import { World } from "../../src/world/world";

const base = process.env.GAME_URL ?? "http://localhost:5185/";
const SEED = "cedar-peak-198";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const world = new World(SEED, "default");
const target = world.allPois().find((p) => (p.kind === "dungeon" || p.kind === "cave") && planDungeon(world, p)?.klass !== "C" && generateInterior(world, p).dungeon?.endRoom?.seal);
if (!target) throw new Error("no place with a sealed end room");
console.log("place:", target.id, planDungeon(world, target)?.quest);

const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  protocolTimeout: 120000,
  args: ["--window-size=1280,720", "--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-webgl", "--autoplay-policy=no-user-gesture-required"],
  defaultViewport: { width: 1280, height: 720 },
});
try {
  const page = await browser.newPage();
  const evalJs = <T>(code: string) => page.evaluate(code) as Promise<T>;
  await page.goto(`${base}?autostart=1&seed=${SEED}&size=default`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction("window.__game !== undefined", { timeout: 60000 });
  await sleep(5000);
  await evalJs(`(async () => { await __game.enter("${target.id}"); })()`);
  await sleep(3500);
  const result = await evalJs<{ before: number; after: number; sound: string | null }>(`(() => {
    const g = __game.game; const plays = [];
    const orig = g.audio.play.bind(g.audio);
    g.audio.play = (id, v) => { plays.push(id); return orig(id, v); };
    const before = g.audio.requests;
    g.openEndRoom();
    return { before, after: g.audio.requests, sound: plays.join(",") };
  })()`);
  console.log(JSON.stringify(result));
  if (!result.sound?.split(",").includes("9050")) {
    console.log("PROBLEM: the stone does not grind");
    process.exitCode = 1;
  } else console.log("OK");
} finally {
  await browser.close();
}
