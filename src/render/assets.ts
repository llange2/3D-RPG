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

/**
 * "Textures: high" (36th playtest): the world textures come from `hd/tex/` (up to 1024 px, `npm run assets:hd`) instead of `tex/` (512 px). Chosen once at start-up from the
 * settings; switching it in the menu reloads the page, because the cache keeps its textures for the whole session.
 */
export type TextureQuality = "normal" | "high";
let textureQuality: TextureQuality = "normal";
export function setTextureQuality(quality: TextureQuality): void {
  textureQuality = quality;
}

/** Shared texture cache. Textures live as long as the scene. */
export class TextureCache {
  private readonly cache = new Map<string, Texture>();
  constructor(private readonly scene: Scene) {}

  get(path: string, options: { wrap?: boolean; anisotropy?: number; mipmaps?: boolean } = {}): Texture {
    const key = `${path}|${options.wrap ?? true}`;
    let tex = this.cache.get(key);
    if (!tex) {
      // a high texture that was not built falls back to the normal one
      const high = textureQuality === "high" && path.startsWith("tex/");
      const created: Texture = new Texture(assetUrl(high ? `hd/${path}` : path), this.scene, !(options.mipmaps ?? true), true, Texture.TRILINEAR_SAMPLINGMODE, null, high ? () => created.updateURL(assetUrl(path)) : null);
      tex = created;
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
