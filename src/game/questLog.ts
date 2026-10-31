import { ORBS_FOR_KING, SKULLS_FOR_RING, type QuestId } from "../data/quest-table";
import { MONSTERS, QUEST_ITEMS } from "../data/tables";
import type { Poi } from "../world/types";
import type { World } from "../world/world";

/**
 * The quest log of the generated world (35th playtest): what the party has taken on in the places it knows, open and finished. Nothing here is stored on its own; it is read
 * from the world's plan and from the flags the game keeps in `state.opened` (saves from before the log have no flags and still show everything they can know):
 *  - the Skull Miser of the start town (`skulls=<n>` handed in, `skullmiser:met`),
 *  - the three kings and the orbs (`king:<alignment>=<n>`, `king:winner=<alignment>`; a castle counts once the party has been inside),
 *  - the places that ask for a key or a key card (`lock:<place id>` is set when the party stood before the locked way in),
 *  - the quest of every cave and dungeon the party has entered, finished once the party has reached its end room (`reached:<place id>`).
 */

export const SKULL_MISER_MET = "skullmiser:met";
export const lockSeenFlag = (poiId: string): string => `lock:${poiId}`;
export const reachedFlag = (poiId: string): string => `reached:${poiId}`;
/** A thing the heroes have found out in a place (the words of a statue, what a hero heard in his mind): the text rides in the flag, so the save format stays as it is. */
export const clueFlag = (poiId: string, text: string): string => `clue:${poiId}|${text}`;

export interface QuestLogInput {
  world: World;
  opened: ReadonlySet<string>;
  visited: ReadonlySet<string>;
  /** How many quest items of a type the party carries. */
  carried: (type: string) => number;
}

export interface QuestLogView {
  open: string[];
  done: string[];
  /** The mouse-over of a line of `open` or `done`: what the heroes have found out for that quest (36th playtest). Absent when nothing was found out. */
  notes?: Record<string, string>;
}

const at = (poi: Poi): string => `${poi.x}/${poi.y}`;
const itemName = (type: string): string => (QUEST_ITEMS.find((q) => q.type === type)?.name ?? type).toLowerCase();
const number = (opened: ReadonlySet<string>, prefix: string): number => Number([...opened].find((k) => k.startsWith(prefix))?.slice(prefix.length) ?? 0);

/** The words of each quest of a dungeon: what the party wants, and what it did. A cave of any quest is only explored. */
const DUNGEON_LINES: Record<QuestId, { open: (name: string, where: string, boss: string) => string; done: (name: string, boss: string) => string }> = {
  quest_1: {
    open: (n, w) => `Find out what the moaning statues of ${n} (${w}) want, and reach its hidden chamber.`,
    done: (n) => `Silenced the moaning statues of ${n} and reached its hidden chamber.`,
  },
  quest_2: {
    open: (n, w) => `Make the stone heads of ${n} (${w}) face the right way and reach the chamber behind the wall.`,
    done: (n) => `Set the stone heads of ${n} right and reached the chamber behind the wall.`,
  },
  quest_3: {
    open: (n, w) => `Strike all the gongs of ${n} (${w}) and step through the runes.`,
    done: (n) => `Struck the gongs of ${n} and stepped through the runes.`,
  },
  quest_4: {
    open: (n, w) => `Add up the fate of the fallen warriors in ${n} (${w}) and tell the last statue.`,
    done: (n) => `Told the last statue of ${n} how many warriors had fallen.`,
  },
  quest_5: {
    open: (n, w, boss) => `Defeat the mighty ${boss} in the ${n} (${w}).`,
    done: (n, boss) => `Defeated the mighty ${boss} in the ${n}.`,
  },
  quest_6: {
    open: (n, w) => `Find the word that the statues of ${n} (${w}) spell, and tell it to the last one.`,
    done: (n) => `Spelled the word of the statues of ${n}.`,
  },
};

