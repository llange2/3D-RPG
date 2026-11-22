import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Rng, seedFromString } from "../../src/core/rng";
import { MONSTERS, SPELLS, monsterGroup } from "../../src/data/tables";
import { EQUIPMENT_MODELS, STICK_MODEL, STICK_MONSTERS } from "../../src/data/equipment";
import { USER_MONSTER_MODELS } from "../../src/data/monster-models";
import { ACID_SPRAY_ARMOR_SHARE, PAIN_GROUPS, TOXIC_RADIUS, TOXIC_TURNS, areaSpell, createEncounter, createMonster, isPainable, monsterArmor, monsterTurn, specialSpell, spellInLine, type CombatEvent, type Encounter, type GridView, type MonsterInstance } from "../../src/sim/encounter";
import { createDefaultParty } from "../../src/sim/party";
import { castSpell, isAreaSpell, isAttackSpell, spellCost } from "../../src/sim/spells";
import { MIXAMO_GRIP } from "../../src/render/equipment";
import { PROJECTILE_MODELS } from "../../src/render/projectiles";
import type { Party } from "../../src/sim/types";

/** bug_fix_79 (22. 11. 2026): the Evil Ranger's staff, the models of the Black Knight and the Evil Ranger, and the spells that `docs/SPELLS.md` marked "updated". */

const rng = (s: string) => new Rng(seedFromString(s));
const open: GridView = { walkable: () => true, water: () => false, opaque: () => false };
const root = join(__dirname, "..", "..");

function party(): Party {
  const p = createDefaultParty();
  for (const c of p.characters) c.hp = c.health = 999999;
  const druid = p.characters[3]!;
  druid.spells = Array.from({ length: 78 }, (_, i) => i + 1);
  druid.mana = druid.sp = 5000;
  druid.level = 4;
  return p;
}

function fight(monsters: [number, number, number][]): Encounter {
  const enc = createEncounter();
  monsters.forEach(([id, x, y], i) => enc.monsters.push(createMonster(`m${i}`, id, x, y)));
  return enc;
}

const ids = (pred: (m: (typeof MONSTERS)[number]) => boolean) => Object.values(MONSTERS).filter(pred).map((m) => m.id);
const damageOf = (events: CombatEvent[]): Map<string, number> => {
  const out = new Map<string, number>();
  for (const e of events) if (e.type === "party_attack") out.set(e.uid, (out.get(e.uid) ?? 0) + e.damage);
  return out;
};
const alive = (enc: Encounter, uid: string): MonsterInstance | undefined => enc.monsters.find((m) => m.uid === uid);
/** A monster with armor, no resistance to acid, fire or physical and plenty of health: nothing it stands in kills it in a test. */
const tough = ids((m) => m.armor >= 20 && m.res_acid === 0 && m.res_fire === 0 && m.res_physical === 0 && m.health >= 100)[0]!;

