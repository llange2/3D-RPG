import { GEN_VERSION } from "../core/version";
import type { Facing } from "../interiors/types";
import type { Item, Party } from "../sim/types";
import { createDefaultParty, normalizeParty } from "../sim/party";
import { Rng, seedFromString } from "../core/rng";
import { newProgress, type CampaignProgress } from "../campaign/engine";
import type { CellOverrides } from "../campaign/model";
import { CAMPAIGN_START, CAMPAIGN_START_CELL } from "../campaign/types";
import { CHUNK_SIZE, DEFAULT_WORLD_SIZE, WORLD_SIZES, parseWorldSize, wrap, type WorldSize } from "../world/types";

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

export interface GameState {
  seed: string;
  /** How big the world is: small, default, large or huge (the seed alone does not tell). */
  size: WorldSize;
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
  /** dropped loot per map key (`ow` for the overworld, the interior key otherwise) */
  loot: Record<string, LootPile[]>;
  explored: Explored;
  visited: Set<string>;
  steps: number;
  kills: number;
}

export function newGameState(seed: string, start: { x: number; y: number; facing: Facing }, size: WorldSize = DEFAULT_WORLD_SIZE): GameState {
  return {
    seed,
    size,
    campaign: null,
    party: createDefaultParty(),
    at: { mode: "overworld", x: start.x, y: start.y, facing: start.facing },
    opened: new Set(),
    broken: new Set(),
    killed: new Set(),
    hutSlots: {},
    loot: {},
    explored: new Explored(spanOf(size)),
    visited: new Set(),
    steps: 0,
    kills: 0,
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
    party: Party;
    at: Location;
    opened: string[];
    broken: string[];
    killed: string[];
    /** Absent in saves from before the Monster Huts. */
    hutSlots?: Record<string, HutSlotState>;
    loot: Record<string, LootPile[]>;
    explored: Record<string, string>;
    visited: string[];
    steps: number;
    kills: number;
    campaign?: CampaignSave | null;
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
      party: state.party,
      at: state.at,
      opened: [...state.opened],
      broken: [...state.broken],
      killed: [...state.killed],
      hutSlots: state.hutSlots,
      loot: state.loot,
      explored: state.explored.toJSON(),
      visited: [...state.visited],
      steps: state.steps,
      kills: state.kills,
      campaign: state.campaign,
    },
  };
}

export function fromSaveFile(file: SaveFile): GameState {
  const s = file.state;
  const size = parseWorldSize(s.size);
  return {
    seed: s.seed,
    size,
    party: normalizeParty(s.party),
    at: s.at,
    opened: new Set(s.opened),
    broken: new Set(s.broken),
    killed: new Set(s.killed),
    hutSlots: s.hutSlots ?? {},
    loot: s.loot,
    explored: Explored.fromJSON(s.explored, spanOf(size)),
    visited: new Set(s.visited),
    steps: s.steps,
    kills: s.kills,
    campaign: s.campaign ?? null,
  };
}

/**
 * The endless world and the campaign each have their own slots, so one of each can be played side by side. The endless
 * world keeps the key names the game always used (saves from before the split stay where they are); `splitLegacySaves`
 * moves a campaign save that was written under them.
 */
export type GameKind = "world" | "campaign";
const KEYS: Record<GameKind, Record<"auto" | "quick" | "manual", string>> = {
  world: { auto: "mm3-seed-rpg:save:v1", quick: "mm3-seed-rpg:quicksave:v1", manual: "mm3-seed-rpg:manualsave:v1" },
  campaign: { auto: "mm3-seed-rpg:campaign:save:v1", quick: "mm3-seed-rpg:campaign:quicksave:v1", manual: "mm3-seed-rpg:campaign:manualsave:v1" },
};

/** `auto`: written by the game itself, `quick`: F5, `manual`: "Save game" in the menu. */
export type SaveSlot = keyof (typeof KEYS)["world"];
export const SAVE_SLOTS: readonly SaveSlot[] = ["manual", "quick", "auto"];
export const GAME_KINDS: readonly GameKind[] = ["world", "campaign"];

export const kindOfState = (state: Pick<GameState, "campaign">): GameKind => (state.campaign ? "campaign" : "world");

/** Writes a save to localStorage, in the slots of the kind of game being played. Returns false if the browser refuses (private mode, quota). */
export function writeSave(state: GameState, slot: SaveSlot = "auto"): boolean {
  try {
    localStorage.setItem(KEYS[kindOfState(state)][slot], JSON.stringify(toSaveFile(state)));
    return true;
  } catch {
    return false;
  }
}

export function readSave(kind: GameKind, slot: SaveSlot = "auto"): SaveFile | null {
  try {
    const raw = localStorage.getItem(KEYS[kind][slot]);
    if (!raw) return null;
    const file = JSON.parse(raw) as SaveFile;
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
  try {
    for (const slot of SAVE_SLOTS) {
      const raw = localStorage.getItem(KEYS.world[slot]);
      if (!raw || !(JSON.parse(raw) as SaveFile).state?.campaign || localStorage.getItem(KEYS.campaign[slot]) !== null) continue;
      localStorage.setItem(KEYS.campaign[slot], raw);
      localStorage.removeItem(KEYS.world[slot]);
    }
  } catch {
    // storage unavailable or a damaged save: nothing to move
  }
}

export function describeSave(file: SaveFile): string {
  const d = new Date(file.savedAt);
  const time = Number.isNaN(d.getTime()) ? "" : ` ${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  const lead = file.state.party.characters[0];
  return `${file.state.campaign ? "campaign" : `${file.seed} (${WORLD_SIZES[parseWorldSize(file.state.size)].label.toLowerCase()})`}${lead ? `, ${lead.name} L${lead.level}` : ""}${time}`;
}
