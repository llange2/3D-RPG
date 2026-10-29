import type { Rng } from "../core/rng";
import { SECTIONS } from "../data/quest-table";
import { Builder, rectsOverlap, type BuildContext, type Rect } from "./builder";
import type { InteriorMap, SpaceshipLayout } from "./types";

/**
 * The spaceship under the pyramids (quest document 1.2, spaceship_1): one level of five sections of equal size, side by side, shut off from each other by
 * airlocks. Section 0 is the front, the control deck with the transport tube in the middle of its big round hall; every section has a transporter tube
 * (the way in from the pyramid that opens it, and out again). An airlock is a corridor cell with a lever in a niche on each side of it. The level is made
 * from the seed of the world alone, the same for all five pyramids: only the cell the party appears on differs (`section`).
 */

const SECTION_W = 26;
const H = 30;

/** One section: a few rooms of 5 to 8 cells, joined by a tree of corridors. Returns their rectangles in the order they were made. */
function carveSection(b: Builder, rng: Rng, section: number): Rect[] {
  const x0 = 1 + section * SECTION_W;
  const rooms: Rect[] = [];
  if (section === 0) {
    // the control deck: a big hall at the very front
    rooms.push({ x: x0 + 2, y: (H >> 1) - 5, w: 11, h: 11 });
  }
  const want = section === 0 ? 3 : rng.range(4, 5);
  for (let tries = 0; tries < 300 && rooms.length < want + (section === 0 ? 1 : 0); tries++) {
    const w = rng.range(5, 8);
    const h = rng.range(5, 8);
    const rect: Rect = { x: x0 + 1 + rng.int(SECTION_W - w - 3), y: 2 + rng.int(H - h - 4), w, h };
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

export function generateSpaceship(rng: Rng, ctx: BuildContext, section: number): InteriorMap {
  const W = 1 + SECTIONS * SECTION_W;
  const b = new Builder(W, H);
  const all: Rect[][] = [];
  for (let s = 0; s < SECTIONS; s++) {
    const rooms = carveSection(b, rng, s);
    all.push(rooms);
  }
  const centre = (r: Rect) => ({ x: r.x + (r.w >> 1), y: r.y + (r.h >> 1) });

  // airlocks: a corridor from the room of one section that is nearest the next one to the room of the next that is nearest to it, with the lock in the wall between them
  const locks: SpaceshipLayout["locks"] = [];
  for (let s = 0; s + 1 < SECTIONS; s++) {
    const here = [...all[s]!].sort((p, q) => centre(q).x - centre(p).x)[0]!;
    const there = [...all[s + 1]!].sort((p, q) => centre(p).x - centre(q).x)[0]!;
    const a = centre(here);
    const c = centre(there);
    // horizontal along the row of `here`, then vertical in `there`: the airlock stands on the border cell of the two sections on that row
    b.carveL(a.x, a.y, c.x, c.y, true);
    const border = 1 + (s + 1) * SECTION_W;
    const y = a.y;
    // the lever niches: one cell north of the corridor, two cells before and after the lock
    const niche = (x: number) => {
      b.carveCorridorCell(x, y - 1);
      return { x, y: y - 1 };
    };
    locks.push({ door: { x: border, y }, a: niche(border - 2), b: niche(border + 2), from: s });
  }

  // the transporter tubes: one in each section, on the north wall of the room nearest the middle of the section (the front section's in a room beside the control
  // deck); the tube of the control deck, the one that ends the game, stands alone in the middle of its hall
  const tubes: SpaceshipLayout["tubes"] = [];
  for (let s = 0; s < SECTIONS; s++) {
    const mid = 1 + s * SECTION_W + (SECTION_W >> 1);
    const candidates = s === 0 ? all[0]!.slice(1) : all[s]!;
    const room = [...candidates].sort((p, q) => Math.abs(centre(p).x - mid) - Math.abs(centre(q).x - mid))[0]!;
    const x = room.x + (room.w >> 1) + (s % 2 === 0 ? 1 : -1);
    tubes.push({ x, y: room.y, front: { x, y: room.y + 1 } });
  }
  const deckMid = centre(all[0]![0]!);
  const final = { x: deckMid.x, y: deckMid.y, front: { x: deckMid.x, y: deckMid.y + 2 } };

  const own = tubes[section] ?? tubes[0]!;
  const spawn = { x: own.front.x, y: own.front.y, facing: "S" as const };
  // the exit is the tube itself (the party leaves by stepping into it); the map's exit cell is its front
  const exit = { x: own.x, y: own.y };
  const layout: SpaceshipLayout = { sections: SECTIONS, width: SECTION_W, tubes, final, locks, deck: all[0]![0]!, rooms: all };
  const dungeon = ctx.dungeon ? { ...ctx.dungeon } : undefined;
  const map = b.finish("dungeon", { ...ctx, dungeon }, exit, spawn);
  return { ...map, spaceship: layout };
}

/** The section a cell lies in. */
export const sectionOf = (x: number): number => Math.min(SECTIONS - 1, Math.max(0, Math.floor((x - 1) / SECTION_W)));

