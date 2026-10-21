import type { Game } from "./game";

export interface BenchResult {
  scenario: string;
  seed: string;
  spots: { name: string; fps: number; p1LowFps: number; drawCalls: number; triangles: number; instances: number }[];
  avgFps: number;
  worstP1LowFps: number;
  maxDrawCalls: number;
  maxTriangles: number;
  maxChunkBuildMs: number;
  gpu: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Walks a fixed camera path and records frame times. The result goes to `window.__bench.result`. */
export async function runBenchmark(game: Game, scenario: string): Promise<BenchResult> {
  const w = game.world;
  const spots: { name: string; x: number; y: number; facing: "N" | "E" | "S" | "W" }[] = [];
  if (scenario === "interior" || scenario === "campaign") {
    // handled below
  } else {
    const s = w.startPosition();
    spots.push({ name: "start", x: s.x, y: s.y, facing: "N" });
    // one spot per biome found in a ring around the origin
    const seen = new Set<number>();
    for (let r = 20; r < 700 && seen.size < 5; r += 8) {
      for (let a = 0; a < 360; a += 20) {
        const x = Math.round(Math.cos((a * Math.PI) / 180) * r);
        const y = Math.round(Math.sin((a * Math.PI) / 180) * r);
        const t = w.tile(x, y);
        if (t.ground !== 0 || t.poiId || seen.has(t.biome)) continue;
        seen.add(t.biome);
        spots.push({ name: `biome ${t.biome}`, x, y, facing: (["N", "E", "S", "W"] as const)[a % 4] ?? "N" });
      }
    }
  }

  const results: BenchResult["spots"] = [];
  let gpu = "unknown";
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    const ext = gl?.getExtension("WEBGL_debug_renderer_info");
    if (gl && ext) gpu = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL));
  } catch {
    /* ignore */
  }

  const measure = async (name: string, ms: number) => {
    await sleep(900); // let chunks stream in
    const before = game.stats().frameTimes.length;
    await sleep(ms);
    const s = game.stats();
    const times = s.frameTimes.slice(Math.max(0, s.frameTimes.length - Math.min(s.frameTimes.length, Math.max(30, Math.round(ms / 16)))));
    void before;
    const sorted = [...times].sort((a, b) => b - a);
    const slowest = sorted.slice(0, Math.max(1, Math.floor(sorted.length * 0.01)));
    const avg = times.reduce((x, y) => x + y, 0) / Math.max(1, times.length);
    results.push({ name, fps: 1000 / avg, p1LowFps: 1000 / (slowest.reduce((x, y) => x + y, 0) / slowest.length), drawCalls: s.drawCalls, triangles: Math.round(s.triangles), instances: s.instances });
  };

  if (scenario === "interior") {
    const found = new Map<string, string>();
    for (let ry = -2; ry <= 2; ry++) for (let rx = -2; rx <= 2; rx++) for (const p of w.region(rx, ry).pois) if (!found.has(p.kind)) found.set(p.kind, p.id);
    for (const [kind, id] of found) {
      await game.enterPoiById(id);
      const rt = game.internals.interior!;
      // walk to a few room centres
      const rooms = rt.map.rooms.slice(0, 3);
      for (const room of rooms.length ? rooms : [{ cx: rt.map.spawn.x, cy: rt.map.spawn.y }]) {
        game.teleport(room.cx, room.cy, "N");
        await measure(`${kind} room`, 1500);
      }
      if (kind === "town") {
        game.teleport(rt.map.spawn.x, rt.map.spawn.y - 8, "N");
        await measure("town street", 1500);
      }
      await game.leave();
    }
  } else if (scenario === "campaign") {
    // the biggest and the most different maps of the hand-built campaign, each from three standing points
    for (const slug of ["outside", "fountain-head", "arachnoid-cavern", "castle-bloodreign", "space-ship", "swamp-town"]) {
      await game.debugCampaign(slug);
      const rt = game.internals.interior!;
      const free: [number, number][] = [];
      for (let y = 0; y < rt.map.height; y++) for (let x = 0; x < rt.map.width; x++) if (rt.map.cells[y * rt.map.width + x] === 1 && !rt.blocked.has(y * rt.map.width + x)) free.push([x, y]);
      const picks = [free[Math.floor(free.length * 0.1)], free[Math.floor(free.length * 0.5)], free[Math.floor(free.length * 0.9)]];
      for (const [i, spot] of picks.entries()) {
        if (!spot) continue;
        game.teleport(spot[0], spot[1], (["N", "E", "S"] as const)[i]!);
        await measure(`${slug} #${i + 1}`, 1500);
      }
    }
  } else {
    for (const s of spots) {
      game.teleport(s.x, s.y, s.facing);
      await measure(s.name, 1500);
    }
  }

  const avgFps = results.reduce((a, r) => a + r.fps, 0) / Math.max(1, results.length);
  return {
    scenario,
    seed: w.seedText,
    spots: results,
    avgFps,
    worstP1LowFps: Math.min(...results.map((r) => r.p1LowFps)),
    maxDrawCalls: Math.max(...results.map((r) => r.drawCalls)),
    maxTriangles: Math.max(...results.map((r) => r.triangles)),
    maxChunkBuildMs: game.stats().maxChunkBuildMs,
    gpu,
  };
}
