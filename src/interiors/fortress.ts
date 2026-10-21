import type { Rng } from "../core/rng";
import { Builder, manhattan, type BuildContext, type Rect } from "./builder";
import { CELL, type InteriorMap, type TownSite } from "./types";

// The castles of the old game are small compounds under the open sky: Whiteshield 18 x 21 cells, Bloodreign 25 x 22, Dragontooth
// 21 x 34. The generated ones were 80 x 64 with halls of 11 cells and more, a day's walk for a few rooms.
const MIN_LEAF = 7;

interface Node {
  rect: Rect;
  left?: Node;
  right?: Node;
  roomId?: number;
}

function split(node: Node, rng: Rng, depth: number): void {
  const { x, y, w, h } = node.rect;
  const canH = w >= MIN_LEAF * 2;
  const canV = h >= MIN_LEAF * 2;
  if (!canH && !canV) return;
  if (depth >= 3 && rng.chance(300)) return;
  const horizontal = canH && canV ? (w > h * 1.25 ? true : h > w * 1.25 ? false : rng.chance(500)) : canH;
  if (horizontal) {
    const cut = rng.range(MIN_LEAF, w - MIN_LEAF);
    node.left = { rect: { x, y, w: cut, h } };
    node.right = { rect: { x: x + cut, y, w: w - cut, h } };
  } else {
    const cut = rng.range(MIN_LEAF, h - MIN_LEAF);
    node.left = { rect: { x, y, w, h: cut } };
    node.right = { rect: { x, y: y + cut, w, h: h - cut } };
  }
  split(node.left, rng, depth + 1);
  split(node.right, rng, depth + 1);
}

function leaves(node: Node, out: Node[] = []): Node[] {
  if (!node.left || !node.right) out.push(node);
  else {
    leaves(node.left, out);
    leaves(node.right, out);
  }
  return out;
}

function roomIdsUnder(node: Node, out: number[] = []): number[] {
  if (node.roomId !== undefined) out.push(node.roomId);
  if (node.left) roomIdsUnder(node.left, out);
  if (node.right) roomIdsUnder(node.right, out);
  return out;
}

/** One try at the outline: a map of 26 to 34 by 24 to 32 cells cut into leaves, each with a hall carved in it. */
function partition(rng: Rng): { b: Builder; root: Node; rooms: Rect[] } {
  const W = 26 + rng.int(9);
  const H = 24 + rng.int(9);
  const b = new Builder(W, H);
  const root: Node = { rect: { x: 2, y: 2, w: W - 4, h: H - 4 } };
  split(root, rng, 0);

  const rooms: Rect[] = [];
  for (const leaf of leaves(root)) {
    const r = leaf.rect;
    const insetX = rng.range(1, 2);
    const insetY = rng.range(1, 2);
    const room: Rect = { x: r.x + insetX, y: r.y + insetY, w: r.w - insetX * 2, h: r.h - insetY * 2 };
    if (room.w < 4 || room.h < 4) continue;
    leaf.roomId = b.carveRoom([room]);
    rooms.push(room);
  }
  return { b, root, rooms };
}

/**
 * A hall must be at least this wide and deep to hold a vault in a corner (the chamber is 2 x 2, its walls and the way in take a third row and
 * column, and the cell in front of the way in must still be hall). Roomier halls first; a castle of small halls only still gets its vaults.
 */
const VAULT_MIN_HALL = [5, 4] as const;

/** A treasure vault: the corner cell of a hall and the direction from it into the hall. */
interface Vault {
  cx: number;
  cy: number;
  dx: number;
  dy: number;
  /** The cell of the way in and its kind. */
  way: { i: number; j: number; how: "gate" | "door" | "wall" };
  /** Chamber cells (0..1, 0..1): the chest on (0, 0), guards on the others. */
  guards: { i: number; j: number }[];
}

/** Cell (i, j) of a vault block: `i` steps along x and `j` along y, both away from the corner. */
const at = (v: Pick<Vault, "cx" | "cy" | "dx" | "dy">, i: number, j: number) => ({ x: v.cx + v.dx * i, y: v.cy + v.dy * j });

/**
 * Treasure vaults, as in the old castles' locked chambers: in the corner of some halls a 2 x 2 chamber is walled off by an L of five cells, one
 * of them the way in. The chest lies in the far corner of the chamber and its guards stand between it and the way in. Three kinds of way in:
 * a gate that asks before it opens, a locked door that asks whether to break it, and a plain wall that gives way to a perceptive party.
 * Which hall and corner is a function of the stream; halls that are too small, whose corner has a corridor beside it, or that
 * would overlap another vault are left out.
 */
