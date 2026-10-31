import { Rng, derive, type SeedState } from "../core/rng";
import type { InteriorMap } from "../interiors/types";
import type { ActionInstance, ParamValue } from "./types";

/**
 * Puts the spell scrolls the plan of the world assigned to a place into its containers (`planSpellLoot`, `interiors/spellPlan.ts`): its chests, barrels, heaps of treasure and
 * bookshelves, spread as evenly as the number allows. The ones that belong to something else stay as they are: a container with a quest item or a bonus (the end room), one
 * with a lock of its own (the king's chests), the end room and the room of the machines. A place with no ordinary container uses the chests of its end room instead, so that no
 * scroll is lost (every spell lies exactly twice in the world). In a castle only the chests of the niches hold scrolls (`onlyAlarm`).
 */
export function hideSpells(map: InteriorMap, actions: ActionInstance[], spells: readonly number[], seed: SeedState, onlyAlarm = false): void {
  if (spells.length === 0) return;
  const end = map.dungeon?.endRoom;
  const machines = map.dungeon?.machines;
  const inRoom = (a: ActionInstance, r?: { x: number; y: number; w: number; h: number }) => !!r && a.x >= r.x && a.y >= r.y && a.x < r.x + r.w && a.y < r.y + r.h;
  const holds = (a: ActionInstance): boolean => a.kind === "treasure" && typeof a.params.quest !== "string" && a.params.bonus === undefined && a.params.lock === undefined;
  // (the treasure chambers behind brittle walls hold none: a scroll that only a party with the Perceptive talent can reach would be lost to the others)
  const vaults = map.dungeon?.vaults ?? [];
  let containers = actions.filter((a) => holds(a) && !inRoom(a, end) && !inRoom(a, machines) && !vaults.some((v) => inRoom(a, v)) && (!onlyAlarm || a.params.warn === "alarm"));
  if (containers.length === 0 && !onlyAlarm) containers = actions.filter((a) => holds(a) && inRoom(a, end));
  if (containers.length === 0) return;
  const rng = new Rng(derive(seed, "hide-spells"));
  const order = rng.shuffle(containers);
  spells.forEach((id, i) => {
    const container = order[i % order.length]!;
    const have = typeof container.params.scrolls === "string" && container.params.scrolls !== "" ? `${String(container.params.scrolls)},` : "";
    (container.params as Record<string, ParamValue>).scrolls = `${have}${id}`;
  });
}
