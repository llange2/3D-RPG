import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PACKS, PACK_IDS, initPack, packBrings, packKey, packMonsterNames, parsePackId, resetPack, resolveAsset, setPackManifest } from "../../src/assets/pack";
import { applyMonsterNames } from "../../src/data/monsterNames";
import { BASE_MONSTER_NAMES, MONSTERS, MONSTER_IDS } from "../../src/data/tables";
import { defaultSettings, parseSettings } from "../../src/game/settings";
import { exportSaves, importSaves, listNamedSaves, newGameState, readSave, toSaveFile, writeNamedSave, writeSave } from "../../src/game/state";
import { checkNames, checkPackFiles, checkRegistryEntries } from "../../tools/assets/packRules";

/** The two versions of the game, Classic and Fantastic Islands (`docs/PLAN_FANTASTIC_ISLANDS.md`): where the files are, where the saves are, what the options remember. */
describe("versions of the game", () => {
  afterEach(() => resetPack());

  describe("files", () => {
    it("Classic reads every file below assets/ and asks for no manifest", async () => {
      const asked: string[] = [];
      await initPack("classic", async (url) => {
        asked.push(url);
        return new Response("{}");
      });
      expect(asked).toEqual([]);
      expect(resolveAsset("tex/tex_water.webp")).toBe("/assets/tex/tex_water.webp");
      expect(packBrings("tex/tex_water.webp")).toBe(false);
    });

    it("a pack serves the files it brings and falls back to Classic's for the rest", () => {
      setPackManifest({ id: "fantastic", files: ["tex/tex_water.webp", "ui/title.webp"] });
      expect(resolveAsset("tex/tex_water.webp")).toBe("/assets-packs/fantastic/tex/tex_water.webp");
      expect(resolveAsset("ui/title.webp")).toBe("/assets-packs/fantastic/ui/title.webp");
      expect(resolveAsset("tex/tex_lava.webp")).toBe("/assets/tex/tex_lava.webp");
      expect(packBrings("tex/tex_lava.webp")).toBe(false);
    });

    it("reads the manifest of the pack, and a pack without one brings nothing", async () => {
      await initPack("fantastic", async () => new Response(JSON.stringify({ id: "fantastic", files: ["a.webp"], names: { "1": "Imp" } })));
      expect(resolveAsset("a.webp")).toBe("/assets-packs/fantastic/a.webp");
      expect(packMonsterNames()).toEqual({ "1": "Imp" });
      await initPack("fantastic", async () => new Response("", { status: 404 }));
      expect(resolveAsset("a.webp")).toBe("/assets/a.webp");
      await initPack("fantastic", async () => {
        throw new Error("offline");
      });
      expect(resolveAsset("a.webp")).toBe("/assets/a.webp");
    });

    it("the Fantastic Islands pack in the repository is readable and follows the rules", async () => {
      const { readFileSync } = await import("node:fs");
      const manifest = JSON.parse(readFileSync("public/assets-packs/fantastic/pack.json", "utf-8")) as { id: string; files: string[]; names?: unknown };
      expect(manifest.id).toBe("fantastic");
      expect(checkNames(manifest.names, new Set(MONSTER_IDS))).toEqual([]);
    });
  });

  describe("no way round the version", () => {
    it("no file of src builds an assets/ address itself (only assets/pack.ts does)", async () => {
      const { readdirSync, readFileSync } = await import("node:fs");
      const { join } = await import("node:path");
      const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
      const offenders = walk("src")
        .filter((f) => f.endsWith(".ts") && !f.split("\\").join("/").endsWith("assets/pack.ts"))
        .filter((f) => /BASE_URL\}assets|`\/assets\/|"\/assets\//.test(readFileSync(f, "utf-8")));
      expect(offenders).toEqual([]);
    });
  });

  describe("choice", () => {
    it("knows two versions and takes anything else for Classic", () => {
      expect(PACK_IDS).toEqual(["classic", "fantastic"]);
      expect(PACKS.classic.name).toBe("Classic");
      expect(PACKS.fantastic.name).toBe("Fantastic Islands");
      expect(parsePackId("fantastic")).toBe("fantastic");
      for (const bad of [undefined, null, "", "Fantastic", 3, "x"]) expect(parsePackId(bad)).toBe("classic");
    });

    it("the options remember the version; stored settings from before the versions are Classic", () => {
      expect(defaultSettings().pack).toBe("classic");
      expect(parseSettings(JSON.stringify({ music: false })).pack).toBe("classic");
      expect(parseSettings(JSON.stringify({ pack: "fantastic" })).pack).toBe("fantastic");
      expect(parseSettings(JSON.stringify({ pack: "nonsense" })).pack).toBe("classic");
    });
  });

  describe("saves", () => {
    const store = new Map<string, string>();
    beforeEach(() => {
      store.clear();
      (globalThis as { localStorage?: unknown }).localStorage = {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
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
    const game = (seed: string) => newGameState(seed, { x: 1, y: 2, facing: "N" });

    it("Classic's keys are the ones the game always used", () => {
      expect(packKey("mm3-seed-rpg:save:v1")).toBe("mm3-seed-rpg:save:v1");
      expect(packKey("mm3-seed-rpg:named:index:v1")).toBe("mm3-seed-rpg:named:index:v1");
      writeSave(game("classic-seed"));
      expect([...store.keys()]).toEqual(["mm3-seed-rpg:save:v1"]);
    });

    it("a save file of Classic carries no version mark (it stays as it was); Fantastic's does", () => {
      expect("pack" in toSaveFile(game("a"))).toBe(false);
      setPackManifest({ id: "fantastic", files: [] });
      expect(toSaveFile(game("a")).pack).toBe("fantastic");
    });

    it("Fantastic Islands keeps its own saves; the two versions never see each other's", () => {
      writeSave(game("classic-seed"));
      writeNamedSave(game("classic-named"), "Classic game");
      setPackManifest({ id: "fantastic", files: [] });
      expect(readSave("world")).toBeNull();
      expect(listNamedSaves("world")).toEqual([]);
      writeSave(game("fantastic-seed"));
      writeNamedSave(game("fantastic-named"), "Fantastic game");
      expect(readSave("world")?.seed).toBe("fantastic-seed");
      expect(listNamedSaves("world").map((e) => e.name)).toEqual(["Fantastic game"]);
      expect([...store.keys()].filter((k) => k.startsWith("mm3-seed-rpg:fantastic:")).length).toBe(3);
      resetPack();
      expect(readSave("world")?.seed).toBe("classic-seed");
      expect(listNamedSaves("world").map((e) => e.name)).toEqual(["Classic game"]);
    });

    it("an imported save of the other version is refused with the version it needs", () => {
      setPackManifest({ id: "fantastic", files: [] });
      const fantastic = JSON.stringify(toSaveFile(game("f")));
      resetPack();
      const result = importSaves(fantastic);
      expect(result.written).toEqual([]);
      expect(result.skipped.join(" ")).toContain("Fantastic Islands");
      // and a bundle of the one version is taken in only by that version
      writeSave(game("c"));
      const bundle = exportSaves();
      setPackManifest({ id: "fantastic", files: [] });
      const into = importSaves(JSON.stringify(bundle));
      expect(into.written).toEqual([]);
      expect(into.skipped.join(" ")).toContain("Classic");
    });
  });

  describe("names", () => {
    it("a version may show another name, the generation keeps reading the names of the table", () => {
      const id = MONSTER_IDS[0]!;
      const original = MONSTERS[id]!.name;
      try {
        expect(applyMonsterNames({ [id]: "Renamed", 999999: "Nobody", [MONSTER_IDS[1]!]: "  " })).toBe(1);
        expect(MONSTERS[id]!.name).toBe("Renamed");
        expect(BASE_MONSTER_NAMES[id]).toBe(original);
        expect(MONSTERS[MONSTER_IDS[1]!]!.name).toBe(BASE_MONSTER_NAMES[MONSTER_IDS[1]!]);
      } finally {
        MONSTERS[id]!.name = original;
      }
    });
  });

  describe("rules for the files of a pack", () => {
    const classic = new Set(["ui/items.webp", "ui/items.json", "tex/tex_water.webp", "hd/tex/tex_water.webp", "tex/tex_lava.webp", "models.static.original.json", "models-original/obj_a.glb"]);

    it("a sheet and its register come together", () => {
      expect(checkPackFiles({ pack: new Set(["ui/items.json"]), classic })).toHaveLength(1);
      expect(checkPackFiles({ pack: new Set(["ui/items.webp"]), classic })).toHaveLength(1);
      expect(checkPackFiles({ pack: new Set(["ui/items.webp", "ui/items.json"]), classic })).toEqual([]);
    });

    it("a texture comes with its high picture when Classic has one", () => {
      expect(checkPackFiles({ pack: new Set(["tex/tex_water.webp"]), classic })).toHaveLength(1);
      expect(checkPackFiles({ pack: new Set(["tex/tex_water.webp", "hd/tex/tex_water.webp"]), classic })).toEqual([]);
      expect(checkPackFiles({ pack: new Set(["tex/tex_lava.webp"]), classic })).toEqual([]);
    });

    it("the entries of a registry name a file that exists", () => {
      const pack = new Set(["models-original/obj_new.glb"]);
      expect(checkRegistryEntries("r.json", { obj_new: { file: "models-original/obj_new.glb" }, obj_a: { file: "models-original/obj_a.glb" } }, pack, classic)).toEqual([]);
      expect(checkRegistryEntries("r.json", { obj_x: { file: "models-original/missing.glb" }, obj_y: {} }, pack, classic)).toHaveLength(2);
      expect(checkRegistryEntries("r.json", [], pack, classic)).toHaveLength(1);
    });

    it("names belong to monsters of the table", () => {
      const ids = new Set([1, 2]);
      expect(checkNames(undefined, ids)).toEqual([]);
      expect(checkNames({ "1": "Imp" }, ids)).toEqual([]);
      expect(checkNames({ "3": "Imp", "2": "" }, ids)).toHaveLength(2);
    });
  });
});
