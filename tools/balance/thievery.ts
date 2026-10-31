/**
 * Thievery simulator: which difficulty (`difficulty`, the number a thievery roll has to reach) should a chest or door carry in a tier so that
 * a lock is "easy" (80 % success) or "hard" (50 % success)?
 *
 * The roll is the game's own (`thieveryRoll` in `src/sim/character.ts`): skill = floor(((lck + acc) / 2 + thievery) * level * 0.1), the roll is
 * uniform in [floor(skill / 3), skill]. The success chance is computed exactly (no dice) and checked against the real function by Monte Carlo.
 * Heroes: the ten classes x five races with the start attributes of `hero.ts` and the same attribute growth and typical gear per tier as the
 * combat simulator (lck/acc of the rings count, `attr()` adds worn items). Hero levels per tier: `pathLevels` of `challenge.ts` (the XP path).
 *
 * Usage: tsx tools/balance/thievery.ts [--xp[=0.5]] [--growth=none] [--salts=12] [--easy=0.8] [--hard=0.5] [--anchor=mid] [--ref=<name>] [--hardref=<name>]
 *   --xp      levels from the XP table (share of each tier cleared, default 0.5) instead of the fixed design bands (1 / 5 / 11 / 19 / 33 / 50)
 *   --anchor  level of the band the target chance is set for: entry | mid | exit | mean (default mid)
 *   --ref     reference for the easy lock: min | nothief | ninja | thief | max | party:<nothief|ninja|thief> (default nothief)
 *   --hardref reference for the hard lock (default thief)
 */
import { BASE_CLASS, BASE_RACE } from "../../src/data/tables";
import { Rng, seedFromString } from "../../src/core/rng";
import { createCharacter, thieveryRoll } from "../../src/sim/character";
import type { ClassName, RaceName } from "../../src/sim/types";
import { pathLevels } from "./challenge";
import { formulasFrom, growthFrom } from "./cli";
import { attrsAt, buildGear, CLASSES, gearForTier, RACES, type HeroSpec, type Growth } from "./hero";

// ---------------------------------------------------------------- the formula

/** Skill of a hero (same expression as `thieveryRoll`); `lck`/`acc` already include the worn items. */
export function skillOf(lck: number, acc: number, thievery: number, level: number): number {
  return Math.max(1, Math.floor(((lck + acc) / 2 + thievery) * level * 0.1));
}

/** Chance that one roll reaches `difficulty` (exact: the roll is uniform in [floor(skill / 3), skill]). */
export function successChance(skill: number, difficulty: number): number {
  const lo = Math.floor(skill / 3);
  if (difficulty <= lo) return 1;
  if (difficulty > skill) return 0;
  return (skill - difficulty + 1) / (skill - lo + 1);
}

// ---------------------------------------------------------------- heroes

const thieveryOf = (spec: HeroSpec): number => BASE_CLASS[spec.cls]!.thievery + BASE_RACE[spec.race]!.thievery;

/** The skills (one per gear roll) of a hero of a class and race at a level, with the typical gear of `tier`. */
export function skillsAt(spec: HeroSpec, level: number, tier: number, growth: Growth, salts: number): number[] {
  const attrs = attrsAt(spec, level, growth);
  const out: number[] = [];
  for (let salt = 0; salt < salts; salt++) {
    const g = buildGear(spec.cls, gearForTier(tier), salt);
    out.push(skillOf(attrs.lck + g.bonus.lck!, attrs.acc + g.bonus.acc!, thieveryOf(spec), level));
  }
  return out;
}

const mean = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;

export interface Profile {
  key: string;
  label: string;
  spec: HeroSpec;
}

/** Min, the median of the heroes without a thief skill, the median ninja, the median thief and max of all 50 class/race pairs. */
export function profiles(growth: Growth, salts: number): Profile[] {
  const all: (HeroSpec & { s: number })[] = [];
  for (const cls of CLASSES) for (const race of RACES) all.push({ cls, race, s: mean(skillsAt({ cls, race }, 10, 2, growth, salts)) });
  all.sort((a, b) => a.s - b.s);
  const median = (xs: typeof all): HeroSpec => xs[Math.floor((xs.length - 1) / 2)]!;
  const pick = (key: string, label: string, spec: HeroSpec): Profile => ({ key, label: `${label}: ${spec.race} ${spec.cls}`, spec: { cls: spec.cls, race: spec.race } });
  return [
    pick("min", "Min", all[0]!),
    pick("nothief", "Kein Dieb (Median)", median(all.filter((h) => h.cls !== "Thief" && h.cls !== "Ninja"))),
    pick("ninja", "Ninja (Median)", median(all.filter((h) => h.cls === "Ninja"))),
    pick("thief", "Dieb (Median)", median(all.filter((h) => h.cls === "Thief"))),
    pick("max", "Max", all[all.length - 1]!),
  ];
}

