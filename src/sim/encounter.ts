import type { Rng } from "../core/rng";
import { isUndead, type MonsterDef } from "../data/tables";
import { applyHit, meleeDamage, monsterById, monsterDamage, rangedDamage, spellDamageToMonster, type DamageType } from "./combat";
import { anyoneLeft, canAct, isRifted, itemBonus } from "./character";
import type { ConditionEvent } from "./conditions";
import { ACTION_MINUTES, addXp, advanceTime } from "./party";
import { generateItem } from "./items";
import type { Condition, Item, Party, TimedEffect } from "./types";

/** Radius (in tiles) within which monsters notice and attack the party (MONSTER_ACTION_RADIUS of the old game). */
export const MONSTER_ACTION_RADIUS = 7;
/** Share of a Clumsy monster's attacks that do not take place. */
const CLUMSY_MISS = 0.1;
const PATH_STEP_LIMIT = 30;
/** The search that goes round other monsters needs more room than the old game's 30 steps: a detour round a crowd is longer than the straight way. */
const MOVE_STEP_LIMIT = 80;

/** What the combat engine needs to know about the map under it. */
export interface GridView {
  /** Cell can be entered by land monsters (no wall, no chest, no closed door). */
  walkable(x: number, y: number): boolean;
  water(x: number, y: number): boolean;
  /** Blocks line of sight and ranged attacks. */
  opaque(x: number, y: number): boolean;
  /** An item that stops a shot without being a wall (gate, barrel, statue): the old game kept monsters from shooting past it. */
  obstacle?(x: number, y: number): boolean;
  /**
   * A wall piece stands on the border of two neighbouring cells although both can be stood in (the slab of a campaign brittle wall,
   * whose cell the party may enter): nobody reaches across it, neither with a blade nor with a shot.
   */
  wallBetween?(x0: number, y0: number, x1: number, y1: number): boolean;
}

export interface MonsterInstance {
  uid: string;
  defId: number;
  x: number;
  y: number;
  hp: number;
  /** Dimensional Phasing: monster turns left. The monster neither moves nor attacks, and nothing can hurt it. */
  phased?: number;
  /** Immobilize: monster turns left in which the monster cannot move (it can still strike). */
  immobile?: number;
  /** Set for good once Immobilize has been cast on this monster: it works once on each. */
  wasImmobilized?: boolean;
  /** Clumsy: some of the monster's attacks fail, until it dies. */
  clumsy?: boolean;
  /** Gravity drew the monster to the party this turn: it spent the turn on that and does not strike until the next one. */
  pulled?: boolean;
  /** The share (in percent) of the sheet's XP this monster gives; 100 when unset. The monsters of a Monster Hut give more or less by world size. */
  xpPercent?: number;
}

/** The XP the party gets for this monster. */
export function monsterXp(m: MonsterInstance, def: MonsterDef): number {
  return Math.floor((def.xp * (m.xpPercent ?? 100)) / 100);
}

export interface Encounter {
  monsters: MonsterInstance[];
  battleMode: boolean;
  /** Character indices in the order they act this round (fastest first). */
  sequence: number[];
  attacker: number | null;
}

export type CombatEvent =
  | { type: "monster_move"; uid: string; from: [number, number]; to: [number, number] }
  /** Gravity: the monster is drawn to the party at once (a quick slide, no walking). */
  | { type: "monster_pull"; uid: string; from: [number, number]; to: [number, number] }
  | { type: "monster_attack"; uid: string; target: number; damage: number; ranged: boolean; damageType: DamageType; conditions: Condition[]; drained?: number; aged?: number }
  /** A Troll or a Vampire heals a share of its health at the end of a monster turn. */
  | { type: "monster_regen"; uid: string; amount: number }
  | { type: "party_attack"; attacker: number | null; kind: "melee" | "ranged" | "magic"; uid: string; defId: number; damage: number; shots?: number }
  /** The Wolf mascot finishes off a monster the party has wounded below `WOLF_EXECUTE_BELOW` of its health. */
  | { type: "wolf_kill"; uid: string; defId: number }
  | { type: "monster_dead"; uid: string; defId: number; x: number; y: number; xp: number; loot: { gold: number; item: Item | null } }
  | { type: "denied"; reason: "no_ranged_weapon" | "out_of_range" | "no_target" | "cannot_act" }
  /** The action took its minutes and these spells ran out meanwhile. */
  | { type: "effects_ended"; effects: TimedEffect[] }
  /** The action took its minutes and these conditions ran out (poison killing, drink turning into weakness). */
  | { type: "conditions_ended"; conditions: ConditionEvent[] }
  | { type: "defeat" };

export function createEncounter(): Encounter {
  return { monsters: [], battleMode: false, sequence: [], attacker: null };
}

export function createMonster(uid: string, defId: number, x: number, y: number): MonsterInstance {
  return { uid, defId, x, y, hp: monsterById(defId).health };
}

const DIRS: [number, number][] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

// ---------------------------------------------------------------- pathfinding

interface HeapItem {
  priority: number;
  dist: number;
  x: number;
  y: number;
}

