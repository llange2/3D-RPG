import { Color3 } from "@babylonjs/core/Maths/math.color";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import type { Scene } from "@babylonjs/core/scene";

type RGB = [number, number, number];

/** Small builder for flat- or smooth-shaded low-poly meshes with vertex colours. */
class Builder {
  positions: number[] = [];
  colors: number[] = [];
  indices: number[] = [];

  vertex(x: number, y: number, z: number, c: RGB): number {
    this.positions.push(x, y, z);
    this.colors.push(c[0], c[1], c[2], 1);
    return this.positions.length / 3 - 1;
  }

  tri(a: number, b: number, c: number): void {
    this.indices.push(a, b, c);
  }

  /** Triangle with its own vertices (flat shading), colours per corner. */
  flatTri(p: [number, number, number][], c: [RGB, RGB, RGB]): void {
    this.tri(this.vertex(...p[0]!, c[0]), this.vertex(...p[1]!, c[1]), this.vertex(...p[2]!, c[2]));
  }

  /** Same triangle seen from the back, so thin geometry shows from both sides. */
  flatTriBothSides(p: [number, number, number][], c: [RGB, RGB, RGB]): void {
    this.flatTri(p, c);
    this.flatTri([p[0]!, p[2]!, p[1]!], [c[0], c[2], c[1]]);
  }

  /** Cone or truncated cone around the y axis. */
  cone(x: number, z: number, y0: number, y1: number, r0: number, r1: number, sides: number, bottom: RGB, top: RGB): void {
    for (let i = 0; i < sides; i++) {
      const a0 = (i / sides) * Math.PI * 2;
      const a1 = ((i + 1) / sides) * Math.PI * 2;
      const p0: [number, number, number] = [x + Math.sin(a0) * r0, y0, z + Math.cos(a0) * r0];
      const p1: [number, number, number] = [x + Math.sin(a1) * r0, y0, z + Math.cos(a1) * r0];
      const q0: [number, number, number] = [x + Math.sin(a0) * r1, y1, z + Math.cos(a0) * r1];
      const q1: [number, number, number] = [x + Math.sin(a1) * r1, y1, z + Math.cos(a1) * r1];
      this.flatTri([p0, q0, p1], [bottom, top, bottom]);
      if (r1 > 0.001) this.flatTri([p1, q0, q1], [bottom, top, top]);
    }
  }

  build(name: string, scene: Scene, material: StandardMaterial): Mesh {
    const mesh = new Mesh(name, scene);
    const vd = new VertexData();
    vd.positions = this.positions;
    vd.indices = this.indices;
    vd.colors = this.colors;
    const normals: number[] = [];
    VertexData.ComputeNormals(this.positions, this.indices, normals);
    vd.normals = normals;
    vd.applyToMesh(mesh, false);
    mesh.material = material;
    mesh.isPickable = false;
    return mesh;
  }
}

const GREEN_DARK: RGB = [0.1, 0.28, 0.07];
const GREEN_LIGHT: RGB = [0.42, 0.72, 0.18];

function tuft(): Builder {
  const b = new Builder();
  const blades = 7;
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI * 2 + (i % 2) * 0.4;
    const r = 0.1 + (i % 3) * 0.07;
    const h = 0.55 + ((i * 37) % 5) * 0.09;
    const lean = 0.28 + (i % 2) * 0.12;
    const cx = Math.sin(a) * r;
    const cz = Math.cos(a) * r;
    const w = 0.07;
    const px = Math.cos(a) * w;
    const pz = -Math.sin(a) * w;
    b.flatTriBothSides(
      [
        [cx - px, 0, cz - pz],
        [cx + px, 0, cz + pz],
        [cx + Math.sin(a) * lean, h, cz + Math.cos(a) * lean],
      ],
      [GREEN_DARK, GREEN_DARK, GREEN_LIGHT],
    );
  }
  return b;
}

function flower(petal: RGB): Builder {
  const b = new Builder();
  const stem: RGB = [0.18, 0.4, 0.1];
  b.flatTriBothSides(
    [
      [-0.025, 0, 0],
      [0.025, 0, 0],
      [0, 0.62, 0],
    ],
    [stem, stem, stem],
  );
  const centre: RGB = [0.95, 0.8, 0.2];
  const petals = 5;
  for (let i = 0; i < petals; i++) {
    const a0 = (i / petals) * Math.PI * 2;
    const a1 = ((i + 1) / petals) * Math.PI * 2;
    b.flatTriBothSides(
      [
        [0, 0.66, 0],
        [Math.sin(a0) * 0.17, 0.6, Math.cos(a0) * 0.17],
        [Math.sin(a1) * 0.17, 0.6, Math.cos(a1) * 0.17],
      ],
      [centre, petal, petal],
    );
  }
  return b;
}

