/**
 * Looks at the things of the 38th playtest in the real browser (needs a dev server and Chrome, like check:spells):
 *  1. the big map zoomed out: no black grid between the tiles (`MinimapIcons.edge`), and at the normal zoom the tiles keep theirs,
 *  2. the status icons top right for Power Shield and Wizard's Eye,
 *  3. the Light spell in a dungeon: the same spot before and after,
 *  4. the brittle wall's question when the party stands beside it (a Perceptive party, after a jump),
 *  5. the healing fountain: only the first-tier town has one, and the water cures a hurt, poisoned hero.
 *
 * Usage: tsx tools/dev/check-playtest38.ts <outDir> [url]      (default url http://localhost:5173/)
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const outDir = process.argv[2];
if (!outDir) throw new Error("usage: tsx tools/dev/check-playtest38.ts <outDir> [url]");
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
  await sleep(3000);

  // ---- 1. the big map, at the normal zoom and zoomed out
  await page.evaluate(`(() => { __game.state.party.talents.push("talent_cartographer"); __game.game.revealMap(); })()`);
  await page.evaluate(`void __game.game.openMap()`);
  await sleep(800);
  await shot("map-25.png");
  // "-" zooms out one step; the map then shows more cells than the small one beside the cards (11), at less than 16 px each
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press("-");
    await sleep(200);
  }
  await shot("map-zoomed-out-1.png");
  await page.keyboard.press("f");
  await sleep(400);
  await shot("map-zoomed-out-fit.png");
  await page.keyboard.press("Escape");
  await sleep(300);

  // ---- 2. the status icons
  await page.evaluate(`(() => { const p = __game.state.party; p.effects.push({ kind: "power_shield", until: p.minutes + 600 }, { kind: "wizard_eye", until: p.minutes + 600 }); __game.game.refresh?.(); })()`);
  await sleep(600);
  await shot("status-icons.png");
  const icons = (await page.evaluate(`[...document.querySelectorAll('.status-icons img')].map((i) => i.getAttribute('src') + ' ' + (i.naturalWidth))`)) as string[];
  notes.push(`status icons: ${icons.join(", ")}`);

  // ---- 3. the Light spell in a dungeon
  const dungeon = (await page.evaluate(`__game.firstPoi("dungeon")`)) as string | null;
  if (dungeon) {
    await page.evaluate(`__game.enter(${JSON.stringify(dungeon)})`);
    await sleep(2500);
    await page.evaluate(`(() => { const p = __game.state.party; p.effects = []; })()`);
    await sleep(1500);
    await shot("dungeon-dark.png");
    await page.evaluate(`(() => { const p = __game.state.party; p.effects.push({ kind: "light", until: p.minutes + 600 }); })()`);
    await sleep(2500);
    await shot("dungeon-light.png");
  } else notes.push("no dungeon");

  // ---- 4. the brittle wall, from the side (a town with brittle walls: tier 4 has three)
  const town4 = (await page.evaluate(`(() => { for (const p of __game.world.allPois()) if (p.kind === "town" && p.tier === 4) return p.id; return null; })()`)) as string | null;
  if (town4) {
    await page.evaluate(`__game.state.party.talents.push("talent_perceptive")`);
    await page.evaluate(`__game.enter(${JSON.stringify(town4)})`);
    await sleep(2500);
    const found = (await page.evaluate(`(() => {
      const g = __game.game;
      const rt = g.interior;
      const wall = rt.content.actions.find((a) => a.kind === "breakable_wall");
      if (!wall) return null;
      const dirs = [[0, -1, "N"], [1, 0, "E"], [0, 1, "S"], [-1, 0, "W"]];
      for (const [dx, dy, f] of dirs) {
        const x = wall.x + dx;
        const y = wall.y + dy;
        if (rt.map.cells[y * rt.map.width + x] !== 1) continue;
        return { wall: { x: wall.x, y: wall.y }, x, y, facing: f };
      }
      return null;
    })()`)) as { wall: { x: number; y: number }; x: number; y: number; facing: string } | null;
    notes.push(`brittle wall: ${JSON.stringify(found)}`);
    if (found) {
      // stand beside the wall looking along it (not at it): the question says "next to you"
      await page.evaluate(`(() => {
        const g = __game.game;
        g.player.tx = ${found.x}; g.player.ty = ${found.y};
        g.player.facing = ${JSON.stringify(found.facing === "N" || found.facing === "S" ? "E" : "N")};
        void g.noticeBrittleWall(${found.x}, ${found.y});
      })()`);
      await sleep(800);
      const text = (await page.evaluate(`document.body.innerText`)) as string;
      notes.push(`question: ${text.split("\n").filter((l) => /brittle/i.test(l)).join(" | ")}`);
      await shot("brittle-side.png");
    }
  } else notes.push("no tier 4 town");

  // ---- 5. the healing fountain of a tier 1 town
  const town1 = (await page.evaluate(`(() => { for (const p of __game.world.allPois()) if (p.kind === "town" && p.tier === 1) return p.id; return null; })()`)) as string | null;
  if (town1) {
    await page.keyboard.press("Escape");
    await sleep(300);
    await page.evaluate(`__game.enter(${JSON.stringify(town1)})`);
    await sleep(2500);
    const result = (await page.evaluate(`(async () => {
      const g = __game.game;
      const rt = g.interior;
      const fountain = rt.content.actions.find((a) => a.kind === "fountain");
      if (!fountain) return "no fountain";
      const party = __game.state.party;
      const c = party.characters[0];
      c.hp = 1; c.sp = 0; c.level = 2;
      c.conditions = ["Poisoned"];
      void g.useAction(fountain);
      await new Promise((r) => setTimeout(r, 600));
      return JSON.stringify({ hp: c.hp, health: c.health, sp: c.sp, mana: c.mana, conditions: c.conditions });
    })()`)) as string;
    notes.push(`fountain: ${result}`);
    await shot("fountain.png");
  }
} finally {
  await browser.close();
}
console.log(notes.join("\n"));
console.log(problems.length === 0 ? "no problems" : problems.join("\n"));
