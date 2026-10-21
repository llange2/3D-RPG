import { Rng, seedFromString } from "../core/rng";
import { TEXTS, flowText } from "../data/tables";
import { armor } from "../sim/character";
import {
  AVATAR_COUNT, CLASSES, MAX_NAME_LENGTH, MAX_RESERVE, addRecruit, avatarKey, classRequirement, dismissMember, isEligible, randomName, raceOfAvatar, rollAttributes, swapMember,
  type RosterResult,
} from "../sim/roster";
import type { Attribute, Character, ClassName, Party, RaceName } from "../sim/types";
import { assetPath, clear, h } from "./dom";
import type { UI } from "./ui";

export interface RosterHooks {
  /** The party changed (HUD refresh). */
  changed(): void;
  log(text: string, kind?: "info" | "good" | "bad"): void;
  /** Plays a sound of the old game (9001 click, 9002 dice, 9003 saved, 9014 denied). */
  sound(id: number): void;
}

const ATTRIBUTES: [Attribute, string][] = [
  ["str", "Strength"],
  ["int", "Intelligence"],
  ["per", "Personality"],
  ["end", "Endurance"],
  ["spd", "Speed"],
  ["acc", "Accuracy"],
  ["lck", "Luck"],
];

/** Text ids of the old game: the description of each class and of each race. */
const CLASS_TEXT: Record<ClassName, number> = { Knight: 93, Paladin: 94, Wizard: 95, Thief: 96, Barbarian: 97, Archer: 98, Cleric: 99, Ninja: 100, Druid: 101, Ranger: 102 };
const RACE_TEXT: Record<RaceName, number> = { Human: 88, Elf: 89, Gnome: 90, Dwarf: 91, Orc: 92 };

const REFUSAL: Record<Exclude<RosterResult, { ok: true }>["reason"], string> = {
  no_reserve: "Nobody is waiting in the inn to take the place. Create a hero first.",
  reserve_full: `The inn cannot house more than ${MAX_RESERVE} heroes.`,
  quest_items: "That hero carries quest items. Hand them to somebody else first.",
  not_eligible: "The attributes do not allow that class.",
  no_name: "Every hero needs a name.",
  bad_slot: "There is nobody in that place.",
};

/**
 * The inn's book of heroes (the old CharacterGeneration): roll the attributes of a new hero, pick a class the attributes
 * allow, a portrait (which decides the race) and a name, and keep the hero in the inn. The party of four can be changed
 * with the heroes who wait there. Nothing here is random but the rolls and the names the player asks for.
 */