class MinHeap {
  private items: HeapItem[] = [];
  get size(): number {
    return this.items.length;
  }
  private less(a: HeapItem, b: HeapItem): boolean {
    // same tie-break as Python's tuple comparison (priority, distance, position)
    return a.priority !== b.priority ? a.priority < b.priority : a.dist !== b.dist ? a.dist < b.dist : a.x !== b.x ? a.x < b.x : a.y < b.y;
  }
  push(item: HeapItem): void {
    const a = this.items;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(a[i]!, a[p]!)) break;
      [a[i], a[p]] = [a[p]!, a[i]!];
      i = p;
    }
  }
  pop(): HeapItem {
    const a = this.items;
    const top = a[0]!;
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && this.less(a[l]!, a[m]!)) m = l;
        if (r < a.length && this.less(a[r]!, a[m]!)) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m]!, a[i]!];
        i = m;
      }
    }
    return top;
  }
}

/**
 * Path from a monster to a tile next to the player, limited to a box around the player and to 30 expansions,
 * exactly like way_to_player of the old game. Returns the cells to walk (without the start), or null.
 */
export function wayToPlayer(
  view: GridView,
  def: MonsterDef,
  mx: number,
  my: number,
  px: number,
  py: number,
  radius = MONSTER_ACTION_RADIUS,
  /** Tiles that another monster stands on: no way leads through them, and none of them is a goal. Without it monsters queue up behind the first one. */
  taken?: (x: number, y: number) => boolean,
  stepLimit = PATH_STEP_LIMIT,
): [number, number][] | null {
  const water = def.terrain === "water";
  const blocked = (x: number, y: number) => (water ? !view.water(x, y) : def.terrain === "both" ? !view.walkable(x, y) && !view.water(x, y) : !view.walkable(x, y)) || (taken?.(x, y) ?? false);
  // a tile on the far side of a wall piece is next to the party on the map only
  const reachable = DIRS.filter(([dx, dy]) => !view.wallBetween?.(px, py, px + dx, py + dy) && !taken?.(px + dx, py + dy));
  if (reachable.length === 0) return null;
  const goals = new Set<string>(reachable.map(([dx, dy]) => `${px + dx},${py + dy}`));
  const goalList = reachable.map(([dx, dy]) => [px + dx, py + dy] as [number, number]);
  const heuristic = (x: number, y: number) => Math.min(...goalList.map(([gx, gy]) => Math.abs(x - gx) + Math.abs(y - gy)));

  const visited = new Set<string>();
  const cameFrom = new Map<string, string>();
  const heap = new MinHeap();
  heap.push({ priority: 0, dist: 0, x: mx, y: my });
  let steps = 0;
  while (heap.size > 0 && steps < stepLimit) {
    steps++;
    const { dist, x, y } = heap.pop();
    const key = `${x},${y}`;
    if (visited.has(key)) continue;
    visited.add(key);
    if (Math.abs(x - px) > radius || Math.abs(y - py) > radius) continue;
    if (goals.has(key)) {
      const path: [number, number][] = [];
      let cur: string | undefined = key;
      while (cur !== undefined && cameFrom.has(cur)) {
        const [cx, cy] = cur.split(",").map(Number) as [number, number];
        path.push([cx, cy]);
        cur = cameFrom.get(cur);
      }
      return path.reverse();
    }
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      const nkey = `${nx},${ny}`;
      if (visited.has(nkey) || blocked(nx, ny)) continue;
      if (Math.abs(nx - px) > radius || Math.abs(ny - py) > radius) continue;
      heap.push({ priority: dist + 1 + heuristic(nx, ny), dist: dist + 1, x: nx, y: ny });
      if (!cameFrom.has(nkey)) cameFrom.set(nkey, key);
    }
  }
  return null;
}

/** A fraction `[numerator, denominator]` with a positive denominator, so that two of them compare without rounding. */
type Frac = readonly [number, number];
const FRAC_ZERO: Frac = [0, 1];
const FRAC_ONE: Frac = [1, 1];
const FRAC_FAR: Frac = [1000, 1];
const fracLess = (a: Frac, b: Frac): boolean => a[0] * b[1] < b[0] * a[1];
const fracMax = (a: Frac, b: Frac): Frac => (fracLess(a, b) ? b : a);
const fracMin = (a: Frac, b: Frac): Frac => (fracLess(a, b) ? a : b);

/**
 * The part of the segment (as fractions of its length) that lies strictly inside the column of the tile `offset` tiles away
 * from the start, when the segment moves `delta` tiles along that axis. Null if it never does.
 */
function insideTile(offset: number, delta: number): [Frac, Frac] | null {
  if (delta === 0) return offset === 0 ? [[-FRAC_FAR[0], 1], FRAC_FAR] : null;
  // the tile spans offset-1/2 .. offset+1/2, so the segment is in it between t = (offset-1/2)/delta and (offset+1/2)/delta
  const a: Frac = delta > 0 ? [2 * offset - 1, 2 * delta] : [-(2 * offset + 1), -2 * delta];
  const b: Frac = delta > 0 ? [2 * offset + 1, 2 * delta] : [-(2 * offset - 1), -2 * delta];
  return [a, b];
}