function mushroom(): Builder {
  const b = new Builder();
  b.cone(0, 0, 0, 0.28, 0.07, 0.05, 6, [0.8, 0.78, 0.7], [0.9, 0.88, 0.8]);
  b.cone(0, 0, 0.26, 0.4, 0.3, 0, 8, [0.12, 0.3, 0.7], [0.35, 0.55, 0.95]);
  b.cone(0, 0, 0.26, 0.26, 0.3, 0.05, 8, [0.06, 0.12, 0.35], [0.06, 0.12, 0.35]);
  return b;
}

function lodTree(crown: RGB, crownTop: RGB, kind: "cone" | "round" | "palm" | "dead"): Builder {
  const b = new Builder();
  const trunk: RGB = [0.32, 0.2, 0.1];
  const trunkTop: RGB = [0.24, 0.15, 0.08];
  if (kind === "palm") {
    b.cone(0, 0, 0, 2.7, 0.2, 0.12, 5, trunk, trunkTop);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      b.flatTriBothSides(
        [
          [0, 2.7, 0],
          [Math.sin(a - 0.28) * 1.8, 2.2, Math.cos(a - 0.28) * 1.8],
          [Math.sin(a + 0.28) * 1.8, 2.2, Math.cos(a + 0.28) * 1.8],
        ],
        [crownTop, crown, crown],
      );
    }
    return b;
  }
  if (kind === "dead") {
    b.cone(0, 0, 0, 3.2, 0.22, 0.05, 5, trunk, trunkTop);
    for (let i = 0; i < 3; i++) {
      const a = i * 2.1;
      b.flatTriBothSides(
        [
          [0, 1.6 + i * 0.4, 0],
          [Math.sin(a) * 1.2, 2.5 + i * 0.3, Math.cos(a) * 1.2],
          [Math.sin(a + 0.3) * 0.15, 1.9 + i * 0.4, Math.cos(a + 0.3) * 0.15],
        ],
        [trunk, trunkTop, trunk],
      );
    }
    return b;
  }
  b.cone(0, 0, 0, 1.4, 0.2, 0.15, 5, trunk, trunkTop);
  if (kind === "cone") {
    b.cone(0, 0, 0.9, 2.6, 1.25, 0.5, 7, crown, crownTop);
    b.cone(0, 0, 2.2, 4.1, 0.95, 0.0, 7, crown, crownTop);
  } else {
    b.cone(0, 0, 1.3, 2.6, 1.3, 1.0, 7, crown, crownTop);
    b.cone(0, 0, 2.5, 3.8, 1.0, 0.0, 7, crown, crownTop);
  }
  return b;
}

/**
 * Stand-in for a mountain tile far from the party (the mountain models have hundreds of triangles): a two-stage cone of the
 * size of the model (about 3.4 wide and 4.6 high for the old game's meadow mountain), coloured like the rock.
 */
function lodMountain(foot: RGB, top: RGB): Builder {
  const b = new Builder();
  const mid: RGB = [(foot[0] + top[0]) / 2, (foot[1] + top[1]) / 2, (foot[2] + top[2]) / 2];
  b.cone(0, 0, 0, 2.6, 1.8, 1.0, 7, foot, mid);
  b.cone(0, 0, 2.2, 4.6, 1.15, 0, 6, mid, top);
  return b;
}

export interface ProceduralModel {
  key: string;
  mesh: Mesh;
}

/** All procedural prop meshes. They share one vertex-colour material and sit on y = 0. */
export function createProceduralModels(scene: Scene): ProceduralModel[] {
  const material = new StandardMaterial("procedural-props", scene);
  material.diffuseColor = Color3.White();
  material.specularColor = Color3.Black();
  material.backFaceCulling = false;
  const make = (key: string, b: Builder): ProceduralModel => ({ key, mesh: b.build(key, scene, material) });
  return [
    make("proc_tuft", tuft()),
    make("proc_flower_blue", flower([0.25, 0.35, 0.95])),
    make("proc_flower_pink", flower([0.95, 0.4, 0.7])),
    make("proc_mushroom", mushroom()),
    make("lod_tree_green", lodTree([0.08, 0.3, 0.1], [0.2, 0.5, 0.16], "round")),
    make("lod_tree_snow", lodTree([0.6, 0.75, 0.85], [0.95, 0.97, 1], "cone")),
    make("lod_tree_palm", lodTree([0.25, 0.55, 0.12], [0.5, 0.75, 0.2], "palm")),
    make("lod_tree_dead", lodTree([0.3, 0.22, 0.14], [0.4, 0.3, 0.2], "dead")),
    make("lod_mtn_rock", lodMountain([0.36, 0.34, 0.31], [0.62, 0.6, 0.57])),
    make("lod_mtn_snow", lodMountain([0.5, 0.58, 0.68], [0.97, 0.98, 1])),
    make("lod_mtn_desert", lodMountain([0.6, 0.48, 0.3], [0.84, 0.72, 0.48])),
    make("lod_mtn_swamp", lodMountain([0.2, 0.25, 0.17], [0.4, 0.45, 0.3])),
    make("lod_mtn_lava", lodMountain([0.2, 0.09, 0.07], [0.55, 0.22, 0.1])),
  ];
}