export function openRoster(ui: UI, party: Party, hooks: RosterHooks): Promise<void> {
  return ui.panel((close, root) => {
    const rng = new Rng(seedFromString(`roster:${Date.now()}:${Math.random()}`));
    let attrs = rollAttributes(rng);
    let chosen: ClassName | null = null;
    let avatar = 1 + rng.int(AVATAR_COUNT);
    let name = randomName(rng);

    const refuse = (r: Exclude<RosterResult, { ok: true }>) => {
      hooks.sound(9014);
      hooks.log(REFUSAL[r.reason], "bad");
    };

    const swap = (slot: number, direction: "next" | "previous") => {
      const r = swapMember(party, slot, direction);
      if (!r.ok) return refuse(r);
      hooks.sound(9001);
      hooks.changed();
      render();
    };

    const dismiss = async (slot: number) => {
      const c = party.characters[slot]!;
      if (party.reserve.length === 0) return refuse({ ok: false, reason: "no_reserve" });
      if (!(await ui.confirm("Send away", `Send ${c.name} away for good?\nEverything ${c.name} carries is lost with the hero.`, "Send away", "Keep"))) return;
      const r = dismissMember(party, slot);
      if (!r.ok) return refuse(r);
      hooks.sound(9001);
      hooks.changed();
      render();
    };

    const reroll = () => {
      attrs = rollAttributes(rng);
      chosen = null;
      hooks.sound(9002);
      render();
    };

    const save = () => {
      if (!chosen) return refuse({ ok: false, reason: "not_eligible" });
      const r = addRecruit(party, { name, classType: chosen, avatar, attrs });
      if (!r.ok) return refuse(r);
      hooks.sound(9003);
      hooks.log(`${name.trim()} waits in the inn.`, "good");
      // a fresh hero for the next one: new portrait and name, new roll
      attrs = rollAttributes(rng);
      chosen = null;
      avatar = avatar < AVATAR_COUNT ? avatar + 1 : 1;
      name = randomName(rng);
      hooks.changed();
      render();
    };

    const memberRow = (c: Character, slot: number) =>
      h(
        "div",
        { class: "member" },
        h("img", { class: "portrait", src: assetPath(`icons/portraits/${c.avatar}.webp`), alt: c.name }),
        h("div", { class: "who" }, h("div", { class: "nm", text: c.name }), h("div", { class: "small", text: `${c.raceType} ${c.classType}, level ${c.level}` }), h("div", { class: "small", text: `${c.health} HP${c.mana > 0 ? `, ${c.mana} SP` : ""}, armor ${armor(c)}` })),
        h(
          "div",
          { class: "row-btns" },
          h("button", { class: "btn", text: "◀", title: "Swap with the previous hero in the inn", disabled: party.reserve.length === 0, onclick: () => swap(slot, "previous") }),
          h("button", { class: "btn", text: "▶", title: "Swap with the next hero in the inn", disabled: party.reserve.length === 0, onclick: () => swap(slot, "next") }),
          h("button", { class: "btn", text: "Send away", title: "The first hero in the inn takes the place", disabled: party.reserve.length === 0, onclick: () => void dismiss(slot) }),
        ),
      );

    const render = () => {
      clear(root);
      const race = raceOfAvatar(avatar);
      const attrRows = ATTRIBUTES.flatMap(([key, label]) => [h("div", { text: label }), h("div", { class: "v", text: String(attrs[key]) })]);
      const classButtons = CLASSES.map((cls) => {
        const ok = isEligible(cls, attrs);
        const { attributes, minimum } = classRequirement(cls);
        const need = attributes.map((a) => a.toUpperCase()).join(" + ");
        return h("button", { class: `btn cls${chosen === cls ? " primary" : ""}${ok ? "" : " off"}`, text: cls, title: `${cls} needs ${need} of ${minimum} or more`, onclick: () => {
          if (!ok) {
            hooks.sound(9014);
            return;
          }
          chosen = cls;
          hooks.sound(9001);
          render();
        } });
      });
      const nameInput = h("input", { type: "text", value: name, placeholder: "name" }) as HTMLInputElement;
      nameInput.maxLength = MAX_NAME_LENGTH;
      nameInput.addEventListener("input", () => {
        name = nameInput.value;
        saveButton.disabled = !chosen || name.trim().length === 0;
      });
      const saveButton = h("button", { class: "btn primary", text: "Keep in the inn", disabled: !chosen || name.trim().length === 0, onclick: save }) as HTMLButtonElement;

      root.append(
        h("button", { class: "btn close", text: "Close (Esc)", onclick: close }),
        h("h2", { text: "The Book of Heroes" }),
        h(
          "div",
          { class: "roster" },
          h(
            "div",
            { class: "sheet" },
            h("h3", { text: "The party" }),
            ...party.characters.map(memberRow),
            h("h3", { text: `Waiting in the inn (${party.reserve.length} of ${MAX_RESERVE})` }),
            party.reserve.length === 0
              ? h("div", { class: "small", text: "Nobody. Create a hero on the right." })
              : h("div", { class: "waiting" }, ...party.reserve.map((c) => h("div", { class: "small", text: `${c.name}, ${c.raceType} ${c.classType}, level ${c.level}` }))),
          ),
          h(
            "div",
            { class: "sheet" },
            h("h3", { text: "A new hero" }),
            h("div", { class: "attrs" }, ...attrRows),
            h("div", { class: "row-btns" }, h("button", { class: "btn", text: "Roll again", onclick: reroll })),
            h("h3", { text: chosen ? `Class: ${chosen}` : "Class: none yet" }),
            h("div", { class: "classes" }, ...classButtons),
            h("div", { class: "small", text: chosen ? flowText(TEXTS[CLASS_TEXT[chosen]]!) : classHint() }),
            h("h3", { text: `Race: ${race}` }),
            h(
              "div",
              { class: "picker" },
              h("button", { class: "btn", text: "◀", onclick: () => ((avatar = avatar > 1 ? avatar - 1 : AVATAR_COUNT), hooks.sound(9001), render()) }),
              h("img", { class: "portrait", src: assetPath(`icons/portraits/${avatarKey(avatar)}.webp`), alt: "" }),
              h("button", { class: "btn", text: "▶", onclick: () => ((avatar = avatar < AVATAR_COUNT ? avatar + 1 : 1), hooks.sound(9001), render()) }),
            ),
            h("div", { class: "small", text: flowText(TEXTS[RACE_TEXT[race]]!) }),
            h("h3", { text: "Name" }),
            h("div", { class: "namerow" }, nameInput, h("button", { class: "btn", text: "Another name", onclick: () => ((name = randomName(rng)), hooks.sound(9002), render()) })),
            h("div", { class: "row-btns" }, saveButton),
          ),
        ),
      );
    };

    /** Which classes the current roll allows, for the empty state. */
    const classHint = (): string => {
      const open = CLASSES.filter((c) => isEligible(c, attrs));
      if (open.length === 0) return "No class accepts these attributes. Roll again.";
      return `The attributes allow: ${open.map((c) => c.toLowerCase()).join(", ")}. Pick one.`;
    };

    render();
  });
}
