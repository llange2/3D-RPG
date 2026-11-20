import { describe, expect, it } from "vitest";
import { DEFAULT_KEYS, actionOf, parseKeys } from "../../src/game/keybindings";
import { RESISTANCE_CAP, createCharacter, resistance } from "../../src/sim/character";

describe("release 1.1", () => {
  it("quick save is F8 (F5 reloads the browser window); an untouched stored F5 moves over", () => {
    expect(DEFAULT_KEYS.quicksave).toEqual(["F8"]);
    expect(parseKeys({ quicksave: ["F5"] }).quicksave).toEqual(["F8"]);
    expect(parseKeys({ quicksave: ["F6"] }).quicksave).toEqual(["F6"]);
    expect(actionOf(parseKeys({}), "F8")).toBe("quicksave");
    expect(actionOf(parseKeys({}), "F5")).toBeNull();
  });

  it("a resistance never shows more than the cap on the sheet", () => {
    const c = createCharacter({ name: "T", classType: "Knight", raceType: "Human", avatar: "character05", attrs: { str: 10, int: 10, per: 10, end: 10, spd: 10, acc: 10, lck: 10 } });
    c.resFire = 7 + 80;
    expect(resistance(c, "fire")).toBe(RESISTANCE_CAP);
    c.resFire = 7;
    expect(resistance(c, "fire")).toBe(7);
  });
});
