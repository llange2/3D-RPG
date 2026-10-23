/**
 * Cross-check of the abstract fight engine against the game's real one (sim/encounter.ts, the same hall as tools/dev/balance.ts): the heroes of
 * the old game (starter kit, levelled with levelUp) meet the same groups in both, and win rate and survivors are compared.
 * Usage: tsx tools/balance/crosscheck.ts [trials=300]
 */
import { Rng, seedFromString } from "../../src/core/rng";
import { MONSTER_THEME_NAMES, pickMonster } from "../../src/data/monsters";
import { MONSTERS, type MonsterDef } from "../../src/data/tables";
import { canAct, itemBonus, levelUp, resistance } from "../../src/sim/character";
import { ringDamage } from "../../src/sim/combat";
import { createEncounter, createMonster, partyAttack, updateBattleMode, type GridView } from "../../src/sim/encounter";
import { createDefaultParty, isDefeated } from "../../src/sim/party";
import type { Character } from "../../src/sim/types";
import { BASE_CLASS, BASE_RACE } from "../../src/data/tables";
import { DEFAULT_ENV } from "./fight";
import { runFight, newRun } from "./fight";
import { CURRENT } from "./formulas";
import type { Hero } from "./hero";
import { R } from "./rng";

const trials = Number(process.argv[2] ?? 300);
const view: GridView = { walkable: (x, y) => x >= 0 && y >= 0 && x < 30 && y < 9, water: () => false, opaque: () => false };

/** A hero of this tool with exactly the numbers of a real character (attributes and equipment as they are). */
function fromCharacter(c: Character): Hero {
  const cls = BASE_CLASS[c.classType]!;
  const race = BASE_RACE[c.raceType]!;
  const gear = { str: itemBonus(c, "str"), int: itemBonus(c, "int"), per: itemBonus(c, "per"), end: itemBonus(c, "end"), spd: itemBonus(c, "spd"), acc: itemBonus(c, "acc"), lck: itemBonus(c, "lck") };
  return {
    spec: { cls: c.classType, race: c.raceType },
    cls: c.classType,
    race: c.raceType,
    level: c.level,
    str: c.str,
    int: c.int,
    per: c.per,
    end: c.end,
    spd: c.spd,
    acc: c.acc,
    lck: c.lck,
    gear,
    armor: itemBonus(c, "arm"),
    damMin: itemBonus(c, "dam_min"),
    damMax: itemBonus(c, "dam_max"),
    ringDamMin: ringDamage(c, "dam_min"),
    ringDamMax: ringDamage(c, "dam_max"),
    rangedMin: itemBonus(c, "ranged_dam_min") + ringDamage(c, "dam_min"),
    rangedMax: itemBonus(c, "ranged_dam_max") + ringDamage(c, "dam_max"),
    classHp: cls.base_hp,
    raceHp: race.base_hp,
    raceMana: race.base_mana,
    classMelee: cls.base_melee,
    classRanged: cls.base_ranged,
    res: { fire: resistance(c, "fire"), ice: resistance(c, "ice"), acid: resistance(c, "acid"), magic: resistance(c, "magic") },
  };
}

function realFight(level: number, defs: MonsterDef[], seed: string): { won: boolean; alive: number } {
  const rng = new Rng(seedFromString(seed));
  const party = createDefaultParty();
  for (const c of party.characters) levelUp(c, party.talents, level - 1);
  const enc = createEncounter();
  defs.forEach((d, i) => enc.monsters.push(createMonster(`m${i}`, d.id, 8 + (i % 2), 4 + Math.floor(i / 2) * 2 - (defs.length > 2 ? 2 : 0))));
  let rounds = 0;
  while (!isDefeated(party) && enc.monsters.some((m) => m.hp > 0) && rounds < 400) {
    rounds++;
    updateBattleMode(enc, 3, 4);
    const target = [...enc.monsters].filter((m) => m.hp > 0).sort((a, b) => Math.abs(a.x - 3) + Math.abs(a.y - 4) - (Math.abs(b.x - 3) + Math.abs(b.y - 4)))[0]!;
    const adjacent = Math.abs(target.x - 3) + Math.abs(target.y - 4) === 1;
    const events = partyAttack(party, view, enc, 3, 4, rng, { kind: adjacent ? "melee" : "ranged", targetUid: target.uid });
    if (events[0]?.type === "denied") {
      const retry = partyAttack(party, view, enc, 3, 4, rng, { kind: "melee", targetUid: target.uid });
      if (retry[0]?.type === "denied") break;
    }
  }
  return { won: enc.monsters.every((m) => m.hp <= 0) && !isDefeated(party), alive: party.characters.filter((c) => canAct(c)).length };
}

console.log("level tier group | real: Sieg  lebend | Werkzeug: Sieg  lebend");
for (const level of [1, 3, 6]) {
  for (const tier of [1, 2, 3]) {
    for (const group of [1, 2, 3]) {
      let rw = 0;
      let ra = 0;
      let sw = 0;
      let sa = 0;
      const rng = new Rng(seedFromString(`cc:${level}:${tier}:${group}`));
      const sim = new R(level * 100 + tier * 10 + group);
      for (let i = 0; i < trials; i++) {
        const defs: MonsterDef[] = [];
        for (let k = 0; k < group; k++) defs.push(pickMonster(rng, MONSTER_THEME_NAMES[rng.int(MONSTER_THEME_NAMES.length)]!, tier, false));
        const r = realFight(level, defs, `rf:${level}:${tier}:${group}:${i}`);
        rw += r.won ? 1 : 0;
        ra += r.alive;
        // the same heroes, the same monsters, the abstract engine (no spells: the real hall test casts none either)
        const party = createDefaultParty();
        for (const c of party.characters) levelUp(c, party.talents, level - 1);
        const heroes = party.characters.map((c) => newRun(fromCharacter(c), CURRENT, "none"));
        const s = runFight(heroes, defs.map((d) => MONSTERS[d.id]!), { ...DEFAULT_ENV, spells: false, startDistance: 5, maxAdjacent: 3 }, CURRENT, sim);
        sw += s.won ? 1 : 0;
        sa += heroes.filter((h) => h.st === 0).length;
      }
      const f = (x: number) => ((x / trials) * 100).toFixed(0).padStart(4) + "%";
      console.log(`${String(level).padStart(5)} ${String(tier).padStart(4)} ${String(group).padStart(5)} |       ${f(rw)} ${(ra / trials).toFixed(2).padStart(6)} |          ${f(sw)} ${(sa / trials).toFixed(2).padStart(6)}`);
    }
  }
}
