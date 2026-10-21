import { RULE_SETS } from "../data/rules";
import { analyzeTopology } from "../interiors/topology";
import type { InteriorMap } from "../interiors/types";
import type { Poi } from "../world/types";
import type { World } from "../world/world";
import { generateContent } from "./rules";
import type { MapContent } from "./types";

export * from "./types";
export { ACTION_DEFS, ACTION_KINDS, SERVICES, actionTrigger, blocksCell, isLastingTrap, isReloadingTrap, isSpent, isTrapAction, kindForLegacyId, type ServiceKind } from "./registry";
export { generateContent } from "./rules";
export { validateContent } from "./validate";
export { innStart, portalStart } from "./startSpot";

export const START_TOWN_ID = "p:0:0:0";

/** Actions and monster spawns of a POI interior, produced by the rule set of its kind. */
export function buildMapContent(world: World, poi: Poi, map: InteriorMap): MapContent {
  return generateContent(map, RULE_SETS[map.kind], { rootSeed: world.rootSeed }, analyzeTopology(map));
}
