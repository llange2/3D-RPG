import { CELL, FACING_DELTA, type Facing, type InteriorMap } from "../interiors/types";
import type { Topology } from "../interiors/topology";
import type { Anchor, AnchorKind } from "./types";

export interface AnchorSet {
  byKind: Record<Exclude<AnchorKind, "beforeTreasure">, Anchor[]>;
  entranceRoom: number;
  bossRoom: number;
  maxDepth: number;
  /** Cells that never receive actions (except the exit transfer): spawn, exit and their neighbours. */
  protectedCells: Set<number>;
}

const DIRS: Facing[] = ["N", "E", "S", "W"];

function opposite(f: Facing): Facing {
  return f === "N" ? "S" : f === "S" ? "N" : f === "E" ? "W" : "E";
}

/** Derives all placement anchors of an interior from its layout and topology. */
export function computeAnchors(map: InteriorMap, topo: Topology): AnchorSet {
  const w = map.width;
  const idx = (x: number, y: number) => y * w + x;
  const floorAt = (x: number, y: number) => x >= 0 && y >= 0 && x < map.width && y < map.height && map.cells[idx(x, y)] === CELL.FLOOR;
  const solidAt = (x: number, y: number) => !floorAt(x, y);
  const depthAt = (x: number, y: number) => topo.depth[idx(x, y)] ?? -1;
  const roomAt = (x: number, y: number) => map.roomOf[idx(x, y)] ?? -1;

  const protectedCells = new Set<number>();
  for (const c of [map.spawn, map.exit]) {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) protectedCells.add(idx(c.x + dx, c.y + dy));
  }

  // a castle's vaults are the business of their own rules: nothing else is put in the chamber, in its walls or in the doorway
  // (the chest lies in the corner of the 3 x 3 block, two cells reach its far walls; the way in also keeps the cell in front of it clear)
  for (const s of map.sites ?? []) {
    if (s.kind !== "vault_chest" && s.kind !== "vault_way") continue;
    const r = s.kind === "vault_chest" ? 2 : 1;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) protectedCells.add(idx(s.x + dx, s.y + dy));
  }

  // the end room of a quest is the business of the quest: nothing else is put in it
  const end = map.dungeon?.endRoom;
  if (end) {
    for (let y = end.y - 1; y <= end.y + end.h; y++) for (let x = end.x - 1; x <= end.x + end.w; x++) protectedCells.add(idx(x, y));
  }

  // so is the room of the machines of the Quatloo coins
  const machines = map.dungeon?.machines;
  if (machines) {
    for (let y = machines.y - 1; y <= machines.y + machines.h; y++) for (let x = machines.x - 1; x <= machines.x + machines.w; x++) protectedCells.add(idx(x, y));
    for (const c of [machines.door, machines.front]) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) protectedCells.add(idx(c.x + dx, c.y + dy));
  }

  const entranceRoom = roomAt(map.spawn.x, map.spawn.y);
  const bossRoom = map.rooms.length > 0 ? topo.bossRoom : -1;

  const by: AnchorSet["byKind"] = {
    exit: [{ x: map.exit.x, y: map.exit.y, depth: 0, roomId: roomAt(map.exit.x, map.exit.y) }],
    mouth: [],
    deadEnd: [],
    roomCenter: [],
    roomEdge: [],
    corridor: [],
    bossRoom: [],
    bossRoomEdge: [],
    lot: [],
    plaza: [],
    plazaCorner: [],
    wallBetween: [],
    street: [],
    talentSite: [],
    portalSite: [],
    workSite: [],
    chestSite: [],
    looseSite: [],
    cageSite: [],
    guardSite: [],
    decorSite: [],
    fountainSite: [],
    vaultGate: [],
    vaultDoor: [],
    vaultWall: [],
    vaultChest: [],
    vaultGuard: [],
  };

  const mouthCells = new Set<number>();
  for (const m of topo.mouths) mouthCells.add(idx(m.x, m.y));

  const seenMouth = new Set<number>();
  for (const m of topo.mouths) {
    if (!m.straight || seenMouth.has(idx(m.x, m.y))) continue;
    seenMouth.add(idx(m.x, m.y));
    // facing = direction of travel through the door (from the corridor into the room)
    by.mouth.push({ x: m.x, y: m.y, depth: depthAt(m.x, m.y), roomId: m.roomId, facing: m.facing });
  }

  // a dead end is where something is meant to stand, in a town as much as anywhere
  for (const d of topo.deadEnds) by.deadEnd.push({ x: d.x, y: d.y, depth: d.depth, roomId: roomAt(d.x, d.y) });
  if (map.kind !== "town") {
    for (const c of topo.straightCorridors) by.corridor.push({ x: c.x, y: c.y, depth: c.depth, roomId: -1 });
  }

  map.rooms.forEach((room) => {
    if (map.cells[idx(room.cx, room.cy)] === CELL.FLOOR) {
      const a: Anchor = { x: room.cx, y: room.cy, depth: depthAt(room.cx, room.cy), roomId: room.id };
      by.roomCenter.push(a);
      if (room.id === bossRoom) by.bossRoom.push(a);
    }
    // edge cells: floor cells next to a wall, away from doorways, in open surroundings
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        if (!floorAt(x, y) || roomAt(x, y) !== room.id) continue;
        if (protectedCells.has(idx(x, y))) continue;
        const floorN = DIRS.filter((d) => floorAt(x + FACING_DELTA[d].dx, y + FACING_DELTA[d].dy)).length;
        const wallN = 4 - floorN;
        if (wallN < 1 || floorN < 3) continue;
        let nearMouth = false;
        for (let dy = -1; dy <= 1 && !nearMouth; dy++) for (let dx = -1; dx <= 1; dx++) if (mouthCells.has(idx(x + dx, y + dy))) nearMouth = true;
        if (nearMouth) continue;
        const a: Anchor = { x, y, depth: depthAt(x, y), roomId: room.id };
        by.roomEdge.push(a);
        if (room.id === bossRoom) by.bossRoomEdge.push(a);
      }
    }
  });

  for (const lot of map.lots) {
    by.lot.push({ x: lot.door.x, y: lot.door.y, depth: depthAt(lot.door.x, lot.door.y), roomId: -1, facing: lot.door.facing, lotId: lot.id });
  }

  if (map.plaza) {
    // the middle of the square holds the fountain, the corners hold statues
    const p = map.plaza;
    const cx = p.x + Math.floor(p.w / 2);
    const cy = p.y + Math.floor(p.h / 2);
    by.plaza.push({ x: cx, y: cy, depth: depthAt(cx, cy), roomId: -1 });
    for (const [x, y] of [
      [p.x, p.y],
      [p.x + p.w - 1, p.y],
      [p.x, p.y + p.h - 1],
      [p.x + p.w - 1, p.y + p.h - 1],
    ] as const) {
      if (floorAt(x, y)) by.plazaCorner.push({ x, y, depth: depthAt(x, y), roomId: -1 });
    }
  }

  if (map.kind === "town") {
    const lotDoors = new Set(map.lots.map((l) => idx(l.door.x, l.door.y)));
    for (let y = 1; y < map.height - 1; y++) {
      for (let x = 1; x < map.width - 1; x++) {
        if (!floorAt(x, y) || lotDoors.has(idx(x, y)) || protectedCells.has(idx(x, y))) continue;
        const nearBuilding = DIRS.some((d) => map.cells[idx(x + FACING_DELTA[d].dx, y + FACING_DELTA[d].dy)] === CELL.BUILDING);
        const floorN = DIRS.filter((d) => floorAt(x + FACING_DELTA[d].dx, y + FACING_DELTA[d].dy)).length;
        if (nearBuilding && floorN >= 3 && depthAt(x, y) >= 0) by.street.push({ x, y, depth: depthAt(x, y), roomId: -1 });
      }
    }
  }

  // the people, chests, fountains and decoration of a town's ground plan; what each cell brings along rides on the anchor
  for (const s of map.sites ?? []) {
    // the chamber of a vault behind a hidden wall cannot be reached before the wall gives way: it has no depth, it still counts
    const vault = s.kind === "vault_way" || s.kind === "vault_chest" || s.kind === "vault_guard";
    const a: Anchor = { x: s.x, y: s.y, depth: vault ? Math.max(0, depthAt(s.x, s.y)) : depthAt(s.x, s.y), roomId: -1 };
    if (a.depth < 0) continue;
    switch (s.kind) {
      case "talent":
        by.talentSite.push({ ...a, params: { talent: s.talent } });
        break;
      case "chest":
        // the old object stays what the chest looks like
        by.chestSite.push({ ...a, params: { chest: s.item, item: s.item } });
        break;
      case "loose":
        // a chest of the old town that is no real chest: it may hold loot, or just stand there as the same object
        by.looseSite.push({ ...a, params: { chest: s.item, item: s.item } });
        break;
      case "decor":
        by.decorSite.push({ ...a, params: { item: s.item } });
        break;
      case "cage":
        by.cageSite.push({ ...a, facing: s.axis === "x" ? "E" : "S" });
        break;
      case "guard":
        by.guardSite.push({ ...a, params: { monsters: s.monsters.join(",") } });
        break;
      case "portal":
        by.portalSite.push({ ...a, params: { item: s.item } });
        break;
      case "work":
        by.workSite.push({ ...a, params: { persona: s.persona } });
        break;
      case "vault_way":
        (s.how === "gate" ? by.vaultGate : s.how === "door" ? by.vaultDoor : by.vaultWall).push({ ...a, facing: s.axis === "x" ? "E" : "S" });
        break;
      case "vault_chest":
        // the main vault holds the hoard of the castle's boss room
        by.vaultChest.push({ ...a, params: s.main ? { level: "=min(8,tier+2)", gold: "=tier*640+rand(0,400)", items: "=2+rand(0,2)" } : {} });
        break;
      case "vault_guard":
        by.vaultGuard.push({ ...a, params: { boss: s.boss } });
        break;
      case "perch":
        break;
      case "fountain":
        by.fountainSite.push(a);
        break;
    }
  }

  // wall cells between two floor areas: candidates for breakable shortcuts (in a town the wall between two streets, a house wall)
  {
    for (let y = 1; y < map.height - 1; y++) {
      for (let x = 1; x < map.width - 1; x++) {
        const wall = map.cells[idx(x, y)];
        if (wall !== CELL.SOLID && !(map.kind === "town" && wall === CELL.BUILDING)) continue;
        // a shop's door and its sign are on walls that stay: a wall that gives way next to them would leave the door or the sign hanging
        if (map.lots.some((l) => Math.abs(l.door.x - x) <= 1 && Math.abs(l.door.y - y) <= 1)) continue;
        for (const [a, b] of [
          ["N", "S"],
          ["E", "W"],
        ] as [Facing, Facing][]) {
          const ax = x + FACING_DELTA[a].dx;
          const ay = y + FACING_DELTA[a].dy;
          const bx = x + FACING_DELTA[b].dx;
          const by2 = y + FACING_DELTA[b].dy;
          if (!floorAt(ax, ay) || !floorAt(bx, by2)) continue;
          // the other two sides must be solid so the wall is one cell thick and clearly a wall
          const c = opposite(a) === b ? (a === "N" ? ["E", "W"] : ["N", "S"]) : [];
          if (!c.every((f) => solidAt(x + FACING_DELTA[f as Facing].dx, y + FACING_DELTA[f as Facing].dy))) continue;
          const da = depthAt(ax, ay);
          const db = depthAt(bx, by2);
          if (da < 0 || db < 0 || Math.abs(da - db) < 8) continue;
          by.wallBetween.push({ x, y, depth: Math.min(da, db), roomId: -1, facing: a });
          break;
        }
      }
    }
  }

  return { byKind: by, entranceRoom, bossRoom, maxDepth: Math.max(1, topo.maxDepth), protectedCells };
}
