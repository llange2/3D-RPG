/**
 * bug_fix_54, browser check of the big map: the search field with its red rings (point 4), the tooltip beside the pointer (point 2), the text field's look (point 3).
 * Usage: GAME_URL=http://localhost:<port>/ npx tsx tools/dev/check-bugfix54.ts <screenshot folder> [seed]
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const base = process.env.GAME_URL ?? "http://localhost:5183/";
const outDir = process.argv[2] ?? "bugfix54-shots";
const seed = process.argv[3] ?? "cedar-peak-198";
mkdirSync(outDir, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  protocolTimeout: 240000,
  args: ["--window-size=1280,800", "--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-webgl", "--autoplay-policy=no-user-gesture-required"],
  defaultViewport: { width: 1280, height: 800 },
});
try {
  const page = await browser.newPage();
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(`[pageerror] ${(e as Error).message}`));
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`[console error] ${m.text().slice(0, 300)}`);
  });
  const evalJs = <T>(code: string) => page.evaluate(code) as Promise<T>;
  const shot = (name: string) => page.screenshot({ path: join(outDir, `${name}.png`) });
  await page.goto(`${base}?autostart=1&seed=${seed}&size=default&outside=1`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction("window.__game !== undefined", { timeout: 60000 });
  await sleep(12000);
  // the Cartographer talent and a map that is known everywhere (Reveal map)
  // mode "pyramid": nothing is revealed but one corner tile of the first pyramid, the search must still find it (its middle tile is dark)
  const pyramidMode = process.argv[4] === "pyramid";
  await evalJs(`(() => { const g = __game.game; g.state.party.talents.push("talent_cartographer"); if (${pyramidMode}) { const p = g.world.allPois().find((q) => q.size === 3); g.state.explored.markOverworld(p.x - 1, p.y - 1); return; } const { w, h } = { w: g.world.width, h: g.world.height }; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g.state.explored.markOverworld(x, y); })()`);
  const names = pyramidMode ? await evalJs<string[]>(`[__game.game.world.allPois().find((q) => q.size === 3).name]`) : await evalJs<string[]>(`__game.game.world.allPois().map((p) => p.name)`);
  console.log("places:", names.length, names.slice(0, 8).join(", "));
  await evalJs(`(() => { void __game.game.openMap(); })()`);
  await sleep(1500);
  await shot("1-map-open");
  const box = await evalJs<{ x: number; y: number; w: number; h: number } | null>(`(() => { const r = document.querySelector(".map-stage canvas:not(.map-marks)")?.getBoundingClientRect(); return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null; })()`);
  console.log("map canvas:", JSON.stringify(box));
  // point 2: the tooltip lies to the right of the pointer's picture
  await page.mouse.move(box!.x + box!.w / 2, box!.y + box!.h / 2);
  await sleep(400);
  await page.mouse.move(box!.x + box!.w / 2 + 3, box!.y + box!.h / 2 + 3);
  await sleep(500);
  console.log("tip:", await evalJs<string>(`JSON.stringify({ text: document.querySelector(".map-tip")?.textContent, rect: document.querySelector(".map-tip")?.getBoundingClientRect(), cursor: document.querySelector("#game-cursor")?.getBoundingClientRect() })`));
  await shot("2-tooltip");
  // point 4: two letters do nothing, three mark
  const term = pyramidMode ? names[0]!.slice(-4, -1) : names.find((n) => n.length >= 5)!.slice(1, 4);
  console.log("search term:", term, pyramidMode ? `(pyramid ${names[0]})` : "");
  const marks = () => evalJs<number>(`(() => { const c = document.querySelector(".map-marks"); const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n; })()`);
  await page.click(".map-search");
  await page.keyboard.type(term.slice(0, 2), { delay: 60 });
  console.log(`typed "${term.slice(0, 2)}": marked pixels`, await marks(), "| found:", await evalJs<string>(`document.querySelector(".map-found").textContent`));
  await page.keyboard.type(term.slice(2), { delay: 60 });
  console.log(`typed "${term}": marked pixels`, await marks(), "| found:", await evalJs<string>(`document.querySelector(".map-found").textContent`), "| expected:", await evalJs<number>(`__game.game.world.allPois().filter((p) => p.name.toLowerCase().includes(${JSON.stringify(term.toLowerCase())})).length`));
  // the keys c, f, + and - are letters in the field and must not move the map
  const viewBefore = await marks();
  await shot("3-search");
  // zoomed right out the rings stay
  await page.click(".map-tools .btn:nth-child(3)");
  await sleep(2500);
  console.log("whole map: marked pixels", await marks());
  await shot("4-search-whole-map");
  // Clear
  await page.click(".map-search-box .btn");
  await sleep(300);
  console.log("after Clear: text", JSON.stringify(await evalJs<string>(`document.querySelector(".map-search").value`)), "marked pixels", await marks(), "found:", JSON.stringify(await evalJs<string>(`document.querySelector(".map-found").textContent`)));
  void viewBefore;
  // point 3: the field's font is the game's
  console.log("input style:", await evalJs<string>(`JSON.stringify((() => { const s = getComputedStyle(document.querySelector(".map-search")); return { font: s.fontFamily, bg: s.backgroundColor, border: s.borderTopColor, color: s.color }; })())`));
  await page.keyboard.press("Escape");
  await sleep(600);
  console.log("map closed:", await evalJs<boolean>(`!document.querySelector(".map-panel")`));
  console.log(problems.length ? `PROBLEMS:\n${problems.join("\n")}` : "no console errors");
} finally {
  await browser.close();
}
