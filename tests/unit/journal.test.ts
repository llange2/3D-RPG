import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ActionInstance } from "../../src/actions";
import { resolveAction, type ActionContext } from "../../src/actions/handlers";
import { seedFromString } from "../../src/core/rng";
import { lockDifficulty, lockLevel } from "../../src/data/locks";
import { fromSaveFile, newGameState, readNamedSave, listNamedSaves, takeJournalDropped, toSaveFile, writeNamedSave, writeSave, readSave } from "../../src/game/state";
import { applyHit } from "../../src/sim/combat";
import { thieverySkill, createCharacter, levelUp } from "../../src/sim/character";
import { JOURNAL_LIMIT, rollChance, setJournalSink, thieverySummary, pushJournal, type JournalEntry, type JournalEvent, type LockEvent, type TrapEvent } from "../../src/sim/journal";
import { createDefaultParty } from "../../src/sim/party";
import { packSave } from "../../src/game/saveCodec";
import { Rng } from "../../src/core/rng";
import type { Party } from "../../src/sim/types";
import { MONSTERS } from "../../src/data/tables";

/** TEMPORARY (balance journal, `sim/journal.ts`): what the sim reports and what the save keeps. */

const rootSeed = seedFromString("journal");
const ctxFor = (party: Party, attempt = 0, tier = 2): ActionContext => ({ party, rootSeed, attempt, monsterThemes: { beast: 1 }, tier });
const chest = (params: ActionInstance["params"], uid = "m#chest:0"): ActionInstance => ({ uid, kind: "treasure", x: 1, y: 1, params });
const door = (params: ActionInstance["params"], uid = "m#door:0"): ActionInstance => ({ uid, kind: "door", x: 1, y: 1, params });

function collect(): { events: JournalEvent[]; stop: () => void } {
  const events: JournalEvent[] = [];
  setJournalSink((e) => events.push(e));
  return { events, stop: () => setJournalSink(null) };
}

afterEach(() => setJournalSink(null));

describe("balance journal: the chance of a roll", () => {
  it("is the share of the rolls from a third of the skill to all of it that reach the lock", () => {
    expect(rollChance(30, 10)).toBe(1);
    expect(rollChance(30, 31)).toBe(0);
    expect(rollChance(30, 20)).toBeCloseTo(11 / 21, 6);
  });
});

