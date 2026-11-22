import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Rng, seedFromString } from "../../src/core/rng";
import { MONSTERS, SPELLS } from "../../src/data/tables";
import { parseSettings, DEFAULT_SETTINGS } from "../../src/game/settings";
import { PROJECTILE_MODELS, SWARM_INSECTS, SWARM_INSECTS_SHARED } from "../../src/render/projectiles";
import { FANTASTIC_FREEZE_RADIUS, areaSpell, createEncounter, createMonster, type GridView } from "../../src/sim/encounter";
import { createDefaultParty } from "../../src/sim/party";
import { isAreaSpell, isAttackSpell } from "../../src/sim/spells";

/** bug_fix_81: the updates of `docs/SPELLS.md` (Fantastic Freeze, Mass Distortion), the swarm, "Wait for death animation". */

const rng = (s: string) => new Rng(seedFromString(s));
const open: GridView = { walkable: () => true, water: () => false, opaque: () => false };
const root = join(__dirname, "..", "..");
const living = Object.values(MONSTERS).find((m) => m.health > 5 && m.treasure_level < 5 && m.terrain === "land")!.id;

describe("Fantastic Freeze and Mass Distortion are area spells", () => {
  it("need nothing to aim at", () => {
    for (const id of [53, 64]) {
      expect(isAreaSpell(id)).toBe(true);
      expect(isAttackSpell(id)).toBe(false);
    }
  });

  it("Fantastic Freeze hits the 5 x 5 field round the party, walls or no walls, and nothing beyond", () => {
    expect(FANTASTIC_FREEZE_RADIUS).toBe(2);
    const enc = createEncounter();
    // the corners of the 5 x 5 square are in, the third ring is out
    const cells: [number, number][] = [[2, 2], [-2, 2], [0, -2], [2, 0], [3, 0], [0, 3], [3, 3]];
    cells.forEach(([x, y], i) => enc.monsters.push(createMonster(`m${i}`, living, 10 + x, 10 + y)));
    const walled: GridView = { walkable: () => true, water: () => false, opaque: () => true };
    const events = areaSpell(createDefaultParty(), walled, enc, 10, 10, rng("ff"), "fantastic_freeze", { damage: 40, type: "ice" });
    const hit = new Set(events.flatMap((e) => (e.type === "party_attack" ? [e.uid] : [])));
    expect([...hit].sort()).toEqual(["m0", "m1", "m2", "m3"]);
  });

  it("Mass Distortion works on the monsters in view only", () => {
    let seen = 0;
    for (let i = 0; i < 200; i++) {
      const enc = createEncounter();
      enc.monsters.push(createMonster("a", living, 1, 0), createMonster("b", living, 0, 1));
      areaSpell(createDefaultParty(), open, enc, 0, 0, rng(`md${i}`), "mass_distortion", { damage: 0, type: "magic" }, (m) => m.x === 1);
      if (enc.monsters.find((m) => m.uid === "a")!.hp < MONSTERS[living]!.health) seen++;
      expect(enc.monsters.find((m) => m.uid === "b")!.hp).toBe(MONSTERS[living]!.health);
    }
    expect(seen).toBeGreaterThan(15);
  });

  it("takes the spell sheet's new numbers", () => {
    expect(SPELLS[64]!.mana).toBe(80);
    expect(SPELLS[53]!.text).toContain("2-field radius");
    expect(SPELLS[49]!.text).toContain("straight line");
    expect(SPELLS[68]!.text).toContain("straight line");
  });
});

describe("the swarm and the flowers", () => {
  it("loads the insect with the game, ten of them for one monster and five each for two", () => {
    expect(PROJECTILE_MODELS).toContain("proj_insect");
    expect(SWARM_INSECTS).toBe(10);
    expect(SWARM_INSECTS_SHARED).toBe(5);
    const registry = JSON.parse(readFileSync(join(root, "public", "assets", "models.static.original.json"), "utf-8")) as Record<string, { tris: number }>;
    expect(registry["proj_insect"]).toBeDefined();
    // the flowers keep their petals: the first build threw most of them away (holes) and rebuilt the normals of the open sheets (black patches)
    expect(registry["obj_flower_red"]!.tris).toBeGreaterThan(700);
    expect(registry["obj_flower_yellow"]!.tris).toBeGreaterThan(700);
  });
});

describe("Wait for death animation", () => {
  it("is on by default, and a stored setting is read", () => {
    expect(DEFAULT_SETTINGS.waitForDeath).toBe(true);
    expect(parseSettings(null).waitForDeath).toBe(true);
    expect(parseSettings(JSON.stringify({ waitForDeath: false })).waitForDeath).toBe(false);
    expect(parseSettings(JSON.stringify({ waitForDeath: "no" })).waitForDeath).toBe(true);
  });
});
