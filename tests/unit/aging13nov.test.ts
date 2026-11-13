import { describe, expect, it } from "vitest";
import { Rng, seedFromString } from "../../src/core/rng";
import { MONSTERS, monsterGroup } from "../../src/data/tables";
import { OLD_AGE, addMagicAge, agingShare, anyoneOld, birthdays, cureAgeCost, refreshAge, templeCureAge } from "../../src/sim/aging";
import { MINUTES_PER_YEAR, ageOf, attr, baseValue, resistance } from "../../src/sim/character";
import { conditionEventText } from "../../src/sim/conditions";
import { templeRevive } from "../../src/sim/economy";
import { PHASE_TURNS, phaseMonsters, type Encounter } from "../../src/sim/encounter";
import { advanceTime, createDefaultParty } from "../../src/sim/party";
import { castSpell } from "../../src/sim/spells";
import type { Party } from "../../src/sim/types";

const rng = (s: string) => new Rng(seedFromString(s));

/** The default party; the Druid (index 3) knows every spell and has plenty of spell points. */
function party(): Party {
  const p = createDefaultParty();
  const druid = p.characters[3]!;
  druid.spells = Array.from({ length: 78 }, (_, i) => i + 1);
  druid.mana = druid.sp = 500;
  druid.level = 4;
  return p;
}

/** Makes a hero `years` old (natural age) at the party's clock. */
function age(p: Party, index: number, years: number): void {
  p.characters[index]!.born = p.minutes - years * MINUTES_PER_YEAR;
}

describe("13 Nov 2026, point 1: Dimensional Phasing shifts every monster once", () => {
  const beast = Object.entries(MONSTERS).find(([id]) => monsterGroup(Number(id)) !== "robot" && MONSTERS[Number(id)]!.terrain === "land")!;
  const encounter = (): Encounter => ({
    monsters: [{ uid: "b", defId: Number(beast[0]), x: 1, y: 0, hp: beast[1].health }, { uid: "c", defId: Number(beast[0]), x: 0, y: 1, hp: beast[1].health }] as never,
    battleMode: false,
    sequence: [],
    attacker: null,
  });

  it("the second cast leaves the monsters that were shifted before and takes the new ones", () => {
    const e = encounter();
    expect(phaseMonsters(e, 0, 0)).toHaveLength(2);
    for (const m of e.monsters) m.phased = undefined; // the five turns are over
    expect(phaseMonsters(e, 0, 0)).toHaveLength(0);
    e.monsters.push({ uid: "d", defId: Number(beast[0]), x: 1, y: 1, hp: beast[1].health } as never);
    const caught = phaseMonsters(e, 0, 0);
    expect(caught.map((m) => m.uid)).toEqual(["d"]);
    expect(caught[0]!.phased).toBe(PHASE_TURNS);
  });
});

describe("13 Nov 2026, point 3: the curve of old age", () => {
  it("is 0 below 80 and follows 1 / (1 + e^(-0.1874 (age - 104.5))) from there", () => {
    expect(agingShare(79)).toBe(0);
    for (const a of [80, 90, 100, 104, 110, 120, 150]) {
      expect(agingShare(a)).toBeCloseTo(1 / (1 + Math.exp(-0.1874 * (a - 104.5))), 5);
    }
    expect(agingShare(100)).toBeCloseTo(0.3, 2);
    expect(agingShare(300)).toBeLessThan(1);
  });
});

describe("13 Nov 2026, point 3b: the base values shrink and come back", () => {
  it("shows raw x (1 - share), so that 10 new points are 7 at 100 years", () => {
    const p = party();
    const c = p.characters[0]!;
    c.str = 100;
    c.resFire = 50;
    age(p, 0, 100);
    refreshAge(p, c);
    expect(c.ageShare).toBeCloseTo(0.3, 2);
    expect(baseValue(c, "str")).toBe(Math.round(100 * (1 - c.ageShare!)));
    expect(attr(c, "str")).toBe(baseValue(c, "str") + 0);
    const before = baseValue(c, "str");
    c.str += 10;
    expect(baseValue(c, "str") - before).toBe(Math.round(110 * (1 - c.ageShare!)) - Math.round(100 * (1 - c.ageShare!)));
    expect(resistance(c, "fire")).toBeLessThan(50);
    // younger again: everything is back
    age(p, 0, 40);
    refreshAge(p, c);
    expect(c.ageShare).toBeUndefined();
    expect(baseValue(c, "str")).toBe(110);
    expect(resistance(c, "fire")).toBe(50);
  });

  it("lowers health with Endurance and keeps the hit points below it", () => {
    const p = party();
    const c = p.characters[0]!;
    c.hp = c.health;
    const health = c.health;
    age(p, 0, 120);
    refreshAge(p, c);
    expect(c.health).toBeLessThan(health);
    expect(c.hp).toBe(c.health);
  });
});

