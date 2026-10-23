/**
 * Fits a smooth XP step curve to the content of the worlds, with the monsters' XP left as it is: the number of fights a level costs should follow a
 * schedule (f0 fights at level 1, rising to f1 at level 10 and staying there), whatever tier the level is meant for.
 * The curve family is  step(L) = base * s * g1^(min(L, k) - 1) * g2^(max(0, L - k))  (base = the class's XP base / 1500).
 * Usage: tsx tools/balance/xpfit.ts [f0=8] [f1=12] [bands=1,5,11,19,33] [maxLevel=55]
 */
import { CONSTANTS } from "../../src/data/tables";
import { fightsPerLevel, xpPerGroup } from "./xpcurve";
import { CURRENT, type Formulas } from "./formulas";
import { PARTIES } from "./hero";

export interface Curve {
  s: number;
  g1: number;
  k: number;
  g2: number;
}
/** Party-mean XP step of a level on a curve (s is the XP of the first level for a class base of 1500). */
export const stepOf = (c: Curve, level: number): number => c.s * c.g1 ** (Math.min(level, c.k) - 1) * c.g2 ** Math.max(0, level - c.k);

export function fitCurve(f0: number, f1: number, bands: number[], maxLevel: number): { c: Curve; err: number } {
  const xg = xpPerGroup();
  const party = PARTIES[0]!;
  const baseMean = party.members.reduce((s, m) => s + (CONSTANTS.CHARACTER_XP[m.cls] ?? 2000), 0) / party.members.length;
  const tierOf = (l: number) => Math.max(1, bands.filter((b) => b <= l).length);
  const want = (l: number) => f0 + (f1 - f0) * Math.min(1, (l - 1) / 9);
  let best: { c: Curve; err: number } | null = null;
  for (let k = 4; k <= 30; k++) {
    for (let g1 = 1.05; g1 <= 1.6; g1 += 0.01) {
      for (let g2 = 1.04; g2 <= 1.16; g2 += 0.005) {
        const c: Curve = { s: 1, g1, k, g2 };
        // s so that the log mean of fights equals the log mean of the schedule
        let sumLog = 0;
        for (let l = 1; l <= maxLevel; l++) sumLog += Math.log((want(l) * xg[tierOf(l)]!) / ((stepOf(c, l) * baseMean) / 1500));
        c.s = Math.exp(sumLog / maxLevel);
        let e = 0;
        for (let l = 1; l <= maxLevel; l++) e += (Math.log((stepOf(c, l) * baseMean) / 1500 / xg[tierOf(l)]!) - Math.log(want(l))) ** 2;
        e /= maxLevel;
        if (!best || e < best.err) best = { c: { ...c }, err: e };
      }
    }
  }
  return best!;
}

export function curveFormulas(c: Curve, id: string, title: string): Formulas {
  return { ...CURRENT, id, title, xpStep: (cls, l) => (stepOf(c, l) * (CONSTANTS.CHARACTER_XP[cls] ?? 2000)) / 1500 };
}

function main(): void {
  const f0 = Number(process.argv[2] ?? 8);
  const f1 = Number(process.argv[3] ?? 12);
  const bands = (process.argv[4] ?? "1,5,11,19,33").split(",").map(Number);
  const maxLevel = Number(process.argv[5] ?? 50);
  const r = fitCurve(f0, f1, bands, maxLevel);
  const F = curveFormulas(r.c, "fit", "fitted curve");
  console.log(`Kurve: Stufe-1-Schritt (Basis 1500) ${Math.round(r.c.s)}, +${((r.c.g1 - 1) * 100).toFixed(0)} % je Stufe bis Stufe ${r.c.k}, danach +${((r.c.g2 - 1) * 100).toFixed(1)} %; Abweichung ${r.err.toFixed(3)}`);
  const fl = fightsPerLevel(F, bands, PARTIES[0]!, maxLevel, xpPerGroup());
  console.log("Kaempfe je Stufe: " + [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 18, 20, 25, 30, 35, 40, 45, 50].filter((l) => l <= maxLevel).map((l) => "L" + l + ":" + fl[l - 1]!.fights.toFixed(0)).join(" "));
  console.log("Schritt (Basis 1500): " + [1, 2, 3, 5, 8, 10, 12, 15, 20, 25, 30, 40, 50].filter((l) => l <= maxLevel).map((l) => "L" + l + ":" + Math.round(stepOf(r.c, l))).join(" "));
}

if (process.argv[1]?.endsWith("xpfit.ts")) main();
