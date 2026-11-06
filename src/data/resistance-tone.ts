/** How the Identify Monster spell colours a resistance of a monster (the user, 6. 11. 2026): up to 0.2 green, above that and below 0.7 orange, 0.7 and more red. */
export type ResistanceTone = "low" | "mid" | "high";

export const RESISTANCE_LOW_MAX = 0.2;
export const RESISTANCE_HIGH_MIN = 0.7;

export function resistanceTone(value: number): ResistanceTone {
  if (value <= RESISTANCE_LOW_MAX) return "low";
  return value < RESISTANCE_HIGH_MIN ? "mid" : "high";
}
