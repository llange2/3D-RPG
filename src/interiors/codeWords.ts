import { RIDDLES_WORLD } from "../data/riddles";
import type { World } from "../world/world";
import type { SpaceshipLayout } from "./types";

/**
 * The code words for the computers of the spaceship's control room (quest document 1.5): the answers of the mini quests of every place of the world, by level of the place.
 * The plan of the world sets the mini quests (`DungeonRef.minis`, riddles of `RIDDLES_WORLD`); a place without one is not listed, a pyramid has none.
 */
export function codeWordsOf(world: World): SpaceshipLayout["codeWords"] {
  const out: SpaceshipLayout["codeWords"] = [];
  for (const poi of world.allPois()) {
    if (poi.kind !== "dungeon" && poi.kind !== "cave") continue;
    const ref = world.dungeonRef(poi.id);
    if (!ref || ref.quest === "spaceship") continue;
    const words = ref.minis.map((n) => RIDDLES_WORLD[String(n)]?.answer).filter((a): a is string => typeof a === "string" && a !== "");
    if (words.length > 0) out.push({ tier: poi.tier, place: poi.name, words });
  }
  // by level, then by name (the same for every machine)
  return out.sort((p, q) => p.tier - q.tier || (p.place < q.place ? -1 : p.place > q.place ? 1 : 0));
}
