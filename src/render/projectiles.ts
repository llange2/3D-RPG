import type { PropRenderer } from "./props";
import type { PropInstance } from "./terrainMesher";

/** What flies: the old attack animations 9023 (arrow), 9019 (fireball), 9018 (ice), 9021 (magic), 9022 (physical), 9020 (poison cloud). */
export type ProjectileKind = "arrow" | "fire" | "ice" | "magic" | "physical" | "acid";

export const PROJECTILE_MODELS = ["proj_arrow", "proj_fire", "proj_ice", "proj_magic", "proj_physical", "proj_poison"];

interface Pose {
  model: string;
  /** Size of the model as a whole. */
  scale: number;
  /** Pitch and roll in degrees that turn the model's long axis along the flight (+z after the yaw). */
  pitch: number;
  roll: number;
}

const POSES: Record<ProjectileKind, Pose> = {
  // the fletching is a flat vane (0.54 high, 0.17 wide): rolled by 90 degrees it lies flat, so the party sees the feathers from behind
  arrow: { model: "proj_arrow", scale: 0.6, pitch: 0, roll: 90 },
  // the flame tails of the fireball and of the "physical attack" are at the +y end of their models, the icicle's tip too
  // (checked on a side view with `npm run sheet:projectiles`)
  fire: { model: "proj_fire", scale: 0.55, pitch: -90, roll: 0 },
  ice: { model: "proj_ice", scale: 0.6, pitch: 90, roll: 0 },
  magic: { model: "proj_magic", scale: 0.5, pitch: 0, roll: 0 },
  physical: { model: "proj_physical", scale: 0.55, pitch: -90, roll: 0 },
  acid: { model: "proj_poison", scale: 0.45, pitch: 0, roll: 0 },
};

export interface Point {
  x: number;
  y: number;
  z: number;
}

/** Seconds per tile of flight (the old game used 0.15 and at least one tile's worth). */
const SECONDS_PER_TILE = 0.12;
/** World units of a tile. */
const TILE = 3;

/** How long a projectile needs over `tiles` tiles. */
export function flightSeconds(tiles: number): number {
  return (Math.floor(tiles) + 1) * SECONDS_PER_TILE;
}

interface Flight {
  pose: Pose;
  from: Point;
  to: Point;
  yaw: number;
  t: number;
  duration: number;
}

/** Objects that fly from one point to another in a straight line, drawn as props so they cost one draw call per kind. */
export class Projectiles {
  private flights: Flight[] = [];
  private drawn = false;
  private static readonly OWNER = "projectiles";

  constructor(private readonly props: PropRenderer) {}

  /**
   * Starts `count` projectiles (several fan out around the line and meet in the target, like a volley of arrows).
   * Returns the seconds until they arrive.
   */
  launch(kind: ProjectileKind, from: Point, to: Point, count = 1): number {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const duration = flightSeconds(Math.hypot(dx, dz) / TILE);
    const yaw = Math.atan2(dx, dz);
    const len = Math.hypot(dx, dz) || 1;
    for (let i = 0; i < count; i++) {
      const side = (i - (count - 1) / 2) * 0.6;
      // the sideways offset is perpendicular to the flight
      const start = { x: from.x + (dz / len) * side, y: from.y, z: from.z - (dx / len) * side };
      this.flights.push({ pose: POSES[kind], from: start, to, yaw, t: 0, duration });
    }
    return duration;
  }

  get active(): boolean {
    return this.flights.length > 0;
  }

  update(dt: number): void {
    if (this.flights.length === 0 && !this.drawn) return;
    for (const f of this.flights) f.t += dt;
    this.flights = this.flights.filter((f) => f.t < f.duration);
    const list: PropInstance[] = this.flights.map((f) => {
      const k = f.t / f.duration;
      return {
        model: f.pose.model,
        x: f.from.x + (f.to.x - f.from.x) * k,
        y: f.from.y + (f.to.y - f.from.y) * k,
        z: f.from.z + (f.to.z - f.from.z) * k,
        rotY: f.yaw,
        rotX: (f.pose.pitch * Math.PI) / 180,
        rotZ: (f.pose.roll * Math.PI) / 180,
        scale: f.pose.scale,
        atOrigin: true,
      };
    });
    this.props.setInstances(Projectiles.OWNER, list);
    this.props.flush();
    this.drawn = list.length > 0;
  }

  clear(): void {
    this.flights = [];
    this.props.removeOwner(Projectiles.OWNER);
    this.props.flush();
    this.drawn = false;
  }
}
