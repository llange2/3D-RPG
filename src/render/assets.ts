import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { Scene } from "@babylonjs/core/scene";

export const ASSET_ROOT = `${import.meta.env.BASE_URL}assets/`;

export function assetUrl(path: string): string {
  return `${ASSET_ROOT}${path}`;
}

export interface StaticModelInfo {
  file: string;
  tris: number;
  bytes: number;
  bounds: [number, number, number, number, number, number];
  animations: string[];
  /** Top of the slab a tile model stands on (model units). */
  groundTop: number;
  /** Converted from OBJ: faces must be flipped at load time. */
  fromObj: boolean;
  /** Mean brightness of the colour texture, 0 to 1 (what `textureBoost` brings to a common level). Absent for animated models and old registries. */
  mean?: number;
}

export interface MonsterModelInfo extends StaticModelInfo {
  animated: boolean;
  scale: number;
  y: number;
}

/** Shared texture cache. Textures live as long as the scene. */
export class TextureCache {
  private readonly cache = new Map<string, Texture>();
  constructor(private readonly scene: Scene) {}

  get(path: string, options: { wrap?: boolean; anisotropy?: number; mipmaps?: boolean } = {}): Texture {
    const key = `${path}|${options.wrap ?? true}`;
    let tex = this.cache.get(key);
    if (!tex) {
      tex = new Texture(assetUrl(path), this.scene, !(options.mipmaps ?? true), true, Texture.TRILINEAR_SAMPLINGMODE);
      tex.anisotropicFilteringLevel = options.anisotropy ?? 4;
      if (!(options.wrap ?? true)) {
        tex.wrapU = Texture.CLAMP_ADDRESSMODE;
        tex.wrapV = Texture.CLAMP_ADDRESSMODE;
      }
      this.cache.set(key, tex);
    }
    return tex;
  }

  /** Waits until every texture requested so far has been decoded. */
  async ready(): Promise<void> {
    await Promise.all([...this.cache.values()].map((t) => new Promise<void>((resolve) => (t.isReady() ? resolve() : t.onLoadObservable.addOnce(() => resolve())))));
  }
}

export async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(assetUrl(path));
  if (!res.ok) throw new Error(`could not load ${path}: ${res.status}`);
  return (await res.json()) as T;
}
