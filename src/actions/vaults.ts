import { Rng } from "../core/rng";
import { CHEST_TRAP_CHANCE, CHEST_TRAP_ELEMENTS } from "../data/chest-traps";
import { FORBIDDEN_PROPS } from "../data/dungeon-themes";
import { TRAP_DAMAGE } from "../data/rules";
import { allowedIn } from "../data/item-rules";
import { placeOf } from "../interiors/place";
import { resolveParam } from "./expr";
import { ATTRS } from "./handlers";
import type { QuestEnv } from "./questGen";
import type { ParamValue } from "./types";

/**
 * The treasure chambers behind brittle walls (35th playtest, rule for caves and dungeons): a place has 0 to 3 of them (`carveVaults`, `DungeonRef.vaults`). The wall cell that closes
 * a chamber is a `breakable_wall` like any other (it looks like every wall; a party with the Perceptive talent can break it). Behind it lie
 *  - a chest with twice the loot of an ordinary chest of the level (gold as in a chest at a dead end, twice; one or two items instead of none or one), and
 *  - one time in ten a vessel with points of an attribute or a resistance of the level one below the level of the place (nothing in a level 1 place, level 1 points in a level 2 place),
 *    drunk by the one hero the party picks like the points of an end room.
 */
export const VAULT_BONUS_CHANCE = 100; // permille

/** Points of an attribute by the level of the points (the packages of the end rooms of level 1 to 3, doubled once more for level 4); a resistance gets twice as many percent. */
export const VAULT_PACKAGE: Readonly<Record<number, number>> = { 1: 5, 2: 10, 3: 20, 4: 40 };

const ELEMENTS = ["fire", "ice", "acid", "magic"] as const;
const BARREL = 5;
/** The objects that hold points (see `rewardsOf` in `endRoom.ts`): wells, barrel and crystals, the chalice from level 4 on. */
const VESSELS = [37, 88, BARREL, 117];
const CHALICE_FROM_LEVEL = 4;

type Cell = { x: number; y: number };
type Params = Record<string, ParamValue>;

/** The bonus of a vault in a place of this level, or null (level 1 places have none: the points are those of level 0). */
export function vaultBonus(tier: number, rng: Rng): { attr: string; amount: number } | { element: (typeof ELEMENTS)[number]; amount: number } | null {
  const level = Math.min(4, tier - 1);
  if (level < 1) return null;
  const amount = VAULT_PACKAGE[level]!;
  return rng.chance(500) ? { attr: ATTRS[rng.int(ATTRS.length)]!, amount } : { element: ELEMENTS[rng.int(ELEMENTS.length)]!, amount: amount * 2 };
}

