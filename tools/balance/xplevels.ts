/**
 * Total XP a hero needs to reach given levels under the game's current table (v4 `xpStepV4`), and the share of the example worlds' XP that is.
 * Usage: tsx tools/balance/xplevels.ts [levels=10,20,30,40,50,60,70,80]
 */
import { xpStepV4 } from "../../src/sim/balance";
import { meanSupply } from "./xpcurve";

const levels = (process.argv[2] ?? "10,20,30,40,50,60,70,80").split(",").map(Number);
const world = meanSupply().xp.reduce((a, b) => a + b, 0);
console.log(`XP der Beispielwelten zusammen: ${Math.round(world / 1e6)} Mio.`);
for (const base of [1000, 1500, 2000]) {
  let sum = 0;
  const parts: string[] = [];
  for (let l = 1; l < Math.max(...levels); l++) {
    sum += xpStepV4(base, l);
    if (levels.includes(l + 1)) parts.push(`L${l + 1}: ${(sum / 1e6).toFixed(1)} Mio. (${((sum / world) * 100).toFixed(0)} %)`);
  }
  console.log(`Basis ${base}: ${parts.join("  ")}`);
}
