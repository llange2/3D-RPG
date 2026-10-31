import { describe, expect, it } from "vitest";
import { buildMapContent, validateContent } from "../../src/actions";
import { resolveAction, type ActionContext } from "../../src/actions/handlers";
import type { ActionInstance } from "../../src/actions/types";
import { Rng, seedFromString } from "../../src/core/rng";
import { ALIGNMENTS, BANNER, GUARD_GROUP, KING, THRONE, guardsOf } from "../../src/data/castles";
import { CASTLE_TIERS } from "../../src/data/quest-table";
import { MONSTERS, monsterGroup } from "../../src/data/tables";
import { generateInterior } from "../../src/interiors";
import { createDefaultParty } from "../../src/sim/party";
import { WORLD_SIZE_NAMES } from "../../src/world/types";
import { World } from "../../src/world/world";

const castlesOf = (world: World) => world.allPois().filter((p) => p.kind === "castle");

describe("the three castles (quest document 1.2, castle_1)", () => {
  for (const size of WORLD_SIZE_NAMES) {
    it(`${size}: exactly three, on the levels 2, 3 and 4, one good, one neutral, one evil`, () => {
      for (const seed of ["castles-a", "castles-b", "castles-c"]) {
        const world = new World(seed, size);
        const castles = castlesOf(world);
        expect(castles.length, `${seed} ${size}`).toBe(3);
        expect(castles.map((c) => c.tier).sort()).toEqual([...CASTLE_TIERS].map(Number).sort());
        expect(castles.map((c) => world.castleAlignment(c.id)).sort()).toEqual([...ALIGNMENTS].sort());
        expect(castles.every((c) => c.size === 2)).toBe(true);
      }
    });
  }

  it("has the banner, throne, king and statues of its kind, four statues that spell a four-letter word, and no roaming monster", { timeout: 120_000 }, () => {
    for (const seed of ["castles-a", "castles-b", "castles-c", "castles-d"]) {
      const world = new World(seed, "default");
      for (const poi of castlesOf(world)) {
        const map = generateInterior(world, poi);
        const content = buildMapContent(world, poi, map);
        const kind = map.castle!.alignment;
        expect(validateContent(map, content), `${seed} ${poi.id}`).toEqual([]);
        expect(content.spawns).toHaveLength(0);
        for (const a of content.actions.filter((x) => x.kind === "decor" && [103, 104, 105].includes(Number(x.params.item)))) expect(a.params.item).toBe(BANNER[kind]);
        expect(content.actions.find((a) => a.kind === "king")!.params.persona).toBe(KING[kind]);
        expect(content.actions.find((a) => a.kind === "decor" && a.params.item === THRONE[kind])).toBeDefined();
        expect(content.actions.filter((a) => a.kind === "lore" && typeof a.params.letter === "string")).toHaveLength(4);
      }
    }
  });

  it("makes two different kinds of guard of the group of its kind, of the level of the castle and the one above", () => {
    for (const kind of ALIGNMENTS) {
      for (const tier of [2, 3, 4]) {
        const { light, heavy } = guardsOf(kind, tier, new Rng(seedFromString(`${kind}${tier}`)));
        expect(light).not.toBe(heavy);
        expect(monsterGroup(light)).toBe(GUARD_GROUP[kind]);
        expect(monsterGroup(heavy)).toBe(GUARD_GROUP[kind]);
        expect(MONSTERS[light]!.treasure_level, kind).toBeGreaterThanOrEqual(tier);
        expect(MONSTERS[heavy]!.treasure_level, kind).toBeGreaterThanOrEqual(MONSTERS[light]!.treasure_level);
      }
    }
  });

  it("opens the king's chests only after the word of the statues, an alarm and a lock that a thief picks", () => {
    const world = new World("castles-play", "default");
    const poi = castlesOf(world)[0]!;
    const map = generateInterior(world, poi);
    const content = buildMapContent(world, poi, map);
    const party = createDefaultParty();
    // the lock asks 13 to 60 (`data/locks.ts`), which a party of level 1 never reaches: the castles lie in tiers 2 to 4
    for (const c of party.characters) c.level = 20;
    const opened = new Set<string>();
    let attempt = 0;
    const use = (a: ActionInstance, answer?: string | null) => {
      const ctx: ActionContext = { party, rootSeed: world.rootSeed, content, opened, answer, attempt: attempt++, monsterThemes: {}, tier: poi.tier };
      let out = resolveAction(a, ctx);
      if (out.effects.some((e) => e.type === "confirm") && answer === undefined) out = resolveAction(a, { ...ctx, answer: "yes" });
      if (out.consumed) opened.add(a.uid);
      for (const k of out.state?.add ?? []) opened.add(k);
      return out;
    };
    const chest = content.actions.find((a) => a.params.lock === "code")!;
    // sealed before the word
    expect(use(chest).effects[0]).toMatchObject({ type: "text", text: expect.stringContaining("sealed") });
    // the word, from the hints
    const word = content.actions
      .filter((a) => typeof a.params.letter === "string")
      .sort((p, q) => Number(p.params.order) - Number(q.params.order))
      .map((a) => String(a.params.letter))
      .join("")
      .toLowerCase();
    const statue = content.actions.find((a) => a.kind === "riddle")!;
    expect(use(statue, word).consumed).toBe(true);
    // the first touch raises the alarm, heavy guards come
    const first = use(chest);
    expect(first.effects.some((e) => e.type === "guards" && e.kind === "heavy")).toBe(true);
    expect(first.consumed).toBe(false);
    // then the lock: a party without a thief may fail a while, but the chest holds 5 million gold when it opens
    const gold = party.gold;
    let tries = 0;
    while (!opened.has(chest.uid) && tries++ < 400) use(chest);
    expect(opened.has(chest.uid)).toBe(true);
    expect(party.gold - gold).toBe(5_000_000);
  });

  it("calls the light guards once, when the first chest in the yard is broken open", () => {
    const world = new World("castles-play", "default");
    const poi = castlesOf(world)[0]!;
    const content = buildMapContent(world, poi, generateInterior(world, poi));
    const party = createDefaultParty();
    // a party that has come this far picks the simple lock of the chests in the niches (thievery grows with the level), so the alarm is the first thing in the way
    for (const c of party.characters) c.level = 40;
    const opened = new Set<string>();
    const chests = content.actions.filter((a) => a.params.warn === "alarm");
    const run = (a: ActionInstance) => {
      const ctx: ActionContext = { party, rootSeed: world.rootSeed, content, opened, monsterThemes: {}, tier: poi.tier };
      const asked = resolveAction(a, ctx);
      expect(asked.effects[0]).toMatchObject({ type: "confirm" });
      const out = resolveAction(a, { ...ctx, answer: "yes" });
      for (const k of out.state?.add ?? []) opened.add(k);
      return out;
    };
    expect(run(chests[0]!).effects.some((e) => e.type === "guards" && e.kind === "light")).toBe(true);
    expect(run(chests[1]!).effects.some((e) => e.type === "guards")).toBe(false);
  });
});
