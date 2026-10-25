/**
 * Bow against sword over the whole game: for each formula set and (tier:level) cell, the mean over the named parties of
 *   bow   hit points lost when the party plays as a player would (volleys while they walk up, the best action every turn)
 *   sword hit points lost when nobody uses the bow (no volley, no shot at a monster that is next to the party); spells stay on
 *   share the part of the party's damage that comes from the bow (play "bow")
 *   enemy the part of the party's hit points that shots from afar took (play "bow")
 * A balanced bow makes "bow" cheaper than "sword" by a moderate factor (it is a good opening, not a win button), and the bow's share of the damage
 * stays below about half. Monster shots are a real part of the loss only if "enemy" is clearly above zero where ranged monsters exist.
 *
 * Usage: tsx tools/balance/bowgrid.ts [--formulas=v4;v5:bowRes=1] [--cells=1:1,1:4,2:8,...] [--parties=0,1,3,4,2] [--runs=120] [--rshots=one|half|two|all]
 *                                     [--only-ranged | --only-melee] [--type=physical|fire|ice|acid|magic|poison]   (two of each ranged / each melee monster of the tier, one kind at a time: how hard do the shooters hit?)
 */
import { envFrom, groupsFrom, growthFrom, nums } from "./cli";
import { DEFAULT_ENV, type FightEnv } from "./fight";
import { gearForTier, PARTIES } from "./hero";
import { formulasByName } from "./proposals";
import { type CellStats, runCell, scenario } from "./scenario";
import { MONSTERS } from "../../src/data/tables";

function options(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const arg of process.argv.slice(2)) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(arg);
    if (m) out[m[1]!] = m[2] ?? "true";
  }
  return out;
}

const pct = (x: number): string => `${Math.round(x * 100)}%`.padStart(4);
const mean = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);

function main(): void {
  const a = options();
  const sets = (a.formulas ?? "v4").split(";");
  const cells = (a.cells ?? "1:1,1:4,2:8,2:12,3:15,3:20,4:25,4:30,5:38,5:45").split(",").map((c) => c.split(":").map(Number) as [number, number]);
  const parties = nums(a.parties, [0, 1, 3, 4, 2]);
  const runs = Number(a.runs ?? 120);
  const base: FightEnv = { ...DEFAULT_ENV, ...envFrom(a) };
  const swordEnv: FightEnv = { ...base, openingVolley: false, rangedInMelee: false };
  console.log(`Parties: ${parties.map((i) => PARTIES[i]!.name.split(" (")[0]).join(", ")}; ${runs} runs per cell and party; ranged monsters fire ${base.rangedShots} shot(s)${a["only-ranged"] ? "; only groups of ranged monsters" : a["only-melee"] ? "; only groups of melee monsters" : ""}`);
  for (const name of sets) {
    const F = formulasByName(name);
    console.log(`\n=== ${name}`);
    console.log("tier/lvl |  bow loss  dead | sword loss  dead | bow/sword | bow share | enemy shots (loss from afar)");
    const totals = { bow: [] as number[], sword: [] as number[], share: [] as number[], enemy: [] as number[], deadBow: [] as number[], deadSword: [] as number[] };
    for (const [tier, level] of cells) {
      const run = (env: FightEnv): CellStats[] =>
        parties.map((i) => {
          const sc = scenario({ party: PARTIES[i]!, level, tier, runs, env, growth: growthFrom(a), F, gear: gearForTier(tier, a.gear === "best"), groups: groupsFrom(a), seed: "bowgrid" });
          if (a["only-ranged"] || a["only-melee"]) {
            // groups of two of each ranged (or each melee) monster of the tier, one kind at a time
            const wantRanged = Boolean(a["only-ranged"]);
            const ranged = Object.values(MONSTERS).filter((m) => m.treasure_level === tier && m.ranged === wantRanged && m.terrain === "land" && m.id < 1000 && (!a.type || m.attack_type.toLowerCase() === a.type));
            if (ranged.length === 0) return runCell({ ...sc, runs: 1 }).fresh;
            const rows = ranged.map((m) => runCell({ ...sc, monster: m, groupSize: 2, runs: Math.max(20, Math.round(runs / 3)) }).fresh);
            const avg = (f: (r: CellStats) => number): number => mean(rows.map(f));
            return { ...rows[0]!, hpLostPct: avg((r) => r.hpLostPct), dead: avg((r) => r.dead), shareRanged: avg((r) => r.shareRanged), rangedLostPct: avg((r) => r.rangedLostPct) };
          }
          return runCell(sc).fresh;
        });
      const bow = run(base);
      const sword = run(swordEnv);
      const b = mean(bow.map((r) => r.hpLostPct));
      const w = mean(sword.map((r) => r.hpLostPct));
      const share = mean(bow.map((r) => r.shareRanged));
      const enemy = mean(bow.map((r) => r.rangedLostPct));
      totals.bow.push(b);
      totals.sword.push(w);
      totals.share.push(share);
      totals.enemy.push(enemy);
      totals.deadBow.push(mean(bow.map((r) => r.dead)));
      totals.deadSword.push(mean(sword.map((r) => r.dead)));
      console.log(
        `  T${tier}/L${String(level).padStart(2)} |   ${pct(b)}   ${mean(bow.map((r) => r.dead)).toFixed(2)} |    ${pct(w)}   ${mean(sword.map((r) => r.dead)).toFixed(2)} |   ${w > 0.005 ? (b / w).toFixed(2) : "  - "}    |   ${pct(share)}    |   ${pct(enemy)}`,
      );
    }
    console.log(`  mean    |   ${pct(mean(totals.bow))}   ${mean(totals.deadBow).toFixed(2)} |    ${pct(mean(totals.sword))}   ${mean(totals.deadSword).toFixed(2)} |   ${(mean(totals.bow) / Math.max(0.001, mean(totals.sword))).toFixed(2)}    |   ${pct(mean(totals.share))}    |   ${pct(mean(totals.enemy))}`);
  }
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("bowgrid.ts")) main();
