import { BASE_CLASS, CONSTANTS, SPELLS, TEXTS, talentInfo } from "../data/tables";
import { fairyReduction, fairyResistance, orbSpellBonus, wolfBelow } from "../sim/balance";
import { averageDamageLines } from "../sim/combat";
import { ageOf, armor, attr, baseResistance, baseValue, canAct, canEquip, conditionAdjusted, equipSlots, equipTarget, itemBonus, recalcValues, replacedItems, resistance, worstCondition, xpToNextLevel } from "../sim/character";
import { ARMS_MASTER, bonusLines, combineItems, isTwoHanded, makeItem, needsArmsMaster, weaponHands, type Hands } from "../sim/items";
import { SPELL_GRID, spellCost, validTarget, castBlock, lastCastOf, isSpellImplemented, ITEM_SPELLS, learnBlock, needsBeaconChoice, needsTarget, TELEPORT_DISTANCES, type QuickCast, type QuickCastBlock } from "../sim/spells";
import { isPlaceholderIcon, preloadSpellIcons, spellPlate } from "./spellIcons";
import { itemIcon } from "./itemIcons";
import { BAG_SLOTS, type Attribute, type BonusKey, type BoonKey, type Character, type Inventory, type Item, type Party } from "../sim/types";
import { portraitImage } from "./avatarFx";
import { capybaraLoop } from "./capybaraClip";
import { plateButton, preloadButtonArt } from "./buttonArt";
import { assetPath, clear, h } from "./dom";
import { conditionClass, conditionLabel, conditionTitle } from "./conditionInfo";
import { thousands } from "../core/format";
import type { Option, UI } from "./ui";

const EQUIP_LAYOUT: { slot: string; label: string }[] = [
  { slot: "helmet", label: "Head" },
  { slot: "ranged_weapon", label: "Ranged" },
  { slot: "belt", label: "Belt" },
  { slot: "left_hand", label: "Weapon" },
  { slot: "body_armor", label: "Body" },
  { slot: "right_hand", label: "Shield" },
  { slot: "left_ring", label: "Ring" },
  { slot: "boots", label: "Boots" },
  { slot: "right_ring", label: "Ring" },
];

const ATTR_LABEL: [Attribute, string][] = [
  ["str", "Strength"],
  ["int", "Intelligence"],
  ["per", "Personality"],
  ["end", "Endurance"],
  ["spd", "Speed"],
  ["acc", "Accuracy"],
  ["lck", "Luck"],
];

/** One line per resistance: the base value is on the character, the equipment adds to it. */
const RESISTANCES: [keyof Pick<Character, "resFire" | "resIce" | "resAcid" | "resMagic">, BonusKey, string][] = [
  ["resFire", "res_fire", "Fire resistance"],
  ["resIce", "res_ice", "Ice resistance"],
  ["resAcid", "res_acid", "Acid resistance"],
  ["resMagic", "res_magic", "Magic resistance"],
];

const BAG_FULL_FOR_SHIELD = "The backpack is full: taking off the shield needs one more free place.";

const HANDS_LABEL: Record<Hands, string> = { one: "One-handed weapon", two: "Two-handed weapon", ranged: "Ranged weapon" };

/** What a right click does with the item, or null when it does nothing (the Donkey's bag, items the class cannot use, quest items). */
function rightClickHint(c: Character, item: Item, worn: boolean, allowed: boolean): string | null {
  if (worn) return "Right-click to unequip";
  if (item.type === "spell") return learnBlock(c, item.spellId) === null ? "Right-click to use" : null;
  if (!allowed || item.quest) return null;  return equipTarget(c.inventory, item) ? "Right-click to equip" : null;
}

/** What an empty equipment slot holds, for the comparison in the tooltip. */
const NOTHING: Item = makeItem({ name: "", type: "combined" });

/**
 * Details of an item. `c` is the hero looking at it (class limits, scroll hints), or null for the Donkey's bag. `replaced` is what the
 * hero would take off by putting this item on: each value then shows the change in brackets, green when it gets better, red when worse.
 * `worn` is set for an item on the equipment slots (a right click takes it off). `talents` are the party's: obsidian gear needs the Arms Master.
 */
