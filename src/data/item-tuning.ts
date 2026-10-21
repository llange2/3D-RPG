import ITEM_MODELS_RAW from "./item-models.json";

/**
 * Corrections of the user's to the sizes of the old items (`item-models.json` is generated from the old code and stays as it is). Factors on the
 * height of the model: the Rustic caravan (item 26) stands at 75 % of its old height.
 */
export const HEIGHT_FACTOR: Readonly<Record<string, number>> = { "26": 0.75 };

type Pose = { scale3: [number, number, number] };

/** The old item models with the corrections applied. Every renderer of the old items (campaign, landmarks, caravans) reads these. */
export function tunedItemModels<T extends Pose>(): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [id, model] of Object.entries(ITEM_MODELS_RAW as unknown as Record<string, T>)) {
    const k = HEIGHT_FACTOR[id];
    out[id] = k === undefined ? model : { ...model, scale3: [model.scale3[0], model.scale3[1] * k, model.scale3[2]] };
  }
  return out;
}
