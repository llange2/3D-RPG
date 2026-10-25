/**
 * Heroes, equipment and parties for the balance tool. Equipment is rolled with the game's own item generator (`generateItem`,
 * `generateRing`), so material bonuses, ring affixes and armor values are the real ones; only the choice of what a hero wears is ours.
 */
import { Rng, seedFromString } from "../../src/core/rng";
import { BASE_CLASS, BASE_RACE, CONSTANTS, SPELLS, type SpellDef } from "../../src/data/tables";
import { generateItem, generateRing } from "../../src/sim/items";
import type { Item } from "../../src/sim/types";
import type { ClassName, RaceName } from "../../src/sim/types";
import { ATTRS, type Attr, type HeroStats } from "./formulas";

export const CLASSES: ClassName[] = ["Knight", "Paladin", "Barbarian", "Ninja", "Thief", "Ranger", "Archer", "Cleric", "Druid", "Wizard"];
export const RACES: RaceName[] = ["Human", "Elf", "Dwarf", "Gnome", "Orc"];

type Attrs = Record<Attr, number>;
const A = (str: number, int: number, per: number, end: number, spd: number, acc: number, lck: number): Attrs => ({ str, int, per, end, spd, acc, lck });

/** Starting attributes and the usual race per class. The first five are the heroes of the old game, the others follow their class requirements. */
export const TEMPLATES: Record<ClassName, { race: RaceName; attrs: Attrs }> = {
  Knight: { race: "Orc", attrs: A(21, 8, 12, 20, 16, 14, 10) },
  Ninja: { race: "Dwarf", attrs: A(16, 12, 11, 15, 20, 20, 19) },
  Archer: { race: "Human", attrs: A(15, 20, 11, 14, 13, 20, 12) },
  Druid: { race: "Gnome", attrs: A(8, 19, 20, 18, 14, 10, 13) },
  Barbarian: { race: "Dwarf", attrs: A(18, 7, 12, 21, 16, 17, 14) },
  Paladin: { race: "Human", attrs: A(18, 10, 16, 17, 12, 13, 12) },
  Cleric: { race: "Human", attrs: A(10, 12, 20, 16, 12, 12, 14) },
  Wizard: { race: "Elf", attrs: A(7, 21, 12, 12, 14, 13, 15) },
  Thief: { race: "Gnome", attrs: A(13, 12, 10, 13, 17, 19, 21) },
  Ranger: { race: "Elf", attrs: A(14, 13, 14, 16, 15, 13, 12) },
};

export interface HeroSpec {
  cls: ClassName;
  race: RaceName;
}

export const defaultSpec = (cls: ClassName): HeroSpec => ({ cls, race: TEMPLATES[cls].race });

/** How the attributes grow with the level. The game has no automatic growth (shrines, rings and potions only), so this stands for all of them. */
export interface Growth {
  /** Value every attribute reaches at `atLevel` (never lowered for attributes that start higher). */
  to: number;
  atLevel: number;
}
export const GROWTH_USER: Growth = { to: 40, atLevel: 50 };
export const GROWTH_NONE: Growth = { to: 0, atLevel: 1 };

export function attrsAt(spec: HeroSpec, level: number, growth: Growth): Attrs {
  const t = TEMPLATES[spec.cls].attrs;
  const share = growth.atLevel <= 1 ? 0 : Math.min(1, Math.max(0, (level - 1) / (growth.atLevel - 1)));
  const out = { ...t };
  for (const a of ATTRS) out[a] = Math.round(t[a] + Math.max(0, growth.to - t[a]) * share);
  return out;
}

// ---------------------------------------------------------------- equipment

