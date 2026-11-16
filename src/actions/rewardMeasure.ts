/**
 * What a world hands out, counted from the world itself (bug_fix_59, points 4 and 6; the tool `tools/dev/reward-survey.ts` prints it for any world), and the factors that make it what the
 * default world hands out. Every place is built once and every container is opened once with the real handler on a fresh party, so the sum is the one the game pays, whatever the rules say.
 * Isomorphic: no DOM, no Babylon. It takes about five seconds for a default world, so the game works it out once, behind the loading screen of a new game.
 */
import { COIN, ORB, PEARL, PEARL_GOLD, PEARL_XP, SKULL } from "../data/quest-table";
import { MONSTERS } from "../data/tables";
import { generateInterior } from "../interiors";
import { createDefaultParty } from "../sim/party";
import { hutGold, hutMonsters, hutXpPercent, hutsOf } from "../world/huts";
import { chunkSpawns } from "../world/spawns";
import type { World } from "../world/world";
import { buildMapContent } from "./index";
import { resolveAction, type Effect } from "./handlers";
import { COIN_POINTS, type RewardScale } from "./rewardScale";
import type { ActionInstance } from "./types";

export const ATTRS = ["str", "int", "per", "end", "spd", "acc", "lck"] as const;
export const RES = ["resFire", "resIce", "resAcid", "resMagic"] as const;
/** The heroes of a party: a gift to one hero counts a quarter, what the whole party gets counts in full. */
export const MEMBERS = 4;

