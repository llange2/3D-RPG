/**
 * The campaign's quest, riddle and puzzle actions, ported from action_handler.py.
 *
 * The engine is headless: it changes the party and the map model and talks to the player through `CampaignUi` and to the
 * game world through `CampaignPort`. Every handler works on one cell in the editor's absolute coordinates, which is the
 * cell of the action itself; chains (levers, counters, riddles) call `trigger` on the cells they name.
 *
 * Differences from the old game, on purpose:
 *  - the old code took the key or coin for a gate before the question was answered; here it is taken after "yes".
 *  - password riddles (action 22) ask the question of the party's own password list, so the hints that NPCs and
 *    taverns give with `{riddle_a0}` match the lock. The old code asked the master list directly.
 */
import { thousands } from "../core/format";
import type { Rng } from "../core/rng";
import { RIDDLES_MASTER, TALENTS, TEXTS, talentInfo } from "../data/tables";
import { thieveryRoll, levelUp, recalcValues, isAlive } from "../sim/character";
import { applyHit } from "../sim/combat";
import { serviceLevel } from "../sim/economy";
import { generateItem, questItem, spellScroll } from "../sim/items";
import { conditionEventText } from "../sim/conditions";
import { addEffect, addXp, advanceTime, carriedItems, giveItem, hasEffect, setMascot } from "../sim/party";
import type { Item, Party } from "../sim/types";
import { SERVICES, TRAP_RELOAD_STEPS, type ServiceKind } from "../actions/registry";
import { BLOCK_OPEN_DOOR, BLOCK_PIT } from "./blocks";
import type { CampaignMapModel } from "./model";
import { mapSlugOf, parseXY, type GateDirection, type TrapKind } from "./types";

// ---------------------------------------------------------------- state and ports

export interface QuestRecord {
  returned?: number;
}

/** Everything the campaign adds to a save besides the cell changes of the maps. */
export interface CampaignProgress {
  quests: { active: Record<string, QuestRecord>; completed: Record<string, QuestRecord> };
  counters: Record<string, number>;
  /** Portal destinations the party has found, by the id of their name text. */
  portals: Record<string, { map: string; x: number; y: number; rot: number }>;
  /** Slugs of the maps the party has transferred away from (the old map cache). */
  left: string[];
  mascots: string[];
  /** The party's 100 password riddles, indices into RIDDLES_MASTER. */
  passwords: number[];
  /** Step number at which a reloading trap fired last, by cell. */
  trapped: Record<string, number>;
}

/** Is the trap on this cell (editor coordinates) still reloading? Asking changes nothing. */
export function trapReloading(progress: CampaignProgress, slug: string, x: number, y: number, steps: number): boolean {
  const last = progress.trapped[`${slug}:${x},${y}`];
  return last !== undefined && steps - last < TRAP_RELOAD_STEPS;
}

/** The rotation a trap action sets for its blade or spear, in degrees (empty parameter: 0). */
export function trapRotation(ax: Record<string, unknown>): number {
  const s = String(ax.rotation ?? "");
  const n = Number(s);
  return s !== "" && Number.isFinite(n) ? Math.trunc(n) : 0;
}

export function newProgress(rng: Rng): CampaignProgress {
  const pool = Array.from({ length: 200 }, (_, i) => i + 1).filter((i) => RIDDLES_MASTER[i]);
  const passwords: number[] = [];
  while (passwords.length < 100 && pool.length > 0) passwords.push(pool.splice(rng.int(pool.length), 1)[0]!);
  return { quests: { active: {}, completed: {} }, counters: {}, portals: {}, left: [], mascots: ["Crow"], passwords, trapped: {} };
}

export interface CampaignUi {
  /** A scroll with text and an OK button. */
  message(text: string): Promise<void>;
  confirm(text: string): Promise<boolean>;
  /** Index of the chosen character or null. */
  pickCharacter(question: string, includeIncapacitated?: boolean): Promise<number | null>;
  askText(question: string): Promise<string | null>;
  pickPortal(title: string, options: { label: string; value: string }[]): Promise<string | null>;
  sound(id: number): void;
  log(text: string, kind?: "info" | "good" | "bad" | "loot"): void;
}

export interface CampaignPort {
  /** Puts the party on another cell of this map. */
  teleport(x: number, y: number, rotationDeg: number): void;
  /** Loads another campaign map. Coordinates are absolute cells of that map. */
  transfer(slug: string, x: number, y: number, rotationDeg: number): Promise<void>;
  /** The layout, items or actions changed. */
  changed(): void;
  addMonster(x: number, y: number, id: number, rotationDeg: number): void;
  openService(service: ServiceKind, tier: number): Promise<void>;
  /** Flash the portrait of a hurt character. */
  hurt(character: number): void;
  /** A hit may end the game. */
  checkDefeat(): void;
  /** A gate opens: the metal gate (item 80 sinks into the floor, item 81 rises into the ceiling) slides away over a few seconds. */
  gate(item: number, x: number, y: number, rotationDeg: number, direction: GateDirection): void;
  /** A spring or guillotine trap went off: spears come out of the floor, the blade drops. `rotationDeg` is the trap's own rotation (action parameter). */
  trap(kind: TrapKind, x: number, y: number, rotationDeg: number): void;
  /** Steps taken so far, for trap reloading. */
  steps(): number;
  /** Recompute everything that depends on talents and attributes. */
  refresh(): void;
}

export interface CampaignHost {
  readonly party: Party;
  readonly progress: CampaignProgress;
  readonly map: CampaignMapModel;
  readonly rng: Rng;
  readonly ui: CampaignUi;
  readonly port: CampaignPort;
}

// ---------------------------------------------------------------- texts and parameters

const ATTRIBUTES = { strength: "str", intelligence: "int", personality: "per", endurance: "end", speed: "spd", luck: "lck", accuracy: "acc", res_acid: "resAcid", res_ice: "resIce", res_fire: "resFire", res_magic: "resMagic" } as const;
type AttrName = keyof typeof ATTRIBUTES;
const ATTRIBUTE_TEXT: Record<AttrName, number> = { strength: 358, intelligence: 359, personality: 360, endurance: 361, speed: 362, luck: 363, accuracy: 364, res_acid: 382, res_ice: 383, res_fire: 384, res_magic: 385 };

/** Old texts are wrapped by hand for the old scroll; real paragraph breaks stay, single breaks become spaces. */
export function tidy(text: string): string {
  return text.replace(/\\n/g, "\n").replace(/([^\n])\n(?!\n)/g, "$1 ").replace(/ {2,}/g, " ").trim();
}

