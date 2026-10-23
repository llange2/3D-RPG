/**
 * Monster XP against monster strength: fits XP to the game's own threat value (monsterThreat in data/monsters.ts) and lists the monsters
 * whose XP is far from the fit, with a proposed value (half way, in the logarithm, towards the fit). Also shows what the proposal does to the
 * XP the generated worlds hold per tier. Usage: tsx tools/balance/monsterxp.ts
 */
import { monsterThreat } from "../../src/data/monsters";
import { MONSTERS } from "../../src/data/tables";
import { measureSupply } from "./supply";

const list = Object.values(MONSTERS).filter((m) => m.id < 1000);
const x = list.map((m) => Math.log(monsterThreat(m)));
const y = list.map((m) => Math.log(m.xp));
const n = list.length;
const mx = x.reduce((a, b) => a + b, 0) / n;
const my = y.reduce((a, b) => a + b, 0) / n;
const slope = x.reduce((s, xi, i) => s + (xi - mx) * (y[i]! - my), 0) / x.reduce((s, xi) => s + (xi - mx) ** 2, 0);
const icpt = my - slope * mx;
const corr = x.reduce((s, xi, i) => s + (xi - mx) * (y[i]! - my), 0) / Math.sqrt(x.reduce((s, xi) => s + (xi - mx) ** 2, 0) * y.reduce((s, yi) => s + (yi - my) ** 2, 0));
console.log(`log XP = ${icpt.toFixed(2)} + ${slope.toFixed(2)} * log threat   (r = ${corr.toFixed(2)}, ${n} monsters)`);

/** Two significant digits. */
const nice = (v: number): number => {
  const e = 10 ** (Math.floor(Math.log10(v)) - 1);
  return Math.round(v / e) * e;
};

const HIGH = 2.5;
const LOW = 0.4;
const rows = list
  .map((m) => {
    const fit = Math.exp(icpt + slope * Math.log(monsterThreat(m)));
    const ratio = m.xp / fit;
    const proposed = ratio > HIGH || ratio < LOW ? nice(Math.sqrt(m.xp * fit)) : m.xp;
    return { m, fit, ratio, proposed };
  })
  .sort((a, b) => a.m.id - b.m.id);
const proposal = new Map(rows.map((r) => [r.m.id, r.proposed]));

console.log(`\nAusreisser (XP mehr als ${HIGH}-mal ueber oder unter ${1 / LOW}-mal unter der Ausgleichskurve) und Vorschlag:`);
console.log("id  Name                 Tier  HP    Armor  Schaden x Angriffe   XP heute   Kurve    Faktor  Vorschlag");
for (const r of rows.filter((r) => r.proposed !== r.m.xp)) {
  const m = r.m;
  console.log(`${String(m.id).padEnd(3)} ${m.name.padEnd(20)} ${m.treasure_level}     ${String(m.health).padStart(5)} ${String(m.armor).padStart(4)}  ${`${m.damage_min}-${m.damage_max} x ${m.no_of_attacks}`.padEnd(14)} ${String(m.xp).padStart(10)} ${String(Math.round(r.fit)).padStart(8)}  ${r.ratio.toFixed(2).padStart(6)}  ${String(r.proposed).padStart(9)}`);
}

console.log("\nXP der Beispielwelten je Tier (Mittel alpha/beta/gamma), heute und mit dem Vorschlag:");
for (let t = 1; t <= 5; t++) {
  let now = 0;
  let neu = 0;
  let groups = 0;
  for (const seed of ["alpha", "beta", "gamma"]) {
    for (const g of measureSupply(seed, "default").groups.filter((g) => g.tier === t)) {
      groups++;
      for (const id of g.ids) {
        now += MONSTERS[id]!.xp;
        neu += proposal.get(id) ?? MONSTERS[id]!.xp;
      }
    }
  }
  console.log(`  Tier ${t}: heute ${Math.round(now / 3000)}k, Vorschlag ${Math.round(neu / 3000)}k (${((neu / now - 1) * 100).toFixed(0)} %), je Gruppe ${Math.round(now / groups / 1000)}k -> ${Math.round(neu / groups / 1000)}k`);
}
