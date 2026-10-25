/**
 * The party of a real save (default `.ignore/quicksave.json`, exported from the browser's localStorage) against a group of monsters, in the
 * game's real fight engine (`sim/encounter.ts`, the same hall as `crosscheck.ts`). Used to check an observation from play against the numbers.
 *
 * Usage: tsx tools/balance/save.ts battery <formulas;…> [tiers] [count] [runs] [distance]   (all monsters of a tier, bow against sword)
 *        tsx tools/balance/save.ts sim <formulas,…> [monster] [count] [runs] [distance]   (the abstract engine with formula variants, e.g. v4,v5:bowRes=1)
 *        tsx tools/balance/save.ts damage [monsters,…]   (bow against melee per hero)
 *        tsx tools/balance/save.ts [monster=Zombie] [count=2] [runs=400] [distance=5] [mascot=save|none|Wolf|Fairy|Orb]
 * Three ways to play the same fight: `bow` (everybody with a bow shoots, also next to the monster), `mixed` (shoot while they walk up, then
 * melee: what the other tools assume), `melee` (wait until they arrive, then melee). Prints the win rate, the hit points lost, the dead,
 * the rounds and where the damage came from.
 */
import { readFileSync } from "node:fs";
import { Rng, seedFromString } from "../../src/core/rng";
import { MONSTERS } from "../../src/data/tables";
import { BASE_CLASS, BASE_RACE } from "../../src/data/tables";
import { canAct, itemBonus, resistance } from "../../src/sim/character";
import { meleeDamage, rangedDamage, ringDamage } from "../../src/sim/combat";
import { createEncounter, createMonster, partyAttack, spellRound, updateBattleMode, type GridView } from "../../src/sim/encounter";
import { isDefeated } from "../../src/sim/party";
import type { Character, Party } from "../../src/sim/types";
import { DEFAULT_ENV, newRun, runFight, type FightEnv } from "./fight";
import type { Mascot } from "./formulas";
import type { Hero } from "./hero";
import { formulasByName } from "./proposals";
import { R } from "./rng";

export const SAVE_FILE = process.env.SAVE_FILE ?? ".ignore/quicksave.json";

/** The party of the save, a fresh copy every call. */
export function loadParty(file = SAVE_FILE): Party {
  return JSON.parse(readFileSync(file, "utf8")).state.party as Party;
}

const view: GridView = { walkable: (x, y) => x >= 0 && y >= 0 && x < 30 && y < 9, water: () => false, opaque: () => false };

export type Policy = "bow" | "mixed" | "melee";

export interface Outcome {
  won: boolean;
  rounds: number;
  lostHp: number;
  maxHp: number;
  dead: number;
  down: number;
  melee: number;
  ranged: number;
  /** Actions (party moves) spent before the first monster stood next to the party. */
  approach: number;
}

export function fight(party: Party, defIds: number[], distance: number, policy: Policy, seed: string): Outcome {
  const rng = new Rng(seedFromString(seed));
  const enc = createEncounter();
  defIds.forEach((id, i) => enc.monsters.push(createMonster(`m${i}`, id, 3 + distance + (i % 2), 4 + Math.floor(i / 2) * 2 - (defIds.length > 2 ? 2 : 0))));
  const hp0 = party.characters.map((c) => c.hp);
  const out: Outcome = { won: false, rounds: 0, lostHp: 0, maxHp: 0, dead: 0, down: 0, melee: 0, ranged: 0, approach: 0 };
  let approaching = true;
  while (!isDefeated(party) && enc.monsters.some((m) => m.hp > 0) && out.rounds < 400) {
    out.rounds++;
    updateBattleMode(enc, 3, 4);
    if (enc.battleMode && approaching) approaching = false;
    if (approaching) out.approach++;
    const live = enc.monsters.filter((m) => m.hp > 0);
    const target = live.sort((a, b) => Math.abs(a.x - 3) + Math.abs(a.y - 4) - (Math.abs(b.x - 3) + Math.abs(b.y - 4)))[0]!;
    const adjacent = Math.abs(target.x - 3) + Math.abs(target.y - 4) === 1;
    let events;
    if (policy === "melee" && !adjacent) events = spellRound(party, view, enc, 3, 4, rng);
    else {
      const kind = policy === "bow" ? "ranged" : adjacent ? "melee" : "ranged";
      events = partyAttack(party, view, enc, 3, 4, rng, { kind, targetUid: target.uid });
      if (events[0]?.type === "denied") events = partyAttack(party, view, enc, 3, 4, rng, { kind: "melee", targetUid: target.uid });
      if (events[0]?.type === "denied") break;
    }
    for (const e of events) if (e.type === "party_attack") (e.kind === "melee" ? (out.melee += e.damage) : (out.ranged += e.damage));
  }
  party.characters.forEach((c, i) => {
    out.lostHp += Math.min(hp0[i]! - c.hp, c.health);
    out.maxHp += c.health;
    if (c.conditions.includes("Dead")) out.dead++;
    if (!canAct(c)) out.down++;
  });
  out.won = enc.monsters.every((m) => m.hp <= 0) && !isDefeated(party);
  return out;
}

