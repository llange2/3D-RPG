import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildMapContent, isTrapAction, isVisibleTrap, validateContent } from "../../src/actions";
import { runeActive } from "../../src/actions/quests";
import { generateInterior, planDungeon } from "../../src/interiors";
import { CELL } from "../../src/interiors/types";
import { RIDDLES_WORLD } from "../../src/data/riddles";
import { emptyContainerLine } from "../../src/data/prop-texts";
import { newGameState, exportSaves, importSaves, writeSave, readSave, listNamedSaves, readNamedSave } from "../../src/game/state";
import { train } from "../../src/sim/economy";
import { createDefaultParty } from "../../src/sim/party";
import { xpToNextLevel } from "../../src/sim/character";
import { doorBearing } from "../../src/render/terrainMesher";
import { GROUND, type TileInfo } from "../../src/world/types";
import { World } from "../../src/world/world";

describe("42nd playtest, point 1: training rests the hero", () => {
  it("fills hit points and spell points and wakes a hero at 0, and leaves the other conditions alone", () => {
    const party = createDefaultParty();
    party.gold = 1_000_000;
    const c = party.characters[0]!;
    c.xp += 10_000_000;
    c.hp = 0;
    c.sp = 0;
    c.conditions.push("Unconscious", "Poisoned");
    expect(xpToNextLevel(c)).toBeLessThanOrEqual(0);
    expect(train(party, 0).ok).toBe(true);
    expect(c.hp).toBe(c.health);
    expect(c.sp).toBe(c.mana);
    expect(c.conditions).not.toContain("Unconscious");
    expect(c.conditions).toContain("Poisoned");
  });
});

describe("42nd playtest, point 2: the bulette riddle is gone", () => {
  it("has neither the riddle of the bulette nor an answer 'bulette'", () => {
    expect(Object.values(RIDDLES_WORLD).some((r) => r.answer === "bulette")).toBe(false);
    expect(RIDDLES_WORLD["319"]?.answer).toBe("snow");
  });
});

describe("42nd playtest, point 3: traps on the map", () => {
  it("knows which traps can be seen before they go off", () => {
    expect(isVisibleTrap({ kind: "trap", params: { trap: "guillotine" } })).toBe(true);
    expect(isVisibleTrap({ kind: "trap", params: { trap: "generic" } })).toBe(true);
    expect(isVisibleTrap({ kind: "trap", params: { trap: "spring" } })).toBe(false);
    expect(isVisibleTrap({ kind: "trap", params: { trap: "pit" } })).toBe(false);
    expect(isVisibleTrap({ kind: "legacy", params: {}, legacy: { id: 24 } })).toBe(true);
    expect(isVisibleTrap({ kind: "legacy", params: {}, legacy: { id: 17 } })).toBe(false);
    expect(isTrapAction({ kind: "trap" })).toBe(true);
  });
});

describe("42nd playtest, points 5 and 6: quest 2, the Catacombs of Kela", () => {
  it("lies next to the hall or sends the party to a pocket by runes in the hall, for every quest 2 place of the seed", { timeout: 240_000 }, () => {
    const world = new World("cedar-peak-198", "default");
    let checked = 0;
    let withRunes = 0;
    for (const poi of world.allPois().filter((p) => p.kind !== "town")) {
      if (planDungeon(world, poi)?.quest !== "quest_2") continue;
      const map = generateInterior(world, poi);
      const content = buildMapContent(world, poi, map);
      const end = map.dungeon!.endRoom!;
      const hall = map.dungeon!.hall!;
      expect(validateContent(map, content), poi.name).toEqual([]);
      const runes = content.actions.filter((a) => a.kind === "rune" && a.params.need === "heads");
      if (end.isolated) {
        withRunes++;
        expect(runes, poi.name).toHaveLength(1);
        expect(runes[0]!.x >= hall.x && runes[0]!.x < hall.x + hall.w && runes[0]!.y >= hall.y && runes[0]!.y < hall.y + hall.h, `${poi.name}: rune outside the hall`).toBe(true);
        // the runes appear with the right row only
        expect(runeActive(runes[0]!, content, new Set())).toBe(false);
      } else {
        expect(runes, poi.name).toHaveLength(0);
        // sealed: the wall that gives way is a cell of the hall's wall, next to a floor cell of the hall
        const seal = end.seal!;
        const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
          const x = seal.x + dx!;
          const y = seal.y + dy!;
          return x >= hall.x && x < hall.x + hall.w && y >= hall.y && y < hall.y + hall.h && map.cells[y * map.width + x] === CELL.FLOOR;
        });
        expect(near, `${poi.name}: the seal is not next to the hall`).toBe(true);
      }
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
    // (the Catacombs of Kela, a maze, are one of those with runes)
    const kela = world.allPois().find((p) => p.id === "p:0:0:233" /* the Catacombs of Kela before the 51st playtest doubled the names */)!;
    expect(planDungeon(world, kela)?.quest).toBe("quest_2");
    expect(generateInterior(world, kela).dungeon?.endRoom?.isolated).toBe(true);
    expect(withRunes).toBeGreaterThan(0);
  });
});

