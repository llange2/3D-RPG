/**
 * Fast abstract fight engine: the rules of `sim/encounter.ts` and `sim/combat.ts` without a map. The party meets a group of monsters at
 * a distance, may shoot while they walk up (free roam: one action for the whole party, then the monsters move), and once a monster is
 * adjacent every hero acts in speed order before the monsters answer. All formulas come from a `Formulas` object.
 */
import { type MonsterDef } from "../../src/data/tables";
import { type AttackSpell, type Hero, type HealSpell, spellsOf } from "./hero";
import { type Formulas, type Mascot } from "./formulas";
import { R } from "./rng";

export interface FightEnv {
  /** Tiles between the party and the nearest monster when the fight starts. */
  startDistance: number;
  /** How many monsters can stand next to the party (corridor 1, hall 4). */
  maxAdjacent: number;
  /** Share of the other monsters a penetrating spell also hits. */
  lineShare: number;
  mascot: Mascot;
  /** Shoot while the monsters walk up. */
  openingVolley: boolean;
  /** A hero may use the bow on an adjacent monster. */
  rangedInMelee: boolean;
  /** Heroes cast spells (attack and heal). */
  spells: boolean;
  /** A hero heals when somebody is below this share of their health (or down). */
  healBelow: number;
  /** A spell may cost at most this share of the caster's current mana (keeps some for later rounds). */
  manaShare: number;
}

export const DEFAULT_ENV: FightEnv = {
  startDistance: 5,
  maxAdjacent: 3,
  lineShare: 0.5,
  mascot: "none",
  openingVolley: true,
  rangedInMelee: true,
  spells: true,
  healBelow: 0.4,
  manaShare: 0.34,
};

/** 0 fine, 1 unconscious, 2 dead, 3 paralyzed or asleep, 4 petrified. */
type State = 0 | 1 | 2 | 3 | 4;

export interface HeroRun {
  h: Hero;
  maxHp: number;
  maxSp: number;
  hp: number;
  sp: number;
  st: State;
  lost: number;
  xp: number;
  wentDown: boolean;
  attack: AttackSpell[];
  heal: HealSpell[];
  hasBow: boolean;
  /** Damage dealt, by kind, for the reports. */
  dealt: { melee: number; ranged: number; spell: number };
}

export function newRun(h: Hero, F: Formulas, mascot: Mascot): HeroRun {
  const maxHp = F.maxHp(h);
  const maxSp = F.maxMana(h, mascot);
  const sp = spellsOf(h.cls, h.level);
  return { h, maxHp, maxSp, hp: maxHp, sp: maxSp, st: 0, lost: 0, xp: 0, wentDown: false, attack: sp.attack, heal: sp.heal, hasBow: h.rangedMax > 0, dealt: { melee: 0, ranged: 0, spell: 0 } };
}

export interface FightResult {
  won: boolean;
  rounds: number;
  /** Rounds in which monsters were adjacent. */
  battleRounds: number;
  hpLost: number;
  hpMax: number;
  /** Heroes who went to 0 hit points at some point (including the dead). */
  down: number;
  dead: number;
  spUsed: number;
  spMax: number;
  gold: number;
  kills: number;
  /** Total XP of the monsters killed (before the hook), per hero who could act: see `HeroRun.xp`. */
  monsterXp: number;
  dealt: { melee: number; ranged: number; spell: number };
}

interface Mon {
  d: MonsterDef;
  hp: number;
  max: number;
}

const SPECIAL_COND: Record<string, State> = { Dead: 2, Eradication: 2, Unconscious: 1, Paralyzed: 3, Sleeping: 3, Petrified: 4 };

function specialState(d: MonsterDef): State | null {
  const text = d.special_abilties ?? "";
  const at = text.indexOf("Causes");
  if (at < 0) return null;
  const word = text.slice(at + 6).trim().split(/\s+/)[0]?.replace(/[,.;:]+$/g, "") ?? "";
  return SPECIAL_COND[word] ?? null;
}

const alive = (m: Mon): boolean => m.hp > 0;

