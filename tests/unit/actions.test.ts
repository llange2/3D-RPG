import { describe, expect, it } from "vitest";
import { buildMapContent, generateContent, validateContent, ACTION_DEFS, actionTrigger, blocksCell, kindForLegacyId, START_TOWN_ID, type ActionKind } from "../../src/actions";
import { evalExpr } from "../../src/actions/expr";
import { resolveAction } from "../../src/actions/handlers";
import { createDefaultParty } from "../../src/sim/party";
import { Rng, seedFromString } from "../../src/core/rng";
import { MONSTERS } from "../../src/data/tables";
import { MONSTER_THEME_NAMES, monsterThreat, monstersOfTheme, pickMonster, themesOf, threatPercentile } from "../../src/data/monsters";
import { RULE_SETS } from "../../src/data/rules";
import { analyzeTopology, generateInterior } from "../../src/interiors";
import { blueprintFor } from "../../src/interiors/town";
import { BIOME, type Biome, type Poi, type PoiKind } from "../../src/world/types";
import { World } from "../../src/world/world";

const world = new World("actions");

function poiFor(kind: PoiKind, i: number, biome: Biome = BIOME.MEADOW, tier = 1 + (i % 5)): Poi {
  return { id: `p:t:${kind}:${i}`, kind, name: `${kind} ${i}`, x: i * 7 - 300, y: i * 13 - 900, size: 1, side: "S", region: { rx: 0, ry: 0 }, anchor: false, tier, biome };
}

const KINDS: PoiKind[] = ["dungeon", "cave", "castle", "town"];
const BIOMES: Biome[] = [BIOME.MEADOW, BIOME.FOREST, BIOME.DESERT, BIOME.SNOW, BIOME.SWAMP, BIOME.LAVA];

describe("expression evaluator", () => {
  const rng = new Rng(seedFromString("expr"));
  it("computes integers with precedence, parentheses, unary minus and floor division", () => {
    expect(evalExpr("2+3*4", {}, rng)).toBe(14);
    expect(evalExpr("(2+3)*4", {}, rng)).toBe(20);
    expect(evalExpr("-3+10", {}, rng)).toBe(7);
    expect(evalExpr("7/2", {}, rng)).toBe(3);
    expect(evalExpr("tier*80+5", { tier: 3 }, rng)).toBe(245);
    expect(evalExpr("min(8,tier+1)", { tier: 9 }, rng)).toBe(8);
    expect(evalExpr("max(2,1)", {}, rng)).toBe(2);
  });
  it("rand stays inside its bounds and is deterministic", () => {
    const a = new Rng(seedFromString("r"));
    const b = new Rng(seedFromString("r"));
    for (let i = 0; i < 200; i++) {
      const v = evalExpr("rand(3,7)", {}, a);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
      expect(evalExpr("rand(3,7)", {}, b)).toBe(v);
    }
  });
  it("rejects bad input instead of guessing", () => {
    expect(() => evalExpr("1+", {}, rng)).toThrow();
    expect(() => evalExpr("foo", {}, rng)).toThrow(/unknown variable/);
    expect(() => evalExpr("bar(1)", {}, rng)).toThrow(/unknown function/);
    expect(() => evalExpr("1/0", {}, rng)).toThrow(/division by zero/);
    expect(() => evalExpr("(1", {}, rng)).toThrow();
    expect(() => evalExpr("1 2", {}, rng)).toThrow();
  });
});

describe("action registry", () => {
  it("maps every generated legacy id to exactly one kind", () => {
    const seen = new Map<number, ActionKind>();
    for (const def of Object.values(ACTION_DEFS)) {
      for (const id of def.legacyIds) {
        expect(seen.has(id), `legacy id ${id} is claimed twice`).toBe(false);
        seen.set(id, def.kind);
        expect(kindForLegacyId(id)).toBe(def.kind);
      }
    }
    expect(kindForLegacyId(13)).toBeNull(); // quest actions are campaign content
  });
  it("loads and validates the rule files", () => {
    for (const set of Object.values(RULE_SETS)) expect(set.rules.length).toBeGreaterThan(3);
  });
});

