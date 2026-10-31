import { describe, expect, it } from "vitest";
import { validateContent } from "../../src/actions";
import { GONG_SOUND, chaliceGift, resolveAction, type ActionContext } from "../../src/actions/handlers";
import { ACTION_DEFS } from "../../src/actions/registry";
import type { ActionInstance } from "../../src/actions/types";
import { VAULT_PACKAGE, vaultBonus } from "../../src/actions/vaults";
import { Rng, seedFromString } from "../../src/core/rng";
import { BONES_FIND_CHANCE, BONE_PILE, RAT_TRAP } from "../../src/data/chest-traps";
import { QUESTS, type LayoutId, type QuestId } from "../../src/data/quest-table";
import { PANDORAS_BOX, isStartingSpell, spellsOfTier } from "../../src/data/spell-loot";
import { SPELLS } from "../../src/data/tables";
import { BOON_ONE_IN, landmarkBoon, landmarkName } from "../../src/game/landmarkBoons";
import { DEFAULT_SETTINGS, parseSettings } from "../../src/game/settings";
import { SKULL_MISER_MET, lockSeenFlag, reachedFlag, worldQuestLog } from "../../src/game/questLog";
import { generateInterior } from "../../src/interiors";
import { applyBoon, BOON_HOURS, boonAmount } from "../../src/sim/boons";
import { attr, resistance } from "../../src/sim/character";
import { MINUTES_PER_DAY, advanceTime, createDefaultParty } from "../../src/sim/party";
import { dismissMember, startingSpells } from "../../src/sim/roster";
import { DECO, WORLD_SIZES } from "../../src/world/types";
import { World } from "../../src/world/world";
import { questInterior } from "../helpers/quests";

const world = new World("playtest35");
const rootSeed = world.rootSeed;

const context = (party = createDefaultParty(), extra: Partial<ActionContext> = {}): ActionContext => ({ party, rootSeed, monsterThemes: { beast: 1 }, tier: 1, attempt: 0, ...extra });

describe("35th playtest, points 14 and 15: Pandora's box is no starting spell, and no scroll of a starting spell lies in the world", () => {
  it("leaves the box out of the spells a new hero starts with, and out of the first party", () => {
    for (const cls of ["Wizard", "Cleric", "Druid", "Archer", "Paladin", "Ranger"] as const) {
      const spells = startingSpells(cls);
      expect(spells, cls).not.toContain(PANDORAS_BOX);
      for (const id of spells) expect(SPELLS[id]!.level, cls).toBe(1);
    }
    for (const c of createDefaultParty().characters) expect(c.spells).not.toContain(PANDORAS_BOX);
  });

  it("makes no scroll of the level 1 spells the schools start with, but one of the box", () => {
    const tier1 = spellsOfTier(1);
    expect(tier1).toContain(PANDORAS_BOX);
    for (const id of tier1) expect(isStartingSpell(id), `spell ${id}`).toBe(false);
    expect([1, 3, 4, 5, 6].every((id) => isStartingSpell(id))).toBe(true);
  });
});

describe("35th playtest, point 13: the gong", () => {
  const gong: ActionInstance = { uid: "g#gong:0", kind: "gong", x: 3, y: 3, params: { item: 118, group: 2, monsters: "1,2" } };

  it("asks whether to strike, rings, calls the monsters once and may be struck again for the sound", () => {
    const party = createDefaultParty();
    const opened = new Set<string>();
    // asks first
    const asked = resolveAction(gong, context(party, { opened }));
    expect(asked.effects[0]).toMatchObject({ type: "confirm", title: "Gong" });
    expect(asked.state).toBeUndefined();
    // declined: nothing happens
    expect(resolveAction(gong, context(party, { opened, answer: null })).effects).toEqual([]);
    // the first strike: the sound of the gong, the monsters, and the gong counts as struck
    const first = resolveAction(gong, context(party, { opened, answer: "yes" }));
    expect(first.effects).toContainEqual({ type: "sound", id: GONG_SOUND });
    expect(first.effects.some((e) => e.type === "ambush")).toBe(true);
    expect(first.consumed).toBe(false);
    expect(first.state).toEqual({ add: [gong.uid], remove: [] });
    expect(ACTION_DEFS.gong.persistence).toBe("repeat");
    // the next one: asks again, rings again, and nothing seems to happen
    opened.add(gong.uid);
    expect(resolveAction(gong, context(party, { opened })).effects[0]).toMatchObject({ type: "confirm" });
    const again = resolveAction(gong, context(party, { opened, answer: "yes" }));
    expect(again.effects).toContainEqual({ type: "sound", id: GONG_SOUND });
    expect(again.effects.some((e) => e.type === "ambush")).toBe(false);
    expect(again.effects.some((e) => e.type === "text" && e.text === "Although you have struck the gong hard, nothing seems to have happened.")).toBe(true);
    expect(again.state).toBeUndefined();
  });
});

