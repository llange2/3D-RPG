import { beforeAll, describe, expect, it } from "vitest";
import { BLOCKS } from "../../src/campaign/blocks";
import { loadCampaignMap } from "../../src/campaign/loader";
import { crossesSlab, slabBetween, slabSide, stepFacing, type SlabMap } from "../../src/campaign/slabs";
import { Rng, seedFromString } from "../../src/core/rng";
import { MONSTERS } from "../../src/data/tables";
import { createEncounter, createMonster, isAdjacent, lineOfSight, monsterTurn, partyAttack, updateBattleMode, wayToPlayer, type GridView } from "../../src/sim/encounter";
import { createDefaultParty } from "../../src/sim/party";
import { actionCells, testHost, useDiskCampaign } from "../helpers/campaign";

beforeAll(() => useDiskCampaign());

describe("the wall piece of a brittle wall", () => {
  it("stands on the west border at rotation 0 and turns with the cell", () => {
    expect([0, 90, 180, 270].map((r) => slabSide(r))).toEqual(["W", "N", "E", "S"]);
    // the editor leaves the rotation out for 0
    expect(slabSide(undefined)).toBe("W");
    expect(stepFacing(0, -1)).toBe("N");
    expect(stepFacing(2, 0)).toBeNull();
  });

  // a corridor three cells wide in the grid: B (1,1) behind the wall piece, A (1,2) the brittle wall's cell, E (1,3) its entrance
  const WIDTH = 3;
  const slabs: SlabMap = new Map([[2 * WIDTH + 1, "N"]]);

  it("parts the two cells it stands between, and no others", () => {
    expect(slabBetween(slabs, WIDTH, 1, 2, 1, 1)).toBe(true);
    expect(slabBetween(slabs, WIDTH, 1, 1, 1, 2)).toBe(true);
    expect(slabBetween(slabs, WIDTH, 1, 2, 1, 3)).toBe(false);
    expect(slabBetween(slabs, WIDTH, 1, 3, 1, 2)).toBe(false);
    expect(slabBetween(undefined, WIDTH, 1, 2, 1, 1)).toBe(false);
  });

  it("is crossed by steps and jumps in both directions, but not by the way in", () => {
    expect(crossesSlab(slabs, WIDTH, 1, 2, 1, 1)).toBe(true);
    expect(crossesSlab(slabs, WIDTH, 1, 1, 1, 2)).toBe(true);
    expect(crossesSlab(slabs, WIDTH, 1, 3, 1, 2)).toBe(false);
    expect(crossesSlab(slabs, WIDTH, 1, 3, 1, 1)).toBe(true);
    expect(crossesSlab(slabs, WIDTH, 1, 1, 1, 3)).toBe(true);
    expect(crossesSlab(slabs, WIDTH, 1, 2, 1, 4)).toBe(false);
  });

  it("is on the cells of Fountain Head the party meets: 5/10 and the one by the portal", async () => {
    const map = await loadCampaignMap("fountain-head");
    const walls = actionCells(map, 8);
    expect(walls).toHaveLength(2);
    for (const { x, y } of walls) {
      // monsters and the pathfinder still see a shut cell, the party can go in (that was 5/10: nothing to walk into gave the wall away)
      expect(map.isWalkable(x, y)).toBe(false);
      expect(map.isEnterable(x, y)).toBe(true);
      expect(BLOCKS[map.get(x, y)!.b!]!.slab).toBe(true);
    }
    // 5/10 is editor cell 5003/5003 (rotation 90): the wall piece is on its north border, the street it opens onto is south of it
    expect(map.slabAt(5003, 5003)).toBe("N");
    expect(map.isFree(5003, 5002)).toBe(true);
    expect(map.slabAt(5010, 5004)).toBe("E");
    expect(map.isFree(5009, 5004)).toBe(true);
    expect(map.slabAt(5003, 5002)).toBeNull();
  });

  it("is gone once the wall is broken, and the cell is plain floor", async () => {
    const h = await testHost("fountain-head", "brittle", { confirm: [true] });
    h.party.talents.push("talent_perceptive");
    await h.engine.activate(5003, 5003);
    expect(h.rec.questions).toHaveLength(1);
    expect(h.map.get(5003, 5003)!.b).toBe(6);
    expect(h.map.slabAt(5003, 5003)).toBeNull();
    expect(h.map.isFree(5003, 5003)).toBe(true);
  });

  it("asks nothing of a party without the talent that steps into the cell", async () => {
    const h = await testHost("fountain-head", "brittle2");
    await h.engine.activate(5003, 5003);
    expect(h.rec.questions).toEqual([]);
    expect(h.rec.messages).toEqual([]);
    expect(h.map.get(5003, 5003)!.b).toBe(5);
  });

  it("is only on blocks 5 and 17, the brittle walls of the city and the dungeon", () => {
    expect(Object.values(BLOCKS).filter((b) => b.slab).map((b) => b.id)).toEqual([5, 17]);
    for (const b of [5, 17]) {
      expect(BLOCKS[b]!.walkable).toBe(false);
      expect(BLOCKS[b]!.breakable).toBe(true);
    }
  });
});

