import type { InteriorMap } from "../interiors/types";
import type { ActionInstance, MapContent } from "./types";

/**
 * The objects of the debug showcase (`interiors/showcase.ts`): every old item that has a model, as plain decoration that turns its front to the party, and
 * the way out. Nothing in it does anything: no chest opens, no lever pulls, no monster fights (the monsters and people are drawn by the game, not made
 * monsters of the encounter).
 */
export function buildShowcaseContent(map: InteriorMap): MapContent {
  const showcase = map.showcase!;
  const actions: ActionInstance[] = [{ uid: `${map.key}#exit:0`, kind: "transfer", x: map.exit.x, y: map.exit.y, params: { mode: "poi_exit", tier: 1 } }];
  // the party arrives from the south and looks north: the models face north at bearing 0, so they are turned to look south at it
  showcase.items.forEach((s, i) => actions.push({ uid: `${map.key}#item:${i}`, kind: "decor", x: s.x, y: s.y, params: { item: s.item, bearing: 180 } }));
  return { mapKey: map.key, tier: 1, actions, spawns: [] };
}
