import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { TALENTS, talentInfo } from "../../src/data/tables";
import { flightSeconds } from "../../src/render/projectiles";
import { cureEffects, hitEffect, protectionEffect } from "../../src/ui/avatarFx";

const UI = join(import.meta.dirname, "..", "..", "public", "assets", "ui");

describe("pictures over a portrait", () => {
  it("maps the cured conditions to the old cure pictures", () => {
    expect(cureEffects(["Poisoned"])).toEqual(["cure_poison"]);
    expect(cureEffects(["Weak", "Drunk"])).toEqual(["cure_weak"]);
    expect(cureEffects(["Sleeping", "Cursed"])).toEqual(["cure_sleeping", "cure_curse"]);
    expect(cureEffects([])).toEqual([]);
    // a condition without a picture is skipped
    expect(cureEffects(["Lovestruck"])).toEqual([]);
  });

  it("maps damage types to hit pictures, poison to acid and anything else to physical", () => {
    expect(hitEffect("fire")).toBe("fire_hit");
    expect(hitEffect("Ice")).toBe("ice_hit");
    expect(hitEffect("poison")).toBe("acid_hit");
    expect(hitEffect("acid")).toBe("acid_hit");
    expect(hitEffect("magic")).toBe("magic_hit");
    expect(hitEffect("physical")).toBe("physical_hit");
    expect(hitEffect("sword")).toBe("physical_hit");
    expect(protectionEffect("ice")).toBe("gui_protect_ice");
  });

  it("only names pictures that exist", () => {
    if (!existsSync(UI)) return; // assets not built
    const all = [
      ...cureEffects(["Sleeping", "Weak", "Poisoned", "Crazy", "Diseased", "Paralyzed", "Petrified", "Cursed"]),
      "cure_hp",
      ...["fire", "ice", "acid", "magic", "physical"].map(hitEffect),
      ...(["acid", "fire", "ice", "magic"] as const).map(protectionEffect),
      "gui_levitate",
      "gui_power_shield",
      "gui_wizard_eye",
    ];
    for (const name of all) expect(existsSync(join(UI, `tex_${name}.webp`)), name).toBe(true);
  });
});

describe("flight of a projectile", () => {
  it("takes a little longer for every tile, at least one tile's worth", () => {
    expect(flightSeconds(0)).toBeCloseTo(0.12);
    expect(flightSeconds(0.9)).toBeCloseTo(0.12);
    expect(flightSeconds(1)).toBeCloseTo(0.24);
    expect(flightSeconds(5.5)).toBeCloseTo(0.72);
    expect(flightSeconds(6)).toBeGreaterThan(flightSeconds(5));
  });
});

describe("talent texts", () => {
  it("reads the name and description from the texts of the old game", () => {
    expect(talentInfo("talent_merchant")).toEqual({ name: "Merchant", description: "50% discount when buying and 100% more gold, when selling." });
    expect(talentInfo("title_crusader").name).toBe("Crusader");
  });

  it("gives every talent a name of its own", () => {
    const names = Object.keys(TALENTS).map((id) => talentInfo(id).name);
    expect(new Set(names).size).toBe(names.length);
    expect(talentInfo("talent_cave_explorer").name).toBe("Cave Explorer");
  });

  it("falls back to the id for an unknown talent", () => {
    expect(talentInfo("talent_nothing")).toEqual({ name: "talent_nothing", description: "" });
  });
});
