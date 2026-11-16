/**
 * Browser check of the bridge of the spaceship (quest document 1.9): the arrival at the tube, the console room with its terminators, the hall, the corridor with the lever and the airlock, the
 * generator room with the temporal field generator and the computer terminal (their texts on the ComputerScreen), the locked door. Also the ruined castle of the user's new texture (the showcase).
 * Needs a dev server (`VITE_FROZEN=1 VITE_PORT=<free port> npx vite --port <free port> --strictPort`).
 *
 * Usage: GAME_URL=http://localhost:<port>/ npx tsx tools/dev/check-bridge.ts <screenshot folder>
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
import { planDungeon } from "../../src/interiors";
import { bridgeFeature } from "../../src/interiors/bridge";
import { World } from "../../src/world/world";

const base = process.env.GAME_URL ?? "http://localhost:5311/";
const outDir = process.argv[2] ?? "bridge-shots";
mkdirSync(outDir, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const problems: string[] = [];

const seed = "ship-a";
const world = new World(seed, "default");
const pyramid = world.allPois().find((p) => planDungeon(world, p)?.klass === "C" && planDungeon(world, p)?.section === 0)!;

const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: ["--window-size=1280,720", "--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-webgl", "--autoplay-policy=no-user-gesture-required"],
  defaultViewport: { width: 1280, height: 720 },
});
try {
  const page = await browser.newPage();
  page.on("pageerror", (e) => problems.push(`[pageerror] ${(e as Error).message}`));
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`[console] ${m.text()}`);
  });
  page.on("response", (r) => {
    if (r.status() >= 400) problems.push(`[http ${r.status()}] ${r.url()}`);
  });
  const evalJs = <T>(code: string) => page.evaluate(code) as Promise<T>;
  const shot = (name: string) => page.screenshot({ path: join(outDir, name) });
  await page.goto(`${base}?autostart=1&seed=${seed}&size=default&outside=1`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction("window.__game !== undefined", { timeout: 60000 });
  await sleep(4000);
  await evalJs(`(async () => { await __game.enter("${pyramid.id}"); })()`);
  await sleep(6000);
  await shot("0-arrival.png");
  // the light of life support, so that the walls can be seen
  await evalJs(`(() => { __game.state.opened.add("ship:life"); __game.game.syncShip(true); return 0; })()`);
  const o = (await evalJs(`(() => { const b = __game.game.interior.map.spaceship.bridge; return { x: b.x, y: b.y }; })()`)) as { x: number; y: number };
  const at = (tx: number, ty: number) => [o.x + tx, o.y + ty] as const;
  const spots: [string, number, number, string][] = [
    ["1-junction-west", 19, 3, "W"],
    ["2-corridor-lever", 19, 2, "N"],
    ["3-airlock", 20, 3, "E"],
    ["4-console-room", 4, 3, "W"],
    ["5-console-room-south", 2, 5, "N"],
    ["6-hall", 8, 3, "N"],
    ["7-corridor-west", 9, 1, "W"],
    ["8-generator-room-west", 12, 5, "W"],
    ["9-generator-room-east", 12, 5, "E"],
    ["10-locked-door-inside", 12, 3, "N"],
    ["11-corridor-automato", 14, 1, "W"],
    ["12-south-corridor", 15, 3, "S"],
  ];
  for (const [name, x, y, facing] of spots) {
    const [wx, wy] = at(x, y);
    await evalJs(`__game.teleport(${wx}, ${wy}, "${facing}")`);
    await sleep(2200);
    await shot(`${name}.png`);
  }
  // the texts: the generator and the terminal show theirs on the ComputerScreen
  for (const thing of ["TG", "TE"] as const) {
    const f = bridgeFeature(thing);
    const [wx, wy] = at(f.x, f.y);
    const [px, py, facing] = thing === "TG" ? [wx + 1, wy, "W"] : [wx - 1, wy, "E"];
    await evalJs(`__game.teleport(${px}, ${py}, "${facing}")`);
    await sleep(1500);
    await evalJs(`(() => { const rt = __game.game.interior; const a = rt.content.actions.find((c) => c.x === ${wx} && c.y === ${wy}); void __game.game.useAction(a); return 0; })()`);
    await sleep(1800);
    await shot(`13-screen-${thing}.png`);
    await page.keyboard.press("Enter");
    await sleep(600);
    await page.keyboard.press("Escape");
    await sleep(400);
  }
  // the locked door: the dialog
  {
    const f = bridgeFeature("CL");
    const [wx, wy] = at(f.x, f.y);
    await evalJs(`__game.teleport(${wx}, ${wy - 1}, "S")`);
    await sleep(1500);
    await evalJs(`(() => { const rt = __game.game.interior; const a = rt.content.actions.find((c) => c.x === ${wx} && c.y === ${wy}); void __game.game.useAction(a); return 0; })()`);
    await sleep(1500);
    await shot("14-locked-door-dialog.png");
  }
  console.log(problems.length ? `PROBLEMS:\n${problems.join("\n")}` : "no browser errors");
} finally {
  await browser.close();
}
