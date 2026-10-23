/**
 * What a mascot is worth: the hit point loss with the mascot divided by the loss without, averaged over cells in the band (the first levels of
 * tiers 3 to 5) and four line-ups. Tries other values for the Wolf's threshold, the Fairy's reduction and the Orb's mana.
 * Usage: tsx tools/balance/mascots.ts [formulas=current] [runs=100]
 */
import { DEFAULT_ENV, type FightEnv } from "./fight";
import { type Formulas, type Mascot } from "./formulas";
import { PARTIES } from "./hero";
import { formulasByName } from "./proposals";
import { runCell, scenario } from "./scenario";

const F0 = formulasByName(process.argv[2]);
const runs = Number(process.argv[3] ?? 100);
const BANDS = [1, 5, 11, 18, 32];
/** Cells: the first level of tiers 3, 4, 5 and a few levels later. */
const CELLS: [number, number][] = [
  [11, 3],
  [14, 3],
  [18, 4],
  [23, 4],
  [32, 5],
  [38, 5],
];

function loss(F: Formulas, mascot: Mascot): { hp: number; dead: number } {
  let hp = 0;
  let dead = 0;
  let n = 0;
  for (const pi of [0, 1, 2, 3]) {
    for (const [level, tier] of CELLS) {
      const env: FightEnv = { ...DEFAULT_ENV, mascot };
      const c = runCell(scenario({ party: PARTIES[pi]!, level, tier, runs, F, env, seed: "mascot" })).fresh;
      hp += c.hpLostPct;
      dead += c.dead;
      n++;
    }
  }
  return { hp: hp / n, dead: dead / n };
}

void BANDS;
const base = loss(F0, "none");
console.log(`Formeln ${F0.id}: ohne Maskottchen HP-Verlust ${(base.hp * 100).toFixed(1)}%, Tote je Kampf ${base.dead.toFixed(2)} (Mittel ueber 6 Zellen x 4 Gruppen)`);
const row = (name: string, F: Formulas, mascot: Mascot): void => {
  const r = loss(F, mascot);
  console.log(`  ${name.padEnd(34)} HP-Verlust ${(r.hp * 100).toFixed(1).padStart(5)}%  (${((r.hp / base.hp - 1) * 100).toFixed(0).padStart(4)}%)   Tote ${r.dead.toFixed(2)}  (${((r.dead / Math.max(0.001, base.dead) - 1) * 100).toFixed(0).padStart(4)}%)`);
};
console.log("Wolf (toetet Monster unter dem Anteil seiner Lebenspunkte):");
for (const below of [0.9, 0.6, 0.4, 0.3, 0.2, 0.1, 0.05]) row(`Schwelle ${Math.round(below * 100)} %`, { ...F0, wolfBelow: below }, "Wolf");
for (const maxTier of [4, 3]) row(`Schwelle 30 %, nicht ueber Tier ${maxTier}`, { ...F0, wolfBelow: 0.3, wolfMaxTier: maxTier }, "Wolf");
console.log("Fee (nimmt jedem Elementartreffer so viel ab):");
for (const red of [10, 20, 40, 80]) row(`${red} Punkte`, { ...F0, fairyReduction: red }, "Fairy");
console.log("Orb (mehr Mana fuer Zauberer):");
for (const orb of [0.2, 0.5, 1.0]) row(`+${Math.round(orb * 100)} % Mana`, { ...F0, orbMana: orb }, "Orb");
