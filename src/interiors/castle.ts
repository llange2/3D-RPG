import type { Rng } from "../core/rng";
import { CASTLE_PLANS } from "../data/castle-plans";
import type { Alignment } from "../data/castles";
import { Builder, neighbours4, type BuildContext } from "./builder";
import { blocksPassage } from "./passage";
import { CELL, FACING_DELTA, type CastleLayout, type Facing, type InteriorMap } from "./types";

const FACINGS: readonly Facing[] = ["N", "E", "S", "W"];

/**
 * A castle of the generated world (quest document 1.2, castle_1): one of the two keeps of the document, turned and mirrored by chance. The map is the
 * keep alone (31st playtest, point 2: the yard round it is gone); the party starts behind the gate and the gate is the way out. The keep has four statues
 * in its corners and the throne with the king before it; the niches along its corridors hold chests that raise an alarm. What stands where is in
 * `InteriorMap.castle`; `actions/castle.ts` makes the objects of it.
 */

/** The wall round the plan, in cells (the plan's own edge has gaps where the keep is not square, and the gate stands on it). */
const MARGIN = 1;

type Plan = string[];

const mirror = (p: Plan): Plan => p.map((r) => [...r].reverse().join(""));
const rotate = (p: Plan): Plan => {
  const h = p.length;
  const w = p[0]!.length;
  return Array.from({ length: w }, (_, x) => Array.from({ length: h }, (_, y) => p[h - 1 - y]![x]!).join(""));
};

/**
 * Could the cells in `blocked` stand as objects without cutting the map: every floor cell outside them still reachable from `from`, and every object
 * with a free cell beside it (the `loose` ones, decoration nobody uses, need none)?
 */
export function stillOpen(b: Builder, from: { x: number; y: number }, blocked: ReadonlySet<number>, loose: ReadonlySet<number> = new Set()): boolean {
  const seen = new Set<number>([b.idx(from.x, from.y)]);
  const queue = [from];
  for (let head = 0; head < queue.length; head++) {
    const q = queue[head]!;
    for (const [nx, ny] of neighbours4(q.x, q.y)) {
      const i = b.idx(nx, ny);
      if (!b.isFloor(nx, ny) || blocked.has(i) || seen.has(i)) continue;
      seen.add(i);
      queue.push({ x: nx, y: ny });
    }
  }
  let floor = 0;
  for (let i = 0; i < b.cells.length; i++) if (b.cells[i] === CELL.FLOOR) floor++;
  if (seen.size !== floor - blocked.size) return false;
  return [...blocked].every((i) => loose.has(i) || neighbours4(i % b.width, Math.floor(i / b.width)).some(([nx, ny]) => seen.has(b.idx(nx, ny))));
}

/** The floor cells the party can reach from a cell when the `blocked` cells stand in the way. */
function reachable(b: Builder, from: { x: number; y: number }, blocked: ReadonlySet<number>): Set<number> {
  const seen = new Set<number>([b.idx(from.x, from.y)]);
  const queue = [from];
  for (let head = 0; head < queue.length; head++) {
    const q = queue[head]!;
    for (const [nx, ny] of neighbours4(q.x, q.y)) {
      const i = b.idx(nx, ny);
      if (!b.isFloor(nx, ny) || blocked.has(i) || seen.has(i)) continue;
      seen.add(i);
      queue.push({ x: nx, y: ny });
    }
  }
  return seen;
}

