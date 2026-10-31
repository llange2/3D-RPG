import { flipWinding } from "./winding";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import type { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Scene } from "@babylonjs/core/scene";
import "@babylonjs/loaders/glTF";
import { QUEST_PROP } from "../data/quest-table";
import { assetUrl, type StaticModelInfo } from "./assets";
import { createProceduralModels } from "./proceduralProps";
import type { PropInstance } from "./terrainMesher";

interface InstancedModel {
  meshes: Mesh[];
  /** Height of the model's base in model units: the slab top for tile models, the lowest point otherwise. */
  base: number;
  /** Extra sink so that slabs do not fight with the terrain surface (world units). */
  sink: number;
  /** Middle of the bounding box in x and z (model units), for models placed by their centre. */
  centre: [number, number];
  /** instance matrices per owner (chunk key), concatenated on flush */
  buffers: Map<string, Float32Array>;
  dirty: boolean;
}

/**
 * The brightness the colour texture of a model is brought to (mean luma, 0 to 1). The old textures are painted dark: a fountain
 * averages 0.26, a chest 0.16, and the old game lit them to about 0.5 (the fountain of the town square in screenshot 15 is
 * 156/124/80 where its texture is 70/67/52). Bright textures (houses, grass, the ground tiles) need nothing.
 */
const TARGET_BRIGHTNESS = 0.5;
const MAX_BOOST = 4;

/**
 * Factor on the colour texture. The models are loaded with their textures as stored (`useSRGBBuffers: false`, see `load`), like
 * the flat textures of the terrain and the walls, which is how the old game lit them: texture times light, no gamma. (The first
 * versions let the GPU decode them from sRGB without encoding the result again: every texture came out squared, dark ones
 * black, and one boost per kind of model papered over it for the average texture of the kind.)
 */
export function textureBoost(key: string, info?: { mean?: number }): number {
  // effects glow, whatever their texture
  if (key.startsWith("proj_")) return 1.2;
  // the dungeon floor atlas (the old model of the floor): one island per stone with black padding between, so it renders darker than a flat texture
  if (key === "blk_floor") return FLOOR_BOOST;
  const mean = info?.mean;
  if (mean === undefined || mean <= 0) return 1.2;
  return Math.max(1, Math.min(MAX_BOOST, TARGET_BRIGHTNESS / mean));
}

/**
 * Under the torch (underground, at night) an object is lit like the walls next to it: the same factor on its texture, so that a door
 * or a chest is neither brighter nor darker than its surroundings. The factor above brings the dark paint up to what the old game's
 * daylight showed (the fountain), which in the dungeon made a door glow among its walls.
 */
const DARK_LEVEL = 1.1;
/** The lowest level a texture may be brought to when it is brighter than the walls it stands in (a fortress frame in a dungeon). */
const MIN_DARK_LEVEL = 0.3;

/** Models that keep one level in every light: the 3D floor was calibrated under the torch, effects are unlit. */
const FIXED_LEVEL = (key: string): boolean => key === "blk_floor" || key.startsWith("proj_") || key === "ci_92" || QUEST_MODELS.has(key);

/**
 * The models of the quest keys and key cards. They are drawn unlit: under the torch a key was a dark speck above its golden glow (`GOLD_LAMP`),
 * and its colour (which key it is) could not be told from three cells away.
 */
const QUEST_GLOW = 1.5;
const QUEST_MODELS: ReadonlySet<string> = new Set(Object.values(QUEST_PROP).map((item) => `ci_${item}`));

/** The 3D dungeon floor as bright as the flat one at the same torch distance (measured: at 3 it came out 1.75 times brighter). */
const FLOOR_BOOST = 1.7;

/** How much of its own texture the town portal gives off, on top of the light that falls on it. */
const PORTAL_SHINE = 0.45;

/** Opacity of the see-through attack effects (the old game gave the fireball 0.7 and the poison cloud 0.3). */
const PROJECTILE_ALPHA: Record<string, number> = { proj_fire: 0.85, proj_poison: 0.6 };

