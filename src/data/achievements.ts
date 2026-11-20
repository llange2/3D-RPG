/**
 * The achievements (`docs/ACHIEVEMENTS.md`). Pure data: the rules that award them live in `sim/achievements.ts` and the hooks in `game/`.
 * The order is the order of the table and of the icon sheet; `tools/assets/build-achievement-icons.ts` cuts one picture per id from it.
 */

/** The four achievements that count something over any number of games, and the counter each one reads (`Totals`). */
export type CounterKey = "gold" | "artifacts" | "riddles" | "dungeons";

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  /** Present for the counter achievements: the total at which they drop, and the counter that runs towards it. */
  counter?: { key: CounterKey; target: number };
}

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  { id: "capybara", name: "Cuteness over Function", description: "Have the Capybara mascot throughout the game" },
  { id: "tavern", name: "Drunk blabbermouth", description: "Get 3 passwords from taverns in a single game" },
  { id: "king", name: "For the king!", description: "Finish a game without robbing any chests in the throne room" },
  { id: "rich", name: "Rich like a dragon", description: "Collect a billion gold over any number of games", counter: { key: "gold", target: 1_000_000_000 } },
  { id: "antiquity", name: "Antiquity trader", description: "Return 30 artifacts over any number of games", counter: { key: "artifacts", target: 30 } },
  { id: "unstoppable", name: "I am unstoppable", description: "Reach level 100 with a character" },
  { id: "obsidian", name: "Black is beautiful", description: "Have a character fully equipped in Obsidian gear" },
  { id: "finish", name: "Up, up and away", description: "Finish the game" },
  { id: "sick", name: "I don't feel so good", description: "Have a character diseased, poisoned and crazy" },
  { id: "dragon", name: "Where is the princess?", description: "Slay a dragon" },
  { id: "eviction", name: "Eviction", description: "Destroy any monster hut" },
  { id: "terminator", name: "Terminate this!", description: "Destroy a terminator" },
  { id: "crystal", name: "Colorful delight", description: "Solve a crystal quest" },
  { id: "maze", name: "Found a way out!", description: "Complete a L5 labyrinth" },
  { id: "pirate", name: "Bribery", description: "Get gold from the Pirate Queen" },
  { id: "moaning", name: "Stop moaning", description: "Solve a moaning statues quest" },
  { id: "faces", name: "May I ask for directions?", description: "Solve a direction of faces quest" },
  { id: "gong", name: "Who is it?", description: "Solve a gong quest" },
  { id: "fallen", name: "...and 1 makes 5.", description: "Solve a fallen warrior quest" },
  { id: "boss", name: "Who is the boss now?", description: "Defeat a boss monster" },
  { id: "word", name: "Can I buy an \"E\"?", description: "Solve a secret word quest" },
  { id: "riddles", name: "Riddle me this!", description: "Solve 30 riddles over any number of games", counter: { key: "riddles", target: 30 } },
  { id: "adventurers", name: "Perfect adventurers", description: "Complete 100 dungeons over any number of games", counter: { key: "dungeons", target: 100 } },
  { id: "retire", name: "Time to retire", description: "Have a 80+ year old character" },
  { id: "sting", name: "That's gotta sting", description: "Deal 250 damage in one melee hit" },
];

export const ACHIEVEMENT_BY_ID: Readonly<Record<string, AchievementDef>> = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

/** The quest of a cave or dungeon (`DungeonRef.quest`) and the achievement its solving drops. */
export const QUEST_ACHIEVEMENT: Readonly<Record<string, string>> = {
  quest_1: "moaning",
  quest_2: "faces",
  quest_3: "gong",
  quest_4: "fallen",
  quest_5: "boss",
  quest_6: "word",
  quest_8: "crystal",
};

/** Monster ids (monster sheet): the Green Dragon and its boss, the Dragon Lord; the Terminator robot. */
export const DRAGON_IDS: readonly number[] = [33, 83];
export const TERMINATOR_ID = 69;
/** A melee blow of this many points (after armor and resistance) drops "That's gotta sting". */
export const STING_DAMAGE = 250;
/** A hero of this level (trained) drops "I am unstoppable". */
export const UNSTOPPABLE_LEVEL = 100;
/** The distinct passwords a tavern must give in one game. */
export const TAVERN_PASSWORDS = 3;
/** The mascot that "Cuteness over Function" asks for, and the lowest place level (of caves and dungeons) where it counts. */
export const CUTE_MASCOT = "Capybara";
export const CUTE_FROM_TIER = 2;