export function itemTooltip(c: Character | null, item: Item | null, replaced: Item | null = null, worn = false, talents: readonly string[] = [ARMS_MASTER]): HTMLElement {
  if (!item) return h("div", { class: "tooltip", text: "Select an item to see its details." });
  const allowed = !c || (BASE_CLASS[c.classType]?.valid_items ?? []).includes(item.type) || item.quest || item.type === "spell";
  // only a hero whose class could wear it is told about the talent (a Wizard cannot use a sword of any material)
  const untrained = !!c && allowed && !worn && !talents.includes(ARMS_MASTER) && needsArmsMaster(item);
  const lines = bonusLines(item, replaced);
  const hint = c ? rightClickHint(c, item, worn, allowed && !untrained) : null;
  const hands = weaponHands(item);
  const shieldBlocked = c && !worn && item.type === "shield" && allowed && c.inventory.left_hand && isTwoHanded(c.inventory.left_hand);
  return h(
    "div",
    { class: "tooltip" },
    h("div", { class: "t", text: item.name.trim() }),
    hint ? h("div", { class: "hint", text: hint }) : null,
    hands ? h("div", { text: HANDS_LABEL[hands] }) : null,
    // the item type is a technical word of the old tables ("crossbow", "silver_skull"): the player gets what it is worth, or that it is a quest item
    h("div", { text: item.quest ? "Quest item" : `Worth: ${thousands(item.value)} gold` }),
    // 40th playtest, point 9: up to 14 lines (a ring against a ring with other stats) run in two columns, so that the window stays a size that fits the screen
    h("div", { class: `bonus-lines${lines.length > 6 ? " many" : ""}` }, ...lines.map((l) => h("div", {}, `${l.label}: ${l.value}`, l.change ? h("span", { class: l.change > 0 ? "delta up" : "delta down", text: ` (${l.change > 0 ? "+" : ""}${l.change})` }) : null))),
    // 53rd playtest, point 18: what a weapon or a damage ring hits for on average, from the hero's level and attributes
    ...(c ? averageDamageLines(c, item, replaced, worn).map((l) => h("div", { class: "avg-damage" }, `${l.label}: ${l.value}`, l.change ? h("span", { class: l.change > 0 ? "delta up" : "delta down", text: ` (${l.change > 0 ? "+" : ""}${l.change})` }) : null)) : []),
    replaced && lines.length > 0 ? h("div", { class: "small", text: replaced.name ? `Change if worn instead of ${replaced.name.trim()}` : "Change if worn" }) : null,
    c && !allowed ? h("div", { class: "small", style: "color:#e8745f", text: `A ${c.classType} cannot use this.` }) : null,
    untrained ? h("div", { class: "small", style: "color:#e8745f", text: "Requires Arms Master talent to equip" }) : null,
    shieldBlocked ? h("div", { class: "small", style: "color:#e8745f", text: "Not with a two-handed weapon in the weapon hand." }) : null,
    c ? scrollNote(c, item) : null,
  );
}

/** The resistance each sheet field stands for. */
const RESISTANCE_ELEMENT = { resFire: "fire", resIce: "ice", resAcid: "acid", resMagic: "magic" } as const;

/**
 * A value of the hero's sheet that something moved off its plain value (Rage halves the armor, a boon adds resistance): green when higher, red when lower, with the plain value in
 * brackets (53rd playtest, point 17). `shown` and `plain` are the texts, `now` and `base` what decides the colour.
 */
function markedText(shown: string, plain: string, now: number, base: number): HTMLElement {
  return h("div", { class: now > base ? "v up" : now < base ? "v down" : "v", text: now !== base ? `${shown} (${plain})` : shown });
}

/** The dark grey of the base values of a hero of 80 and more: age has taken its share off them (13. 11. 2026). */
const AGED_GREY = "#7a7a7a";

/**
 * One attribute or resistance of the sheet: the current value, and the hero's own (base) value in brackets when they differ. From 80 years on the base value is grey, and its
 * mouse-over names the raw value and the share age took off. `raw` is what the hero would have without age.
 */
function agedValue(c: Character, cls: string, now: number, own: number, unit: string, raw: number): HTMLElement {
  const aged = (c.ageShare ?? 0) > 0;
  const title = aged ? `Base ${raw}${unit}, ${Math.round((c.ageShare ?? 0) * 100)}% less because of old age` : "";
  const grey = (text: string) => h("span", { style: `color:${AGED_GREY}`, title, text });
  if (now === own) return h("div", { class: cls, ...(aged ? { title } : {}) }, aged ? grey(`${now}${unit}`) : `${now}${unit}`);
  return h("div", { class: cls }, `${now}${unit} `, aged ? grey(`(${own}${unit})`) : `(${own}${unit})`);
}

/** A spell scroll names its school and level and says whether this hero could learn it (same rules as the guild). */
function scrollNote(c: Character, item: Item): HTMLElement | null {
  const spell = item.type === "spell" ? SPELLS[item.spellId] : undefined;
  if (!spell) return null;
  const block = learnBlock(c, item.spellId);
  const why = block === "class" ? `A ${c.classType} cannot learn this.` : block === "level" ? `${c.name} needs level ${spell.level}.` : block === "known" ? `${c.name} already knows this.` : "";
  return h("div", { class: "small", style: why ? "color:#e8745f" : "", text: `${spell.type.join(" / ")} magic, level ${spell.level}${why ? `. ${why}` : ""}` });
}

/**
 * Talents and achievements belong to the whole party, as in the old game (its character screen listed them next to the
 * attributes of every hero). Each entry shows what it does, so the player does not have to remember the shop text.
 */
function perkColumn(title: string, ids: readonly string[], empty: string): HTMLElement {
  return h(
    "div",
    { class: "perk-col" },
    h("div", { class: "perks-head", text: `${title} (${ids.length})` }),
    ...(ids.length === 0
      ? [h("div", { class: "small", text: empty })]
      : ids.map((id) => {
          const info = talentInfo(id);
          return h("div", { class: "perk" }, h("div", { class: "perk-name", text: info.name }), info.description ? h("div", { class: "small", text: info.description }) : null);
        })),
  );
}

