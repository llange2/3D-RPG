import { describe, expect, it } from "vitest";
import { buildMapContent, portalStart, validateContent } from "../../src/actions";
import { resolveAction, type ActionContext } from "../../src/actions/handlers";
import type { ActionInstance } from "../../src/actions/types";
import { crystalLamps, objectTaken } from "../../src/render/lamps";
import { RAT_TRAP, SEARCHABLE_DECOR, STORAGE_EQUIPMENT, trapDamageFor } from "../../src/data/chest-traps";
import { QUESTS, type LayoutId, type QuestId } from "../../src/data/quest-table";
import { clueFlag, worldQuestLog } from "../../src/game/questLog";
import { DEFAULT_SETTINGS, parseSettings } from "../../src/game/settings";
import { generateInterior } from "../../src/interiors";
import { FACING_DELTA } from "../../src/interiors/types";
import { addCondition } from "../../src/sim/character";
import { castBlock } from "../../src/sim/spells";
import { createDefaultParty } from "../../src/sim/party";
import { conditionClass, conditionTitle, shownCondition } from "../../src/ui/conditionInfo";
import { World } from "../../src/world/world";
import { questInterior } from "../helpers/quests";

const world = new World("playtest36");
const rootSeed = world.rootSeed;
const context = (party = createDefaultParty(), extra: Partial<ActionContext> = {}): ActionContext => ({ party, rootSeed, monsterThemes: { beast: 1 }, tier: 1, attempt: 0, ...extra });

describe("36th playtest, point 8: storage equipment is searched like a pile of bones", () => {
  it("is one of the searchable decorations, with a find on about one in five", () => {
    expect(SEARCHABLE_DECOR).toContain(STORAGE_EQUIPMENT);
    let crates = 0;
    let finds = 0;
    for (let i = 0; i < 160; i++) {
      const layout = (["dungeon_1", "dungeon_2", "dungeon_4", "cave_1", "cave_2", "cave_3"] as const)[i % 6] as LayoutId;
      const quest = (QUESTS.quest_5.layouts.includes(layout) ? "quest_5" : "quest_3") as QuestId;
      const { content } = questInterior(quest, layout, 1 + (i % 5), i);
      for (const a of content.actions.filter((x) => x.kind === "decor" && x.params.item === STORAGE_EQUIPMENT)) {
        crates++;
        if (a.params.find === 1) finds++;
      }
    }
    expect(crates).toBeGreaterThan(20);
    expect(finds).toBeGreaterThan(0);
    expect(finds).toBeLessThan(crates);
  });

  it("pays out and bites like the bones, with its own words for the rat", () => {
    const crate: ActionInstance = { uid: "c#decor:1", kind: "decor", x: 2, y: 2, params: { item: STORAGE_EQUIPMENT, find: 1, level: 2, gold: 40, items: 0, trapped: RAT_TRAP, trapDamage: 6, trapLevel: 2 } };
    const party = createDefaultParty();
    const gold = party.gold;
    const out = resolveAction(crate, context(party));
    expect(party.gold).toBe(gold + 40);
    const text = out.effects.filter((e) => e.type === "text").map((e) => (e.type === "text" ? e.text : "")).join(" ");
    expect(text).toMatch(/sacks|crates/);
    expect(text).not.toMatch(/bones|rib|skull/);
  });
});

describe("36th playtest, point 13: quest 1 is never built in the maze", () => {
  it("lists dungeon_2 and dungeon_4 only", () => {
    expect(QUESTS.quest_1.layouts).toEqual(["dungeon_2", "dungeon_4"]);
  });
});

describe("36th playtest, point 4: nobody starts on a cell where the party is set down", () => {
  it("keeps every group of monsters off the landing cells of runes, wrong answers and portals", () => {
    let landings = 0;
    for (let i = 0; i < 40; i++) {
      const layout = (["dungeon_1", "dungeon_2", "dungeon_3", "dungeon_4"] as const)[i % 4] as LayoutId;
      const quest = (QUESTS.quest_2.layouts.includes(layout) ? "quest_2" : "quest_4") as QuestId;
      const { content, map } = questInterior(quest, layout, 1 + (i % 5), i);
      const jumps = content.actions.filter((a) => (a.kind === "teleporter" || a.kind === "riddle" || a.kind === "qportal") && (a.params.tx !== 0 || a.params.ty !== 0) && a.params.tx !== undefined);
      landings += jumps.length;
      for (const j of jumps) expect(content.spawns.some((s) => s.x === j.params.tx && s.y === j.params.ty), `${map.key} ${j.uid}`).toBe(false);
      expect(validateContent(map, content), map.key).toEqual([]);
    }
    expect(landings).toBeGreaterThan(0);
  });
});

describe("36th playtest, point 17: a town portal puts the party in front of it, looking away", () => {
  it("stands the portal behind the party", () => {
    const poi = world.allPois().find((p) => p.kind === "town")!;
    const map = generateInterior(world, poi);
    const content = buildMapContent(world, poi, map);
    const portal = content.actions.find((a) => a.kind === "portal")!;
    const arrival = portalStart(map, content);
    // (37th playtest, point 1: where the street goes on ahead only; with a wall ahead the party looks along the street, the portal beside it)
    expect(Math.abs(arrival.x - portal.x) + Math.abs(arrival.y - portal.y)).toBe(1);
    const d = FACING_DELTA[arrival.facing];
    expect([arrival.x + d.dx, arrival.y + d.dy]).not.toEqual([portal.x, portal.y]);
  });
});