export function runFight(party: HeroRun[], defs: MonsterDef[], env: FightEnv, F: Formulas, rng: R): FightResult {
  const mons: Mon[] = defs.map((d) => ({ d, hp: d.health, max: d.health }));
  const specials = defs.map((d) => specialState(d));
  const res: FightResult = { won: false, rounds: 0, battleRounds: 0, hpLost: 0, hpMax: 0, down: 0, dead: 0, spUsed: 0, spMax: 0, gold: 0, kills: 0, monsterXp: 0, dealt: { melee: 0, ranged: 0, spell: 0 } };
  const sp0 = party.map((p) => p.sp);
  let dist = env.startDistance;

  const acts = (p: HeroRun): boolean => p.st === 0;
  const targetable = (p: HeroRun): boolean => p.st === 0 || p.st === 3;
  const front = (): Mon[] => {
    const list = mons.filter(alive);
    return dist <= 1 ? list.slice(0, env.maxAdjacent) : list;
  };
  /** Damage factor of attack spells (the Orb in the v4 proposal; 1 in the game). */
  const orb = env.mascot === "Orb" ? 1 + F.orbSpell : 1;
  const weakest = (list: Mon[]): Mon => list.reduce((a, b) => (b.hp < a.hp ? b : a));

  const kill = (m: Mon): void => {
    const xp = Math.floor(m.d.xp * F.monsterXp(m.d));
    res.kills++;
    res.gold += m.d.gold;
    res.monsterXp += xp;
    for (const p of party) if (acts(p)) p.xp += xp;
  };
  /** Damage on a monster, then the Wolf and the kill. */
  const hurt = (m: Mon, dmg: number): void => {
    if (!alive(m)) return;
    m.hp -= dmg;
    if (m.hp > 0 && env.mascot === "Wolf" && m.d.treasure_level <= F.wolfMaxTier && m.hp < m.max * F.wolfBelow) m.hp = 0;
    if (m.hp <= 0) kill(m);
  };

  const heal = (p: HeroRun, amount: number): void => {
    if (p.st === 2 || p.st === 4) return;
    p.hp = Math.max(p.hp, Math.min(p.maxHp, p.hp + amount));
    if (amount > 0 && p.hp > 0 && p.st === 1) p.st = 0;
  };

  const hitHero = (p: HeroRun, dmg: number, special: State | null, melee: boolean): void => {
    if (dmg > 0) {
      p.hp -= dmg;
      p.lost += dmg;
    }
    if (special !== null && melee && dmg > 0 && rng.float() < F.specialChance(p.h, special === 2) && p.st !== 2) {
      if (special === 2) p.st = 2;
      else if (p.st === 0) p.st = special;
      if (special === 1 || special === 2) p.wentDown = true;
    }
    if (p.hp <= 0 && p.st !== 2) {
      const killed = dmg > Math.floor(p.maxHp * F.deathHit + 1e-9) || p.hp <= -Math.floor(p.maxHp * F.deathBelow + 1e-9);
      p.st = killed ? 2 : 1;
      p.wentDown = true;
    }
  };

  // ------------------------------------------------------------ the party's options
  const meanMelee = (p: HeroRun, m: Mon): number => F.meleeDamage(p.h, m.d, (p.h.damMin + p.h.damMax) / 2);
  const meanRanged = (p: HeroRun, m: Mon, d: number): number => F.rangedHitChance(p.h, m.d, d) * F.rangedDamage(p.h, m.d, (p.h.rangedMin + p.h.rangedMax) / 2);

  const spellMean = (p: HeroRun, s: AttackSpell, target: Mon, aliveCount: number): number => {
    const per = ((s.min + s.max) / 2) * (s.scales ? p.h.level : 1);
    let r = 0;
    for (const t of s.types) r += (target.d[`res_${t}` as "res_fire"] as number | undefined) ?? 0;
    const hit = per * (1 - r / s.types.length) * orb;
    const count = s.area ? aliveCount : s.penetrating ? 1 + (aliveCount - 1) * env.lineShare : 1;
    return hit * count;
  };

  const bestSpell = (p: HeroRun, target: Mon, aliveCount: number): { s: AttackSpell; e: number } | null => {
    if (!env.spells || p.attack.length === 0) return null;
    const cap = Math.max(1, p.sp * env.manaShare);
    let best: { s: AttackSpell; e: number } | null = null;
    for (const s of p.attack) {
      if (s.mana > p.sp || s.mana > cap) continue;
      const e = spellMean(p, s, target, aliveCount);
      if (!best || e > best.e) best = { s, e };
    }
    return best;
  };

  const castAttack = (p: HeroRun, s: AttackSpell, target: Mon): void => {
    p.sp -= s.mana;
    const type = s.types[rng.int(s.types.length)]!;
    const others = mons.filter((m) => alive(m) && m !== target);
    const hits: Mon[] = [target];
    for (const m of others) if (s.area || (s.penetrating && rng.float() < env.lineShare)) hits.push(m);
    for (const m of hits) {
      let dmg = rng.range(s.min, s.max);
      if (s.scales) dmg *= p.h.level;
      dmg *= orb;
      const res =((m.d[`res_${type}` as "res_fire"] as number | undefined) ?? 0) as number;
      dmg -= Math.trunc(dmg * res);
      p.dealt.spell += Math.max(0, Math.min(dmg, m.hp));
      hurt(m, dmg);
    }
    if (s.healAll > 0) for (const o of party) heal(o, s.healAll);
  };

  const castHeal = (p: HeroRun): boolean => {
    if (!env.spells || p.heal.length === 0) return false;
    // the one who needs it most: down first, then the lowest share
    let target: HeroRun | null = null;
    for (const o of party) {
      if (o.st === 2 || o.st === 4) continue;
      const frac = o.st === 1 ? -1 : o.hp / o.maxHp;
      if (frac > env.healBelow) continue;
      if (!target || frac < (target.st === 1 ? -1 : target.hp / target.maxHp)) target = o;
    }
    if (!target) return false;
    const deficit = target.maxHp - target.hp;
    let pick: HealSpell | null = null;
    let pickAmount = 0;
    for (const s of p.heal) {
      if (s.mana > p.sp) continue;
      const amount = ((s.min + s.max) / 2) * (s.scales ? p.h.level : 1);
      const enough = amount >= deficit * 0.7;
      const pickEnough = pickAmount >= deficit * 0.7;
      if (!pick || (enough && !pickEnough) || (enough && pickEnough && s.mana < pick.mana) || (!enough && !pickEnough && amount > pickAmount)) {
        pick = s;
        pickAmount = amount;
      }
    }
    if (!pick) return false;
    p.sp -= pick.mana;
    heal(target, rng.range(pick.min, pick.max) * (pick.scales ? p.h.level : 1));
    return true;
  };

  const shoot = (p: HeroRun, m: Mon, d: number): number => {
    if (!(rng.float() <= F.rangedHitChance(p.h, m.d, d))) return 0;
    return F.rangedDamage(p.h, m.d, rng.range(Math.min(p.h.rangedMin, p.h.rangedMax), Math.max(p.h.rangedMin, p.h.rangedMax)));
  };
  const strike = (p: HeroRun, m: Mon): number => F.meleeDamage(p.h, m.d, rng.range(Math.min(p.h.damMin, p.h.damMax), Math.max(p.h.damMin, p.h.damMax)));

  // ------------------------------------------------------------ monsters' turn
  const monsterTurn = (): void => {
    if (dist > 1) dist -= 1;
    const live = mons.filter(alive);
    live.forEach((m, idx) => {
      const adjacent = dist <= 1 && idx < env.maxAdjacent;
      const special = specials[mons.indexOf(m)] ?? null;
      for (let n = 0; n < m.d.no_of_attacks; n++) {
        let cands = party.filter(targetable);
        if (cands.length === 0) return;
        if (m.d.preferred_enemy) {
          const match = cands.filter((p) => p.h.cls.includes(m.d.preferred_enemy!));
          if (match.length > 0) cands = match;
        }
        const t = cands[rng.int(cands.length)]!;
        if (!adjacent && !m.d.special_abilties?.includes("Ranged Attack")) continue;
        const distance = adjacent ? 1 : Math.max(2, dist);
        const roll = rng.range(Math.min(m.d.damage_min, m.d.damage_max), Math.max(m.d.damage_min, m.d.damage_max));
        const dmg = F.monsterDamage(m.d, t.h, { damage: roll, hit: rng.float(), evade: rng.float(), ranged: !adjacent, distance, fairy: env.mascot === "Fairy" ? F.fairyReduction : 0 });
        hitHero(t, dmg, special, adjacent);
      }
    });
  };

  // ------------------------------------------------------------ the loop
  for (;;) {
    if (mons.every((m) => !alive(m))) {
      res.won = true;
      break;
    }
    if (!party.some(acts) || res.rounds >= 150) break;
    res.rounds++;
    if (dist > 1) {
      // free roam: the whole party shoots, or one hero casts
      const live = mons.filter(alive);
      const target = weakest(live);
      let volley = 0;
      if (env.openingVolley) for (const p of party) if (acts(p) && p.hasBow) volley += meanRanged(p, target, dist);
      let spell: { p: HeroRun; s: AttackSpell; e: number } | null = null;
      for (const p of party) {
        if (!acts(p)) continue;
        const b = bestSpell(p, target, live.length);
        if (b && (!spell || b.e > spell.e)) spell = { p, s: b.s, e: b.e };
      }
      if (spell && spell.e > volley) castAttack(spell.p, spell.s, target);
      else if (volley > 0) {
        let total = 0;
        for (const p of party) {
          if (!acts(p) || !p.hasBow) continue;
          const dmg = shoot(p, target, dist);
          p.dealt.ranged += Math.max(0, Math.min(dmg, target.hp));
          total += dmg;
        }
        hurt(target, total);
      }
      monsterTurn();
      continue;
    }
    res.battleRounds++;
    const order = party.filter(acts).sort((a, b) => b.h.spd - a.h.spd);
    for (const p of order) {
      if (!acts(p)) continue;
      const live = mons.filter(alive);
      if (live.length === 0) break;
      if (castHeal(p)) continue;
      const near = front();
      const target = weakest(near);
      let wEv = meanMelee(p, target);
      let useBow = false;
      if (env.rangedInMelee && p.hasBow) {
        const r = meanRanged(p, target, 1);
        if (r > wEv) {
          wEv = r;
          useBow = true;
        }
      }
      const b = bestSpell(p, target, live.length);
      if (b && b.e > wEv * 1.05) castAttack(p, b.s, target);
      else if (useBow) {
        const dmg = shoot(p, target, 1);
        p.dealt.ranged += Math.max(0, Math.min(dmg, target.hp));
        hurt(target, dmg);
      } else {
        const dmg = strike(p, target);
        p.dealt.melee += Math.max(0, Math.min(dmg, target.hp));
        hurt(target, dmg);
      }
    }
    if (mons.every((m) => !alive(m))) {
      res.won = true;
      break;
    }
    monsterTurn();
  }

  party.forEach((p, i) => {
    res.hpLost += Math.min(p.lost, p.maxHp);
    res.hpMax += p.maxHp;
    if (p.wentDown) res.down++;
    if (p.st === 2) res.dead++;
    res.spUsed += sp0[i]! - p.sp;
    res.spMax += p.maxSp;
    res.dealt.melee += p.dealt.melee;
    res.dealt.ranged += p.dealt.ranged;
    res.dealt.spell += p.dealt.spell;
  });
  return res;
}

/** Between two fights without a rest: whoever was down is up with one hit point at least, paralysis and sleep wear off, the dead stay dead. */
export function recover(party: HeroRun[]): void {
  for (const p of party) {
    p.lost = 0;
    p.wentDown = false;
    p.dealt = { melee: 0, ranged: 0, spell: 0 };
    if (p.st === 2) continue;
    p.st = 0;
    if (p.hp < 1) p.hp = 1;
  }
}

/** A night's rest: everybody alive is whole again, dead heroes are raised (a temple's price is not modelled, the deaths are counted). */
export function rest(party: HeroRun[]): void {
  for (const p of party) {
    p.st = 0;
    p.hp = p.maxHp;
    p.sp = p.maxSp;
    p.lost = 0;
    p.wentDown = false;
    p.dealt = { melee: 0, ranged: 0, spell: 0 };
  }
}