/** Mean damage per action of every hero, by bow and by melee, against some monsters: where the bow beats the sword and by how much. */
function damageTable(): void {
  const party = loadParty();
  const names = (process.argv[3] ?? "Zombie,Skeleton,Goblin,Orc Warrior,Giant Spider,Ogre,Castle Guard,Troll,Black Knight").split(",");
  const rng = new Rng(seedFromString("damage-table"));
  const n = 1500;
  console.log("Mean damage per action against the monster; bow = hit chance x damage at the distance; melee for the same hero. Party volley = all bows at once.");
  for (const name of names) {
    const def = Object.values(MONSTERS).find((m) => m.name.toLowerCase() === name.toLowerCase());
    if (!def) throw new Error(`unknown monster ${name}`);
    console.log(`
${def.name}: hp ${def.health}, armor ${def.armor}, res_physical ${def.res_physical}, speed ${def.speed}`);
    console.log("hero       melee  bow@1  bow@3  bow@5   bow@3 / melee");
    let sums = { melee: 0, b1: 0, b3: 0, b5: 0 };
    for (const c of party.characters) {
      const mean = (f: () => number) => {
        let t = 0;
        for (let i = 0; i < n; i++) t += f();
        return t / n;
      };
      const melee = mean(() => meleeDamage(c, def, rng));
      const has = itemBonus(c, "ranged_dam_max") > 0;
      const bow = (d: number) => (has ? mean(() => rangedDamage(c, def, d, rng)) : 0);
      const [b1, b3, b5] = [bow(1), bow(3), bow(5)];
      sums = { melee: sums.melee + melee, b1: sums.b1 + b1, b3: sums.b3 + b3, b5: sums.b5 + b5 };
      console.log(`${c.name.padEnd(10)} ${melee.toFixed(1).padStart(5)} ${b1.toFixed(1).padStart(6)} ${b3.toFixed(1).padStart(6)} ${b5.toFixed(1).padStart(6)}   ${melee > 0 ? (b3 / melee).toFixed(1) : "-"}`);
    }
    console.log(`party      ${sums.melee.toFixed(1).padStart(5)} ${sums.b1.toFixed(1).padStart(6)} ${sums.b3.toFixed(1).padStart(6)} ${sums.b5.toFixed(1).padStart(6)}   ${sums.melee > 0 ? (sums.b3 / sums.melee).toFixed(1) : "-"}`);
  }
}