describe("35th playtest, point 7: a hint at what is in the cup, not its name", () => {
  it("shows the look of the brew in the question and never names the attribute or the points", () => {
    for (const [attribute, clue] of [["lck", "clover"], ["str", "horn"], ["int", "letters"], ["per", "mask"], ["end", "root"], ["spd", "feather"], ["acc", "arrowhead"]] as const) {
      for (const item of [86, 37, 5, 117]) {
        const gift = chaliceGift({ item, bonus: "attr", attr: attribute, amount: 5 });
        expect(gift.question, `${attribute} ${item}`).toContain(clue);
        expect(gift.question, `${attribute} ${item}`).toMatch(/Who wants to/);
        expect(gift.question.toLowerCase()).not.toContain(attribute === "lck" ? "luck" : "strength");
        expect(gift.question).not.toMatch(/\b(LCK|STR|INT|PER|END|SPD|ACC)\b/);
        expect(gift.question).not.toMatch(/\d/);
      }
    }
    expect(chaliceGift({ item: 86, bonus: "level", amount: 1 }).question).toMatch(/Who wants to/);
    expect(chaliceGift({ item: 86, bonus: "xp", amount: 1_000_000 }).question).toMatch(/Who wants to/);
  });

  it("asks with the look in the dialog (one `pick` effect) and gives the points to the hero chosen", () => {
    const party = createDefaultParty();
    const cup: ActionInstance = { uid: "c#chalice:0", kind: "chalice", x: 2, y: 2, params: { item: 86, bonus: "attr", attr: "lck", amount: 10 } };
    const asked = resolveAction(cup, context(party));
    expect(asked.effects).toHaveLength(1);
    expect(asked.effects[0]).toMatchObject({ type: "pick" });
    const before = party.characters[1]!.lck;
    expect(resolveAction(cup, context(party, { hero: 1 })).consumed).toBe(true);
    expect(party.characters[1]!.lck).toBe(before + 10);
  });
});

describe("35th playtest, point 5: a pile of bones hides something", () => {
  it("gives one pile in five a few coins, sometimes an item and, one find in five, a rat", () => {
    let piles = 0;
    let finds = 0;
    let rats = 0;
    for (let i = 0; i < 160; i++) {
      const layout = (["dungeon_1", "dungeon_2", "dungeon_4", "cave_1", "cave_2", "cave_3"] as const)[i % 6] as LayoutId;
      const quest = (QUESTS.quest_5.layouts.includes(layout) ? "quest_5" : "quest_3") as QuestId;
      const { content } = questInterior(quest, layout, 1 + (i % 5), i);
      for (const a of content.actions.filter((x) => x.kind === "decor" && x.params.item === BONE_PILE)) {
        piles++;
        if (a.params.find !== 1) {
          expect(a.params.gold, a.uid).toBeUndefined();
          continue;
        }
        finds++;
        expect(Number(a.params.gold), a.uid).toBeGreaterThan(0);
        expect(Number(a.params.level), a.uid).toBeGreaterThanOrEqual(1);
        if (a.params.trapped !== undefined) {
          rats++;
          expect(a.params.trapped, a.uid).toBe(RAT_TRAP);
          expect(Number(a.params.trapDamage), a.uid).toBeGreaterThan(0);
        }
      }
    }
    expect(piles).toBeGreaterThan(100);
    expect(finds / piles).toBeGreaterThan(BONES_FIND_CHANCE / 1000 - 0.1);
    expect(finds / piles).toBeLessThan(BONES_FIND_CHANCE / 1000 + 0.1);
    expect(rats).toBeGreaterThan(0);
    expect(rats).toBeLessThan(finds);
  });

  it("pays out when the party steps on a pile with a find, and a rat bites a hero (physical damage) or only tries when luck helps", () => {
    const pile: ActionInstance = { uid: "b#decor:1", kind: "decor", x: 2, y: 2, params: { item: BONE_PILE, find: 1, level: 2, gold: 40, items: 0 } };
    const party = createDefaultParty();
    const gold = party.gold;
    const out = resolveAction(pile, context(party));
    expect(party.gold).toBe(gold + 40);
    expect(out.effects.some((e) => e.type === "gold" && e.amount === 40)).toBe(true);
    expect(out.consumed).toBe(false);
    // a pile with nothing in it only says what it is
    const empty = resolveAction({ ...pile, params: { item: BONE_PILE } }, context(createDefaultParty()));
    expect(empty.effects.every((e) => e.type === "text")).toBe(true);
    // the rat
    const rat: ActionInstance = { ...pile, params: { ...pile.params, trapped: RAT_TRAP, trapDamage: 6, trapLevel: 2 } };
    let bites = 0;
    let misses = 0;
    for (let attempt = 0; attempt < 120; attempt++) {
      const p = createDefaultParty();
      const result = resolveAction(rat, context(p, { attempt }));
      const bite = result.effects.find((e) => e.type === "damage");
      if (bite?.type === "damage") {
        bites++;
        expect(bite.damageType).toBe("physical");
        expect(bite.amount).toBe(7); // 6 times 1 + level / 10 for a hero of level 1 (36th playtest, point 25)
      } else {
        misses++;
        expect(result.effects.some((e) => e.type === "text" && e.tone === "good")).toBe(true);
      }
    }
    expect(bites).toBeGreaterThan(0);
    expect(misses).toBeGreaterThan(0);
  });
});