/** The five mascots of the old game: their portrait files (`npc0n`, `_full` for the two with a big picture) and what they do. */
export const MASCOTS: Record<string, { portrait: string; full?: string; text: string }> = {
  Crow: { portrait: "npc01", text: "Keeps watch. It comes alive when monsters or a trap are near." },
  // BALANCE v4: the texts of Wolf, Fairy and Orb follow the numbers in sim/balance.ts (v4: 10%, +15% resistances, 20% spell damage)
  Wolf: { portrait: "npc02", text: `Fights alongside the party: a monster that drops below ${Math.round(wolfBelow() * 100)}% of its health is killed by the wolf.` },
  Donkey: { portrait: "npc03", full: "npc03_full", text: "Carries a backpack of 20 slots. Whatever the heroes cannot hold goes to the Donkey." },
  // the Easter egg (7. 11. 2026): no ability at all, on purpose. Its picture turns round now and then (`ui/capybaraClip.ts`)
  Capybara: { portrait: "npc06", text: "The capybara does not seem to have any capabilities except from being the cutest thing ever \u{1F60D}" },
  Fairy:
    fairyResistance() > 0
      ? { portrait: "npc04", text: `Raises the fire, ice, acid and magic resistances of every hero by ${fairyResistance()}%.` }
      : { portrait: "npc04", text: `Takes ${fairyReduction(CONSTANTS.MASCOT_FAIRY_ELEMENTAL_DAMAGE_REDUCTION)} points off every elemental hit (fire, ice, acid and magic) that reaches a hero.` }, // LEGACY (balance v4)
  Orb: {
    portrait: "npc05",
    text: orbSpellBonus() > 0
      ? `A floating orb of magic. Every attack spell of the party does ${Math.round(orbSpellBonus() * 100)}% more damage.`
      : "A floating orb of magic. Every hero who has spell points gets 20% more of them.", // LEGACY (balance v4)
  },
};

export const mascotPortrait = (name: string): string => MASCOTS[name]?.portrait ?? "character00";

export interface InventoryHooks {
  /** Called after anything changed (HUD refresh). */
  changed(): void;
  log(text: string, kind?: "info" | "good" | "bad"): void;
  /** Plays a sound of the old game (wearing something clicks like a menu entry). */
  sound?(id: number): void;
  /** Use an item (spell scroll): returns after handling. */
  useScroll?(character: number, slot: string, item: Item): Promise<void>;
  /** The mascots the party has found (the current one is among them). */
  mascots?(): string[];
}

/** What the character screen shows: a hero by index, the party's talents and achievements, or the mascot. */
export type CharacterView = number | "perks" | "mascot";

/** Whose bag is on screen: a hero's, or the Donkey's. */
interface BagOwner {
  inventory: Inventory;
  hero: Character | null;
}

/**
 * The character screen: one tab per hero (sheet, equipment and backpack), one for the party's talents and achievements, one
 * for the mascot (with its own bag when it is the Donkey). Click to select, click a target slot to move or equip.
 */
