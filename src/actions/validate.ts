import { BANNER, CASTLE_MONSTERS } from "../data/castles";
import { FORBIDDEN_PROPS } from "../data/dungeon-themes";
import { allowedIn, isFunctional } from "../data/item-rules";
import { placeOf } from "../interiors/place";
import { questIssues } from "./questChecks";
import { MONSTERS } from "../data/tables";
import { analyzeTopology, type Topology } from "../interiors/topology";
import { CELL, FACING_DELTA, type Facing, type InteriorMap } from "../interiors/types";
import { ACTION_DEFS, blocksCell } from "./registry";
import type { MapContent } from "./types";

const DIRS = Object.keys(FACING_DELTA) as Facing[];

/** The old object an action shows on its cell: the chest of a treasure, the `item` of the rest, or null. */
const shownItemOf = (a: { kind: string; params: Record<string, unknown> }): number | null => {
  const id = a.kind === "treasure" ? a.params.chest : a.params.item;
  return typeof id === "number" ? id : null;
};

/**
 * The user's list of objects: an object stands only in the kinds of place that list names, and one that must always do something
 * (a chest, a lever, a barrel, a gate) is never pure decoration. A fountain, a statue or a well may be.
 */
export function itemIssues(map: InteriorMap, content: MapContent): string[] {
  const issues: string[] = [];
  const place = placeOf(map);
  for (const a of content.actions) {
    const item = shownItemOf(a);
    if (item === null) continue;
    if (!allowedIn(item, place)) issues.push(`${a.uid}: object ${item} may not stand in a ${place}`);
    if (a.kind === "decor" && isFunctional(item)) issues.push(`${a.uid}: object ${item} must be of use and cannot be plain decoration`);
  }
  return issues;
}

/**
 * What a dungeon theme demands of its content (docs/DUNGEON_THEMES.md): only its own monsters, its one kind of trap, props that
 * its inhabitants may have, and exactly the keys and key card of its class (chapter 1.2, rules 1 to 3 and 7).
 */
export function themeIssues(map: InteriorMap, content: MapContent): string[] {
  const issues: string[] = [];
  const ref = map.dungeon;
  if (!ref) return issues;
  const theme = ref.look;
  const own = new Set([...theme.monsters, theme.boss]);
  const forbidden = new Set(FORBIDDEN_PROPS[theme.inhabitants]);
  for (const s of content.spawns) for (const id of s.monsterIds) if (!own.has(id)) issues.push(`${s.uid}: monster ${id} does not belong to ${theme.id}`);
  const found: string[] = [];
  for (const a of content.actions) {
    if (a.kind === "trap" && a.params.trap !== theme.trap) issues.push(`${a.uid}: ${String(a.params.trap)} trap in ${theme.id}, which has ${theme.trap}`);
    if (a.kind === "decor" && !theme.props.includes(Number(a.params.item))) issues.push(`${a.uid}: prop ${String(a.params.item)} does not belong to ${theme.id}`);
    for (const item of [a.params.item, a.params.chest]) if (typeof item === "number" && forbidden.has(item) && a.params.quest === undefined) issues.push(`${a.uid}: prop ${item} does not suit ${theme.inhabitants}`);
    if (typeof a.params.quest === "string") for (let i = 0; i < Number(a.params.count ?? 1); i++) found.push(a.params.quest);
    if (a.kind === "ambush" && typeof a.params.monsters === "string") {
      for (const id of a.params.monsters.split(",").map(Number)) if (!own.has(id)) issues.push(`${a.uid}: ambush monster ${id} does not belong to ${theme.id}`);
    }
  }
  const promised = [...ref.gives, ...Array.from({ length: ref.orbs }, () => "quest_orb")];
  if (found.slice().sort().join() !== promised.slice().sort().join()) issues.push(`${map.key}: holds [${found.join(", ")}], the plan says [${promised.join(", ")}]`);
  // keys lie in level 1 and 2 places, key cards in level 4 and 5 dungeons, orbs in dungeons of level 4 and 5
  if (found.some((q) => q.startsWith("quest_key_")) && map.tier > 2) issues.push(`${map.key}: a key in a place of level ${map.tier}`);
  if (found.some((q) => q.endsWith("_keycard") || q === "quest_orb") && (map.kind === "cave" || map.tier < 4)) issues.push(`${map.key}: a key card or orb in a cave or a place of level ${map.tier}`);
  return issues;
}

