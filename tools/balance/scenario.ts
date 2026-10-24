/**
 * Scenarios: a party of a given level meets groups of monsters of a tier, many times, and the results are averaged.
 * Monsters are picked exactly like the generator picks them (`pickMonster` per theme), groups like the dungeon rules (1 + rand(0, tier)).
 */
import { Rng, seedFromString } from "../../src/core/rng";
import { MONSTERS, type MonsterDef } from "../../src/data/tables";
import { MONSTER_THEME_NAMES, hasLandMonster, pickMonster } from "../../src/data/monsters";
import { DEFAULT_ENV, type FightEnv, type FightResult, type HeroRun, newRun, recover, rest, runFight } from "./fight";
import { CURRENT, type Formulas } from "./formulas";
import { type GearSpec, type Growth, GROWTH_USER, type PartyDef, gearForTier, makeHero } from "./hero";
import { R, hashSeed } from "./rng";
import { measureSupply } from "./supply";

// ---------------------------------------------------------------- monsters

const poolCache = new Map<number, { def: MonsterDef; w: number }[]>();

/** The monsters the generator puts into a tier and how likely each is (empirical, over all land themes with equal weight). */
export function tierPool(tier: number, samples = 6000): { def: MonsterDef; w: number }[] {
  const cached = poolCache.get(tier);
  if (cached) return cached;
  const rng = new Rng(seedFromString(`balance:pool:${tier}`));
  const themes = MONSTER_THEME_NAMES.filter((t) => hasLandMonster(t));
  const count = new Map<number, { def: MonsterDef; w: number }>();
  for (let i = 0; i < samples; i++) {
    const def = pickMonster(rng, themes[rng.int(themes.length)]!, tier, false);
    const e = count.get(def.id) ?? { def, w: 0 };
    e.w++;
    count.set(def.id, e);
  }
  const list = [...count.values()].sort((a, b) => a.def.id - b.def.id);
  poolCache.set(tier, list);
  return list;
}

export function drawMonster(pool: { def: MonsterDef; w: number }[], rng: R): MonsterDef {
  let total = 0;
  for (const e of pool) total += e.w;
  let roll = rng.float() * total;
  for (const e of pool) {
    roll -= e.w;
    if (roll < 0) return e.def;
  }
  return pool[pool.length - 1]!.def;
}

/** A group like the dungeon rules make it: `1 + rand(0, tier)` monsters. */
export function drawGroup(tier: number, rng: R, size?: number): MonsterDef[] {
  const pool = tierPool(tier);
  const n = size ?? 1 + rng.int(Math.round(tier) + 1);
  return Array.from({ length: n }, () => drawMonster(pool, rng));
}

const worldCache = new Map<number, MonsterDef[][]>();

/** The groups the generator really placed in three worlds (wild groups, rooms, bosses), by tier: the encounters of the game as they are. */
export function worldGroups(tier: number): MonsterDef[][] {
  const t = Math.min(5, Math.max(1, Math.round(tier)));
  const cached = worldCache.get(t);
  if (cached) return cached;
  const out: MonsterDef[][] = [];
  for (const seed of ["alpha", "beta", "gamma"]) {
    for (const g of measureSupply(seed, "default").groups) if (g.tier === t) out.push(g.ids.map((id) => MONSTERS[id]!));
  }
  worldCache.set(t, out);
  return out;
}

/** Names left out of the class pools (environment `BALANCE_EXCLUDE=Terminator,Minotaur`): shows how much single monsters decide a tier. */
const EXCLUDED = new Set((process.env.BALANCE_EXCLUDE ?? "").split(",").filter(Boolean));

/** Land monsters of exactly this difficulty class (`treasure_level`, the old game's own 1 to 5 rating). */
export function classPool(level: number): { def: MonsterDef; w: number }[] {
  return Object.values(MONSTERS)
    .filter((m) => m.id < 1000 && m.treasure_level === level && m.terrain === "land" && !EXCLUDED.has(m.name))
    .map((def) => ({ def, w: 1 }));
}

/** A group of monsters of one difficulty class, sized like the groups the generator places in a place of that tier. */
export function drawClassGroup(level: number, rng: R): MonsterDef[] {
  const sizes = worldGroups(level).map((g) => g.length);
  const n = sizes[rng.int(sizes.length)] ?? 1;
  const pool = classPool(level);
  return Array.from({ length: n }, () => drawMonster(pool, rng));
}

// ---------------------------------------------------------------- cells

export interface Scenario {
  party: PartyDef;
  level: number;
  tier: number;
  gear: GearSpec;
  growth: Growth;
  env: FightEnv;
  F: Formulas;
  /** Independent runs. */
  runs: number;
  /** Fights in a row without a rest (1 = the party rests after every fight). */
  chain: number;
  /** Fixed group size, else the generator's rule. */
  groupSize?: number;
  /**
   * "class" (default): groups of monsters of exactly this difficulty class, sized like the generator's groups of that tier (a clean reading of
   * "tier t"); "world": the groups the generator really placed in three worlds (mixed classes, bosses); "pool": monsters drawn like the
   * generator does, groups of 1 + rand(0, tier).
   */
  groups?: "class" | "world" | "pool";
  /** Fixed monster (every group member), for per-monster tables. */
  monster?: MonsterDef;
  seed?: string;
}

