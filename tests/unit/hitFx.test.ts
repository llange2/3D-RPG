import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MONSTERS, monsterGroup } from "../../src/data/tables";
import { COG_COLOURS, BLOOD_COLOURS, HIT_COUNTS, chunkTint, hitKindOf } from "../../src/render/hitFx";
import { FX_FILES } from "../../src/render/fxSheets";

/** What flies off a monster that is hit by a blow or an arrow, by what it is made of (the user, 18. 11. 2026). */
describe("effects: what flies off a monster that is hit", () => {
  it("lets humanoids, monster humanoids and beasts bleed, robots lose cogwheels, constructs and plants lose chunks and the undead smoke", () => {
    for (const group of ["humanoid", "monster_humanoid", "beast"]) expect(hitKindOf(group)).toBe("blood");
    expect(hitKindOf("robot")).toBe("cogs");
    expect(hitKindOf("magical_construct")).toBe("chunks");
    expect(hitKindOf("plant")).toBe("chunks");
    expect(hitKindOf("undead")).toBe("smoke");
  });

  it("knows a kind for every monster of the table, and the groups of the table are exactly the ones the rules name", () => {
    const groups = new Set(Object.values(MONSTERS).map((m) => monsterGroup(m.id)));
    expect([...groups].sort()).toEqual(["beast", "humanoid", "magical_construct", "monster_humanoid", "plant", "robot", "undead"]);
    for (const m of Object.values(MONSTERS)) expect(["blood", "cogs", "chunks", "smoke"]).toContain(hitKindOf(monsterGroup(m.id)));
  });

  it("takes the colour of the bits of a construct or a plant from its model, bright enough to be seen", () => {
    const seen = new Set<string>();
    for (const m of Object.values(MONSTERS)) {
      if (hitKindOf(monsterGroup(m.id)) !== "chunks") continue;
      const tint = chunkTint(m.id);
      expect(Math.max(...tint)).toBeGreaterThanOrEqual(0.74);
      expect(Math.max(...tint)).toBeLessThanOrEqual(1);
      seen.add(tint.map((c) => c.toFixed(2)).join(","));
    }
    // (the Candle Creep and the Cryo Spore are not the same colour)
    expect(seen.size).toBeGreaterThan(5);
    // a monster without a model colour gets a neutral grey
    expect(chunkTint(99999)).toEqual([0.6, 0.6, 0.6]);
  });

  it("uses reds for the blood and greys and silvers for the cogwheels", () => {
    for (const [r, g, b] of BLOOD_COLOURS) expect(r).toBeGreaterThan(g * 4 + b * 4 - 0.1);
    for (const [r, g, b] of COG_COLOURS) expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThan(0.15);
  });

  it("throws fewer pieces with the effects on Low than on Full, and some of every kind", () => {
    for (const [full, low] of Object.values(HIT_COUNTS)) {
      expect(low).toBeGreaterThan(0);
      expect(low).toBeLessThanOrEqual(full);
    }
  });

  it("has the picture of the cogwheel", () => {
    expect(existsSync(join(import.meta.dirname, "..", "..", "public", "assets", FX_FILES.cog))).toBe(true);
  });
});