export function openInventory(ui: UI, party: Party, start: CharacterView, hooks: InventoryHooks): Promise<void> {
  let removeKeys = (): void => undefined;
  return ui.panel((close, root) => {
    let view: CharacterView = typeof start === "number" ? Math.max(0, Math.min(start, party.characters.length - 1)) : start;
    let selected: string | null = null; // slot of the selected item in the bag that is on screen
    let hovered: string | null = null;
    root.classList.add("charscreen");

    const owner = (): BagOwner | null => {
      if (view === "perks") return null;
      if (view === "mascot") return party.mascot === "Donkey" ? { inventory: party.mascotBag, hero: null } : null;
      return { inventory: party.characters[view]!.inventory, hero: party.characters[view]! };
    };
    const go = (next: CharacterView) => {
      view = next;
      selected = null;
      hovered = null;
      render();
    };
    const classAllows = (bag: BagOwner, item: Item): boolean => !bag.hero || (BASE_CLASS[bag.hero.classType]?.valid_items ?? []).includes(item.type);
    /** Obsidian gear takes the Arms Master talent, which belongs to the whole party; only asked once the class allows the item. */
    const lacksArmsMaster = (bag: BagOwner, item: Item): boolean => !!bag.hero && !party.talents.includes(ARMS_MASTER) && needsArmsMaster(item);
    const cannotWear = (bag: BagOwner, item: Item): string | null =>
      !classAllows(bag, item) ? `${bag.hero!.name} (${bag.hero!.classType}) cannot use ${item.name.trim()}.` : lacksArmsMaster(bag, item) ? `${bag.hero!.name} needs the Arms Master talent to equip ${item.name.trim()}.` : null;

    const tabs = () =>
      h(
        "div",
        { class: "tabs" },
        ...party.characters.map((ch, i) => h("div", { class: `tab${view === i ? " on" : ""}`, text: ch.name, onclick: () => go(i) })),
        h("div", { class: `tab${view === "perks" ? " on" : ""}`, text: "Party Info", onclick: () => go("perks") }),
        h("div", { class: `tab${view === "mascot" ? " on" : ""}`, text: "Mascot", onclick: () => go("mascot") }),
      );

    // ---- what belongs to the whole party: gold, food, talents and achievements
    const perksView = () =>
      h(
        "div",
        { class: "perks-view" },
        h("div", { class: "party-stats" }, h("div", { text: "Gold" }), h("div", { class: "v", text: thousands(party.gold) }), h("div", { text: "Food" }), h("div", { class: "v", text: `${party.food} day${party.food === 1 ? "" : "s"}` })),
        h("div", { class: "small", text: "Talents and achievements are shared by the whole party, not a hero's own." }),
        h("div", { class: "perk-cols" }, perkColumn("Talents", party.talents, "None yet. Talents are bought from the people of the campaign."), perkColumn("Achievements", party.achievements, "None yet.")),
      );

    // ---- the mascot
    const mascotView = () => {
      const name = party.mascot;
      const info = MASCOTS[name];
      const owned = hooks.mascots?.() ?? [name];
      const picture = info?.full ?? info?.portrait ?? "character00";
      // the Capybara's picture on its page is the clip in a loop (the card beside the heroes turns round now and then, `CapybaraClip`)
      let pic: HTMLElement;
      if (name === "Capybara") pic = capybaraLoop("mascot-pic");
      else pic = h("img", { class: "mascot-pic", src: assetPath(`icons/portraits/${picture}.webp`), alt: name });
      const head = h(
        "div",
        { class: "mascot-head" },
        pic,
        h(
          "div",
          {},
          h("div", { class: "mascot-name", text: name }),
          h("div", { text: info?.text ?? "" }),
          h("div", { class: "small", text: owned.length > 1 ? `Found so far: ${owned.join(", ")}. Walk up to a mascot's place to swap.` : "The only mascot found so far. The others wait near the start town and in the campaign." }),
        ),
      );
      const bag = owner();
      return h("div", { class: "mascot-view" }, head, bag ? h("div", { class: "gear" }, h("div", { class: "small", text: "The Donkey's backpack (20)" }), bagGrid(bag), detail(bag)) : null);
    };

    // ---- slots, item details and the buttons of the selected item
    /** Details of the item under the pointer or, failing that, the selected one; filled in again when the pointer moves. */
    const detail = (bag: BagOwner) => {
      const tip = h("div");
      const show = () => {
        const slot = hovered && bag.inventory[hovered] ? hovered : selected;
        const it = (slot ? bag.inventory[slot] : null) ?? null;
        // a hero compares what lies in the backpack with what would come off (a two-hander takes the shield off too), if the class may wear it
        // an empty slot compares against nothing, so the full bonus shows as the change
        const replaced = it && slot?.startsWith("slot") && bag.hero && !cannotWear(bag, it) && equipTarget(bag.inventory, it) ? combineItems(replacedItems(bag.inventory, it)) ?? NOTHING : null;
        tip.replaceChildren(itemTooltip(bag.hero, it, replaced, !!slot && !slot.startsWith("slot"), party.talents));
      };
      show();
      tipUpdaters.push(show);
      return h("div", {}, tip, buttonsFor(bag));
    };
    let tipUpdaters: (() => void)[] = [];
    const refreshTips = () => {
      for (const show of tipUpdaters) show();
    };

    const slotEl = (bag: BagOwner, slot: string, label?: string) => {
      const item = bag.inventory[slot];
      const sel = selected ? bag.inventory[selected] : null;
      const ok = !!sel && selected !== slot && !slot.startsWith("slot") && canEquip(bag.inventory, sel, slot) && !cannotWear(bag, sel);
      const el = h(
        "div",
        {
          class: `slot${selected === slot ? " sel" : ""}${ok ? " ok" : ""}`,
          title: item ? item.name.trim() : label ?? "",
          onclick: () => click(slot),
          ondblclick: () => dbl(slot),
          oncontextmenu: (e) => {
            e.preventDefault();
            dbl(slot);
          },
        },
        item ? itemIcon(item) : null,
        label ? h("div", { class: "label", text: label }) : null,
      );
      el.addEventListener("mouseenter", () => {
        hovered = slot;
        refreshTips();
      });
      el.addEventListener("mouseleave", () => {
        hovered = null;
        refreshTips();
      });
      return el;
    };

    const bagGrid = (bag: BagOwner) => h("div", { class: "slots" }, ...BAG_SLOTS.map((s) => slotEl(bag, s)));

    const buttonsFor = (bag: BagOwner) => {
      const buttons = h("div", { class: "row-btns" });
      const sel = selected ? bag.inventory[selected] : null;
      if (!sel || !selected) return buttons;
      const slot = selected;
      if (bag.hero) {
        buttons.append(h("button", { class: "btn", text: slot.startsWith("slot") ? "Equip" : "Unequip", onclick: () => dbl(slot) }));
        if (sel.type === "spell" && hooks.useScroll && typeof view === "number") {
          const hero = view;
          buttons.append(h("button", { class: "btn", text: "Use scroll", onclick: async () => { await hooks.useScroll!(hero, slot, sel); render(); } }));
        }
      }
      // to the other heroes' backpacks, and to the Donkey's when it is the mascot
      for (const other of party.characters) if (other !== bag.hero) buttons.append(h("button", { class: "btn", text: `Give to ${other.name}`, onclick: () => give(other.inventory, `${other.name}'s`) }));
      if (party.mascot === "Donkey" && bag.inventory !== party.mascotBag) buttons.append(h("button", { class: "btn", text: "Give to the Donkey", onclick: () => give(party.mascotBag, "The Donkey's") }));
      buttons.append(
        h("button", {
          class: "btn",
          text: "Destroy",
          onclick: async () => {
            if (sel.quest) return hooks.log("Quest items cannot be destroyed.", "bad");
            if (await ui.confirm("Destroy item", `Destroy ${sel.name.trim()} for good?`)) {
              bag.inventory[slot] = null;
              selected = null;
              if (bag.hero) recalcValues(bag.hero, party.talents, false, party.mascot);
              hooks.changed();
              render();
            }
          },
        }),
      );
      return buttons;
    };

    // ---- one hero: the sheet on the left, equipment and backpack side by side on the right, the item below
    const heroView = (c: Character, bag: BagOwner) => {
      const adj = conditionAdjusted(c);
      const attrRows = ATTR_LABEL.flatMap(([key, label]) => {
        const now = attr(c, key, false);
        const own = baseValue(c, key);
        const cls = now > own ? "v up" : now < own ? "v down" : "v";
        return [h("div", { text: label }), agedValue(c, cls, now, own, "", c[key])];
      });
      const need = xpToNextLevel(c);
      const age = ageOf(c, party.minutes);
      const dmin = itemBonus(c, "dam_min");
      const dmax = itemBonus(c, "dam_max");
      const rage = c.mods?.rage ?? 0;
      const sheet = h(
        "div",
        { class: "sheet" },
        h("div", { class: "big" }, portraitImage(c), h("div", {}, h("div", { class: "t", style: "font-family:var(--font-head);color:var(--gold);font-size:19px", text: c.name }), h("div", { text: `${c.raceType} ${c.classType}` }), h("div", { text: `Level ${c.level}` }), h("div", { text: `Age ${age.total}`, title: age.magic ? `${age.natural} years old, aged ${age.magic} more by magic` : `${age.natural} years old`, style: age.magic ? "color:var(--bad)" : "" }))),
        h("div", { class: "attrs" },
          h("div", { text: "Hit points" }), h("div", { class: "v", text: `${c.hp} / ${c.health}` }),
          h("div", { text: "Spell points" }), h("div", { class: "v", text: `${c.sp} / ${c.mana}` }),
          ...attrRows,
          // 53rd playtest, point 17: a value that a spell, a condition or a boon moved off what the hero's gear gives shows in green (more) or red (less), the plain value in brackets
          h("div", { text: "Armor" }), markedText(String(armor(c) + adj.bonusArmor), String(itemBonus(c, "arm") + adj.bonusArmor), armor(c), itemBonus(c, "arm")),
          h("div", { text: "Melee damage" }), dmax > 0 ? markedText(`${dmin + rage}-${dmax + rage}`, `${dmin}-${dmax}`, rage, 0) : h("div", { class: "v", text: "bare hands" }),
          // like the attributes: the current value (gear, a boon and the Fairy count) in green when it is above the hero's own, in red below, the own value in brackets
          ...RESISTANCES.flatMap(([key, , label]) => {
            const now = resistance(c, RESISTANCE_ELEMENT[key], party.mascot);
            const own = baseResistance(c, key);
            return [h("div", { text: label }), agedValue(c, now > own ? "v up" : now < own ? "v down" : "v", now, own, "%", c[key])];
          }),
          h("div", { text: "Experience" }), h("div", { class: "v", text: thousands(c.xp) }),
          h("div", { text: "Next level" }), h("div", { class: "v", text: need > 0 ? `${thousands(need)} xp more` : "ready to train" }),
          h("div", { text: "Condition" }), h("div", { class: `v ${conditionClass(c, party.minutes)}`, text: conditionLabel(c, party.minutes), title: conditionTitle(c, party.minutes) }),
        ),
      );
      const equip = h("div", { class: "equip-grid" }, ...EQUIP_LAYOUT.map((e) => slotEl(bag, e.slot, e.label)));
      return h(
        "div",
        { class: "cols" },
        sheet,
        h("div", { class: "gear" }, h("div", { class: "gear-top" }, h("div", {}, h("div", { class: "small", text: "Equipment" }), equip), h("div", {}, h("div", { class: "small", text: "Backpack (20)" }), bagGrid(bag))), detail(bag)),
      );
    };

    const render = () => {
      clear(root);
      tipUpdaters = [];
      const bag = owner();
      const body = view === "perks" ? perksView() : view === "mascot" ? mascotView() : heroView(party.characters[view]!, bag!);
      root.append(h("button", { class: "btn close", text: "Close (Esc)", onclick: close }), h("h2", { text: "Party" }), tabs(), body);
    };

    const click = (slot: string) => {
      const bag = owner();
      if (!bag) return;
      if (selected === null) {
        if (bag.inventory[slot]) selected = slot;
        render();
        return;
      }
      if (selected === slot) {
        selected = null;
        render();
        return;
      }
      const item = bag.inventory[selected]!;
      const refusal = slot.startsWith("slot") ? null : cannotWear(bag, item);
      if (refusal) {
        hooks.log(refusal, "bad");
      } else {
        const shield = slot === "left_hand" ? bag.inventory.right_hand : null;
        const moved = equipSlots(bag.inventory, selected, slot);
        if (moved === "ok") {
          if (shield && !bag.inventory.right_hand) hooks.log(`${shield.name.trim()} goes into the backpack.`);
          if (bag.hero) recalcValues(bag.hero, party.talents, false, party.mascot);
          // wearing and taking off both click like a menu entry
          if (!slot.startsWith("slot") || !selected.startsWith("slot")) hooks.sound?.(9001);
          hooks.changed();
          selected = null;
        } else if (moved === "bag_full") {
          hooks.log(BAG_FULL_FOR_SHIELD, "bad");
        } else if (bag.inventory[slot] && !slot.startsWith("slot")) {
          hooks.log("That does not fit there.", "bad");
        } else if (bag.inventory[slot]) {
          selected = slot; // clicked another item in a bag slot: switch selection
        } else {
          hooks.log("That does not fit there.", "bad");
        }
      }
      render();
    };

    /** Reads a spell scroll of the hero on screen (the same as the button), then redraws: the scroll is gone when it worked. */
    const readScroll = async (slot: string, item: Item) => {
      if (typeof view !== "number" || !hooks.useScroll) return;
      await hooks.useScroll(view, slot, item);
      render();
    };

    /** Double click / right click: use a scroll, equip into the first fitting slot, or unequip into the bag. */
    const dbl = (slot: string) => {
      const bag = owner();
      if (!bag) return;
      const item = bag.inventory[slot];
      if (!item) return;
      if (!slot.startsWith("slot")) {
        const free = BAG_SLOTS.find((s) => bag.inventory[s] === null);
        if (!free) return hooks.log("The backpack is full.", "bad");
        bag.inventory[free] = item;
        bag.inventory[slot] = null;
        hooks.sound?.(9001);
      } else {
        // the Donkey's bag has no equipment, and a hero only wears what the class may use
        if (!bag.hero) return;
        if (item.type === "spell") return void readScroll(slot, item);
        const refusal = cannotWear(bag, item);
        if (refusal) return hooks.log(refusal, "bad");
        const target = equipTarget(bag.inventory, item);
        if (!target) return hooks.log(item.type === "shield" && bag.inventory.left_hand && isTwoHanded(bag.inventory.left_hand) ? "A two-handed weapon leaves no hand for a shield." : "Nothing to equip that into.", "bad");
        const shield = target === "left_hand" ? bag.inventory.right_hand : null;
        const moved = equipSlots(bag.inventory, slot, target);
        if (moved === "bag_full") return hooks.log(BAG_FULL_FOR_SHIELD, "bad");
        if (moved !== "ok") return hooks.log("Nothing to equip that into.", "bad");
        if (shield && !bag.inventory.right_hand) hooks.log(`${shield.name.trim()} goes into the backpack.`);
        hooks.sound?.(9001);
      }
      selected = null;
      if (bag.hero) recalcValues(bag.hero, party.talents, false, party.mascot);
      hooks.changed();
      render();
    };

    /** The selected item goes into the first free place of another bag. `whose` is "Name's" for the message when it is full. */
    const give = (to: Inventory, whose: string) => {
      const bag = owner();
      const item = bag && selected ? bag.inventory[selected] : null;
      if (!bag || !item || !selected) return;
      const free = BAG_SLOTS.find((s) => to[s] === null);
      if (!free) return hooks.log(`${whose} backpack is full.`, "bad");
      to[free] = item;
      bag.inventory[selected] = null;
      selected = null;
      if (bag.hero) recalcValues(bag.hero, party.talents, false, party.mascot);
      hooks.changed();
      render();
    };

    // the keys that open the screen also switch inside it (35th playtest): 1 to 4 the heroes, 5 the mascot, T or I the party info
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const n = Number(e.key);
      let next: CharacterView | null = null;
      if (e.key.length === 1 && n >= 1 && n <= party.characters.length) next = n - 1;
      else if (e.key === "5") next = "mascot";
      else if (e.key === "t" || e.key === "T" || e.key === "i" || e.key === "I") next = "perks";
      if (next === null) return;
      e.preventDefault();
      e.stopPropagation();
      if (next !== view) go(next);
    };
    document.addEventListener("keydown", onKey, true);
    removeKeys = () => document.removeEventListener("keydown", onKey, true);

    render();
  }).finally(() => removeKeys());
}