export interface CellStats {
  fights: number;
  winRate: number;
  /** Heroes who went to 0 hit points per fight. */
  down: number;
  /** Heroes who died per fight. */
  dead: number;
  /** Share of fights in which at least one hero died. */
  anyDead: number;
  hpLostPct: number;
  spUsedPct: number;
  rounds: number;
  battleRounds: number;
  /** XP of the monsters killed per fight (every active hero gets that much). */
  xp: number;
  gold: number;
  kills: number;
  /** Damage shares by kind. */
  shareMelee: number;
  shareRanged: number;
  shareSpell: number;
  /** Mean group size. */
  group: number;
}

const zero = (): CellStats => ({ fights: 0, winRate: 0, down: 0, dead: 0, anyDead: 0, hpLostPct: 0, spUsedPct: 0, rounds: 0, battleRounds: 0, xp: 0, gold: 0, kills: 0, shareMelee: 0, shareRanged: 0, shareSpell: 0, group: 0 });

function addResult(s: CellStats, r: FightResult, group: number): void {
  s.fights++;
  if (r.won) s.winRate++;
  s.down += r.down;
  s.dead += r.dead;
  if (r.dead > 0) s.anyDead++;
  s.hpLostPct += r.hpMax > 0 ? r.hpLost / r.hpMax : 0;
  s.spUsedPct += r.spMax > 0 ? r.spUsed / r.spMax : 0;
  s.rounds += r.rounds;
  s.battleRounds += r.battleRounds;
  s.xp += r.monsterXp;
  s.gold += r.gold;
  s.kills += r.kills;
  s.shareMelee += r.dealt.melee;
  s.shareRanged += r.dealt.ranged;
  s.shareSpell += r.dealt.spell;
  s.group += group;
}

function finish(s: CellStats): CellStats {
  const n = Math.max(1, s.fights);
  const dmg = Math.max(1, s.shareMelee + s.shareRanged + s.shareSpell);
  return {
    fights: s.fights,
    winRate: s.winRate / n,
    down: s.down / n,
    dead: s.dead / n,
    anyDead: s.anyDead / n,
    hpLostPct: s.hpLostPct / n,
    spUsedPct: s.spUsedPct / n,
    rounds: s.rounds / n,
    battleRounds: s.battleRounds / n,
    xp: s.xp / n,
    gold: s.gold / n,
    kills: s.kills / n,
    shareMelee: s.shareMelee / dmg,
    shareRanged: s.shareRanged / dmg,
    shareSpell: s.shareSpell / dmg,
    group: s.group / n,
  };
}

/** `salt` varies the rolled rings and so on between independent runs, so that one lucky ring does not decide a whole table. */
export function buildRuns(sc: Pick<Scenario, "party" | "level" | "gear" | "growth" | "F" | "env">, salt = 0): HeroRun[] {
  return sc.party.members.map((spec, i) => newRun(makeHero(spec, sc.level, sc.growth, sc.gear, salt * 4 + i), sc.F, sc.env.mascot));
}

/** Runs a scenario. Returns the first fight of every run (fresh, full resources) and all fights of the chains together. */
export function runCell(sc: Scenario): { fresh: CellStats; all: CellStats } {
  // with an explicit seed the dice do not depend on the formulas, so two candidates are compared on the same rolls
  const rng = new R(hashSeed([sc.seed ?? "cell", sc.party.name, sc.level, sc.tier, sc.env.mascot, sc.gear.name, sc.seed ? "" : sc.F.id].join("|")));
  const fresh = zero();
  const all = zero();
  for (let run = 0; run < sc.runs; run++) {
    const heroes = buildRuns(sc, run % 24);
    for (let j = 0; j < sc.chain; j++) {
      let group: MonsterDef[];
      if (sc.monster) group = Array.from({ length: sc.groupSize ?? 1 }, () => sc.monster!);
      else if (sc.groupSize !== undefined || sc.groups === "pool") group = drawGroup(sc.tier, rng, sc.groupSize);
      else if (sc.groups === "world") {
        const pool = worldGroups(sc.tier);
        group = pool[rng.int(pool.length)]!;
      } else group = drawClassGroup(sc.tier, rng);
      const r = runFight(heroes, group, sc.env, sc.F, rng);
      addResult(all, r, group.length);
      if (j === 0) addResult(fresh, r, group.length);
      if (!r.won || heroes.every((h) => h.st === 2)) break;
      recover(heroes);
    }
    rest(heroes);
  }
  return { fresh: finish(fresh), all: finish(all) };
}

/** Handy default scenario; tweak the fields you need. */
export function scenario(over: Partial<Scenario> & Pick<Scenario, "party" | "level" | "tier">): Scenario {
  return {
    gear: gearForTier(over.tier),
    growth: GROWTH_USER,
    env: DEFAULT_ENV,
    F: CURRENT,
    runs: 60,
    chain: 1,
    ...over,
  };
}
