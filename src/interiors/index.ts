import { LAYER, rngFor } from "../core/rng";
import { pickAlignment } from "../data/castles";
import { SIZE_SCALE } from "../data/quest-table";
import { pickInteriorTheme, withDungeonTheme } from "../data/interior-themes";
import { BIOME, type Poi } from "../world/types";
import type { World } from "../world/world";
import type { BuildContext } from "./builder";
import { generateCave } from "./cave";
import { generateDungeon } from "./dungeon";
import { planDungeon } from "./dungeonPlan";
import { generateCastle } from "./castle";
import { generateTown } from "./town";
import type { InteriorMap } from "./types";

export * from "./types";
export { analyzeTopology, type Topology, type Mouth } from "./topology";
export { checkKeyChain, planDungeon } from "./dungeonPlan";

/**
 * Generates the interior of a POI. A pure function of (world seed, POI position, floor): visiting the same
 * POI twice, on any machine, gives the same map.
 */
export function generateInterior(world: World, poi: Poi, floor = 0): InteriorMap {
  const rng = rngFor(world.rootSeed, LAYER.INTERIOR, poi.x, poi.y, floor);
  const themeRng = rngFor(world.rootSeed, LAYER.INTERIOR, poi.x, poi.y, floor, "theme");
  const dungeon = planDungeon(world, poi) ?? undefined;
  const look = pickInteriorTheme(poi.kind, poi.biome, poi.tier, themeRng, dungeon?.klass === "C");  const ctx: BuildContext = {
    key: `${poi.id}:${floor}`,
    tier: poi.tier,
    theme: dungeon ? withDungeonTheme(look, dungeon.look) : look,
    dungeon,
  };
  switch (poi.kind) {
    case "dungeon":
      return generateDungeon(rng, ctx);
    case "cave":
      return generateCave(rng, ctx);
    case "castle": {
      // good, neutral or evil: the plan of the world says (a castle that is no part of it, a hand-made one in a test, draws from its own stream)
      const alignment = world.castleAlignment(poi.id) ?? pickAlignment(rngFor(world.rootSeed, LAYER.INTERIOR, poi.x, poi.y, floor, "alignment"), poi.biome === BIOME.LAVA);
      return generateCastle(rng, ctx, alignment, SIZE_SCALE[world.size] ?? 1);
    }
    case "town":
      return generateTown(rng, ctx);
  }
}

/** FNV-1a over cells, room map, spawn, exit, lots and theme id. */
export function interiorHash(map: InteriorMap): number {
  let h = 0x811c9dc5;
  const feed = (n: number) => {
    h ^= n & 0xff;
    h = Math.imul(h, 0x01000193);
    h ^= (n >>> 8) & 0xff;
    h = Math.imul(h, 0x01000193);
  };
  for (let i = 0; i < map.cells.length; i++) feed(map.cells[i]!);
  for (let i = 0; i < map.roomOf.length; i++) feed(map.roomOf[i]! + 1);
  for (const n of [map.spawn.x, map.spawn.y, map.exit.x, map.exit.y, map.rooms.length, map.lots.length]) feed(n);
  for (const p of map.pillars ?? []) {
    feed(p.x);
    feed(p.y);
  }
  for (const lot of map.lots) for (const n of [lot.x, lot.y, lot.w, lot.h, lot.door.x, lot.door.y]) feed(n);
  for (const site of map.sites ?? []) {
    for (const n of [site.x, site.y]) feed(n);
    const what =
      site.kind === "talent" ? site.talent : site.kind === "cage" ? `cage${site.axis}` : site.kind === "guard" ? `guard${site.monsters.join(",")}` : site.kind === "perch" ? `perch${site.facing}` : site.kind === "work" ? `work${site.persona}` : site.kind === "vault_way" ? `way${site.axis}${site.how}` : site.kind === "vault_chest" ? `vchest${site.main}` : site.kind === "vault_guard" ? `vguard${site.boss}` : `${site.kind}${site.item}`;
    for (let i = 0; i < what.length; i++) feed(what.charCodeAt(i));
  }
  for (let i = 0; i < map.theme.id.length; i++) feed(map.theme.id.charCodeAt(i));
  if (map.castle) {
    for (let i = 0; i < map.castle.alignment.length; i++) feed(map.castle.alignment.charCodeAt(i));
    for (const c of [map.castle.throne, map.castle.king, map.castle.door, map.castle.answer, ...map.castle.statues, ...map.castle.kingChests, ...map.castle.yardChests]) {
      feed(c.x);
      feed(c.y);
    }
  }
  if (map.dungeon) for (const text of [map.dungeon.id, map.dungeon.requires ?? "", ...map.dungeon.gives]) for (let i = 0; i < text.length; i++) feed(text.charCodeAt(i));
  return h >>> 0;
}