/** Text by id (up to three characters) or literal text, like the old `len(x) > 3` rule. */
export function textOf(value: unknown, fallbackId?: number): string {
  const s = value === undefined || value === null ? "" : String(value);
  if (s.length > 3) return s;
  if (s.length > 0 && /^\d+$/.test(s)) return TEXTS[Number(s)] ?? s;
  if (s.length > 0) return s;
  return fallbackId === undefined ? "" : (TEXTS[fallbackId] ?? "");
}

const str = (ax: Record<string, unknown>, key: string): string => {
  const v = ax[key];
  return v === undefined || v === null ? "" : String(v).trim();
};
const int = (ax: Record<string, unknown>, key: string, fallback = 0): number => {
  const s = str(ax, key);
  if (s === "") return fallback;
  const n = Number(s);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
};
const flag = (ax: Record<string, unknown>, key: string): boolean => {
  const v = ax[key];
  return v === true || (typeof v === "string" && v.length > 0 && v.toLowerCase() !== "false" && v !== "0");
};

/** Hint texts contain `{riddle_q3}` and `{riddle_a3}` for the party's password riddles. */
export function fillPlaceholders(text: string, progress: CampaignProgress): string {
  const riddle = (n: number, part: "question" | "answer"): string | null => {
    const id = progress.passwords[n];
    return id === undefined ? null : (RIDDLES_MASTER[id]?.[part] ?? null);
  };
  return text.replace(/\{riddle_q(\d+)\}/g, (m, n: string) => riddle(Number(n), "question") ?? m).replace(/\{riddle_a(\d+)\}/g, (m, n: string) => riddle(Number(n), "answer") ?? m);
}

// ---------------------------------------------------------------- party helpers

function allItems(party: Party): Item[] {
  return carriedItems(party);
}

export function countItems(party: Party, type: string): number {
  return type ? allItems(party).filter((i) => i.type === type).length : 0;
}

export function hasItem(party: Party, type: string): boolean {
  return countItems(party, type) > 0;
}

/** Removes up to `limit` items of a type (all of them when limit is omitted); returns how many went. */
export function removeItems(party: Party, type: string, limit = Infinity): number {
  let removed = 0;
  for (const bag of [...party.characters.map((c) => c.inventory), ...(party.mascot === "Donkey" ? [party.mascotBag] : [])]) {
    for (const [slot, item] of Object.entries(bag)) {
      if (removed >= limit) return removed;
      if (item && item.type === type) {
        bag[slot] = null;
        removed++;
      }
    }
  }
  return removed;
}

/** The item behind an item type of the old game: a quest item or `spell_<id>` for a scroll. */
export function itemFromType(type: string): Item | null {
  if (type.startsWith("spell_")) {
    const id = Number(type.slice(6));
    return Number.isFinite(id) ? spellScroll(id) : null;
  }
  return questItem(type);
}

export function changeAttribute(party: Party, index: number, name: string, delta: number, relative = true): void {
  const key = ATTRIBUTES[name as AttrName];
  const c = party.characters[index];
  if (!key || !c) return;
  c[key] = relative ? c[key] + delta : delta;
  recalcValues(c, party.talents, false, party.mascot);
}

/** The party's talent list after buying: attribute-changing talents recalculate everyone. */
function grantTalents(party: Party, names: string[]): void {
  let recalc = false;
  for (const n of names) {
    if (!party.talents.includes(n)) party.talents.push(n);
    if ((TALENTS[n] as { recalc_attribute_values?: boolean } | undefined)?.recalc_attribute_values) recalc = true;
  }
  if (recalc) for (const c of party.characters) recalcValues(c, party.talents, false, party.mascot);
}

/** Port of apply_trap_damage: resistance, protection and armour; the Ninja sometimes slips away. */
export function trapDamageTo(host: CampaignHost, index: number, damage: number, type: string): { applied: number; conditions: string[] } {
  const party = host.party;
  const c = party.characters[index]!;
  const kinds = ["acid", "fire", "ice", "magic", "physical"];
  let t = type.toLowerCase();
  if (!kinds.includes(t) && !["crazy", "cursed", "diseased", "petrified", "rotten", "dead", "age"].includes(t)) t = kinds[host.rng.int(kinds.length)]!;
  let total = damage;
  const protection = (element: "acid" | "fire" | "ice" | "magic") => party.effects.filter((e) => e.kind === "protection" && e.element === element && e.until > party.minutes).reduce((s, e) => s + (e.amount ?? 0), 0);
  const elemental = (res: number, element: "acid" | "fire" | "ice" | "magic") => {
    let v = Math.round(total * (1 - res / 100)) - protection(element);
    if (party.mascot === "Fairy") v -= 20;
    return Math.max(0, v);
  };
  let special: string | null = null;
  switch (t) {
    case "acid":
      total = elemental(c.resAcid, "acid");
      break;
    case "fire":
      total = elemental(c.resFire, "fire");
      break;
    case "ice":
      total = elemental(c.resIce, "ice");
      break;
    case "magic":
      total = elemental(c.resMagic, "magic");
      break;
    case "crazy":
    case "cursed":
    case "diseased":
    case "petrified":
    case "rotten":
      special = t[0]!.toUpperCase() + t.slice(1);
      total = Math.max(0, total - armorOf(c));
      break;
    case "dead":
      special = "Dead";
      total = c.hp;
      break;
    default:
      total = Math.max(0, total - armorOf(c));
  }
  if (c.classType === "Ninja" && host.rng.float() < 0.1) total = 0;
  const hit = applyHit(party, index, total, null, host.rng, special !== null);
  const conditions = hit.conditions.map(String);
  if (special && isAlive(c) && !c.conditions.includes(special as never)) {
    c.conditions = c.conditions.filter((x) => x !== "Healthy");
    c.conditions.push(special as never);
    conditions.push(special);
  }
  if (total > 0) host.port.hurt(index);
  return { applied: total, conditions };
}

function armorOf(c: Party["characters"][number]): number {
  let sum = 0;
  for (const item of Object.values(c.inventory)) sum += item && item.bonus ? ((item.bonus as Record<string, number>).arm ?? 0) : 0;
  return sum;
}

// ---------------------------------------------------------------- the engine

const SOUND = { click: 9001, paper: 9009, coin: 9000, attribute: 9003, wall: 9007, denied: 9014, quest: 9018, treasure: 9020, gate: 9034, door: 9052, teleport: 9041 } as const;

