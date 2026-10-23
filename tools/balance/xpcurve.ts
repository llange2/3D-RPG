/**
 * The XP table against the content of the world: which level does a party reach when it clears a share of every tier up to t, and how many
 * fights does a level cost? Usage: tsx tools/balance/xpcurve.ts [formulas ...] [--bands=1,5,11,19,33]   e.g. current xp_g10 xp_g12
 */
import { MONSTERS } from "../../src/data/tables";
import { type Formulas } from "./formulas";
import { PARTIES } from "./hero";
import { formulasByName } from "./proposals";
import { measureSupply, totals } from "./supply";

export const SEEDS = ["alpha", "beta", "gamma"];

/** Mean tier totals over several worlds (default size). */
export function meanSupply(seeds = SEEDS): { monsters: number[]; xp: number[]; gold: number[]; groups: number[] } {
  const monsters = [0, 0, 0, 0, 0, 0];
  const xp = [0, 0, 0, 0, 0, 0];
  const gold = [0, 0, 0, 0, 0, 0];
  const groups = [0, 0, 0, 0, 0, 0];
  for (const seed of seeds) {
    const t = totals(measureSupply(seed, "default"));
    for (let i = 1; i <= 5; i++) {
      monsters[i]! += t[i]!.monsters / seeds.length;
      xp[i]! += t[i]!.xp / seeds.length;
      gold[i]! += t[i]!.gold / seeds.length;
      groups[i]! += t[i]!.groups / seeds.length;
    }
  }
  return { monsters, xp, gold, groups };
}

/** Level a hero of a class reaches with `xpTotal` experience under the formulas. */
export function levelFor(F: Formulas, cls: Parameters<Formulas["xpStep"]>[0], xpTotal: number, cap = 300): number {
  let level = 1;
  let need = 0;
  while (level < cap) {
    need += F.xpStep(cls, level);
    if (xpTotal < need) break;
    level++;
  }
  return level;
}

/** Mean level of the reference party's heroes. */
export function partyLevel(F: Formulas, xpTotal: number, party = PARTIES[0]!): number {
  return party.members.reduce((s, m) => s + levelFor(F, m.cls, xpTotal), 0) / party.members.length;
}

/** XP of an average group of every tier in the generated worlds (what one fight is worth). */
export function xpPerGroup(): number[] {
  const s = meanSupply();
  return s.xp.map((x, t) => (s.groups[t]! > 0 ? x / s.groups[t]! : 0));
}

/** Fights per level: the XP step of a level (mean over the party's classes) divided by what a group of the tier that level is meant for gives. */
export function fightsPerLevel(F: Formulas, bands: number[], party = PARTIES[0]!, levels = 50, xpGroup = xpPerGroup()): { level: number; tier: number; step: number; fights: number }[] {
  const rows: { level: number; tier: number; step: number; fights: number }[] = [];
  for (let level = 1; level <= levels; level++) {
    const tier = Math.max(1, bands.filter((b) => b <= level).length);
    const step = party.members.reduce((s, m) => s + F.xpStep(m.cls, level), 0) / party.members.length;
    // the hook scales the XP of a monster; the tier mean is scaled by the same factor, taken from a typical monster of that tier
    const typical = Object.values(MONSTERS).find((m) => m.id < 1000 && m.treasure_level === tier)!;
    rows.push({ level, tier, step, fights: step / (xpGroup[tier]! * F.monsterXp(typical)) });
  }
  return rows;
}

function main(): void {
  const names = process.argv.slice(2).filter((n) => !n.startsWith("--"));
  const bands = (process.argv.find((a) => a.startsWith("--bands="))?.slice(8) ?? "1,5,11,19,33").split(",").map(Number);
  const sets: Formulas[] = (names.length ? names : ["current"]).map((n) => formulasByName(n));
  const s = meanSupply();
  console.log("Mittel ueber alpha/beta/gamma (Standardgroesse):");
  let cum = 0;
  for (let t = 1; t <= 5; t++) {
    cum += s.xp[t]!;
    console.log(`  Tier ${t}: ${Math.round(s.monsters[t]!)} Monster in ${Math.round(s.groups[t]!)} Gruppen, ${Math.round(s.xp[t]! / 1000)}k XP (kumuliert ${Math.round(cum / 1000)}k), ${Math.round(s.gold[t]! / 1000)}k Gold`);
  }
  const xg = xpPerGroup();
  console.log("XP je Gruppe: " + xg.slice(1).map((x, i) => "T" + (i + 1) + " " + Math.round(x / 1000) + "k").join("  "));
  for (const F of sets) {
    const fl = fightsPerLevel(F, bands);
    console.log(`\n=== ${F.id}: ${F.title}`);
    console.log("Kaempfe je Stufe (Baender ab " + bands.join("/") + "): " + [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 18, 20, 25, 30, 35, 40, 45, 50].map((l) => "L" + l + ":" + fl[l - 1]!.fights.toFixed(0)).join(" "));
    const means = [1, 2, 3, 4, 5].map((t) => {
      const rows = fl.filter((r) => r.tier === t);
      return rows.length ? "T" + t + " (L" + rows[0]!.level + "-" + rows[rows.length - 1]!.level + "): " + (rows.reduce((a, r) => a + r.fights, 0) / rows.length).toFixed(0) + " (" + Math.min(...rows.map((r) => r.fights)).toFixed(0) + "-" + Math.max(...rows.map((r) => r.fights)).toFixed(0) + ")" : "";
    });
    console.log("Mittel je Band (kleinster-groesster Wert): " + means.join("   "));
    console.log("Stufe nach Raeumen von x % aller Tiers bis t (Mittel der Helden des Standardtrupps):");
    for (const share of [0.25, 0.5, 0.75, 1]) {
      let c = 0;
      const row: string[] = [];
      for (let t = 1; t <= 5; t++) {
        c += s.xp[t]!;
        row.push(`T${t}: L${partyLevel(F, c * share).toFixed(1)}`);
      }
      console.log(`  ${String(share * 100).padStart(3)} %  ` + row.join("   "));
    }
  }
}

if (process.argv[1]?.endsWith("xpcurve.ts")) main();