describe("the Evil Ranger and the Black Knight (points 1 and 2)", () => {
  it("both are models of the user, built from his files, and the sources carry the names of what they show", () => {
    expect(USER_MONSTER_MODELS[24]).toEqual({ file: "new:Evil_Ranger", scale: 1.4 });
    expect(USER_MONSTER_MODELS[3]).toEqual({ file: "new:Black_Knight", scale: 2.2 });
    expect(MONSTERS[24]!.name).toBe("Evil Ranger");
    expect(MONSTERS[3]!.name).toBe("Black Knight");
    for (const file of ["Evil_Ranger.glb", "Black_Knight.glb", "Wooden_Stick.glb", "Snakes.glb"]) expect(existsSync(join(root, "tools", "assets", "sources", "models", file)), file).toBe(true);
    const registry = JSON.parse(readFileSync(join(root, "public", "assets", "models.monsters.original.json"), "utf-8")) as Record<string, { animated: boolean; file: string; scale: number }>;
    for (const id of [24, 3]) {
      expect(registry[String(id)]!.animated).toBe(true);
      expect(registry[String(id)]!.scale).toBe(USER_MONSTER_MODELS[id]!.scale);
      expect(existsSync(join(root, "public", "assets", registry[String(id)]!.file))).toBe(true);
    }
  });

  it("the Evil Ranger holds the staff in his right hand by a measured grip, in the middle of the hand", () => {
    expect(STICK_MONSTERS.has(24)).toBe(true);
    expect(STICK_MONSTERS.size).toBe(1);
    expect(EQUIPMENT_MODELS).toContain(STICK_MODEL);
    const grip = MIXAMO_GRIP[STICK_MODEL]!;
    // the staff's middle (its origin) lies in the palm: 6 centimetres along the fingers, nothing across
    expect(grip.position).toEqual([0, 6, 0]);
    expect(grip.scale).toBeGreaterThan(0);
    const [x, y, z, w] = grip.rotation;
    expect(Math.hypot(x, y, z, w)).toBeCloseTo(1, 3);
    const statics = JSON.parse(readFileSync(join(root, "public", "assets", "models.static.original.json"), "utf-8")) as Record<string, { file: string }>;
    expect(existsSync(join(root, "public", "assets", statics[STICK_MODEL]!.file))).toBe(true);
  });
});

describe("the numbers of docs/SPELLS.md reach the game (point 3a)", () => {
  it("Flying Fist, Energy Blast, Sparks, Pain, Toxic Cloud, Acid Stream, Summon Snakes, Acid Spray, Fireball and Dancing Sword", () => {
    expect([SPELLS[5]!.mana, SPELLS[5]!.dam_min, SPELLS[5]!.dam_max]).toEqual([3, 6, 10]);
    expect(SPELLS[8]!.mana).toBe(4);
    expect([SPELLS[10]!.mana, SPELLS[10]!.dam_min, SPELLS[10]!.dam_max]).toEqual([3, 2, 3]);
    expect([SPELLS[12]!.mana, SPELLS[12]!.dam_min, SPELLS[12]!.dam_max, SPELLS[12]!.scales_with_level]).toEqual([4, 2, 6, true]);
    expect([SPELLS[14]!.mana, SPELLS[14]!.dam_min, SPELLS[14]!.dam_type]).toEqual([15, 10, ["acid"]]);
    expect([SPELLS[15]!.mana, SPELLS[15]!.penetrating]).toEqual([15, true]);
    expect(SPELLS[37]!.title).toBe("Summon Snakes");
    expect([SPELLS[37]!.mana, SPELLS[37]!.dam_min, SPELLS[37]!.dam_max, SPELLS[37]!.dam_type]).toEqual([10, 4, 6, ["acid"]]);
    expect(SPELLS[38]!.mana).toBe(10);
    expect(SPELLS[44]!.mana).toBe(10);
    expect(SPELLS[63]!.mana).toBe(15);
    // Power Cure keeps the mana the user set in the 57th playtest
    expect(SPELLS[28]!.mana).toBe(4);
  });

  it("a spell that scales costs half its mana for each level of the caster, rounded up (Dancing Sword at level 4: 30)", () => {
    expect(spellCost(SPELLS[63]!, { level: 4 })).toBe(30);
    expect(spellCost(SPELLS[37]!, { level: 4 })).toBe(20);
    expect(spellCost(SPELLS[14]!, { level: 4 })).toBe(15);
  });

  it("the texts are the table's, with the cost sentence of a spell that scales", () => {
    expect(SPELLS[37]!.text).toBe("Does 4-6 acid damage per caster level to all monsters in a straight line. Costs 5 mana per caster level (rounded up).");
    expect(SPELLS[63]!.text).toContain("Costs 7.5 mana per caster level");
    expect(SPELLS[2]!.text).toContain("Can be cast 3 times a day.");
    for (const spell of Object.values(SPELLS)) expect(spell.text, `spell ${spell.id}`).not.toMatch(/â|€|ist chance|unabled|Paralysed/);
  });
});

