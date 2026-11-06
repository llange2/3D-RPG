import type { Scene } from "@babylonjs/core/scene";
import { LaserFactory, type LaserBolt } from "./lasers";
import type { PropRenderer } from "./props";
import type { PropInstance } from "./terrainMesher";

/**
 * What flies: the old attack animations 9023 (arrow), 9019 (fireball), 9018 (ice), 9021 (magic), 9022 (physical), 9020 (poison cloud), the Titanic Automato's missile
 * and the laser of the other robots (not a model: a thin blue cylinder, `lasers.ts`).
 */
export type ProjectileKind = "arrow" | "fire" | "ice" | "magic" | "physical" | "acid" | "missile" | "laser";

export const PROJECTILE_MODELS = ["proj_arrow", "proj_fire", "proj_ice", "proj_magic", "proj_physical", "proj_poison", "proj_missile"];

interface Pose {
  model: string;
  /** Size of the model as a whole. */
  scale: number;
  /** Pitch and roll in degrees that turn the model's long axis along the flight (+z after the yaw). */
  pitch: number;
  roll: number;
}

const POSES: Record<Exclude<ProjectileKind, "laser">, Pose> = {
  // the fletching is a flat vane (0.54 high, 0.17 wide): rolled by 90 degrees it lies flat, so the party sees the feathers from behind
  arrow: { model: "proj_arrow", scale: 0.6, pitch: 0, roll: 90 },
  // the flame tails of the fireball and of the "physical attack" are at the +y end of their models, the icicle's tip too
  // (checked on a side view with `npm run sheet:projectiles`)
  fire: { model: "proj_fire", scale: 0.55, pitch: -90, roll: 0 },
  ice: { model: "proj_ice", scale: 0.6, pitch: 90, roll: 0 },
  magic: { model: "proj_magic", scale: 0.5, pitch: 0, roll: 0 },
  physical: { model: "proj_physical", scale: 0.55, pitch: -90, roll: 0 },
  acid: { model: "proj_poison", scale: 0.45, pitch: 0, roll: 0 },
  // the Titanic Automato's missile (the user's file, 0.95 long, its nose at +y like the icicle's tip: pitched by +90 degrees it flies point first)
  missile: { model: "proj_missile", scale: 1, pitch: 90, roll: 0 },
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
/** The flash of Elemental Storm: how long it fades out (the user, 6. 11. 2026), and how much bigger than a flying one the element is drawn. */
export const FLASH_SECONDS = 0.3;
const FLASH_SCALE = 2.2;

/** How long a projectile needs over `tiles` tiles. */
export function flightSeconds(tiles: number): number {
  return (Math.floor(tiles) + 1) * SECONDS_PER_TILE;
}

interface Flight {
  /** The model that flies, or null for a laser bolt. */
  pose: Pose | null;
  laser: LaserBolt | null;
  from: Point;
  to: Point;
  yaw: number;
  t: number;
  duration: number;
}

/** An element that appears where it strikes and fades out (Elemental Storm): standing upright, not flying. */
interface Flash {
  pose: Pose;
  at: Point;
  t: number;
}

/** A moving light of the lamp pool: the laser in flight (`Game.updateLamps`). */
export interface ProjectileGlow {
  key: string;
  x: number;
  y: number;
  z: number;
}

/** Objects that fly from one point to another in a straight line, drawn as props so they cost one draw call per kind. */
export class Projectiles {
  private flights: Flight[] = [];
  private flashes: Flash[] = [];
  private drawn = false;
  private lasers: LaserFactory | null = null;
  private static readonly OWNER = "projectiles";

  constructor(
    private readonly props: PropRenderer,
    private readonly scene: Scene | null = null,
  ) {}

  /**
   * Starts `count` projectiles (several fan out around the line and meet in the target, like a volley of arrows).
   * Returns the seconds until they arrive. `seconds` replaces the flight time that follows from the distance (Meteor Shower: the fireballs fall a long way down in a short way along).
   */
  launch(kind: ProjectileKind, from: Point, to: Point, count = 1, seconds?: number): number {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const duration = seconds ?? flightSeconds(Math.hypot(dx, dz) / TILE);
    const yaw = Math.atan2(dx, dz);
    const len = Math.hypot(dx, dz) || 1;
    for (let i = 0; i < count; i++) {
      const side = (i - (count - 1) / 2) * 0.6;
      // the sideways offset is perpendicular to the flight
      const start = { x: from.x + (dz / len) * side, y: from.y, z: from.z - (dx / len) * side };
      if (kind === "laser") {
        this.lasers ??= this.scene ? new LaserFactory(this.scene) : null;
        const laser = this.lasers?.create() ?? null;
        // (already in place: the bolt must not show at the origin for the frame before the first update)
        laser?.place(start.x, start.y, start.z, yaw, Math.atan2(start.y - to.y, Math.hypot(dx, dz)));
        this.flights.push({ pose: null, laser, from: start, to, yaw, t: 0, duration });
      } else this.flights.push({ pose: POSES[kind], laser: null, from: start, to, yaw, t: 0, duration });
    }
    return duration;
  }

  /** An element appears at `at` and fades out over `FLASH_SECONDS` (Elemental Storm). Only the three elements have a picture. */
  flash(kind: "fire" | "ice" | "acid", at: Point): void {
    this.flashes.push({ pose: POSES[kind], at, t: 0 });
  }

  get active(): boolean {
    return this.flights.length > 0 || this.flashes.length > 0;
  }

  /** The lasers in flight, as moving lights (the same blue as the beam). */
  glows(): ProjectileGlow[] {
    const out: ProjectileGlow[] = [];
    for (const f of this.flights) {
      if (!f.laser) continue;
      const k = Math.min(1, f.t / f.duration);
      out.push({ key: `laser:${f.laser.id}`, x: f.from.x + (f.to.x - f.from.x) * k, y: f.from.y + (f.to.y - f.from.y) * k, z: f.from.z + (f.to.z - f.from.z) * k });
    }
    return out;
  }

  update(dt: number): void {
    if (this.flights.length === 0 && this.flashes.length === 0 && !this.drawn) return;
    for (const f of this.flights) f.t += dt;
    for (const f of this.flashes) f.t += dt;
    for (const f of this.flights) if (f.t >= f.duration) f.laser?.dispose();
    this.flights = this.flights.filter((f) => f.t < f.duration);
    const finished = this.flashes.filter((f) => f.t >= FLASH_SECONDS);
    this.flashes = this.flashes.filter((f) => f.t < FLASH_SECONDS);
    const list: PropInstance[] = [];
    for (const f of this.flights) {
      const k = f.t / f.duration;
      const x = f.from.x + (f.to.x - f.from.x) * k;
      const y = f.from.y + (f.to.y - f.from.y) * k;
      const z = f.from.z + (f.to.z - f.from.z) * k;
      // a flight that goes down (Meteor Shower) leans into it: the model's long axis is +z after the pitch, a positive turn about x points it down
      const tilt = Math.atan2(f.from.y - f.to.y, Math.hypot(f.to.x - f.from.x, f.to.z - f.from.z));
      if (f.laser) {
        f.laser.place(x, y, z, f.yaw, tilt);
        continue;
      }
      const pose = f.pose!;
      list.push({ model: pose.model, x, y, z, rotY: f.yaw, rotX: (pose.pitch * Math.PI) / 180 + tilt, rotZ: (pose.roll * Math.PI) / 180, scale: pose.scale, atOrigin: true });
    }
    // the elements of a storm: upright, and all of one model fade together (they appear at the same moment); a model without a flash is solid again
    const fade = new Map<string, number>();
    for (const f of this.flashes) {
      fade.set(f.pose.model, Math.min(fade.get(f.pose.model) ?? 1, 1 - f.t / FLASH_SECONDS));
      list.push({ model: f.pose.model, x: f.at.x, y: f.at.y, z: f.at.z, rotY: 0, rotX: 0, rotZ: 0, scale: f.pose.scale * FLASH_SCALE, atOrigin: true });
    }
    for (const model of new Set([...fade.keys(), ...finished.map((f) => f.pose.model)])) this.props.setVisibility(model, fade.get(model) ?? 1);
    this.props.setInstances(Projectiles.OWNER, list);
    this.props.flush();
    this.drawn = list.length > 0;
  }

  clear(): void {
    for (const f of this.flights) f.laser?.dispose();
    for (const model of new Set(this.flashes.map((f) => f.pose.model))) this.props.setVisibility(model, 1);
    this.flights = [];
    this.flashes = [];
    this.props.removeOwner(Projectiles.OWNER);
    this.props.flush();
    this.drawn = false;
  }
}
