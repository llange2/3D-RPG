/**
 * Why does a Goblin never seem to hit with its ranged attack against the starting party? Prints its stats, the armor and speed of the
 * default heroes, the hit chance per distance and the damage a hit does. Usage: tsx tools/balance/goblin.ts
 */
import { Rng, seedFromString } from "../../src/core/rng";
import { MONSTERS } from "../../src/data/tables";
import { armor, fightSpeed } from "../../src/sim/character";
import { monsterDamage } from "../../src/sim/combat";
import { createDefaultParty } from "../../src/sim/party";

const goblin = Object.values(MONSTERS).find((m) => m.name === "Goblin")!;
console.log(`Goblin: attack ${goblin.attack_type}, damage ${goblin.damage_min}-${goblin.damage_max}, speed ${goblin.speed}, attacks ${goblin.no_of_attacks}, ranged ${goblin.ranged}, hp ${goblin.health}`);
const party = createDefaultParty();
for (const c of party.characters) {
  const row: string[] = [];
  for (const d of [1, 2, 3, 5]) {
    let hits = 0;
    let dmg = 0;
    const n = 2000;
    for (let i = 0; i < n; i++) {
      const dealt = monsterDamage(party, goblin, c, d > 1, d, new Rng(seedFromString(`g${c.name}${d}${i}`)));
      if (dealt > 0) hits++;
      dmg += dealt;
    }
    const chance = Math.min(1, goblin.speed / (fightSpeed(c) * d * (c.classType === "Ninja" ? 0.75 : 0.5)));
    row.push(`@${d}: reaches ${(chance * 100).toFixed(0)}%, hurts in ${((hits / n) * 100).toFixed(0)}%, mean ${(dmg / n).toFixed(2)}`);
  }
  console.log(`${c.name.padEnd(10)} ${c.classType.padEnd(8)} armor ${armor(c)} speed ${fightSpeed(c)} | ${row.join(" | ")}`);
}
