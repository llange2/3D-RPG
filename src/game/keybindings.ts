/**
 * The keys of the game (Options > Controls > Key bindings, 37th playtest). Every action has up to two keys; a key belongs to one action only, so a
 * key that is given to another action is taken from the first (`assignKey` says which). Keys are stored as `KeyboardEvent.key` in a normal form
 * (`normalizeKey`): a letter is lower case, the space bar is "Space", the rest keeps its name ("ArrowUp", "F5"). That follows the layout the
 * player types on, so a German keyboard shows the letters it prints.
 *
 * Escape is not an action of this table: it opens the menu and closes every window, and stays so. Ctrl + arrow keys (sidestep) stay as well.
 */

export type GameAction =
  | "forward"
  | "back"
  | "left"
  | "right"
  | "turnLeft"
  | "turnRight"
  | "attack"
  | "cast"
  | "inventory"
  | "rest"
  | "quests"
  | "map"
  | "talents"
  | "quicksave"
  | "quickload"
  | "hero1"
  | "hero2"
  | "hero3"
  | "hero4"
  | "mascot";

export type KeyBindings = Record<GameAction, string[]>;

/** The actions in the order the key bindings window lists them, with their names. */
export const GAME_ACTIONS: readonly { id: GameAction; label: string }[] = [
  { id: "forward", label: "Move forward" },
  { id: "back", label: "Move back" },
  { id: "left", label: "Step left" },
  { id: "right", label: "Step right" },
  { id: "turnLeft", label: "Turn left" },
  { id: "turnRight", label: "Turn right" },
  { id: "attack", label: "Attack" },
  { id: "cast", label: "Spells" },
  { id: "inventory", label: "Inventory" },
  { id: "rest", label: "Rest" },
  { id: "map", label: "Map" },
  { id: "quests", label: "Quest log" },
  { id: "talents", label: "Talents" },
  { id: "hero1", label: "Hero 1" },
  { id: "hero2", label: "Hero 2" },
  { id: "hero3", label: "Hero 3" },
  { id: "hero4", label: "Hero 4" },
  { id: "mascot", label: "Mascot" },
  { id: "quicksave", label: "Quicksave" },
  { id: "quickload", label: "Quickload" },
];

/** At most this many keys per action. */
export const KEYS_PER_ACTION = 2;

/** The keys the game shipped with. */
export const DEFAULT_KEYS: Readonly<KeyBindings> = {
  forward: ["w", "ArrowUp"],
  back: ["s", "ArrowDown"],
  left: ["a"],
  right: ["d"],
  turnLeft: ["q", "ArrowLeft"],
  turnRight: ["e", "ArrowRight"],
  attack: ["Space"],
  cast: ["f"],
  inventory: ["i", "c"],
  rest: ["r"],
  quests: ["j"],
  map: ["m"],
  talents: ["t"],
  quicksave: ["F5"],
  quickload: ["F9"],
  hero1: ["1"],
  hero2: ["2"],
  hero3: ["3"],
  hero4: ["4"],
  mascot: ["5"],
};

/** The key that opens the menu and closes the windows: not part of the table. */
export const MENU_KEY = "Escape";

/** Keys that are no key of their own (modifiers, dead keys): they cannot be bound. */
const NOT_A_KEY = new Set(["Shift", "Control", "Alt", "AltGraph", "Meta", "CapsLock", "NumLock", "ScrollLock", "Dead", "Unidentified", "Process", "ContextMenu"]);

/** The stored form of a key, or null for one that cannot be bound. */
export function normalizeKey(key: string): string | null {
  if (NOT_A_KEY.has(key)) return null;
  if (key === " ") return "Space";
  return key.length === 1 ? key.toLowerCase() : key;
}

const ARROWS: Record<string, string> = { ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→" };

/** What a key is called on screen. */
export function keyLabel(key: string): string {
  if (key === MENU_KEY) return "Esc";
  if (ARROWS[key]) return ARROWS[key]!;
  return key.length === 1 ? key.toUpperCase() : key;
}

/** A fresh copy of the default keys. */
export function defaultKeys(): KeyBindings {
  const out = {} as KeyBindings;
  for (const { id } of GAME_ACTIONS) out[id] = [...DEFAULT_KEYS[id]];
  return out;
}

/** The action a key stands for, or null. */
export function actionOf(bindings: Readonly<KeyBindings>, key: string): GameAction | null {
  const k = normalizeKey(key);
  if (k === null) return null;
  for (const { id } of GAME_ACTIONS) if (bindings[id].includes(k)) return id;
  return null;
}

/** Keys of stored settings that are not valid are dropped; an action without a valid entry gets its default keys. Every key stays with one action only (the first that holds it). */
export function parseKeys(raw: unknown): KeyBindings {
  const out = defaultKeys();
  if (typeof raw !== "object" || raw === null) return out;
  const stored = raw as Record<string, unknown>;
  const taken = new Set<string>();
  const cleaned: Partial<KeyBindings> = {};
  for (const { id } of GAME_ACTIONS) {
    const value = stored[id];
    if (!Array.isArray(value)) continue;
    const keys: string[] = [];
    for (const v of value) {
      const k = typeof v === "string" ? normalizeKey(v) : null;
      if (k === null || k === MENU_KEY || taken.has(k) || keys.includes(k) || keys.length >= KEYS_PER_ACTION) continue;
      keys.push(k);
      taken.add(k);
    }
    cleaned[id] = keys;
  }
  // an action the stored settings do not know keeps its default keys, unless another action took them
  for (const { id } of GAME_ACTIONS) {
    if (cleaned[id]) {
      out[id] = cleaned[id]!;
    } else {
      out[id] = DEFAULT_KEYS[id].filter((k) => !taken.has(k));
      for (const k of out[id]) taken.add(k);
    }
  }
  return out;
}

/**
 * Puts `key` on slot `slot` (0 or 1) of an action, or clears the slot when `key` is null. A key that another slot holds is taken from it: the answer says
 * from which action, so the window can tell. Returns a new table; the one given is not changed. The menu key cannot be given away.
 */
export function assignKey(bindings: Readonly<KeyBindings>, action: GameAction, slot: number, key: string | null): { bindings: KeyBindings; stolenFrom: GameAction | null } {
  const next = {} as KeyBindings;
  for (const { id } of GAME_ACTIONS) next[id] = [...bindings[id]];
  if (key === null) {
    next[action].splice(slot, 1);
    return { bindings: next, stolenFrom: null };
  }
  if (key === MENU_KEY) return { bindings: next, stolenFrom: null };
  let stolenFrom: GameAction | null = null;
  for (const { id } of GAME_ACTIONS) {
    if (id === action) continue;
    const at = next[id].indexOf(key);
    if (at >= 0) {
      next[id].splice(at, 1);
      stolenFrom = id;
    }
  }
  const mine = next[action];
  const old = mine.indexOf(key);
  if (old >= 0 && old !== slot) mine.splice(old, 1);
  mine[Math.min(slot, mine.length)] = key;
  return { bindings: next, stolenFrom };
}

/** The key shown on the buttons and tips for an action: its first key. */
export function primaryKey(bindings: Readonly<KeyBindings>, action: GameAction): string {
  const k = bindings[action][0];
  return k === undefined ? "" : keyLabel(k);
}