export interface SpellChoice {
  spellId: number;
  target?: number;
  element?: "acid" | "fire" | "ice" | "magic";
  /** Lloyd's Beacon: light the fire or go back to it. */
  beacon?: "set" | "return";
  /** Teleport: how many fields ahead. */
  distance?: number;
}

const QUICK_CAST_BLOCK: Record<QuickCastBlock, string> = {
  gone: "no longer possible",
  cannot_act: "cannot act",
  mana: "not enough spell points",
  no_target: "nothing to aim at",
};

/**
 * The bottom entry of the spell menus: the spell cast last, with the one who cast it ("Lyneth - First Aid", 1 SP), like the old
 * game's quick-cast button. It is greyed out when it cannot be cast now: no spell points left, nobody to aim at, the caster cannot act.
 */
export function quickCastOption(party: Party, quick: QuickCast): Option<SpellChoice> {
  const spell = SPELLS[quick.spellId];
  const who = party.characters[quick.caster]?.name ?? party.lastCast?.caster ?? "";
  const label = `${who} - ${spell ? spell.title : `Spell ${quick.spellId}`}`;
  const caster = party.characters[quick.caster];
  const cost = spell ? `${caster ? spellCost(spell, caster) : spell.mana} SP` : "";
  return {
    label,
    // only the spell is repeated: who it works on (and the element of a protection spell) is asked again
    value: { spellId: quick.spellId },
    note: quick.block ? `${cost} - ${QUICK_CAST_BLOCK[quick.block]}` : cost,
    disabled: quick.block !== null,
    apart: true,
  };
}