export function generateCastle(rng: Rng, ctx: BuildContext, alignment: Alignment, scale: number, coins = 0, word = 0, spells: readonly number[] = []): InteriorMap {
  let plan: Plan = [...CASTLE_PLANS[rng.int(CASTLE_PLANS.length)]!];
  if (rng.chance(500)) plan = mirror(plan);
  for (let k = rng.int(4); k > 0; k--) plan = rotate(plan);
  const ph = plan.length;
  const pw = plan[0]!.length;
  const W = pw + 2 * MARGIN;
  const H = ph + 2 * MARGIN;
  const b = new Builder(W, H);
  let throne = { x: 0, y: 0 };
  let door = { x: 0, y: 0 };
  const statues: { x: number; y: number; bearing: number }[] = [];
  for (let y = 0; y < ph; y++) {
    for (let x = 0; x < pw; x++) {
      const c = plan[y]![x]!;
      const at = { x: x + MARGIN, y: y + MARGIN };
      // the spaces of the plan are outside the keep: rock, so that the gate is the only way in
      if (c !== "W" && c !== " ") b.set(at.x, at.y, CELL.FLOOR);
      if (c === "T") throne = at;
      if (c === "D") door = at;
      if (c === "S") statues.push({ ...at, bearing: 0 });
    }
  }
  // the keep: what can be reached from the throne without passing the door
  const keep = new Set<number>([b.idx(throne.x, throne.y)]);
  const queue = [throne];
  for (let head = 0; head < queue.length; head++) {
    const q = queue[head]!;
    for (const [nx, ny] of neighbours4(q.x, q.y)) {
      const i = b.idx(nx, ny);
      if (!b.isFloor(nx, ny) || keep.has(i) || (nx === door.x && ny === door.y)) continue;
      keep.add(i);
      queue.push({ x: nx, y: ny });
    }
  }
  const centre = { x: MARGIN + pw / 2, y: MARGIN + ph / 2 };
  for (const s of statues) s.bearing = s.x < centre.x ? (s.y < centre.y ? 135 : 45) : s.y < centre.y ? 225 : 315;
  // the king stands in front of the throne: the neighbouring cell with a wall behind the throne
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
  const front = dirs.find(([dx, dy]) => b.isFloor(throne.x + dx, throne.y + dy) && !b.isFloor(throne.x - dx, throne.y - dy)) ?? dirs.find(([dx, dy]) => b.isFloor(throne.x + dx, throne.y + dy))!;
  const king = { x: throne.x + front[0], y: throne.y + front[1] };

  // the gate of the keep is the way out (rock lies behind it), and the party starts on the cell inside it, looking away from the gate
  const exit = door;
  const entry = FACINGS.find((f) => keep.has(b.idx(exit.x + FACING_DELTA[f].dx, exit.y + FACING_DELTA[f].dy)));
  if (!entry) throw new Error("castle: the gate of the keep opens on no cell of the keep");
  const spawn = { x: exit.x + FACING_DELTA[entry].dx, y: exit.y + FACING_DELTA[entry].dy, facing: entry };

  // the king may stand in the only way into a nook of the throne room (the keep with the throne room of three cells): the walls beside that way give
  // way, so that no cell of the keep is shut off by him
  const fixed = new Set<number>([b.idx(throne.x, throne.y), b.idx(king.x, king.y), ...statues.map((s) => b.idx(s.x, s.y))]);
  for (let round = 0; round < 12; round++) {
    const reach = reachable(b, spawn, fixed);
    let carved = false;
    for (let i = 0; i < b.cells.length && !carved; i++) {
      if (b.cells[i] !== CELL.FLOOR || fixed.has(i) || reach.has(i)) continue;
      const x = i % W;
      const y = Math.floor(i / W);
      for (const [dx, dy] of dirs) {
        const wx = x + dx;
        const wy = y + dy;
        if (b.isFloor(wx, wy) || wx < 2 || wy < 2 || wx > W - 3 || wy > H - 3) continue;
        // the wall cell touches the part of the keep that is open to the party
        if (neighbours4(wx, wy).some(([nx, ny]) => reach.has(b.idx(nx, ny)))) {
          b.set(wx, wy, CELL.FLOOR);
          keep.add(b.idx(wx, wy));
          carved = true;
          break;
        }
      }
    }
    if (!carved) break;
  }

  // the two chests of the king and the statue that wants the code word stand in the throne room: the cells nearest the king
  // near means a short walk, not a short line through the rock: the niche across the wall from the king is as far from him as the whole corridor round it
  const walk = new Map<number, number>([[b.idx(king.x, king.y), 0]]);
  for (const q = [king]; q.length > 0; ) {
    const c = q.shift()!;
    for (const [nx, ny] of neighbours4(c.x, c.y)) {
      const i = b.idx(nx, ny);
      if (!b.isFloor(nx, ny) || walk.has(i) || (nx === exit.x && ny === exit.y)) continue;
      walk.set(i, walk.get(b.idx(c.x, c.y))! + 1);
      q.push({ x: nx, y: ny });
    }
  }
  const away = (c: { x: number; y: number }): number => walk.get(b.idx(c.x, c.y)) ?? 999;
  const nearKing = [...keep].map((i) => ({ x: i % W, y: Math.floor(i / W) })).filter((c) => !(c.x === king.x && c.y === king.y) && !(c.x === throne.x && c.y === throne.y) && !(c.x === spawn.x && c.y === spawn.y) && !statues.some((s) => s.x === c.x && s.y === c.y)).sort((p, q) => away(p) - away(q) || p.y - q.y || p.x - q.x);
  const blocked = new Set<number>([b.idx(throne.x, throne.y), b.idx(king.x, king.y), ...statues.map((s) => b.idx(s.x, s.y))]);
  const loose = new Set<number>([b.idx(throne.x, throne.y)]);
  // an object stands in a passage of one cell or shuts the way round a neighbour only as a last resort: the statue at the foot of the throne room's way
  // shut the straight way from the gate to the king (31st playtest, point 4)
  // (the party walks up to the king and speaks to him from a cell beside him, so for the passages he counts as a free cell)
  const openCell = (x: number, y: number): boolean => b.isFloor(x, y) && (!blocked.has(b.idx(x, y)) || (x === king.x && y === king.y)) && !(x === exit.x && y === exit.y);
  const holdsObject = (x: number, y: number): boolean => blocked.has(b.idx(x, y));
  const take = (pool: { x: number; y: number }[], within = 99, free = true): { x: number; y: number } | null => {
    for (const c of pool) {
      if (away(c) > within) break;
      const i = b.idx(c.x, c.y);
      if (blocked.has(i) || (free && blocksPassage(openCell, holdsObject, c.x, c.y))) continue;
      blocked.add(i);
      if (stillOpen(b, spawn, blocked, loose)) return c;
      blocked.delete(i);
    }
    return null;
  };
  // the king's chests take the nooks beside the throne (the plan leaves them for that), then the statue that wants the word stands out of every
  // passage if the keep has room for it near the king, and farther away before it stands in one
  const kingChests = [0, 1].map(() => take(nearKing, 7) ?? take(nearKing, 7, false)).filter((c): c is { x: number; y: number } => c !== null);
  const answer = take(nearKing, 7) ?? take(nearKing, 12) ?? take(nearKing, 7, false);

  // the chests that raise the alarm stand in the niches of the corridors (a floor cell with a single open side), away from the gate and the throne room
  const sides = (x: number, y: number): number => neighbours4(x, y).filter(([nx, ny]) => b.isFloor(nx, ny)).length;
  const niches = [...keep]
    .map((i) => ({ x: i % W, y: Math.floor(i / W) }))
    .filter((c) => !blocked.has(b.idx(c.x, c.y)) && sides(c.x, c.y) === 1 && Math.abs(c.x - spawn.x) + Math.abs(c.y - spawn.y) > 4 && away(c) > 3)
    .sort((p, q) => p.y - q.y || p.x - q.x);
  const alarmChests: { x: number; y: number }[] = [];
  const wanted = rng.range(5, 7);
  for (const c of rng.shuffle(niches)) {
    if (alarmChests.length >= wanted) break;
    const i = b.idx(c.x, c.y);
    blocked.add(i);
    if (stillOpen(b, spawn, blocked, loose)) alarmChests.push(c);
    else blocked.delete(i);
  }

  const castle: CastleLayout = {
    alignment,
    scale,
    coins,
    spells: [...spells],
    word,
    throne,
    king,
    statues,
    answer: answer ?? king,
    kingChests,
    alarmChests,
    door: spawn,
    keep: [...keep],
  };
  return { ...b.finish("fortress", ctx, exit, spawn), castle };
}