/** Replaces the glTF PBR material by a cheap StandardMaterial with the same colour texture. */
export function toStandardMaterial(mat: PBRMaterial | StandardMaterial, scene: Scene, boost = 1): StandardMaterial {
  if (mat instanceof StandardMaterial) return mat;
  const std = new StandardMaterial(mat.name, scene);
  std.diffuseTexture = mat.albedoTexture;
  if (std.diffuseTexture) std.diffuseTexture.level = boost;
  std.diffuseColor = mat.albedoColor ?? Color3.White();
  std.specularColor = Color3.Black();
  std.backFaceCulling = mat.backFaceCulling;
  return std;
}

/**
 * Draws props with thin instances: one draw call per model and mesh for all chunks together. Chunks hand in their
 * instance lists; `flush` rebuilds the GPU buffers of the models that changed (once per frame at most).
 */
export class PropRenderer {
  private readonly models = new Map<string, InstancedModel>();
  private readonly containers: AssetContainer[] = [];

  /** The colour textures whose level follows the light, with their level in daylight. */
  private readonly exposed: { texture: BaseTexture; day: number; mean?: number }[] = [];
  private daylight = 1;
  /**
   * Brightness of the walls around the party under its own light (mean luma of the wall texture times the tint of the place), or null
   * outside a generated interior. A door, gate or chest is painted brighter than the wall next to it (a dungeon door 0.20 against
   * 0.16, and the wall is also tinted by the ambient colour), so under the torch it came out up to twice as bright: with a reference each
   * texture is only lifted to what the walls show.
   */
  private reference: number | null = null;

  constructor(private readonly scene: Scene) {}

  /** `day` from 0 (only the party's light) to 1 (daylight): the level of each texture between `DARK_LEVEL` and its daylight boost. */
  setDaylight(day: number): void {
    const d = Math.max(0, Math.min(1, day));
    if (Math.abs(d - this.daylight) < 0.02) return;
    this.daylight = d;
    for (const e of this.exposed) e.texture.level = this.levelOf(e.day, e.mean);
  }

  /** The brightness of the walls the objects stand among (`reference`), or null where there is no such thing. */
  setReference(brightness: number | null): void {
    if (this.reference === brightness) return;
    this.reference = brightness;
    for (const e of this.exposed) e.texture.level = this.levelOf(e.day, e.mean);
  }

  private levelOf(day: number, mean?: number): number {
    const cap = this.reference !== null && mean ? Math.max(MIN_DARK_LEVEL, Math.min(DARK_LEVEL, this.reference / mean)) : DARK_LEVEL;
    const dark = Math.min(day, cap);
    return dark + (day - dark) * this.daylight;
  }

  /** `progress` is told the share that has arrived (0 to 1) after every model, for the start message. */
  async preload(infos: Record<string, StaticModelInfo>, keys: string[], progress?: (share: number) => void): Promise<void> {
    this.addProcedural();
    let done = 0;
    await Promise.all(keys.map((key) => this.load(key, infos[key]).then(() => progress?.(++done / keys.length))));
  }

  private addProcedural(): void {
    for (const { key, mesh } of createProceduralModels(this.scene)) {
      mesh.thinInstanceSetBuffer("matrix", new Float32Array(0), 16, true);
      mesh.alwaysSelectAsActiveMesh = false;
      mesh.setEnabled(false);
      this.models.set(key, { meshes: [mesh], base: 0, sink: 0, centre: [0, 0], buffers: new Map(), dirty: false });
    }
  }

