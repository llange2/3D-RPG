/** Interior maps: grid of cells inside a POI. Pure data, no DOM, no Babylon. */
import type { Alignment } from "../data/castles";
import type { DungeonTheme } from "../data/dungeon-themes";
import type { LayoutId, QuestId } from "../data/quest-table";

export const CELL = {
  SOLID: 0,
  FLOOR: 1,
  // 2 was PILLAR, a solid cell drawn as a column; pillars are `InteriorMap.pillars` now (floor with four columns on it)
  BUILDING: 3, // solid, a town building block
  LOW: 4, // flat ground nobody can walk on without help: water, lava, a tile with a mountain or a tree on it
} as const;
export type Cell = (typeof CELL)[keyof typeof CELL];

export type InteriorKind = "dungeon" | "cave" | "fortress" | "town";

/**
 * Look of one kind of cell, for maps whose cells do not all share the theme's textures (the hand-built campaign maps
 * mix city, dungeon and outdoor blocks). Texture files are relative to the asset root, without extension.
 */
export interface CellStyle {
  /** floor: walkable ground; wall: tall solid block; low: flat ground that cannot be entered (water, lava, a tile with a model). */
  cls: "floor" | "wall" | "low";
  floor: string | null;
  wall: string | null;
  ceiling: string | null;
  /** Lava and the like: drawn unlit. */
  glow?: boolean;
  /** Water: the texture scrolls. */
  water?: boolean;
  /** The model brings its own floor (the pit trap has a hole in it), so no floor quad is drawn under it. */
  floorless?: boolean;
  /** A model that stands on the cell (mountain, forest, tree), by static model key. `scaleXYZ` is the size per axis (a mountain is taller than wide). */
  model?: { key: string; scale: number; scaleXYZ?: [number, number, number]; y?: number; yaw?: number };
}
export type Facing = "N" | "E" | "S" | "W";

export const FACING_DELTA: Record<Facing, { dx: number; dy: number }> = {
  N: { dx: 0, dy: -1 },
  E: { dx: 1, dy: 0 },
  S: { dx: 0, dy: 1 },
  W: { dx: -1, dy: 0 },
};

export interface Room {
  id: number;
  /** Bounding box in cells. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** A floor cell near the centre. */
  cx: number;
  cy: number;
  /** Number of floor cells that belong to the room. */
  size: number;
}

export interface Lot {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** The cell of the building door. Stepping on `door` enters the building; `facing` points out of the house, the wall behind the cell carries the door. */
  door: { x: number; y: number; facing: Facing };
  /** A shop of a hand-built ground plan: the door is a cell of the street, not a niche in a facade, and its sign hangs over that cell. */
  inline?: boolean;
}

/**
 * Where a town's ground plan has something other than a shop on a street cell (`data/town-blueprints.ts`): the people who sell talents,
 * chests, fountains and decoration. The rules of the town decide which of them are used (`actions/rules.ts`).
 */
export type TownSite =
  | { kind: "talent"; x: number; y: number; talent: string }
  /** An object that holds loot and must always give some (a real chest, or any chest cell a gate has shut). */
  | { kind: "chest"; x: number; y: number; item: number }
  /** An object the old town used as a chest that is no chest (storage equipment, a gravestone): it may hold loot or just stand there. */
  | { kind: "loose"; x: number; y: number; item: number }
  | { kind: "decor"; x: number; y: number; item: number }
  /** The town's portal (the old Portal, item 3): it takes the party to the portals of the other towns it has touched. */
  | { kind: "portal"; x: number; y: number; item: number }
  /** The job master (the old "Work for a week", persona 49): a week of work for a purse of gold. */
  | { kind: "work"; x: number; y: number; persona: number }
  | { kind: "fountain"; x: number; y: number; item: number }
  /** The Crow's perch of the start town, in a dead end and facing the street. */
  | { kind: "perch"; x: number; y: number; facing: Facing }
  /** A gate on a street cell that shuts off a pocket with chests; `axis` is the way through it. */
  | { kind: "cage"; x: number; y: number; axis: "x" | "y" }
  /** A wall between two streets that gives way to a perceptive party (`BRITTLE_WALLS` in `interiors/town.ts`); `axis` is the way through it. The cell is a wall. */
  | { kind: "brittle"; x: number; y: number; axis: "x" | "y" }
  /** A cell inside a cage where a guard stands; `monsters` are the old monster ids it may be. */
  | { kind: "guard"; x: number; y: number; monsters: number[] }
  /**
   * The way into a castle's treasure vault (a 2 x 2 chamber in the corner of a hall): a gate that asks before it opens (`how` "gate"), a locked
   * door that asks whether to break it (`door`), or no opening at all but a wall that gives way to a perceptive party (`wall`; then the cell is solid).
   * `axis` is the way through it.
   */
  | { kind: "vault_way"; x: number; y: number; axis: "x" | "y"; how: "gate" | "door" | "wall" }
  /** The chest of a vault; `main` is the vault farthest from the way in, with the hoard of the boss's room. */
  | { kind: "vault_chest"; x: number; y: number; main: boolean }
  /** A guard of a vault; `boss` for the one in the main vault. */
  | { kind: "vault_guard"; x: number; y: number; boss: boolean };

