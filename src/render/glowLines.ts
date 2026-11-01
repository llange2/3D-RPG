import type { Observer } from "@babylonjs/core/Misc/observable";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Constants } from "@babylonjs/core/Engines/constants";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import type { Scene } from "@babylonjs/core/scene";
import type { LightLine } from "../interiors/types";
import { cellCenterX, cellCenterZ } from "./interiorMesher";
import { glowPixels, PULSE_LENGTH, RIBBON_WIDTH, ribbonAlong, waypointsToPath } from "./glowLineGeometry";

/** Height above the floor (the floor model's cobbles stand a few hundredths up) and the depth offset that keeps the ribbon in front of the floor. */
const LIFT = 0.06;
const Z_OFFSET = -4;
/** How fast the pulses run, in world units a second (about a cell a second: a walking pace). */
const FLOW_SPEED = 3;
const TEXTURE = { width: 256, height: 64 };

const rgbOf = (hex: string): [number, number, number] => {
  const c = Color3.FromHexString(hex);
  return [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255)];
};

interface Shown {
  mesh: Mesh;
  texture: RawTexture;
}

/**
 * Straight lines of light over the floor with a coloured glow, along which pulses run (`LightLine`). A line is one flat ribbon with an own material: the picture
 * (`glowPixels`) holds the colour and a soft cross-section, additive blending makes it shine on any floor, and the pulses are the texture scrolling along the
 * ribbon. There is no glow pass and no light of the lamp pool: the glow lives in the picture, the fog and `SightLimit` act on the ribbon like on any material.
 * The texture of a line is its own (not the shared kind of `TextureCache`), so scrolling it harms nobody.
 */
export class GlowLines {
  private shown: Shown[] = [];
  private observer: Observer<Scene> | null = null;
  private started = 0;

  constructor(private readonly scene: Scene) {}

  show(lines: readonly LightLine[]): void {
    this.dispose();
    this.shown = lines.map((line, i) => this.build(line, i));
    if (this.shown.length === 0) return;
    this.started = performance.now();
    this.observer = this.scene.onBeforeRenderObservable.add(() => {
      // the picture is one pulse long: moving its origin back by the way travelled makes the pulses run in the direction the line was drawn
      const travelled = (((performance.now() - this.started) / 1000) * FLOW_SPEED) / PULSE_LENGTH;
      const offset = -(travelled % 1);
      for (const s of this.shown) s.texture.uOffset = offset;
    });
  }

  private build(line: LightLine, index: number): Shown {
    const path = waypointsToPath(line.points, cellCenterX, cellCenterZ);
    const ribbon = ribbonAlong(path, RIBBON_WIDTH, LIFT);
    const mesh = new Mesh(`glow-line:${index}`, this.scene);
    const data = new VertexData();
    data.positions = ribbon.positions;
    data.normals = ribbon.normals;
    data.uvs = ribbon.uvs;
    data.indices = ribbon.indices;
    data.applyToMesh(mesh, false);
    mesh.isPickable = false;

    const texture = RawTexture.CreateRGBATexture(glowPixels(TEXTURE.width, TEXTURE.height, rgbOf(line.color)), TEXTURE.width, TEXTURE.height, this.scene, true, false, Constants.TEXTURE_TRILINEAR_SAMPLINGMODE);
    texture.name = `glow-line:${index}`;
    texture.hasAlpha = true;
    texture.wrapU = Constants.TEXTURE_WRAP_ADDRESSMODE;
    texture.wrapV = Constants.TEXTURE_CLAMP_ADDRESSMODE;

    // the colour is in the picture: an emissive colour would be added to it, not multiplied
    const m = new StandardMaterial(`glow-line:${index}`, this.scene);
    m.disableLighting = true;
    m.diffuseColor = Color3.Black();
    m.specularColor = Color3.Black();
    m.emissiveTexture = texture;
    m.opacityTexture = texture;
    m.alphaMode = Constants.ALPHA_ADD;
    m.backFaceCulling = false;
    m.disableDepthWrite = true;
    m.zOffset = Z_OFFSET;
    mesh.material = m;
    // drawn after the opaque things, so that nothing hides the glow it lies on
    mesh.alphaIndex = 10;
    return { mesh, texture };
  }

  dispose(): void {
    if (this.observer) this.scene.onBeforeRenderObservable.remove(this.observer);
    this.observer = null;
    for (const s of this.shown) {
      // material and picture are the line's own: dispose them with it
      s.mesh.dispose(false, true);
      s.texture.dispose();
    }
    this.shown = [];
  }
}
