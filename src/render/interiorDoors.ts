import { hash2 } from "../core/noise";
import type { ActionInstance, MapContent } from "../actions/types";
import { FACING_DELTA, type Facing, type InteriorMap } from "../interiors/types";
import type { GateDirection } from "../campaign/types";
import type { StaticModelInfo } from "./assets";
import { cellCenterX, cellCenterZ } from "./interiorMesher";
import { gateTravel, itemModelKey, itemProp } from "./itemProps";
import type { PropRenderer } from "./props";
import type { PropInstance } from "./terrainMesher";

/**
 * The doors of generated dungeons and castles are the ones of the hand-built maps: a wooden door in its frame (blocks 16 and 15 of
 * the old editor, Temple of Moo) or a frame with an iron gate in it (blocks 47 and 41 with the items 81 and 80, Fountain Head Cavern
 * and the castles). A dungeon has both kinds, a castle only gates.
 */
export type DoorLook = "door" | "gate";

const DOOR_CLOSED = "blk_door_closed";
const DOOR_OPEN = "blk_door_open";

/** What a gate is made of per kind of map: its frame, its size (add_block 47 and 41), the gate item and where the gate goes when it opens. */
const GATES = {
  dungeon: { frame: "frame_dungeon", scale: [1.5, 1.473, 1.5] as [number, number, number], glb: true, item: 81, direction: "up" as GateDirection },
  fortress: { frame: "frame_fortress", scale: [1.5, 1.5, 1.5] as [number, number, number], glb: false, item: 80, direction: "down" as GateDirection },
  // the gates of the old towns (block 19 with item 80): they shut the pockets with the chests
  town: { frame: "frame_city", scale: [1, 1, 1] as [number, number, number], glb: true, item: 80, direction: "down" as GateDirection },
};

/** Which set of frame and gate a kind of map uses. */
const gateSetOf = (map: InteriorMap): keyof typeof GATES => (map.kind === "fortress" ? "fortress" : map.kind === "town" ? "town" : "dungeon");

/** The doors of the old dungeon are 2 x 3 x 2 models scaled to fill a 3 wide, 4.5 high cell, like the frames (add_block 15 and 16). */
const DOOR_SCALE: [number, number, number] = [1.5, 1.473, 1.5];

/** Ursina mirrors glTF files in z and Babylon in x: the same file stands turned by half a circle (see `glb` in campaign/blocks.ts). */
const GLTF_YAW = Math.PI;

const RAD = Math.PI / 180;

/** Which look a door has. Only the map kind and the cell decide, so the look never needs to be saved and the generator stays untouched. */
export function doorLook(map: InteriorMap, x: number, y: number): DoorLook {
  // castles and towns have iron gates only; so has the cyber theme, where wooden doors make no sense
  if (map.kind === "fortress" || map.kind === "town" || map.theme.id === "cyber") return "gate";
  return ((hash2(0x44, x, y) >>> 12) & 1) === 0 ? "door" : "gate";
}

/** What opening sounds like: the wooden door squeaks (the old game's 9052), the iron gate clanks (9034). */
export const doorSound = (look: DoorLook): number => (look === "gate" ? 9034 : 9052);

/**
 * Direction of travel through a door cell, from the corridor into the room (`Mouth.facing`). The action only keeps the axis, so the
 * room is looked up in the map; the open leaf of a wooden door lies on the corridor side, against the corridor's wall.
 */
export function doorFacing(map: InteriorMap, a: ActionInstance): Facing {
  const alongX = a.params.axis === "x";
  const forward: Facing = alongX ? "E" : "S";
  const backward: Facing = alongX ? "W" : "N";
  const roomAt = (f: Facing): number => {
    const x = a.x + FACING_DELTA[f].dx;
    const y = a.y + FACING_DELTA[f].dy;
    return x < 0 || y < 0 || x >= map.width || y >= map.height ? -1 : map.roomOf[y * map.width + x]!;
  };
  return roomAt(forward) < 0 && roomAt(backward) >= 0 ? backward : forward;
}

/** Compass angle of a direction in degrees: 0 north, 90 east. The world's z axis grows north, the grid's y axis south. */
function compass(f: Facing): number {
  const { dx, dy } = FACING_DELTA[f];
  return (Math.atan2(dx, -dy) * 180) / Math.PI;
}

/** Models the doors of a map need, so that they can be loaded before the first frame. */
export function doorModelKeys(map: InteriorMap, content: MapContent): string[] {
  const keys = new Set<string>();
  for (const a of content.actions) {
    if (a.kind !== "door") continue;
    if (doorLook(map, a.x, a.y) === "door") {
      keys.add(DOOR_CLOSED);
      keys.add(DOOR_OPEN);
    } else {
      const gate = GATES[gateSetOf(map)];
      keys.add(gate.frame);
      const k = itemModelKey(gate.item);
      if (k) keys.add(k);
    }
  }
  return [...keys];
}

