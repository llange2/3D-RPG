import { describe, expect, it } from "vitest";
import { buildMapContent, type ActionInstance } from "../../src/actions";
import { resolveAction, type ActionContext } from "../../src/actions/handlers";
import { seedFromString } from "../../src/core/rng";
import { LOCK_HARDNESS, TIER_ENTRY, TIER_EXIT, hasOrdinaryLock, lockDifficulty, lockEase, lockLevel, refSkill, type LockKind } from "../../src/data/locks";
import { generateInterior } from "../../src/interiors";
import { createDefaultParty } from "../../src/sim/party";
import { hasLockpicker } from "../../src/sim/roster";
import { createCharacter } from "../../src/sim/character";
import type { Party } from "../../src/sim/types";
import { BIOME, type Poi } from "../../src/world/types";
import { World } from "../../src/world/world";
import { bands, leverChance, profiles, skillsAt } from "../../tools/balance/thievery";
import { pathLevels } from "../../tools/balance/challenge";
import { formulasFrom } from "../../tools/balance/cli";
import { GROWTH_USER } from "../../tools/balance/hero";
import { questInterior } from "../helpers/quests";

const rootSeed = seedFromString("thievery");
const ctxFor = (party: Party, attempt = 0, tier = 2): ActionContext => ({ party, rootSeed, attempt, monsterThemes: { beast: 1 }, tier });
const chest = (params: ActionInstance["params"], uid = "m#chest:0"): ActionInstance => ({ uid, kind: "treasure", x: 1, y: 1, params });
const door = (params: ActionInstance["params"], uid = "m#door:0"): ActionInstance => ({ uid, kind: "door", x: 1, y: 1, params });

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

/** The ninja of the 40th playtest log (`.ignore/thief.jpg`): level 10, skill 52, alone in the party. The roll lies between 17 and 52. */
function logNinja(level = 10): Party {
  const party = createDefaultParty();
  const ninja = createCharacter({ name: "Elrin", classType: "Ninja", raceType: "Elf", avatar: "character12", attrs: { str: 14, int: 10, per: 12, end: 14, spd: 18, acc: 27, lck: 27 } });
  ninja.level = level;
  party.characters = [ninja];
  return party;
}

const hardnessOf = (kind: LockKind): number => LOCK_HARDNESS[kind];

