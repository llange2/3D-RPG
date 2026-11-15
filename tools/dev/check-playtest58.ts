/**
 * Browser check of the 58th playtest (15. 11. 2026): the exit question comes again after "Stay" and a push towards the gate (point 7), a click on another hero's tab gives the selected item to
 * that hero (point 4), the guild window has one tab per hero and one "Learn" button (point 5). (Point 3, the lock that rolls again, is `tests/unit/playtest58.test.ts`; point 6 is the step sound.)
 * Seed jade-wood-358, small world, as in `check-leave-town.ts`. Needs a dev server and Chrome (`VITE_FROZEN=1 VITE_PORT=<free port> npx vite --port <free port> --strictPort`).
 *
 * Usage: GAME_URL=http://localhost:<port>/ npx tsx tools/dev/check-playtest58.ts [outDir]
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const base = process.env.GAME_URL ?? "http://localhost:5173/";
const outDir = process.argv[2];
if (outDir) mkdirSync(outDir, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const problems: string[] = [];

const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  protocolTimeout: 240000,
  args: ["--window-size=1280,720", "--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-webgl"],
  defaultViewport: { width: 1280, height: 720 },
});
try {
  const page = await browser.newPage();
  page.on("pageerror", (e) => problems.push(`[pageerror] ${(e as Error).message}`));
  const evalJs = <T>(code: string) => page.evaluate(code) as Promise<T>;
  const shot = async (name: string) => {
    if (outDir) await page.screenshot({ path: join(outDir, `${name}.png`) });
  };
  const click = (label: string) => evalJs<boolean>(`(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === ${JSON.stringify(label)}); if (b) b.click(); return !!b; })()`);
  const hasButton = (label: string) => evalJs<boolean>(`[...document.querySelectorAll("button")].some((x) => x.textContent.trim() === ${JSON.stringify(label)})`);
  await page.goto(`${base}?autostart=1&seed=jade-wood-358&size=small&dungeons=few`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction("window.__game !== undefined", { timeout: 60000 });
  await sleep(4000);
  await page.waitForFunction(`!document.querySelector(".loading.on")`, { timeout: 90000 });
  await sleep(1000);

  // ---- 7. the exit question again after "Stay"
  const exit = await evalJs<{ x: number; y: number }>(`(() => { const m = __game.game.internals.interior.map; return { x: m.exit.x, y: m.exit.y }; })()`);
  const spawn = await evalJs<{ x: number; y: number; facing: string }>(`(() => { const m = __game.game.internals.interior.map; return { x: m.spawn.x, y: m.spawn.y, facing: m.spawn.facing }; })()`);
  console.log("exit", JSON.stringify(exit), "spawn", JSON.stringify(spawn));
  const step = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] }[spawn.facing] as number[];
  // the cell in front of the exit (the exit lies against the way the party faces at the start), looking at it
  const outward = { N: "S", E: "W", S: "N", W: "E" }[spawn.facing]!;
  await evalJs(`__game.teleport(${exit.x + step[0]!}, ${exit.y + step[1]!}, ${JSON.stringify(outward)})`);
  await sleep(800);
  await page.keyboard.press("w");
  await sleep(1500);
  if (!(await hasButton("Stay"))) problems.push("point 7: stepping onto the exit asked nothing");
  await shot("exit-first");
  await click("Stay");
  await sleep(800);
  const on = await evalJs<{ x: number; y: number }>(`({ x: __game.game.internals.player.tx, y: __game.game.internals.player.ty })`);
  if (on.x !== exit.x || on.y !== exit.y) problems.push(`point 7: the party is not on the exit cell after "Stay" (${on.x}, ${on.y})`);
  await page.keyboard.press("w");
  await sleep(1500);
  if (!(await hasButton("Stay"))) problems.push("point 7: pushing on towards the gate did not ask again");
  await shot("exit-again");
  await click("Stay");
  await sleep(500);

  // ---- 4. a click on a hero's name tab gives the selected item to that hero
  // (the party starts with nothing in the backpacks: a copy of the first thing a hero carries, under a name of its own, goes into the first backpack slot)
  await evalJs(`(() => {
    const inv = __game.state.party.characters[0].inventory;
    if (Object.keys(inv).some((k) => k.startsWith("slot") && inv[k])) return;
    const any = Object.values(inv).find((i) => i);
    if (any) inv.slot1 = { ...JSON.parse(JSON.stringify(any)), id: "t58-copy", name: "Test relic" };
  })()`);
  const item = await evalJs<{ slot: string; name: string; id: string } | null>(`(() => {
    const inv = __game.state.party.characters[0].inventory;
    for (const k of Object.keys(inv)) if (k.startsWith("slot") && inv[k]) return { slot: k, name: inv[k].name.trim(), id: inv[k].id };
    return null;
  })()`);
  if (!item) problems.push("point 4: the first hero carries nothing in the backpack");
  else {
    await page.keyboard.press("c");
    await sleep(800);
    const picked = await evalJs<boolean>(`(() => { const el = [...document.querySelectorAll(".charscreen .slot")].find((e) => e.getAttribute("title") === ${JSON.stringify(item.name)}); if (el) el.click(); return !!el; })()`);
    if (!picked) problems.push(`point 4: no slot with ${item.name}`);
    await sleep(300);
    await shot("give-selected");
    const tabbed = await evalJs<boolean>(`(() => { const t = [...document.querySelectorAll(".charscreen .tab")].find((e) => e.textContent.trim() === __game.state.party.characters[1].name); if (t) t.click(); return !!t; })()`);
    if (!tabbed) problems.push("point 4: no tab for the second hero");
    await sleep(500);
    const moved = await evalJs<{ from: boolean; to: boolean }>(`(() => {
      const [a, b] = [__game.state.party.characters[0].inventory, __game.state.party.characters[1].inventory];
      return { from: Object.values(a).some((i) => i && i.id === ${JSON.stringify(item.id)}), to: Object.values(b).some((i) => i && i.id === ${JSON.stringify(item.id)}) };
    })()`);
    console.log("give by tab:", JSON.stringify(moved));
    if (moved.from || !moved.to) problems.push(`point 4: the item did not move by a click on the tab (${JSON.stringify(moved)})`);
    await shot("give-done");
    await page.keyboard.press("Escape");
    await sleep(500);
  }

  // ---- 5. the guild window
  await evalJs(`(() => { const p = __game.state.party; for (const t of ["guild_level_1", "guild_level_5"]) if (!p.talents.includes(t)) p.talents.push(t); p.gold = 1000000; void __game.game.openServiceScreen("guild", 5); })()`);
  await sleep(1500);
  const guild = await evalJs<{ tabs: string[]; learn: number; buy: number; text: string }>(`(() => ({
    tabs: [...document.querySelectorAll(".tabs .tab")].map((e) => e.textContent.trim()),
    learn: [...document.querySelectorAll("button")].filter((b) => b.textContent.trim() === "Learn").length,
    buy: [...document.querySelectorAll("button")].filter((b) => /Buy/.test(b.textContent)).length,
    text: document.body.innerText,
  }))()`);
  console.log("guild tabs:", guild.tabs.join(", "), "| Learn buttons:", guild.learn);
  if (guild.tabs.some((t) => ["Arcane", "Clerical", "Nature", "Sell scrolls"].includes(t))) problems.push(`point 5: the school tabs are still there (${guild.tabs.join(", ")})`);
  if (guild.text.includes("Into whose backpack")) problems.push("point 5: the question about the backpack is still there");
  if (guild.buy > 0) problems.push("point 5: a Buy button is left in the guild");
  await shot("guild-knight");
  // the knight has no magic; the archer (third tab) has lessons
  if (!guild.text.includes("does not have any magical abilities")) problems.push("point 5: the knight's tab does not say that he has no magic");
  await evalJs(`(() => { const t = [...document.querySelectorAll(".tabs .tab")][2]; if (t) t.click(); })()`);
  await sleep(600);
  const archer = await evalJs<{ learn: number; text: string }>(`({ learn: [...document.querySelectorAll("button")].filter((b) => b.textContent.trim() === "Learn").length, text: document.body.innerText })`);
  console.log("archer: Learn buttons", archer.learn);
  if (archer.learn === 0 && !archer.text.includes("We have taught you everything we know")) problems.push("point 5: the archer's tab shows neither lessons nor the closing sentence");
  await shot("guild-archer");
} finally {
  await browser.close();
}
if (problems.length > 0) {
  console.log("PROBLEMS:\n" + problems.join("\n"));
  process.exit(1);
}
console.log("OK");