describe("monster themes", () => {
  it("cover all 91 monsters and give every theme monsters", () => {
    for (const id of Object.keys(MONSTERS).map(Number)) expect(themesOf(id).length, `monster ${id} has no theme`).toBeGreaterThan(0);
    for (const theme of MONSTER_THEME_NAMES) expect(monstersOfTheme(theme).length, theme).toBeGreaterThan(2);
  });
  it("find a monster for every theme and tier (a theme with nothing at or below the tier lends the beasts, never a stronger monster)", () => {
    const rng = new Rng(seedFromString("monsters"));
    for (const theme of MONSTER_THEME_NAMES) {
      for (let tier = 1; tier <= 5; tier++) {
        const m = pickMonster(rng, theme, tier, theme === "aquatic");
        const own = monstersOfTheme(theme).some((o) => o.treasure_level <= tier && (theme === "aquatic" || o.terrain === "land"));
        if (own) expect(themesOf(m.id), `${theme} ${tier}`).toContain(theme);
        // water monsters have no land kin: the weakest of them is all there is (the Piranha, level 2, on the first tier)
        if (theme !== "aquatic") expect(m.treasure_level, `${theme} ${tier}`).toBeLessThanOrEqual(tier);
      }
    }
  });
  it("rank monsters by threat so that tier 1 only meets the weakest ones", () => {
    const rng2 = new Rng(seedFromString("tier1"));
    const weak = monsterThreat(MONSTERS[31]!); // Goblin
    const strong = monsterThreat(MONSTERS[32]!); // Great Hydra
    expect(strong).toBeGreaterThan(weak * 10);
    for (const theme of MONSTER_THEME_NAMES) {
      for (let i = 0; i < 20; i++) {
        const m = pickMonster(rng2, theme, 1, theme === "aquatic");
        // within the weakest fifth of all monsters, or the closest the theme can offer
        const inBand = threatPercentile(m.id) <= 0.2;
        const themeHasBand = monstersOfTheme(theme).some((x) => threatPercentile(x.id) <= 0.2 && (theme === "aquatic" || x.terrain === "land"));
        if (themeHasBand) expect(inBand, `${theme}: ${m.name}`).toBe(true);
      }
    }
    // a hundred first-tier groups never contain a monster that kills a fresh hero in one blow
    for (let i = 0; i < 100; i++) {
      const m = pickMonster(rng2, MONSTER_THEME_NAMES[i % MONSTER_THEME_NAMES.length]!, 1, false);
      expect(m.damage_max * Math.min(1, m.no_of_attacks), m.name).toBeLessThan(40);
    }
  });

  it("keep water monsters out of land themes", () => {
    const rng = new Rng(seedFromString("water"));
    for (let i = 0; i < 300; i++) expect(pickMonster(rng, "beast", 1 + (i % 5)).terrain).toBe("land");
  });
});

