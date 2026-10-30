import { Color3 } from "@babylonjs/core/Maths/math.color";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Scene } from "@babylonjs/core/scene";
import type { TextureCache } from "./assets";
import { groundTexture } from "./flatGround";

/** Depth bias of the painted tiles that lie a hair above a floor quad of the same cell (campaign maps), so the quad never shows through. */
export const FLAT_Z_OFFSET = -2;

/**
 * A painted ground tile of the flat mode (`flat:<name>`, file `terrain/flat/<name>.webp`, see `data/flatTerrain.ts`). The picture is drawn
 * once over its quad, and its neighbours are meant to meet it exactly at the border, so it is clamped (wrapping would blend the opposite
 * edge in) and not tinted or shaded. Lava glows by itself, as the 3D mode's lava does.
 */
export function flatTileMaterial(scene: Scene, textures: TextureCache, name: string, zOffset = 0): StandardMaterial {
  const m = new StandardMaterial(`terrain:flat:${name}`, scene);
  const texture = textures.get(`terrain/flat/${name}.webp`, { wrap: false });
  m.diffuseTexture = texture;
  m.specularColor = Color3.Black();
  m.zOffset = zOffset;
  if (name.split("_").includes("lava")) {
    m.emissiveTexture = texture;
    m.emissiveColor = new Color3(0.45, 0.45, 0.45);
  }
  return m;
}

/** Terrain materials of the overworld, shared by every chunk. */
export class TerrainMaterials {
  private readonly materials = new Map<string, StandardMaterial>();
  /**
   * The water texture is one shared object (`TextureCache`): the overworld's water and shallows and the water cells of the
   * campaign maps all show it, so it scrolls once, here, and nobody changes its scale. The scale is part of each mesh's
   * UVs instead (`WATER_UV_SCALE` in terrainMesher, `WATER_CELL_UV` in interiorMesher); a scale set on the texture by one
   * user changed it for all the others, and every material that registered it made it scroll faster.
   */
  private waterTextures: { uOffset: number; vOffset: number }[];

  constructor(
    private readonly scene: Scene,
    private readonly textures: TextureCache,
  ) {
    this.waterTextures = [this.textures.get("tex/tex_water.webp") as unknown as { uOffset: number; vOffset: number }];
  }

  get(key: string): StandardMaterial {
    let m = this.materials.get(key);
    if (!m) {
      m = this.create(key);
      this.materials.set(key, m);
    }
    return m;
  }

  private ground(key: string, file: string, tint = Color3.White()): StandardMaterial {
    const m = new StandardMaterial(`terrain:${key}`, this.scene);
    m.diffuseTexture = this.textures.get(`${groundTexture(`terrain/${file}`)}.webp`);
    m.diffuseColor = tint;
    m.specularColor = Color3.Black();
    return m;
  }

  private create(key: string): StandardMaterial {
    if (key.startsWith("flat:")) return flatTileMaterial(this.scene, this.textures, key.slice(5));
    switch (key) {
      case "water":
      case "shallow": {
        const m = new StandardMaterial(`terrain:${key}`, this.scene);
        m.diffuseTexture = this.textures.get("tex/tex_water.webp");
        // shallows have the deep water's colour (a lighter tint showed the border between them as a seam in the lake)
        m.diffuseColor = new Color3(0.55, 0.72, 0.95);
        m.specularColor = new Color3(0.25, 0.28, 0.3);
        m.specularPower = 40;
        return m;
      }
      case "lava": {
        const m = new StandardMaterial("terrain:lava", this.scene);
        m.diffuseTexture = this.textures.get("tex/tex_lava.webp");
        m.emissiveColor = new Color3(0.9, 0.35, 0.1);
        m.specularColor = Color3.Black();
        return m;
      }
      case "snow":
        return this.ground(key, "snow", new Color3(0.97, 0.98, 1));
      case "desert":
        return this.ground(key, "desert");
      case "rock":
        return this.ground(key, "rock");
      case "lava_ground":
        return this.ground(key, "lava_ground");
      case "road":
        return this.ground(key, "road");
      case "cobble":
        return this.ground(key, "cobble");
      default:
        return this.ground(key, key); // meadow, forest, swamp
    }
  }

  /** Slowly scrolls the water texture. Call once per frame with the elapsed seconds. */
  animate(dt: number): void {
    for (const t of this.waterTextures) {
      t.uOffset = (t.uOffset + dt * 0.012) % 1;
      t.vOffset = (t.vOffset + dt * 0.007) % 1;
    }
  }
}
