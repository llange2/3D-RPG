import { LAYER, rngFor } from "../core/rng";
import { MASCOT_ITEM } from "../data/mascots";
import { FACING_DELTA, type InteriorMap } from "../interiors/types";
import type { MapContent } from "../actions/types";
import { caravansIn } from "./caravans";
import { DECO, GROUND } from "./types";
import type { World } from "./world";

/** A mascot's place: the mascot it belongs to, the map item of that place (7 to 11), the tile or cell, and the tile it faces. */
export interface MascotSpot {
  mascot: string;
  item: number;
  x: number;
  y: number;
  faceX: number;
  faceY: number;
}

/** The mascots that wait outside; the Crow waits in the start town. */
const WILD = ["Donkey", "Fairy", "Orb", "Wolf"] as const;
/** Offsets from the middle of the group: a loose diamond with a free tile between the mascots, as the old outside map has them. */
const SLOTS: readonly (readonly [number, number])[] = [[-2, 0], [0, -2], [2, 0], [0, 2]];
const GROUP_DISTANCE = 5;

/**
 * Where the four mascots of the wild wait: in a loose group a few steps east or west of the start on plain ground, clear of
 * roads, so the party meets them on its first walk. A mascot is an obstacle, so it never stands where it would close a way (a path of one tile,
 * a strip of land, the door of a place: `World.leavesPassage`). A pure function of the world seed.
 */
export function overworldMascotSpots(world: World): MascotSpot[] {
  const start = world.startPosition();
  const rng = rngFor(world.rootSeed, LAYER.POI, "mascots");
  const side = rng.chance(500) ? 1 : -1;
  const cx = start.x + side * (GROUP_DISTANCE + rng.int(3));
  const cy = start.y + rng.range(-2, 2);
  // the wagons of the talent traders near the towns are blockers as well: a mascot may not close the way round a town that a wagon narrows
  const wagons = caravansIn(world, start.x - 40, start.y - 40, start.x + 40, start.y + 40);
  const free = (x: number, y: number, taken: MascotSpot[]) => {
    const t = world.tile(x, y);
    return t.ground === GROUND.LAND && t.deco === DECO.NONE && t.poiId === null && !taken.some((s) => Math.max(Math.abs(s.x - x), Math.abs(s.y - y)) < 2) && world.poiAtEntrance(x, y) === null && world.leavesPassage(x, y) && world.keepsRingOpen(x, y, [...taken, ...wagons]) && world.isOpenGround(x, y);
  };
  const order = rng.shuffle([...WILD]);
  const out: MascotSpot[] = [];
  /** The nearest free tile to a point within `radius` tiles (square rings), or null. */
  const nearest = (px: number, py: number, radius: number): { x: number; y: number } | null => {
    for (let r = 0; r <= radius; r++) {
      for (let oy = -r; oy <= r; oy++) {
        for (let ox = -r; ox <= r; ox++) {
          if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue;
          const x = px + ox;
          const y = py + oy;
          // the party's own tile stays free
          if ((x !== start.x || y !== start.y) && free(x, y, out)) return { x, y };
        }
      }
    }
    return null;
  };
  order.forEach((mascot, i) => {
    const [dx, dy] = SLOTS[i]!;
    // the slot itself, else the nearest free tile around it; where mountains, trees or water leave no room there, the nearest one to the start
    const found = nearest(cx + dx, cy + dy, 8) ?? nearest(start.x, start.y, 45);
    if (found) out.push({ mascot, item: MASCOT_ITEM[mascot]!, x: found.x, y: found.y, faceX: start.x, faceY: start.y });
  });
  return out;
}

/**
 * The Crow's perch in the start town: in a dead end, against the wall, facing the street (the town generator reserves the cell as a `perch`
 * site, so no rule puts anything else there). Null in other maps.
 */
export function townMascotSpot(map: InteriorMap, _content: MapContent): MascotSpot | null {
  const site = (map.sites ?? []).find((s) => s.kind === "perch");
  if (!site || site.kind !== "perch") return null;
  const d = FACING_DELTA[site.facing];
  return { mascot: "Crow", item: MASCOT_ITEM.Crow!, x: site.x, y: site.y, faceX: site.x + d.dx, faceY: site.y + d.dy };
}