/** Every action id the campaign maps use. A test checks that the maps contain nothing else. */
export const CAMPAIGN_ACTION_IDS: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 36, 37, 40, 42, 43, 44, 45, 46, 48, 49, 50, 51, 53, 9032, 9033, 9034, 9035, 9039, 9041, 9047];

export class LegacyEngine {
  constructor(private readonly host: CampaignHost) {}

  private get map(): CampaignMapModel {
    return this.host.map;
  }
  private get ui(): CampaignUi {
    return this.host.ui;
  }
  private get party(): Party {
    return this.host.party;
  }
  private get progress(): CampaignProgress {
    return this.host.progress;
  }

  /** `raw` keeps the line breaks (lists of rewards); the hand-wrapped texts of the old game get tidied. */
  private async say(text: string, sound: number | null = SOUND.paper, raw = false): Promise<void> {
    if (sound !== null) this.ui.sound(sound);
    const filled = fillPlaceholders(text, this.progress);
    await this.ui.message(raw ? filled.trim() : tidy(filled));
  }

  private async ask(text: string): Promise<boolean> {
    this.ui.sound(SOUND.paper);
    return this.ui.confirm(tidy(fillPlaceholders(text, this.progress)));
  }

  /** The party stepped on or bumped into the cell: run its action. */
  async activate(x: number, y: number): Promise<void> {
    const cell = this.map.get(x, y);
    if (!cell || cell.a === undefined) return;
    await this.run(cell.a, x, y);
  }

  /** Another action fires the action on a cell (levers, counters, riddles). Passive actions never ask anything. */
  async trigger(xy: unknown): Promise<void> {
    const at = parseXY(xy);
    if (!at) return;
    const cell = this.map.get(at.x, at.y);
    if (!cell || cell.a === undefined) return;
    await this.run(cell.a, at.x, at.y, true);
  }

  private async triggerAll(ax: Record<string, unknown>, prefix: string, max: number): Promise<void> {
    for (let i = 1; i <= max; i++) await this.trigger(ax[`${prefix}${i}`]);
  }

  private async run(id: number, x: number, y: number, remote = false): Promise<void> {
    const cell = this.map.get(x, y)!;
    const ax = cell.ax ?? {};
    switch (id) {
      case 1: case 2: case 3: case 4: case 5: case 6: case 7:
        // a shop without a level takes it from the party (the old game: average level below 8 is 1, below 18 is 2, and so on)
        await this.host.port.openService(SERVICES[id - 1]!, serviceLevel(this.party, cell.ap));
        return;
      case 8: return this.breakWall(x, y, ax);
      case 11: return this.mapTransfer(ax);
      case 12: return this.findItem(x, y, ax);
      case 13: return this.mascot(ax);
      case 14: return this.openDoor(x, y);
      case 15: return this.buyTalent(ax);
      case 16: case 18: return this.gate(x, y, ax, id === 16 ? "down" : "up");
      case 17: case 24: return this.springOrGuillotine(x, y, ax, id);
      case 19: return this.work();
      case 20: return this.questReturn(ax);
      case 21: return this.treasure(x, y, ax);
      case 22: return this.passwordRiddle(x, y, ax);
      case 23: return this.pitTrap(x, y, ax);
      case 25: return this.say(textOf(str(ax, "text_id") || "388", 388));
      case 26: this.map.removeAction(x, y); this.host.port.changed(); return;
      case 27: return this.teleportAction(x, y, ax);
      case 28: return this.portal(ax);
      case 29: return this.trade(x, y, ax);
      case 30: return this.genericTrap(x, y, ax);
      case 31: return this.lever(x, y, ax);
      case 36: return this.elementalProtection(ax);
      case 37: return this.questCheck(x, y, ax);
      case 40: return this.counter(x, y, ax);
      case 42: return this.riddleTrigger(x, y, ax);
      case 43: return this.buyTrigger(x, y, ax);
      case 44: return this.groupAttribute(x, y, ax);
      case 45: return this.multiState(x, y, ax);
      case 46: return this.teleportOnItems(x, y, ax);
      case 48: return this.talentTrigger(x, y, ax);
      case 49: return this.removeEvents(ax);
      case 50: return this.stealGold(ax);
      case 51: return this.endlessExit();
      case 53: return this.throne(x, y, ax);
      case 9032: return this.multiDoor(ax);
      case 9033: return this.multiTrap(ax);
      case 9034: return this.spawn(x, y, ax);
      case 9035: await this.triggerAll(ax, "xy_action", 8); return;
      case 9039: return this.copyMove(ax);
      case 9041: { const s = int(ax, "sound_id"); if (s) this.ui.sound(s); return; }
      case 9047: return this.rotationCheck(ax);
      default:
        if (!remote) this.ui.log(`This place holds a mystery the old game never finished (action ${id}).`, "info");
    }
  }

  // ------------------------------------------------------------ map changes

  private async breakWall(x: number, y: number, ax: Record<string, unknown>): Promise<void> {
    if (!this.party.talents.includes("talent_perceptive")) return;
    const replacement = int(ax, "replacement_block");
    const target = parseXYParts(ax, "block_target_x", "block_target_y") ?? { x, y };
    if (this.map.get(target.x, target.y)?.b === replacement) return;
    if (!(await this.ask(TEXTS[1]!))) return;
    this.ui.sound(SOUND.wall);
    const rot = this.map.get(target.x, target.y)?.br ?? 0;
    this.map.setBlock(target.x, target.y, replacement, rot);
    this.map.removeAction(target.x, target.y);
    this.host.port.changed();
  }

  private async openDoor(x: number, y: number): Promise<void> {
    if (!(await this.ask(TEXTS[81]!))) return;
    this.ui.sound(SOUND.door);
    const rot = this.map.get(x, y)?.br ?? 0;
    this.map.setBlock(x, y, BLOCK_OPEN_DOOR, rot);
    this.map.removeAction(x, y);
    this.host.port.changed();
  }

  /**
   * Opens the gate on a cell: the action and the gate item go away. The old game showed a copy of the gate (item 80 for
   * the one that drops, 81 for the one that rises, whatever stood on the cell) sliding out of the way.
   */
  private openGateAt(x: number, y: number, direction: GateDirection): void {
    const rotation = this.map.get(x, y)?.ir ?? 0;
    this.map.removeAction(x, y);
    this.map.removeItem(x, y);
    this.host.port.gate(direction === "down" ? 80 : 81, x, y, rotation, direction);
    this.host.port.changed();
  }

