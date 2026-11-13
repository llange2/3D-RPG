import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveAction, type ActionContext } from "../../src/actions/handlers";
import type { ActionInstance } from "../../src/actions/types";
import { Rng, seedFromString } from "../../src/core/rng";
import { END_LOOT } from "../../src/data/quest-table";
import { MONSTERS, SPELLS } from "../../src/data/tables";
import { planDungeon } from "../../src/interiors";
import { lzCompress, lzDecompress, packSave, unpackSave, PACKED_PREFIX } from "../../src/game/saveCodec";
import { listNamedSaves, newGameState, readNamedSave, readSave, writeNamedSave, writeSave, deleteNamedSave } from "../../src/game/state";
import { createEncounter, createMonster, monsterTurn, type GridView } from "../../src/sim/encounter";
import { createDefaultParty } from "../../src/sim/party";
import { spellCost } from "../../src/sim/spells";
import { WORLD_SIZE_NAMES } from "../../src/world/types";
import { World } from "../../src/world/world";
import { hash2 } from "../../src/core/noise";
import { landmarkName } from "../../src/game/landmarkBoons";
import { landmarkIsCottageAt, landmarkItemAt, propSpec } from "../../src/render/terrainMesher";
import { DECO } from "../../src/world/types";
import { propLine, COTTAGE_LINES } from "../../src/data/prop-texts";
import { questInterior } from "../helpers/quests";

describe("57th playtest, point 2: Power Cure costs 2 spell points per level", () => {
  it("is 2 per level, rounded up, and the text says so", () => {
    expect(SPELLS[28]!.mana).toBe(4);
    for (const level of [1, 2, 5, 9, 20]) expect(spellCost(SPELLS[28]!, { level })).toBe(2 * level);
    expect(SPELLS[28]!.text).toContain("Costs 2 mana per caster level");
  });
});

describe("57th playtest, point 3: the monsters round a Super Shelter come up to the party but do not strike", () => {
  const land = Object.values(MONSTERS).find((m) => m.terrain !== "water" && !m.ranged)!;
  const open: GridView = { walkable: (x, y) => x >= 0 && y >= 0 && x < 12 && y < 12, water: () => false, opaque: () => false };

  it("moves them, and a peaceful turn has no attack, where an ordinary turn would have one", () => {
    const hunt = (peaceful: boolean) => {
      const enc = createEncounter();
      enc.monsters.push(createMonster("m", land.id, 6, 3));
      const party = createDefaultParty();
      const rng = new Rng(seedFromString("shelter"));
      const events = [] as ReturnType<typeof monsterTurn>;
      for (let turn = 0; turn < 8; turn++) events.push(...monsterTurn(party, open, enc, 6, 6, rng, 12, peaceful));
      return { events, monster: enc.monsters[0]!, party };
    };
    const calm = hunt(true);
    expect(calm.events.some((e) => e.type === "monster_move")).toBe(true);
    expect(calm.events.some((e) => e.type === "monster_attack")).toBe(false);
    expect(Math.max(Math.abs(calm.monster.x - 6), Math.abs(calm.monster.y - 6))).toBe(1);
    expect(calm.party.characters.every((c) => c.hp === c.health)).toBe(true);
    expect(hunt(false).events.some((e) => e.type === "monster_attack")).toBe(true);
  });
});

