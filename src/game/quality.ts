/**
 * The "Quality" slider of Options > Graphics (37th playtest): Low, Medium and High set five switches at once; a combination that is none of the three is
 * "Custom". The slider is only a view on the switches, nothing but the switches is stored.
 */
import type { TextureQuality } from "../render/assets";
import type { Resolution, ViewDistance } from "../render/engine";

export type QualityLevel = "low" | "medium" | "high" | "custom";

/** The five settings the slider sets. */
export interface QualityParts {
  /** The 3D ground models (true) or the flat painted tiles. */
  floorModel: boolean;
  textureQuality: TextureQuality;
  viewDistance: ViewDistance;
  resolution: Resolution;
  /** The moving pictures of the town services. */
  animatedTown: boolean;
}

/** The slider's positions from left to right. */
export const QUALITY_LEVELS: readonly QualityLevel[] = ["low", "medium", "high", "custom"];

export const QUALITY_NAMES: Record<QualityLevel, string> = { low: "Low", medium: "Medium", high: "High", custom: "Custom" };

export const QUALITY_PRESETS: Record<Exclude<QualityLevel, "custom">, QualityParts> = {
  low: { floorModel: false, textureQuality: "normal", viewDistance: "close", resolution: "low", animatedTown: false },
  medium: { floorModel: false, textureQuality: "normal", viewDistance: "medium", resolution: "normal", animatedTown: true },
  high: { floorModel: true, textureQuality: "high", viewDistance: "far", resolution: "normal", animatedTown: true },
};

/** The level whose preset the settings equal, else "custom". */
export function qualityOf(s: QualityParts): QualityLevel {
  for (const level of ["low", "medium", "high"] as const) {
    const p = QUALITY_PRESETS[level];
    if (p.floorModel === s.floorModel && p.textureQuality === s.textureQuality && p.viewDistance === s.viewDistance && p.resolution === s.resolution && p.animatedTown === s.animatedTown) return level;
  }
  return "custom";
}

/** The five settings of a level; "custom" keeps what is there. */
export function applyQuality(level: QualityLevel, current: QualityParts): QualityParts {
  return level === "custom" ? { ...current } : { ...QUALITY_PRESETS[level] };
}
