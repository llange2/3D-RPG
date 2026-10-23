import { LAYER, rngFor } from "../core/rng";
import { MONSTER_IDS, MONSTERS } from "../data/tables";
import { caravansOf } from "./caravans";
import { levelAt } from "./difficulty";
import { wrapDist2 } from "./islands";
import { overworldMascotSpots } from "./mascots";
import { DECO, GROUND, wrapDelta, type WorldSize } from "./types";
import type { World } from "./world";

/** Map items of the old game: the Monster Hut and the one that replaces it once it is burnt down. */
export const HUT_ITEM = 101;
export const BURNT_HUT_ITEM = 102;
/** The models of the two, for the preload. */
export const HUT_MODELS: readonly string[] = [`ci_${HUT_ITEM}`, `ci_${BURNT_HUT_ITEM}`];

/** Monsters of one hut, all within this many tiles of it, on the island it stands on. */
export const HUT_RADIUS = 5;
/**
 * How many monsters a hut holds, by world size: the world is only so big, and a small world is not meant to hold as many monsters as a huge one.
 * Every hut stands once on every size. The XP of one such monster is scaled the other way round (`hutXpPercent`), so that a hut gives the same
 * XP in total on every size.
 */
const MONSTERS_PER_HUT: Record<WorldSize, number> = { small: 4, default: 6, large: 8, huge: 10 };
/** The size whose XP are the ones of the sheet. */
const XP_SIZE: WorldSize = "default";

/** The number of monsters in a hut of a world of this size. */
export function hutMonsters(size: WorldSize): number {
  return MONSTERS_PER_HUT[size];
}

/** The share of the sheet's XP (in percent) that one monster of a hut gives: 150 on small, 100 on default, 75 on large and 60 on huge worlds. */
export function hutXpPercent(size: WorldSize): number {
  return Math.round((100 * MONSTERS_PER_HUT[XP_SIZE]) / MONSTERS_PER_HUT[size]);
}
/** The wild monsters keep this far from the start (`SAFE_RADIUS`), and so does every monster of a hut. */
const MONSTER_START_CLEARANCE = 12;
/** No hut stands nearer to the start than this, in any pass (the level-1 half of a small start island is not big, and Starthaven lies at its end). */
const LEAST_START = 8;
/**
 * How a hut is placed, the strict way first: a hut needs room for `share` of its monsters (in percent), keeps `apart` tiles from every other hut and
 * `start` tiles from the start. The strictest pass keeps the monsters of two huts a good way apart (two radii and then some) and the first hut out
 * of the young party's first steps (the monsters stand up to `HUT_RADIUS` tiles from their hut), so that the party meets one hut's monsters at a
 * time and no horde from two huts runs it down in the open. A small island cannot hold twenty-one huts that far apart, and every monster of the
 * sheet has its hut, so the rules loosen pass by pass, for the hut that does not fit, until it does.
 */
const PASSES: readonly { share: number; apart: number; start: number }[] = [
  { share: 100, apart: 24, start: 22 },
  { share: 80, apart: 18, start: 22 },
  { share: 60, apart: 14, start: 20 },
  { share: 40, apart: 10, start: 18 },
  { share: 25, apart: 7, start: 16 },
  { share: 1, apart: 3, start: 12 },
  { share: 1, apart: 2, start: LEAST_START },
];
/** Spots tried on each island for a level. */
const SAMPLES = 4000;

/** Where one monster of a hut stands. */
export interface HutSlot {
  x: number;
  y: number;
}

/** A Monster Hut on the overworld: whose home it is, where it stands and where its monsters stand. */
export interface HutSpot {
  /** `<monster id>.<copy>`; the key of the saved state (`hut:<id>@burnt`) and of its monsters (`h:<id>:<slot>:<generation>`). */
  id: string;
  monster: number;
  copy: number;
  x: number;
  y: number;
  island: number;
  slots: HutSlot[];
}

/** The state key of a slot. */
export const slotKey = (hutId: string, slot: number): string => `${hutId}:${slot}`;

const cache = new WeakMap<World, { huts: HutSpot[]; byId: Map<string, HutSpot> }>();

function near(world: World, ax: number, ay: number, bx: number, by: number, within: number): boolean {
  return wrapDist2(ax, ay, bx, by, world.width, world.height) < within * within;
}

/**
 * The Monster Huts of the world, one for each monster of the sheet that has an outside XP in entity 9 (once, on every size of world). A hut
 * stands on an island of its monster's treasure level, and where on it depends on the monster: the monsters of a level are ranked by XP, and the
 * hut of the weakest stands where the level is lowest (nearest the town the level begins at), the hut of the strongest where it is highest (nearest
 * the town of the next level). The spots are ranked the same way, so that the huts spread evenly over the island. A pure function of the world seed.
 */
export function hutsOf(world: World): HutSpot[] {
  return hutIndex(world).huts;
}

export function hutIndex(world: World): { huts: HutSpot[]; byId: Map<string, HutSpot> } {
  const known = cache.get(world);
  if (known) return known;
  const huts = makeHuts(world);
  const made = { huts, byId: new Map(huts.map((h) => [h.id, h])) };
  cache.set(world, made);
  return made;
}

