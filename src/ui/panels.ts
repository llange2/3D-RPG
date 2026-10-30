import { BASE_CLASS, CONSTANTS, SPELLS, TEXTS, talentInfo } from "../data/tables";
import { fairyReduction, orbSpellBonus, wolfBelow } from "../sim/balance";
import { ageOf, armor, attr, canAct, canEquip, conditionAdjusted, equipSlots, equipTarget, itemBonus, recalcValues, replacedItems, worstCondition, xpToNextLevel } from "../sim/character";
import { bonusLines, combineItems, isTwoHanded, makeItem, weaponHands, type Hands } from "../sim/items";
import { SPELL_GRID, isSpellImplemented, ITEM_SPELLS, learnBlock, needsBeaconChoice, needsTarget, TELEPORT_DISTANCES, type QuickCast, type QuickCastBlock } from "../sim/spells";
import { isPlaceholderIcon, preloadSpellIcons, spellPlate } from "./spellIcons";
import { itemIcon } from "./itemIcons";
import { BAG_SLOTS, type Attribute, type BonusKey, type Character, type Inventory, type Item, type Party } from "../sim/types";
import { portraitImage } from "./avatarFx";
import { assetPath, clear, h } from "./dom";
import { conditionClass, conditionTitle } from "./conditionInfo";
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
  if (!allowed || item.quest) return null;
  return equipTarget(c.inventory, item) ? "Right-click to equip" : null;
}

/** What an empty equipment slot holds, for the comparison in the tooltip. */
const NOTHING: Item = makeItem({ name: "", type: "combined" });

/**
 * Details of an item. `c` is the hero looking at it (class limits, scroll hints), or null for the Donkey's bag. `replaced` is what the
 * hero would take off by putting this item on: each value then shows the change in brackets, green when it gets better, red when worse.
 * `worn` is set for an item on the equipment slots (a right click takes it off).
 */