describe("Pain (12)", () => {
  const beast = ids((m) => monsterGroup(m.id) === "beast" && m.treasure_level === 1)[0]!;
  const humanoid = ids((m) => monsterGroup(m.id) === "humanoid" && m.treasure_level === 1)[0]!;
  const other = ids((m) => !PAIN_GROUPS.includes(monsterGroup(m.id)) && m.treasure_level === 1 && m.res_physical === 0)[0]!;

  it("scales with the level, hits a line and is aimed at a monster", () => {
    const result = castSpell(party(), 3, 12, rng("pain"));
    expect(result).toMatchObject({ kind: "attack", special: "pain", penetrate: false });
    expect(isAttackSpell(12)).toBe(true);
    if (result.kind !== "attack") return;
    // 2 to 6 for each of the druid's 4 levels
    expect(result.damage).toBeGreaterThanOrEqual(8);
    expect(result.damage).toBeLessThanOrEqual(24);
  });

  it("hurts the beasts and the humanoids on the line and passes over every other monster", () => {
    expect(isPainable(beast)).toBe(true);
    expect(isPainable(humanoid)).toBe(true);
    expect(isPainable(other)).toBe(false);
    const enc = fight([[beast, 1, 0], [other, 2, 0], [humanoid, 3, 0], [beast, 1, 3]]);
    const events = specialSpell(party(), open, enc, 0, 0, rng("pain"), "pain", "m0", { damage: 20, type: "physical" });
    const hit = damageOf(events);
    expect([...hit.keys()].sort()).toEqual(["m0", "m2"]);
  });
});

describe("Acid Stream (15) and Summon Snakes (37)", () => {
  it("are beams: they hit every monster on the line through the target", () => {
    for (const id of [15, 37]) {
      const result = castSpell(party(), 3, id, rng("beam"));
      expect(result, `spell ${id}`).toMatchObject({ kind: "attack", penetrate: true, type: "acid" });
      expect((result as { special?: string }).special).toBeUndefined();
      const enc = fight([[tough, 1, 0], [tough, 3, 0], [tough, 2, 4]]);
      const events = spellInLine(party(), open, enc, 0, 0, rng("beam"), "m0", { damage: 25, type: "acid" }, null);
      expect([...damageOf(events).keys()].sort()).toEqual(["m0", "m1"]);
    }
  });
});

describe("Acid Spray (38)", () => {
  it("is an area spell: it needs no target and hits what the party sees ahead", () => {
    expect(isAreaSpell(38)).toBe(true);
    expect(isAttackSpell(38)).toBe(false);
    const result = castSpell(party(), 3, 38, rng("spray"));
    expect(result).toMatchObject({ kind: "attack", special: "acid_spray", damage: 15, type: "acid" });
    const enc = fight([[tough, 1, 0], [tough, 0, -3], [tough, -4, 2]]);
    // the party sees the first two, the third is behind it
    const events = areaSpell(party(), open, enc, 0, 0, rng("spray"), "acid_spray", { damage: 15, type: "acid" }, (m) => m.x >= 0);
    expect([...damageOf(events).keys()].sort()).toEqual(["m0", "m1"]);
    expect(damageOf(events).get("m0")).toBe(15);
  });

  it("takes a tenth of the monster's own armor with every hit, and never more than all of it", () => {
    const armor = MONSTERS[tough]!.armor;
    const enc = fight([[tough, 1, 0]]);
    const spray = () => areaSpell(party(), open, enc, 0, 0, rng("spray"), "acid_spray", { damage: 1, type: "acid" });
    const events = spray();
    const m = alive(enc, "m0")!;
    expect(m.armorCuts).toBe(1);
    expect(monsterArmor(m)).toBe(armor - Math.round(armor * ACID_SPRAY_ARMOR_SHARE));
    expect(events).toContainEqual({ type: "monster_armor", uid: "m0", defId: tough, armor: monsterArmor(m) });
    for (let i = 0; i < 12; i++) {
      m.hp = MONSTERS[tough]!.health;
      spray();
    }
    expect(monsterArmor(m)).toBe(0);
  });
});

