/**
 * Browser check of the 6. 11. 2026 playtest (the visible parts): the blue laser bolt with its light, the Elemental Storm flash that fades in 0.3 s, the Meteor Shower fireballs from the sky,
 * the Identify Monster report with coloured resistances, and the typewriter screen of the bridge console. Needs a dev server (`VITE_FROZEN=1 VITE_PORT=<free port> npx vite --port <free port> --strictPort`).
 *
 * Usage: GAME_URL=http://localhost:<port>/ npx tsx tools/dev/check-playtest44.ts <screenshot folder>
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const base = process.env.GAME_URL ?? "http://localhost:5391/";
const outDir = process.argv[2] ?? "playtest44-shots";
mkdirSync(outDir, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const problems: string[] = [];
const fail = (msg: string) => problems.push(msg);

const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  protocolTimeout: 180000,
  args: ["--window-size=1280,720", "--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-webgl"],
  defaultViewport: { width: 1280, height: 720 },
});
try {
  const page = await browser.newPage();
  page.on("pageerror", (e) => fail(`[pageerror] ${(e as Error).message}`));
  const evalJs = <T>(code: string) => page.evaluate(code) as Promise<T>;
  const shot = (name: string) => page.screenshot({ path: join(outDir, name) });
  await page.goto(`${base}?autostart=1&seed=cedar-peak-198&size=default`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction("window.__game !== undefined", { timeout: 60000 });
  await sleep(5000);

  // ahead of the party: the point 6 units in front of it, at eye height
  const ahead = (d: number, y = 1.2) => `(() => { const p = __game.game.player; const v = { N: [0, 1], E: [1, 0], S: [0, -1], W: [-1, 0] }[p.facing]; return { x: p.x + v[0] * ${d}, y: ${y}, z: p.z + v[1] * ${d} }; })()`;

  // 1. the laser: from far ahead to the party, a light flies along
  await evalJs(`(() => { const g = __game.game; g.projectiles.launch("laser", ${await ahead(14)}, { x: g.player.x, y: g.player.y - 0.7, z: g.player.z }); })()`);
  await sleep(300);
  await shot("1-laser.png");
  const glows = await evalJs<number>(`__game.game.projectiles.glows().length`);
  if (glows < 1) fail("the laser has no light that flies along");
  await sleep(1500);
  if ((await evalJs<number>(`__game.game.projectiles.glows().length`)) !== 0) fail("the laser did not end");

  // 1b. seen from the side: a laser crossing in front of the party, left to right
  await evalJs(`(() => { const g = __game.game; const a = ${await ahead(7)}; g.projectiles.launch("laser", { ...a, x: a.x - 5 }, { ...a, x: a.x + 5 }, 1, 1.0); })()`);
  await sleep(450);
  await shot("1b-laser-side.png");
  await sleep(1000);

  // 2. the storm: the three elements stand in front of the monsters and fade out in 0.3 s
  await evalJs(`(() => { const g = __game.game; const a = ${await ahead(6)}; g.projectiles.flash("fire", { ...a, x: a.x - 2 }); g.projectiles.flash("ice", a); g.projectiles.flash("acid", { ...a, x: a.x + 2 }); })()`);
  await sleep(60);
  await shot("2-storm-start.png");
  await sleep(150);
  await shot("2-storm-fading.png");
  await sleep(400);
  if (await evalJs<boolean>(`__game.game.projectiles.active`)) fail("the storm flashes did not end");

  // 3. the meteors fall out of the sky
  await evalJs(`(() => { const g = __game.game; const a = ${await ahead(7)}; for (const dx of [-2, 0, 2]) g.projectiles.launch("fire", { x: a.x + dx + 1, y: a.y + 11, z: a.z + 1 }, a, 1, 0.5); })()`);
  await sleep(200);
  await shot("3-meteors-falling.png");
  await sleep(900);

  // 4. the report of Identify Monster
  await evalJs(`void __game.game.ui.identifyReport([{ name: "Goblin", maxHp: 120, armor: 5, attacks: 2, abilities: "Ranged Attack", resistances: { physical: 0, fire: 0.15, ice: 0.4, acid: 0.69, magic: 0.7 } }, { name: "Terminator", maxHp: 900, armor: 40, attacks: 3, abilities: "", resistances: { physical: 0.8, fire: 0.2, ice: 0.21, acid: 1, magic: 0.5 } }]), 0`);
  await sleep(300);
  await shot("4-identify.png");
  const tones = await evalJs<string[]>(`[...document.querySelectorAll(".id-res span")].map((s) => s.className + ":" + s.textContent)`);
  console.log(tones.join(" | "));
  const want = ["res-low:Physical 0", "res-low:Fire 0.15", "res-mid:Ice 0.4", "res-mid:Acid 0.69", "res-high:Magic 0.7", "res-high:Physical 0.8", "res-low:Fire 0.2", "res-mid:Ice 0.21", "res-high:Acid 1", "res-mid:Magic 0.5"];
  if (JSON.stringify(tones) !== JSON.stringify(want)) fail(`the colours of the resistances are wrong: ${tones.join(" | ")}`);
  await evalJs(`document.querySelector(".parchment.identify .btn").click()`);
  await sleep(200);

  // 5. the typewriter screen of the console
  const text = "Authentification... |accepted.\nChecking life-systems... |ok.\nChecking engines ... |active.\n\nWould you like to initiate the emergency start sequence?\n\nThis can not be aborted.";
  await evalJs(`window.__ans = undefined; __game.game.ui.terminal("Monitoring-Ship Omega-V", ${JSON.stringify(text)}, "|", true).then((v) => (window.__ans = v)), 0`);
  await sleep(1200);
  await shot("5-terminal-typing.png");
  const hidden = await evalJs<string>(`document.querySelector(".parchment.terminal .buttons").style.visibility`);
  if (hidden !== "hidden") fail("the buttons show before the text is written");
  await sleep(14000);
  await shot("5-terminal-done.png");
  const shown = await evalJs<string>(`document.querySelector(".parchment.terminal .buttons").style.visibility`);
  if (shown !== "visible") fail("the buttons do not show when the text is written");
  const written = await evalJs<string>(`document.querySelector(".parchment.terminal .term-live").textContent`);
  if (written.replace(/\u2588/g, "") !== text.split("|").join("")) fail(`the written text differs: ${written}`);
  await evalJs(`[...document.querySelectorAll(".parchment.terminal .btn")].find((b) => b.textContent === "No").click()`);
  await sleep(100);
  if ((await evalJs<boolean>(`window.__ans`)) !== false) fail("No did not answer false");
  // the second time the text stands there at once
  await evalJs(`window.__ans = undefined; __game.game.ui.terminal("Monitoring-Ship Omega-V", ${JSON.stringify(text)}, "|", false).then((v) => (window.__ans = v)), 0`);
  await sleep(200);
  await shot("6-terminal-again.png");
  if ((await evalJs<string>(`document.querySelector(".parchment.terminal .buttons").style.visibility`)) === "hidden") fail("the buttons are hidden on the second visit");
  await evalJs(`[...document.querySelectorAll(".parchment.terminal .btn")].find((b) => b.textContent === "Yes").click()`);
  await sleep(100);
  if ((await evalJs<boolean>(`window.__ans`)) !== true) fail("Yes did not answer true");
} finally {
  await browser.close();
}
if (problems.length > 0) {
  console.log(problems.join("\n"));
  process.exit(1);
}
console.log("OK");
