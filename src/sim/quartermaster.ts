import { STORAGE_FEE } from "../data/town-people";
import { giveItem } from "./party";
import { BAG_SLOTS, type Inventory, type Item, type Party } from "./types";

/**
 * The store of the quartermaster (55th playtest, point 14): the party leaves things with him for `STORAGE_FEE` gold a piece, he has room for any number of them, ordinary items and
 * quest items alike, and gives them back for nothing. The things lie in `Party.storage` (absent in a save from before the quartermaster), nothing else of the party's state changes.
 */

export interface PackEntry {
  item: Item;
  /** Whose backpack: a hero's name, or the Donkey's bag. */
  owner: string;
  bag: Inventory;
  slot: string;
}

/** Everything in the backpacks (the heroes' and, while the Donkey is the mascot, its bag), not what the heroes wear or wield. */
export function packEntries(party: Party): PackEntry[] {
  const out: PackEntry[] = [];
  const bags: { owner: string; bag: Inventory }[] = [...party.characters.map((c) => ({ owner: c.name, bag: c.inventory })), ...(party.mascot === "Donkey" ? [{ owner: "the Donkey", bag: party.mascotBag }] : [])];
  for (const { owner, bag } of bags) for (const slot of BAG_SLOTS) if (bag[slot]) out.push({ item: bag[slot]!, owner, bag, slot });
  return out;
}

/** What the quartermaster keeps for the party, oldest first. */
export const storedItems = (party: Party): readonly Item[] => party.storage ?? [];

/** Leaves the item in `slot` of `bag` with the quartermaster. Costs `STORAGE_FEE`; "gold" when the party cannot pay, "empty" when nothing lies there. */
export function storeItem(party: Party, bag: Inventory, slot: string): { ok: true; item: Item; fee: number } | { ok: false; reason: "gold" | "empty" } {
  const item = bag[slot];
  if (!item) return { ok: false, reason: "empty" };
  if (party.gold < STORAGE_FEE) return { ok: false, reason: "gold" };
  party.gold -= STORAGE_FEE;
  bag[slot] = null;
  (party.storage ??= []).push(item);
  return { ok: true, item, fee: STORAGE_FEE };
}

/** Takes the `index`-th stored item back into the first backpack with room. "full" when no backpack has room, the item then stays in the store. */
export function retrieveItem(party: Party, index: number): { ok: true; item: Item } | { ok: false; reason: "full" | "empty" } {
  const item = party.storage?.[index];
  if (!item) return { ok: false, reason: "empty" };
  if (!giveItem(party, item)) return { ok: false, reason: "full" };
  party.storage!.splice(index, 1);
  return { ok: true, item };
}