/** What the party wears. `material` 1 wood .. 8 obsidian, `bodyCap` the best body armor (1 robe .. 8 plate) it can afford. */
export interface GearSpec {
  name: string;
  material: number;
  bodyCap: number;
  /** Ring level 0 = no rings; rings are rolled by the game's generator. */
  ringLevel: number;
  /** "rolled": two random rings of up to `ringLevel`; "best": the best two of 40 rolls of exactly that level. */
  rings: "none" | "rolled" | "best";
  bow: boolean;
  /** "auto" picks one-hander with shield or two-hander by score; "1h" and "2h" force it. */
  hands?: "auto" | "1h" | "2h";
}

export const GEAR: Record<string, GearSpec> = {
  none: { name: "none", material: 1, bodyCap: 1, ringLevel: 0, rings: "none", bow: false },
  starter: { name: "starter", material: 2, bodyCap: 3, ringLevel: 0, rings: "none", bow: true },
  t1: { name: "t1", material: 2, bodyCap: 3, ringLevel: 1, rings: "rolled", bow: true },
  t2: { name: "t2", material: 3, bodyCap: 4, ringLevel: 2, rings: "rolled", bow: true },
  t3: { name: "t3", material: 4, bodyCap: 5, ringLevel: 3, rings: "rolled", bow: true },
  t4: { name: "t4", material: 5, bodyCap: 6, ringLevel: 4, rings: "rolled", bow: true },
  t5: { name: "t5", material: 6, bodyCap: 7, ringLevel: 5, rings: "rolled", bow: true },
  b1: { name: "b1", material: 4, bodyCap: 8, ringLevel: 3, rings: "best", bow: true },
  b2: { name: "b2", material: 5, bodyCap: 8, ringLevel: 4, rings: "best", bow: true },
  b3: { name: "b3", material: 6, bodyCap: 8, ringLevel: 5, rings: "best", bow: true },
  b4: { name: "b4", material: 7, bodyCap: 8, ringLevel: 6, rings: "best", bow: true },
  b5: { name: "b5", material: 8, bodyCap: 8, ringLevel: 7, rings: "best", bow: true },
};

/** The gear that fits a tier: typical (average loot and shops) or best (the best the tier can drop). */
/**
 * A gear spec from a name: `none`, `starter`, `t3` (typical for tier 3), `b3` (best of tier 3), with optional suffixes
 * `:2h` (two-handers only), `:1h` (one-handers with shield), `:norings`, `:nobow`, e.g. `b4:2h:norings`.
 */
export function gearByName(name: string): GearSpec {
  const [base, ...mods] = name.split(":");
  const spec = GEAR[base!];
  if (!spec) throw new Error("unknown gear " + name + " (known: " + Object.keys(GEAR).join(", ") + ")");
  const out: GearSpec = { ...spec, name };
  for (const m of mods) {
    if (m === "2h" || m === "1h") out.hands = m;
    else if (m === "norings") out.rings = "none";
    else if (m === "nobow") out.bow = false;
    else throw new Error("unknown gear suffix " + m);
  }
  return out;
}

export const gearForTier = (tier: number, best = false): GearSpec => GEAR[`${best ? "b" : "t"}${Math.min(5, Math.max(1, Math.round(tier)))}`]!;

interface Kinds {
  /** `forcedType` number by item type name. */
  byType: Map<string, number>;
}
const kinds: Kinds = (() => {
  const byType = new Map<string, number>();
  const r = new Rng(seedFromString("balance:kinds"));
  for (let n = 1; n <= 35; n++) byType.set(generateItem(r, 1, { forcedMaterial: 1, forcedType: n }).type, n);
  return { byType };
})();

const BODY_ORDER = ["robe", "padded_armor", "leather_armor", "scale_armor", "ring_mail", "chain_mail", "splint_mail", "plate_armor"];
const ONE_HAND = new Set(CONSTANTS.WEAPON_TYPES_1H);
const TWO_HAND = new Set(CONSTANTS.WEAPON_TYPES_2H);
const RANGED = new Set(CONSTANTS.RANGED_WEAPON_TYPES);

