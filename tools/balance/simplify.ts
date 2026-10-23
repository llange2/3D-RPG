/**
 * Makes the result of a search readable: first every parameter is tried at the game's own value (a term that does not pay for itself goes), then
 * the rest are rounded to the coarsest value that costs at most a little in score. Writes out/search-<name>-simple.json.
 * Usage: tsx tools/balance/simplify.ts <search-name> [runs=48] [tolerance=0.012]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_PARAMS, type Params, makeFormulas, paramsDiff } from "./parametric";
import { DEFAULT_TARGETS, evaluate } from "./search";
import { OUT_DIR } from "./supply";

const [name = "c2", runsText = "48", tolText = "0.012"] = process.argv.slice(2);
const runs = Number(runsText);
const tol = Number(tolText);
const file = join(OUT_DIR, `search-${name}.json`);
if (!existsSync(file)) throw new Error(`no search result ${file}`);
const start = { ...DEFAULT_PARAMS, ...(JSON.parse(readFileSync(file, "utf8")).params as Partial<Params>) };
const score = (p: Params): number => evaluate(makeFormulas(p, "cand", ""), DEFAULT_TARGETS, runs).score;

let best = { ...start };
let bestScore = score(best);
console.log(`Start ${bestScore.toFixed(4)}: ${paramsDiff(best)}`);
const baseScore = bestScore;

// pass 1: back to the game's value (in the order of how little they should matter)
const RESETS: (keyof Params)[] = ["specialCap", "blendVsHeroes", "blendVsMonsters", "floorVsHeroes", "hpPow", "mPow", "manaScale", "rHit", "deathBelow", "deathHit", "rAcc", "mStr"];
for (const k of RESETS) {
  if (Math.abs(best[k] - DEFAULT_PARAMS[k]) < 1e-9) continue;
  const cand = { ...best, [k]: DEFAULT_PARAMS[k] };
  const s = score(cand);
  const keep = s <= bestScore + tol;
  console.log(`  ${k} -> ${DEFAULT_PARAMS[k]}: ${s.toFixed(4)} ${keep ? "uebernommen" : "behalten (" + Number(best[k].toFixed(3)) + ")"}`);
  if (keep) {
    best = cand;
    bestScore = Math.min(bestScore, s);
  }
}

// pass 2: round, coarsest first
const STEPS: Partial<Record<keyof Params, number[]>> = {
  hpFlat: [10, 5, 1],
  hpScale: [0.5, 0.25, 0.1],
  manaScale: [0.5, 0.25, 0.1],
  mWeapon: [0.5, 0.25, 0.1],
  mScale: [0.5, 0.25, 0.1],
  mPow: [0.25, 0.1, 0.05],
  rWeapon: [0.5, 0.25, 0.1],
  rScale: [0.5, 0.25, 0.1],
  rClass: [0.5, 0.25, 0.1],
  rArmor: [0.5, 0.25, 0.1],
  rHit: [0.25, 0.1],
  armorVsHeroes: [0.5, 0.25, 0.1],
  armorVsMonsters: [0.5, 0.25, 0.1],
  floorVsMonsters: [0.25, 0.1, 0.05],
  floorVsHeroes: [0.1, 0.05],
  deathHit: [0.25, 0.1, 0.05],
  deathBelow: [0.25, 0.1, 0.05],
};
for (const k of Object.keys(STEPS) as (keyof Params)[]) {
  for (const step of STEPS[k]!) {
    const value = Math.round(best[k] / step) * step;
    if (Math.abs(value - best[k]) < 1e-9) break;
    const cand = { ...best, [k]: Number(value.toFixed(4)) };
    const s = score(cand);
    if (s <= bestScore + tol) {
      console.log(`  ${k} ${Number(best[k].toFixed(3))} -> ${cand[k]} (Schritt ${step}): ${s.toFixed(4)}`);
      best = cand;
      bestScore = Math.min(bestScore, s);
      break;
    }
  }
}
const final = score(best);
console.log(`\nErgebnis ${final.toFixed(4)} (Start ${baseScore.toFixed(4)}): ${paramsDiff(best)}`);
writeFileSync(join(OUT_DIR, `search-${name}-simple.json`), JSON.stringify({ params: best, score: final, from: name }, null, 1));
