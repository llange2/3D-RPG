import { Color3 } from "@babylonjs/core/Maths/math.color";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import type { Scene } from "@babylonjs/core/scene";
import type { TextureCache } from "./assets";

const RADIUS = 700;
const AROUND = 36;
const RINGS = 16;
const MIN_ELEVATION = -12; // degrees below the horizon, hidden by the terrain and the fog
const SPAN = 90 - MIN_ELEVATION;

/**
 * Sky dome that follows the camera. The panorama of the old game (dark zenith, clouds near the horizon) is mapped by
 * elevation, tinted per biome and darkened at night.
 */
export class SkyDome {
  readonly mesh: Mesh;
  private readonly material: StandardMaterial;

  constructor(scene: Scene, textures: TextureCache) {
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    for (let ring = 0; ring <= RINGS; ring++) {
      const elevation = MIN_ELEVATION + (SPAN * ring) / RINGS; // degrees
      const e = (elevation * Math.PI) / 180;
      for (let seg = 0; seg <= AROUND; seg++) {
        const a = (seg / AROUND) * Math.PI * 2;
        positions.push(Math.sin(a) * Math.cos(e) * RADIUS, Math.sin(e) * RADIUS, Math.cos(a) * Math.cos(e) * RADIUS);
        // v = 0 is the bottom of the image (clouds), v = 1 the dark zenith. The panorama (2048 x 512 here, 8192 x 2048 in the old
        // game) runs once around the whole circle: its edges differ by about 3 of 255, so no mirroring is needed. An earlier
        // version mirrored it twice around, which squeezed every cloud to half its width.
        uvs.push(seg / AROUND, (elevation - MIN_ELEVATION) / SPAN);
      }
    }
    for (let ring = 0; ring < RINGS; ring++) {
      for (let seg = 0; seg < AROUND; seg++) {
        const a = ring * (AROUND + 1) + seg;
        const b = a + AROUND + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    const mesh = new Mesh("sky", scene);
    const vd = new VertexData();
    vd.positions = positions;
    vd.indices = indices;
    vd.uvs = uvs;
    vd.normals = positions.map((p) => p / RADIUS);
    vd.applyToMesh(mesh, false);
    mesh.infiniteDistance = true;
    mesh.isPickable = false;
    mesh.applyFog = false;
    mesh.alwaysSelectAsActiveMesh = true;
    mesh.renderingGroupId = 0;

    const m = new StandardMaterial("sky", scene);
    const sky = textures.get("ui/sky01.webp", { wrap: true, mipmaps: false });
    sky.wrapU = Texture.WRAP_ADDRESSMODE;
    m.emissiveTexture = sky;
    m.diffuseColor = Color3.Black();
    m.specularColor = Color3.Black();
    m.disableLighting = true;
    m.backFaceCulling = false;
    m.fogEnabled = false;
    m.disableDepthWrite = true;
    mesh.material = m;
    this.mesh = mesh;
    this.material = m;
  }

  /** `tint` washes the panorama with a biome colour, `light` (0..1) darkens it for night. */
  set(tint: string, light: number): void {
    const c = Color3.FromHexString(tint);
    const k = 0.08 + 0.92 * light;
    // StandardMaterial adds the emissive colour to the emissive texture, so the texture level does the dimming
    // and the colour only adds a gentle biome-coloured haze.
    (this.material.emissiveTexture as { level: number }).level = 0.95 * k;
    this.material.emissiveColor = new Color3(c.r * 0.08 * k, c.g * 0.08 * k, c.b * 0.08 * k);
  }

  setVisible(visible: boolean): void {
    this.mesh.setEnabled(visible);
  }
}
