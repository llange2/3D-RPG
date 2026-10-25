import { describe, expect, it } from "vitest";
import { Rng, seedFromString } from "../../src/core/rng";
import { MONSTERS } from "../../src/data/tables";
import { recalcValues } from "../../src/sim/character";
import { createEncounter, createMonster, monsterTurn, MONSTER_ACTION_RADIUS, partyAttack, SHOT_RANGE, type GridView } from "../../src/sim/encounter";
import { createDefaultParty } from "../../src/sim/party";
import type { Party } from "../../src/sim/types";

const rng = (s: string) => new Rng(seedFromString(s));

function open(width: number, height: number): GridView {
  return {
    walkable: (x, y) => x >= 0 && y >= 0 && x < width && y < height,
    water: () => false,
    opaque: () => false,
  };
}

/** The default party with bows: the shots of the party are what the range of the 28th playtest is about. */
function archers(): Party {
  const p = createDefaultParty();
  for (const c of p.characters) recalcValues(c, p.talents, true);
  return p;
}

describe("28th playtest, points 3 to 5: the range of the party and the monsters that wake up", () => {
  const land = Object.values(MONSTERS).find((m) => m.terrain === "land" && !m.special_abilties?.includes("Ranged Attack"))!;

  it("lets the party shoot one tile farther than before and never farther than the monsters act", () => {
    expect(SHOT_RANGE).toBe(7);
    expect(SHOT_RANGE).toBeLessThanOrEqual(MONSTER_ACTION_RADIUS);
    const party = archers();
    const enc = createEncounter();
    enc.monsters.push(createMonster("seven", land.id, 7, 0), createMonster("eight", land.id, 8, 0));
    const view = open(20, 20);
    const eight = partyAttack(party, view, enc, 0, 0, rng("range"), { kind: "ranged", targetUid: "eight" });
    expect(eight[0]).toMatchObject({ type: "denied", reason: "out_of_range" });
    const seven = partyAttack(party, view, enc, 0, 0, rng("range"), { kind: "ranged", targetUid: "seven" });
    expect(seven[0]).not.toMatchObject({ type: "denied", reason: "out_of_range" });
  });

  it("wakes a monster in the corner of the square the party shoots into", () => {
    const party = archers();
    const enc = createEncounter();
    // seven tiles away on both axes: 9.9 tiles by the line, but a legal shot
    const m = createMonster("corner", land.id, 7, 7);
    enc.monsters.push(m);
    monsterTurn(party, open(20, 20), enc, 0, 0, rng("corner"));
    expect([m.x, m.y]).not.toEqual([7, 7]);
  });

  it("lets a monster walk when the short search finds no way but the long one does", () => {
    const party = archers();
    const enc = createEncounter();
    // a wall with a gap far from the straight line: the search of 30 expansions gives up, the one of the moving monsters does not
    const rows: string[] = [];
    for (let y = 0; y < 15; y++) rows.push(y === 7 ? "#########.#####" : "...............");
    const view: GridView = {
      walkable: (x, y) => rows[y]?.[x] === ".",
      water: () => false,
      opaque: (x, y) => rows[y]?.[x] === "#",
    };
    const m = createMonster("walker", land.id, 5, 10);
    enc.monsters.push(m);
    monsterTurn(party, view, enc, 5, 4, rng("walk"));
    expect([m.x, m.y]).not.toEqual([5, 10]);
  });
});
