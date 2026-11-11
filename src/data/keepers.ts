import type { Alignment } from "./castles";

/**
 * The artifacts of the three kingdoms and the henchmen of the kings who take them back (55th playtest, point 12). The old game had one persona in each castle (Praythos, Cathos and Pathos,
 * the persons "Generic 3", "Generic 2" and "Generic 1" of the maps `Castle Whiteshield`, `Castle Bloodreign` and `Castle Dragontooth`): whoever brought an artifact of the castle's kind
 * was paid 200 000 experience, again and again. The artifacts lie in locked chests of the caves and dungeons of level 2 to 5 (`DungeonRef.artifacts`). Pure data and words.
 */
export const ARTIFACT_TYPE: Readonly<Record<Alignment, string>> = {
  good: "quest_good_artifact",
  neutral: "quest_neutral_artifact",
  evil: "quest_evil_artifact",
};

/** How many artifacts of each kind lie in the world, and what the henchman pays for one (to every hero who can act, like all experience). */
export const ARTIFACTS_PER_KIND = 4;
export const ARTIFACT_XP = 200_000;

export const KEEPER_PERSONA: Readonly<Record<Alignment, number>> = { good: 108, neutral: 107, evil: 106 };

export interface KeeperWords {
  name: string;
  /** The first time the party meets him, and the times after when it brings nothing. */
  intro: string;
  waiting: string;
  /** After a hand-over. */
  thanks: string;
}

export const KEEPERS: Readonly<Record<Alignment, KeeperWords>> = {
  good: {
    name: "Praythos",
    intro: "\"I am Praythos, protector of the relics. Many artifacts once rested in the castle shrine, but they were stolen in the great wars between the factions. If you find one of our missing artifacts on your journey, you will be generously rewarded for returning it.\"",
    waiting: "\"If you find one of our missing artifacts on your journey, you will be generously rewarded for returning it.\"",
    thanks: "\"Thank you for this artifact, noble heroes.\"",
  },
  neutral: {
    name: "Cathos",
    intro: "\"I am Cathos, protector of the relics. Many artifacts once rested in the castle shrine, but they were stolen in the great wars between the factions. If you find one of our missing artifacts on your journey, you will be generously rewarded for returning it.\"",
    waiting: "\"If you find one of our missing artifacts on your journey, you will be generously rewarded for returning it.\"",
    thanks: "\"Great work. Here, take your reward.\"",
  },
  evil: {
    name: "Pathos",
    intro: "\"Many evil artifacts are scattered around this world. Malefactor is their rightful owner. He has ordered me to retrieve them, so I am asking you to help me. If you find an evil artifact, bring it to me and you will be rewarded.\"",
    waiting: "\"If you find one of our stolen artifacts on your journey, you will be generously rewarded for returning it.\"",
    thanks: "\"Excellent, Malefactor will be pleased. Here, take your reward.\"",
  },
};
