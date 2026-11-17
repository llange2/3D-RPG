import { Constants } from "@babylonjs/core/Engines/constants";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { Scene } from "@babylonjs/core/scene";
import { assetUrl } from "./assets";

/**
 * `add`: the picture is added to what is behind it (glows, pale water: they shine in the dark and in the sun, but add up to white on a bright sky). `combine`: it covers what is behind it by
 * its alpha (the impacts of the spells: in daylight the burst keeps its colour, acid stays green; the blue water of a fountain and its drops, smoke).
 */
export type Blend = "add" | "combine";

/** The material of an effect picture: unlit, the picture is the colour and its alpha the strength, the vertex colour tints and fades, no depth write, a z offset so that it lies over what it sits on. */
export function additiveMaterial(scene: Scene, name: string, texture: Texture, blend: Blend = "add"): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.disableLighting = true;
  m.diffuseColor = Color3.Black();
  m.specularColor = Color3.Black();
  // the colour is in the picture and the alpha is its intensity: SRC_ALPHA + ONE adds colour x alpha (as the glow lines do), the vertex colour tints and fades
  m.emissiveTexture = texture;
  m.opacityTexture = texture;
  m.alphaMode = blend === "add" ? Constants.ALPHA_ADD : Constants.ALPHA_COMBINE;
  m.backFaceCulling = false;
  m.disableDepthWrite = true;
  m.fogEnabled = false;
  m.zOffset = -2;
  return m;
}

export function sheetTexture(scene: Scene, file: string, wrap: boolean): Texture {
  const t = new Texture(assetUrl(file), scene, false, true, Constants.TEXTURE_TRILINEAR_SAMPLINGMODE);
  t.hasAlpha = true;
  const mode = wrap ? Constants.TEXTURE_WRAP_ADDRESSMODE : Constants.TEXTURE_CLAMP_ADDRESSMODE;
  t.wrapU = mode;
  t.wrapV = mode;
  t.anisotropicFilteringLevel = 2;
  return t;
}
