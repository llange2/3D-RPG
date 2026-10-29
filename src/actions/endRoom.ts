import { Rng } from "../core/rng";
import { allowedIn } from "../data/item-rules";
import { END_LOOT, QUEST_PROP, ORB } from "../data/quest-table";
import { placeOf } from "../interiors/place";
import type { QuestEnv } from "./questGen";
import type { ActionInstance, ParamValue } from "./types";

/**
 * What lies in the end room (quest document 1.2, "End-Räume"): the keys, key cards and orbs the plan puts there, each in a chest of its own that
 * shows the quest item, and 2 to 4 more rewards drawn from the table of its level (gold, attribute points, treasure, spells, levels). A room that
 * the party is teleported into also holds the portal back to the entrance.
 */

type Reward = { name: string; params: Record<string, ParamValue> };

/** The rewards a level offers, as chests. */
function rewardsOf(level: number, rng: Rng): Reward[] {
  const t = END_LOOT[Math.min(5, Math.max(1, level))]!;
  const out: Reward[] = [{ name: "gold", params: { level: Math.min(8, level), gold: rng.range(t.gold[0], t.gold[1]), items: 0 } }];
  if (t.attributes) out.push({ name: "attributes", params: { level: Math.min(8, level), gold: 0, items: 0, attr: rng.range(t.attributes.packages[0], t.attributes.packages[1]), pts: t.attributes.package } });
  if (t.levelUps) out.push({ name: "levels", params: { level: Math.min(8, level), gold: 0, items: 0, levels: rng.range(t.levelUps[0], t.levelUps[1]) } });
  out.push({ name: "treasure", params: { level: Math.min(8, level), gold: 0, items: rng.range(t.treasure[0], t.treasure[1]) } });
  const spells = rng.range(t.spells[0], t.spells[1]);
  if (spells > 0) out.push({ name: "spells", params: { level: Math.min(8, level), gold: 0, items: 0, spells, spellLevel: level } });
  return out;
}

/** The cells along the walls of the end room, in an order the seed decides, without the cell where the party arrives or the door is. */
function borderCells(env: QuestEnv, rng: Rng): { x: number; y: number }[] {
  const end = env.map.dungeon!.endRoom!;
  const arrival = end.isolated ? { x: end.cx, y: end.cy } : doorCell(env);
  const out: { x: number; y: number }[] = [];
  for (let y = end.y; y < end.y + end.h; y++) {
    for (let x = end.x; x < end.x + end.w; x++) {
      const border = x === end.x || y === end.y || x === end.x + end.w - 1 || y === end.y + end.h - 1;
      if (border && !(x === arrival.x && y === arrival.y) && Math.abs(x - arrival.x) + Math.abs(y - arrival.y) > 1) out.push({ x, y });
    }
  }
  return rng.shuffle(out);
}

/** The cell of the end room that touches the seal, where the party steps in. */
export function doorCell(env: QuestEnv): { x: number; y: number } {
  const end = env.map.dungeon!.endRoom!;
  const seal = end.seal;
  if (!seal) return { x: end.cx, y: end.cy };
  return { x: Math.min(end.x + end.w - 1, Math.max(end.x, seal.x)), y: Math.min(end.y + end.h - 1, Math.max(end.y, seal.y)) };
}

export function fillEndRoom(env: QuestEnv): void {
  const ref = env.map.dungeon;
  const end = ref?.endRoom;
  if (!ref || !end) return;
  const rng = new Rng(env.derive("end-room"));
  const cells = borderCells(env, rng);
  const place = placeOf(env.map);
  // an object in the room must not shut a corner of it off: every free cell stays within reach of the door (or of the cell the party arrives on)
  const taken = new Set<string>();
  const start = end.isolated ? { x: end.cx, y: end.cy } : doorCell(env);
  const keeps = (c: { x: number; y: number }): boolean => {
    const key = (x: number, y: number) => `${x},${y}`;
    const blocked = new Set([...taken, key(c.x, c.y)]);
    const inside = (x: number, y: number) => x >= end.x && y >= end.y && x < end.x + end.w && y < end.y + end.h;
    const seen = new Set<string>([key(start.x, start.y)]);
    const queue = [start];
    for (let head = 0; head < queue.length; head++) {
      const q = queue[head]!;
      for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]] as const) {
        const n = { x: q.x + dx, y: q.y + dy };
        if (!inside(n.x, n.y) || blocked.has(key(n.x, n.y)) || seen.has(key(n.x, n.y))) continue;
        seen.add(key(n.x, n.y));
        queue.push(n);
      }
    }
    if (seen.size !== end.w * end.h - blocked.size) return false;
    // and every object keeps a free cell beside it that the party can stand on
    return [...blocked].every((b) => {
      const [bx, by] = b.split(",").map(Number) as [number, number];
      return ([[0, 1], [1, 0], [0, -1], [-1, 0]] as const).some(([dx, dy]) => seen.has(key(bx + dx, by + dy)));
    });
  };
  const put = (name: string, params: Record<string, ParamValue>): void => {
    const at = cells.findIndex(keeps);
    if (at < 0) return;
    const cell = cells.splice(at, 1)[0]!;
    taken.add(`${cell.x},${cell.y}`);
    env.placeEnd({ uid: env.uid(`end-${name}`), kind: "treasure", x: cell.x, y: cell.y, params });
  };

  // a pocket in the rock has a portal that leads back to the way in: A > B > A
  if (end.isolated) {
    const at = cells.findIndex(keeps);
    const spot = cells.splice(at < 0 ? 0 : at, 1)[0]!;
    taken.add(`${spot.x},${spot.y}`);
    const back = env.map.spawn;
    env.placeEnd({ uid: env.uid("end-portal"), kind: "qportal", x: spot.x, y: spot.y, params: { item: allowedIn(3, place) ? 3 : 73, tx: back.x, ty: back.y } });
  }

  // what the plan put here: every key, key card and the orbs in a chest of its own that shows the quest item
  for (const type of ref.gives) {
    const model = QUEST_PROP[type];
    put("quest", { level: 1, gold: 0, items: 0, quest: type, chest: model !== undefined && allowedIn(model, place) ? model : env.theme.chest });
  }
  if (ref.orbs > 0) put("orbs", { level: 1, gold: 0, items: 0, quest: ORB, count: ref.orbs, chest: allowedIn(109, place) ? 109 : env.theme.chest });

  // and 2 to 4 more rewards of its level
  const pool = rng.shuffle(rewardsOf(env.tier, rng));
  const wanted = Math.min(pool.length, rng.range(2, 4));
  for (const reward of pool.slice(0, wanted)) put(reward.name, { ...reward.params, chest: env.theme.chest });
}