/**
 * Can a shot fly from tile (x0,y0) to tile (x1,y1)? It travels the straight line between the tile centres and is stopped
 * by every blocking tile that line cuts into, corners included (a Bresenham walk let shots slip through the corner of a
 * wall). Passing exactly through the point where two blocking tiles touch diagonally stops it as well, since they leave
 * no gap. The two end tiles never block. The arithmetic is exact (integers only), so the answer does not depend on rounding.
 */
export function lineOfSight(view: GridView, enc: Encounter | null, x0: number, y0: number, x1: number, y1: number, monstersBlock = false): boolean {
  const dx = x1 - x0;
  const dy = y1 - y0;
  if (dx === 0 && dy === 0) return true;
  // a wall piece on the border of the first or the last tile stops what leaves or enters through it: the segment leaves a tile
  // through the side its steeper axis points to, and a tie goes through the corner, where either side counts
  if (view.wallBetween) {
    const sx = Math.sign(dx);
    const sy = Math.sign(dy);
    if (Math.abs(dx) >= Math.abs(dy) && sx !== 0 && (view.wallBetween(x0, y0, x0 + sx, y0) || view.wallBetween(x1, y1, x1 - sx, y1))) return false;
    if (Math.abs(dy) >= Math.abs(dx) && sy !== 0 && (view.wallBetween(x0, y0, x0, y0 + sy) || view.wallBetween(x1, y1, x1, y1 - sy))) return false;
  }
  const blocks =(x: number, y: number): boolean => view.opaque(x, y) || (view.obstacle?.(x, y) ?? false) || (monstersBlock && !!enc?.monsters.some((m) => m.x === x && m.y === y));
  const minX = Math.min(x0, x1);
  const maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1);
  const maxY = Math.max(y0, y1);
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      if ((x === x0 && y === y0) || (x === x1 && y === y1)) continue;
      const across = insideTile(x - x0, dx);
      const down = insideTile(y - y0, dy);
      if (!across || !down) continue;
      const from = fracMax(across[0], down[0]);
      const to = fracMin(across[1], down[1]);
      // the open tile and the closed segment 0..1 overlap: the line cuts into this tile (asking the map costs more than the check)
      if (fracLess(from, to) && fracLess(from, FRAC_ONE) && fracLess(FRAC_ZERO, to) && blocks(x, y)) return false;
    }
  }
  // the segment crosses the corner (x+1/2, y+1/2) of four tiles when both coordinates reach their half-way mark at the same moment
  for (let x = minX; x < maxX; x++) {
    for (let y = minY; y < maxY; y++) {
      if ((2 * (x - x0) + 1) * dy !== (2 * (y - y0) + 1) * dx) continue;
      // going the same way on both axes it passes between (x,y) and (x+1,y+1), otherwise between (x+1,y) and (x,y+1)
      const same = dx * dy > 0;
      if (blocks(same ? x + 1 : x, y) && blocks(same ? x : x + 1, y + 1)) return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------- monsters acting

interface Scanned {
  monster: MonsterInstance;
  path: [number, number][] | null;
  steps: number;
}

/** In another dimension (Dimensional Phasing): out of the fight. */
export function isPhased(m: MonsterInstance): boolean {
  return (m.phased ?? 0) > 0;
}

function scan(view: GridView, enc: Encounter, px: number, py: number, radius: number): Scanned[] {
  const r2 = radius * radius;
  const found: Scanned[] = [];
  for (const monster of enc.monsters) {
    if (monster.hp <= 0 || isPhased(monster)) continue;
    const d2 = (monster.x - px) ** 2 + (monster.y - py) ** 2;
    if (d2 > r2) continue;
    const path = wayToPlayer(view, monsterById(monster.defId), monster.x, monster.y, px, py, radius);
    found.push({ monster, path, steps: path ? path.length : 9999 });
  }
  return found.sort((a, b) => a.steps - b.steps);
}

/**
 * The monsters that would come for a camping party: within the action radius and with a way to it (`distance_in_steps < 9999`
 * of the old rest function). Monsters behind a wall or across water that they cannot cross do not count.
 */
export function monstersReaching(view: GridView, enc: Encounter, px: number, py: number, radius = MONSTER_ACTION_RADIUS): MonsterInstance[] {
  return scan(view, enc, px, py, radius)
    .filter((s) => s.path !== null)
    .map((s) => s.monster);
}

/** Next to each other on the map and not parted by a wall piece. */
export function isAdjacent(x: number, y: number, px: number, py: number, view?: GridView): boolean {
  const next = (Math.abs(x - px) === 1 && y === py) || (Math.abs(y - py) === 1 && x === px);
  return next && !view?.wallBetween?.(x, y, px, py);
}

/** Candidates a monster may attack: everybody who is not dead or knocked out (sleepers included). */
function targets(party: Party): number[] {
  return party.characters.map((c, i) => (isRifted(c) || c.conditions.some((x) => x === "Dead" || x === "Rotten" || x === "Unconscious" || x === "Petrified") ? -1 : i)).filter((i) => i >= 0);
}

/** What a monster turn counts down: Dimensional Phasing, Immobilize and the Dimensional Rift last a number of monster turns. */
function endMonsterTurn(party: Party, enc: Encounter, events: CombatEvent[]): void {
  for (const m of enc.monsters) {
    const regen = monsterById(m.defId).regen;
    if (regen > 0 && m.hp > 0) {
      const def = monsterById(m.defId);
      const healed = Math.min(def.health - m.hp, Math.max(1, Math.round(def.health * regen)));
      if (healed > 0) {
        m.hp += healed;
        events.push({ type: "monster_regen", uid: m.uid, amount: healed });
      }
    }
    if (m.pulled) m.pulled = undefined;
    if (m.phased) m.phased = m.phased > 1 ? m.phased - 1 : undefined;
    if (m.immobile) m.immobile = m.immobile > 1 ? m.immobile - 1 : undefined;
  }
  for (const c of party.characters) {
    const mods = c.mods;
    if (mods?.rift) {
      mods.rift -= 1;
      if (mods.rift <= 0) delete mods.rift;
    }
  }
}

/** Moving ends a Dimensional Rift ("if the party moves the spell is cancelled"). Returns who came back. */
export function cancelRifts(party: Party): number[] {
  const back: number[] = [];
  party.characters.forEach((c, i) => {
    if (c.mods?.rift) {
      delete c.mods.rift;
      back.push(i);
    }
  });
  return back;
}

/**
 * All monsters near the player act: first everybody moves one step along its path, then everybody attacks
 * (melee when adjacent, ranged when it has a ranged attack and a clear line). Port of monster_action.
 */
export function monsterTurn(party: Party, view: GridView, enc: Encounter, px: number, py: number, rng: Rng, radius = MONSTER_ACTION_RADIUS): CombatEvent[] {
  const events: CombatEvent[] = [];
  const occupied = (x: number, y: number) => enc.monsters.some((m) => m.hp > 0 && m.x === x && m.y === y);

  // 1. movement: the nearest monster first, each one round the monsters that stand in the way (a monster that is next to the party holds a side
  // of it, the others look for a free side instead of waiting in a row behind it)
  for (const s of scan(view, enc, px, py, radius)) {
    const m = s.monster;
    // no way at all, or already next to the party (the way is empty)
    if (m.immobile || !s.path || s.path.length === 0) continue;
    const other = (x: number, y: number) => enc.monsters.some((o) => o !== m && o.hp > 0 && o.x === x && o.y === y);
    const first = wayToPlayer(view, monsterById(m.defId), m.x, m.y, px, py, radius, other, MOVE_STEP_LIMIT)?.[0];
    if (!first) continue;
    const [nx, ny] = first;
    if ((nx === px && ny === py) || occupied(nx, ny)) continue;
    events.push({ type: "monster_move", uid: m.uid, from: [m.x, m.y], to: [nx, ny] });
    m.x = nx;
    m.y = ny;
  }

  // 2. attacks
  for (const s of scan(view, enc, px, py, radius)) {
    if (s.monster.pulled) continue;
    const def = monsterById(s.monster.defId);
    const ranged = !isAdjacent(s.monster.x, s.monster.y, px, py, view);
    if (ranged) {
      if (!def.ranged) continue;
      // MONSTER_CAN_RANGE_ATTACK_THROUGH_OTHERS is true in the old game: other monsters do not block a shot
      if (!lineOfSight(view, enc, s.monster.x, s.monster.y, px, py, false)) continue;
    }
    // the number of attacks in a row counts in melee only; a shot from afar is one a turn
    const attacks = ranged ? 1 : def.no_of_attacks;
    const distance = Math.max(Math.abs(s.monster.x - px), Math.abs(s.monster.y - py));
    for (let n = 0; n < attacks; n++) {
      let candidates = targets(party);
      if (candidates.length === 0) break;
      // Clumsy: one attack in ten does not take place
      if (s.monster.clumsy && rng.float() < CLUMSY_MISS) continue;
      if (def.preferred_enemy) {
        const matching = candidates.filter((i) => party.characters[i]!.classType.includes(def.preferred_enemy!));
        if (matching.length > 0) candidates = matching;
      }
      // Hits All: one blow lands on every hero who can be hit, each with its own roll
      const victims = def.hits_all ? candidates : [candidates[rng.int(candidates.length)]!];
      for (const target of victims) {
        const damage = monsterDamage(party, def, party.characters[target]!, ranged, distance, rng);
        const hit = applyHit(party, target, damage, ranged ? null : def, rng);
        events.push({
          type: "monster_attack",
          uid: s.monster.uid,
          target,
          damage: hit.damage,
          ranged,
          damageType: def.attack_type.toLowerCase() as DamageType,
          conditions: hit.conditions,
          ...(hit.drained ? { drained: hit.drained } : {}),
          ...(hit.aged ? { aged: hit.aged } : {}),
        });
        if (hit.defeated) {
          events.push({ type: "defeat" });
          endMonsterTurn(party, enc, events);
          return events;
        }
      }
    }
  }
  endMonsterTurn(party, enc, events);
  return events;
}

// ---------------------------------------------------------------- party acting

export function updateBattleMode(enc: Encounter, px: number, py: number, view?: GridView): void {
  const adjacent = enc.monsters.some((m) => m.hp > 0 && !isPhased(m) && isAdjacent(m.x, m.y, px, py, view));
  if (!adjacent) {
    enc.battleMode = false;
    enc.sequence = [];
    enc.attacker = null;
  } else if (!enc.battleMode) {
    enc.battleMode = true;
  }
}

function rollLoot(rng: Rng, def: MonsterDef): { gold: number; item: Item | null } {
  const item = rng.float() < def.treasure_level * 0.1 ? generateItem(rng, def.treasure_level) : null;
  return { gold: def.gold, item };
}

/** The Wolf in the party kills every monster that drops below this share of its health. */
export const WOLF_EXECUTE_BELOW = 0.9;

function killIfDead(party: Party, enc: Encounter, m: MonsterInstance, rng: Rng, events: CombatEvent[]): void {
  const def = monsterById(m.defId);
  if (m.hp > 0 && party.mascot === "Wolf" && m.hp < def.health * WOLF_EXECUTE_BELOW) {
    m.hp = 0;
    events.push({ type: "wolf_kill", uid: m.uid, defId: m.defId });
  }
  if (m.hp > 0) return;
  enc.monsters = enc.monsters.filter((x) => x.uid !== m.uid);
  const xp = monsterXp(m, def);
  addXp(party, xp);
  events.push({ type: "monster_dead", uid: m.uid, defId: m.defId, x: m.x, y: m.y, xp, loot: rollLoot(rng, def) });
}

/**
 * Whose turn it is in battle mode. The battle sequence is rebuilt at the start of every round (fastest character first), and
 * a character who fell since the last action hands the turn to the next one who can still act. Null outside battle mode.
 */
function beginTurn(party: Party, enc: Encounter): number | null {
  if (!enc.battleMode) return null;
  if (enc.sequence.length === 0) enc.sequence = speedOrder(party);
  let attackerIndex = enc.attacker ?? enc.sequence[0] ?? null;
  if (attackerIndex !== null && !canAct(party.characters[attackerIndex]!)) {
    // the next one in the round's order who can still act, else the fastest of anybody
    const at = enc.sequence.indexOf(attackerIndex);
    const next = enc.sequence.slice(at + 1).find((i) => canAct(party.characters[i]!)) ?? party.characters.findIndex((c) => canAct(c));
    attackerIndex = next < 0 ? null : next;
  }
  enc.attacker = attackerIndex;
  return attackerIndex;
}

/** The characters who can act, fastest first (equal speed keeps the party order). */
function speedOrder(party: Party): number[] {
  return party.characters
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => canAct(c))
    .sort((a, b) => b.c.spd - a.c.spd || a.i - b.i)
    .map(({ i }) => i);
}

/** Whose turn it is for the display: in battle mode the character who acts next, otherwise nobody. */
export function battleActor(party: Party, enc: Encounter): number | null {
  return beginTurn(party, enc);
}

export type PartyAttackKind = "melee" | "ranged" | "magic";

export interface PartyAttack {
  kind: PartyAttackKind;
  targetUid: string;
  /** Spells: damage and element already rolled by the caster. */
  magic?: { damage: number; type: string };
}

/** An action of the party takes ACTION_MINUTES; spells that run out meanwhile are reported so the log can say so. */
function spendAction(party: Party, events: CombatEvent[]): void {
  const { expired, conditions } = advanceTime(party, ACTION_MINUTES);
  if (expired.length > 0) events.push({ type: "effects_ended", effects: expired });
  if (conditions.length > 0) events.push({ type: "conditions_ended", conditions });
  // poison can take the last hero who could still act
  if (conditions.some((c) => c.outcome === "died") && !anyoneLeft(party.characters)) events.push({ type: "defeat" });
}

/** Moves to the next character in the round; after the last one the monsters act. */
function advanceRound(party: Party, view: GridView, enc: Encounter, px: number, py: number, rng: Rng, events: CombatEvent[]): void {
  const active = party.characters.map((c, i) => (canAct(c) ? i : -1)).filter((i) => i >= 0);
  if (enc.attacker === null) {
    enc.attacker = enc.sequence[0] ?? null;
  } else {
    const at = enc.sequence.indexOf(enc.attacker);
    let next = at + 1;
    let found = false;
    while (next < enc.sequence.length) {
      if (active.includes(enc.sequence[next]!)) {
        enc.attacker = enc.sequence[next]!;
        found = true;
        break;
      }
      next++;
    }
    if (!found) {
      // everybody has had their turn: the monsters answer, then a new round starts with the speed order of whoever is left
      enc.sequence = [];
      events.push(...monsterTurn(party, view, enc, px, py, rng));
      enc.sequence = speedOrder(party);
      enc.attacker = enc.sequence[0] ?? null;
    }
  }
  // the monsters may have just put the current attacker out of action, so look at the party again
  const stillActive = party.characters.map((c, i) => (canAct(c) ? i : -1)).filter((i) => i >= 0);
  if (enc.battleMode && (enc.attacker === null || !stillActive.includes(enc.attacker))) enc.attacker = stillActive[0] ?? null;
}

/**
 * The monster the party aims at when none stands on the line it faces: the nearest one in a cone of up to 45 degrees to either side of `(fx, fy)`
 * (the unit step of the facing) within the monsters' own action radius and in clear sight. The monsters shoot along diagonals; this gives the
 * party the same, but only as a second choice (the caller looks along the facing first). Monsters block each other's view, so a monster behind
 * another one is never chosen.
 */
export function nearestInCone(view: GridView, enc: Encounter, px: number, py: number, fx: number, fy: number): MonsterInstance | null {
  const candidates: { m: MonsterInstance; dist: number; side: number }[] = [];
  for (const m of enc.monsters) {
    if (m.hp <= 0 || isPhased(m)) continue;
    const dx = m.x - px;
    const dy = m.y - py;
    // along = how far ahead of the party, across = how far to the side: across <= along is the 45 degree limit
    const along = dx * fx + dy * fy;
    const across = Math.abs(dx * fy - dy * fx);
    if (along <= 0 || across > along || Math.max(Math.abs(dx), Math.abs(dy)) > MONSTER_ACTION_RADIUS) continue;
    candidates.push({ m, dist: dx * dx + dy * dy, side: across });
  }
  candidates.sort((a, b) => a.dist - b.dist || a.side - b.side);
  for (const c of candidates) if (lineOfSight(view, enc, px, py, c.m.x, c.m.y, true)) return c.m;
  return null;
}

/**
 * One party action against a monster. In free roam everybody with a ranged weapon fires and the monsters answer;
 * in battle mode the characters act one after another in speed order and the monsters answer after the last one.
 * Port of attack_monster.
 */
export function partyAttack(party: Party, view: GridView, enc: Encounter, px: number, py: number, rng: Rng, attack: PartyAttack): CombatEvent[] {
  const events: CombatEvent[] = [];
  const target = enc.monsters.find((m) => m.uid === attack.targetUid && m.hp > 0 && !isPhased(m));
  if (!target) return [{ type: "denied", reason: "no_target" }];
  // arrows and spells need a clear line like the monsters' shots do: walls and closed gates stop them (melee has no distance)
  if (attack.kind !== "melee" && !lineOfSight(view, enc, px, py, target.x, target.y)) return [{ type: "denied", reason: "no_target" }];
  const def = monsterById(target.defId);
  const distance = Math.max(Math.abs(target.x - px), Math.abs(target.y - py));

  const attackerIndex = beginTurn(party, enc);

  let damage = 0;
  let shots = 1;
  if (attack.kind === "ranged") {
    if (distance > MONSTER_ACTION_RADIUS - 1) return [{ type: "denied", reason: "out_of_range" }];
    if (!enc.battleMode) {
      let arrows = 0;
      for (const c of party.characters) {
        if (canAct(c) && itemBonus(c, "ranged_dam_max") > 0) {
          damage += rangedDamage(c, def, distance, rng);
          arrows++;
        }
      }
      if (arrows === 0) return [{ type: "denied", reason: "no_ranged_weapon" }];
      shots = arrows;
    } else {
      const shooter = party.characters[attackerIndex ?? firstActive(party)]!;
      if (itemBonus(shooter, "ranged_dam_max") <= 0) return [{ type: "denied", reason: "no_ranged_weapon" }];
      damage = rangedDamage(shooter, def, distance, rng);
    }
  } else if (attack.kind === "melee") {
    const attacker = party.characters[attackerIndex ?? firstActive(party)]!;
    if (!canAct(attacker)) return [{ type: "denied", reason: "cannot_act" }];
    damage = meleeDamage(attacker, def, rng);
  } else if (attack.magic) {
    damage = spellDamageToMonster(def, attack.magic.damage, attack.magic.type);
  }

  target.hp -= damage;
  events.push({ type: "party_attack", attacker: attackerIndex, kind: attack.kind, uid: target.uid, defId: target.defId, damage, shots });
  killIfDead(party, enc, target, rng, events);

  if (!enc.battleMode) events.push(...monsterTurn(party, view, enc, px, py, rng));
  else advanceRound(party, view, enc, px, py, rng, events);
  spendAction(party, events);
  return events;
}

/**
 * A spell that does not hit a monster (healing, light, protection, jumping) still costs a round, as in the old game: whoever is
 * near gets to move and strike. In battle mode the caster uses up their turn like an attacker; out of battle the monsters
 * simply act once. Without this the party could heal itself in full while the monsters stood by.
 */
export function spellRound(party: Party, view: GridView, enc: Encounter, px: number, py: number, rng: Rng): CombatEvent[] {
  const events: CombatEvent[] = [];
  beginTurn(party, enc);
  if (!enc.battleMode) events.push(...monsterTurn(party, view, enc, px, py, rng));
  else advanceRound(party, view, enc, px, py, rng, events);
  spendAction(party, events);
  return events;
}

function firstActive(party: Party): number {
  const i = party.characters.findIndex((c) => canAct(c));
  return i < 0 ? 0 : i;
}

/** What every spell that works on monsters ends with: the caster's turn is over, the monsters answer, the clock moves. */
function finishSpell(party: Party, view: GridView, enc: Encounter, px: number, py: number, rng: Rng, events: CombatEvent[]): void {
  beginTurn(party, enc);
  if (!enc.battleMode) events.push(...monsterTurn(party, view, enc, px, py, rng));
  else advanceRound(party, view, enc, px, py, rng, events);
  spendAction(party, events);
}

/** The monsters a beam hits: everyone on the line from the party through `target`, up to the action radius, but not through a wall or a gate. */
function monstersOnLine(view: GridView, enc: Encounter, px: number, py: number, target: MonsterInstance): MonsterInstance[] {
  const dx = Math.abs(target.x - px);
  const dy = Math.abs(target.y - py);
  const sx = px < target.x ? 1 : -1;
  const sy = py < target.y ? 1 : -1;
  let err = dx - dy;
  let cx = px;
  let cy = py;
  const hit: MonsterInstance[] = [];
  for (let step = 0; step < MONSTER_ACTION_RADIUS; step++) {
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      cx += sx;
    }
    if (e2 < dx) {
      err += dx;
      cy += sy;
    }
    if (view.opaque(cx, cy) || view.obstacle?.(cx, cy)) break;
    const m = enc.monsters.find((x) => x.hp > 0 && x.x === cx && x.y === cy);
    if (m && !isPhased(m)) hit.push(m);
  }
  return hit;
}