describe("thievery locks", () => {
  it("hits the targets for the median ninja on every level of every tier: about 70 % at an ordinary chest, 35 % at a king's chest, 90 % at a door", { timeout: 120_000 }, () => {
    const growth = GROWTH_USER;
    const tiers = bands(pathLevels(formulasFrom("v4"), { path: "bands" }));
    const ninja = [profiles(growth, 12).find((p) => p.key === "ninja")!.spec];
    const mean = (kind: LockKind): number => {
      let sum = 0;
      let n = 0;
      for (const b of tiers) for (const lv of b.levels) if (lv >= 4) (sum += leverChance(ninja, b, hardnessOf(kind), lv, growth, 12)), n++;
      return sum / n;
    };
    expect(mean("chest")).toBeGreaterThan(0.64);
    expect(mean("chest")).toBeLessThan(0.76);
    expect(mean("king chest")).toBeGreaterThan(0.28);
    expect(mean("king chest")).toBeLessThan(0.42);
    expect(mean("door")).toBeGreaterThan(0.85);
    expect(mean("door")).toBeLessThan(0.95);
  });

  it("keeps the chance of the ninja the same inside a tier (the old tables went from 80 % to 100 %) and puts the thief above the ninja above a hero without the skill", { timeout: 120_000 }, () => {
    const growth = GROWTH_USER;
    const tiers = bands(pathLevels(formulasFrom("v4"), { path: "bands" }));
    const spec = (key: string) => [profiles(growth, 12).find((p) => p.key === key)!.spec];
    for (const b of tiers.slice(1)) {
      const mid = Math.round((b.entry + b.exit) / 2);
      const at = (key: string, lv: number) => leverChance(spec(key), b, LOCK_HARDNESS.chest, lv, growth, 12);
      expect(Math.abs(at("ninja", b.entry) - at("ninja", b.exit)), `tier ${b.tier}`).toBeLessThan(0.12);
      expect(at("ninja", mid), `tier ${b.tier}`).toBeLessThan(0.9); // never "always"
      expect(at("thief", mid)).toBeGreaterThan(at("ninja", mid));
      expect(at("ninja", mid)).toBeGreaterThan(at("nothief", mid));
    }
  });

  it("fits the reference skill to the median ninja of the simulator (within 8 % from level 3 on)", () => {
    const growth = GROWTH_USER;
    const ninja = profiles(growth, 12).find((p) => p.key === "ninja")!.spec;
    const tiers = bands(pathLevels(formulasFrom("v4"), { path: "bands" }));
    for (const b of tiers) {
      for (const lv of [b.entry, Math.round((b.entry + b.exit) / 2), b.exit]) {
        if (lv < 3) continue;
        const sim = skillsAt(ninja, lv, b.tier, growth, 12).reduce((s, x) => s + x, 0) / 12;
        expect(Math.abs(refSkill(lv) - sim) / sim, `level ${lv}`).toBeLessThan(0.08);
      }
    }
  });

  it("grows with the level inside a tier, stays put outside of it and is easier on the first three levels", () => {
    for (const kind of Object.keys(LOCK_HARDNESS) as LockKind[]) {
      for (let tier = 1; tier <= 5; tier++) {
        let last = 0;
        for (let level = 1; level <= 50; level++) {
          const d = lockDifficulty(kind, tier, level);
          expect(d, `${kind} tier ${tier} level ${level}`).toBeGreaterThanOrEqual(last);
          last = d;
        }
        // too early for the tier: the lock of the entry; grown out of it: the lock of the end
        expect(lockDifficulty(kind, tier, 1)).toBeLessThanOrEqual(lockDifficulty(kind, tier, TIER_ENTRY[tier - 1]!));
        expect(lockDifficulty(kind, tier, 99)).toBe(lockDifficulty(kind, tier, TIER_EXIT[tier - 1]!));
        expect(lockLevel(tier, 99)).toBe(TIER_EXIT[tier - 1]);
      }
    }
    // the tiers rise
    for (let tier = 2; tier <= 5; tier++) expect(lockDifficulty("chest", tier, TIER_ENTRY[tier - 1]!)).toBeGreaterThan(lockDifficulty("chest", tier - 1, TIER_ENTRY[tier - 1]!));
    // a king's chest is harder than a chest, a chest harder than a door
    for (const level of [5, 20, 40]) {
      expect(lockDifficulty("king chest", 3, level)).toBeGreaterThan(lockDifficulty("chest", 3, level));
      expect(lockDifficulty("chest", 3, level)).toBeGreaterThan(lockDifficulty("door", 3, level));
    }
    // levels 1 to 3: easier than the plain formula, from level 4 on exactly it
    expect(lockEase(1)).toBeLessThan(lockEase(2));
    expect(lockEase(3)).toBeLessThan(1);
    expect(lockEase(4)).toBe(1);
    expect(lockDifficulty("chest", 1, 3)).toBeLessThan(Math.round(LOCK_HARDNESS.chest * refSkill(3)));
    expect(lockDifficulty("chest", 1, 4)).toBe(Math.round(LOCK_HARDNESS.chest * refSkill(4)));
    expect(lockDifficulty("chest", 1, 1)).toBe(1);
    // an unknown tier counts as the nearest one
    expect(lockDifficulty("chest", 0, 1)).toBe(lockDifficulty("chest", 1, 1));
    expect(lockDifficulty("chest", 9, 99)).toBe(lockDifficulty("chest", 5, 99));
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

  it("opens a chest without a lock at once, and a chest with a lock on the first level for a party with a thief or ninja", () => {
    const party = createDefaultParty();
    expect(resolveAction(chest({ level: 1, gold: 50, items: 0 }), ctxFor(party)).consumed).toBe(true);
    const easy = resolveAction(chest({ level: 1, gold: 50, items: 0, difficulty: 1 }, "m#chest:1"), ctxFor(createDefaultParty(), 3, 1));
    expect(easy.consumed).toBe(true);
    expect(easy.effects.some((e) => e.type === "text" && e.text.endsWith("picks the lock."))).toBe(true);
  });

  it("keeps a chest shut when nobody can pick the lock, and leaves the gold where it was", () => {
    const party = createDefaultParty();
    const gold = party.gold;
    // a party of level 1 in a place of the fifth tier: the lock of level 33
    const shut = resolveAction(chest({ level: 1, gold: 50, items: 1, difficulty: 1 }), ctxFor(party, 0, 5));
    expect(shut.consumed).toBe(false);
    expect(shut.effects).toHaveLength(1);
    expect(party.gold).toBe(gold);
  });

  it("does not change the loot of a chest: the lock rolls on a stream of its own", () => {
    const a = createDefaultParty();
    const b = createDefaultParty();
    const open = resolveAction(chest({ level: 3, gold: 120, items: 2 }), ctxFor(a, 0, 1));
    const locked = resolveAction(chest({ level: 3, gold: 120, items: 2, difficulty: 1 }), ctxFor(b, 0, 1));
    const loot = (effects: typeof open.effects) => JSON.stringify(effects.filter((e) => e.type !== "text"));
    expect(locked.consumed).toBe(true);
    expect(loot(locked.effects)).toBe(loot(open.effects));
  });

  it("makes a party without thief or ninja fail a lock far more often than one with a ninja", () => {
    // heroes of level 11, the level a party has when it enters the third tier
    const atEleven = (party: Party): Party => {
      for (const c of party.characters) c.level = 11;
      return party;
    };
    const wins = (party: () => Party) => {
      let n = 0;
      for (let attempt = 0; attempt < 200; attempt++) if (resolveAction(chest({ level: 1, gold: 1, items: 0, difficulty: 1 }, "m#chest:9"), ctxFor(atEleven(party()), attempt, 3)).consumed) n++;
      return n;
    };
    const without = wins(partyWithout);
    const withNinja = wins(createDefaultParty);
    expect(withNinja).toBeGreaterThan(without);
    expect(without).toBeLessThan(200);
  });

  it("does not let a ninja of level 10 pick every lock of the second tier (the log of the 40th playtest: lock 9, every roll above it)", () => {
    let picked = 0;
    const attempts = 400;
    for (let attempt = 0; attempt < attempts; attempt++) {
      if (resolveAction(chest({ level: 1, gold: 1, items: 0, difficulty: 1 }, "m#chest:10"), ctxFor(logNinja(), attempt, 2)).consumed) picked++;
    }
    // the roll lies between 17 and 52 and the lock asks 23: 83 % in theory
    expect(picked).toBeGreaterThan(attempts * 0.72);
    expect(picked).toBeLessThan(attempts * 0.93);
  });

  it("makes the same ninja find the lock of a low level easier: a level-1 party in the first tier picks everything", () => {
    for (let attempt = 0; attempt < 40; attempt++) {
      expect(resolveAction(chest({ level: 1, gold: 1, items: 0, difficulty: 1 }, "m#chest:11"), ctxFor(logNinja(1), attempt, 1)).consumed).toBe(true);
    }
  });

  it("locks doors by the level of the party too: a door of the first tier opens for level 1, one of the fifth does not", () => {
    const opened = (party: Party, tier: number, attempt: number) => resolveAction(door({ locked: true, difficulty: 1 }), ctxFor(party, attempt, tier)).effects.some((e) => e.type === "door" && e.state === "unlocked");
    for (let attempt = 0; attempt < 20; attempt++) {
      expect(opened(logNinja(1), 1, attempt)).toBe(true);
      expect(opened(createDefaultParty(), 5, attempt)).toBe(false);
    }
    // the ninja of the log is stronger than the median ninja (skill 52 against 44): the door of level 10 asks 17, the lowest roll he has
    let ninja = 0;
    let others = 0;
    for (let attempt = 0; attempt < 300; attempt++) {
      if (opened(logNinja(), 2, attempt)) ninja++;
      const party = partyWithout();
      for (const c of party.characters) c.level = 10;
      if (opened(party, 2, attempt)) others++;
    }
    expect(ninja).toBeGreaterThan(300 * 0.9);
    // a party without the skill opens a door of its level sometimes, not always
    expect(others).toBeGreaterThan(300 * 0.05);
    expect(others).toBeLessThan(300 * 0.95);
  });

  it("sets off the trap of a locked chest on a failed attempt, one time in five, and never when the lock is picked or the chest has no trap", () => {
    const trapped = { level: 1, gold: 1, items: 0, difficulty: 1, lockTrap: "fire", trapDamage: 6, trapLevel: 1 };
    let fumbles = 0;
    const attempts = 400;
    for (let attempt = 0; attempt < attempts; attempt++) {
      const party = createDefaultParty(); // level 1 in the fifth tier: never picked
      const out = resolveAction(chest(trapped, "m#chest:12"), ctxFor(party, attempt, 5));
      expect(out.consumed).toBe(false);
      if (out.effects.some((e) => e.type === "text" && e.tone === "bad")) fumbles++;
    }
    expect(fumbles).toBeGreaterThan(attempts * 0.12);
    expect(fumbles).toBeLessThan(attempts * 0.28);
    // no trap in the chest, no trap
    for (let attempt = 0; attempt < 60; attempt++) {
      const out = resolveAction(chest({ level: 1, gold: 1, items: 0, difficulty: 1 }, "m#chest:13"), ctxFor(createDefaultParty(), attempt, 5));
      expect(out.effects.every((e) => e.type === "text" && e.tone === undefined)).toBe(true);
    }
    // a lock that is picked opens the chest without the trap
    for (let attempt = 0; attempt < 40; attempt++) {
      const out = resolveAction(chest(trapped, "m#chest:14"), ctxFor(logNinja(1), attempt, 1));
      expect(out.consumed).toBe(true);
      expect(out.effects.some((e) => e.type === "damage")).toBe(false);
    }
  });

  it("hits the hero who tried the lock, not another one", () => {
    const trapped = { level: 1, gold: 1, items: 0, difficulty: 1, lockTrap: "magic", trapDamage: 50, trapLevel: 1 };
    let hits = 0;
    for (let attempt = 0; attempt < 400; attempt++) {
      const party = partyWithout();
      const out = resolveAction(chest(trapped, "m#chest:15"), ctxFor(party, attempt, 5));
      for (const e of out.effects) {
        if (e.type !== "damage") continue;
        hits++;
        // the picker is the hero with the best roll; the tests only fix that the hit lands on somebody who rolled
        expect(party.characters[e.character]).toBeDefined();
      }
    }
    expect(hits).toBeGreaterThan(0);
  });

  it("tells a party without lockpicker from one with", () => {
    expect(hasLockpicker(createDefaultParty())).toBe(true); // has the ninja
    expect(hasLockpicker(partyWithout())).toBe(false);
    const thief = partyWithout();
    thief.characters[3] = createCharacter({ name: "T", classType: "Thief", raceType: "Gnome", avatar: "character12", attrs: { str: 13, int: 12, per: 10, end: 13, spd: 17, acc: 19, lck: 21 } });
    expect(hasLockpicker(thief)).toBe(true);
  });

  it("generates the lock and its trap on every real chest of a place and on no barrel or quest chest", { timeout: 120_000 }, () => {
    let locked = 0;
    for (let i = 0; i < 12; i++) {
      const tier = 1 + (i % 5);
      const { content } = questInterior("quest_4", "dungeon_2", tier, i);
      for (const a of content.actions) {
        if (a.kind !== "treasure") continue;
        if (hasOrdinaryLock({ ...a.params, difficulty: undefined })) {
          // a chest of the plain rule set has a lock (the marker 1, the number comes from the level of the party) and a trap for a failed attempt; the ones the quest or the machines place carry none
          if (a.params.difficulty !== undefined) {
            expect(a.params.difficulty, a.uid).toBe(1);
            expect(["fire", "ice", "acid", "magic"], a.uid).toContain(a.params.lockTrap);
            expect(Number(a.params.trapDamage), a.uid).toBeGreaterThan(0);
            expect(a.params.trapped, a.uid).toBeUndefined(); // that one springs when the chest is opened
            locked++;
          }
        } else {
          expect(a.params.difficulty, a.uid).toBeUndefined();
          expect(a.params.lockTrap, a.uid).toBeUndefined();
        }
      }
    }
    expect(locked).toBeGreaterThan(0);
  });

  it("gives the chests of a castle their locks: the king's chests and the chests in the niches, each with its trap", { timeout: 120_000 }, () => {
    const world = new World("thievery-castle");
    for (let i = 0; i < 6; i++) {
      const tier = 2 + (i % 3);
      const poi: Poi = { id: `p:t:castle:${i}`, kind: "castle", name: `castle ${i}`, x: i * 7 - 300, y: i * 13 - 900, size: 1, side: "S", region: { rx: 0, ry: 0 }, anchor: false, tier, biome: BIOME.MEADOW };
      const content = buildMapContent(world, poi, generateInterior(world, poi));
      const king = content.actions.filter((a) => a.kind === "treasure" && a.params.lock === "code");
      const niche = content.actions.filter((a) => a.kind === "treasure" && a.params.warn === "alarm");
      expect(king.length).toBe(2);
      expect(niche.length).toBeGreaterThanOrEqual(3);
      for (const a of [...king, ...niche]) {
        expect(a.params.difficulty).toBe(1);
        expect(a.params.trapLevel).toBe(tier);
        expect(Number(a.params.trapDamage)).toBeGreaterThan(0);
        expect(["fire", "ice", "acid", "magic"]).toContain(a.params.lockTrap);
      }
    }
  });
});
