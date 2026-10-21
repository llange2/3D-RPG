import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { thousands } from "../../src/core/format";
import { Rng, seedFromString } from "../../src/core/rng";
import { INTERIOR_THEMES } from "../../src/data/interior-themes";
import { pickMonster } from "../../src/data/monsters";
import { PERSONAS, PERSONA_BASE, personaModelId, personaYaw } from "../../src/data/personas";
import { MONSTER_IDS, MONSTERS } from "../../src/data/tables";
import { generateInterior, CELL } from "../../src/interiors";
import { BLOCKS } from "../../src/campaign/blocks";
import { GAME_KINDS, newCampaignState, newGameState, readSave, splitLegacySaves, writeSave } from "../../src/game/state";
import { propSpec } from "../../src/render/terrainMesher";
import { addCondition } from "../../src/sim/character";
import { addXp, createDefaultParty } from "../../src/sim/party";
import { isAttackSpell, quickCast } from "../../src/sim/spells";
import { canSee, visibleCells } from "../../src/sim/vision";
import { BIOME, DECO, type Poi, type PoiKind } from "../../src/world/types";
import { World } from "../../src/world/world";

describe("thousands separator (gold, prices, experience)", () => {
  it("puts an apostrophe between the thousands", () => {
    expect([0, 7, 999, 1000, 12345, 5000, 1000000, -2500].map(thousands)).toEqual(["0", "7", "999", "1'000", "12'345", "5'000", "1'000'000", "-2'500"]);
    expect(thousands(1234.6)).toBe("1'235");
  });
});

describe("separate saves for the endless world and the campaign", () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    };
  });
  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it("keeps a world and a campaign game side by side", () => {
    const world = newGameState("alpha", { x: 1, y: 2, facing: "N" });
    const campaign = newCampaignState("beta");
    expect(writeSave(world, "auto")).toBe(true);
    expect(writeSave(campaign, "auto")).toBe(true);
    expect(readSave("world", "auto")?.seed).toBe("alpha");
    expect(readSave("campaign", "auto")?.seed).toBe("beta");
    expect(readSave("campaign", "auto")?.state.campaign).toBeTruthy();
    expect(readSave("world", "auto")?.state.campaign ?? null).toBeNull();
    // the other slots are independent too
    writeSave(world, "quick");
    expect(readSave("campaign", "quick")).toBeNull();
    expect(GAME_KINDS).toEqual(["world", "campaign"]);
  });

  it("moves a campaign save written under the old, shared keys to the campaign's slots", () => {
    const campaign = newCampaignState("gamma");
    // before the split both kinds wrote to the keys the world uses now
    store.set("mm3-seed-rpg:save:v1", JSON.stringify({ version: 1, genVersion: 3, savedAt: new Date().toISOString(), seed: "gamma", state: { ...campaign, opened: [], broken: [], killed: [], visited: [], explored: {}, campaign: campaign.campaign } }));
    expect(readSave("world", "auto")).toBeNull(); // never offered as a world, even before it was moved
    splitLegacySaves();
    expect(store.has("mm3-seed-rpg:save:v1")).toBe(false);
    expect(readSave("campaign", "auto")?.seed).toBe("gamma");
  });

  it("leaves a world save where it is", () => {
    writeSave(newGameState("delta", { x: 0, y: 0, facing: "S" }), "auto");
    splitLegacySaves();
    expect(readSave("world", "auto")?.seed).toBe("delta");
  });
});

describe("experience", () => {
  it("goes to the heroes who can act, like the old get_active_characters", () => {
    const party = createDefaultParty();
    addCondition(party.characters[1]!, "Sleeping", party.minutes);
    addCondition(party.characters[2]!, "Paralyzed", party.minutes);
    addCondition(party.characters[3]!, "Petrified", party.minutes);
    addXp(party, 1200);
    expect(party.characters.map((c) => c.xp)).toEqual([1200, 0, 0, 0]);
  });

  it("monster XP and the level thresholds are the old game's", () => {
    // spot checks against old_code/g.py MONSTER_DATA; the export itself is compared by `npm run data:export`
    expect([MONSTERS[4]!.xp, MONSTERS[46]!.xp, MONSTERS[1]!.xp, MONSTERS[32]!.xp]).toEqual([250, 1200, 20000, 4000000]);
  });
});

