import { afterEach, describe, expect, it } from "vitest";
import { Rng, seedFromString } from "../../src/core/rng";
import { buildMapContent } from "../../src/actions";
import { BLOCKS } from "../../src/campaign/blocks";
import { SPELLS } from "../../src/data/tables";
import { DEBUG_MENU, debugAllSpells, debugAllTalents, debugGold, debugLevels, maintainGod, setGodMode } from "../../src/game/debug";
import { analyzeTopology, CELL, generateInterior, type InteriorMap } from "../../src/interiors";
import { pillarModelKeys } from "../../src/render/interiorView";
import { applyHit } from "../../src/sim/combat";
import { cheats } from "../../src/sim/cheats";
import { createDefaultParty } from "../../src/sim/party";
import { SPELL_SCHOOL, castSpell } from "../../src/sim/spells";
import { chunkSpawns } from "../../src/world/spawns";
import { overworldMascotSpots } from "../../src/world/mascots";
import { BIOME, DECO, GROUND, isTileWalkable, type Poi } from "../../src/world/types";
import { World } from "../../src/world/world";

const poiFor = (kind: Poi["kind"], i: number, tier = 1 + (i % 5)): Poi => ({ id: `p:t:${kind}:${i}`, kind, name: `${kind} ${i}`, x: i * 7 - 300, y: i * 13 - 900, size: 1, side: "S", region: { rx: 0, ry: 0 }, anchor: false, tier, biome: BIOME.MEADOW });

describe("fifteenth playtest: size and content of the levels", () => {
  const world = new World("playtest15");

  it("builds caves of 40 x 40 cells (point 1)", () => {
    for (let i = 0; i < 40; i++) {
      const map = generateInterior(world, poiFor("cave", i));
      expect([map.width, map.height]).toEqual([40, 40]);
      expect(analyzeTopology(map).totalFloor).toBeGreaterThan(200);
    }
  });

  it("gives every town all seven buildings (point 10)", () => {
    const all = ["bank", "guild", "inn", "smith", "tavern", "temple", "training"];
    for (let i = 0; i < 60; i++) {
      const poi = poiFor("town", i);
      const services = buildMapContent(world, poi, generateInterior(world, poi)).actions.filter((a) => a.kind === "service");
      expect(services.map((a) => String(a.params.service)).sort(), `town ${i}`).toEqual(all);
    }
  });

  it("stands pillars on walkable floor, never as a solid cell, with the model of their kind of place (point 12)", () => {
    let dungeons = 0;
    let castles = 0;
    for (let i = 0; i < 60; i++) {
      for (const kind of ["dungeon", "castle"] as const) {
        const map: InteriorMap = generateInterior(world, poiFor(kind, i));
        expect(map.cells.includes(2), `${kind} ${i} has no solid pillar cell`).toBe(false);
        for (const p of map.pillars ?? []) expect(map.cells[p.y * map.width + p.x], `${kind} ${i} pillar on floor`).toBe(CELL.FLOOR);
        if ((map.pillars?.length ?? 0) > 0) {
          expect(pillarModelKeys(map)).toEqual([kind === "dungeon" ? "blk_pillars_dungeon" : "blk_pillars_castle"]);
          if (kind === "dungeon") dungeons++;
          else castles++;
        }
        // all floor stays reachable (the topology counts the pillar cells as floor now)
        const topo = analyzeTopology(map);
        expect(topo.reachableFloor).toBe(topo.totalFloor);
      }
    }
    expect(dungeons).toBeGreaterThan(0);
    expect(castles).toBeGreaterThan(0);
  });

  it("uses neither the cracked fortress wall nor the broken city wall (point 12)", () => {
    const textures = Object.values(BLOCKS).flatMap((b) => [b.style.floor, b.style.wall, b.style.ceiling]);
    expect(textures).not.toContain("tex_fortress_wall_cracked");
    expect(textures).not.toContain("tex_city_wall_broken");
  });
});

/** Does the island under this tile have any ground in the open? */
function islandHasOpenGround(w: World, x: number, y: number): boolean {
  const isl = w.islandAt(x, y);
  if (!isl) return true;
  for (let dy = isl.box.y0; dy <= isl.box.y1; dy++) {
    for (let dx = isl.box.x0; dx <= isl.box.x1; dx++) {
      const tx = w.wrapX(isl.x + dx);
      const ty = w.wrapY(isl.y + dy);
      if (w.islandAt(tx, ty) === isl && isTileWalkable(w.tile(tx, ty)) && w.isOpenGround(tx, ty)) return true;
    }
  }
  return false;
}