describe("rule engine", () => {
  for (const kind of KINDS) {
    it(`${kind}: 500 seeds yield valid, playable content`, { timeout: 180_000 }, () => {
      for (let i = 0; i < 500; i++) {
        const poi = poiFor(kind, i, BIOMES[i % BIOMES.length]);
        const map = generateInterior(world, poi);
        const content = buildMapContent(world, poi, map);
        const issues = validateContent(map, content);
        expect(issues, `${kind} #${i} (${map.theme.id})`).toEqual([]);
      }
    });

    it(`${kind}: content is deterministic`, () => {
      for (let i = 0; i < 25; i++) {
        const poi = poiFor(kind, i);
        const a = buildMapContent(world, poi, generateInterior(world, poi));
        const b = buildMapContent(new World("actions"), poi, generateInterior(new World("actions"), poi));
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      }
    });
  }

  it("gives every town all seven services, each on a house of its own", () => {
    const all = ["bank", "guild", "inn", "smith", "tavern", "temple", "training"];
    const start: Poi = { ...poiFor("town", 1), id: START_TOWN_ID };
    const names = (poi: Poi) => buildMapContent(world, poi, generateInterior(world, poi)).actions.filter((a) => a.kind === "service").map((a) => String(a.params.service));
    expect(names(start).sort()).toEqual(all);
    for (let i = 0; i < 300; i++) expect(names(poiFor("town", i)).sort(), `town #${i}`).toEqual(all);
  });

  it("puts the plan's fountain and the old town's talent sellers on its streets, all blocking their cell", () => {
    for (let i = 0; i < 200; i++) {
      const poi = poiFor("town", i);
      const map = generateInterior(world, poi);
      const content = buildMapContent(world, poi, map);
      const plan = blueprintFor(poi.tier);
      // one fountain heals, in the towns of the first tier only (38th playtest); the fountains of the others are decoration
      const fountains = content.actions.filter((a) => a.kind === "fountain");
      expect(fountains, `town #${i}`).toHaveLength(poi.tier === 1 && plan.decor.some((d) => d.item === 2 || d.item === 89) ? 1 : 0);
      // the people of the old town who sell talents are all there, and the guild's apprentice (the fourth town gets one of its own), nobody else
      const sellers = content.actions.filter((a) => a.kind === "talent");
      const expected = plan.talents.map((t) => t.talent);
      if (!expected.includes(`guild_level_${poi.tier}`)) expected.push(`guild_level_${poi.tier}`);
      expect(sellers.map((a) => a.params.talent).sort(), `town #${i} sellers`).toEqual(expected.sort());
      for (const a of [...fountains, ...sellers]) {
        expect(blocksCell(a)).toBe(true);
        expect(actionTrigger(a)).toBe("interact"); // the party bumps into them, it never walks over them
      }
      // no message lies on the streets any more: what a town says, it says through an object or a person standing on their cell
      for (const a of content.actions.filter((x) => x.kind === "lore")) {
        expect(typeof a.params.persona === "number" || typeof a.params.object === "string" || typeof a.params.item === "number", a.uid).toBe(true);
        expect(blocksCell(a)).toBe(true);
        expect(actionTrigger(a)).toBe("interact");
      }
    }
  });

  it("lets a fountain heal the hurt once a day and says so when it is dry", () => {
    const party = createDefaultParty();
    // (a fountain with `heal` is the campaign's: it gives hit points; the healing fountain of the generated towns has `full`, see playtest38.test.ts)
    const fountain = { uid: "t#fountain:0", kind: "fountain" as const, x: 1, y: 1, params: { heal: 12 } };
    const ctx = { party, rootSeed: world.rootSeed, monsterThemes: { beast: 1 }, tier: 1 };
    const first = party.characters[0]!;
    first.hp = Math.max(1, first.health - 20);
    const hpBefore = first.hp;

    const healthyParty = resolveAction(fountain, { ...ctx, party: createDefaultParty() });
    expect(healthyParty.usedToday, "nobody hurt: the water is not used up").toBe(false);

    const drink = resolveAction(fountain, ctx);
    expect(drink.usedToday).toBe(true);
    expect(first.hp).toBe(Math.min(first.health, hpBefore + 12));
    expect(drink.effects.some((e) => e.type === "heal")).toBe(true);

    const dry = resolveAction(fountain, { ...ctx, usedToday: true });
    expect(dry.usedToday).toBeUndefined();
    expect(dry.effects).toEqual([{ type: "text", text: "The basin is dry. It fills again with the next dawn." }]);
  });

  it("adding a rule at the end does not change what the earlier rules placed", () => {
    for (let i = 0; i < 30; i++) {
      const poi = poiFor("dungeon", i);
      const map = generateInterior(world, poi);
      const base = RULE_SETS.dungeon;
      const extended = { ...base, rules: [...base.rules, { id: "extra_lore", kind: "lore" as const, anchor: "roomEdge" as const, count: { perMap: [1, 3] as [number, number] }, params: { pool: "dungeon", line: 3 } }] };
      const ctx = { rootSeed: world.rootSeed };
      const topo = analyzeTopology(map);
      const a = generateContent(map, base, ctx, topo);
      const b = generateContent(map, extended, ctx, topo);
      for (const act of a.actions) expect(b.actions.find((x) => x.uid === act.uid)).toEqual(act);
      for (const sp of a.spawns) expect(b.spawns.find((x) => x.uid === sp.uid)).toEqual(sp);
    }
  });

  it("makes monsters stronger with the tier of the place", () => {
    const meanLevel = (tier: number) => {
      let sum = 0;
      let n = 0;
      for (let i = 0; i < 60; i++) {
        const poi = poiFor("dungeon", i, BIOME.MEADOW, tier);
        const content = buildMapContent(world, poi, generateInterior(world, poi));
        for (const s of content.spawns) for (const id of s.monsterIds) {
          sum += MONSTERS[id]!.treasure_level;
          n++;
        }
      }
      return sum / n;
    };
    const t1 = meanLevel(1);
    const t3 = meanLevel(3);
    const t5 = meanLevel(5);
    expect(t3).toBeGreaterThan(t1 + 0.5);
    expect(t5).toBeGreaterThan(t3 + 0.3);
  });

  it("generates content quickly (median under 30 ms)", () => {
    const times: number[] = [];
    for (let i = 0; i < 25; i++) {
      const poi = poiFor("dungeon", 2000 + i);
      const map = generateInterior(world, poi);
      const t0 = performance.now();
      buildMapContent(world, poi, map);
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    expect(times[12]!).toBeLessThan(30);
  });
});
