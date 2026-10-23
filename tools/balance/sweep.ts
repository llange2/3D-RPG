/**
 * Wide sweep: every line-up of four classes (715), at chosen levels, tiers and mascots. Writes a CSV and prints how far apart the
 * line-ups are and which are the best and the worst.
 * Usage: tsx tools/balance/sweep.ts [formulas=current] [levels=3,10,20,35] [mascots=none,Wolf] [runs=12] [bands=1,5,11,19,33]
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { tierOf } from "./cli";
import { formulasFrom } from "./cli";
import { DEFAULT_ENV } from "./fight";
import { type Mascot } from "./formulas";
import { allClassMultisets, defaultSpec } from "./hero";
import { OUT_DIR } from "./supply";
import { runCell, scenario } from "./scenario";

const [fname = "current", levelsText = "3,10,20,35", mascotsText = "none,Wolf", runsText = "12", bandsText = "1,5,11,19,33"] = process.argv.slice(2);
const F = formulasFrom(fname);
const levels = levelsText.split(",").map(Number);
const mascots = mascotsText.split(",") as Mascot[];
const runs = Number(runsText);
const bands = bandsText.split(",").map(Number);

interface Row {
  classes: string;
  level: number;
  tier: number;
  mascot: string;
  win: number;
  dead: number;
  hp: number;
  rounds: number;
  ranged: number;
  spell: number;
}
const rows: Row[] = [];
const t0 = Date.now();
for (const classes of allClassMultisets()) {
  const party = { name: classes.join("+"), members: classes.map(defaultSpec) };
  for (const level of levels) {
    const tier = tierOf(level, bands);
    for (const mascot of mascots) {
      const { fresh } = runCell(scenario({ party, level, tier, runs, F, env: { ...DEFAULT_ENV, mascot }, seed: "sweep" }));
      rows.push({ classes: party.name, level, tier, mascot, win: fresh.winRate, dead: fresh.dead, hp: fresh.hpLostPct, rounds: fresh.rounds, ranged: fresh.shareRanged, spell: fresh.shareSpell });
    }
  }
}
const file = join(OUT_DIR, `sweep-${F.id}.csv`);
writeFileSync(file, "classes,level,tier,mascot,win,dead,hpLoss,rounds,shareRanged,shareSpell\n" + rows.map((r) => [r.classes, r.level, r.tier, r.mascot, r.win.toFixed(3), r.dead.toFixed(3), r.hp.toFixed(3), r.rounds.toFixed(2), r.ranged.toFixed(3), r.spell.toFixed(3)].join(",")).join("\n"));
console.log(`${rows.length} cells in ${((Date.now() - t0) / 1000).toFixed(0)} s -> ${file}`);

for (const level of levels) {
  for (const mascot of mascots) {
    const set = rows.filter((r) => r.level === level && r.mascot === mascot).sort((a, b) => a.hp - b.hp);
    const mean = set.reduce((s, r) => s + r.hp, 0) / set.length;
    const q = (p: number) => set[Math.floor(p * (set.length - 1))]!.hp;
    console.log(`L${level} tier ${set[0]!.tier} ${mascot.padEnd(5)}: HP-Verlust Mittel ${(mean * 100).toFixed(0)}%  10%-Quantil ${(q(0.1) * 100).toFixed(0)}%  Median ${(q(0.5) * 100).toFixed(0)}%  90% ${(q(0.9) * 100).toFixed(0)}%  | leichteste: ${set[0]!.classes} (${(set[0]!.hp * 100).toFixed(0)}%)  schwerste: ${set[set.length - 1]!.classes} (${(set[set.length - 1]!.hp * 100).toFixed(0)}%)`);
  }
}

/** Ridge regression: how much each class in the line-up moves the (log) hit point loss, relative to the average class. */
function classEffects(set: Row[]): Map<string, number> {
  const names = ["Knight", "Paladin", "Barbarian", "Ninja", "Thief", "Ranger", "Archer", "Cleric", "Druid", "Wizard"];
  const n = names.length;
  const xtx = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const xty = new Array<number>(n).fill(0);
  for (const r of set) {
    const x = names.map((c) => r.classes.split("+").filter((k) => k === c).length);
    const y = Math.log(r.hp + 0.03);
    for (let i = 0; i < n; i++) {
      xty[i]! += x[i]! * y;
      for (let j = 0; j < n; j++) xtx[i]![j]! += x[i]! * x[j]!;
    }
  }
  for (let i = 0; i < n; i++) xtx[i]![i]! += 0.5;
  const a = xtx.map((row, i) => [...row, xty[i]!]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r]![c]!) > Math.abs(a[p]![c]!)) p = r;
    [a[c], a[p]] = [a[p]!, a[c]!];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = a[r]![c]! / a[c]![c]!;
      for (let k = c; k <= n; k++) a[r]![k]! -= f * a[c]![k]!;
    }
  }
  const beta = a.map((row, i) => row[n]! / row[i]!);
  const mean = beta.reduce((s, b) => s + b, 0) / n;
  return new Map(names.map((c, i) => [c, Math.exp(beta[i]! - mean)]));
}

console.log("\nEinfluss einer Klasse in der Gruppe auf den HP-Verlust (Faktor gegenueber dem Klassenmittel; unter 1 = leichter):");
for (const level of levels) {
  const fx = classEffects(rows.filter((r) => r.level === level && r.mascot === mascots[0]));
  console.log("L" + level + ": " + [...fx.entries()].map(([c, f]) => c + " " + f.toFixed(2)).join("  "));
}
