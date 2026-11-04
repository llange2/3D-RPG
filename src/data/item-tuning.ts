import ITEM_MODELS_RAW from "./item-models.json";

/**
 * Corrections of the user's to the sizes of the old items (`item-models.json` is generated from the old code and stays as it is). Factors on the
 * height of the model: the Rustic caravan (item 26) stands at 75 % of its old height, then 15 % higher again (41st playtest, point 3: 0.75 x 1.15). The user's Mermaid fountain (item 89, `Mermaid_Fountain.glb`) is drawn at half the size of the old one (0.94 wide against 1.9, same shape): twice the height and width gives the old size back. The cave entrance (item 42) is as high as the old game drew it
 * (a 10 % increase in the 41st playtest was taken back: it was too high).
 */
export const HEIGHT_FACTOR: Readonly<Record<string, number>> = { "26": 0.75 * 1.15, "89": 2 };

/** Factors on the width and depth of the model: the Rustic caravan is 85 % as wide as the old game drew it, the Mermaid fountain twice (see above). */
export const WIDTH_FACTOR: Readonly<Record<string, number>> = { "26": 0.85, "89": 2 };

/**
 * Items that stand on the ground, so their lowest point rests on it: the wheels of the caravan and the barrow, the feet of the donkey, the
 * foot of the cave entrance and the burnt hut. The old game's table height (`y`) put them 0.2 to 0.4 above the ground with these models, and
 * the correction of the caravan's height (`HEIGHT_FACTOR`) lifts a model's bottom further, because the origin stays where it was.
 */
export const GROUNDED_ITEMS: ReadonlySet<number> = new Set([8, 16, 26, 42, 102]);

/**
 * The cottage (`obj_cottage`, the user's model) stands in the place of every third rustic caravan, and of every third caravan landmark of the open country. The file is
 * normalised to a bit under one unit (0.84 x 0.95 x 0.92), the caravan's to 1.9: the scale makes it a house about as wide as the wagon.
 */
export const COTTAGE_MODEL = "obj_cottage";
export const COTTAGE_SCALE = 3.2;
/** Degrees to turn the cottage about the vertical axis so that its door looks the way a caravan faces (the model is made facing another way than the wagon). */
export const COTTAGE_YAW = 90;

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
