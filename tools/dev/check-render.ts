/**
 * Render checks in the real browser (needs the dev server and Chrome, like check:chrome):
 *  1. Monsters keep their textures when other monsters of the same type are removed. The materials of a monster type are
 *     shared; disposing them with the first dead monster turned all the others white or black.
 *  2. An interior shows its own theme's textures after another interior was visited (the material cache is per theme).
 *  3. Nothing of a campaign map stays in the world when a generated game starts afterwards.
 *
 * Usage: tsx tools/dev/check-render.ts [url]      (default http://localhost:5173/)
 */
import puppeteer from "puppeteer-core";

const base = process.argv[2] ?? "http://localhost:5173/";

const PAGE_CHECKS = `(async () => {
  const g = window.__game;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const problems = [];

  // ---- 1. monsters: spawn every type twice, remove one of each, look at the pixels of the other
  const mons = g.game.internals.monsters;
  g.teleport(60, 40, "N");
  await sleep(1200);
  const cam = g.camera;
  const y = cam.position.y - 1.7;
  for (let id = 1; id <= 91; id++) {
    await mons.add("a:" + id, id, cam.position.x - 3, y, cam.position.z + 9);
    await mons.add("b:" + id, id, cam.position.x + 3, y, cam.position.z + 9);
  }
  for (let id = 1; id <= 91; id++) mons.remove("a:" + id); // a kill or a chunk unload
  await sleep(1500);
  for (let id = 1; id <= 91; id++) {
    const mesh = g.scene.meshes.find((m) => m.name.startsWith("b:" + id + ":") && m.getTotalVertices() > 0);
    const tex = mesh && mesh.material && mesh.material.diffuseTexture;
    if (!tex) { problems.push("monster " + id + " has no material or texture"); continue; }
    const px = await tex.readPixels();
    let r = 0, gr = 0, b = 0, n = 0;
    for (let i = 0; i < px.length; i += 4 * 97) { r += px[i]; gr += px[i + 1]; b += px[i + 2]; n++; }
    const mean = [r / n, gr / n, b / n];
    if (mean.every((v) => v > 245) || mean.every((v) => v < 4)) problems.push("monster " + id + " texture is flat " + mean.map((v) => v.toFixed(0)).join("/"));
  }

  // ---- 2. interiors: dungeon first, then the town; the town must not wear the dungeon's textures
  // entering and leaving put up the loading screen and resolve once the scene can draw everything
  await g.enter(g.firstPoi("dungeon"));
  await sleep(500);
  await g.leave();
  await sleep(500);
  await g.enter("p:0:0:0");
  await sleep(800);
  const rt = g.game.internals.interior;
  const theme = rt.map.theme;
  const mesh = g.scene.meshes.find((m) => m.name.startsWith("interior:") && m.material && m.material.subMaterials);
  const urls = mesh ? mesh.material.subMaterials.map((m) => (m.diffuseTexture ? m.diffuseTexture.url : "")) : [];
  for (const want of [theme.floor, theme.wall]) if (!urls.some((u) => u.includes(want))) problems.push("town lacks its " + want + " texture, has " + urls.join(", "));
  for (const bad of ["tex_dungeon_floor", "tex_dungeon_wall"]) if (urls.some((u) => u.includes(bad))) problems.push("town wears the dungeon texture " + bad);

  // ---- 3. campaign leftovers: after a campaign map, a generated world must not show its mountains, houses and fountains
  await g.game.debugCampaign("outside");
  await sleep(1500);
  await g.game.newGame("test");
  await sleep(500);
  await g.enter("p:0:0:0");
  await sleep(500);
  const props = g.game.internals.props;
  for (const [key, model] of props.models) {
    for (const [owner, buf] of model.buffers) if (buf.length > 0 && owner === "campaign") problems.push("campaign prop " + key + " is still drawn in the generated world");
  }
  return problems;
})();`;

const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: ["--window-size=1280,720", "--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-webgl"],
  defaultViewport: { width: 1280, height: 720 },
});
let failed = false;
try {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push((e as Error).message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(`${base}?seed=test&autostart=1`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction("window.__game !== undefined && window.__game.state !== undefined", { timeout: 60000 });
  await new Promise((r) => setTimeout(r, 2500));
  const problems = (await page.evaluate(PAGE_CHECKS)) as string[];
  for (const p of [...problems, ...errors]) console.log("  FAIL " + p);
  failed = problems.length + errors.length > 0;
  console.log(failed ? "check:render FAILED" : "check:render ok: 91 monster textures intact after removals, town keeps its own textures after a dungeon visit, no campaign leftovers in generated worlds");
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
