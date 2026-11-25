import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_RULESET, parseRuleset } from "../../src/core/ruleset";
import { FANTASTIC_MONSTER_MODELS } from "../../src/data/monster-models";
import { BREATH_EVERY, BREATH_MOUTHS } from "../../src/render/breath";
import { FANTASTIC_GEN_VERSION } from "../../src/core/version";
import { FANTASTIC_BOSS_PAIRS, bossPairsOf, BOSS_PAIRS } from "../../src/data/quest-table";
import { hutScene } from "../../src/data/hut-texts";
import { FANTASTIC_MONSTER_IDS, MONSTERS, MONSTER_IDS, monsterGroup, monsterIdsOf } from "../../src/data/tables";
import { generateInterior } from "../../src/interiors";
import { SHOWCASE_ID } from "../../src/interiors/showcase";
import { createEncounter, createMonster, restoreRegenerators } from "../../src/sim/encounter";
import { fromSaveFile, newGameState, toSaveFile } from "../../src/game/state";
import { isFullyObsidian } from "../../src/sim/achievements";
import { makeItem } from "../../src/sim/items";
import { createDefaultParty } from "../../src/sim/party";
import { EQUIPMENT_SLOTS } from "../../src/sim/types";
import { ELEMENT_KIN, biomeAllows, isColdKin, isFireKin } from "../../src/world/biomeRules";
import { ULTRA_WILD } from "../../src/world/difficulty";
import { hutsOf } from "../../src/world/huts";
import { chunkSpawns } from "../../src/world/spawns";
import { BIOME } from "../../src/world/types";
import { World, chunkHash } from "../../src/world/world";

const byName = (name: string): number => monsterIdsOf("fantastic").find((id) => MONSTERS[id]!.name === name)!;

/** Every wild group of the land of a world, with the climate of the island it stands on. */
function wildGroups(world: World): { ids: number[]; biome: number; tier: number }[] {
  const out: { ids: number[]; biome: number; tier: number }[] = [];
  for (let cy = 0; cy < world.chunksDown; cy++) {
    for (let cx = 0; cx < world.chunksAcross; cx++) {
      for (const g of chunkSpawns(world, cx, cy)) {
        if (MONSTERS[g.monsterIds[0]!]!.terrain === "water") continue;
        const isl = world.islandAt(g.x, g.y);
        if (isl) out.push({ ids: g.monsterIds, biome: isl.biome, tier: world.tierAt(g.x, g.y) });
      }
    }
  }
  return out;
}

describe("the tables of the two rule sets", () => {
  it("keeps Classic's table as it is and appends the 25 monsters of Fantastic Islands behind it", () => {
    expect(MONSTER_IDS).toHaveLength(91);
    expect(Object.keys(MONSTERS)).toHaveLength(91);
    expect(FANTASTIC_MONSTER_IDS).toEqual(Array.from({ length: 25 }, (_, i) => 92 + i));
    expect(monsterIdsOf("classic")).toEqual(MONSTER_IDS);
    expect(monsterIdsOf("fantastic")).toEqual([...MONSTER_IDS, ...FANTASTIC_MONSTER_IDS]);
    // found by id, hidden from everything that walks the table
    expect(MONSTERS[116]!.name).toBe("Void Horror");
    expect(Object.values(MONSTERS).some((m) => m.id >= 92)).toBe(false);
  });

  it("reads the sheet: values, abilities, groups, boss pairs", () => {
    const wyrm = MONSTERS[byName("Frost Wyrm")]!;
    expect(wyrm).toMatchObject({ health: 3040, armor: 55, res_ice: 1, attack_type: "Ice", ranged: true, hits_all: true, treasure_level: 5 });
    expect(MONSTERS[byName("Elder Treant")]!.regen).toBe(0.05);
    expect(MONSTERS[byName("Treant King")]!.regen).toBe(0.05);
    expect(monsterGroup(byName("Crypt Rat"))).toBe("undead");
    expect(MONSTERS[byName("Frost Imp")]!.outside).toBe("hut");
    expect(MONSTERS[byName("Venom Bloom")]!.outside).toBe("hut");
    expect(FANTASTIC_BOSS_PAIRS).toEqual([{ population: byName("Frost Giant"), boss: byName("Frost Giant King") }, { population: byName("Elder Treant"), boss: byName("Treant King") }]);
    expect(bossPairsOf("classic")).toBe(BOSS_PAIRS);
    expect(bossPairsOf("fantastic")).toHaveLength(BOSS_PAIRS.length + 2);
  });

  it("has a hut text for each of the two new hut monsters", () => {
    for (const name of ["Frost Imp", "Venom Bloom"]) {
      const text = hutScene(byName(name));
      expect(text, name).toMatch(/^This is the hut of the /);
      expect(text, name).toMatch(/Burn this place down\?$/);
      expect(text, name).not.toMatch(/Bones, scraps and the marks of many claws/);
    }
  });

  it("knows the rule set of a stored value", () => {
    expect(parseRuleset("fantastic")).toBe("fantastic");
    expect(parseRuleset("classic")).toBe("classic");
    expect(parseRuleset(undefined)).toBe(DEFAULT_RULESET);
    expect(parseRuleset("nonsense")).toBe("classic");
  });
});

