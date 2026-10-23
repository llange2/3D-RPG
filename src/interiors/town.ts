import type { Rng } from "../core/rng";
import { TOWN_BLUEPRINTS, type TownBlueprint } from "../data/town-blueprints";
import { isFunctional } from "../data/item-rules";
import { Builder, type BuildContext } from "./builder";
import { blocksPassage, openSquare, splitsRing } from "./passage";
import { CELL, FACING_DELTA, type Facing, type InteriorMap, type Lot, type TownSite } from "./types";

/** Services every town offers (the rules hand them out to the shops, see `data/rules/town.json`). */
const SHOPS_WANTED = 7;
/** Shops are never closer to each other than this (cells, manhattan), so a street is not one row of signs. */
const SHOP_GAP = 3;
const SIDES: Facing[] = ["N", "E", "S", "W"];
const opposite = (f: Facing): Facing => (f === "N" ? "S" : f === "S" ? "N" : f === "E" ? "W" : "E");

/** The id of the start town: the only one with the Crow's perch (`world.ts`, `anchorOf(0, 0)`). */
export const START_TOWN_KEY = "p:0:0:0:0";

/** Who guards the chests behind a town's gates: the monsters the old towns have there (Bubble Men and Moose Rats in Fountain Head, ... Mini Dragons in Blistering Heights). */
const TOWN_GUARDS: Record<number, number[]> = { 1: [4, 46], 2: [64, 80], 3: [49, 39], 4: [29, 49], 5: [44, 25] };
/** Chance (permille) that a pocket with chests is shut by a gate, and the largest pocket (cells) that is worth a gate. */
const CAGE_CHANCE = 550;
const CAGE_MAX_CELLS = 10;

/** Standing objects of the user's list that a town may have as scenery (all are in `data/rules/town.json` `dead_decor` too), and the walkable one (fractured vessels). */
const TOWN_SCENERY = [12, 13, 16, 27, 28, 29, 32, 34, 61, 69, 91, 94, 95, 119];
const VESSELS = 83;
/** The job master of the old Fountain Head (persona 49, "Work for a week"): every town of the first tier has one. */
const JOB_MASTER = 49;
/** How far from the way in (steps) a dead end may be for the portal; beyond that a niche is dug into a wall near the way in. */
const PORTAL_REACH = 14;

/** The portal (old item 3): every town has one, a few steps from the way in. */
const PORTAL_ITEM = 3;

/** The ground plan of a tier: tier 1 is Fountain Head, tier 5 Blistering Heights (`data/town-blueprints.ts`). */
export function blueprintFor(tier: number): TownBlueprint {
  return TOWN_BLUEPRINTS.find((b) => b.tier === Math.min(5, Math.max(1, tier))) ?? TOWN_BLUEPRINTS[0]!;
}

/**
 * A town after the hand-built towns of the old game, one ground plan per tier: Fountain Head (tier 1), Baywatch, Wildabar, Swamp
 * Town and Blistering Heights (tier 5). They are not square and not symmetrical: one-cell streets that wind between walls, shops and
 * people along them, dead-end alcoves for chests. The plan is turned and mirrored by chance (eight ways), and its way out is one of the
 * old ways out; which shop is which, who stands where and what the chests hold is decided by the rules of the town.
 */
