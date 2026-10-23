/**
 * Proves that `CURRENT` (formulas.ts) is the game: health, mana, melee, ranged and monster damage and the XP table are compared with the
 * real functions of `src/sim` on random heroes, gear and monsters. Usage: tsx tools/balance/verify.ts [samples]
 */
import { Rng, seedFromString } from "../../src/core/rng";
import { MONSTERS } from "../../src/data/tables";
import { createCharacter, recalcValues, xpToNextLevel } from "../../src/sim/character";
import { meleeDamage, monsterDamage, rangedDamage } from "../../src/sim/combat";
import { createDefaultParty } from "../../src/sim/party";
import type { Character } from "../../src/sim/types";
import { CURRENT, type Mascot, xpForLevel } from "./formulas";
import { CLASSES, GEAR, GROWTH_USER, RACES, TEMPLATES, attrsAt, buildGear, makeHero } from "./hero";
import { R } from "./rng";
import { DEFAULT_PARAMS, makeFormulas } from "./parametric";

const PARAM = makeFormulas(DEFAULT_PARAMS, "param-default", "parametric family at the game's values");

const samples = Number(process.argv[2] ?? 3000);
const pick = new R(12345);
const monsters = Object.values(MONSTERS).filter((m) => m.id < 1000);
const gears = Object.keys(GEAR);
let bad = 0;
const fail = (what: string, detail: string): void => {
  bad++;
  if (bad <= 25) console.log(`MISMATCH ${what}: ${detail}`);
};

for (let i = 0; i < samples; i++) {
  const cls = CLASSES[pick.int(CLASSES.length)]!;
  const race = RACES[pick.int(RACES.length)]!;
  const level = 1 + pick.int(80);
  const gear = GEAR[gears[pick.int(gears.length)]!]!;
  const mascot: Mascot = (["none", "Fairy", "Orb", "Wolf", "Crow"] as const)[pick.int(5)]!;
  const spec = { cls, race };
  const hero = makeHero(spec, level, GROWTH_USER, gear, 0);
  const g = buildGear(cls, gear, 0);

  const c: Character = createCharacter({ name: "t", classType: cls, raceType: race, avatar: "character01", attrs: attrsAt(spec, level, GROWTH_USER), level });
  for (const [slot, item] of Object.entries(g.pieces)) c.inventory[slot] = item;
  recalcValues(c, [], true, mascot);

  if (PARAM.maxHp(hero) !== CURRENT.maxHp(hero) || PARAM.maxMana(hero, mascot) !== CURRENT.maxMana(hero, mascot)) fail("param", `hp/mana ${cls} L${level}`);
  if (c.health !== CURRENT.maxHp(hero)) fail("hp", `${cls} ${race} L${level} ${gear.name}: game ${c.health} tool ${CURRENT.maxHp(hero)}`);
  if (c.mana !== CURRENT.maxMana(hero, mascot)) fail("mana", `${cls} ${race} L${level} ${gear.name} ${mascot}: game ${c.mana} tool ${CURRENT.maxMana(hero, mascot)}`);
  if (c.xp !== 0 || xpToNextLevel(c) !== xpForLevel(CURRENT, cls, level + 1)) fail("xp", `${cls} L${level}: game ${xpToNextLevel(c)} tool ${xpForLevel(CURRENT, cls, level + 1)}`);

  const mon = monsters[pick.int(monsters.length)]!;
  const seed = `v:${i}`;

  // melee
  {
    const a = new Rng(seedFromString(seed));
    const b = new Rng(seedFromString(seed));
    const game = meleeDamage(c, mon, a);
    const roll = b.range(Math.min(hero.damMin, hero.damMax), Math.max(hero.damMin, hero.damMax));
    const mine = CURRENT.meleeDamage(hero, mon, roll);
    if (game !== mine) fail("melee", `${cls} L${level} vs ${mon.name}: game ${game} tool ${mine}`);
    if (PARAM.meleeDamage(hero, mon, roll) !== mine) fail("melee-param", `${cls} L${level} vs ${mon.name}`);
  }
  // ranged
  {
    const dist = 1 + pick.int(6);
    const a = new Rng(seedFromString(seed));
    const b = new Rng(seedFromString(seed));
    const game = rangedDamage(c, mon, dist, a);
    let mine = 0;
    if (b.float() <= CURRENT.rangedHitChance(hero, mon, dist)) mine = CURRENT.rangedDamage(hero, mon, b.range(Math.min(hero.rangedMin, hero.rangedMax), Math.max(hero.rangedMin, hero.rangedMax)));
    if (game !== mine) fail("ranged", `${cls} L${level} vs ${mon.name} @${dist}: game ${game} tool ${mine}`);
    let viaParam = 0;
    const c2 = new Rng(seedFromString(seed));
    if (c2.float() <= PARAM.rangedHitChance(hero, mon, dist)) viaParam = PARAM.rangedDamage(hero, mon, c2.range(Math.min(hero.rangedMin, hero.rangedMax), Math.max(hero.rangedMin, hero.rangedMax)));
    if (viaParam !== mine) fail("ranged-param", `${cls} L${level} vs ${mon.name} @${dist}: ${viaParam} vs ${mine}`);
  }
  // monster attack
  {
    const party = createDefaultParty();
    party.mascot = mascot === "none" ? "Crow" : mascot;
    const ranged = pick.int(2) === 1;
    const distance = ranged ? 1 + pick.int(6) : 1;
    const a = new Rng(seedFromString(seed));
    const b = new Rng(seedFromString(seed));
    const game = monsterDamage(party, mon, c, ranged, distance, a);
    const hit = ranged ? b.float() : 1;
    const damage = b.range(Math.min(mon.damage_min, mon.damage_max), Math.max(mon.damage_min, mon.damage_max));
    const evade = !ranged && cls === "Ninja" ? b.float() : 1;
    const mine = CURRENT.monsterDamage(mon, hero, { damage, hit: ranged ? hit : 0, evade, ranged, distance, fairy: party.mascot === "Fairy" ? 20 : 0 });
    if (game !== mine) fail("monster", `${mon.name} (${mon.attack_type}) -> ${cls}/${race} armor ${hero.armor} ranged ${ranged} @${distance}: game ${game} tool ${mine}`);
    const roll2 = { damage, hit: ranged ? hit : 0, evade, ranged, distance, fairy: party.mascot === "Fairy" ? 20 : 0 };
    if (PARAM.monsterDamage(mon, hero, roll2) !== mine) fail("monster-param", `${mon.name} -> ${cls}`);
  }
}
console.log(bad === 0 ? `OK: ${samples} random heroes, gear sets and monsters agree with the game` : `${bad} mismatches in ${samples} samples`);
process.exit(bad === 0 ? 0 : 1);
