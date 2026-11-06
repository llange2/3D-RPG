import type { Rng } from "../core/rng";
import { BRIDGE, CONTROL_ROOM, ENGINE_ROOM, LIFE_SUPPORT, SECTIONS, STORAGE_BAY } from "../data/quest-table";
import { Builder, rectsOverlap, type BuildContext, type Rect } from "./builder";
import type { InteriorMap, SpaceshipLayout } from "./types";

/**
 * The spaceship under the pyramids (quest document 1.5, spaceship_1): one level of five sections of equal size, shut off from each other by four airlocks. The bridge is
 * in front, with the console in the middle of its big round hall; behind it lies the control room with life support under it, then the storage bay and the engine room
 * at the end:
 *
 *     Bridge | Control Room | Storage Bay | Engine Room
 *            | Life Support |             |
 *
 * Every section has a transporter tube (the way in from the pyramid that opens it, and out again). An airlock is a corridor cell with a lever in a niche on each side of
 * it. The level is made from the seed of the world alone, the same for all five pyramids: only the cell the party appears on differs (`section`).
 */

export const SECTION_W = 26;
export const SECTION_H = 30;

/** Where the sections lie: column and row of the grid. */
const GRID: readonly { col: number; row: number }[] = [
  { col: 0, row: 0 }, // bridge
  { col: 1, row: 0 }, // control room
  { col: 1, row: 1 }, // life support, under the control room
  { col: 2, row: 0 }, // storage bay
  { col: 3, row: 0 }, // engine room
];
/** The airlocks, in the order of the document: bridge - control room, control room - life support, control room - storage bay, storage bay - engine room. */
const LINKS: readonly { from: number; to: number; axis: "x" | "y" }[] = [
  { from: BRIDGE, to: CONTROL_ROOM, axis: "x" },
  { from: CONTROL_ROOM, to: LIFE_SUPPORT, axis: "y" },
  { from: CONTROL_ROOM, to: STORAGE_BAY, axis: "x" },
  { from: STORAGE_BAY, to: ENGINE_ROOM, axis: "x" },
];

const originOf = (section: number): { x: number; y: number } => ({ x: 1 + GRID[section]!.col * SECTION_W, y: GRID[section]!.row * SECTION_H });

/** One section: a few rooms of 5 to 8 cells, joined by a tree of corridors. Returns their rectangles in the order they were made. */
function carveSection(b: Builder, rng: Rng, section: number): Rect[] {
  const { x: x0, y: y0 } = originOf(section);
  const rooms: Rect[] = [];
  if (section === BRIDGE) {
    // the bridge: a big hall at the very front, the console in its middle
    rooms.push({ x: x0 + 2, y: y0 + (SECTION_H >> 1) - 5, w: 11, h: 11 });
  }
  const want = section === BRIDGE ? 3 : rng.range(4, 5);
  for (let tries = 0; tries < 300 && rooms.length < want + (section === BRIDGE ? 1 : 0); tries++) {
    const w = rng.range(5, 8);
    const h = rng.range(5, 8);
    const rect: Rect = { x: x0 + 1 + rng.int(SECTION_W - w - 3), y: y0 + 2 + rng.int(SECTION_H - h - 4), w, h };
    if (rooms.some((r) => rectsOverlap(r, rect, 3))) continue;
    rooms.push(rect);
  }
  for (const r of rooms) b.carveRoom([r]);
  // a tree of corridors: every room joins the nearest one already joined
  const centre = (r: Rect) => ({ x: r.x + (r.w >> 1), y: r.y + (r.h >> 1) });
  const joined = [0];
  for (let i = 1; i < rooms.length; i++) {
    let best = 0;
    for (const j of joined) if (Math.abs(centre(rooms[j]!).x - centre(rooms[i]!).x) + Math.abs(centre(rooms[j]!).y - centre(rooms[i]!).y) < Math.abs(centre(rooms[best]!).x - centre(rooms[i]!).x) + Math.abs(centre(rooms[best]!).y - centre(rooms[i]!).y)) best = j;
    b.carveL(centre(rooms[best]!).x, centre(rooms[best]!).y, centre(rooms[i]!).x, centre(rooms[i]!).y, rng.chance(500));
    joined.push(i);
  }
  return rooms;
}

