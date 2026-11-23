import type { Scene } from "@babylonjs/core/scene";
import type { Effects, RayKind } from "./fx";
import { type ImpactKind, impactOfElement } from "./fxSheets";
import { GlowBeams, type BeamLook } from "./glowBeams";
import { LASER_LAMP, LaserFactory, type LaserBolt } from "./lasers";
import type { LampKind } from "./lamps";
import type { PropRenderer } from "./props";
import type { PropInstance } from "./terrainMesher";

/**
 * What flies: the old attack animations 9023 (arrow), 9019 (fireball), 9018 (ice), 9021 (magic), 9022 (physical), 9020 (poison cloud), the Titanic Automato's missile
 * and the laser of the other robots (not a model: a thin blue cylinder, `lasers.ts`).
 */
export type ProjectileKind = "arrow" | "fire" | "ice" | "magic" | "physical" | "acid" | "missile" | "laser";

/** The swords of Dancing Sword (bug_fix_83): the monsters' weapon models, one of them at random for each monster. */
export const SWORD_MODELS = ["wpn_sword1", "wpn_sword2", "wpn_sword3"];

export const PROJECTILE_MODELS = ["proj_arrow", "proj_fire", "proj_ice", "proj_magic", "proj_physical", "proj_poison", "proj_missile", "proj_snakes", "proj_insect"];

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
/** Dancing Sword (bug_fix_83): the size of a flying sword (they are 1.9 long, a bit under a tile and a half then) and how fast it whirls about its length, radians per second. */
const SWORD_SCALE = 0.75;
const SWORD_WHIRL = 22;

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
/** Elemental Storm (bug_fix_83, bug_fix_84): the size of the impact picture of a hit and how long the light of a hit shines. */
const STORM_IMPACT_SIZE = 2.4;
const STORM_LIGHT_SECONDS = 0.7;
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
  /** The turn about the vertical in radians per second of a Dancing Sword (the sword lies flat and turns like a rotor); its own `yaw` is the start of the turn. */
  whirl?: number;
  /** The element strikes where the flight ends (`Effects.impact`): not for the shots of monsters, which end at the party's eyes. */
  impact: boolean;
}

/** The kinds of projectile that leave an impact where they land, and the element it shows. */
// (a spell of the physical type has no picture of its own and shows the magic one, like the lines of Prismatic Light; 19. 11. 2026: every attack spell leaves an impact)
const IMPACT_OF: Readonly<Partial<Record<ProjectileKind, ImpactKind>>> = { fire: "fire", ice: "ice", acid: "acid", magic: "magic", physical: "magic" };

/** An element that appears where it strikes and fades out (Elemental Storm, the snakes of Summon Snakes): standing upright, not flying. */
interface Flash {
  pose: Pose;
  at: Point;
  t: number;
  /** How long it takes to fade out, the turn about the vertical axis and the size of the model as it stands there. */
  seconds: number;
  yaw: number;
  scale: number;
  /** It may fade in first (`fadeIn` seconds) and stand there solid for `hold` seconds before the fade-out: the snakes of Summon Snakes. */
  fadeIn?: number;
  hold?: number;
}

/** How long a flash lasts in all, and how solid it is `t` seconds after it appeared (1 is solid, 0 gone). */
const flashTotal = (f: Flash): number => (f.fadeIn ?? 0) + (f.hold ?? 0) + f.seconds;
function flashAlpha(f: Flash): number {
  const fadeIn = f.fadeIn ?? 0;
  if (f.t < fadeIn) return f.t / fadeIn;
  return Math.min(1, 1 - (f.t - fadeIn - (f.hold ?? 0)) / f.seconds);
}

/**
 * The coil of snakes of Summon Snakes (the user's `Snakes.glb`, bug_fix_79): 1.62 high and about 2 across, its middle at the origin. Drawn at 0.6 it is a bit under a metre high, about
 * as tall as a monster's knee, as in the user's mock-up. `yaw` turns the model so that the heads look along +z (found with `tools/dev/check-snakes.ts`).
 */
const SNAKES_POSE: Pose = { model: "proj_snakes", scale: 0.6, pitch: 0, roll: 0 };
const SNAKES_HALF_HEIGHT = 0.81;
/** The coil fades in within 0.3 s, stands for 0.5 s and fades out within 0.5 s (the user, bug_fix_81). */
export const SNAKES_FADE_IN = 0.3;
export const SNAKES_HOLD = 0.5;
export const SNAKES_SECONDS = 0.5;
/** The model's own turn (degrees) that makes its heads look along +z, and where the coil stands: this far in front of the monster's feet (towards the party) and this far to the viewer's left. */
const SNAKES_YAW = 0;
const SNAKES_FRONT = 0.9;
const SNAKES_SIDE = 0.5;

