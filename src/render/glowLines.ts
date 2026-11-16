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
import { glowPixels, haloPixels, PULSE_LENGTH, RIBBON_WIDTH, ribbonAlong, waypointsToPath } from "./glowLineGeometry";

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

/** A soft glow around a shining crystal that always faces the eye (`GlowLines.show`): `size` is its width in world units. */
export interface Halo {
  x: number;
  y: number;
  z: number;
  color: string;
  size: number;
}

/** Depth offset of a halo: it hangs in front of the wall the crystal sticks out of, and a plane that big would be cut by it. */
const HALO_Z_OFFSET = -40;
const HALO_TEXTURE = 128;

interface Shown {
  mesh: Mesh;
  /** The upright sheet that crosses the flat ribbon (`show` with `upright`): it shares the material and the picture. */
  sheet?: Mesh;
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
  private halos: { mesh: Mesh; material: StandardMaterial; texture: RawTexture }[] = [];
  private observer: Observer<Scene> | null = null;
  private started = 0;

  constructor(private readonly scene: Scene) {}

  /**
   * `lift`: the height of the lines over the floor (the showcase lies them on it, the crystals of quest_8 shine at the height of the crystals). `upright`: every line is a cross of a flat ribbon and
   * an upright sheet, so that it shows from the eye's height as well (a flat ribbon at the height of the eyes is seen edge-on).
   */
  show(lines: readonly LightLine[], lift = LIFT, upright = false, halos: readonly Halo[] = []): void {
    this.dispose();
    this.shown = lines.map((line, i) => this.build(line, i, lift, upright));
    this.buildHalos(halos);
    if (this.shown.length === 0) return;
    this.started = performance.now();
    this.observer = this.scene.onBeforeRenderObservable.add(() => {
      // the picture is one pulse long: moving its origin back by the way travelled makes the pulses run in the direction the line was drawn
      const travelled = (((performance.now() - this.started) / 1000) * FLOW_SPEED) / PULSE_LENGTH;
      const offset = -(travelled % 1);
      for (const s of this.shown) s.texture.uOffset = offset;
    });
  }

  /** One billboard per halo; the halos of one colour share a picture and a material. */
  private buildHalos(halos: readonly Halo[]): void {
    const byColor = new Map<string, { material: StandardMaterial; texture: RawTexture }>();
    halos.forEach((halo, i) => {
      let shared = byColor.get(halo.color);
      if (!shared) {
        const texture = RawTexture.CreateRGBATexture(haloPixels(HALO_TEXTURE, rgbOf(halo.color)), HALO_TEXTURE, HALO_TEXTURE, this.scene, true, false, Constants.TEXTURE_TRILINEAR_SAMPLINGMODE);
        texture.name = `glow-halo:${halo.color}`;
        texture.hasAlpha = true;
        texture.wrapU = Constants.TEXTURE_CLAMP_ADDRESSMODE;
        texture.wrapV = Constants.TEXTURE_CLAMP_ADDRESSMODE;
        const material = new StandardMaterial(`glow-halo:${halo.color}`, this.scene);
        material.disableLighting = true;
        material.diffuseColor = Color3.Black();
        material.specularColor = Color3.Black();
        material.emissiveTexture = texture;
        material.opacityTexture = texture;
        material.alphaMode = Constants.ALPHA_ADD;
        material.backFaceCulling = false;
        material.disableDepthWrite = true;
        material.zOffset = HALO_Z_OFFSET;
        shared = { material, texture };
        byColor.set(halo.color, shared);
      }
      const mesh = new Mesh(`glow-halo:${i}`, this.scene);
      const data = new VertexData();
      data.positions = [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0];
      data.normals = [0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1];
      data.uvs = [0, 1, 1, 1, 1, 0, 0, 0];
      data.indices = [0, 1, 2, 0, 2, 3];
      data.applyToMesh(mesh, false);
      mesh.billboardMode = Mesh.BILLBOARDMODE_ALL;
      mesh.position.set(halo.x, halo.y, halo.z);
      mesh.scaling.setAll(halo.size);
      mesh.material = shared.material;
      mesh.isPickable = false;
      mesh.alphaIndex = 10;
      this.halos.push({ mesh, material: shared.material, texture: shared.texture });
    });
  }

  private build(line: LightLine, index: number, lift: number, upright: boolean): Shown {
    const path = waypointsToPath(line.points, cellCenterX, cellCenterZ);
    const meshOf = (ribbon: ReturnType<typeof ribbonAlong>, name: string): Mesh => {
      const mesh = new Mesh(name, this.scene);
      const data = new VertexData();
      data.positions = ribbon.positions;
      data.normals = ribbon.normals;
      data.uvs = ribbon.uvs;
      data.indices = ribbon.indices;
      data.applyToMesh(mesh, false);
      mesh.isPickable = false;
      return mesh;
    };
    const mesh = meshOf(ribbonAlong(path, RIBBON_WIDTH, lift), `glow-line:${index}`);
    const sheet = upright ? meshOf(ribbonAlong(path, RIBBON_WIDTH, lift, PULSE_LENGTH, true), `glow-line:${index}:sheet`) : undefined;

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
    if (sheet) {
      sheet.material = m;
      sheet.alphaIndex = 10;
    }
    return { mesh, ...(sheet ? { sheet } : {}), texture };
  }

  dispose(): void {
    if (this.observer) this.scene.onBeforeRenderObservable.remove(this.observer);
    this.observer = null;
    for (const s of this.shown) {
      // material and picture are the line's own: dispose them with it
      s.sheet?.dispose(false, false);
      s.mesh.dispose(false, true);
      s.texture.dispose();
    }
    this.shown = [];
    const done = new Set<unknown>();
    for (const h of this.halos) {
      h.mesh.dispose(false, false);
      // (material and picture are shared by the halos of one colour)
      if (!done.has(h.material)) {
        done.add(h.material);
        h.material.dispose();
        h.texture.dispose();
      }
    }
    this.halos = [];
  }
}
