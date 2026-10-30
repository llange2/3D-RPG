import { describe, expect, it } from "vitest";
import { resolveAction, type ActionContext } from "../../src/actions/handlers";
import type { ActionInstance } from "../../src/actions/types";
import { createDefaultParty } from "../../src/sim/party";
import { World } from "../../src/world/world";

const rootSeed = new World("chalice").rootSeed;
const cup = (params: ActionInstance["params"]): ActionInstance => ({ uid: "cup", kind: "chalice", x: 1, y: 1, params: { item: 86, ...params } });

describe("chalices with a bonus", () => {
  it("ask who drinks, and only that hero gets the experience", () => {
    const party = createDefaultParty();
    const a = cup({ bonus: "xp", amount: 1_000_000, lock: "code", requires: "answer" });
    const ctx: ActionContext = { party, rootSeed, tier: 5, monsterThemes: { beast: 1 }, opened: new Set(["answer"]) };
    const asked = resolveAction(a, ctx);
    expect(asked.effects.some((e) => e.type === "pick")).toBe(true);
    expect(asked.consumed).toBe(false);
    const xp = party.characters.map((c) => c.xp);
    const out = resolveAction(a, { ...ctx, hero: 1 });
    expect(out.consumed).toBe(true);
    party.characters.forEach((c, i) => expect(c.xp - xp[i]!).toBe(i === 1 ? 1_000_000 : 0));
  });

  it("stay sealed until the word is known, and nobody is chosen when the party cancels", () => {
    const party = createDefaultParty();
    const a = cup({ bonus: "xp", amount: 1_000_000, lock: "code", requires: "answer" });
    const sealed = resolveAction(a, { party, rootSeed, tier: 5, monsterThemes: { beast: 1 }, opened: new Set() });
    expect(sealed.consumed).toBe(false);
    expect(sealed.effects.some((e) => e.type === "pick")).toBe(false);
    const cancelled = resolveAction(a, { party, rootSeed, tier: 5, monsterThemes: { beast: 1 }, opened: new Set(["answer"]), hero: null });
    expect(cancelled.consumed).toBe(false);
  });

  it("give one level or the points of one attribute to the hero who drinks", () => {
    const party = createDefaultParty();
    const levels = party.characters.map((c) => c.level);
    resolveAction(cup({ bonus: "level", amount: 1 }), { party, rootSeed, tier: 4, monsterThemes: { beast: 1 }, hero: 3 });
    party.characters.forEach((c, i) => expect(c.level).toBe(levels[i]! + (i === 3 ? 1 : 0)));
    const luck = party.characters.map((c) => c.lck);
    const out = resolveAction(cup({ bonus: "attr", attr: "lck", amount: 10 }), { party, rootSeed, tier: 3, monsterThemes: { beast: 1 }, hero: 0 });
    expect(out.effects.some((e) => e.type === "attribute")).toBe(true);
    party.characters.forEach((c, i) => expect(c.lck).toBe(luck[i]! + (i === 0 ? 10 : 0)));
  });
});
