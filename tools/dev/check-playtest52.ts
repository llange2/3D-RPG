/**
 * Browser checks of the 52nd playtest (needs a dev server, `VITE_FROZEN=1 VITE_PORT=<free port> npx vite --port <free port> --strictPort`):
 *   lights   a spell's light along the whole flight, at night and by day (points 2 and 3)
 *   archer   the Archer's shot, turned to the party and with the bow in the hand (points 1 and 6)
 *   pirate   the pirate ship's move between two tiles (point 7)
 *   map      the time to zoom the minimap out on a huge world (point 8)
 *
 * Usage: GAME_URL=http://localhost:<port>/ npx tsx tools/dev/check-playtest52.ts <screenshot folder> <lights|archer|pirate|map> [args]
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const base = process.env.GAME_URL ?? "http://localhost:5190/";
const outDir = process.argv[2] ?? "playtest52-shots";
const part = process.argv[3] ?? "lights";
const arg = process.argv[4] ?? "";
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
  page.on("response", (r) => {
    if (r.status() >= 400) problems.push(`[http ${r.status()}] ${r.url()}`);
  });
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warn") problems.push(`[console ${m.type()}] ${m.text().slice(0, 300)}`);
  });
  const evalJs = <T>(code: string) => page.evaluate(code) as Promise<T>;
  const shot = (name: string) => page.screenshot({ path: join(outDir, `${part}-${name}.png`) });
  const open = async (seed: string, size = "default", outside = true) => {
    await page.goto(`${base}?autostart=1&seed=${seed}&size=${size}${outside ? "&outside=1" : ""}`, { waitUntil: "load", timeout: 60000 });
    await page.waitForFunction("window.__game !== undefined", { timeout: 60000 });
    await sleep(14000);
  };

  if (part === "lights") {
    await open("cedar-peak-198");
    if (arg) await evalJs(`(() => { const p = __game.game.player; __game.teleport(p.tx, p.ty, ${JSON.stringify(arg)}); })()`);
    await sleep(1500);
    for (const [label, minutes] of [["night", 24 * 60 + 23 * 60], ["day", 24 * 60 + 12 * 60]] as [string, number][]) {
      await evalJs(`(() => { const p = __game.state.party; p.minutes = ${minutes}; __game.game.refresh(); })()`);
      await sleep(1500);
      // a slow flight from the muzzle seven tiles out (21 units), the way the party's spell leaves: shot at four moments of it
      await evalJs(`(() => { const g = __game.game; const m = g.muzzle(); const yaw = __game.camera.rotation.y; g.projectiles.launch("fire", m, { x: m.x + Math.sin(yaw) * 21, y: m.y, z: m.z + Math.cos(yaw) * 21 }, 1, 12); })()`);
      let i = 0;
      for (const t of [150, 1400, 1400, 1400, 1400, 1400, 1400]) {
        await sleep(t);
        await shot(`${label}-${i++}`);
      }
      await sleep(1500);
    }
  }
  if (part === "archer") {
    // an Archer (monster 1) a few tiles in front of the party, once idle and then through its shot: where it aims (the party is at the camera) and whether the bow is in its hand
    await open("cedar-peak-198");
    const dist = Number(arg) || 8;
    await evalJs(`(async () => { const g = __game.game; const p = g.player; const yaw = __game.camera.rotation.y; await g.monsters.add("t:archer", 1, p.x + Math.sin(yaw) * ${dist}, 0, p.z + Math.cos(yaw) * ${dist}); })()`);
    await sleep(1500);
    await shot("idle");
    await evalJs(`__game.game.monsters.attack("t:archer")`);
    console.log(await evalJs<string>(`(() => { const v = __game.game.monsters.views.get("t:archer"); return JSON.stringify({ groups: v.groups.map((g) => [g.name, g.isPlaying, g.from, g.to]), bow: v.bow.length, turn: v.attackTurn, until: v.attackUntil, rot: v.holder.rotation.y }); })()`));
    // the clip held still at some frames of its 62 (the game cuts it after 1.1 s), so that the pose and the bow can be looked at
    for (const f of [8, 20, 32, 44, 56]) {
      await evalJs(`(() => { const v = __game.game.monsters.views.get("t:archer"); v.attackUntil = 1e9; const g = v.groups.find((x) => x.name.includes("Archery")); g.pause(); g.goToFrame(${f}); })()`);
      await sleep(900);
      await shot(`shot-f${f}`);
      await page.screenshot({ path: join(outDir, `archer-zoom-f${f}.png`), clip: { x: 440, y: 260, width: 400, height: 330, scale: 1.6 } as never });
      // the aim: from the hand that draws (right) to the hand that holds the bow (left), seen from above, against the way from the Archer to the party; degrees, 0 = at the party
      // the true belly: from the middle of the string to the back of the arc, in the world, from the mesh's own vertices (not from an axis of its matrix)
      console.log("belly:", await evalJs<string>(`(() => { const v = __game.game.monsters.views.get("t:archer"); const bow = v.bow[0]; const P = bow.getVerticesData("position"); const V = bow.position.constructor; const M = bow.getWorldMatrix();
        let mn = 1e9, mx = -1e9; for (let i = 0; i < P.length; i += 3) { if (Math.abs(P[i + 1]) < 0.06) { mn = Math.min(mn, P[i]); mx = Math.max(mx, P[i]); } }
        const w = (x) => V.TransformCoordinates(new V(x, 0, 0), M); const a = w(mn); const b = w(mx); const c = __game.camera.position; const h = v.holder.position;
        const belly = Math.atan2(b.x - a.x, b.z - a.z); const to = Math.atan2(c.x - h.x, c.z - h.z); let d = ((belly - to) * 180) / Math.PI; d = ((d + 540) % 360) - 180;
        return JSON.stringify({ localX: [+mn.toFixed(2), +mx.toFixed(2)], bellyOffCamera: +d.toFixed(0) }); })()`));
      console.log("positions:", await evalJs<string>(`(() => { const v = __game.game.monsters.views.get("t:archer"); const c = __game.camera; const m = v.bow[0].getWorldMatrix().m; return JSON.stringify({ archer: [v.holder.position.x, v.holder.position.z].map((n) => +n.toFixed(2)), camera: [c.position.x, c.position.z].map((n) => +n.toFixed(2)), camYaw: +c.rotation.y.toFixed(2), holderYaw: +v.holder.rotation.y.toFixed(2), bowX: [m[0], m[1], m[2]].map((n) => +n.toFixed(1)), bowY: [m[4], m[5], m[6]].map((n) => +n.toFixed(1)) }); })()`));
      for (const turn of [null, 0]) {
        if (turn !== null) {
          await evalJs(`(() => { const v = __game.game.monsters.views.get("t:archer"); v.attackTurn = ${turn}; })()`);
          await sleep(500);
        }
        console.log(`frame ${f} turn ${turn ?? "as built"}:`, await evalJs<string>(`(() => { const v = __game.game.monsters.views.get("t:archer"); const hand = (n) => v.holder.getDescendants(false, (x) => x.name === "t:archer:" + n)[0].getAbsolutePosition();
          const l = hand("LeftHand"); const r = hand("RightHand"); const c = __game.camera.position; const h = v.holder.position;
          const bm = v.bow[0].getWorldMatrix().m; const aim = Math.atan2(bm[0], bm[2]) + 0 * Math.atan2(l.x - r.x, l.z - r.z); const to = Math.atan2(c.x - h.x, c.z - h.z); let d = ((aim - to) * 180) / Math.PI; d = ((d + 540) % 360) - 180; return d.toFixed(0) + " (turned " + ((v.turned * 180) / Math.PI).toFixed(0) + ")"; })()`));
        if (turn === 0) await evalJs(`(() => { const v = __game.game.monsters.views.get("t:archer"); v.attackTurn = (120 * Math.PI) / 180; })()`);
      }
      await sleep(500);
    }
    // the clip ends: back to the idle pose without the bow, and the turn goes back
    console.log("bow while shooting:", await evalJs<string>(`String(__game.game.monsters.views.get("t:archer").bow[0].isEnabled())`));
    await evalJs(`(() => { const m = __game.game.monsters; const v = m.views.get("t:archer"); v.attackUntil = 0; m.playIdle(v); })()`);
    await sleep(1500);
    console.log("bow after the shot:", await evalJs<string>(`String(__game.game.monsters.views.get("t:archer").bow[0].isEnabled())`), "turn:", await evalJs<string>(`__game.game.monsters.views.get("t:archer").turned.toFixed(2)`));
    await shot("after");
  }
  if (part === "bowfit") {
    // finds how the bow has to sit in the Archer's left hand (GRIP_TWEAK of `wpn_bow`): at the frames of the draw the bow should stand upright with its belly along the arm (from the hand that draws
    // to the hand that holds it) and its grip in the palm. Tries every turn in steps of 45 degrees about the joint's axes (the way `handTransform` applies a tweak) and prints the best, with the shift.
    await open("cedar-peak-198");
    await evalJs(`(async () => { const g = __game.game; const p = g.player; const yaw = __game.camera.rotation.y; await g.monsters.add("t:archer", 1, p.x + Math.sin(yaw) * 4.5, 0, p.z + Math.cos(yaw) * 4.5); })()`);
    await sleep(1500);
    await evalJs(`__game.game.monsters.attack("t:archer")`);
    for (const f of [30, 38, 44, 50, 56]) {
      await evalJs(`(() => { const v = __game.game.monsters.views.get("t:archer"); v.attackUntil = 1e9; const g = v.groups.find((x) => x.name.includes("Archery")); g.pause(); g.goToFrame(${f}); })()`);
      await sleep(700);
      const report = await evalJs<string>(`(() => {
        const v = __game.game.monsters.views.get("t:archer"); const bow = v.bow[0];
        const Q = bow.rotationQuaternion.constructor; const V = bow.position.constructor;
        const find = (n) => v.holder.getDescendants(false, (x) => x.name === "t:archer:" + n)[0];
        const lp = find("LeftHand").getAbsolutePosition(); const rp = find("RightHand").getAbsolutePosition();
        let a = [lp.x - rp.x, 0, lp.z - rp.z]; const al = Math.hypot(...a); a = a.map((x) => x / al);
        const base = bow.rotationQuaternion.clone(); const basePos = bow.position.clone();
        const rad = (d) => (d * Math.PI) / 180;
        let best = null;
        for (let tx = 0; tx < 360; tx += 45) for (let ty = 0; ty < 360; ty += 45) for (let tz = 0; tz < 360; tz += 45) {
          const cand = Q.RotationAxis(new V(1, 0, 0), rad(tx)).multiply(Q.RotationAxis(new V(0, 1, 0), rad(ty))).multiply(Q.RotationAxis(new V(0, 0, 1), rad(tz))).multiply(base);
          bow.rotationQuaternion = cand; bow.computeWorldMatrix(true);
          const m = bow.getWorldMatrix().m; const nx = Math.hypot(m[0], m[1], m[2]); const ny = Math.hypot(m[4], m[5], m[6]);
          const score = m[5] / ny + (m[0] * a[0] + m[2] * a[2]) / nx;
          if (!best || score > best.score) best = { score, tx, ty, tz, cand: cand.clone() };
        }
        bow.rotationQuaternion = base; bow.computeWorldMatrix(true);
        // the grip (0.5 along the belly, in item units, scaled by the fit's 40) into the middle of the palm (0, 6, 0)
        const handle = new V(0.5 * 40, 0, 0).applyRotationQuaternion(best.cand);
        const pos = new V(0, 6, 0).subtract(handle); const shift = pos.subtract(basePos);
        return JSON.stringify({ frame: ${f}, turn: [best.tx, best.ty, best.tz], score: +best.score.toFixed(2), shift: [shift.x, shift.y, shift.z].map((n) => +n.toFixed(1)), basePos: [basePos.x, basePos.y, basePos.z].map((n) => +n.toFixed(1)) });
      })()`);
      console.log(report);
    }
  }
  if (part === "map") {
    // the big map of a huge world, everything seen: the time of every step of the wheel from 25 cells across to the whole world, and the pictures of a few of them
    await open("cedar-peak-198", arg || "huge");
    await evalJs(`(() => { const g = __game; const w = g.game.world; g.state.party.talents.push("talent_cartographer"); for (let y = 0; y < w.height; y++) for (let x = 0; x < w.width; x++) g.state.explored.markOverworld(x, y); })()`);
    await evalJs(`(() => { const b = [...document.querySelectorAll("button")].find((x) => (x.textContent || "").startsWith("Map")); if (b) b.click(); })()`);
    await sleep(2500);
    await shot("map-open");
    const times = await evalJs<number[]>(`(async () => {
      const canvas = document.querySelector(".map-panel canvas");
      const out = [];
      for (let i = 0; i < 14; i++) {
        const t0 = performance.now();
        canvas.dispatchEvent(new WheelEvent("wheel", { deltaY: 100, clientX: canvas.getBoundingClientRect().left + 320, clientY: canvas.getBoundingClientRect().top + 320, bubbles: true, cancelable: true }));
        out.push(Math.round(performance.now() - t0));
        await new Promise((r) => setTimeout(r, 120));
      }
      return out;
    })()`);
    console.log("ms per wheel step zooming out:", times.join(" "));
    await shot("map-out");
    // back in a few steps, and drawn again: all from the picture
    const back = await evalJs<number[]>(`(async () => {
      const canvas = document.querySelector(".map-panel canvas");
      const out = [];
      for (let i = 0; i < 6; i++) {
        const t0 = performance.now();
        canvas.dispatchEvent(new WheelEvent("wheel", { deltaY: -100, clientX: canvas.getBoundingClientRect().left + 320, clientY: canvas.getBoundingClientRect().top + 320, bubbles: true, cancelable: true }));
        out.push(Math.round(performance.now() - t0));
        await new Promise((r) => setTimeout(r, 120));
      }
      return out;
    })()`);
    console.log("ms per wheel step zooming in:", back.join(" "));
    await shot("map-mid");
  }
  if (part === "castle") {
    // Quinkeep of glade-keep-429 (point 5): the throne room from the corridor in front of the king and from the cells beside him; arg = "x/y/F x/y/F ..."
    await page.goto(`${base}?autostart=1&seed=glade-keep-429&size=default&dungeons=default&outside=1`, { waitUntil: "load", timeout: 60000 });
    await page.waitForFunction("window.__game !== undefined", { timeout: 60000 });
    await sleep(14000);
    await evalJs(`(async () => { await __game.enter("p:1:0:233"); })()`);
    await sleep(6000);
    // walks the corridor of row 8 from the west to the king and reports where each step ends
    await evalJs(`__game.teleport(7, 8, "E")`);
    await sleep(800);
    for (let step = 0; step < 4; step++) {
      await page.keyboard.press("w");
      await sleep(900);
      console.log("step", step, await evalJs<string>(`JSON.stringify({ x: __game.game.player.tx, y: __game.game.player.ty, f: __game.game.player.facing })`));
    }
    await shot("walk-end");
    for (const spot of (arg || "10/10/N 10/9/N 9/8/N 7/8/E").split(" ")) {
      const [x, y, f] = spot.split("/");
      await evalJs(`__game.teleport(${x}, ${y}, "${f}")`);
      await sleep(1500);
      await shot(`${x}-${y}-${f}`);
    }
  }
  if (part === "spells") {
    await open("cedar-peak-198");
    await page.keyboard.press("f");
    await sleep(1200);
    await shot("choose");
    // the first hero who can cast: whatever the window asks next, click the first portrait
    await evalJs(`(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent === "Select"); if (b) b.click(); })()`);
    await sleep(1200);
    await shot("window");
    const first = await page.$(".spell-slot");
    if (first) {
      const box = await first.boundingBox();
      if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await sleep(600);
      await shot("hover");
    }
  }
  if (problems.length > 0) console.log(problems.slice(0, 10).join("\n"));
  console.log("arg:", arg);
} finally {
  await browser.close();
}
