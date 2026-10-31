import { describe, expect, it } from "vitest";
import { Rng, seedFromString } from "../../src/core/rng";
import { addCondition, removeCondition, worstCondition } from "../../src/sim/character";
import { CONDITION_TIMERS, conditionEventText, minutesToDeath, restartCondition, seedConditionTimers } from "../../src/sim/conditions";
import { castSpell, needsTarget } from "../../src/sim/spells";
import { advanceTime, createDefaultParty, normalizeParty, rest } from "../../src/sim/party";
import { conditionClass, conditionTitle, deathNote } from "../../src/ui/conditionInfo";

const HOUR = 60;
const DAY = 1440;

describe("timed conditions (the old GameTimer events)", () => {
  it("lets poison, disease and madness kill after two, three and four days", () => {
    const party = createDefaultParty();
    const [a, b, c] = party.characters as [(typeof party.characters)[0], (typeof party.characters)[0], (typeof party.characters)[0]];
    addCondition(a, "Poisoned", party.minutes);
    addCondition(b, "Diseased", party.minutes);
    addCondition(c, "Crazy", party.minutes);
    expect(advanceTime(party, 2 * DAY - 1).conditions).toEqual([]);
    const first = advanceTime(party, 1).conditions;
    expect(first).toEqual([{ character: 0, condition: "Poisoned", outcome: "died" }]);
    expect(a.conditions).toEqual(["Dead"]);
    expect(a.hp).toBe(0);
    expect(advanceTime(party, DAY).conditions).toEqual([{ character: 1, condition: "Diseased", outcome: "died" }]);
    expect(advanceTime(party, DAY).conditions).toEqual([{ character: 2, condition: "Crazy", outcome: "died" }]);
    expect(c.conditionDue).toEqual({});
  });

  it("takes two hours off the time to live every time the poison strikes again", () => {
    const party = createDefaultParty();
    const c = party.characters[0]!;
    addCondition(c, "Poisoned", party.minutes);
    expect(minutesToDeath(c, party.minutes)).toBe(2 * DAY);
    advanceTime(party, 5 * HOUR);
    addCondition(c, "Poisoned", party.minutes);
    expect(minutesToDeath(c, party.minutes)).toBe(2 * DAY - 5 * HOUR - 2 * HOUR);
    for (let i = 0; i < 20; i++) addCondition(c, "Poisoned", party.minutes);
    expect(c.conditions).toEqual(["Poisoned"]); // still one condition
    // 21 strikes in all, two hours each, and five hours have passed: one hour is left
    expect(minutesToDeath(c, party.minutes)).toBe(2 * DAY - 5 * HOUR - 21 * 2 * HOUR);
  });

  it("takes the shortest of the deadly timers for the death clock, and none for the healthy or the dead", () => {
    const party = createDefaultParty();
    const c = party.characters[0]!;
    expect(minutesToDeath(c, party.minutes)).toBeNull();
    addCondition(c, "Crazy", party.minutes);
    expect(minutesToDeath(c, party.minutes)).toBe(4 * DAY);
    addCondition(c, "Diseased", party.minutes);
    expect(minutesToDeath(c, party.minutes)).toBe(3 * DAY);
    addCondition(c, "Drunk", party.minutes); // drink does not kill
    expect(minutesToDeath(c, party.minutes)).toBe(3 * DAY);
    advanceTime(party, 4 * DAY);
    expect(c.conditions.includes("Dead")).toBe(true);
    expect(minutesToDeath(c, party.minutes)).toBeNull();
  });

  it("turns drink into weakness after twelve hours, and weakness fades after a day; each new drink adds two hours", () => {
    const party = createDefaultParty();
    const c = party.characters[1]!;
    addCondition(c, "Drunk", party.minutes);
    addCondition(c, "Drunk", party.minutes);
    expect(c.conditionDue!.Drunk).toBe(party.minutes + 12 * HOUR + 2 * HOUR);
    expect(advanceTime(party, 14 * HOUR - 1).conditions).toEqual([]);
    expect(advanceTime(party, 1).conditions).toEqual([{ character: 1, condition: "Drunk", outcome: "weak" }]);
    expect(c.conditions).toEqual(["Weak"]);
    expect(worstCondition(c)).toBe("Weak");
    // weakness lasts a day from the moment it began
    expect(advanceTime(party, DAY - 1).conditions).toEqual([]);
    expect(advanceTime(party, 1).conditions).toEqual([{ character: 1, condition: "Weak", outcome: "ended" }]);
    expect(c.conditions).toEqual(["Healthy"]);
  });

  it("lets sleep end after eight hours, two more for every new strike", () => {
    const party = createDefaultParty();
    const c = party.characters[2]!;
    addCondition(c, "Sleeping", party.minutes);
    addCondition(c, "Sleeping", party.minutes);
    expect(advanceTime(party, 10 * HOUR - 1).conditions).toEqual([]);
    expect(advanceTime(party, 1).conditions).toEqual([{ character: 2, condition: "Sleeping", outcome: "ended" }]);
    expect(c.conditions).toEqual(["Healthy"]);
  });

  it("starts lovestruck over at two days and leaves cursed and paralysed without a timer", () => {
    const party = createDefaultParty();
    const c = party.characters[0]!;
    addCondition(c, "Lovestruck", party.minutes);
    advanceTime(party, DAY);
    addCondition(c, "Lovestruck", party.minutes);
    expect(c.conditionDue!.Lovestruck).toBe(party.minutes + 2 * DAY);
    addCondition(c, "Cursed", party.minutes);
    addCondition(c, "Paralyzed", party.minutes);
    expect(c.conditionDue!.Cursed).toBeUndefined();
    advanceTime(party, 100 * DAY);
    expect(c.conditions).toEqual(expect.arrayContaining(["Cursed", "Paralyzed"]));
    expect(c.conditions).not.toContain("Lovestruck");
  });

  it("forgets the timer when the condition is cured, and starts it over with the Suppress spells", () => {
    const party = createDefaultParty();
    const c = party.characters[0]!;
    addCondition(c, "Poisoned", party.minutes);
    removeCondition(c, "Poisoned");
    expect(c.conditionDue!.Poisoned).toBeUndefined();
    expect(c.conditions).toEqual(["Healthy"]);
    expect(restartCondition(c, "Poisoned", party.minutes)).toBe(false); // nothing to suppress

    addCondition(c, "Poisoned", party.minutes);
    advanceTime(party, DAY);
    expect(minutesToDeath(c, party.minutes)).toBe(DAY);
    expect(restartCondition(c, "Poisoned", party.minutes)).toBe(true);
    expect(minutesToDeath(c, party.minutes)).toBe(2 * DAY);
  });

  it("casts Suppress Poison as a reset, not a cure, and Cure Poison as a cure", () => {
    const party = createDefaultParty();
    const lyneth = party.characters.findIndex((c) => c.name === "Lyneth");
    const druid = party.characters[lyneth]!;
    druid.spells.push(11, 35);
    druid.sp = 50;
    const patient = party.characters[0]!;
    addCondition(patient, "Poisoned", party.minutes);
    advanceTime(party, DAY);
    expect(needsTarget(11)).toBe(true);
    const rng = new Rng(seedFromString("suppress"));
    expect(castSpell(party, lyneth, 11, rng, { target: 0 })).toEqual({ kind: "suppress", target: 0, condition: "Poisoned" });
    expect(patient.conditions).toEqual(["Poisoned"]);
    expect(minutesToDeath(patient, party.minutes)).toBe(2 * DAY);
    expect(castSpell(party, lyneth, 11, rng, { target: 1 })).toEqual({ kind: "suppress", target: 1, condition: null });
    expect(castSpell(party, lyneth, 35, rng, { target: 0 })).toMatchObject({ kind: "cure", removed: ["Poisoned"] });
    expect(patient.conditions).toEqual(["Healthy"]);
  });

  it("lets a night's rest wake the sleepers but neither cure drink nor stop the clock for poison", () => {
    const party = createDefaultParty();
    party.food = 5;
    const [drunk, asleep, poisoned] = party.characters as [(typeof party.characters)[0], (typeof party.characters)[0], (typeof party.characters)[0]];
    addCondition(drunk, "Drunk", party.minutes);
    addCondition(asleep, "Sleeping", party.minutes);
    addCondition(poisoned, "Poisoned", party.minutes);
    const r = rest(party);
    expect(r.ok).toBe(true);
    expect(drunk.conditions).toEqual(["Drunk"]);
    expect(asleep.conditions).toEqual(["Healthy"]);
    expect(poisoned.conditions).toEqual(["Poisoned"]);
    expect(minutesToDeath(poisoned, party.minutes)).toBe(2 * DAY - 8 * HOUR);
  });

  it("lets poison kill a hero during the rest", () => {
    const party = createDefaultParty();
    party.food = 5;
    const c = party.characters[0]!;
    addCondition(c, "Poisoned", party.minutes);
    for (let i = 0; i < 20; i++) addCondition(c, "Poisoned", party.minutes); // 20 × 2 h: only 8 hours left
    expect(minutesToDeath(c, party.minutes)).toBe(2 * DAY - 40 * HOUR);
    const r = rest(party);
    expect(r.conditions).toEqual([{ character: 0, condition: "Poisoned", outcome: "died" }]);
    expect(c.conditions).toEqual(["Dead"]);
  });

  it("starts the timers of a save that has none, and names what happened for the log", () => {
    const party = createDefaultParty();
    const c = party.characters[0]!;
    c.conditions = ["Poisoned", "Drunk"]; // a save from before the timers
    delete c.conditionDue;
    normalizeParty(party);
    expect(c.conditionDue).toEqual({ Poisoned: party.minutes + 2 * DAY, Drunk: party.minutes + 12 * HOUR });
    seedConditionTimers(party); // a second run changes nothing
    expect(c.conditionDue!.Poisoned).toBe(party.minutes + 2 * DAY);
    expect(conditionEventText("Maximus", { character: 0, condition: "Poisoned", outcome: "died" })).toBe("Maximus dies of poison.");
    expect(conditionEventText("Maximus", { character: 0, condition: "Drunk", outcome: "weak" })).toBe("Maximus sobers up, but feels weak.");
    expect(conditionEventText("Maximus", { character: 0, condition: "Sleeping", outcome: "ended" })).toBe("Maximus wakes up.");
  });

  it("words the death clock in whole hours (eleventh playtest, point 9)", () => {
    const party = createDefaultParty();
    const c = party.characters[0]!;
    expect(conditionTitle(c, party.minutes)).toBe("");
    addCondition(c, "Poisoned", party.minutes);
    expect(conditionTitle(c, party.minutes)).toBe("Dies in >48 hours");
    advanceTime(party, 40 * HOUR + 30);
    expect(conditionTitle(c, party.minutes)).toBe("Dies in >7 hours");
    advanceTime(party, 6 * HOUR + 30);
    expect(deathNote(minutesToDeath(c, party.minutes)!)).toBe("Dies in >1 hour");
    advanceTime(party, 30); // half an hour left
    expect(conditionTitle(c, party.minutes)).toBe("Dies in <1 hour");
    addCondition(c, "Drunk", party.minutes);
    expect(conditionTitle(c, party.minutes)).toBe("Poisoned: Dies in <1 hour\nDrunk");
    expect(conditionClass(c)).toBe("cond-bad");
    expect(deathNote(8 * HOUR + 59)).toBe("Dies in >8 hours");
  });

  it("keeps the durations of the old game", () => {
    expect(Object.fromEntries(Object.entries(CONDITION_TIMERS).map(([k, v]) => [k, v.minutes]))).toEqual({
      Poisoned: 2 * DAY,
      Diseased: 3 * DAY,
      Crazy: 4 * DAY,
      Drunk: 12 * HOUR,
      Weak: DAY,
      Sleeping: 8 * HOUR,
      Lovestruck: 2 * DAY,
    });
  });
});