/**
 * The swarm of Deadly Swarm (the user's `Insect.glb`, bug_fix_81): one insect with its wings spread, 0.96 across; ten of them (`SWARM_INSECTS`) fly round a monster on paths of their own, like a swarm of
 * flies: each one runs a loop of its own width, height and speed round the monster's middle and bobs up and down on a second, quicker beat. The swarm is there at once, stays `SWARM_SECONDS` and fades out
 * within `SWARM_FADE`. The model is loaded with the game (`PROJECTILE_MODELS`), so the ten insects show the moment the spell is cast.
 */
const SWARM_POSE: Pose = { model: "proj_insect", scale: 0.5, pitch: 0, roll: 0 };
export const SWARM_SECONDS = 2;
export const SWARM_FADE = 0.5;
/** The insects of the swarm round the first monster of the line, and of the smaller swarm round the second one (10 + 5, the user, bug_fix_82); no further swarm is drawn. */
export const SWARM_INSECTS = 10;
export const SWARM_INSECTS_BEHIND = 5;
/** The turn (degrees) that points the model's nose along its flight: its wings spread along x, its body lies along z. */
const SWARM_YAW = 0;

interface Insect {
  /** The loop round the monster: width, depth and speed (radians per second) on the two axes of the floor, the height and its own beat. */
  ax: number;
  az: number;
  wx: number;
  wz: number;
  px: number;
  pz: number;
  ay: number;
  wy: number;
  py: number;
  /** A faster wobble on top of the loop, so that no two paths look alike. */
  wobble: number;
  wobbleRate: number;
}

interface Swarm {
  at: Point;
  /** Where the monster the swarm flies round is now (bug_fix_84: the swarm moves with it); null: it is gone, the swarm stays where it was. */
  follow?: () => Point | null;
  t: number;
  insects: Insect[];
}