describe("balance journal: locks", () => {
  it("notes level, attributes, skill, roll and chance of the one hero who rolled, the best thief of the party", () => {
    const party = createDefaultParty();
    const { events } = collect();
    resolveAction(chest({ level: 1, gold: 1, items: 0, difficulty: 1 }), ctxFor(party, 3, 2));
    const [e] = events as LockEvent[];
    expect(e!.t).toBe("lock");
    expect(e!.kind).toBe("chest");
    expect(e!.uid).toBe("m#chest:0");
    expect(e!.tier).toBe(2);
    // only one hero rolls: the active hero with the highest thievery skill, the first of equals
    expect(e!.heroes).toHaveLength(1);
    const best = party.characters.reduce((b, c, i) => (thieverySkill(c) > thieverySkill(party.characters[b]!) ? i : b), 0);
    expect(e!.heroes[0]!.i).toBe(best);
    const avg = party.characters.reduce((s, c) => s + c.level, 0) / party.characters.length;
    expect(e!.lvl).toBeCloseTo(avg, 6);
    expect(e!.lockLvl).toBe(lockLevel(2, Math.round(avg)));
    expect(e!.diff).toBe(lockDifficulty("chest", 2, Math.round(avg)));
    e!.heroes.forEach((h) => {
      const c = party.characters[h.i]!;
      expect(h.name).toBe(c.name);
      expect(h.cls).toBe(c.classType);
      expect(h.lvl).toBe(c.level);
      expect(h.a).toEqual([c.str, c.int, c.per, c.end, c.spd, c.acc, c.lck]);
      expect(h.thv).toBe(c.thievery);
      expect(h.skill).toBe(thieverySkill(c));
      expect(h.roll).toBeGreaterThanOrEqual(Math.floor(h.skill / 3));
      expect(h.roll).toBeLessThanOrEqual(h.skill);
      expect(h.p).toBeCloseTo(rollChance(h.skill, e!.diff), 3);
    });
    expect(e!.best).toBe(Math.max(...e!.heroes.map((h) => h.roll)));
    expect(e!.ok).toBe(e!.best >= e!.diff);
    // the chance of the attempt is the chance of this one hero
    expect(e!.p).toBeCloseTo(rollChance(e!.heroes[0]!.skill, e!.diff), 2);
  });

  it("lets the thief pick the lock, and the next best hero when the thief cannot act", () => {
    const party = createDefaultParty();
    const ninja = party.characters.find((c) => c.classType === "Ninja")!;
    const others = party.characters.filter((c) => c !== ninja);
    const { events } = collect();
    resolveAction(chest({ level: 1, gold: 1, items: 0, difficulty: 1 }, "m#chest:7"), ctxFor(party, 1, 1));
    expect(events).toHaveLength(1);
    const [first] = events as LockEvent[];
    expect(first!.heroes.map((h) => h.cls)).toEqual(["Ninja"]);
    expect(first!.heroes[0]!.i).toBe(party.characters.indexOf(ninja));
    expect(first!.heroes[0]!.skill).toBeGreaterThan(Math.max(...others.map((c) => thieverySkill(c))));
    // the ninja is out: the next best hero rolls alone
    ninja.conditions.push("Unconscious");
    resolveAction(chest({ level: 1, gold: 1, items: 0, difficulty: 1 }, "m#chest:8"), ctxFor(party, 2, 1));
    const second = events[1] as LockEvent;
    expect(second.heroes).toHaveLength(1);
    expect(second.heroes[0]!.cls).not.toBe("Ninja");
    expect(second.heroes[0]!.skill).toBe(Math.max(...others.map((c) => thieverySkill(c))));
  });

  it("notes doors and sums up expected and actual chance", () => {
    const { events } = collect();
    for (let attempt = 0; attempt < 40; attempt++) resolveAction(door({ locked: true, difficulty: 1 }, "m#door:1"), ctxFor(createDefaultParty(), attempt, 2));
    for (let attempt = 0; attempt < 40; attempt++) resolveAction(chest({ level: 1, gold: 1, items: 0, difficulty: 1 }, "m#chest:1"), ctxFor(createDefaultParty(), attempt, 5));
    const doors = thieverySummary(events, "door");
    expect(doors.attempts).toBe(40);
    expect(thieverySummary(events, "chest").attempts).toBe(40);
    expect(thieverySummary(events).attempts).toBe(80);
    // over many attempts the share that worked comes near the average of the exact chances
    expect(Math.abs(doors.actual - doors.expected)).toBeLessThan(25);
    expect(Math.abs(thieverySummary(events, "chest").actual - thieverySummary(events, "chest").expected)).toBeLessThan(25);
  });

  it("notes an alarm chest once, not twice (it asks first and is resolved again with the answer)", () => {
    const { events } = collect();
    const params = { level: 1, gold: 1, items: 0, difficulty: 1, warn: "alarm" };
    resolveAction(chest(params, "m#chest:2"), ctxFor(createDefaultParty(), 1, 1));
    resolveAction(chest(params, "m#chest:2"), { ...ctxFor(createDefaultParty(), 1, 1), answer: "yes" });
    expect(events.filter((e) => e.t === "lock")).toHaveLength(1);
  });

  it("adds the trap that a failed attempt set off to the lock and notes the trap itself", () => {
    const trapped = { level: 1, gold: 1, items: 0, difficulty: 1, lockTrap: "fire", trapDamage: 6, trapLevel: 1 };
    const { events } = collect();
    let sprung = 0;
    for (let attempt = 0; attempt < 300; attempt++) resolveAction(chest(trapped, "m#chest:3"), ctxFor(createDefaultParty(), attempt, 5));
    const locks = events.filter((e): e is LockEvent => e.t === "lock");
    const traps = events.filter((e): e is TrapEvent => e.t === "trap");
    for (const l of locks) if (l.fumble !== undefined) sprung++;
    expect(sprung).toBeGreaterThan(0);
    // every trap that went off follows a lock that failed
    expect(traps.length).toBe(sprung);
    for (const t of traps) {
      expect(t.kind).toBe("chest lock");
      expect(t.element).toBe("fire");
      expect(t.hero.name.length).toBeGreaterThan(0);
      expect(t.dodged || t.dmg >= 0).toBe(true);
    }
    expect(locks.every((l) => (l.fumble === undefined ? true : !l.ok))).toBe(true);
  });

  it("changes nothing in the game: the same attempt gives the same result with and without a sink", () => {
    const params = { level: 2, gold: 40, items: 2, difficulty: 1, lockTrap: "ice", trapDamage: 9, trapLevel: 2 };
    for (let attempt = 0; attempt < 60; attempt++) {
      setJournalSink(null);
      const a = createDefaultParty();
      const outA = resolveAction(chest(params, "m#chest:4"), ctxFor(a, attempt, 2));
      collect();
      const b = createDefaultParty();
      const outB = resolveAction(chest(params, "m#chest:4"), ctxFor(b, attempt, 2));
      setJournalSink(null);
      expect(JSON.stringify(outB)).toBe(JSON.stringify(outA));
      expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    }
  });
});