  private async load(key: string, info: StaticModelInfo | undefined): Promise<void> {
    if (!info) {
      console.warn(`prop model ${key} is not in the asset registry`);
      return;
    }
    // createInstances: false gives every node its own Mesh, which can be baked and thin-instanced
    const container = await LoadAssetContainerAsync(assetUrl(info.file), this.scene, { pluginOptions: { gltf: { createInstances: false, useSRGBBuffers: false } } });
    container.addAllToScene();
    this.containers.push(container);
    const boost = textureBoost(key, info);
    const meshes: Mesh[] = [];
    for (const m of container.meshes as AbstractMesh[]) {
      if (m.getTotalVertices() === 0) continue;
      const mesh = m as Mesh;
      if (typeof mesh.bakeCurrentTransformIntoVertices !== "function") throw new Error(`prop ${key}: unexpected mesh class ${m.getClassName()}`);
      mesh.computeWorldMatrix(true);
      mesh.setParent(null);
      mesh.bakeCurrentTransformIntoVertices(); // thin instances replace the world matrix, so the glTF root flip is baked in
      if (info.fromObj) flipWinding(mesh);
      if (mesh.material) {
        const std = toStandardMaterial(mesh.material as PBRMaterial | StandardMaterial, this.scene, boost);
        // models converted from OBJ have patches that face inward (the simplifier and the old authoring tools do not care):
        // showing both sides keeps those from vanishing. They are not lit from both sides (`twoSidedLighting`): after `flipWinding`
        // the outer faces count as back faces, so that lit the model with its normals turned around, which under a point light
        // (the party's torch, the Light spell) left chests, the dungeon entrance and every campaign decoration black. Daylight
        // does not show it, the hemisphere light has the same colour on both sides.
        if (info.fromObj) std.backFaceCulling = false;
        // attack effects glow: the old game drew them with an unlit shader, and in a torch-lit dungeon they would fade out
        // a few tiles away from the party otherwise
        if (key.startsWith("proj_")) {
          std.disableLighting = true;
          std.emissiveColor = Color3.White();
          const alpha = PROJECTILE_ALPHA[key];
          if (alpha !== undefined) std.alpha = alpha;
        }
        // the acid puddle is a lumpy blob whose simplified normals point every which way, so it came out nearly black under the
        // torch although its texture is bright green; the old game drew it with the unlit shader anyway
        if (key === "ci_92") {
          std.disableLighting = true;
          std.emissiveColor = Color3.White();
          // the boost above is for lit surfaces; unlit, the texture shows as painted
          if (std.diffuseTexture) std.diffuseTexture.level = 1;
        }
        if (QUEST_MODELS.has(key)) {
          std.disableLighting = true;
          if (std.diffuseTexture) {
            std.emissiveColor = Color3.White();
            std.diffuseTexture.level = QUEST_GLOW; // a little over the painted colour: the dark keys (blue, black) must still read from three cells away
          } else std.emissiveColor = std.diffuseColor; // a model painted by its material colour, not by a texture
        }
        // the town portal (item 3) glows from within (36th playtest, point 16): its blue light reached three cells, but the stone of the frame stayed dark. The painted
        // texture also shines on its own, so it reads from afar and under the torch alike
        if (key === "ci_3" && std.diffuseTexture) {
          std.emissiveTexture = std.diffuseTexture;
          std.emissiveColor = new Color3(PORTAL_SHINE, PORTAL_SHINE, PORTAL_SHINE);
        }
        mesh.material = std;
        // the strip of the town's columns (720 x 5360) is drawn twice as wide as the column is round: squeezed to half its width (the user's wish)
        if (key === "blk_pillars_city" && std.diffuseTexture) (std.diffuseTexture as Texture).uScale = 2;
        const texture = std.diffuseTexture;
        if (texture && !FIXED_LEVEL(key) && !this.exposed.some((e) => e.texture === texture)) {
          this.exposed.push({ texture, day: texture.level, mean: info.mean });
          texture.level = this.levelOf(texture.level, info.mean);
        }
      }
      mesh.isPickable = false;
      mesh.alwaysSelectAsActiveMesh = false;
      mesh.thinInstanceSetBuffer("matrix", new Float32Array(0), 16, true);
      mesh.setEnabled(false);
      meshes.push(mesh);
    }
    for (const node of container.transformNodes) node.setEnabled(false);
    const tileModel = key.startsWith("veg_") || key.startsWith("mtn_") || key.startsWith("gnd");
    const [minX, , minZ, maxX, , maxZ] = info.bounds;
    this.models.set(key, {
      meshes,
      base: tileModel ? info.groundTop : info.bounds[1],
      // the reduced ground tiles are sunk so that only their lumps show over the flat ground; the full ones (ultra) bring their own ground and lie on top of it, or the flat quad would hide it
      sink: key.startsWith("gndx_") ? -0.03 : tileModel ? 0.04 : 0.02,
      centre: [(minX + maxX) / 2, (minZ + maxZ) / 2],
      buffers: new Map(),
      dirty: false,
    });
  }

