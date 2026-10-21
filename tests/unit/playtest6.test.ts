import { existsSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { BLOCKS } from "../../src/campaign/blocks";
import { Rng, seedFromString } from "../../src/core/rng";
import { MONSTERS } from "../../src/data/tables";
import { CELL, generateInterior, type InteriorMap } from "../../src/interiors";
import { loadCampaignMap } from "../../src/campaign/loader";
import { hasModelFloor, meshInterior, modelFloorCells } from "../../src/render/interiorMesher";
import { buyTavernFood, guildFee, guildTeaches, isGuildMember, joinGuild, serviceLevel, tavernFood } from "../../src/sim/economy";
import { createEncounter, createMonster, monstersReaching, spellRound, updateBattleMode, type GridView } from "../../src/sim/encounter";
import { questItem } from "../../src/sim/items";
import { advanceTime, carriedItems, createDefaultParty, giveItem } from "../../src/sim/party";
import { portraitOf } from "../../src/ui/avatarFx";
import { BAG_SLOTS } from "../../src/sim/types";
import { BIOME } from "../../src/world/types";
import { World } from "../../src/world/world";
import { actionCells, testHost, useDiskCampaign } from "../helpers/campaign";

const rng = (s: string) => new Rng(seedFromString(s));

describe("tavern food (the old TownTavern)", () => {
  it("fills the larder to the days its level keeps fresh, for one price", () => {
    expect([1, 2, 3, 4, 5].map((l) => tavernFood(l))).toEqual([
      { days: 5, price: 10 },
      { days: 10, price: 50 },
      { days: 15, price: 250 },
      { days: 20, price: 1000 },
      { days: 40, price: 5000 },
    ]);
    const party = createDefaultParty();
    party.food = 1;
    party.gold = 100;
    expect(buyTavernFood(party, 1)).toMatchObject({ ok: true, cost: 10 });
    expect(party.food).toBe(5);
    expect(party.gold).toBe(90);
  });

  it("takes nothing and adds nothing once the larder holds what the tavern keeps fresh", () => {
    const party = createDefaultParty();
    party.food = 5;
    party.gold = 100;
    expect(buyTavernFood(party, 1)).toMatchObject({ ok: false, reason: "full" });
    expect(party.food).toBe(5);
    expect(party.gold).toBe(100);
    party.food = 7; // more than level 1 keeps: still nothing, and the 7 stay
    expect(buyTavernFood(party, 1).ok).toBe(false);
    expect(party.food).toBe(7);
  });

  it("wants more gold than the price, like the old button", () => {
    const party = createDefaultParty();
    party.food = 0;
    party.gold = 10;
    expect(buyTavernFood(party, 1)).toMatchObject({ ok: false, reason: "gold" });
    expect(party.food).toBe(0);
  });
});

describe("level of a shop", () => {
  it("is the parameter of the cell, or comes from the average level of the party when it is 0 or missing", () => {
    const party = createDefaultParty();
    expect(serviceLevel(party, 3)).toBe(3);
    expect(serviceLevel(party, "2")).toBe(2);
    const at = (level: number) => {
      for (const c of party.characters) c.level = level;
      return serviceLevel(party, 0);
    };
    expect([at(1), at(7), at(8), at(17), at(18), at(27), at(28), at(37), at(38), at(60)]).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
    expect(serviceLevel(party, undefined)).toBe(5);
  });
});

describe("guild membership", () => {
  it("is the talent of the guild's level; only the lower guilds can be bought", () => {
    const party = createDefaultParty();
    party.gold = 5000;
    expect(isGuildMember(party, 1)).toBe(false);
    expect(guildFee(1, party)).toBe(100);
    expect(guildFee(5, party)).toBe(0);
    expect(joinGuild(party, 1)).toMatchObject({ ok: true, cost: 100 });
    expect(isGuildMember(party, 1)).toBe(true);
    expect(isGuildMember(party, 2)).toBe(false);
    expect(party.gold).toBe(4900);
    expect(joinGuild(party, 5).ok).toBe(false);
    expect(joinGuild(party, 1).ok).toBe(false);
  });

  it("teaches the spell levels of its own level", () => {
    expect([1, 2, 3, 4, 5].map((g) => [1, 2, 5, 6, 10, 11, 15, 16, 20, 21, 40].filter((s) => guildTeaches(g, s)))).toEqual([[2, 5], [6, 10], [11, 15], [16, 20], [21, 40]]);
  });
});

describe("the Donkey's bag", () => {
  it("takes what the heroes cannot carry, and only while the Donkey is the mascot", () => {
    const party = createDefaultParty();
    for (const c of party.characters) for (const slot of BAG_SLOTS) c.inventory[slot] = questItem("quest_key_blue");
    const key = questItem("quest_key_red")!;
    expect(giveItem(party, key)).toBe(false);
    party.mascot = "Donkey";
    expect(giveItem(party, questItem("quest_key_red")!)).toBe(true);
    expect(party.mascotBag.slot1?.name).toContain("Red");
    expect(carriedItems(party).filter((i) => i.type === "quest_key_red")).toHaveLength(1);
    // a change of mascot leaves the bag with the Donkey: its items no longer count
    party.mascot = "Crow";
    expect(carriedItems(party).filter((i) => i.type === "quest_key_red")).toHaveLength(0);
  });

  it("is part of every new party", () => {
    const party = createDefaultParty();
    expect(Object.keys(party.mascotBag)).toEqual(Object.keys(party.characters[0]!.inventory));
    expect(Object.values(party.mascotBag).every((item) => item === null)).toBe(true);
  });
});

describe("a spell costs a round", () => {
  const land = Object.values(MONSTERS).find((m) => m.terrain === "land" && !m.special_abilties?.includes("Ranged Attack"))!;
  const rows = ["...........", "...........", "...........", "...........", "..........."];
  const view: GridView = { walkable: (x, y) => rows[y]?.[x] === ".", water: () => false, opaque: (x, y) => rows[y]?.[x] !== "." };

  it("lets the monsters step towards the party and strike", () => {
    const party = createDefaultParty();
    const enc = createEncounter();
    enc.monsters.push(createMonster("m1", land.id, 2, 2));
    const events = spellRound(party, view, enc, 5, 2, rng("heal"));
    expect(events.some((e) => e.type === "monster_move")).toBe(true);
    // next to the party the round is the turn of whoever casts: the monsters answer after the last hero of the round
    enc.monsters[0]!.x = 4;
    updateBattleMode(enc, 5, 2);
    expect(enc.battleMode).toBe(true);
    const rounds = party.characters.map((_, i) => spellRound(party, view, enc, 5, 2, rng(`heal${i}`)));
    expect(rounds.slice(0, 3).every((events) => events.length === 0)).toBe(true);
    expect(rounds[3]!.some((e) => e.type === "monster_attack")).toBe(true);
  });

  it("finds the monsters that can reach a camping party, and not those behind a wall", () => {
    const enc = createEncounter();
    enc.monsters.push(createMonster("near", land.id, 2, 2));
    expect(monstersReaching(view, enc, 6, 2).map((m) => m.uid)).toEqual(["near"]);
    const walled = ["...#.......", "...#.......", "...#.......", "...#.......", "...#......."];
    const wall: GridView = { walkable: (x, y) => walled[y]?.[x] === ".", water: () => false, opaque: (x, y) => walled[y]?.[x] !== "." };
    expect(monstersReaching(wall, enc, 6, 2)).toEqual([]);
    // far away: outside the action radius
    enc.monsters[0]!.x = 0;
    expect(monstersReaching(view, enc, 10, 2)).toEqual([]);
  });
});

describe("portraits follow the condition", () => {
  const PORTRAITS = join(import.meta.dirname, "..", "..", "public", "assets", "icons", "portraits");
  const hero = (conditions: string[]) => ({ avatar: "character07", conditions: conditions as never });

  it("shows the picture of the worst condition, one picture for the dead and the rotten", () => {
    expect(portraitOf(hero(["Healthy"]))).toBe("character07");
    expect(portraitOf(hero(["Poisoned"]))).toBe("character07_Poisoned");
    expect(portraitOf(hero(["Weak"]))).toBe("character07_Cursed");
    expect(portraitOf(hero(["Unconscious"]))).toBe("character07_Sleeping");
    expect(portraitOf(hero(["Dead"]))).toBe("character00_Dead");
    expect(portraitOf(hero(["Poisoned", "Dead"]))).toBe("character00_Dead");
    expect(portraitOf(hero(["Rotten"]))).toBe("character00_Rotten");
    expect(portraitOf(hero(["Poisoned", "Drunk"]))).toBe("character07_Poisoned");
  });

  it("names pictures that exist for every hero and every condition", () => {
    if (!existsSync(PORTRAITS)) return;
    // the old game itself has no crazy picture for the fifth hero; the screen falls back to the plain portrait (`portraitImage`)
    const missing: string[] = [];
    for (let n = 1; n <= 22; n++) {
      const avatar = `character${String(n).padStart(2, "0")}`;
      for (const cond of ["Healthy", "Blessed", "Crazy", "Cursed", "Weak", "Diseased", "Drunk", "Lovestruck", "Paralyzed", "Petrified", "Poisoned", "Sleeping", "Unconscious", "Dead", "Rotten"]) {
        const file = portraitOf({ avatar, conditions: [cond] as never });
        if (!existsSync(join(PORTRAITS, `${file}.webp`))) missing.push(file);
      }
    }
    expect([...new Set(missing)]).toEqual(["character17_Crazy"]);
    for (let n = 1; n <= 22; n++) expect(existsSync(join(PORTRAITS, `character${String(n).padStart(2, "0")}.webp`))).toBe(true);
  });
});

describe("the dungeon floor model", () => {
  const world = new World("floor-model");
  const poi = (kind: "dungeon" | "cave" | "castle" | "town") => ({ id: `p:f:${kind}`, kind, name: kind, x: 3, y: 4, size: 1, side: "S" as const, region: { rx: 0, ry: 0 }, anchor: false, tier: 2, biome: BIOME.MEADOW });
  const floorQuads = (map: InteriorMap, modelFloor: boolean) => {
    const geo = meshInterior(map, new Set(), { modelFloor });
    return geo.groups.filter((g) => g.material === "floor").reduce((n, g) => n + g.count / 6, 0);
  };

  it("replaces the flat floor of a generated dungeon, and only of a dungeon", () => {
    const dungeon = generateInterior(world, poi("dungeon"));
    const cells = modelFloorCells(dungeon);
    expect(cells.length).toBeGreaterThan(100);
    expect(floorQuads(dungeon, false)).toBe(cells.length);
    expect(floorQuads(dungeon, true)).toBe(0);
    for (const kind of ["cave", "castle", "town"] as const) {
      const map = generateInterior(world, poi(kind));
      expect(modelFloorCells(map), kind).toHaveLength(0);
      expect(floorQuads(map, true), kind).toBe(floorQuads(map, false));
    }
  });

  it("covers the dungeon floors of a campaign map but not its pit or its walls", async () => {
    useDiskCampaign();
    const map = (await loadCampaignMap("fountain-head-cavern")).toInteriorMap();
    const cells = modelFloorCells(map);
    expect(cells.length).toBeGreaterThan(50);
    for (const i of cells) expect(map.cells[i]).toBe(CELL.FLOOR);
    for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) if (map.cells[y * map.width + x] === CELL.SOLID) expect(hasModelFloor(map, x, y)).toBe(false);
  });

  it("is turned half a circle for the models the old game loaded from glTF files", () => {
    // Ursina mirrors a glTF file in z and Babylon in x: the brittle wall, the doors, the gate and the frames stand the other way round
    for (const b of [5, 6, 15, 16, 17, 18, 19, 20, 47]) expect(BLOCKS[b]!.style.model?.yaw, `block ${b}`).toBe(180);
    // the fortress frame comes from an OBJ file, which both engines read the same way
    expect(BLOCKS[41]!.style.model?.yaw).toBeUndefined();
  });
});

