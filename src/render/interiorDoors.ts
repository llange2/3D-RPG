import { hash2 } from "../core/noise";
import type { ActionInstance, MapContent } from "../actions/types";
import { FACING_DELTA, type Facing, type InteriorMap } from "../interiors/types";
import type { GateDirection } from "../campaign/types";
import type { StaticModelInfo } from "./assets";
import { CELL_SIZE, cellCenterX, cellCenterZ, wallHeightOf } from "./interiorMesher";
import { gateTravel, itemModelKey, itemProp } from "./itemProps";
import type { PropRenderer } from "./props";
import type { PropInstance } from "./terrainMesher";

/**
 * The doors of generated dungeons and castles are the ones of the hand-built maps: a wooden door in its frame (blocks 16 and 15 of
 * the old editor, Temple of Moo) or a frame with an iron gate in it (blocks 47 and 41 with the items 81 and 80, Fountain Head Cavern
 * and the castles). A dungeon has both kinds, a castle only gates. The spaceship has sliding doors only (`slide`): the user's lock model that always stands in the
 * corridor, with two leaves that part in its middle (6. 11. 2026). The wooden door of a dungeon is the user's frame and leaf (also 6. 11. 2026): the leaf swings on its
 * hinges, as long as the door's sound plays.
 */
export type DoorLook = "door" | "gate" | "slide";

/** The wooden door: the frame of the dungeon's gates, and the leaf (a model of its own, in the frame's coordinates) that swings on the hinge axis at its edge. */
const DOOR_FRAME = "frame_dungeon";
const DOOR_LEAF = "blk_dungeon_door";
/**
 * The hinge axis in the leaf's own coordinates (Babylon's: glTF files stand mirrored in x): a vertical line 0.04 inside the leaf's edge, on its middle plane. Found from the user's
 * `Dungeon Door open.glb` of the old game, whose leaf is the closed one turned by 90 degrees about this line.
 */
const DOOR_HINGE_X = 0.5945;
/** The leaf opens by this angle about the hinge (towards the corridor side, where the open leaf of the old maps lies against the wall). */
const DOOR_SWING = -Math.PI / 2;
/** How far a wooden door is open before the party may walk through (the leaf has then left the middle of the doorway). */
export const DOOR_PASSABLE = 0.7;
/** Seconds a wooden door needs until `Game` has measured its sound: the audible part of the squeak of the old game's 9052 (`squeaky_door`; its file is 2.672 s long, the last 1.1 s are silence). */
const DOOR_SECONDS = 1.571;
/** The prop renderer sinks every model by this much below its base (`PropRenderer.load`); the leaf is placed by its origin, so it gets the same sink as the frame has. */
const PROP_SINK = 0.02;

/** The sliding door: the frame (the user's `Space_lock.glb`) and the two leaves (boxes with the halves of the user's picture of a double door, `tools/assets/gen-space-doors.ts`). */
const SLIDE_FRAME = "obj_space_lock";
const SLIDE_LEFT = "obj_space_door_left";
const SLIDE_RIGHT = "obj_space_door_right";
/**
 * Measured on the triangles of the frame (its own units, 0.867 wide, 0.953 high): the opening is 0.324 wide and its lower edge lies 0.0458 over the model's lowest point.
 * The leaves are 0.172 wide, so that each one covers half of the opening and reaches a little behind the rim, and slide that far into the wall when the door opens.
 */
const SLIDE_LEAF_WIDTH = 0.172;
const SLIDE_LEAF_LIFT = 0.0458;
/** Frame and leaves are scaled alike: the frame fills the cell's width and the wall's height (like the frames of the old maps), the depth follows the width. */
const SLIDE_WIDTH_UNITS = 0.8667;
const SLIDE_HEIGHT_UNITS = 0.9531;
/** How far a sliding door is open before the party may walk through (the leaves have then cleared the opening almost completely). */
export const SLIDE_PASSABLE = 0.75;

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
  // the airlocks and the doors of the spaceship slide
  if (map.spaceship) return "slide";
  // castles and towns have iron gates only; so has the cyber theme, where wooden doors make no sense
  if (map.kind === "fortress" || map.kind === "town" || map.theme.id === "cyber") return "gate";
  return ((hash2(0x44, x, y) >>> 12) & 1) === 0 ? "door" : "gate";
}

