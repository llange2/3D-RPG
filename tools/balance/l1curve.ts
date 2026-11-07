/**
 * Level 1 monsters against heroes of every level (45th playtest, point 11): where do the fights with the weakest monsters (`treasure_level` 1) stop hurting, and
 * what makes them stop? Reads the party of a real save (`SAVE_FILE`, a file with `state.party`; default `tools/balance/out/save-2026-11-07.json`) and the
 * generated heroes of the tool.
 *
 * Usage: tsx tools/balance/l1curve.ts armor      armor, resistances and hit points of the save's heroes against what the level 1 monsters roll
 *        tsx tools/balance/l1curve.ts pass       how much damage a level 1 monster still does through armor X (physical) and resistance Y (elemental)
 *        tsx tools/balance/l1curve.ts curve [runs=120] [formulas=v4]   party of the standard four by level and gear: win rate and hit points lost against the level 1 monsters
 *        tsx tools/balance/l1curve.ts scale [formulas]   the factor S(tier, level) of a v6 set for the tiers 1 to 4
 *        tsx tools/balance/l1curve.ts traps [formulas]   the traps of a tier 1 place against the heroes of every level: today (damage x (1 + level / 10), `trapDamageFor`) and with the level scaling of a v6 set
 *        tsx tools/balance/l1curve.ts hit [formulas;formulas...]   what one hit of a level 1 monster does to the Knight of every level (all rolls, exact): the mean over the 18 monsters and how many of them can still hurt
 */
import { readFileSync } from "node:fs";
import { MONSTERS } from "../../src/data/tables";
import { armor, itemBonus, resistance } from "../../src/sim/character";
import type { Party } from "../../src/sim/types";
import { PARTIES, gearByName, makeHero, GROWTH_USER } from "./hero";
import { V6_DEFAULT, formulasByName, scaleOf, type V6Options } from "./proposals";
import { runCell, scenario } from "./scenario";

// OVERRIDE="Candle Creep:health=40,no_of_attacks=1;Wicked Witch:damage_max=12" changes monsters of the table for this run only (what-if for the outliers of tier 1)
for (const part of (process.env.OVERRIDE ?? "").split(";").filter(Boolean)) {
  const [name, fields] = part.split(":");
  const def = Object.values(MONSTERS).find((m) => m.name === name);
  if (!def) throw new Error(`unknown monster ${name}`);
  for (const f of fields!.split(",")) {
    const [k, v] = f.split("=");
    (def as unknown as Record<string, number>)[k!] = Number(v);
  }
}
const SAVE = process.env.SAVE_FILE ?? "tools/balance/out/save-2026-11-07.json";
const L1 = Object.values(MONSTERS).filter((m) => m.id < 1000 && m.treasure_level === 1 && m.terrain === "land");
const avg = (m: { damage_min: number; damage_max: number }) => (Math.min(m.damage_min, m.damage_max) + Math.max(m.damage_min, m.damage_max)) / 2;
const pct = (x: number) => `${Math.round(x * 100)}%`.padStart(4);

/** Mean damage of one roll (uniform min..max) after a flat armor subtraction. */
function afterArmor(min: number, max: number, arm: number): number {
  let sum = 0;
  for (let d = min; d <= max; d++) sum += Math.max(0, d - arm);
  return sum / (max - min + 1);
}

function armorMain(): void {
  const party = JSON.parse(readFileSync(SAVE, "utf8")).state.party as Party;
  console.log("The party of the save:");
  console.log("hero       class     L   hp   armor  res f/i/a/m   str");
  for (const c of party.characters) console.log(`${c.name.padEnd(10)} ${c.classType.padEnd(9)} ${String(c.level).padStart(2)} ${String(c.health).padStart(4)} ${String(armor(c)).padStart(6)}  ${[resistance(c, "fire"), resistance(c, "ice"), resistance(c, "acid"), resistance(c, "magic")].map((r) => String(r).padStart(3)).join(" ")}   ${itemBonus(c, "str")}`);
  const arms = party.characters.map((c) => armor(c));
  console.log(`\nThe level 1 monsters (${L1.length}) and what they roll (attack type, damage, attacks per turn) against the armor of the save's heroes (${arms.join(", ")}):`);
  console.log("monster          type      dmg      x   avg    after armor " + arms.join("/") + "   share of the rolls that get through");
  for (const m of L1) {
    const physical = m.attack_type.toLowerCase() === "physical";
    const cells = arms.map((a) => (physical ? afterArmor(Math.min(m.damage_min, m.damage_max), Math.max(m.damage_min, m.damage_max), a) : avg(m)).toFixed(1));
    const through = arms.map((a) => (physical ? (Math.max(0, Math.max(m.damage_min, m.damage_max) - a) > 0 ? "yes" : "no ") : "ele")).join("/");
    console.log(`${m.name.padEnd(16)} ${m.attack_type.padEnd(9)} ${`${m.damage_min}-${m.damage_max}`.padEnd(8)} ${m.no_of_attacks}  ${avg(m).toFixed(1).padStart(5)}   ${cells.join("/").padEnd(20)} ${through}`);
  }
}

