/**
 * Survey of everything a world hands out (47th playtest, point 7): XP, attributes, resistances, gold and spell scrolls per world size and dungeon density, as the sum over the places, wild monsters, huts and quest
 * rewards, per party member (a gift to one hero counts a quarter). Reads the game's own code and changes nothing.
 *
 * Usage: npx tsx tools/dev/reward-survey.ts [seed=table-47] [sizes=small,default,large,huge] [densities=few,default,maximum] [out.json]
 */
import { writeFileSync } from "node:fs";
import { buildMapContent } from "../../src/actions";
import { resolveAction, type Effect } from "../../src/actions/handlers";
import type { ActionInstance } from "../../src/actions/types";
import { COIN, ORB, PEARL, PEARL_GOLD, PEARL_XP, SKULL } from "../../src/data/quest-table";
import { MONSTERS } from "../../src/data/tables";
import { generateInterior } from "../../src/interiors";
import { createDefaultParty } from "../../src/sim/party";
import { chunkSpawns } from "../../src/world/spawns";
import { hutGold, hutMonsters, hutXpPercent, hutsOf } from "../../src/world/huts";
import { World } from "../../src/world/world";
import type { DungeonDensity, WorldSize } from "../../src/world/types";
import { rngFor, LAYER } from "../../src/core/rng";

const ATTRS = ["str", "int", "per", "end", "spd", "acc", "lck"] as const;
const RES = ["resFire", "resIce", "resAcid", "resMagic"] as const;
const MEMBERS = 4;
const seed = process.argv[2] ?? "table-47";
const sizes = (process.argv[3] ?? "small,default,large,huge").split(",") as WorldSize[];
const densities = (process.argv[4] ?? "few,default,maximum").split(",") as DungeonDensity[];

interface Row {
  size: string;
  dungeons: string;
  xpMonsterPlaces: number;
  xpMonsterWild: number;
  xpHuts: number;
  xpObjects: number;
  xpQuests: number;
  attrs: Record<string, number>;
  attrFreeCoins: number;
  res: Record<string, number>;
  goldMonsters: number;
  goldObjects: number;
  goldQuests: number;
  scrolls: number;
  levels: number;
  places: number;
  orbs: number;
  skulls: number;
  pearls: number;
  coins: number;
}

/** What one action gives a fresh party (every question answered the helpful way), as the sum over the four heroes. */
function reward(orig: ActionInstance, tier: number, world: World, content: ReturnType<typeof buildMapContent>): { xp: number; gold: number; attrs: Record<string, number>; res: Record<string, number>; levels: number; scrolls: number } {
  // the locks, seals and alarms are what a party gets past on its way: the survey wants what lies in the container
  const a: ActionInstance = { ...orig, params: { ...orig.params } };
  if (a.kind === "treasure") {
    delete a.params.difficulty;
    delete a.params.lock;
    delete a.params.requires;
    delete a.params.trapped;
    delete a.params.lockTrap;
  }
  const party = createDefaultParty();
  party.gold = 0;
  for (const c of party.characters) c.xp = 0;
  const before = party.characters.map((c) => ({ xp: c.xp, level: c.level, ...Object.fromEntries([...ATTRS, ...RES].map((k) => [k, (c as unknown as Record<string, number>)[k]!])) }));
  let scrolls = 0;
  let hero: number | undefined;
  let answer: string | null | undefined;
  for (let step = 0; step < 4; step++) {
    let out;
    try {
      out = resolveAction(a, { party, rootSeed: world.rootSeed, content, opened: new Set(), monsterThemes: {}, tier, ...(hero !== undefined ? { hero } : {}), ...(answer !== undefined ? { answer } : {}) });
    } catch {
      break;
    }
    const effects: Effect[] = out.effects;
    for (const e of effects) if (e.type === "item" && /scroll/i.test(String((e.item as { type?: string }).type ?? ""))) scrolls++;
    const ask = effects.find((e) => e.type === "ask");
    const pick = effects.find((e) => e.type === "pick");
    const confirm = effects.find((e) => e.type === "confirm");
    if (pick && hero === undefined) hero = 0;
    else if (ask && answer === undefined) answer = String(a.params.answer ?? "");
    else if (confirm && answer === undefined) answer = "yes";
    else break;
  }
  const attrs: Record<string, number> = {};
  const res: Record<string, number> = {};
  let xp = 0;
  let levels = 0;
  party.characters.forEach((c, i) => {
    xp += c.xp - before[i]!.xp;
    levels += c.level - before[i]!.level;
    for (const k of ATTRS) attrs[k] = (attrs[k] ?? 0) + ((c as unknown as Record<string, number>)[k]! - (before[i] as unknown as Record<string, number>)[k]!);
    for (const k of RES) res[k] = (res[k] ?? 0) + ((c as unknown as Record<string, number>)[k]! - (before[i] as unknown as Record<string, number>)[k]!);
  });
  return { xp, gold: party.gold, attrs, res, levels, scrolls };
}