/**
 * What a castle demands: its banner (old items 103 to 105, the one of its kind), only monsters of its kind, and in a good castle no monster
 * that is not the guard of a vault (every monster stands in a chamber that a gate, a locked door or a wall shuts).
 */
export function castleIssues(map: InteriorMap, content: MapContent): string[] {
  const issues: string[] = [];
  const kind = map.castle?.alignment;
  if (!kind) return issues;
  const banners = content.actions.filter((a) => a.kind === "decor" && [103, 104, 105].includes(Number(a.params.item)));
  if (banners.length === 0) issues.push(`${map.key}: a castle without a banner`);
  for (const b of banners) if (b.params.item !== BANNER[kind]) issues.push(`${b.uid}: banner ${String(b.params.item)} in a ${kind} castle`);
  const own = new Set(CASTLE_MONSTERS[kind]);
  for (const s of content.spawns) for (const id of s.monsterIds) if (!own.has(id)) issues.push(`${s.uid}: monster ${id} does not belong to a ${kind} castle`);
  const vaultGuards = content.spawns.filter((s) => s.uid.includes("#vault_guard:"));
  if (content.actions.filter((a) => a.uid.includes("#vault_chest:")).length === 0) issues.push(`${map.key}: no treasure vault`);
  if (vaultGuards.length === 0) issues.push(`${map.key}: the vaults have no guard`);
  if (kind === "good") for (const s of content.spawns) if (!s.uid.includes("#vault_guard:")) issues.push(`${s.uid}: a roaming monster in a good castle`);
  if (kind === "good" && content.actions.some((a) => a.kind === "ambush")) issues.push(`${map.key}: an ambush in a good castle`);
  return issues;
}

/**
 * Checks generated content. Returns a list of problems; an empty list means the map is playable:
 * - uids are unique, every object sits on a floor cell (breakable walls on a wall cell), nothing shares a cell
 * - nothing blocks the way: with chests, shrines, fountains and statues treated as blocked and doors as passable, every floor cell stays reachable
 * - the spawn area is clear, params satisfy the registry schema, monster levels match the tier
 */
