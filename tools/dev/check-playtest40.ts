/**
 * Looks at the things of the 40th playtest in the real browser (needs a dev server and Chrome, like check:spells):
 *  2. the gold glow of the Magical Orb (the mascot) at night,
 *  3./4. the character screen's mascot tab: the Fairy's portrait, the Donkey's picture,
 *  6. quest 3: the runes round the gong that sounded last,
 *  8. the crow's clip is made before the alarm (its video is loaded when the alarm comes),
 *  9. the character screen keeps one size however long the tooltip is (heights measured in every state),
 * 10. "On whom?" shows portraits with the hit-point bars.
 *
 * Usage: tsx tools/dev/check-playtest40.ts <outDir> [url]      (default url http://localhost:5173/)
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const outDir = process.argv[2];
if (!outDir) throw new Error("usage: tsx tools/dev/check-playtest40.ts <outDir> [url]");
const base = process.argv[3] ?? "http://localhost:5173/";
mkdirSync(outDir, { recursive: true });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const width = 1280;
const height = 720;
const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: [`--window-size=${width},${height}`, "--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-webgl", "--autoplay-policy=no-user-gesture-required"],
  defaultViewport: { width, height },
});
const problems: string[] = [];
const notes: string[] = [];
try {
  const page = await browser.newPage();
  const shot = (name: string) => page.screenshot({ path: join(outDir, name) });
  page.on("pageerror", (e) => problems.push(`[pageerror] ${(e as Error).message}`));
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`[console] ${m.text()}`);
  });
  await page.goto(`${base}?autostart=1&outside=1&seed=test`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction("window.__game !== undefined", { timeout: 60000 });
  // the loading screen of the first scene may take a while on a cold server
  await page.waitForFunction("window.__game.state !== undefined && window.__game.state !== null", { timeout: 120000 });
  await sleep(15000);

  // ---- 9. the character screen: the height of the window in every state
  await page.evaluate(`(() => {
    const ring = (name, bonus) => ({ id: "", name, type: "ring", material: 1, texture: "item_ring_1", value: 100, quest: false, spellId: 0, bonus });
    const p = __game.state.party;
    const c = p.characters[0];
    c.classType = "Wizard";
    c.inventory.left_ring = ring("Ring A", { str: 5, int: 5, per: 5, end: 5, spd: 5, acc: 5, lck: 5, res_fire: 10, res_ice: 10, res_acid: 10 }); c.inventory.right_ring = c.inventory.left_ring; p.mascot = "Donkey";
    c.inventory.slot1 = ring("Ring B", { res_magic: 10, arm: 3, dam_min: 2, dam_max: 4, str: 5 });
    c.inventory.slot2 = ring("Plain ring", {});
  })()`);
  await page.evaluate(`void __game.game.openInventory(0)`);
  await sleep(700);
  const measure = async (label: string) => {
    const r = (await page.evaluate(`(() => { const p = document.querySelector('.charscreen'); const t = document.querySelector('.charscreen .tooltip'); const g = document.querySelector('.charscreen .gear'); return { gear: g ? g.getBoundingClientRect().height : 0, panel: p.getBoundingClientRect().height, tip: t ? t.getBoundingClientRect().height : 0, scroll: p.scrollHeight }; })()`)) as { gear: number; panel: number; tip: number; scroll: number };
    notes.push(`${label}: window ${r.panel.toFixed(0)} px, tooltip ${r.tip.toFixed(0)} px, gear ${r.gear.toFixed(0)} px, content ${r.scroll}`);
    return r;
  };
  await measure("nothing selected");
  await page.evaluate(`document.querySelectorAll('.charscreen .slots .slot')[1].click()`);
  await sleep(200);
  await measure("plain ring selected");
  await page.evaluate(`document.querySelectorAll('.charscreen .slots .slot')[1].click()`);
  await sleep(200);
  await page.evaluate(`document.querySelectorAll('.charscreen .slots .slot')[0].click()`);
  await sleep(200);
  await measure("ring B selected (14 lines against Ring A)");
  await shot("charscreen-ring.png");
  await page.keyboard.press("Escape");
  await sleep(300);

  // ---- 3./4. the mascot tab
  for (const mascot of ["Fairy", "Donkey"]) {
    await page.evaluate(`__game.state.party.mascot = ${JSON.stringify(mascot)}`);
    await page.evaluate(`void __game.game.openInventory("mascot")`);
    await sleep(500);
    await shot(`mascot-${mascot.toLowerCase()}.png`);
    await page.keyboard.press("Escape");
    await sleep(300);
  }

  // ---- 8. the crow clip
  await page.evaluate(`(() => { __game.state.party.mascot = "Crow"; const ui = __game.game.ui; ui.mascotShown = ""; ui.renderMascot("Crow", true); })()`);
  await sleep(300);
  const clip = await page.evaluate(`(() => { const v = document.querySelector('.mascot-card video'); return v ? { ready: v.readyState, paused: v.paused, poster: v.poster } : null; })()`);
  notes.push(`crow clip right after the alarm: ${JSON.stringify(clip)}`);
  await shot("crow-alarm.png");

  // ---- 10. "On whom?"
  await page.evaluate(`(() => { const p = __game.state.party; p.characters[1].hp = Math.floor(p.characters[1].health / 3); p.characters[2].hp = 0; })()`);
  await page.evaluate(`(async () => { const m = await import("/src/ui/panels.ts"); window.__pick = m.askSpellDetails(__game.game.ui, __game.state.party, 4); })()`);
  await sleep(500);
  await shot("on-whom.png");
  const pick = await page.evaluate(`(() => ({ buttons: document.querySelectorAll('.hero-btn').length, bars: document.querySelectorAll('.hero-btn .bar.hp').length }))()`);
  notes.push(`"On whom?": ${JSON.stringify(pick)}`);
  await page.keyboard.press("Escape");
  await sleep(300);
  await page.evaluate(`document.querySelector('.hero-pick .btn')?.click()`);
  await sleep(300);

  // ---- 2. the Magical Orb at night
  const orb = (await page.evaluate(`(() => { const g = __game.game; const s = g.mascotSpots().find((m) => m.item === 10); return s ? { x: s.x, y: s.y, fx: s.faceX, fy: s.faceY } : null; })()`)) as { x: number; y: number; fx: number; fy: number } | null;
  if (orb) {
    await page.evaluate(`(() => { __game.state.party.mascot = "Crow"; __game.game.mascotShown = ""; })()`);
    await page.evaluate(`__game.teleport(${orb.x}, ${orb.y - 3}, "S")`);
    await sleep(2500);
    await shot("orb-day.png");
    await page.evaluate(`(() => { const p = __game.state.party; p.minutes = Math.floor(p.minutes / 1440) * 1440 + 1440 + 60; })()`);
    await sleep(2500);
    await shot("orb-night.png");
    notes.push(`orb ${JSON.stringify(orb)}, lamps ${JSON.stringify(await page.evaluate("(() => { const g = __game.game; return { n: g.mascotLamps.length, slots: g.lampSlots.map((s) => s.lamp ? [s.lamp.key, s.level] : null), at: [g.player.tx, g.player.ty], r: g.r.lamps.map((l) => l.intensity) }; })()"))}`);
  } else notes.push("no Magical Orb on this world");

  // ---- 6. quest 3: the runes round the gong that sounded last
  const found = (await page.evaluate(`(() => { for (const p of __game.world.allPois()) { const d = __game.world.dungeonRef(p.id); if (d && d.quest === "quest_3") return p.id; } return null; })()`)) as string | null;
  if (found) {
    await page.evaluate(`__game.enter(${JSON.stringify(found)})`);
    await sleep(3000);
    const info = (await page.evaluate(`(() => {
      const c = __game.game.interior.content;
      const gongs = c.actions.filter((a) => a.kind === "gong");
      const runes = c.actions.filter((a) => a.kind === "rune");
      const last = gongs[1];
      for (const g of gongs) __game.state.opened.add(g.uid);
      __game.state.opened.delete(last.uid); __game.state.opened.add(last.uid);
      const rune = runes.find((r) => r.params.after === last.uid);
      __game.game.interiorView.refreshObjects();
      __game.game.refresh();
      return { gongs: gongs.map((g) => [g.x, g.y]), last: [last.x, last.y], rune: rune ? [rune.x, rune.y] : null };
    })()`)) as { gongs: number[][]; last: number[]; rune: number[] | null };
    notes.push(`quest 3 place ${found}: ${JSON.stringify(info)}`);
    if (info.rune) {
      await page.evaluate(`(() => { const p = __game.state.party; p.effects.push({ kind: "light", until: p.minutes + 600 }); __game.game.monsters?.clear?.(); })()`);
      await page.evaluate(`__game.teleport(${info.rune[0]}, ${info.rune[1]! + 2}, "N")`);
      await sleep(1500);
      await shot("runes-near-last-gong.png");
    }
  } else notes.push("no quest 3 place in this world");
} finally {
  await browser.close();
}
console.log(notes.join("\n"));
console.log(`problems (${problems.length}):`);
for (const p of [...new Set(problems)].slice(0, 25)) console.log("  " + p);
