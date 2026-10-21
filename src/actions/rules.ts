import { derive, LAYER, Rng, type SeedState } from "../core/rng";
import { QUEST_BUILT, QUEST_PROP, SHRINE_EFFECT, THEMES_BY_ID, type DungeonTheme } from "../data/dungeon-themes";
import { BANNER, castleBosses, castleMonsters } from "../data/castles";
import { hasLandMonster, pickMonster, pickMonsterWeighted } from "../data/monsters";
import { sellerParams } from "../data/talent-sellers";
import { allowedIn, isFunctional } from "../data/item-rules";
import { placeOf } from "../interiors/place";
import { TRAP_DAMAGE } from "../data/rules";
import { analyzeTopology, type Topology } from "../interiors/topology";
import { blocksPassage } from "../interiors/passage";
import { CELL, FACING_DELTA, type InteriorMap } from "../interiors/types";
import { computeAnchors, type AnchorSet } from "./anchors";
import { themeBoss, themeMonsters } from "./monsterPool";
import { placeQuest, type QuestEnv, type QuestResult } from "./questGen";
import { ACTION_DEFS, SERVICES, blocksCell } from "./registry";
import { evalExpr, resolveParam, type ExprVars } from "./expr";
import type { ActionInstance, ActionKind, Anchor, MapContent, ParamValue, Rule, RuleSet, SpawnPoint } from "./types";

/** The old barrel (item 5): a container, never plain decoration. */
const BARREL = 5;