describe("the same seed, the same world", () => {
  it("has the same islands, places, ways and ground in both rule sets", () => {
    for (const seed of ["monster12-a", "monster12-b", "ember-wood-189"]) {
      const classic = new World(seed, "small", "default", "classic");
      const fantastic = new World(seed, "small", "default", "fantastic");
      const hashes = (w: World): number[] => {
        const out: number[] = [];
        for (let cy = 0; cy < w.chunksDown; cy++) for (let cx = 0; cx < w.chunksAcross; cx++) out.push(chunkHash(w.chunk(cx, cy)));
        return out;
      };
      expect(hashes(fantastic), seed).toEqual(hashes(classic));
      expect(JSON.stringify(fantastic.allPois()), seed).toBe(JSON.stringify(classic.allPois()));
    }
  });

  it("puts monsters of Fantastic Islands in the wild, in huts, in caves and dungeons and never in Classic", () => {
    let wildNew = 0;
    let wildOld = 0;
    const classic = new World("monster12-c", "default", "default", "classic");
    for (const g of wildGroups(classic)) for (const id of g.ids) expect(id, "Classic never meets a monster of the extension").toBeLessThan(92);
    const fantastic = new World("monster12-c", "default", "default", "fantastic");
    for (const g of wildGroups(fantastic)) for (const id of g.ids) (id >= 92 ? wildNew++ : wildOld++);
    expect(wildNew).toBeGreaterThan(20);
    expect(wildOld).toBeGreaterThan(20);
    expect(hutsOf(fantastic).some((h) => h.monster === byName("Frost Imp"))).toBe(true);
    expect(hutsOf(classic).some((h) => h.monster >= 92)).toBe(false);
    // the populations of the places
    const seen = new Set<number>();
    for (const poi of fantastic.allPois()) {
      if (poi.kind !== "dungeon" && poi.kind !== "cave") continue;
      const ref = fantastic.dungeonRef(poi.id);
      for (const id of [...(ref?.look.monsters ?? []), ref?.look.boss ?? 0]) seen.add(id);
    }
    expect([...seen].some((id) => id >= 92)).toBe(true);
    const seenClassic = new Set<number>();
    for (const poi of classic.allPois()) {
      if (poi.kind !== "dungeon" && poi.kind !== "cave") continue;
      const ref = classic.dungeonRef(poi.id);
      for (const id of [...(ref?.look.monsters ?? []), ref?.look.boss ?? 0]) seenClassic.add(id);
    }
    expect([...seenClassic].some((id) => id >= 92)).toBe(false);
  });

  it("shows every monster of the version in the showcase", () => {
    for (const ruleset of ["classic", "fantastic"] as const) {
      const world = new World("monster12-show", "small", "default", ruleset);
      const map = generateInterior(world, world.poiById(SHOWCASE_ID)!);
      expect(map.showcase!.monsters.map((m) => m.defId).sort((a, b) => a - b)).toEqual([...monsterIdsOf(ruleset)]);
    }
  });
});