export function validateContent(map: InteriorMap, content: MapContent, topology?: Topology): string[] {
  const topo = topology ?? analyzeTopology(map);
  const issues: string[] = [];
  const idx = (x: number, y: number) => y * map.width + x;
  const uids = new Set<string>();
  const cells = new Map<number, string>();

  const note = (uid: string, x: number, y: number, isWall: boolean) => {
    if (uids.has(uid)) issues.push(`duplicate uid ${uid}`);
    uids.add(uid);
    if (x < 0 || y < 0 || x >= map.width || y >= map.height) {
      issues.push(`${uid} is outside the map`);
      return;
    }
    const cell = map.cells[idx(x, y)];
    if (isWall && cell !== CELL.SOLID && cell !== CELL.BUILDING) issues.push(`${uid} (breakable wall) is not on a wall cell`);
    if (!isWall && cell !== CELL.FLOOR) issues.push(`${uid} is not on a floor cell`);
    const other = cells.get(idx(x, y));
    if (other) issues.push(`${uid} shares a cell with ${other}`);
    cells.set(idx(x, y), uid);
  };

  const spawnZone = (x: number, y: number) => Math.abs(x - map.spawn.x) <= 1 && Math.abs(y - map.spawn.y) <= 1;

  for (const a of content.actions) {
    note(a.uid, a.x, a.y, a.kind === "breakable_wall");
    const parsed = ACTION_DEFS[a.kind].params.safeParse(a.params);
    if (!parsed.success) issues.push(`${a.uid} has invalid params: ${parsed.error.message}`);
    const isExit = a.kind === "transfer" && a.params.mode === "poi_exit";
    if (!isExit && spawnZone(a.x, a.y)) issues.push(`${a.uid} (${a.kind}) is inside the spawn zone`);
  }

  for (const s of content.spawns) {
    note(s.uid, s.x, s.y, false);
    if (spawnZone(s.x, s.y)) issues.push(`${s.uid} spawns inside the spawn zone`);
    if (s.monsterIds.length === 0) issues.push(`${s.uid} has no monsters`);
    for (const id of s.monsterIds) {
      const m = MONSTERS[id];
      if (!m) {
        issues.push(`${s.uid} references unknown monster ${id}`);
        continue;
      }
      if (m.treasure_level > Math.min(5, content.tier + 2) + 1) issues.push(`${s.uid}: ${m.name} (level ${m.treasure_level}) is too strong for tier ${content.tier}`);
    }
  }

  // connectivity: chests, shrines, fountains and statues block their cell, doors can be opened
  const blocked = new Set<number>();
  for (const a of content.actions) if (blocksCell(a) && map.cells[idx(a.x, a.y)] === CELL.FLOOR) blocked.add(idx(a.x, a.y));
  // a wall that gives way is a way through (the chamber of a castle's vault lies behind one); it is one more cell to reach
  const hidden = new Set<number>(content.actions.filter((a) => a.uid.includes("#vault_wall:")).map((a) => idx(a.x, a.y)));
  const end = map.dungeon?.endRoom;
  if (end?.seal) hidden.add(idx(end.seal.x, end.seal.y));
  const seen = new Uint8Array(map.width * map.height);
  const queue: number[] = [idx(map.spawn.x, map.spawn.y)];
  seen[queue[0]!] = 1;
  // a pocket in the rock that only a teleport reaches is a second place to start from
  if (end?.isolated) {
    queue.push(idx(end.cx, end.cy));
    seen[idx(end.cx, end.cy)] = 1;
  }
  let reached = 0;
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head]!;
    reached++;
    const x = i % map.width;
    const y = (i - x) / map.width;
    for (const d of DIRS) {
      const nx = x + FACING_DELTA[d].dx;
      const ny = y + FACING_DELTA[d].dy;
      if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
      const ni = idx(nx, ny);
      if (seen[ni] || (map.cells[ni] !== CELL.FLOOR && !hidden.has(ni)) || blocked.has(ni)) continue;
      seen[ni] = 1;
      queue.push(ni);
    }
  }
  const expected = topo.totalFloor + hidden.size - blocked.size;
  if (reached !== expected) issues.push(`placed objects cut the map: ${reached} reachable cells, expected ${expected}`);
  for (const b of blocked) {
    const x = b % map.width;
    const y = (b - x) / map.width;
    if (!DIRS.some((d) => seen[idx(x + FACING_DELTA[d].dx, y + FACING_DELTA[d].dy)])) issues.push(`blocking object at ${x},${y} cannot be reached`);
  }

  issues.push(...themeIssues(map, content), ...questIssues(map, content), ...itemIssues(map, content));

  // composition by kind
  const count = (kind: string) => content.actions.filter((a) => a.kind === kind).length;
  if (!content.actions.some((a) => a.kind === "transfer" && a.params.mode === "poi_exit")) issues.push("no exit transfer");
  if (map.kind === "town") {
    const services = content.actions.filter((a) => a.kind === "service");
    if (services.length < 3) issues.push(`town has only ${services.length} services`);
    if (new Set(services.map((s) => s.params.service)).size !== services.length) issues.push("town hands out a service twice");
    // the only monsters of a town stand behind a gate: with every gate shut they cannot be reached
    if (content.spawns.length > 0) {
      const shut = new Set(content.actions.filter((a) => a.kind === "door").map((a) => idx(a.x, a.y)));
      const reach = new Uint8Array(map.width * map.height);
      const stack = [idx(map.spawn.x, map.spawn.y)];
      reach[stack[0]!] = 1;
      while (stack.length > 0) {
        const i = stack.pop()!;
        const x = i % map.width;
        const y = (i - x) / map.width;
        for (const d of DIRS) {
          const ni = idx(x + FACING_DELTA[d].dx, y + FACING_DELTA[d].dy);
          if (reach[ni] || map.cells[ni] !== CELL.FLOOR || shut.has(ni)) continue;
          reach[ni] = 1;
          stack.push(ni);
        }
      }
      for (const sp of content.spawns) if (reach[idx(sp.x, sp.y)]) issues.push(`${sp.uid}: a monster stands in the open streets of a town`);
    }
  } else {
    if (map.castle) issues.push(...castleIssues(map, content));
    if (count("treasure") < 2) issues.push(`only ${count("treasure")} treasure(s)`);
    // a good castle's only monsters are the guards of its vaults, and a castle of small halls has room for one
    if (content.spawns.length < (map.castle ? 1 : 2)) issues.push(`only ${content.spawns.length} monster group(s)`);
    if (!content.spawns.some((s) => s.boss)) issues.push("no boss");
  }
  return issues;
}