describe("fighting across the wall piece", () => {
  const land = Object.values(MONSTERS).find((m) => m.terrain === "land" && !m.special_abilties?.includes("Ranged Attack"))!;
  const archer = Object.values(MONSTERS).find((m) => m.terrain === "land" && m.special_abilties?.includes("Ranged Attack"))!;
  // x=1 is a corridor: (1,1) behind the wall piece, (1,2) the brittle wall's cell (shut for monsters), (1,3) the way in
  const rows = ["#.#", "#.#", "#.#", "#.#", "#.#"];
  const between = (x0: number, y0: number, x1: number, y1: number) => x0 === 1 && x1 === 1 && ((y0 === 2 && y1 === 1) || (y0 === 1 && y1 === 2));
  const view: GridView = {
    walkable: (x, y) => rows[y]?.[x] === "." && !(x === 1 && y === 2),
    water: () => false,
    opaque: (x, y) => (rows[y]?.[x] ?? "#") === "#",
    obstacle: (x, y) => x === 1 && y === 2,
    wallBetween: between,
  };
  const rng = (s: string) => new Rng(seedFromString(s));

  it("keeps a monster behind the wall piece from being next to the party", () => {
    expect(isAdjacent(1, 1, 1, 2)).toBe(true);
    expect(isAdjacent(1, 1, 1, 2, view)).toBe(false);
    expect(isAdjacent(1, 3, 1, 2, view)).toBe(true);
    const enc = createEncounter();
    enc.monsters.push(createMonster("behind", land.id, 1, 1));
    updateBattleMode(enc, 1, 2);
    expect(enc.battleMode).toBe(true);
    updateBattleMode(enc, 1, 2, view);
    expect(enc.battleMode).toBe(false);
  });

  it("lets a monster at the entrance fight the party in the cell, but not one behind the wall piece", () => {
    const behind = createEncounter();
    behind.monsters.push(createMonster("behind", land.id, 1, 1));
    expect(monsterTurn(createDefaultParty(), view, behind, 1, 2, rng("a")).some((e) => e.type === "monster_attack")).toBe(false);
    expect(behind.monsters[0]).toMatchObject({ x: 1, y: 1 });
    const front = createEncounter();
    front.monsters.push(createMonster("front", land.id, 1, 3));
    expect(monsterTurn(createDefaultParty(), view, front, 1, 2, rng("b")).some((e) => e.type === "monster_attack")).toBe(true);
  });

  it("does not send the monster to the tile behind the wall piece as if it were next to the party", () => {
    // the corridor ends at the wall piece for the monster: it has no way to a tile next to the party
    expect(wayToPlayer(view, land, 1, 0, 1, 2, 7)).toBeNull();
    expect(wayToPlayer(view, land, 1, 4, 1, 2, 7)).toEqual([[1, 3]]);
  });

  it("stops arrows, spells and shots at the wall piece from both sides", () => {
    expect(lineOfSight(view, null, 1, 2, 1, 0)).toBe(false);
    expect(lineOfSight(view, null, 1, 0, 1, 2)).toBe(false);
    expect(lineOfSight(view, null, 1, 2, 1, 4)).toBe(true);
    expect(lineOfSight(view, null, 1, 4, 1, 2)).toBe(true);
    // a monster that shoots stays harmless behind it
    const enc = createEncounter();
    enc.monsters.push(createMonster("archer", archer.id, 1, 1));
    expect(monsterTurn(createDefaultParty(), view, enc, 1, 2, rng("c")).some((e) => e.type === "monster_attack")).toBe(false);
  });

  it("denies the party an attack through the wall piece", () => {
    const enc = createEncounter();
    enc.monsters.push(createMonster("behind", land.id, 1, 1));
    // the game calls it a ranged attack because the monster is not next to the party (`isAdjacent` above)
    const events = partyAttack(createDefaultParty(), view, enc, 1, 2, rng("d"), { kind: "ranged", targetUid: "behind" });
    expect(events).toEqual([{ type: "denied", reason: "no_target" }]);
    expect(enc.monsters[0]!.hp).toBe(land.health);
  });
});
