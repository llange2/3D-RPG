import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PACKED_PREFIX } from "../../src/game/saveCodec";
import { importSaves, listNamedSaves, newGameState, packStoredSaves, readNamedSave, readSave, splitLegacySaves, toSaveFile, writeNamedSave } from "../../src/game/state";

/** 57th playtest, point 7 (second round): the browser was full of saves written before they were packed; they are packed at start-up and the room is there again. */
describe("the saves of the old format are packed at start-up", () => {
  const store = new Map<string, string>();
  let limit = Infinity;
  const used = () => [...store].reduce((n, [k, v]) => n + k.length + v.length, 0);
  beforeEach(() => {
    store.clear();
    limit = Infinity;
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        if (used() - (store.get(k)?.length ?? 0) - (store.has(k) ? k.length : 0) + k.length + v.length > limit) throw new Error("QuotaExceededError");
        store.set(k, v);
      },
      removeItem: (k: string) => void store.delete(k),
      key: (i: number) => [...store.keys()][i] ?? null,
      get length() {
        return store.size;
      },
    };
  });
  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  /** A save with a journal of some size, written the way the game wrote it before the packing: plain JSON under the keys of a slot and of named saves. */
  const plainWorld = (seed: string) => {
    const state = newGameState(seed, { x: 5, y: 6, facing: "S" });
    for (let i = 0; i < 300; i++) state.journal.push({ t: "level", name: "Aa", cls: "Knight", from: i, to: i + 1, xp: i * 31, s: i, m: i * 7, at: "ow", x: i % 9, y: i % 5 } as never);
    return toSaveFile(state);
  };
  const putPlain = () => {
    store.set("mm3-seed-rpg:save:v1", JSON.stringify(plainWorld("auto")));
    store.set("mm3-seed-rpg:quicksave:v1", JSON.stringify(plainWorld("quick")));
    const index = [];
    for (let i = 0; i < 6; i++) {
      store.set(`mm3-seed-rpg:named:save:n${i}`, JSON.stringify(plainWorld(`named-${i}`)));
      index.push({ id: `n${i}`, name: `Save ${i}`, kind: "world", note: "x", savedAt: new Date(2026, 10, i + 1).toISOString() });
    }
    store.set("mm3-seed-rpg:named:index:v1", JSON.stringify(index));
  };

  it("packs every plain save, reads them back unchanged and frees most of the room", () => {
    putPlain();
    const before = used();
    const freed = packStoredSaves();
    expect(freed).toBeGreaterThan(before / 2);
    expect(used()).toBe(before - freed);
    for (const [k, v] of store) if (k.includes("save") || k.includes("quick")) expect(v.startsWith(PACKED_PREFIX), k).toBe(true);
    expect(readSave("world", "auto")?.seed).toBe("auto");
    expect(readSave("world", "quick")?.state.journal).toHaveLength(300);
    expect(readNamedSave("n3")?.seed).toBe("named-3");
    expect(listNamedSaves("world")).toHaveLength(6);
    // a second run has nothing left to do
    expect(packStoredSaves()).toBe(0);
  });

  it("makes room for the next save where the full storage refused it", () => {
    putPlain();
    const next = newGameState("next", { x: 1, y: 1, facing: "N" });
    for (let i = 0; i < 300; i++) next.journal.push({ t: "level", name: "Aa", cls: "Knight", from: i, to: i + 1, xp: i * 31, s: i, m: i * 7, at: "ow", x: i % 9, y: i % 5 } as never);
    // the storage is as full as it was: no room for one more big save
    limit = used() + 2000;
    expect(writeNamedSave(next, "newest")).toBe(false);
    expect(listNamedSaves("world")).toHaveLength(6);
    splitLegacySaves();
    expect(writeNamedSave(next, "newest")).toBe(true);
    expect(listNamedSaves("world").map((e) => e.name)).toContain("newest");
    expect(readNamedSave(listNamedSaves("world").find((e) => e.name === "newest")!.id)?.seed).toBe("next");
  });

  it("leaves a damaged or foreign value alone, and packs the saves an import writes", () => {
    store.set("mm3-seed-rpg:save:v1", "{not json at all");
    packStoredSaves();
    // (it does not read back as a save, but it is not touched)
    expect(store.get("mm3-seed-rpg:save:v1")).toBe("{not json at all");
    store.set("mm3-seed-rpg:other", "{keep}");
    packStoredSaves();
    expect(store.get("mm3-seed-rpg:other")).toBe("{keep}");
    const bundle = { format: "mm3-saves", exportedAt: new Date().toISOString(), saves: [{ kind: "world", slot: "quick", save: plainWorld("imported") }], named: [] };
    expect(importSaves(JSON.stringify(bundle)).written).toEqual(["world / quick"]);
    expect(store.get("mm3-seed-rpg:quicksave:v1")!.startsWith(PACKED_PREFIX)).toBe(true);
    expect(readSave("world", "quick")?.seed).toBe("imported");
  });
});