export function placeVaults(env: QuestEnv): void {
  const vaults = env.map.dungeon?.vaults;
  if (!vaults || vaults.length === 0) return;
  const place = placeOf(env.map);
  const forbidden = FORBIDDEN_PROPS[env.map.dungeon!.look.inhabitants];
  vaults.forEach((v, i) => {
    const rng = new Rng(env.derive(`vault-${i}`));
    // the cell of the chamber that touches the wall, where the party steps in, and the cell in front of the wall outside it
    const inside: Cell = { x: Math.min(v.x + v.w - 1, Math.max(v.x, v.seal.x)), y: Math.min(v.y + v.h - 1, Math.max(v.y, v.seal.y)) };
    const front: Cell = { x: v.seal.x + (v.seal.x - inside.x), y: v.seal.y + (v.seal.y - inside.y) };
    const horizontal = front.y === v.seal.y;
    env.actions.push({ uid: `${env.map.key}#brittle:${i}`, kind: "breakable_wall", x: v.seal.x, y: v.seal.y, params: { axis: horizontal ? "x" : "y" } });
    env.reserve(v.seal.x, v.seal.y);

    // the cells of the chamber, the farthest from the wall first; an object never shuts a corner off or stands where the party cannot reach it
    const cells: Cell[] = [];
    for (let y = v.y; y < v.y + v.h; y++) for (let x = v.x; x < v.x + v.w; x++) if (!(x === inside.x && y === inside.y)) cells.push({ x, y });
    const far = (c: Cell) => Math.abs(c.x - inside.x) + Math.abs(c.y - inside.y);
    cells.sort((p, q) => far(q) - far(p) || p.y - q.y || p.x - q.x);
    const taken = new Set<string>();
    const key = (c: Cell) => `${c.x},${c.y}`;
    const keeps = (c: Cell): boolean => {
      const blocked = new Set([...taken, key(c)]);
      const seen = new Set<string>([key(inside)]);
      const queue = [inside];
      for (let head = 0; head < queue.length; head++) {
        const q = queue[head]!;
        for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]] as const) {
          const n = { x: q.x + dx, y: q.y + dy };
          if (n.x < v.x || n.y < v.y || n.x >= v.x + v.w || n.y >= v.y + v.h || blocked.has(key(n)) || seen.has(key(n))) continue;
          seen.add(key(n));
          queue.push(n);
        }
      }
      if (seen.size !== v.w * v.h - blocked.size) return false;
      return [...blocked].every((b) => {
        const [bx, by] = b.split(",").map(Number) as [number, number];
        return ([[0, 1], [1, 0], [0, -1], [-1, 0]] as const).some(([dx, dy]) => seen.has(`${bx + dx},${by + dy}`));
      });
    };
    const put = (kind: "treasure" | "chalice", name: string, params: Params): boolean => {
      const at = cells.findIndex(keeps);
      if (at < 0) return false;
      const cell = cells.splice(at, 1)[0]!;
      taken.add(key(cell));
      return env.placeEnd({ uid: env.uid(`vault-${name}`), kind, x: cell.x, y: cell.y, params });
    };

    // twice the loot of an ordinary chest; it has no lock, so it springs a trap one time in five like every unlocked chest
    const level = Math.min(8, env.tier);
    const chest: Params = { level, gold: 2 * (env.tier * 90 + rng.range(0, 120)), items: 1 + rng.range(0, 1), chest: env.theme.chest };
    const trapRng = new Rng(env.derive(`vault-trap-${i}`));
    if (trapRng.chance(CHEST_TRAP_CHANCE)) {
      const elements = env.map.kind === "cave" ? CHEST_TRAP_ELEMENTS.filter((e) => e !== "ice") : CHEST_TRAP_ELEMENTS;
      chest.trapped = elements[trapRng.int(elements.length)]!;
      chest.trapDamage = resolveParam(TRAP_DAMAGE.generic ?? 0, { tier: env.tier, depth: 0, depthRatio: 0, mapTier: env.tier }, trapRng);
      chest.trapLevel = env.tier;
    }
    put("treasure", "chest", chest);

    // one time in ten: points of an attribute or a resistance of the level below
    const bonusRng = new Rng(env.derive(`vault-bonus-${i}`));
    if (!bonusRng.chance(VAULT_BONUS_CHANCE)) return;
    const bonus = vaultBonus(env.tier, bonusRng);
    if (!bonus) return;
    const vessels = VESSELS.filter((item) => allowedIn(item, place) && !forbidden.includes(item));
    const item = env.tier >= CHALICE_FROM_LEVEL || vessels.length === 0 ? 86 : vessels[bonusRng.int(vessels.length)]!;
    const points: Params = "attr" in bonus ? { bonus: "attr", attr: bonus.attr, amount: bonus.amount } : { bonus: "res", element: bonus.element, amount: bonus.amount };
    // a barrel is a container wherever it stands (`treasure` with chest 5): the points in it are drunk like those of a chalice
    if (item === BARREL) put("treasure", "bonus", { level: 1, gold: 0, items: 0, chest: BARREL, ...points });
    else put("chalice", "bonus", { item, ...points });
  });
}
