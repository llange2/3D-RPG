import { describe, expect, it } from "vitest";
import { castSpell, isAreaSpell, isAttackSpell } from "../../src/sim/spells";
import { PRISMATIC_ELEMENTS, STAR_BURST_RADIUS, areaSpell, createEncounter, createMonster, type GridView } from "../../src/sim/encounter";
import { Rng, seedFromString } from "../../src/core/rng";
import { MONSTERS, SPELLS } from "../../src/data/tables";
import { createDefaultParty } from "../../src/sim/party";
import { BEAM_SECONDS, PROJECTILE_LAMPS, elementColor } from "../../src/render/projectiles";
import { environmentModelKeys, FLOOR_MODELS } from "../../src/render/environment";
import { pillarModelKeys } from "../../src/render/interiorView";
import { generateInterior } from "../../src/interiors";
import { World } from "../../src/world/world";

const open: GridView = { walkable: () => true, water: () => false, opaque: () => false };
const rng = (s: string) => new Rng(seedFromString(s));
const GOBLIN = Object.values(MONSTERS).find((m) => m.name === "Goblin")!.id;

describe("the 48th playtest (8. 11. 2026)", () => {
  it("draws the pillars of a town from the user's single column (point 1)", () => {
    const world = new World("pillars-48", "default");
    const town = world.allPois().filter((p) => p.kind === "town").map((p) => generateInterior(world, p)).find((m) => (m.pillars?.length ?? 0) > 0);
    expect(town, "a town with a pillar cell").toBeDefined();
    expect(pillarModelKeys(town!)).toEqual(["blk_city_pillar"]);
  });

  it("makes Star Burst and Prismatic Light area spells that need no target (points 2 and 5)", () => {
    for (const id of [76, 73]) {
      expect(isAreaSpell(id), `spell ${id}`).toBe(true);
      expect(isAttackSpell(id), `spell ${id}`).toBe(false);
    }
    // the cast comes back as an attack with its special rule, the game then hits everything round the party
    const party = createDefaultParty();
    const caster = party.characters[3]!;
    caster.spells = [76, 73];
    caster.mana = caster.sp = 9999;
    caster.level = 10;
    expect(castSpell(party, 3, 76, rng("a"))).toMatchObject({ kind: "attack", special: "star_burst" });
    expect(castSpell(party, 3, 73, rng("b"))).toMatchObject({ kind: "attack", special: "prismatic_light" });
  });

  it("lets Star Burst reach a circle of three tiles round the party and no farther", () => {
    const party = createDefaultParty();
    for (const c of party.characters) c.hp = c.health = 99999;
    const enc = createEncounter();
    const inside = [[3, 0], [0, -3], [2, 2], [-2, 1]] as const;
    const outside = [[4, 0], [3, 3], [0, 5]] as const;
    [...inside, ...outside].forEach(([x, y], i) => enc.monsters.push(createMonster(`m${i}`, GOBLIN, x, y)));
    const events = areaSpell(party, open, enc, 0, 0, rng("sb"), "star_burst", { damage: 200, type: "magic" });
    const hit = events.filter((e) => e.type === "party_attack").map((e) => (e as { uid: string }).uid).sort();
    expect(hit).toEqual(inside.map((_, i) => `m${i}`).sort());
    expect(STAR_BURST_RADIUS).toBe(3);
  });

  it("gives every monster of Prismatic Light one of the four damage types", () => {
    expect([...PRISMATIC_ELEMENTS].sort()).toEqual([...(SPELLS[73]!.dam_type ?? [])].sort());
  });

  it("lights every element of a spell, by day too, and fades the lines of Prismatic Light in 0.7 s (points 5 and 6)", () => {
    for (const kind of ["fire", "ice", "acid", "magic"] as const) {
      const lamp = PROJECTILE_LAMPS[kind]!;
      expect(lamp.daylight, kind).toBeGreaterThan(0);
      expect(elementColor(kind)).toEqual(lamp.color);
    }
    // a poison cloud shines like acid, a type without a picture like magic
    expect(elementColor("poison")).toEqual(elementColor("acid"));
    expect(elementColor("energy")).toEqual(elementColor("magic"));
    expect(BEAM_SECONDS).toBe(0.7);
  });

  it("has the wooden floor of the tower as a floor model", () => {
    expect(FLOOR_MODELS.tex_wooden_floor).toEqual({ model: "blk_wooden_floor", replacesQuad: false });
    expect(environmentModelKeys("floor")).toContain("blk_wooden_floor");
  });
});