export interface InteriorTheme {
  id: string;
  /** Texture keys; the renderer maps them to files (`tex_<key>`). */
  wall: string;
  floor: string;
  ceiling: string | null;
  door: string;
  fog: { color: string; density: number };
  ambient: string;
  /** Sound zone of the old sound.py (1 town, 3 dungeon, 4 castle, 5 cyber, 6 cave). */
  music: number;
  /** Weighted monster families used by the spawn rules. */
  monsterThemes: Record<string, number>;
  lootLevelBias: number;
  /** True when the player sees sky (towns). */
  open: boolean;
}

/**
 * What a cave or dungeon of the generated world was built for (`interiors/dungeonPlan.ts`): its quest, its layout, the look its quest and level
 * draw (monsters, boss, trap, props) and how it takes part in the chain of keys, key cards and orbs.
 */
export interface DungeonRef {
  /** `<quest>/<layout>`, or `spaceship` for the inside of a pyramid. */
  id: string;
  /** Free, needs a key, or a pyramid (needs a key card). */
  klass: "A" | "B" | "C";
  quest: QuestId | "spaceship";
  layout: LayoutId;
  look: DungeonTheme;
  /** Quest item type the entrance asks for (a key or a key card), or null for a free place. */
  requires: string | null;
  /** Quest item types hidden in the end room: keys in a level 1 or 2 place, key cards in a level 4 or 5 dungeon. */
  gives: string[];
  /** Orbs of ultimate power in the end room (level 5 dungeons). */
  orbs: number;
  /** The size of the world as a factor on monster counts: 2/3 for a small world, 1 for a default one, 4/3 and 5/3 (the XP per monster scale the other way). */
  scale: number;
  /** Mini quests (statues with an extra riddle) the place carries: the numbers of the riddles in the list of the world (each riddle occurs once in a world). */
  minis: number[];
  /** Quest 6: the number of the riddle whose answer the statues spell. */
  word?: number;
  /** Quatloo coins (ue_quest_1) and silver skulls (ue_quest_2) hidden in the ordinary chests of the place. */
  coins: number;
  skulls: number;
  /** The spells whose scrolls lie in the containers of this place (`planSpellLoot`, 34th playtest): every spell twice in the world, in places of its own level. */
  spells: number[];
  /** Seth Squirm and the machines of the Quatloo coins stand in this place (one dungeon of level 2 in the world). */
  seth?: boolean;
  /** The room of the machines, set by the layout: behind a door, with the cell in front of the door where Seth stands. */
  machines?: { x: number; y: number; w: number; h: number; cx: number; cy: number; door: { x: number; y: number }; front: { x: number; y: number } };
  /** A pyramid: the section of the spaceship it opens (0 is the control deck). */
  section?: number;
  /**
   * The end room, set by the layout generator. It is floor but out of reach until the quest is solved: either behind a wall cell (`seal`) that
   * gives way, or `isolated` (a pocket of its own that only a teleport reaches). `cx`/`cy` is its middle.
   */
  endRoom?: { x: number; y: number; w: number; h: number; cx: number; cy: number; seal?: { x: number; y: number }; isolated: boolean };
  /**
   * The treasure chambers behind brittle walls (35th playtest): 0 to 3 small pockets of rock, each with a wall cell (`seal`) that looks like any other wall and gives way for a party
   * with the Perceptive talent. The chest in it (twice the loot of an ordinary one) and, one time in ten, points of an attribute or a resistance are placed by `actions/vaults.ts`.
   */
  vaults?: { x: number; y: number; w: number; h: number; cx: number; cy: number; seal: { x: number; y: number } }[];
  /** Cells where a rune bars the way (the maze of dungeon_3): the party is thrown to another place, but the maze is whole without them. */
  barriers?: { x: number; y: number }[];
  /** The room the layout set aside for the quest: the entrance room of quest 1 (the field of statues) or the hall of quest 2 (the row of heads). */
  hall?: { x: number; y: number; w: number; h: number };
}

