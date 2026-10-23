/**
 * Journey: how many fights it takes to climb the levels. The party always hunts in the highest tier it can bear (win rate, deaths and
 * hit point loss within the limits of `Policy`), collects the XP and gold of an average fight there (taken from the fight simulation),
 * and trains whenever a hero has the XP and the party has the gold. Heroes of different classes need different XP and so drift apart.
 */
import { type FightEnv } from "./fight";
import { type Formulas, xpForLevel } from "./formulas";
import { type GearSpec, type Growth, type PartyDef, gearForTier } from "./hero";
import { type CellStats, runCell, scenario } from "./scenario";
import { MONSTERS } from "../../src/data/tables";
import { meanSupply } from "./xpcurve";

export interface Policy {
  /** The party hunts in a tier when, at its level, it wins at least this share of the fights ... */
  minWin: number;
  /** ... loses at most this share of its hit points on average ... */
  maxHpLoss: number;
  /** ... and fewer than this many heroes die per fight. */
  maxDead: number;
}

export const POLICY_BRAVE: Policy = { minWin: 0.9, maxHpLoss: 0.6, maxDead: 0.35 };
export const POLICY_CAREFUL: Policy = { minWin: 0.97, maxHpLoss: 0.4, maxDead: 0.1 };

export interface JourneyRow {
  /** Mean level of the party. */
  level: number;
  tier: number;
  /** Fights spent on this level. */
  fights: number;
  cumFights: number;
  xpPerFight: number;
  goldPerFight: number;
  win: number;
  hpLoss: number;
  dead: number;
  /** The party waited for gold at this level (training costs more than it had). */
  goldBound: boolean;
}

export interface JourneyOpts {
  party: PartyDef;
  F: Formulas;
  env: FightEnv;
  growth: Growth;
  policy: Policy;
  maxLevel: number;
  runs: number;
  gearLag: number;
  startGold: number;
  /** XP and gold of a fight from the groups of generated worlds (true, default) or from the simulated groups of that difficulty class. */
  supply?: boolean;
  /** Safety stop. */
  maxFights: number;
  groups?: "class" | "world" | "pool";
  /** Fixed tier for every fight (null = the highest tier the policy allows). */
  fixedTier: number | null;
}

export function journey(o: JourneyOpts): JourneyRow[] {
  const cache = new Map<string, CellStats>();
  const cell = (level: number, tier: number): CellStats => {
    const key = `${level}|${tier}`;
    let c = cache.get(key);
    if (!c) {
      const gear: GearSpec = gearForTier(Math.max(1, tier - o.gearLag));
      c = runCell(scenario({ party: o.party, level, tier, runs: o.runs, chain: 1, env: o.env, growth: o.growth, F: o.F, gear, groups: o.groups })).fresh;
      cache.set(key, c);
    }
    return c;
  };
  const playable = (c: CellStats): boolean => c.winRate >= o.policy.minWin && c.hpLostPct <= o.policy.maxHpLoss && c.dead <= o.policy.maxDead;

  const sup = meanSupply();
  const reward = (tier: number, c: CellStats): { xp: number; gold: number } => {
    if (o.supply === false) return { xp: c.xp, gold: c.gold };
    const typical = Object.values(MONSTERS).find((m) => m.id < 1000 && m.treasure_level === tier)!;
    return { xp: (sup.xp[tier]! / sup.groups[tier]!) * o.F.monsterXp(typical), gold: sup.gold[tier]! / sup.groups[tier]! };
  };
  const members = o.party.members;
  const level = members.map(() => 1);
  const xp = members.map(() => 0);
  let gold = o.startGold;
  const rows: JourneyRow[] = [];
  let cum = 0;
  let row: JourneyRow | null = null;
  while (cum < o.maxFights) {
    const meanLevel = Math.round(level.reduce((s, l) => s + l, 0) / level.length);
    if (meanLevel >= o.maxLevel) break;
    let tier = 1;
    if (o.fixedTier !== null) tier = o.fixedTier;
    else for (let t = 5; t >= 1; t--) if (playable(cell(meanLevel, t))) {
      tier = t;
      break;
    }
    const c = cell(meanLevel, tier);
    if (!row || row.level !== meanLevel) {
      row = { level: meanLevel, tier, fights: 0, cumFights: cum, xpPerFight: reward(tier, c).xp, goldPerFight: reward(tier, c).gold, win: c.winRate, hpLoss: c.hpLostPct, dead: c.dead, goldBound: false };
      rows.push(row);
    }
    row.tier = Math.max(row.tier, tier);
    row.fights++;
    cum++;
    const r = reward(tier, c);
    gold += r.gold;
    for (let i = 0; i < members.length; i++) xp[i]! += r.xp;
    // train: one level at a time, the lowest hero first, while XP and gold allow
    for (;;) {
      let trained = false;
      const order = members.map((_, i) => i).sort((a, b) => level[a]! - level[b]!);
      for (const i of order) {
        const cls = members[i]!.cls;
        if (xp[i]! < xpForLevel(o.F, cls, level[i]! + 1)) continue;
        const cost = o.F.trainingCost(level[i]!);
        if (gold < cost) {
          row.goldBound = true;
          continue;
        }
        gold -= cost;
        level[i]!++;
        trained = true;
      }
      if (!trained) break;
    }
  }
  return rows;
}
