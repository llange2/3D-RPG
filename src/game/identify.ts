import { QUEST_BUILT, THEMES_BY_ID } from "../data/dungeon-themes";
import { MONSTERS, talentInfo } from "../data/tables";
import type { DungeonRef } from "../interiors/types";
import type { Poi } from "../world/types";

const CLASS_TEXT = { A: "A (free to enter, may hold keys)", B: "B (needs a key, may hold a key card)", C: "C (pyramid, needs a key card)" } as const;

const monsterName = (id: number): string => MONSTERS[id]?.name ?? `#${id}`;

/**
 * What the generator knows about a place, for the debug menu (Esc > Debug > Identify): the old map it is built after, who lives
 * there, which trap and quest it has and how it takes part in the key chain. Plain lines of text; `dungeon` is null for towns and
 * castles, which have no theme of the old maps.
 */
export function identifyLines(poi: Poi, dungeon: DungeonRef | null): string[] {
  const lines = [`${poi.name}`, `${poi.kind}, tier ${poi.tier}, id ${poi.id}`];
  const theme = dungeon ? THEMES_BY_ID[dungeon.id] : undefined;
  if (!dungeon || !theme) {
    lines.push("", "No dungeon theme: a town or castle holds no quest of the old maps.");
    return lines;
  }
  lines.push(
    "",
    `Built after: ${theme.name} (${theme.id})`,
    `Class: ${CLASS_TEXT[dungeon.klass]}`,
    `Inhabitants: ${theme.inhabitants}`,
    `Monsters: ${theme.monsters.map(monsterName).join(", ")}; boss ${monsterName(theme.boss)}`,
    `Trap: ${theme.trap}${theme.trapElement ? ` (${theme.trapElement})` : ""}`,
    `Quest: ${theme.quest}${theme.quest === "none" ? "" : QUEST_BUILT.includes(theme.quest) ? "" : " (not built by the generator)"}`,
    `Entrance asks for: ${dungeon.requires ?? "nothing"}`,
    `Holds: ${dungeon.gives.length > 0 ? dungeon.gives.join(", ") : "no key or key card"}`,
  );
  if (theme.talents?.length) lines.push(`Sells talents: ${theme.talents.map((t) => talentInfo(t).name).join(", ")}`);
  if (dungeon.hall) lines.push(`Hall for the quest: ${dungeon.hall.w} x ${dungeon.hall.h} cells at ${dungeon.hall.x}/${dungeon.hall.y}`);
  if (dungeon.glyph) lines.push(`Picture riddle: the walls draw ${dungeon.glyph}`);
  return lines;
}
