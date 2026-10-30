import { QUESTS } from "../data/quest-table";
import { MONSTERS } from "../data/tables";
import type { DungeonRef } from "../interiors/types";
import type { Poi } from "../world/types";

const CLASS_TEXT = { A: "A (free to enter)", B: "B (needs a key)", C: "C (pyramid, needs a key card)" } as const;

const monsterName = (id: number): string => MONSTERS[id]?.name ?? `#${id}`;

/**
 * What the generator knows about a place, for the debug menu (Esc > Debug > Identify): the old map it is built after, who lives
 * there, which trap and quest it has and how it takes part in the key chain. Plain lines of text; `dungeon` is null for towns and
 * castles, which have no theme of the old maps.
 */
export function identifyLines(poi: Poi, dungeon: DungeonRef | null): string[] {
  const lines = [`${poi.name}`, `${poi.kind}, tier ${poi.tier}, id ${poi.id}`];
  if (!dungeon) {
    lines.push("", "No quest: a town or castle is not a cave or dungeon.");
    return lines;
  }
  const theme = dungeon.look;
  lines.push(
    "",
    `Quest: ${dungeon.quest === "spaceship" ? dungeon.quest : `${dungeon.quest} (${QUESTS[dungeon.quest].name})`}, layout ${dungeon.layout}`,
    `Class: ${CLASS_TEXT[dungeon.klass]}`,
    `Inhabitants: ${theme.inhabitants}`,
    `Monsters: ${theme.monsters.map(monsterName).join(", ")}; boss ${monsterName(theme.boss)}`,
    `Trap: ${theme.trap}${theme.trapElement ? ` (${theme.trapElement})` : ""}`,
    `Entrance asks for: ${dungeon.requires ?? "nothing"}`,
    `End room holds: ${dungeon.gives.length > 0 ? dungeon.gives.join(", ") : "no key or key card"}${dungeon.orbs > 0 ? `, ${dungeon.orbs} orbs of ultimate power` : ""}`,
  );
  if (dungeon.section !== undefined) lines.push(`Opens section ${dungeon.section + 1} of the spaceship`);
  if (dungeon.endRoom) lines.push(`End room: ${dungeon.endRoom.w} x ${dungeon.endRoom.h} cells at ${dungeon.endRoom.x}/${dungeon.endRoom.y}${dungeon.endRoom.isolated ? ", reached by teleport" : ""}`);
  return lines;
}
