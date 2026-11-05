import { INTERIOR_THEMES } from "../data/interior-themes";
import { COTTAGE_HEIGHT_FACTOR, COTTAGE_SCALE, tunedItemModels } from "../data/item-tuning";
import { PERSONAS } from "../data/personas";
import { MONSTERS } from "../data/tables";
import { Builder } from "./builder";
import type { InteriorMap, LightLine, ShowcaseLayout } from "./types";

/**
 * The debug showcase (Esc > Debug > Teleport to Level, the first entry): one dark dungeon hall in which every monster, every person and every object of the
 * game stands on a cell of its own, none of them with a function, so that all lights and all models can be seen at a glance (31st playtest).
 *
 * THE RULE: everything that is new in the game is shown here. A new monster is a row of the monster table and a new person a row of `PERSONAS`; a new old
 * item is a row of `item-models.json` with a model; they come in by themselves (`tests/unit/showcase.test.ts` checks it). A model that no item stands for
 * (an `obj_*` model of the interior view) has to be added to `SHOWCASE_EXTRAS` by hand. A new light belongs in `render/lamps.ts` and needs nothing else.
 */

export const SHOWCASE_ID = "showcase";
export const SHOWCASE_NAME = "Showcase: all monsters and objects";

/**
 * Models that no old item stands for: the fountain of a town and its statue (the interior view's), the cottage that takes the place of a third of the caravans and the pirate ship
 * (the overworld's, the user's own models; they are loaded for the showcase only: `OVERWORLD_EXTRAS`).
 */
export const OVERWORLD_EXTRAS = ["obj_cottage", "obj_pirate_ship"] as const;
/** The user's spaceship models of quest_7 (loaded for the showcase until the spaceship's own loading names them): the crate, the broken power crystal and the console. */
export const SPACESHIP_EXTRAS = ["obj_futuristic_box", "obj_power_crystal_broken", "obj_spaceship_console"] as const;
/** `lift`: how far the model's origin stands above the floor (the user's files are centred on their middle: half their height times the scale). */
export const SHOWCASE_EXTRAS: readonly { model: string; scale: number; height?: number; lift?: number }[] = [
  { model: "obj_fountain", scale: 1.3 },
  { model: "obj_statue", scale: 1.15 },
  { model: "obj_cottage", scale: COTTAGE_SCALE, height: COTTAGE_HEIGHT_FACTOR },
  { model: "obj_pirate_ship", scale: 2.4 },
  // the spaceship of quest_7 (quest document 1.5): the crate of the storage bay, the broken power crystal (the intact one is item 67) and the console of the bridge
  { model: "obj_futuristic_box", scale: 1.6, lift: 0.37 },
  { model: "obj_power_crystal_broken", scale: 1, lift: 0.48 },
  { model: "obj_spaceship_console", scale: 2, lift: 0.62 },
];

/** Places, huge buildings and the like get a wide slot of their own (the pyramid is the largest). */
const LANDMARKS: ReadonlySet<number> = new Set([41, 42, 43, 44, 45, 47, 100, 101, 102]);
/** Items that are no object of the world: the people (they stand in the persons' row), the test model and the shots of the old game's effects. */
const NOT_OBJECTS = (id: number, persona: boolean): boolean => persona || id === 129 || id >= 9000;

const COLUMNS = 12;
/** Cells between two things in a row (a cell is 3 units: the light of one reaches the next), and between two rows. */
const PITCH = 2;
const WIDE = 6;

/** The old items shown as objects: every item that has a model, except people and effects. */
export function showcaseItems(): { ordinary: number[]; landmarks: number[] } {
  const ids = Object.entries(tunedItemModels<{ scale3: [number, number, number]; source: string | null; persona: boolean }>())
    .filter(([id, m]) => m.source && !NOT_OBJECTS(Number(id), m.persona))
    .map(([id]) => Number(id))
    .sort((a, b) => a - b);
  return { ordinary: ids.filter((i) => !LANDMARKS.has(i)), landmarks: ids.filter((i) => LANDMARKS.has(i)) };
}

/** A grid of slots, `columns` to a row, `pitch` cells apart, from row `y`. Returns the cells and the row where the next section may start. */
function slots(count: number, y: number, pitch: number, columns: number, x0: number): { cells: { x: number; y: number }[]; next: number } {
  const cells: { x: number; y: number }[] = [];
  for (let i = 0; i < count; i++) cells.push({ x: x0 + pitch * (i % columns), y: y + pitch * Math.floor(i / columns) });
  return { cells, next: y + pitch * Math.ceil(count / columns) + pitch };
}

/** The showcase map. The party starts at the south end and looks north over the objects (and their lights), the monsters and the people lie beyond. */
export function generateShowcase(): InteriorMap {
  const items = showcaseItems();
  const personas = Object.keys(PERSONAS).map(Number).sort((a, b) => a - b);
  const monsters = Object.keys(MONSTERS).map(Number).sort((a, b) => a - b);
  const width = PITCH * COLUMNS + 3;
  const wideColumns = Math.floor(COLUMNS / (WIDE / PITCH));

  let y = 2;
  const people = slots(personas.length, y, PITCH, COLUMNS, 2);
  const beasts = slots(monsters.length, (y = people.next), PITCH, COLUMNS, 2);
  const big = slots(items.landmarks.length, (y = beasts.next), WIDE, wideColumns, 3);
  const small = slots(items.ordinary.length + SHOWCASE_EXTRAS.length, (y = big.next), PITCH, COLUMNS, 2);
  const height = small.next + 3;

  // the lines of light lie in the free rows south of the last row of objects and along the west wall (objects stand on every second cell from x = 2)
  const row = small.next - 4;
  const lines: LightLine[] = [
    { color: "#22d3ee", points: [{ x: 2, y: row + 1 }, { x: width - 4, y: row + 1 }] },
    { color: "#e040fb", points: [{ x: 2, y: row + 3 }, { x: 9, y: row + 3 }, { x: 9, y: row + 2 }, { x: 13, y: row + 2 }] },
    { color: "#ffb020", points: [{ x: 22, y: row + 2 }, { x: 16, y: row + 2 }, { x: 16, y: row + 3 }, { x: 23, y: row + 3 }] },
    { color: "#4ade80", points: [{ x: 1, y: row + 5 }, { x: 1, y: row - 4 }] },
  ];

  const layout: ShowcaseLayout = {
    personas: personas.map((persona, i) => ({ persona, ...people.cells[i]! })),
    monsters: monsters.map((defId, i) => ({ defId, ...beasts.cells[i]! })),
    items: [...items.landmarks.map((item, i) => ({ item, ...big.cells[i]! })), ...items.ordinary.map((item, i) => ({ item, ...small.cells[i]! }))],
    extras: SHOWCASE_EXTRAS.map((e, i) => ({ ...e, ...small.cells[items.ordinary.length + i]! })),
    lines,
  };

  const b = new Builder(width, height);
  b.carveRoom([{ x: 1, y: 1, w: width - 2, h: height - 2 }]);
  // the way out is the cell in the middle of the south wall, the party starts on the one north of it
  const mid = width >> 1;
  const exit = { x: mid, y: height - 2 };
  const spawn = { x: mid, y: height - 3, facing: "N" as const };
  const map = b.finish("dungeon", { key: `${SHOWCASE_ID}:0`, tier: 1, theme: INTERIOR_THEMES.dungeon! }, exit, spawn);
  return { ...map, showcase: layout };
}