function passMain(): void {
  console.log("Physical level 1 monsters: mean damage of one hit through the armor (flat subtraction, `monsterDamage`); a hit never does less than 0.");
  const phys = L1.filter((m) => m.attack_type.toLowerCase() === "physical");
  const arms = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 25, 30, 40];
  console.log("armor      " + arms.map((a) => String(a).padStart(5)).join(""));
  for (const m of phys) console.log(`${m.name.padEnd(10).slice(0, 10)} ${arms.map((a) => afterArmor(Math.min(m.damage_min, m.damage_max), Math.max(m.damage_min, m.damage_max), a).toFixed(1).padStart(5)).join("")}   (${m.damage_min}-${m.damage_max})`);
  const maxes = phys.map((m) => Math.max(m.damage_min, m.damage_max));
  console.log(`\nthe highest roll of a physical level 1 monster is ${Math.max(...maxes)}: from armor ${Math.max(...maxes)} up no physical level 1 monster does damage any more; the weakest are harmless from armor ${Math.min(...maxes)}`);
  const ele = L1.filter((m) => m.attack_type.toLowerCase() !== "physical");
  console.log("\nElemental level 1 monsters (armor does nothing against them; the resistance in percent does):");
  for (const m of ele) console.log(`  ${m.name.padEnd(14)} ${m.attack_type.padEnd(7)} ${m.damage_min}-${m.damage_max} x${m.no_of_attacks}  ${[0, 10, 20, 30, 50, 75, 100].map((r) => `res ${r}%: ${((avg(m) * (100 - r)) / 100).toFixed(1)}`).join("  ")}`);
}

function curveMain(): void {
  const runs = Number(process.argv[3] ?? 120);
  const F = formulasByName(process.argv[4] ?? "v4");
  const party = PARTIES[0]!;
  const size = Number(process.env.GROUP ?? 3);
  console.log(`${party.name}, formulas ${F.id}, ${runs} runs, groups of ${size} level 1 monsters (each kind separately, the mean of the kinds; "worst" is the hardest kind)`);
  console.log("level gear  armor(Kn/Nj/Ar/Dr)  hp lost mean  worst kind (hp lost)   win% mean  dead/fight");
  for (const [level, gear] of [[1, "starter"], [2, "starter"], [3, "t1"], [4, "t1"], [5, "t1"], [7, "t2"], [10, "t2"], [12, "t3"], [15, "t3"], [20, "t4"], [25, "t4"], [30, "t5"]] as [number, string][]) {
    const spec = gearByName(gear);
    const arms = party.members.map((s, i) => makeHero(s, level, GROWTH_USER, spec, i).armor);
    let lost = 0;
    let dead = 0;
    let wins = 0;
    let worst = { name: "", lost: -1 };
    for (const m of L1) {
      const c = runCell(scenario({ party, level, tier: 1, runs, F, monster: m, groupSize: size, seed: "l1", gear: spec })).fresh;
      lost += c.hpLostPct;
      dead += c.dead;
      wins += c.winRate;
      if (c.hpLostPct > worst.lost) worst = { name: m.name, lost: c.hpLostPct };
    }
    console.log(`${String(level).padStart(5)} ${gear.padEnd(7)} ${arms.join("/").padEnd(15)}  ${pct(lost / L1.length)}          ${worst.name.padEnd(14)} ${pct(worst.lost)}        ${pct(wins / L1.length)}      ${(dead / L1.length).toFixed(2)}`);
  }
}

