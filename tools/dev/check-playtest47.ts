/**
 * Browser checks of the 47th playtest (needs a dev server, `VITE_FROZEN=1 VITE_PORT=<free port> npx vite --port <free port> --strictPort`):
 *   floor   the floor of the level 5 town beside the one of a level 1 town (point 1)
 *   deco    the lion of the Catacombs of Nora, 50/37 (point 6)
 *   spells  the light of a fireball at night (point 8)
 *   saves   named saves: new, replace, list (points 2 and 3)
 *
 * Usage: GAME_URL=http://localhost:<port>/ npx tsx tools/dev/check-playtest47.ts <screenshot folder> <floor|deco|spells|saves> [flat|floor|full]
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
import { generateInterior } from "../../src/interiors";
import { World } from "../../src/world/world";

const base = process.env.GAME_URL ?? "http://localhost:5391/";
const outDir = process.argv[2] ?? "playtest47-shots";
const part = process.argv[3] ?? "floor";
const environment = process.argv[4] ?? "full";
mkdirSync(outDir, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
  await page.evaluateOnNewDocument((v: string) => localStorage.setItem("mm3-seed-rpg:settings:v1", v), JSON.stringify({ environment }));
  const evalJs = <T>(code: string) => page.evaluate(code) as Promise<T>;
  const shot = (name: string) => page.screenshot({ path: join(outDir, `${part}-${environment}-${name}.png`) });
  const open = async (seed: string) => {
    await page.goto(`${base}?autostart=1&seed=${seed}&size=default${part === "spells" ? "&outside=1" : ""}`, { waitUntil: "load", timeout: 60000 });
    await page.waitForFunction("window.__game !== undefined", { timeout: 60000 });
    await sleep(5000);
  };

  if (part === "floor") {
    const seed = "cedar-peak-198";
    const world = new World(seed, "default");
    for (const tier of [1, 5]) {
      const town = world.allPois().find((p) => p.kind === "town" && p.tier === tier);
      if (!town) throw new Error(`no town of level ${tier}`);
      const map = generateInterior(world, town);
      console.log(`level ${tier}: ${town.id} ${town.name}, theme ${map.theme.id}, spawn`, JSON.stringify(map.spawn));
      await open(seed);
      await evalJs(`(async () => { await __game.enter(${JSON.stringify(town.id)}); })()`);
      await sleep(3500);
      await shot(`level${tier}-start`);
      // looking down at the floor: the pitch cannot be set, so a second shot a few steps in
      await page.keyboard.press("w");
      await sleep(900);
      await shot(`level${tier}-step`);
    }
  }
  if (part === "deco") {
    const seed = "frost-mere-472";
    const world = new World(seed, "default", "default");
    const poi = world.allPois().find((p) => p.name === "Catacombs of Nora")!;
    await page.goto(`${base}?autostart=1&seed=${seed}&size=default&dungeons=default`, { waitUntil: "load", timeout: 60000 });
    await page.waitForFunction("window.__game !== undefined", { timeout: 60000 });
    await sleep(5000);
    await evalJs(`(async () => { await __game.enter(${JSON.stringify(poi.id)}); })()`);
    await sleep(3500);
    // stand at 49/37 looking east at the lion on 50/37 (its back must be to the wall in the east), then from the north and the south
    for (const [x, y, f, name] of [[48, 37, "E", "from-west"], [50, 35, "S", "from-north"], [49, 39, "N", "from-south"]] as [number, number, string, string][]) {
      await evalJs(`__game.teleport(${x}, ${y}, "${f}")`);
      await sleep(1200);
      await shot(name);
    }
  }
  if (part === "spells") {
    const seed = "cedar-peak-198";
    await open(seed);
    // night, so that the light of a flying spell shows
    await evalJs(`(() => { const p = __game.state.party; p.minutes = 24 * 60 + 23 * 60; __game.game.refresh(); })()`);
    await sleep(1500);
    await shot("night-before");
    const kinds = ["fire", "acid", "ice", "magic"];
    for (const kind of kinds) {
      await evalJs(`(() => { const g = __game.game; const p = g.player; const s = { x: p.x, y: 1.4, z: p.z }; const e = { x: p.x + 2, y: 1.4, z: p.z - 18 }; g.projectiles.launch(${JSON.stringify(kind)}, s, e, 1, 3); })()`);
      await sleep(1200);
      await shot(`flying-${kind}`);
      await sleep(2500);
    }
  }
  if (part === "saves") {
    // "Save game" with names: two new saves, one replaced; "Load game" lists them; the title lists them too; the campaign is not offered
    await open("saves-47");
    await sleep(9000); // (the first load of a new world takes a while: the loading picture must be gone)
    const click = (text: string) => evalJs<boolean>(`(() => { const e = [...document.querySelectorAll(".opt, .btn")].find((x) => x.textContent.trim().startsWith(${JSON.stringify(text)})); if (!e) return false; e.click(); return true; })()`);
    const saveAs = async (name: string) => {
      await page.keyboard.press("Escape");
      await sleep(500);
      if (!(await click("Save game"))) problems.push("no Save game in the menu");
      await sleep(400);
      await shot(`menu-${name.replace(/\W/g, "")}`);
      if (!(await click("New save"))) problems.push("no New save entry");
      await sleep(400);
      await page.keyboard.type(name);
      await page.keyboard.press("Enter");
      await sleep(600);
    };
    await saveAs("First save");
    await saveAs("Second one");
    // replace the first one: pick it in the list and confirm
    await page.keyboard.press("Escape");
    await sleep(500);
    await click("Save game");
    await sleep(400);
    await shot("list-two");
    await click("First save");
    await sleep(400);
    await shot("replace-asks");
    await click("Replace");
    await sleep(600);
    const names = await evalJs<string>(`JSON.stringify(JSON.parse(localStorage.getItem("mm3-seed-rpg:named:index:v1") ?? "[]").map((e) => e.name))`);
    console.log("named saves:", names);
    if (names !== JSON.stringify(["First save", "Second one"]) && names !== JSON.stringify(["Second one", "First save"])) problems.push(`unexpected saves ${names}`);
    // the load list in the game
    await page.keyboard.press("Escape");
    await sleep(500);
    await click("Load game");
    await sleep(400);
    await shot("load-list");
    const loadText = await evalJs<string>(`document.body.innerText`);
    if (!loadText.includes("First save") || !loadText.includes("Second one") || !loadText.includes("Delete a save")) problems.push("the load list lacks the named saves or Delete");
    if (/campaign/i.test(loadText.split("Load game")[1] ?? "")) problems.push("the campaign is still listed");
  }
  if (problems.length) console.log("PROBLEMS:\n" + problems.join("\n"));
} finally {
  await browser.close();
}
console.log("done");