export interface Gear {
  armor: number;
  weaponMin: number;
  weaponMax: number;
  rangedMin: number;
  rangedMax: number;
  ringDamMin: number;
  ringDamMax: number;
  bonus: Record<string, number>;
  /** For reports: the pieces by slot. */
  pieces: Record<string, Item | null>;
}

const sum = (items: (Item | null)[], key: string): number => items.reduce((s, i) => s + ((i?.bonus as Record<string, number> | undefined)?.[key] ?? 0), 0);

const gearCache = new Map<string, Gear>();

/** Rolls and equips a hero of a class with the gear of a spec. Deterministic in (class, spec, salt). */
export function buildGear(cls: ClassName, spec: GearSpec, salt = 0): Gear {
  const key = `${cls}|${spec.name}|${salt}`;
  const cached = gearCache.get(key);
  if (cached) return cached;
  const valid = new Set(BASE_CLASS[cls]!.valid_items);
  const rng = new Rng(seedFromString(`balance:gear:${key}`));
  const make = (type: string, material = spec.material): Item => generateItem(rng, 1, { forcedMaterial: material, forcedType: kinds.byType.get(type)! });
  const avg = (i: Item, lo: string, hi: string) => ((i.bonus as Record<string, number>)[lo]! + (i.bonus as Record<string, number>)[hi]!) / 2;

  const pieces: Record<string, Item | null> = { helmet: null, body_armor: null, left_hand: null, right_hand: null, belt: null, left_ring: null, right_ring: null, boots: null, ranged_weapon: null };
  if (spec.material > 0 && spec.name !== "none") {
    // body armor: the best the budget allows, else the lightest the class may wear
    const allowed = BODY_ORDER.map((t, i) => ({ t, i: i + 1 })).filter((b) => valid.has(b.t));
    const body = [...allowed].reverse().find((b) => b.i <= spec.bodyCap) ?? allowed[0];
    if (body) pieces.body_armor = make(body.t);
    if (valid.has("helmet")) pieces.helmet = make("helmet");
    else if (valid.has("tiara")) pieces.helmet = make("tiara");
    if (valid.has("boots")) pieces.boots = make("boots");
    if (valid.has("belt")) pieces.belt = make("belt");
    // weapon: the best one-hander with a shield, or the best two-hander without; the shield's armor is worth about 0.6 damage a point
    const shield = valid.has("shield") ? make("shield") : null;
    const melee = [...valid]
      .filter((t) => (ONE_HAND.has(t) && spec.hands !== "2h") || (TWO_HAND.has(t) && spec.hands !== "1h"))
      .map((t) => ({ t, item: make(t) }));
    const score = (m: { t: string; item: Item }) => avg(m.item, "dam_min", "dam_max") + (ONE_HAND.has(m.t) && shield ? 0.6 * (shield.bonus.arm ?? 0) : 0);
    const best = melee.sort((a, b) => score(b) - score(a))[0];
    if (best) {
      pieces.left_hand = best.item;
      if (ONE_HAND.has(best.t)) pieces.right_hand = shield;
    }
    if (spec.bow) {
      const bows = [...valid].filter((t) => RANGED.has(t)).map((t) => make(t));
      pieces.ranged_weapon = bows.sort((a, b) => avg(b, "ranged_dam_min", "ranged_dam_max") - avg(a, "ranged_dam_min", "ranged_dam_max"))[0] ?? null;
    }
    if (spec.rings !== "none" && spec.ringLevel > 0 && valid.has("ring")) {
      const rolled: Item[] = [];
      if (spec.rings === "rolled") for (let i = 0; i < 2; i++) rolled.push(generateRing(rng, rng.range(1, spec.ringLevel)));
      else {
        const pool = Array.from({ length: 40 }, () => generateRing(rng, spec.ringLevel));
        const worth = (r: Item) => (r.bonus.dam_min ?? 0) * 3 + (r.bonus.arm ?? 0) * 1.5 + (r.bonus.end ?? 0) * 0.6 + (r.bonus.str ?? 0) * 0.5 + (r.bonus.acc ?? 0) * 0.4;
        rolled.push(...pool.sort((a, b) => worth(b) - worth(a)).slice(0, 2));
      }
      pieces.left_ring = rolled[0] ?? null;
      pieces.right_ring = rolled[1] ?? null;
    }
  }
  const worn = Object.values(pieces);
  const bonus: Record<string, number> = {};
  for (const k of ["str", "int", "per", "end", "spd", "acc", "lck", "res_fire", "res_ice", "res_acid", "res_magic"]) bonus[k] = sum(worn, k);
  const rings = [pieces.left_ring ?? null, pieces.right_ring ?? null];
  const gear: Gear = {
    armor: sum(worn, "arm"),
    weaponMin: sum(worn, "dam_min"),
    weaponMax: sum(worn, "dam_max"),
    rangedMin: sum(worn, "ranged_dam_min"),
    rangedMax: sum(worn, "ranged_dam_max"),
    ringDamMin: sum(rings, "dam_min"),
    ringDamMax: sum(rings, "dam_max"),
    bonus,
    pieces,
  };
  gearCache.set(key, gear);
  return gear;
}

