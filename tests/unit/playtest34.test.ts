import { describe, expect, it } from "vitest";
import { buildMapContent, validateContent } from "../../src/actions";
import { resolveAction, type ActionContext, type Effect } from "../../src/actions/handlers";
import type { ActionInstance, MapContent } from "../../src/actions/types";
import { CHEST_TRAP_CHANCE, dodgeChance } from "../../src/data/chest-traps";
import { BOOKSHELVES, SPELL_COPIES, isStartingSpell, spellTier, spellsOfTier } from "../../src/data/spell-loot";
import { CONSTANTS, SPELLS } from "../../src/data/tables";
import { generateInterior, planDungeon } from "../../src/interiors";
import { createDefaultParty } from "../../src/sim/party";
import type { Party } from "../../src/sim/types";
import { WORLD_SIZE_NAMES, type Poi } from "../../src/world/types";
import { World } from "../../src/world/world";
import { QUESTS, type LayoutId, type QuestId } from "../../src/data/quest-table";
import { findPlace, questInterior } from "../helpers/quests";

const rootSeed = new World("playtest34").rootSeed;

const holders = (world: World): Poi[] => world.allPois().filter((p) => p.kind === "cave" || p.kind === "dungeon" || p.kind === "castle");

/** The spells a place was planned to hold: the plan of a dungeon or cave, or of a castle. */
const plannedAt = (world: World, poi: Poi): readonly number[] => (poi.kind === "castle" ? world.castleSpellsOf(poi.id) : (world.dungeonRef(poi.id)?.spells ?? []));

function context(party: Party, tier = 1, content?: MapContent): ActionContext {
  return { party, rootSeed, monsterThemes: { beast: 1 }, tier, attempt: 0, ...(content ? { content } : {}) };
}

const chest = (params: Record<string, string | number | boolean>, uid = "t:1#chest:0"): ActionInstance => ({ uid, kind: "treasure", x: 3, y: 3, params: { level: 1, gold: 0, items: 0, chest: 1, ...params } });
const texts = (effects: Effect[]): string[] => effects.flatMap((e) => (e.type === "text" ? [e.text] : []));