describe("Toxic Cloud (14)", () => {
  /** One monster turn, the way the game runs it: the party stands at (0, 0) and the monsters answer. */
  const turn = (p: Party, enc: Encounter): CombatEvent[] => monsterTurn(p, open, enc, 0, 0, rng("turn"));
  const cast = (p: Party, enc: Encounter, view: GridView = open): CombatEvent[] => areaSpell(p, view, enc, 0, 0, rng("cloud"), "toxic_cloud", { damage: 10, type: "acid" });
  /** What the poison did in these events, one number for each time it worked on a monster. */
  const ticks = (events: CombatEvent[]): number[] => events.flatMap((e) => (e.type === "party_attack" && e.poison ? [e.damage] : []));

  it("is an area spell that reaches every monster in the radius of five tiles, through walls, and none beyond it", () => {
    expect(isAreaSpell(14)).toBe(true);
    const result = castSpell(party(), 3, 14, rng("cloud"));
    expect(result).toMatchObject({ kind: "attack", special: "toxic_cloud", damage: 10, type: "acid" });
    const walls: GridView = { ...open, opaque: () => true };
    const enc = fight([[tough, 4, 3], [tough, -5, 0], [tough, 4, 4], [tough, 0, 6]]);
    const events = cast(party(), enc, walls);
    // (4, 3) and (-5, 0) lie on the circle, (4, 4) and (0, 6) outside it
    expect(events.filter((e) => e.type === "monster_poisoned").map((e) => (e as { uid: string }).uid).sort()).toEqual(["m0", "m1"]);
    expect(TOXIC_RADIUS).toBe(5);
    // the cast does no damage of its own: all there is in its round is the first turn of the poison, on the two poisoned monsters
    expect(events.filter((e) => e.type === "party_attack").every((e) => (e as { poison?: boolean }).poison === true)).toBe(true);
    expect([...damageOf(events).keys()].sort()).toEqual(["m0", "m1"]);
    expect(alive(enc, "m2")!.poison).toBeUndefined();
    expect(alive(enc, "m3")!.poison).toBeUndefined();
  });

  it("does 10 acid damage at the end of each of the next three monster turns (the round of the cast is the first), then stops", () => {
    const p = party();
    const enc = fight([[tough, 3, 3]]);
    const start = alive(enc, "m0")!.hp;
    const all = [...ticks(cast(p, enc))];
    for (let i = 0; i < 5; i++) all.push(...ticks(turn(p, enc)));
    expect(TOXIC_TURNS).toBe(3);
    expect(all).toEqual([10, 10, 10]);
    expect(alive(enc, "m0")!.poison).toBeUndefined();
    // (the health went down by thirty and nothing regenerated)
    expect(start - alive(enc, "m0")!.hp).toBe(30);
  });

  it("stacks: a second cast adds a dose that lasts exactly three turns of its own", () => {
    const p = party();
    const enc = fight([[tough, 3, 3]]);
    const all: number[] = [];
    all.push(...ticks(cast(p, enc)), ...ticks(turn(p, enc)));
    expect(all).toEqual([10, 10]);
    // one turn of the first dose is left; the second joins it
    const second = cast(p, enc);
    expect(second).toContainEqual(expect.objectContaining({ type: "monster_poisoned", stacks: 2 }));
    all.push(...ticks(second));
    for (let i = 0; i < 4; i++) all.push(...ticks(turn(p, enc)));
    // two doses in the round of the second cast, then the second one alone for its two last turns
    expect(all).toEqual([10, 10, 20, 10, 10]);
  });

  it("kills a monster that the poison brings down, with the experience and the loot of any other kill", () => {
    const p = party();
    const weak = ids((m) => m.res_acid === 0 && m.health <= 10 && m.treasure_level === 1)[0];
    if (weak === undefined) return;
    const enc = fight([[weak, 3, 3]]);
    const xp = p.characters.reduce((sum, c) => sum + c.xp, 0);
    const events = cast(p, enc);
    expect(events.some((e) => e.type === "monster_dead")).toBe(true);
    expect(enc.monsters).toHaveLength(0);
    expect(p.characters.reduce((sum, c) => sum + c.xp, 0)).toBeGreaterThanOrEqual(xp);
  });

  it("a monster in another dimension takes nothing until it is back", () => {
    const p = party();
    const enc = fight([[tough, 3, 3]]);
    cast(p, enc);
    const m = alive(enc, "m0")!;
    m.phased = 2;
    const before = m.hp;
    expect(ticks(turn(p, enc))).toEqual([]);
    expect(m.hp).toBe(before);
    expect(m.poison).toHaveLength(1);
  });
});

