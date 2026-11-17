/**
 * What the effects cost per frame (the open points of the effects plan): the debug showcase is a hall in which every glowing object stands, so many lamps are in reach at once, and
 * the glow (bloom) can be switched on top. The game's own render loop is stopped and the frames are rendered by hand (`scene.render()` and a `finish()` so that the GPU is counted); the setups are
 * measured in turns (five rounds of 40 frames each, the median of the rounds), so that a slow moment of the machine hits all of them alike. The CPU time of `Effects.update` is measured alone.
 * Setups: effects off / low / full, with and without bloom, in the hall, in the hall with 250 torches in reach (the worst case: the batches of 420 quads are full), and in the open land.
 * Needs a dev server (`VITE_FROZEN=1 VITE_PORT=<free port> npx vite --port <free port> --strictPort`).
 *
 * Usage: GAME_URL=http://localhost:<port>/ npx tsx tools/dev/check-fx-cost.ts [seed]
 */
import puppeteer from "puppeteer-core";

const base = process.env.GAME_URL ?? "http://localhost:5191/";
const [seed = "birch-reach-493"] = process.argv.slice(2);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Setup {
  label: string;
  level: string;
  bloom: boolean;
  /** How many fake torches are in reach (0: the lamps the scene has). */
  torches: number;
}

const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  protocolTimeout: 900000,
  args: ["--window-size=1280,720", "--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-webgl"],
  defaultViewport: { width: 1280, height: 720 },
});

/** Measures the setups in turns in the scene the party is in now. */
async function run(page: import("puppeteer-core").Page, setups: Setup[]): Promise<void> {
  const rows = JSON.parse(
    (await page.evaluate(`(() => {
      const setups = ${JSON.stringify(setups)};
      const g = __game.game.internals;
      const scene = __game.scene;
      scene.getEngine().stopRenderLoop();
      const gl = scene.getEngine()._gl;
      const cam = scene.activeCamera.globalPosition;
      let seed = 7;
      const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      const torches = Array.from({ length: 250 }, (_, i) => ({ key: "stress:" + i, x: cam.x + (rnd() - 0.5) * 36, y: 0.5 + rnd() * 3, z: cam.z + 2 + rnd() * 28, color: [1, 0.6, 0.3], range: 8, fx: "torch" }));
      const frame = (s) => { if (s.torches > 0) g.effects.setLamps(torches.slice(0, s.torches), 0); g.effects.update(0.016); scene.render(); };
      const apply = (s) => { g.effects.setLevel(s.level); g.r.setBloom(s.bloom); };
      const times = setups.map(() => []);
      for (let round = 0; round < 5; round++) {
        setups.forEach((s, i) => {
          apply(s);
          for (let k = 0; k < 15; k++) frame(s);
          gl.finish();
          const t0 = performance.now();
          for (let k = 0; k < 40; k++) frame(s);
          gl.finish();
          times[i].push((performance.now() - t0) / 40);
        });
      }
      const out = setups.map((s, i) => {
        apply(s);
        if (s.torches > 0) g.effects.setLamps(torches.slice(0, s.torches), 0);
        const t = times[i].sort((a, b) => a - b);
        const c0 = performance.now();
        for (let k = 0; k < 300; k++) { if (s.torches > 0) g.effects.setLamps(torches.slice(0, s.torches), 0); g.effects.update(0.016); }
        const cpu = (performance.now() - c0) / 300;
        return { median: t[2], best: t[0], cpu, particles: g.effects.particles.length };
      });
      g.effects.setLamps([], 0);
      return JSON.stringify(out);
    })()`)) as string,
  ) as { median: number; best: number; cpu: number; particles: number }[];
  setups.forEach((s, i) => {
    const r = rows[i]!;
    console.log(`${s.label.padEnd(36)} frame ${r.median.toFixed(2)} ms (best ${r.best.toFixed(2)})   effects.update ${r.cpu.toFixed(3)} ms   particles ${r.particles}`);
  });
}

try {
  const page = await browser.newPage();
  await page.goto(`${base}?autostart=1&seed=${seed}&size=default&dungeons=default&outside=1`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction("window.__game !== undefined", { timeout: 60000 });
  await sleep(5000);
  await page.evaluate(`(async () => { await __game.enter("showcase"); })()`);
  await sleep(7000);
  // the spot of the hall with the most glowing objects around it
  const spot = JSON.parse(
    (await page.evaluate(`(() => {
      const items = __game.game.internals.interior.map.showcase.items.filter((i) => [117, 120, 92, 121, 3, 71, 4, 86, 67, 76].includes(i.item));
      let best = null;
      for (const c of items) {
        const n = items.filter((o) => Math.hypot(o.x - c.x, o.y - c.y) < 6).length;
        if (!best || n > best.n) best = { x: c.x, y: c.y + 2, n };
      }
      return JSON.stringify(best);
    })()`)) as string,
  ) as { x: number; y: number; n: number } | null;
  if (spot) {
    console.log("showcase hall, glowing objects within 6 cells:", spot.n);
    await page.evaluate(`__game.teleport(${spot.x}, ${spot.y}, "N")`);
    await sleep(3000);
  }
  await run(page, [
    { label: "hall: effects off", level: "off", bloom: false, torches: 0 },
    { label: "hall: effects full", level: "full", bloom: false, torches: 0 },
    { label: "hall: off + bloom", level: "off", bloom: true, torches: 0 },
    { label: "hall: full + bloom", level: "full", bloom: true, torches: 0 },
    { label: "250 torches: effects off", level: "off", bloom: false, torches: 250 },
    { label: "250 torches: effects low", level: "low", bloom: false, torches: 250 },
    { label: "250 torches: effects full", level: "full", bloom: false, torches: 250 },
    { label: "250 torches: full + bloom", level: "full", bloom: true, torches: 250 },
  ]);
  await page.evaluate(`(async () => { await __game.leave(); })()`);
  await sleep(3500);
  await run(page, [
    { label: "overworld: effects off", level: "off", bloom: false, torches: 0 },
    { label: "overworld: effects full", level: "full", bloom: false, torches: 0 },
    { label: "overworld: off + bloom", level: "off", bloom: true, torches: 0 },
    { label: "overworld: full + bloom", level: "full", bloom: true, torches: 0 },
  ]);
} finally {
  await browser.close();
}