describe("34th playtest: spell scrolls as loot", () => {
  it("sorts every spell into a level of places by its spell level (1-5, 6-10, 11-15, 16-20, from 21)", () => {
    expect([1, 5, 6, 10, 11, 15, 16, 20, 21, 25].map(spellTier)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
    const all = [1, 2, 3, 4, 5].flatMap(spellsOfTier);
    // (35th playtest: the spells every hero of a school starts with are no scrolls, nobody could learn them)
    expect(all.length).toBe(Object.keys(SPELLS).length - Object.values(SPELLS).filter((s) => isStartingSpell(s.id)).length);
    expect(all.some((id) => isStartingSpell(id))).toBe(false);
    expect(new Set(all).size).toBe(all.length);
  });

  for (const size of WORLD_SIZE_NAMES) {
    it(`${size}: the plan puts every spell exactly twice into places of its level, in two different places`, () => {
      for (const seed of ["spell-a", "spell-b"]) {
        const world = new World(seed, size);
        const where = new Map<number, Poi[]>();
        for (const poi of holders(world)) {
          const spells = plannedAt(world, poi);
          // the pyramids hold none: their inside is the spaceship
          if (world.dungeonRef(poi.id)?.klass === "C") expect(spells, poi.id).toEqual([]);
          for (const id of spells) where.set(id, [...(where.get(id) ?? []), poi]);
        }
        const tiers = new Set(holders(world).filter((p) => world.dungeonRef(p.id)?.klass !== "C").map((p) => p.tier));
        for (const spell of Object.values(SPELLS)) {
          const at = where.get(spell.id) ?? [];
          expect(at.length, `${seed} ${size}: spell ${spell.id}`).toBe(isStartingSpell(spell.id) ? 0 : SPELL_COPIES);
          // its own level, if the world has places of that level (a small world can lack one: the nearest level lends its places)
          if (tiers.has(spellTier(spell.level))) for (const poi of at) expect(poi.tier, `${seed} ${size}: spell ${spell.id} in ${poi.id}`).toBe(spellTier(spell.level));
          if (at.length > 0 && holders(world).filter((p) => p.tier === spellTier(spell.level)).length > 2) expect(new Set(at.map((p) => p.id)).size, `${seed} ${size}: spell ${spell.id}`).toBe(SPELL_COPIES);
        }
      }
    });
  }

  it("is deterministic", { timeout: 180_000 }, () => {
    const first = new World("spell-det", "small");
    const second = new World("spell-det", "small");
    expect(holders(first).map((p) => plannedAt(first, p).join())).toEqual(holders(second).map((p) => plannedAt(second, p).join()));
  });

  it("finds every scroll in the containers of the generated places: twice each, nothing else generates a scroll, no place breaks", { timeout: 300_000 }, () => {
    const world = new World("spell-play", "small");
    const found = new Map<number, number>();
    let shelves = 0;
    let checked = 0;
    for (const poi of holders(world)) {
      if (poi.kind !== "castle" && planDungeon(world, poi)?.klass === "C") continue;
      const map = generateInterior(world, poi);
      const content = buildMapContent(world, poi, map);
      expect(validateContent(map, content), poi.id).toEqual([]);
      const scrolls = content.actions.flatMap((a) => (typeof a.params.scrolls === "string" ? a.params.scrolls.split(",").map(Number) : []));
      expect(scrolls.slice().sort((p, q) => p - q), poi.id).toEqual(plannedAt(world, poi).slice().sort((p, q) => p - q));
      for (const a of content.actions.filter((x) => typeof x.params.scrolls === "string")) expect(a.kind, a.uid).toBe("treasure");
      for (const id of scrolls) found.set(id, (found.get(id) ?? 0) + 1);
      shelves += content.actions.filter((a) => a.kind === "treasure" && BOOKSHELVES.includes(Number(a.params.chest))).length;
      // a bookshelf is never plain decoration any more
      expect(content.actions.filter((a) => a.kind === "decor" && BOOKSHELVES.includes(Number(a.params.item))), poi.id).toEqual([]);
      checked++;
    }
    expect(checked).toBeGreaterThan(20);
    for (const spell of Object.values(SPELLS)) expect(found.get(spell.id) ?? 0, `spell ${spell.id}`).toBe(isStartingSpell(spell.id) ? 0 : SPELL_COPIES);
    expect(shelves).toBeGreaterThan(0);
  });

  it("gives the scrolls of a container when it is opened, and a bookshelf tells what it found", () => {
    const party = createDefaultParty();
    const open = resolveAction(chest({ chest: 75, scrolls: "6,22" }, "t:1#shelf:0"), context(party));
    const scrolls = open.effects.flatMap((e) => (e.type === "item" && e.item.type === "spell" ? [e.item.spellId] : []));
    expect(scrolls).toEqual([6, 22]);
    expect(open.consumed).toBe(true);
    expect(texts(open.effects).length).toBeGreaterThan(0);
    // an empty one is a joke, not "The chest is empty."
    const empty = resolveAction(chest({ chest: 97 }, "t:1#shelf:1"), context(createDefaultParty()));
    expect(texts(empty.effects).join(" ")).not.toContain("chest");
    expect(texts(empty.effects).length).toBe(1);
  });

  it("no longer hands out random scrolls from the end room", () => {
    const { content } = findPlace(() => true, 10);
    expect(content.actions.filter((a) => a.params.spells !== undefined || a.params.spellLevel !== undefined)).toEqual([]);
  });
});

describe("34th playtest: traps in chests that are not locked", () => {
  it("divides the luck of a hero by 20 on level 1, 40 on level 2 and so on up to 100", () => {
    expect(dodgeChance(10, 1)).toBeCloseTo(0.5);
    expect(dodgeChance(10, 2)).toBeCloseTo(0.25);
    expect(dodgeChance(30, 3)).toBeCloseTo(0.5);
    expect(dodgeChance(40, 4)).toBeCloseTo(0.5);
    expect(dodgeChance(50, 5)).toBeCloseTo(0.5);
    expect(dodgeChance(500, 1)).toBe(1);
    expect(dodgeChance(0, 3)).toBe(0);
  });

  it("traps about one unlocked chest in five, and only chests without a lock", { timeout: 300_000 }, () => {
    let open = 0;
    let trapped = 0;
    const seenElements = new Set<string>();
    for (const [quest, layout, tier, variant] of combinations()) {
      const { content: place, ref } = questInterior(quest, layout, tier, variant);
      const end = ref.endRoom!;
      // (the chests of the end room are the reward of the quest and are laid out by the quest, not by the rules: no trap there)
      const inEnd = (a: ActionInstance) => a.x >= end.x && a.y >= end.y && a.x < end.x + end.w && a.y < end.y + end.h;
      for (const a of place.actions.filter((x) => x.kind === "treasure" && !inEnd(x))) {
        const lockless = a.params.difficulty === undefined && a.params.quest === undefined && a.params.bonus === undefined && a.params.lock === undefined && a.params.warn === undefined && !BOOKSHELVES.includes(Number(a.params.chest));
        if (typeof a.params.trapped === "string") {
          expect(lockless, `${a.uid} is trapped`).toBe(true);
          expect(Number(a.params.trapDamage), a.uid).toBeGreaterThan(0);
          expect(Number(a.params.trapLevel), a.uid).toBeGreaterThanOrEqual(1);
          trapped++;
          seenElements.add(String(a.params.trapped));
        }
        if (lockless) open++;
      }
    }
    expect(open).toBeGreaterThan(200);
    expect(trapped / open).toBeGreaterThan(CHEST_TRAP_CHANCE / 1000 - 0.07);
    expect(trapped / open).toBeLessThan(CHEST_TRAP_CHANCE / 1000 + 0.07);
    expect(seenElements.size).toBe(4);
  });

  it("hits a hero for the damage of the trap when luck does not help, and says so", () => {
    const party = createDefaultParty();
    for (const c of party.characters) c.lck = 0;
    const barrel = chest({ chest: 5, trapped: "acid", trapDamage: 12, trapLevel: 1 }, "t:1#barrel:0");
    const out = resolveAction(barrel, context(party));
    const hit = out.effects.find((e) => e.type === "damage");
    expect(hit?.type).toBe("damage");
    if (hit?.type !== "damage") return;
    expect(hit.damageType).toBe("acid");
    expect(hit.amount).toBeGreaterThan(0);
    const name = party.characters[hit.character]!.name;
    const lines = texts(out.effects);
    expect(lines[0]).toContain(name);
    expect(lines[0]).toContain("barrel");
    expect(lines.some((l) => l.includes(name) && l.includes(String(hit.amount)))).toBe(true);
    expect(out.consumed).toBe(true);
  });

  it("lets a lucky hero get away, and still gives the loot", () => {
    const party = createDefaultParty();
    for (const c of party.characters) c.lck = 1000;
    const before = party.characters.map((c) => c.hp);
    const out = resolveAction(chest({ chest: 1, trapped: "fire", trapDamage: 12, trapLevel: 1, gold: 50 }, "t:1#chest:7"), context(party));
    expect(out.effects.some((e) => e.type === "damage")).toBe(false);
    expect(party.characters.map((c) => c.hp)).toEqual(before);
    expect(out.effects.some((e) => e.type === "gold")).toBe(true);
    expect(texts(out.effects).length).toBe(2);
  });

  it("says that the protection spell saved the hero when it takes all of the damage", () => {
    const party = createDefaultParty();
    for (const c of party.characters) c.lck = 0;
    party.effects.push({ kind: "protection", until: party.minutes + 600, element: "ice", amount: 100 });
    const before = party.characters.map((c) => c.hp);
    const out = resolveAction(chest({ chest: 74, trapped: "ice", trapDamage: 12, trapLevel: 1 }, "t:1#chest:2"), context(party));
    expect(out.effects.some((e) => e.type === "damage")).toBe(false);
    expect(party.characters.map((c) => c.hp)).toEqual(before);
    expect(texts(out.effects).join(" ")).toContain("were it not for the active elemental protection spell");
  });

  it("says her or his by the portrait of the hero", () => {
    const party = createDefaultParty();
    for (const c of party.characters) c.lck = 0;
    party.effects.push({ kind: "protection", until: party.minutes + 600, element: "fire", amount: 100 });
    const seen = new Set<string>();
    for (let n = 0; n < 60; n++) {
      const out = resolveAction(chest({ chest: 1, trapped: "fire", trapDamage: 12, trapLevel: 1 }, `t:1#chest:${n}`), context(party));
      const line = texts(out.effects).find((l) => l.includes("protection spell"))!;
      const who = party.characters.find((c) => line.includes(c.name))!;
      const female = CONSTANTS.CHARACTER_FEMALE.includes(who.avatar);
      expect(line, who.name).toContain(female ? "in her face" : "in his face");
      seen.add(female ? "her" : "his");
    }
    expect(seen.size).toBe(2);
  });

  it("is the end of the party when the trap kills the last hero standing", () => {
    const party = createDefaultParty();
    for (const c of party.characters) {
      c.lck = 0;
      c.hp = 1;
    }
    for (const c of party.characters.slice(1)) c.hp = 0;
    const out = resolveAction(chest({ chest: 5, trapped: "magic", trapDamage: 500, trapLevel: 1 }, "t:1#barrel:3"), context(party));
    expect(out.effects.some((e) => e.type === "damage")).toBe(true);
  });
});

/** A spread of quests, layouts, levels and variants for the statistics. */
function combinations(): [QuestId, LayoutId, number, number][] {
  const out: [QuestId, LayoutId, number, number][] = [];
  let n = 0;
  for (const quest of Object.keys(QUESTS) as QuestId[]) {
    for (const layout of QUESTS[quest].layouts.filter((l) => l.startsWith("dungeon") || l.startsWith("cave")) as LayoutId[]) {
      for (let k = 0; k < 16; k++) out.push([quest, layout, 1 + ((n + 2 * k) % 5), n + 100 * k]);
      n++;
    }
  }
  return out;
}
