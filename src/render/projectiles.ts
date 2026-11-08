import type { Scene } from "@babylonjs/core/scene";
import { GlowBeams } from "./glowBeams";
import { LASER_LAMP, LaserFactory, type LaserBolt } from "./lasers";
import type { LampKind } from "./lamps";
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
  /** A turn in degrees about the model's own long axis (y), made before the pitch: it turns the picture the party sees from behind, not the direction of flight. */
  spin?: number;
}

const ICE_SPIN = 45;

const POSES: Record<Exclude<ProjectileKind, "laser">, Pose> = {
  // the fletching is a flat vane (0.54 high, 0.17 wide): rolled by 90 degrees it lies flat, so the party sees the feathers from behind
  arrow: { model: "proj_arrow", scale: 0.6, pitch: 0, roll: 90 },
  // the flame tails of the fireball and of the "physical attack" are at the +y end of their models, the icicle's tip too
  // (checked on a side view with `npm run sheet:projectiles`)
  fire: { model: "proj_fire", scale: 0.55, pitch: -90, roll: 0 },
  // the icicle is a flat shard that came out slanted on the screen: turned about its long axis by 45 degrees against the clock (48th playtest, point 4)
  ice: { model: "proj_ice", scale: 0.6, pitch: 90, roll: 0, spin: ICE_SPIN },
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
/** How much of its light a spell keeps by day outside. */
const SPELL_DAYLIGHT = 0.55;
/** Prismatic Light: the lines fade out over this long (the user, 8. 11. 2026). */
export const BEAM_SECONDS = 0.7;

/** How long a projectile needs over `tiles` tiles. */
export function flightSeconds(tiles: number): number {
  return (Math.floor(tiles) + 1) * SECONDS_PER_TILE;
}

interface Flight {
  /** What the light that flies along is called (`ProjectileGlow.key`). */
  id: number;
  kind: ProjectileKind;
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

/**
 * The light that flies along with a projectile (47th playtest, point 8: like the robots' lasers, whose blue is `LASER_LAMP`). The colour follows the element: fire orange, acid green,
 * ice blue, magic pink to violet. Arrows, the physical attack and the missile carry none.
 */
export const PROJECTILE_LAMPS: Readonly<Partial<Record<ProjectileKind, Omit<LampKind, "y">>>> = {
  laser: LASER_LAMP,
  // `daylight`: the light shows in the sun as well, not only in the dark (48th playtest, point 6: by day no spell shone)
  fire: { color: [1, 0.5, 0.12], range: 6.5, intensity: 3.4, daylight: SPELL_DAYLIGHT },
  acid: { color: [0.4, 1, 0.15], range: 6.5, intensity: 3.2, daylight: SPELL_DAYLIGHT },
  ice: { color: [0.35, 0.68, 1], range: 6.5, intensity: 3.2, daylight: SPELL_DAYLIGHT },
  magic: { color: [0.88, 0.35, 1], range: 6.5, intensity: 3.2, daylight: SPELL_DAYLIGHT },
};

/** The colour of a damage type's light and beams (`PROJECTILE_LAMPS`), also for the types that fly as another picture (poison is acid, physical has none: white). */
export function elementColor(element: string): [number, number, number] {
  const kind: ProjectileKind = element === "ice" ? "ice" : element === "fire" ? "fire" : element === "acid" || element === "poison" ? "acid" : "magic";
  return PROJECTILE_LAMPS[kind]!.color;
}

/** A light with no model that comes and goes (Star Burst, the impact of a meteor): where it starts, how it changes and how long it lasts. */
export interface BurstSpec {
  /** The colour at the start and from `half` of the way through on (it passes from one to the other over the first half). */
  from: [number, number, number];
  to: [number, number, number];
  /** Full intensity at the start, it dies down to nothing at the end. */
  peak: number;
  range: number;
  seconds: number;
  daylight: number;
}

interface Burst {
  id: number;
  at: Point;
  t: number;
  spec: BurstSpec;
}

/** A moving light of the lamp pool: a laser or a spell in flight (`Game.updateLamps`). */
export interface ProjectileGlow {
  key: string;
  x: number;
  y: number;
  z: number;
  lamp: Omit<LampKind, "y">;
}

/** Objects that fly from one point to another in a straight line, drawn as props so they cost one draw call per kind. */
export class Projectiles {
  private flights: Flight[] = [];
  private flashes: Flash[] = [];
  private bursts: Burst[] = [];
  private beams: GlowBeams | null = null;
  private drawn = false;
  private lasers: LaserFactory | null = null;
  private static readonly OWNER = "projectiles";
  private static flights = 0;

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
        this.flights.push({ id: Projectiles.flights++, kind, pose: null, laser, from: start, to, yaw, t: 0, duration });
      } else this.flights.push({ id: Projectiles.flights++, kind, pose: POSES[kind], laser: null, from: start, to, yaw, t: 0, duration });
    }
    return duration;
  }

  /** An element appears at `at` and fades out over `FLASH_SECONDS` (Elemental Storm). Only the three elements have a picture. */
  flash(kind: "fire" | "ice" | "acid", at: Point): void {
    this.flashes.push({ pose: POSES[kind], at, t: 0 });
    // the element shines for as long as it stands there (48th playtest, point 6: the storm had no light)
    const color = PROJECTILE_LAMPS[kind]!.color;
    this.burst(at, { from: color, to: color, peak: 4, range: 8, seconds: FLASH_SECONDS, daylight: SPELL_DAYLIGHT });
  }

  /** A light with no model at `at` (Star Burst at the party, the impact of a meteor): `spec` says what it does. */
  burst(at: Point, spec: BurstSpec): void {
    this.bursts.push({ id: Projectiles.flights++, at, t: 0, spec });
  }

  /**
   * Prismatic Light: a line of light from `from` to `to` in the colour of `element`, there at once and gone after `BEAM_SECONDS`. The monster's end also shines for as long
   * (a light of the pool, so only the two nearest ones show).
   */
  beam(element: string, from: Point, to: Point): void {
    const color = elementColor(element);
    this.beams ??= this.scene ? new GlowBeams(this.scene) : null;
    this.beams?.add(color, from, to, BEAM_SECONDS);
    this.burst(to, { from: color, to: color, peak: 3.4, range: 6.5, seconds: BEAM_SECONDS, daylight: SPELL_DAYLIGHT });
  }

  get active(): boolean {
    return this.flights.length > 0 || this.flashes.length > 0 || this.bursts.length > 0 || (this.beams?.active ?? false);
  }

  /** The lasers and the spells in flight, as moving lights (the colour of the beam or of the element), and the bursts of light. */
  glows(): ProjectileGlow[] {
    const out: ProjectileGlow[] = [];
    for (const b of this.bursts) {
      const k = Math.min(1, b.t / b.spec.seconds);
      // the colour changes over the first half (white to orange for Star Burst), the light dies down over the whole time
      const c = Math.min(1, k / 0.5);
      const mix = (i: 0 | 1 | 2) => b.spec.from[i] + (b.spec.to[i] - b.spec.from[i]) * c;
      out.push({ key: `burst:${b.id}`, x: b.at.x, y: b.at.y, z: b.at.z, lamp: { color: [mix(0), mix(1), mix(2)], range: b.spec.range, intensity: b.spec.peak * (1 - k) ** 1.2, daylight: b.spec.daylight } });
    }
    for (const f of this.flights) {
      const lamp = PROJECTILE_LAMPS[f.kind];
      if (!lamp) continue;
      const k = Math.min(1, f.t / f.duration);
      out.push({ key: `proj:${f.id}`, lamp, x: f.from.x + (f.to.x - f.from.x) * k, y: f.from.y + (f.to.y - f.from.y) * k, z: f.from.z + (f.to.z - f.from.z) * k });
    }
    return out;
  }

  update(dt: number): void {
    if (this.bursts.length > 0) {
      for (const b of this.bursts) b.t += dt;
      this.bursts = this.bursts.filter((b) => b.t < b.spec.seconds);
    }
    this.beams?.update(dt);
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
      list.push({ model: pose.model, x, y, z, rotY: f.yaw, rotX: (pose.pitch * Math.PI) / 180 + tilt, rotZ: (pose.roll * Math.PI) / 180, ...(pose.spin ? { spin: (pose.spin * Math.PI) / 180 } : {}), scale: pose.scale, atOrigin: true });
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
    this.bursts = [];
    this.beams?.clear();
    for (const f of this.flights) f.laser?.dispose();
    for (const model of new Set(this.flashes.map((f) => f.pose.model))) this.props.setVisibility(model, 1);
    this.flights = [];
    this.flashes = [];
    this.props.removeOwner(Projectiles.OWNER);
    this.props.flush();
    this.drawn = false;
  }
}
