/**
 * Looks for formula parameters (parametric.ts) that make the fights follow a target: in a tier's own band the heroes lose a
 * fixed share of their hit points per fight, that share falls smoothly with the levels above the band's start, and ranged attacks
 * are strong, but not stronger than a fair share. Spells and monsters stay as they are.
 *
 * Usage: tsx tools/balance/search.ts <name> [iterations=300] [runs=24] [bands=1,5,11,19,33] [start.json]
 * The best parameters so far are written to tools/balance/out/search-<name>.json after every improvement.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_ENV, type FightEnv } from "./fight";
import { type Formulas } from "./formulas";
import { GROWTH_NONE, GROWTH_USER, PARTIES, gearForTier } from "./hero";
import { DEFAULT_PARAMS, type Params, makeFormulas, paramsDiff } from "./parametric";
import { OUT_DIR } from "./supply";
import { type CellStats, runCell, scenario } from "./scenario";

export interface Targets {
  /** First level each tier is meant for; the last tier ends at `endLevel`. */
  bands: number[];
  endLevel: number;
  /** Share of the party's health lost per fight at the first level of a tier's band, by tier. */
  entry: number[];
  /** The same at the end of the band (the first level of the next tier). */
  exit: number[];
  /** Heroes who may die per fight inside the band, by tier (more than that is penalised). */
  deaths: number[];
  /** Up to this level and in tiers 1 and 2, deaths must stay under `earlyDeaths` (the new player must not lose a hero in every other fight). */
  earlyLevel: number;
  earlyDeaths: number;
  /** Share of the fights inside a band the party has to win (a lost fight is a wipe: heroes who fall have to be raised, the party may be sent back to the inn). */
  minWin: number;
  /** Ratio of hit points lost without bows to with bows allowed (ranged is strong, but not too strong). */
  bowRatio: [number, number];
}

/**
 * Tiers 1 and 2 are warm-up tiers: their monsters are weak by their own numbers, so any monotone party is past them after a few levels and
 * they are only asked to stay a little costly. From tier 3 on a fight costs about two fifths of the party's health when the tier begins and
 * about an eighth when the next tier takes over. The bands are the levels at which clearing half of every lower tier brings the party under
 * the smooth XP table (docs/KAMPF_BALANCE.md).
 */
export const DEFAULT_TARGETS: Targets = {
  bands: [1, 5, 11, 19, 33],
  endLevel: 55,
  entry: [0.2, 0.1, 0.4, 0.4, 0.4],
  exit: [0.03, 0.04, 0.12, 0.12, 0.1],
  deaths: [0.1, 0.1, 0.2, 0.2, 0.25],
  earlyLevel: 4,
  earlyDeaths: 0.1,
  minWin: 0.9,
  bowRatio: [1.15, 1.6],
};

const LEVELS = [...Array.from({ length: 12 }, (_, i) => i + 1), 14, 16, 18, 20, 22, 24, 27, 30, 33, 36, 39, 42, 45, 48, 52, 55, 58];
/** Parties and their weight. Index into PARTIES. */
const PARTY_WEIGHTS: [number, number][] = [
  [0, 1],
  [1, 1],
  [3, 1],
  [4, 0.7],
  [2, 0.5],
];

const bandWidth = (t: Targets, tier: number): number => Math.max(2, (t.bands[tier] ?? t.endLevel) - t.bands[tier - 1]!);

/** Target hit point loss of a fight at `level` against groups of `tier`: geometric from the band's entry value to its exit value, steeper below the band. */
export function targetLoss(t: Targets, level: number, tier: number): number {
  const o = level - t.bands[tier - 1]!;
  const w = bandWidth(t, tier);
  const entry = t.entry[tier - 1]!;
  const exit = t.exit[tier - 1]!;
  return Math.min(0.9, Math.max(0.004, entry * (exit / entry) ** (o / w)));
}

/** The levels a tier is judged on: its band and three levels either side. */
export function judgedLevels(t: Targets, tier: number): number[] {
  const lo = t.bands[tier - 1]! - 3;
  const hi = (t.bands[tier] ?? t.endLevel) + 3;
  return LEVELS.filter((l) => l >= lo && l <= hi);
}

const NO_BOWS: FightEnv = { ...DEFAULT_ENV, openingVolley: false, rangedInMelee: false };

