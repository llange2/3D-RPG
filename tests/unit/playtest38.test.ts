import { describe, expect, it } from "vitest";
import { buildMapContent, validateContent } from "../../src/actions";
import { FOUNTAIN_CURES, FOUNTAIN_MAX_LEVEL, brittleQuestion, resolveAction } from "../../src/actions/handlers";
import { identifyLines } from "../../src/game/identify";
import { generateInterior } from "../../src/interiors";
import { addCondition } from "../../src/sim/character";
import { createDefaultParty } from "../../src/sim/party";
import { BIOME, type Poi } from "../../src/world/types";
import { World } from "../../src/world/world";

const world = new World("playtest38");

function town(i: number, tier: number): Poi {
  return { id: `p:t:town:${i}`, kind: "town", name: `town ${i}`, x: i * 7 - 300, y: i * 13 - 900, size: 1, side: "S", region: { rx: 0, ry: 0 }, anchor: false, tier, biome: BIOME.MEADOW };
}

const ctxOf = (party: ReturnType<typeof createDefaultParty>) => ({ party, rootSeed: world.rootSeed, monsterThemes: { beast: 1 }, tier: 1 });
const fountain = { uid: "t#fountain:0", kind: "fountain" as const, x: 1, y: 1, params: { full: true } };

describe("38th playtest, point 5: the healing fountain of the first-tier towns", () => {
  it("is in the towns of the first tier only, and exactly one there", () => {
    for (let i = 0; i < 60; i++) {
      for (const tier of [1, 2, 3, 4, 5]) {
        const poi = town(i, tier);
        const map = generateInterior(world, poi);
        const content = buildMapContent(world, poi, map);
        expect(content.actions.filter((a) => a.kind === "fountain"), `town ${i} tier ${tier}`).toHaveLength(tier === 1 ? 1 : 0);
        expect(validateContent(map, content), `town ${i} tier ${tier}`).toEqual([]);
      }
    }
  });

  it("is a random fountain of the town, not always the one nearest the middle", () => {
    let nearest = 0;
    let towns = 0;
    for (let i = 0; i < 120; i++) {
      const poi = town(i, 1);
      const map = generateInterior(world, poi);
      const content = buildMapContent(world, poi, map);
      const all = content.actions.filter((a) => a.kind === "fountain" || (a.kind === "decor" && a.params.item === 2));
      const healer = all.find((a) => a.kind === "fountain")!;
      const middle = { x: (map.width - 1) / 2, y: (map.height - 1) / 2 };
      const dist = (a: { x: number; y: number }) => Math.hypot(a.x - middle.x, a.y - middle.y);
      const closest = [...all].sort((p, q) => dist(p) - dist(q))[0]!;
      towns++;
      if (closest === healer) nearest++;
    }
    // before, it was the nearest in every town; a random one of nine is so in about one of nine
    expect(nearest / towns).toBeLessThan(0.4);
  });

  it("gives back hit points and mana and cures poison, disease, madness, a knock-out, sleep and weakness of every hero up to level 10", () => {
    const party = createDefaultParty();
    for (const c of party.characters) {
      c.level = FOUNTAIN_MAX_LEVEL;
      c.hp = 1;
      c.sp = 0;
    }
    const first = party.characters[0]!;
    first.hp = 0;
    for (const cond of FOUNTAIN_CURES) addCondition(first, cond, 0);
    const second = party.characters[1]!;
    addCondition(second, "Cursed", 0);

    const outcome = resolveAction(fountain, ctxOf(party));
    expect(outcome.usedToday).toBe(true);
    for (const c of party.characters) {
      expect(c.hp, c.name).toBe(c.health);
      expect(c.sp, c.name).toBe(c.mana);
    }
    expect(first.conditions).toEqual(["Healthy"]);
    // (a curse is no business of the fountain)
    expect(second.conditions).toContain("Cursed");
  });

  it("does not count a drink that nobody needed, and heals the weak but not heroes above level 10", () => {
    const party = createDefaultParty();
    for (const c of party.characters) c.level = 1;
    const idle = resolveAction(fountain, ctxOf(party));
    expect(idle.usedToday).toBeFalsy();

    party.characters[0]!.hp = 1;
    party.characters[1]!.hp = 1;
    party.characters[1]!.level = FOUNTAIN_MAX_LEVEL + 1;
    const mixed = resolveAction(fountain, ctxOf(party));
    expect(mixed.usedToday).toBe(true);
    expect(party.characters[0]!.hp).toBe(party.characters[0]!.health);
    expect(party.characters[1]!.hp, "too powerful: nothing happens").toBe(1);
    const text = mixed.effects.filter((e) => e.type === "text").map((e) => (e.type === "text" ? e.text : "")).join(" ");
    expect(text).toContain("Heal the weak");
  });

  it("tells a party that has outgrown it, and does not use up the day", () => {
    const party = createDefaultParty();
    for (const c of party.characters) {
      c.level = FOUNTAIN_MAX_LEVEL + 1;
      c.hp = 1;
    }
    const outcome = resolveAction(fountain, ctxOf(party));
    expect(outcome.usedToday).toBeFalsy();
    expect(party.characters.every((c) => c.hp === 1)).toBe(true);
    const text = outcome.effects.map((e) => (e.type === "text" ? e.text : "")).join(" ");
    expect(text).toContain("You drink the water in anticipation of healing, but nothing happens.");
    expect(text).toContain("'Heal the weak'");
  });

  it("is still dry for the rest of the day once it has helped", () => {
    const party = createDefaultParty();
    party.characters[0]!.level = 1;
    party.characters[0]!.hp = 1;
    expect(resolveAction(fountain, { ...ctxOf(party), usedToday: true }).effects).toEqual([{ type: "text", text: "The basin is dry. It fills again with the next dawn." }]);
  });
});

describe("38th playtest, point 8: the brittle wall asks where it is", () => {
  it("says in front of, next to or behind you", () => {
    expect(brittleQuestion("front")).toBe("The wall in front of you looks brittle.\nDo you want to break it?");
    expect(brittleQuestion(undefined)).toBe("The wall in front of you looks brittle.\nDo you want to break it?");
    expect(brittleQuestion("side")).toBe("The wall next to you looks brittle.\nDo you want to break it?");
    expect(brittleQuestion("behind")).toBe("The wall behind you looks brittle.\nDo you want to break it?");
  });

  it("is asked with the side the game found", () => {
    const party = createDefaultParty();
    party.talents.push("talent_perceptive");
    const wall = { uid: "t#brittle:0", kind: "breakable_wall" as const, x: 2, y: 2, params: {} };
    const asked = resolveAction(wall, { ...ctxOf(party), wallSide: "side" });
    expect(asked.effects).toEqual([{ type: "confirm", title: "Brittle wall", question: brittleQuestion("side") }]);
  });
});

describe("38th playtest, point 2: Identify lists the secrets", () => {
  it("names the cells of the brittle walls, the broken ones marked, or says there are none", () => {
    const poi = town(3, 2);
    expect(identifyLines(poi, null, [], []).join("\n")).toContain("Secrets (brittle walls): none");
    const text = identifyLines(poi, null, [], [{ x: 4, y: 7, broken: false }, { x: 9, y: 2, broken: true }]).join("\n");
    expect(text).toContain("Secrets (brittle walls): 4/7, 9/2 (broken)");
  });
});
