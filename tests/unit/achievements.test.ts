import { describe, expect, it } from "vitest";
import { ACHIEVEMENTS, QUEST_ACHIEVEMENT } from "../../src/data/achievements";
import { QUESTS } from "../../src/data/quest-table";
import {
  achOf, counterUnlocks, creditLedger, emptyLedger, emptyProfile, gainGold, heroUnlocks, isFullyObsidian, notePassword, parseProfile, percentDone, progressOf, unlockIn,
} from "../../src/sim/achievements";
import { ageOf } from "../../src/sim/character";
import { buyBackItem, buyItem, sellItem, sellPrice, shopPrice, type SoldItem } from "../../src/sim/economy";
import { makeItem } from "../../src/sim/items";
import { MINUTES_PER_WEEK, advanceTime, createDefaultParty } from "../../src/sim/party";
import { EQUIPMENT_SLOTS, type Party } from "../../src/sim/types";

const obsidian = (type: string) => makeItem({ name: "Obsidian thing", type, material: 8 });
const SLOT_TYPES: Record<string, string> = { helmet: "helmet", body_armor: "plate", left_hand: "sword", right_hand: "shield", belt: "belt", boots: "boots", ranged_weapon: "bow" };

function dressInObsidian(party: Party, index = 0): void {
  const c = party.characters[index]!;
  for (const slot of EQUIPMENT_SLOTS) c.inventory[slot] = SLOT_TYPES[slot] ? obsidian(SLOT_TYPES[slot]!) : null;
}

describe("the profile in the browser's storage", () => {
  it("reads nothing, damaged JSON and foreign values as an empty or cleaned profile", () => {
    expect(parseProfile(null)).toEqual(emptyProfile());
    expect(parseProfile("{not json")).toEqual(emptyProfile());
    expect(parseProfile("[]")).toEqual(emptyProfile());
    const p = parseProfile(JSON.stringify({ unlocked: { rich: "2026-11-20", nonsense: "x" }, unseen: ["rich", "nonsense", "king", 7], totals: { gold: "much", artifacts: 4, riddles: -3 }, seen: { g1: { goldIn: 5, artifacts: "x" } } }));
    expect(Object.keys(p.unlocked)).toEqual(["rich"]);
    // an unseen entry must be an achievement that dropped
    expect(p.unseen).toEqual(["rich"]);
    expect(p.totals).toEqual({ gold: 0, artifacts: 4, riddles: 0, dungeons: 0 });
    expect(p.seen.g1).toEqual({ goldIn: 5, goldBack: 0, artifacts: 0, riddles: 0, dungeons: 0 });
  });

  it("has 25 achievements with names, descriptions and the four counters of the spec", () => {
    expect(ACHIEVEMENTS).toHaveLength(25);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(25);
    expect(ACHIEVEMENTS.filter((a) => a.counter).map((a) => [a.id, a.counter!.target])).toEqual([["rich", 1_000_000_000], ["antiquity", 30], ["riddles", 30], ["adventurers", 100]]);
  });

  it("counts the percentage of the ones that dropped and shows a full bar for a counter that dropped", () => {
    const p = emptyProfile();
    expect(percentDone(p)).toBe(0);
    unlockIn(p, "king", "x");
    unlockIn(p, "rich", "x");
    expect(percentDone(p)).toBe(8);
    expect(unlockIn(p, "king", "y")).toBe(false);
    expect(unlockIn(p, "nothing", "y")).toBe(false);
    expect(progressOf(p, "king")).toBeNull();
    expect(progressOf(p, "rich")).toEqual({ value: 1_000_000_000, target: 1_000_000_000 });
    p.totals.riddles = 12;
    expect(progressOf(p, "riddles")).toEqual({ value: 12, target: 30 });
  });
});

