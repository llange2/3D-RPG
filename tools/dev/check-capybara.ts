/**
 * Browser check of the Capybara (7. 11. 2026) and of the Wolf's pulse: the brittle wall in the start town, the pocket behind it with the model, the question, the card and the page of the
 * mascot, the clip that turns round (timers run ten times faster here), and the card of the Wolf that swells once. Needs a dev server
 * (`VITE_FROZEN=1 VITE_PORT=<free port> npx vite --port <free port> --strictPort`).
 *
 * Usage: GAME_URL=http://localhost:<port>/ npx tsx tools/dev/check-capybara.ts <screenshot folder>
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
import { generateInterior } from "../../src/interiors";
import { FACING_DELTA, type Facing } from "../../src/interiors/types";
import { capybaraSpot } from "../../src/world/mascots";
import { World } from "../../src/world/world";

const base = process.env.GAME_URL ?? "http://localhost:5186/";
const outDir = process.argv[2] ?? "capybara-shots";
const SEED = "cedar-peak-198";
mkdirSync(outDir, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const problems: string[] = [];
const fail = (msg: string) => problems.push(msg);

// in Node (the world is the same in the browser): where the brittle wall is and where the party stands to bump it
const world = new World(SEED, "default");
const map = generateInterior(world, world.poiById("p:0:0:0")!);
const pocket = capybaraSpot(map);
const wall = (map.sites ?? []).find((s) => s.kind === "brittle");
if (!pocket || !wall) throw new Error("the start town has no Capybara");
const toWall = (["N", "E", "S", "W"] as Facing[]).find((f) => FACING_DELTA[f].dx === pocket.x - wall.x && FACING_DELTA[f].dy === pocket.y - wall.y)!;
const stand = { x: wall.x - FACING_DELTA[toWall].dx, y: wall.y - FACING_DELTA[toWall].dy };
console.log("wall", wall.x, wall.y, "pocket", pocket.x, pocket.y, "stand", stand.x, stand.y, "facing", toWall);

const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  protocolTimeout: 240000,
  args: ["--window-size=1280,720", "--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-webgl", "--autoplay-policy=no-user-gesture-required"],
  defaultViewport: { width: 1280, height: 720 },
});
try {
  const page = await browser.newPage();
  page.on("pageerror", (e) => fail(`[pageerror] ${(e as Error).message}`));
  page.on("response", (r) => {
    if (r.status() >= 400) fail(`[http ${r.status()}] ${r.url()}`);
  });
  const evalJs = <T>(code: string) => page.evaluate(code) as Promise<T>;
  const shot = (name: string) => page.screenshot({ path: join(outDir, name) });
  const press = async (label: string) => evalJs<boolean>(`(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === ${JSON.stringify(label)}); if (b) b.click(); return !!b; })()`);
  await page.goto(`${base}?autostart=1&seed=${SEED}&size=default`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction("window.__game !== undefined", { timeout: 60000 });
  await sleep(5000);

  // 1. the wall looks like any wall
  await evalJs(`(async () => { await __game.enter("p:0:0:0"); })()`);
  await sleep(3000);
  await evalJs(`__game.teleport(${stand.x}, ${stand.y}, "${toWall}")`);
  await sleep(1200);
  await shot("1-street.png");

  // 2. with the Perceptive talent, bumping it asks; yes breaks it, the pocket and the Capybara are behind it
  await evalJs(`__game.state.party.talents.push("talent_perceptive")`);
  await page.keyboard.press("w");
  await sleep(1200);
  await shot("2-question.png");
  if (!(await press("Yes"))) fail("the brittle wall asked nothing");
  await sleep(2500);
  await shot("3-broken.png");
  await page.keyboard.press("w");
  await sleep(1500);
  await shot("4-in-the-wall.png");

  // 3. the next step meets the Capybara: the question, then it joins
  await page.keyboard.press("w");
  await sleep(1200);
  await shot("5-meeting.png");
  const asked = await evalJs<string>(`document.body.innerText`);
  if (!asked.includes("capybara")) fail("no question of the capybara on the screen");
  if (!(await press("Yes"))) fail("the meeting asked nothing");
  await sleep(1500);
  const mascot = await evalJs<string>(`__game.state.party.mascot`);
  if (mascot !== "Capybara") fail(`the mascot is ${mascot}, not the Capybara`);
  await shot("6-joined.png");
  await page.keyboard.press("5");
  await sleep(1000);
  await shot("7-mascot-page.png");
  const pageText = await evalJs<string>(`document.querySelector(".mascot-view")?.innerText ?? ""`);
  if (!pageText.includes("cutest thing ever")) fail("the mascot page does not say what the capybara can do");
  await page.keyboard.press("Escape");
  await sleep(500);

  // 4. the clip of the card: timers ten times faster, the clip at ten times its speed; every 60 to 180 seconds (6 to 18 here) it plays to the middle, holds 5 to 15 seconds (0.5 to 1.5), plays on and is back at the start
  await evalJs(`(() => {
    const st = window.setTimeout.bind(window);
    window.__delays = [];
    window.setTimeout = (f, ms, ...a) => { window.__delays.push(ms); return st(f, ms >= 1000 ? ms / 10 : ms, ...a); };
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () { this.playbackRate = 10; return play.call(this); };
    window.__samples = [];
    setInterval(() => { const v = document.querySelector(".mascot-card video"); if (v) window.__samples.push([performance.now(), v.currentTime, v.paused]); }, 100);
  })()`);
  // (the clip waits for its first turn with the old timers: restart it with the quick ones by switching the mascot away and back)
  await evalJs(`(() => { const p = __game.state.party; p.mascot = "Crow"; __game.game.refresh(); p.mascot = "Capybara"; __game.game.refresh(); })()`);
  await sleep(24000);
  const delays = await evalJs<number[]>(`window.__delays.filter((d) => d >= 1000)`);
  console.log("delays of the clip (ms):", delays.map((d) => Math.round(d)).join(", "));
  const [first, half, hold, rest] = delays;
  if (first === undefined || first < 60000 || first > 180000) fail(`the first wait is ${first} ms, not 60 to 180 s`);
  if (half === undefined || Math.abs(half - 5041) > 200) fail(`the clip runs ${half} ms to the middle, not 5 s`);
  if (hold === undefined || hold < 5000 || hold > 15000) fail(`the pause in the middle is ${hold} ms, not 5 to 15 s`);
  if (rest === undefined || Math.abs(rest - 5041) > 200) fail(`the clip runs ${rest} ms from the middle, not 5 s`);
  const samples = await evalJs<[number, number, boolean][]>(`window.__samples`);
  const heldAt = samples.filter(([, t, paused]) => paused && t > 4.5 && t < 5.6);
  console.log("held in the middle for", heldAt.length * 0.1, "s (real time), at", heldAt[0]?.[1]?.toFixed(2));
  if (heldAt.length < 3) fail("the clip was not held in the middle");
  const last = samples[samples.length - 1]!;
  if (samples.some(([, t]) => t > 9)) console.log("reached the end:", samples.some(([, t]) => t > 9));
  console.log("last sample", last[1].toFixed(2), last[2]);
  await shot("8-clip.png");

  // 5. the Wolf: its card swells once and shrinks back at every kill
  await evalJs(`(() => { const p = __game.state.party; p.mascot = "Wolf"; __game.game.refresh(); })()`);
  await sleep(500);
  const before = await evalJs<number>(`document.querySelector(".mascot-card").getAnimations().length`);
  await evalJs(`__game.game.handleEvents([{ type: "wolf_kill", uid: "check", defId: 1 }])`);
  await sleep(250);
  const during = await evalJs<{ n: number; scale: string }>(`(() => { const c = document.querySelector(".mascot-card"); return { n: c.getAnimations().length, scale: getComputedStyle(c).transform }; })()`);
  await shot("9-wolf-pulse.png");
  console.log("wolf animations before", before, "during", JSON.stringify(during));
  if (before !== 0) fail("the Wolf's card was animated before a kill");
  if (during.n !== 1 || during.scale === "none") fail(`the Wolf's card does not pulse: ${JSON.stringify(during)}`);
  await sleep(1000);
  const after = await evalJs<{ n: number; scale: string }>(`(() => { const c = document.querySelector(".mascot-card"); return { n: c.getAnimations().length, scale: getComputedStyle(c).transform }; })()`);
  console.log("after", JSON.stringify(after));
  if (after.n !== 0) fail("the Wolf's card is still pulsing a second later");
} finally {
  await browser.close();
}
if (problems.length) {
  console.log("PROBLEMS:\n" + problems.join("\n"));
  process.exitCode = 1;
} else console.log("OK");
