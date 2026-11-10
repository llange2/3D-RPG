import { FACING_NAMES } from "../actions/quests";
import type { ActionInstance } from "../actions/types";
import { QUESTS } from "../data/quest-table";
import { MONSTERS, SPELLS } from "../data/tables";
import type { DungeonRef } from "../interiors/types";
import type { Poi } from "../world/types";

const CLASS_TEXT = { A: "A (free to enter)", B: "B (needs a key)", C: "C (pyramid, needs a key card)" } as const;

const monsterName = (id: number): string => MONSTERS[id]?.name ?? `#${id}`;

/** The spell scrolls the plan of the world put into a place (every spell lies twice in the world). */
const spellLine = (spells: readonly number[]): string => `Spell scrolls: ${spells.length > 0 ? spells.map((id) => SPELLS[id]?.title ?? `#${id}`).join(", ") : "none"}`;

/**
 * What the generator knows about a place, for the debug menu (Esc > Debug > Identify): the old map it is built after, who lives
 * there, which trap and quest it has and how it takes part in the key chain. Plain lines of text; `dungeon` is null for towns and
 * castles, which have no theme of the old maps.
 */
export function identifyLines(poi: Poi, dungeon: DungeonRef | null, castleSpells: readonly number[] = [], secrets: readonly Secret[] = [], actions: readonly ActionInstance[] = []): string[] {
  const lines = [`${poi.name}`, `${poi.kind}, tier ${poi.tier}, id ${poi.id}`];
  if (!dungeon) {
    lines.push("", "No quest: a town or castle is not a cave or dungeon.");
    if (poi.kind === "castle") {
      lines.push(spellLine(castleSpells));
      // the king's four-letter word (54th playtest, point 4)
      lines.push(...solutionLines(undefined, actions));
    }
    lines.push(secretLine(secrets));
    return lines;
  }
  const theme = dungeon.look;
  lines.push(
    "",
    `Quest: ${dungeon.quest === "spaceship" ? dungeon.quest : `${dungeon.quest} (${QUESTS[dungeon.quest].name})`}, layout ${dungeon.layout}`,
    `Class: ${CLASS_TEXT[dungeon.klass]}`,
    `Inhabitants: ${theme.inhabitants}`,
    // only quest 5 has a real boss (the monster sheet's "Boss for"); elsewhere the strongest monster of the place guards the room that is deepest in
    `Monsters: ${theme.monsters.map(monsterName).join(", ")}; ${dungeon.quest === "quest_5" ? "boss" : "guard of the deepest room"} ${monsterName(theme.boss)}`,
    `Trap: ${theme.trap}${theme.trapElement ? ` (${theme.trapElement})` : ""}`,
    `Entrance asks for: ${dungeon.requires ?? "nothing"}`,
    `End room holds: ${dungeon.gives.length > 0 ? dungeon.gives.join(", ") : "no key or key card"}${dungeon.orbs > 0 ? `, ${dungeon.orbs} orbs of ultimate power` : ""}`,
  );
  lines.push(spellLine(dungeon.spells));
  if (dungeon.section !== undefined) lines.push(`Opens section ${dungeon.section + 1} of the spaceship`);
  if (dungeon.endRoom) lines.push(`End room: ${dungeon.endRoom.w} x ${dungeon.endRoom.h} cells at ${dungeon.endRoom.x}/${dungeon.endRoom.y}${dungeon.endRoom.isolated ? ", reached by teleport" : ""}`);
  lines.push(...solutionLines(dungeon.quest, actions));
  lines.push(secretLine(secrets));
  return lines;
}

const cell = (a: Pick<ActionInstance, "x" | "y">): string => `${a.x}/${a.y}`;
const listOf = (cells: readonly ActionInstance[]): string => (cells.length > 0 ? cells.map(cell).join(", ") : "none");

/**
 * The solution of the quest of a place, read from its generated content (54th playtest, point 4), or nothing where the place has none to give (quest 5 is won by killing the boss, a
 * place without a quest object has no puzzle). Cells are `x/y` of the map, like the secrets. `quest` is undefined in a castle: its riddle is the king's word.
 */
export function solutionLines(quest: string | undefined, actions: readonly ActionInstance[]): string[] {
  const of = (kind: string, mode?: string): ActionInstance[] => actions.filter((a) => a.kind === kind && (mode === undefined || a.params.mode === mode));
  const end = actions.find((a) => a.kind === "riddle" && (a.params.opens === "end" || a.params.opens === "castle"));
  const answerLine = (): string[] => {
    if (!end) return [];
    const aliases = String(end.params.aliases ?? "");
    return [`Solution: answer "${String(end.params.answer)}" to the statue at ${cell(end)}${aliases ? ` (also accepted: ${aliases.split(",").join(", ")})` : ""}`];
  };
  switch (quest) {
    case "quest_1": {
      // a statue stands when it starts so, unless its lever was pulled an odd number of times (`ringHeadPresent`): wrong start = one pull of its lever
      const field = of("head", "moan");
      if (field.length === 0) return [];
      const pull = field.filter((h) => (Number(h.params.start) === 1) !== (Number(h.params.want) === 1));
      const levers = pull.map((h) => actions.find((a) => a.kind === "lever" && a.params.target === h.uid)).filter((a): a is ActionInstance => !!a);
      const rune = actions.find((a) => a.kind === "rune" && a.params.need === "moan");
      return [
        `Solution: statues that must stand: ${listOf(field.filter((h) => Number(h.params.want) === 1))}; must be empty: ${listOf(field.filter((h) => Number(h.params.want) !== 1))}`,
        `Pull once the levers at ${listOf(levers)} (statues at ${listOf(pull)}); then the rune at ${rune ? cell(rune) : "the middle"} teleports the party to the end room`,
      ];
    }
    case "quest_2": {
      const row = of("head", "rotate").sort((a, b) => Number(a.params.order) - Number(b.params.order));
      if (row.length === 0) return [];
      return [`Solution: turn the heads to face: ${row.map((h) => `no. ${String(h.params.order)} at ${cell(h)} ${FACING_NAMES[Number(h.params.want)] ?? "?"}`).join("; ")}`, "Then the runes that appear in the hall teleport the party to the end room"];
    }
    case "quest_3": {
      const gongs = of("gong");
      return gongs.length === 0 ? [] : [`Solution: strike all ${gongs.length} gongs (${listOf(gongs)}); the runes then appear round the gong struck last and teleport the party to the end room`];
    }
    case "quest_4": {
      const fallen = actions.filter((a) => a.kind === "lore" && typeof a.params.fallen === "number");
      return [...answerLine(), ...(fallen.length > 0 ? [`(the plaques of the ${fallen.length} statues add up: ${fallen.map((a) => `${cell(a)}: ${String(a.params.fallen)}`).join(", ")})`] : [])];
    }
    case "quest_5":
      return ["Solution: defeat the end boss"];
    default:
      // quest 6, and the king's word in a castle
      return answerLine();
  }
}

/** A brittle wall of the place (a secret): the cell of the wall in the map and whether the party has broken it already. */
export interface Secret {
  x: number;
  y: number;
  broken: boolean;
}

/** The secrets of a place, as cell coordinates of its map (the cell of the wall itself). */
function secretLine(secrets: readonly Secret[]): string {
  if (secrets.length === 0) return "Secrets (brittle walls): none";
  return `Secrets (brittle walls): ${secrets.map((s) => `${s.x}/${s.y}${s.broken ? " (broken)" : ""}`).join(", ")}`;
}