  private async gate(x: number, y: number, ax: Record<string, unknown>, direction: GateDirection): Promise<void> {
    const required = str(ax, "required_item_type");
    const question = textOf(str(ax, "text_id"), 302);
    if (required && !hasItem(this.party, required)) {
      await this.say(TEXTS[370]!);
      return;
    }
    if (!(await this.ask(question))) return;
    if (required && flag(ax, "remove_item")) removeItems(this.party, required, 1);
    this.ui.sound(int(ax, "sound_id", SOUND.gate));
    this.openGateAt(x, y, direction);
  }

  private async multiDoor(ax: Record<string, unknown>): Promise<void> {
    this.ui.sound(SOUND.gate);
    for (let i = 1; i <= 6; i++) {
      const at = parseXY(ax[`xy_door${i}`]);
      if (at) this.openGateAt(at.x, at.y, "up");
    }
  }

  private async multiTrap(ax: Record<string, unknown>): Promise<void> {
    const kind = int(ax, "trap_type");
    const action = kind === 1 ? 23 : kind === 2 ? 17 : null;
    if (action === null) return;
    for (let i = 1; i <= 6; i++) {
      const at = parseXY(ax[`xy_trap${i}`]);
      if (at) this.map.setAction(at.x, at.y, action, undefined, { damage: str(ax, "damage"), rotation: "0" });
    }
    this.host.port.changed();
  }

  private async spawn(x: number, y: number, ax: Record<string, unknown>): Promise<void> {
    const s = int(ax, "spawning_sound");
    if (s) this.ui.sound(s);
    const id = int(ax, "monster_id");
    if (id < 1) return;
    const at = parseXYParts(ax, "spawn_x", "spawn_y") ?? { x, y };
    if (this.map.get(at.x, at.y)?.m !== undefined) return;
    const rot = int(ax, "spawn_rotation");
    this.map.setMonster(at.x, at.y, id, rot);
    this.host.port.addMonster(at.x, at.y, id, rot);
  }

  private async copyMove(ax: Record<string, unknown>): Promise<void> {
    const src = parseXY(ax.source_coordinates);
    const dst = parseXY(ax.target_coordinates);
    if (!src || !dst) return;
    const copy = str(ax, "move_copy").toLowerCase() === "copy";
    let type = str(ax, "type").toLowerCase() || "all";
    if (!["action", "block", "item", "monster", "all"].includes(type)) type = "all";
    const from = this.map.get(src.x, src.y) ?? {};
    if (type === "action" || type === "all") {
      this.map.removeAction(dst.x, dst.y);
      if (from.a !== undefined) {
        this.map.setAction(dst.x, dst.y, from.a, from.ap, from.ax);
        if (!copy) this.map.removeAction(src.x, src.y);
      }
    }
    if (type === "item" || type === "all") {
      this.map.removeItem(dst.x, dst.y);
      if (from.i !== undefined) {
        this.map.setItem(dst.x, dst.y, from.i, from.ir ?? 0);
        if (!copy) this.map.removeItem(src.x, src.y);
      }
    }
    if (type === "block" || type === "all") {
      this.map.removeBlock(dst.x, dst.y);
      if (from.b !== undefined) {
        this.map.setBlock(dst.x, dst.y, from.b, from.br ?? 0);
        if (!copy) this.map.removeBlock(src.x, src.y);
      }
    }
    this.host.port.changed();
  }

  // ------------------------------------------------------------ travel

  private teleportAction(x: number, y: number, ax: Record<string, unknown>): Promise<void> | void {
    const to = { x: int(ax, "tele_x", x), y: int(ax, "tele_y", y) };
    this.ui.sound(int(ax, "sound_id", SOUND.teleport));
    this.host.port.teleport(to.x, to.y, int(ax, "tele_rotation", 0));
  }

  private async mapTransfer(ax: Record<string, unknown>): Promise<void> {
    const mapToLoad = str(ax, "map_to_load");
    if (!mapToLoad) return;
    const destination = mapSlugOf(mapToLoad);
    const notEligible = str(ax, "txt_id_not_eligible");
    let allowed = true;
    if (notEligible.length > 0) {
      allowed = false;
      // the old code asked its map cache, which holds the maps the party has left: whoever has been there may return
      if (this.progress.left.includes(destination)) allowed = true;
      else {
        const talent = str(ax, "required_talent");
        if (talent) allowed = this.party.talents.includes(talent);
        else {
          const itemType = str(ax, "required_item_type") || str(ax, "req_item_id");
          if (itemType && hasItem(this.party, itemType)) {
            allowed = true;
            if ((str(ax, "remove_item") || str(ax, "txt_remove_item")).toLowerCase().startsWith("y")) removeItems(this.party, itemType, 1);
          }
        }
      }
    }
    if (!allowed) {
      await this.say(textOf(notEligible), null);
      return;
    }
    if (!(await this.ask(textOf(str(ax, "txt_id_eligible"), 387)))) return;
    if (!this.progress.left.includes(this.map.slug)) this.progress.left.push(this.map.slug);
    await this.host.port.transfer(destination, int(ax, "start_x"), int(ax, "start_y"), int(ax, "start_direction"));
  }

  private async portal(ax: Record<string, unknown>): Promise<void> {
    const nameId = str(ax, "txt_id_map_name");
    const mapToLoad = str(ax, "map_to_load");
    if (!nameId) return;
    if (!this.progress.portals[nameId]) {
      this.progress.portals[nameId] = { map: mapToLoad, x: int(ax, "portal_x"), y: int(ax, "portal_y"), rot: int(ax, "portal_rotation") };
    }
    this.ui.sound(SOUND.paper);
    const options = Object.keys(this.progress.portals).slice(0, 12).map((k) => ({ label: textOf(k), value: k }));
    const choice = await this.ui.pickPortal(TEXTS[412]!, options);
    if (choice === null) return;
    const p = this.progress.portals[choice];
    if (!p) return;
    this.ui.sound(SOUND.teleport);
    await this.host.port.transfer(mapSlugOf(p.map), p.x, p.y, p.rot);
  }

  private async endlessExit(): Promise<void> {
    await this.say(TEXTS[482]!, null);
  }

  // ------------------------------------------------------------ items, quests and rewards

  private async findItem(x: number, y: number, ax: Record<string, unknown>): Promise<void> {
    const type = str(ax, "item_id");
    if (!type) return;
    const item = itemFromType(type);
    if (!item) return;
    const message = textOf(str(ax, "text_id")) || `${type.startsWith("spell_") ? TEXTS[114] : TEXTS[4]}${item.name.trim()}`;
    if (!giveItem(this.party, item)) {
      await this.say(TEXTS[44]!);
      return;
    }
    this.map.removeAction(x, y);
    // the editor's label: "Remove item after use (blank=yes)". The old code read any text as "keep it", so the "yes" that the author
    // typed on the black key card outside left it lying there; here "no" (or "n", "false", "0") is the only way to keep the item
    if (!["no", "n", "false", "0"].includes(str(ax, "remove_item").toLowerCase())) this.map.removeItem(x, y);
    this.host.port.changed();
    this.ui.sound(SOUND.quest);
    await this.say(message, null);
  }