export interface ContentContext {
  rootSeed: SeedState;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The banners hang on the wall (old items 103 to 105): the cell in front of one stays as free as it was. */
const WALL_HUNG = [103, 104, 105];
/** Actions that stand on their cell as an object, blocking it or not (a lore message is one only when it shows a statue or a person). */
const isObject = (a: { kind: ActionKind; params: Record<string, unknown> }): boolean =>
  a.kind === "lore" ? a.params.object !== undefined || a.params.persona !== undefined : a.kind === "decor" && WALL_HUNG.includes(Number(a.params.item)) ? false : ["decor", "treasure", "shrine", "fountain", "riddle", "gong", "lever", "head", "teleporter", "talent", "work", "portal"].includes(a.kind);
/** Anchors the generator laid out itself with the passage rule in mind (the sites of a town, the vaults of a castle) or where an object blocks nothing (a dead end). */
const FITTED_ANCHOR = /Site$|^vault|^deadEnd$|^exit$/;


/**
 * Turns a generated interior into actions and monster spawns by running the rule set of its kind.
 * Pure function of (interior, rules, root seed): the same POI always receives the same content.
 * Each rule has its own random stream, so adding a rule at the end never changes what earlier rules did.
 */
export function generateContent(map: InteriorMap, rules: RuleSet, ctx: ContentContext, topology?: Topology): MapContent {
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
  const hiddenWalls = new Set<number>((map.sites ?? []).filter((s) => s.kind === "vault_way" && s.how === "wall").map((s) => idx(s.x, s.y)));
  const seen = new Uint8Array(map.width * map.height);
  const queue = new Int32Array(map.width * map.height);
  const reachableCount = (): number => {
    seen.fill(0);
    let head = 0;
    let tail = 0;
    const start = idx(map.spawn.x, map.spawn.y);
    queue[tail++] = start;
    seen[start] = 1;
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
  const dt = map.dungeon ? THEMES_BY_ID[map.dungeon.id] : undefined;

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

  // The puzzle of the theme comes first: it reserves its hall and its cells before the ordinary rules fill the place.
  const questUids = new Map<string, number>();
  const roomCentres = new Set(anchors.byKind.roomCenter.map((a) => idx(a.x, a.y)));
  const questEnv: QuestEnv | null =
    dt && dt.quest !== "none" && QUEST_BUILT.includes(dt.quest)
      ? {
          map,
          theme: dt,
          tier: baseTier,
          anchors,
          mapSeed,
          actions,
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

  // The people and altars of the old map that sell talents stand at the end of side passages, as far from the way in as the place goes.
  // They come before the ordinary rules, which would leave too few free dead ends.
  dt?.talents?.forEach((talent, i) => {
    const rng = new Rng(derive(mapSeed, "talent", i));
    const deep = [...anchors.byKind.deadEnd].sort((p, q) => q.depth - p.depth || p.y - q.y || p.x - q.x);
    const spots = [...rng.shuffle(deep.slice(0, 6)), ...deep.slice(6), ...rng.shuffle([...anchors.byKind.roomEdge])];
    // the middle of a room is where its monsters (and the boss) stand
    const spot = spots.find((s) => isFree(s, false) && !roomCentres.has(idx(s.x, s.y)) && !wouldDisconnect(idx(s.x, s.y)));
    if (!spot) return;
    actions.push({ uid: `${map.key}#talent:${i}`, kind: "talent", x: spot.x, y: spot.y, params: { talent, ...sellerParams(talent) } });
    occupied.add(idx(spot.x, spot.y));
    blockedCells.add(idx(spot.x, spot.y));
  });

  // the Crow's perch is not an action but it is there: its cell is taken, and solid while the Crow sits on it
  for (const site of map.sites ?? []) {
    if (site.kind !== "perch") continue;
    occupied.add(idx(site.x, site.y));
    blockedCells.add(idx(site.x, site.y));
  }

  for (const rule of rules.rules) {
    if (rule.when?.theme && !dt) continue;
    if (rule.when?.klass && dt?.klass !== rule.when.klass) continue;
    if (rule.when?.alignment && !(map.castle && rule.when.alignment.includes(map.castle.alignment))) continue;
    if (rule.kind === "decor" && !dt && map.kind !== "town" && rule.id !== "banner") continue;
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
      if (dt) themeParams(rule.kind, params, dt, vars, local);
      else if (map.castle) {
        // the banner shows the kind of castle, an ambush draws from its monsters
        if (rule.id === "banner") params.item = BANNER[map.castle.alignment];
        if (rule.kind === "ambush") params.monsters = castleMonsters(map.castle.alignment, tier).join(",");
      }
      // a barrel must be of use: wherever a theme stands one as a prop it is a container with a few coins or a joke in it
      let kind: ActionKind = rule.kind === "spawn" ? "legacy" : rule.kind;
      if (kind === "decor" && Number(params.item) === BARREL) {
        kind = "treasure";
        delete params.item;
        Object.assign(params, { chest: BARREL, level: 1, items: 0, gold: local.chance(500) ? Math.max(1, tier * 12 + local.range(3, 30)) : 0 });
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
        } else if (map.castle) {
          // a castle keeps the monsters of its kind; the boss and the guard of the main vault are the strongest it has at this tier
          const pool = castleMonsters(map.castle.alignment, tier);
          for (let m = 0; m < group; m++) monsterIds.push(pool[local.int(pool.length)]!);
          if (boss) {
            const strong = castleBosses(map.castle.alignment, tier);
            monsterIds[0] = strong[local.int(strong.length)]!;
          }
        } else for (let m = 0; m < group; m++) monsterIds.push(pickMonsterWeighted(local, map.theme.monsterThemes, tier).id);
        if (boss && !dt && !map.castle) {
          // the boss is one step above the rest of the place (but not above tier 2 on the first tier, so a new party can win)
          const themeNames = Object.keys(map.theme.monsterThemes).filter(hasLandMonster);
          monsterIds[0] = pickMonster(local, themeNames[local.int(themeNames.length)] ?? "humanoid", Math.min(5, tier + (tier >= 2 ? 1 : 0))).id;
        }
        spawns.push({ uid, x: a.x, y: a.y, monsterIds, boss });
        occupied.add(idx(a.x, a.y));
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

  // The keys of a free place and the key card of a key place (chapter 1.2 of docs/DUNGEON_THEMES.md): one chest each, far from the
  // way in. Keys lie at the end of a side passage, the card in the boss's room.
  if (map.dungeon && dt) {
    map.dungeon.gives.forEach((type, i) => {
      const rng = new Rng(derive(mapSeed, "quest", i));
      const far = (list: Anchor[]) => [...list].sort((p, q) => q.depth - p.depth || p.y - q.y || p.x - q.x);
      const deep = far(anchors.byKind.deadEnd);
      const spots = dt.klass === "B" ? [...rng.shuffle([...anchors.byKind.bossRoomEdge]), ...deep.slice(0, 4)] : [...rng.shuffle(deep.slice(0, 4)), ...deep.slice(4), ...rng.shuffle([...anchors.byKind.bossRoomEdge])];
      const rest = [...rng.shuffle([...anchors.byKind.roomEdge]), ...rng.shuffle([...anchors.byKind.roomCenter])];
      // a puzzle may keep the card in a chest of its own (the middle of the head ring), shut until it is solved
      const own = type.endsWith("_keycard") ? quest.cardChest : undefined;
      const spot = own ?? [...spots, ...rest].find((a) => isFree(a, false) && !wouldDisconnect(idx(a.x, a.y)));
      if (!spot) throw new Error(`no place for ${type} in ${map.key}`);
      actions.push({ uid: `${map.key}#quest:${i}`, kind: "treasure", x: spot.x, y: spot.y, params: { level: 1, gold: 0, items: 0, quest: type, chest: QUEST_PROP[type] !== undefined && allowedIn(QUEST_PROP[type]!, placeOf(map)) ? QUEST_PROP[type]! : dt.chest, ...(own?.params ?? {}) } });
      occupied.add(idx(spot.x, spot.y));
      blockedCells.add(idx(spot.x, spot.y));
    });
  }

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
  return t.props.filter((p) => p !== t.chest && p !== t.shrine && (!isFunctional(p) || p === BARREL));
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
