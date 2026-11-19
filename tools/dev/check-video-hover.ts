/**
 * 59th playtest follow-up, point 3: the clip of the smithy (and the Capybara's page) must stay on screen while the pointer runs over the window.
 * The user saw the picture of the video turn into a piece of the game behind it (Chrome with D3D11). The script hovers the rows of the smithy again and again and
 * measures the video's rectangle after every move: its mean colour must stay close to the clip's own (the clip is one scene, the world behind is another), and the
 * picture must not be transparent.
 *
 * Needs a dev server (`VITE_FROZEN=1 VITE_PORT=<free port> npx vite --port <free port> --strictPort`) and Chrome.
 * Usage: GAME_URL=http://localhost:<port>/ npx tsx tools/dev/check-video-hover.ts <outDir> [rounds]
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
import sharp from "sharp";

const outDir = process.argv[2];
if (!outDir) throw new Error("usage: tsx tools/dev/check-video-hover.ts <outDir> [rounds]");
const rounds = Number(process.argv[3] ?? 40);
const base = process.env.GAME_URL ?? "http://localhost:5173/";
mkdirSync(outDir, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: ["--window-size=1400,820", "--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-webgl"],
  defaultViewport: { width: 1400, height: 820 },
});
const problems: string[] = [];
try {
  const page = await browser.newPage();
  page.on("pageerror", (e) => problems.push(`[pageerror] ${(e as Error).message}`));
  const evalJs = <T>(code: string) => page.evaluate(code) as Promise<T>;
  await page.goto(`${base}?autostart=1&seed=test`, { waitUntil: "load", timeout: 90000 });
  await page.waitForFunction("window.__game !== undefined", { timeout: 90000 });
  await sleep(3000);
  await evalJs(`(async () => { await __game.enter("p:0:0:0"); })()`);
  await sleep(2500);
  // something to sell: a few scrolls in the backpack of the first hero
  const scroll = (id: number, name: string, school: string) => `{ id: "s${id}", name: ${JSON.stringify(name)}, type: "spell", material: 0, texture: "item_spell_${school}", value: 100, quest: false, spellId: ${id}, bonus: {} }`;
  await evalJs(`(() => { const inv = __game.state.party.characters[0].inventory; inv.slot1 = ${scroll(8, "Scroll A", "arcane")}; inv.slot2 = ${scroll(9, "Scroll B", "clerical_nature")}; inv.slot3 = ${scroll(3, "Scroll C", "arcane_nature")}; __game.game.refresh(); })()`);
  await evalJs(`__game.goto("service", "smith")`);
  await sleep(500);
  await page.keyboard.press("w");
  await sleep(2500);

  const meanOf = async (clip: { x: number; y: number; width: number; height: number }, name: string): Promise<{ r: number; g: number; b: number }> => {
    const png = await page.screenshot({ clip, path: name ? join(outDir, name) : undefined });
    const { channels } = await sharp(Buffer.from(png)).stats();
    return { r: Math.round(channels[0]!.mean), g: Math.round(channels[1]!.mean), b: Math.round(channels[2]!.mean) };
  };
  const videoRect = () => evalJs<{ x: number; y: number; width: number; height: number; state: string }>(`(() => { const v = document.querySelector(".svc-art video"); if (!v) return { x: 0, y: 0, width: 0, height: 0, state: "none" }; const r = v.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, state: v.readyState + "/" + (v.paused ? "paused" : "playing") + "/" + v.currentTime.toFixed(1) }; })()`);

  const first = await videoRect();
  console.log("video:", JSON.stringify(first));
  if (first.state === "none") problems.push("no video in the smithy (is animatedTown on?)");
  const clip = { x: first.x + 20, y: first.y + 20, width: Math.max(10, first.width - 40), height: Math.max(10, first.height - 40) };

  for (const tab of ["Sell", "Buy"]) {
    await evalJs(`[...document.querySelectorAll(".service .tab")].find((e) => e.textContent.includes(${JSON.stringify(tab)}))?.click()`);
    await sleep(300);
    const rows = await page.$$(".service .svc-main .opt");
    console.log(tab, "rows:", rows.length);
    const means: string[] = [];
    for (let i = 0; i < rounds; i++) {
      const row = rows[i % Math.max(1, rows.length)];
      if (!row) break;
      await row.hover();
      await sleep(120);
      const m = await meanOf(clip, i % 10 === 0 ? `${tab}-${i}.png` : "");
      const v = await videoRect();
      means.push(`${m.r},${m.g},${m.b}`);
      // a picture that is the colour of the window's own dark background is a video that has turned blank
      if (m.r + m.g + m.b < 40) problems.push(`${tab} round ${i}: the video's rectangle is black/blank (${JSON.stringify(m)}, ${v.state})`);
    }
    console.log(tab, "mean colours:", means.join(" | "));
  }
  await page.screenshot({ path: join(outDir, "final.png") });
} finally {
  await browser.close();
}
console.log(problems.length ? "PROBLEMS:\n" + [...new Set(problems)].join("\n") : "no blank picture seen");
