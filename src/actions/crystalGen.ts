import type { Rng } from "../core/rng";
import { WALL_CRYSTAL_ITEM, CRYSTAL_HOLDER } from "../data/quest-table";
import { CELL, FACING_DELTA, type Facing, type InteriorMap } from "../interiors/types";
import { BASE_COLORS, simulateCrystals, staticBlockers, type PlacedCrystal, type WallNode } from "./crystals";
import { eligibleChests } from "./machines";
import { CRYSTAL_RUNE_RANGE, crystalsSolvedFlag } from "./quests";
import type { QuestEnv, QuestResult } from "./questGen";
import type { ActionInstance, ParamValue } from "./types";

/**
 * Builds quest_8, "Crystal paths" (quest document 1.10). The puzzle is not a hall: a wall crystal stands in front of a wall at the end of a straight run of floor (a room's wall, the end of a
 * corridor), and the crystals the party sets down have to carry its light from one such run to the next with right angles. So the generator builds the puzzle from the crystals: it picks the
 * cells the solution puts crystals on, puts a source and a target at the walls that end the straight runs through them, and proves the result with the rules of the light (`crystals.ts`),
 * the same ones the game plays by. The party finds exactly as many crystals in the ordinary chests as the solution needs.
 *
 * Levels (document): 1: one source, 3 to 4 crystals; 2: two sources, only one of them leads to the target, 3 to 4; 3: three sources, two of them mixed into the colour the target wants, 4 to
 * 5; 4 and 5: three sources and TWO targets (the mixed colours, e.g. purple and green): the shared colour is spread by a crystal that feeds one mixing crystal for each target, 5 to 6.
 */

const FACINGS: readonly Facing[] = ["N", "E", "S", "W"];
const OPPOSITE: Record<Facing, Facing> = { N: "S", S: "N", E: "W", W: "E" };
const BEARING: Record<Facing, number> = { N: 0, E: 90, S: 180, W: 270 };

interface Cell {
  x: number;
  y: number;
}
/** A place for a wall crystal: the floor cell in front of the wall and the way the light leaves the wall. */
interface Spot extends Cell {
  dir: Facing;
}
interface Plan {
  nodes: { spot: Spot; role: "source" | "target"; color: number }[];
  /** The crystals of the solution in the order they are set down. */
  crystals: Cell[];
  /** How many of the first nodes belong to the solution (the nodes after them are sources that lead nowhere useful). */
  core?: number;
}

const ATTEMPTS = 150;

