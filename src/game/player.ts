import type { Facing } from "../interiors/types";

export const FACING_INDEX: Record<Facing, number> = { N: 0, E: 1, S: 2, W: 3 };
export const FACING_BY_INDEX: Facing[] = ["N", "E", "S", "W"];
export const FACING_VEC: Record<Facing, [number, number]> = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };

export type MoveDir = "forward" | "back" | "left" | "right";

/** Eye height above the ground. */
export const EYE_HEIGHT = 1.7;
const STEP_SECONDS = 0.22;
const TURN_SECONDS = 0.16;

export interface PlayerCallbacks {
  /** May the party enter this tile? Called before a step starts. */
  canEnter(x: number, y: number): boolean;
  /** Ground height under the middle of a tile. */
  heightAt(x: number, y: number): number;
  /** A step onto this tile has just begun (the party is still on its way). */
  stepStarted?(x: number, y: number): void;
  /** The step is finished and the party stands on the new tile. */
  arrived(x: number, y: number): void;
  /** The party bumped into something it cannot enter. */
  blocked(x: number, y: number): void;
}

/**
 * First-person grid movement: one tile per step, 90 degree turns, both interpolated for smooth motion.
 * One input can wait in the queue while an animation runs, so quick key presses are not lost.
 */
export class PlayerRig {
  tx = 0;
  ty = 0;
  facing: Facing = "N";
  /** Current camera yaw in radians (continuous, not wrapped). */
  yaw = 0;
  private targetYaw = 0;
  /** Camera position in world space (x, z follow the tile grid, y the terrain). */
  x = 0;
  z = 0;
  y = EYE_HEIGHT;

  private anim: { kind: "step"; t: number; fromX: number; fromZ: number; fromY: number; toX: number; toZ: number; toY: number; toTx: number; toTy: number } | { kind: "turn"; t: number; from: number; to: number } | null = null;
  private queued: { type: "move"; dir: MoveDir } | { type: "turn"; by: -1 | 1 } | null = null;
  private bob = 0;
  locked = false;

  constructor(private readonly cb: PlayerCallbacks) {}

  get busy(): boolean {
    return this.anim !== null;
  }

  /** The tile the party is stepping onto right now (it counts as the party's already), null when it stands still or turns. */
  get entering(): { x: number; y: number } | null {
    return this.anim?.kind === "step" ? { x: this.anim.toTx, y: this.anim.toTy } : null;
  }

  /** Puts the party on a tile without animation. */
  place(tx: number, ty: number, facing: Facing, worldX: number, worldZ: number): void {
    this.tx = tx;
    this.ty = ty;
    this.facing = facing;
    this.targetYaw = (FACING_INDEX[facing] * Math.PI) / 2;
    this.yaw = this.targetYaw;
    this.x = worldX;
    this.z = worldZ;
    this.y = this.cb.heightAt(tx, ty) + EYE_HEIGHT;
    this.anim = null;
    this.queued = null;
  }

  /** Direction of a move relative to the current facing. */
  private direction(dir: MoveDir): Facing {
    const i = FACING_INDEX[this.facing];
    const offset = dir === "forward" ? 0 : dir === "right" ? 1 : dir === "back" ? 2 : 3;
    return FACING_BY_INDEX[(i + offset) % 4]!;
  }

  command(c: { type: "move"; dir: MoveDir } | { type: "turn"; by: -1 | 1 }): void {
    if (this.locked) return;
    if (this.anim) {
      this.queued = c;
      return;
    }
    this.start(c);
  }

  private start(c: { type: "move"; dir: MoveDir } | { type: "turn"; by: -1 | 1 }): void {
    if (c.type === "turn") {
      const i = (FACING_INDEX[this.facing] + (c.by === 1 ? 1 : 3)) % 4;
      this.facing = FACING_BY_INDEX[i]!;
      const from = this.yaw;
      this.targetYaw = this.targetYaw + c.by * (Math.PI / 2);
      this.anim = { kind: "turn", t: 0, from, to: this.targetYaw };
      return;
    }
    const d = this.direction(c.dir);
    const [dx, dy] = FACING_VEC[d];
    const nx = this.tx + dx;
    const ny = this.ty + dy;
    if (!this.cb.canEnter(nx, ny)) {
      this.cb.blocked(nx, ny);
      return;
    }
    this.anim = {
      kind: "step",
      t: 0,
      fromX: this.x,
      fromZ: this.z,
      fromY: this.y,
      toX: this.x + dx * 3,
      toZ: this.z - dy * 3,
      toY: this.cb.heightAt(nx, ny) + EYE_HEIGHT,
      toTx: nx,
      toTy: ny,
    };
    this.cb.stepStarted?.(nx, ny);
  }

  update(dt: number): void {
    const a = this.anim;
    if (!a) return;
    if (a.kind === "turn") {
      a.t = Math.min(1, a.t + dt / TURN_SECONDS);
      const e = a.t * a.t * (3 - 2 * a.t);
      this.yaw = a.from + (a.to - a.from) * e;
      if (a.t >= 1) this.finish();
      return;
    }
    a.t = Math.min(1, a.t + dt / STEP_SECONDS);
    const e = a.t < 0.5 ? 2 * a.t * a.t : 1 - Math.pow(-2 * a.t + 2, 2) / 2;
    this.x = a.fromX + (a.toX - a.fromX) * e;
    this.z = a.fromZ + (a.toZ - a.fromZ) * e;
    this.bob = Math.sin(a.t * Math.PI) * 0.07;
    this.y = a.fromY + (a.toY - a.fromY) * e + this.bob;
    if (a.t >= 1) {
      this.tx = a.toTx;
      this.ty = a.toTy;
      this.y = a.toY;
      this.anim = null;
      // the monsters answer a step in `arrived`: a queued step is checked only after that, or it would aim at the tile one of them takes next
      this.cb.arrived(this.tx, this.ty);
      this.startQueued();
    }
  }

  private finish(): void {
    this.anim = null;
    this.startQueued();
  }

  private startQueued(): void {
    const next = this.queued;
    this.queued = null;
    if (next && !this.anim && !this.locked) this.start(next);
  }
}
