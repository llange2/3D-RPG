/**
 * 57th playtest, point 4: what the party reads at a landmark of the open land must be the object that stands there. Lists the landmarks of a world with the item and the
 * name the game gives, and (with a tile) everything around it. Usage: [DUNGEONS=default|few|maximum] tsx tools/dev/check-landmark-names.ts seed [size] [x y]
 */
import { propLine } from "../../src/data/prop-texts";
import { landmarkIsCottageAt, landmarkItemAt } from "../../src/render/terrainMesher";
import { landmarkName } from "../../src/game/landmarkBoons";
import { DECO, type WorldSize } from "../../src/world/types";
import { World } from "../../src/world/world";

const [seed = "pearl-shore-794", size = "default", ax, ay] = process.argv.slice(2);
// the notes of the playtests come with &dungeons=default: the density thins the places and so changes the land
const world = new World(seed, size as WorldSize, (process.env.DUNGEONS ?? "default") as never);
const around = ax !== undefined && ay !== undefined ? { x: Number(ax), y: Number(ay) } : null;
const counts = new Map<string, number>();
for (let y = 0; y < world.height; y++) {
  for (let x = 0; x < world.width; x++) {
    if (world.tile(x, y).deco !== DECO.LANDMARK) continue;
    const near = around && Math.abs(x - around.x) <= 4 && Math.abs(y - around.y) <= 4;
    const item = landmarkItemAt(x, y);
    const cottage = landmarkIsCottageAt(x, y);
    const name = landmarkName(world, x, y);
    const line = cottage ? "(cottage line)" : propLine(item, `${x},${y}`);
    const key = `${item} ${name} ${cottage}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (near) console.log(x, y, "item", item, "name", name, "cottage", cottage, "|", line);
  }
}
for (const [k, n] of counts) console.log(String(n).padStart(4), k);