function makeHuts(world: World): HutSpot[] {
  const start = world.startPosition();
  const wanted = hutMonsters(world.size);
  // what already stands on open ground and must keep its ways: the mascots, the wagons of the talent traders
  const blockers: { x: number; y: number }[] = [...overworldMascotSpots(world)];
  for (const p of world.allPois()) if (p.kind === "town") blockers.push(...caravansOf(world, p));
  const out: HutSpot[] = [];
  for (let level = 1; level <= 5; level++) {
    const spawners = MONSTER_IDS.filter((id) => MONSTERS[id]!.outside === "hut" && MONSTERS[id]!.treasure_level === level).sort((a, b) => MONSTERS[a]!.xp - MONSTERS[b]!.xp || a - b);
    if (spawners.length === 0) continue;
    const rng = rngFor(world.rootSeed, LAYER.SPAWN, "hutsites", level);
    // spots on the islands of the level, ordered by how hard the level is there
    const spots: { x: number; y: number; island: number; level: number; fromStart: number }[] = [];
    const seen = new Set<number>();
    for (const isl of world.islands) {
      if (!isl.tiers.includes(level)) continue;
      for (let n = 0; n < SAMPLES; n++) {
        const x = world.wrapX(isl.x + rng.range(isl.box.x0, isl.box.x1));
        const y = world.wrapY(isl.y + rng.range(isl.box.y0, isl.box.y1));
        const key = y * world.width + x;
        if (seen.has(key) || world.islandAt(x, y) !== isl || world.tierAt(x, y) !== level) continue;
        seen.add(key);
        const t = world.tile(x, y);
        if (t.ground !== GROUND.LAND || t.deco !== DECO.NONE || t.poiId !== null) continue;
        const fromStart = wrapDist2(x, y, start.x, start.y, world.width, world.height);
        if (fromStart < LEAST_START * LEAST_START) continue;
        spots.push({ x, y, island: isl.index, level: levelAt(world, x, y), fromStart });
      }
    }
    spots.sort((a, b) => a.level - b.level || a.y - b.y || a.x - b.x);
    if (spots.length === 0) continue;
    spawners.forEach((monster, rank) => {
      const aim = Math.floor(((2 * rank + 1) * (spots.length - 1)) / (2 * spawners.length));
      // the copy number stays in the id: the saves of earlier versions know the huts by it
      const copy = 0;
      const id = `${monster}.${copy}`;
      search: for (const pass of PASSES) {
        const needed = Math.max(1, Math.ceil((wanted * pass.share) / 100));
        for (let step = 0; step < 2 * spots.length; step++) {
          // alternately above and below the aimed rank, nearest first
          const at = aim + (step % 2 === 0 ? step / 2 : -(step + 1) / 2);
          const spot = spots[at];
          if (!spot || spot.fromStart < pass.start * pass.start) continue;
          const { x, y } = spot;
          if (out.some((h) => near(world, x, y, h.x, h.y, pass.apart))) continue;
          if (blockers.some((b) => b.x === x && b.y === y)) continue;
          if (world.poiAtEntrance(x, y) !== null || !world.leavesPassage(x, y) || !world.keepsRingOpen(x, y, [...blockers, ...out]) || !world.isOpenGround(x, y)) continue;
          const slots = slotsAround(world, id, x, y, spot.island, start, out, wanted);
          if (slots.length < needed) continue;
          out.push({ id, monster, copy, x, y, island: spot.island, slots });
          break search;
        }
      }
    });
  }
  return out;
}

/** The places of a hut's monsters: ground of the hut's island within `HUT_RADIUS` tiles of it, open to walk, at least two tiles from each other. */
function slotsAround(world: World, id: string, hx: number, hy: number, island: number, start: { x: number; y: number }, others: readonly HutSpot[], count: number): HutSlot[] {
  const rng = rngFor(world.rootSeed, LAYER.SPAWN, "hutslots", id);
  const cells: [number, number][] = [];
  for (let oy = -HUT_RADIUS; oy <= HUT_RADIUS; oy++) for (let ox = -HUT_RADIUS; ox <= HUT_RADIUS; ox++) if (ox !== 0 || oy !== 0) cells.push([hx + ox, hy + oy]);
  rng.shuffle(cells);
  const out: HutSlot[] = [];
  const taken = new Set<number>(others.flatMap((h) => h.slots.map((s) => world.wrapY(s.y) * world.width + world.wrapX(s.x))));
  for (const [cx, cy] of cells) {
    if (out.length >= count) break;
    const x = world.wrapX(cx);
    const y = world.wrapY(cy);
    if (taken.has(y * world.width + x)) continue;
    // the hut's own ring: nothing stands right next to it
    if (Math.max(Math.abs(cx - hx), Math.abs(cy - hy)) < 2) continue;
    if (world.islandAt(x, y)?.index !== island) continue;
    const t = world.tile(x, y);
    if (t.ground !== GROUND.LAND || t.deco !== DECO.NONE || t.poiId !== null) continue;
    if (near(world, x, y, start.x, start.y, MONSTER_START_CLEARANCE)) continue;
    if (out.some((s) => Math.max(Math.abs(s.x - cx), Math.abs(s.y - cy)) < 2)) continue;
    if (world.poiAtEntrance(x, y) !== null || !world.isOpenGround(x, y)) continue;
    out.push({ x: cx, y: cy });
  }
  return out;
}

/** The distance in tiles (straight line, round the globe) from a spot to a hut slot, for "out of sight" tests. */
export function slotDistance(world: World, x: number, y: number, slot: HutSlot): number {
  return Math.max(Math.abs(wrapDelta(x, slot.x, world.width)), Math.abs(wrapDelta(y, slot.y, world.height)));
}

/** The gold of burning a hut down: 13 times the gold of its monster, rounded up to the next thousand. */
export function hutGold(monster: number): number {
  return Math.ceil((13 * MONSTERS[monster]!.gold) / 1000) * 1000;
}

/** Items in the pile of a burnt hut. */
export const HUT_ITEMS = 7;
