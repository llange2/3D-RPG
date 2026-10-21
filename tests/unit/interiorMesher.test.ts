import { join } from "node:path";
import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import { BLOCKS } from "../../src/campaign/blocks";
import { loadCampaignMap } from "../../src/campaign/loader";
import { generateInterior, type InteriorKind, type InteriorMap } from "../../src/interiors";
import { CELL_SIZE, meshInterior, wallHeightOf } from "../../src/render/interiorMesher";
import { BIOME, type PoiKind } from "../../src/world/types";
import { World } from "../../src/world/world";
import { useDiskCampaign } from "../helpers/campaign";

const world = new World("interior-mesher");
const ASSETS = join(import.meta.dirname, "..", "..", "public", "assets");

const poi = (kind: PoiKind) => ({ id: `p:t:${kind}`, kind, name: kind, x: 11, y: -23, size: 1, side: "S" as const, region: { rx: 0, ry: 0 }, anchor: false, tier: 2, biome: BIOME.MEADOW });

// entities.py add_block with blocksize 3: dungeon and cyber walls 3 * 1.5, fortress 3 * 1.4, city and cave about one cell
const EXPECTED: Record<InteriorKind, number> = { dungeon: 4.5, fortress: 4.2, cave: 3, town: 3 };

describe("wall height", () => {
  it("follows the old game for every kind of generated interior", () => {
    for (const [poiKind, kind] of [["dungeon", "dungeon"], ["castle", "fortress"], ["cave", "cave"], ["town", "town"]] as const) {
      const map = generateInterior(world, poi(poiKind));
      expect(map.kind).toBe(kind);
      expect(wallHeightOf(map), kind).toBeCloseTo(EXPECTED[kind], 6);
    }
  });

  it("puts the top of the walls, the ceiling and the textures on that height", () => {
    for (const poiKind of ["dungeon", "castle", "cave", "town"] as const) {
      const map = generateInterior(world, poi(poiKind));
      const H = wallHeightOf(map);
      const geo = meshInterior(map);
      expect(geo.wallHeight).toBe(H);
      let top = 0;
      for (let i = 1; i < geo.positions.length; i += 3) top = Math.max(top, geo.positions[i]!);
      expect(top, poiKind).toBeCloseTo(H, 4);
      // a wall shows its texture once over the full height, the way the old game's cubes did
      let vMax = 0;
      for (const g of geo.groups) {
        if (g.material === "floor" || g.material === "ceiling") continue;
        for (let i = g.start; i < g.start + g.count; i++) vMax = Math.max(vMax, geo.uvs[geo.indices[i]! * 2 + 1]!);
      }
      expect(vMax, poiKind).toBe(1);
    }
  });

  it("matches the proportions the wall textures were drawn for", async () => {
    // tex_dungeon_wall is 2 : 3 and tex_fortress_wall about 1 : 1.4, i.e. a wall 1.5 or 1.4 times as high as a cell is wide
    for (const [kind, file] of [["dungeon", "tex_dungeon_wall"], ["fortress", "tex_fortress_wall"]] as const) {
      const { width, height } = await sharp(join(ASSETS, "tex", `${file}.webp`)).metadata();
      expect(height! / width!, file).toBeCloseTo(EXPECTED[kind] / CELL_SIZE, 1);
    }
  });
});

describe("wall height of the campaign maps", () => {
  let grid: (slug: string) => Promise<InteriorMap>;
  beforeAll(() => {
    useDiskCampaign();
    grid = async (slug) => (await loadCampaignMap(slug)).toInteriorMap();
  });

  it("is the one of the dominant family: dungeons and the space ship high, towns low", async () => {
    expect(wallHeightOf(await grid("tomb-of-terror"))).toBeCloseTo(4.5, 6);
    expect(wallHeightOf(await grid("space-ship"))).toBeCloseTo(4.5, 6);
    expect(wallHeightOf(await grid("castle-whiteshield"))).toBeCloseTo(4.2, 6);
    expect(wallHeightOf(await grid("fountain-head"))).toBeCloseTo(3, 6);
    expect(wallHeightOf(await grid("cave-01"))).toBeCloseTo(3, 6);
  });

  it("scales the dungeon cell models like the old game, so they fill the 4.5 high cell", () => {
    for (const b of [15, 16, 17, 18, 20]) expect(BLOCKS[b]!.style.model?.scaleXYZ, `block ${b}`).toEqual([1.5, 1.473, 1.5]);
    expect(BLOCKS[47]!.style.model?.scaleXYZ).toEqual([1.5, 1.473, 1.5]);
  });
});