  /**
   * Loads the models that are not loaded yet (interior objects are fetched when the first interior opens).
   * `progress` is told the share that has arrived (0 to 1) after every model, for the loading screen.
   */
  async ensure(infos: Record<string, StaticModelInfo>, keys: string[], progress?: (share: number) => void): Promise<void> {
    const missing = keys.filter((k) => !this.models.has(k) && infos[k]);
    let done = 0;
    await Promise.all(
      missing.map((k) =>
        this.load(k, infos[k]).then(() => {
          progress?.(++done / missing.length);
        }),
      ),
    );
  }

  has(key: string): boolean {
    return this.models.has(key);
  }

  /** Replaces the instances of one owner (a chunk). */
  setInstances(owner: string, props: PropInstance[]): void {
    const byModel = new Map<string, PropInstance[]>();
    for (const p of props) {
      if (!this.models.has(p.model)) continue;
      let list = byModel.get(p.model);
      if (!list) byModel.set(p.model, (list = []));
      list.push(p);
    }
    const m = new Matrix();
    for (const [key, model] of this.models) {
      const list = byModel.get(key);
      if (!list) {
        if (model.buffers.delete(owner)) model.dirty = true;
        continue;
      }
      const buf = new Float32Array(list.length * 16);
      list.forEach((p, i) => {
        let x = p.x;
        let z = p.z;
        if (p.center) {
          // shift by the rotated offset of the model's middle so that the middle ends up at (p.x, p.z)
          const ox = -model.centre[0] * p.scale;
          const oz = -model.centre[1] * p.scale;
          const c = Math.cos(p.rotY);
          const s = Math.sin(p.rotY);
          x += ox * c + oz * s;
          z += -ox * s + oz * c;
        }
        const [sx, sy, sz] = p.scaleXYZ ?? [p.scale, p.scale, p.scale];
        // yaw, pitch and roll are applied as roll first, then pitch, then yaw: the order of the old engine's rotation=(pitch, yaw, roll)
        const lift = p.atOrigin ? 0 : model.base * sy + model.sink;
        Matrix.ComposeToRef(new Vector3(sx, sy, sz), Quaternion.RotationYawPitchRoll(p.rotY, p.rotX ?? 0, p.rotZ ?? 0), new Vector3(x, p.y - lift, z), m);
        m.copyToArray(buf, i * 16);
      });
      model.buffers.set(owner, buf);
      model.dirty = true;
    }
  }

  removeOwner(owner: string): void {
    for (const model of this.models.values()) {
      if (model.buffers.delete(owner)) model.dirty = true;
    }
  }

  /** Pushes changed instance data to the GPU. */
  flush(): void {
    for (const model of this.models.values()) {
      if (!model.dirty) continue;
      model.dirty = false;
      let total = 0;
      for (const b of model.buffers.values()) total += b.length;
      const all = new Float32Array(total);
      let at = 0;
      for (const b of model.buffers.values()) {
        all.set(b, at);
        at += b.length;
      }
      for (const mesh of model.meshes) {
        mesh.thinInstanceSetBuffer("matrix", all, 16, true);
        mesh.thinInstanceRefreshBoundingInfo(true);
        mesh.setEnabled(total > 0);
      }
    }
  }

  /** Number of instances, for the debug overlay. */
  instanceCount(): number {
    let n = 0;
    for (const model of this.models.values()) for (const b of model.buffers.values()) n += b.length / 16;
    return n;
  }

  dispose(): void {
    for (const c of this.containers) c.dispose();
  }
}
