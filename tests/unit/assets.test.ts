import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MUSIC_TRACKS, SOUNDS, filesOf } from "../../src/audio/sound-table";
import { INTERIOR_THEMES } from "../../src/data/interior-themes";
import { MONSTER_IDS } from "../../src/data/tables";
import { BLOCKS } from "../../src/campaign/blocks";
import { registryFile } from "../../src/render/modelSet";
import { PROJECTILE_MODELS } from "../../src/render/projectiles";
import { FLAT_TERRAINS, missingFlatTiles, parseFlatName } from "../../src/data/flatTerrain";
import { groundTexture } from "../../src/render/flatGround";
import { PROFILES } from "../../tools/assets/build-models";

const PUBLIC = join(import.meta.dirname, "..", "..", "public", "assets");
const built = existsSync(join(PUBLIC, "manifest.json"));
const originalsBuilt = existsSync(join(PUBLIC, registryFile("static"))) && existsSync(join(PUBLIC, registryFile("monsters")));

describe.skipIf(!built)("asset pipeline output", () => {
  const manifest = built ? (JSON.parse(readFileSync(join(PUBLIC, "manifest.json"), "utf-8")) as { totalBytes: number; coreBytes: number; groups: Record<string, { files: string[] }> }) : null;
  const all = new Set(Object.values(manifest?.groups ?? {}).flatMap((g) => g.files));

  it("stays inside the size budget (core 40 MB, total 250 MB)", () => {
    expect(manifest!.coreBytes).toBeLessThan(40 * 1048576);
    expect(manifest!.totalBytes).toBeLessThan(250 * 1048576);
  });

  it("has a texture for every interior theme surface", () => {
    for (const theme of Object.values(INTERIOR_THEMES)) {
      for (const key of [theme.wall, theme.floor, theme.door, theme.ceiling]) {
        if (key) expect(all.has(`tex/${key}.webp`), `${theme.id}: ${key}`).toBe(true);
      }
    }
  });

  it("has ground textures for every biome: the painted full tiles (the old terrain/*.webp files are gone, groundTexture maps their names to them)", () => {
    for (const name of ["meadow", "forest", "desert", "snow", "swamp", "rock", "lava_ground", "road", "cobble"]) {
      expect(all.has(`terrain/${name}.webp`), `${name}: the old picture is gone`).toBe(false);
      expect(all.has(`${groundTexture(`terrain/${name}`)}.webp`), name).toBe(true);
    }
    // nothing but the folder of the painted tiles is left in terrain/
    expect([...all].filter((f) => f.startsWith("terrain/") && !f.startsWith("terrain/flat/"))).toEqual([]);
  });

  it("has a flat ground tile for every terrain and transition of the register, filed under the terrain that covers most of it", () => {
    const register = JSON.parse(readFileSync(join(PUBLIC, "terrain", "flat", "tiles.json"), "utf-8")) as { tiles: Record<string, ReturnType<typeof parseFlatName>> };
    const names = Object.keys(register.tiles);
    for (const name of names) {
      expect(all.has(`terrain/flat/${name}.webp`), name).toBe(true);
      expect(register.tiles[name], name).toEqual(parseFlatName(name));
    }
    for (const terrain of FLAT_TERRAINS) expect(register.tiles[`${terrain}_full`], terrain).toEqual({ terrain, shape: "full" });
    // the first name counts for corners, edges, diagonals and ponds (a tie goes to it), the second for inner corners and islands
    expect(parseFlatName("grass_water_edge-left")).toEqual({ terrain: "grass", other: "water", shape: "edge", at: "left" });
    expect(parseFlatName("grass_water_inner-tl")).toEqual({ terrain: "water", other: "grass", shape: "inner", at: "tl" });
    expect(parseFlatName("dirt_lava_island")).toEqual({ terrain: "lava", other: "dirt", shape: "island" });
    expect(() => parseFlatName("grass_water_edge")).toThrow();
    expect(missingFlatTiles(["grass_water_edge-left"])).toContain("grass_water_corner-tl");
    expect(missingFlatTiles(["grass_water_edge-left"]).some((n) => n.endsWith("_pond") || n.endsWith("_island"))).toBe(false);
  });

  it("has one model for each of the 91 monsters", () => {
    const monsters = JSON.parse(readFileSync(join(PUBLIC, "models.monsters.json"), "utf-8")) as Record<string, { file: string; tris: number }>;
    for (const id of MONSTER_IDS) {
      expect(monsters[String(id)], `monster ${id}`).toBeDefined();
      expect(all.has(monsters[String(id)]!.file), `monster ${id} file`).toBe(true);
      expect(monsters[String(id)]!.tris).toBeGreaterThan(100);
    }
  });

  it("has the models of the door frames and of the projectiles", () => {
    const stat = JSON.parse(readFileSync(join(PUBLIC, "models.static.json"), "utf-8")) as Record<string, { file: string }>;
    const keys = [...PROJECTILE_MODELS, ...Object.values(BLOCKS).flatMap((b) => (b.style.model ? [b.style.model.key] : []))];
    for (const key of keys) {
      expect(stat[key], key).toBeDefined();
      expect(all.has(stat[key]!.file), `${key} file`).toBe(true);
    }
  });

  it("has every sound and music track the sound table refers to", () => {
    for (const [id, entry] of Object.entries(SOUNDS)) for (const f of filesOf(entry)) expect(all.has(`audio/sfx/${f}.webm`), `sound ${id}: ${f}`).toBe(true);
    for (const [id, name] of Object.entries(MUSIC_TRACKS)) expect(all.has(`audio/music/${name}.webm`), `music ${id}: ${name}`).toBe(true);
  });

  it("keeps heavy models within a sane triangle budget", () => {
    const stat = JSON.parse(readFileSync(join(PUBLIC, "models.static.json"), "utf-8")) as Record<string, { tris: number }>;
    // towns and castles are seen once or twice at a time and get a bigger budget than props; the dungeon doors are two carved parts that the
    // simplifier cannot reduce below about 5500 triangles without shattering them (the sloppy pass ignores the texture seams)
    // the full ground tiles of the quality "ultra" (`gndx_*`) are the old models as they are, 2250 to 7900 triangles
    const budget = (key: string) => (key === "poi_town" || key === "poi_castle" ? 10_000 : key.startsWith("gndx_") ? 9000 : key === "blk_door_closed" || key === "blk_door_open" ? 6000 : key === "ci_70" ? 10_500 : 5000); // ci_70, the bone pile: a baked atlas that any reduction shatters
    for (const [key, m] of Object.entries(stat)) expect(m.tris, key).toBeLessThan(budget(key));
  });
});

