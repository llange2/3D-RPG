/** What the generator really puts into a tier: group sizes, monster strength and the commonest monsters. Usage: tsx tools/balance/groups.ts */
import { MONSTERS } from "../../src/data/tables";
import { measureSupply } from "./supply";

for (let t = 1; t <= 5; t++) {
  const groups = ["alpha", "beta", "gamma"].flatMap((s) => measureSupply(s, "default").groups.filter((g) => g.tier === t));
  const sizes = groups.map((g) => g.ids.length);
  const mons = groups.flatMap((g) => g.ids);
  const count = new Map<number, number>();
  for (const id of mons) count.set(id, (count.get(id) ?? 0) + 1);
  const top = [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id, n]) => `${MONSTERS[id]!.name}(${MONSTERS[id]!.treasure_level}) ${Math.round((n / mons.length) * 100)}%`);
  const avg = (f: (id: number) => number) => mons.reduce((s, id) => s + f(id), 0) / Math.max(1, mons.length);
  const byLevel = [1, 2, 3, 4, 5].map((l) => `L${l}:${Math.round((mons.filter((id) => MONSTERS[id]!.treasure_level === l).length / mons.length) * 100)}%`).join(" ");
  console.log(`tier ${t}: ${groups.length} Gruppen (${groups.filter((g) => g.inside).length} innen, ${groups.filter((g) => g.boss).length} Boss), Groesse Mittel ${(sizes.reduce((a, b) => a + b, 0) / sizes.length).toFixed(2)} max ${Math.max(...sizes)} leer ${sizes.filter((n) => n === 0).length}`);
  console.log(`   HP ${Math.round(avg((id) => MONSTERS[id]!.health))}  XP ${Math.round(avg((id) => MONSTERS[id]!.xp))}  Stufen: ${byLevel}`);
  console.log(`   ${top.join(", ")}`);
}
