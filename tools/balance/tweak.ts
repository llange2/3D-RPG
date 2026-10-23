/**
 * Scores a base parameter set and variants of it, to see what a rounded value costs.
 * Usage: tsx tools/balance/tweak.ts <base: v3 | search name> [runs=48] "hpFlat=20,hpScale=1" "rHit=1.05" ...
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_PARAMS, type Params, makeFormulas } from "./parametric";
import { V3_PARAMS } from "./proposals";
import { DEFAULT_TARGETS, evaluate } from "./search";
import { OUT_DIR } from "./supply";

const [baseName = "v3", runsText = "48", ...variants] = process.argv.slice(2);
const runs = Number(runsText);
let base: Params = V3_PARAMS;
if (baseName !== "v3") {
  const file = join(OUT_DIR, `search-${baseName}.json`);
  if (!existsSync(file)) throw new Error(`no ${file}`);
  base = { ...DEFAULT_PARAMS, ...(JSON.parse(readFileSync(file, "utf8")).params as Partial<Params>) };
}
const run = (label: string, p: Params): void => {
  const e = evaluate(makeFormulas(p, "t", ""), DEFAULT_TARGETS, runs);
  console.log(`${label.padEnd(60)} score ${e.score.toFixed(3)}  loss ${e.loss.toFixed(3)}  deaths ${e.deaths.toFixed(3)}  bows ${e.bows.toFixed(3)}  robust ${e.robust.toFixed(3)}`);
};
run("base", base);
for (const v of variants) {
  const p = { ...base };
  for (const part of v.split(",")) {
    const [k, val] = part.split("=");
    (p as unknown as Record<string, number>)[k!] = Number(val);
  }
  run(v, p);
}