describe("35th playtest, point 12: boons of wells, fountains and stone heads", () => {
  const big = new World("boon-a", "large");
  const landmarks: { x: number; y: number }[] = [];
  const { width, height } = WORLD_SIZES.large;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (big.tile(x, y).deco === DECO.LANDMARK) landmarks.push({ x, y });

  it("makes about one of three wells, fountains and stone heads magic, by the seed and the tile alone", () => {
    expect(landmarks.length).toBeGreaterThan(50);
    const holders = landmarks.filter((l) => ["Well", "Fountain", "Giant stone head"].some((n) => landmarkName(big, l.x, l.y).startsWith(n)));
    expect(holders.length).toBeGreaterThan(25);
    const magic = holders.filter((l) => landmarkBoon(big, l.x, l.y) !== null);
    expect(magic.length / holders.length).toBeGreaterThan(1 / BOON_ONE_IN - 0.17);
    expect(magic.length / holders.length).toBeLessThan(1 / BOON_ONE_IN + 0.17);
    // huts and caravans are never magic, and asking twice (or across the seam) gives the same answer
    for (const l of landmarks) {
      const boon = landmarkBoon(big, l.x, l.y);
      expect(landmarkBoon(big, l.x + width, l.y - height)).toEqual(boon);
      if (/Hut|caravan/i.test(landmarkName(big, l.x, l.y))) expect(boon).toBeNull();
    }
  });

  it("gives +5 on level 1 up to +25 on level 5, a resistance twice as many percent", () => {
    for (let tier = 1; tier <= 5; tier++) {
      expect(boonAmount(tier, "str")).toBe(5 * tier);
      expect(boonAmount(tier, "res_fire")).toBe(10 * tier);
    }
    const seen = new Set<string>();
    for (const l of landmarks) {
      const boon = landmarkBoon(big, l.x, l.y);
      if (!boon) continue;
      seen.add(boon.stat);
      expect(boon.amount, `${l.x},${l.y}`).toBe(boonAmount(big.tierAt(l.x, l.y), boon.stat));
    }
    expect(seen.size).toBeGreaterThanOrEqual(8);
  });

  it("raises a stat of the whole party for twelve hours, does not add up, and goes with its time", () => {
    const party = createDefaultParty();
    const str = party.characters.map((c) => attr(c, "str"));
    const fire = party.characters.map((c) => resistance(c, "fire"));
    applyBoon(party, "str", 10);
    applyBoon(party, "res_fire", 20);
    party.characters.forEach((c, i) => {
      expect(attr(c, "str")).toBe(str[i]! + 10);
      expect(resistance(c, "fire")).toBe(fire[i]! + 20);
    });
    // the same stat again replaces the first (a new twelve hours), it does not stack
    advanceTime(party, 6 * 60);
    applyBoon(party, "str", 10);
    expect(attr(party.characters[0]!, "str")).toBe(str[0]! + 10);
    expect(party.effects.filter((e) => e.kind === "boon" && e.stat === "str")).toHaveLength(party.characters.length);
    // the fire resistance ends six hours later, the strength twelve hours after the second visit
    const passed = advanceTime(party, 6 * 60 + 1);
    expect(passed.expired.filter((e) => e.kind === "boon")).toHaveLength(party.characters.length);
    expect(resistance(party.characters[0]!, "fire")).toBe(fire[0]!);
    expect(attr(party.characters[0]!, "str")).toBe(str[0]! + 10);
    advanceTime(party, BOON_HOURS * 60);
    party.characters.forEach((c, i) => {
      expect(attr(c, "str")).toBe(str[i]!);
      expect(c.mods?.boon).toBeUndefined();
    });
    expect(party.effects.filter((e) => e.kind === "boon")).toEqual([]);
  });

  it("takes the points of Endurance into the hit points while it lasts, and a hero who leaves the party keeps none", () => {
    const party = createDefaultParty();
    const health = party.characters[0]!.health;
    applyBoon(party, "end", 25);
    expect(party.characters[0]!.health).toBeGreaterThan(health);
    advanceTime(party, BOON_HOURS * 60 + 1);
    expect(party.characters[0]!.health).toBe(health);
    applyBoon(party, "str", 10);
    const leaving = party.characters[0]!;
    expect(dismissMember(party, 0)).toEqual({ ok: true });
    expect(leaving.mods?.boon).toBeUndefined();
    expect(party.effects.some((e) => e.kind === "boon" && e.character === 0)).toBe(false);
  });
});