describe("the counters are credited above the high-water mark of a game", () => {
  it("does not count the same thing twice after an older save is loaded", () => {
    const profile = emptyProfile();
    const ledger = emptyLedger();
    ledger.artifacts = 3;
    ledger.goldIn = 5_000_000;
    expect(creditLedger(profile, "g1", ledger)).toBe(true);
    expect(profile.totals.artifacts).toBe(3);
    expect(profile.totals.gold).toBe(5_000_000);
    // the player loads the save from before, opens the same king's chest and hands in the same artifacts again
    const older = { ...emptyLedger(), artifacts: 1, goldIn: 1_000_000 };
    expect(creditLedger(profile, "g1", older)).toBe(false);
    older.artifacts = 3;
    older.goldIn = 5_000_000;
    expect(creditLedger(profile, "g1", older)).toBe(false);
    expect(profile.totals).toEqual({ gold: 5_000_000, artifacts: 3, riddles: 0, dungeons: 0 });
    // only what goes beyond counts
    older.artifacts = 4;
    expect(creditLedger(profile, "g1", older)).toBe(true);
    expect(profile.totals.artifacts).toBe(4);
  });

  it("keeps the games apart, takes bought-back gold off once, and never goes below zero", () => {
    const profile = emptyProfile();
    creditLedger(profile, "a", { ...emptyLedger(), goldIn: 100, goldBack: 0 });
    creditLedger(profile, "b", { ...emptyLedger(), goldIn: 50 });
    expect(profile.totals.gold).toBe(150);
    creditLedger(profile, "a", { ...emptyLedger(), goldIn: 100, goldBack: 30 });
    creditLedger(profile, "a", { ...emptyLedger(), goldIn: 100, goldBack: 30 });
    expect(profile.totals.gold).toBe(120);
    creditLedger(profile, "c", { ...emptyLedger(), goldIn: 0, goldBack: 999 });
    expect(profile.totals.gold).toBe(0);
    expect(creditLedger(profile, "", { ...emptyLedger(), goldIn: 5 })).toBe(false);
  });

  it("forgets the oldest games, not the one being played", () => {
    const profile = emptyProfile();
    for (let i = 0; i < 130; i++) creditLedger(profile, `g${i}`, { ...emptyLedger(), riddles: 1 });
    expect(Object.keys(profile.seen)).toHaveLength(100);
    expect(profile.seen.g129).toBeDefined();
    expect(profile.seen.g0).toBeUndefined();
  });

  it("drops the counter achievements at their targets, once", () => {
    const profile = emptyProfile();
    profile.totals = { gold: 999_999_999, artifacts: 30, riddles: 29, dungeons: 100 };
    expect(counterUnlocks(profile)).toEqual(["antiquity", "adventurers"]);
    profile.totals.gold += 1;
    unlockIn(profile, "antiquity", "x");
    expect(counterUnlocks(profile)).toEqual(["rich", "adventurers"]);
  });
});

describe("the gold of the game's ledger", () => {
  it("counts income, bank interest and sales, but not withdrawals or what the party was only shown", () => {
    const party = createDefaultParty();
    gainGold(party, 400);
    expect(party.gold).toBe(2400);
    gainGold(party, 0);
    gainGold(party, -5);
    expect(party.gold).toBe(2400);
    party.bankGold = 1_000_000;
    advanceTime(party, MINUTES_PER_WEEK);
    expect(party.bankGold).toBe(1_005_000);
    expect(achOf(party).ledger.goldIn).toBe(400 + 5000);
  });

  it("counts a sale, takes it off again on a buy-back, and does not count the resale of what a shop sold", () => {
    const party = createDefaultParty();
    const c = party.characters[0]!;
    const found = makeItem({ name: "Found sword", type: "sword", value: 400 });
    c.inventory.slot1 = found;
    expect(sellItem(party, 0, "slot1")).toBe(true);
    expect(achOf(party).ledger.goldIn).toBe(200);
    const sold: SoldItem = { item: found, price: 200, counted: true };
    expect(buyBackItem(party, sold)).toEqual({ ok: true });
    expect(achOf(party).ledger.goldBack).toBe(200);
    // buy from the smith and sell it back: gold changes hands, the ledger does not move
    const stockItem = makeItem({ name: "Smith sword", type: "sword", value: 400 });
    const before = achOf(party).ledger.goldIn;
    expect(buyItem(party, { item: stockItem, shelf: "weapons", price: 800 })).toEqual({ ok: true });
    const bought = party.characters.flatMap((h) => Object.values(h.inventory)).find((i) => i?.name === "Smith sword")!;
    expect(bought.bought).toBe(true);
    const holder = party.characters.findIndex((h) => Object.values(h.inventory).includes(bought));
    expect(sellItem(party, holder, Object.entries(party.characters[holder]!.inventory).find(([, i]) => i === bought)![0])).toBe(true);
    expect(achOf(party).ledger.goldIn).toBe(before);
    // and its buy-back takes nothing off: the sale was never counted
    const goldBack = achOf(party).ledger.goldBack;
    expect(buyBackItem(party, { item: bought, price: 200, counted: false })).toEqual({ ok: true });
    expect(achOf(party).ledger.goldBack).toBe(goldBack);
  });
});