describe("57th playtest, point 6: quest document 1.8", () => {
  it("lays a key card only in a dungeon that asks for a key", () => {
    let cards = 0;
    for (const size of WORLD_SIZE_NAMES) {
      for (const dungeons of ["default", "maximum"] as const) {
        for (const seed of ["card-a", "card-b"]) {
          const world = new World(seed, size, dungeons);
          for (const poi of world.allPois().filter((p) => p.kind === "dungeon" || p.kind === "cave")) {
            const ref = planDungeon(world, poi);
            if (!ref) continue;
            for (const g of ref.gives.filter((x) => x.endsWith("_keycard"))) {
              cards++;
              expect(ref.klass, `${size} ${dungeons} ${seed} ${poi.id} holds ${g}`).toBe("B");
              expect(ref.requires, `${poi.id}`).toMatch(/^quest_key_/);
            }
          }
        }
      }
    }
    expect(cards).toBeGreaterThan(0);
  });

  it("has the loot table of the document", () => {
    expect(END_LOOT[1]).toMatchObject({ gold: [5_000, 10_000], points: { attributes: 5, resistance: 0 }, treasure: [5, 10] });
    expect(END_LOOT[2]!.points).toEqual({ attributes: 10, resistance: 5 });
    expect(END_LOOT[3]!.points).toEqual({ attributes: 15, resistance: 7 });
    expect(END_LOOT[4]).toMatchObject({ goldStep: 100_000, points: { attributes: 20, resistance: 10 }, xp: [500_000, 750_000, 1_000_000] });
    expect(END_LOOT[5]).toMatchObject({ gold: [1_000_000, 2_000_000], goldStep: 250_000, levelUps: 1, crystal: 20, treasure: null });
  });

  it("pays a level 5 room in rounded gold, a level and the crystal; treasure lies one level above the place", () => {
    const seenGold = new Set<number>();
    let crystals = 0;
    let treasure4 = 0;
    for (let variant = 0; variant < 40; variant++) {
      const five = questInterior("quest_5", "dungeon_4", 5, variant);
      const end = five.ref.endRoom!;
      const inEnd = (a: ActionInstance) => a.x >= end.x && a.y >= end.y && a.x < end.x + end.w && a.y < end.y + end.h;
      for (const a of five.content.actions.filter(inEnd)) {
        if (a.kind === "treasure" && Number(a.params.gold) > 0) seenGold.add(Number(a.params.gold));
        if (a.kind === "shrine" && a.params.effect === "floor") {
          crystals++;
          expect(a.params.amount).toBe(20);
          expect(a.params.item).toBe(117);
        }
        expect(a.kind === "treasure" && Number(a.params.items) > 0, `${a.uid}: level 5 has no treasure chest`).toBe(false);
      }
      const four = questInterior("quest_5", "dungeon_4", 3, variant);
      const end3 = four.ref.endRoom!;
      for (const a of four.content.actions) {
        if (a.kind === "treasure" && Number(a.params.items) > 0 && a.x >= end3.x && a.y >= end3.y && a.x < end3.x + end3.w && a.y < end3.y + end3.h) {
          expect(a.params.level, a.uid).toBe(4);
          treasure4++;
        }
      }
    }
    expect(crystals).toBeGreaterThan(0);
    expect(treasure4).toBeGreaterThan(0);
    for (const gold of seenGold) {
      expect(gold % 250_000).toBe(0);
      expect(gold).toBeGreaterThanOrEqual(1_000_000);
      expect(gold).toBeLessThanOrEqual(2_000_000);
    }
  });

  it("lifts the weakest hero's resistance to 20 with the crystal, and does nothing when everybody has it", () => {
    const crystal: ActionInstance = { uid: "crystal", kind: "shrine", x: 1, y: 1, params: { item: 117, effect: "floor", amount: 20 } };
    const party = createDefaultParty();
    const ctx = (): ActionContext => ({ party, rootSeed: new World("crystal").rootSeed, tier: 5, monsterThemes: { beast: 1 } });
    party.characters[0]!.resFire = party.characters[0]!.resIce = party.characters[0]!.resAcid = party.characters[0]!.resMagic = 12;
    for (const c of party.characters.slice(1)) c.resFire = c.resIce = c.resAcid = c.resMagic = 30;
    const out = resolveAction(crystal, ctx());
    expect(out.consumed).toBe(true);
    const hero = party.characters[0]!;
    // exactly one of the four resistances of the weakest hero is 20 now, the others are as they were
    expect([hero.resFire, hero.resIce, hero.resAcid, hero.resMagic].filter((r) => r === 20)).toHaveLength(1);
    expect(party.characters.slice(1).every((c) => c.resFire === 30 && c.resIce === 30 && c.resAcid === 30 && c.resMagic === 30)).toBe(true);
    // everybody at 20 or more: nothing happens, and it says so
    for (const c of party.characters) c.resFire = c.resIce = c.resAcid = c.resMagic = 25;
    const none = resolveAction(crystal, ctx());
    expect(none.effects).toEqual([{ type: "text", text: "The glowing crystal does not seem to have an effect on you." }]);
    expect(party.characters.every((c) => c.resFire === 25 && c.resIce === 25)).toBe(true);
  });
});

