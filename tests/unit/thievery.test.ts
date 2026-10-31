import { describe, expect, it } from "vitest";
import { buildMapContent, type ActionInstance } from "../../src/actions";
import { resolveAction, type ActionContext } from "../../src/actions/handlers";
import { seedFromString } from "../../src/core/rng";
import { CHEST_LOCK, KING_CHEST_LOCK, chestLock, hasOrdinaryLock, kingChestLock } from "../../src/data/locks";
import { generateInterior } from "../../src/interiors";
import { createDefaultParty } from "../../src/sim/party";
import { hasLockpicker } from "../../src/sim/roster";
import { createCharacter } from "../../src/sim/character";
import type { Party } from "../../src/sim/types";
import { BIOME, type Poi } from "../../src/world/types";
import { World } from "../../src/world/world";
import { bands, difficultyFor, profiles } from "../../tools/balance/thievery";
import { pathLevels } from "../../tools/balance/challenge";
import { formulasFrom } from "../../tools/balance/cli";
import { GROWTH_USER } from "../../tools/balance/hero";
import { questInterior } from "../helpers/quests";

const rootSeed = seedFromString("thievery");
const ctxFor = (party: Party, attempt = 0, tier = 2): ActionContext => ({ party, rootSeed, attempt, monsterThemes: { beast: 1 }, tier });
const chest = (params: ActionInstance["params"], uid = "m#chest:0"): ActionInstance => ({ uid, kind: "treasure", x: 1, y: 1, params });

/** A party of four who all lack a thievery skill of their own. */
function partyWithout(): Party {
  const party = createDefaultParty();
  const attrs = { str: 14, int: 12, per: 12, end: 14, spd: 12, acc: 12, lck: 10 };
  party.characters = [
    createCharacter({ name: "A", classType: "Knight", raceType: "Orc", avatar: "character21", attrs }),
    createCharacter({ name: "B", classType: "Cleric", raceType: "Human", avatar: "character04", attrs }),
    createCharacter({ name: "C", classType: "Archer", raceType: "Human", avatar: "character05", attrs }),
    createCharacter({ name: "D", classType: "Wizard", raceType: "Elf", avatar: "character12", attrs }),
  ];
  return party;
}