/**
 * Penetrating spell: hits every monster on the line from the party through the target, up to the action radius.
 * `undead`: null = all, true = undead only, false = living only.
 */
export function spellInLine(party: Party, view: GridView, enc: Encounter, px: number, py: number, rng: Rng, targetUid: string, magic: { damage: number; type: string }, undead: boolean | null): CombatEvent[] {
  const target = enc.monsters.find((m) => m.uid === targetUid && !isPhased(m));
  if (!target) return [{ type: "denied", reason: "no_target" }];
  if (!lineOfSight(view, enc, px, py, target.x, target.y)) return [{ type: "denied", reason: "no_target" }];
  const events: CombatEvent[] = [];
  for (const m of monstersOnLine(view, enc, px, py, target)) {
    if (undead !== null && isUndead(m.defId) !== undead) continue;
    const damage = spellDamageToMonster(monsterById(m.defId), magic.damage, magic.type);
    m.hp -= damage;
    events.push({ type: "party_attack", attacker: null, kind: "magic", uid: m.uid, defId: m.defId, damage });
    killIfDead(party, enc, m, rng, events);
  }
  finishSpell(party, view, enc, px, py, rng, events);
  return events;
}

/** Spells with a rule of their own for whom they hit and how hard. */
export type SpecialSpell = "star_burst" | "holy_word" | "mass_distortion" | "finger_of_death";

