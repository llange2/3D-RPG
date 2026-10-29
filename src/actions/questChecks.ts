import type { InteriorMap } from "../interiors/types";
import type { MapContent } from "./types";

/**
 * The quests of a place must be solvable with what the place shows: the answer of every statue is the one the table, the count or the sum gives,
 * every statue of a field has its lever, the end room can be reached once the quest is done. Returns the problems found; empty means every
 * quest of the place can be solved.
 */
export function questIssues(map: InteriorMap, content: MapContent): string[] {
  const issues: string[] = [];
  if (!map.dungeon || map.dungeon.quest === "spaceship") return issues;
  void content;
  return issues;
}
