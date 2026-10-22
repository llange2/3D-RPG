import type { Rng } from "../core/rng";
import { betterMaterial, generateRing, itemKind, MAX_MATERIAL, MAX_RING_LEVEL, ringLevel } from "./items";
import { giveItem } from "./party";
import { BAG_SLOTS, type Character, type Item, type Party } from "./types";

/**
 * The three spells that work on what a hero carries: Combine (three alike become one better), Duplication and Transform Ring. They only
 * look at the backpack, never at what is worn, and never at quest items.
 */

/** A group of items that Combine takes for the same kind: type and material (rings: the level). */
export interface CombineGroup {
  key: string;
  /** Bag slots holding the items. */
  slots: string[];
  /** One of them, for the label. */
  sample: Item;
}

/** Items Combine, Duplication and Transform Ring may touch at all: no quest items, no scrolls. */
function plain(item: Item | null): item is Item {
  return !!item && !item.quest && item.type !== "spell" && item.type !== "undefined";
}

/** What makes two items "the same kind and material" for Combine; null when the item cannot be combined (no better one exists). */
function combineKey(item: Item): string | null {
  if (item.type === "ring") return ringLevel(item) >= MAX_RING_LEVEL ? null : `ring:${ringLevel(item)}`;
  if (itemKind(item) === null || item.material >= MAX_MATERIAL) return null;
  return `${item.type}:${item.material}`;
}

/** The groups of three or more alike items in the backpack of `c`, in slot order. */
export function combineGroups(c: Character): CombineGroup[] {
  const groups = new Map<string, CombineGroup>();
  for (const slot of BAG_SLOTS) {
    const item = c.inventory[slot] ?? null;
    if (!plain(item)) continue;
    const key = combineKey(item);
    if (!key) continue;
    const g = groups.get(key) ?? { key, slots: [], sample: item };
    g.slots.push(slot);
    groups.set(key, g);
  }
  return [...groups.values()].filter((g) => g.slots.length >= 3);
}

/** Whether three slots hold a valid combination: three items of one group. */
export function canCombine(c: Character, slots: readonly string[]): boolean {
  if (slots.length !== 3 || new Set(slots).size !== 3) return false;
  const items = slots.map((s) => c.inventory[s] ?? null);
  if (!items.every(plain)) return false;
  const keys = items.map((i) => combineKey(i!));
  return keys[0] !== null && keys.every((k) => k === keys[0]);
}

/** Replaces three alike items with one better one in the first of the slots. Returns it, or null when the choice is no valid combination. */
export function combine(c: Character, slots: readonly string[], rng: Rng): Item | null {
  if (!canCombine(c, slots)) return null;
  const made = betterMaterial(rng, c.inventory[slots[0]!]!);
  if (!made) return null;
  made.id = c.inventory[slots[0]!]!.id;
  for (const s of slots) c.inventory[s] = null;
  c.inventory[slots[0]!] = made;
  return made;
}

/** The slots of the backpack whose item Duplication may copy. */
export function duplicableSlots(c: Character): string[] {
  return BAG_SLOTS.filter((s) => plain(c.inventory[s] ?? null));
}

/** The slots of the backpack that hold a ring Transform Ring may change. */
export function ringSlots(c: Character): string[] {
  return BAG_SLOTS.filter((s) => c.inventory[s]?.type === "ring" && !c.inventory[s]!.quest);
}

export type DuplicationResult = "duplicated" | "destroyed" | "nothing" | "no_room";

/** Duplication: one in two copies the item, one in four destroys it, in one case in four nothing happens. */
export function duplicate(party: Party, c: Character, slot: string, rng: Rng): DuplicationResult {
  const item = c.inventory[slot] ?? null;
  if (!plain(item)) return "nothing";
  const roll = rng.int(4);
  if (roll >= 2) return roll === 2 ? "destroyed" : "nothing";
  const copy: Item = { ...item, id: "", bonus: { ...item.bonus } };
  // the copy goes into the same backpack when there is room, else into any other
  const own = BAG_SLOTS.find((s) => c.inventory[s] === null);
  if (own) {
    copy.id = `i${(party.itemCounter++).toString(36)}`;
    c.inventory[own] = copy;
    return "duplicated";
  }
  return giveItem(party, copy) ? "duplicated" : "no_room";
}

export type TransformResult = "changed" | "destroyed";

/** Transform Ring: another ring of the same level (new prefix and suffix), one time in four the ring is lost. */
export function transformRing(c: Character, slot: string, rng: Rng): { result: TransformResult; ring: Item | null } {
  const ring = c.inventory[slot];
  if (!ring || ring.type !== "ring") return { result: "destroyed", ring: null };
  if (rng.int(4) === 0) {
    c.inventory[slot] = null;
    return { result: "destroyed", ring: null };
  }
  const made = generateRing(rng, ringLevel(ring));
  made.id = ring.id;
  c.inventory[slot] = made;
  return { result: "changed", ring: made };
}