describe("42nd playtest, point 9: the door of a hut", () => {
  const tile = (ground: number, deco = 0): TileInfo => ({ ground, deco, poiId: null, biome: 0 }) as unknown as TileInfo;
  const around = (north: TileInfo, east: TileInfo, south: TileInfo, west: TileInfo) => (dx: number, dy: number) => (dy < 0 ? north : dy > 0 ? south : dx > 0 ? east : west);

  it("turns to the road, else to open ground", () => {
    const grass = tile(GROUND.LAND);
    const road = tile(GROUND.ROAD);
    const tree = tile(GROUND.LAND, 1);
    const water = tile(GROUND.WATER);
    for (let h = 0; h < 8; h++) {
      expect(doorBearing(around(tree, grass, road, water), h)).toBe(180);
      expect(doorBearing(around(tree, road, grass, grass), h)).toBe(90);
      expect([90, 180]).toContain(doorBearing(around(tree, grass, grass, water), h));
    }
    // a hut with the road on two sides takes one of them
    expect([0, 270]).toContain(doorBearing(around(road, tree, tree, road), 3));
  });
});

describe("42nd playtest, point 10: a barrel is a barrel", () => {
  it("names the container that is empty", () => {
    expect(emptyContainerLine(5)).toBe("The barrel is empty.");
    expect(emptyContainerLine(75)).toBe("The bookshelf is empty.");
    expect(emptyContainerLine(1)).toBe("The chest is empty.");
  });
});

describe("42nd playtest, point 11: no shop on a street that goes on", () => {
  it("keeps every shop of Quinudale and of the start towns in a niche or a dead end", { timeout: 240_000 }, () => {
    let towns = 0;
    let onStreet = 0;
    for (const seed of ["cedar-peak-198", "north-ward-302", "ue-a", "ue-b", "ue-c", ...Array.from({ length: 12 }, (_, i) => `shops-${i}`)]) {
      const world = new World(seed, "default");
      for (const poi of world.allPois().filter((p) => p.kind === "town")) {
        const map = generateInterior(world, poi);
        const content = buildMapContent(world, poi, map);
        expect(validateContent(map, content), `${seed} ${poi.name}`).toEqual([]);
        towns++;
        for (const a of content.actions.filter((x) => x.kind === "service")) {
          const open = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => map.cells[(a.y + dy!) * map.width + a.x + dx!] === CELL.FLOOR).length;
          if (open > 1) onStreet++;
        }
      }
    }
    expect(towns).toBeGreaterThan(20);
    expect(onStreet).toBe(0);
  });

  it("puts the smith of Quinudale (cedar-peak-198) into a dead end", () => {
    const world = new World("cedar-peak-198", "default");
    const poi = world.allPois().find((p) => p.name === "Quinudale")!;
    const map = generateInterior(world, poi);
    const smith = buildMapContent(world, poi, map).actions.find((a) => a.kind === "service" && a.params.service === "smith")!;
    const open = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => map.cells[(smith.y + dy!) * map.width + smith.x + dx!] === CELL.FLOOR).length;
    expect(open).toBe(1);
  });
});

describe("42nd playtest, point 13: export and import of the saves", () => {
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

  it("brings the slots back from a bundle and takes a single save into the manual slot", () => {
    const state = newGameState("export-a", { x: 1, y: 2, facing: "N" });
    expect(writeSave(state, "auto")).toBe(true);
    expect(writeSave(state, "quick")).toBe(true);
    const bundle = exportSaves();
    expect(bundle.saves.map((s) => `${s.kind}/${s.slot}`).sort()).toEqual(["world/auto", "world/quick"]);
    store.clear();
    expect(readSave("world", "auto")).toBeNull();
    const result = importSaves(JSON.stringify(bundle));
    expect(result.skipped).toEqual([]);
    expect(result.written.sort()).toEqual(["world / auto", "world / quick"]);
    expect(readSave("world", "auto")?.seed).toBe("export-a");
    // one save alone becomes a named save
    store.clear();
    const single = importSaves(JSON.stringify(bundle.saves[0]!.save));
    expect(single.written).toEqual(["world / Imported export-a"]);
    expect(readNamedSave(listNamedSaves("world")[0]!.id)?.seed).toBe("export-a");
  });

  it("writes nothing for a file that is no save", () => {
    expect(importSaves("not json").written).toEqual([]);
    expect(importSaves("{}").written).toEqual([]);
    expect(importSaves(JSON.stringify({ format: "mm3-saves", saves: [{ kind: "campaign", slot: "auto", save: { version: 1, state: { party: { characters: [] } } } }] })).written).toEqual([]);
    expect(store.size).toBe(0);
  });
});