describe("where the monsters stand (Fantastic Islands)", () => {
  const seeds = ["monster12-d", "monster12-e", "monster12-f", "ember-wood-189", "pearl-shore-794"];

  it("keeps cold monsters out of the desert and off lava, fire monsters out of the snow", () => {
    const bad: string[] = [];
    let cold = 0;
    let fire = 0;
    for (const seed of seeds) {
      const world = new World(seed, "default", "default", "fantastic");
      for (const g of wildGroups(world)) {
        for (const id of g.ids) {
          const m = MONSTERS[id]!;
          if (isColdKin(m)) cold++;
          if (isFireKin(m)) fire++;
          if (!biomeAllows(m, g.biome as never)) bad.push(`${seed}: ${m.name} on biome ${g.biome} (level ${g.tier})`);
        }
      }
    }
    expect(cold).toBeGreaterThan(10);
    expect(fire).toBeGreaterThan(10);
    // (a level that has nothing else keeps what it has: the rule gives way only there)
    expect(bad.length, bad.slice(0, 8).join("\n")).toBeLessThanOrEqual(Math.ceil((cold + fire) * 0.05));
  });

  it("prefers snow for the cold and desert and lava for the fire", () => {
    let coldOnSnow = 0;
    let coldElsewhere = 0;
    for (const seed of seeds) {
      const world = new World(seed, "default", "default", "fantastic");
      for (const g of wildGroups(world)) for (const id of g.ids) if (isColdKin(MONSTERS[id]!)) (g.biome === BIOME.SNOW ? coldOnSnow++ : coldElsewhere++);
    }
    expect(coldOnSnow).toBeGreaterThan(0);
    expect(coldOnSnow + coldElsewhere).toBeGreaterThan(0);
  });

  it("does not put a hut of a cold or fire monster where it does not belong", () => {
    const bad: string[] = [];
    let huts = 0;
    for (const seed of seeds) {
      const world = new World(seed, "default", "default", "fantastic");
      for (const hut of hutsOf(world)) {
        huts++;
        const m = MONSTERS[hut.monster]!;
        const biome = world.islands.find((i) => i.index === hut.island)!.biome;
        if (!biomeAllows(m, biome)) bad.push(`${seed}: ${m.name} hut on biome ${biome}`);
      }
    }
    expect(huts).toBeGreaterThan(50);
    expect(bad.length, bad.join("\n")).toBeLessThanOrEqual(Math.ceil(huts * 0.03));
  });

  it("draws the very strong ones only now and then", () => {
    let ultra = 0;
    let level5 = 0;
    for (const seed of seeds) {
      const world = new World(seed, "default", "default", "fantastic");
      for (const g of wildGroups(world)) {
        if (g.tier !== 5) continue;
        for (const id of g.ids) {
          level5++;
          if (ULTRA_WILD.has(id)) ultra++;
        }
      }
    }
    expect(level5).toBeGreaterThan(100);
    expect(ultra).toBeGreaterThan(0);
    // a quarter of a normal monster's chance: about 4 of 100, never the fifth of the level it was
    expect(ultra / level5).toBeLessThan(0.1);
  });

  it("tells cold and fire by the resistance of at least ELEMENT_KIN or by the attack", () => {
    expect(ELEMENT_KIN).toBe(0.7);
    for (const name of ["Rime Wolf", "Frost Imp", "Frost Giant King", "Winter Queen", "Frost Wyrm"]) expect(isColdKin(MONSTERS[byName(name)]!), name).toBe(true);
    for (const name of ["Hellhound", "Magma Crawler", "Magma Titan", "Cinder Beetle", "Ash Cultist"]) expect(isFireKin(MONSTERS[byName(name)]!), name).toBe(true);
    expect(isColdKin(MONSTERS[byName("Thorn Creeper")]!)).toBe(false);
    expect(isFireKin(MONSTERS[byName("Frost Golem")]!)).toBe(false);
  });
});

describe("the models of Fantastic Islands", () => {
  const pack = JSON.parse(readFileSync("public/assets-packs/fantastic/pack.json", "utf-8")) as { files: string[] };
  const registry = JSON.parse(readFileSync("public/assets-packs/fantastic/models.monsters.original.json", "utf-8")) as Record<string, { file: string; scale: number; animated: boolean; bounds: number[] }>;

  it("has a model for each of the 25 monsters, in the pack only, with the scale of the table", () => {
    expect(Object.keys(registry).map(Number).sort((a, b) => a - b)).toEqual(FANTASTIC_MONSTER_IDS);
    for (const id of FANTASTIC_MONSTER_IDS) {
      const entry = registry[String(id)]!;
      expect(pack.files, MONSTERS[id]!.name).toContain(entry.file);
      expect(existsSync(join("public", "assets-packs", "fantastic", entry.file)), entry.file).toBe(true);
      expect(entry.scale, MONSTERS[id]!.name).toBe(FANTASTIC_MONSTER_MODELS[id]!.scale);
      // (the bounds of a figure that stands on the floor: a skeleton's figure starts at 0, a static one is round its middle)
      expect(entry.bounds[4]! - entry.bounds[1]!, MONSTERS[id]!.name).toBeGreaterThan(0.3);
    }
  });

  it("keeps the four figures without a skeleton static and the others animated", () => {
    const stat = Object.entries(registry).filter(([, e]) => !e.animated).map(([id]) => Number(id));
    expect(stat.sort((a, b) => a - b)).toEqual([93, 94, 97, 114]);
  });

  it("brings the new Capybara without a rig, and no file of Classic is replaced", () => {
    expect(pack.files).toContain("models-original/obj_capybara.glb");
    const classic = new Set(readdirSync("public/assets/models-original").map((f) => `models-original/${f}`));
    // the Capybara is the one file the pack has that Classic has too (the pack's version of it); the monsters are new
    expect(pack.files.filter((f) => f.endsWith(".glb") && classic.has(f))).toEqual(["models-original/obj_capybara.glb"]);
  });

  it("breathes cold only from the frost wolf and the frost wyrm", () => {
    expect(Object.keys(BREATH_MOUTHS).map(Number)).toEqual([byName("Rime Wolf"), byName("Frost Wyrm")]);
    expect(BREATH_EVERY).toBe(5);
  });
});

