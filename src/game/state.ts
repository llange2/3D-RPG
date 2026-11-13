import { GEN_VERSION } from "../core/version";
import { packSave, unpackSave } from "./saveCodec";
import type { Facing } from "../interiors/types";
import type { Item, Party } from "../sim/types";
import type { JournalEntry } from "../sim/journal";
import { createDefaultParty, normalizeParty } from "../sim/party";
import { Rng, seedFromString } from "../core/rng";
import { newProgress, type CampaignProgress } from "../campaign/engine";
import type { CellOverrides } from "../campaign/model";
import { CAMPAIGN_START, CAMPAIGN_START_CELL } from "../campaign/types";
import { CHUNK_SIZE, DEFAULT_WORLD_SIZE, FULL_DUNGEON_DENSITY, WORLD_SIZES, parseDungeonDensity, parseWorldSize, wrap, type DungeonDensity, type WorldSize } from "../world/types";

/** Gold and items lying on a tile (dropped by a monster). */
export interface LootPile {
  x: number;
  y: number;
  gold: number;
  items: Item[];
}

export type Location =
  | { mode: "overworld"; x: number; y: number; facing: Facing }
  | { mode: "interior"; poiId: string; x: number; y: number; facing: Facing; ret: { x: number; y: number; facing: Facing } };

/**
 * Bitmaps of visited tiles. The overworld is stored per chunk (100 bits), an interior as one bitmap per map.
 * A bitmap is 13 bytes per chunk or about 1 KB per dungeon, so even long games stay small. The overworld is a globe: the tiles are counted
 * inside the world (`span`), so a tile seen from the other side of the seam is the same tile.
 */
export class Explored {
  private readonly maps = new Map<string, Uint8Array>();

  constructor(private readonly span: { w: number; h: number } | null = null) {}

  private bits(key: string, size: number): Uint8Array {
    let m = this.maps.get(key);
    if (!m) this.maps.set(key, (m = new Uint8Array(Math.ceil(size / 8))));
    return m;
  }

  mark(key: string, index: number, size: number): void {
    this.bits(key, size)[index >> 3]! |= 1 << (index & 7);
  }

  has(key: string, index: number): boolean {
    const m = this.maps.get(key);
    return !!m && ((m[index >> 3]! >> (index & 7)) & 1) === 1;
  }

  markOverworld(x: number, y: number): void {
    if (this.span) {
      x = wrap(x, this.span.w);
      y = wrap(y, this.span.h);
    }
    const cx = Math.floor(x / CHUNK_SIZE);
    const cy = Math.floor(y / CHUNK_SIZE);
    this.mark(`ow:${cx},${cy}`, (y - cy * CHUNK_SIZE) * CHUNK_SIZE + (x - cx * CHUNK_SIZE), CHUNK_SIZE * CHUNK_SIZE);
  }

  hasOverworld(x: number, y: number): boolean {
    if (this.span) {
      x = wrap(x, this.span.w);
      y = wrap(y, this.span.h);
    }
    const cx = Math.floor(x / CHUNK_SIZE);
    const cy = Math.floor(y / CHUNK_SIZE);
    return this.has(`ow:${cx},${cy}`, (y - cy * CHUNK_SIZE) * CHUNK_SIZE + (x - cx * CHUNK_SIZE));
  }

  /** Forgets the bitmaps of all interiors (their layout changed with a new generator version); the overworld stays. */
  forgetInteriors(): void {
    for (const key of [...this.maps.keys()]) if (!key.startsWith("ow:")) this.maps.delete(key);
  }

  toJSON(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of this.maps) out[k] = btoa(String.fromCharCode(...v));
    return out;
  }

  static fromJSON(data: Record<string, string> | undefined, span: { w: number; h: number } | null = null): Explored {
    const e = new Explored(span);
    for (const [k, v] of Object.entries(data ?? {})) e.maps.set(k, Uint8Array.from(atob(v), (c) => c.charCodeAt(0)));
    return e;
  }
}

/** What the hand-built campaign adds to a game: quests, counters, portals and the changes made to its maps. */
export interface CampaignSave {
  progress: CampaignProgress;
  /** Cell changes per map slug (broken walls, opened gates, moved chests). */
  maps: Record<string, CellOverrides>;
}

/** The tiles across and down of a world size, for `Explored`. */
export const spanOf = (size: WorldSize): { w: number; h: number } => ({ w: WORLD_SIZES[size].width, h: WORLD_SIZES[size].height });

