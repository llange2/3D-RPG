import { describe, expect, it } from "vitest";
import { buildMapContent, validateContent } from "../../src/actions";
import { resolveAction, type ActionContext } from "../../src/actions/handlers";
import type { ActionInstance } from "../../src/actions/types";
import { Rng, seedFromString } from "../../src/core/rng";
import { RIDDLES_WORLD } from "../../src/data/riddles";
import { generateInterior, planDungeon } from "../../src/interiors";
import { wordRumour } from "../../src/sim/economy";
import { createDefaultParty } from "../../src/sim/party";
import { World } from "../../src/world/world";

describe("mini quests and the riddles of the world", () => {
  it("uses every riddle of the world once: the words of quest 6, the castles and the mini quests", () => {
    for (const size of ["small", "default", "large"] as const) {
      const world = new World("minis-a", size);
      const ids = world.riddlesOfWorld().map((r) => r.riddle);
      expect(new Set(ids).size, size).toBe(ids.length);
      for (const poi of world.allPois()) {
        const ref = planDungeon(world, poi);
        if (ref) expect(ref.minis.length, poi.id).toBeLessThanOrEqual(size === "small" ? 2 : size === "default" ? 3 : 4);
      }
    }
  });

  it("builds the mini quests as statues with a riddle, a reward of twice the loot times the difficulty and a penalty for a wrong answer", { timeout: 120_000 }, () => {
    const world = new World("minis-a", "large");
    let found = 0;
    const penalties = new Set<string>();
    for (const poi of world.allPois().filter((p) => p.kind === "dungeon" || p.kind === "cave")) {
      const ref = planDungeon(world, poi)!;
      if (ref.klass === "C" || ref.minis.length === 0) continue;
      const map = generateInterior(world, poi);
      const content = buildMapContent(world, poi, map);
      expect(validateContent(map, content), poi.id).toEqual([]);
      const minis = content.actions.filter((a) => a.kind === "riddle" && a.params.mult !== undefined);
      expect(minis.length, poi.id).toBe(ref.minis.length);
      for (const m of minis) {
        found++;
        expect(m.params.answer).toBe(RIDDLES_WORLD[String(m.params.riddle)]!.answer);
        // easy answers (any number of tries) times 1 to 3 for the penalty, hard ones (three tries) times 2, 4 or 6
        expect(m.params.tries === 3 ? [2, 4, 6] : [1, 2, 3]).toContain(m.params.mult);
        penalties.add(String(m.params.fail));
        if (m.params.fail === "trap") {
          expect(content.actions.some((a) => a.kind === "trap" && a.x === m.params.tx && a.y === m.params.ty), `${m.uid} has a trap field to land on`).toBe(true);
        }
      }
    }
    expect(found).toBeGreaterThan(10);
    expect([...penalties].sort()).toEqual(["away", "none", "trap"]);
  });

  it("goes silent after three wrong answers when it is hard, throws the party away on the penalty and pays on the right answer", () => {
    const world = new World("minis-a", "large");
    let mini: ActionInstance | undefined;
    let content: ReturnType<typeof buildMapContent> | undefined;
    for (const poi of world.allPois().filter((p) => p.kind === "dungeon")) {
      const ref = planDungeon(world, poi)!;
      if (ref.klass === "C" || ref.minis.length === 0) continue;
      content = buildMapContent(world, poi, generateInterior(world, poi));
      mini = content.actions.find((a) => a.kind === "riddle" && a.params.tries === 3 && a.params.fail === "away");
      if (mini) break;
    }
    expect(mini).toBeDefined();
    const party = createDefaultParty();
    const opened = new Set<string>();
    const ctx = (answer: string): ActionContext => ({ party, rootSeed: world.rootSeed, content: content!, opened, answer, monsterThemes: {}, tier: 3 });
    for (let i = 0; i < 3; i++) {
      const out = resolveAction(mini!, ctx("nonsense"));
      expect(out.effects.some((e) => e.type === "jump")).toBe(true);
      for (const k of out.state?.add ?? []) opened.add(k);
    }
    expect(resolveAction(mini!, ctx(String(mini!.params.answer))).effects[0]).toMatchObject({ text: expect.stringContaining("silent") });
  });

  it("lets a word slip in the tavern: the answer of a riddle of the world, or, now and then, a silly one", () => {
    const world = new World("minis-a", "default");
    const real = new Set(world.riddlesOfWorld().map((r) => RIDDLES_WORLD[String(r.riddle)]!.answer));
    const texts = new Set<string>();
    let realOnes = 0;
    for (let i = 0; i < 80; i++) {
      const text = wordRumour(world, 3, new Rng(seedFromString(`r${i}`)));
      texts.add(text);
      if ([...real].some((w) => new RegExp(`\\b${w}\\b`).test(text))) realOnes++;
    }
    expect(texts.size).toBeGreaterThan(20);
    expect(realOnes).toBeGreaterThan(30);
    expect(realOnes).toBeLessThan(80);
  });
});
