import { derive, LAYER, Rng, type SeedState } from "../core/rng";
import { QUEST_PROP, SHRINE_EFFECT, type DungeonTheme } from "../data/dungeon-themes";
import { buildCastleContent } from "./castle";
import { buildShowcaseContent } from "./showcase";
import { buildSpaceshipContent } from "./spaceship";
import { hideInChests, placeMachines } from "./machines";
import { placeVaults } from "./vaults";
import { hideSpells } from "./spellScrolls";
import { hasLandMonster, pickMonster, pickMonsterWeighted } from "../data/monsters";
import { chestLock, hasOrdinaryLock } from "../data/locks";
import { BONES_FIND_CHANCE, CHEST_TRAP_CHANCE, CHEST_TRAP_ELEMENTS, RAT_TRAP, SEARCHABLE_DECOR } from "../data/chest-traps";
import { BOOKSHELVES, isBookshelf } from "../data/spell-loot";
import { sellerParams } from "../data/talent-sellers";
import { allowedIn, isFunctional } from "../data/item-rules";
import { placeOf } from "../interiors/place";
import { TRAP_DAMAGE } from "../data/rules";
import { analyzeTopology, type Topology } from "../interiors/topology";
import { blocksPassage } from "../interiors/passage";
import { CELL, FACING_DELTA, type InteriorMap } from "../interiors/types";
import { computeAnchors, type AnchorSet } from "./anchors";
import { themeBoss, themeMonsters } from "./monsterPool";
import { finishQuest, placeQuest, type QuestEnv, type QuestResult } from "./questGen";
import { ACTION_DEFS, SERVICES, blocksCell } from "./registry";
import { evalExpr, resolveParam, type ExprVars } from "./expr";
import type { ActionInstance, ActionKind, Anchor, MapContent, ParamValue, Rule, RuleSet, SpawnPoint } from "./types";

/** Groups of monsters that wander the passages of a maze (`dungeon_3`) on top of the one group in the middle of each of its rooms. */
export const MAZE_GROUPS = 10;

/** The old barrel (item 5): a container, never plain decoration. */
const BARREL = 5;