/** The spell every hero's column shows before anybody has cast anything: Light. */
const LIGHT_SPELL = 6;

/**
 * What a spell's mouse-over says: its name, its kind, level and cost, and what it does. `caster` makes the cost the one this hero pays
 * (a spell that scales with level costs more the higher the level, 53rd playtest point 16) and adds "not enough spell points".
 */
function spellLines(s: (typeof SPELLS)[number], caster?: Character): HTMLElement[] {
  const cost = caster ? spellCost(s, caster) : s.mana;
  return [
    h("div", { class: "spell-name", text: s.title }),
    h("div", { class: "small", text: `${s.type.join(" / ")} - level ${s.level} - ${cost} spell point${cost === 1 ? "" : "s"}${caster && caster.sp < cost ? " - not enough spell points" : ""}` }),
    h("div", { text: s.text }),
  ];
}

/**
 * The mouse-over of a spell's plate (52nd playtest, point 4; 50th bug fix: the plate of the cast-last spell in "Who casts?" said only "Light (1 SP)" and, after the first cast, "- the spell cast last"
 * instead of the text): name, cost and description at the plate, in every window that shows one. It hangs in the overlay (`.modal-back`): the scroll has a `filter`, which makes it the frame of
 * fixed boxes, and clips them. `onShow` runs when it appears (the spell window also fills the field under its grid).
 */
