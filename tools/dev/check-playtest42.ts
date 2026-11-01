/**
 * 42nd playtest, checks in the browser: the window of the party (hero, party info, mascot) has one size (point 8), the door of a hut looks to the road (point 9),
 * the ambush of the Catacombs of Kela (point 4), a head of quest 2 turning (point 5), the traps on the minimap (point 3) and the minimap with Wizard's Eye (point 12).
 * Seed cedar-peak-198, default size.
 *
 * Usage: tsx tools/dev/check-playtest42.ts <outDir> [url]      (default url http://localhost:5173/)
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const outDir = process.argv[2];
if (!outDir) throw new Error("usage: tsx tools/dev/check-playtest42.ts <outDir> [url]");
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
  const evalJs = <T>(code: string) => page.evaluate(code) as Promise<T>;
  const shot = (name: string) => page.screenshot({ path: join(outDir, name) });
  await page.goto(`${base}?autostart=1&seed=cedar-peak-198&size=default&outside=1`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction("window.__game !== undefined", { timeout: 60000 });
  await sleep(4000);

  // ---- point 9: the huts. 25/88 is a Monster Hut with a road at its corner; look at it from every side
  for (const [name, x, y, facing] of [["N", 25, 85, "S"], ["E", 28, 88, "W"], ["S", 25, 91, "N"], ["W", 22, 88, "E"]] as const) {
    await evalJs(`__game.teleport(${x}, ${y}, "${facing}")`);
    await sleep(2500);
    await shot(`hut-from-${name}.png`);
  }

  // ---- point 8: the party window
  await evalJs(`__game.teleport(25, 91, "N")`);
  await sleep(500);
  const heights: string[] = [];
  const measure = async (label: string) => {
    const m = await evalJs<{ h: number; w: number }>(`(() => { const p = document.querySelector(".charscreen"); const r = (p.closest(".panel") ?? p).getBoundingClientRect(); return { h: Math.round(r.height), w: Math.round(r.width) }; })()`);
    heights.push(`${label}: ${m.w} x ${m.h}`);
  };
  await page.keyboard.press("i");
  await sleep(700);
  const tabs = await evalJs<string[]>(`[...document.querySelectorAll(".charscreen .tabs .tab")].map((t) => t.textContent)`);
  for (let i = 0; i < tabs.length; i++) {
    await evalJs(`document.querySelectorAll(".charscreen .tabs .tab")[${i}].click()`);
    await sleep(300);
    await measure(tabs[i]!);
    if (i === 0 || i >= tabs.length - 2) await shot(`party-${i}.png`);
  }
  console.log("party window:", heights.join(" | "));
  if (new Set(heights.map((h) => h.split(": ")[1])).size !== 1) problems.push(`the party window changes size: ${heights.join(" | ")}`);
  await page.keyboard.press("Escape");
  await sleep(400);

  // ---- points 4, 5, 3 and 12: the Catacombs of Kela
  await evalJs(`(async () => { await __game.enter("p:0:0:233"); })()`);
  await sleep(3000);
  await evalJs(`__game.state.party.mascot = "Crow"`);
  const trapsCrow = await evalJs<number>(`__game.game.trapsShown().size`);
  await evalJs(`__game.state.party.mascot = "Wolf"`);
  const trapsNone = await evalJs<number>(`__game.game.trapsShown().size`);
  console.log("traps marked with the Crow:", trapsCrow, "without it (nothing seen, nothing gone off):", trapsNone);
  if (trapsCrow === 0) problems.push("the Crow marks no trap");
  if (trapsNone !== 0) problems.push("traps are marked although none was seen or went off");
  // a trap that goes off stays on the map without the Crow
  await evalJs(`(() => { const a = __game.game.interior.content.actions.find((x) => x.kind === "trap"); __game.state.opened.add(a.uid + "@fired"); })()`);
  const trapsFired = await evalJs<number>(`__game.game.trapsShown().size`);
  console.log("traps marked after one went off:", trapsFired);
  if (trapsFired !== 1) problems.push(`one trap went off, the map marks ${trapsFired}`);

  // the ambush in a dead end (like the one at 40/19 of the old Kela, where the cell two ahead was rock): the monsters stand on cells the party can reach, none behind a wall
  const dead = await evalJs<{ x: number; y: number; facing: string } | null>(`(() => {
    const g = __game.game; const m = g.interior.map; const w = m.width;
    const floor = (x, y) => m.cells[y * w + x] === 1 && !g.interior.blocked.has(y * w + x);
    for (let y = 2; y < m.height - 2; y++) for (let x = 2; x < m.width - 2; x++) {
      if (!floor(x, y) || g.interior.actionAt.has(y * w + x)) continue;
      const open = [["N", 0, -1], ["E", 1, 0], ["S", 0, 1], ["W", -1, 0]].filter(([, dx, dy]) => floor(x + dx, y + dy));
      if (open.length === 1) { const [f, dx, dy] = open[0]; const back = { N: "S", E: "W", S: "N", W: "E" }[f]; return { x, y, facing: back }; }
    }
    return null;
  })()`);
  console.log("dead end:", JSON.stringify(dead));
  if (dead) {
    await evalJs(`__game.teleport(${dead.x}, ${dead.y}, "${dead.facing}")`);
    await sleep(800);
    await evalJs(`__game.game.spawnAmbush([46, 64, 31])`);
    await sleep(800);
    const stranded = await evalJs<{ placed: { x: number; y: number }[]; unreachable: number }>(`(() => {
      const g = __game.game; const m = g.interior.map; const w = m.width;
      const placed = g.enc.monsters.filter((q) => q.hp > 0 && q.uid.startsWith("ambush:")).map((q) => ({ x: q.x, y: q.y }));
      const seen = new Set([g.player.tx + "," + g.player.ty]); const queue = [[g.player.tx, g.player.ty, 0]];
      for (let i = 0; i < queue.length; i++) { const [x, y, d] = queue[i]; if (d >= 5) continue; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = (x + dx) + "," + (y + dy); if (!seen.has(k) && m.cells[(y + dy) * w + x + dx] === 1) { seen.add(k); queue.push([x + dx, y + dy, d + 1]); } } }
      return { placed, unreachable: placed.filter((p) => !seen.has(p.x + "," + p.y)).length };
    })()`);
    console.log("ambush monsters:", JSON.stringify(stranded));
    if (stranded.placed.length === 0) problems.push("the ambush in a dead end brought no monster");
    if (stranded.unreachable > 0) problems.push(`${stranded.unreachable} ambush monsters stand out of reach`);
    await shot("ambush.png");
  }

  // a head of the row turns: two frames during the turn
  const head = await evalJs<{ x: number; y: number } | null>(`(() => { const a = __game.game.interior.content.actions.find((x) => x.kind === "head" && x.params.mode === "rotate"); return a ? { x: a.x, y: a.y } : null; })()`);
  if (head) {
    await evalJs(`__game.teleport(${head.x}, ${head.y + 2}, "N")`);
    await sleep(800);
    await shot("head-before.png");
    void evalJs(`(async () => { const a = __game.game.interior.content.actions.find((x) => x.kind === "head" && x.params.mode === "rotate"); await __game.game.useAction(a); })()`);
    await sleep(500);
    await evalJs(`[...document.querySelectorAll("button")].find((b) => b.textContent.includes("Turn it"))?.click()`);
    await sleep(250);
    await shot("head-turning-1.png");
    await sleep(450);
    await shot("head-turning-2.png");
    await sleep(2000);
    await shot("head-after.png");
  }

  // point 12: Wizard's Eye uncovers the minimap, the big map stays as explored
  await evalJs(`__game.teleport(45, 71, "N")`);
  await sleep(500);
  await shot("minimap-before-eye.png");
  await evalJs(`__game.state.party.effects.push({ kind: "wizard_eye", until: __game.state.party.minutes + 600 }); __game.game.refresh()`);
  await sleep(500);
  await shot("minimap-eye.png");
} finally {
  await browser.close();
}
if (problems.length > 0) {
  console.log("PROBLEMS:\n" + problems.join("\n"));
  process.exitCode = 1;
} else console.log("OK");