/** Star Burst: everything within this many tiles of the target. */
export const STAR_BURST_RADIUS = 3;
/** Holy Word: undead with more health than this lose a share of it instead of a fixed amount. */
export const HOLY_WORD_BIG = 600;
export const HOLY_WORD_DAMAGE = 150;
export const HOLY_WORD_SHARE = 0.25;
/** Mass Distortion: the chance for each monster on the line to lose half its health. */
export const MASS_DISTORTION_CHANCE = 0.2;
/** Finger of Death: the chance to kill, and the highest treasure level it works on. */
export const FINGER_CHANCE = 0.5;
export const FINGER_MAX_LEVEL = 2;

/**
 * Star Burst, Holy Word, Mass Distortion and Finger of Death (the spell sheet's own rules). Like the beams they need a clear line to the
 * target; `magic` carries the damage Star Burst rolled.
 */
export function specialSpell(party: Party, view: GridView, enc: Encounter, px: number, py: number, rng: Rng, kind: SpecialSpell, targetUid: string, magic: { damage: number; type: string }): CombatEvent[] {
  const target = enc.monsters.find((m) => m.uid === targetUid && m.hp > 0 && !isPhased(m));
  if (!target || !lineOfSight(view, enc, px, py, target.x, target.y)) return [{ type: "denied", reason: "no_target" }];
  const events: CombatEvent[] = [];
  const strike = (m: MonsterInstance, damage: number): void => {
    m.hp -= damage;
    events.push({ type: "party_attack", attacker: null, kind: "magic", uid: m.uid, defId: m.defId, damage });
    killIfDead(party, enc, m, rng, events);
  };
  switch (kind) {
    case "star_burst":
      for (const m of [...enc.monsters]) {
        if (m.hp <= 0 || isPhased(m)) continue;
        if ((m.x - target.x) ** 2 + (m.y - target.y) ** 2 > STAR_BURST_RADIUS ** 2) continue;
        if (m !== target && !lineOfSight(view, enc, target.x, target.y, m.x, m.y)) continue;
        strike(m, spellDamageToMonster(monsterById(m.defId), magic.damage, magic.type));
      }
      break;
    case "holy_word":
      for (const m of monstersOnLine(view, enc, px, py, target)) {
        if (!isUndead(m.defId)) continue;
        const max = monsterById(m.defId).health;
        strike(m, max > HOLY_WORD_BIG ? Math.floor(max * HOLY_WORD_SHARE) : HOLY_WORD_DAMAGE);
      }
      break;
    case "mass_distortion":
      for (const m of monstersOnLine(view, enc, px, py, target)) {
        if (monsterById(m.defId).treasure_level >= 5 || !(rng.float() < MASS_DISTORTION_CHANCE)) continue;
        strike(m, Math.max(1, Math.floor(m.hp / 2)));
      }
      break;
    case "finger_of_death": {
      const def = monsterById(target.defId);
      strike(target, def.treasure_level <= FINGER_MAX_LEVEL && rng.float() < FINGER_CHANCE ? target.hp : 0);
      break;
    }
  }
  finishSpell(party, view, enc, px, py, rng, events);
  return events;
}

