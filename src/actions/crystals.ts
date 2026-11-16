import { CELL, FACING_DELTA, type Facing, type InteriorMap } from "../interiors/types";
import { blocksCell } from "./registry";
import type { ActionInstance } from "./types";

/**
 * The light of quest_8, "Crystal paths" (quest document 1.10). Pure rules, no DOM, no Babylon: the generator proves its puzzle with them and the game draws what they give back.
 *
 * Wall crystals (a wall holder with a crystal in its mouth) stand on the floor cell in front of a wall and shine straight out of it: a SOURCE always shines in its colour, a TARGET waits for
 * one colour. The player puts crystals (holder and crystal) on cells of the floor, and a light line runs from a shining crystal to the next one in a straight row or column. The rule of the
 * document, as it was settled with the user: every crystal and every target takes its light from the NEAREST shining crystal or source it sees in its four directions (a target only in the
 * direction it faces); two at the same distance give it both, and the colours mix. Something in the way (a wall, an object, a monster, the party, a closed door, another crystal) stops the
 * light. Two lines never cross: where they would, the line of the crystal set down first stays and the other does not appear. Whenever something changes the whole path is worked out again.
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

/** A crystal the party has set down, `seq` counts them in the order they were set down (the older line wins where two cross). */
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

interface Emitter {
  id: string;
  x: number;
  y: number;
  source?: WallNode;
}
interface Receiver extends Emitter {
  /** Order of priority: targets first (they stand from the start), then the crystals in the order they were set down. */
  order: number;
  target?: WallNode;
  /** The only direction it sees in (a target), else all four. */
  only?: Facing;
}
interface Input {
  from: string;
  distance: number;
  dir: Facing;
}

/**
 * The light of a room. `blocked(x, y)` says whether a cell stops light (wall, object, closed door, monster, the party); a crystal always does, the cell of a wall crystal does not.
 */
export function simulateCrystals(nodes: readonly WallNode[], placed: readonly PlacedCrystal[], blocked: (x: number, y: number) => boolean): CrystalResult {
  const crystalAt = new Map<string, PlacedCrystal>();
  for (const c of placed) crystalAt.set(key(c.x, c.y), c);
  const sourceAt = new Map<string, WallNode>();
  for (const n of nodes) if (n.role === "source") sourceAt.set(key(n.x, n.y), n);

  const receivers: Receiver[] = [
    ...nodes.filter((n) => n.role === "target").map((n, i): Receiver => ({ id: `t:${n.uid}`, x: n.x, y: n.y, order: -1000 + i, target: n, only: n.dir })),
    ...[...placed].sort((a, b) => a.seq - b.seq).map((c): Receiver => ({ id: `c:${key(c.x, c.y)}`, x: c.x, y: c.y, order: c.seq })),
  ];
  receivers.sort((a, b) => a.order - b.order);
  const inputs = new Map<string, Input[]>();
  for (const r of receivers) inputs.set(r.id, []);
  const sources = nodes.filter((n) => n.role === "source");

  // the light of every emitter from the inputs as they stand: a source shines in its colour, a crystal in the union of what it takes in (a ring of crystals with no source in it stays dark)
  const lightOf = (): Map<string, number> => {
    const light = new Map<string, number>();
    for (const s of sources) light.set(`s:${s.uid}`, s.color);
    for (const c of placed) light.set(`c:${key(c.x, c.y)}`, 0);
    for (let round = 0; round <= placed.length + 1; round++) {
      let changed = false;
      for (const c of placed) {
        const id = `c:${key(c.x, c.y)}`;
        let m = 0;
        for (const i of inputs.get(id) ?? []) m |= light.get(i.from) ?? 0;
        if (m !== light.get(id)) {
          light.set(id, m);
          changed = true;
        }
      }
      if (!changed) break;
    }
    return light;
  };

  /** Does the emitter take (even through several crystals) light from `id`? */
  const dependsOn = (emitter: string, id: string): boolean => {
    const seen = new Set<string>();
    const stack = [emitter];
    while (stack.length > 0) {
      const e = stack.pop()!;
      if (e === id) return true;
      if (seen.has(e)) continue;
      seen.add(e);
      for (const i of inputs.get(e) ?? []) stack.push(i.from);
    }
    return false;
  };

  /** What `r` sees first in a direction: a crystal or a source facing it, with its distance, or nothing. */
  const seen = (r: Receiver, dir: Facing): { from: string; distance: number; x: number; y: number } | null => {
    const d = FACING_DELTA[dir];
    for (let k = 1; k <= LONGEST; k++) {
      const x = r.x + d.dx * k;
      const y = r.y + d.dy * k;
      const crystal = crystalAt.get(key(x, y));
      if (crystal) return { from: `c:${key(x, y)}`, distance: k, x, y };
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

  const passes = placed.length + receivers.length + 4;
  for (let pass = 0; pass < passes; pass++) {
    let changed = false;
    // the cells the lines of the receivers that were settled first in this pass run over
    const taken = new Set<string>();
    for (const r of receivers) {
      const light = lightOf();
      const candidates: { id: string; distance: number; dir: Facing; cells: string[] }[] = [];
      for (const dir of r.only ? [r.only] : FACINGS) {
        const s = seen(r, dir);
        if (!s || (light.get(s.from) ?? 0) === 0) continue;
        // light that comes back from a crystal that lives on this one's light is no light (a crystal lit by a source is lit by it, not by the crystal it shines on)
        if (dependsOn(s.from, r.id)) continue;
        const cells = cellsBetween(r, s);
        if (cells.some((c) => taken.has(c))) continue;
        candidates.push({ id: s.from, distance: s.distance, dir, cells });
      }
      const nearest = candidates.length > 0 ? Math.min(...candidates.map((c) => c.distance)) : 0;
      const chosen = candidates.filter((c) => c.distance === nearest);
      const next: Input[] = chosen.map((c) => ({ from: c.id, distance: c.distance, dir: c.dir }));
      const before = inputs.get(r.id)!;
      if (before.length !== next.length || before.some((b, i) => b.from !== next[i]!.from)) {
        inputs.set(r.id, next);
        changed = true;
      }
      for (const c of chosen) for (const cell of c.cells) taken.add(cell);
    }
    if (!changed) break;
  }

  const light = lightOf();
  const links: CrystalLink[] = [];
  const targets = new Map<string, number>();
  const crystals = new Map<string, number>();
  for (const r of receivers) {
    let m = 0;
    for (const i of inputs.get(r.id) ?? []) {
      const color = light.get(i.from) ?? 0;
      m |= color;
      links.push({ from: position(i.from), to: { x: r.x, y: r.y }, color });
    }
    if (r.target) targets.set(r.target.uid, m);
    else crystals.set(key(r.x, r.y), m);
  }
  const wanted = nodes.filter((n) => n.role === "target");
  return { links, crystals, targets, solved: wanted.length > 0 && wanted.every((n) => targets.get(n.uid) === n.color) };
}

/** The cells that stop light whatever the party does: walls, and the cells of the actions that stand in the way (a chest, a statue, a closed door). Monsters and the party are the game's to add. */
export function staticBlockers(map: InteriorMap, actions: readonly ActionInstance[]): (x: number, y: number) => boolean {
  const standing = new Set<number>();
  for (const a of actions) if (a.kind === "door" || (a.kind !== "crystal" && blocksCell(a))) standing.add(a.y * map.width + a.x);
  return (x, y) => x < 0 || y < 0 || x >= map.width || y >= map.height || map.cells[y * map.width + x] !== CELL.FLOOR || standing.has(y * map.width + x);
}