describe("balance journal: traps, levels and heroes who went down", () => {
  it("notes a trap of the floor with its element and damage", () => {
    const { events } = collect();
    const party = createDefaultParty();
    resolveAction({ uid: "m#trap:0", kind: "trap", x: 1, y: 1, params: { trap: "generic", element: "fire", damage: 8 } }, ctxFor(party, 0, 2));
    const [t] = events.filter((e): e is TrapEvent => e.t === "trap");
    expect(t).toBeDefined();
    expect(t!.kind).toBe("generic");
    expect(t!.uid).toBe("m#trap:0");
    expect(t!.tier).toBe(2);
    expect(t!.raw).toBeGreaterThan(0);
  });

  it("notes a level-up", () => {
    const { events } = collect();
    const c = createDefaultParty().characters[0]!;
    const from = c.level;
    levelUp(c, [], 2);
    const [e] = events;
    expect(e).toMatchObject({ t: "level", name: c.name, cls: c.classType, from, to: from + 2 });
  });

  it("notes a hero who went down, with the monster that did it", () => {
    const { events } = collect();
    const party = createDefaultParty();
    const c = party.characters[0]!;
    const goblin = Object.values(MONSTERS)[0]!;
    applyHit(party, 0, c.health * 3, goblin, new Rng(seedFromString("down")));
    const down = events.filter((e) => e.t === "down");
    expect(down).toHaveLength(1);
    expect(down[0]).toMatchObject({ t: "down", name: c.name, cond: "Dead", by: goblin.name });
    // a hit that leaves the hero standing notes nothing
    events.length = 0;
    applyHit(party, 1, 1, goblin, new Rng(seedFromString("down")));
    expect(events).toHaveLength(0);
  });
});