// ---------------------------------------------------------------- stats

export interface Hero extends HeroStats {
  spec: HeroSpec;
}

/**
 * `BALANCE_WEAPON="t5:57,b5:57"` sets the mean melee weapon damage of a gear tier (end-game weapons are stronger than what the item generator
 * gives the typical gear of the tier). The melee spread stays, the bow is scaled by the same factor as the melee weapon.
 */
const WEAPON_MEAN = new Map<string, number>((process.env.BALANCE_WEAPON ?? "").split(",").filter(Boolean).map((p) => [p.split(":")[0]!, Number(p.split(":")[1])]));

export function makeHero(spec: HeroSpec, level: number, growth: Growth, gear: GearSpec, salt = 0): Hero {
  const cls = BASE_CLASS[spec.cls]!;
  const race = BASE_RACE[spec.race]!;
  const attrs = attrsAt(spec, level, growth);
  const g0 = buildGear(spec.cls, gear, salt);
  const g = { ...g0 };
  const wanted = WEAPON_MEAN.get(gear.name);
  if (wanted !== undefined && g0.weaponMax > 0) {
    const mean = (g0.weaponMin + g0.weaponMax) / 2;
    const shift = wanted - mean;
    g.weaponMin = g0.weaponMin + shift;
    g.weaponMax = g0.weaponMax + shift;
    const factor = wanted / Math.max(1, mean);
    g.rangedMin = g0.rangedMin * factor;
    g.rangedMax = g0.rangedMax * factor;
  }
  const gearAttr = { str: g.bonus.str!, int: g.bonus.int!, per: g.bonus.per!, end: g.bonus.end!, spd: g.bonus.spd!, acc: g.bonus.acc!, lck: g.bonus.lck! };
  return {
    spec,
    cls: spec.cls,
    race: spec.race,
    level,
    ...attrs,
    gear: gearAttr,
    armor: g.armor,
    damMin: g.weaponMin,
    damMax: g.weaponMax,
    ringDamMin: g.ringDamMin,
    ringDamMax: g.ringDamMax,
    // rings carry `dam_min/max` only; the game adds them to the shot as well
    rangedMin: g.rangedMin + g.ringDamMin,
    rangedMax: g.rangedMax + g.ringDamMax,
    classHp: cls.base_hp,
    raceHp: race.base_hp,
    raceMana: race.base_mana,
    classMelee: cls.base_melee,
    classRanged: cls.base_ranged,
    res: { fire: race.res_fire + g.bonus.res_fire!, ice: race.res_ice + g.bonus.res_ice!, acid: race.res_acid + g.bonus.res_acid!, magic: race.res_magic + g.bonus.res_magic! },
  };
}