describe("35th playtest, point 16: the cursor setting", () => {
  it("is on by default, read from the stored settings, and on for a stored setting without the field", () => {
    expect(DEFAULT_SETTINGS.fadeCursor).toBe(true);
    expect(parseSettings(JSON.stringify({ fadeCursor: false })).fadeCursor).toBe(false);
    expect(parseSettings(JSON.stringify({ music: false })).fadeCursor).toBe(true);
    expect(parseSettings(JSON.stringify({ fadeCursor: "no" })).fadeCursor).toBe(true);
  });
});

describe("35th playtest, point 17: treasure chambers behind brittle walls", () => {
  const places = (count: number) =>
    Array.from({ length: count }, (_, i) => {
      const layout = (["dungeon_1", "dungeon_2", "dungeon_4", "cave_1", "cave_2", "cave_3", "dungeon_3"] as const)[i % 7] as LayoutId;
      const quest = (QUESTS.quest_5.layouts.includes(layout) ? "quest_5" : "quest_3") as QuestId;
      return { tier: 1 + (i % 5), ...questInterior(quest, layout, 1 + (i % 5), i) };
    });

  it("has 0 to 3 of them in every cave and dungeon: a plain-looking wall that breaks, a chest with twice the loot behind it, and a valid, whole place", { timeout: 300_000 }, () => {
    const counts = new Map<number, number>();
    for (const { map, content, tier } of places(70)) {
      const vaults = map.dungeon?.vaults ?? [];
      expect(vaults.length).toBeLessThanOrEqual(3);
      counts.set(vaults.length, (counts.get(vaults.length) ?? 0) + 1);
      expect(validateContent(map, content), `${map.key} tier ${tier}`).toEqual([]);
      vaults.forEach((v, i) => {
        const wall = content.actions.find((a) => a.uid === `${map.key}#brittle:${i}`);
        expect(wall?.kind, `${map.key} vault ${i}`).toBe("breakable_wall");
        expect(wall && [wall.x, wall.y]).toEqual([v.seal.x, v.seal.y]);
        // the wall is rock, the chamber floor, and nothing else of the place stands inside
        expect(map.cells[v.seal.y * map.width + v.seal.x]).toBe(0);
        const inside = content.actions.filter((a) => a.x >= v.x && a.y >= v.y && a.x < v.x + v.w && a.y < v.y + v.h);
        const chest = inside.find((a) => a.kind === "treasure" && a.params.quest === undefined && a.params.bonus === undefined);
        expect(chest, `${map.key} vault ${i}`).toBeDefined();
        // twice the gold of a chest at a dead end, and one or two items
        const level = tier;
        expect(Number(chest!.params.gold)).toBeGreaterThanOrEqual(2 * level * 90);
        expect(Number(chest!.params.gold)).toBeLessThanOrEqual(2 * (level * 90 + 120));
        expect([1, 2]).toContain(Number(chest!.params.items));
        expect(chest!.params.difficulty).toBeUndefined();
        // any bonus is an attribute or a resistance of the level below
        for (const b of inside.filter((a) => typeof a.params.bonus === "string")) {
          expect(tier, `${map.key} vault ${i}`).toBeGreaterThanOrEqual(2);
          expect(["attr", "res"]).toContain(b.params.bonus);
          const package_ = VAULT_PACKAGE[Math.min(4, tier - 1)]!;
          expect(Number(b.params.amount)).toBe(b.params.bonus === "res" ? 2 * package_ : package_);
        }
        // no scroll, coin or skull in it: a party without the Perceptive talent could not get them
        expect(chest!.params.scrolls).toBeUndefined();
        expect(chest!.params.extra).toBeUndefined();
      });
    }
    // every number from 0 to 3 turns up
    for (const n of [0, 1, 2, 3]) expect(counts.get(n) ?? 0, `${n} vaults`).toBeGreaterThan(0);
  });

  it("takes the points of a chamber from the level below the place, and none in a place of level 1", () => {
    for (let i = 0; i < 40; i++) expect(vaultBonus(1, new Rng(seedFromString(`v${i}`)))).toBeNull();
    for (let tier = 2; tier <= 5; tier++) {
      const kinds = new Set<string>();
      for (let i = 0; i < 40; i++) {
        const b = vaultBonus(tier, new Rng(seedFromString(`w${tier}:${i}`)))!;
        kinds.add("attr" in b ? "attr" : "res");
        expect(b.amount).toBe("attr" in b ? VAULT_PACKAGE[tier - 1] : 2 * VAULT_PACKAGE[tier - 1]!);
      }
      expect(kinds.size, `tier ${tier}`).toBe(2);
    }
  });

  it("opens with the break of its wall for a party with the Perceptive talent only", () => {
    const wall: ActionInstance = { uid: "m#brittle:0", kind: "breakable_wall", x: 5, y: 5, params: { axis: "x" } };
    const plain = createDefaultParty();
    expect(resolveAction(wall, context(plain)).effects).toEqual([]);
    const sharp = createDefaultParty();
    sharp.talents.push("talent_perceptive");
    expect(resolveAction(wall, context(sharp)).effects[0]).toMatchObject({ type: "confirm" });
    expect(resolveAction(wall, context(sharp, { answer: "yes" })).effects[0]).toEqual({ type: "wall", state: "broken" });
  });
});