describe("36th playtest, point 25: traps hit harder the higher the level", () => {
  it("multiplies the damage by 1 + level / 10", () => {
    expect(trapDamageFor(10, 4)).toBe(14);
    expect(trapDamageFor(10, 10)).toBe(20);
    expect(trapDamageFor(10, 1)).toBe(11);
    expect(trapDamageFor(0, 5)).toBe(0);
    const trap: ActionInstance = { uid: "t#trap:1", kind: "trap", x: 1, y: 1, params: { trap: "spring", damage: 10 } };
    for (const level of [1, 5, 10]) {
      const party = createDefaultParty();
      for (const c of party.characters) c.level = level;
      const hit = resolveAction(trap, context(party)).effects.find((e) => e.type === "damage");
      expect(hit?.type === "damage" ? hit.amount : 0).toBe(trapDamageFor(10, level));
    }
  });
});

describe("36th playtest, point 19: the card names the condition that kills first", () => {
  it("shows the soonest of several deadly conditions and lists all of them", () => {
    const party = createDefaultParty();
    const c = party.characters[0]!;
    addCondition(c, "Poisoned", party.minutes); // 2 days
    addCondition(c, "Crazy", party.minutes); // 4 days
    expect(shownCondition(c, party.minutes)).toBe("Poisoned");
    expect(conditionClass(c, party.minutes)).toBe("cond-bad");
    expect(conditionTitle(c, party.minutes)).toBe("Poisoned: Dies in >48 hours\nCrazy: Dies in >96 hours");
    // a hero out of action shows that, whatever else
    addCondition(c, "Paralyzed", party.minutes);
    expect(shownCondition(c, party.minutes)).toBe("Paralyzed");
    // a single condition keeps the old words
    const d = party.characters[1]!;
    addCondition(d, "Poisoned", party.minutes);
    expect(conditionTitle(d, party.minutes)).toBe("Dies in >48 hours");
  });
});

describe("36th playtest, point 18: the quest log keeps what the heroes found out", () => {
  it("hangs the clues of a place on the line of its quest", () => {
    const w = new World("log-b", "default");
    const poi = w.allPois().find((p) => p.kind === "dungeon" && w.dungeonRef(p.id) && w.dungeonRef(p.id)!.quest !== "spaceship")!;
    const view = (opened: string[]) => worldQuestLog({ world: w, opened: new Set(opened), visited: new Set([poi.id]), carried: () => 0 });
    expect(view([]).notes).toBeUndefined();
    const clues = view([clueFlag(poi.id, "The first guardsman was called Edmund."), clueFlag(poi.id, "Tom heard 1-S in his mind, before he was poisoned.")]);
    const line = clues.open.find((l) => l.includes(poi.name))!;
    expect(clues.notes?.[line]).toBe("The first guardsman was called Edmund.\nTom heard 1-S in his mind, before he was poisoned.");
  });
});

describe("36th playtest, points 6 and 23: a glow goes with its object", () => {
  it("drops the lamp of a key that was taken and of a heap that was emptied, and of the hidden runes", () => {
    let checked = 0;
    for (let i = 0; i < 30; i++) {
      const layout = (["dungeon_2", "dungeon_4", "cave_1"] as const)[i % 3] as LayoutId;
      const quest = (QUESTS.quest_3.layouts.includes(layout) ? "quest_3" : "quest_5") as QuestId;
      const { content } = questInterior(quest, layout, 1 + (i % 5), i);
      const all = crystalLamps(content).length;
      const taken = content.actions.filter((a) => a.kind === "treasure" && (a.params.chest === 4 || typeof a.params.quest === "string"));
      const opened = new Set(taken.map((a) => a.uid));
      for (const a of taken) expect(objectTaken(a, opened)).toBe(true);
      expect(crystalLamps(content, opened).length).toBeLessThanOrEqual(all);
      if (content.actions.some((a) => a.kind === "rune" && a.params.need === "gongs")) {
        // before the last gong the runes are not there and do not shine
        expect(crystalLamps(content).length).toBe(crystalLamps({ ...content, actions: content.actions.filter((a) => a.kind !== "rune") }).length);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe("36th playtest, point 5: who can repeat the last spell", () => {
  it("blocks a hero who does not know it or has no spell points", () => {
    const party = createDefaultParty();
    const caster = party.characters.findIndex((c) => c.spells.length > 0 && c.mana > 0);
    expect(caster).toBeGreaterThanOrEqual(0);
    const known = party.characters[caster]!.spells[0]!;
    expect(castBlock(party, caster, 9999, true)).toBe("gone");
    party.characters[caster]!.sp = 0;
    expect(["mana", "gone"]).toContain(castBlock(party, caster, known, true));
  });
});

describe("36th playtest, point 26: the texture setting", () => {
  it("is normal by default, reads high and ignores anything else", () => {
    expect(DEFAULT_SETTINGS.textureQuality).toBe("normal");
    expect(parseSettings(JSON.stringify({ textureQuality: "high" })).textureQuality).toBe("high");
    expect(parseSettings(JSON.stringify({ textureQuality: "ultra" })).textureQuality).toBe("normal");
    expect(parseSettings(null).textureQuality).toBe("normal");
  });
});