export interface HutSlotState {
  gen: number;
  /** Game minute at which the monster of this generation was defeated; absent while it lives. */
  died?: number;
}

/** Where the pirate ship is (canonical world coordinates), and, after a meeting with the party, the game minute at which it comes back (a week later). */
export interface PirateState {
  x: number;
  y: number;
  away?: number;
}

export interface GameState {
  seed: string;
  /** How big the world is: small, default, large or huge (the seed alone does not tell). */
  size: WorldSize;
  /** How many of the caves and dungeons the world keeps (title screen, "Dungeons"); a save without it has all of them. */
  dungeons: DungeonDensity;
  /** Set when the game is played in the campaign maps instead of the endless world. */
  campaign: CampaignSave | null;
  party: Party;
  at: Location;
  /** uids of used actions, opened doors and opened chests */
  opened: Set<string>;
  /** uids of breakable walls that were broken */
  broken: Set<string>;
  /** ids of defeated monsters */
  killed: Set<string>;
  /**
   * The monsters of the Monster Huts (`world/huts.ts`), by slot (`<hut id>:<slot>`): the generation that stands there now (a monster that was
   * defeated is replaced by the next generation) and the game minute its predecessor fell, while it is waiting for a new week.
   */
  hutSlots: Record<string, HutSlotState>;
  /** The pirate ship of ue_quest_4; null until the party has come near it (it then stands at its home, `world/pirate.ts`). */
  pirate: PirateState | null;
  /** dropped loot per map key (`ow` for the overworld, the interior key otherwise) */
  loot: Record<string, LootPile[]>;
  explored: Explored;
  visited: Set<string>;
  steps: number;
  kills: number;
  /** TEMPORARY (balance journal, `sim/journal.ts`): what happened in this playthrough, for balancing; goes into every save. */
  journal: JournalEntry[];
}

export function newGameState(seed: string, start: { x: number; y: number; facing: Facing }, size: WorldSize = DEFAULT_WORLD_SIZE, dungeons: DungeonDensity = FULL_DUNGEON_DENSITY): GameState {
  return {
    seed,
    size,
    dungeons,
    campaign: null,
    party: createDefaultParty(),
    at: { mode: "overworld", x: start.x, y: start.y, facing: start.facing },
    opened: new Set(),
    broken: new Set(),
    killed: new Set(),
    hutSlots: {},
    pirate: null,
    loot: {},
    explored: new Explored(spanOf(size)),
    visited: new Set(),
    steps: 0,
    kills: 0,
    journal: [],
  };
}

/** A fresh campaign game: the default party in the street of Fountain Head, with its own password riddles. */
export function newCampaignState(seed: string): GameState {
  const state = newGameState(seed, { x: 0, y: 0, facing: "N" });
  state.campaign = { progress: newProgress(new Rng(seedFromString(`${seed}:passwords`))), maps: {} };
  // campaign cells are stored in the editor's coordinates; `ret` is unused there
  state.at = { mode: "interior", poiId: `campaign:${CAMPAIGN_START}`, x: CAMPAIGN_START_CELL.x, y: CAMPAIGN_START_CELL.y, facing: CAMPAIGN_START_CELL.facing, ret: { x: 0, y: 0, facing: "S" } };
  return state;
}

export function isCampaignPlace(at: Location): at is Extract<Location, { mode: "interior" }> {
  return at.mode === "interior" && at.poiId.startsWith("campaign:");
}

export interface SaveFile {
  version: 1;
  genVersion: number;
  savedAt: string;
  seed: string;
  state: {
    seed: string;
    /** Absent in saves of the endless world, which no longer load as such. */
    size?: WorldSize;
    /** Absent in saves from before the choice of how many dungeons a world has: they have all of them. */
    dungeons?: DungeonDensity;
    party: Party;
    at: Location;
    opened: string[];
    broken: string[];
    killed: string[];
    /** Absent in saves from before the Monster Huts. */
    hutSlots?: Record<string, HutSlotState>;
    /** Absent in saves from before the pirate ship. */
    pirate?: PirateState | null;
    loot: Record<string, LootPile[]>;
    explored: Record<string, string>;
    visited: string[];
    steps: number;
    kills: number;
    campaign?: CampaignSave | null;
    /** TEMPORARY (balance journal): absent in older saves, and in a save the browser had no room for with it (`setSaveItem`). */
    journal?: JournalEntry[];
  };
}

