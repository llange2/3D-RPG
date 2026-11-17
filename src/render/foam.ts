import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import type { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Scene } from "@babylonjs/core/scene";
import { CHUNK_SIZE, GROUND, type Ground } from "../world/types";
import type { World } from "../world/world";
import { FX_FILES } from "./fxSheets";
import { additiveMaterial, sheetTexture } from "./fxMaterials";
import { lightAt } from "./fxLight";
import { tileToWorldX, tileToWorldZ } from "./heights";

/**
 * The foam of the shore (bug_fix_68, `fx_foam`): where water meets land on the overworld, a lace of foam lies on the water, bright at the shoreline and fading into the water in a tile. It is
 * ONE mesh per chunk (quads over the water fields that touch land, the strength at the corners of a field is how much of the four fields around the corner is land), all of them with one
 * material and one picture: the picture slides slowly over the water, and the foam breathes in and out like the waves do. It is added light, so it is as bright as the day is (`lightAt`
 * without the point lights: no foam shines in the night).
 */

/** The foam lies a hair above the painted water (a z offset does the rest). */
const FOAM_HEIGHT = 0.04;
/** World units that the picture covers once. */
const FOAM_UV = 1 / 7;
/** Seconds the foam needs to breathe once, and how deep it goes (the share of its strength that is left at the low point). */
const BREATH_SECONDS = 7;
const BREATH_LOW = 0.45;

const isWater = (g: Ground): boolean => g === GROUND.WATER || g === GROUND.SHALLOW || g === GROUND.BRIDGE;

export class ShoreFoam {
  private texture: Texture | null = null;
  private material: StandardMaterial | null = null;
  private readonly meshes = new Set<Mesh>();
  private clock = 0;

  constructor(private readonly scene: Scene) {}

  private ensure(): StandardMaterial {
    if (!this.material) {
      this.texture = sheetTexture(this.scene, FX_FILES.foam, true);
      this.material = additiveMaterial(this.scene, "fx:foam", this.texture);
      // (the fog stays: the foam fades out with the land far away, and `sightLimit` cuts it where the view ends)
      this.material.fogEnabled = true;
      this.material.zOffset = -3;
    }
    return this.material;
  }

  /** The foam of one chunk (null when no water field of it touches land). The caller owns the mesh and gives it back with `release`. */
  build(world: World, cx: number, cy: number): Mesh | null {
    const x0 = cx * CHUNK_SIZE;
    const y0 = cy * CHUNK_SIZE;
    // the fields of the chunk and one ring round it (the corners at the border see the neighbours)
    const size = CHUNK_SIZE + 2;
    const land = new Uint8Array(size * size);
    const water = new Uint8Array(size * size);
    for (let ly = -1; ly <= CHUNK_SIZE; ly++) {
      for (let lx = -1; lx <= CHUNK_SIZE; lx++) {
        const g = world.tile(x0 + lx, y0 + ly).ground;
        const i = (ly + 1) * size + (lx + 1);
        water[i] = g === GROUND.WATER || g === GROUND.SHALLOW ? 1 : 0;
        land[i] = isWater(g) ? 0 : 1;
      }
    }
    const landAt = (lx: number, ly: number): number => land[(ly + 1) * size + (lx + 1)]!;
    // the strength at a corner: 0 in the open water, 1 at a straight shore (two of the four fields are land), a little less at a bend
    const corner = (i: number, j: number): number => Math.min(1, (landAt(i - 1, j - 1) + landAt(i, j - 1) + landAt(i - 1, j) + landAt(i, j)) / 2);

    const pos: number[] = [];
    const uv: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    for (let ly = 0; ly < CHUNK_SIZE; ly++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        if (!water[(ly + 1) * size + (lx + 1)]) continue;
        // (a bridge lies over its water: no foam under it, but its neighbours count it as water)
        if (world.tile(x0 + lx, y0 + ly).ground === GROUND.BRIDGE) continue;
        const k = [corner(lx, ly), corner(lx + 1, ly), corner(lx + 1, ly + 1), corner(lx, ly + 1)];
        if (k.every((v) => v === 0)) continue;
        const base = pos.length / 3;
        const cs: [number, number][] = [[lx, ly], [lx + 1, ly], [lx + 1, ly + 1], [lx, ly + 1]];
        cs.forEach(([i, j], n) => {
          const wx = tileToWorldX(x0 + i);
          const wz = tileToWorldZ(y0 + j);
          pos.push(wx, FOAM_HEIGHT, wz);
          uv.push(wx * FOAM_UV, wz * FOAM_UV);
          // (a corner that is nothing but land at its other three fields would be 1.5: the foam does not go beyond 1)
          col.push(k[n]!, k[n]!, k[n]!, 1);
        });
        // front face up, as the ground quads (NW, SE, NE and NW, SW, SE)
        idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
      }
    }
    if (idx.length === 0) return null;
    const mesh = new Mesh(`fx:foam:${cx},${cy}`, this.scene);
    const data = new VertexData();
    data.positions = pos;
    data.uvs = uv;
    data.colors = col;
    data.indices = idx;
    data.applyToMesh(mesh, false);
    mesh.material = this.ensure();
    mesh.isPickable = false;
    mesh.freezeWorldMatrix();
    mesh.alwaysSelectAsActiveMesh = false;
    this.meshes.add(mesh);
    return mesh;
  }

  release(mesh: Mesh): void {
    this.meshes.delete(mesh);
    mesh.dispose(false, false);
  }

  /** Slides the picture, lets the foam breathe, and sets its strength to the light of the day. Once per frame. */
  animate(dt: number, at: { x: number; y: number; z: number }): void {
    if (!this.material || !this.texture) return;
    this.clock += dt;
    this.texture.uOffset = (this.clock * 0.018) % 1;
    this.texture.vOffset = (this.clock * -0.011) % 1;
    const breath = BREATH_LOW + (1 - BREATH_LOW) * (0.5 + 0.5 * Math.sin((this.clock / BREATH_SECONDS) * Math.PI * 2));
    // (the sky and the sun only: the torch lights the ground beside the party, not the sea)
    this.material.alpha = breath * lightAt(this.scene, at.x, at.y, at.z, false);
  }

  dispose(): void {
    for (const m of this.meshes) m.dispose(false, false);
    this.meshes.clear();
    this.material?.dispose(false, true);
    this.material = null;
    this.texture = null;
  }
}
