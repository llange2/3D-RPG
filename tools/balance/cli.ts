/**
 * Command line of the balance tool. Usage: tsx tools/balance/cli.ts <command> [--key=value ...]   (see README.md)
 *
 *   grid      level x tier table for one party (win rate, heroes down, hit points lost, rounds, XP)
 *   compare   the same grid for two formula sets side by side
 */
import { DEFAULT_ENV, type FightEnv } from "./fight";
import { CURRENT, type Formulas, type Mascot } from "./formulas";
import { GEAR, gearByName, GROWTH_NONE, GROWTH_USER, type Growth, PARTIES, gearForTier } from "./hero";
import { formulasByName } from "./proposals";
import { type CellStats, runCell, scenario } from "./scenario";
import { dummy, heroPower, roundPower } from "./power";
import { CLASSES, defaultSpec } from "./hero";
import { POLICY_BRAVE, POLICY_CAREFUL, journey } from "./journey";

export function args(): Record<string, string> {
  const out: Record<string, string> = { _cmd: process.argv[2] ?? "grid" };
  for (const a of process.argv.slice(3)) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
    if (m) out[m[1]!] = m[2] ?? "true";
  }
  return out;
}

export const nums = (s: string | undefined, dflt: number[]): number[] => (s ? s.split(",").flatMap((p) => (p.includes("-") ? range(p) : [Number(p)])) : dflt);
function range(p: string): number[] {
  const [a, b, step] = p.split("-").map(Number) as [number, number, number | undefined];
  const out: number[] = [];
  for (let x = a; x <= b; x += step ?? 1) out.push(x);
  return out;
}

export function envFrom(a: Record<string, string>): FightEnv {
  const e: FightEnv = { ...DEFAULT_ENV };
  if (a.mascot) e.mascot = a.mascot as Mascot;
  if (a.distance) e.startDistance = Number(a.distance);
  if (a.adjacent) e.maxAdjacent = Number(a.adjacent);
  if (a["no-volley"]) e.openingVolley = false;
  if (a["no-bow-melee"]) e.rangedInMelee = false;
  if (a["no-spells"]) e.spells = false;
  return e;
}

export function groupsFrom(a: Record<string, string>): "class" | "world" | "pool" {
  return (a.groups as "class" | "world" | "pool" | undefined) ?? "class";
}

export function growthFrom(a: Record<string, string>): Growth {
  if (a.growth === "none") return GROWTH_NONE;
  return { to: Number(a["attr-to"] ?? GROWTH_USER.to), atLevel: Number(a["attr-at"] ?? GROWTH_USER.atLevel) };
}

export function formulasFrom(name: string | undefined): Formulas {
  return formulasByName(name);
}

const pct = (x: number): string => `${Math.round(x * 100)}%`.padStart(4);
const f1 = (x: number): string => x.toFixed(1);

export function cellText(c: CellStats): string {
  return `${pct(c.winRate)} dn${c.down.toFixed(1)} dd${c.dead.toFixed(2)} hp${pct(c.hpLostPct)} r${f1(c.rounds).padStart(4)}`;
}

function powerTable(a: Record<string, string>): void {
  const F = formulasFrom(a.formulas);
  const levels = nums(a.levels, [1, 3, 5, 10, 15, 20, 25, 30, 40, 50]);
  const growth = growthFrom(a);
  const mon = dummy(Number(a["mon-armor"] ?? 15), Number(a["mon-speed"] ?? 30));
  const bands = BANDS;
  const gearAt = (l: number) => gearForTier(bands.filter((b) => b <= l).length);
  console.log(`Formeln: ${F.id}; Monster: Armor ${mon.armor}, Speed ${mon.speed}; Ausruestung: typisch fuer das Tier der Stufe (Baender ab Stufe ${bands.join("/")})`);
  console.log("klasse     lvl |   HP  mana | nahk. | fern(1) fern(4) | zauber/cast  /mana  casts | armor");
  for (const cls of CLASSES) {
    for (const level of levels) {
      const p = heroPower(F, defaultSpec(cls), level, growth, gearAt(level), mon);
      console.log(`${cls.padEnd(10)} ${String(level).padStart(3)} | ${String(Math.round(p.hp)).padStart(4)} ${String(Math.round(p.mana)).padStart(5)} | ${String(Math.round(p.meleeHit)).padStart(5)} | ${String(Math.round(p.rangedHit1)).padStart(7)} ${String(Math.round(p.rangedHit4)).padStart(7)} | ${String(Math.round(p.spellCast)).padStart(11)} ${p.spellPerMana.toFixed(1).padStart(6)} ${String(Math.round(p.spellCasts)).padStart(6)} | ${Math.round(p.armor)}`);
    }
  }
}