export function toSaveFile(state: GameState): SaveFile {
  return {
    version: 1,
    genVersion: GEN_VERSION,
    savedAt: new Date().toISOString(),
    seed: state.seed,
    state: {
      seed: state.seed,
      size: state.size,
      dungeons: state.dungeons,
      party: state.party,
      at: state.at,
      opened: [...state.opened],
      broken: [...state.broken],
      killed: [...state.killed],
      hutSlots: state.hutSlots,
      pirate: state.pirate,
      loot: state.loot,
      explored: state.explored.toJSON(),
      visited: [...state.visited],
      steps: state.steps,
      kills: state.kills,
      campaign: state.campaign,
      journal: state.journal,
    },
  };
}

/**
 * Stores a save under a key. TEMPORARY (balance journal): the journal makes a save bigger and every slot keeps a copy of it, so when the browser refuses (quota), the save is
 * written once more without the journal: a game is never lost for the sake of the log. Returns whether the save was stored, and `withJournal` says whether it carries the journal.
 */
function setSaveItem(key: string, file: SaveFile): { stored: boolean; withJournal: boolean } {
  // (57th playtest, point 7: packed, a quarter of the room; `saveCodec.ts`)
  try {
    localStorage.setItem(key, packSave(JSON.stringify(file)));
    return { stored: true, withJournal: true };
  } catch {
    // fall through to the retry without the journal
  }
  if (!file.state.journal || file.state.journal.length === 0) return { stored: false, withJournal: false };
  try {
    const { journal: _dropped, ...state } = file.state;
    localStorage.setItem(key, packSave(JSON.stringify({ ...file, state })));
    return { stored: true, withJournal: false };
  } catch {
    return { stored: false, withJournal: false };
  }
}

/** Set when the last save had to leave the journal out; the game shows a line in its log (`takeJournalDropped`). */
let journalDropped = false;
export function takeJournalDropped(): boolean {
  const was = journalDropped;
  journalDropped = false;
  return was;
}

export function fromSaveFile(file: SaveFile): GameState {
  const s = file.state;
  const size = parseWorldSize(s.size);
  return {
    seed: s.seed,
    size,
    dungeons: parseDungeonDensity(s.dungeons),
    party: normalizeParty(s.party),
    at: s.at,
    opened: new Set(s.opened),
    broken: new Set(s.broken),
    killed: new Set(s.killed),
    hutSlots: s.hutSlots ?? {},
    pirate: s.pirate ?? null,
    loot: s.loot,
    explored: Explored.fromJSON(s.explored, spanOf(size)),
    visited: new Set(s.visited),
    steps: s.steps,
    kills: s.kills,
    campaign: s.campaign ?? null,
    journal: Array.isArray(s.journal) ? s.journal : [],
  };
}

/**
 * The endless world and the campaign each have their own slots, so one of each can be played side by side. The endless
 * world keeps the key names the game always used (saves from before the split stay where they are); `splitLegacySaves`
 * moves a campaign save that was written under them.
 */
export type GameKind = "world" | "campaign";
const KEYS: Record<GameKind, Record<"auto" | "quick", string>> = {
  world: { auto: "mm3-seed-rpg:save:v1", quick: "mm3-seed-rpg:quicksave:v1" },
  campaign: { auto: "mm3-seed-rpg:campaign:save:v1", quick: "mm3-seed-rpg:campaign:quicksave:v1" },
};
/** The single slot "Save game" wrote before there were named saves (`migrateManualSaves` turns it into one). */
const LEGACY_MANUAL: Record<GameKind, string> = { world: "mm3-seed-rpg:manualsave:v1", campaign: "mm3-seed-rpg:campaign:manualsave:v1" };

/** `auto`: written by the game itself, `quick`: F5. What "Save game" in the menu writes are the named saves below. */
export type SaveSlot = keyof (typeof KEYS)["world"];
export const SAVE_SLOTS: readonly SaveSlot[] = ["quick", "auto"];
export const GAME_KINDS: readonly GameKind[] = ["world", "campaign"];
/** The kinds of game whose saves the title screen and the menu list: the campaign was taken off the menu (6. 11. 2026), its saves stay in the browser but are not offered. */
export const LISTED_KINDS: readonly GameKind[] = ["world"];

export const kindOfState = (state: Pick<GameState, "campaign">): GameKind => (state.campaign ? "campaign" : "world");

