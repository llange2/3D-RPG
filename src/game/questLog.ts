import { ENGINES_FLAG, ENGINE_CRYSTAL_FLAG, LIFE_FLAG, ORBS_FOR_KING, PEARL, PEARLS_IN_WORLD, POWER_CRYSTAL, SKULLS_FOR_RING, type QuestId } from "../data/quest-table";
import { ALIGNMENTS } from "../data/castles";
import { ARTIFACT_TYPE, KEEPERS } from "../data/keepers";
import { MONSTERS, QUEST_ITEMS } from "../data/tables";
import { wagonTale, caravansOf } from "../world/caravans";
import type { Poi } from "../world/types";
import type { World } from "../world/world";

/**
 * The quest log of the generated world (35th playtest): what the party has taken on in the places it knows, open and finished. Nothing here is stored on its own; it is read
 * from the world's plan and from the flags the game keeps in `state.opened` (saves from before the log have no flags and still show everything they can know):
 *  - the Skull Miser of the start town (`skulls=<n>` handed in, `skullmiser:met`),
 *  - the pirate queen on the sea (`pearls=<n>` handed in, `pirate:met`),
 *  - the three kings and the orbs (`king:<alignment>=<n>`, `king:winner=<alignment>`; a castle counts once the party has been inside),
 *  - the places that ask for a key or a key card (`lock:<place id>` is set when the party stood before the locked way in),
 *  - the quest of every cave and dungeon the party has entered, finished once the party has reached its end room (`reached:<place id>`).
 */

export const SKULL_MISER_MET = "skullmiser:met";
/** The party has been aboard the pirate ship (`Game.pirateMeeting`); the pearls handed in are `pearls=<n>`. */
export const PIRATE_MET = "pirate:met";
export const lockSeenFlag = (poiId: string): string => `lock:${poiId}`;
/** The party has used the key or key card of the place: it is gone from the inventory and the way in stays open for good (`Game.promptEnterPoi`, 51st playtest, point 10). */
export const unlockedFlag = (poiId: string): string => `unlocked:${poiId}`;
/** The party has been told by the wagon near a locked place where its key or key card lies (`Game.visitHintWagon`, 49th playtest). */
export const hintHeardFlag = (poiId: string): string => `hint:${poiId}`;
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
  /** The names of the caves and dungeons in the lines, which the log prints in bold. The lines stay plain text. */
  places?: string[];
}

const at = (poi: Poi): string => `${poi.x}/${poi.y}`;
const itemName = (type: string): string => (QUEST_ITEMS.find((q) => q.type === type)?.name ?? type).toLowerCase();
const number = (opened: ReadonlySet<string>, prefix: string): number => Number([...opened].find((k) => k.startsWith(prefix))?.slice(prefix.length) ?? 0);

type QuestWords = { open: (name: string, where: string, boss: string) => string; done: (name: string, boss: string) => string };

/**
 * The words of each quest of a dungeon or cave: what the party wants, and what it did (55th playtest, point 19: the log said "Explored the scary ..." for every cave, so each quest has
 * several wordings, one of which a place keeps for good: `wordsOf` chooses by the id of the place). The open and the done line of one variation belong together.
 */
const QUEST_WORDS: Record<QuestId, readonly QuestWords[]> = {
  quest_1: [
    { open: (n, w) => `Find out what the moaning statues of ${n} (${w}) want, and reach its hidden chamber.`, done: (n) => `Silenced the moaning statues of ${n} and reached its hidden chamber.` },
    { open: (n, w) => `Listen to the wailing statues of ${n} (${w}) and find the chamber they guard.`, done: (n) => `Quieted the wailing statues of ${n} and found the chamber they guarded.` },
  ],
  quest_2: [
    { open: (n, w) => `Solve the mystery of the stone heads in ${n} (${w}).`, done: (n) => `Solved the mystery of the stone heads in ${n} and reached the chamber behind the wall.` },
    { open: (n, w) => `Find out which way the stone faces of ${n} (${w}) want to be turned.`, done: (n) => `Turned the stone faces of ${n} the right way and opened the wall behind them.` },
  ],
  quest_3: [
    { open: (n, w) => `Strike all the gongs of ${n} (${w}) and step through the runes.`, done: (n) => `Struck the gongs of ${n} and stepped through the runes.` },
    { open: (n, w) => `Wake the gongs of ${n} (${w}) in the right order and follow the glowing runes.`, done: (n) => `Woke the gongs of ${n} and followed the glowing runes.` },
  ],
  quest_4: [
    { open: (n, w) => `Add up the fate of the fallen warriors in ${n} (${w}) and tell the last statue.`, done: (n) => `Told the last statue of ${n} how many warriors had fallen.` },
    { open: (n, w) => `Count the fallen warriors of ${n} (${w}) and tell the number to the last statue.`, done: (n) => `Counted the fallen warriors of ${n} and told the last statue.` },
  ],
  quest_5: [
    { open: (n, w, boss) => `Defeat the mighty ${boss} in the ${n} (${w}).`, done: (n, boss) => `Defeated the mighty ${boss} in the ${n}.` },
    { open: (n, w, boss) => `Hunt down the vile ${boss} in ${n} (${w}).`, done: (n, boss) => `Defeated the vile ${boss} in ${n}.` },
    { open: (n, w, boss) => `Put an end to the evil ${boss} in ${n} (${w}).`, done: (n, boss) => `Defeated the evil ${boss} in ${n}.` },
    { open: (n, w, boss) => `Face the dangerous ${boss} in ${n} (${w}).`, done: (n, boss) => `Defeated the dangerous ${boss} in ${n}.` },
    { open: (n, w, boss) => `Slay the dreaded ${boss}, who rules ${n} (${w}).`, done: (n, boss) => `Slew the dreaded ${boss}, who ruled ${n}.` },
  ],
  quest_6: [
    { open: (n, w) => `Find the word that the statues of ${n} (${w}) spell, and tell it to the last one.`, done: (n) => `Spelled the word of the statues of ${n}.` },
    { open: (n, w) => `Piece together the word that the statues of ${n} (${w}) hide.`, done: (n) => `Pieced together the word of the statues of ${n}.` },
  ],
};

