/**
 * Checks the achievements in the real browser (needs the dev server and Chrome, like check:options):
 *  1. The title screen has the fourth button under the three, as wide as the three together, with the share of achievements that have dropped; it opens the overview
 *     with 25 rows, the lock for each achievement that has not dropped, the picture for the ones that have, and a progress bar for the four counters.
 *  2. In a game an achievement that drops shows the scroll with its picture and "Congratulation, you have unlocked the ... achievement!" and "Okay"; it is in the stored profile
 *     (apart from the options and the saves); a second drop of the same one shows nothing; the title shows the new share after "Back to title".
 *  3. The gold of the game's ledger goes to the counter once, however often the game looks at it, and an older ledger (a loaded save) adds nothing.
 *  4. A game in which a debug action was used earns nothing.
 *
 * Usage: tsx tools/dev/check-achievements.ts <outDir> [url]      (default url http://localhost:5173/)
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const outDir = process.argv[2];
if (!outDir) throw new Error("usage: tsx tools/dev/check-achievements.ts <outDir> [url]");
const base = process.argv[3] ?? "http://localhost:5173/";
mkdirSync(outDir, { recursive: true });

const KEY = "mm3-seed-rpg:achievements:v1";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: ["--window-size=1280,800", "--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-webgl", "--autoplay-policy=no-user-gesture-required"],
  defaultViewport: { width: 1280, height: 800 },
});
const problems: string[] = [];
const expect = (ok: boolean, what: string) => {
  if (!ok) problems.push(what);
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
};
try {
  const page = await browser.newPage();
  page.on("pageerror", (e) => problems.push(`[pageerror] ${(e as Error).message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource/.test(m.text())) problems.push(`[console] ${m.text()}`);
  });
  const evalJs = <T>(code: string) => page.evaluate(code) as Promise<T>;
  const click = (selector: string, text?: string) =>
    evalJs<boolean>(`(() => {
      const els = [...document.querySelectorAll(${JSON.stringify(selector)})].filter((e) => !${JSON.stringify(text ?? "")} || e.textContent.includes(${JSON.stringify(text ?? "")}));
      if (!els[0]) return false;
      els[0].click();
      return true;
    })()`);
  const profile = () => evalJs<{ unlocked: Record<string, string>; unseen: string[]; totals: Record<string, number>; seen: Record<string, Record<string, number>> } | null>(`(() => { const v = localStorage.getItem(${JSON.stringify(KEY)}); return v ? JSON.parse(v) : null; })()`);

  // ---- 1. title screen and overview, with a profile that has a few drops and counts
  await page.goto(base, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction("window.__game !== undefined", { timeout: 60000 });
  await sleep(2500);
  await evalJs(`localStorage.setItem(${JSON.stringify(KEY)}, JSON.stringify({ version: 1, unlocked: { king: "2026-11-20", eviction: "2026-11-20", riddles: "2026-11-20" }, unseen: [], totals: { gold: 250000000, artifacts: 12, riddles: 30, dungeons: 40 }, seen: {} }))`);
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction("window.__game !== undefined", { timeout: 60000 });
  await sleep(2500);
  const layout = await evalJs<{ row: { x: number; w: number }; wide: { x: number; w: number; y: number; text: string }; rowY: number } | null>(`(() => {
    const row = document.querySelector(".title-row"); const wide = document.querySelector(".title-achievements");
    if (!row || !wide) return null;
    const a = row.getBoundingClientRect(); const b = wide.getBoundingClientRect();
    return { row: { x: a.x, w: a.width }, rowY: a.y + a.height, wide: { x: b.x, w: b.width, y: b.y, text: wide.textContent } };
  })()`);
  expect(!!layout, "the title screen has the fourth button");
  if (layout) {
    expect(Math.abs(layout.wide.w - layout.row.w) < 2 && Math.abs(layout.wide.x - layout.row.x) < 2, `it is as wide as the three buttons (${Math.round(layout.wide.w)} px against ${Math.round(layout.row.w)})`);
    expect(layout.wide.y >= layout.rowY, "it stands under them");
    expect(layout.wide.text === "Achievement progress: 12%", `it shows the share that dropped: 3 of 25 (${layout.wide.text})`);
  }
  await page.screenshot({ path: join(outDir, "title.png") });
  expect(await click(".title-achievements"), "the button opens the overview");
  await sleep(600);
  const rows = await evalJs<{ name: string; icon: string; bar: boolean; count: string }[]>(`[...document.querySelectorAll(".ach-row")].map((r) => ({ name: r.querySelector(".ach-name").textContent, icon: r.querySelector(".ach-icon").getAttribute("src"), bar: !!r.querySelector(".ach-bar"), count: r.querySelector(".ach-count")?.textContent ?? "" }))`);
  expect(rows.length === 25, `the overview has 25 rows (${rows.length})`);
  expect(rows.filter((r) => r.bar).length === 4, "four of them have a progress bar");
  const locked = rows.filter((r) => r.icon.endsWith("/lock.webp")).length;
  expect(locked === 22, `22 show the lock, 3 their picture (${locked})`);
  expect(rows.find((r) => r.name === "For the king!")?.icon.endsWith("/king.webp") === true, "an achievement that dropped shows its own picture");
  expect(rows.find((r) => r.name === "Rich like a dragon")?.count === "250,000,000 / 1,000,000,000" || rows.find((r) => r.name === "Rich like a dragon")?.count.startsWith("250") === true, `the gold bar reads ${rows.find((r) => r.name === "Rich like a dragon")?.count}`);
  expect(rows.find((r) => r.name === "Riddle me this!")?.count.endsWith("30 / 30") === true, "a counter that dropped shows a full bar");
  const broken = await evalJs<number>(`(async () => { const imgs = [...document.querySelectorAll(".ach-icon")]; imgs.forEach((i) => { i.loading = "eager"; }); await Promise.all(imgs.map((i) => i.decode().catch(() => null))); return imgs.filter((i) => !i.complete || i.naturalWidth === 0).length; })()`);
  expect(broken === 0, `every picture loads (${broken} broken)`);
  await page.screenshot({ path: join(outDir, "overview.png") });
  await click(".modal-back .btn", "Close");
  await sleep(300);

  // ---- 2. in a game
  await evalJs(`localStorage.setItem(${JSON.stringify(KEY)}, JSON.stringify({ version: 1, unlocked: {}, unseen: [], totals: { gold: 0, artifacts: 0, riddles: 0, dungeons: 0 }, seen: {} }))`);
  await page.goto(`${base}?autostart=1&seed=test`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction("window.__game !== undefined", { timeout: 60000 });
  await sleep(3500);
  await evalJs(`__game.game.achievements.reload()`);
  await evalJs(`__game.game.award("eviction")`);
  await sleep(700);
  const scene = await evalJs<{ text: string; img: string; button: string } | null>(`(() => { const p = document.querySelector(".achievement-scene"); return p ? { text: p.querySelector("p").textContent, img: p.querySelector("img").getAttribute("src"), button: p.querySelector(".btn").textContent } : null; })()`);
  expect(!!scene, "a drop shows the scroll");
  if (scene) {
    expect(scene.text === 'Congratulation, you have unlocked the "Eviction" achievement!', `the text reads as the spec (${scene.text})`);
    expect(scene.img.endsWith("/eviction.webp") && scene.button === "Okay", `the picture and the Okay button (${scene.img}, ${scene.button})`);
  }
  await page.screenshot({ path: join(outDir, "scroll.png") });
  const first = await profile();
  expect(!!first?.unlocked.eviction && first.unseen.includes("eviction"), "the drop is stored at once, as not yet confirmed");
  await click(".achievement-scene .btn", "Okay");
  await sleep(400);
  expect((await profile())?.unseen.length === 0, "confirming takes it off the list of the unconfirmed");
  await evalJs(`__game.game.award("eviction")`);
  await sleep(500);
  expect((await evalJs<number>(`document.querySelectorAll(".achievement-scene").length`)) === 0, "the same achievement does not show again");

  // two at once come one after the other
  await evalJs(`(() => { __game.game.award("dragon"); __game.game.award("sting"); })()`);
  await sleep(700);
  const one = await evalJs<string>(`document.querySelector(".achievement-scene p")?.textContent ?? ""`);
  await click(".achievement-scene .btn", "Okay");
  await sleep(700);
  const two = await evalJs<string>(`document.querySelector(".achievement-scene p")?.textContent ?? ""`);
  expect(one.includes("Where is the princess?") && two.includes("That's gotta sting"), `two drops follow each other (${one.slice(34, 60)} | ${two.slice(34, 60)})`);
  await click(".achievement-scene .btn", "Okay");
  await sleep(300);

  // ---- 3. the ledger
  await evalJs(`(() => { const a = __game.state.party.ach; a.ledger.goldIn += 300000000; a.ledger.artifacts += 5; __game.game.refresh(); __game.game.refresh(); __game.game.achievements.flush(); })()`);
  let p = await profile();
  expect(p?.totals.gold === 300000000 && p.totals.artifacts === 5, `the ledger goes to the counters once (${p?.totals.gold}, ${p?.totals.artifacts})`);
  await evalJs(`(() => { const a = __game.state.party.ach; a.ledger.goldIn = 100; a.ledger.artifacts = 1; __game.game.refresh(); __game.game.achievements.flush(); })()`);
  p = await profile();
  expect(p?.totals.gold === 300000000, "an older ledger (a loaded save) adds nothing");
  await evalJs(`(() => { const a = __game.state.party.ach; a.ledger.goldIn = 700000000; __game.game.refresh(); __game.game.achievements.flush(); })()`);
  p = await profile();
  expect(p?.totals.gold === 700000000 - 0 && !p.unlocked.rich, `only what goes beyond the mark counts (${p?.totals.gold})`);
  await evalJs(`(() => { const a = __game.state.party.ach; a.ledger.goldIn = 1100000000; __game.game.refresh(); __game.game.achievements.flush(); })()`);
  await sleep(700);
  p = await profile();
  expect(!!p?.unlocked.rich, "a billion drops Rich like a dragon");
  await click(".achievement-scene .btn", "Okay");
  await sleep(300);

  // ---- 4. a cheat
  await evalJs(`(() => { __game.game.markCheated(); __game.state.party.characters[0].level = 100; __game.game.refresh(); })()`);
  await sleep(500);
  p = await profile();
  expect(!p?.unlocked.unstoppable, "a game with a debug action earns nothing");
  await page.screenshot({ path: join(outDir, "cheated.png") });
} finally {
  await browser.close();
}
if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):\n${problems.join("\n")}`);
  process.exit(1);
}
console.log("\nachievements: all checks passed");
