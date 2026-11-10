/**
 * TEMPORARY (balance journal, `src/sim/journal.ts`): reads the journal of an exported save and prints what balancing needs:
 *  - the chance of the thievery rolls (expected from the skills against what happened), by kind of lock and tier,
 *  - the fights by tier and by monster, the traps, the heroes who went down,
 *  - the pace of the game from the snapshots and the level-ups.
 *
 * Usage: npx tsx tools/balance/read-journal.ts <file.json> [--all] [--raw=<lock|fight|snap|trap|level|down>]
 * The file is what Esc > Debug > Export saves writes (a bundle), or a single save. By default the save with the longest journal is read
 * (all saves of a game carry the same history up to their time); `--all` reads every save one after the other.
 */
import { readFileSync } from "node:fs";
import { MONSTERS } from "../../src/data/tables";
import type { DownEvent, FightEvent, JournalEntry, LevelEvent, LockEvent, SnapEvent, Stamp, TrapEvent } from "../../src/sim/journal";

interface Save {
  seed: string;
  savedAt: string;
  state: { journal?: JournalEntry[]; steps: number; kills: number; party: { minutes: number; gold: number; characters: { name: string; classType: string; level: number }[] }; campaign?: unknown };
}

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
if (!file) throw new Error("usage: tsx tools/balance/read-journal.ts <file.json> [--all] [--raw=<kind>]");
const all = args.includes("--all");
const raw = args.find((a) => a.startsWith("--raw="))?.slice("--raw=".length);

const data = JSON.parse(readFileSync(file, "utf8")) as unknown;
const found: { label: string; save: Save }[] = [];
const isSave = (v: unknown): v is Save => typeof v === "object" && v !== null && typeof (v as Save).state === "object" && (v as Save).state !== null;
if (isSave(data)) found.push({ label: "save", save: data });
else {
  const bundle = data as { saves?: { kind: string; slot: string; save: Save }[]; named?: { name: string; save: Save }[] };
  for (const s of bundle.saves ?? []) found.push({ label: `${s.kind} / ${s.slot}`, save: s.save });
  for (const n of bundle.named ?? []) found.push({ label: `named "${n.name}"`, save: n.save });
}
if (found.length === 0) throw new Error("no save in the file");

console.log("saves in the file:");
for (const f of found) console.log(`  ${f.label.padEnd(28)} seed ${f.save.seed}  steps ${f.save.state.steps}  journal ${f.save.state.journal?.length ?? 0}  saved ${f.save.savedAt}`);

const chosen = all ? found : [found.reduce((best, f) => ((f.save.state.journal?.length ?? 0) > (best.save.state.journal?.length ?? 0) ? f : best))];

