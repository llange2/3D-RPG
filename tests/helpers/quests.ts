import { generateContent } from "../../src/actions";
import type { MapContent } from "../../src/actions/types";
import { derive, LAYER, rngFor } from "../../src/core/rng";
import { buildLook } from "../../src/data/dungeon-themes";
import { INTERIOR_THEMES, withDungeonTheme } from "../../src/data/interior-themes";
import { QUESTS, type LayoutId, type QuestId } from "../../src/data/quest-table";
import { RULE_SETS } from "../../src/data/rules";
import { generateCave } from "../../src/interiors/cave";
import { generateDungeon } from "../../src/interiors/dungeon";
import type { DungeonRef, InteriorMap } from "../../src/interiors";
import { World } from "../../src/world/world";

export interface QuestPlaceOptions {
  requires?: string | null;
  gives?: string[];
  orbs?: number;
  scale?: number;
}

/**
 * A cave or dungeon built for one quest, without a world around it: for tests that need a place with a particular quest, layout and level.
 * `variant` picks the layout's random stream.
 */
export function questInterior(quest: QuestId, layout: LayoutId, tier: number, variant = 0, options: QuestPlaceOptions = {}): { map: InteriorMap; content: MapContent; ref: DungeonRef } {
  const root = new World("quests").rootSeed;
  const kind = layout.startsWith("cave") ? "cave" : "dungeon";
  const look = buildLook(rngFor(derive(root, LAYER.INTERIOR), LAYER.INTERIOR, quest, layout, variant, "look"), kind, tier, quest, QUESTS[quest].name, QUESTS[quest].groups as never, options.requires ? "B" : "A", `${quest}/${layout}`);
  const ref: DungeonRef = { id: `${quest}/${layout}`, klass: options.requires ? "B" : "A", quest, layout, look, requires: options.requires ?? null, gives: options.gives ?? [], orbs: options.orbs ?? 0, minis: 0, coins: 0, skulls: 0, scale: options.scale ?? 1 };
  const rng = rngFor(derive(root, LAYER.INTERIOR), LAYER.INTERIOR, quest, layout, tier, variant);
  const ctx = { key: `t:${quest}:${layout}:${variant}`, tier, theme: withDungeonTheme(INTERIOR_THEMES[kind === "cave" ? "cave" : "dungeon"]!, look), dungeon: ref };
  const map = kind === "cave" ? generateCave(rng, ctx) : generateDungeon(rng, ctx);
  return { map, content: generateContent(map, RULE_SETS[map.kind], { rootSeed: root }), ref: map.dungeon! };
}

/**
 * The first place among many (every quest, layout and level, a few variants) whose content satisfies `wanted`: for tests that need a place with
 * a particular trap or prop and do not care which quest it belongs to.
 */
export function findPlace(wanted: (place: { map: InteriorMap; content: MapContent; ref: DungeonRef }) => boolean, limit = 120): { map: InteriorMap; content: MapContent; ref: DungeonRef } {
  const quests = Object.keys(QUESTS) as QuestId[];
  for (let i = 0; i < limit; i++) {
    const quest = quests[i % quests.length]!;
    const layouts = QUESTS[quest].layouts.filter((l) => l.startsWith("dungeon") || l.startsWith("cave"));
    const layout = layouts[Math.floor(i / quests.length) % layouts.length]!;
    const place = questInterior(quest, layout, 1 + (i % 5), i);
    if (wanted(place)) return place;
  }
  throw new Error("no place matches");
}
