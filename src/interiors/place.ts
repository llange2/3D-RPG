import type { Place } from "../data/item-rules";
import type { InteriorMap } from "./types";

/** The kind of place of the user's object list (`data/item-rules.ts`) that an interior is. A pyramid's inside is the spaceship. */
export function placeOf(map: Pick<InteriorMap, "kind" | "theme">): Place {
  if (map.kind === "fortress") return "castle";
  if (map.kind === "dungeon" && map.theme.id === "cyber") return "spaceship";
  return map.kind;
}