function journeyTable(a: Record<string, string>): void {
  const party = PARTIES[Number(a.party ?? 0)]!;
  const sets = a._cmd === "journey-compare" ? [CURRENT, formulasFrom(a.proposal)] : [formulasFrom(a.formulas)];
  for (const F of sets) {
    const rows = journey({
      party,
      F,
      env: envFrom(a),
      growth: growthFrom(a),
      policy: a.careful ? POLICY_CAREFUL : POLICY_BRAVE,
      maxLevel: Number(a.maxlevel ?? 50),
      runs: Number(a.runs ?? 40),
      gearLag: Number(a["gear-lag"] ?? 0),
      startGold: 5000,
      maxFights: Number(a["max-fights"] ?? 20000),
      fixedTier: a.tier ? Number(a.tier) : null,
      groups: groupsFrom(a),
    });
    console.log(`
=== ${F.id}: ${party.name}`);
    console.log("level | tier | kaempfe | gesamt | XP/Kampf | Gold/K | Sieg | HP-Verl | Tote | Gold?");
    for (const r of rows) console.log(`${String(r.level).padStart(5)} | ${String(r.tier).padStart(4)} | ${String(r.fights).padStart(7)} | ${String(r.cumFights).padStart(6)} | ${String(Math.round(r.xpPerFight)).padStart(8)} | ${String(Math.round(r.goldPerFight)).padStart(6)} | ${pct(r.win)} | ${pct(r.hpLoss)}    | ${r.dead.toFixed(2)} | ${r.goldBound ? "ja" : ""}`);
  }
}

/** Tier a level is meant for (design bands; the start levels of the tiers). */
export const BANDS = [1, 5, 11, 19, 33];
export const tierOf = (level: number, bands = BANDS): number => Math.max(1, bands.filter((b) => b <= level).length);

function archetypes(a: Record<string, string>): void {
  const F = formulasFrom(a.formulas);
  const levels = nums(a.levels, [1, 3, 4, 6, 9, 12, 16, 20, 25, 32, 40]);
  const runs = Number(a.runs ?? 80);
  const env = envFrom(a);
  const growth = growthFrom(a);
  console.log(`Formeln: ${F.id}   Tier je Stufe nach Baendern ab ${BANDS.join("/")}   mascot ${env.mascot}`);
  console.log("party".padEnd(46) + levels.map((l) => `L${l}`.padStart(22)).join(""));
  for (const party of PARTIES) {
    let line = party.name.padEnd(46);
    for (const level of levels) {
      const tier = tierOf(level);
      const { fresh } = runCell(scenario({ party, level, tier, runs, env, growth, F, groups: groupsFrom(a) }));
      line += `${pct(fresh.winRate)} d${fresh.dead.toFixed(2)} h${pct(fresh.hpLostPct)} f${pct(fresh.shareRanged)}`.padStart(22);
    }
    console.log(line);
  }
  console.log("(Sieg, d = Tote je Kampf, h = HP-Verlust, f = Anteil Fernkampfschaden)");
}

/** One party action of each kind: melee round, bow volley at distance 1/3/5, spell round. */
function rangedTable(a: Record<string, string>): void {
  const sets = a._cmd === "ranged-compare" ? [CURRENT, formulasFrom(a.proposal)] : [formulasFrom(a.formulas)];
  const levels = nums(a.levels, [1, 3, 5, 10, 15, 20, 25, 30, 40, 50]);
  const growth = growthFrom(a);
  const mon = dummy(Number(a["mon-armor"] ?? 20), Number(a["mon-speed"] ?? 30));
  for (const F of sets) {
    console.log(`
=== ${F.id}   Monster: Armor ${mon.armor}, Speed ${mon.speed}   (Schaden je Partyaktion, Mittel ueber 24 Ausruestungswuerfe)`);
    for (const party of [PARTIES[0]!, PARTIES[1]!, PARTIES[3]!, PARTIES[2]!]) {
      console.log(party.name);
      console.log("  lvl | Nahkampfrunde | Salve d=1  d=3  d=5 | Zauberrunde | Salve1/Nahk.  Salve3/Nahk.");
      for (const level of levels) {
        const r = roundPower(F, party.members, level, growth, gearForTier(tierOf(level)), mon);
        console.log(`  ${String(level).padStart(3)} | ${String(Math.round(r.melee)).padStart(13)} | ${String(Math.round(r.volley1)).padStart(9)} ${String(Math.round(r.volley3)).padStart(4)} ${String(Math.round(r.volley5)).padStart(4)} | ${String(Math.round(r.spells)).padStart(11)} | ${(r.volley1 / Math.max(1, r.melee)).toFixed(2).padStart(12)}  ${(r.volley3 / Math.max(1, r.melee)).toFixed(2).padStart(12)}`);
      }
    }
  }
}