// ---------------------------------------------------------------- spells that change monsters

/** Dimensional Phasing: radius (tiles) and turns. */
export const PHASE_RADIUS = 4;
export const PHASE_TURNS = 5;
export const IMMOBILIZE_TURNS = 3;
export const GRAVITY_RADIUS = 4;

/** Dimensional Phasing: every monster within the radius leaves the fight for `PHASE_TURNS` monster turns. Returns who was caught. */
export function phaseMonsters(enc: Encounter, px: number, py: number): MonsterInstance[] {
  const caught = enc.monsters.filter((m) => m.hp > 0 && (m.x - px) ** 2 + (m.y - py) ** 2 <= PHASE_RADIUS ** 2);
  for (const m of caught) m.phased = PHASE_TURNS;
  return caught;
}

/** Immobilize: three monster turns without moving, once per monster. False when this monster has been held before. */
export function immobilize(m: MonsterInstance): boolean {
  if (m.wasImmobilized) return false;
  m.wasImmobilized = true;
  m.immobile = IMMOBILIZE_TURNS;
  return true;
}

/** Clumsy: false when the monster is clumsy already (the effect does not stack). */
export function makeClumsy(m: MonsterInstance): boolean {
  if (m.clumsy) return false;
  m.clumsy = true;
  return true;
}

