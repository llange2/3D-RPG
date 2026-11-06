import { describe, expect, it } from "vitest";
import { Rng, seedFromString } from "../../src/core/rng";
import { MONSTERS } from "../../src/data/tables";
import { createEncounter, createMonster, monsterTurn, type GridView } from "../../src/sim/encounter";
import { createDefaultParty } from "../../src/sim/party";

/** A corridor of ten cells along y = 0 with a sliding door in the cell 5, and a second, door-free corridor along y = 2 that joins it at x = 9 when `loop` is set. */
function corridor(opened: Set<number>, loop = false): GridView {
  const floor = (x: number, y: number): boolean => (y === 0 && x >= 0 && x <= 10) || (loop && ((y === 2 && x >= 2 && x <= 9) || (x === 9 && y >= 0 && y <= 2) || (x === 2 && y >= 0 && y <= 2)));
  const closed = (x: number, y: number): boolean => x === 5 && y === 0 && !opened.has(5);
  return {
    walkable: (x, y) => floor(x, y) && !closed(x, y),
    water: () => false,
    opaque: (x, y) => !floor(x, y) || closed(x, y),
    opensDoor: (x, y) => closed(x, y),
  };
}

const monsterId = Number(Object.keys(MONSTERS).find((k) => !MONSTERS[Number(k)]!.ranged && Number(k) < 10) ?? 1);
const rng = () => new Rng(seedFromString("doors"));

describe("monsters and the sliding doors of the spaceship (6. 11. 2026)", () => {
  it("a monster behind a shut door stays asleep: no way, no noticing, no opening", () => {
    const enc = createEncounter();
    const m = createMonster("m", monsterId, 3, 0);
    enc.monsters.push(m);
    const events = monsterTurn(createDefaultParty(), corridor(new Set()), enc, 7, 0, rng());
    expect(events.filter((e) => e.type === "monster_move" || e.type === "monster_open_door")).toEqual([]);
    expect(m.alerted).toBeUndefined();
    expect([m.x, m.y]).toEqual([3, 0]);
  });

  it("a monster that has noticed the party opens the door on its way: one step to open it, the next one through", () => {
    const enc = createEncounter();
    // it has noticed the party before (the only way it had was another one)
    const m = { ...createMonster("m", monsterId, 4, 0), alerted: true };
    enc.monsters.push(m);
    const opened = new Set<number>();
    const view = corridor(opened);
    const first = monsterTurn(createDefaultParty(), view, enc, 7, 0, rng());
    expect(first.find((e) => e.type === "monster_open_door")).toEqual({ type: "monster_open_door", uid: "m", at: [5, 0] });
    expect(first.some((e) => e.type === "monster_move")).toBe(false);
    expect([m.x, m.y]).toEqual([4, 0]);
    // (the game opens the door)
    opened.add(5);
    const second = monsterTurn(createDefaultParty(), view, enc, 7, 0, rng());
    expect(second.find((e) => e.type === "monster_move")).toMatchObject({ from: [4, 0], to: [5, 0] });
    expect([m.x, m.y]).toEqual([5, 0]);
  });

  it("the first way to the party wakes a monster for good, and then a shut door is no obstacle", () => {
    const enc = createEncounter();
    // the door-free corridor along y = 2 is a way to the party at (9, 0) while the door shuts the direct one
    const m = createMonster("m", monsterId, 3, 0);
    enc.monsters.push(m);
    const view = corridor(new Set(), true);
    monsterTurn(createDefaultParty(), view, enc, 9, 0, rng());
    expect(m.alerted).toBe(true);
    // the party goes away to the other end of the straight corridor, only the door is left in the way
    const far = corridor(new Set());
    m.x = 4;
    const events = monsterTurn(createDefaultParty(), far, enc, 8, 0, rng());
    expect(events.some((e) => e.type === "monster_open_door")).toBe(true);
  });

  it("a monster that opens nothing without the flag: doors that the view does not offer stay walls", () => {
    const enc = createEncounter();
    const m = { ...createMonster("m", monsterId, 4, 0), alerted: true };
    enc.monsters.push(m);
    const view = corridor(new Set());
    const events = monsterTurn(createDefaultParty(), { ...view, opensDoor: undefined }, enc, 7, 0, rng());
    expect(events.filter((e) => e.type === "monster_open_door" || e.type === "monster_move")).toEqual([]);
  });
});