function attachSpellTip(el: HTMLElement, spellId: number, caster?: Character, onShow?: () => void): void {
  const s = SPELLS[spellId];
  if (!s) return;
  const tip = h("div", { class: "spell-tip" }, ...spellLines(s, caster));
  el.setAttribute("aria-label", `${s.title} (${caster ? spellCost(s, caster) : s.mana} SP)`);
  const show = (): void => {
    const back = el.closest(".modal-back");
    if (!back) return;
    onShow?.();
    tip.style.visibility = "hidden";
    back.append(tip);
    const over = back.getBoundingClientRect();
    const at = el.getBoundingClientRect();
    const margin = 8;
    // above the plate where it fits, else below; centred on it and kept inside the window
    const x = Math.max(margin, Math.min(over.width - tip.offsetWidth - margin, at.left - over.left + at.width / 2 - tip.offsetWidth / 2));
    const above = at.top - over.top - tip.offsetHeight - margin;
    tip.style.left = `${x}px`;
    tip.style.top = `${above >= margin ? above : at.bottom - over.top + margin}px`;
    tip.style.visibility = "visible";
  };
  el.addEventListener("mouseenter", show);
  el.addEventListener("focus", show);
  el.addEventListener("mouseleave", () => tip.remove());
  el.addEventListener("blur", () => tip.remove());
}

/**
 * "Who casts?" (36th playtest, point 5): the portraits of the heroes with magical abilities side by side, under each the blue bar of the spell points as wide as the portrait,
 * the picture of the spell cast last (greyed out when this hero cannot cast it now; Light while nothing has been cast) and a "Select" button on the user's plate.
 * A click on the picture repeats that spell with this hero. Resolves with the hero and whether the last spell is to be repeated, or null.
 */
export async function pickCaster(ui: UI, party: Party, heroes: number[], aimed: boolean, sound?: (id: number) => void): Promise<{ who: number; repeat: boolean } | null> {
  await Promise.all([preloadSpellIcons(), preloadButtonArt()]);
  return ui.modal<{ who: number; repeat: boolean } | null>(
    (close) =>
      h(
        "div",
        { class: "parchment caster-pick" },
        h("h2", { text: "Who casts?" }),
        h(
          "div",
          { class: "caster-row" },
          ...heroes.map((i) => {
            const c = party.characters[i]!;
            // each hero has a last spell of their own (the old game's `last_spell`): Light until they have cast one
            const own = lastCastOf(party, i);
            const last = own?.spellId ?? LIGHT_SPELL;
            const block = castBlock(party, i, last, aimed);
            const spell = SPELLS[last];
            const icon = h(
              "button",
              {
                class: `caster-spell${block ? " off" : ""}`,
                onclick: () => (block ? sound?.(9014) : close({ who: i, repeat: true })),
              },
              spellPlate(last),
              isPlaceholderIcon(last) ? h("span", { class: "spell-caption", text: spell?.title ?? "" }) : null,
            );
            // the same mouse-over from the first cast on, whether or not this hero has cast anything (before it: Light): name, cost and what the spell does
            attachSpellTip(icon, last, c);
            return h(
              "div",
              { class: "caster-col" },
              portraitImage(c, "portrait caster-portrait"),
              h("div", { class: "bar sp", title: `${c.sp} / ${c.mana} spell points` }, h("i", { style: `width:${c.mana > 0 ? Math.max(0, Math.min(100, Math.round((c.sp * 100) / c.mana))) : 0}%` })),
              icon,
              plateButton("Select", 110, () => close({ who: i, repeat: false })),
            );
          }),
        ),
        h("div", { class: "buttons" }, h("button", { class: "btn", text: "Back", onclick: () => close(null) })),
      ),
    { dismissWith: null },
  );
}

/** The portraits of the heroes as buttons (36th playtest, point 15): the pick of who drinks from a chalice, a well or a barrel. No names, no bars; the name is the mouse-over. */
export function pickHeroPortrait(ui: UI, party: Party, question: string, canPick: (c: Character) => boolean, hpBar = false): Promise<number | null> {
  return ui.modal<number | null>(
    (close) =>
      h(
        "div",
        { class: "parchment hero-pick" },
        question ? h("p", { text: question }) : null,
        h(
          "div",
          { class: "caster-row" },
          // 40th playtest, point 10: every choice of a hero shows the portraits; where it is about healing, the red bar of the hit points sits under each
          ...party.characters.map((c, i) =>
            h(
              "button",
              { class: `hero-btn${canPick(c) ? "" : " off"}`, title: hpBar ? `${c.name}: ${c.hp} / ${c.health} HP` : c.name, onclick: () => canPick(c) && close(i) },
              portraitImage(c, "portrait caster-portrait"),
              hpBar ? h("div", { class: "bar hp" }, h("i", { style: `width:${c.health > 0 ? Math.max(0, Math.min(100, Math.round((c.hp * 100) / c.health))) : 0}%` })) : null,
            ),
          ),
        ),
        h("div", { class: "buttons" }, h("button", { class: "btn", text: "Back", onclick: () => close(null) })),
      ),
    { dismissWith: null },
  );
}

/**
 * Spell window of one caster: the pictures of the spells the hero knows on a wide scroll (the old game's 6 x 6 grid of plates), the
 * cost on each plate, and under them what the plate under the pointer does. A plate is greyed out without the spell points; the
 * spells whose picture is the shared placeholder carry their name. `quick` adds the last spell as a button below the grid (only
 * when this caster cast it); choosing it repeats the spell, still asking for the target. Asks for a target or an element afterwards
 * when the spell needs one.
 */