export function generateSpaceship(rng: Rng, ctx: BuildContext, section: number, codeWords: SpaceshipLayout["codeWords"] = []): InteriorMap {
  const cols = Math.max(...GRID.map((g) => g.col)) + 1;
  const rows = Math.max(...GRID.map((g) => g.row)) + 1;
  const W = 1 + cols * SECTION_W;
  const H = rows * SECTION_H;
  const b = new Builder(W, H);
  const all: Rect[][] = [];
  for (let s = 0; s < SECTIONS; s++) all.push(carveSection(b, rng, s));
  const centre = (r: Rect) => ({ x: r.x + (r.w >> 1), y: r.y + (r.h >> 1) });

  // airlocks: a corridor from the room of one section that is nearest the next one to the room of the next that is nearest to it, with the lock in the wall between them
  const locks: SpaceshipLayout["locks"] = [];
  for (const link of LINKS) {
    const side = link.axis === "x";
    // (side by side: the rightmost room of the first and the leftmost of the second; one under the other: the lowest room of the first and the highest of the second)
    const key = (r: Rect) => (side ? centre(r).x : centre(r).y);
    const here = [...all[link.from]!].sort((p, q) => key(q) - key(p))[0]!;
    const there = [...all[link.to]!].sort((p, q) => key(p) - key(q))[0]!;
    const a = centre(here);
    const c = centre(there);
    // along the row of `here` and then up or down in `there` (or the other way round): the airlock stands on the border cell of the two sections on that line
    b.carveL(a.x, a.y, c.x, c.y, side);
    const border = side ? originOf(link.to).x : originOf(link.to).y;
    // the lever niches: one cell beside the corridor, two cells before and after the lock
    const niche = (n: number) => {
      const cell = side ? { x: n, y: a.y - 1 } : { x: a.x - 1, y: n };
      b.carveCorridorCell(cell.x, cell.y);
      return cell;
    };
    locks.push({ door: side ? { x: border, y: a.y } : { x: a.x, y: border }, a: niche(border - 2), b: niche(border + 2), from: link.from, to: link.to, axis: link.axis });
  }

  // the transporter tubes: one in each section, on the north wall of the room nearest the middle of the section (the bridge's in a room beside the hall)
  const tubes: SpaceshipLayout["tubes"] = [];
  for (let s = 0; s < SECTIONS; s++) {
    const mid = originOf(s).x + (SECTION_W >> 1);
    const candidates = s === BRIDGE ? all[BRIDGE]!.slice(1) : all[s]!;
    const room = [...candidates].sort((p, q) => Math.abs(centre(p).x - mid) - Math.abs(centre(q).x - mid))[0]!;
    const x = room.x + (room.w >> 1) + (s % 2 === 0 ? 1 : -1);
    tubes.push({ x, y: room.y, front: { x, y: room.y + 1 } });
  }
  const hall = all[BRIDGE]![0]!;
  const hallMid = centre(hall);
  const console = { x: hallMid.x, y: hallMid.y, front: { x: hallMid.x, y: hallMid.y + 1 } };

  const own = tubes[section] ?? tubes[0]!;
  const spawn = { x: own.front.x, y: own.front.y, facing: "S" as const };
  // the exit is the tube itself (the party leaves by stepping into it); the map's exit cell is its front
  const exit = { x: own.x, y: own.y };
  const layout: SpaceshipLayout = {
    sections: SECTIONS,
    width: SECTION_W,
    height: SECTION_H,
    origins: Array.from({ length: SECTIONS }, (_, s) => originOf(s)),
    tubes,
    console,
    locks,
    hall,
    rooms: all,
    codeWords,
  };
  const dungeon = ctx.dungeon ? { ...ctx.dungeon } : undefined;
  const map = b.finish("dungeon", { ...ctx, dungeon }, exit, spawn);
  return { ...map, spaceship: layout };
}

/** The section a cell lies in. */
export function sectionAt(layout: Pick<SpaceshipLayout, "sections" | "width" | "height" | "origins">, x: number, y: number): number {
  for (let s = 0; s < layout.sections; s++) {
    const o = layout.origins[s]!;
    if (x >= o.x && x < o.x + layout.width && y >= o.y && y < o.y + layout.height) return s;
  }
  return -1;
}
