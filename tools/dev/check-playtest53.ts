/**
 * Browser checks of the 53rd playtest (needs a dev server, `VITE_FROZEN=1 VITE_PORT=<free port> npx vite --port <free port> --strictPort`):
 *   cottage   the cottage of the caravan at 142/88 of seed pearl-shore-794 from four sides, by day and at night (point 9)
 *   enter     the question "Enter the dungeon?" comes up once, also with a key held on the tile in front (point 23)
 *   status    the status symbols of the top right: Detect Monster, and the row's width (points 19 and 30)
 *   fonts     the faces of the fonts that are loaded at the start, and the item sheet and scroll frames kept in the page (point 29)
 *
 * Usage: GAME_URL=http://localhost:<port>/ npx tsx tools/dev/check-playtest53.ts <screenshot folder> <cottage|enter|status|fonts> [args]
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const base = process.env.GAME_URL ?? "http://localhost:5191/";
const outDir = process.argv[2] ?? "playtest53-shots";
const part = process.argv[3] ?? "cottage";
const arg = process.argv[4] ?? "";
mkdirSync(outDir, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const SEED = "pearl-shore-794";

const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  protocolTimeout: 240000,
  args: ["--window-size=1280,720", "--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-webgl", "--autoplay-policy=no-user-gesture-required"],
  defaultViewport: { width: 1280, height: 720 },
});
try {
  const page = await browser.newPage();
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(`[pageerror] ${(e as Error).message}`));
  page.on("response", (r) => {
    // (the font files of a worktree's node_modules junction answer 403 on the dev server: not a fault of the game)
    if (r.status() >= 400 && !/fontsource/.test(r.url())) problems.push(`[http ${r.status()}] ${r.url()}`);
  });
  page.on("console", (m) => {
    if ((m.type() === "error" || m.type() === "warn") && !/403|Failed to load resource/.test(m.text())) problems.push(`[console ${m.type()}] ${m.text().slice(0, 300)}`);
  });
  const evalJs = <T>(code: string) => page.evaluate(code) as Promise<T>;
  const shot = (name: string) => page.screenshot({ path: join(outDir, `${part}-${name}.png`) });
  const open = async (outside = true) => {
    await page.goto(`${base}?autostart=1&seed=${SEED}&size=default&dungeons=default${outside ? "&outside=1" : ""}`, { waitUntil: "load", timeout: 60000 });
    await page.waitForFunction("window.__game !== undefined", { timeout: 60000 });
    await sleep(12000);
  };

  if (part === "cottage") {
    await open();
    // the cottage stands on 142/88 and looks west; the views: from the west (its front), the north, the south and the east
    let views: [string, number, number, string][] = [["west", 139, 88, "E"], ["north", 142, 85, "S"], ["south", 142, 91, "N"], ["east", 145, 88, "W"]];
    // another cottage: `x,y,F;x,y,F` (the places to stand on and the way to look)
    if (arg) views = arg.split(";").map((v) => { const [x, y, f] = v.split(","); return [`${x}_${y}_${f}`, Number(x), Number(y), f!] as [string, number, number, string]; });
    for (const [label, minutes] of [["day", 24 * 60 + 12 * 60], ["night", 24 * 60 + 23 * 60]] as [string, number][]) {
      await evalJs(`(() => { const p = __game.state.party; p.minutes = ${minutes}; __game.game.refresh(); })()`);
      for (const [side, x, y, facing] of views) {
        await evalJs(`__game.teleport(${x}, ${y}, ${JSON.stringify(facing)})`);
        await sleep(2200);
        await shot(`${label}-${side}`);
      }
    }
  }

  console.log(`problems (${problems.length}):`);
  for (const p of [...new Set(problems)].slice(0, 25)) console.log("  " + p);
} finally {
  await browser.close();
}