describe("13 Nov 2026, point 3a: dying of old age", () => {
  it("nobody below 80 rolls, a birthday at 150 kills for sure in practice, and the death is final", () => {
    const p = party();
    age(p, 0, 70);
    const before = p.minutes;
    p.minutes += 5 * MINUTES_PER_YEAR;
    expect(birthdays(p, before)).toEqual([]);
    expect(p.characters[0]!.diedOfAge).toBeUndefined();

    const q = party();
    age(q, 1, 149);
    const t0 = q.minutes;
    const passed = advanceTime(q, 2 * MINUTES_PER_YEAR);
    const dead = q.characters[1]!;
    expect(dead.diedOfAge).toBe(true);
    expect(dead.conditions).toEqual(["Dead"]);
    expect(dead.hp).toBe(0);
    const event = passed.conditions.find((e) => e.name === dead.name)!;
    expect(event.outcome).toBe("died");
    expect(conditionEventText(dead.name, event)).toBe(`${dead.name} dies of old age and cannot be resurrected.`);
    expect(q.minutes).toBeGreaterThan(t0);
  });

  it("a hero who died of old age rolls no more and cannot age by magic", () => {
    const p = party();
    age(p, 1, 149);
    advanceTime(p, 2 * MINUTES_PER_YEAR);
    const dead = p.characters[1]!;
    const rolls = dead.ageRolls;
    advanceTime(p, 5 * MINUTES_PER_YEAR);
    expect(dead.ageRolls).toBe(rolls);
    expect(addMagicAge(p, dead, 10)).toEqual({ died: false });
    expect(dead.magicAge ?? 0).toBe(0);
  });

  it("the roll is the same after loading a save (the seed holds the hero and the count)", () => {
    const outcome = () => {
      const p = party();
      age(p, 0, 90);
      return addMagicAge(p, p.characters[0]!, 1).died;
    };
    expect(outcome()).toBe(outcome());
  });

  it("magical years are one roll at the new age and add to the sum", () => {
    const p = party();
    age(p, 0, 60);
    const c = p.characters[0]!;
    expect(addMagicAge(p, c, 10)).toEqual({ died: false });
    expect(ageOf(c, p.minutes).total).toBe(70);
    expect(c.ageRolls).toBeUndefined();
    expect(OLD_AGE).toBe(80);
    expect(anyoneOld(p)).toBe(false);
    addMagicAge(p, c, 10);
    expect(anyoneOld(p)).toBe(true);
    expect(c.ageRolls).toBe(1);
  });
});

describe("13 Nov 2026, no way back from old age, except through the temple", () => {
  const diedOfAge = (): Party => {
    const p = party();
    age(p, 0, 70);
    const c = p.characters[0]!;
    c.magicAge = 40;
    advanceTime(p, MINUTES_PER_YEAR); // 71 + 40 = 111 years: a very likely death, and the seed is fixed
    if (!c.diedOfAge) {
      c.magicAge = 120;
      p.minutes += MINUTES_PER_YEAR;
      birthdays(p, p.minutes - MINUTES_PER_YEAR);
    }
    return p;
  };

  it("Raise Dead and the temple refuse, Divine Intervention leaves the hero dead", () => {
    const p = diedOfAge();
    const c = p.characters[0]!;
    expect(c.diedOfAge).toBe(true);
    expect(castSpell(p, 3, 65, rng("a"), { target: 0 })).toMatchObject({ kind: "fizzle", reason: "died_of_age", who: c.name });
    p.gold = 1_000_000_000;
    expect(templeRevive(p, 0, 1)).toBe(false);
    p.characters[3]!.magicAge = 0;
    const result = castSpell(p, 3, 78, rng("a"), {});
    expect(result.kind).toBe("intervention");
    expect(c.conditions).toEqual(["Dead"]);
    expect(c.hp).toBe(0);
  });

  it("the temple takes the magical years off for 100 000 gold each and the hero is plain Dead then", () => {
    const p = diedOfAge();
    const c = p.characters[0]!;
    const years = c.magicAge!;
    expect(cureAgeCost(c)).toBe(years * 100_000);
    p.gold = cureAgeCost(c) - 1;
    expect(templeCureAge(p, 0)).toBe(false);
    p.gold = cureAgeCost(c);
    expect(templeCureAge(p, 0)).toBe(true);
    expect(p.gold).toBe(0);
    expect(c.magicAge).toBe(0);
    expect(c.diedOfAge).toBeUndefined();
    expect(c.conditions).toEqual(["Dead"]);
    p.gold = 1_000_000;
    expect(templeRevive(p, 0, 1)).toBe(true);
    expect(c.hp).toBeGreaterThan(0);
  });

  it("the caster of Divine Intervention gets five years and may die of them", () => {
    const p = party();
    age(p, 3, 140);
    const caster = p.characters[3]!;
    const result = castSpell(p, 3, 78, rng("a"), {});
    expect(caster.magicAge).toBe(5);
    expect(result).toMatchObject({ kind: "intervention" });
    // 145 years: the death is nearly sure
    expect(caster.diedOfAge).toBe(true);
    expect((result as { casterDied?: boolean }).casterDied).toBe(true);
  });
});
