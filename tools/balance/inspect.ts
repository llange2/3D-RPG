/**
 * Shows how a result of the search (or a named proposal) meets the targets, cell by cell.
 * Usage: tsx tools/balance/inspect.ts <search-name | proposal-name | current> [runs=60] [bands=1,5,11,19,33]
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { formulasFrom } from "./cli";
import { type Formulas } from "./formulas";
import { DEFAULT_PARAMS, type Params, makeFormulas, paramsDiff } from "./parametric";
import { DEFAULT_TARGETS, evaluate, targetLoss } from "./search";
import { OUT_DIR } from "./supply";

const [name = "current", runsText = "60", bandsText] = process.argv.slice(2);
const runs = Number(runsText);
const targets = { ...DEFAULT_TARGETS, bands: bandsText ? bandsText.split(",").map(Number) : DEFAULT_TARGETS.bands };

let F: Formulas;
const file = join(OUT_DIR, `search-${name}.json`);
if (existsSync(file)) {
  const params = { ...DEFAULT_PARAMS, ...(JSON.parse(readFileSync(file, "utf8")).params as Partial<Params>) };
  console.log(`search result ${name}: ${paramsDiff(params)}`);
  F = makeFormulas(params, name, "search result");
} else F = formulasFrom(name);

const ev = evaluate(F, targets, runs, true);
console.log(`score ${ev.score.toFixed(3)}  loss ${ev.loss.toFixed(3)}  deaths ${ev.deaths.toFixed(3)}  bows ${ev.bows.toFixed(3)}  robust ${ev.robust.toFixed(3)}`);
const pct = (x: number) => `${Math.round(x * 100)}%`.padStart(4);
for (let tier = 1; tier <= 5; tier++) {
  console.log(`\nTier ${tier} (Band ab Stufe ${targets.bands[tier - 1]} bis ${targets.bands[tier] ?? targets.endLevel}):  Stufe: Ziel | Standard Nahk. Fern Klass. Zauber (HP-Verlust, Tote je Kampf)`);
  const levels = [...new Set(ev.cells.filter((c) => c.tier === tier).map((c) => c.level))];
  for (const level of levels) {
    const row = ev.cells.filter((c) => c.tier === tier && c.level === level);
    console.log(`  L${String(level).padStart(2)}: ${pct(targetLoss(targets, level, tier))} | ` + row.map((c) => `${pct(c.got.hpLostPct)} ${c.got.dead.toFixed(2)}`.padEnd(10)).join(" "));
  }
}