function hitMain(): void {
  const sets = (process.argv[3] ?? "v4").split(";");
  const knight = PARTIES[0]!.members[0]!;
  console.log("The Knight with the gear of his level; melee hits against armor, elemental hits against the Knight's resistances. `hurts` = monsters of 18 that can do 1 or more with some roll.");
  console.log("level gear   armor res%   " + sets.map((f) => f.slice(0, 44).padEnd(46)).join(" | "));
  for (const [level, gear] of [[1, "starter"], [2, "starter"], [3, "t1"], [4, "t1"], [5, "t1"], [7, "t2"], [10, "t2"], [12, "t3"], [15, "t3"], [18, "t3"], [20, "t4"], [25, "t4"]] as [number, string][]) {
    const h = makeHero(knight, level, GROWTH_USER, gearByName(gear), 0);
    const cells = sets.map((name) => {
      const F = formulasByName(name);
      let sum = 0;
      let hurts = 0;
      for (const m of L1) {
        const lo = Math.min(m.damage_min, m.damage_max);
        const hi = Math.max(m.damage_min, m.damage_max);
        let total = 0;
        let any = false;
        for (let r = lo; r <= hi; r++) {
          const d = F.monsterDamage(m, h, { damage: r, hit: 0, evade: 1, ranged: false, distance: 1, fairy: 0 });
          total += d;
          if (d >= 1) any = true;
        }
        sum += (total / (hi - lo + 1)) * m.no_of_attacks;
        if (any) hurts++;
      }
      return `${(sum / L1.length).toFixed(1).padStart(5)} per turn, hurts ${String(hurts).padStart(2)}/18`.padEnd(46);
    });
    console.log(`${String(level).padStart(5)} ${gear.padEnd(7)} ${String(h.armor).padStart(4)} ${String(h.res.fire).padStart(4)}   ${cells.join(" | ")}`);
  }
}

function scaleMain(): void {
  const F = formulasByName(process.argv[3] ?? "v6:rampFrom=0.4,rampLevels=3,fadeAfter=2,zeroTiers=3");
  const o = Object.fromEntries(F.id.slice(3).split(",").filter(Boolean).map((p) => p.split("=")).map(([k, v]) => [k, Number(v)]));
  const levels = [1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 14, 16, 18, 19, 20, 25, 30, 33, 36, 40, 50];
  console.log(`${F.id}: factor on the damage roll of a monster of tier t against a hero of level L`);
  console.log("level  " + levels.map((l) => String(l).padStart(4)).join(""));
  for (let t = 1; t <= 5; t++) console.log(`tier ${t}  ` + levels.map((l) => scaleOf(t, l, { ...V6_DEFAULT, ...o } as V6Options).toFixed(2).slice(0, 4).padStart(4)).join(""));
}

function trapsMain(): void {
  // tier 1: spring 4 + 1..5, pit 3 + 1..4, guillotine 5 + 2..6, generic 3 + 1..5 (`src/data/rules/traps.json`), means 7, 5.5, 9, 6
  const means = [7, 5.5, 9, 6];
  const base = means.reduce((a, b) => a + b, 0) / means.length;
  const F = formulasByName(process.argv[3] ?? "v4");
  const o = /^v6:/.test(F.id) ? Object.fromEntries(F.id.slice(3).split(",").filter(Boolean).map((p) => p.split("=")).map(([k, v]) => [k, Number(v)])) : {};
  console.log(`A tier 1 trap does ${base.toFixed(1)} on average (spring 7, pit 5.5, guillotine 9, generic 6) and hurts the one hero it hits; today x (1 + level / 10). Hit points of the standard party's four heroes with the gear of their level.`);
  console.log("level  hit points (Kn/Nj/Ar/Dr)   today dmg  % of a hero   with " + F.id.slice(0, 40) + ":  dmg  % of a hero");
  const party = PARTIES[0]!;
  for (const [level, gear] of [[1, "starter"], [2, "starter"], [3, "t1"], [4, "t1"], [5, "t1"], [7, "t2"], [10, "t2"], [12, "t3"], [15, "t3"], [18, "t3"], [20, "t4"], [25, "t4"], [30, "t5"]] as [number, string][]) {
    const hp = party.members.map((m, i) => makeHero(m, level, GROWTH_USER, gearByName(gear), i)).map((h) => F.maxHp(h));
    const mean = hp.reduce((a, b) => a + b, 0) / hp.length;
    const today = base * (1 + level / 10);
    const s = scaleOf(1, level, { ...V6_DEFAULT, ...o } as V6Options);
    const scaled = today * s;
    console.log(`${String(level).padStart(5)}  ${hp.join("/").padEnd(24)}  ${today.toFixed(1).padStart(8)}  ${pct(today / mean).padStart(9)}              ${scaled.toFixed(1).padStart(15)}  ${pct(scaled / mean).padStart(9)}`);
  }
}

const mode = process.argv[2] ?? "armor";
if (mode === "armor") armorMain();
else if (mode === "pass") passMain();
else if (mode === "curve") curveMain();
else if (mode === "hit") hitMain();
else if (mode === "traps") trapsMain();
else if (mode === "scale") scaleMain();
else throw new Error(`unknown mode ${mode}`);