/** Parties to test with the best-of-party check the game uses for doors and king's chests. */
const PARTY_LINEUPS: Record<string, { label: string; heroes: HeroSpec[] }> = {
  nothief: { label: "Gruppe ohne Dieb/Ninja (Knight Orc, Cleric Human, Archer Human, Wizard Elf)", heroes: [h("Knight", "Orc"), h("Cleric", "Human"), h("Archer", "Human"), h("Wizard", "Elf")] },
  ninja: { label: "Gruppe mit Ninja (Knight Orc, Ninja Dwarf, Archer Human, Druid Gnome)", heroes: [h("Knight", "Orc"), h("Ninja", "Dwarf"), h("Archer", "Human"), h("Druid", "Gnome")] },
  thief: { label: "Gruppe mit Dieb (Knight Orc, Thief Gnome, Cleric Human, Wizard Elf)", heroes: [h("Knight", "Orc"), h("Thief", "Gnome"), h("Cleric", "Human"), h("Wizard", "Elf")] },
};
function h(cls: ClassName, race: RaceName): HeroSpec {
  return { cls, race };
}

// ---------------------------------------------------------------- tiers

export interface Band {
  tier: number;
  entry: number;
  exit: number;
  /** Levels the heroes have in this tier: entry .. exit (the next tier's entry level; tier 5: up to its exit). */
  levels: number[];
}

export function bands(levels: number[]): Band[] {
  const out: Band[] = [];
  for (let t = 1; t <= 5; t++) {
    const entry = levels[t - 1]!;
    const exit = Math.max(entry, t < 5 ? levels[t]! - 1 : levels[5]!);
    out.push({ tier: t, entry, exit, levels: Array.from({ length: exit - entry + 1 }, (_, i) => entry + i) });
  }
  return out;
}

/** A group of heroes that roll independently; the best roll counts (`handlers.ts`: doors, king's chests). */
type Group = HeroSpec[];

/** Chance that at least one hero of the group reaches `difficulty`, averaged over the gear rolls and over `levels`. */
function groupChance(group: Group, band: Band, difficulty: number, growth: Growth, salts: number, levelsOnly?: number[]): number {
  const levels = levelsOnly ?? band.levels;
  let total = 0;
  for (const level of levels) {
    for (let salt = 0; salt < salts; salt++) {
      let fail = 1;
      for (const spec of group) {
        const attrs = attrsAt(spec, level, growth);
        const g = buildGear(spec.cls, gearForTier(band.tier), salt);
        fail *= 1 - successChance(skillOf(attrs.lck + g.bonus.lck!, attrs.acc + g.bonus.acc!, thieveryOf(spec), level), difficulty);
      }
      total += 1 - fail;
    }
  }
  return total / (levels.length * salts);
}

/** The highest difficulty whose mean chance over the band is still at least `target` (0 if even difficulty 1 is missed). */
export function difficultyFor(group: Group, band: Band, target: number, growth: Growth, salts: number, levels?: number[]): number {
  let best = 0;
  for (let d = 1; d <= 2000; d++) {
    if (groupChance(group, band, d, growth, salts, levels) >= target) best = d;
    else break;
  }
  return best;
}

// ---------------------------------------------------------------- report

const pct = (x: number): string => `${Math.round(x * 100)}%`.padStart(4);

function options(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const arg of process.argv.slice(2)) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(arg);
    if (m) out[m[1]!] = m[2] ?? "true";
  }
  return out;
}

/** Cross-check: exact chance and skill against the game's `thieveryRoll` on real characters. */
function crossCheck(growth: Growth): void {
  const rng = new Rng(seedFromString("thievery:check"));
  let worst = 0;
  let cases = 0;
  for (const cls of CLASSES) {
    for (const race of RACES) {
      for (const level of [1, 7, 20, 45]) {
        const spec = { cls, race };
        const attrs = attrsAt(spec, level, growth);
        const c = createCharacter({ name: "x", classType: cls, raceType: race, avatar: "", attrs, level });
        c.level = level;
        const skill = skillOf(c.lck, c.acc, c.thievery, level);
        const difficulty = Math.max(1, Math.round(skill * 0.6));
        const n = 20000;
        let hit = 0;
        for (let i = 0; i < n; i++) if (thieveryRoll(c, rng) >= difficulty) hit++;
        worst = Math.max(worst, Math.abs(hit / n - successChance(skill, difficulty)));
        cases++;
      }
    }
  }
  console.log(`Pruefung gegen die echte thieveryRoll: ${cases} Helden, 20000 Wuerfe je Held, groesste Abweichung ${(worst * 100).toFixed(2)} Punkte (reines Rauschen: bis ca. 1.1)`);
}