/** A little repeatable generator: the paths of the insects are only for the eye, but a screenshot should come out the same twice. */
function swarmRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Where an insect is `t` seconds into the flight (the monster's middle is the origin). */
function insectOffset(i: Insect, t: number): Point {
  return {
    x: i.ax * Math.sin(i.wx * t + i.px) + i.wobble * Math.sin(i.wobbleRate * t + i.pz),
    y: i.ay * Math.sin(i.wy * t + i.py) + i.wobble * 0.5 * Math.cos(i.wobbleRate * 1.3 * t + i.px),
    z: i.az * Math.cos(i.wz * t + i.pz) + i.wobble * Math.cos(i.wobbleRate * 0.8 * t + i.py),
  };
}

/**
 * The light that flies along with a projectile (47th playtest, point 8: like the robots' lasers, whose blue is `LASER_LAMP`). The colour follows the element: fire orange, acid green,
 * ice blue, magic pink to violet. Arrows, the physical attack and the missile carry none.
 */
export const PROJECTILE_LAMPS: Readonly<Partial<Record<ProjectileKind, Omit<LampKind, "y">>>> = {
  laser: LASER_LAMP,
  // `daylight`: the light shows in the sun as well, not only in the dark (48th playtest, point 6: by day no spell shone)
  fire: { color: [1, 0.5, 0.12], range: 9, intensity: 3.4, daylight: SPELL_DAYLIGHT },
  acid: { color: [0.4, 1, 0.15], range: 9, intensity: 3.2, daylight: SPELL_DAYLIGHT },
  ice: { color: [0.35, 0.68, 1], range: 9, intensity: 3.2, daylight: SPELL_DAYLIGHT },
  magic: { color: [0.88, 0.35, 1], range: 9, intensity: 3.2, daylight: SPELL_DAYLIGHT },
};

/** How big the burst is where a line of Prismatic Light ends (a shot's is `IMPACT_SIZE` in `fx.ts`: there are many lines at once, so a little smaller). */
const BEAM_IMPACT_SIZE = 2.8;

/** The colour of a damage type's light and beams (`PROJECTILE_LAMPS`), also for the types that fly as another picture (poison is acid, physical has none: white). */
export function elementColor(element: string): [number, number, number] {
  const kind: ProjectileKind = element === "ice" ? "ice" : element === "fire" ? "fire" : element === "acid" || element === "poison" ? "acid" : "magic";
  return PROJECTILE_LAMPS[kind]!.color;
}

/** The look of a ray that is not a plain line of the element: its colour, the colour of its core and how thick it is (bug_fix_81). */
export interface RayLook extends BeamLook {
  color: [number, number, number];
}
/** Moon Ray: a thick white and violet ray. Sun Ray: a thick ray that glows orange all through. */
export const RAY_LOOKS: Readonly<Record<"moon" | "sun", RayLook>> = {
  moon: { color: [0.72, 0.5, 1], core: [1, 0.95, 1], width: 2 },
  sun: { color: [1, 0.5, 0.06], core: [1, 0.78, 0.38], width: 2 },
};

/** The particles a ray of this element throws off (`Effects.rayParticles`): the types without a sprite of their own (physical) take the magic ones. */
function rayKindOf(element: string): RayKind {
  return element === "ice" ? "ice" : element === "fire" ? "fire" : element === "acid" || element === "poison" ? "acid" : "magic";
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
  private swarms: Swarm[] = [];
  private swarmCount = 0;
  private bursts: Burst[] = [];
  private beams: GlowBeams | null = null;
  private drawn = false;
  private lasers: LaserFactory | null = null;
  private static readonly OWNER = "projectiles";
  private static flights = 0;

  constructor(
    private readonly props: PropRenderer,
    private readonly scene: Scene | null = null,
    private readonly effects: Effects | null = null,
  ) {}

  /**
   * Starts `count` projectiles (several fan out around the line and meet in the target, like a volley of arrows).
   * Returns the seconds until they arrive. `seconds` replaces the flight time that follows from the distance (Meteor Shower: the fireballs fall a long way down in a short way along).
   */
  launch(kind: ProjectileKind, from: Point, to: Point, count = 1, seconds?: number, impact = true): number {
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
        this.flights.push({ id: Projectiles.flights++, kind, pose: null, laser, from: start, to, yaw, t: 0, duration, impact: false });
      } else this.flights.push({ id: Projectiles.flights++, kind, pose: POSES[kind], laser: null, from: start, to, yaw, t: 0, duration, impact });
    }
    return duration;
  }

  /**
   * A sword of Dancing Sword (bug_fix_83) flies from `from` to `to`, point first and whirling about its long axis; `model` is one of `SWORD_MODELS`. It leaves no picture of its own where it lands (the hit
   * of the monster is the game's). Returns the seconds until it arrives.
   */
  launchSword(model: string, from: Point, to: Point): number {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const duration = flightSeconds(Math.hypot(dx, dz) / TILE);
    // (the blade's long axis is y: pitched by 90 degrees it lies flat; it turns about the vertical like the blade of a helicopter, bug_fix_84, and does not point at the monster; `yaw` is where its turn starts)
    const pose: Pose = { model, scale: SWORD_SCALE, pitch: 90, roll: 0 };
    this.flights.push({ id: Projectiles.flights++, kind: "physical", pose, laser: null, from, to, yaw: Math.random() * Math.PI * 2, t: 0, duration, impact: false, whirl: SWORD_WHIRL * (Math.random() < 0.5 ? -1 : 1) });
    return duration;
  }

  /** The impact of a spell of `kind` at `at` without a flight of its own: the other monsters a bolt passes through (Acid Spray, Moon Ray) and the monsters of Star Burst. */
  impactAt(kind: ProjectileKind, at: Point): void {
    const struck = IMPACT_OF[kind];
    if (struck) this.effects?.impact(struck, at);
  }

  /** An element appears at `at` and fades out over `FLASH_SECONDS` (Elemental Storm). Only the three elements have a picture. */
  flash(kind: "fire" | "ice" | "acid", at: Point): void {
    this.flashes.push({ pose: POSES[kind], at, t: 0, seconds: FLASH_SECONDS, yaw: 0, scale: POSES[kind].scale * FLASH_SCALE });
    // (the element bursts where it appears, like a shot that lands: the picture of its impact, bug_fix_68)
    this.effects?.impact(kind, at);
    // the element shines for as long as it stands there (48th playtest, point 6: the storm had no light)
    const color = PROJECTILE_LAMPS[kind]!.color;
    this.burst(at, { from: color, to: color, peak: 4, range: 8, seconds: FLASH_SECONDS, daylight: SPELL_DAYLIGHT });
  }

  /**
   * One of the three hits of Elemental Storm (bug_fix_83, bug_fix_84): the impact picture of the element (it plays and fades out as every impact does, no projectile model) at `at`, and the sprites and the
   * small cloud of the element (`Effects.stormHit`), which stay for two seconds and fade out slowly. Returns the group of those particles (`Effects.fadeGroup` takes them away at once, when the monster is dead).
   */
  stormHit(kind: "fire" | "ice" | "acid", at: Point): number {
    this.effects?.impact(kind, at, STORM_IMPACT_SIZE);
    const group = this.effects?.stormHit(kind, at) ?? 0;
    const color = PROJECTILE_LAMPS[kind]!.color;
    this.burst(at, { from: color, to: color, peak: 3, range: 6, seconds: STORM_LIGHT_SECONDS, daylight: SPELL_DAYLIGHT });
    return group;
  }

  /**
   * Summon Snakes (bug_fix_79): a coil of snakes stands on the floor at `feet` (a monster's, with the height of the floor) a little towards the party at `from` and to the left of the monster, with its heads
   * turned to the monster. It fades in within `SNAKES_FADE_IN`, stands for `SNAKES_HOLD` and fades out within `SNAKES_SECONDS` (bug_fix_81; no burst of acid over it: the user wants to see the snakes).
   */
  snakes(feet: Point, from: Point): void {
    const dx = from.x - feet.x;
    const dz = from.z - feet.z;
    const d = Math.hypot(dx, dz) || 1;
    // (towards the party, and to the left of someone who looks from the party at the monster: Babylon's x is to the right of +z)
    const ux = dx / d;
    const uz = dz / d;
    const lx = uz;
    const lz = -ux;
    const at = { x: feet.x + ux * SNAKES_FRONT + lx * SNAKES_SIDE, y: feet.y + SNAKES_HALF_HEIGHT * SNAKES_POSE.scale, z: feet.z + uz * SNAKES_FRONT + lz * SNAKES_SIDE };
    const yaw = Math.atan2(feet.x - at.x, feet.z - at.z) + (SNAKES_YAW * Math.PI) / 180;
    this.flashes.push({ pose: SNAKES_POSE, at, t: 0, seconds: SNAKES_SECONDS, yaw, scale: SNAKES_POSE.scale, fadeIn: SNAKES_FADE_IN, hold: SNAKES_HOLD });
  }

  /**
   * Deadly Swarm (bug_fix_81): `count` insects fly round `middle` (a monster's body) on paths of their own for `SWARM_SECONDS` and fade out within `SWARM_FADE`. `middle` is the point the loops circle: the height of
   * the monster's middle, so that the insects round its head and its feet alike.
   */
  swarm(middle: Point, count: number, follow?: () => Point | null): void {
    const r = swarmRng(0x1a5ec7 + this.swarmCount++ * 7919);
    const insects: Insect[] = [];
    for (let i = 0; i < count; i++) {
      const dir = r() < 0.5 ? -1 : 1;
      insects.push({
        ax: 0.8 + r() * 0.9, az: 0.8 + r() * 0.9, wx: dir * (2.2 + r() * 2.2), wz: dir * (2.2 + r() * 2.2), px: r() * Math.PI * 2, pz: r() * Math.PI * 2,
        ay: 0.4 + r() * 0.6, wy: 1.5 + r() * 2.5, py: r() * Math.PI * 2, wobble: 0.15 + r() * 0.25, wobbleRate: 6 + r() * 5,
      });
    }
    this.swarms.push({ at: middle, t: 0, insects, ...(follow ? { follow } : {}) });
  }

  /** A light with no model at `at` (Star Burst at the party, the impact of a meteor): `spec` says what it does. */
  burst(at: Point, spec: BurstSpec): void {
    this.bursts.push({ id: Projectiles.flights++, at, t: 0, spec });
  }

  /**
   * Prismatic Light, Cold Ray, Acid Spray, Moon Ray and Sun Ray: a line of light from `from` to `to` in the colour of `element` (or `options.look`), there at once and gone after `BEAM_SECONDS`. The monster's end also shines for as long
   * (a light of the pool, so only the two nearest ones show).
   */
  beam(element: string, from: Point, to: Point, impact = false, options: { look?: RayLook; particles?: boolean } = {}): void {
    const color = options.look?.color ?? elementColor(element);
    this.beams ??= this.scene ? new GlowBeams(this.scene) : null;
    this.beams?.add(color, from, to, BEAM_SECONDS, options.look);
    // every ray throws off the particles of its element, thick near the party and none beyond two fields (bug_fix_81); the rays that lie on top of each other (a line of monsters) leave them to the first
    if (options.particles !== false) this.effects?.rayParticles(rayKindOf(element), from, to);
    // (Prismatic Light: where a line ends, the element strikes like a shot that lands; physical has no picture of its own and shows the magic one)
    if (impact) this.effects?.impact(impactOfElement(element), to, BEAM_IMPACT_SIZE);
    this.burst(to, { from: color, to: color, peak: 3.4, range: 6.5, seconds: BEAM_SECONDS, daylight: SPELL_DAYLIGHT });
  }

  get active(): boolean {
    return this.flights.length > 0 || this.flashes.length > 0 || this.swarms.length > 0 || this.bursts.length > 0 || (this.beams?.active ?? false);
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
    if (this.flights.length === 0 && this.flashes.length === 0 && this.swarms.length === 0 && !this.drawn) return;
    for (const f of this.flights) f.t += dt;
    for (const f of this.flashes) f.t += dt;
    for (const s of this.swarms) {
      s.t += dt;
      const now = s.follow?.();
      if (now) s.at = { x: now.x, y: now.y, z: now.z };
    }
    for (const f of this.flights) {
      if (f.t < f.duration) continue;
      f.laser?.dispose();
      // where it lands, the element strikes: a few frames of fire, frost, acid or magic (a volley of arrows or a laser leaves nothing)
      const struck = IMPACT_OF[f.kind];
      if (f.impact && struck) this.effects?.impact(struck, f.to);
    }
    this.flights = this.flights.filter((f) => f.t < f.duration);
    const finished: { pose: Pose }[] = this.flashes.filter((f) => f.t >= flashTotal(f));
    this.flashes = this.flashes.filter((f) => f.t < flashTotal(f));
    if (this.swarms.some((s) => s.t >= SWARM_SECONDS + SWARM_FADE)) finished.push({ pose: SWARM_POSE });
    this.swarms = this.swarms.filter((s) => s.t < SWARM_SECONDS + SWARM_FADE);
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
      const rotor = f.whirl !== undefined;
      list.push({ model: pose.model, x, y, z, rotY: rotor ? f.yaw + f.whirl! * f.t : f.yaw, rotX: (pose.pitch * Math.PI) / 180 + (rotor ? 0 : tilt), rotZ: (pose.roll * Math.PI) / 180, ...(pose.spin ? { spin: (pose.spin * Math.PI) / 180 } : {}), scale: pose.scale, atOrigin: true });
    }
    // the elements of a storm: upright, and all of one model fade together (they appear at the same moment); a model without a flash is solid again
    const fade = new Map<string, number>();
    for (const f of this.flashes) {
      fade.set(f.pose.model, Math.min(fade.get(f.pose.model) ?? 1, flashAlpha(f)));
      list.push({ model: f.pose.model, x: f.at.x, y: f.at.y, z: f.at.z, rotY: f.yaw, rotX: 0, rotZ: 0, scale: f.scale, atOrigin: true });
    }
    // the swarms: every insect on its own loop, its nose along the way it flies (the difference of two moments a hair apart); all insects fade out together
    for (const s of this.swarms) {
      fade.set(SWARM_POSE.model, Math.min(fade.get(SWARM_POSE.model) ?? 1, Math.min(1, 1 - (s.t - SWARM_SECONDS) / SWARM_FADE)));
      for (const i of s.insects) {
        const now = insectOffset(i, s.t);
        const next = insectOffset(i, s.t + 0.03);
        const yaw = Math.atan2(next.x - now.x, next.z - now.z) + (SWARM_YAW * Math.PI) / 180;
        // a little lean into the turn and the climb
        const climb = Math.atan2(now.y - next.y, Math.hypot(next.x - now.x, next.z - now.z) || 1);
        list.push({ model: SWARM_POSE.model, x: s.at.x + now.x, y: s.at.y + now.y, z: s.at.z + now.z, rotY: yaw, rotX: climb * 0.5, rotZ: Math.sin(s.t * 9 + i.px) * 0.25, scale: SWARM_POSE.scale, atOrigin: true });
      }
    }
    for (const model of new Set([...fade.keys(), ...finished.map((f) => f.pose.model)])) this.props.setVisibility(model, fade.get(model) ?? 1);
    this.props.setInstances(Projectiles.OWNER, list);
    this.props.flush();
    this.drawn = list.length > 0;
  }

  clear(): void {
    this.effects?.clear();
    this.bursts = [];
    this.beams?.clear();
    for (const f of this.flights) f.laser?.dispose();
    for (const model of new Set([...this.flashes.map((f) => f.pose.model), ...(this.swarms.length > 0 ? [SWARM_POSE.model] : [])])) this.props.setVisibility(model, 1);
    this.flights = [];
    this.flashes = [];
    this.swarms = [];
    this.props.removeOwner(Projectiles.OWNER);
    this.props.flush();
    this.drawn = false;
  }
}
