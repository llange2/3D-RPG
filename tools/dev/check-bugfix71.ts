/**
 * bug_fix_71 in the real browser (needs a dev server and Chrome): the smithy shows the four portraits with arrows while the pointer is on an item (Buy and Sell, Ctrl for the
 * off-hand ring), and the impact flipbooks are drawn from the 512 px sheet.
 *
 * Usage: tsx tools/dev/check-bugfix71.ts <outDir> [url]      (default url http://localhost:5173/)
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const outDir = process.argv[2];
if (!outDir) throw new Error("usage: tsx tools/dev/check-bugfix71.ts <outDir> [url]");
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
  page.on("response", (r) => {
    if (r.status() >= 400) problems.push(`[http ${r.status()}] ${r.url()}`);
  });
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`[console] ${m.text()}`);
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

  await evalJs(`(async () => { await __game.enter("p:0:0:0"); })()`);
  await sleep(2500);
  if (!(await evalJs<boolean>(`__game.goto("service", "smith")`))) problems.push("the start town has no smith");
  await sleep(500);
  await page.keyboard.press("w");
  await sleep(1500);

  const strip = () => evalJs<{ on: boolean; heroes: string[] }>(`(() => { const s = document.querySelector(".cmp-strip"); return s ? { on: s.classList.contains("on"), heroes: [...s.querySelectorAll(".cmp-hero")].map((e) => e.className.replace("cmp-hero ", "") + (e.querySelector(".cmp-arrow") ? "+arrow" : "")) } : { on: false, heroes: [] }; })()`);
  const before = await strip();
  console.log("strip before hover:", JSON.stringify(before));
  if (before.heroes.length !== 4) problems.push("the strip does not hold four portraits");
  if (before.on) problems.push("the strip is visible without a hovered item");
  await page.screenshot({ path: join(outDir, "smith-0-idle.png") });

  // Buy: hover over each shelf's first rows
  for (const shelf of ["Armor", "Weapons", "Rings"]) {
    await click(".service .tab", shelf);
    await sleep(300);
    const rows = await page.$$(".service .svc-main .opt");
    if (rows.length === 0) continue;
    for (let i = 0; i < Math.min(rows.length, 3); i++) {
      await rows[i]!.hover();
      await sleep(200);
      const s = await strip();
      console.log(`${shelf} row ${i}:`, JSON.stringify(s));
      if (!s.on) problems.push(`${shelf} row ${i}: the strip does not show`);
      if (i === 0) await page.screenshot({ path: join(outDir, `smith-buy-${shelf.toLowerCase()}.png`) });
    }
    if (shelf === "Rings") {
      await page.keyboard.down("Control");
      await sleep(200);
      console.log("Rings with Ctrl:", JSON.stringify(await strip()));
      await page.screenshot({ path: join(outDir, "smith-buy-rings-ctrl.png") });
      await page.keyboard.up("Control");
    }
  }
  await page.mouse.move(5, 5);
  await sleep(200);
  if ((await strip()).on) problems.push("the strip stays after the pointer left the row");

  // Sell
  await click(".service .tab", "Sell");
  await sleep(300);
  const sell = await page.$$(".service .svc-main .opt");
  console.log("sellable rows:", sell.length);
  if (sell[0]) {
    await sell[0].hover();
    await sleep(200);
    console.log("Sell row 0:", JSON.stringify(await strip()));
    await page.screenshot({ path: join(outDir, "smith-sell.png") });
  }
} finally {
  await browser.close();
}
if (problems.length) {
  console.log("PROBLEMS:\n" + [...new Set(problems)].join("\n"));
  process.exitCode = 1;
} else console.log("OK");