export interface ContentContext {
  rootSeed: SeedState;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The banners (old items 103 to 105) and the carving of the moose king (125) hang on the wall: the cell in front of one stays as free as it was. */
export const WALL_HUNG_ITEMS: readonly number[] = [103, 104, 105, 125];
/** Actions that stand on their cell as an object, blocking it or not (a lore message is one only when it shows a statue or a person). */
const isObject = (a: { kind: ActionKind; params: Record<string, unknown> }): boolean =>
  a.kind === "lore" ? a.params.object !== undefined || a.params.persona !== undefined : a.kind === "decor" && WALL_HUNG_ITEMS.includes(Number(a.params.item)) ? false : ["decor", "treasure", "shrine", "fountain", "riddle", "gong", "lever", "head", "teleporter", "talent", "work", "portal"].includes(a.kind);
/** Cells between two banners on a wall, counting one banner (the old castles hang theirs every second or third cell). */
const BANNER_SPACING = 3;
/** Shortest stretch of straight wall that gets a banner, and the number of banners below which a castle hangs them closer together. */
const BANNER_MIN_RUN = 3;
const BANNER_MIN_TOTAL = 6;

/**
 * Picks cells at an even distance along the straight walls: the anchors are grouped by the wall they stand against and the line they stand on, a
 * run of neighbouring cells gets one every `spacing` cells, centred on the run so that both ends are alike.
 */
export function spacedAlongWalls(anchors: readonly Anchor[], floorAt: (x: number, y: number) => boolean, spacing: number, minRun = BANNER_MIN_RUN): Anchor[] {
  const runs = new Map<string, Anchor[]>();
  for (const a of anchors) {
    const wall = (["N", "E", "S", "W"] as const).find((f) => !floorAt(a.x + FACING_DELTA[f].dx, a.y + FACING_DELTA[f].dy));
    if (!wall) continue;
    const along = wall === "N" || wall === "S" ? a.x : a.y;
    const line = wall === "N" || wall === "S" ? a.y : a.x;
    // consecutive cells of one run share the key by their start, which the sort below finds
    const key = `${wall}:${line}`;
    const list = runs.get(key) ?? [];
    list.push({ ...a, depth: along });
    runs.set(key, list);
  }
  const chosen: Anchor[] = [];
  for (const list of [...runs.entries()].sort(([p], [q]) => (p < q ? -1 : 1)).map(([, l]) => l)) {
    list.sort((p, q) => p.depth - q.depth);
    let start = 0;
    for (let i = 1; i <= list.length; i++) {
      if (i < list.length && list[i]!.depth === list[i - 1]!.depth + 1) continue;
      const run = list.slice(start, i);
      start = i;
      if (run.length < minRun) continue;
      for (let k = Math.floor(((run.length - 1) % spacing) / 2); k < run.length; k += spacing) chosen.push(run[k]!);
    }
  }
  // the anchors keep their own depth (the caller reads it for the tier of the object)
  return chosen.map((c) => anchors.find((a) => a.x === c.x && a.y === c.y)!);
}

/** Anchors the generator laid out itself with the passage rule in mind (the sites of a town, the vaults of a castle) or where an object blocks nothing (a dead end). */
const FITTED_ANCHOR = /Site$|^vault|^deadEnd$|^exit$/;


/**
 * Turns a generated interior into actions and monster spawns by running the rule set of its kind.
 * Pure function of (interior, rules, root seed): the same POI always receives the same content.
 * Each rule has its own random stream, so adding a rule at the end never changes what earlier rules did.
 */
export function generateContent(map: InteriorMap, rules: RuleSet, ctx: ContentContext, topology?: Topology): MapContent {
  // a castle is made of its own parts (`actions/castle.ts`), not of the rules
  if (map.showcase) return buildShowcaseContent(map);
  if (map.castle) return buildCastleContent(map, ctx.rootSeed);
  if (map.spaceship) return buildSpaceshipContent(map, ctx.rootSeed);
  const topo = topology ?? analyzeTopology(map);
  const anchors = computeAnchors(map, topo);
  const mapSeed = derive(ctx.rootSeed, LAYER.ACTION, map.key);
  const baseTier = clamp(map.tier + rules.tierBonus, 1, 5);

  const actions: ActionInstance[] = [];
  const spawns: SpawnPoint[] = [];
  const occupied = new Set<number>();
  const idx = (x: number, y: number) => y * map.width + x;
  const counters = new Map<string, number>();

  // deeper parts are one tier harder, except at tier 1 where the whole place stays within reach of a new party
  const tierAt = (depth: number): number => clamp(baseTier + (baseTier >= 2 && Math.floor((depth * 1000) / anchors.maxDepth) >= 600 ? 1 : 0), 1, 5);

  // Chests, shrines, fountains and statues block their cell. Before placing one, make sure the rest of the map stays connected.
  const blockedCells = new Set<number>();
  // a vault behind a wall that gives way is part of the map: the wall counts as a way through
  const hiddenWalls = new Set<number>((map.sites ?? []).filter((s) => (s.kind === "vault_way" && s.how === "wall") || s.kind === "brittle").map((s) => idx(s.x, s.y)));
  const endRoom = map.dungeon?.endRoom;
  if (endRoom?.seal) hiddenWalls.add(idx(endRoom.seal.x, endRoom.seal.y));
  for (const v of map.dungeon?.vaults ?? []) hiddenWalls.add(idx(v.seal.x, v.seal.y));
  const seen = new Uint8Array(map.width * map.height);
  const queue = new Int32Array(map.width * map.height);
  const reachableCount = (): number => {
    seen.fill(0);
    let head = 0;
    let tail = 0;
    const start = idx(map.spawn.x, map.spawn.y);
    queue[tail++] = start;
    seen[start] = 1;
    // a pocket in the rock that only a teleport reaches is a second place to start from
    if (endRoom?.isolated) {
      const pocket = idx(endRoom.cx, endRoom.cy);
      queue[tail++] = pocket;
      seen[pocket] = 1;
    }
    while (head < tail) {
      const i = queue[head++]!;
      const x = i % map.width;
      const y = (i - x) / map.width;
      for (const d of ["N", "E", "S", "W"] as const) {
        const nx = x + FACING_DELTA[d].dx;
        const ny = y + FACING_DELTA[d].dy;
        if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
        const ni = ny * map.width + nx;
        if (seen[ni] || (map.cells[ni] !== CELL.FLOOR && !hiddenWalls.has(ni)) || blockedCells.has(ni)) continue;
        seen[ni] = 1;
        queue[tail++] = ni;
      }
    }
    return tail;
  };
  const baseReach = reachableCount();
  const wouldDisconnect = (cell: number): boolean => {
    blockedCells.add(cell);
    const reached = reachableCount();
    // an object must also stay within reach: one that stands behind other objects cannot be bumped into
    const enclosed = [...blockedCells].some((b) => {
      const x = b % map.width;
      const y = (b - x) / map.width;
      return !(Object.keys(FACING_DELTA) as (keyof typeof FACING_DELTA)[]).some((f) => seen[idx(x + FACING_DELTA[f].dx, y + FACING_DELTA[f].dy)] === 1);
    });
    blockedCells.delete(cell);
    return enclosed || reached !== baseReach - (blockedCells.size + 1);
  };

  // The user's rule for objects: none stands in a passage of one cell, and in a wider one it leaves a way round (`passage.ts`), whether it blocks its cell
  // or can be walked over (bones, runes, a vase). Everything placed so far counts, so two objects side by side cannot shut a corridor of two either.
  const splitsPassage = (x: number, y: number): boolean => {
    const taken = new Set<number>(actions.filter(isObject).map((o) => idx(o.x, o.y)));
    const inside = (cx: number, cy: number): boolean => cx >= 0 && cy >= 0 && cx < map.width && cy < map.height;
    return blocksPassage((cx, cy) => inside(cx, cy) && map.cells[idx(cx, cy)] === CELL.FLOOR && !blockedCells.has(idx(cx, cy)) && !taken.has(idx(cx, cy)), (cx, cy) => inside(cx, cy) && (taken.has(idx(cx, cy)) || blockedCells.has(idx(cx, cy))), x, y);
  };

  const isFree = (a: Anchor, allowProtected: boolean): boolean => {
    const i = idx(a.x, a.y);
    if (occupied.has(i)) return false;
    if (!allowProtected && anchors.protectedCells.has(i)) return false;
    return true;
  };

  const whenOk = (a: Anchor, rule: Rule): boolean => {
    const w = rule.when;
    if (!w) return true;
    const ratio = Math.floor((a.depth * 1000) / anchors.maxDepth);
    if (w.minDepth !== undefined && ratio < w.minDepth) return false;
    if (w.maxDepth !== undefined && ratio > w.maxDepth) return false;
    const t = tierAt(a.depth);
    if (w.minTier !== undefined && t < w.minTier) return false;
    if (w.maxTier !== undefined && t > w.maxTier) return false;
    if (w.excludeEntranceRoom && a.roomId >= 0 && a.roomId === anchors.entranceRoom) return false;
    if (w.minRoomSize !== undefined) {
      if (a.roomId < 0) return false;
      if ((map.rooms[a.roomId]?.size ?? 0) < w.minRoomSize) return false;
    }
    if (w.maxRoomSize !== undefined) {
      if (a.roomId < 0) return false;
      if ((map.rooms[a.roomId]?.size ?? 0) > w.maxRoomSize) return false;
    }
    return true;
  };

  const candidatesFor = (rule: Rule): Anchor[] => {
    if (rule.anchor === "beforeTreasure") {
      // the cell in front of every dead-end chest, i.e. its only floor neighbour
      const result: Anchor[] = [];
      for (const act of actions) {
        if (act.kind !== "treasure") continue;
        const open = (Object.keys(FACING_DELTA) as (keyof typeof FACING_DELTA)[]).filter((f) => map.cells[idx(act.x + FACING_DELTA[f].dx, act.y + FACING_DELTA[f].dy)] === CELL.FLOOR);
        if (open.length !== 1) continue;
        const f = open[0]!;
        const x = act.x + FACING_DELTA[f].dx;
        const y = act.y + FACING_DELTA[f].dy;
        result.push({ x, y, depth: topo.depth[idx(x, y)] ?? 0, roomId: map.roomOf[idx(x, y)] ?? -1 });
      }
      return result;
    }
    return anchors.byKind[rule.anchor];
  };

  // caves and dungeons of the generated world have a theme of the old maps: its monsters, trap, props and shrines replace the plain ones
  const dt = map.dungeon?.look;

  const pickVariant = (rule: Rule, rng: Rng): Record<string, ParamValue> => {
    let variants = rule.variants;
    if (!variants || variants.length === 0) return {};
    if (dt && rule.kind === "shrine" && dt.shrine !== null) {
      // crystals raise attributes, red wells heal, altars guard against the elements
      const wanted = variants.filter((v) => v.params.effect === SHRINE_EFFECT[dt.shrine!]);
      if (wanted.length > 0) variants = wanted;
    }
    return variants[rng.weightedIndex(variants.map((v) => v.weight))]!.params;
  };

  // the runes of the maze bar some of its loops: they throw the party to another place of the dungeon
  // (36th playtest: the party lands beside a room, not in its middle, where the monsters of the room stand; only a dungeon without such a cell throws it into a middle, and the
  // group of that middle is dropped, see `landings` below)
  const farCells = (x: number, y: number): { x: number; y: number }[] => {
    const centres = anchors.byKind.roomCenter;
    const nearCentre = (a: { x: number; y: number }): boolean => centres.some((c) => Math.abs(c.x - a.x) <= 1 && Math.abs(c.y - a.y) <= 1);
    const far = (list: readonly Anchor[]): Anchor[] => list.filter((a) => Math.abs(a.x - x) + Math.abs(a.y - y) > 14 && a.depth >= 0);
    const aside = far(anchors.byKind.roomEdge).filter((a) => !nearCentre(a) && map.cells[idx(a.x, a.y)] === CELL.FLOOR);
    if (aside.length > 0) return aside;
    // no cell beside a room that is far enough: the cell next to a room's middle (never the middle itself, where the group of the room and the decoration of a hall stand)
    return far(centres).map((c) => {
      const next = (Object.keys(FACING_DELTA) as (keyof typeof FACING_DELTA)[]).map((f) => ({ x: c.x + FACING_DELTA[f].dx, y: c.y + FACING_DELTA[f].dy })).find((n) => map.cells[idx(n.x, n.y)] === CELL.FLOOR);
      return next ? { ...c, x: next.x, y: next.y } : c;
    });
  };
  (map.dungeon?.barriers ?? []).forEach((c, i) => {
    const rng = new Rng(derive(mapSeed, "barrier", i));
    const far = farCells(c.x, c.y);
    const to = far.length > 0 ? far[rng.int(far.length)]! : { x: map.spawn.x, y: map.spawn.y };
    actions.push({ uid: `${map.key}#barrier:${i}`, kind: "teleporter", x: c.x, y: c.y, params: { item: 73, tx: to.x, ty: to.y } });
    occupied.add(idx(c.x, c.y));
    // the party is set down on the target: no object may stand there (36th playtest, point 4)
    // (a room's middle is where its monsters stand: that case is the last resort, and the group there steps aside instead, see `landings`)
    if (!anchors.byKind.roomCenter.some((r) => r.x === to.x && r.y === to.y)) occupied.add(idx(to.x, to.y));
  });

  // The puzzle of the theme comes first: it reserves its hall and its cells before the ordinary rules fill the place.
  const questUids = new Map<string, number>();
  const roomCentres = new Set(anchors.byKind.roomCenter.map((a) => idx(a.x, a.y)));
  const questEnv: QuestEnv | null =
    dt && map.dungeon?.quest !== "spaceship"
      ? {
          map,
          theme: dt,
          tier: baseTier,
          anchors,
          mapSeed,
          rootSeed: ctx.rootSeed,
          actions,
          spawns,
          scale: map.dungeon?.scale ?? 1,
          derive: (name) => derive(mapSeed, name),
          placeEnd: (a) => {
            const i = idx(a.x, a.y);
            if (map.cells[i] !== CELL.FLOOR || occupied.has(i)) return false;
            actions.push(a);
            occupied.add(i);
            if (blocksCell(a)) blockedCells.add(i);
            return true;
          },
          uid: (name) => {
            const n = questUids.get(name) ?? 0;
            questUids.set(name, n + 1);
            return `${map.key}#q-${name}:${n}`;
          },
          // the middle of a room is where its monsters stand
          free: (x, y) => map.cells[idx(x, y)] === CELL.FLOOR && !occupied.has(idx(x, y)) && !anchors.protectedCells.has(idx(x, y)) && !roomCentres.has(idx(x, y)),
          place: (a) => {
            const i = idx(a.x, a.y);
            if (map.cells[i] !== CELL.FLOOR || occupied.has(i) || anchors.protectedCells.has(i)) return false;
            const blocking = blocksCell(a);
            if (blocking && wouldDisconnect(i)) return false;
            actions.push(a);
            occupied.add(i);
            if (blocking) blockedCells.add(i);
            return true;
          },
          reserve: (x, y) => void occupied.add(idx(x, y)),
          trapDamage: (trap, tier, rng) => Number(resolveParam(TRAP_DAMAGE[trap] ?? 0, { tier, depth: 0, depthRatio: 0, mapTier: baseTier }, rng)),
        }
      : null;
  const quest: QuestResult = questEnv ? placeQuest(questEnv) : {};

  // the cells where a rune, a wrong answer or a portal sets the party down: no group of monsters starts on one of them (36th playtest, point 4; the game moves a monster that
  // wandered there since)
  const landings = new Set<number>();
  for (const act of actions) if ((act.kind === "teleporter" || act.kind === "riddle" || act.kind === "qportal") && (act.params.tx !== 0 || act.params.ty !== 0) && act.params.tx !== undefined) landings.add(idx(Number(act.params.tx), Number(act.params.ty)));

  // the Crow's perch is not an action but it is there: its cell is taken, and solid while the Crow sits on it
  for (const site of map.sites ?? []) {
    if (site.kind !== "perch") continue;
    occupied.add(idx(site.x, site.y));
    blockedCells.add(idx(site.x, site.y));
  }

  // the Skull Miser is always in the start town (ue_quest_2), in a dead end
  if (map.kind === "town" && map.key.startsWith("p:0:0:0:")) {
    const doors = new Set(map.lots.map((l) => idx(l.door.x, l.door.y)));
    const spot = anchors.byKind.deadEnd.find((a) => isFree(a, false) && !doors.has(idx(a.x, a.y)) && !wouldDisconnect(idx(a.x, a.y)));
    if (spot) {
      actions.push({ uid: `${map.key}#skullmiser:0`, kind: "skullmiser", x: spot.x, y: spot.y, params: { persona: 82 } });
      occupied.add(idx(spot.x, spot.y));
      blockedCells.add(idx(spot.x, spot.y));
    }
  }

  // the layouts bring their own say about doors: dungeon_2 shuts every way at its beginning and its end, dungeon_3 (the maze) has no doors at all
  const layout = map.dungeon?.layout;
  const ruleList = rules.rules.flatMap((r): Rule[] => (r.id !== "door" ? [r] : layout === "dungeon_3" ? [] : layout === "dungeon_2" ? [{ ...r, count: { chance: 1000 }, when: undefined }] : [r]));
  // the maze has some 1800 cells of floor but only six rooms, and the rules put one group in the middle of a room: it stood nearly empty (35th playtest, "Pit of Morena"). Ten more groups
  // wander its passages, which makes about three times the monsters; the other layouts have their rooms for the monsters
  if (layout === "dungeon_3" && dt) ruleList.push({ id: "monsters_maze", kind: "spawn", anchor: "corridor", when: { minDepth: 80 }, count: { perMap: [MAZE_GROUPS, MAZE_GROUPS] }, params: { boss: false, group: "=1+rand(0,tier)" } });

  for (const rule of ruleList) {
    if (rule.when?.theme && !dt) continue;
    if (rule.when?.klass && dt?.klass !== rule.when.klass) continue;
    if (rule.kind === "decor" && !dt && map.kind !== "town" && rule.id !== "banner") continue;
    // quest 5 has exactly one end boss, the one that stands before the end room
    if (rule.id === "boss_guard" && map.dungeon?.quest === "quest_5" && spawns.some((s) => s.boss)) continue;
    // a theme whose props are all chests, shrines and things that must be of use has no decoration
    if (rule.kind === "decor" && dt && plainProps(dt).length === 0) continue;
    if (dt && ((rule.kind === "trap" && dt.trap === "none") || (rule.kind === "shrine" && dt.shrine === null))) continue;
    const rng = new Rng(derive(mapSeed, rule.id));
    const allowProtected = rule.kind === "transfer" || rule.anchor.startsWith("vault");
    // the middle of a room is where its monsters stand: in a small room it is also an edge cell, and a chest or a prop there left the room empty
    const keepsCentre = rule.anchor !== "roomCenter" && rule.anchor !== "bossRoom" && !rule.anchor.startsWith("vault");
    const pool = candidatesFor(rule).filter((a) => whenOk(a, rule) && isFree(a, allowProtected) && !(keepsCentre && roomCentres.has(idx(a.x, a.y))));

    // ----- choose anchors
    let chosen: Anchor[];
    if (rule.count.perMap) {
      const n = rng.range(rule.count.perMap[0], rule.count.perMap[1]);
      chosen = rng.shuffle([...pool]).slice(0, n);
    } else {
      const p = rule.count.chance ?? 0;
      chosen = pool.filter(() => rng.chance(p));
    }

    // town services: every town has every building there is (special buildings may come later), on lots picked by chance
    let services: string[] | null = null;
    if (rule.assign) {
      services = [...rule.assign];
      chosen = rng.shuffle([...pool]).slice(0, services.length);
    }

    chosen.forEach((a, i) => {
      if (!isFree(a, allowProtected)) return; // an earlier pick of this rule may have taken the cell
      // two doors (or a door and a gate) never follow each other directly: a short corridor between two rooms has a mouth at each end
      if (rule.kind === "door" && actions.some((o) => o.kind === "door" && Math.abs(o.x - a.x) + Math.abs(o.y - a.y) < 2)) return;
      const local = new Rng(derive(mapSeed, rule.id, i));
      const tier = tierAt(a.depth);
      const vars = { tier, depth: a.depth, depthRatio: Math.floor((a.depth * 1000) / anchors.maxDepth), mapTier: baseTier };
      const raw: Record<string, ParamValue> = { ...(rule.params ?? {}), ...(a.params ?? {}), ...pickVariant(rule, local) };
      const params: Record<string, ParamValue> = {};
      for (const [k, v] of Object.entries(raw)) params[k] = resolveParam(v, vars, local);
      if (dt && rule.id !== "lantern") themeParams(rule.kind, params, dt, vars, local);
      // a barrel must be of use: wherever a theme stands one as a prop it is a container with a few coins or a joke in it
      let kind: ActionKind = rule.kind === "spawn" ? "legacy" : rule.kind;
      if (kind === "decor" && Number(params.item) === BARREL) {
        kind = "treasure";
        delete params.item;
        Object.assign(params, { chest: BARREL, level: 1, items: 0, gold: local.chance(500) ? Math.max(1, tier * 12 + local.range(3, 30)) : 0 });
      }
      // a bookshelf is a container as well (34th playtest): searched once, it may hold a spell scroll; it is never plain decoration
      if (kind === "decor" && isBookshelf(params.item)) {
        kind = "treasure";
        Object.assign(params, { chest: Number(params.item), level: 1, items: 0, gold: 0 });
        delete params.item;
      }
      // a pile of bones hides something one time in five (35th playtest): a few coins, now and then an item, and in one such pile of five a rat (the trap mechanic of the unlocked
      // chests, physical damage); the party finds it when it steps on the pile, which stays a decoration it can walk over
      if (kind === "decor" && SEARCHABLE_DECOR.includes(Number(params.item))) {
        const boneRng = new Rng(derive(mapSeed, rule.id, i, "bones"));
        if (boneRng.chance(BONES_FIND_CHANCE)) {
          Object.assign(params, { find: 1, level: tier, gold: Math.max(1, tier * 15 + boneRng.range(3, 40)), items: boneRng.chance(300) ? 1 : 0 });
          if (boneRng.chance(CHEST_TRAP_CHANCE)) Object.assign(params, { trapped: RAT_TRAP, trapDamage: Math.max(1, Math.ceil(Number(resolveParam(TRAP_DAMAGE.generic ?? 0, vars, boneRng)) / 2)), trapLevel: tier });
        }
      }
      // an ordinary chest is locked (a simple check for the best thief of the party); barrels and the like are not
      if (kind === "treasure" && hasOrdinaryLock(params)) params.difficulty = chestLock(baseTier);
      // a chest that is not locked springs a trap one time in five (not a bookshelf, not a chest of a quest or of the king): the element and the damage are fixed here, who is hit is decided when it is opened
      else if (kind === "treasure" && params.quest === undefined && params.bonus === undefined && params.lock === undefined && params.warn === undefined && !isBookshelf(params.chest)) {
        const trapRng = new Rng(derive(mapSeed, rule.id, i, "chest-trap"));
        if (trapRng.chance(CHEST_TRAP_CHANCE)) {
          const elements = map.kind === "cave" ? CHEST_TRAP_ELEMENTS.filter((e) => e !== "ice") : CHEST_TRAP_ELEMENTS;
          params.trapped = elements[trapRng.int(elements.length)]!;
          params.trapDamage = resolveParam(TRAP_DAMAGE.generic ?? 0, vars, trapRng);
          params.trapLevel = tier;
        }
      }

      // what a prop does depends on the old item it shows, so whether it blocks is known only now
      const blocking = blocksCell({ kind, params }) && rule.anchor !== "vaultChest";
      if (blocking && wouldDisconnect(idx(a.x, a.y))) return; // would wall off part of the map
      if (isObject({ kind, params }) && !FITTED_ANCHOR.test(rule.anchor) && splitsPassage(a.x, a.y)) return; // would stand in a passage

      const n = (counters.get(rule.id) ?? 0) + 1;
      counters.set(rule.id, n);
      const uid = `${map.key}#${rule.id}:${n - 1}`;

      if (rule.kind === "spawn") {
        const boss = params.boss === true;
        const group = Math.max(1, Number(params.group ?? 1));
        const monsterIds: number[] = [];
        if (typeof params.monsters === "string" && params.monsters !== "") {
          // the cell names who may stand on it (the guards behind the gates of a town)
          const named = params.monsters.split(",").map(Number);
          for (let m = 0; m < group; m++) monsterIds.push(named[local.int(named.length)]!);
        } else if (dt) {
          const pool = themeMonsters(dt, tier);
          for (let m = 0; m < group; m++) monsterIds.push(pool[local.int(pool.length)]!);
          if (boss) monsterIds[0] = themeBoss(dt, Math.min(5, tier));
        } else for (let m = 0; m < group; m++) monsterIds.push(pickMonsterWeighted(local, map.theme.monsterThemes, tier).id);
        if (boss && !dt) {
          // the boss is one step above the rest of the place (but not above tier 2 on the first tier, so a new party can win)
          const themeNames = Object.keys(map.theme.monsterThemes).filter(hasLandMonster);
          monsterIds[0] = pickMonster(local, themeNames[local.int(themeNames.length)] ?? "humanoid", Math.min(5, tier + (tier >= 2 ? 1 : 0))).id;
        }
        // the party may land on this cell: the group starts on a free cell beside it (never dropped: a boss must stay)
        let sx = a.x;
        let sy = a.y;
        if (landings.has(idx(sx, sy))) {
          const beside = (Object.keys(FACING_DELTA) as (keyof typeof FACING_DELTA)[]).map((f) => ({ x: a.x + FACING_DELTA[f].dx, y: a.y + FACING_DELTA[f].dy })).find((c) => map.cells[idx(c.x, c.y)] === CELL.FLOOR && !occupied.has(idx(c.x, c.y)) && !landings.has(idx(c.x, c.y)) && !blockedCells.has(idx(c.x, c.y)));
          if (!beside) return;
          sx = beside.x;
          sy = beside.y;
        }
        spawns.push({ uid, x: sx, y: sy, monsterIds, boss });
        occupied.add(idx(sx, sy));
        return;
      }

      if (services) {
        params.service = services[i] ?? SERVICES[0];
        params.tier = tier;
      }
      if (rule.kind === "lore") params.pool = String(params.pool ?? map.kind);
      if (rule.kind === "talent") Object.assign(params, sellerParams(String(params.talent)));
      if (rule.kind === "door") {
        params.axis = a.facing === "E" || a.facing === "W" ? "x" : "y";
      }
      if (rule.kind === "breakable_wall") params.axis = a.facing === "E" || a.facing === "W" ? "x" : "y";
      if (rule.kind === "transfer") params.tier = tier;

      actions.push({ uid, kind: kind as ActionKind, x: a.x, y: a.y, params });
      occupied.add(idx(a.x, a.y));
      if (blocking) blockedCells.add(idx(a.x, a.y));
    });
  }

  // the end room: what the plan put there (keys, key cards, orbs) and the rewards of its level
  if (questEnv && map.dungeon?.endRoom) finishQuest(questEnv);
  // the treasure chambers behind brittle walls (35th playtest)
  if (questEnv && map.dungeon?.vaults) placeVaults(questEnv);
  // Seth Squirm and the machines, the Quatloo coins and silver skulls in the ordinary chests (ue_quest_1 and ue_quest_2)
  if (questEnv) placeMachines(questEnv);
  if (map.dungeon) hideInChests(map, actions, map.dungeon.coins, map.dungeon.skulls, mapSeed);
  // and the spell scrolls the plan of the world assigned to this place (34th playtest)
  if (map.dungeon) hideSpells(map, actions, map.dungeon.spells, mapSeed);

  quest.finish?.();


  // every produced action must satisfy its schema; a failure here is a bug in the rule data
  for (const act of actions) {
    const parsed = ACTION_DEFS[act.kind].params.safeParse(act.params);
    if (!parsed.success) throw new Error(`rule produced invalid params for ${act.uid}: ${parsed.error.message}`);
  }
  return { mapKey: map.key, tier: baseTier, actions, spawns };
}

/**
 * The props of a theme that may stand as plain decoration: not the object that holds the loot or blesses (an iron chest that gives nothing
 * reads as a bug), and nothing that must be of use (the user's object list: a barrel is the one exception, it becomes a container).
 */
export function plainProps(t: DungeonTheme): number[] {
  return t.props.filter((p) => p !== t.chest && p !== t.shrine && (!isFunctional(p) || p === BARREL || BOOKSHELVES.includes(p)));
}

/** What a theme sets on the actions of its place: its one kind of trap, the objects that hold loot, shrines and props, and the monsters of an ambush. */
function themeParams(kind: Rule["kind"], params: Record<string, ParamValue>, t: DungeonTheme, vars: ExprVars, rng: Rng): void {
  switch (kind) {
    case "trap":
      params.trap = t.trap;
      params.damage = resolveParam(TRAP_DAMAGE[t.trap] ?? 0, vars, rng);
      if (t.trap === "generic" && t.trapElement) params.element = t.trapElement;
      break;
    case "treasure":
      params.chest = t.chest;
      params.level = clamp(Number(params.level ?? 1) + t.loot.level, 1, 8);
      params.gold = Math.floor((Number(params.gold ?? 0) * t.loot.gold) / 100);
      break;
    case "shrine":
      if (t.shrine !== null) params.item = t.shrine;
      break;
    case "decor": {
      const choices = plainProps(t);
      params.item = choices[rng.int(choices.length)]!;
      break;
    }
    case "ambush":
      params.monsters = themeMonsters(t, Number(vars.tier)).join(",");
      break;
    default:
      break;
  }
}

/** Evaluates a standalone expression with the same rules as rule parameters. Exposed for tests. */
export function evaluate(expression: string, vars: Record<string, number>, rng: Rng): number {
  return evalExpr(expression, vars, rng);
}

export type { AnchorSet };
