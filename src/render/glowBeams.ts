import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Matrix } from "@babylonjs/core/Maths/math.vector";
import { Constants } from "@babylonjs/core/Engines/constants";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import type { Scene } from "@babylonjs/core/scene";

const CORE_DIAMETER = 0.07;
const HALO_DIAMETER = 0.3;

interface Beam {
  core: Mesh;
  halo: Mesh;
  t: number;
  seconds: number;
}

/**
 * Straight lines of light between two points that appear at full strength and fade out (Prismatic Light, 48th playtest point 5: from the party to every monster in range at
 * once, a colour for each damage type, gone within 0.7 s). Like the robots' lasers they are unlit cylinders (a thin bright core and a wider soft halo, additive), so they shine
 * by day and in the dark of a dungeon alike. One material pair per colour, shared by all beams of that colour.
 */
export class GlowBeams {
  private readonly materials = new Map<string, { core: StandardMaterial; halo: StandardMaterial }>();
  private beams: Beam[] = [];

  constructor(private readonly scene: Scene) {}

  private materialsFor(color: readonly [number, number, number]): { core: StandardMaterial; halo: StandardMaterial } {
    const key = color.join(",");
    let pair = this.materials.get(key);
    if (!pair) {
      const make = (name: string, emissive: Color3, alpha: number): StandardMaterial => {
        const m = new StandardMaterial(`beam:${name}:${key}`, this.scene);
        m.disableLighting = true;
        m.diffuseColor = Color3.Black();
        m.specularColor = Color3.Black();
        m.emissiveColor = emissive;
        m.alpha = alpha;
        m.alphaMode = Constants.ALPHA_ADD;
        m.disableDepthWrite = true;
        return m;
      };
      const [r, g, b] = color;
      // the core is nearly white in the colour, the halo the colour itself
      pair = {
        core: make("core", new Color3(0.55 + r * 0.45, 0.55 + g * 0.45, 0.55 + b * 0.45), 1),
        halo: make("halo", new Color3(r, g, b), 0.7),
      };
      this.materials.set(key, pair);
    }
    return pair;
  }

  /** A line from `from` to `to` in `color` that fades out over `seconds`. */
  add(color: readonly [number, number, number], from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }, seconds: number): void {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const flat = Math.hypot(dx, dz);
    const length = Math.hypot(flat, dy);
    if (length < 0.01) return;
    const pair = this.materialsFor(color);
    const make = (name: string, diameter: number, material: StandardMaterial): Mesh => {
      // one unit long along z (a cylinder stands along y), stretched to the distance by the scaling
      const mesh = CreateCylinder(name, { height: 1, diameter, tessellation: 8 }, this.scene);
      mesh.bakeTransformIntoVertices(Matrix.RotationX(Math.PI / 2));
      mesh.material = material;
      mesh.isPickable = false;
      return mesh;
    };
    const core = make("beam:core", CORE_DIAMETER, pair.core);
    const halo = make("beam:halo", HALO_DIAMETER, pair.halo);
    halo.parent = core;
    halo.alphaIndex = 10;
    core.alphaIndex = 11;
    core.position.set(from.x + dx / 2, from.y + dy / 2, from.z + dz / 2);
    // yaw about the vertical axis, pitch positive = pointing down (as for the laser bolts)
    core.rotation.set(Math.atan2(-dy, flat), Math.atan2(dx, dz), 0);
    core.scaling.z = length;
    this.beams.push({ core, halo, t: 0, seconds });
  }

  update(dt: number): void {
    for (const b of this.beams) {
      b.t += dt;
      const strength = Math.max(0, 1 - b.t / b.seconds);
      b.core.visibility = strength;
      b.halo.visibility = strength;
    }
    const gone = this.beams.filter((b) => b.t >= b.seconds);
    for (const b of gone) this.free(b);
    if (gone.length > 0) this.beams = this.beams.filter((b) => b.t < b.seconds);
  }

  get active(): boolean {
    return this.beams.length > 0;
  }

  clear(): void {
    for (const b of this.beams) this.free(b);
    this.beams = [];
  }

  private free(b: Beam): void {
    // the materials belong to the colour and every beam of it: only the meshes go
    b.halo.dispose(false, false);
    b.core.dispose(false, false);
  }
}