export interface Evaluation {
  score: number;
  /** Penalty for results that swing too much with the equipment or the attribute growth. */
  robust: number;
  /** Mean squared log error of the hit point loss, per party (index as PARTY_WEIGHTS). */
  loss: number;
  deaths: number;
  bows: number;
  cells: { party: string; level: number; tier: number; target: number; got: CellStats }[];
}

export function evaluate(F: Formulas, t: Targets, runs: number, keepCells = false, tiers = [1, 2, 3, 4, 5]): Evaluation {
  let loss = 0;
  let deaths = 0;
  let bows = 0;
  let robust = 0;
  let wsum = 0;
  let bowCells = 0;
  let robustCells = 0;
  const cells: Evaluation["cells"] = [];
  for (const tier of tiers) {
    const start = t.bands[tier - 1]!;
    const end = t.bands[tier] ?? t.endLevel;
    for (const level of judgedLevels(t, tier)) {
      const target = targetLoss(t, level, tier);
      const inBand = level >= start && level < end;
      for (const [pi, w] of PARTY_WEIGHTS) {
        const party = PARTIES[pi]!;
        const got = runCell(scenario({ party, level, tier, runs, F, seed: "opt" })).fresh;
        const e = Math.log(got.hpLostPct + 0.03) - Math.log(target + 0.03);
        loss += w * e * e;
        wsum += w;
        // inside the band deaths must be rare, and rarer still in the first two tiers (the new player)
        if (inBand) deaths += w * (Math.max(0, got.dead - t.deaths[tier - 1]!) ** 2 * 20 + Math.max(0, t.minWin - got.winRate) ** 2 * 10);
        else if (tier <= 2 && level <= t.earlyLevel) deaths += w * Math.max(0, got.dead - t.earlyDeaths) ** 2 * 20;
        if (keepCells) cells.push({ party: party.name, level, tier, target, got });
        // ranged parity on the standard and the ranged party
        if ((pi === 0 || pi === 3) && inBand && LEVELS.indexOf(level) % 2 === 0) {
          const without = runCell(scenario({ party, level, tier, runs, F, seed: "opt", env: NO_BOWS })).fresh;
          const ratio = (without.hpLostPct + 0.03) / (got.hpLostPct + 0.03);
          const lr = Math.log(ratio);
          if (ratio > t.bowRatio[1]) bows += (lr - Math.log(t.bowRatio[1])) ** 2;
          else if (ratio < t.bowRatio[0]) bows += (Math.log(t.bowRatio[0]) - lr) ** 2;
          bowCells++;
        }
        // robustness: the best equipment must not make a tier trivial, worse equipment or no attribute growth must not break it
        if ((pi === 0 || pi === 3) && inBand && LEVELS.indexOf(level) % 2 === 1) {
          const base = got.hpLostPct + 0.03;
          const best = runCell(scenario({ party, level, tier, runs, F, seed: "opt", gear: gearForTier(tier, true) })).fresh;
          const lag = runCell(scenario({ party, level, tier, runs, F, seed: "opt", gear: gearForTier(Math.max(1, tier - 1)) })).fresh;
          const flat = runCell(scenario({ party, level, tier, runs, F, seed: "opt", growth: GROWTH_NONE })).fresh;
          const rBest = (best.hpLostPct + 0.03) / base;
          if (rBest < 0.35) robust += (Math.log(0.35) - Math.log(rBest)) ** 2;
          const rLag = (lag.hpLostPct + 0.03) / base;
          if (rLag > 3) robust += (Math.log(rLag) - Math.log(3)) ** 2;
          const rFlat = (flat.hpLostPct + 0.03) / base;
          if (rFlat > 3) robust += (Math.log(rFlat) - Math.log(3)) ** 2;
          robustCells++;
        }
      }
    }
  }
  const l = loss / Math.max(1, wsum);
  const d = deaths / Math.max(1, wsum);
  const b = bows / Math.max(1, bowCells);
  const r = robust / Math.max(1, robustCells);
  return { score: l + d + 0.7 * b + 0.5 * r, robust: r, loss: l, deaths: d, bows: b, cells };
}

// ------------------------------------------------------------ the search

