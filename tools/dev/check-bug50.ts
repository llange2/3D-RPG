/**
 * The Light spell the first time it is cast (bug_fix_50): at night in the overworld, the party's light before and after, and the picture.
 * Usage: GAME_URL=http://localhost:<port>/ npx tsx tools/dev/check-bug50.ts <screenshot folder> [night|day] [seed]
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const base = process.env.GAME_URL ?? "http://localhost:5191/";
const outDir = process.argv[2] ?? "bug50-shots";
const when = process.argv[3] ?? "night";
const seed = process.argv[4] ?? "cedar-peak-198";
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
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warn") problems.push(`[console ${m.type()}] ${m.text().slice(0, 300)}`);
  });
  const evalJs = <T>(code: string) => page.evaluate(code) as Promise<T>;
  const shot = (name: string) => page.screenshot({ path: join(outDir, `light-${when}-${name}.png`) });
  await page.goto(`${base}?autostart=1&seed=${seed}&size=default&outside=1`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction("window.__game !== undefined", { timeout: 60000 });
  await sleep(14000);
  const minutes = when === "night" ? 24 * 60 + 23 * 60 : 24 * 60 + 12 * 60;
  if (when === "dungeon" || when === "town" || when === "cave") {
    // into a place of that kind before the spell
    const id = await evalJs<string>(`__game.game.world.allPois().find((p) => p.kind === ${JSON.stringify(when)}).id`);
    console.log("entering", id);
    await evalJs(`(async () => { await __game.enter(${JSON.stringify(id)}); })()`);
    await sleep(6000);
  } else {
    await evalJs(`(() => { const p = __game.state.party; p.minutes = ${minutes}; __game.game.refresh(); })()`);
    await sleep(2500);
  }
  const state = () => evalJs<string>(`(() => { const r = __game.game.r; const p = __game.state.party; return JSON.stringify({ torch: +r.torch.intensity.toFixed(2), range: r.torch.range, effects: p.effects.map((e) => e.kind), lampsOn: r.lamps.map((l) => l.isEnabled()) }); })()`);
  if (when === "tip") {
    // the mouse-over of the cast-last plate in "Who casts?": before any cast (Light) and after one, its text must be name, cost and description both times
    const hover = async (name: string) => {
      await page.keyboard.press("f");
      await sleep(1200);
      const plate = await page.$(".caster-spell");
      const box = plate ? await plate.boundingBox() : null;
      if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await sleep(600);
      console.log(`${name}:`, await evalJs<string>(`JSON.stringify({ title: document.querySelector(".caster-spell")?.getAttribute("title") ?? null, tip: document.querySelector(".spell-tip")?.textContent ?? null })`));
      await shot(name);
    };
    await hover("tip-before");
    // cast Light with the first hero (the plate itself repeats the spell cast last: click it)
    await evalJs(`(() => { document.querySelector(".caster-spell")?.click(); })()`);
    await sleep(2500);
    await hover("tip-after");
    await browser.close();
    process.exit(0);
  }
  if (when === "first" || when === "firstnight") {
    // the first spell of a game: a fireball of 1 s flies from the muzzle seven tiles out; every frame's time and the strongest light of the pool are recorded
    if (when === "firstnight") await evalJs(`(() => { const p = __game.state.party; p.minutes = ${24 * 60 + 23 * 60}; __game.game.refresh(); })()`);
    await sleep(2000);
    // a scene without any lamp: the pool's lights are off until the first spell flies
    await evalJs(`(() => { const g = __game.game; g.lamps = []; g.lootLamps = []; g.mascotLamps = []; g.towerLamps = []; g.glowMonsters = false; g.spellLights = false; g.lampSlots = []; g.enableLampLights(); })()`);
    await sleep(1500);
    console.log("lamps on before:", await evalJs<string>(`JSON.stringify(__game.game.r.lamps.map((l) => l.isEnabled()))`), "spellLights:", await evalJs<string>(`String(__game.game.spellLights)`));
    if (process.env.SEQUENCE) {
      await shot("seq-0-before");
      await evalJs(`(() => { const g = __game.game; const m = g.muzzle(); const yaw = __game.camera.rotation.y; g.projectiles.launch("fire", m, { x: m.x + Math.sin(yaw) * 21, y: m.y, z: m.z + Math.cos(yaw) * 21 }, 1, 1.6); })()`);
      for (let i = 1; i <= 4; i++) {
        await sleep(150);
        await shot(`seq-${i}`);
      }
      await sleep(2500);
      console.log("after the flight, strongest lamp:", await evalJs<string>(`String(Math.max(...__game.game.r.lamps.map((l) => l.intensity)))`));
      await shot("seq-5-after");
      await browser.close();
      process.exit(0);
    }
    const frames = await evalJs<string>(`(async () => {
      const g = __game.game; const out = []; let last = performance.now(); const m = g.muzzle(); const yaw = __game.camera.rotation.y;
      g.projectiles.launch("fire", m, { x: m.x + Math.sin(yaw) * 21, y: m.y, z: m.z + Math.cos(yaw) * 21 }, 1, 1.0);
      const t0 = performance.now();
      await new Promise((done) => { const tick = () => { const now = performance.now(); out.push([Math.round(now - t0), Math.round(now - last), +Math.max(...g.r.lamps.map((l) => l.intensity)).toFixed(2)]); last = now; if (now - t0 < 1800) requestAnimationFrame(tick); else done(); }; requestAnimationFrame(tick); });
      return JSON.stringify(out);
    })()`);
    console.log("frames [ms since launch, frame time, strongest lamp]:", frames);
    await shot("first");
    await browser.close();
    process.exit(0);
  }
  console.log("before:", await state());
  await shot("0-before");
  // Spells (F), the first hero who can cast, the spell called Light
  await page.keyboard.press("f");
  await sleep(1000);
  await evalJs(`(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent === "Select"); if (b) b.click(); })()`);
  await sleep(1000);
  const slots = await evalJs<string>(`JSON.stringify([...document.querySelectorAll(".spell-slot")].map((s) => s.getAttribute("aria-label")))`);
  console.log("slots:", slots);
  await evalJs(`(() => { const s = [...document.querySelectorAll(".spell-slot")].find((x) => (x.getAttribute("aria-label") || "").startsWith("Light")); if (s) s.click(); })()`);
  for (const [i, t] of [300, 700, 1500].entries()) {
    await sleep(t);
    console.log(`after ${i}:`, await state());
    await shot(`${i + 1}-after`);
  }
  if (problems.length > 0) console.log(problems.filter((p) => !p.includes("403") && !p.includes("Failed to load")).slice(0, 10).join("\n"));
} finally {
  await browser.close();
}