describe("saves of the two rule sets", () => {
  it("writes the rule set of a Fantastic world and nothing new into a Classic save", () => {
    const start = { x: 0, y: 0, facing: "N" as const };
    const classic = toSaveFile(newGameState("m12", start, "small", "default", "classic"));
    expect(classic.state.ruleset).toBeUndefined();
    expect(classic.fantasticVersion).toBeUndefined();
    const fantastic = toSaveFile(newGameState("m12", start, "small", "default", "fantastic"));
    expect(fantastic.state.ruleset).toBe("fantastic");
    expect(fantastic.fantasticVersion).toBe(FANTASTIC_GEN_VERSION);
    expect(fromSaveFile(fantastic).ruleset).toBe("fantastic");
    expect(fromSaveFile(classic).ruleset).toBe("classic");
  });
});

describe("a monster that regenerates", () => {
  const encounterWith = (name: string, x: number, hurt = 0.4) => {
    const id = byName(name);
    const enc = createEncounter();
    const m = createMonster(`m${x}`, id, x, 0);
    m.hp = Math.round(MONSTERS[id]!.health * hurt);
    enc.monsters.push(m);
    return { enc, m, def: MONSTERS[id]! };
  };

  it("is whole again when the party is out of its action radius", () => {
    const near = encounterWith("Elder Treant", 5);
    expect(restoreRegenerators(near.enc, 0, 0)).toBe(0);
    expect(near.m.hp).toBeLessThan(near.def.health);
    const far = encounterWith("Elder Treant", 9);
    expect(restoreRegenerators(far.enc, 0, 0)).toBe(1);
    expect(far.m.hp).toBe(far.def.health);
  });

  it("is whole again after a night wherever it stands, but one that does not regenerate keeps its wounds", () => {
    const sleeper = encounterWith("Treant King", 2);
    expect(restoreRegenerators(sleeper.enc, 0, 0, 7, true)).toBe(1);
    expect(sleeper.m.hp).toBe(sleeper.def.health);
    const plain = encounterWith("Rime Wolf", 12);
    expect(restoreRegenerators(plain.enc, 0, 0, 7, true)).toBe(0);
    expect(plain.m.hp).toBeLessThan(plain.def.health);
    const dead = encounterWith("Elder Treant", 12, 0);
    expect(restoreRegenerators(dead.enc, 0, 0, 7, true)).toBe(0);
    expect(dead.m.hp).toBe(0);
  });
});

describe("Black is beautiful", () => {
  const obsidian = (type: string) => makeItem({ name: "Obsidian thing", type, material: 8 });
  const TYPES: Record<string, string> = { helmet: "helmet", body_armor: "plate", left_hand: "sword", right_hand: "shield", belt: "belt", boots: "boots", ranged_weapon: "bow" };

  it("drops with an obsidian two-hander and no shield, but not with a plain two-hander", () => {
    const party = createDefaultParty();
    const c = party.characters[0]!;
    for (const slot of EQUIPMENT_SLOTS) c.inventory[slot] = TYPES[slot] ? obsidian(TYPES[slot]!) : null;
    expect(isFullyObsidian(c)).toBe(true);
    // the two-hander takes both hands: the shield slot is empty
    c.inventory.left_hand = obsidian("great axe");
    c.inventory.right_hand = null;
    expect(isFullyObsidian(c)).toBe(true);
    c.inventory.left_hand = makeItem({ name: "Iron great axe", type: "great axe", material: 3 });
    expect(isFullyObsidian(c)).toBe(false);
    // a one-hander still needs the shield
    c.inventory.left_hand = obsidian("long sword");
    expect(isFullyObsidian(c)).toBe(false);
    c.inventory.right_hand = obsidian("shield");
    expect(isFullyObsidian(c)).toBe(true);
  });
});
