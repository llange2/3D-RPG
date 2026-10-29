import { z } from "zod";
import { seedFromString } from "../core/rng";
import { MAP_ITEMS } from "../data/tables";
import type { ActionKind } from "./types";

export interface ActionDef {
  kind: ActionKind;
  /** Ids of the old g.ACTIONS table that map onto this kind. */
  legacyIds: number[];
  /** `enter`: fires when the party steps on the cell. `interact`: the party bumps into it (the cell blocks movement while active). */
  trigger: "enter" | "interact";
  /** `once`: consumed after the first use, stored in the save deltas. */
  persistence: "once" | "repeat";
  /** Texture key of the minimap icon. */
  minimap: string;
  params: z.ZodType<Record<string, unknown>>;
}

const loose = z.looseObject;

export const SERVICES = ["inn", "training", "tavern", "smith", "temple", "bank", "guild"] as const;
export type ServiceKind = (typeof SERVICES)[number];

export const TRAP_KINDS = ["spring", "pit", "guillotine", "generic", "steal_gold"] as const;

export const ACTION_DEFS: Record<ActionKind, ActionDef> = {
  treasure: {
    kind: "treasure",
    legacyIds: [12, 21, 52],
    trigger: "interact",
    persistence: "once",
    minimap: "tex_mm_event",
    params: loose({ level: z.number().int().min(1).max(8), gold: z.number().int().min(0), items: z.number().int().min(0).max(10) }),
  },
  door: {
    kind: "door",
    legacyIds: [14, 16, 18],
    trigger: "interact",
    persistence: "once",
    minimap: "tex_mm_door",
    params: loose({ locked: z.boolean(), difficulty: z.number().int().min(0).optional() }),
  },
  trap: {
    kind: "trap",
    legacyIds: [17, 23, 24, 30, 50],
    trigger: "enter",
    // a trap that has gone off is still there: the pit stays open, blade and spears reload, the rest strikes again
    persistence: "repeat",
    minimap: "tex_mm_trap",
    params: loose({ trap: z.enum(TRAP_KINDS), damage: z.number().int().min(0) }),
  },
  lore: {
    kind: "lore",
    legacyIds: [25],
    trigger: "enter",
    persistence: "repeat",
    minimap: "tex_mm_info",
    params: loose({ pool: z.string(), line: z.number().int().min(0) }),
  },
  transfer: {
    kind: "transfer",
    legacyIds: [11, 27, 28, 51],
    trigger: "enter",
    persistence: "repeat",
    minimap: "tex_mm_maptransfer",
    params: loose({ mode: z.enum(["poi_enter", "poi_exit", "stairs", "teleport"]) }),
  },
  service: {
    kind: "service",
    legacyIds: [1, 2, 3, 4, 5, 6, 7],
    trigger: "enter",
    persistence: "repeat",
    minimap: "tex_mm_inn",
    params: loose({ service: z.enum(SERVICES), tier: z.number().int().min(1).max(5) }),
  },
  ambush: {
    kind: "ambush",
    legacyIds: [9034],
    trigger: "enter",
    persistence: "once",
    minimap: "tex_mm_unknown",
    params: loose({ group: z.number().int().min(1).max(8) }),
  },
  shrine: {
    kind: "shrine",
    legacyIds: [36, 44],
    trigger: "interact",
    persistence: "once",
    minimap: "tex_mm_persona",
    params: loose({ effect: z.enum(["resist", "attribute", "heal", "xp", "hurt"]), amount: z.number().int() }),
  },
  fountain: {
    kind: "fountain",
    legacyIds: [],
    trigger: "interact",
    // refills at dawn: the game layer remembers the day it was used (see Game.useAction), so the save needs no counter
    persistence: "repeat",
    minimap: "tex_mm_persona",
    params: loose({ heal: z.number().int().min(1) }),
  },
  decor: {
    kind: "decor",
    legacyIds: [],
    // a prop of the theme (old item id): it only says what it is when the party bumps into it, and blocks its cell if the old item did
    trigger: "interact",
    persistence: "repeat",
    minimap: "tex_mm_info",
    params: loose({ item: z.number().int().min(1) }),
  },
  riddle: {
    kind: "riddle",
    legacyIds: [],
    // a statue asks a question; the right answer pays out once (the old action 42), a wrong one costs nothing and may be tried again
    trigger: "interact",
    persistence: "once",
    minimap: "tex_mm_persona",
    params: loose({ item: z.number().int().min(1), question: z.string().min(1), answer: z.string().min(1) }),
  },
  gong: {
    kind: "gong",
    legacyIds: [],
    // each gong sounds once and calls monsters (the old action 40 with the spawn action 9034)
    trigger: "interact",
    persistence: "once",
    minimap: "tex_mm_event",
    params: loose({ item: z.number().int().min(1), group: z.number().int().min(1), monsters: z.string() }),
  },
  lever: {
    kind: "lever",
    legacyIds: [],
    // pulling flips the head it belongs to (`target`, a uid); a lever with no target is one of the look-alikes that do nothing
    trigger: "interact",
    persistence: "repeat",
    minimap: "tex_mm_event",
    params: loose({ item: z.number().int().min(1), target: z.string() }),
  },
  head: {
    kind: "head",
    legacyIds: [],
    // `ring` and `moan`: a statue that a lever sets or removes (the ring of heads, the field of quest 1). `rotate`: a head that turns a quarter when asked to
    trigger: "interact",
    persistence: "repeat",
    minimap: "tex_mm_event",
    params: loose({ item: z.number().int().min(1), mode: z.enum(["ring", "rotate", "moan"]) }),
  },
  teleporter: {
    kind: "teleporter",
    legacyIds: [],
    // the old action 27: stepping on the cell throws the party back to (tx, ty)
    trigger: "enter",
    persistence: "repeat",
    minimap: "tex_mm_maptransfer",
    params: loose({ tx: z.number().int(), ty: z.number().int() }),
  },
  talent: {
    kind: "talent",
    // the old action 15 (Buy Talent) is a campaign action: the campaign engine resolves it, this kind is the generated world's seller
    legacyIds: [],
    trigger: "interact",
    // the seller stays; having the talent is what ends the business
    persistence: "repeat",
    minimap: "tex_mm_persona",
    params: loose({ talent: z.string() }),
  },
  portal: {
    kind: "portal",
    // the old action 28: the party touches it and is offered every portal it has touched before
    legacyIds: [],
    trigger: "interact",
    persistence: "repeat",
    minimap: "tex_mm_teleporter_city",
    params: loose({ item: z.number().int().min(1) }),
  },
  work: {
    kind: "work",
    // the old action 19: "Work a week for 100 gold" (the old game lets ten days pass)
    legacyIds: [],
    trigger: "interact",
    persistence: "repeat",
    minimap: "tex_mm_persona",
    params: loose({ persona: z.number().int().min(1) }),
  },
  legacy: {
    kind: "legacy",
    legacyIds: [],
    // decided per cell by the campaign: walkable cells fire on entering, blocked ones when bumped into
    trigger: "enter",
    persistence: "repeat",
    minimap: "tex_mm_event",
    params: loose({}),
  },
  king: {
    kind: "king",
    legacyIds: [],
    // the king of a castle: the party gives him the orbs of ultimate power
    trigger: "interact",
    persistence: "repeat",
    minimap: "tex_mm_info",
    params: loose({ persona: z.number().int(), alignment: z.enum(["good", "neutral", "evil"]) }),
  },
  skullmiser: {
    kind: "skullmiser",
    legacyIds: [],
    // the Skull Miser of the start town buys the silver skulls (ue_quest_2)
    trigger: "interact",
    persistence: "repeat",
    minimap: "tex_mm_info",
    params: loose({ persona: z.number().int() }),
  },
  machine: {
    kind: "machine",
    legacyIds: [],
    // a statue that trades a Quatloo coin for three points of one attribute (ue_quest_1)
    trigger: "interact",
    persistence: "repeat",
    minimap: "tex_mm_info",
    params: loose({ item: z.number().int(), attr: z.enum(["str", "int", "per", "end", "spd", "acc", "lck"]), text: z.string() }),
  },
  tube: {
    kind: "tube",
    legacyIds: [],
    // a transporter tube of the spaceship (the way back to the pyramid), or the tube of the control deck that ends the game
    trigger: "interact",
    persistence: "repeat",
    minimap: "tex_mm_event",
    params: loose({ item: z.number().int() }),
  },
  qportal: {
    kind: "qportal",
    legacyIds: [],
    trigger: "interact",
    persistence: "repeat",
    minimap: "tex_mm_event",
    params: loose({}),
  },
  rune: {
    kind: "rune",
    legacyIds: [],
    trigger: "enter",
    persistence: "repeat",
    minimap: "tex_mm_event",
    params: loose({}),
  },
  chalice: {
    kind: "chalice",
    legacyIds: [],
    trigger: "interact",
    persistence: "once",
    minimap: "tex_mm_event",
    params: loose({}),
  },
  breakable_wall: {
    kind: "breakable_wall",
    legacyIds: [8],
    trigger: "interact",
    persistence: "once",
    minimap: "tex_mm_wall",
    params: loose({}),
  },
};

