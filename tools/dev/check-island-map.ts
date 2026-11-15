/**
 * Browser check of the 58th playtest, point 8 (15. 11. 2026): the cartographer's cottage of an island sells its map. Seed pearl-shore-794, default world, default dungeons: the small island at
 * 32/36 (500 gold), the medium one at 46/52 (2 000). The party stands next to the cottage, pushes against it, answers the question and the island is on the map afterwards.
 * Needs a dev server and Chrome (`VITE_FROZEN=1 VITE_PORT=<free port> npx vite --port <free port> --strictPort`).
 *
 * Usage: GAME_URL=http://localhost:<port>/ npx tsx tools/dev/check-island-map.ts [outDir]
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
  await page.goto(`${base}?autostart=1&outside=1&seed=pearl-shore-794&size=default&dungeons=default`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction("window.__game !== undefined", { timeout: 60000 });
  await sleep(3000);
  await page.waitForFunction(`!document.querySelector(".loading.on")`, { timeout: 90000 });
  await sleep(1000);

  const click = (label: string) => page.evaluate(`(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === ${JSON.stringify(label)}); if (b) b.click(); return !!b; })()`) as Promise<boolean>;
  const dialog = () => page.evaluate(`(() => { const d = document.querySelector(".parchment"); return d ? d.textContent : ""; })()`) as Promise<string>;

  for (const [centre, price] of [[[32, 36], 500], [[46, 52], 2000]] as const) {
    const info = (await page.evaluate(`(async () => {
      const g = __game.game;
      const cv = await import("/src/world/caravans.ts");
      const isl = g.world.islands.find((i) => i.x === ${centre[0]} && i.y === ${centre[1]});
      const c = cv.mapCottageOf(g.world, isl);
      const tiles = cv.islandMapTiles(g.world, isl);
      return { x: c.x, y: c.y, price: c.islandMap.price, tiles: tiles.length };
    })()`)) as { x: number; y: number; price: number; tiles: number };
    console.log("island", centre.join("/"), JSON.stringify(info));
    if (info.price !== price) problems.push(`island ${centre.join("/")}: price ${info.price}, wanted ${price}`);
    // next to the cottage, looking at it; the dev rig lets the party stand anywhere
    await page.evaluate(`(() => { const g = __game.game; g.state.party.gold = 50000; g.teleport(${info.x - 1}, ${info.y}, "E"); })()`);
    await sleep(2500);
    const before = (await page.evaluate(`(() => { const g = __game.game; const ex = g.state.explored; return { gold: g.state.party.gold, seen: ex.hasOverworld(${centre[0]}, ${centre[1]}) }; })()`)) as { gold: number; seen: boolean };
    // pushing on: the cottage is an obstacle, the bump asks
    await page.evaluate(`__game.game.internals.player.command({ type: "move", dir: "forward" })`);
    await sleep(1500);
    const text = await dialog();
    console.log("dialog:", text.slice(0, 160).replace(/\s+/g, " "));
    if (outDir) await page.screenshot({ path: join(outDir, `island-map-${centre[0]}-${centre[1]}.png`) });
    if (!text.includes("cartographer") || !text.includes(`${price >= 1000 ? Math.floor(price / 1000) + "'" + String(price % 1000).padStart(3, "0") : price}`)) problems.push(`island ${centre.join("/")}: the question does not name the price: ${text.slice(0, 200)}`);
    if (!(await click("Buy"))) problems.push(`island ${centre.join("/")}: no Buy button`);
    await sleep(1200);
    const after = (await page.evaluate(`(() => { const g = __game.game; const ex = g.state.explored; return { gold: g.state.party.gold, seen: ex.hasOverworld(${centre[0]}, ${centre[1]}) }; })()`)) as { gold: number; seen: boolean };
    console.log("gold", before.gold, "->", after.gold, "island seen", before.seen, "->", after.seen);
    if (before.gold - after.gold !== price) problems.push(`island ${centre.join("/")}: paid ${before.gold - after.gold}, wanted ${price}`);
    if (!after.seen) problems.push(`island ${centre.join("/")}: the island is not on the map after the purchase`);
    // a second visit does not charge again
    await page.evaluate(`__game.game.internals.player.command({ type: "move", dir: "forward" })`);
    await sleep(1200);
    const again = (await page.evaluate(`__game.game.state.party.gold`)) as number;
    if (again !== after.gold) problems.push(`island ${centre.join("/")}: charged again (${after.gold} -> ${again})`);
  }
} finally {
  await browser.close();
}
if (problems.length > 0) {
  console.log("PROBLEMS:\n" + problems.join("\n"));
  process.exit(1);
}
console.log("OK");