export function worldQuestLog(input: QuestLogInput): QuestLogView {
  const { world, opened, visited } = input;
  const open: string[] = [];
  const done: string[] = [];
  const pois = world.allPois();
  const notes: Record<string, string> = {};

  // the Skull Miser
  const handed = number(opened, "skulls=");
  const carrying = input.carried("quest_silver_skull");
  const town = world.poiById("p:0:0:0");
  if (opened.has(SKULL_MISER_MET) || handed > 0 || carrying > 0) {
    const where = town ? `the Skull Miser in ${town.name}` : "the Skull Miser";
    if (handed >= SKULLS_FOR_RING) done.push(`Brought ${SKULLS_FOR_RING} silver skulls to ${where}.`);
    else open.push(`Bring ${SKULLS_FOR_RING} silver skulls to ${where}: ${handed}/${SKULLS_FOR_RING} handed in${carrying > 0 ? `, you carry ${carrying}` : ""}.`);
  }

  // the kings and the orbs
  const winner = [...opened].find((k) => k.startsWith("king:winner="))?.slice("king:winner=".length);
  const orbs = input.carried("quest_orb");
  const castles = pois.filter((p) => p.kind === "castle");
  const seen = castles.filter((c) => visited.has(c.id));
  for (const castle of seen) {
    const kind = world.castleAlignment(castle.id);
    if (!kind) continue;
    const held = number(opened, `king:${kind}=`);
    if (winner === kind) done.push(`The ${kind} king in ${castle.name} (${at(castle)}) got ${held} Orbs of Ultimate Power and gave you the black key card.`);
    else if (!winner) open.push(`Bring ${ORBS_FOR_KING} Orbs of Ultimate Power to the ${kind} king in ${castle.name} (${at(castle)}): ${held}/${ORBS_FOR_KING} delivered${orbs > 0 ? `, you carry ${orbs}` : ""}.`);
  }
  if (!winner && seen.length === 0 && orbs > 0) open.push(`Bring ${ORBS_FOR_KING} Orbs of Ultimate Power to a king: you carry ${orbs}. A castle lies on the islands of level 2, 3 and 4.`);

  // places that are locked: a key (level 3 to 5 dungeons) or a key card (the pyramids)
  for (const poi of pois) {
    if (poi.kind !== "dungeon") continue;
    const need = world.dungeonRef(poi.id)?.requires;
    if (!need) continue;
    const kind = need.endsWith("_keycard") ? "the pyramid" : poi.name;
    if (visited.has(poi.id)) {
      done.push(`Opened ${kind} (${at(poi)}) with the ${itemName(need)}.`);
    } else if (opened.has(lockSeenFlag(poi.id)) || input.carried(need) > 0) {
      open.push(input.carried(need) > 0 ? `Use the ${itemName(need)} to open ${kind} at ${at(poi)}.` : `Find the ${itemName(need)} to open ${kind} at ${at(poi)}.`);
    }
  }

  // the quest of every cave and dungeon the party has entered
  for (const poi of pois) {
    if (poi.kind !== "dungeon" && poi.kind !== "cave") continue;
    const ref = world.dungeonRef(poi.id);
    if (!ref || ref.quest === "spaceship" || !visited.has(poi.id)) continue;
    const reached = opened.has(reachedFlag(poi.id));
    if (poi.kind === "cave") {
      if (reached) done.push(`Explored the scary ${poi.name}.`);
      else open.push(`Explore the scary ${poi.name} at ${at(poi)}.`);
      continue;
    }
    const boss = MONSTERS[ref.look.boss]?.name ?? "boss";
    const lines = DUNGEON_LINES[ref.quest as QuestId];
    const line = reached ? lines.done(poi.name, boss) : lines.open(poi.name, at(poi), boss);
    (reached ? done : open).push(line);
    const clues = [...opened].filter((k) => k.startsWith(`clue:${poi.id}|`)).map((k) => k.slice(`clue:${poi.id}|`.length));
    if (clues.length > 0) notes[line] = clues.join("\n");
  }
  return { open, done, ...(Object.keys(notes).length > 0 ? { notes } : {}) };
}
