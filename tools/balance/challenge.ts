/**
 * How even is the challenge? A party meets the monsters of a tier at the level the XP curve gives it there, and the loss of hit points
 * (and the dead) per fight is compared across tiers: weak party against weak monsters should cost about as much as strong party against strong
 * monsters (it may rise a little with the tier).
 *
 * Usage: tsx tools/balance/challenge.ts [--formulas=current,v4] [--runs=150] [--share=0.5] [--parties=0,1,3,4,2] [--groups=class|world|pool]
 *                                       [--path=xp|bands] [--gear=typical|best] [--mascot=none|Wolf|Fairy|Orb] [--iso=0.12,0.25,0.4]
 *   path=xp    levels from the XP table: a party that cleared `share` of every tier below meets tier t at the entry level, tier t+1 at the exit level
 *   path=bands the fixed design bands of docs/KAMPF_BALANCE.md (1, 5, 11, 19, 33; end 50)
 * Output: per tier, four levels from entry to exit with the hit point loss, the dead per fight and the win rate (mean over the parties),
 * then the "iso levels": the lowest level at which a tier costs no more than x of the hit points (the same tier-to-tier spacing as the XP curve = even challenge).
 */
import { envFrom, formulasFrom, groupsFrom, growthFrom, nums } from "./cli";
import { DEFAULT_ENV } from "./fight";
import { gearForTier, PARTIES } from "./hero";
import { type CellStats, runCell, scenario } from "./scenario";
import { meanSupply, partyLevel } from "./xpcurve";
import { type Formulas } from "./formulas";

const pct = (x: number): string => `${Math.round(x * 100)}%`.padStart(4);

export interface Mean {
  loss: number;
  dead: number;
  win: number;
  down: number;
}

/** Mean of a cell over several parties. */
export function cellMean(F: Formulas, level: number, tier: number, partyIdx: number[], a: Record<string, string>): Mean {
  const env = { ...DEFAULT_ENV, ...envFrom(a) };
  const growth = growthFrom(a);
  const best = a.gear === "best";
  const runs = Number(a.runs ?? 150);
  const rows: CellStats[] = partyIdx.map((i) => runCell(scenario({ party: PARTIES[i]!, level, tier, runs, env, growth, F, gear: gearForTier(tier, best), groups: groupsFrom(a), seed: "challenge" })).fresh);
  const n = rows.length;
  return {
    loss: rows.reduce((s, r) => s + r.hpLostPct, 0) / n,
    dead: rows.reduce((s, r) => s + r.dead, 0) / n,
    win: rows.reduce((s, r) => s + r.winRate, 0) / n,
    down: rows.reduce((s, r) => s + r.down, 0) / n,
  };
}

/** Entry levels of the five tiers and the exit level of tier 5. */
export function pathLevels(F: Formulas, a: Record<string, string>): number[] {
  if (a.path === "bands") return [1, 5, 11, 19, 33, 50];
  const share = Number(a.share ?? 0.5);
  const s = meanSupply();
  const out = [1];
  let cum = 0;
  for (let t = 1; t <= 5; t++) {
    cum += s.xp[t]!;
    out.push(Math.round(partyLevel(F, cum * share)));
  }
  return out;
}

/** Like `args()` of the CLI, but every argument is an option (the CLI takes the first one as the command). */
function options(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const arg of process.argv.slice(2)) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(arg);
    if (m) out[m[1]!] = m[2] ?? "true";
  }
  return out;
}

function main(): void {
  const a = options();
  const names = (a.formulas ?? "current,v4").split(",");
  const partyIdx = nums(a.parties, [0, 1, 3, 4, 2]);
  const iso = (a.iso ?? "0.12,0.25,0.4").split(",").map(Number);
  console.log(`Parteien: ${partyIdx.map((i) => PARTIES[i]!.name.split(" (")[0]).join(", ")}; Gegner: ${a.groups ?? "class"}; Ausruestung: ${a.gear ?? "typical"}; Maskottchen: ${a.mascot ?? "none"}; ${a.runs ?? 150} Laeufe je Zelle`);
  for (const name of names) {
    const F = formulasFrom(name);
    // the levels come from the XP table of `--pathxp` (default v4), not from the formula set under test: the path is the same for every set
    const levels = pathLevels(formulasFrom(a.pathxp ?? "v4"), a);
    console.log(`\n=== ${F.id}: ${F.title}`);
    console.log(`Pfad ${a.path ?? "xp"}: Eintrittsstufen der Tiers ${levels.slice(0, 5).join(" / ")}, Ende ${levels[5]}`);
    console.log("Tier | Stufe:  HP-Verlust  Tote  Sieg    (vier Stufen vom Eintritt bis zum Austritt)");
    const entryLoss: number[] = [];
    for (let t = 1; t <= 5; t++) {
      const lo = levels[t - 1]!;
      const hi = Math.max(lo, levels[t]! - (t < 5 ? 0 : 0));
      const picks = [...new Set([0, 1 / 3, 2 / 3, 1].map((f) => Math.round(lo + (hi - lo) * f)))];
      const cells = picks.map((level) => {
        const m = cellMean(F, level, t, partyIdx, a);
        return { level, m };
      });
      entryLoss.push(cells[0]!.m.loss);
      console.log(` T${t}  | ` + cells.map((c) => `L${String(c.level).padStart(2)}: ${pct(c.m.loss)} ${c.m.dead.toFixed(2)} ${pct(c.m.win)}`).join("  |  "));
    }
    if (a.perparty) {
      console.log("\nJe Gruppe am Eintritt der Tiers (HP-Verlust, Tote je Kampf):");
      for (const i of partyIdx) {
        const row = [1, 2, 3, 4, 5].map((t) => {
          const m = cellMean(F, levels[t - 1]!, t, [i], a);
          return `T${t}/L${levels[t - 1]}: ${pct(m.loss)} ${m.dead.toFixed(2)}`.padEnd(18);
        });
        console.log(`  ${PARTIES[i]!.name.split(" (")[0]!.padEnd(10)} ${row.join(" ")}`);
      }
    }
    // iso levels: lowest level where the mean loss is at most x, for each tier
    console.log("\nIso-Stufe: niedrigste Stufe, ab der ein Kampf im Tier hoechstens x der Lebenspunkte kostet (und die Gruppe < 0,15 Tote je Kampf verliert)");
    console.log("Tier | " + iso.map((x) => pct(x).padStart(8)).join(" ") + "  | Eintritt (Pfad)");
    for (let t = 1; t <= 5; t++) {
      const found = iso.map((x) => {
        for (let level = 1; level <= 90; level += level < 20 ? 1 : 2) {
          const m = cellMean(F, level, t, partyIdx, { ...a, runs: String(Math.max(60, Math.round(Number(a.runs ?? 150) / 2))) });
          if (m.loss <= x && m.dead < 0.15) return level;
        }
        return NaN;
      });
      console.log(` T${t}  | ` + found.map((l) => (Number.isNaN(l) ? ">90" : `L${l}`).padStart(8)).join(" ") + `  | L${levels[t - 1]}`);
    }
  }
}

if (process.argv[1]?.endsWith("challenge.ts")) main();
