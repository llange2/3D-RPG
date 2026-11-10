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
import { SIDE_DELTA, poiEntrances } from "../../src/world/types";
import { World } from "../../src/world/world";

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

  if (part === "enter") {
    // point 23: the tile in front of a place with a key held down: the step onto it asks "Enter?", and the step that is queued behind it bumps into the place and asks again.
    // There must be one question, and "Enter" must load the place once.
    const world = new World(SEED, "default", "default");
    const poi = world.allPois().find((p) => p.kind === "dungeon" && p.size === 1)!;
    const e = poiEntrances(poi)[0]!;
    const { dx, dy } = SIDE_DELTA[poi.side];
    const facing = dy > 0 ? "N" : dy < 0 ? "S" : dx > 0 ? "W" : "E";
    console.log(`place ${poi.name} (${poi.id}) entrance ${e.x}/${e.y}, side ${poi.side}, standing at ${e.x + dx}/${e.y + dy} facing ${facing}`);
    await open();
    await evalJs(`__game.teleport(${e.x + dx}, ${e.y + dy}, ${JSON.stringify(facing)})`);
    await sleep(1500);
    await page.keyboard.down("w");
    await sleep(1100);
    await page.keyboard.up("w");
    await sleep(1800);
    console.log("questions on the screen:", await evalJs<number>(`document.querySelectorAll(".modal-back").length`));
    await shot("question");
    // answer it: one "Enter", and the place loads once (the loading screen, then the interior)
    await evalJs(`(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Enter"); if (b) b.click(); return !!b; })()`);
    await sleep(9000);
    console.log("after Enter: questions", await evalJs<number>(`document.querySelectorAll(".modal-back").length`), "place:", await evalJs<string>(`__game.state.at.mode + " " + (__game.state.at.poiId ?? "")`));
    await shot("inside");
  }
  if (part === "status") {
    // points 19 and 30: eight symbols (Detect Monster among them) beside the compass; none of them may cover the compass or the focus bar
    await open();
    // the compass shows only with the talent Orientation
    await evalJs(`(() => { const p = __game.state.party; p.talents.push("talent_orientation"); })()`);
    await evalJs(`(() => { const p = __game.state.party; const until = p.minutes + 600; for (const e of [{ kind: "levitate" }, { kind: "power_shield" }, { kind: "wizard_eye" }, { kind: "detect_monster" }, { kind: "protection", element: "fire" }, { kind: "protection", element: "ice" }, { kind: "protection", element: "acid" }, { kind: "protection", element: "magic" }]) p.effects.push({ ...e, until }); __game.game.refresh(); })()`);
    for (const [w, h] of [[1280, 720], [1920, 1080], [1000, 700]] as [number, number][]) {
      await page.setViewport({ width: w, height: h });
      await sleep(1200);
      console.log(`${w}x${h}:`, await evalJs<string>(`(() => { const r = (e) => { const b = e.getBoundingClientRect(); return { l: Math.round(b.left), t: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom) }; }; const icons = [...document.querySelectorAll(".status-icons img")].map(r); const compass = r(document.querySelector(".compass")); const hit = icons.filter((i) => i.l < compass.r && i.r > compass.l && i.t < compass.b && i.b > compass.t).length; const rows = new Set(icons.map((i) => i.t)).size; return JSON.stringify({ icons: icons.length, rows, coverCompass: hit, compass, firstIcon: icons[0], last: icons[icons.length - 1], detect: !!document.querySelector('.status-icons img[src*="detect_monster"]') }); })()`));
      await shot(`${w}x${h}`);
    }
  }
  if (part === "fonts") {
    // point 29: what is kept in the page, and the faces of the fonts (the dev server of a worktree answers 403 for the font files, so there only the kept pictures show)
    await open();
    console.log(await evalJs<string>(`(() => { const holder = document.querySelector(".art-warm"); return JSON.stringify({ kept: !!holder, itemIcon: !!holder?.querySelector(".item-icon"), frames: holder?.querySelectorAll(".parchment").length, statusIcons: holder?.querySelectorAll("img").length, spans: holder?.querySelectorAll("span").length, faces: [...document.fonts].map((f) => f.family + " " + f.weight + " " + f.status).slice(0, 12), almendra700: document.fonts.check('700 16px Almendra') }); })()`));
    // the inventory opens with its pictures at once: the slot icons must be showing the sheet in the first frame
    await page.keyboard.press("i");
    await sleep(400);
    console.log(await evalJs<string>(`(() => { const icons = [...document.querySelectorAll(".item-icon")]; return JSON.stringify({ icons: icons.length, withSheet: icons.filter((e) => (e.style.backgroundImage ?? "").includes("items.webp")).length }); })()`));
    await shot("inventory");
  }

  console.log(`problems (${problems.length}):`);
  for (const p of [...new Set(problems)].slice(0, 25)) console.log("  " + p);
} finally {
  await browser.close();
}