// ---------------------------------------------------------------- spells

export const SCHOOL: Partial<Record<ClassName, string>> = { Wizard: "Arcane", Archer: "Arcane", Cleric: "Clerical", Paladin: "Clerical", Druid: "Nature", Ranger: "Nature" };

export interface AttackSpell {
  def: SpellDef;
  min: number;
  max: number;
  scales: boolean;
  penetrating: boolean;
  /** Star Burst: hits every monster near the target. */
  area: boolean;
  types: string[];
  mana: number;
  /** Moon Ray also heals every hero by this much. */
  healAll: number;
}
export interface HealSpell {
  def: SpellDef;
  min: number;
  max: number;
  scales: boolean;
  mana: number;
}

/** Attack spells the engine knows how to model: everything with damage that needs no special rule except the undead-only ones. */
const SKIP_ATTACK = new Set([19, 69, 43, 64]);
const HEAL_IDS = new Set([4, 7, 27, 28]);

export function spellsOf(cls: ClassName, level: number): { attack: AttackSpell[]; heal: HealSpell[] } {
  const school = SCHOOL[cls];
  const attack: AttackSpell[] = [];
  const heal: HealSpell[] = [];
  if (!school) return { attack, heal };
  for (const s of Object.values(SPELLS)) {
    if (!s.type.includes(school) || s.level > level) continue;
    if (HEAL_IDS.has(s.id)) heal.push({ def: s, min: s.heal_min, max: s.heal_max, scales: s.scales_with_level, mana: s.mana });
    else if (s.dam_max !== undefined && !SKIP_ATTACK.has(s.id)) {
      const pen = (s as unknown as { penetrating?: boolean }).penetrating ?? false;
      attack.push({
        def: s,
        min: s.dam_min ?? s.dam_max,
        max: s.dam_max,
        scales: s.scales_with_level,
        penetrating: pen,
        area: s.id === 76,
        types: s.dam_type ?? ["magic"],
        mana: s.mana,
        healAll: s.id === 60 ? 50 : 0,
      });
    }
  }
  return { attack, heal };
}

// ---------------------------------------------------------------- parties

export interface PartyDef {
  name: string;
  members: HeroSpec[];
}

const P = (name: string, ...cls: ClassName[]): PartyDef => ({ name, members: cls.map(defaultSpec) });

/** The party of the old game and a handful of typical line-ups. */
export const PARTIES: PartyDef[] = [
  P("Standard (Knight, Ninja, Archer, Druid)", "Knight", "Ninja", "Archer", "Druid"),
  P("Nahkampf (Knight, Barbarian, Paladin, Cleric)", "Knight", "Barbarian", "Paladin", "Cleric"),
  P("Zauberer (Wizard, Cleric, Druid, Archer)", "Wizard", "Cleric", "Druid", "Archer"),
  P("Fernkampf (Archer, Ranger, Ninja, Thief)", "Archer", "Ranger", "Ninja", "Thief"),
  P("Klassisch (Knight, Paladin, Cleric, Wizard)", "Knight", "Paladin", "Cleric", "Wizard"),
  P("Ausgewogen (Knight, Thief, Cleric, Wizard)", "Knight", "Thief", "Cleric", "Wizard"),
  P("Vier Krieger (Knight x2, Barbarian x2)", "Knight", "Knight", "Barbarian", "Barbarian"),
  P("Vier Bogner (Archer x2, Ranger x2)", "Archer", "Archer", "Ranger", "Ranger"),
];

/** Every multiset of four classes (715 line-ups). */
export function allClassMultisets(): ClassName[][] {
  const out: ClassName[][] = [];
  for (let a = 0; a < 10; a++) for (let b = a; b < 10; b++) for (let c = b; c < 10; c++) for (let d = c; d < 10; d++) out.push([CLASSES[a]!, CLASSES[b]!, CLASSES[c]!, CLASSES[d]!]);
  return out;
}
