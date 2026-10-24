/**
 * Lists the monsters the game puts round Starthaven on a world (needs a dev server and Chrome, like check:melee): which monsters stand within the loaded chunks, how far
 * from the first town, and whether the stronger ones are the farther ones (26th playtest).
 *
 * Usage: tsx tools/dev/check-spawns.ts <seed> <size> [url]      (default url http://localhost:5173/)
 */
import puppeteer from "puppeteer-core";

const seed = process.argv[2] ?? "onyx-peak-786";
const size = process.argv[3] ?? "small";
const base = process.argv[4] ?? "http://localhost:5173/";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: ["--window-size=1280,720", "--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-webgl"],
  defaultViewport: { width: 1280, height: 720 },
});
try {
  const page = await browser.newPage();
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(`[pageerror] ${(e as Error).message}`));
  await page.goto(`${base}?autostart=1&outside=1&seed=${seed}&size=${size}&view=far`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction("window.__game !== undefined", { timeout: 60000 });
  await sleep(3000);
  await page.waitForFunction(`!document.querySelector(".loading.on")`, { timeout: 90000 });
  await sleep(1500);
  const rows = (await page.evaluate(`(async () => {
    const tables = await import("/src/data/tables.ts");
    const g = __game.game;
    const world = __game.world;
    const town = world.anchorOf(0, 0);
    return g.internals.enc.monsters.map((m) => {
      const def = tables.MONSTERS[m.defId];
      return { name: def.name, level: def.treasure_level, xp: def.xp, uid: m.uid, d: Math.round(Math.hypot(m.x - town.x, m.y - town.y)) };
    });
  })()`)) as { name: string; level: number; xp: number; uid: string; d: number }[];
  rows.sort((a, b) => a.d - b.d);
  for (const r of rows) console.log(String(r.d).padStart(3), "L" + r.level, r.name, r.xp, r.uid);
  console.log(rows.length, "monsters loaded round the party");
  if (problems.length > 0) console.log("PROBLEMS:\n" + problems.join("\n"));
} finally {
  await browser.close();
}
