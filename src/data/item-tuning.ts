import ITEM_MODELS_RAW from "./item-models.json";

/**
 * Corrections of the user's to the sizes of the old items (`item-models.json` is generated from the old code and stays as it is). Factors on the
 * height of the model: the Rustic caravan (item 26) stands at 75 % of its old height, then 15 % higher again (41st playtest, point 3: 0.75 x 1.15). The user's Mermaid fountain (item 89, `Mermaid_Fountain.glb`) is drawn at half the size of the old one (0.94 wide against 1.9, same shape): twice the height and width gives the old size back. The cave entrance (item 42) is as high as the old game drew it
 * (a 10 % increase in the 41st playtest was taken back: it was too high). The user's new models of 8 Nov 2026 (51st playtest, point 12) are as big as the old ones again: the new rustic caravan is 1.86 high against 1.8 of the old file (the height factor takes it back), the new pyramid 1.85 high and 1.89 wide against 1.57 and 2.0.
 */
export const HEIGHT_FACTOR: Readonly<Record<string, number>> = { "26": 0.75 * 1.15 * (1.8 / 1.86), "43": 1.57 / 1.85, "89": 2 };

/** Factors on the width and depth of the model: the Rustic caravan is 85 % as wide as the old game drew it, the Mermaid fountain twice (see above). */
export const WIDTH_FACTOR: Readonly<Record<string, number>> = { "26": 0.85, "43": 2 / 1.89, "89": 2 };

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
/** The cottage is drawn 25 % higher than wide (the user's wish, 4 Nov 2026): width and depth keep `COTTAGE_SCALE`. */
export const COTTAGE_HEIGHT_FACTOR = 1.25;
export const COTTAGE_SCALE_XYZ: [number, number, number] = [COTTAGE_SCALE, COTTAGE_SCALE * COTTAGE_HEIGHT_FACTOR, COTTAGE_SCALE];
/** Degrees to turn the cottage about the vertical axis so that its door looks the way a caravan faces (the model is made facing another way than the wagon). */
export const COTTAGE_YAW = 90;

/**
 * Corrections to the height at which the old game put a model's origin (added to `y`). The rustic lantern (item 76) hangs 0.6 lower than the table says
 * (51st playtest, point 2): its top touched the ceiling and the chain was not to be seen. `LANTERN_DROP` is also the drop of its light (`ITEM_LAMPS`).
 */
export const LANTERN_DROP = 0.6;
export const Y_OFFSET: Readonly<Record<string, number>> = { "76": -LANTERN_DROP };

type Pose = { scale3: [number, number, number]; y?: number };

/** The old item models with the corrections applied. Every renderer of the old items (campaign, landmarks, caravans) reads these. */
export function tunedItemModels<T extends Pose>(): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [id, model] of Object.entries(ITEM_MODELS_RAW as unknown as Record<string, T>)) {
    const h = HEIGHT_FACTOR[id];
    const w = WIDTH_FACTOR[id];
    const dy = Y_OFFSET[id];
    if (h === undefined && w === undefined && dy === undefined) {
      out[id] = model;
      continue;
    }
    out[id] = {
      ...model,
      scale3: [model.scale3[0] * (w ?? 1), model.scale3[1] * (h ?? 1), model.scale3[2] * (w ?? 1)],
      ...(dy !== undefined && model.y !== undefined ? { y: model.y + dy } : {}),
    };
  }
  return out;
}