export const ACTION_KINDS = Object.keys(ACTION_DEFS) as ActionKind[];

/** The old actions that are traps: spring (17), pit (23), guillotine (24) and the generic one (30). Steal gold (50) is a pickpocket, not a trap you can see coming. */
const LEGACY_TRAPS: readonly number[] = [17, 23, 24, 30];

/** Is this a trap, generated or from the campaign's maps? */
export const isTrapAction = (a: { kind: ActionKind; legacy?: { id: number } }): boolean => a.kind === "trap" || (a.kind === "legacy" && !!a.legacy && LEGACY_TRAPS.includes(a.legacy.id));

/** A pit is a hole once it went off: the uid of an open pit is in the save's `opened` set, and it hurts every time. */
export const isLastingTrap = (a: { kind: ActionKind; params: Record<string, unknown> }): boolean => a.kind === "trap" && a.params.trap === "pit";

/** Has this action done its one use? Traps never have (they all go off again), chests, doors and shrines have. */
export function isSpent(a: { uid: string; kind: ActionKind; params: Record<string, unknown> }, opened: ReadonlySet<string>): boolean {
  return ACTION_DEFS[a.kind].persistence === "once" && opened.has(a.uid);
}

/** Steps a spear or guillotine trap needs to reload (the old game: 8 seconds), campaign and generated worlds alike. */
export const TRAP_RELOAD_STEPS = 8;

