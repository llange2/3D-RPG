/**
 * How hard do ranged monsters shoot? For each ranged monster of a tier: the mean damage one monster turn does to a random hero of the Standard party
 * (typical gear of the tier, level of the tier's entry), as a share of that hero's hit points, from afar (distance 3, `shots` shots) and in melee
 * (all its attacks), and the monster's volley against the party's own: the damage the party's bows do to it in one volley at distance 3 as a share
 * of its health. The ratio shot / melee shows how much of its strength a shooter loses by standing back.
 *
 * Usage: tsx tools/balance/shots.ts [--formulas=v4;v5:eArmor=1,…] [--rshots=one|half|two|all, default: the formula set decides] [--cells=1:4,2:10,3:20,4:30,5:42] [--distance=3]
 */
import { MONSTERS } from "../../src/data/tables";
import { gearForTier, makeHero, PARTIES, GROWTH_USER } from "./hero";
import { formulasByName } from "./proposals";

function options(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const arg of process.argv.slice(2)) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(arg);
    if (m) out[m[1]!] = m[2] ?? "true";
  }
  return out;
}

const a = options();
const sets = (a.formulas ?? "v4").split(";");
const cells = (a.cells ?? "1:4,2:10,3:20,4:30,5:42").split(",").map((c) => c.split(":").map(Number) as [number, number]);
const distance = Number(a.distance ?? 3);
const shotsOf = (F: { rangedShots(attacks: number): number }, attacks: number): number =>
  a.rshots === "all" ? attacks : a.rshots === "half" ? Math.ceil(attacks / 2) : a.rshots === "two" ? Math.min(2, Math.ceil(attacks / 2)) : a.rshots === "one" ? 1 : F.rangedShots(attacks);

for (const name of sets) {
  const F = formulasByName(name);
  console.log(`\n=== ${name}   (ranged monsters fire ${a.rshots ?? "per the formula set"} shot(s) per turn; distance ${distance})`);
  console.log("tier/lvl  monster                 type      dmg      att | afar % hp | melee % hp | afar/melee | party volley % of its hp (bows @ d)");
  for (const [tier, level] of cells) {
    const heroes = PARTIES[0]!.members.map((spec, i) => makeHero(spec, level, GROWTH_USER, gearForTier(tier), i));
    console.log(`  -- T${tier}/L${level}: armor of the heroes ${heroes.map((h) => h.armor).join(" / ")}, hit points ${heroes.map((h) => F.maxHp(h)).join(" / ")}`);
    const monsters = Object.values(MONSTERS).filter((m) => m.treasure_level === tier && m.ranged && m.id < 1000).sort((x, y) => x.health - y.health);
    for (const m of monsters) {
      const n = 400;
      let afar = 0;
      let melee = 0;
      let volley = 0;
      for (const h of heroes) {
        const hp = F.maxHp(h);
        let sa = 0;
        let sm = 0;
        for (let i = 0; i < n; i++) {
          const roll = m.damage_min + ((m.damage_max - m.damage_min) * (i + 0.5)) / n;
          const u = (i + 0.5) / n;
          const base = { damage: roll, evade: 0.5, fairy: 0, fairyOff: 0 };
          sa += F.monsterDamage(m, h, { ...base, hit: u, ranged: true, distance }) * shotsOf(F, m.no_of_attacks);
          sm += F.monsterDamage(m, h, { ...base, hit: 0, ranged: false, distance: 1 }) * m.no_of_attacks;
        }
        afar += sa / n / hp / heroes.length;
        melee += sm / n / hp / heroes.length;
        if (h.rangedMax > 0) volley += F.rangedHitChance(h, m, distance) * F.rangedDamage(h, m, (h.rangedMin + h.rangedMax) / 2) / m.health;
      }
      console.log(`  T${tier}/L${String(level).padStart(2)}  ${m.name.padEnd(22)} ${m.attack_type.padEnd(8)} ${String(m.damage_min).padStart(3)}-${String(m.damage_max).padEnd(3)} x${m.no_of_attacks} | ${(afar * 100).toFixed(1).padStart(8)} | ${(melee * 100).toFixed(1).padStart(10)} | ${melee > 0 ? (afar / melee).toFixed(2).padStart(10) : "         -"} | ${(volley * 100).toFixed(0).padStart(5)}%`);
    }
  }
}
