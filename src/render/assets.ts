import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { Scene } from "@babylonjs/core/scene";

import { activePackId, classicRoot, packBrings, resolveAsset } from "../assets/pack";

/** The URL of a file below `assets/`, in the version being played (the pack's own file when it brings one, else Classic's: `assets/pack.ts`). */
export function assetUrl(path: string): string {
  return resolveAsset(path);
}

export interface StaticModelInfo {
  file: string;
  tris: number;
  bytes: number;
  bounds: [number, number, number, number, number, number];
  animations: string[];
  /** Top of the slab a tile model stands on (model units). */
  groundTop: number;
  /** Height of the upward facing plane with the most area (the face of a floor tile, below the tips of its engravings in `bounds`). Absent in old registries. */
  surface?: number;
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
      // (a pack that brings its own `tex/X` brings `hd/tex/X` too, or Classic's high picture would show under the new one: the pack file test checks it, this is the net)
      const high = textureQuality === "high" && path.startsWith("tex/") && (!packBrings(path) || packBrings(`hd/${path}`));
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

/**
 * A register that a pack adds to instead of replacing (the model registries): Classic's file, then the pack's own entries over it (`{ ...classic, ...pack }`). A pack's file holds
 * only the models that differ or are new; without a pack file it is Classic's alone.
 */
export async function fetchMergedJson<T extends object>(path: string): Promise<T> {
  const res = await fetch(`${classicRoot()}${path}`);
  if (!res.ok) throw new Error(`could not load ${path}: ${res.status}`);
  const base = (await res.json()) as T;
  if (!packBrings(path)) return base;
  const own = await fetch(resolveAsset(path));
  if (!own.ok) throw new Error(`could not load ${path} of the version ${activePackId()}: ${own.status}`);
  return { ...base, ...((await own.json()) as T) };
}

export async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(assetUrl(path));
  if (!res.ok) throw new Error(`could not load ${path}: ${res.status}`);
  return (await res.json()) as T;
}