export async function pickSpell(ui: UI, party: Party, caster: number, quick: QuickCast | null = null, sound?: (id: number) => void): Promise<SpellChoice | null> {
  const c = party.characters[caster]!;
  if (!canAct(c)) {
    await ui.message(`${c.name} cannot act right now.`);
    return null;
  }
  // a hero without spell points (a Knight, a Barbarian) has nothing to learn: say that, not "visit a guild"
  if (c.mana <= 0) {
    await ui.message(`${c.name} has no magical abilities.`);
    return null;
  }
  if (c.spells.length === 0) {
    await ui.message(`${c.name} does not know any spells yet. Visit a guild to learn some.`);
    return null;
  }
  // the sheet was fetched at start-up; this only waits when the window is opened before it arrived
  await preloadSpellIcons();
  const picked = await ui.modal<SpellChoice | number | null>(
    (close) => {
      // 55th playtest, point 5: the field under the grid holds every text on top of each other (one grid cell, the others invisible), so that the scroll keeps its size
      // whatever spell the pointer is on; it was as high as the text just shown
      const info = h("div", { class: "spell-info" });
      const entries = new Map<number | null, HTMLElement>();
      const entry = (key: number | null, ...lines: HTMLElement[]): void => {
        const box = h("div", { class: "ghost" }, ...lines);
        entries.set(key, box);
        info.append(box);
      };
      entry(null, h("div", { class: "small", text: "Choose a spell. Point at one to read what it does." }));
      for (const id of c.spells) {
        const s = SPELLS[id];
        if (s) entry(id, ...spellLines(s, c));
      }
      const describe = (id: number | null): void => {
        const shown = entries.has(id) ? id : null;
        for (const [key, box] of entries) box.classList.toggle("ghost", key !== shown);
      };
      // alphabetical by name, whatever order the spells were learnt in
      const slots = [...c.spells].sort((a, b) => (SPELLS[a]?.title ?? "").localeCompare(SPELLS[b]?.title ?? "")).map((id) => {
        const s = SPELLS[id]!;
        const cost = spellCost(s, c);
        const ok = isSpellImplemented(id) && c.sp >= cost;
        const slot = h(
          "button",
          {
            class: `spell-slot${ok ? "" : " off"}`,
            onclick: () => {
              if (ok) close(id);
              else sound?.(9014);
            },
          },
          spellPlate(id),
          isPlaceholderIcon(id) ? h("span", { class: "spell-caption", text: s.title }) : null,
          h("span", { class: "spell-cost", text: String(cost) }),
        );
        // (the mouse-over at the plate, and the field under the grid with the same text)
        attachSpellTip(slot, id, c, () => describe(id));
        return slot;
      });
      describe(null);
      const buttons = h("div", { class: "buttons" });
      if (quick && quick.caster === caster) {
        const q = quickCastOption(party, quick);
        buttons.append(h("button", { class: "btn", text: `${q.label} (${q.note})`, disabled: q.disabled, onclick: () => close(q.value) }));
      }
      buttons.append(h("button", { class: "btn", text: "Back", onclick: () => close(null) }));
      return h(
        "div",
        { class: "parchment spells", style: `--cols:${SPELL_GRID.columns}` },
        h("h2", { text: `${c.name}'s spells` }),
        h("p", { class: "small", style: "text-align:center", text: `Spell points: ${c.sp} / ${c.mana}` }),
        h("div", { class: "spell-grid" }, ...slots),
        info,
        buttons,
      );
    },
    { dismissWith: null },
  );
  if (picked === null) return null;
  return askSpellDetails(ui, party, typeof picked === "object" ? picked.spellId : picked);
}

/** Asks for what a spell still needs, the hero it works on or the element it protects against; null when the player backs out. */
export async function askSpellDetails(ui: UI, party: Party, spellId: number): Promise<SpellChoice | null> {
  const choice: SpellChoice = { spellId };
  if (needsBeaconChoice(spellId)) {
    const beacon = await ui.choose("Lloyd's Beacon", "Light a fire where the party stands, or go back to the one that was lit.", [
      { label: "Set", value: "set" as const, note: "light a fire here" },
      { label: "Return", value: "return" as const, note: "go back to the fire" },
    ]);
    if (beacon === null) return null;
    choice.beacon = beacon;
  }
  if (needsTarget(spellId)) {
    const backpack = ITEM_SPELLS.has(spellId);
    const target = await pickHeroPortrait(ui, party, backpack ? "Whose backpack?" : "On whom?", (c) => validTarget(spellId, c), !backpack);
    if (target === null) return null;
    choice.target = target;
  }
  if (spellId === 47) {
    const distance = await ui.choose("Teleport", "How many fields ahead should the party be carried?", TELEPORT_DISTANCES.map((d) => ({ label: `${d} fields`, value: d })));
    if (distance === null) return null;
    choice.distance = distance;
  }
  if (spellId === 17 || spellId === 50) {
    // (55th playtest, point 16: the breath of the dragon is of the element the caster picks, never physical)
    const element = await ui.choose(spellId === 50 ? "Dragon Breath" : "Protect against", spellId === 50 ? "Which element does the breath carry?" : "", [
      { label: "Acid", value: "acid" as const },
      { label: "Fire", value: "fire" as const },
      { label: "Ice", value: "ice" as const },
      { label: "Magic", value: "magic" as const },
    ]);
    if (element === null) return null;
    choice.element = element;
  }
  return choice;
}
