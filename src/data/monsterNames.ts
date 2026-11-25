import { MONSTERS } from "./tables";

/**
 * The names of the monsters in the version being played (`assets/pack.ts`: the `names` of a pack's `pack.json`, monster id -> name). Called once at start-up, after the version is chosen
 * and before anything is shown; a change of version reloads the page, so the table never holds two sets of names.
 *
 * Only the display changes: ids, values, models and every table stay. What the generation decides by a name reads `BASE_MONSTER_NAMES` (tables.ts), never `MONSTERS[id].name`.
 * Ids the table does not know are ignored (a pack may name a monster that a later version of the table brings).
 */
export function applyMonsterNames(names: Readonly<Record<string, string>>): number {
  let changed = 0;
  for (const [id, name] of Object.entries(names)) {
    const def = MONSTERS[Number(id)];
    if (!def || typeof name !== "string" || name.trim() === "" || def.name === name) continue;
    def.name = name;
    changed++;
  }
  return changed;
}