/** A cave whose quest is no puzzle of the statues has its own words for the walk through it (the old line said "scary" for every one of them). */
const CAVE_WORDS: readonly { open: (n: string, w: string) => string; done: (n: string) => string }[] = [
  { open: (n, w) => `Explore the scary ${n} at ${w}.`, done: (n) => `Explored the scary ${n}.` },
  { open: (n, w) => `Find your way through the dark ${n} at ${w}.`, done: (n) => `Found a way through the dark ${n}.` },
  { open: (n, w) => `Venture into the damp ${n} at ${w}.`, done: (n) => `Ventured deep into the damp ${n}.` },
  { open: (n, w) => `Follow the echoes into ${n} at ${w}.`, done: (n) => `Followed the echoes through ${n}.` },
  { open: (n, w) => `Scout the winding tunnels of ${n} at ${w}.`, done: (n) => `Scouted the winding tunnels of ${n}.` },
  { open: (n, w) => `Chart the shadows of ${n} at ${w}.`, done: (n) => `Charted the shadows of ${n}.` },
];

/** A small number from the id of a place, so that a place keeps its wording for good. */
function pick(id: string, count: number): number {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % count;
}

/** A line cut into pieces, the names of `places` marked bold (the longest name wins where one contains another). */
export function placeSegments(line: string, places: readonly string[]): { text: string; bold: boolean }[] {
  if (places.length === 0) return [{ text: line, bold: false }];
  const pattern = [...places].sort((a, b) => b.length - a.length).map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  return line
    .split(new RegExp(`(${pattern})`))
    .map((text, i) => ({ text, bold: i % 2 === 1 }))
    .filter((s) => s.text !== "");
}

