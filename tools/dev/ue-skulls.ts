/** Which places of a world hold coins or skulls in their plan but have no ordinary chest to hide them in (a diagnosis for quests12-ue.test.ts). */
import { buildMapContent } from "../../src/actions";
import { generateInterior, planDungeon } from "../../src/interiors";
import { World } from "../../src/world/world";

const seed = process.argv[2] ?? "ue-a";
const only = process.argv[3];
const world = new World(seed, "default");
for (const poi of world.allPois().filter((p) => p.kind !== "town" && planDungeon(world, p)?.klass !== "C")) {
  const ref = planDungeon(world, poi);
  if (!ref || (ref.coins === 0 && ref.skulls === 0) || (only && poi.id !== only)) continue;
  const map = generateInterior(world, poi);
  const content = buildMapContent(world, poi, map);
  const chests = content.actions.filter((a) => a.kind === "treasure");
  const hidden = content.actions.filter((a) => typeof a.params.extra === "string").length;
  if (hidden >= ref.coins + ref.skulls && !only) continue;
  console.log(poi.id, poi.name, poi.kind, "coins", ref.coins, "skulls", ref.skulls, "hidden", hidden, "end", JSON.stringify(map.dungeon?.endRoom), "machines", JSON.stringify(map.dungeon?.machines), "vaults", JSON.stringify(map.dungeon?.vaults));
  for (const c of chests) console.log("  chest", c.uid, c.x, c.y, JSON.stringify(c.params));
}