/** The traps that need to reload before they go off again: spears and the blade (the pit and the magic trap go off at every step onto the cell). */
export const isReloadingTrap = (a: { kind: ActionKind; params: Record<string, unknown> }): boolean => a.kind === "trap" && (a.params.trap === "spring" || a.params.trap === "guillotine");

/** The elements of the old generic trap (action 30), in the order that picks one of them. */
export const TRAP_ELEMENTS = ["fire", "ice", "acid", "magic"] as const;
export type TrapElement = (typeof TRAP_ELEMENTS)[number];

/**
 * Which element a generic trap throws: fire, ice, acid or magic. The old game's editor set it per trap or left it to chance at every
 * step; here it is fixed per trap by its uid (a pure function, so the map, the log and the damage always agree and the generator,
 * its seeds and the saves stay as they are).
 */
export function trapElement(uid: string): TrapElement {
  return TRAP_ELEMENTS[(seedFromString(uid)[0] >>> 0) % TRAP_ELEMENTS.length]!;
}

/**
 * The element of a generic trap: the one the theme names (`element`), else by chance from the uid. Use this one for an action;
 * `trapElement` is the by-chance part alone.
 */
export function trapElementOf(a: { uid: string; params: Record<string, unknown> }): TrapElement {
  const named = a.params.element;
  return (TRAP_ELEMENTS as readonly unknown[]).includes(named) ? (named as TrapElement) : trapElement(a.uid);
}

/** A lore action with an `object` (a statue, a signpost) stands on its cell like a chest; without one it is a message on the floor. */
const hasObject = (a: { kind: ActionKind; params: Record<string, unknown> }): boolean => a.kind === "lore" && (typeof a.params.object === "string" || typeof a.params.item === "number" || typeof a.params.persona === "number");

/** When the action fires: the party steps on the cell (`enter`) or bumps into the object on it (`interact`). */
export function actionTrigger(a: { kind: ActionKind; params: Record<string, unknown> }): "enter" | "interact" {
  // an object the party can walk over (bones, runes) says what it is when it steps on it; one that stands in the way, when it bumps into it
  if (a.kind === "decor") return blocksCell(a) ? "interact" : "enter";
  return hasObject(a) ? "interact" : ACTION_DEFS[a.kind].trigger;
}

/** Objects that stand on their cell and block it: chests, shrines, fountains and the statues of towns. */
export function blocksCell(a: { kind: ActionKind; params: Record<string, unknown> }): boolean {
  // a ring head blocks only while it stands on its cell (a lever sets and removes it): the game decides that (`ringBlocked` in quests.ts)
  if (a.kind === "head") return a.params.mode === "rotate";
  return a.kind === "qportal" || a.kind === "king" || a.kind === "skullmiser" || a.kind === "machine" || a.kind === "tube" || a.kind === "chalice" || a.kind === "treasure" || a.kind === "talent" || a.kind === "portal" || a.kind === "work" || a.kind === "shrine" || a.kind === "fountain" || a.kind === "riddle" || a.kind === "gong" || a.kind === "lever" || hasObject(a) || (a.kind === "decor" && MAP_ITEMS[Number(a.params.item)]?.obstacle === true);
}

export function kindForLegacyId(id: number): ActionKind | null {
  for (const def of Object.values(ACTION_DEFS)) if (def.legacyIds.includes(id)) return def.kind;
  return null;
}

/** Legacy ids that belong to the campaign (quests, riddles, puzzles) and are not generated. */
export const CAMPAIGN_LEGACY_IDS = [13, 15, 19, 20, 22, 26, 29, 31, 37, 40, 42, 43, 45, 46, 48, 49, 53, 9032, 9033, 9035, 9039, 9041, 9047];