/** Writes a save to localStorage, in the slots of the kind of game being played. Returns false if the browser refuses (private mode, quota). */
export function writeSave(state: GameState, slot: SaveSlot = "auto"): boolean {
  const result = setSaveItem(KEYS[kindOfState(state)][slot], toSaveFile(state));
  if (result.stored && !result.withJournal) journalDropped = true;
  return result.stored;
}

export function readSave(kind: GameKind, slot: SaveSlot = "auto"): SaveFile | null {
  try {
    const raw = localStorage.getItem(KEYS[kind][slot]);
    if (!raw) return null;
    const file = JSON.parse(unpackSave(raw)) as SaveFile;
    // a world slot never offers a campaign save and the other way round (see `splitLegacySaves`)
    return file.version === 1 && !!file.state?.campaign === (kind === "campaign") ? file : null;
  } catch {
    return null;
  }
}

/**
 * Before the split both kinds of game wrote to the same keys, so a campaign save may sit in the world's slots. Moves such
 * a save to the campaign's slot, once at start-up, unless that slot holds a save already (then the old one stays where it is
 * and `readSave` ignores it).
 */
export function splitLegacySaves(): void {
  migrateManualSaves();
  packStoredSaves();
  try {
    for (const slot of SAVE_SLOTS) {
      const raw = localStorage.getItem(KEYS.world[slot]);
      if (!raw || !(JSON.parse(unpackSave(raw)) as SaveFile).state?.campaign || localStorage.getItem(KEYS.campaign[slot]) !== null) continue;
      localStorage.setItem(KEYS.campaign[slot], raw);
      localStorage.removeItem(KEYS.world[slot]);
    }
  } catch {
    // storage unavailable or a damaged save: nothing to move
  }
}

/**
 * Once at start-up: the saves written before they were packed (57th playtest, point 7) are packed now. The browser's storage was full of them (the newest two named saves of the
 * playtest did not fit any more); packed they take about a quarter of the room. A save is only replaced when its packed form reads back to exactly the same text and is shorter, so
 * nothing is lost whatever happens; a save that is already packed, or damaged, stays as it is. Returns how many characters this freed.
 */
export function packStoredSaves(): number {
  let freed = 0;
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith(namedKey("")) || GAME_KINDS.some((kind) => SAVE_SLOTS.some((slot) => KEYS[kind][slot] === key)))) keys.push(key);
    }
    for (const key of keys) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw || !raw.startsWith("{")) continue;
        const packed = packSave(raw);
        if (packed.length >= raw.length || unpackSave(packed) !== raw) continue;
        localStorage.setItem(key, packed);
        freed += raw.length - packed.length;
      } catch {
        // this one stays as it is
      }
    }
  } catch {
    // storage unavailable
  }
  return freed;
}

// ---------------------------------------------------------------- named saves ("Save game")

/**
 * Any number of saves, each with a name the player chose. The index (one small key) lists them, each save has a key of its own so that one big
 * save does not have to be read to show the list. A name is unique among the saves of a kind of game (capitals do not count): saving under a name
 * that exists replaces that save.
 */
export interface NamedSave {
  id: string;
  name: string;
  kind: GameKind;
  /** `describeSave` of the save (the seed, the lead hero and when it was made), so that a list needs no save to be read. */
  note: string;
  savedAt: string;
}

const NAMED_INDEX = "mm3-seed-rpg:named:index:v1";
const namedKey = (id: string) => `mm3-seed-rpg:named:save:${id}`;
export const MAX_SAVE_NAME = 40;
/** The name a save of the old single slot gets. */
export const LEGACY_SAVE_NAME = "Saved game";

/** A name as it is stored: whitespace trimmed and collapsed, at most `MAX_SAVE_NAME` letters. */
export const cleanSaveName = (name: string): string => name.replace(/\s+/g, " ").trim().slice(0, MAX_SAVE_NAME).trim();
const sameName = (a: string, b: string) => a.toLocaleLowerCase() === b.toLocaleLowerCase();

function readIndex(): NamedSave[] {
  let listed: NamedSave[] = [];
  try {
    const raw = localStorage.getItem(NAMED_INDEX);
    const list: unknown = raw ? JSON.parse(raw) : [];
    listed = Array.isArray(list) ? (list as NamedSave[]).filter((e) => typeof e?.id === "string" && typeof e.name === "string") : [];
  } catch {
    listed = [];
  }
  return [...listed, ...unlistedSaves(new Set(listed.map((e) => e.id)))];
}

/**
 * Saves that sit in the browser but are not in the index (57th playtest, point 7: a save was written, then the browser had no room for the index entry, and the save was never
 * listed). They are offered under a name made of the time they were saved, and go into the index with the next save.
 */