describe("35th playtest, point 20: the maze has its share of monsters", () => {
  it("fills the maze with about three times the monsters of the rooms alone", { timeout: 120_000 }, () => {
    for (let variant = 0; variant < 4; variant++) {
      const { content, map } = questInterior("quest_4", "dungeon_3", 1 + (variant % 3), variant);
      expect(map.dungeon?.layout).toBe("dungeon_3");
      const rooms = content.spawns.filter((s) => s.uid.includes("#monsters_room:") || s.uid.includes("#boss_guard:"));
      const maze = content.spawns.filter((s) => s.uid.includes("#monsters_maze:"));
      expect(maze.length, `variant ${variant}`).toBe(10);
      expect(content.spawns.length).toBeGreaterThanOrEqual(2 * rooms.length);
      const monsters = content.spawns.reduce((n, s) => n + s.monsterIds.length, 0);
      expect(monsters, `variant ${variant}`).toBeGreaterThanOrEqual(15);
    }
  });
});

describe("35th playtest, point 2 and 11: the quest log of the generated world", () => {
  const w = new World("log-a", "default");
  const input = (opened: string[] = [], visited: string[] = [], carried: Record<string, number> = {}) => ({ world: w, opened: new Set(opened), visited: new Set(visited), carried: (type: string) => carried[type] ?? 0 });
  const keyed = w.allPois().find((p) => p.kind === "dungeon" && w.dungeonRef(p.id)?.requires?.startsWith("quest_key_"))!;
  const need = w.dungeonRef(keyed.id)!.requires!;
  const free = w.allPois().filter((p) => (p.kind === "dungeon" || p.kind === "cave") && w.dungeonRef(p.id)?.klass === "A");

  it("is empty at the start and lists nothing the party has not met", () => {
    expect(worldQuestLog(input())).toEqual({ open: [], done: [] });
  });

  it("lists the key to find for a locked place the party has stood before, then the use of the key, then the opened place as done", () => {
    const find = worldQuestLog(input([lockSeenFlag(keyed.id)]));
    expect(find.open).toHaveLength(1);
    expect(find.open[0]).toMatch(/^Find the .* key to open .* at \d+\/\d+\.$/);
    expect(find.open[0]).toContain(`${keyed.x}/${keyed.y}`);
    expect(find.open[0]).toContain(keyed.name);
    const use = worldQuestLog(input([lockSeenFlag(keyed.id)], [], { [need]: 1 }));
    expect(use.open[0]).toMatch(/^Use the .* key to open/);
    const done = worldQuestLog(input([lockSeenFlag(keyed.id)], [keyed.id], { [need]: 1 }));
    expect(done.open.filter((q) => q.includes("to open"))).toEqual([]);
    expect(done.done.some((q) => q.startsWith("Opened") && q.includes(keyed.name))).toBe(true);
  });

  it("follows a cave or dungeon from the first visit to its end room: open, then done with the words of the quest", () => {
    const cave = free.find((p) => p.kind === "cave")!;
    expect(worldQuestLog(input([], [cave.id])).open).toEqual([`Explore the scary ${cave.name} at ${cave.x}/${cave.y}.`]);
    expect(worldQuestLog(input([reachedFlag(cave.id)], [cave.id]))).toEqual({ open: [], done: [`Explored the scary ${cave.name}.`] });
    const boss = w.allPois().find((p) => p.kind === "dungeon" && w.dungeonRef(p.id)?.quest === "quest_5");
    if (boss) {
      const open = worldQuestLog(input([], [boss.id])).open.find((q) => q.includes(boss.name))!;
      expect(open).toMatch(/^Defeat the mighty .* in the /);
      const done = worldQuestLog(input([reachedFlag(boss.id)], [boss.id])).done.find((q) => q.includes(boss.name))!;
      expect(done).toMatch(/^Defeated the mighty .* in the /);
    }
  });

  it("counts the silver skulls at the Skull Miser and the orbs at the kings", () => {
    expect(worldQuestLog(input([SKULL_MISER_MET])).open[0]).toMatch(/^Bring 5 silver skulls to the Skull Miser in .*: 0\/5 handed in\.$/);
    expect(worldQuestLog(input(["skulls=4"], [], { quest_silver_skull: 2 })).open[0]).toMatch(/4\/5 handed in, you carry 2\.$/);
    expect(worldQuestLog(input(["skulls=7"])).done[0]).toMatch(/^Brought 5 silver skulls/);
    const castle = w.allPois().find((p) => p.kind === "castle")!;
    const kind = w.castleAlignment(castle.id)!;
    const log = worldQuestLog(input([`king:${kind}=4`], [castle.id], { quest_orb: 3 }));
    expect(log.open[0]).toContain(`${kind} king in ${castle.name}`);
    expect(log.open[0]).toContain("4/11 delivered, you carry 3.");
    const won = worldQuestLog(input([`king:${kind}=11`, `king:winner=${kind}`], [castle.id]));
    expect(won.open).toEqual([]);
    expect(won.done[0]).toContain("got 11 Orbs of Ultimate Power");
  });
});

describe("35th playtest, point 19: things on the ground stand on it in both ground modes", () => {
  it("lifts the models of the overworld a little on the 3D ground and not on the flat one", async () => {
    const mesher = await import("../../src/render/terrainMesher");
    expect(mesher.GROUND_PROP_LIFT).toBeGreaterThan(0.02);
    // (the lift is the height of the plateaus of the ground models over the plane, 0.004 to 0.02, and a little more; the flat ground is the plane)
    expect(mesher.GROUND_PROP_LIFT).toBeLessThan(0.2);
    expect(mesher.groundPropLift()).toBeGreaterThanOrEqual(0);
  });
});

describe("generated world sanity", () => {
  it("still builds a valid dungeon through the whole pipeline", () => {
    const poi = world.allPois().find((p) => p.kind === "dungeon" && world.dungeonRef(p.id)?.klass === "A")!;
    const map = generateInterior(world, poi);
    expect(map.dungeon).toBeDefined();
    void rootSeed;
    void dismissMember;
    void MINUTES_PER_DAY;
  });
});
