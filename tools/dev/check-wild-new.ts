/**
 * Fantastic Islands on the real overworld: finds the wild group nearest to the start that holds one of the monsters of the extension (ids 92 and up), puts the party four tiles south of it and takes a
 * picture of what the party sees; prints the monsters of the encounter and what the page logged.
 *
 * Usage: GAME_URL=http://localhost:<port>/ npx tsx tools/dev/check-wild-new.ts <outDir> [seed] [skip]   (needs a dev server and Chrome; skip = how many such groups to pass)
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
import { MONSTERS } from "../../src/data/tables";
import { chunkSpawns } from "../../src/world/spawns";
import { GROUND } from "../../src/world/types";
import { World } from "../../src/world/world";

const [outDir = "wild-new", seed = "wild-new-1", skip = "0"] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const world = new World(seed, "default", "default", "fantastic");
const start = world.startPosition();
const found: { x: number; y: number; ids: number[]; d: number }[] = [];
for (let cy = 0; cy < world.chunksDown; cy++) {
  for (let cx = 0; cx < world.chunksAcross; cx++) {
    for (const g of chunkSpawns(world, cx, cy)) {
      if (g.monsterIds.some((id) => id >= 92 && MONSTERS[id]!.terrain !== "water")) found.push({ x: g.x, y: g.y, ids: g.monsterIds, d: Math.hypot(g.x - start.x, g.y - start.y) });
    }
  }
}
found.sort((a, b) => a.d - b.d);
const target = found[Number(skip)];
if (!target) throw new Error("no wild group with a monster of the extension");
console.log(`group at ${target.x},${target.y}: ${target.ids.map((id) => MONSTERS[id]!.name).join(", ")} (${found.length} such groups)`);
// four tiles south on land, else any of the neighbouring spots
let spot = { x: target.x, y: target.y + 4 };
for (const dy of [4, 5, 3, 6]) {
  if (world.tile(target.x, target.y + dy).ground === GROUND.LAND) {
    spot = { x: target.x, y: target.y + dy };
    break;
  }
}

const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: ["--window-size=1280,720", "--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-webgl"],
  defaultViewport: { width: 1280, height: 720 },
});
try {
  const page = await browser.newPage();
  const problems: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(m.text());
  });
  page.on("pageerror", (e) => problems.push(`pageerror: ${String(e)}`));
  await page.goto(`${process.env.GAME_URL ?? "http://localhost:5173/"}?seed=${seed}&autostart=1&outside=1&pack=fantastic`, { waitUntil: "load" });
  await page.waitForFunction("window.__game && window.__game.state", { timeout: 120000 });
  await sleep(4000);
  console.log("ruleset of the world:", await page.evaluate(`__game.game.world.ruleset`), "size:", await page.evaluate(`__game.state.size`));
  await page.evaluate(`__game.teleport(${spot.x}, ${spot.y}, "N")`);
  await sleep(4000);
  console.log("monsters near:", await page.evaluate(`JSON.stringify(__game.game.enc.monsters.map((m) => [m.defId, m.x, m.y]))`));
  await page.screenshot({ path: join(outDir, "wild-new.png") });
  console.log(problems.filter((p) => !p.includes("403")).length ? problems.filter((p) => !p.includes("403")).join("\n") : "no errors logged (the 403 of the fonts aside)");
} finally {
  await browser.close();
}