  private async mascot(ax: Record<string, unknown>): Promise<void> {
    const name = capitalize(str(ax, "mascot_name"));
    if (!name) return;
    if (flag(ax, "new_mascot") && !this.progress.mascots.includes(name)) this.progress.mascots.push(name);
    if (this.party.mascot !== name && this.progress.mascots.includes(name)) {
      if (await this.ask(textOf(str(ax, "text_id"), 470))) {
        this.ui.sound(SOUND.click);
        setMascot(this.party, name);
        this.host.port.changed();
      }
    }
  }

  private async buyTalent(ax: Record<string, unknown>): Promise<void> {
    const name = str(ax, "talent_name");
    const intro = textOf(str(ax, "text_id"));
    if (name === "all") {
      const names = Object.keys(TALENTS).filter((n) => n.startsWith("talent"));
      const price = names.reduce((s, n) => s + Number(TALENTS[n]!.price), 0);
      if (price > 0 && !(await this.ask(TEXTS[476]!.replace("{value}", String(price))))) return;
      return this.payTalents(names, price, intro);
    }
    const talent = TALENTS[name];
    if (!talent) return;
    const price = Number(talent.price);
    if (price > 0) {
      const question = `${intro}${TEXTS[335]}${talentInfo(name).name}${TEXTS[336]}${price}${TEXTS[337]}`;
      if (!(await this.ask(question))) return;
    }
    return this.payTalents([name], price, intro);
  }

  private async payTalents(names: string[], price: number, intro: string): Promise<void> {
    if (price > 0) {
      if (this.party.gold < price) {
        this.ui.sound(SOUND.denied);
        await this.say("You cannot afford that.", null);
        return;
      }
      this.ui.sound(SOUND.coin);
      this.party.gold -= price;
      grantTalents(this.party, names);
      this.host.port.refresh();
      return;
    }
    grantTalents(this.party, names);
    this.host.port.refresh();
    await this.say(intro || TEXTS[388]!);
  }

  private async work(): Promise<void> {
    if (!(await this.ask(TEXTS[343]!))) return;
    this.party.gold += 100;
    // ten days of work: poison and disease that nobody cured have run their time by then
    for (const e of advanceTime(this.party, 10 * 1440).conditions) this.ui.log(conditionEventText(this.party.characters[e.character]!.name, e), e.outcome === "died" ? "bad" : "info");
    this.host.port.checkDefeat();
    this.ui.sound(SOUND.coin);
    this.host.port.refresh();
  }

  private async elementalProtection(ax: Record<string, unknown>): Promise<void> {
    const levels: [string, "acid" | "fire" | "ice" | "magic"][] = [["acid_res_level", "acid"], ["fire_res_level", "fire"], ["ice_res_level", "ice"], ["magic_res_level", "magic"]];
    for (const [key, element] of levels) {
      const amount = int(ax, key);
      if (amount > 0) addEffect(this.party, { kind: "protection", until: this.party.minutes + 360, element, amount });
    }
    this.ui.sound(9047);
    const message = textOf(str(ax, "txt_id"));
    if (message) await this.say(message, null);
  }

  private async groupAttribute(x: number, y: number, ax: Record<string, unknown>): Promise<void> {
    if (!(await this.ask(textOf(str(ax, "txt_id"), 471)))) return;
    const attribute = str(ax, "reward_attribute");
    if (!(attribute in ATTRIBUTES)) return;
    const value = int(ax, "reward_attribute_value");
    const max = int(ax, "reward_attribute_max");
    const key = ATTRIBUTES[attribute as AttrName];
    this.party.characters.forEach((c, i) => {
      let gain = value;
      if (max > 0) gain = Math.min(value, Math.max(0, max - c[key]));
      if (gain > 0) changeAttribute(this.party, i, attribute, gain);
    });
    this.ui.sound(SOUND.attribute);
    this.map.removeAction(x, y);
    this.host.port.changed();
    this.host.port.refresh();
    const after = textOf(str(ax, "txt_after_action2"));
    if (after) await this.say(after, null);
  }

  private async throne(x: number, y: number, ax: Record<string, unknown>): Promise<void> {
    const who = await this.ui.pickCharacter(textOf(str(ax, "txt_id"), 483));
    if (who === null) return;
    const c = this.party.characters[who]!;
    for (const a of ["strength", "intelligence", "personality", "endurance", "speed", "luck", "accuracy"]) changeAttribute(this.party, who, a, 3, false);
    levelUp(c, this.party.talents, 20, this.party.mascot);
    this.host.port.refresh();
    await this.say(textOf(str(ax, "txt_after_action2"), 484), null);
    void x;
    void y;
  }

  private async trade(x: number, y: number, ax: Record<string, unknown>): Promise<void> {
    const who = await this.ui.pickCharacter(textOf(str(ax, "txt_id_trade")));
    if (who === null) return;
    const type = str(ax, "req_quest_item_type");
    if (!hasItem(this.party, type)) {
      await this.say(textOf(str(ax, "txt_id_no_trade"), 405));
      return;
    }
    const removed = removeItems(this.party, type, str(ax, "trade_all") ? Infinity : 1);
    const attribute = str(ax, "reward_attribute");
    if (attribute in ATTRIBUTES) {
      const value = int(ax, "reward_attribute_value");
      for (let i = 0; i < removed; i++) changeAttribute(this.party, who, attribute, value);
      this.host.port.refresh();
      await this.say(TEXTS[ATTRIBUTE_TEXT[attribute as AttrName]]!.replace("{value}", String(value)));
    }
    void x;
    void y;
  }

