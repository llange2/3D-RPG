import { Color3 } from "@babylonjs/core/Maths/math.color";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";

/**
 * The pirate ship of ue_quest_4. The quest document has no model for it yet ("tbd, use dummy"), so this is a plain ship built of boxes, poles and sails: a hull with a prow and a
 * stern castle, two masts with dark sails and a red pennant. Its own materials (nobody else shares them), faded through the visibility of its meshes. Looks along +z, like the
 * game's other models; a model of the old game can take its place later without touching the game code (`place`, `fadeOut`, `hide`).
 */

/** The pirate ship rides in the water: its keel stands this far under the surface of a tile (the water is at height 0). */
const KEEL = 0.3;
/** How far it rocks in the swell, in radians, and how fast (radians a second). */
const ROCK = 0.04;
const ROCK_SPEED = 1.3;

export class PirateShip {
  private readonly root: TransformNode;
  private readonly meshes: Mesh[] = [];
  private alpha = 0;
  private fading: { speed: number; done: () => void } | null = null;
  private clock = 0;

  constructor(scene: Scene) {
    this.root = new TransformNode("pirate-ship", scene);
    const wood = this.material(scene, "#5a3a1c");
    const deck = this.material(scene, "#8a6234");
    const dark = this.material(scene, "#2a1c10");
    const sail = this.material(scene, "#23232b", true);
    const pennant = this.material(scene, "#a01414", true);
    const bone = this.material(scene, "#d8d2c0", true);
    const add = (mesh: Mesh, material: StandardMaterial, x: number, y: number, z: number, rx = 0, ry = 0): Mesh => {
      mesh.material = material;
      mesh.parent = this.root;
      mesh.position.set(x, y, z);
      mesh.rotation.set(rx, ry, 0);
      mesh.isPickable = false;
      this.meshes.push(mesh);
      return mesh;
    };
    // the hull: a long box, a prow made of a box turned by 45 degrees, the stern castle, the deck
    add(CreateBox("pirate:hull", { width: 2, height: 1, depth: 5.4 }, scene), wood, 0, 0.2, 0);
    add(CreateBox("pirate:prow", { width: 1.42, height: 1, depth: 1.42 }, scene), wood, 0, 0.2, 2.7, 0, Math.PI / 4);
    add(CreateBox("pirate:deck", { width: 1.8, height: 0.1, depth: 5.2 }, scene), deck, 0, 0.72, 0);
    add(CreateBox("pirate:castle", { width: 1.9, height: 0.9, depth: 1.5 }, scene), dark, 0, 1.2, -1.9);
    add(CreateBox("pirate:rail", { width: 2.1, height: 0.12, depth: 5.6 }, scene), dark, 0, 0.78, 0);
    add(CreateCylinder("pirate:sprit", { height: 2, diameter: 0.14 }, scene), wood, 0, 1.2, 3.5, Math.PI / 2 - 0.45, 0);
    // two masts with a dark sail each, a skull-coloured spar above the big one and a pennant at the top
    add(CreateCylinder("pirate:mast1", { height: 5, diameter: 0.22 }, scene), wood, 0, 3.2, 0.7);
    add(CreateCylinder("pirate:mast2", { height: 3.8, diameter: 0.18 }, scene), wood, 0, 2.7, -1.3);
    add(CreatePlane("pirate:sail1", { width: 3.2, height: 2.6, sideOrientation: Mesh.DOUBLESIDE }, scene), sail, 0, 3.3, 0.7);
    add(CreatePlane("pirate:sail2", { width: 2.4, height: 1.9, sideOrientation: Mesh.DOUBLESIDE }, scene), sail, 0, 3, -1.3);
    add(CreateBox("pirate:skull", { width: 0.7, height: 0.7, depth: 0.04 }, scene), bone, 0, 3.4, 0.76);
    add(CreateCylinder("pirate:yard1", { height: 3.4, diameter: 0.1 }, scene), wood, 0, 4.6, 0.7, 0, 0).rotation.z = Math.PI / 2;
    add(CreatePlane("pirate:pennant", { width: 1.1, height: 0.5, sideOrientation: Mesh.DOUBLESIDE }, scene), pennant, 0, 5.5, 0.7, 0, Math.PI / 2).position.z = 1.25;
    this.root.setEnabled(false);
  }

  private material(scene: Scene, hex: string, lit = false): StandardMaterial {
    const m = new StandardMaterial(`pirate:${hex}`, scene);
    m.diffuseColor = Color3.FromHexString(hex);
    m.specularColor = Color3.Black();
    // sails and flags are seen against the dark; a little own light keeps them readable at night
    m.emissiveColor = Color3.FromHexString(hex).scale(lit ? 0.35 : 0.12);
    m.backFaceCulling = false;
    return m;
  }

  /** Shows the ship at a world position, looking along `yaw` (the game's convention: 0 is +z). Brings it back fully visible unless it is fading out. */
  place(x: number, z: number, yaw: number): void {
    this.root.position.set(x, -KEEL + 0.3, z);
    this.root.rotation.y = yaw;
    if (!this.fading && this.alpha < 1) this.setAlpha(1);
    this.root.setEnabled(this.alpha > 0);
  }

  /** The ship is gone at once (inside a place, or while it is away). */
  hide(): void {
    this.fading = null;
    this.setAlpha(0);
    this.root.setEnabled(false);
  }

  get shown(): boolean {
    return this.alpha > 0;
  }

  /** Fades the ship out in `seconds`; resolves when it is gone. */
  fadeOut(seconds: number): Promise<void> {
    if (this.alpha <= 0) return Promise.resolve();
    return new Promise((done) => {
      this.fading = { speed: this.alpha / Math.max(0.01, seconds), done };
    });
  }

  /** Runs the fade and the rocking in the swell. */
  update(dt: number): void {
    if (this.alpha <= 0) return;
    this.clock += dt;
    this.root.rotation.z = Math.sin(this.clock * ROCK_SPEED) * ROCK;
    this.root.rotation.x = Math.sin(this.clock * ROCK_SPEED * 0.7 + 1) * ROCK * 0.6;
    if (this.fading) {
      this.setAlpha(Math.max(0, this.alpha - this.fading.speed * dt));
      if (this.alpha <= 0) {
        const { done } = this.fading;
        this.fading = null;
        this.root.setEnabled(false);
        done();
      }
    }
  }

  private setAlpha(a: number): void {
    this.alpha = a;
    for (const m of this.meshes) m.visibility = a;
  }
}