const recoveredSaves = new Map<string, NamedSave>();
function unlistedSaves(known: ReadonlySet<string>): NamedSave[] {
  const out: NamedSave[] = [];
  try {
    const prefix = namedKey("");
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(prefix)) continue;
      const id = key.slice(prefix.length);
      if (known.has(id)) continue;
      let entry = recoveredSaves.get(id);
      if (!entry) {
        const file = readNamedSave(id);
        if (!file || !isSaveFile(file)) continue;
        const kind: GameKind = file.state.campaign ? "campaign" : "world";
        entry = { id, name: cleanSaveName(`Recovered ${file.savedAt.slice(0, 16).replace("T", " ")}`), kind, note: describeSave(file), savedAt: file.savedAt };
        recoveredSaves.set(id, entry);
      }
      out.push(entry);
    }
  } catch {
    // storage unavailable: nothing to recover
  }
  return out;
}

/** The named saves of a kind of game (all kinds without one), the newest first. */
export function listNamedSaves(kind?: GameKind): NamedSave[] {
  return readIndex()
    .filter((e) => kind === undefined || e.kind === kind)
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export const findNamedSave = (name: string, kind: GameKind): NamedSave | undefined => readIndex().find((e) => e.kind === kind && sameName(e.name, cleanSaveName(name)));

/** Stores a save file under a name (replacing the save of that name). Returns false when the name is empty or the browser refuses. */
export function storeNamedSave(file: SaveFile, name: string): boolean {
  const clean = cleanSaveName(name);
  if (clean === "") return false;
  const kind: GameKind = file.state.campaign ? "campaign" : "world";
  let id = "";
  let isNew = false;
  try {
    const index = readIndex();
    const old = index.find((e) => e.kind === kind && sameName(e.name, clean));
    id = old?.id ?? `${Date.now().toString(36)}${index.length.toString(36)}`;
    isNew = !old;
    const result = setSaveItem(namedKey(id), file);
    if (!result.stored) return false;
    if (!result.withJournal) journalDropped = true;
    const entry: NamedSave = { id, name: clean, kind, note: describeSave(file), savedAt: file.savedAt };
    localStorage.setItem(NAMED_INDEX, JSON.stringify([...index.filter((e) => e.id !== id), entry]));
    recoveredSaves.delete(id);
    return true;
  } catch {
    // the save is in, the index entry did not fit: a new save is taken out again, so that none is left in the browser that no list shows
    if (isNew && id) {
      try {
        localStorage.removeItem(namedKey(id));
      } catch {
        // nothing more to do
      }
    }
    return false;
  }
}

/** Saves the game being played under a name. */
export const writeNamedSave = (state: GameState, name: string): boolean => storeNamedSave(toSaveFile(state), name);

export function readNamedSave(id: string): SaveFile | null {
  try {
    const raw = localStorage.getItem(namedKey(id));
    const file = raw ? (JSON.parse(unpackSave(raw)) as SaveFile) : null;
    return file && file.version === 1 && file.state ? file : null;
  } catch {
    return null;
  }
}

export function deleteNamedSave(id: string): void {
  try {
    localStorage.removeItem(namedKey(id));
    recoveredSaves.delete(id);
    localStorage.setItem(NAMED_INDEX, JSON.stringify(readIndex().filter((e) => e.id !== id)));
  } catch {
    // nothing to remove
  }
}

/** A name for an imported save that no save of the kind has yet ("Imported abc", "Imported abc (2)"). */
export function freeSaveName(base: string, kind: GameKind): string {
  const root = cleanSaveName(base);
  let name = root;
  for (let n = 2; findNamedSave(name, kind); n++) name = cleanSaveName(`${root.slice(0, MAX_SAVE_NAME - 5)} (${n})`);
  return name;
}

/** Once at start-up: the save of the old single slot becomes the named save "Saved game" (unless the name is taken), and the old key is dropped. */
export function migrateManualSaves(): void {
  for (const kind of GAME_KINDS) {
    try {
      const raw = localStorage.getItem(LEGACY_MANUAL[kind]);
      if (!raw) continue;
      const file = JSON.parse(unpackSave(raw)) as SaveFile;
      // a campaign save may sit in the world's key (see `splitLegacySaves`): the save itself says what it is
      if (isSaveFile(file)) {
        const own: GameKind = file.state.campaign ? "campaign" : "world";
        storeNamedSave(file, freeSaveName(LEGACY_SAVE_NAME, own));
      }
      localStorage.removeItem(LEGACY_MANUAL[kind]);
    } catch {
      // a damaged save stays where it is
    }
  }
}

/** All the saves of this browser in one file (Esc > Debug > Export saves): what a tester sends so that the game can be looked at somewhere else. */
export interface SaveBundle {
  format: "mm3-saves";
  exportedAt: string;
  saves: { kind: GameKind; slot: SaveSlot | "manual"; save: SaveFile }[];
  /** The named saves (older bundles have none; their "manual" slot is imported as a named save). */
  named?: { name: string; save: SaveFile }[];
}

/** Every save in the slots of both kinds of game, and every named save. */
export function exportSaves(): SaveBundle {
  const saves: SaveBundle["saves"] = [];
  for (const kind of GAME_KINDS) for (const slot of SAVE_SLOTS) {
    const save = readSave(kind, slot);
    if (save) saves.push({ kind, slot, save });
  }
  const named: NonNullable<SaveBundle["named"]> = [];
  for (const entry of listNamedSaves()) {
    const save = readNamedSave(entry.id);
    if (save) named.push({ name: entry.name, save });
  }
  return { format: "mm3-saves", exportedAt: new Date().toISOString(), saves, named };
}

const isSaveFile = (v: unknown): v is SaveFile => typeof v === "object" && v !== null && (v as SaveFile).version === 1 && typeof (v as SaveFile).state === "object" && (v as SaveFile).state !== null && Array.isArray((v as SaveFile).state.party?.characters);

/**
 * Puts the saves of a file into their slots, replacing what is there. The file is a bundle (`exportSaves`) or a single save, which becomes a named save
 * ("Imported <seed>"); named saves of a bundle keep their names (and replace a save of that name), the "manual" slot of an older bundle becomes "Saved game".
 * Returns what was written ("world / auto", "world / <name>") and why the rest was left out; nothing is written when the text is no save at all.
 */
export function importSaves(text: string): { written: string[]; skipped: string[] } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { written: [], skipped: ["the file is no JSON"] };
  }
  const written: string[] = [];
  const skipped: string[] = [];
  const kindOf = (save: SaveFile): GameKind => (save.state.campaign ? "campaign" : "world");
  const putNamed = (save: unknown, name: string, label: string) => {
    if (!isSaveFile(save)) skipped.push(`${label}: not a save`);
    else if (storeNamedSave(save, name)) written.push(`${kindOf(save)} / ${cleanSaveName(name)}`);
    else skipped.push(`${label}: the browser refused to store it`);
  };
  if (isSaveFile(data)) {
    putNamed(data, freeSaveName(`Imported ${data.seed}`, kindOf(data)), "the save");
    return { written, skipped };
  }
  const bundle = data as Partial<SaveBundle> | null;
  if (typeof bundle !== "object" || bundle === null || bundle.format !== "mm3-saves" || !Array.isArray(bundle.saves)) return { written, skipped: ["the file holds no save"] };
  for (const { kind, slot, save } of bundle.saves) {
    const name = `${kind} / ${slot}`;
    if (slot === "manual") putNamed(save, LEGACY_SAVE_NAME, name);
    else if (!GAME_KINDS.includes(kind) || !SAVE_SLOTS.includes(slot)) skipped.push(`${name}: unknown slot`);
    else if (!isSaveFile(save) || !!save.state.campaign !== (kind === "campaign")) skipped.push(`${name}: not a save of this kind of game`);
    else {
      try {
        localStorage.setItem(KEYS[kind][slot], packSave(JSON.stringify(save)));
        written.push(name);
      } catch {
        skipped.push(`${name}: the browser refused to store it`);
      }
    }
  }
  for (const entry of Array.isArray(bundle.named) ? bundle.named : []) putNamed(entry?.save, String(entry?.name ?? ""), `named save "${String(entry?.name)}"`);
  if (bundle.saves.length === 0 && !(bundle.named?.length)) skipped.push("the file holds no save");
  return { written, skipped };
}

export function describeSave(file: SaveFile): string {
  const d = new Date(file.savedAt);
  const time = Number.isNaN(d.getTime()) ? "" : ` ${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  const lead = file.state.party.characters[0];
  return `${file.state.campaign ? "campaign" : `${file.seed} (${WORLD_SIZES[parseWorldSize(file.state.size)].label.toLowerCase()})`}${lead ? `, ${lead.name} L${lead.level}` : ""}${time}`;
}