const pct = (n: number, d: number) => (d > 0 ? `${((n / d) * 100).toFixed(0)}%` : "-");
const avg = (xs: number[]) => (xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const f1 = (n: number) => n.toFixed(1);
const monName = (id: number) => MONSTERS[id]?.name ?? `#${id}`;

function table(rows: string[][]): void {
  if (rows.length === 0) return;
  const w = rows[0]!.map((_, c) => Math.max(...rows.map((r) => (r[c] ?? "").length)));
  for (const r of rows) console.log("  " + r.map((x, c) => (c === 0 ? x.padEnd(w[c]!) : x.padStart(w[c]!))).join("  "));
}

function report(label: string, save: Save): void {
  const journal = save.state.journal ?? [];
  console.log(`\n=== ${label} (seed ${save.seed}): ${journal.length} entries, ${save.state.steps} steps, day ${(save.state.party.minutes / 1440 + 1).toFixed(1)}, ${save.state.party.characters.map((c) => `${c.name} ${c.classType} L${c.level}`).join(", ")}`);
  if (raw) {
    for (const e of journal.filter((x) => x.t === raw)) console.log(JSON.stringify(e));
    return;
  }
  const of = <T extends JournalEntry>(t: T["t"]) => journal.filter((e): e is T => e.t === t);

  // ---- thievery
  const locks = of<LockEvent & Stamp>("lock");
  console.log(`\nthievery: ${locks.length} attempts`);
  const groups = new Map<string, LockEvent[]>();
  for (const l of locks) groups.set(`${l.kind} / tier ${l.tier}`, [...(groups.get(`${l.kind} / tier ${l.tier}`) ?? []), l]);
  table([
    ["kind / tier", "tries", "expected", "actual", "avg party lvl", "avg lock lvl", "avg lock", "traps"],
    ...[...groups].sort().map(([k, ls]) => [k, String(ls.length), pct(ls.reduce((s, l) => s + l.p, 0), ls.length), pct(ls.filter((l) => l.ok).length, ls.length), f1(avg(ls.map((l) => l.lvl))), f1(avg(ls.map((l) => l.lockLvl))), f1(avg(ls.map((l) => l.diff))), String(ls.filter((l) => l.fumble !== undefined).length)]),
  ]);
  const byClass = new Map<string, { tries: number; p: number }>();
  for (const l of locks) for (const h of l.heroes) { const c = byClass.get(h.cls) ?? { tries: 0, p: 0 }; c.tries++; c.p += h.p; byClass.set(h.cls, c); }
  if (byClass.size > 0) {
    console.log("  chance of the hero who picked, by class (before 10 Nov 2026 every hero rolled, so older entries count all of them):");
    table([...byClass].sort().map(([k, c]) => [k, String(c.tries), pct(c.p, c.tries)]));
  }

  // ---- fights
  const fights = of<FightEvent & Stamp>("fight");
  console.log(`\nfights: ${fights.length}`);
  const byTier = new Map<number, FightEvent[]>();
  for (const f of fights) byTier.set(f.tier, [...(byTier.get(f.tier) ?? []), f]);
  const lost = (f: FightEvent) => f.heroes.reduce((s, h) => s + Math.max(0, h.hp0 - h.hp1), 0) / Math.max(1, f.heroes.reduce((s, h) => s + h.health, 0));
  table([
    ["tier", "fights", "won", "lost", "rounds", "monsters", "xp", "hp lost", "party hit", "monster hit"],
    ...[...byTier].sort((a, b) => a[0] - b[0]).map(([t, fs]) => [`tier ${t}`, String(fs.length), pct(fs.filter((f) => f.out === "won").length, fs.length), pct(fs.filter((f) => f.out === "lost").length, fs.length), f1(avg(fs.map((f) => f.rounds))), f1(avg(fs.map((f) => f.mon.reduce((s, m) => s + m.n, 0)))), f1(avg(fs.map((f) => f.xp))), pct(fs.reduce((s, f) => s + lost(f), 0), fs.length), pct(fs.reduce((s, f) => s + f.pHit, 0), fs.reduce((s, f) => s + f.pAtk, 0)), pct(fs.reduce((s, f) => s + f.mHit, 0), fs.reduce((s, f) => s + f.mAtk, 0))]),
  ]);
  const byMonster = new Map<number, { fights: number; killed: number; xp: number; lost: number }>();
  for (const f of fights) for (const m of f.mon) { const c = byMonster.get(m.id) ?? { fights: 0, killed: 0, xp: 0, lost: 0 }; c.fights++; c.killed += m.n; c.lost += lost(f); byMonster.set(m.id, c); }
  if (byMonster.size > 0) {
    console.log("  by monster (hp lost = share of the party's health in fights it was in):");
    table([["monster", "fights", "met", "hp lost"], ...[...byMonster].sort((a, b) => b[1].fights - a[1].fights).slice(0, 25).map(([id, c]) => [monName(id), String(c.fights), String(c.killed), pct(c.lost, c.fights)])]);
  }

  // ---- traps
  const traps = of<TrapEvent & Stamp>("trap");
  console.log(`\ntraps: ${traps.length}`);
  const tk = new Map<string, TrapEvent[]>();
  for (const t of traps) tk.set(`${t.kind} ${t.element ?? ""}`.trim(), [...(tk.get(`${t.kind} ${t.element ?? ""}`.trim()) ?? []), t]);
  table([["kind", "count", "dodged", "avg dmg", "avg raw", "down"], ...[...tk].sort().map(([k, ts]) => [k, String(ts.length), pct(ts.filter((t) => t.dodged).length, ts.length), f1(avg(ts.map((t) => t.dmg))), f1(avg(ts.map((t) => t.raw))), String(ts.filter((t) => t.down).length)])]);

  // ---- heroes down
  const downs = of<DownEvent & Stamp>("down");
  console.log(`\nheroes down: ${downs.length}`);
  for (const d of downs.slice(-30)) console.log(`  step ${d.s} ${d.at}: ${d.name} ${d.cls} L${d.lvl} ${d.cond} by ${d.by} (${d.dmg})`);

  // ---- pace
  const levels = of<LevelEvent & Stamp>("level");
  console.log(`\nlevel-ups: ${levels.length}`);
  for (const l of levels) console.log(`  step ${String(l.s).padStart(6)}  day ${(l.m / 1440 + 1).toFixed(1).padStart(5)}  ${l.name} ${l.cls} ${l.from} -> ${l.to}`);
  const snaps = of<SnapEvent & Stamp>("snap");
  console.log(`\ntime line: ${snaps.length} snapshots`);
  table([["step", "day", "place", "tier", "avg lvl", "gold", "food", "kills", "hp"], ...snaps.filter((_, i) => i % Math.max(1, Math.ceil(snaps.length / 40)) === 0).map((s) => [String(s.s), (s.m / 1440 + 1).toFixed(1), s.at.slice(0, 18), String(s.tier), f1(avg(s.heroes.map((h) => h.lvl))), String(s.gold), String(s.food), String(s.kills), pct(s.heroes.reduce((a, h) => a + Math.max(0, h.hp), 0), s.heroes.reduce((a, h) => a + h.health, 0))])]);
}

for (const f of chosen) report(f.label, f.save);
