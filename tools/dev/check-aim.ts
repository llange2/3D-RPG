/**
 * Measures where a shot at a monster lands (`MonsterRenderer.anchor`) against the body that is drawn: in the debug showcase every monster of the table stands on its own cell; for each view the
 * height of the anchor over the feet is compared with the height of the drawn meshes (without the weapon and shield held in the hands). Prints the monsters whose anchor is not in the middle third.
 * Needs a dev server (`VITE_FROZEN=1 VITE_PORT=<free port> npx vite --port <free port> --strictPort`).
 *
 * Usage: GAME_URL=http://localhost:<port>/ npx tsx tools/dev/check-aim.ts [seed] [all]
 */
import puppeteer from "puppeteer-core";

const base = process.env.GAME_URL ?? "http://localhost:5191/";
const [seed = "birch-reach-493", what = "bad"] = process.argv.slice(2);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  protocolTimeout: 240000,
  args: ["--window-size=1280,720", "--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-webgl"],
  defaultViewport: { width: 1280, height: 720 },
});
try {
  const page = await browser.newPage();
  await page.goto(`${base}?autostart=1&seed=${seed}&size=default&dungeons=default&outside=1`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction("window.__game !== undefined", { timeout: 60000 });
  await sleep(5000);
  await page.evaluate(`(async () => { await __game.enter("showcase"); })()`);
  await sleep(8000);
  const rows = JSON.parse(
    (await page.evaluate(`(() => {
      const mr = __game.game.internals.monsters;
      const out = [];
      for (const v of mr.views.values()) {
        // only the body: the meshes under the holder that are not held items (their names carry ":right:" or ":left:")
        let lo = Infinity, hi = -Infinity;
        for (const m of v.holder.getChildMeshes(false)) {
          if (!m.isEnabled() || !m.getTotalVertices || m.getTotalVertices() === 0 || /:(right|left):/.test(m.name)) continue;
          m.computeWorldMatrix(true);
          const b = m.getBoundingInfo().boundingBox;
          lo = Math.min(lo, b.minimumWorld.y);
          hi = Math.max(hi, b.maximumWorld.y);
        }
        const a = mr.anchor(v.uid);
        if (!a || !isFinite(lo)) continue;
        out.push({ defId: v.defId, name: (__game.game.internals.enc.monsters.find((m) => m.uid === v.uid) || {}).name, animated: v.animated, hovers: v.hovers, feet: lo, top: hi, anchor: a.y, bounds: v.info.bounds, scale: v.holder.scaling.y, originY: v.holder.position.y });
      }
      return JSON.stringify(out);
    })()`)) as string,
  ) as { defId: number; name?: string; animated: boolean; hovers: boolean; feet: number; top: number; anchor: number; bounds: number[]; scale: number; originY: number }[];
  let bad = 0;
  for (const r of rows.sort((a, b) => a.defId - b.defId)) {
    const share = (r.anchor - r.feet) / Math.max(0.001, r.top - r.feet);
    const off = share < 0.35 || share > 0.65;
    if (off) bad++;
    if (what === "all" || off) console.log(`${String(r.defId).padStart(4)} ${(r.name ?? "").padEnd(22)} ${r.animated ? "anim  " : "static"} ${r.hovers ? "hover" : "     "} height ${(r.top - r.feet).toFixed(2)} anchor at ${(share * 100).toFixed(0)} % (${r.anchor.toFixed(2)} over ${r.feet.toFixed(2)}) scale ${r.scale.toFixed(2)}`);
  }
  console.log(`${rows.length} monsters measured, ${bad} with the anchor outside the middle third`);
} finally {
  await browser.close();
}
