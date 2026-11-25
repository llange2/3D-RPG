/**
 * The white cloud of cold breath that the frost wolf and the frost wyrm of Fantastic Islands let out in front of their mouths (user, 24. 11. 2026): one cloud every `BREATH_EVERY` seconds, as long
 * as the monster lives. Both models are static (no skeleton, no head joint), so the mouth is a point of the model, measured from the middle of its bounds in model units and turned and
 * scaled with the monster: `z` forward (the models face +z), `y` up. Measured on the models with `tools/dev/check-new-monsters.ts`.
 */
export interface BreathMouth {
  /** Forward from the model's origin, model units. */
  z: number;
  /** Up from the model's origin, model units. */
  y: number;
  /** How big the cloud is (1 = a wolf's). */
  size: number;
}

/** Seconds between two clouds of one monster. */
export const BREATH_EVERY = 5;

/** The monsters that breathe, by id in the monster table: Rime Wolf (97), Frost Wyrm (114). */
export const BREATH_MOUTHS: Readonly<Record<number, BreathMouth>> = {
  97: { z: 0.88, y: 0.3, size: 0.8 },
  114: { z: 0.9, y: 0.25, size: 0.8 },
};