describe("57th playtest, point 7: saves are packed and none is lost", () => {
  it("packs and unpacks text of every kind, also past the 32768 phrases of the dictionary", () => {
    const rng = new Rng(seedFromString("codec"));
    const samples = ["", "a", "aaaaaaaaaaaaaaaaaaaaaaaa", "ÄÖÜ ß € 𝄞 日本語", JSON.stringify({ x: [1, 2, 3], y: "z".repeat(5000) })];
    let noise = "";
    for (let i = 0; i < 200_000; i++) noise += String.fromCharCode(32 + rng.int(90));
    samples.push(noise);
    samples.push(Array.from({ length: 30_000 }, (_, i) => JSON.stringify({ t: "fight", s: i * 7, mon: [{ id: i % 40, n: 1 + (i % 3) }] })).join(","));
    for (const text of samples) expect(lzDecompress(lzCompress(text)), text.slice(0, 20)).toBe(text);
    const journal = samples[samples.length - 1]!;
    expect(lzCompress(journal).length).toBeLessThan(journal.length / 3);
    expect(unpackSave(packSave(journal))).toBe(journal);
    expect(unpackSave(journal)).toBe(journal);
    // no character of a packed save is a control character or half of a surrogate pair
    expect(/[\u0000-\u001f\ud800-\udfff]/.test(lzCompress(journal))).toBe(false);
  });

  const store = new Map<string, string>();
  let limit = Infinity;
  beforeEach(() => {
    store.clear();
    limit = Infinity;
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        const used = [...store].reduce((n, [key, value]) => n + (key === k ? 0 : key.length + value.length), 0);
        if (used + k.length + v.length > limit) throw new Error("QuotaExceededError");
        store.set(k, v);
      },
      removeItem: (k: string) => void store.delete(k),
      key: (i: number) => [...store.keys()][i] ?? null,
      get length() {
        return store.size;
      },
    };
  });
  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it("stores a save packed and reads it back, and still reads an old plain one", () => {
    const state = newGameState("pack", { x: 3, y: 4, facing: "E" });
    state.journal = Array.from({ length: 500 }, (_, i) => ({ t: "snap", s: i, m: i, at: "ow", x: 1, y: 2, why: "steps", tier: 1, heroes: [], gold: 1, bank: 0, food: 3, kills: i }) as never);
    expect(writeSave(state, "quick")).toBe(true);
    expect(store.get("mm3-seed-rpg:quicksave:v1")!.startsWith(PACKED_PREFIX)).toBe(true);
    expect(store.get("mm3-seed-rpg:quicksave:v1")!.length).toBeLessThan(JSON.stringify(state.journal).length / 3);
    expect(readSave("world", "quick")?.state.journal).toHaveLength(500);
    store.set("mm3-seed-rpg:save:v1", JSON.stringify({ version: 1, genVersion: 3, savedAt: new Date().toISOString(), seed: "old", state: { ...state, opened: [], broken: [], killed: [], visited: [], explored: {} } }));
    expect(readSave("world", "auto")?.seed).toBe("old");
  });

  it("leaves no save that no list shows: an index that does not fit takes its save back out, and a save without an entry is found again", () => {
    const state = newGameState("room", { x: 1, y: 1, facing: "N" });
    expect(writeNamedSave(state, "first")).toBe(true);
    const saveKey = [...store.keys()].find((k) => k.startsWith("mm3-seed-rpg:named:save:"))!;
    const indexKey = "mm3-seed-rpg:named:index:v1";
    // room for one more save but not for the longer index
    const room = [...store].reduce((n, [k, v]) => n + k.length + v.length, 0);
    limit = room + store.get(saveKey)!.length + saveKey.length + 10;
    expect(writeNamedSave(state, "second")).toBe(false);
    expect([...store.keys()].filter((k) => k.startsWith("mm3-seed-rpg:named:save:"))).toHaveLength(1);
    expect(listNamedSaves("world").map((e) => e.name)).toEqual(["first"]);
    // a save that was left behind (the browser of the playtest) comes back under a name made of its time
    limit = Infinity;
    store.set("mm3-seed-rpg:named:save:lost1", store.get(saveKey)!);
    const names = listNamedSaves("world").map((e) => e.name);
    expect(names).toHaveLength(2);
    expect(names.some((n) => n.startsWith("Recovered "))).toBe(true);
    const recovered = listNamedSaves("world").find((e) => e.id === "lost1")!;
    expect(readNamedSave(recovered.id)?.seed).toBe("room");
    // the next save writes it into the index, and deleting it takes it away for good
    expect(writeNamedSave(state, "third")).toBe(true);
    expect(JSON.parse(store.get(indexKey)!).map((e: { id: string }) => e.id)).toContain("lost1");
    deleteNamedSave("lost1");
    expect(listNamedSaves("world").map((e) => e.id)).not.toContain("lost1");
  });
});

describe("57th playtest, point 4: what the party reads at an outside object is the object that stands there", () => {
  it("names, says and draws every landmark the same way", () => {
    let seen = 0;
    for (const seed of ["pearl-shore-794", "landmark-b"]) {
      const world = new World(seed, "default", "default");
      for (let y = 0; y < world.height; y++) {
        for (let x = 0; x < world.width; x++) {
          const tile = world.tile(x, y);
          if (tile.deco !== DECO.LANDMARK) continue;
          seen++;
          // the model the mesher draws on the tile, from the same hash it uses
          const model = propSpec(tile.deco, tile.biome, hash2(0xbeef, x, y) >>> 0, true)!.model;
          const cottage = landmarkIsCottageAt(x, y);
          expect(model === "obj_cottage", `${seed} ${x}/${y}: drawn as ${model}`).toBe(cottage);
          if (!cottage) expect(model).toBe(`ci_${landmarkItemAt(x, y)}`);
          expect(landmarkName(world, x, y) === "Cottage").toBe(cottage);
          const line = cottage ? COTTAGE_LINES[0]! : propLine(landmarkItemAt(x, y), `${x},${y}`);
          expect(/cottage/i.test(line), `${seed} ${x}/${y}: ${line}`).toBe(cottage);
        }
      }
    }
    expect(seen).toBeGreaterThan(20);
  });
});
