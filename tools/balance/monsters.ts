/**
 * Every monster on its own: a party of a level meets two of the same kind, and the table says how dangerous each one is (win rate, deaths, hit point
 * loss, rounds). Finds the monsters that dominate the deaths of a tier. Usage: tsx tools/balance/monsters.ts [formulas=current] [level=36] [tier=5] [count=2] [runs=100]
 */
import { MONSTERS } from "../../src/data/tables";
import { PARTIES } from "./hero";
import { formulasByName } from "./proposals";
import { runCell, scenario } from "./scenario";

const [fname = "current", levelText = "36", tierText = "5", countText = "2", runsText = "100"] = process.argv.slice(2);
const F = formulasByName(fname);
const level = Number(levelText);
const tier = Number(tierText);
const count = Number(countText);
const runs = Number(runsText);

const rows = Object.values(MONSTERS)
  .filter((m) => m.id < 1000 && m.treasure_level === tier && m.terrain === "land")
  .map((m) => {
    const c = runCell(scenario({ party: PARTIES[0]!, level, tier, runs, F, monster: m, groupSize: count, seed: "mon" })).fresh;
    return { m, c };
  })
  .sort((a, b) => b.c.dead - a.c.dead);

console.log(`${F.id}: Standardgruppe Stufe ${level} gegen ${count} gleiche Monster der Klasse ${tier}`);
console.log("Monster               HP    Rues  Schaden x Angr.  Tempo  Sonder                      Sieg   Tote  HP-Verl  Runden");
for (const { m, c } of rows) {
  console.log(`${m.name.padEnd(20)} ${String(m.health).padStart(5)} ${String(m.armor).padStart(5)}  ${`${m.damage_min}-${m.damage_max} x ${m.no_of_attacks}`.padEnd(14)} ${String(m.speed).padStart(5)}  ${(m.special_abilties ?? "").slice(0, 26).padEnd(26)} ${`${Math.round(c.winRate * 100)}%`.padStart(5)} ${c.dead.toFixed(2).padStart(6)} ${`${Math.round(c.hpLostPct * 100)}%`.padStart(7)} ${c.rounds.toFixed(1).padStart(7)}`);
}
