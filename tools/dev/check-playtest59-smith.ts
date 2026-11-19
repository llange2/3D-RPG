/**
 * 59th playtest, points 4, 6 and 7 in the real browser (needs a dev server and Chrome): the arrows of the smithy are fetched before the first hover, a scroll shows the heroes who can learn it
 * (green arrow), who could later (portrait without arrow) and who never (greyed out), and every `title` shows in the game's own tooltip box.
 *
 * Usage: tsx tools/dev/check-playtest59-smith.ts <outDir> [url]      (default url http://localhost:5173/)
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const outDir = process.argv[2];
if (!outDir) throw new Error("usage: tsx tools/dev/check-playtest59-smith.ts <outDir> [url]");
const base = process.argv[3] ?? "http://localhost:5173/";
mkdirSync(outDir, { recursive: true });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: ["--window-size=1400,820", "--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-webgl", "--autoplay-policy=no-user-gesture-required"],
  defaultViewport: { width: 1400, height: 820 },
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
  const click = (selector: string, text?: string) =>
    evalJs<boolean>(`(() => {
      const els = [...document.querySelectorAll(${JSON.stringify(selector)})].filter((e) => !${JSON.stringify(text ?? "")} || e.textContent.includes(${JSON.stringify(text ?? "")}));
      if (!els[0]) return false;
      els[0].click();
      return true;
    })()`);

  // three scrolls in the backpack of the first hero: spell 8 (Arcane, level 2; the archer is raised to level 5), spell 9 (Clerical and Nature, level 2), spell 3 (known by the archer and the druid)
  const scroll = (id: number, name: string, school: string) => `{ id: "s${id}", name: ${JSON.stringify(name)}, type: "spell", material: 0, texture: "item_spell_${school}", value: 100, quest: false, spellId: ${id}, bonus: {} }`;
  await evalJs(`(async () => { await __game.enter("p:0:0:0"); })()`);
  await sleep(2500);
  await evalJs(`(() => { const inv = __game.state.party.characters[0].inventory; __game.state.party.characters[2].level = 5; inv.slot1 = ${scroll(8, "Scroll A", "arcane")}; inv.slot2 = ${scroll(9, "Scroll B", "clerical_nature")}; inv.slot3 = ${scroll(3, "Scroll C", "arcane_nature")}; __game.game.refresh(); })()`);
  if (!(await evalJs<boolean>(`__game.goto("service", "smith")`))) problems.push("the start town has no smith");
  await sleep(500);
  await page.keyboard.press("w");
  await sleep(1500);

  // point 6: both arrows are in the resource list before anything was hovered
  // (the resource list of the page is full after the textures: the arrows are looked for in the page's own warm holder, where they must be loaded)
  const loaded = await evalJs<string[]>(`[...document.querySelectorAll(".art-warm img")].filter((i) => /arrow_(up|down)/.test(i.src) && i.complete && i.naturalWidth > 0).map((i) => i.src)`);
  console.log("arrows fetched before the first hover:", JSON.stringify(loaded.map((n) => n.split("/").pop())));
  if (loaded.length < 2) problems.push("the comparison arrows were not fetched before the first hover");

  const strip = () => evalJs<{ on: boolean; heroes: string[] }>(`(() => { const s = document.querySelector(".cmp-strip"); return s ? { on: s.classList.contains("on"), heroes: [...s.querySelectorAll(".cmp-hero")].map((e) => e.className.replace("cmp-hero ", "") + (e.querySelector(".cmp-arrow") ? "+arrow" : "")) } : { on: false, heroes: [] }; })()`);

  // point 7: the scrolls are sold from the backpack of the first hero (Sell)
  await click(".service .tab", "Sell");
  await sleep(300);
  const rows = await page.$$(".service .svc-main .opt");
  console.log("sellable rows:", rows.length);
  for (let i = 0; i < rows.length; i++) {
    const text = await rows[i]!.evaluate((e) => (e as HTMLElement).innerText.replace(/\n/g, " | "));
    if (!/Scroll|Meteor|Light|Spell/i.test(text) && i > 5) continue;
    await rows[i]!.hover();
    await sleep(250);
    console.log(`row ${i} (${text.slice(0, 40)}):`, JSON.stringify(await strip()));
    if (/Scroll A/.test(text)) await page.screenshot({ path: join(outDir, "smith-scroll-a.png") });
    if (/Scroll B/.test(text)) await page.screenshot({ path: join(outDir, "smith-scroll-b.png") });
  }

  // point 4: the portrait's title shows in the tooltip box of the game, and the browser's own is gone
  const hero = await page.$(".cmp-strip .cmp-hero");
  if (hero && rows[0]) {
    await rows[0].hover();
    await sleep(200);
    const box = await hero.boundingBox();
    if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await sleep(400);
    const tip = await evalJs<{ text: string; font: string; size: string } | null>(`(() => { const t = document.querySelector(".hover-tip"); return t && t.isConnected ? { text: t.innerText, font: getComputedStyle(t).fontFamily, size: getComputedStyle(t).fontSize } : null; })()`);
    console.log("tooltip box:", JSON.stringify(tip));
    if (!tip) problems.push("no .hover-tip over a portrait of the strip");
    await page.screenshot({ path: join(outDir, "smith-tooltip.png") });
  }
  // a row of the shop with several lines in its title (name, then its values)
  await click(".service .tab", "Buy");
  await sleep(300);
  const buyRows = await page.$$(".service .svc-main .opt");
  if (buyRows[0]) {
    const label = await buyRows[0].$("span[data-tip], span[title]");
    if (label) {
      await label.hover();
      await sleep(400);
      const tip = await evalJs<string | null>(`(() => { const t = document.querySelector(".hover-tip"); return t && t.isConnected ? t.innerText : null; })()`);
      console.log("item tooltip:", JSON.stringify(tip));
      await page.screenshot({ path: join(outDir, "smith-item-tooltip.png") });
    }
  }
} finally {
  await browser.close();
}
if (problems.length) {
  console.log("PROBLEMS:\n" + [...new Set(problems)].join("\n"));
  process.exitCode = 1;
} else console.log("OK");
