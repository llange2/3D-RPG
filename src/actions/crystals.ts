import { CELL, FACING_DELTA, type Facing, type InteriorMap } from "../interiors/types";
import { blocksCell } from "./registry";
import type { ActionInstance } from "./types";

/**
 * The light of quest_8, "Crystal paths" (quest document 1.10). Pure rules, no DOM, no Babylon: the generator proves its puzzle with them and the game draws what they give back.
 *
 * Wall crystals (a wall holder with a crystal in its mouth) stand on the floor cell in front of a wall and shine straight out of it: a SOURCE always shines in its colour, a TARGET waits for
 * one colour. The player puts crystals (holder and crystal) on cells of the floor, and a light line runs from a shining crystal to the next one in a straight row or column. The rule of the
 * document: every crystal and every target takes its light from the NEAREST shining crystal or source it sees in its four directions (a target only in the direction it faces); two at the same
 * distance give it both, and the colours mix. Something in the way (a wall, an object, a monster, the party, a closed door, another crystal) stops the light.
 *
 * The result depends on WHERE the crystals stand, never on the order they were set down in (bug_fix_80: in the Cave of Zula the row 18/17/16 was blue or purple by the order, a random factor in
 * a puzzle). Two things used to be settled by the order and now are by distances only:
 * - Two crystals that see each other can each be the other's nearest light. Light only runs "downstream": from the emitter with the shorter way of light (`cum`, the shortest chain of lines from
 *   any source, summed up) to the one with the longer way; between equal ways there is no line.
 * - Two lines never cross: where they would, the shorter line stays and the longer does not appear; two of the same length both stay away.
 */

/** The colours as masks of the three base colours: a mixed light is the union of the lights that meet in a crystal. */
export const RED = 1;
export const YELLOW = 2;
export const BLUE = 4;
export const BASE_COLORS: readonly number[] = [RED, YELLOW, BLUE];

export const COLOR_NAMES: Readonly<Record<number, string>> = { 1: "red", 2: "yellow", 4: "blue", 3: "orange", 5: "purple", 6: "green", 7: "white" };
export const COLOR_HEX: Readonly<Record<number, string>> = { 1: "#ff3326", 2: "#ffd51f", 4: "#2f62ff", 3: "#ff8a1a", 5: "#b44bff", 6: "#2ee05c", 7: "#f2f2f2" };

/** The colour of a mask as `#rrggbb` (a crystal without light is the colour of the plain crystal). */
export const colorHex = (mask: number): string => COLOR_HEX[mask] ?? "#ffffff";

/** A wall crystal: on the floor cell `x, y` in front of a wall, shining or waiting towards `dir` (the way out of the wall). */
export interface WallNode {
  uid: string;
  x: number;
  y: number;
  dir: Facing;
  role: "source" | "target";
  /** What it shines in (a source) or wants to receive (a target), as a colour mask. */
  color: number;
}

/** A crystal the party has set down. `seq` counts them in the order they were set down; the save keeps it, the light does not read it (the order of the party never changes the light). */
export interface PlacedCrystal {
  x: number;
  y: number;
  seq: number;
}

export interface CrystalLink {
  from: { x: number; y: number };
  to: { x: number; y: number };
  /** The light that runs along it, as a mask. */
  color: number;
}

export interface CrystalResult {
  links: CrystalLink[];
  /** The light of every placed crystal (0: dark), by `x,y`. */
  crystals: Map<string, number>;
  /** What every target receives (0: nothing), by uid. */
  targets: Map<string, number>;
  solved: boolean;
}

const OPPOSITE: Record<Facing, Facing> = { N: "S", S: "N", E: "W", W: "E" };
const FACINGS: readonly Facing[] = ["N", "E", "S", "W"];
const LONGEST = 200;
const key = (x: number, y: number): string => `${x},${y}`;