export interface WorldRewards {
  /** Experience per party member. */
  xpMonsterPlaces: number;
  xpMonsterWild: number;
  xpHuts: number;
  xpObjects: number;
  xpQuests: number;
  /** Attribute points per party member, by attribute (containers, vaults, shrines and chalices; the coins are `attrFreeCoins`). */
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
function reward(orig: ActionInstance, tier: number, world: World, content: ReturnType<typeof buildMapContent>): { xp: number; gold: number; attrs: Record<string, number>; res: Record<string, number>; levels: number } {
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
  let hero: number | undefined;
  let answer: string | null | undefined;
  for (let step = 0; step < 4; step++) {
    let out;
    try {
      // (no factors: this is what the world holds before the factors are worked out)
      out = resolveAction(a, { party, rootSeed: world.rootSeed, content, opened: new Set(), monsterThemes: {}, tier, ...(hero !== undefined ? { hero } : {}), ...(answer !== undefined ? { answer } : {}) });
    } catch {
      break;
    }
    const effects: Effect[] = out.effects;
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
  return { xp, gold: party.gold, attrs, res, levels };
}

/** Everything a world hands out, before any factor: the wild monsters, the huts, every place with its monsters and containers, and what the quest givers pay. */
export function measureWorld(world: World): WorldRewards {
  const size = world.size;
  const row: WorldRewards = { xpMonsterPlaces: 0, xpMonsterWild: 0, xpHuts: 0, xpObjects: 0, xpQuests: 0, attrs: {}, attrFreeCoins: 0, res: {}, goldMonsters: 0, goldObjects: 0, goldQuests: 0, scrolls: 0, levels: 0, places: 0, orbs: 0, skulls: 0, pearls: 0, coins: 0 };
  // the wild monsters on the overworld
  for (let cy = 0; cy < world.chunksDown; cy++) {
    for (let cx = 0; cx < world.chunksAcross; cx++) {
      for (const s of chunkSpawns(world, cx, cy)) {
        for (const id of s.monsterIds) {
          row.xpMonsterWild += MONSTERS[id]!.xp;
          row.goldMonsters += MONSTERS[id]!.gold;
        }
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
    for (const s of content.spawns) {
      for (const id of s.monsterIds) {
        row.xpMonsterPlaces += MONSTERS[id]!.xp;
        row.goldMonsters += MONSTERS[id]!.gold;
      }
    }
    for (const a of content.actions) {
      // the quest items that are paid for by a person (orbs: king, skulls: miser, pearls: queen) and the coins of the machines
      const quest = String(a.params.quest ?? "");
      const extra = String(a.params.extra ?? "");
      if (quest === ORB) row.orbs += 1;
      if (extra === SKULL) row.skulls += 1;
      if (extra === PEARL) row.pearls += 1;
      if (extra === COIN) row.coins += 1;
      if (!["treasure", "shrine", "chalice", "riddle", "fountain"].includes(a.kind)) continue;
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
  row.attrFreeCoins = (row.coins * COIN_POINTS) / MEMBERS;
  return row;
}

/**
 * What every world hands out, in the numbers of a default world (bug_fix_59, point 6): the measure of the default world after the islands share the levels evenly (point 4). Gold is the
 * range the user asked for: 120 to 130 million with the quests, so 125 million is the middle. The others are the mean of ten seeds of the default world
 * (`tools/dev/reward-survey.ts`, seeds `table-47` to `table-56`): experience per hero with the quests, attribute points per hero (containers, shrines and chalices) with what the coins give,
 * resistance points per hero (all four elements).
 */
export const REWARD_TARGETS = {
  gold: 125_000_000,
  // 16. 11. 2026: was 950 million, the mean of ten default worlds before the wild monsters of every level shared the land evenly (GEN_VERSION 71): the Vulture Rocs and Dino Beetles gave
  // most of the wild XP. Mean of `table-47` to `table-56` after it: 851.5 million (882.6 million with the same generator and the old monsters), rounded to 850.
  xp: 850_000_000,
  attr: 190,
  res: 295,
} as const;

/** The most a single gift of attribute points or resistance points grows: a package of 20 points on level 1 becomes 80 at most. */
export const MAX_POINT_FACTOR = 4;
/** The coin is worth three points; the points that a small world cannot put into its containers go into the coins, up to four times as many. */
export const MAX_COIN_FACTOR = 4;

const sum = (r: Record<string, number>): number => Object.values(r).reduce((a, b) => a + b, 0);

/** The factors of a measured world (see `REWARD_TARGETS`); every world gets the same sums, whatever its size and whatever its seed made of its places. */
export function rewardScaleOf(raw: WorldRewards, targets: { gold: number; xp: number; attr: number; res: number } = REWARD_TARGETS): RewardScale {
  const goldScalable = raw.goldMonsters + raw.goldObjects;
  const gold = goldScalable > 0 ? Math.max(0.01, (targets.gold - raw.goldQuests) / goldScalable) : 1;
  const xpScalable = raw.xpMonsterPlaces + raw.xpMonsterWild + raw.xpHuts + raw.xpObjects;
  const xp = xpScalable > 0 ? Math.max(0.01, (targets.xp - raw.xpQuests) / xpScalable) : 1;
  const containers = sum(raw.attrs);
  // the containers take the factor up to `MAX_POINT_FACTOR`; what is missing then is made up by the coins
  const wanted = containers > 0 ? (targets.attr - raw.attrFreeCoins) / containers : 1;
  const attr = Math.min(MAX_POINT_FACTOR, Math.max(0.05, wanted));
  const coin = raw.attrFreeCoins > 0 ? Math.min(MAX_COIN_FACTOR, Math.max(1, (targets.attr - attr * containers) / raw.attrFreeCoins)) : 1;
  const resistances = sum(raw.res);
  const res = resistances > 0 ? Math.min(MAX_POINT_FACTOR, Math.max(0.05, targets.res / resistances)) : 1;
  const round = (v: number): number => Math.round(v * 1000) / 1000;
  return { gold: round(gold), xp: round(xp), attr: round(attr), coin: round(coin), res: round(res) };
}

/** The factors of a world: measures it and works them out. Takes a few seconds. */
export function rewardScaleFor(world: World): RewardScale {
  return rewardScaleOf(measureWorld(world));
}