/** How much the result depends on what the tool has to assume. */
function sensitivity(a: Record<string, string>): void {
  const F = formulasFrom(a.formulas);
  const party = PARTIES[Number(a.party ?? 0)]!;
  const runs = Number(a.runs ?? 120);
  const points: [number, number][] = [[3, 2], [8, 3], [12, 3], [20, 4], [28, 4], [38, 5]];
  const variants: { name: string; env?: Partial<FightEnv>; growth?: Growth; gearLag?: number; best?: boolean }[] = [
    { name: "Grundannahme" },
    { name: "Attribute wachsen nicht", growth: GROWTH_NONE },
    { name: "Attribute 40 erst bei Stufe 100", growth: { to: 40, atLevel: 100 } },
    { name: "Attribute 60 bei Stufe 50", growth: { to: 60, atLevel: 50 } },
    { name: "Ausruestung eine Stufe schlechter", gearLag: 1 },
    { name: "beste Ausruestung des Tiers", best: true },
    { name: "Monster starten 2 Felder weg", env: { startDistance: 2 } },
    { name: "Monster starten 7 Felder weg", env: { startDistance: 7 } },
    { name: "Gang (1 Monster greift an)", env: { maxAdjacent: 1 } },
    { name: "Halle (4 Monster greifen an)", env: { maxAdjacent: 4 } },
    { name: "keine Salve beim Anlaufen", env: { openingVolley: false } },
    { name: "kein Bogen im Nahkampf", env: { rangedInMelee: false } },
    { name: "keine Zauber", env: { spells: false } },
  ];
  console.log(`Formeln: ${F.id}, Party: ${party.name}. Zellen: Stufe/Tier ${points.map(([l, t]) => `L${l}/T${t}`).join("  ")}   (HP-Verlust, Tote je Kampf)`);
  for (const v of variants) {
    let line = v.name.padEnd(36);
    for (const [level, tier] of points) {
      const gear = v.best ? gearForTier(tier, true) : gearForTier(tier - (v.gearLag ?? 0));
      const { fresh } = runCell(scenario({ party, level, tier, runs, F, gear, growth: v.growth ?? GROWTH_USER, env: { ...DEFAULT_ENV, ...v.env }, seed: "sens", groups: groupsFrom(a) }));
      line += `${pct(fresh.hpLostPct)} ${fresh.dead.toFixed(2)}`.padStart(11);
    }
    console.log(line);
  }
}

async function main(): Promise<void> {
  const a = args();
  if (a._cmd === "sens") return sensitivity(a);
  if (a._cmd === "ranged" || a._cmd === "ranged-compare") return rangedTable(a);
  if (a._cmd === "archetypes") return archetypes(a);
  if (a._cmd === "power") return powerTable(a);
  if (a._cmd === "journey" || a._cmd === "journey-compare") return journeyTable(a);
  const partyIdx = Number(a.party ?? 0);
  const party = PARTIES[partyIdx]!;
  const levels = nums(a.levels, [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50]);
  const tiers = nums(a.tiers, [1, 2, 3, 4, 5]);
  const runs = Number(a.runs ?? 80);
  const chain = Number(a.chain ?? 1);
  const env = envFrom(a);
  const growth = growthFrom(a);
  const sets = a._cmd === "compare" ? [CURRENT, formulasFrom(a.proposal)] : [formulasFrom(a.formulas)];
  console.log(`Party: ${party.name}   gear: ${a.gear ?? "by tier"}   mascot: ${env.mascot}   chain: ${chain}   runs: ${runs}`);
  for (const F of sets) {
    console.log(`\n=== ${F.id}: ${F.title}`);
    console.log("level | " + tiers.map((t) => `tier ${t}`.padEnd(34)).join("| "));
    for (const level of levels) {
      const cells = tiers.map((tier) => {
        const gear = a.gear ? gearByName(a.gear) : gearForTier(tier + Number(a["gear-lag"] ?? 0));
        const { fresh, all } = runCell(scenario({ party, level, tier, runs, chain, env, growth, F, gear, groups: groupsFrom(a) }));
        return cellText(chain > 1 ? all : fresh);
      });
      console.log(`${String(level).padStart(5)} | ` + cells.map((c) => c.padEnd(34)).join("| "));
    }
  }
}

if (process.argv[1]?.endsWith("cli.ts")) await main();
