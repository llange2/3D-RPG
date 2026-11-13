/**
 * The 57th playtest in the real browser (needs a dev server and Chrome):
 *  - portal: the towns the party knows are listed with the highest level first,
 *  - Super Shelter: wild monsters near the party gather round it without a blow, the party wakes first,
 *  - a save made on deep water puts the party on the same tile again (Seafarer),
 *  - a stored save is packed (`lz1:`), and "Save game" lists it.
 * Usage: GAME_URL=http://localhost:<port>/ npx tsx tools/dev/check-playtest57.ts <screenshot folder> [portal|shelter|water|saves|cave]
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
import { unpackSave } from "../../src/game/saveCodec";

const base = process.env.GAME_URL ?? "http://localhost:5195/";
const outDir = process.argv[2] ?? "playtest57-shots";
const what = process.argv[3] ?? "portal";
const seed = process.env.SEED ?? "pearl-shore-794";
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
  const evalJs = <T>(code: string) => page.evaluate(code) as Promise<T>;
  const shot = (name: string) => page.screenshot({ path: join(outDir, `${what}-${name}.png`) });
  // the cave floor is a 3D tile from "floor" on (Graphics > Environment)
  if (what === "cave") await page.evaluateOnNewDocument((v: string) => localStorage.setItem("mm3-seed-rpg:settings:v1", v), JSON.stringify({ environment: "floor" }));
  await page.goto(`${base}?autostart=1&seed=${seed}&size=default&dungeons=default&outside=1`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction("window.__game !== undefined", { timeout: 60000 });
  await sleep(12000);

  if (what === "portal") {
    const labels = await evalJs<string[]>(`(() => { const g = __game.game; for (const p of g.world.allPois().filter((p) => p.kind === "town")) g.state.opened.add("portal@" + p.id); return g.portalOptions().map((o) => o.label); })()`);
    console.log("portal list:", JSON.stringify(labels));
    const levels = labels.map((l) => Number(/\(L(\d)/.exec(l)?.[1]));
    console.log("highest level first:", levels.every((l, i) => i === 0 || levels[i - 1]! >= l) ? "yes" : "NO");
  }

  if (what === "shelter") {
    // a wild monster within the camp radius, the party level 5 with the spell
    const before = await evalJs<string>(`(() => { const g = __game.game; __game.gotoMonster(6); return JSON.stringify({ party: [g.player.tx, g.player.ty], monsters: g.enc.monsters.map((m) => [m.defId, m.x, m.y]).slice(0, 5) }); })()`);
    console.log("before:", before);
    await sleep(1500);
    const result = await evalJs<string>(`(async () => {
      const g = __game.game; const party = g.state.party;
      const hp = party.characters.map((c) => c.hp);
      const ms = g.enc.monsters.filter((m) => m.hp > 0);
      const near = (m) => Math.max(Math.abs(m.x - g.player.tx), Math.abs(m.y - g.player.ty));
      const dist0 = ms.map(near);
      const again = await g.worldSpell(52, party.characters[0], {}, { kind: "world", spellId: 52 });
      const dist1 = ms.map(near);
      return JSON.stringify({ again, hp0: hp, hp1: party.characters.map((c) => c.hp), health: party.characters.map((c) => c.health), dist0, dist1, battle: g.enc.battleMode });
    })()`);
    console.log("shelter:", result);
    await shot("after");
  }

  if (what === "water") {
    // a deep-water tile near the start, the Seafarer talent, a save and the way into the game again (`beginPlay`, what a load does): the party must stand on the same tile
    const out = await evalJs<string>(`(async () => {
      const g = __game.game; const w = g.world; const p = g.state.party;
      p.talents.push("talent_seafarer");
      let spot = null;
      for (let r = 2; r < 60 && !spot; r++) for (let dx = -r; dx <= r && !spot; dx++) for (const dy of [-r, r]) {
        const x = g.player.tx + dx, y = g.player.ty + dy; const t = w.tile(x, y);
        if (t.deco === 0 && t.ground === 1) { spot = [x, y]; break; }
      }
      if (!spot) return "no deep water found";
      await __game.teleport(spot[0], spot[1], "N");
      g.save("quick");
      const saved = [g.player.tx, g.player.ty];
      g.prepareSave();
      await g.beginPlay();
      return JSON.stringify({ saved, after: [g.player.tx, g.player.ty], same: saved[0] === g.player.tx && saved[1] === g.player.ty, ground: w.tile(g.player.tx, g.player.ty).ground });
    })()`);
    console.log("water:", out);
    await shot("after");
  }

  if (what === "cave") {
    // the turns of the dirt tiles of the cave floor (the matrices of the instances: the quarter turn is in the first column)
    const id = await evalJs<string>(`__game.game.world.allPois().find((p) => p.kind === "cave").id`);
    await evalJs(`(async () => { await __game.enter(${JSON.stringify(id)}); })()`);
    await sleep(8000);
    const turns = await evalJs<string>(`(() => {
      const props = __game.game.internals.props; const model = props.models.get("gndx_dirt");
      if (!model) return "no gndx_dirt model loaded";
      const count = { "0": 0, "90": 0, "180": 0, "270": 0, other: 0 };
      for (const [owner, buf] of model.buffers) {
        if (!String(owner).endsWith(":floor")) continue;
        for (let i = 0; i < buf.length; i += 16) {
          const c = buf[i], s = buf[i + 2];
          const n = Math.hypot(c, s) || 1; const cos = c / n, sin = s / n;
          const key = Math.abs(cos - 1) < 0.01 ? "0" : Math.abs(cos + 1) < 0.01 ? "180" : Math.abs(sin - 1) < 0.01 ? "90" : Math.abs(sin + 1) < 0.01 ? "270" : "other";
          count[key]++;
        }
      }
      return JSON.stringify(count);
    })()`);
    console.log("dirt tile turns:", turns);
    await shot("floor");
  }

  if (what === "repack") {
    // a save of the old format (plain JSON) in a slot and as a named save, a reload, and what start-up has made of them
    await evalJs(`(() => { const g = __game.game; g.save("quick"); g.saveNamed("old one"); })()`);
    const keys = await evalJs<string[]>(`Object.keys(localStorage).filter((k) => k.includes("save") || k.includes("quick"))`);
    for (const key of keys) {
      const raw = await evalJs<string>(`localStorage.getItem(${JSON.stringify(key)})`);
      if (raw.startsWith("lz1:")) await page.evaluate((k: string, v: string) => localStorage.setItem(k, v), key, unpackSave(raw));
    }
    const plain = await evalJs<string>(`JSON.stringify(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k).startsWith("{")]))`);
    console.log("before reload (key, plain):", plain);
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction("window.__game !== undefined", { timeout: 60000 });
    await sleep(3000);
    const after = await evalJs<string>(`JSON.stringify(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k).slice(0, 4), localStorage.getItem(k).length]))`);
    console.log("after reload (key, start, length):", after);
  }

  if (what === "saves") {
    const out = await evalJs<string>(`(() => {
      const g = __game.game;
      g.save("quick");
      const quick = localStorage.getItem("mm3-seed-rpg:quicksave:v1");
      return JSON.stringify({ packed: quick.startsWith("lz1:"), chars: quick.length });
    })()`);
    console.log("saves:", out);
  }
  console.log("problems:", problems.length ? problems.join("\n") : "none");
} finally {
  await browser.close();
}
