/** How long the plan of a world takes (places, roads, quests). Usage: npx tsx tools/dev/plan-time.ts <size> [count] */
import type { WorldSize } from "../../src/world/types";
import { World } from "../../src/world/world";

const size = (process.argv[2] ?? "default") as WorldSize;
const count = Number(process.argv[3] ?? 10);
const t0 = performance.now();
for (let i = 0; i < count; i++) new World(`plan-time-${i}`, size).allPois();
console.log(size, `${count} worlds`, `${((performance.now() - t0) / count).toFixed(0)} ms each`);