/**
 * Gravity: monsters within the radius are pulled along the way they would walk to the party, as far as it is free, but at once, not
 * step by step ("if there is a way"). The ones nearest to the party get the places next to it first.
 */
export function pullMonsters(view: GridView, enc: Encounter, px: number, py: number): CombatEvent[] {
  const events: CombatEvent[] = [];
  const near = enc.monsters
    .filter((m) => m.hp > 0 && !isPhased(m) && !isAdjacent(m.x, m.y, px, py, view) && (m.x - px) ** 2 + (m.y - py) ** 2 <= GRAVITY_RADIUS ** 2)
    .map((m) => ({ m, path: wayToPlayer(view, monsterById(m.defId), m.x, m.y, px, py, GRAVITY_RADIUS + 1) }))
    .filter((s): s is { m: MonsterInstance; path: [number, number][] } => s.path !== null && s.path.length > 0)
    .sort((a, b) => a.path.length - b.path.length);
  const occupied = (x: number, y: number) => (x === px && y === py) || enc.monsters.some((o) => o.hp > 0 && o.x === x && o.y === y);
  for (const { m, path } of near) {
    // the farthest cell of its way that is free, going back from the end
    const spot = [...path].reverse().find(([x, y]) => !occupied(x, y));
    if (!spot) continue;
    events.push({ type: "monster_pull", uid: m.uid, from: [m.x, m.y], to: [spot[0], spot[1]] });
    m.x = spot[0];
    m.y = spot[1];
    m.pulled = true;
  }
  return events;
}

export interface MonsterReport {
  uid: string;
  defId: number;
  name: string;
  hp: number;
  maxHp: number;
  armor: number;
  attacks: number;
  abilities: string;
}

/** Identify Monster: what the party learns about every monster within the action radius. */
export function identifyMonsters(enc: Encounter, px: number, py: number): MonsterReport[] {
  return enc.monsters
    .filter((m) => m.hp > 0 && (m.x - px) ** 2 + (m.y - py) ** 2 <= MONSTER_ACTION_RADIUS ** 2)
    .sort((a, b) => (a.x - px) ** 2 + (a.y - py) ** 2 - ((b.x - px) ** 2 + (b.y - py) ** 2))
    .map((m) => {
      const def = monsterById(m.defId);
      return { uid: m.uid, defId: m.defId, name: def.name, hp: m.hp, maxHp: def.health, armor: def.armor, attacks: def.no_of_attacks, abilities: def.special_abilties ?? "" };
    });
}