interface Receiver {
  id: string;
  x: number;
  y: number;
  target?: WallNode;
  /** The only direction it sees in (a target), else all four. */
  only?: Facing;
}
/** What a receiver sees in one direction: the emitter (a crystal or a source facing it), how far, and the cells between. */
interface Link {
  key: string;
  from: string;
  to: string;
  distance: number;
  cells: string[];
}

/**
 * The light of a room. `blocked(x, y)` says whether a cell stops light (wall, object, closed door, monster, the party); a crystal always does, the cell of a wall crystal does not.
 */
export function simulateCrystals(nodes: readonly WallNode[], placed: readonly PlacedCrystal[], blocked: (x: number, y: number) => boolean): CrystalResult {
  const crystalAt = new Set<string>();
  for (const c of placed) crystalAt.add(key(c.x, c.y));
  const sourceAt = new Map<string, WallNode>();
  for (const n of nodes) if (n.role === "source") sourceAt.set(key(n.x, n.y), n);
  const sources = nodes.filter((n) => n.role === "source");

  // a fixed order that comes from the places alone (targets as given, crystals row by row), so that nothing depends on the order they were set down in
  const crystals = [...placed].sort((a, b) => a.y - b.y || a.x - b.x);
  const receivers: Receiver[] = [
    ...nodes.filter((n) => n.role === "target").map((n): Receiver => ({ id: `t:${n.uid}`, x: n.x, y: n.y, target: n, only: n.dir })),
    ...crystals.map((c): Receiver => ({ id: `c:${key(c.x, c.y)}`, x: c.x, y: c.y })),
  ];

  /** What `r` sees first in a direction: a crystal or a source facing it, with its distance, or nothing. Light does not matter here. */
  const seen = (r: Receiver, dir: Facing): { from: string; distance: number; x: number; y: number } | null => {
    const d = FACING_DELTA[dir];
    for (let k = 1; k <= LONGEST; k++) {
      const x = r.x + d.dx * k;
      const y = r.y + d.dy * k;
      if (crystalAt.has(key(x, y))) return { from: `c:${key(x, y)}`, distance: k, x, y };
      const source = sourceAt.get(key(x, y));
      if (source && source.dir === OPPOSITE[dir]) return { from: `s:${source.uid}`, distance: k, x, y };
      if (blocked(x, y)) return null;
    }
    return null;
  };
  const cellsBetween = (a: { x: number; y: number }, b: { x: number; y: number }): string[] => {
    const out: string[] = [];
    const dx = Math.sign(b.x - a.x);
    const dy = Math.sign(b.y - a.y);
    for (let x = a.x + dx, y = a.y + dy; x !== b.x || y !== b.y; x += dx, y += dy) out.push(key(x, y));
    return out;
  };
  const position = (id: string): { x: number; y: number } => {
    if (id.startsWith("s:")) {
      const s = sources.find((n) => `s:${n.uid}` === id)!;
      return { x: s.x, y: s.y };
    }
    const [x, y] = id.slice(2).split(",").map(Number) as [number, number];
    return { x, y };
  };

  // every line that could run: from what a receiver sees to the receiver
  const links: Link[] = [];
  for (const r of receivers) {
    for (const dir of r.only ? [r.only] : FACINGS) {
      const s = seen(r, dir);
      if (s) links.push({ key: `${s.from}>${r.id}`, from: s.from, to: r.id, distance: s.distance, cells: cellsBetween(r, s) });
    }
  }

  interface Solution {
    inputs: Map<string, Link[]>;
    light: Map<string, number>;
  }
  /** The light with the lines in `banned` taken away. */
  const solve = (banned: ReadonlySet<string>): Solution => {
    const open = links.filter((l) => !banned.has(l.key));
    // the way of light: the shortest chain of lines from any source
    const cum = new Map<string, number>();
    for (const s of sources) cum.set(`s:${s.uid}`, 0);
    for (const c of crystals) cum.set(`c:${key(c.x, c.y)}`, Infinity);
    for (let round = 0; round <= crystals.length + 1; round++) {
      let changed = false;
      for (const l of open) {
        if (l.to.startsWith("t:")) continue;
        const reach = (cum.get(l.from) ?? Infinity) + l.distance;
        if (reach < (cum.get(l.to) ?? Infinity)) {
          cum.set(l.to, reach);
          changed = true;
        }
      }
      if (!changed) break;
    }
    // a receiver takes the nearest of the lines that run downstream (a target takes any lit one: it shines on nothing)
    const inputs = new Map<string, Link[]>();
    for (const r of receivers) {
      const mine = cum.get(r.id) ?? Infinity;
      const fits = open.filter((l) => {
        if (l.to !== r.id) return false;
        const up = cum.get(l.from) ?? Infinity;
        return up !== Infinity && (r.target !== undefined || up < mine);
      });
      const nearest = fits.length > 0 ? Math.min(...fits.map((l) => l.distance)) : 0;
      inputs.set(r.id, fits.filter((l) => l.distance === nearest));
    }
    // the light flows down the ways: a crystal is worked out after everything it takes light from
    const light = new Map<string, number>();
    for (const s of sources) light.set(`s:${s.uid}`, s.color);
    const byWay = crystals.map((c) => `c:${key(c.x, c.y)}`).sort((a, b) => (cum.get(a) ?? Infinity) - (cum.get(b) ?? Infinity));
    for (const id of byWay) {
      let m = 0;
      for (const l of inputs.get(id) ?? []) m |= light.get(l.from) ?? 0;
      light.set(id, m);
    }
    return { inputs, light };
  };

  // lines that cross: the shorter one stays, two of the same length both go (and stay away: a banned line is never tried again, so the result is a function of the places only)
  const banned = new Set<string>();
  let solution = solve(banned);
  for (let round = 0; round <= links.length; round++) {
    const owners = new Map<string, Link[]>();
    for (const ls of solution.inputs.values()) for (const l of ls) for (const cell of l.cells) owners.set(cell, [...(owners.get(cell) ?? []), l]);
    let grew = false;
    for (const ls of owners.values()) {
      if (ls.length < 2) continue;
      const shortest = Math.min(...ls.map((l) => l.distance));
      const tie = ls.filter((l) => l.distance === shortest).length > 1;
      for (const l of ls) {
        if ((l.distance > shortest || tie) && !banned.has(l.key)) {
          banned.add(l.key);
          grew = true;
        }
      }
    }
    if (!grew) break;
    solution = solve(banned);
  }

  const { inputs, light } = solution;
  const outLinks: CrystalLink[] = [];
  const targets = new Map<string, number>();
  const lit = new Map<string, number>();
  for (const r of receivers) {
    let m = 0;
    for (const l of inputs.get(r.id) ?? []) {
      const color = light.get(l.from) ?? 0;
      m |= color;
      outLinks.push({ from: position(l.from), to: { x: r.x, y: r.y }, color });
    }
    if (r.target) targets.set(r.target.uid, m);
    else lit.set(key(r.x, r.y), m);
  }
  const wanted = nodes.filter((n) => n.role === "target");
  return { links: outLinks, crystals: lit, targets, solved: wanted.length > 0 && wanted.every((n) => targets.get(n.uid) === n.color) };
}

/** The cells that stop light whatever the party does: walls, and the cells of the actions that stand in the way (a chest, a statue, a closed door). Monsters and the party are the game's to add. */
export function staticBlockers(map: InteriorMap, actions: readonly ActionInstance[]): (x: number, y: number) => boolean {
  const standing = new Set<number>();
  for (const a of actions) if (a.kind === "door" || (a.kind !== "crystal" && blocksCell(a))) standing.add(a.y * map.width + a.x);
  return (x, y) => x < 0 || y < 0 || x >= map.width || y >= map.height || map.cells[y * map.width + x] !== CELL.FLOOR || standing.has(y * map.width + x);
}