  private async questReturn(ax: Record<string, unknown>): Promise<void> {
    const name = textOf(str(ax, "txt_id_quest_name"));
    const initial = textOf(str(ax, "txt_id_initial"));
    const inProgress = textOf(str(ax, "txt_id_in_progress"));
    const completedText = textOf(str(ax, "txt_id_completed"));
    const types = [str(ax, "req_quest_item_type"), str(ax, "req_quest_item_type2"), str(ax, "req_quest_item_type3")].filter(Boolean);
    const amount = int(ax, "return_amount", 1) || 1;
    const repeatable = flag(ax, "quest_repeatable");
    const q = this.progress.quests;
    if (!(name in q.active) && !(name in q.completed)) {
      if (await this.ask(initial)) q.active[name] = { returned: 0 };
      return;
    }
    if (name in q.completed && !repeatable) {
      await this.say(completedText);
      return;
    }
    if (!types.every((t) => countItems(this.party, t) >= amount)) {
      await this.say(inProgress);
      return;
    }
    let counted = 0;
    for (const t of types) {
      removeItems(this.party, t, amount);
      counted += amount;
    }
    let reward = TEXTS[456]!;
    const gold = int(ax, "reward_gold") * counted;
    if (gold > 0) {
      this.party.gold += gold;
      reward += `\n- ${thousands(gold)} ${TEXTS[69]}`;
    }
    const xp = int(ax, "reward_xp") * counted;
    if (xp > 0) {
      addXp(this.party, xp);
      reward += `\n- ${xp} ${TEXTS[458]}`;
    }
    const level = int(ax, "reward_treasure_level");
    const count = int(ax, "reward_amount") * counted;
    if (level > 0 && count > 0) {
      for (let i = 0; i < count; i++) if (!giveItem(this.party, generateItem(this.host.rng, level))) break;
      reward += `\n- ${TEXTS[457]}`;
    }
    if (!(name in q.completed)) {
      this.ui.sound(SOUND.quest);
      q.completed[name] = q.active[name] ?? {};
      delete q.active[name];
    }
    this.host.port.refresh();
    await this.say(`${tidy(completedText)}\n${reward}`, null, true);
  }

  private async questCheck(x: number, y: number, ax: Record<string, unknown>): Promise<void> {
    const q = this.progress.quests;
    const title = textOf(str(ax, "quest_title_check"));
    const checkActive = str(ax, "active_quest") === "" ;
    const next = textOf(str(ax, "txt_id_next_quest"));
    const inactive = textOf(str(ax, "txt_id_quest_inactive"));
    const completedText = textOf(str(ax, "txt_id_completed"));
    const inProgress = next.length === 0 ? completedText : textOf(str(ax, "txt_id_in_progress"));
    const found = (checkActive && title in q.active) || (!checkActive && title in q.completed);
    if (found) {
      if (next) q.active[next] = {};
      if (checkActive) {
        q.completed[title] = q.active[title] ?? {};
        delete q.active[title];
      }
      let message = inProgress;
      const rewardType = str(ax, "reward_item_id");
      if (rewardType) {
        const item = itemFromType(rewardType);
        if (item) {
          message += `${TEXTS[456]} ${item.name.trim()}`;
          giveItem(this.party, item);
        }
      }
      this.ui.sound(SOUND.quest);
      await this.trigger(ax.xy_action);
      if (!checkActive) this.map.setActionParam(x, y, "active_quest", null);
      this.host.port.refresh();
      await this.say(message, null);
    } else if (next && next in q.active) await this.say(inProgress);
    else if (checkActive && title in q.completed) await this.say(completedText);
    else if (title.length === 0 && !(next in q.completed)) {
      await this.say(inProgress);
      if (next) q.active[next] = {};
    } else if (title.length === 0 && next in q.completed) await this.say(completedText);
    else await this.say(inactive);
  }

  // ------------------------------------------------------------ treasure

  private async treasure(x: number, y: number, ax: Record<string, unknown>): Promise<void> {
    const question = textOf(str(ax, "text_id"), 354);
    const who = await this.ui.pickCharacter(question);
    if (who === null) return;
    this.ui.sound(SOUND.click);
    const c = this.party.characters[who]!;
    const minThievery = int(ax, "min_thievery");
    const trapYes = str(ax, "trap_yn").length > 0;
    let message = "";
    let sfx: number | null = null;
    let trapTriggered = false;
    let locked = false;
    if (minThievery > 0) {
      const roll = thieveryRoll(c, this.host.rng);
      if (roll >= minThievery) locked = false;
      else {
        locked = true;
        if (roll < minThievery / 2) {
          trapTriggered = true;
          message = TEXTS[366]!.replace("{character}", c.name);
        } else message = TEXTS[365]!.replace("{character}", c.name);
      }
    }
    if (trapYes || trapTriggered) {
      trapDamageTo(this.host, who, int(ax, "trap_damage", 10) || 10, str(ax, "trap_damage_type") || "physical");
      if (trapYes) locked = false;
    }
    if (!locked) {
      const attribute = str(ax, "reward_attribute");
      if (attribute) {
        const value = int(ax, "reward_attribute_value");
        if (attribute in ATTRIBUTES) changeAttribute(this.party, who, attribute, value);
        message += `${(TEXTS[ATTRIBUTE_TEXT[attribute as AttrName] ?? 356] ?? "").replace("{value}", String(value))}\n`;
        sfx = SOUND.attribute;
      }
      const gold = int(ax, "reward_gold");
      if (gold > 0) {
        this.party.gold += gold;
        message += `${thousands(gold)} ${TEXTS[306]}\n`;
        sfx = SOUND.coin;
      }
      const xp = int(ax, "reward_xp");
      if (xp > 0) {
        c.xp += xp;
        message += `${xp} ${TEXTS[357]}\n`;
        sfx = SOUND.attribute;
      }
      const level = int(ax, "reward_treasure_level");
      const amount = int(ax, "reward_amount");
      if (level > 0 && amount > 0) {
        let found = "";
        let n = 0;
        for (let i = 0; i < amount; i++) {
          const item = generateItem(this.host.rng, level);
          if (giveItem(this.party, item)) {
            n++;
            if (n < 5) found += `${item.name.trim()}\n`;
            else if (n === 5) found += TEXTS[8];
          } else {
            found += TEXTS[5];
            break;
          }
        }
        message += found;
        sfx = SOUND.treasure;
      }
      const rewardType = str(ax, "reward_item_id");
      if (rewardType) {
        const item = itemFromType(rewardType);
        if (item) {
          message += rewardType.startsWith("spell_") ? `${TEXTS[114]}${item.name.trim()}` : item.name.trim();
          const copies = Math.max(1, amount);
          if (amount > 1) message += ` (${amount})`;
          message += "\n";
          for (let i = 0; i < copies; i++) giveItem(this.party, { ...item, id: "" });
          sfx = SOUND.quest;
        }
      }
      const levels = int(ax, "reward_level_up");
      if (levels > 0) {
        levelUp(c, this.party.talents, levels, this.party.mascot);
        message += `${TEXTS[386]!.replace("{value}", String(levels))}\n`;
        sfx = SOUND.attribute;
      }
      this.map.removeAction(x, y);
      const replacement = str(ax, "replacement_item");
      if (replacement) {
        if (replacement.toLowerCase() === "none") this.map.removeItem(x, y);
        else this.map.setItem(x, y, Number(replacement), this.map.get(x, y)?.ir ?? 0);
      }
      this.host.port.changed();
      this.host.port.refresh();
      await this.trigger(ax.xy_action);
    }
    this.host.port.checkDefeat();
    const after = textOf(str(ax, "txt_after_search"));
    if (after) await this.say(after, null);
    else if (message.length > 0) {
      if (sfx !== null) this.ui.sound(sfx);
      const lines = message.split("\n").filter((l, i, a) => l.length > 0 || i < a.length - 1);
      const trimmed = lines.length > 6 ? `${lines.slice(0, 5).join("\n")}\n${TEXTS[8]}` : message;
      await this.say(`${TEXTS[451]}${trimmed}`, null, true);
    } else if (trapYes) {
      const t = str(ax, "trap_damage_type").toLowerCase();
      await this.say(TEXTS[({ acid: 432, fire: 433, ice: 434, magic: 435 } as Record<string, number>)[t] ?? 436]!, null);
    } else await this.say(TEXTS[374]!, null);
  }

