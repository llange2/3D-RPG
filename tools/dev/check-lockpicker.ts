/**
 * Checks the warning of the book of heroes in the real browser (needs the dev server and Chrome, like check:render):
 *  1. A party with a ninja leaves the book (button and Esc) without being asked.
 *  2. Without a thief or ninja the button asks first; "Back" keeps the book open, Esc on the question is "Back" too, "Accept" closes it.
 *  3. Esc on the book asks the same question.
 *
 * Usage: tsx tools/dev/check-lockpicker.ts <outDir> [url]      (default url http://localhost:5173/)
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const outDir = process.argv[2];
if (!outDir) throw new Error("usage: tsx tools/dev/check-lockpicker.ts <outDir> [url]");
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
const expect = (ok: boolean, what: string) => {
  if (!ok) problems.push(what);
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
};
try {
  const page = await browser.newPage();
  page.on("pageerror", (e) => problems.push(`[pageerror] ${(e as Error).message}`));
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`[console] ${m.text()}`);
  });
  await page.goto(`${base}?autostart=1&seed=test`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction("window.__game !== undefined", { timeout: 60000 });
  await sleep(3000);

  const evalJs = <T>(code: string) => page.evaluate(code) as Promise<T>;
  const click = (selector: string, text?: string) =>
    evalJs<boolean>(`(() => {
      const els = [...document.querySelectorAll(${JSON.stringify(selector)})].filter((e) => !${JSON.stringify(text ?? "")} || e.textContent.includes(${JSON.stringify(text ?? "")}));
      if (!els[0]) return false;
      els[0].click();
      return true;
    })()`);
  const present = (selector: string, text?: string) =>
    evalJs<boolean>(`[...document.querySelectorAll(${JSON.stringify(selector)})].some((e) => !${JSON.stringify(text ?? "")} || e.textContent.includes(${JSON.stringify(text ?? "")}))`);
  const bookOpen = () => present(".roster");
  const asking = () => present(".parchment p", "without a Thief/Ninja");
  const classes = () => evalJs<string[]>(`__game.state.party.characters.map((c) => c.classType)`);

  await evalJs(`(async () => { await __game.enter("p:0:0:0"); })()`);
  await sleep(2500);
  const openBook = async () => {
    await evalJs(`__game.goto("service", "inn")`);
    await sleep(500);
    await page.keyboard.press("w");
    await sleep(1200);
    expect(await click(".service .btn", "book of heroes"), "the inn offers the book of heroes");
    await sleep(500);
  };

  // ---- 1. a party with a ninja
  console.log("party:", (await classes()).join(", "));
  await openBook();
  expect(await bookOpen(), "the book is open");
  await click(".panel .close");
  await sleep(400);
  expect(!(await asking()) && !(await bookOpen()), "a party with a ninja closes the book without a question");

  // ---- 2. send the ninja away: the barbarian of the inn takes the place
  await openBook();
  await click(".roster .member:nth-of-type(2) .btn", "Send away");
  await sleep(300);
  await click(".parchment .btn", "Send away");
  await sleep(500);
  console.log("party:", (await classes()).join(", "));
  expect(!(await classes()).some((c) => c === "Ninja" || c === "Thief"), "the party has neither thief nor ninja now");
  await click(".panel .close");
  await sleep(400);
  expect(await asking(), "the button asks about the missing thief or ninja");
  await page.screenshot({ path: join(outDir, "lockpicker-ask.png") });
  await click(".parchment .btn", "Back");
  await sleep(300);
  expect((await bookOpen()) && !(await asking()), "Back keeps the book open");

  // ---- 3. Esc asks the same; Esc on the question is Back; Accept closes the book
  await page.keyboard.press("Escape");
  await sleep(400);
  expect((await asking()) && (await bookOpen()), "Esc on the book asks the same question");
  await page.keyboard.press("Escape");
  await sleep(400);
  expect((await bookOpen()) && !(await asking()), "Esc on the question is Back");
  await click(".panel .close");
  await sleep(300);
  await click(".parchment .btn", "Accept");
  await sleep(500);
  expect(!(await bookOpen()) && !(await asking()), "Accept closes the book");
} catch (e) {
  problems.push(`[script] ${(e as Error).message}`);
} finally {
  await browser.close();
}
if (problems.length > 0) {
  console.log("\nPROBLEMS:\n" + problems.join("\n"));
  process.exit(1);
}
console.log("\nOK");