type Range = [number, number];
const RANGES: Partial<Record<keyof Params, Range>> = {
  hpScale: [0.6, 1.8],
  hpPow: [0.6, 1.2],
  hpFlat: [0, 40],
  manaScale: [0.6, 1.4],
  mWeapon: [0.4, 1.6],
  mScale: [0.4, 1.6],
  mPow: [0.7, 1.2],
  rWeapon: [0.3, 1.2],
  rScale: [0.2, 1.2],
  rClass: [0.2, 1],
  rArmor: [0.2, 1.2],
  rHit: [0.4, 1.4],
  armorVsHeroes: [0.4, 1.6],
  floorVsHeroes: [0, 0.3],
  armorVsMonsters: [0.3, 1.3],
  floorVsMonsters: [0, 0.5],
  blendVsHeroes: [0, 1],
  blendVsMonsters: [0, 1],
  deathHit: [0.5, 1],
  deathBelow: [0.33, 1],
  specialCap: [0.15, 1],
  lethalScale: [0.1, 1],
};

function gauss(rng: () => number): number {
  return Math.sqrt(-2 * Math.log(rng() + 1e-12)) * Math.cos(2 * Math.PI * rng());
}

function main(): void {
  const [name = "run", itersText = "300", runsText = "24", bandsText, startFile] = process.argv.slice(2);
  const iters = Number(itersText);
  const runs = Number(runsText);
  const targets: Targets = { ...DEFAULT_TARGETS, bands: bandsText ? bandsText.split(",").map(Number) : DEFAULT_TARGETS.bands };
  mkdirSync(OUT_DIR, { recursive: true });
  const file = join(OUT_DIR, `search-${name}.json`);
  let best: Params = { ...DEFAULT_PARAMS };
  if (startFile && existsSync(startFile)) best = { ...DEFAULT_PARAMS, ...(JSON.parse(readFileSync(startFile, "utf8")).params as Partial<Params>) };
  else if (existsSync(file)) best = { ...DEFAULT_PARAMS, ...(JSON.parse(readFileSync(file, "utf8")).params as Partial<Params>) };
  // FREEZE="mPow=1,hpPow=1" fixes parameters at a value and leaves them out of the search
  const frozen = new Set<string>();
  for (const part of (process.env.FREEZE ?? "").split(",").filter(Boolean)) {
    const [k, v] = part.split("=");
    (best as unknown as Record<string, number>)[k!] = Number(v);
    frozen.add(k!);
  }
  const keys = (Object.keys(RANGES) as (keyof Params)[]).filter((k) => !frozen.has(k));
  let seed = Number(process.env.SEED ?? 12345);
  const rnd = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  let bestEval = evaluate(makeFormulas(best, "cand", ""), targets, runs);
  console.log(`start: score ${bestEval.score.toFixed(4)} (loss ${bestEval.loss.toFixed(3)}, deaths ${bestEval.deaths.toFixed(3)}, bows ${bestEval.bows.toFixed(3)}, robust ${bestEval.robust.toFixed(3)})  ${paramsDiff(best)}`);
  let sigma = 0.25;
  for (let it = 1; it <= iters; it++) {
    const cand: Params = { ...best };
    const n = 1 + Math.floor(rnd() * 3);
    for (let j = 0; j < n; j++) {
      const k = keys[Math.floor(rnd() * keys.length)]!;
      const [lo, hi] = RANGES[k]!;
      cand[k] = Math.min(hi, Math.max(lo, cand[k] + gauss(rnd) * sigma * (hi - lo)));
    }
    const ev = evaluate(makeFormulas(cand, "cand", ""), targets, runs);
    if (ev.score < bestEval.score) {
      best = cand;
      bestEval = ev;
      writeFileSync(file, JSON.stringify({ params: best, score: ev.score, loss: ev.loss, deaths: ev.deaths, bows: ev.bows, robust: ev.robust, targets }, null, 1));
      console.log(`#${it} score ${ev.score.toFixed(4)} (loss ${ev.loss.toFixed(3)}, deaths ${ev.deaths.toFixed(3)}, bows ${ev.bows.toFixed(3)}, robust ${ev.robust.toFixed(3)})  ${paramsDiff(best)}`);
    }
    if (it % 40 === 0) sigma = Math.max(0.03, sigma * 0.85);
  }
  console.log(`done. best: ${paramsDiff(best)}`);
}

if (process.argv[1]?.endsWith("search.ts")) main();
