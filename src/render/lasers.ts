import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Matrix } from "@babylonjs/core/Maths/math.vector";
import { Constants } from "@babylonjs/core/Engines/constants";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import type { Scene } from "@babylonjs/core/scene";
import type { LampKind } from "./lamps";

/** The blue of the robots' lasers: the light that flies along with the beam (`Game.updateLamps`) has the same colour. */
export const LASER_LAMP: Omit<LampKind, "y"> = { color: [0.25, 0.55, 1], range: 6.5, intensity: 3.4 };

/** The bolt is a thin cylinder (a beam of this length flying point first) with a wider, soft one around it that gives the shine. */
const LENGTH = 1.5;
const CORE_DIAMETER = 0.05;
const HALO_DIAMETER = 0.2;

/** One laser bolt in flight: its two cylinders move as one. */
export class LaserBolt {
  private static count = 0;
  /** What the light that flies along with the bolt is called (`ProjectileGlow.key`). */
  readonly id = LaserBolt.count++;

  constructor(
    private readonly core: Mesh,
    private readonly halo: Mesh,
  ) {}

  /** Puts the bolt at `x, y, z` (the middle of the beam), its long axis along `yaw` (about the vertical axis) and `pitch` (positive = pointing down). */
  place(x: number, y: number, z: number, yaw: number, pitch: number): void {
    this.core.position.set(x, y, z);
    this.core.rotation.set(pitch, yaw, 0);
  }

  dispose(): void {
    // the materials belong to the factory and every bolt: only the meshes go
    this.halo.dispose(false, false);
    this.core.dispose(false, false);
  }
}

/** Makes the laser bolts of the robots (ED-409, Terminator, Iron Wizard) with two materials they all share. */
export class LaserFactory {
  private readonly coreMaterial: StandardMaterial;
  private readonly haloMaterial: StandardMaterial;

  constructor(private readonly scene: Scene) {
    // unlit, so that the beam shines in the dark of a dungeon as much as by day
    this.coreMaterial = new StandardMaterial("laser:core", scene);
    this.coreMaterial.disableLighting = true;
    this.coreMaterial.diffuseColor = Color3.Black();
    this.coreMaterial.specularColor = Color3.Black();
    this.coreMaterial.emissiveColor = new Color3(0.3, 0.62, 1);
    this.haloMaterial = new StandardMaterial("laser:halo", scene);
    this.haloMaterial.disableLighting = true;
    this.haloMaterial.diffuseColor = Color3.Black();
    this.haloMaterial.specularColor = Color3.Black();
    this.haloMaterial.emissiveColor = new Color3(0.1, 0.38, 1);
    this.haloMaterial.alpha = 0.55;
    this.haloMaterial.alphaMode = Constants.ALPHA_ADD;
    this.haloMaterial.disableDepthWrite = true;
  }

  create(): LaserBolt {
    const make = (name: string, diameter: number, material: StandardMaterial): Mesh => {
      const mesh = CreateCylinder(name, { height: LENGTH, diameter, tessellation: 10 }, this.scene);
      // a cylinder stands along y: lying along z it points where `lookAt` and the yaw point
      mesh.bakeTransformIntoVertices(Matrix.RotationX(Math.PI / 2));
      mesh.material = material;
      mesh.isPickable = false;
      return mesh;
    };
    const core = make("laser:core", CORE_DIAMETER, this.coreMaterial);
    const halo = make("laser:halo", HALO_DIAMETER, this.haloMaterial);
    halo.parent = core;
    // drawn after the opaque things, so that nothing hides the shine
    halo.alphaIndex = 10;
    return new LaserBolt(core, halo);
  }

  dispose(): void {
    this.coreMaterial.dispose();
    this.haloMaterial.dispose();
  }
}
