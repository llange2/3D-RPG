import type { Rng } from "../core/rng";
import { CHEST_TRAP_ELEMENTS, type ChestTrapElement } from "../data/chest-traps";
import { TRAP_DAMAGE } from "../data/rules";
import { resolveParam, type ExprVars } from "./expr";

/**
 * The trap that a locked chest keeps for a failed attempt (`LOCK_FUMBLE_CHANCE` in `data/locks.ts`): element, damage and level are fixed when the place is generated, like those of an
 * unlocked chest (`trapped`), but under their own name (`lockTrap`), because `trapped` springs when the chest is opened and this one when the lock is not picked. The damage is
 * `TRAP_DAMAGE.generic` for the tier of the place. `rng` is a stream of its own, so nothing else of the chest changes.
 */
export function lockTrapParams(rng: Rng, vars: ExprVars, cave: boolean): { lockTrap: ChestTrapElement; trapDamage: number; trapLevel: number } {
  const elements = cave ? CHEST_TRAP_ELEMENTS.filter((e) => e !== "ice") : CHEST_TRAP_ELEMENTS;
  return { lockTrap: elements[rng.int(elements.length)]!, trapDamage: Number(resolveParam(TRAP_DAMAGE.generic ?? 0, vars, rng)), trapLevel: vars.tier ?? 1 };
}