export function itemTooltip(c: Character | null, item: Item | null, replaced: Item | null = null, worn = false): HTMLElement {
  if (!item) return h("div", { class: "tooltip", text: "Select an item to see its details." });
  const allowed = !c || (BASE_CLASS[c.classType]?.valid_items ?? []).includes(item.type) || item.quest || item.type === "spell";
  const lines = bonusLines(item, replaced);
  const hint = c ? rightClickHint(c, item, worn, allowed) : null;
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
    ...lines.map((l) => h("div", {}, `${l.label}: ${l.value}`, l.change ? h("span", { class: l.change > 0 ? "delta up" : "delta down", text: ` (${l.change > 0 ? "+" : ""}${l.change})` }) : null)),
    replaced && lines.length > 0 ? h("div", { class: "small", text: replaced.name ? `Change if worn instead of ${replaced.name.trim()}` : "Change if worn" }) : null,
    c && !allowed ? h("div", { class: "small", style: "color:#e8745f", text: `A ${c.classType} cannot use this.` }) : null,
    shieldBlocked ? h("div", { class: "small", style: "color:#e8745f", text: "Not with a two-handed weapon in the weapon hand." }) : null,
    c ? scrollNote(c, item) : null,
  );
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
  // BALANCE v4: the texts of Wolf, Fairy and Orb follow the numbers in sim/balance.ts (v4: 10%, 30 points, 20% spell damage)
  Wolf: { portrait: "npc02", text: `Fights alongside the party: a monster that drops below ${Math.round(wolfBelow() * 100)}% of its health is killed by the wolf.` },
  Donkey: { portrait: "npc03", full: "npc03_full", text: "Carries a backpack of 20 slots. Whatever the heroes cannot hold goes to the Donkey." },
  Fairy: { portrait: "npc04", full: "npc04_full", text: `Takes ${fairyReduction(CONSTANTS.MASCOT_FAIRY_ELEMENTAL_DAMAGE_REDUCTION)} points off every elemental hit (fire, ice, acid and magic) that reaches a hero.` },
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
      const head = h(
        "div",
        { class: "mascot-head" },
        h("img", { class: "mascot-pic", src: assetPath(`icons/portraits/${picture}.webp`), alt: name }),
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
        const replaced = it && slot?.startsWith("slot") && bag.hero && classAllows(bag, it) && equipTarget(bag.inventory, it) ? combineItems(replacedItems(bag.inventory, it)) ?? NOTHING : null;
        tip.replaceChildren(itemTooltip(bag.hero, it, replaced, !!slot && !slot.startsWith("slot")));
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
      const ok = !!sel && selected !== slot && !slot.startsWith("slot") && canEquip(bag.inventory, sel, slot) && classAllows(bag, sel);
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
        const cls = now > c[key] ? "v up" : now < c[key] ? "v down" : "v";
        return [h("div", { text: label }), h("div", { class: cls, text: `${now}${now !== c[key] ? ` (${c[key]})` : ""}` })];
      });
      const need = xpToNextLevel(c);
      const age = ageOf(c, party.minutes);
      const dmin = itemBonus(c, "dam_min");
      const dmax = itemBonus(c, "dam_max");
      const sheet = h(
        "div",
        { class: "sheet" },
        h("div", { class: "big" }, portraitImage(c), h("div", {}, h("div", { class: "t", style: "font-family:var(--font-head);color:var(--gold);font-size:19px", text: c.name }), h("div", { text: `${c.raceType} ${c.classType}` }), h("div", { text: `Level ${c.level}` }), h("div", { text: `Age ${age.total}`, title: age.magic ? `${age.natural} years old, aged ${age.magic} more by magic` : `${age.natural} years old`, style: age.magic ? "color:var(--bad)" : "" }))),
        h("div", { class: "attrs" },
          h("div", { text: "Hit points" }), h("div", { class: "v", text: `${c.hp} / ${c.health}` }),
          h("div", { text: "Spell points" }), h("div", { class: "v", text: `${c.sp} / ${c.mana}` }),
          ...attrRows,
          h("div", { text: "Armor" }), h("div", { class: "v", text: String(armor(c) + adj.bonusArmor) }),
          h("div", { text: "Melee damage" }), h("div", { class: "v", text: dmax > 0 ? `${dmin}-${dmax}` : "bare hands" }),
          ...RESISTANCES.flatMap(([key, bonus, label]) => [h("div", { text: label }), h("div", { class: "v", text: `${c[key] + itemBonus(c, bonus)}%` })]),
          h("div", { text: "Experience" }), h("div", { class: "v", text: thousands(c.xp) }),
          h("div", { text: "Next level" }), h("div", { class: "v", text: need > 0 ? `${thousands(need)} xp more` : "ready to train" }),
          h("div", { text: "Condition" }), h("div", { class: `v ${conditionClass(c)}`, text: worstCondition(c), title: conditionTitle(c, party.minutes) }),
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
      if (!slot.startsWith("slot") && !classAllows(bag, item)) {
        hooks.log(`${bag.hero!.name} (${bag.hero!.classType}) cannot use ${item.name.trim()}.`, "bad");
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
        if (!classAllows(bag, item)) return hooks.log(`${bag.hero.name} (${bag.hero.classType}) cannot use ${item.name.trim()}.`, "bad");
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

    render();
  });
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
  const cost = spell ? `${spell.mana} SP` : "";
  return {
    label,
    // only the spell is repeated: who it works on (and the element of a protection spell) is asked again
    value: { spellId: quick.spellId },
    note: quick.block ? `${cost} - ${QUICK_CAST_BLOCK[quick.block]}` : cost,
    disabled: quick.block !== null,
    apart: true,
  };
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
      const info = h("div", { class: "spell-info" });
      const describe = (id: number | null): void => {
        clear(info);
        const s = id === null ? undefined : SPELLS[id];
        if (!s || id === null) {
          info.append(h("div", { class: "small", text: "Choose a spell. Point at one to read what it does." }));
          return;
        }
        const short = c.sp < s.mana;
        info.append(
          h("div", { class: "spell-name", text: s.title }),
          h("div", { class: "small", text: `${s.type.join(" / ")} - level ${s.level} - ${s.mana} spell point${s.mana === 1 ? "" : "s"}${short ? " - not enough spell points" : ""}` }),
          h("div", { text: s.text }),
        );
      };
      // alphabetical by name, whatever order the spells were learnt in
      const slots = [...c.spells].sort((a, b) => (SPELLS[a]?.title ?? "").localeCompare(SPELLS[b]?.title ?? "")).map((id) => {
        const s = SPELLS[id]!;
        const ok = isSpellImplemented(id) && c.sp >= s.mana;
        const slot = h(
          "button",
          {
            class: `spell-slot${ok ? "" : " off"}`,
            title: `${s.title} (${s.mana} SP)`,
            onclick: () => {
              if (ok) close(id);
              else sound?.(9014);
            },
          },
          spellPlate(id),
          isPlaceholderIcon(id) ? h("span", { class: "spell-caption", text: s.title }) : null,
          h("span", { class: "spell-cost", text: String(s.mana) }),
        );
        slot.addEventListener("mouseenter", () => describe(id));
        slot.addEventListener("focus", () => describe(id));
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
    const target = await ui.choose(ITEM_SPELLS.has(spellId) ? "Whose backpack?" : "On whom?", "", party.characters.map((ch, i) => ({ label: ch.name, value: i, note: `${ch.hp}/${ch.health} HP, ${ch.conditions.join(", ")}` })));
    if (target === null) return null;
    choice.target = target;
  }
  if (spellId === 47) {
    const distance = await ui.choose("Teleport", "How many fields ahead should the party be carried?", TELEPORT_DISTANCES.map((d) => ({ label: `${d} fields`, value: d })));
    if (distance === null) return null;
    choice.distance = distance;
  }
  if (spellId === 17) {
    const element = await ui.choose("Protect against", "", [
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