const rows: Row[] = [];
for (const size of sizes) {
  for (const dungeons of densities) {
    const t0 = Date.now();
    const world = new World(seed, size, dungeons);
    const row: Row = { size, dungeons, xpMonsterPlaces: 0, xpMonsterWild: 0, xpHuts: 0, xpObjects: 0, xpQuests: 0, attrs: {}, attrFreeCoins: 0, res: {}, goldMonsters: 0, goldObjects: 0, goldQuests: 0, scrolls: 0, levels: 0, places: 0, orbs: 0, skulls: 0, pearls: 0, coins: 0 };
    // the wild monsters on the overworld
    for (let cy = 0; cy < world.chunksDown; cy++) {
      for (let cx = 0; cx < world.chunksAcross; cx++) {
        for (const s of chunkSpawns(world, cx, cy)) for (const id of s.monsterIds) {
          row.xpMonsterWild += MONSTERS[id]!.xp;
          row.goldMonsters += MONSTERS[id]!.gold;
        }
      }
    }
    // the huts: the monsters (at the share of XP of the size) and the burning (XP, gold)
    for (const hut of hutsOf(world)) {
      const def = MONSTERS[hut.monster]!;
      const n = hut.slots.length || hutMonsters(size);
      row.xpHuts += n * Math.floor((def.xp * hutXpPercent(size)) / 100) + def.hut_xp;
      row.goldMonsters += n * def.gold;
      row.goldObjects += hutGold(hut.monster);
    }
    // the places
    const seen = new Set<string>();
    for (const poi of world.allPois()) {
      let map;
      try {
        map = generateInterior(world, poi);
      } catch {
        continue;
      }
      if (seen.has(map.key)) continue;
      seen.add(map.key);
      row.places++;
      const content = buildMapContent(world, poi, map);
      for (const s of content.spawns) for (const id of s.monsterIds) {
        row.xpMonsterPlaces += MONSTERS[id]!.xp;
        row.goldMonsters += MONSTERS[id]!.gold;
      }
      for (const a of content.actions) {
        // the quest items that are paid for by a person (orbs: king, skulls: miser, pearls: queen) and the coins of the machines
        const quest = String(a.params.quest ?? "");
        const extra = String(a.params.extra ?? "");
        const count = Number(a.params.count ?? 1);
        if (quest === ORB) row.orbs += 1;
        if (extra === SKULL) row.skulls += 1;
        if (extra === PEARL) row.pearls += 1;
        if (extra === COIN) row.coins += 1;
        if (!["treasure", "shrine", "chalice", "riddle", "fountain"].includes(a.kind)) {
          void count;
          continue;
        }
        // (the scroll ids of a container are counted from its params: the reward of a chest does not say what the scroll is called)
        if (typeof a.params.scrolls === "string" && a.params.scrolls !== "") row.scrolls += a.params.scrolls.split(",").length;
        const r = reward(a, content.tier, world, content);
        row.xpObjects += r.xp / MEMBERS;
        row.goldObjects += r.gold;
        row.levels += r.levels / MEMBERS;
        for (const k of ATTRS) row.attrs[k] = (row.attrs[k] ?? 0) + (r.attrs[k] ?? 0) / MEMBERS;
        for (const k of RES) row.res[k] = (row.res[k] ?? 0) + (r.res[k] ?? 0) / MEMBERS;
      }
    }
    row.xpQuests = row.orbs * 1_000_000 + row.skulls * 1000 + row.pearls * PEARL_XP;
    row.goldQuests = row.orbs * 1_000_000 + row.skulls * 1000 + row.pearls * PEARL_GOLD;
    row.attrFreeCoins = (row.coins * 3) / MEMBERS;
    rows.push(row);
    console.log(`${size}/${dungeons}: ${row.places} places, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
}
writeFileSync(process.argv[5] ?? `survey-${seed}.json`, JSON.stringify(rows, null, 1));
void rngFor;
void LAYER;
void hutGold;