  // ------------------------------------------------------------ traps

  private reloading(x: number, y: number): boolean {
    const now = this.host.port.steps();
    if (trapReloading(this.progress, this.map.slug, x, y, now)) return true;
    this.progress.trapped[`${this.map.slug}:${x},${y}`] = now;
    return false;
  }

  private hurtAll(damage: number): void {
    this.party.characters.forEach((c, i) => {
      if (!isAlive(c)) return;
      applyHit(this.party, i, damage, null, this.host.rng);
      this.host.port.hurt(i);
    });
    this.host.port.checkDefeat();
    this.host.port.refresh();
  }

  private async springOrGuillotine(x: number, y: number, ax: Record<string, unknown>, id: number): Promise<void> {
    if (this.reloading(x, y)) return;
    this.hurtAll(int(ax, "damage", 10) || 10);
    this.ui.sound(id === 17 ? 9036 : 9042);
    this.ui.log(id === 17 ? "A spear shoots out of the floor!" : "A blade swings out of the wall!", "bad");
    this.host.port.trap(id === 17 ? "spear" : "guillotine", x, y, trapRotation(ax));
  }

  private async pitTrap(x: number, y: number, ax: Record<string, unknown>): Promise<void> {
    if (hasEffect(this.party, "levitate")) return;
    if (this.map.get(x, y)?.b !== BLOCK_PIT) {
      this.ui.sound(SOUND.wall);
      this.map.setBlock(x, y, BLOCK_PIT, this.map.get(x, y)?.br ?? 0);
      this.host.port.changed();
    }
    this.hurtAll(int(ax, "damage", 10) || 10);
    this.ui.log("You fall into a pit!", "bad");
  }

  private async genericTrap(x: number, y: number, ax: Record<string, unknown>): Promise<void> {
    void x;
    void y;
    const type = str(ax, "trap_damage_type") || ["fire", "ice", "acid", "magic"][this.host.rng.int(4)]!;
    const damage = int(ax, "trap_damage", 10) || 10;
    this.party.characters.forEach((c, i) => {
      if (isAlive(c)) trapDamageTo(this.host, i, damage, type);
    });
    this.ui.log("You trigger a trap!", "bad");
    this.host.port.checkDefeat();
    this.host.port.refresh();
  }

  private async stealGold(ax: Record<string, unknown>): Promise<void> {
    const s = int(ax, "sound_id");
    if (s) this.ui.sound(s);
    this.party.gold = Math.max(0, this.party.gold - Math.max(0, int(ax, "gold_steal")));
    const message = textOf(str(ax, "txt_id"));
    this.host.port.refresh();
    if (message) await this.say(message, null);
  }

  // ------------------------------------------------------------ levers, riddles and puzzles

  private async lever(x: number, y: number, ax: Record<string, unknown>): Promise<void> {
    const before = textOf(str(ax, "txt_before_switch"));
    const after = textOf(str(ax, "txt_after_switch"));
    if (before.length === 0) {
      await this.say(after);
      return;
    }
    if (!(await this.ask(before))) return;
    this.map.setActionParam(x, y, "txt_before_switch", "");
    this.map.rotateItem(x, y, (((this.map.get(x, y)?.ir ?? 0) + 180) % 360));
    this.host.port.changed();
    await this.triggerAll(ax, "xy_action", 4);
  }

  private async counter(x: number, y: number, ax: Record<string, unknown>): Promise<void> {
    const id = str(ax, "counter_id");
    const target = int(ax, "target_value");
    const repeatable = str(ax, "repeatable").length > 0;
    const executed = "already_executed" in ax;
    const before = textOf(str(ax, "txt_before_action"));
    const after = textOf(str(ax, "txt_after_action"));
    const value = this.progress.counters[id];
    if (value !== undefined && (value >= target || (executed && !repeatable))) {
      await this.say(after);
      return;
    }
    if (!(await this.ask(before))) return;
    if (!str(ax, "xy_action")) return;
    await this.trigger(ax.xy_action);
    this.map.setActionParam(x, y, "already_executed", true);
    const next = (this.progress.counters[id] ?? 0) + (int(ax, "increment", 1) || 1);
    this.progress.counters[id] = next;
    if (next >= target) {
      const at = parseXY(ax.target_action);
      if (at && this.map.get(at.x, at.y)?.a !== undefined) {
        await this.trigger(ax.target_action);
        delete this.progress.counters[id];
      }
    }
  }

  private async passwordRiddle(x: number, y: number, ax: Record<string, unknown>): Promise<void> {
    const index = int(ax, "riddle_id");
    const master = this.progress.passwords[index] ?? index + 1;
    const riddle = RIDDLES_MASTER[master];
    if (!riddle) return;
    this.ui.sound(SOUND.paper);
    const answer = await this.ui.askText(riddle.question);
    if (answer === null) {
      this.host.port.teleport(int(ax, "abort_tele_x", x), int(ax, "abort_tele_y", y), int(ax, "abort_rotation", 0));
      return;
    }
    if (answer.trim().toLowerCase() === riddle.answer.trim().toLowerCase()) {
      this.ui.sound(SOUND.quest);
      await this.say(TEXTS[372]!, null);
      this.map.removeAction(x, y);
      this.host.port.changed();
    } else {
      this.ui.sound(SOUND.teleport);
      this.host.port.teleport(int(ax, "fail_tele_x", x), int(ax, "fail_tele_y", y), int(ax, "fail_rotation", 0));
    }
  }

