import { describe, expect, it } from "vitest";
import { RIDDLES_WORLD, RIDDLE_NUMBERS, WORD_RIDDLES, answerMatches, normalizeAnswer } from "../../src/data/riddles";

describe("riddle list of the generated world (quest document 1.2)", () => {
  it("has 250 to 300 riddles with at most four sharing an answer", () => {
    expect(RIDDLE_NUMBERS.length).toBeGreaterThanOrEqual(250);
    expect(RIDDLE_NUMBERS.length).toBeLessThanOrEqual(300);
    const same = new Map<string, number>();
    for (const n of RIDDLE_NUMBERS) {
      const a = RIDDLES_WORLD[String(n)]!.answer;
      same.set(a, (same.get(a) ?? 0) + 1);
    }
    expect(Math.max(...same.values())).toBeLessThanOrEqual(4);
  });

  it("has only one-word answers of two letters or more, none broken", () => {
    for (const n of RIDDLE_NUMBERS) {
      const r = RIDDLES_WORLD[String(n)]!;
      expect(r.answer, `#${n}`).toMatch(/^[a-z]{3,}$/);
      expect(r.question.length, `#${n}`).toBeGreaterThan(10);
    }
  });

  it("offers enough words for quest_6 and the three castles (four letters)", () => {
    const words = new Set(WORD_RIDDLES.map((n) => RIDDLES_WORLD[String(n)]!.answer));
    expect(words.size).toBeGreaterThanOrEqual(100);
    expect([...words].filter((w) => w.length === 4).length).toBeGreaterThanOrEqual(10);
  });

  it("accepts case, article, plural, alias and one slip of the finger", () => {
    const watch = { answer: "clock", aliases: ["watch"] };
    expect(answerMatches("The Clock", watch)).toBe(true);
    expect(answerMatches("watch", watch)).toBe(true);
    expect(answerMatches("clocks", watch)).toBe(true);
    expect(answerMatches("clok", { answer: "clock", aliases: [] })).toBe(false); // four letters: no slip allowed
    expect(answerMatches("mountian", { answer: "mountain", aliases: [] })).toBe(false); // transposition is two slips
    expect(answerMatches("mountin", { answer: "mountain", aliases: [] })).toBe(true);
    expect(answerMatches("", watch)).toBe(false);
    expect(answerMatches("door", watch)).toBe(false);
    expect(normalizeAnswer("  An Apple!")).toBe("apple");
  });
});
