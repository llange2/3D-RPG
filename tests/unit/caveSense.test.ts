import { describe, expect, it } from "vitest";
import { talentInfo } from "../../src/data/tables";
import { SENSE_LINES, pickOf, reachableWithin, senseLine, wallsSensed } from "../../src/game/caveSense";

// a corridor along y = 5 from x = 0 to 20, solid rock everywhere else
const corridor = (x: number, y: number): boolean => y === 5 && x >= 0 && x <= 20;

describe("Cave Explorer: the party senses a brittle wall", () => {
  const wall = { x: 10, y: 4 }; // in the north wall of the corridor

  it("within three fields of the wall and not a field farther", () => {
    // the wall is `|dx|` fields to the side and one up: reached when the cell below it is at most 2 steps away
    expect(wallsSensed(8, 5, [wall], corridor)).toEqual([wall]);
    expect(wallsSensed(12, 5, [wall], corridor)).toEqual([wall]);
    expect(wallsSensed(7, 5, [wall], corridor)).toEqual([]);
    expect(wallsSensed(13, 5, [wall], corridor)).toEqual([]);
  });

  it("not through the rock: a wall in another corridor does not count however close it lies", () => {
    const two = (x: number, y: number): boolean => (y === 5 || y === 2) && x >= 0 && x <= 20;
    // the party stands in the lower corridor, the wall (10, 3) belongs to the upper one, three fields away but with no way across
    const upperWall = { x: 10, y: 1 };
    expect(wallsSensed(10, 5, [upperWall], two)).toEqual([]);
    expect(wallsSensed(10, 2, [upperWall], two)).toEqual([upperWall]);
  });

  it("reaches only what lies in open floor within the steps", () => {
    const reach = reachableWithin(5, 5, 2, corridor);
    expect([...reach].sort()).toEqual(["3,5", "4,5", "5,5", "6,5", "7,5"]);
  });
});

describe("Cave Explorer: the words", () => {
  it("say who stops and what he or she feels, in the form of the dialog", () => {
    expect(senseLine("Elrin", 0)).toBe(`Suddenly Elrin stops: '${SENSE_LINES[0]}'`);
    expect(SENSE_LINES[0]).toBe("I feel a slight breeze. There seems to be a hidden wall around.");
    expect(SENSE_LINES.length).toBeGreaterThanOrEqual(3);
    expect(new Set(SENSE_LINES).size).toBe(SENSE_LINES.length);
  });

  it("a wall always has the same voice and the same hero, walls differ", () => {
    expect(pickOf("a#brittle:0")).toBe(pickOf("a#brittle:0"));
    const picks = new Set(Array.from({ length: 40 }, (_, i) => pickOf(`cave#brittle:${i}`) % SENSE_LINES.length));
    expect(picks.size).toBe(SENSE_LINES.length);
  });

  it("the talent says what it does", () => {
    expect(talentInfo("talent_cave_explorer").description).toMatch(/hidden walls in caves/);
  });
});