describe("fifteenth playtest: the overworld (points 2 and 8)", () => {
  const world = new World("playtest15-ow");

  it("has no grey boulders any more (point 8)", () => {
    expect(Object.values(DECO)).not.toContain(2);
    expect("ROCK" in DECO).toBe(false);
  });

  it("finds out whether a spot is walled in (point 2)", () => {
    let open = 0;
    let closed = 0;
    for (let y = -60; y < 60; y++) {
      for (let x = -60; x < 60; x++) {
        const t = world.tile(x, y);
        if (!isTileWalkable(t)) {
          expect(world.isOpenGround(x, y)).toBe(false);
          continue;
        }
        if (world.isOpenGround(x, y)) open++;
        else closed++;
      }
    }
    expect(open).toBeGreaterThan(1000);
    expect(closed).toBeGreaterThanOrEqual(0);
  });

  it("puts wild monsters and mascots only where the party can get to them (point 2)", () => {
    for (const seed of ["alpha", "dune-keep-451", "iron-vale-164", "hollow-mere-793"]) {
      const w = new World(seed);
      for (let cy = -8; cy <= 8; cy++) {
        for (let cx = -8; cx <= 8; cx++) {
          for (const s of chunkSpawns(w, cx, cy)) {
            const t = w.tile(s.x, s.y);
            if (t.ground === GROUND.WATER) continue; // water monsters stay in the water
            // a speck of an island that has no ground in the open at all holds its group in a pocket the party can only reach from the shore (26th playtest)
            if (!w.isOpenGround(s.x, s.y)) expect(islandHasOpenGround(w, s.x, s.y), `${seed} ${s.uid} at ${s.x}/${s.y}`).toBe(false);
          }
        }
      }
      for (const m of overworldMascotSpots(w)) expect(w.isOpenGround(m.x, m.y), `${seed} ${m.mascot}`).toBe(true);
    }
  });
});

describe("fifteenth playtest: spells and the debug menu (points 4 and 5)", () => {
  afterEach(() => {
    cheats.god = false;
  });

  it("keeps the Light spell for eight hours (point 4)", () => {
    const party = createDefaultParty();
    const caster = party.characters.findIndex((c) => SPELL_SCHOOL[c.classType] !== undefined);
    party.characters[caster]!.spells.push(6);
    party.characters[caster]!.sp = 10;
    const result = castSpell(party, caster, 6, new Rng(seedFromString("one")));
    expect(result.kind).toBe("buff");
    const light = party.effects.find((e) => e.kind === "light")!;
    expect(light.until - party.minutes).toBe(8 * 60);
  });

  it("is a menu entry behind one flag (point 5)", () => {
    expect(typeof DEBUG_MENU).toBe("boolean");
  });

  it("makes the party immune and fed in god mode, and switches it off again", () => {
    const party = createDefaultParty();
    const hit = (damage: number) => applyHit(party, 0, damage, null, new Rng(seedFromString("two")));
    const before = party.characters[0]!.hp;
    expect(hit(5).damage).toBe(5);
    expect(party.characters[0]!.hp).toBe(before - 5);
    party.characters[1]!.conditions = ["Dead"];
    party.food = 1;
    setGodMode(party, true);
    expect(party.characters.every((c) => c.hp === c.health && !c.conditions.includes("Dead"))).toBe(true);
    expect(party.food).toBeGreaterThanOrEqual(99);
    const full = party.characters[0]!.hp;
    expect(hit(9999)).toMatchObject({ damage: 0, defeated: false });
    expect(party.characters[0]!.hp).toBe(full);
    maintainGod(party);
    setGodMode(party, false);
    expect(hit(3).damage).toBe(3);
  });

  it("gives ten levels, gold, the spells of each school and every talent", () => {
    const party = createDefaultParty();
    const levels = party.characters.map((c) => c.level);
    debugLevels(party);
    party.characters.forEach((c, i) => expect(c.level).toBe(levels[i]! + 10));
    const gold = party.gold;
    debugGold(party);
    expect(party.gold).toBe(gold + 100_000);

    debugAllSpells(party);
    for (const c of party.characters) {
      const school = SPELL_SCHOOL[c.classType];
      if (!school) {
        expect(c.spells, c.classType).toEqual([]);
        continue;
      }
      expect(c.spells.length).toBeGreaterThan(5);
      for (const id of c.spells) expect(SPELLS[id]!.type, `${c.classType} ${id}`).toContain(school);
    }
    expect(debugAllSpells(party)).toBe(0);

    expect(debugAllTalents(party)).toBeGreaterThan(5);
    expect(debugAllTalents(party)).toBe(0);
  });
});