export function generateTown(rng: Rng, ctx: BuildContext): InteriorMap {
  const plan = blueprintFor(ctx.tier);
  const turns = rng.int(4);
  const mirror = rng.chance(500);
  const planW = Math.max(...plan.rows.map((r) => r.length));
  const planH = plan.rows.length;
  const width = turns % 2 === 1 ? planH : planW;
  const height = turns % 2 === 1 ? planW : planH;

  /** Plan cell -> map cell. */
  const place = (px: number, py: number): [number, number] => {
    let x = mirror ? planW - 1 - px : px;
    let y = py;
    let w = planW;
    let h = planH;
    for (let t = 0; t < turns; t++) {
      [x, y] = [h - 1 - y, x];
      [w, h] = [h, w];
    }
    return [x, y];
  };

  const b = new Builder(width, height);
  plan.rows.forEach((row, py) => {
    for (let px = 0; px < row.length; px++) {
      const c = row[px];
      if (c !== "#" && c !== ".") continue;
      const [x, y] = place(px, py);
      b.set(x, y, c === "#" ? CELL.BUILDING : CELL.FLOOR);
    }
  });

  // the wall that faces the outside is the city wall (plain stone), the walls between the streets are houses
  const outside = new Uint8Array(width * height);
  const queue: number[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if ((x === 0 || y === 0 || x === width - 1 || y === height - 1) && b.get(x, y) === CELL.SOLID) {
        outside[y * width + x] = 1;
        queue.push(y * width + x);
      }
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const x = queue[head]! % width;
    const y = (queue[head]! - x) / width;
    for (const f of SIDES) {
      const nx = x + FACING_DELTA[f].dx;
      const ny = y + FACING_DELTA[f].dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height || outside[ny * width + nx] || b.get(nx, ny) !== CELL.SOLID) continue;
      outside[ny * width + nx] = 1;
      queue.push(ny * width + nx);
    }
  }
  const touchesOutside = (x: number, y: number): boolean => {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height || outside[ny * width + nx]) return true;
      }
    }
    return false;
  };
  const walls: [number, number][] = [];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (b.get(x, y) === CELL.BUILDING) walls.push([x, y]);
  for (const [x, y] of walls) if (touchesOutside(x, y)) b.set(x, y, CELL.SOLID);

  const isWall = (x: number, y: number) => b.get(x, y) !== CELL.FLOOR;
  /** The two sides of a wall, along it. */
  const along = (f: Facing): Facing[] => (f === "N" || f === "S" ? ["W", "E"] : ["N", "S"]);
  /**
   * A door goes in a wall that goes on to both sides: no free cell beside the wall cell that carries it (a wall piece standing alone between two
   * streets, or at the end of a house, gives a door with the street round the corner; the user's rule, 23rd playtest).
   */
  const wallGoesOn = (wx: number, wy: number, back: Facing): boolean => along(back).every((f) => !b.isFloor(wx + FACING_DELTA[f].dx, wy + FACING_DELTA[f].dy));

  // the way out: one of the old ways out, with the wall behind it and the street in front
  const exitWays = plan.exits
    .map(([ex, ey]) => place(ex, ey))
    .flatMap(([x, y]) =>
      SIDES.filter((back) => isWall(x + FACING_DELTA[back].dx, y + FACING_DELTA[back].dy) && b.isFloor(x - FACING_DELTA[back].dx, y - FACING_DELTA[back].dy)).map((back) => ({ x, y, back })),
    );
  if (exitWays.length === 0) throw new Error(`town ${plan.id}: no usable way out`);
  const flanked = exitWays.filter((e) => wallGoesOn(e.x + FACING_DELTA[e.back].dx, e.y + FACING_DELTA[e.back].dy, e.back));
  const way = rng.pick(flanked.length > 0 ? flanked : exitWays);
  const exit = { x: way.x, y: way.y };
  const spawn = { x: way.x - FACING_DELTA[way.back].dx, y: way.y - FACING_DELTA[way.back].dy, facing: opposite(way.back) };

  // ---------------------------------------------------------------- small variations of the plan
  // The streets are those of the old town, but no two towns of a tier are the same: a few walls are knocked through (a shortcut, a loop to walk
  // round), a few dead ends are filled in and a few niches dug into the houses. The way in and out and everything the plan holds (shops,
  // people, chests, scenery) with the cells beside it stay as they are.
  const untouched = new Set<number>();
  const keepClear = (x: number, y: number, r: number): void => {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) untouched.add((y + dy) * width + x + dx);
  };
  keepClear(exit.x, exit.y, 2);
  keepClear(spawn.x, spawn.y, 2);
  for (const [px, py] of plan.services) keepClear(...place(px, py), 1);
  for (const o of [...plan.talents, ...plan.chests, ...plan.decor]) keepClear(...place(o.x, o.y), 1);
  const open4 = (x: number, y: number): number => SIDES.filter((f) => b.isFloor(x + FACING_DELTA[f].dx, y + FACING_DELTA[f].dy)).length;
  const interior = (x: number, y: number): boolean => x > 0 && y > 0 && x < width - 1 && y < height - 1 && !untouched.has(y * width + x);
  const cellsWhere = (test: (x: number, y: number) => boolean): [number, number][] => {
    const out: [number, number][] = [];
    for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) if (interior(x, y) && test(x, y)) out.push([x, y]);
    return rng.shuffle(out);
  };
  // a house wall one cell thick with a street on each side: knocked through it is a short cut between the two
  const thin = (x: number, y: number): boolean =>
    b.get(x, y) === CELL.BUILDING &&
    ((b.isFloor(x, y - 1) && b.isFloor(x, y + 1) && !b.isFloor(x - 1, y) && !b.isFloor(x + 1, y)) || (b.isFloor(x - 1, y) && b.isFloor(x + 1, y) && !b.isFloor(x, y - 1) && !b.isFloor(x, y + 1)));
  let knocks = rng.range(1, 3);
  for (const [x, y] of cellsWhere(thin)) {
    if (knocks === 0) break;
    if (!thin(x, y)) continue; // an earlier cut next to it changed the picture
    b.set(x, y, CELL.FLOOR);
    knocks--;
  }
  // a dead end filled in is a shorter street
  let fills = rng.range(0, 2);
  for (const [x, y] of cellsWhere((cx, cy) => b.isFloor(cx, cy) && open4(cx, cy) === 1)) {
    if (fills === 0) break;
    if (open4(x, y) !== 1) continue;
    b.set(x, y, CELL.BUILDING);
    fills--;
  }
  // a niche dug into a house: a new dead end, one cell deep, that nothing else touches
  let niches = rng.range(1, 3);
  for (const [x, y] of cellsWhere((cx, cy) => b.get(cx, cy) === CELL.BUILDING && open4(cx, cy) === 1)) {
    if (niches === 0) break;
    if (b.get(x, y) !== CELL.BUILDING || open4(x, y) !== 1) continue;
    const parent = SIDES.find((f) => b.isFloor(x + FACING_DELTA[f].dx, y + FACING_DELTA[f].dy))!;
    // the two corners behind it are wall as well, so it stays a niche
    const d = FACING_DELTA[opposite(parent)];
    const flank = d.dx === 0 ? [[-1, 0], [1, 0]] : [[0, -1], [0, 1]];
    const corners = flank.every(([fx, fy]) => !b.isFloor(x + d.dx + fx!, y + d.dy + fy!));
    if (!corners) continue;
    b.set(x, y, CELL.FLOOR);
    niches--;
  }

  // cells that hold something other than a shop
  const sites: TownSite[] = [];
  const used = new Set<number>([exit.y * width + exit.x, spawn.y * width + spawn.x]);
  const claim = (px: number, py: number): [number, number] | null => {
    const [x, y] = place(px, py);
    if (!b.isFloor(x, y) || used.has(y * width + x)) return null;
    used.add(y * width + x);
    return [x, y];
  };
  for (const t of plan.talents) {
    const at = claim(t.x, t.y);
    if (at) sites.push({ kind: "talent", x: at[0], y: at[1], talent: t.talent });
  }
  for (const c of plan.chests) {
    const at = claim(c.x, c.y);
    // a real chest always holds something; storage equipment and gravestones were chests of the old towns, here they may be just scenery
    if (at) sites.push({ kind: isFunctional(c.item) ? "chest" : "loose", x: at[0], y: at[1], item: c.item });
  }
  // one fountain heals (the one nearest the middle of the town), the others are decoration
  const middle = { x: (width - 1) / 2, y: (height - 1) / 2 };
  const fountains = plan.decor.filter((d) => d.item === 2 || d.item === 89).map((d) => ({ d, at: place(d.x, d.y) }));
  fountains.sort((p, q) => Math.hypot(p.at[0] - middle.x, p.at[1] - middle.y) - Math.hypot(q.at[0] - middle.x, q.at[1] - middle.y));
  /** The scenery of the old plan: it may stand in a street of one cell, which no object may now (see below). */
  const planDecor: TownSite[] = [];
  for (const [i, f] of fountains.entries()) {
    const at = claim(f.d.x, f.d.y);
    if (!at) continue;
    const site: TownSite = { kind: i === 0 ? "fountain" : "decor", x: at[0], y: at[1], item: f.d.item };
    sites.push(site);
    if (i > 0) planDecor.push(site);
  }
  for (const d of plan.decor) {
    if (d.item === 2 || d.item === 89) continue;
    const at = claim(d.x, d.y);
    if (!at) continue;
    const site: TownSite = { kind: "decor", x: at[0], y: at[1], item: d.item };
    sites.push(site);
    planDecor.push(site);
  }

  // the shops: the old plan's, then as many more as it takes to have one for every service. A shop is a street cell with a wall behind it,
  // which carries the door (and the sign over the cell); stepping onto the cell enters it
  const lots: Lot[] = [];
  const shopCells: [number, number][] = [];
  const addShop = (x: number, y: number, strict = true): boolean => {
    const backs = SIDES.filter((s) => isWall(x + FACING_DELTA[s].dx, y + FACING_DELTA[s].dy) && (!strict || wallGoesOn(x + FACING_DELTA[s].dx, y + FACING_DELTA[s].dy, s)));
    if (backs.length === 0) return false;
    // a wall with a street in front of it (the cell opposite is open) is the better door; otherwise any wall will do
    const open = backs.filter((s) => b.isFloor(x - FACING_DELTA[s].dx, y - FACING_DELTA[s].dy));
    const back = rng.pick(open.length > 0 ? open : backs);
    const wall: [number, number] = [x + FACING_DELTA[back].dx, y + FACING_DELTA[back].dy];
    // the door is drawn on a house wall: the city wall at the edge takes it as well, it is a wall cell either way
    if (b.get(wall[0], wall[1]) === CELL.SOLID) b.set(wall[0], wall[1], CELL.BUILDING);
    lots.push({ id: lots.length, x, y, w: 1, h: 1, door: { x, y, facing: opposite(back) }, inline: true });
    shopCells.push([x, y]);
    return true;
  };
  // the cells around the way in and out are kept clear of anything (`protectedCells` in the anchors)
  const nearStart = (x: number, y: number) => [exit, spawn].some((c) => Math.abs(c.x - x) <= 1 && Math.abs(c.y - y) <= 1);
  for (const [px, py] of plan.services) {
    const [x, y] = place(px, py);
    if (nearStart(x, y)) continue;
    const at = claim(px, py);
    if (at && !addShop(at[0], at[1])) used.delete(at[1] * width + at[0]);
  }
  if (lots.length < SHOPS_WANTED) {
    const free: [number, number][] = [];
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        if (!b.isFloor(x, y) || used.has(y * width + x)) continue;
        if (nearStart(x, y)) continue;
        free.push([x, y]);
      }
    }
    const order = rng.shuffle(free);
    // as far apart as the plan allows: the gap shrinks until every service has a shop
    // (a plan whose walls leave no better door is given one in any wall at the end, so that every service has its shop)
    for (const strict of [true, false]) {
      for (const gap of [SHOP_GAP, 2, 1]) {
        for (const [x, y] of order) {
          if (lots.length >= SHOPS_WANTED) break;
          if (used.has(y * width + x)) continue;
          if (shopCells.some(([sx, sy]) => Math.abs(sx - x) + Math.abs(sy - y) < gap)) continue;
          // next to a talker or a chest is too close as well: the door of a shop must not be hidden behind a person
          if (sites.some((s) => Math.abs(s.x - x) + Math.abs(s.y - y) < 2)) continue;
          if (addShop(x, y, strict)) used.add(y * width + x);
        }
      }
    }
  }

  // ---------------------------------------------------------------- what the plan lacks and the pockets behind gates
  const at = (x: number, y: number) => y * width + x;
  const floorN = (x: number, y: number): Facing[] => SIDES.filter((f) => b.isFloor(x + FACING_DELTA[f].dx, y + FACING_DELTA[f].dy));
  const shopAt = new Set(shopCells.map(([x, y]) => at(x, y)));
  /** Cells that something solid stands on (a person, a chest, a statue, a perch): the party can neither enter nor pass them. */
  const blockers = new Set<number>(sites.map((s) => at(s.x, s.y)));

  /** The floor the party can reach from the way in when `shut` cells cannot be entered. */
  const reachFrom = (shut: ReadonlySet<number>): Uint8Array => {
    const seen = new Uint8Array(width * height);
    const stack = [at(spawn.x, spawn.y)];
    seen[stack[0]!] = 1;
    while (stack.length > 0) {
      const i = stack.pop()!;
      const x = i % width;
      const y = (i - x) / width;
      for (const f of SIDES) {
        const nx = x + FACING_DELTA[f].dx;
        const ny = y + FACING_DELTA[f].dy;
        const ni = at(nx, ny);
        if (!b.isFloor(nx, ny) || seen[ni] || shut.has(ni)) continue;
        seen[ni] = 1;
        stack.push(ni);
      }
    }
    return seen;
  };
  const access = (seen: Uint8Array, j: number): boolean => {
    const jx = j % width;
    const jy = (j - jx) / width;
    return SIDES.some((f) => seen[at(jx + FACING_DELTA[f].dx, jy + FACING_DELTA[f].dy)] === 1);
  };
  const countOf = (seen: Uint8Array): number => seen.reduce((n, v) => n + v, 0);
  /** Cells that hold something the party can walk over (a vessel, a column): not a wall for the streets, but an object that a passage must leave room round. */
  const objects = new Set<number>();
  /**
   * Would an object on this cell cut the ring of the eight cells round it in two (`passage.ts`)? Then the cell is part of a passage (a street of
   * one cell, a bend, a gap between two squares) that the object would shut. Solid things and objects that can be walked over count alike.
   */
  const splitsHere = (x: number, y: number): boolean =>
    blocksPassage((cx, cy) => b.isFloor(cx, cy) && !blockers.has(at(cx, cy)) && !objects.has(at(cx, cy)), (cx, cy) => blockers.has(at(cx, cy)) || objects.has(at(cx, cy)), x, y);
  /**
   * Would something solid on this cell keep the streets and the objects as reachable as they are now? (The old plans have pockets of
   * their own, so this compares with the state before, it does not demand that everything can be reached.)
   */
  const fits = (x: number, y: number): boolean => {
    const i = at(x, y);
    if (!b.isFloor(x, y) || used.has(i) || nearStart(x, y)) return false;
    // a street that goes on on both sides of the cell is a passage, and a passage is never shut, however long the way round (the portal and a
    // lectern once stood across the three-wide gap between two squares of the start town)
    if (splitsHere(x, y)) return false;
    // not next to a shop: a person must not hide the door of one
    if (shopCells.some(([sx, sy]) => Math.abs(sx - x) + Math.abs(sy - y) < 2)) return false;
    const before = reachFrom(blockers);
    if (!before[i]) return false;
    const shut = new Set(blockers).add(i);
    const after = reachFrom(shut);
    if (countOf(after) !== countOf(before) - 1 || !access(after, i)) return false;
    for (const j of blockers) if (access(before, j) && !access(after, j)) return false;
    return true;
  };
  /** Dead ends first (an object there blocks nothing), nearest to the way in; then any cell that fits. */
  const spots = (): [number, number][] => {
    const cells: [number, number][] = [];
    for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) if (b.isFloor(x, y)) cells.push([x, y]);
    const dead = cells.filter(([x, y]) => floorN(x, y).length === 1);
    const rest = cells.filter(([x, y]) => floorN(x, y).length !== 1);
    return [...rng.shuffle(dead), ...rng.shuffle(rest)];
  };
  const take = (x: number, y: number): void => {
    used.add(at(x, y));
    blockers.add(at(x, y));
  };

  // the plan's own scenery stood where the old towns put it, a barrel or a statue in a street of one cell as well: no object may stand in a passage now, so such a
  // piece moves to the nearest cell that is none, or is left out when there is no room (the plan's people, chests and fountains stay where they are)
  for (const d of planDecor) {
    const here = at(d.x, d.y);
    if (!splitsRing((cx, cy) => b.isFloor(cx, cy) && !blockers.has(at(cx, cy)) && !objects.has(at(cx, cy)), d.x, d.y)) continue;
    blockers.delete(here);
    used.delete(here);
    const spot = spots()
      .filter(([x, y]) => fits(x, y))
      .sort((p, q) => Math.abs(p[0] - d.x) + Math.abs(p[1] - d.y) - (Math.abs(q[0] - d.x) + Math.abs(q[1] - d.y)))[0];
    const k = sites.indexOf(d);
    if (spot) {
      sites[k] = { ...d, x: spot[0], y: spot[1] };
      take(spot[0], spot[1]);
    } else sites.splice(k, 1);
  }

  // every town has the apprentice of its guild: four of the five old plans have one, the fourth town gets one in a dead end
  const guild = `guild_level_${Math.min(5, Math.max(1, ctx.tier))}`;
  if (!sites.some((s) => s.kind === "talent" && s.talent === guild)) {
    const spot = spots().find(([x, y]) => fits(x, y));
    if (spot) {
      sites.push({ kind: "talent", x: spot[0], y: spot[1], talent: guild });
      take(spot[0], spot[1]);
    }
  }

  // the Crow's perch stands in a dead end of the start town, against the wall, facing the street
  if (ctx.key === START_TOWN_KEY) {
    const dead = spots().filter(([x, y]) => floorN(x, y).length === 1);
    const spot = dead.find(([x, y]) => fits(x, y)) ?? spots().find(([x, y]) => fits(x, y));
    if (spot) {
      const open = floorN(spot[0], spot[1]);
      sites.push({ kind: "perch", x: spot[0], y: spot[1], facing: open[0] ?? "S" });
      take(spot[0], spot[1]);
    }
  }

  // the portal of the town, near the way in, always in a dead end or a niche (a wall set back by one cell is enough): the nearest dead ends that
  // block nothing, and where there is none within reach a niche is dug into the nearest house wall
  {
    const away = (x: number, y: number) => Math.abs(x - spawn.x) + Math.abs(y - spawn.y);
    const dead = spots()
      .filter(([x, y]) => floorN(x, y).length === 1 && away(x, y) >= 3)
      .sort((p, q) => away(p[0], p[1]) - away(q[0], q[1]));
    const choices: [number, number][] = [];
    for (const c of dead) {
      if (choices.length >= 3) break;
      if (fits(c[0], c[1])) choices.push(c);
    }
    let spot: [number, number] | undefined = choices.length > 0 && away(choices[0]![0], choices[0]![1]) <= PORTAL_REACH ? rng.pick(choices) : undefined;
    if (!spot) {
      // a niche: a house wall cell with one street cell beside it and wall on its other sides, which no shop, person or object uses
      const walls: [number, number][] = [];
      // the wall that carries a shop's door goes on to both sides: no niche is dug beside it
      const doorWalls = lots.map((l) => at(l.door.x - FACING_DELTA[l.door.facing].dx, l.door.y - FACING_DELTA[l.door.facing].dy));
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          if (b.get(x, y) !== CELL.BUILDING || !interior(x, y) || away(x, y) < 3) continue;
          if (SIDES.some((f) => doorWalls.includes(at(x + FACING_DELTA[f].dx, y + FACING_DELTA[f].dy)))) continue;
          const open = SIDES.filter((f) => b.isFloor(x + FACING_DELTA[f].dx, y + FACING_DELTA[f].dy));
          if (open.length !== 1) continue;
          const street = at(x + FACING_DELTA[open[0]!].dx, y + FACING_DELTA[open[0]!].dy);
          if (used.has(street) || shopAt.has(street) || blockers.has(street)) continue;
          // the cells behind and beside it are wall as well, so that it stays one cell deep
          const d = FACING_DELTA[opposite(open[0]!)];
          const flank = d.dx === 0 ? [[-1, 0], [1, 0]] : [[0, -1], [0, 1]];
          if (!flank.every(([fx, fy]) => !b.isFloor(x + d.dx + fx!, y + d.dy + fy!)) || b.isFloor(x + d.dx, y + d.dy)) continue;
          if (flank.some(([fx, fy]) => b.isFloor(x + fx!, y + fy!))) continue;
          walls.push([x, y]);
        }
      }
      walls.sort((p, q) => away(p[0], p[1]) - away(q[0], q[1]));
      const dug = walls[0];
      if (dug) {
        b.set(dug[0], dug[1], CELL.FLOOR);
        spot = dug;
      }
    }
    if (!spot) spot = choices[0] ?? spots().find(([x, y]) => floorN(x, y).length === 1 && fits(x, y)) ?? spots().find(([x, y]) => fits(x, y));
    if (spot) {
      sites.push({ kind: "portal", x: spot[0], y: spot[1], item: PORTAL_ITEM });
      take(spot[0], spot[1]);
    }
  }

  // the job master of the first tier's towns ("Work for a week"), at the end of a street like the other people
  if (ctx.tier === 1) {
    const spot = spots().find(([x, y]) => fits(x, y));
    if (spot) {
      sites.push({ kind: "work", x: spot[0], y: spot[1], persona: JOB_MASTER });
      take(spot[0], spot[1]);
    }
  }

  // scenery of the user's list on cells that block no street (loops and wide places, dead ends only when nothing else fits: they are kept for people and barrels)
  {
    let scenery = rng.range(2, 4);
    const rest = spots().filter(([x, y]) => floorN(x, y).length !== 1);
    const dead = spots().filter(([x, y]) => floorN(x, y).length === 1);
    for (const [x, y] of [...rest, ...dead]) {
      if (scenery === 0) break;
      if (!fits(x, y)) continue;
      sites.push({ kind: "decor", x, y, item: rng.pick(TOWN_SCENERY) });
      take(x, y);
      scenery--;
    }
  }

  // things that can be walked over: fractured vessels in the street and columns (the old game's "4 pillars") along it. None of them stands in a
  // passage of one cell or shuts a wider one (`splitsHere`, the party walks round it); a column has no wall within a cell of it, and columns may
  // stand one cell apart, which makes a colonnade
  {
    const free = (x: number, y: number): boolean => b.isFloor(x, y) && !used.has(at(x, y)) && !nearStart(x, y) && !shopAt.has(at(x, y)) && !sites.some((st) => Math.abs(st.x - x) + Math.abs(st.y - y) < 2);
    const street = rng.shuffle(spots().filter(([x, y]) => free(x, y) && floorN(x, y).length >= 2));
    let vessels = rng.int(3);
    for (const [x, y] of street) {
      if (vessels === 0) break;
      if (!free(x, y) || splitsHere(x, y)) continue;
      sites.push({ kind: "decor", x, y, item: VESSELS });
      used.add(at(x, y));
      objects.add(at(x, y));
      vessels--;
    }
    const columnAt = (x: number, y: number): boolean =>
      free(x, y) && !objects.has(at(x, y)) && openSquare((cx, cy) => b.isFloor(cx, cy), x, y) && !b.pillars.some((q) => Math.max(Math.abs(q.x - x), Math.abs(q.y - y)) < 2) && !splitsHere(x, y);
    let columns = rng.range(2, 5);
    const raise = (x: number, y: number): void => {
      b.pillars.push({ x, y });
      used.add(at(x, y));
      objects.add(at(x, y));
      columns--;
    };
    for (const [x, y] of street) {
      if (columns === 0) break;
      if (!columnAt(x, y)) continue;
      raise(x, y);
      // a row: the next column one cell on, as long as the street is as open there
      for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]] as const) {
        if (columns > 0 && rng.chance(550) && columnAt(x + dx, y + dy)) raise(x + dx, y + dy);
      }
    }
  }

  // a pocket with a chest in it may be shut by a gate and guarded: the old towns hide their chests behind gates and monsters. The Eagle guild
  // is the one that is earned (its membership costs nothing): the apprentice of the fifth town stands behind a gate and guards of his own, as in the old Blistering Heights
  const guards = TOWN_GUARDS[Math.min(5, Math.max(1, ctx.tier))]!;
  const caged = new Set<number>();
  const earned = (s: TownSite): boolean => s.kind === "talent" && s.talent === "guild_level_5";
  const holdsLoot = (s: TownSite): boolean => s.kind === "chest" || s.kind === "loose" || earned(s);
  for (const chest of sites.filter(holdsLoot)) {
    if (caged.has(at(chest.x, chest.y))) continue;
    // cells in order of distance from the chest: the first that cuts the chest off from the way in, with a small pocket, is the gate
    const dist = new Map<number, number>([[at(chest.x, chest.y), 0]]);
    const order: number[] = [at(chest.x, chest.y)];
    for (let head = 0; head < order.length; head++) {
      const i = order[head]!;
      const d = dist.get(i)!;
      if (d >= 7) continue;
      const x = i % width;
      const y = (i - x) / width;
      for (const f of SIDES) {
        const nx = x + FACING_DELTA[f].dx;
        const ny = y + FACING_DELTA[f].dy;
        if (!b.isFloor(nx, ny) || dist.has(at(nx, ny))) continue;
        dist.set(at(nx, ny), d + 1);
        order.push(at(nx, ny));
      }
    }
    // a pocket of two cells or more first: room for the guards between the gate and the chest
    let best: { gi: number; pocket: number[]; mine: number[] } | null = null;
    const chestCells = new Set(sites.filter(holdsLoot).map((s) => at(s.x, s.y)));
    for (const gi of order.slice(1)) {
      const gx = gi % width;
      const gy = (gi - gx) / width;
      const n = floorN(gx, gy);
      // a gate sits in a straight stretch of street, away from shops, people and the way in
      const straight = n.length === 2 && ((n.includes("N") && n.includes("S")) || (n.includes("E") && n.includes("W")));
      if (!straight || used.has(gi) || shopAt.has(gi) || nearStart(gx, gy)) continue;
      const seen = reachFrom(new Set([gi]));
      if (seen[at(chest.x, chest.y)]) continue;
      const pocket: number[] = [];
      for (let k = 0; k < seen.length; k++) if (b.isFloor(k % width, (k - (k % width)) / width) && !seen[k] && k !== gi) pocket.push(k);
      if (pocket.length === 0 || pocket.length > CAGE_MAX_CELLS) continue;
      // nothing but chests lives in the pocket: no shop, no person, no way out
      if (pocket.some((k) => shopAt.has(k) || (used.has(k) && !chestCells.has(k)))) continue;
      const found = { gi, pocket, mine: pocket.filter((k) => chestCells.has(k)) };
      if (!best) best = found;
      if (pocket.length >= 2) {
        best = found;
        break;
      }
    }
    if (!best) continue;
    for (const k of best.mine) caged.add(k);
    // the earned membership is always behind a gate; the chests only now and then
    const must = sites.some((s) => earned(s) && best!.mine.includes(at(s.x, s.y)));
    if (!must && !rng.chance(CAGE_CHANCE)) continue;
    const gx = best.gi % width;
    const gy = (best.gi - gx) / width;
    const n = floorN(gx, gy);
    // the chests behind a gate always hold something
    sites.forEach((s, k) => {
      if (s.kind === "loose" && best!.mine.includes(at(s.x, s.y))) sites[k] = { kind: "chest", x: s.x, y: s.y, item: s.item };
    });
    sites.push({ kind: "cage", x: gx, y: gy, axis: n.includes("E") ? "x" : "y" });
    used.add(best.gi);
    const free = rng.shuffle(best.pocket.filter((k) => !used.has(k)));
    const count = Math.min(free.length, rng.range(1, 2));
    for (const k of free.slice(0, count)) {
      sites.push({ kind: "guard", x: k % width, y: (k - (k % width)) / width, monsters: guards });
      used.add(k);
    }
  }

  const map = b.finish("town", ctx, exit, spawn, lots);
  return { ...map, rooms: [], sites };
}
