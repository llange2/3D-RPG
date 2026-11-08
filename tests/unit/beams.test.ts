import { describe, expect, it } from "vitest";
import { resolveAction } from "../../src/actions/handlers";
import { createDefaultParty } from "../../src/sim/party";
import { BEAMS_PER_ROOM, beamBetween, reachableWithBeams } from "../../src/actions/beams";
import { SUPPORT_BEAM, blocksCell } from "../../src/actions/registry";
import { stairLinks } from "../../src/interiors/stairs";
import type { Facing } from "../../src/interiors/types";
import { questInterior } from "../helpers/quests";
import { World } from "../../src/world/world";

const world = new World("beams", "default");
import { QUESTS, type LayoutId, type QuestId } from "../../src/data/quest-table";

/** Dungeons of every layout, several levels and variants: the beams are a decoration of all of them. */
function dungeons() {
  const out: ReturnType<typeof questInterior>[] = [];
  let n = 0;
  for (const quest of ["quest_2", "quest_4", "quest_5"] as QuestId[]) {
    for (const layout of QUESTS[quest].layouts.filter((l) => l.startsWith("dungeon")) as LayoutId[]) {
      for (let tier = 1; tier <= 5; tier++) out.push(questInterior(quest, layout, tier, n++ % 3));
    }
  }
  return out;
}

describe("the support beams (48th playtest, point 6)", () => {
  const all = dungeons();
  const beamsOf = (place: (typeof all)[number]) => place.content.actions.filter((a) => a.kind === "decor" && Number(a.params.item) === SUPPORT_BEAM);

  it("blocks no cell and says nothing: the cell stays walkable, the beam is a plain decoration", () => {
    const beam = all.flatMap(beamsOf)[0]!;
    expect(beam).toBeDefined();
    expect(blocksCell(beam)).toBe(false);
    expect(resolveAction(beam, { party: createDefaultParty(), rootSeed: world.rootSeed, monsterThemes: { beast: 1 }, tier: 1 }).effects).toEqual([]);
  });

  it("turns up in the dungeons and the towers, on an edge with a side of E or S", () => {
    const withBeams = all.filter((p) => beamsOf(p).length > 0);
    expect(withBeams.length).toBeGreaterThan(all.length / 3);
    expect(withBeams.some((p) => !!p.map.dungeon?.tower)).toBe(true);
    for (const p of withBeams) for (const b of beamsOf(p)) expect(["E", "S"], b.uid).toContain(b.params.side);
  });

  it("holds at most ten to a room, all of a room facing the same way, never side by side", () => {
    for (const p of all) {
      const byRoom = new Map<number, typeof p.content.actions>();
      for (const b of beamsOf(p)) {
        const room = p.map.roomOf[b.y * p.map.width + b.x]!;
        byRoom.set(room, [...(byRoom.get(room) ?? []), b]);
      }
      for (const [room, list] of byRoom) {
        expect(list.length, `${p.map.key} room ${room}`).toBeLessThanOrEqual(BEAMS_PER_ROOM);
        expect(new Set(list.map((b) => b.params.side)).size, `${p.map.key} room ${room}`).toBe(1);
        for (const a of list) for (const b of list) if (a !== b) expect(Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)), `${a.uid} ${b.uid}`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("keeps every place whole: the party reaches as many cells with the beams as without them", () => {
    for (const p of all) {
      const beams = new Map<number, Facing>();
      for (const b of beamsOf(p)) beams.set(b.y * p.map.width + b.x, b.params.side as Facing);
      if (beams.size === 0) continue;
      const links = stairLinks(p.map);
      expect(reachableWithBeams(p.map, beams, links), p.map.key).toBe(reachableWithBeams(p.map, new Map(), links));
    }
  });

  it("blocks the step across its edge from both cells, and no other", () => {
    const beams = new Map<number, Facing>([[5 * 10 + 4, "E"], [2 * 10 + 7, "S"]]);
    expect(beamBetween(beams, 10, 4, 5, 5, 5)).toBe(true);
    expect(beamBetween(beams, 10, 5, 5, 4, 5)).toBe(true);
    expect(beamBetween(beams, 10, 4, 5, 4, 6)).toBe(false);
    expect(beamBetween(beams, 10, 4, 5, 4, 4)).toBe(false);
    expect(beamBetween(beams, 10, 7, 2, 7, 3)).toBe(true);
    expect(beamBetween(beams, 10, 7, 3, 7, 2)).toBe(true);
    expect(beamBetween(beams, 10, 7, 2, 8, 2)).toBe(false);
    expect(beamBetween(undefined, 10, 4, 5, 5, 5)).toBe(false);
  });
});