describe("thievery locks", () => {
  it("keeps the tables the simulator gives (median ninja at the level a party enters the tier: 80 % for an ordinary chest, 50 % for a king's chest)", { timeout: 120_000 }, () => {
    const growth = GROWTH_USER;
    const tiers = bands(pathLevels(formulasFrom("v4"), { path: "bands" }));
    const ninja = profiles(growth, 12).find((p) => p.key === "ninja")!;
    const entry = (target: number) => tiers.map((b) => difficultyFor([ninja.spec], b, target, growth, 12, [b.entry]));
    expect(entry(0.8)).toEqual([...CHEST_LOCK]);
    expect(entry(0.5)).toEqual([...KING_CHEST_LOCK]);
  });

  it("rises with the tier and answers for every tier", () => {
    for (const table of [CHEST_LOCK, KING_CHEST_LOCK]) for (let t = 1; t < table.length; t++) expect(table[t]!).toBeGreaterThan(table[t - 1]!);
    for (let t = 0; t < 5; t++) expect(kingChestLock(t + 1)).toBeGreaterThanOrEqual(chestLock(t + 1));
    expect(chestLock(0)).toBe(CHEST_LOCK[0]);
    expect(chestLock(9)).toBe(CHEST_LOCK[4]);
  });

  it("locks real chests only: not barrels, not quest chests, not king's chests", () => {
    expect(hasOrdinaryLock({ chest: 1 })).toBe(true);
    expect(hasOrdinaryLock({ chest: 72 })).toBe(true);
    expect(hasOrdinaryLock({ chest: 5 })).toBe(false); // barrel
    expect(hasOrdinaryLock({ chest: 4 })).toBe(false); // heap of treasure
    expect(hasOrdinaryLock({ chest: 1, quest: "quest_orb" })).toBe(false);
    expect(hasOrdinaryLock({ chest: 72, lock: "code" })).toBe(false);
    expect(hasOrdinaryLock({ chest: 1, bonus: "attr" })).toBe(false);
  });

  it("opens a chest without a lock at once, and a chest with an easy lock for a party with a thief or ninja", () => {
    const party = createDefaultParty();
    expect(resolveAction(chest({ level: 1, gold: 50, items: 0 }), ctxFor(party)).consumed).toBe(true);
    const easy = resolveAction(chest({ level: 1, gold: 50, items: 0, difficulty: 1 }, "m#chest:1"), ctxFor(createDefaultParty(), 3));
    expect(easy.consumed).toBe(true);
    expect(easy.effects.some((e) => e.type === "text" && e.text.endsWith("picks the lock."))).toBe(true);
  });

  it("keeps a chest shut when nobody can pick the lock, and leaves the gold where it was", () => {
    const party = createDefaultParty();
    const gold = party.gold;
    const shut = resolveAction(chest({ level: 1, gold: 50, items: 1, difficulty: 100_000 }), ctxFor(party));
    expect(shut.consumed).toBe(false);
    expect(shut.effects).toHaveLength(1);
    expect(party.gold).toBe(gold);
  });

  it("does not change the loot of a chest: the lock rolls on a stream of its own", () => {
    const a = createDefaultParty();
    const b = createDefaultParty();
    const open = resolveAction(chest({ level: 3, gold: 120, items: 2 }), ctxFor(a));
    const locked = resolveAction(chest({ level: 3, gold: 120, items: 2, difficulty: 1 }), ctxFor(b));
    const loot = (effects: typeof open.effects) => JSON.stringify(effects.filter((e) => e.type !== "text"));
    expect(locked.consumed).toBe(true);
    expect(loot(locked.effects)).toBe(loot(open.effects));
  });

  it("makes a party without thief or ninja fail a hard lock far more often than one with a ninja", () => {
    // heroes of level 11, the level a party has when it enters the third tier
    const atEleven = (party: Party): Party => {
      for (const c of party.characters) c.level = 11;
      return party;
    };
    const wins = (party: () => Party) => {
      let n = 0;
      for (let attempt = 0; attempt < 200; attempt++) if (resolveAction(chest({ level: 1, gold: 1, items: 0, difficulty: CHEST_LOCK[2]! }, "m#chest:9"), ctxFor(atEleven(party()), attempt)).consumed) n++;
      return n;
    };
    const without = wins(partyWithout);
    const withNinja = wins(createDefaultParty);
    expect(withNinja).toBeGreaterThan(without);
    expect(without).toBeLessThan(200);
  });

  it("tells a party without lockpicker from one with", () => {
    expect(hasLockpicker(createDefaultParty())).toBe(true); // has the ninja
    expect(hasLockpicker(partyWithout())).toBe(false);
    const thief = partyWithout();
    thief.characters[3] = createCharacter({ name: "T", classType: "Thief", raceType: "Gnome", avatar: "character12", attrs: { str: 13, int: 12, per: 10, end: 13, spd: 17, acc: 19, lck: 21 } });
    expect(hasLockpicker(thief)).toBe(true);
  });

  it("generates the lock on every real chest of a place and on no barrel or quest chest", { timeout: 120_000 }, () => {
    let locked = 0;
    for (let i = 0; i < 12; i++) {
      const tier = 1 + (i % 5);
      const { content } = questInterior("quest_4", "dungeon_2", tier, i);
      for (const a of content.actions) {
        if (a.kind !== "treasure") continue;
        if (hasOrdinaryLock({ ...a.params, difficulty: undefined })) {
          // a chest of the plain rule set has the lock of its level; the ones the quest or the machines place carry none
          if (a.params.difficulty !== undefined) {
            expect(a.params.difficulty, a.uid).toBe(chestLock(content.tier));
            locked++;
          }
        } else expect(a.params.difficulty, a.uid).toBeUndefined();
      }
    }
    expect(locked).toBeGreaterThan(0);
  });

  it("gives the chests of a castle their locks: the king's chests the hard one, the chests in the niches the ordinary one", { timeout: 120_000 }, () => {
    const world = new World("thievery-castle");
    for (let i = 0; i < 6; i++) {
      const tier = 2 + (i % 3);
      const poi: Poi = { id: `p:t:castle:${i}`, kind: "castle", name: `castle ${i}`, x: i * 7 - 300, y: i * 13 - 900, size: 1, side: "S", region: { rx: 0, ry: 0 }, anchor: false, tier, biome: BIOME.MEADOW };
      const content = buildMapContent(world, poi, generateInterior(world, poi));
      const king = content.actions.filter((a) => a.kind === "treasure" && a.params.lock === "code");
      const niche = content.actions.filter((a) => a.kind === "treasure" && a.params.warn === "alarm");
      expect(king.length).toBe(2);
      expect(niche.length).toBeGreaterThanOrEqual(3);
      for (const a of king) expect(a.params.difficulty).toBe(kingChestLock(tier));
      for (const a of niche) expect(a.params.difficulty).toBe(chestLock(tier));
    }
  });
});