interface Door {
  uid: string;
  look: DoorLook;
  x: number;
  z: number;
  /** Wooden door: yaw in degrees that puts the open leaf on the corridor side. Gate: yaw of the frame and the gate. */
  yaw: number;
  /** Gate only: item, how it leaves the cell, and the frame model with its size. */
  gate: (typeof GATES)[keyof typeof GATES];
  open: boolean;
  /** 0 closed, 1 open; a gate slides, a wooden door jumps (the old game swapped the block). */
  t: number;
  /** Seconds a gate needs to leave the cell. */
  seconds: number;
}

/**
 * The doors and gates of one generated interior, as prop instances. The still parts (frames, wooden doors, closed gates) share one
 * owner that is rebuilt when a door changes; a gate on its way out is redrawn every frame under another, so the thousands of
 * still props never are.
 */
export class InteriorDoors {
  private readonly doors = new Map<string, Door>();
  private owner = "";
  /** What each door looked like in the last drawn frame (0 closed, 1 moving, 2 open), to know when the still parts must be rebuilt. */
  private phase = new Map<string, number>();

  constructor(
    private readonly props: PropRenderer,
    private readonly staticInfo: Record<string, StaticModelInfo>,
  ) {}

  show(map: InteriorMap, content: MapContent, opened: Set<string>, owner: string): void {
    this.dispose();
    this.owner = owner;
    const gate = GATES[gateSetOf(map)];
    const travel = gateTravel(gate.item, gate.direction);
    for (const a of content.actions) {
      if (a.kind !== "door") continue;
      const look = doorLook(map, a.x, a.y);
      const facing = doorFacing(map, a);
      const open = opened.has(a.uid);
      this.doors.set(a.uid, {
        uid: a.uid,
        look,
        x: cellCenterX(a.x),
        z: cellCenterZ(a.y),
        // a gate and its frame sit in the passage: north to south at rotation 0, east to west at 90 (the old maps)
        yaw: look === "door" ? compass(facing) : a.params.axis === "x" ? 90 : 0,
        gate,
        open,
        t: open ? 1 : 0,
        seconds: travel?.seconds ?? 1,
      });
    }
    this.pushStill();
    this.pushMoving();
  }

  /** Opens or closes a door. A wooden door changes at once, a gate slides (`update`). */
  set(uid: string, open: boolean): void {
    const d = this.doors.get(uid);
    if (!d || d.open === open) return;
    d.open = open;
    if (d.look === "door") {
      d.t = open ? 1 : 0;
      this.pushStill();
    }
  }

  isClosed(uid: string): boolean {
    const d = this.doors.get(uid);
    return !!d && !d.open;
  }

  update(dt: number): void {
    let moving = false;
    let changed = false;
    for (const d of this.doors.values()) {
      if (d.look === "gate") {
        const target = d.open ? 1 : 0;
        if (d.t !== target) {
          d.t = Math.min(1, Math.max(0, d.t + Math.sign(target - d.t) * (dt / d.seconds)));
          moving = true;
        }
      }
      const phase = d.t === 0 ? 0 : d.t === 1 ? 2 : 1;
      if (this.phase.get(d.uid) !== phase) changed = true;
    }
    if (changed) this.pushStill();
    if (moving || changed) this.pushMoving();
  }

  dispose(): void {
    if (this.owner) {
      this.props.removeOwner(`${this.owner}:doors`);
      this.props.removeOwner(`${this.owner}:doors-fx`);
      this.props.flush();
    }
    this.doors.clear();
    this.phase.clear();
    this.owner = "";
  }

  /** A gate at height `t` of its way out (0 closed, 1 gone), or null when it has no model. */
  private gateAt(d: Door, t: number): PropInstance | null {
    const travel = gateTravel(d.gate.item, d.gate.direction);
    if (!travel) return null;
    return itemProp(d.gate.item, d.yaw, d.x, d.z, this.staticInfo, travel.from + (travel.to - travel.from) * t);
  }

  private pushStill(): void {
    const list: PropInstance[] = [];
    for (const d of this.doors.values()) {
      this.phase.set(d.uid, d.t === 0 ? 0 : d.t === 1 ? 2 : 1);
      if (d.look === "door") {
        list.push({ model: d.open ? DOOR_OPEN : DOOR_CLOSED, x: d.x, y: 0, z: d.z, rotY: d.yaw * RAD, scale: DOOR_SCALE[0], scaleXYZ: DOOR_SCALE });
        continue;
      }
      // the frame is a wall piece with the doorway in it; the glTF one stands turned by half a circle like the other glTF blocks
      list.push({ model: d.gate.frame, x: d.x, y: 0, z: d.z, rotY: d.yaw * RAD + (d.gate.glb ? GLTF_YAW : 0), scale: d.gate.scale[0], scaleXYZ: d.gate.scale });
      if (d.t === 0) {
        const gate = this.gateAt(d, 0);
        if (gate) list.push(gate);
      }
    }
    this.props.setInstances(`${this.owner}:doors`, list);
    this.props.flush();
  }

  private pushMoving(): void {
    const list: PropInstance[] = [];
    for (const d of this.doors.values()) {
      if (d.look !== "gate" || d.t <= 0 || d.t >= 1) continue;
      const gate = this.gateAt(d, d.t);
      if (gate) list.push(gate);
    }
    this.props.setInstances(`${this.owner}:doors-fx`, list);
    this.props.flush();
  }
}
