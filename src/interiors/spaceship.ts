import type { Rng } from "../core/rng";
import { BRIDGE, CONTROL_ROOM, ENGINE_ROOM, LIFE_SUPPORT, SECTIONS, STORAGE_BAY } from "../data/quest-table";
import { Builder, rectsOverlap, type BuildContext, type Rect } from "./builder";
import { BRIDGE_H, BRIDGE_W, bridgeCells, bridgeFeature, bridgeFeatures } from "./bridge";
import { straightenCorners } from "./straighten";
import { CELL, type InteriorMap, type SpaceshipLayout } from "./types";

/**
 * The spaceship under the pyramids (quest document 1.5, spaceship_1): one level of five sections of equal size, shut off from each other by four airlocks. The bridge is
 * in front and has a fixed layout of its own (`bridge.ts`, quest document 1.9); behind it lies the control room with life support under it, then the storage bay and the engine room
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

/**
 * Where the bridge's fixed grid lies: its last column, the airlock to the control room, is the first column of that section, and its rows are in the middle of the section's height.
 */
function bridgeRect(): Rect {
  return { x: originOf(CONTROL_ROOM).x - (BRIDGE_W - 1), y: (SECTION_H - BRIDGE_H) >> 1, w: BRIDGE_W, h: BRIDGE_H };
}

/** One section: a few rooms of 5 to 8 cells, joined by a tree of corridors. Returns their rectangles in the order they were made (the bridge has none: its grid is fixed). */
function carveSection(b: Builder, rng: Rng, section: number): Rect[] {
  if (section === BRIDGE) return [];
  const { x: x0, y: y0 } = originOf(section);
  const rooms: Rect[] = [];
  const want = rng.range(4, 5);
  for (let tries = 0; tries < 300 && rooms.length < want; tries++) {
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
  // the bridge: the document's grid, cell for cell
  const bridge = bridgeRect();
  bridgeCells().forEach((row, y) => row.forEach((cell, x) => cell === CELL.FLOOR && b.set(bridge.x + x, bridge.y + y, CELL.FLOOR)));
  const at = (thing: Parameters<typeof bridgeFeature>[0]) => {
    const f = bridgeFeature(thing);
    return { x: bridge.x + f.x, y: bridge.y + f.y };
  };

  // airlocks: a corridor from the room of one section that is nearest the next one to the room of the next that is nearest to it, with the lock in the wall between them
  const locks: SpaceshipLayout["locks"] = [];
  for (const link of LINKS) {
    if (link.from === BRIDGE) {
      // the airlock at the east end of the bridge (LC), its lever at the end of the corridor with the tube (LE); on the control room's side a corridor leads to the nearest room, with the lever
      // in a niche beside it like at the other airlocks
      const door = at("LC");
      const there = [...all[link.to]!].sort((p, q) => centre(p).x - centre(q).x)[0]!;
      const c = centre(there);
      b.carveL(door.x + 1, door.y, c.x, c.y, true);
      // (a real niche: a wall cell beside the corridor with wall on its other three sides, north of the corridor or south of it, two to five cells behind the lock; a room that lies next to the
      // corridor would make the niche a passage that no lever may shut)
      const wall = (x: number, y: number): boolean => b.get(x, y) === CELL.SOLID;
      let niche = { x: door.x + 2, y: door.y - 1 };
      search: for (let dx = 2; dx <= 5; dx++) {
        for (const dy of [-1, 1]) {
          const x = door.x + dx;
          const y = door.y + dy;
          if (wall(x, y) && wall(x - 1, y) && wall(x + 1, y) && wall(x, y + dy) && b.isFloor(x, door.y)) {
            niche = { x, y };
            break search;
          }
        }
      }
      b.carveCorridorCell(niche.x, niche.y);
      locks.push({ door, a: at("LE"), b: niche, from: link.from, to: link.to, axis: link.axis });
      continue;
    }
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

  // the transporter tubes: one in each section, on the north wall of the room nearest the middle of the section (the bridge's is the end of its corridor, on the south wall: DEN)
  const tubes: SpaceshipLayout["tubes"] = [];
  for (let s = 0; s < SECTIONS; s++) {
    if (s === BRIDGE) {
      const den = at("DEN");
      tubes.push({ x: den.x, y: den.y, front: { x: den.x, y: den.y - 1 }, facing: "N" });
      continue;
    }
    const mid = originOf(s).x + (SECTION_W >> 1);
    const room = [...all[s]!].sort((p, q) => Math.abs(centre(p).x - mid) - Math.abs(centre(q).x - mid))[0]!;
    // (the cell the tube stands on must not be where a corridor enters the room: the tube is an object that blocks it; the nearest cell of the top row with wall above it is taken)
    const want = room.x + (room.w >> 1) + (s % 2 === 0 ? 1 : -1);
    const row = Array.from({ length: room.w - 2 }, (_, i) => room.x + 1 + i).sort((p, q) => Math.abs(p - want) - Math.abs(q - want) || p - q);
    const x = row.find((cx) => !b.isFloor(cx, room.y - 1) && !b.isFloor(cx - 1, room.y - 1) && !b.isFloor(cx + 1, room.y - 1)) ?? want;
    tubes.push({ x, y: room.y, front: { x, y: room.y + 1 } });
  }
  // the console (CO): a terminator stands on each of its four sides, so its front is the cell to the south, where the party stands once that one has fallen
  const co = at("CO");
  const console = { x: co.x, y: co.y, front: { x: co.x, y: co.y + 1 } };

  // the models that round the corners need walls that run straight on both sides: the steps of one cell that the corridors leave in the walls are smoothed away (6. 11. 2026), but not where
  // something stands on its cell (the tubes, the airlocks with their niches), not on the bridge (its grid is the document's) and not near the borders of the sections
  const near = (p: { x: number; y: number }, x: number, y: number, r: number): boolean => Math.abs(p.x - x) <= r && Math.abs(p.y - y) <= r;
  straightenCorners(b.cells, W, H, (x, y) => {
    if (tubes.some((t) => near(t, x, y, 2) || near(t.front, x, y, 2))) return true;
    if (x >= bridge.x - 1 && x <= bridge.x + bridge.w && y >= bridge.y - 1 && y <= bridge.y + bridge.h) return true;
    if (locks.some((l) => near(l.door, x, y, 3) || near(l.a, x, y, 2) || near(l.b, x, y, 2))) return true;
    return Array.from({ length: SECTIONS }, (_, s) => originOf(s)).some((o) => Math.abs(x - o.x) <= 2 || Math.abs(y - o.y) <= 2) || x >= W - 3;
  });

  const own = tubes[section] ?? tubes[0]!;
  const spawn = { x: own.front.x, y: own.front.y, facing: own.facing ?? ("S" as const) };
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
    bridge,
    // beside every door of the bridge (the frame stands in a straight wall) and under the generator and the terminal, which stand in the corners of their room
    square: bridgeFeatures().flatMap((f) => {
      const x = bridge.x + f.x;
      const y = bridge.y + f.y;
      if (f.thing === "TG" || f.thing === "TE") return [{ x, y }];
      return f.thing === "CD" || f.thing === "CL" ? [{ x: x - 1, y }, { x: x + 1, y }, { x, y: y - 1 }, { x, y: y + 1 }] : [];
    }),
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