describe("monsters of a generated place", () => {
  it("never come from above the tier's treasure level while the theme has one in its band", () => {
    const rng = new Rng(seedFromString("tl"));
    let above = 0;
    let picks = 0;
    for (const theme of ["undead", "beast", "humanoid", "construct"]) {
      for (let tier = 1; tier <= 5; tier++) {
        for (let i = 0; i < 60; i++) {
          const m = pickMonster(rng, theme, tier, false);
          picks++;
          if (m.treasure_level > tier) above++;
        }
      }
    }
    expect(picks).toBeGreaterThan(1000);
    expect(above).toBe(0);
  });

  it("keep tier 1 to the first maps' kind of reward (a few thousand XP at most) in the themes that have such monsters", () => {
    const rng = new Rng(seedFromString("xp"));
    for (const theme of ["undead", "beast", "humanoid"]) {
      for (let i = 0; i < 80; i++) expect(pickMonster(rng, theme, 1, false).xp, theme).toBeLessThanOrEqual(3000);
    }
  });

  it("know every monster of the table", () => {
    expect(MONSTER_IDS.length).toBe(91);
  });
});

describe("what the party sees (map)", () => {
  // a corridor along x at y = 5 with a wall at x = 8 and a floor beyond it: a breakable wall must not show what is behind it
  const rows = [
    "###########",
    "#.........#",
    "#.........#",
    "###.#######",
    "###.#####.#",
    "###.#####.#",
    "###########",
  ];
  const opaque = (x: number, y: number) => rows[y]?.[x] !== ".";

  it("sees what no wall hides, and the wall itself", () => {
    expect(canSee(opaque, 1, 1, 8, 1)).toBe(true);
    expect(canSee(opaque, 1, 1, 10, 1)).toBe(true); // the border wall is seen
    expect(canSee(opaque, 1, 1, 9, 4)).toBe(false); // behind the wall below the room
    expect(canSee(opaque, 3, 1, 3, 5)).toBe(true); // down the passage
  });

  it("shows the cells at the party's feet always, but the rest only in front of it", () => {
    const here = visibleCells(opaque, 3, 4, "N", 5).map(([x, y]) => `${x},${y}`);
    expect(here).toContain("3,4");
    expect(here).toContain("2,4"); // beside it: a wall, but at its feet
    expect(here).toContain("4,4");
    expect(here).toContain("3,5"); // behind it, next to it
    expect(here).toContain("3,2"); // ahead, through the passage
    expect(here).not.toContain("3,7"); // far behind (outside the map)
    // looking south it sees the other end of the passage instead
    const south = visibleCells(opaque, 3, 1, "S", 5).map(([x, y]) => `${x},${y}`);
    expect(south).toContain("3,5");
    expect(visibleCells(opaque, 3, 1, "N", 5).map(([x, y]) => `${x},${y}`)).not.toContain("3,5");
  });

  it("does not look through a wall to the room behind it", () => {
    const seen = new Set(visibleCells(opaque, 1, 1, "E", 9).map(([x, y]) => `${x},${y}`));
    expect(seen.has("9,4")).toBe(false);
    expect(seen.has("9,5")).toBe(false);
  });
});

describe("quick cast (the last spell, with the one who cast it)", () => {
  it("is absent until something was cast", () => {
    expect(quickCast(createDefaultParty(), true)).toBeNull();
  });

  it("is available, and greyed out when it cannot be cast now", () => {
    const party = createDefaultParty();
    const lyneth = party.characters.findIndex((c) => c.name === "Lyneth");
    party.lastCast = { caster: "Lyneth", spellId: 4, target: 0 }; // First Aid
    expect(quickCast(party, false)).toMatchObject({ caster: lyneth, spellId: 4, target: 0, block: null });
    party.characters[lyneth]!.sp = 0;
    expect(quickCast(party, false)?.block).toBe("mana");
    party.characters[lyneth]!.sp = 10;
    addCondition(party.characters[lyneth]!, "Sleeping", party.minutes);
    expect(quickCast(party, false)?.block).toBe("cannot_act");
  });

  it("needs a monster in sight for an attack spell, and only the hero whose turn it is may cast in a fight", () => {
    const party = createDefaultParty();
    const ralvar = party.characters.findIndex((c) => c.name === "Ralvar");
    const spell = party.characters[ralvar]!.spells.find((id) => isAttackSpell(id))!;
    expect(spell).toBeDefined();
    party.lastCast = { caster: "Ralvar", spellId: spell };
    expect(quickCast(party, false)?.block).toBe("no_target");
    expect(quickCast(party, true)?.block).toBeNull();
    expect(quickCast(party, true, 0)?.block).toBe("cannot_act");
    expect(quickCast(party, true, ralvar)?.block).toBeNull();
  });

  it("finds the caster by name, so swapping heroes cannot hand it to somebody else", () => {
    const party = createDefaultParty();
    party.lastCast = { caster: "Nobody", spellId: 4 };
    expect(quickCast(party, true)?.block).toBe("gone");
  });
});

