/**
 * The rule set a world is generated with. Classic is the game as it was; Fantastic Islands has the same islands, places and ways but also the monsters that Classic does not know
 * (`docs/PLAN_FANTASTIC_ISLANDS.md` 4.6). It belongs to the identity of a world like `size` and `dungeons` (`SaveFile.state.ruleset`), and the game takes it from the version the player
 * chose (`pack`). Pure data: no DOM, no Babylon.
 */
export type Ruleset = "classic" | "fantastic";

export const RULESETS: readonly Ruleset[] = ["classic", "fantastic"];
export const DEFAULT_RULESET: Ruleset = "classic";

/** A stored or typed value as a rule set; anything unknown (and a save from before the versions) is Classic. */
export function parseRuleset(value: unknown): Ruleset {
  return value === "fantastic" ? "fantastic" : DEFAULT_RULESET;
}
