/**
 * Browser check of ue_quest_4 (quest document 1.4): the pirate ship sails towards a party on the raft, the pirate queen's dialogue shows her portrait, the party loses its gold (no
 * pearl) or hands in its pearls, the ship fades out and is away for a week. Needs a dev server (`VITE_FROZEN=1 VITE_PORT=<free port> npx vite --port <free port> --strictPort`).
 *
 * Usage: GAME_URL=http://localhost:<port>/ npx tsx tools/dev/check-pirate.ts <screenshot folder>
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const base = process.env.GAME_URL ?? "http://localhost:5191/";
const outDir = process.argv[2] ?? "pirate-shots";
mkdirSync(outDir, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const problems: string[] = [];
const fail = (msg: string) => problems.push(msg);

const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: ["--window-size=1280,720", "--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-webgl"],
  defaultViewport: { width: 1280, height: 720 },
});
try {
  const page = await browser.newPage();
  page.on("pageerror", (e) => fail(`[pageerror] ${(e as Error).message}`));
  const evalJs = <T>(code: string) => page.evaluate(code) as Promise<T>;
  const shot = (name: string) => page.screenshot({ path: join(outDir, name) });
  await page.goto(`${base}?autostart=1&seed=cedar-peak-198&size=default&outside=1`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction("window.__game !== undefined", { timeout: 60000 });
  await sleep(4000);

  // the Seafarer talent lets the party sail; the ship starts at its home
  await evalJs(`__game.state.party.talents.push("talent_seafarer"), 0`);
  const home = await evalJs<{ x: number; y: number }>(`(() => { const p = __game.game.pirateHere(); return { x: p.x, y: p.y }; })()`);
  console.log("home", JSON.stringify(home));

  // a deep-water field 9 tiles west of the ship, in its row
  const start = await evalJs<{ x: number; y: number } | null>(`(() => {
    const w = __game.world;
    for (const d of [9, 8, 10, 7, 11]) { const x = w.wrapX(${home.x} - d); if (w.tile(x, ${home.y}).ground === 1) return { x, y: ${home.y} }; }
    return null;
  })()`);
  if (!start) throw new Error("no deep water next to the ship's home");
  await evalJs(`__game.teleport(${start.x}, ${start.y}, "E")`);
  await sleep(2500);
  await shot("1-party-on-raft.png");

  const distance = () => evalJs<number>(`(() => { const p = __game.state.pirate, w = __game.world, g = __game.game; const dx = Math.abs(((p.x - g.player.tx + w.width * 1.5) % w.width) - w.width / 2); const dy = Math.abs(((p.y - g.player.ty + w.height * 1.5) % w.height) - w.height / 2); return Math.max(dx, dy); })()`);
  const d0 = await distance();
  console.log("distance at the start", d0);

  // walk one step at a time towards the ship until the dialogue comes
  let dialogue = false;
  for (let i = 0; i < 8 && !dialogue; i++) {
    await page.keyboard.press("w");
    await sleep(900);
    dialogue = await evalJs<boolean>(`!!document.querySelector(".parchment.with-picture")`);
    console.log("step", i + 1, "distance", await distance(), "dialogue", dialogue);
    if (i === 0) await shot("2-ship-sailing.png");
  }
  if (!dialogue) fail("the pirate queen's dialogue never appeared");
  else {
    await shot("3-dialogue-no-pearl.png");
    const goldBefore = await evalJs<number>(`__game.state.party.gold`);
    const text = await evalJs<string>(`document.querySelector(".parchment.with-picture p").textContent`);
    if (!/robbed you blank/.test(text)) fail(`the text of the robbery is missing: ${text}`);
    const img = await evalJs<{ ok: boolean; w: number }>(`(() => { const i = document.querySelector(".parchment.with-picture img.speaker"); return { ok: i.complete && i.naturalWidth > 0, w: i.naturalWidth }; })()`);
    if (!img.ok) fail("the portrait of the pirate queen did not load");
    await evalJs(`document.querySelector(".parchment.with-picture .btn").click()`);
    await sleep(250);
    await shot("4-fading.png");
    await sleep(1000);
    await shot("5-ship-gone.png");
    const after = await evalJs<{ gold: number; away: number | undefined; met: boolean; minutes: number }>(`({ gold: __game.state.party.gold, away: __game.state.pirate.away, met: __game.state.opened.has("pirate:met"), minutes: __game.state.party.minutes })`);
    console.log("gold before", goldBefore, "after", after.gold, "away until", after.away, "now", after.minutes);
    if (after.gold !== 0) fail("the party kept its gold");
    if (after.away === undefined || after.away - after.minutes < 7 * 1440 - 5 || after.away - after.minutes > 7 * 1440) fail("the ship is not away for a week");
    if (!after.met) fail("the meeting was not noted for the quest log");
  }

  // the ship is away: walking next to its home meets nobody; a week later it is back at its home
  await evalJs(`__game.state.party.minutes += 7 * 1440, 0`);
  const back = await evalJs<{ x: number; y: number; away?: number }>(`(() => { const p = __game.game.pirateHere(); return { x: p.x, y: p.y, away: p.away }; })()`);
  if (back.x !== home.x || back.y !== home.y || back.away !== undefined) fail(`the ship is not back at its home after a week: ${JSON.stringify(back)}`);

  // with pearls: the party hands them in
  await evalJs(`(async () => { const items = await import("/src/sim/items.ts"); const party = await import("/src/sim/party.ts"); for (let i = 0; i < 3; i++) party.giveItem(__game.state.party, items.questItem("quest_pearl_of_youth")); __game.state.party.gold = 1000; })()`);
  await evalJs(`__game.teleport(${start.x}, ${start.y}, "E")`);
  await sleep(2000);
  dialogue = false;
  const xpBefore = await evalJs<number>(`__game.state.party.characters[0].xp`);
  for (let i = 0; i < 8 && !dialogue; i++) {
    await page.keyboard.press("w");
    await sleep(900);
    dialogue = await evalJs<boolean>(`!!document.querySelector(".parchment.with-picture")`);
  }
  if (!dialogue) fail("no dialogue with pearls");
  else {
    await shot("6-dialogue-with-pearls.png");
    await evalJs(`document.querySelector(".parchment.with-picture .btn").click()`);
    await sleep(1800);
    const after = await evalJs<{ gold: number; xp: number; pearls: number; handed: string | undefined }>(`({ gold: __game.state.party.gold, xp: __game.state.party.characters[0].xp, pearls: __game.state.party.characters.flatMap((c) => Object.values(c.inventory)).filter((i) => i && i.type === "quest_pearl_of_youth").length, handed: [...__game.state.opened].find((k) => k.startsWith("pearls=")) })`);
    console.log("with pearls:", JSON.stringify(after), "xp before", xpBefore);
    if (after.gold !== 1000 + 150_000) fail(`gold after three pearls is ${after.gold}`);
    if (after.xp - xpBefore !== 300_000) fail(`experience gained is ${after.xp - xpBefore}`);
    if (after.handed !== "pearls=3") fail(`handed in: ${after.handed}`);
    await shot("7-after-pearls.png");
  }
} finally {
  await browser.close();
}
console.log(`problems (${problems.length}):`);
for (const p of problems) console.log("  " + p);
process.exit(problems.length > 0 ? 1 : 0);
