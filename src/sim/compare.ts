import { BASE_CLASS } from "../data/tables";
import { averageDamageLines } from "./combat";
import { combineItems, needsArmsMaster, ARMS_MASTER, bonusLines, makeItem } from "./items";
import { equipTarget, offHandRingSlot, replacedItems } from "./character";
import { learnBlock } from "./spells";
import type { BonusKey, Character, Item } from "./types";

/**
 * What a hero would gain by putting an item on (the portraits of the smithy, bug_fix_71): `better` when every value that changes gets higher, `worse` when every one gets lower,
 * `mixed` when some do and some do not (the shop marks nothing), `same` when nothing changes, `cannot` when the hero cannot put it on at all (class, Arms Master, a shield
 * beside a two-hander): the portrait is greyed out.
 */
export type Verdict = "better" | "worse" | "mixed" | "same" | "cannot";

/** What an empty equipment slot holds: the whole bonus of the item then counts as the change. */
const NOTHING: Item = makeItem({ name: "", type: "combined" });

/** The bonuses the average damage lines of `averageDamageLines` stand for: with those lines the damage is judged by what the hero really hits for, not by the single numbers. */
const DAMAGE_KEYS: readonly BonusKey[] = ["dam_min", "dam_max", "ranged_dam_min", "ranged_dam_max", "dam_pct"];

/** Class and talent allow it (the rules of the character screen: `valid_items` of the class, Arms Master for obsidian gear). */
export function canUseItem(c: Character, item: Item, talents: readonly string[]): boolean {
  if (!(BASE_CLASS[c.classType]?.valid_items ?? []).includes(item.type)) return false;
  return talents.includes(ARMS_MASTER) || !needsArmsMaster(item);
}

/**
 * Judges `item` for one hero against what it would replace: the same lines as the item tooltip (`bonusLines` with their change, the average damage of `averageDamageLines`).
 * `offHand`: a ring is compared with the second ring (Ctrl, 62nd playtest point 5), where there is one to replace.
 */
export function verdictFor(c: Character, item: Item, talents: readonly string[], offHand = false): Verdict {
  // 59th playtest, point 7: a scroll is judged by the rules of learning it (`learnBlock`): a green arrow for the heroes who can learn it now, the portrait without an arrow for those
  // who could later (their school, a level too low), greyed out for the others (another school, or they know it already)
  if (item.type === "spell") {
    const block = learnBlock(c, item.spellId);
    return block === null ? "better" : block === "level" ? "same" : "cannot";
  }
  if (!canUseItem(c, item, talents) || !equipTarget(c.inventory, item)) return "cannot";
  const replaced = combineItems(replacedItems(c.inventory, item, offHand && offHandRingSlot(c.inventory, item) !== null)) ?? NOTHING;
  const avg = averageDamageLines(c, item, replaced, false);
  const changes = [
    ...bonusLines(item, replaced).filter((l) => avg.length === 0 || !DAMAGE_KEYS.includes(l.key)).map((l) => l.change ?? 0),
    ...avg.map((l) => l.change),
  ].filter((x) => x !== 0);
  if (changes.length === 0) return "same";
  const up = changes.some((x) => x > 0);
  const down = changes.some((x) => x < 0);
  return up && down ? "mixed" : up ? "better" : "worse";
}