  private async riddleTrigger(x: number, y: number, ax: Record<string, unknown>): Promise<void> {
    const id = str(ax, "riddle_id");
    const master = id ? RIDDLES_MASTER[Number(id)] : undefined;
    const question = master?.question ?? textOf(str(ax, "question"));
    const correct = master?.answer ?? str(ax, "answer");
    this.ui.sound(SOUND.paper);
    const answer = await this.ui.askText(tidy(question));
    if (answer === null) {
      this.ui.sound(SOUND.click);
      return;
    }
    if (answer.trim().toLowerCase() !== correct.trim().toLowerCase()) {
      this.ui.sound(SOUND.denied);
      return;
    }
    this.map.removeAction(x, y);
    this.host.port.changed();
    await this.trigger(ax.xy_action1);
    // an action may have been put on this very cell (a chest behind the riddle): run it right away
    const local = this.map.get(x, y);
    if (local?.a !== undefined) await this.run(local.a, x, y);
  }

  private async buyTrigger(x: number, y: number, ax: Record<string, unknown>): Promise<void> {
    const text = textOf(str(ax, "txt_id"));
    if (!text) return;
    if (!(await this.ask(text))) return;
    const cost = str(ax, "gold_cost");
    const itemType = str(ax, "required_item_type");
    const itemAmount = int(ax, "return_amount");
    let ok = false;
    if (cost.length > 0) {
      const gold = Number(cost);
      if (this.party.gold >= gold) {
        this.party.gold -= gold;
        ok = true;
      }
    } else if (itemType && itemAmount > 0 && countItems(this.party, itemType) >= itemAmount) {
      removeItems(this.party, itemType, itemAmount);
      ok = true;
    }
    if (ok) {
      this.host.port.refresh();
      await this.trigger(ax.xy_action1);
    } else {
      this.ui.sound(SOUND.denied);
      const insufficient = textOf(str(ax, "txt_id_insufficient"));
      if (insufficient) await this.say(insufficient, null);
    }
    void x;
    void y;
  }

  private async multiState(x: number, y: number, ax: Record<string, unknown>): Promise<void> {
    if (!(await this.ask(textOf(str(ax, "txt_id"), 471)))) return;
    const s = int(ax, "sound_id");
    if (s) this.ui.sound(s);
    const states: { rotation: number; xy: string }[] = [];
    for (let i = 1; i <= 4; i++) {
      const rotation = str(ax, `state${i}_rotation`);
      const xy = str(ax, `state${i}_xy_action`);
      if (rotation === "" && xy === "") continue;
      if (rotation === "" || xy === "") {
        if (i <= 2) return;
        continue;
      }
      states.push({ rotation: Number(rotation), xy });
    }
    if (states.length === 0) return;
    const current = this.map.get(x, y)?.ir ?? 0;
    let at = states.findIndex((st) => st.rotation === current);
    if (at < 0) at = 0;
    const next = states[(at + 1) % states.length]!;
    this.map.rotateItem(x, y, next.rotation);
    this.host.port.changed();
    await this.trigger(next.xy);
  }

  private async rotationCheck(ax: Record<string, unknown>): Promise<void> {
    let ok = true;
    let any = false;
    for (let i = 1; i <= 6; i++) {
      const at = parseXY(ax[`location_${i}_xy`]);
      const expected = str(ax, `location_${i}_rotation`);
      if (!at || expected === "") {
        if (i > 1) break;
        return;
      }
      any = true;
      const actual = this.map.get(at.x, at.y)?.ir ?? 0;
      if (actual !== Number(expected)) ok = false;
    }
    if (!any) return;
    await this.trigger(ok ? ax.xy_action_success : ax.xy_action_fail);
  }

  private async teleportOnItems(x: number, y: number, ax: Record<string, unknown>): Promise<void> {
    const pairs: { x: number; y: number; item: number }[] = [];
    for (let i = 1; i <= 4; i++) {
      const at = parseXY(ax[`location_${i}_xy`]);
      const item = str(ax, `location_${i}_item_id`);
      if (!at && item === "") continue;
      if (!at || item === "") return;
      pairs.push({ x: at.x, y: at.y, item: Number(item) });
    }
    const to = parseXY(ax.teleport_location);
    if (pairs.length === 0 || !to) return;
    if (!pairs.every((p) => this.map.get(p.x, p.y)?.i === p.item)) return;
    const s = int(ax, "sound_id");
    if (s) this.ui.sound(s);
    this.host.port.teleport(to.x, to.y, int(ax, "tele_rotation", 0));
    void x;
    void y;
  }

  private async talentTrigger(x: number, y: number, ax: Record<string, unknown>): Promise<void> {
    const talent = str(ax, "talent_name");
    if (!talent) return;
    if (this.party.talents.includes(talent)) {
      const from = parseXY(ax.move_from_xy);
      if (from) {
        const cell = this.map.get(from.x, from.y);
        this.map.removeAction(x, y);
        if (cell?.a !== undefined) {
          this.map.setAction(x, y, cell.a, cell.ap, cell.ax);
          this.map.removeAction(from.x, from.y);
          this.host.port.changed();
          await this.run(cell.a, x, y);
        }
        return;
      }
      await this.trigger(ax.xy_action_success);
      return;
    }
    const insufficient = textOf(str(ax, "txt_id_insufficient"));
    if (!insufficient) return;
    const who = await this.ui.pickCharacter(insufficient);
    if (who === null) return;
    trapDamageTo(this.host, who, int(ax, "trap_damage"), str(ax, "trap_damage_type"));
    this.host.port.checkDefeat();
    this.host.port.refresh();
    const after = textOf(str(ax, "txt_after_trap"));
    if (after) await this.say(after, null);
  }

  private async removeEvents(ax: Record<string, unknown>): Promise<void> {
    const pattern = str(ax, "event_to_remove").toLowerCase();
    if (pattern.startsWith("spell")) this.party.effects = [];
    this.host.port.refresh();
    await this.trigger(ax.xy_action);
  }
}

// ---------------------------------------------------------------- small helpers

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1).toLowerCase();
}

function parseXYParts(ax: Record<string, unknown>, kx: string, ky: string): { x: number; y: number } | null {
  const x = str(ax, kx);
  const y = str(ax, ky);
  if (x === "" || y === "") return null;
  const nx = Number(x);
  const ny = Number(y);
  return Number.isFinite(nx) && Number.isFinite(ny) ? { x: nx, y: ny } : null;
}
