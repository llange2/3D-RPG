/**
 * Which monster classes (`treasure_level`) the generator really puts into the places of each tier, from the three cached example worlds.
 * Usage: tsx tools/balance/worldmix.ts
 */
import { MONSTERS } from "../../src/data/tables";
import { measureSupply } from "./supply";

const rows: Record<number, { wild: number[]; inside: number[]; groupSize: number[] }> = {};
for (let t = 1; t <= 5; t++) rows[t] = { wild: [0, 0, 0, 0, 0, 0], inside: [0, 0, 0, 0, 0, 0], groupSize: [] };
for (const seed of ["alpha", "beta", "gamma"]) {
  for (const g of measureSupply(seed, "default").groups) {
    const r = rows[g.tier];
    if (!r) continue;
    r.groupSize.push(g.ids.length);
    for (const id of g.ids) (g.inside ? r.inside : r.wild)[MONSTERS[id]!.treasure_level]!++;
  }
}
const share = (v: number[]): string => {
  const sum = v.reduce((a, b) => a + b, 0) || 1;
  return [1, 2, 3, 4, 5].map((c) => `C${c} ${String(Math.round((v[c]! / sum) * 100)).padStart(3)}%`).join("  ");
};
console.log("Anteil der Monsterklassen je Tier des Ortes (Mittel ueber alpha/beta/gamma)");
for (let t = 1; t <= 5; t++) {
  const r = rows[t]!;
  const n = r.groupSize.length || 1;
  console.log(`T${t} innen : ${share(r.inside)}\n   aussen: ${share(r.wild)}   (Gruppen ${n}, Mittel ${(r.groupSize.reduce((a, b) => a + b, 0) / n).toFixed(1)} Monster)`);
}
