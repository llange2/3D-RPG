/** Lists the monsters by treasure level with the stats the fight formulas read (resistances, armor, health). */
import { MONSTERS } from "../../src/data/tables";

const by: Record<number, string[]> = {};
for (const m of Object.values(MONSTERS)) {
  if (m.id >= 1000) continue;
  (by[m.treasure_level] ??= []).push(`${m.name}: resPhys ${m.res_physical} fire ${m.res_fire} armor ${m.armor} hp ${m.health}`);
}
for (const t of Object.keys(by)) console.log(`T${t}\n  ${by[Number(t)]!.join("\n  ")}`);