describe("the smith's prices follow the talents (the user's table, 20. 11. 2026)", () => {
  const price = (talents: string[], value: number) => {
    const party = createDefaultParty();
    party.talents = talents;
    return { buy: shopPrice(value, party), sell: sellPrice(makeItem({ name: "x", type: "sword", value }), party) };
  };

  it("sells at 200 / 150 / 100 and buys at 50 / 75 / 100 for a piece worth 100", () => {
    expect(price([], 100)).toEqual({ buy: 200, sell: 50 });
    expect(price(["talent_bargainer"], 100)).toEqual({ buy: 150, sell: 75 });
    expect(price(["talent_merchant"], 100)).toEqual({ buy: 100, sell: 100 });
  });

  it("never lets a party gain gold by buying and selling the same piece", () => {
    for (const talents of [[], ["talent_bargainer"], ["talent_merchant"], ["talent_bargainer", "talent_merchant"]]) {
      for (const value of [1, 7, 99, 100, 101, 12345]) {
        const { buy, sell } = price(talents, value);
        expect(sell, `${talents.join("+")} ${value}`).toBeLessThanOrEqual(buy);
      }
    }
  });

  it("pays half the value for a spell scroll whatever the talents", () => {
    const party = createDefaultParty();
    party.talents = ["talent_merchant"];
    expect(sellPrice(makeItem({ name: "Scroll", type: "spell", value: 1000, spellId: 1 }), party)).toBe(500);
  });
});

describe("what the heroes show", () => {
  it("drops Black is beautiful only with obsidian in every slot of weapons and armor", () => {
    const party = createDefaultParty();
    const c = party.characters[0]!;
    expect(isFullyObsidian(c)).toBe(false);
    dressInObsidian(party);
    expect(isFullyObsidian(c)).toBe(true);
    c.inventory.boots!.material = 7;
    expect(isFullyObsidian(c)).toBe(false);
    c.inventory.boots!.material = 11; // treasure level 8 makes material 9 to 11, which is obsidian too
    expect(isFullyObsidian(c)).toBe(true);
    c.inventory.ranged_weapon = null;
    expect(isFullyObsidian(c)).toBe(false);
  });

  it("finds level 100, age 80 (also of a hero who died of it), the three conditions and the obsidian, and stops looking when all have dropped", () => {
    const party = createDefaultParty();
    const none = (_: string) => false;
    expect(heroUnlocks(party, none)).toEqual([]);
    party.characters[0]!.level = 100;
    party.characters[1]!.conditions = ["Poisoned", "Diseased", "Crazy"];
    party.characters[2]!.conditions = ["Poisoned", "Diseased"];
    party.characters[3]!.born = party.minutes - 80 * 144_000; // born 80 years of 144 000 minutes ago
    party.characters[3]!.conditions = ["Dead"];
    party.characters[3]!.diedOfAge = true;
    expect(ageOf(party.characters[3]!, party.minutes).total).toBeGreaterThanOrEqual(80);
    dressInObsidian(party, 2);
    expect(heroUnlocks(party, none).sort()).toEqual(["obsidian", "retire", "sick", "unstoppable"]);
    expect(heroUnlocks(party, (id) => id === "retire" || id === "sick")).toEqual(["unstoppable", "obsidian"]);
    expect(heroUnlocks(party, () => true)).toEqual([]);
  });

  it("needs all three conditions on one hero, not spread over the party", () => {
    const party = createDefaultParty();
    party.characters[0]!.conditions = ["Poisoned"];
    party.characters[1]!.conditions = ["Diseased"];
    party.characters[2]!.conditions = ["Crazy"];
    expect(heroUnlocks(party, (id) => id !== "sick")).toEqual([]);
  });
});

describe("taverns and quests", () => {
  it("counts three different passwords, not one told three times", () => {
    const party = createDefaultParty();
    expect(notePassword(party, "12")).toBe(false);
    expect(notePassword(party, "12")).toBe(false);
    expect(notePassword(party, "40")).toBe(false);
    expect(notePassword(party, "7")).toBe(true);
    expect(achOf(party).passwords).toEqual(["12", "40", "7"]);
  });

  it("gives every quest of the table (but the spaceship) an achievement", () => {
    for (const id of Object.keys(QUESTS)) expect(QUEST_ACHIEVEMENT[id], id).toBeDefined();
    for (const id of Object.values(QUEST_ACHIEVEMENT)) expect(ACHIEVEMENTS.some((a) => a.id === id), id).toBe(true);
  });

  it("loads a save from before the achievements: no ach, and a game id is made on demand", () => {
    const party = createDefaultParty();
    delete (party as { ach?: unknown }).ach;
    expect(party.ach).toBeUndefined();
    expect(achOf(party).id).toBe("");
    expect(achOf(party).ledger).toEqual(emptyLedger());
  });
});