function carveVaults(b: Builder, rng: Rng, rooms: Rect[], entranceRoom: number, takeMiddle: boolean): Vault[] {
  const taken = new Set<number>();
  const vaults: Vault[] = [];
  const want = 2 + rng.int(3);
  const halls = (min: number) => rng.shuffle(rooms.map((_, id) => id).filter((id) => id !== entranceRoom && rooms[id]!.w >= min && rooms[id]!.h >= min));
  const order = [...halls(VAULT_MIN_HALL[0]), ...halls(VAULT_MIN_HALL[1])].filter((id, i, all) => all.indexOf(id) === i);
  for (const id of order) {
    if (vaults.length >= want) break;
    const r = rooms[id]!;
    const corners = rng.shuffle([
      { cx: r.x, cy: r.y, dx: 1, dy: 1 },
      { cx: r.x + r.w - 1, cy: r.y, dx: -1, dy: 1 },
      { cx: r.x, cy: r.y + r.h - 1, dx: 1, dy: -1 },
      { cx: r.x + r.w - 1, cy: r.y + r.h - 1, dx: -1, dy: -1 },
    ]);
    for (const c of corners) {
      let fits = true;
      const cells: number[] = [];
      for (let i = -1; i <= 3 && fits; i++) {
        for (let j = -1; j <= 3 && fits; j++) {
          const p = at(c, i, j);
          if (i === -1 || j === -1) {
            // the hall's own wall: no corridor starts beside the corner
            fits = b.get(p.x, p.y) === CELL.SOLID;
          } else {
            // the hall's middle stays free: its monsters stand there and `Room.cx`, `cy` must be floor
            const middle = !takeMiddle && i <= 2 && j <= 2 && p.x === r.x + Math.floor(r.w / 2) && p.y === r.y + Math.floor(r.h / 2);
            fits = !middle && b.isFloor(p.x, p.y) && b.roomOf[b.idx(p.x, p.y)] === id && !taken.has(b.idx(p.x, p.y));
            cells.push(b.idx(p.x, p.y));
          }
        }
      }
      if (!fits) continue;
      const entries = [{ i: 2, j: 0 }, { i: 2, j: 1 }, { i: 0, j: 2 }, { i: 1, j: 2 }];
      const way = { ...rng.pick(entries), how: (["gate", "door", "wall"] as const)[rng.weightedIndex([40, 35, 25])]! };
      const v: Vault = { ...c, way, guards: [] };
      // the L of walls, then the way in: a floor cell with a door on it, or one more wall cell
      for (let i = 0; i <= 2; i++) {
        for (let j = 0; j <= 2; j++) {
          if (i !== 2 && j !== 2) continue;
          const p = at(v, i, j);
          b.set(p.x, p.y, way.i === i && way.j === j && way.how !== "wall" ? CELL.FLOOR : CELL.SOLID);
        }
      }
      // the cell behind the way in always holds a guard, a second one stands anywhere else but on the chest
      const inner = way.i === 2 ? { i: 1, j: way.j } : { i: way.i, j: 1 };
      const others = [{ i: 1, j: 0 }, { i: 0, j: 1 }, { i: 1, j: 1 }].filter((q) => q.i !== inner.i || q.j !== inner.j);
      v.guards.push(inner);
      if (rng.chance(500)) v.guards.push(rng.pick(others));
      for (const k of cells) taken.add(k);
      vaults.push(v);
      break;
    }
  }
  return vaults;
}

/** The sites of the vaults: the way in, the chest, the guards. The vault farthest from the way into the castle is the main one. */
function vaultSites(vaults: Vault[], from: { x: number; y: number }): TownSite[] {
  const sites: TownSite[] = [];
  const far = (v: Vault) => manhattan(at(v, 0, 0).x, at(v, 0, 0).y, from.x, from.y);
  const main = vaults.reduce((best, v) => (far(v) > far(best) ? v : best), vaults[0]!);
  for (const v of vaults) {
    const way = at(v, v.way.i, v.way.j);
    sites.push({ kind: "vault_way", x: way.x, y: way.y, axis: v.way.i === 2 ? "x" : "y", how: v.way.how });
    const chest = at(v, 0, 0);
    sites.push({ kind: "vault_chest", x: chest.x, y: chest.y, main: v === main });
    v.guards.forEach((g, k) => {
      const p = at(v, g.i, g.j);
      sites.push({ kind: "vault_guard", x: p.x, y: p.y, boss: v === main && k === 0 });
    });
  }
  return sites;
}

