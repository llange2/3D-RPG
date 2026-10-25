/**
 * Weapon damage the simulated heroes carry: mean of (min + max) / 2 of the melee weapon plus rings (`damMin/damMax`) and of the bow
 * (`rangedMin/rangedMax`) over the 24 gear rolls and the ten classes that carry one, per gear tier.
 * Usage: tsx tools/balance/weapons.ts
 */
import { CLASSES, GEAR, defaultSpec, makeHero, GROWTH_USER } from "./hero";

console.log("Ausruestung | Nahkampfwaffe+Ringe (Mittel, Ritter/Barbar/Paladin) | Bogen+Ringe (Mittel, Bogner/Waldlaeufer/Ninja/Dieb)");
for (const name of Object.keys(GEAR).filter((n) => /^[tb]\d$/.test(n))) {
  const mean = (cls: (typeof CLASSES)[number][], pick: (h: ReturnType<typeof makeHero>) => number): number => {
    let sum = 0;
    let n = 0;
    for (const c of cls) for (let salt = 0; salt < 24; salt++) {
      sum += pick(makeHero(defaultSpec(c), 40, GROWTH_USER, GEAR[name]!, salt));
      n++;
    }
    return sum / n;
  };
  const melee = mean(["Knight", "Barbarian", "Paladin"], (h) => (h.damMin + h.damMax) / 2);
  const bow = mean(["Archer", "Ranger", "Ninja", "Thief"], (h) => (h.rangedMin + h.rangedMax) / 2);
  console.log(`${name.padEnd(11)} | ${melee.toFixed(1).padStart(6)} | ${bow.toFixed(1).padStart(6)}`);
}
