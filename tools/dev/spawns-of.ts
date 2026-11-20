/** The plan, the issues and the spawns of one place. Usage: DUNGEONS=maximum npx tsx tools/dev/spawns-of.ts <seed> <size> <place id> */
import { buildMapContent, validateContent } from "../../src/actions";
import { generateInterior } from "../../src/interiors";
import { planDungeon } from "../../src/interiors/dungeonPlan";
import type { WorldSize } from "../../src/world/types";
import { World } from "../../src/world/world";

const [seed = "alpha", size = "default", id = "p:0:0:1280"] = process.argv.slice(2);
const world = new World(seed, size as WorldSize, (process.env.DUNGEONS ?? "maximum") as never);
const poi = world.poiById(id)!;
const ref = planDungeon(world, poi)!;
const map = generateInterior(world, poi);
const content = buildMapContent(world, poi, map);
console.log(poi.name, poi.kind, poi.tier, poi.tight ? "tight" : "", "quest", ref.quest, "layout", ref.layout, "class", ref.klass, "end room", JSON.stringify(map.dungeon?.endRoom));
console.log("issues", JSON.stringify(validateContent(map, content)));
console.log("spawns", content.spawns.map((s) => `${s.uid} boss=${s.boss} ${s.monsterIds.join(",")}`).join("; "));