/**
 * Castle/fortress interior: binary space partition into halls, siblings joined by straight corridors,
 * large halls get four pillars. More regular than the dungeon, which gives castles their own look. A compact compound of
 * 26 to 34 by 24 to 32 cells, open to the sky (see `INTERIOR_THEMES.fortress`).
 */
export function generateFortress(rng: Rng, ctx: BuildContext): InteriorMap {
  // a compound with fewer than four halls is no castle: partition again (the stream goes on, so the result stays a function of the seed)
  let layout = partition(rng);
  for (let attempt = 0; attempt < 12 && layout.rooms.length < 4; attempt++) layout = partition(rng);
  const { b, root, rooms } = layout;

  const centre = (id: number) => {
    const r = rooms[id]!;
    return { x: r.x + Math.floor(r.w / 2), y: r.y + Math.floor(r.h / 2) };
  };

  // join the two subtrees of every inner node by the closest pair of rooms
  const join = (node: Node): void => {
    if (!node.left || !node.right) return;
    join(node.left);
    join(node.right);
    const a = roomIdsUnder(node.left);
    const c = roomIdsUnder(node.right);
    if (a.length === 0 || c.length === 0) return;
    let bestPair: [number, number] = [a[0]!, c[0]!];
    let bestDist = Infinity;
    for (const i of a) {
      for (const j of c) {
        const d = manhattan(centre(i).x, centre(i).y, centre(j).x, centre(j).y);
        if (d < bestDist) {
          bestDist = d;
          bestPair = [i, j];
        }
      }
    }
    const p = centre(bestPair[0]);
    const q = centre(bestPair[1]);
    b.carveL(p.x, p.y, q.x, q.y, rng.chance(500));
  };
  join(root);

  // a few loops between neighbouring halls
  const loopCount = Math.floor(rooms.length / 4);
  for (let i = 0; i < loopCount; i++) {
    const a = rng.int(rooms.length);
    const near = rooms
      .map((_, idx) => idx)
      .filter((idx) => idx !== a)
      .sort((p, q) => manhattan(centre(a).x, centre(a).y, centre(p).x, centre(p).y) - manhattan(centre(a).x, centre(a).y, centre(q).x, centre(q).y) || p - q)
      .slice(0, 2);
    const j = rng.pick(near);
    b.carveL(centre(a).x, centre(a).y, centre(j).x, centre(j).y, rng.chance(500));
  }

  // pillars in large halls (not in the entrance hall, chosen below)
  const entranceRoom = rooms.reduce((best, r, id) => (r.y + r.h > rooms[best]!.y + rooms[best]!.h ? id : best), 0);
  // a castle of small halls only may give up the middle of one hall for a vault (the room's centre then moves, see below)
  let vaults = carveVaults(b, rng, rooms, entranceRoom, false);
  if (vaults.length === 0) vaults = carveVaults(b, rng, rooms, entranceRoom, true);
  rooms.forEach((r, id) => {
    if (id === entranceRoom || r.w < 8 || r.h < 8) return;
    for (const [px, py] of [
      [r.x + 2, r.y + 2],
      [r.x + r.w - 3, r.y + 2],
      [r.x + 2, r.y + r.h - 3],
      [r.x + r.w - 3, r.y + r.h - 3],
    ] as const) {
      if (b.roomOf[b.idx(px, py)] === id && b.isFloor(px, py)) b.addPillar(px, py);
    }
  });

  const er = rooms[entranceRoom]!;
  const { exit, spawn } = b.pickExit(er.x + Math.floor(er.w / 2), er.y + er.h - 1, (x, y) => b.roomOf[b.idx(x, y)] === entranceRoom && b.isFloor(x - 1, y) && b.isFloor(x + 1, y));
  const map = b.finish("fortress", ctx, exit, spawn);
  // a vault that took the middle of a hall moves the hall's centre to the nearest cell outside the vaults
  const inVault = new Set<number>();
  for (const v of vaults) for (let i = 0; i <= 2; i++) for (let j = 0; j <= 2; j++) inVault.add(b.idx(at(v, i, j).x, at(v, i, j).y));
  for (const room of map.rooms) {
    if (b.isFloor(room.cx, room.cy) && !inVault.has(b.idx(room.cx, room.cy))) continue;
    let best = Infinity;
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        if (!b.isFloor(x, y) || b.roomOf[b.idx(x, y)] !== room.id || inVault.has(b.idx(x, y))) continue;
        const d = Math.abs(x - room.cx) + Math.abs(y - room.cy);
        if (d < best) {
          best = d;
          room.cx = x;
          room.cy = y;
        }
      }
    }
  }
  return { ...map, sites: vaultSites(vaults, spawn) };
}