/** A castle of the generated world (`interiors/castle.ts`): a keep, entered through its gate. */
export interface CastleLayout {
  alignment: Alignment;
  /** The size of the world as a factor on the number of guards (2/3, 1, 4/3, 5/3). */
  scale: number;
  /** Quatloo coins hidden in the alarm chests. */
  coins: number;
  /** The spells whose scrolls lie in the alarm chests (`planSpellLoot`). */
  spells: number[];
  /** The riddle (number in the list of the world) whose four-letter answer the statues of the keep spell. */
  word: number;
  /** The throne, the king before it, the four statues (with the bearing they face, degrees, 0 north) and the cell of the statue that wants the code word. */
  throne: { x: number; y: number };
  king: { x: number; y: number };
  statues: { x: number; y: number; bearing: number }[];
  answer: { x: number; y: number };
  /** The two chests of the king, the chests in the niches that raise the alarm, and the cell inside the gate of the keep (where the party starts). */
  kingChests: { x: number; y: number }[];
  alarmChests: { x: number; y: number }[];
  door: { x: number; y: number };
  /** The cells inside the keep (the gate itself is the way out and not one of them). */
  keep: number[];
}

/** Where everything stands in the debug showcase (`interiors/showcase.ts`). Cells are grid cells. */
export interface ShowcaseLayout {
  /** Every monster of the table (`defId`) and every person (`persona`, the item number of the old game). */
  monsters: { defId: number; x: number; y: number }[];
  personas: { persona: number; x: number; y: number }[];
  /** The old items that have a model (shown as decoration, `item`), and the models of the interior view that no item stands for. */
  items: { item: number; x: number; y: number }[];
  extras: { model: string; scale: number; x: number; y: number }[];
}

/** The spaceship under the pyramids (`interiors/spaceship.ts`): five sections side by side, the front one (0) is the control deck. */
export interface SpaceshipLayout {
  sections: number;
  /** The width of a section in cells. */
  width: number;
  /** The transporter tube of every section: the cell it stands on and the cell in front of it. The tube of section 0 is in the middle of the control deck. */
  tubes: { x: number; y: number; front: { x: number; y: number } }[];
  /** The tube in the middle of the control deck: with the black key card it ends the game. */
  final: { x: number; y: number; front: { x: number; y: number } };
  /** The airlock between a section and the next: the cell it shuts and the niches of its two levers. */
  locks: { door: { x: number; y: number }; a: { x: number; y: number }; b: { x: number; y: number }; from: number }[];
  /** The control deck and the rooms of every section. */
  deck: { x: number; y: number; w: number; h: number };
  rooms: { x: number; y: number; w: number; h: number }[][];
}

export interface InteriorMap {
  kind: InteriorKind;
  /** Stable key, also used for save deltas: `<poi id>:<floor>`. */
  key: string;
  width: number;
  height: number;
  cells: Uint8Array;
  rooms: Room[];
  /** Per cell: room id, or -1 for corridors and streets. */
  roomOf: Int16Array;
  /** Floor cell that triggers the exit transfer. */
  exit: { x: number; y: number };
  /** Cell the party appears on, facing away from the exit wall. */
  spawn: { x: number; y: number; facing: Facing };
  /** Town building lots; empty for other kinds. */
  lots: Lot[];
  /** Towns: the cells for talent sellers, chests, fountains and decoration. */
  sites?: TownSite[];
  /** The old towns have no square; kept for maps that have one. */
  plaza?: { x: number; y: number; w: number; h: number };
  theme: InteriorTheme;
  tier: number;
  /** Cells with four pillars standing at their corners (floor, drawn with the model of the old fortress block 40). Absent where there are none. */
  pillars?: { x: number; y: number }[];
  /** Caves and dungeons of the generated world: the theme they were built for. Absent in towns, castles and the campaign. */
  dungeon?: DungeonRef;
  /** Castles of the generated world: the kind of castle, which decides its banner, statues and guards (`data/castles.ts`), and where everything stands. */
  castle?: CastleLayout;
  /** The spaceship under the pyramids: where its sections, tubes and airlocks are. */
  spaceship?: SpaceshipLayout;
  /** The debug showcase (`interiors/showcase.ts`): every monster, person and object of the game, each on a cell of its own and without a function. */
  showcase?: ShowcaseLayout;
  /** Optional per-cell look. `cell` holds, per cell, an index into `list`; generated maps do not use it. */
  styles?: { list: CellStyle[]; cell: Uint8Array };
}

export function cellIndex(map: { width: number }, x: number, y: number): number {
  return y * map.width + x;
}

export function inBounds(map: { width: number; height: number }, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < map.width && y < map.height;
}

export function isFloor(map: InteriorMap, x: number, y: number): boolean {
  return inBounds(map, x, y) && map.cells[y * map.width + x] === CELL.FLOOR;
}
