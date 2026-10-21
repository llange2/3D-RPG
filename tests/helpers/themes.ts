import { generateContent } from "../../src/actions";
import type { MapContent } from "../../src/actions/types";
import { derive, LAYER, rngFor } from "../../src/core/rng";
import { THEMES_BY_ID, cardType, keyType } from "../../src/data/dungeon-themes";
import { INTERIOR_THEMES, withDungeonTheme } from "../../src/data/interior-themes";
import { RULE_SETS } from "../../src/data/rules";
import { generateCave } from "../../src/interiors/cave";
import { generateDungeon } from "../../src/interiors/dungeon";
import { refOf } from "../../src/interiors/dungeonPlan";
import type { InteriorMap } from "../../src/interiors";
import { World } from "../../src/world/world";

/**
 * A cave or dungeon built for one dungeon theme, without a world around it: for tests that need a place with a particular trap,
 * monster or prop. `variant` picks the layout.
 */
export function themedInterior(themeId: string, tier: number, variant = 0): { map: InteriorMap; content: MapContent } {
  const t = THEMES_BY_ID[themeId];
  if (!t) throw new Error(`unknown dungeon theme ${themeId}`);
  const root = new World("themes").rootSeed;
  const rng = rngFor(derive(root, LAYER.INTERIOR), LAYER.INTERIOR, t.id, variant);
  const requires = t.needsKey ? keyType(t.needsKey) : t.klass === "C" ? cardType("black") : null;
  const ctx = { key: `t:${t.id}:${variant}`, tier, theme: withDungeonTheme(INTERIOR_THEMES[t.klass === "C" ? "cyber" : "dungeon"]!, t), dungeon: refOf(t, requires) };
  const map = t.kinds[0] === "cave" ? generateCave(rng, ctx) : generateDungeon(rng, ctx);
  return { map, content: generateContent(map, RULE_SETS[map.kind], { rootSeed: root }) };
}
