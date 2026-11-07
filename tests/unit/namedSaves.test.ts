import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanSaveName, deleteNamedSave, exportSaves, findNamedSave, importSaves, listNamedSaves, migrateManualSaves, newCampaignState, newGameState, readNamedSave, toSaveFile, writeNamedSave, MAX_SAVE_NAME } from "../../src/game/state";

/** The saves of "Save game" (47th playtest, point 3): any number, each with a name; a name that exists is replaced. */
describe("named saves", () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    };
  });
  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });
  const game = (seed: string) => newGameState(seed, { x: 1, y: 2, facing: "N" });

  it("keeps as many saves as the player makes and lists them by name", () => {
    for (let i = 0; i < 12; i++) expect(writeNamedSave(game(`seed-${i}`), `Save ${i}`)).toBe(true);
    const list = listNamedSaves("world");
    expect(list).toHaveLength(12);
    expect(new Set(list.map((e) => e.id)).size).toBe(12);
    const second = findNamedSave("save 7", "world");
    expect(second?.name).toBe("Save 7");
    expect(readNamedSave(second!.id)?.seed).toBe("seed-7");
  });

  it("replaces the save of a name that exists (capitals do not count) and keeps the others", () => {
    writeNamedSave(game("a"), "Before the dragon");
    writeNamedSave(game("b"), "Other");
    writeNamedSave(game("c"), "  before   THE dragon ");
    const list = listNamedSaves("world");
    expect(list).toHaveLength(2);
    const replaced = findNamedSave("Before the dragon", "world")!;
    expect(replaced.name).toBe("before THE dragon");
    expect(readNamedSave(replaced.id)?.seed).toBe("c");
  });

  it("refuses an empty name, shortens a long one and deletes a save with its file", () => {
    expect(writeNamedSave(game("a"), "   ")).toBe(false);
    expect(cleanSaveName("x".repeat(100))).toHaveLength(MAX_SAVE_NAME);
    writeNamedSave(game("a"), "one");
    const keys = store.size;
    deleteNamedSave(listNamedSaves()[0]!.id);
    expect(listNamedSaves()).toEqual([]);
    expect(store.size).toBe(keys - 1);
  });

  it("keeps the saves of the two kinds of game apart", () => {
    writeNamedSave(game("w"), "Same name");
    writeNamedSave(newCampaignState("c"), "Same name");
    expect(listNamedSaves("world")).toHaveLength(1);
    expect(listNamedSaves("campaign")).toHaveLength(1);
    expect(listNamedSaves()).toHaveLength(2);
  });

  it("turns the old single slot into the named save 'Saved game'", () => {
    store.set("mm3-seed-rpg:manualsave:v1", JSON.stringify(toSaveFile(game("old"))));
    migrateManualSaves();
    expect(store.has("mm3-seed-rpg:manualsave:v1")).toBe(false);
    const entry = findNamedSave("Saved game", "world");
    expect(entry).toBeDefined();
    expect(readNamedSave(entry!.id)?.seed).toBe("old");
  });

  it("exports and imports the named saves with a bundle", () => {
    writeNamedSave(game("x"), "First");
    writeNamedSave(game("y"), "Second");
    const bundle = exportSaves();
    expect(bundle.named?.map((n) => n.name).sort()).toEqual(["First", "Second"]);
    store.clear();
    const result = importSaves(JSON.stringify(bundle));
    expect(result.skipped).toEqual([]);
    expect(result.written.sort()).toEqual(["world / First", "world / Second"]);
    expect(listNamedSaves("world").map((e) => e.name).sort()).toEqual(["First", "Second"]);
  });
});
