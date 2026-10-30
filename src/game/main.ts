import { Game } from "./game";
import { runBenchmark } from "./bench";
import { bootDone, bootProgress } from "./boot";
import { interiorFingerprints } from "../actions/fingerprint";
import { chunkHash, World } from "../world/world";
import { installCursor } from "../ui/cursor";
import { preloadImages } from "../ui/dom";
import { preloadSpellIcons } from "../ui/spellIcons";
import { preloadItemIcons } from "../ui/itemIcons";
import { splitLegacySaves } from "./state";
import { parseWorldSize, type WorldSize } from "../world/types";

async function main(): Promise<void> {
  const params = new URLSearchParams(location.search);
  // the start message of index.html stays up until the game can show a screen of its own (the title or the loading picture)
  bootProgress(0);
  installCursor();
  preloadImages(["ui/scroll.webp"]);
  // the 78 spell pictures are one sheet: fetched and decoded now, so that the spell window opens with every plate in place
  void preloadSpellIcons();
  // the same for the item pictures: every slot of an inventory or a shop is a window onto one decoded sheet
  void preloadItemIcons();
  splitLegacySaves();

  const canvas = document.createElement("canvas");
  canvas.id = "view";
  canvas.style.cssText = "position:fixed;inset:0;width:100%;height:100%;outline:none;touch-action:none";
  document.body.appendChild(canvas);

  const game = await Game.create(canvas, bootProgress);
  const overlay = document.createElement("pre");
  overlay.style.cssText = "position:fixed;left:8px;bottom:8px;margin:0;padding:6px 8px;background:#000a;color:#cfe;font:12px/1.35 monospace;pointer-events:none;white-space:pre;z-index:50";
  if (params.get("debug") === "1") {
    document.body.appendChild(overlay);
    setInterval(() => {
      if (game.mode === "title") return;
      const s = game.stats();
      overlay.textContent =
        `${s.fps.toFixed(0)} fps  frame ${s.frameMs.toFixed(1)} ms  draw calls ${s.drawCalls}  meshes ${s.activeMeshes}\n` +
        `triangles ${(s.triangles / 1000).toFixed(0)}k  chunks ${s.chunks}  instances ${s.instances}  monsters ${s.monsters}  max chunk build ${s.maxChunkBuildMs.toFixed(1)} ms`;
    }, 250);
  }

  // hooks for automated checks (tests, benchmark, screenshots)
  (window as unknown as { __game: unknown }).__game = {
    game,
    get state() {
      return game.state;
    },
    get world() {
      return game.world;
    },
    get camera() {
      return game.internals.r.camera;
    },
    get scene() {
      return game.internals.r.scene;
    },
    teleport: (x: number, y: number, f: "N" | "E" | "S" | "W" = "N") => game.teleport(x, y, f),
    enter: (id: string) => game.enterPoiById(id),
    goto: (kind: string, service?: string) => !!game.debugGoto(kind, service),
    gotoMonster: (distance = 2) => !!game.debugGotoMonster(distance),
    firstPoi: (kind: string) => {
      for (const p of game.world.allPois()) if (p.kind === kind) return p.id;
      return null;
    },
    leave: () => game.leave(),
    /** Campaign: open a map by slug (and a cell in the editor's coordinates). */
    campaign: (slug: string, x?: number, y?: number, rotation = 0) => game.debugCampaign(slug, x, y, rotation),
    campaignGoto: (id: number, nth = 0) => game.debugCampaignGoto(id, nth),
    get campaignModel() {
      return game.campaignModel;
    },
    get modelSet() {
      return game.modelSet;
    },
    perf: () => {
      const s = game.stats();
      return { fps: s.fps, drawCalls: s.drawCalls, chunks: s.chunks, instances: s.instances, triangles: s.triangles, maxBuildMs: s.maxChunkBuildMs, monsters: s.monsters };
    },
    /** Chunk hashes computed in this browser, to compare with the golden values from Node. */
    hashes: (seed: string, chunks: [number, number][], size: WorldSize = "default") => {
      const w = new World(seed, size);
      return chunks.map(([cx, cy]) => chunkHash(w.chunk(cx, cy)));
    },
    /** Interior and action hashes of all POIs in some regions, computed in this browser. */
    interiorHashes: (seed: string, regions: [number, number][]) => interiorFingerprints(seed, regions),
    benchmark: (scenario: string) => runBenchmark(game, scenario),
  };

  // the model switch in the menu reloads the page; the game continues where it was saved
  bootDone();
  if (await game.resumeAfterReload()) return;

  const seed = params.get("seed") ?? "";
  if (params.get("bench") === "1") {
    if (params.get("scenario") === "campaign") await game.newCampaign(seed || "bench");
    else await game.newGame(seed || "bench", false, parseWorldSize(params.get("size")));
    (window as unknown as { __bench: unknown }).__bench = { done: false };
    const result = await runBenchmark(game, params.get("scenario") ?? "overworld");
    (window as unknown as { __bench: unknown }).__bench = { done: true, result };
    return;
  }
  if (params.get("autostart") === "1") {
    // ?campaign=<slug> starts the campaign (at that map when a slug is given)
    const campaign = params.get("campaign");
    if (campaign) {
      await game.newCampaign(seed || "test");
      if (campaign !== "1") await game.debugCampaign(campaign);
      return;
    }
    // `?outside=1` begins on the road in front of the town, for the tools that measure the overworld; a player begins in the town's streets
    await game.newGame(seed || "test", params.get("outside") !== "1", parseWorldSize(params.get("size")));
    return;
  }
  await game.start(seed);
}

main().catch((e) => {
  console.error(e);
  const boot = document.getElementById("boot");
  if (boot) boot.textContent = `Error: ${(e as Error).message}`;
});