describe("campaign actions of the playtest", () => {
  beforeAll(() => useDiskCampaign());

  it("takes the black key card off the map when it is picked up (the 'yes' of the editor)", async () => {
    const h = await testHost("outside");
    const cell = actionCells(h.map, 12).find((c) => h.map.get(c.x, c.y)!.i === 64)!;
    expect(cell).toBeDefined();
    await h.engine.activate(cell.x, cell.y);
    expect(carriedItems(h.party).some((i) => i.type === "quest_black_keycard")).toBe(true);
    expect(h.map.get(cell.x, cell.y)?.i).toBeUndefined();
    expect(h.map.get(cell.x, cell.y)?.a).toBeUndefined();
  });

  it("leaves an item on the map when the editor says no", async () => {
    const h = await testHost("cathedral-of-carnage");
    const cell = actionCells(h.map, 12).find((c) => String((h.map.get(c.x, c.y)!.ax as Record<string, unknown>).remove_item) === "no")!;
    expect(cell).toBeDefined();
    const before = h.map.get(cell.x, cell.y)!.i;
    await h.engine.activate(cell.x, cell.y);
    expect(h.map.get(cell.x, cell.y)?.i).toBe(before);
    expect(h.map.get(cell.x, cell.y)?.a).toBeUndefined();
  });

  it("reports the gate that slides away, down for action 16 and up for action 18", async () => {
    const h = await testHost("fountain-head", "gates", { confirm: [true] });
    const gate = actionCells(h.map, 16)[0]!;
    await h.engine.activate(gate.x, gate.y);
    expect(h.rec.gates).toEqual([{ item: 80, x: gate.x, y: gate.y, rot: h.rec.gates[0]!.rot, direction: "down" }]);
    const dungeon = await testHost("fountain-head-cavern", "gates2", { confirm: [true] });
    const up = actionCells(dungeon.map, 18)[0]!;
    await dungeon.engine.activate(up.x, up.y);
    expect(dungeon.rec.gates[0]).toMatchObject({ item: 81, direction: "up" });
  });

  it("opens a shop without a level at the level of the party", async () => {
    const h = await testHost("fountain-head");
    for (const c of h.party.characters) c.level = 20;
    const cell = actionCells(h.map, 3).find((c) => !h.map.get(c.x, c.y)!.ap || Number(h.map.get(c.x, c.y)!.ap) === 0);
    if (!cell) return; // every tavern of this map names its level
    await h.engine.activate(cell.x, cell.y);
    expect(h.rec.services.at(-1)?.tier).toBe(3);
  });

  it("counts what the Donkey carries for a quest", async () => {
    const h = await testHost("fountain-head");
    h.party.mascot = "Donkey";
    for (const c of h.party.characters) for (const slot of BAG_SLOTS) c.inventory[slot] = questItem("quest_key_blue");
    expect(giveItem(h.party, questItem("quest_key_red")!)).toBe(true);
    expect(carriedItems(h.party).some((i) => i.type === "quest_key_red")).toBe(true);
  });
});

describe("time", () => {
  it("still feeds the party one ration a day", () => {
    const party = createDefaultParty();
    party.food = 3;
    advanceTime(party, 1440);
    expect(party.food).toBe(2);
  });
});
