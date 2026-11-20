/**
 * 61st playtest, point 2 in the real browser (needs a dev server and Chrome): the smithy window keeps one height whatever the tab (Buy: armor, weapons, rings; Sell; Buy back), shows
 * eight items of the Buy list without scrolling, and scrolls where a list is longer.
 *
 * Usage: tsx tools/dev/check-playtest61-smith.ts <outDir> [url] [width x height]      (default url http://localhost:5173/, window 1400x820)
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const outDir = process.argv[2];
if (!outDir) throw new Error("usage: tsx tools/dev/check-playtest61-smith.ts <outDir> [url] [WxH]");
const base = process.argv[3] ?? "http://localhost:5173/";
const [W = 1400, H = 820] = (process.argv[4] ?? "1400x820").split("x").map(Number);
mkdirSync(outDir, { recursive: true });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: [`--window-size=${W},${H}`, "--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-webgl", "--autoplay-policy=no-user-gesture-required"],
  defaultViewport: { width: W, height: H },
});
const problems: string[] = [];
try {
  const page = await browser.newPage();
  page.on("pageerror", (e) => problems.push(`[pageerror] ${(e as Error).message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/403|Failed to load resource/.test(m.text())) problems.push(`[console] ${m.text()}`);
  });
  await page.goto(`${base}?autostart=1&seed=test`, { waitUntil: "load", timeout: 90000 });
  await page.waitForFunction("window.__game !== undefined", { timeout: 90000 });
  await sleep(3000);
  const evalJs = <T>(code: string) => page.evaluate(code) as Promise<T>;
  const click = (selector: string, text: string) =>
    evalJs<boolean>(`(() => {
      const els = [...document.querySelectorAll(${JSON.stringify(selector)})].filter((e) => e.textContent.trim().startsWith(${JSON.stringify(text)}));
      if (!els[0]) return false;
      els[0].click();
      return true;
    })()`);

  await evalJs(`(async () => { await __game.enter("p:0:0:0"); })()`);
  await sleep(2500);
  // a full backpack for the first hero, so that Sell has more than a window's worth of rows
  await evalJs(`(() => { const c = __game.state.party.characters[0]; const sword = { id: "x", name: "Test Sword", type: "weapon", material: 0, texture: "item_sword", value: 100, quest: false, bonus: {} }; for (const slot of Object.keys(c.inventory)) { if (/^slot/.test(slot) && !c.inventory[slot]) c.inventory[slot] = { ...sword, name: "Test Sword " + slot }; } __game.state.party.gold = 500000; __game.game.refresh(); })()`);
  if (!(await evalJs<boolean>(`__game.goto("service", "smith")`))) problems.push("the start town has no smith");
  await sleep(500);
  await page.keyboard.press("w");
  await sleep(1500);

  const measure = () =>
    evalJs<{ panel: [number, number]; main: { client: number; scroll: number }; rows: number; rowH: number; overflow: boolean }>(`(() => {
      const p = document.querySelector(".panel.service").getBoundingClientRect();
      const m = document.querySelector(".service .svc-main");
      const rows = [...m.querySelectorAll(".opt")];
      const r0 = rows[0] ? rows[0].getBoundingClientRect() : null;
      const mr = m.getBoundingClientRect();
      const visible = rows.filter((r) => { const b = r.getBoundingClientRect(); return b.top >= mr.top - 1 && b.bottom <= mr.bottom + 1; }).length;
      return { panel: [Math.round(p.width), Math.round(p.height)], main: { client: m.clientHeight, scroll: m.scrollHeight }, rows: rows.length, rowH: r0 ? Math.round(r0.height) : 0, overflow: m.scrollHeight > m.clientHeight + 1, visible };
    })()`);

  const heights: number[] = [];
  const tabs: [string, string][] = [["Buy", ""], ["Buy", "Armor"], ["Buy", "Weapons"], ["Buy", "Rings"], ["Sell", ""], ["Buy back", ""]];
  for (const [tab, shelf] of tabs) {
    await click(".service .tab", tab === "Buy" ? "Buy" : tab);
    await sleep(200);
    if (shelf) await click(".service .tabs .tab", shelf);
    await sleep(300);
    const m = await measure();
    heights.push(m.panel[1]);
    console.log(`${tab}${shelf ? " / " + shelf : ""}:`, JSON.stringify(m));
    await page.screenshot({ path: join(outDir, `smith-${(tab + (shelf ? "-" + shelf : "")).replace(/\s+/g, "_")}.png`) });
  }
  if (new Set(heights).size > 1) problems.push(`the window height changes between tabs: ${heights.join(", ")}`);
} finally {
  await browser.close();
}
console.log(problems.length ? `PROBLEMS:\n${problems.join("\n")}` : "OK");