export function worldQuestLog(input: QuestLogInput): QuestLogView {
  const { world, opened, visited } = input;
  const open: string[] = [];
  const done: string[] = [];
  const pois = world.allPois();
  const notes: Record<string, string> = {};
  const places = new Set<string>();

  // the Skull Miser
  const handed = number(opened, "skulls=");
  const carrying = input.carried("quest_silver_skull");
  const town = world.poiById("p:0:0:0");
  if (opened.has(SKULL_MISER_MET) || handed > 0 || carrying > 0) {
    const where = town ? `the Skull Miser in ${town.name}` : "the Skull Miser";
    if (handed >= SKULLS_FOR_RING) done.push(`Brought ${SKULLS_FOR_RING} silver skulls to ${where}.`);
    else open.push(`Bring ${SKULLS_FOR_RING} silver skulls to ${where}: ${handed}/${SKULLS_FOR_RING} handed in${carrying > 0 ? `, you carry ${carrying}` : ""}.`);
  }

  // the pirate queen (ue_quest_4): her ship sails the largest ocean; the party knows her once it has met her, or when it carries a pearl
  const pearlsGiven = number(opened, "pearls=");
  const pearlsCarried = input.carried(PEARL);
  if (opened.has(PIRATE_MET) || pearlsGiven > 0 || pearlsCarried > 0) {
    if (pearlsGiven >= PEARLS_IN_WORLD) done.push(`Brought all ${PEARLS_IN_WORLD} Pearls of Youth and Beauty to the pirate queen.`);
    else open.push(`Bring Pearls of Youth and Beauty to the pirate queen, whose ship sails the largest ocean: ${pearlsGiven}/${PEARLS_IN_WORLD} handed in${pearlsCarried > 0 ? `, you carry ${pearlsCarried}` : ""}.`);
  }

  // the spaceship (quest_7, quest document 1.5): known once the party has been inside a pyramid or carries a power crystal
  const inShip = pois.some((p) => visited.has(p.id) && world.dungeonRef(p.id)?.quest === "spaceship");
  if (inShip || input.carried(POWER_CRYSTAL) > 0) {
    if (opened.has(LIFE_FLAG)) done.push("Mended the power crystal of life support: the lights of the spaceship are on.");
    else open.push("Replace the broken power crystal of life support with an intact one. Two spare crystals lie in crates of the storage bay.");
    if (opened.has(ENGINES_FLAG)) done.push("Started the engines of the spaceship.");
    else if (opened.has(ENGINE_CRYSTAL_FLAG)) open.push("Activate the engines at the status computer of the control room.");
    else open.push("Replace the broken power crystal of the engine room with an intact one.");
    if ((opened.has(LIFE_FLAG) && opened.has(ENGINES_FLAG)) || input.carried("quest_black_keycard") > 0) open.push("Start the console of the bridge: it needs life support, the engines and the black key card.");
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

  // the artifacts of the three kingdoms (55th playtest, point 12): known once the party has been in the castle of their kind or carries one; the henchman takes them again and again, so the line stays open
  for (const kind of ALIGNMENTS) {
    const castle = castles.find((c) => world.castleAlignment(c.id) === kind);
    const carriedArtifacts = input.carried(ARTIFACT_TYPE[kind]);
    const given = number(opened, `artifacts:${kind}=`);
    // (the castles of the other two kings are rubble once one king has won: their henchmen are gone)
    if (winner && winner !== kind) continue;
    if (!(castle && visited.has(castle.id)) && carriedArtifacts === 0 && given === 0) continue;
    const keeper = KEEPERS[kind];
    const where = castle ? `${castle.name} (${at(castle)})` : `the ${kind} castle`;
    open.push(`Bring the ${kind} artifacts you find in locked chests to ${keeper.name}, the king's henchman in ${where}: ${given} handed in${carriedArtifacts > 0 ? `, you carry ${carriedArtifacts}` : ""}.`);
  }

  // places that are locked: a key (level 3 to 5 dungeons) or a key card (the pyramids)
  for (const poi of pois) {
    if (poi.kind !== "dungeon") continue;
    const need = world.dungeonRef(poi.id)?.requires;
    if (!need) continue;
    const kind = need.endsWith("_keycard") ? "the pyramid" : poi.name;
    if (visited.has(poi.id) || opened.has(unlockedFlag(poi.id))) {
      if (!need.endsWith("_keycard")) places.add(poi.name);
      // 55th playtest, point 18: that a key opened the way is no entry of the log (the open line goes when the place is entered)
    } else if (opened.has(lockSeenFlag(poi.id)) || opened.has(hintHeardFlag(poi.id)) || input.carried(need) > 0) {
      if (!need.endsWith("_keycard")) places.add(poi.name);
      const line = input.carried(need) > 0 ? `Use the ${itemName(need)} to open ${kind} at ${at(poi)}.` : `Find the ${itemName(need)} to open ${kind} at ${at(poi)}.`;
      open.push(line);
      // what the wagon near the place told about the key (the tale, without the first sentence about the tea)
      const wagon = opened.has(hintHeardFlag(poi.id)) ? caravansOf(world, poi)[0] : undefined;
      const tale = wagon ? wagonTale(world, wagon)?.split("\n\n")[1] : undefined;
      if (tale) notes[line] = tale;
    }
  }

  // the quest of every cave and dungeon the party has entered
  for (const poi of pois) {
    if (poi.kind !== "dungeon" && poi.kind !== "cave") continue;
    const ref = world.dungeonRef(poi.id);
    if (!ref || ref.quest === "spaceship" || !visited.has(poi.id)) continue;
    const reached = opened.has(reachedFlag(poi.id));
    places.add(poi.name);
    // what the party has read at the statues of the place (53rd playtest, point 5: the caves of quest 6, Den of Sila and Passage of Nora, kept theirs from the mouse-over)
    const clues = [...opened].filter((k) => k.startsWith(`clue:${poi.id}|`)).map((k) => k.slice(`clue:${poi.id}|`.length));
    const boss = MONSTERS[ref.look.boss]?.name ?? "boss";
    // a cave is explored (the puzzle of its statues or gongs is not told in the log), with one of several wordings; only a boss is hunted, in a cave as in a dungeon
    const plain = poi.kind === "cave" && ref.quest !== "quest_5";
    let line: string;
    if (plain) {
      const words = CAVE_WORDS[pick(poi.id, CAVE_WORDS.length)]!;
      line = reached ? words.done(poi.name) : words.open(poi.name, at(poi));
    } else {
      const list = QUEST_WORDS[ref.quest as QuestId];
      const words = list[pick(poi.id, list.length)]!;
      line = reached ? words.done(poi.name, boss) : words.open(poi.name, at(poi), boss);
    }
    (reached ? done : open).push(line);
    if (clues.length > 0) notes[line] = clues.join("\n");
  }
  return { open, done, ...(Object.keys(notes).length > 0 ? { notes } : {}), ...(places.size > 0 ? { places: [...places] } : {}) };
}