/** A hero of the abstract engine with exactly the numbers of a real character (same as crosscheck.ts). */
export function fromCharacter(c: Character): Hero {
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

/** The abstract engine: the save's party against monsters, per formula set and way of playing. `env` overrides the defaults of the engine. */
export function simulate(formulas: string, defIds: number[], runs: number, distance: number, policy: Policy, env: Partial<FightEnv> = {}) {
  const F = formulasByName(formulas);
  const party0 = loadParty();
  const e: FightEnv = {
    ...DEFAULT_ENV,
    // the real-engine runs above cast no spells; SPELLS=1 lets the heroes cast (attack and heal spells of the spell sheet)
    spells: process.env.SPELLS === "1",
    startDistance: distance,
    mascot: (party0.mascot || "none") as Mascot,
    rangedInMelee: policy === "bow",
    openingVolley: policy !== "melee",
    ...env,
  };
  const s = { won: 0, lost: 0, dead: 0, down: 0, rounds: 0, melee: 0, ranged: 0 };
  const rng = new R(20261025);
  for (let i = 0; i < runs; i++) {
    const heroes = party0.characters.map((c) => newRun(fromCharacter(c), F, e.mascot));
    const r = runFight(heroes, defIds.map((id) => MONSTERS[id]!), e, F, rng);
    s.won += r.won ? 1 : 0;
    s.lost += r.hpLost / r.hpMax;
    s.dead += r.dead;
    s.down += r.down;
    s.rounds += r.rounds;
    s.melee += r.dealt.melee;
    s.ranged += r.dealt.ranged;
  }
  const n = runs;
  return { win: s.won / n, lost: s.lost / n, dead: s.dead / n, down: s.down / n, rounds: s.rounds / n, melee: s.melee / n, ranged: s.ranged / n };
}

function simMain(): void {
  const [, formulas = "v4", name = "Zombie", count = "2", runs = "600", distance = "5"] = process.argv.slice(2);
  const def = Object.values(MONSTERS).find((m) => m.name.toLowerCase() === name.toLowerCase());
  if (!def) throw new Error(`unknown monster ${name}`);
  const ids = Array.from({ length: Number(count) }, () => def.id);
  const rshots = (process.env.RSHOTS ?? "auto") as FightEnv["rangedShots"];
  console.log(`${count} x ${def.name} at ${distance} tiles, ${runs} runs, abstract engine, ranged monsters fire ${rshots} shot(s)`);
  console.log("formulas                                    policy  win%  hp lost%  dead  rounds  melee dmg  bow dmg");
  for (const f of formulas.split(";")) {
    for (const policy of ["bow", "mixed", "melee"] as Policy[]) {
      const r = simulate(f, ids, Number(runs), Number(distance), policy, { rangedShots: rshots });
      console.log(`${f.padEnd(43)} ${policy.padEnd(7)} ${(r.win * 100).toFixed(0).padStart(4)}  ${(r.lost * 100).toFixed(0).padStart(8)}  ${r.dead.toFixed(2).padStart(4)}  ${r.rounds.toFixed(1).padStart(6)}  ${r.melee.toFixed(0).padStart(9)}  ${r.ranged.toFixed(0).padStart(7)}`);
    }
  }
}

/**
 * Every monster of the given tiers, in a group of `count`, against the save's party: hit points lost when the party plays with the bow (best action
 * every turn) and when it only fights with the sword, for each formula set. A balanced bow costs about what the sword costs.
 * Usage: tsx tools/balance/save.ts battery <formulas;…> [tiers=1,2] [count=2] [runs=200] [distance=5]   (BRIEF=1 prints only the mean row)
 */
function batteryMain(): void {
  const [, formulas = "v4", tiersArg = "1,2", count = "2", runs = "200", distance = "5"] = process.argv.slice(2);
  const tiers = tiersArg.split(",").map(Number);
  const rshots = (process.env.RSHOTS ?? "auto") as FightEnv["rangedShots"];
  const sets = formulas.split(";");
  const mons = Object.values(MONSTERS).filter((m) => tiers.includes(m.treasure_level)).sort((a, b) => a.treasure_level - b.treasure_level || a.health - b.health);
  console.log(`${count} x each monster of tier ${tiersArg} at ${distance} tiles, ${runs} runs; cells: hp lost % with bow / with sword only (dead per fight with bow). RSHOTS=${rshots}`);
  console.log("monster                 T  rP   spd  | " + sets.map((f) => f.slice(0, 26).padEnd(26)).join(" | "));
  const sum = sets.map(() => ({ bow: 0, sword: 0, deadBow: 0, deadSword: 0, n: 0 }));
  for (const m of mons) {
    const cells = sets.map((f, k) => {
      const ids = Array.from({ length: Number(count) }, () => m.id);
      const b = simulate(f, ids, Number(runs), Number(distance), "bow", { rangedShots: rshots });
      const w = simulate(f, ids, Number(runs), Number(distance), "melee", { rangedShots: rshots });
      const t = sum[k]!;
      t.bow += b.lost;
      t.sword += w.lost;
      t.deadBow += b.dead;
      t.deadSword += w.dead;
      t.n++;
      return `${(b.lost * 100).toFixed(0).padStart(3)} / ${(w.lost * 100).toFixed(0).padStart(3)}  (${b.dead.toFixed(2)} / ${w.dead.toFixed(2)})`.padEnd(26);
    });
    if (!process.env.BRIEF) console.log(`${m.name.padEnd(23)} ${m.treasure_level} ${m.res_physical.toFixed(1).padStart(4)} ${String(m.speed).padStart(4)}  | ${cells.join(" | ")}`);
  }
  console.log("mean".padEnd(37) + "| " + sum.map((t) => `${((t.bow / t.n) * 100).toFixed(0).padStart(3)} / ${((t.sword / t.n) * 100).toFixed(0).padStart(3)}  (${(t.deadBow / t.n).toFixed(2)} / ${(t.deadSword / t.n).toFixed(2)})`.padEnd(26)).join(" | "));
}

function main(): void {
  if (process.argv[2] === "battery") return batteryMain();
  if (process.argv[2] === "damage") return damageTable();
  if (process.argv[2] === "sim") return simMain();
  const [name = "Zombie", count = "2", runs = "400", distance = "5", mascot = "save"] = process.argv.slice(2);
  const def = Object.values(MONSTERS).find((m) => m.name.toLowerCase() === name.toLowerCase());
  if (!def) throw new Error(`unknown monster ${name}`);
  const ids = Array.from({ length: Number(count) }, () => def.id);
  const n = Number(runs);
  console.log(`${count} x ${def.name} (hp ${def.health}, armor ${def.armor}, res_physical ${def.res_physical}, speed ${def.speed}) at ${distance} tiles, ${n} runs, mascot ${mascot}`);
  const party0 = loadParty();
  for (const c of party0.characters) console.log(`  ${c.name.padEnd(9)} ${c.classType.padEnd(8)} L${c.level} hp ${c.health}`);
  console.log("policy  win%   hp lost%  dead  down  rounds  approach  melee dmg  bow dmg");
  for (const policy of ["bow", "mixed", "melee"] as Policy[]) {
    const s = { won: 0, lost: 0, max: 0, dead: 0, down: 0, rounds: 0, appr: 0, melee: 0, ranged: 0 };
    for (let i = 0; i < n; i++) {
      const party = loadParty();
      if (mascot !== "save") party.mascot = mascot === "none" ? "" : mascot;
      const r = fight(party, ids, Number(distance), policy, `save:${name}:${policy}:${i}`);
      s.won += r.won ? 1 : 0;
      s.lost += r.lostHp;
      s.max += r.maxHp;
      s.dead += r.dead;
      s.down += r.down;
      s.rounds += r.rounds;
      s.appr += r.approach;
      s.melee += r.melee;
      s.ranged += r.ranged;
    }
    const f = (x: number, d = 2) => (x / n).toFixed(d);
    console.log(`${policy.padEnd(7)} ${((s.won / n) * 100).toFixed(0).padStart(4)}  ${((s.lost / s.max) * 100).toFixed(0).padStart(8)}  ${f(s.dead).padStart(4)}  ${f(s.down).padStart(4)}  ${f(s.rounds, 1).padStart(6)}  ${f(s.appr, 1).padStart(8)}  ${f(s.melee, 0).padStart(9)}  ${f(s.ranged, 0).padStart(7)}`);
  }
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("tools/balance/save.ts")) main();