describe("Fireball (44)", () => {
  it("is aimed at a monster and hits it and every monster next to it, diagonals too, and nobody else", () => {
    expect(isAttackSpell(44)).toBe(true);
    expect(isAreaSpell(44)).toBe(false);
    const result = castSpell(party(), 3, 44, rng("ball"));
    expect(result).toMatchObject({ kind: "attack", special: "fireball", type: "fire" });
    const enc = fight([[tough, 3, 0], [tough, 4, 1], [tough, 3, 1], [tough, 2, 0], [tough, 5, 0], [tough, 3, 2]]);
    const events = specialSpell(party(), open, enc, 0, 0, rng("ball"), "fireball", "m0", { damage: 30, type: "fire" });
    // the target at (3, 0), its neighbours at (4, 1), (3, 1) and (2, 0); (5, 0) and (3, 2) are two tiles from it
    expect([...damageOf(events).keys()].sort()).toEqual(["m0", "m1", "m2", "m3"]);
    expect([...damageOf(events).values()].every((d) => d === 30)).toBe(true);
  });
});

describe("Dancing Sword (63)", () => {
  it("is an area spell of physical blows on everything the party sees", () => {
    expect(isAreaSpell(63)).toBe(true);
    const result = castSpell(party(), 3, 63, rng("sword"));
    expect(result).toMatchObject({ kind: "attack", special: "dancing_sword", type: "physical" });
    if (result.kind !== "attack") return;
    // 6 to 14 for each of the druid's 4 levels
    expect(result.damage).toBeGreaterThanOrEqual(24);
    expect(result.damage).toBeLessThanOrEqual(56);
    const enc = fight([[tough, 2, 0], [tough, 0, 4], [tough, -3, 0]]);
    const events = areaSpell(party(), open, enc, 0, 0, rng("sword"), "dancing_sword", { damage: 40, type: "physical" }, (m) => m.x >= 0);
    expect([...damageOf(events).keys()].sort()).toEqual(["m0", "m1"]);
  });
});

describe("Meteor Shower (72) and Elemental Storm (75)", () => {
  it("hit what the party could see in every direction: a monster behind a wall is spared", () => {
    expect(isAreaSpell(72) && isAreaSpell(75)).toBe(true);
    for (const kind of ["meteor_shower", "elemental_storm"] as const) {
      const enc = fight([[tough, 2, 0], [tough, -3, 0], [tough, 0, 5]]);
      // the party sees all but the monster at (-3, 0)
      const events = areaSpell(party(), open, enc, 0, 0, rng(kind), kind, { damage: 100, type: "fire" }, (m) => m.x > -3);
      expect([...damageOf(events).keys()].sort(), kind).toEqual(["m0", "m2"]);
    }
  });
});

describe("the assets of the spells and the models", () => {
  it("the snakes are a projectile model that is loaded with the game, and the new picture is in the spell sheet", () => {
    expect(PROJECTILE_MODELS).toContain("proj_snakes");
    const statics = JSON.parse(readFileSync(join(root, "public", "assets", "models.static.original.json"), "utf-8")) as Record<string, { file: string }>;
    expect(existsSync(join(root, "public", "assets", statics["proj_snakes"]!.file))).toBe(true);
    expect(existsSync(join(root, "tools", "assets", "sources", "ui", "spell_summon_snakes.png"))).toBe(true);
  });
});
