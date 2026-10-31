import { describe, expect, it } from "vitest";
import { resolveAction, type ActionContext } from "../../src/actions/handlers";
import type { ActionInstance } from "../../src/actions/types";
import { FORBIDDEN_PROPS } from "../../src/data/dungeon-themes";
import { hasHiddenUse } from "../../src/game/minimap";
import { createDefaultParty } from "../../src/sim/party";
import { World } from "../../src/world/world";
import { questInterior } from "../helpers/quests";

const rootSeed = new World("playtest33").rootSeed;

/** The holders of attribute points in the end room of a generated place: chalice actions and barrels (a `treasure` with a bonus). */
function pointHolders(tier: number, variant: number) {
  const { content, ref } = questInterior("quest_5", "dungeon_4", tier, variant);
  const end = ref.endRoom!;
  const inEnd = (a: ActionInstance) => a.x >= end.x && a.y >= end.y && a.x < end.x + end.w && a.y < end.y + end.h;
  const holders = content.actions.filter((a) => inEnd(a) && (a.kind === "chalice" || (a.kind === "treasure" && a.params.bonus !== undefined)));
  return { holders, attrs: holders.filter((a) => a.params.bonus === "attr"), inhabitants: ref.look.inhabitants };
}

describe("33rd playtest", () => {
  it("starts a new game with 2'000 gold", () => {
    expect(createDefaultParty().gold).toBe(2000);
  });

  it("keeps the attribute points of levels 1 to 3 in a magic well, a barrel or crystals and never in a chalice", () => {
    const seen = new Set<number>();
    for (let variant = 0; variant < 80; variant++) {
      for (const tier of [1, 2, 3]) {
        const { attrs, inhabitants } = pointHolders(tier, variant);
        for (const a of attrs) {
          const item = Number(a.params.item ?? a.params.chest);
          expect([37, 88, 5, 117], `level ${tier}`).toContain(item);
          // the themes' own rule about what does not suit their inhabitants holds here too
          expect(FORBIDDEN_PROPS[inhabitants], `${a.uid} in a place of ${inhabitants}`).not.toContain(item);
          seen.add(item);
        }
      }
    }
    // all four kinds of holder turn up over the seeds
    expect([...seen].sort((a, b) => a - b)).toEqual([5, 37, 88, 117]);
  });

  it("keeps a barrel a container (`treasure`) that is drunk from like the chalice, and shows wells, barrels and crystals on the map only after use", () => {
    const barrel: ActionInstance = { uid: "t#b", kind: "treasure", x: 1, y: 1, params: { chest: 5, level: 1, gold: 0, items: 0, bonus: "attr", attr: "str", amount: 5 } };
    const party = createDefaultParty();
    const before = party.characters[2]!.str;
    const ctx: ActionContext = { party, rootSeed, monsterThemes: { beast: 1 }, tier: 1 };
    const asked = resolveAction(barrel, ctx);
    expect(asked.consumed).toBe(false);
    // (35th playtest: the question carries a look at the brew instead of the name of the attribute, and the dialog keeps it on the screen)
    const pick = asked.effects.find((e) => e.type === "pick");
    expect(pick?.type === "pick" ? pick.question : "").toContain("Who wants to drink from the barrel?");
    expect(pick?.type === "pick" ? pick.question : "").toContain("rust-red");
    expect(pick?.type === "pick" ? pick.question : "").not.toMatch(/strength|\bSTR\b/i);
    const drunk = resolveAction(barrel, { ...ctx, hero: 2 });
    expect(drunk.consumed).toBe(true);
    expect(party.characters[2]!.str).toBe(before + 5);
    expect(party.characters[0]!.str).toBe(createDefaultParty().characters[0]!.str);
    expect(hasHiddenUse(barrel)).toBe(true);
    expect(hasHiddenUse({ kind: "chalice", params: { item: 37, bonus: "attr" } })).toBe(true);
    expect(hasHiddenUse({ kind: "chalice", params: { item: 86, bonus: "level" } })).toBe(false);
  });

  it("uses the chalice from level 4 on (levels), never for attribute points below", () => {
    for (let variant = 0; variant < 40; variant++) {
      for (const holder of pointHolders(4, variant).holders) expect(Number(holder.params.item ?? holder.params.chest)).toBe(86);
    }
  });
});
