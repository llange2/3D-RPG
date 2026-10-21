/**
 * Checks the inn's book of heroes and the talent list of the character sheet in the real browser (needs the dev server
 * and Chrome, like check:render):
 *  1. The inn of the start town offers the book of heroes; a rolled hero with an allowed class can be kept in the inn.
 *  2. A member of the party can be swapped with a hero who waits there, and the HUD shows the change.
 *  3. The talents and achievements tab of the character screen lists the party's talents and achievements.
 *
 * Usage: tsx tools/dev/check-inn.ts <outDir> [url]      (default url http://localhost:5173/)
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const outDir = process.argv[2];
if (!outDir) throw new Error("usage: tsx tools/dev/check-inn.ts <outDir> [url]");
const base = process.argv[3] ?? "http://localhost:5173/";
mkdirSync(outDir, { recursive: true });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: ["--window-size=1280,800", "--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-webgl", "--autoplay-policy=no-user-gesture-required"],
  defaultViewport: { width: 1280, height: 800 },
});
const problems: string[] = [];
try {
  const page = await browser.newPage();
  page.on("pageerror", (e) => problems.push(`[pageerror] ${(e as Error).message}`));
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`[console] ${m.text()}`);
  });
  await page.goto(`${base}?autostart=1&seed=test`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction("window.__game !== undefined", { timeout: 60000 });
  await sleep(3000);

  const evalJs = <T>(code: string) => page.evaluate(code) as Promise<T>;
  const click = (selector: string, text?: string) =>
    evalJs<boolean>(`(() => {
      const els = [...document.querySelectorAll(${JSON.stringify(selector)})].filter((e) => !${JSON.stringify(text ?? "")} || e.textContent.includes(${JSON.stringify(text ?? "")}));
      if (!els[0]) return false;
      els[0].click();
      return true;
    })()`);
  const party = () => evalJs<{ party: string[]; reserve: string[] }>(`(() => { const p = __game.state.party; return { party: p.characters.map((c) => c.name), reserve: p.reserve.map((c) => c.name) }; })()`);

  // ---- 1. the inn of the start town
  await evalJs(`(async () => { await __game.enter("p:0:0:0"); })()`);
  await sleep(2500);
  if (!(await evalJs<boolean>(`__game.goto("service", "inn")`))) problems.push("the start town has no inn");
  await sleep(500);
  await page.keyboard.press("w"); // bump into the inn's door
  await sleep(1200);
  if (!(await click(".service .btn", "book of heroes"))) problems.push("the inn has no book of heroes");
  await sleep(500);
  await page.screenshot({ path: join(outDir, "roster-1.png") });

  const start = await party();
  console.log("before:", JSON.stringify(start));
  // roll until a class is open, then keep the hero
  let picked = false;
  for (let i = 0; i < 20 && !picked; i++) {
    picked = await click(".roster .classes .btn:not(.off)");
    if (!picked) await click(".roster .btn", "Roll again");
    await sleep(100);
  }
  if (!picked) problems.push("twenty rolls in a row allowed no class");
  await page.screenshot({ path: join(outDir, "roster-2.png") });
  await click(".roster .btn", "Keep in the inn");
  await sleep(300);
  const afterKeep = await party();
  console.log("after keeping a hero:", JSON.stringify(afterKeep));
  if (afterKeep.reserve.length !== start.reserve.length + 1) problems.push("the new hero is not in the reserve");

  // ---- 2. swap the first member with the first hero in the inn
  await click(".roster .member .btn", "▶");
  await sleep(300);
  const afterSwap = await party();
  console.log("after the swap:", JSON.stringify(afterSwap));
  if (afterSwap.party[0] !== start.reserve[0]) problems.push(`the first seat holds ${afterSwap.party[0]}, expected ${start.reserve[0]}`);
  if (!afterSwap.reserve.includes(start.party[0]!)) problems.push("the hero who left is not waiting in the inn");
  const cards = await evalJs<string[]>(`[...document.querySelectorAll(".party-bar .card .name")].map((e) => e.textContent)`);
  if (cards[0] !== afterSwap.party[0]) problems.push(`the HUD still shows ${cards[0]} in the first place`);
  await page.screenshot({ path: join(outDir, "roster-3.png") });
  await page.keyboard.press("Escape"); // the book
  await sleep(300);
  await page.keyboard.press("Escape"); // the inn
  await sleep(300);

  // ---- 3. talents and achievements on the character sheet
  await evalJs(`(() => { __game.state.party.talents.push("talent_merchant", "talent_cave_explorer", "talent_prayer_master"); __game.state.party.achievements.push("title_crusader"); })()`);
  // the talents and achievements have a tab of their own (key T)
  await page.keyboard.press("t");
  await sleep(400);
  const perks = await evalJs<string>(`document.querySelector(".perk-cols") ? document.querySelector(".perk-cols").innerText : ""`);
  console.log(perks);
  if (!perks.includes("Talents (3)") || !perks.includes("Merchant") || !perks.includes("Cave Explorer") || !perks.includes("Prayer Master")) problems.push("the sheet does not list the talents");
  if (!perks.includes("Achievements (1)") || !perks.includes("Crusader")) problems.push("the sheet does not list the achievement");
  await page.screenshot({ path: join(outDir, "sheet.png") });
} finally {
  console.log(`problems (${problems.length}):`);
  for (const p of problems) console.log("  " + p);
  await browser.close();
}
process.exit(problems.length ? 1 : 0);
