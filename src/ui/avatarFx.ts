import { worstCondition } from "../sim/character";
import { assetPath, h } from "./dom";
import type { Character, Condition } from "../sim/types";

/**
 * The pictures the old game lays over a character's portrait (Avatar.avatar_effect, apply_damage_to_character and the
 * active-spell icons of update_gui). Each name is the file `assets/ui/tex_<name>.webp`.
 */
export type AvatarEffect =
  | "cure_hp"
  | "cure_crazy"
  | "cure_curse"
  | "cure_disease"
  | "cure_paralysis"
  | "cure_petrified"
  | "cure_poison"
  | "cure_sleeping"
  | "cure_weak"
  | "acid_hit"
  | "fire_hit"
  | "ice_hit"
  | "magic_hit"
  | "physical_hit"
  | "gui_levitate"
  | "gui_power_shield"
  | "gui_wizard_eye"
  | "gui_protect_acid"
  | "gui_protect_fire"
  | "gui_protect_ice"
  | "gui_protect_magic";

const CURE_OF: Partial<Record<Condition, AvatarEffect>> = {
  Sleeping: "cure_sleeping",
  Weak: "cure_weak",
  Drunk: "cure_weak",
  Poisoned: "cure_poison",
  Crazy: "cure_crazy",
  Diseased: "cure_disease",
  Paralyzed: "cure_paralysis",
  Petrified: "cure_petrified",
  Cursed: "cure_curse",
};

/** The pictures for the conditions a spell took away (one per kind of cure, in the order of the conditions). */
export function cureEffects(removed: readonly Condition[]): AvatarEffect[] {
  return [...new Set(removed.map((c) => CURE_OF[c]).filter((e): e is AvatarEffect => e !== undefined))];
}

/** The picture of a hit; poison counts as acid, everything unknown as physical (like the old match with its default case). */
export function hitEffect(damageType: string): AvatarEffect {
  switch (damageType.toLowerCase()) {
    case "fire":
      return "fire_hit";
    case "ice":
      return "ice_hit";
    case "acid":
    case "poison":
      return "acid_hit";
    case "magic":
      return "magic_hit";
    default:
      return "physical_hit";
  }
}

export function protectionEffect(element: "acid" | "fire" | "ice" | "magic"): AvatarEffect {
  return `gui_protect_${element}`;
}

/** The picture suffix of a condition (the old `match` in Avatar.update_avatars); `null` shows the hero's plain portrait. */
const PORTRAIT_SUFFIX: Partial<Record<Condition, string>> = {
  Blessed: "_Blessed",
  Crazy: "_Crazy",
  Cursed: "_Cursed",
  Weak: "_Cursed",
  Diseased: "_Diseased",
  Drunk: "_Drunk",
  Lovestruck: "_Drunk",
  Paralyzed: "_Paralyzed",
  Petrified: "_Petrified",
  Poisoned: "_Poisoned",
  Sleeping: "_Sleeping",
  Unconscious: "_Sleeping",
};

/**
 * A portrait picture that falls back to the hero's plain portrait when the file of the condition is missing (the old game has
 * no `character17_Crazy`, for one).
 */
export function portraitImage(c: Pick<Character, "avatar" | "conditions" | "name">, className = "portrait"): HTMLImageElement {
  const file = portraitOf(c);
  const img = h("img", { class: className, src: assetPath(`icons/portraits/${file}.webp`), alt: c.name });
  img.addEventListener("error", () => {
    const plain = assetPath(`icons/portraits/${c.avatar}.webp`);
    if (!img.src.endsWith(plain.replace(/^\./, ""))) img.src = plain;
  }, { once: true });
  return img;
}

/** Portrait file (without extension, relative to `icons/portraits`) of a hero, as the worst of their conditions shows it. */
export function portraitOf(c: Pick<Character, "avatar" | "conditions">): string {
  const worst = worstCondition(c as Character);
  // the dead and the rotten have one picture for everybody
  if (worst === "Dead") return "character00_Dead";
  if (worst === "Rotten") return "character00_Rotten";
  return `${c.avatar}${PORTRAIT_SUFFIX[worst] ?? ""}`;
}