function main(): void {
  const a = options();
  const growth = growthFrom(a);
  const salts = Number(a.salts ?? 12);
  const easy = Number(a.easy ?? 0.8);
  const hard = Number(a.hard ?? 0.5);
  const levels = pathLevels(formulasFrom("v4"), a.xp ? { share: a.xp === "true" ? "0.5" : a.xp } : { path: "bands" });
  const anchorOf = (b: Band): number[] => {
    const mid = Math.round((b.entry + b.exit) / 2);
    const anchor = a.anchor ?? "mid";
    return anchor === "entry" ? [b.entry] : anchor === "exit" ? [b.exit] : anchor === "mean" ? b.levels : [mid];
  };
  const tiers = bands(levels);
  const profs = profiles(growth, salts);

  console.log(`Wachstum der Attribute: ${growth.to === 0 ? "keins" : `auf ${growth.to} bei Stufe ${growth.atLevel}`}; Ausruestung: typisch fuer das Tier (${salts} Wuerfe); Pfad: ${a.xp ? "XP-Tabelle v4" : "feste Entwurfsbaender"}; Ziel gilt auf: ${a.anchor ?? "mid"}`);
  crossCheck(growth);

  console.log("\n== 1. Heldenstufen je Tier (Eintritt .. Austritt) ==");
  for (const b of tiers) console.log(`  L${b.tier}: Stufe ${b.entry} .. ${b.exit}`);

  console.log("\n== 2. Profile (Thievery aus Klasse + Rasse, Attribute und Ausruestung wie im Kampfsimulator) ==");
  for (const p of profs) console.log(`  ${p.label.padEnd(36)} Thievery ${String(thieveryOf(p.spec)).padStart(3)}`);

  console.log("\n== 3. Skill (Obergrenze des Wurfs; der Wurf liegt gleichverteilt zwischen einem Drittel und dem Skill), Stufe Eintritt / Mitte / Austritt ==");
  console.log("Profil".padEnd(38) + tiers.map((b) => `L${b.tier}`.padEnd(15)).join(""));
  for (const p of profs) {
    const cells = tiers.map((b) => {
      const mid = Math.round((b.entry + b.exit) / 2);
      const v = [b.entry, mid, b.exit].map((lv) => Math.round(mean(skillsAt(p.spec, lv, b.tier, growth, salts))));
      return v.join("/").padEnd(15);
    });
    console.log(p.label.padEnd(38) + cells.join(""));
  }

  const groups: Record<string, { label: string; group: Group }> = {};
  for (const p of profs) groups[p.key] = { label: p.label, group: [p.spec] };
  for (const [k, v] of Object.entries(PARTY_LINEUPS)) groups[`party:${k}`] = { label: v.label, group: v.heroes };

  console.log(`\n== 4. Schwierigkeit, bei der die Probe im Mittel ueber das Tier ${pct(easy)} (leicht) bzw. ${pct(hard)} (schwer) gelingt, je Bezugsheld ==`);
  console.log("Bezug".padEnd(40) + "Ziel  " + tiers.map((b) => `L${b.tier}`.padStart(6)).join(""));
  for (const [key, g] of Object.entries(groups)) {
    for (const target of [easy, hard]) {
      const row = tiers.map((b) => String(difficultyFor(g.group, b, target, growth, salts, anchorOf(b))).padStart(6));
      console.log(g.label.slice(0, 38).padEnd(40) + pct(target).padEnd(6) + row.join(""));
    }
    if (key === "max") console.log("");
  }

  const easyRef = groups[a.ref ?? "nothief"];
  const hardRef = groups[a.hardref ?? "thief"];
  if (!easyRef || !hardRef) throw new Error(`unknown --ref/--hardref (known: ${Object.keys(groups).join(", ")})`);
  console.log(`\n== 5. Vorschlag: leichte Kiste = ${easy * 100} % fuer "${easyRef.label}", schwere Kiste (Koenig) = ${hard * 100} % fuer "${hardRef.label}" ==`);
  const dEasy = tiers.map((b) => difficultyFor(easyRef.group, b, easy, growth, salts, anchorOf(b)));
  const dHard = tiers.map((b) => difficultyFor(hardRef.group, b, hard, growth, salts, anchorOf(b)));
  console.log("Tier".padEnd(6) + "leicht".padStart(8) + "schwer".padStart(8));
  tiers.forEach((b, i) => console.log(`L${b.tier}`.padEnd(6) + String(dEasy[i]).padStart(8) + String(dHard[i]).padStart(8)));

  for (const [name, ds] of [["leichte Kiste", dEasy], ["schwere Kiste (Koenigstruhe)", dHard]] as const) {
    console.log(`\nErfolgschance an der ${name} mit dem Vorschlag, Stufe Eintritt / Mitte / Austritt des Tiers:`);
    console.log("Wer".padEnd(40) + tiers.map((b) => `L${b.tier}`.padEnd(16)).join(""));
    for (const [, g] of Object.entries(groups)) {
      const cells = tiers.map((b, i) => {
        const mid = Math.round((b.entry + b.exit) / 2);
        return [b.entry, mid, b.exit].map((lv) => pct(groupChance(g.group, b, ds[i]!, growth, salts, [lv]))).join(" ").padEnd(16);
      });
      console.log(g.label.slice(0, 38).padEnd(40) + cells.join(""));
    }
  }
}

if (process.argv[1]?.endsWith("thievery.ts")) main();