describe("model set registries", () => {
  it("are named the same in the pipeline and in the game", () => {
    // the game loads the originals only; the reduced set is what the pipeline still writes (`npm run assets:models`) and what the size budget measures
    expect(PROFILES.original.staticRegistry).toBe(registryFile("static"));
    expect(PROFILES.original.monsterRegistry).toBe(registryFile("monsters"));
  });
});

// optional output of `npm run assets:originals`
describe.skipIf(!originalsBuilt)("original models", () => {
  type Registry = Record<string, { file: string; tris: number; animated: boolean; scale: number }>;
  // read inside the tests: the body of a skipped suite still runs while tests are collected, and the files may not exist
  const read = (kind: "static" | "monsters", set: "lowpoly" | "original"): Registry => JSON.parse(readFileSync(join(PUBLIC, set === "original" ? registryFile(kind) : `models.${kind}.json`), "utf-8")) as Registry;

  it("cover exactly the models of the low-poly set, with their files", () => {
    expect(Object.keys(read("static", "original")).sort()).toEqual(Object.keys(read("static", "lowpoly")).sort());
    expect(Object.keys(read("monsters", "original")).sort()).toEqual(Object.keys(read("monsters", "lowpoly")).sort());
    for (const m of [...Object.values(read("static", "original")), ...Object.values(read("monsters", "original"))]) {
      expect(m.file.startsWith(`${PROFILES.original.dir}/`), m.file).toBe(true);
      expect(existsSync(join(PUBLIC, m.file)), m.file).toBe(true);
    }
  });

  it("are never coarser than the reduced models, and keep how monsters are placed", () => {
    const reducedStatic = read("static", "lowpoly");
    for (const [key, m] of Object.entries(read("static", "original"))) expect(m.tris, key).toBeGreaterThanOrEqual(reducedStatic[key]!.tris);
    const reducedMonsters = read("monsters", "lowpoly");
    for (const [id, m] of Object.entries(read("monsters", "original"))) {
      expect(m.tris, `monster ${id}`).toBeGreaterThanOrEqual(reducedMonsters[id]!.tris);
      expect(m.animated, `monster ${id}`).toBe(reducedMonsters[id]!.animated);
      expect(m.scale, `monster ${id}`).toBe(reducedMonsters[id]!.scale);
    }
  });
});
