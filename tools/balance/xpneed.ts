/**
 * XP a party needs to stand on given levels (mean over the classes of the standard party) against what the world holds below each tier.
 * Usage: tsx tools/balance/xpneed.ts [formulas=v4] [levels=1,7,10,24,42]    (the levels are the entry levels of tiers 1 to 5)
 */
import { formulasFrom } from "./cli";
import { xpForLevel } from "./formulas";
import { PARTIES } from "./hero";
import { meanSupply } from "./xpcurve";

const F = formulasFrom(process.argv[2] ?? "v4");
const levels = (process.argv[3] ?? "1,7,10,24,42").split(",").map(Number);
const s = meanSupply();
const party = PARTIES[0]!;
let cum = 0;
console.log(`${F.id}: Tier | Eintrittsstufe | XP dafuer (Mittel der Helden) | XP der Welt unter dem Tier | davon noetig`);
for (let t = 1; t <= 5; t++) {
  const need = party.members.reduce((a, m) => a + xpForLevel(F, m.cls, levels[t - 1]!), 0) / party.members.length;
  console.log(`  T${t} | L${levels[t - 1]} | ${Math.round(need / 1000)}k | ${Math.round(cum / 1000)}k | ${cum > 0 ? Math.round((need / cum) * 100) + " %" : "-"}`);
  cum += s.xp[t]!;
}
