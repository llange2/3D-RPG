import ITEM_MODELS_RAW from "./item-models.json";

/**
 * Corrections of the user's to the sizes of the old items (`item-models.json` is generated from the old code and stays as it is). Factors on the
 * height of the model: the Rustic caravan (item 26) stands at 75 % of its old height.
 */
export const HEIGHT_FACTOR: Readonly<Record<string, number>> = { "26": 0.75 };

/** Factors on the width and depth of the model: the Rustic caravan is 85 % as wide as the old game drew it. */
export const WIDTH_FACTOR: Readonly<Record<string, number>> = { "26": 0.85 };

/**
 * Items that stand on the ground, so their lowest point rests on it: the wheels of the caravan and the barrow, the feet of the donkey, the
 * foot of the cave entrance and the burnt hut. The old game's table height (`y`) put them 0.2 to 0.4 above the ground with these models, and
 * the correction of the caravan's height (`HEIGHT_FACTOR`) lifts a model's bottom further, because the origin stays where it was.
 */
export const GROUNDED_ITEMS: ReadonlySet<number> = new Set([8, 16, 26, 42, 102]);

type Pose = { scale3: [number, number, number] };

/** The old item models with the corrections applied. Every renderer of the old items (campaign, landmarks, caravans) reads these. */
export function tunedItemModels<T extends Pose>(): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [id, model] of Object.entries(ITEM_MODELS_RAW as unknown as Record<string, T>)) {
    const h = HEIGHT_FACTOR[id];
    const w = WIDTH_FACTOR[id];
    out[id] = h === undefined && w === undefined ? model : { ...model, scale3: [model.scale3[0] * (w ?? 1), model.scale3[1] * (h ?? 1), model.scale3[2] * (w ?? 1)] };
  }
  return out;
}
