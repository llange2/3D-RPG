import { attr, thieverySkill } from "./character";
import { rollChance, type LockEvent, type LockHero, type LockKind } from "./journal";
import type { Character, Party } from "./types";

/**
 * TEMPORARY (balance journal, `sim/journal.ts`): builds the entries that need the numbers of a hero. Kept apart from `journal.ts` because `character.ts` reports level-ups to the journal
 * and this file reads `character.ts`.
 */

const round3 = (n: number): number => Math.round(n * 1000) / 1000;

/** One hero at a lock: the base attributes, the ones the roll sees, the skill, the roll and the chance. */
export function lockHero(c: Character, index: number, roll: number, difficulty: number): LockHero {
  const skill = thieverySkill(c);
  return {
    i: index,
    name: c.name,
    cls: c.classType,
    race: c.raceType,
    lvl: c.level,
    xp: c.xp,
    a: [c.str, c.int, c.per, c.end, c.spd, c.acc, c.lck],
    eLck: attr(c, "lck"),
    eAcc: attr(c, "acc"),
    thv: c.thievery,
    skill,
    roll,
    p: round3(rollChance(skill, difficulty)),
  };
}

export interface LockFacts {
  kind: LockKind;
  tier: number;
  uid: string;
  /** Average level of the heroes who can act, and the level the lock was worked out for. */
  level: number;
  lockLevel: number;
  difficulty: number;
}

/** The entry for one attempt at a lock; `rolls` are the heroes who rolled (party index and roll), `best` the best roll. */
export function lockEntry(party: Party, facts: LockFacts, rolls: readonly { i: number; roll: number }[], best: number): LockEvent {
  const heroes = rolls.map((r) => lockHero(party.characters[r.i]!, r.i, r.roll, facts.difficulty));
  const miss = heroes.reduce((p, h) => p * (1 - h.p), 1);
  return {
    t: "lock",
    kind: facts.kind,
    tier: facts.tier,
    uid: facts.uid,
    lvl: facts.level,
    lockLvl: facts.lockLevel,
    diff: facts.difficulty,
    best,
    ok: best >= facts.difficulty,
    p: round3(1 - miss),
    heroes,
  };
}