describe("balance journal: the journal in the state and the save", () => {
  const entry = (n: number, t: "snap" | "level" = "level"): JournalEntry =>
    (t === "snap" ? { t: "snap", why: "steps", tier: 1, heroes: [], gold: 0, bank: 0, food: 0, kills: n, s: n, m: n, at: "ow", x: 0, y: 0 } : { t: "level", name: "A", cls: "Knight", from: n, to: n + 1, xp: 0, s: n, m: n, at: "ow", x: 0, y: 0 });

  it("keeps at most JOURNAL_LIMIT entries and lets the time line go first", () => {
    const journal: JournalEntry[] = [];
    for (let i = 0; i < JOURNAL_LIMIT; i++) pushJournal(journal, entry(i, i % 3 === 0 ? "snap" : "level"));
    expect(journal).toHaveLength(JOURNAL_LIMIT);
    const levels = journal.filter((e) => e.t === "level").length;
    for (let i = 0; i < 100; i++) pushJournal(journal, entry(10_000 + i, "level"));
    expect(journal).toHaveLength(JOURNAL_LIMIT);
    // 100 more entries cost 100 snapshots, no level entry
    expect(journal.filter((e) => e.t === "level").length).toBe(levels + 100);
  });

  it("goes through toSaveFile and fromSaveFile, and an old save without it has an empty one", () => {
    const state = newGameState("j", { x: 1, y: 1, facing: "N" });
    state.journal.push(entry(1));
    const file = JSON.parse(JSON.stringify(toSaveFile(state)));
    expect(fromSaveFile(file).journal).toEqual(state.journal);
    delete file.state.journal;
    expect(fromSaveFile(file).journal).toEqual([]);
    expect(newGameState("k", { x: 1, y: 1, facing: "N" }).journal).toEqual([]);
  });

  describe("storage", () => {
    const store = new Map<string, string>();
    let limit = Infinity;
    beforeEach(() => {
      store.clear();
      limit = Infinity;
      (globalThis as { localStorage?: unknown }).localStorage = {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
          if (v.length > limit) throw new Error("QuotaExceededError");
          store.set(k, v);
        },
        removeItem: (k: string) => void store.delete(k),
      };
      takeJournalDropped();
    });
    afterEach(() => {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    });

    it("writes the journal into the slots and the named saves", () => {
      const state = newGameState("s", { x: 1, y: 1, facing: "N" });
      state.journal.push(entry(7));
      expect(writeSave(state, "quick")).toBe(true);
      expect(readSave("world", "quick")?.state.journal).toEqual(state.journal);
      expect(writeNamedSave(state, "with journal")).toBe(true);
      expect(readNamedSave(listNamedSaves("world")[0]!.id)?.state.journal).toEqual(state.journal);
      expect(takeJournalDropped()).toBe(false);
    });

    it("saves without the journal when the browser has no room for it, and says so once", () => {
      const state = newGameState("s", { x: 1, y: 1, facing: "N" });
      // (saves are stored packed since the 57th playtest: the room is measured in packed characters)
      const plain = packSave(JSON.stringify(toSaveFile(state))).length;
      // (entries that do not pack away to nothing: a name of noise)
      const noise = new Rng(seedFromString("journal-noise"));
      for (let i = 0; i < 400; i++) state.journal.push({ ...entry(i), name: Array.from({ length: 24 }, () => String.fromCharCode(48 + noise.int(70))).join("") } as JournalEntry);
      const full = packSave(JSON.stringify(toSaveFile(state))).length;
      expect(full).toBeGreaterThan(plain + 400);
      limit = plain + 200;
      expect(writeSave(state, "auto")).toBe(true);
      const saved = readSave("world", "auto");
      expect(saved).not.toBeNull();
      expect(saved!.state.journal).toBeUndefined();
      expect(takeJournalDropped()).toBe(true);
      expect(takeJournalDropped()).toBe(false);
      expect(writeNamedSave(state, "tight")).toBe(true);
      expect(takeJournalDropped()).toBe(true);
      // a save that does not fit even without the journal still fails
      limit = 10;
      expect(writeSave(state, "auto")).toBe(false);
    });
  });
});

describe("balance journal: a hero for the entries", () => {
  it("creates heroes with the numbers the journal reads", () => {
    const c = createCharacter({ name: "Z", classType: "Ninja", raceType: "Elf", avatar: "character12", attrs: { str: 14, int: 10, per: 12, end: 14, spd: 18, acc: 27, lck: 27 } });
    expect(thieverySkill(c)).toBeGreaterThan(0);
  });
});