export function crystalPaths(env: QuestEnv, rng: Rng): QuestResult {
  const map = env.map;
  const W = map.width;
  const H = map.height;
  const idx = (x: number, y: number): number => y * W + x;
  const inside = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < W && y < H;
  const actionCells = new Set(env.actions.map((a) => idx(a.x, a.y)));

  // the floor the party can walk to: the end room and the treasure chambers are floor, but out of reach
  const reach = new Set<number>();
  const queue: Cell[] = [{ x: map.spawn.x, y: map.spawn.y }];
  reach.add(idx(map.spawn.x, map.spawn.y));
  for (let head = 0; head < queue.length; head++) {
    const c = queue[head]!;
    for (const f of FACINGS) {
      const x = c.x + FACING_DELTA[f].dx;
      const y = c.y + FACING_DELTA[f].dy;
      if (!inside(x, y) || reach.has(idx(x, y)) || map.cells[idx(x, y)] !== CELL.FLOOR) continue;
      reach.add(idx(x, y));
      queue.push({ x, y });
    }
  }

  // (`free` leaves out the middle of every room: the rules put a group of monsters or an object there, which would stop a line of light, so no line runs over it)
  /** The cells of wall crystals chosen so far: light passes them, a crystal never stands on one. */
  const nodeCells = new Set<number>();
  const clear = (x: number, y: number): boolean => inside(x, y) && reach.has(idx(x, y)) && env.free(x, y) && !nodeCells.has(idx(x, y));
  const wallAt = (x: number, y: number): boolean => inside(x, y) && map.cells[idx(x, y)] === CELL.SOLID && !actionCells.has(idx(x, y));

  /** The cells a straight run leaves from a cell in a direction: clear floor up to the first thing that stops it. */
  const ray = (c: Cell, dir: Facing): Cell[] => {
    const d = FACING_DELTA[dir];
    const out: Cell[] = [];
    for (let k = 1; k < 120; k++) {
      const x = c.x + d.dx * k;
      const y = c.y + d.dy * k;
      if (!clear(x, y)) break;
      out.push({ x, y });
    }
    return out;
  };

  /** The place for a wall crystal at the wall that ends the run from `c` in `dir`, or null: its light leaves the wall back towards `c`. */
  const wallEnd = (c: Cell, dir: Facing): Spot | null => {
    const run = ray(c, dir);
    const last = run[run.length - 1];
    if (!last) return null;
    const d = FACING_DELTA[dir];
    if (!wallAt(last.x + d.dx, last.y + d.dy) || !env.free(last.x, last.y)) return null;
    return { x: last.x, y: last.y, dir: OPPOSITE[dir] };
  };

  // every place a wall crystal could hang: a free floor cell with a wall behind it and a clear cell in front
  const spots: Spot[] = [];
  for (const i of reach) {
    const x = i % W;
    const y = Math.floor(i / W);
    if (!env.free(x, y)) continue;
    for (const dir of FACINGS) {
      const back = FACING_DELTA[OPPOSITE[dir]];
      if (wallAt(x + back.dx, y + back.dy) && clear(x + FACING_DELTA[dir].dx, y + FACING_DELTA[dir].dy)) spots.push({ x, y, dir });
    }
  }
  if (spots.length < 2) return {};

  /** The fewest crystals that carry light from a cell to a target: a cell on its run counts 1, any other the best of the cells it sees plus itself. */
  const depthField = (target: Spot): Map<number, number> => {
    const depth = new Map<number, number>();
    const q: Cell[] = [];
    // light passes the middle of a room (a monster stands there), but no crystal is set there: the cells that carry a crystal are the free ones
    for (const c of ray(target, target.dir)) {
      if (!env.free(c.x, c.y)) continue;
      depth.set(idx(c.x, c.y), 1);
      q.push(c);
    }
    for (let head = 0; head < q.length; head++) {
      const c = q[head]!;
      const d = depth.get(idx(c.x, c.y))!;
      for (const f of FACINGS) {
        for (const n of ray(c, f)) {
          if (depth.has(idx(n.x, n.y)) || !env.free(n.x, n.y)) continue;
          depth.set(idx(n.x, n.y), d + 1);
          q.push(n);
        }
      }
    }
    return depth;
  };
  const cellOf = (i: number): Cell => ({ x: i % W, y: Math.floor(i / W) });
  /** A chain from `c` (depth `d`) down to the target's run, one cell to the next, nearest first. */
  const descend = (depth: Map<number, number>, c: Cell, r: Rng): Cell[] => {
    const out: Cell[] = [c];
    let d = depth.get(idx(c.x, c.y))!;
    let at = c;
    while (d > 1) {
      const next = r.shuffle(FACINGS.flatMap((f) => ray(at, f))).find((n) => depth.get(idx(n.x, n.y)) === d - 1);
      if (!next) return [];
      out.push(next);
      at = next;
      d--;
    }
    return out;
  };

  const stops = staticBlockers(map, env.actions);

  /** How far apart the things of a solution lie (the longest way between any two of them): a puzzle that fits in one room is no journey through the place. */
  let minSpan = 0;
  const spanOf = (plan: Plan): number => {
    const points: Cell[] = [...plan.nodes.slice(0, plan.core ?? plan.nodes.length).map((n) => n.spot), ...plan.crystals];
    let far = 0;
    for (const a of points) for (const b of points) far = Math.max(far, Math.abs(a.x - b.x) + Math.abs(a.y - b.y));
    return far;
  };

  const proves = (plan: Plan): boolean => {
    if (spanOf(plan) < minSpan) return false;
    // no wall crystal on a cell of the solution (a crystal cannot be set on it), and no two on one cell
    const spotsOf = plan.nodes.map((n) => n.spot);
    if (spotsOf.some((s, i) => plan.crystals.some((c) => c.x === s.x && c.y === s.y) || spotsOf.findIndex((o) => o.x === s.x && o.y === s.y) !== i)) return false;
    const nodes: WallNode[] = plan.nodes.map((n, i) => ({ uid: `n${i}`, x: n.spot.x, y: n.spot.y, dir: n.spot.dir, role: n.role, color: n.color }));
    // the party sets its crystals down in any order: the solution has to light the targets whatever the order (a light that needs one crystal to be set before another would be a trap)
    const orders: Cell[][] = [plan.crystals, [...plan.crystals].reverse(), rng.shuffle([...plan.crystals]), rng.shuffle([...plan.crystals])];
    return orders.every((order) => simulateCrystals(nodes, order.map((c, i) => ({ x: c.x, y: c.y, seq: i + 1 })), stops).solved);
  };
  const sameCell = (a: Cell, b: Cell): boolean => a.x === b.x && a.y === b.y;
  const distinct = (cells: Cell[]): boolean => cells.every((c, i) => cells.findIndex((o) => sameCell(o, c)) === i);

  // ------------------------------------------------------------ the levels
  const colors = rng.shuffle([...BASE_COLORS]);

  /** Levels 1 and 2: one chain of `lo` to `hi` crystals from a source to the target (level 2 adds a source that leads nowhere useful). */
  const single = (decoy: boolean, lo: number, hi: number): Plan | null => {
    for (const target of rng.shuffle(spots).slice(0, ATTEMPTS)) {
      nodeCells.add(idx(target.x, target.y));
      const depth = depthField(target);
      for (const source of rng.shuffle(spots).slice(0, 80)) {
        if (sameCell(source, target) || nodeCells.has(idx(source.x, source.y))) continue;
        const run = ray(source, source.dir);
        let best: Cell | null = null;
        for (const c of run) {
          const d = depth.get(idx(c.x, c.y));
          if (d !== undefined && d >= lo && d <= hi && (!best || d < depth.get(idx(best.x, best.y))!)) best = c;
        }
        if (!best) continue;
        const chain = descend(depth, best, rng);
        if (chain.length === 0 || !distinct(chain)) continue;
        const plan: Plan = { nodes: [{ spot: source, role: "source", color: colors[0]! }, { spot: target, role: "target", color: colors[0]! }], crystals: chain, core: 2 };
        nodeCells.add(idx(source.x, source.y));
        if (decoy) {
          const other = rng.shuffle(spots).slice(0, 40).find((s) => !nodeCells.has(idx(s.x, s.y)) && !sameCell(s, source) && !sameCell(s, target) && proves({ ...plan, nodes: [...plan.nodes, { spot: s, role: "source", color: colors[1]! }] }));
          if (!other) {
            nodeCells.delete(idx(source.x, source.y));
            continue;
          }
          plan.nodes.push({ spot: other, role: "source", color: colors[1]! });
        }
        if (proves(plan)) return plan;
        nodeCells.delete(idx(source.x, source.y));
      }
      nodeCells.delete(idx(target.x, target.y));
    }
    return null;
  };

  /** A cell `a` steps from `from` in `dir` that a crystal can stand on, with the cells in between clear: the feeder of a mixing crystal. */
  const at = (from: Cell, dir: Facing, a: number): Cell | null => {
    const run = ray(from, dir);
    return run.length >= a && env.free(run[a - 1]!.x, run[a - 1]!.y) ? run[a - 1]! : null;
  };
  /** A wall crystal that shines at `c`, in any direction that is not `except`. */
  const feedFrom = (c: Cell, except: Facing[], r: Rng): Spot | null => {
    for (const f of r.shuffle(FACINGS.filter((d) => !except.includes(d)))) {
      const s = wallEnd(c, f);
      if (s && !nodeCells.has(idx(s.x, s.y))) return s;
    }
    return null;
  };

  /** Level 3: two sources mixed in a crystal `M` that is `total - 2` crystals from the target; a third source is no part of the solution. */
  const mixed = (total: number): Plan | null => {
    const j = total - 2;
    for (const target of rng.shuffle(spots).slice(0, ATTEMPTS)) {
      nodeCells.add(idx(target.x, target.y));
      const depth = depthField(target);
      const mids = rng.shuffle([...depth.entries()].filter(([, d]) => d === j).map(([i]) => cellOf(i))).slice(0, 40);
      for (const m of mids) {
        const chain = descend(depth, m, rng);
        if (chain.length !== j) continue;
        for (const [u1, u2] of rng.shuffle(FACINGS.flatMap((a) => FACINGS.filter((b) => b !== a).map((b) => [a, b] as const)))) {
          for (let a = 1; a <= 6; a++) {
            const pa = at(m, u1, a);
            const pb = at(m, u2, a);
            if (!pa || !pb) break;
            const sa = feedFrom(pa, [OPPOSITE[u1]], rng);
            if (!sa) continue;
            nodeCells.add(idx(sa.x, sa.y));
            const sb = feedFrom(pb, [OPPOSITE[u2]], rng);
            if (!sb) {
              nodeCells.delete(idx(sa.x, sa.y));
              continue;
            }
            nodeCells.add(idx(sb.x, sb.y));
            const plan: Plan = {
              nodes: [
                { spot: sa, role: "source", color: colors[0]! },
                { spot: sb, role: "source", color: colors[1]! },
                { spot: target, role: "target", color: colors[0]! | colors[1]! },
              ],
              crystals: [pa, pb, ...chain],
              core: 3,
            };
            if (distinct(plan.crystals)) {
              const decoy = rng.shuffle(spots).slice(0, 40).find((s) => !nodeCells.has(idx(s.x, s.y)) && proves({ ...plan, nodes: [...plan.nodes, { spot: s, role: "source", color: colors[2]! }] }));
              if (decoy) {
                plan.nodes.push({ spot: decoy, role: "source", color: colors[2]! });
                return plan;
              }
            }
            nodeCells.delete(idx(sa.x, sa.y));
            nodeCells.delete(idx(sb.x, sb.y));
          }
        }
      }
      nodeCells.delete(idx(target.x, target.y));
    }
    return null;
  };

  /**
   * Levels 4 and 5: two targets, which want `s|o1` and `s|o2` (the colour `s` is in both: purple and green share blue). A light cannot be split by mixing, so the party sets a crystal `V` that
   * the source of `s` shines at and that two mixing crystals see at once: `M1` also sees the feeder of `o1`, `M2` the feeder of `o2`, each at the same distance as `V`.
   */
  const spread = (total: number): Plan | null => {
    const [s, o1, o2] = colors as [number, number, number];
    const js: [number, number][] = total === 5 ? [[1, 1]] : [[1, 2], [2, 1]];
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      const t1 = rng.pick(spots);
      const t2 = rng.pick(spots);
      if (sameCell(t1, t2) || Math.abs(t1.x - t2.x) + Math.abs(t1.y - t2.y) < 4) continue;
      nodeCells.add(idx(t1.x, t1.y));
      nodeCells.add(idx(t2.x, t2.y));
      const d1 = depthField(t1);
      const d2 = depthField(t2);
      const [j1, j2] = rng.pick(js);
      const m1s = rng.shuffle([...d1.entries()].filter(([, d]) => d === j1).map(([i]) => cellOf(i))).slice(0, 25);
      let found: Plan | null = null;
      search: for (const m1 of m1s) {
        for (const u of rng.shuffle([...FACINGS])) {
          const toV = ray(m1, u);
          for (let a1 = 1; a1 <= Math.min(6, toV.length); a1++) {
            const v = toV[a1 - 1]!;
            if (!env.free(v.x, v.y)) continue;
            for (const u2 of FACINGS) {
              if (u2 === OPPOSITE[u]) continue;
              const toM2 = ray(v, u2);
              for (let a2 = 1; a2 <= Math.min(6, toM2.length); a2++) {
                const m2 = toM2[a2 - 1]!;
                if (d2.get(idx(m2.x, m2.y)) !== j2 || sameCell(m2, m1)) continue;
                for (const w1 of FACINGS) {
                  if (w1 === u) continue;
                  const pr = at(m1, w1, a1);
                  if (!pr) continue;
                  for (const w2 of FACINGS) {
                    if (w2 === OPPOSITE[u2]) continue;
                    const py = at(m2, w2, a2);
                    if (!py) continue;
                    const chain1 = descend(d1, m1, rng);
                    const chain2 = descend(d2, m2, rng);
                    const crystals = [v, pr, py, ...chain1, ...chain2];
                    if (chain1.length !== j1 || chain2.length !== j2 || !distinct(crystals)) continue;
                    const sv = feedFrom(v, [u, OPPOSITE[u2]], rng);
                    if (!sv) continue;
                    nodeCells.add(idx(sv.x, sv.y));
                    const sr = feedFrom(pr, [OPPOSITE[w1]], rng);
                    if (sr) nodeCells.add(idx(sr.x, sr.y));
                    const sy = sr ? feedFrom(py, [OPPOSITE[w2]], rng) : null;
                    if (sr && sy) {
                      const plan: Plan = {
                        nodes: [
                          { spot: sv, role: "source", color: s },
                          { spot: sr, role: "source", color: o1 },
                          { spot: sy, role: "source", color: o2 },
                          { spot: t1, role: "target", color: s | o1 },
                          { spot: t2, role: "target", color: s | o2 },
                        ],
                        crystals,
                        core: 5,
                      };
                      if (proves(plan)) {
                        found = plan;
                        break search;
                      }
                    }
                    nodeCells.delete(idx(sv.x, sv.y));
                    if (sr) nodeCells.delete(idx(sr.x, sr.y));
                  }
                }
              }
            }
          }
        }
      }
      if (found) return found;
      nodeCells.delete(idx(t1.x, t1.y));
      nodeCells.delete(idx(t2.x, t2.y));
    }
    return null;
  };

  const tier = Math.min(5, Math.max(1, env.tier));
  const pick = (): Plan | null => {
    if (tier >= 4) return spread(rng.chance(500) ? 5 : 6) ?? spread(5);
    if (tier === 3) return mixed(rng.chance(500) ? 4 : 5) ?? mixed(4);
    return single(tier === 2, 3, 4);
  };
  // a place the puzzle of its level does not fit (a narrow cave) gets the next simpler one, so that no place is left without a way to its end room
  // (the more spread out the better: the demand eases step by step until something fits, so that a narrow cave still gets its puzzle)
  let plan: Plan | null = null;
  for (const span of [24, 14, 6, 0]) {
    minSpan = span;
    nodeCells.clear();
    plan = pick();
    if (plan) break;
  }
  for (let level = tier; !plan && level > 1; ) {
    nodeCells.clear();
    level--;
    plan = level >= 4 ? spread(5) : level === 3 ? mixed(4) : single(level === 2, 3, 4);
  }
  if (!plan) {
    nodeCells.clear();
    plan = single(false, 2, 5);
  }
  if (!plan) return {};

  // the cells the solution runs over stay clear of the ordinary rules
  const reserveAll = (): void => {
    const nodes: WallNode[] = plan!.nodes.map((n, i) => ({ uid: `n${i}`, x: n.spot.x, y: n.spot.y, dir: n.spot.dir, role: n.role, color: n.color }));
    const res = simulateCrystals(nodes, plan!.crystals.map((c, i) => ({ x: c.x, y: c.y, seq: i + 1 })), stops);
    for (const l of res.links) {
      const dx = Math.sign(l.to.x - l.from.x);
      const dy = Math.sign(l.to.y - l.from.y);
      for (let x = l.from.x, y = l.from.y; ; x += dx, y += dy) {
        // (not the middle of a room: its group of monsters stands there, and a monster in the way is part of the puzzle)
        if (env.free(x, y)) env.reserve(x, y);
        if (x === l.to.x && y === l.to.y) break;
      }
    }
    for (const c of plan!.crystals) env.reserve(c.x, c.y);
  };
  const first = plan.nodes.findIndex((n) => n.role === "target");
  plan.nodes.forEach((n, i) => {
    const params: Record<string, ParamValue> = { item: WALL_CRYSTAL_ITEM, role: n.role, color: n.color, bearing: BEARING[n.spot.dir], facing: n.spot.dir };
    // the first target knows the whole solution (for Identify and the check): how many crystals it takes and where they go
    if (i === first) {
      params.crystals = plan!.crystals.length;
      params.solution = plan!.crystals.map((c) => `${c.x},${c.y}`).join(";");
    }
    env.place({ uid: env.uid("crystal"), kind: "crystal", x: n.spot.x, y: n.spot.y, params });
  });
  reserveAll();
  // 59th playtest, point 1 (Shaft of Falelaa, pearl-wood-803): the target may be anywhere in the place, so the end room that opens when it is lit can be a long way off, and the party hears the stone
  // and sees nothing. An end room farther than `CRYSTAL_RUNE_RANGE` cells from a target gets runes next to that target (Quest 2 and 3 have them too): they appear when the paths are solved and take the party in.
  const end = map.dungeon?.endRoom;
  if (end) {
    const gap = (c: Cell): number => Math.max(end.x - c.x, c.x - (end.x + end.w - 1), end.y - c.y, c.y - (end.y + end.h - 1), 0);
    const flag = crystalsSolvedFlag(map.key);
    for (const t of plan.nodes.filter((n) => n.role === "target" && gap(n.spot) > CRYSTAL_RUNE_RANGE)) {
      const near = [...reach]
        .map((i) => ({ x: i % W, y: Math.floor(i / W) }))
        .filter((c) => Math.max(Math.abs(c.x - t.spot.x), Math.abs(c.y - t.spot.y)) <= 3 && !sameCell(c, t.spot) && env.free(c.x, c.y))
        .sort((a, b) => Math.max(Math.abs(a.x - t.spot.x), Math.abs(a.y - t.spot.y)) - Math.max(Math.abs(b.x - t.spot.x), Math.abs(b.y - t.spot.y)) || a.y - b.y || a.x - b.x);
      const rune = (c: Cell): ActionInstance => ({ uid: env.uid("rune"), kind: "rune", x: c.x, y: c.y, params: { need: "crystals", item: 73, flag } });
      if (near.some((c) => env.place(rune(c)))) continue;
      // 62nd playtest: a target at the end of a corridor has no cell near it that is not a passage of one cell, and without the rune the party that has lit the paths could never go in (p:8:0:113 of
      // the world "alpha", p:4:0:136): a rune does not block, so it may stand in a passage then, on the nearest floor cell that nothing holds
      const spare = [...reach]
        .map((i) => ({ x: i % W, y: Math.floor(i / W) }))
        .filter((c) => Math.max(Math.abs(c.x - t.spot.x), Math.abs(c.y - t.spot.y)) <= 3 && !sameCell(c, t.spot) && Math.max(Math.abs(c.x - map.spawn.x), Math.abs(c.y - map.spawn.y)) > 1)
        .sort((a, b) => Math.max(Math.abs(a.x - t.spot.x), Math.abs(a.y - t.spot.y)) - Math.max(Math.abs(b.x - t.spot.x), Math.abs(b.y - t.spot.y)) || a.y - b.y || a.x - b.x);
      // (the cells of the light lines are reserved, and in a corridor they are all there is: a rune on one of them hinders nobody, only a crystal of the solution or another object must not stand there)
      const taken = new Set([...env.actions.map((a) => idx(a.x, a.y)), ...plan.crystals.map((c) => idx(c.x, c.y))]);
      const cell = spare.find((c) => !taken.has(idx(c.x, c.y)) && map.cells[idx(c.x, c.y)] === CELL.FLOOR);
      if (cell) env.actions.push(rune(cell));
    }
  }
  const count = plan.crystals.length;
  return { finish: () => hideCrystals(env.map, env.actions, count, rng) };
}

/** Hides the crystals the solution needs in the ordinary chests of the place, spread over as many as there are (the others may hold a coin, a skull or a pearl as well). */
export function hideCrystals(map: InteriorMap, actions: ActionInstance[], count: number, rng: Rng): void {
  const chests = eligibleChests(map, actions);
  if (chests.length === 0) return;
  const order = rng.shuffle(chests);
  for (let i = 0; i < count; i++) {
    const chest = order[i % order.length]!;
    const have = typeof chest.params.extra === "string" && chest.params.extra !== "" ? `${String(chest.params.extra)},` : "";
    (chest.params as Record<string, ParamValue>).extra = `${have}${CRYSTAL_HOLDER}`;
  }
}