/** What opening sounds like: the wooden door squeaks (the old game's 9052), the iron gate clanks (9034), a sliding door of the spaceship hisses (9056, closing sounds the same). */
export const doorSound = (look: DoorLook): number => (look === "slide" ? 9056 : look === "gate" ? 9034 : 9052);

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
    const look = doorLook(map, a.x, a.y);
    if (look === "slide") {
      keys.add(SLIDE_FRAME);
      keys.add(SLIDE_LEFT);
      keys.add(SLIDE_RIGHT);
    } else if (look === "door") {
      keys.add(DOOR_FRAME);
      keys.add(DOOR_LEAF);
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
  /** 0 closed, 1 open; every look moves (a wooden door swings, a gate rises or sinks, a sliding door parts). */
  t: number;
  /** Seconds a gate needs to leave the cell. */
  seconds: number;
  /** Sliding door only: the size of frame and leaves. */
  scale: [number, number, number];
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
  /** Seconds a sliding door needs to open or close: as long as its sound plays (`Game` sets it from the decoded file). */
  slideSeconds = 1.5;
  /** Seconds a wooden door needs to swing open: as long as its sound plays (`Game` sets it from the decoded file). */
  swingSeconds = DOOR_SECONDS;

  constructor(
    private readonly props: PropRenderer,
    private readonly staticInfo: Record<string, StaticModelInfo>,
  ) {}

  show(map: InteriorMap, content: MapContent, opened: Set<string>, owner: string): void {
    this.dispose();
    this.owner = owner;
    const gate = GATES[gateSetOf(map)];
    const travel = gateTravel(gate.item, gate.direction);
    const wide = CELL_SIZE / SLIDE_WIDTH_UNITS;
    const slideScale: [number, number, number] = [wide, wallHeightOf(map) / SLIDE_HEIGHT_UNITS, wide];
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
        scale: slideScale,
      });
    }
    this.pushStill();
    this.pushMoving();
  }

  /** Opens or closes a door; it moves over the next frames (`update`). */
  set(uid: string, open: boolean): void {
    const d = this.doors.get(uid);
    if (!d || d.open === open) return;
    d.open = open;
  }

  isClosed(uid: string): boolean {
    const d = this.doors.get(uid);
    return !!d && !d.open;
  }

  /**
   * Can the party step into the door's cell? A sliding or wooden door lets them through once it is open far enough, and not a moment longer than it is meant to be open: the
   * leaf that starts to close is in the way at once. A gate opens at once.
   */
  isPassable(uid: string): boolean {
    const d = this.doors.get(uid);
    if (!d) return true;
    if (d.look === "gate") return d.open;
    return d.open && d.t >= (d.look === "slide" ? SLIDE_PASSABLE : DOOR_PASSABLE);
  }

  update(dt: number): void {
    let moving = false;
    let changed = false;
    for (const d of this.doors.values()) {
      const target = d.open ? 1 : 0;
      if (d.t !== target) {
        const seconds = d.look === "slide" ? Math.max(0.2, this.slideSeconds) : d.look === "door" ? Math.max(0.2, this.swingSeconds) : d.seconds;
        d.t = Math.min(1, Math.max(0, d.t + Math.sign(target - d.t) * (dt / seconds)));
        moving = true;
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

  /**
   * The frame of a sliding door (always there) and its two leaves at `t` (0 shut, 1 open: they have slid into the wall, a leaf's width to each side, and are hidden by the
   * frame's faces). Seen from the corridor, the left leaf moves left and the right one right. `still` leaves out the leaves of a door that is on its way.
   */
  private slideParts(d: Door, t: number, frame: boolean, leaves: boolean): PropInstance[] {
    const out: PropInstance[] = [];
    const rotY = d.yaw * RAD;
    if (frame) out.push({ model: SLIDE_FRAME, x: d.x, y: 0, z: d.z, rotY, scale: d.scale[0], scaleXYZ: d.scale });
    if (!leaves) return out;
    // the unit vector of the door's width: the frame's x axis turned by the yaw
    const ux = Math.cos(rotY);
    const uz = -Math.sin(rotY);
    for (const side of [-1, 1] as const) {
      const lateral = side * (SLIDE_LEAF_WIDTH / 2 + SLIDE_LEAF_WIDTH * t) * d.scale[0];
      out.push({ model: side < 0 ? SLIDE_LEFT : SLIDE_RIGHT, x: d.x + ux * lateral, y: SLIDE_LEAF_LIFT * d.scale[1], z: d.z + uz * lateral, rotY, scale: d.scale[0], scaleXYZ: d.scale });
    }
    return out;
  }

  /**
   * The leaf of a wooden door turned by `t` of its way about the hinge axis. The instance turns about its own origin, so it is moved by what the hinge's offset becomes
   * under that turn: `hinge - R(angle) hinge`, in the leaf's frame, then carried to the world by the door's yaw and size.
   */
  private leafAt(d: Door, t: number): PropInstance {
    const angle = DOOR_SWING * t;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    // Babylon's yaw: x' = x cos + z sin, z' = -x sin + z cos (the hinge lies on the leaf's x axis, so its z is 0)
    const dx = DOOR_HINGE_X * (1 - c);
    const dz = DOOR_HINGE_X * s;
    const yaw = d.yaw * RAD;
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const wx = dx * DOOR_SCALE[0];
    const wz = dz * DOOR_SCALE[2];
    return {
      model: DOOR_LEAF,
      x: d.x + wx * cy + wz * sy,
      y: -PROP_SINK,
      z: d.z - wx * sy + wz * cy,
      rotY: yaw + angle,
      scale: DOOR_SCALE[0],
      scaleXYZ: DOOR_SCALE,
      atOrigin: true,
    };
  }

  private pushStill(): void {
    const list: PropInstance[] = [];
    for (const d of this.doors.values()) {
      this.phase.set(d.uid, d.t === 0 ? 0 : d.t === 1 ? 2 : 1);
      if (d.look === "slide") {
        // the leaves of an open door are inside the wall; one that moves is drawn every frame under the other owner
        list.push(...this.slideParts(d, d.t, true, d.t === 0));
        continue;
      }
      if (d.look === "door") {
        // the frame always stands; the leaf stands still when it is shut or wide open, and is drawn every frame under the other owner while it swings
        list.push({ model: DOOR_FRAME, x: d.x, y: 0, z: d.z, rotY: d.yaw * RAD, scale: DOOR_SCALE[0], scaleXYZ: DOOR_SCALE });
        if (d.t === 0 || d.t === 1) list.push(this.leafAt(d, d.t));
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
      if (d.t <= 0 || d.t >= 1) continue;
      if (d.look === "slide") {
        list.push(...this.slideParts(d, d.t, false, true));
        continue;
      }
      if (d.look === "door") {
        list.push(this.leafAt(d, d.t));
        continue;
      }
      const gate = this.gateAt(d, d.t);
      if (gate) list.push(gate);
    }
    this.props.setInstances(`${this.owner}:doors-fx`, list);
    this.props.flush();
  }
}
