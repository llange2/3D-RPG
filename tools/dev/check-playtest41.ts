/**
 * 41st playtest, point 1: the window of the book of heroes ("Hero Generation") keeps its size whatever race, class or roll is picked, and the race bonuses stand beside the portrait.
 * Opens the book in the inn of Starthaven, steps through all portraits (races), rolls and class buttons, and prints the height of the panel each time.
 *
 * Usage: tsx tools/dev/check-playtest41.ts <outDir> [url]      (default url http://localhost:5173/)
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const outDir = process.argv[2];
if (!outDir) throw new Error("usage: tsx tools/dev/check-playtest41.ts <outDir> [url]");
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
  await page.goto(`${base}?autostart=1&seed=test`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction("window.__game !== undefined", { timeout: 60000 });
  await sleep(3000);
  await evalJs(`(async () => { await __game.enter("p:0:0:0"); })()`);
  await sleep(2500);
  await evalJs<boolean>(`__game.goto("service", "inn")`);
  await sleep(500);
  await page.keyboard.press("w");
  await sleep(1200);
  const click = (selector: string, text?: string) =>
    evalJs<boolean>(`(() => {
      const els = [...document.querySelectorAll(${JSON.stringify(selector)})].filter((e) => !${JSON.stringify(text ?? "")} || e.textContent.includes(${JSON.stringify(text ?? "")}));
      if (!els[0]) return false;
      els[0].click();
      return true;
    })()`);
  if (!(await click(".service .btn", "book of heroes"))) problems.push("the inn has no book of heroes");
  await sleep(600);

  /** Height and width of the window, and the bonus lines beside the portrait. */
  const measure = () =>
    evalJs<{ panel: [number, number]; roster: [number, number]; race: string; bonus: string[] }>(`(() => {
      const roster = document.querySelector(".roster");
      const panel = roster.closest(".panel") ?? roster.parentElement;
      const r = roster.getBoundingClientRect();
      const p = panel.getBoundingClientRect();
      return {
        panel: [Math.round(p.width), Math.round(p.height)],
        roster: [Math.round(r.width), Math.round(r.height)],
        race: [...document.querySelectorAll(".roster h3")].map((e) => e.textContent).find((t) => t.startsWith("Race")) ?? "",
        bonus: [...document.querySelectorAll(".roster .race-bonus > div")].map((e) => e.textContent),
      };
    })()`);

  const sizes = new Set<string>();
  const note = async (label: string) => {
    const m = await measure();
    sizes.add(`${m.panel.join("x")} / ${m.roster.join("x")}`);
    console.log(label.padEnd(24), m.race.padEnd(14), `panel ${m.panel.join("x")} roster ${m.roster.join("x")}`, m.bonus.join(" | "));
  };
  await note("start");
  await page.screenshot({ path: join(outDir, "roster-start.png") });
  // every portrait (races change along the way), rolling and picking classes in between
  const portraits = await evalJs<number>(`document.querySelectorAll(".roster .picker .btn").length`);
  if (portraits < 2) problems.push("no portrait picker");
  const seen = new Set<string>();
  for (let i = 0; i < 40; i++) {
    await click(".roster .picker .btn", "▶");
    await sleep(120);
    const m = await measure();
    if (!seen.has(m.race)) {
      seen.add(m.race);
      await page.screenshot({ path: join(outDir, `roster-${m.race.replace(/\W+/g, "_")}.png`) });
      await note(`portrait ${i}`);
    } else sizes.add(`${m.panel.join("x")} / ${m.roster.join("x")}`);
    if (i % 5 === 0) await click(".roster .btn", "Roll again");
    if (i % 3 === 0) await click(".roster .classes .btn:not(.off)");
  }
  await note("after");
  console.log("races seen:", [...seen].join(", "));
  console.log("distinct sizes:", sizes.size, [...sizes].join("  ;  "));
  if (sizes.size !== 1) problems.push(`the window changed its size: ${[...sizes].join(" ; ")}`);
} finally {
  await browser.close();
}
console.log(problems.length === 0 ? "OK" : `PROBLEMS:\n${problems.join("\n")}`);
process.exit(problems.length === 0 ? 0 : 1);