describe("the people of the campaign maps", () => {
  it("have an animated model each, at the size and clip of the old game", () => {
    expect(Object.keys(PERSONAS).map(Number)).toEqual([48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 82, 90, 106, 107, 108]);
    expect(PERSONAS[48]).toEqual({ file: "Cartographer", idle: "Stand_and_Chat", scale: 1.3 });
    expect(PERSONAS[90]).toEqual({ file: "Seth Squirm", idle: "Idle_13", scale: 1.5 });
    expect(personaModelId(48)).toBe(PERSONA_BASE + 48);
    // none clashes with the 91 monsters
    for (const id of MONSTER_IDS) expect(id).toBeLessThan(PERSONA_BASE);
  });

  it("face the way the old game turned them: the cell's rotation plus the clip's own offset, for Babylon's glTF", () => {
    // Stand_and_Chat adds 135 in the old game, Idle_11 and the others 180; Babylon turns glTF models by half a circle against Ursina
    expect(personaYaw(48, 0)).toBe(315);
    expect(personaYaw(48, 90)).toBe(45);
    expect(personaYaw(106, 0)).toBe(0);
    expect(personaYaw(106, 270)).toBe(270);
    expect(personaYaw(50, 180)).toBe(135);
  });
});

describe("castles and the open sky", () => {
  it("lie under the sky: no ceiling, daylight fog, in the endless world and on the campaign's castle maps", () => {
    for (const id of ["fortress", "fortress_ice", "fortress_lava"]) {
      expect(INTERIOR_THEMES[id]!.open, id).toBe(true);
      expect(INTERIOR_THEMES[id]!.ceiling, id).toBeNull();
      expect(INTERIOR_THEMES[id]!.fog.density, id).toBeLessThan(0.02);
    }
    for (const block of [39, 40, 41, 43]) expect(BLOCKS[block]!.style.ceiling, `block ${block}`).toBeNull();
    expect(INTERIOR_THEMES.dungeon!.open).toBe(false); // dungeons keep theirs
  });

  it("are compact compounds like the old game's (Whiteshield 18 x 21, Bloodreign 25 x 22, Dragontooth 21 x 34)", () => {
    const world = new World("castles");
    let sizes = 0;
    for (let i = 0; i < 80; i++) {
      const poi: Poi = { id: `p:0:0:${i}`, kind: "castle" as PoiKind, name: "Test", x: i * 7, y: i * 3, size: 1, side: "S", region: { rx: 0, ry: 0 }, anchor: false, tier: 1 + (i % 5), biome: BIOME.MEADOW };
      const map = generateInterior(world, poi, 0);
      expect(map.width).toBeGreaterThanOrEqual(26);
      expect(map.width).toBeLessThanOrEqual(34);
      expect(map.height).toBeGreaterThanOrEqual(24);
      expect(map.height).toBeLessThanOrEqual(32);
      expect(map.rooms.length).toBeGreaterThanOrEqual(4);
      expect(map.cells.some((c) => c === CELL.FLOOR)).toBe(true);
      sizes++;
    }
    expect(sizes).toBe(80);
  });
});

describe("the overworld's tile models", () => {
  it("use the old game's models and sizes for woods (add_block 23, 27, 28, 32) when asked", () => {
    expect(propSpec(DECO.TREE, BIOME.FOREST, 0, true)).toMatchObject({ model: "veg_forest_tile", scale: 2.2 });
    expect(propSpec(DECO.TREE, BIOME.SNOW, 0, true)).toMatchObject({ model: "veg_snowy_forest", scale: 2.2 });
    expect(propSpec(DECO.TREE, BIOME.DESERT, 0, true)).toMatchObject({ model: "veg_palms", scaleXYZ: [1.65, 2, 1.65] });
    expect(propSpec(DECO.TREE, BIOME.MEADOW, 0, true)).toMatchObject({ model: "veg_trees", scale: 1.7 });
    // the rolling-ground version keeps its own models
    expect(propSpec(DECO.TREE, BIOME.FOREST, 0, false)).toMatchObject({ model: "veg_trees" });
  });
});
