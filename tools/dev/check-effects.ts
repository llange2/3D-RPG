/**
 * Checks the combat and spell pictures in the real browser (needs the dev server and Chrome, like check:render):
 *  1. The game's own mouse pointer follows the mouse and hides the system pointer.
 *  2. A ranged attack and an attack spell send a projectile at the monster, and a heal puts its picture over the portrait.
 *  3. Screenshots of the flights are saved for a look at the poses (arrow, fire, ice, magic, physical, acid).
 *
 * Usage: tsx tools/dev/check-effects.ts <outDir> [url]      (default url http://localhost:5173/)
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const outDir = process.argv[2];
if (!outDir) throw new Error("usage: tsx tools/dev/check-effects.ts <outDir> [url]");
const base = process.argv[3] ?? "http://localhost:5173/";
mkdirSync(outDir, { recursive: true });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: ["--window-size=1280,720", "--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-webgl", "--autoplay-policy=no-user-gesture-required"],
  defaultViewport: { width: 1280, height: 720 },
});
const problems: string[] = [];
try {
  const page = await browser.newPage();
  page.on("pageerror", (e) => problems.push(`[pageerror] ${(e as Error).message}`));
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`[console] ${m.text()}`);
  });
  await page.goto(`${base}?autostart=1&outside=1&seed=test`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction("window.__game !== undefined", { timeout: 60000 });
  await sleep(3000);

  // ---- 1. pointer
  await page.mouse.move(420, 260);
  await sleep(150);
  const pointer = (await page.evaluate(`(() => {
    const c = document.getElementById("game-cursor");
    return { html: document.documentElement.classList.contains("custom-cursor"), on: !!c && c.classList.contains("on"), size: c ? c.getBoundingClientRect().width : 0, at: c ? c.style.transform : "" };
  })()`)) as { html: boolean; on: boolean; size: number; at: string };
  console.log("pointer:", JSON.stringify(pointer));
  if (!pointer.html || !pointer.on || pointer.size < 20) problems.push("the game's own pointer is not shown");

  // ---- 2. a ranged attack in a dungeon
  await page.evaluate(`(async () => { await __game.enter(__game.firstPoi("dungeon")); })()`);
  await sleep(2500);
  const found = await page.evaluate(`__game.gotoMonster(4)`);
  if (!found) {
    problems.push("no monster with four free tiles in front of it in the first dungeon");
  } else {
    await sleep(1200);
    const count = () => page.evaluate(`__game.game.internals.props.instanceCount()`) as Promise<number>;
    const before = await count();
    await page.keyboard.press("Space");
    let peak = 0;
    for (let i = 0; i < 12; i++) {
      peak = Math.max(peak, (await count()) - before);
      if (i === 3) await page.screenshot({ path: join(outDir, "arrow.png") });
      await sleep(60);
    }
    console.log("arrow: most projectile instances at once", peak);
    if (peak < 1) problems.push("a ranged attack showed no projectile");
    await sleep(1500);
  }

  // an attack spell: Ralvar (the archer) casts his third spell at the next monster
  const clickOption = (index: number) =>
    page.evaluate(`(() => { const o = document.querySelectorAll(".modal-back .opt"); if (!o[${index}]) return false; o[${index}].click(); return true; })()`) as Promise<boolean>;
  // the spell window shows the spells as plates, not as list entries
  const clickSlot = (index: number) =>
    page.evaluate(`(() => { const o = document.querySelectorAll(".modal-back .spell-slot"); if (!o[${index}]) return false; o[${index}].click(); return true; })()`) as Promise<boolean>;
  if (await page.evaluate(`__game.gotoMonster(4)`)) {
    await sleep(1000);
    const count = () => page.evaluate(`__game.game.internals.props.instanceCount()`) as Promise<number>;
    const before = await count();
    // the monsters of the arrow volley may have knocked a hero out: the casters must be whole for the menus below
    await page.evaluate(`(() => { for (const c of __game.state.party.characters) { c.hp = c.health; c.conditions = ["Healthy"]; } })()`);
    await page.keyboard.press("f");
    await sleep(300);
    const picked = (await clickOption(0)) && (await sleep(300), await clickSlot(2));
    if (!picked) {
      problems.push("could not pick the attack spell in the menus");
      console.log("modal:", JSON.stringify(await page.evaluate(`(document.querySelector(".modal-back") || {}).innerText`)));
      await page.screenshot({ path: join(outDir, "spell-menu-failed.png" ) });
    }
    let peak = 0;
    for (let i = 0; i < 12; i++) {
      peak = Math.max(peak, (await count()) - before);
      if (i === 3) await page.screenshot({ path: join(outDir, "spell.png") });
      await sleep(60);
    }
    console.log("spell: most projectile instances at once", peak);
    if (peak < 1) problems.push("an attack spell showed no projectile");
    await sleep(1500);
  }

  // a healing spell: Lyneth (the druid) casts First Aid on the wounded Maximus
  await page.evaluate(`(() => { const p = __game.state.party; p.characters[0].hp = 2; __game.game.ui.updateHud(p, { place: "", sub: "", facing: "N", x: 0, y: 0, battle: false, attacker: null }); })()`);
  await page.keyboard.press("f");
  await sleep(300);
  const healed = (await clickOption(1)) && (await sleep(300), await clickSlot(3)) && (await sleep(300), await clickOption(0));
  if (!healed) problems.push("could not pick the healing spell in the menus");
  await sleep(500);
  const fx = (await page.evaluate(`[...document.querySelectorAll(".fx")].map((e) => e.getAttribute("src"))`)) as string[];
  console.log("heal pictures over portraits:", JSON.stringify(fx));
  if (!fx.some((s) => s.includes("tex_cure_hp"))) problems.push("healing showed no tex_cure_hp over the portrait");
  await page.screenshot({ path: join(outDir, "heal.png") });
} finally {
  console.log(`problems (${problems.length}):`);
  for (const p of problems) console.log("  " + p);
  await browser.close();
}
process.exit(problems.length ? 1 : 0);
