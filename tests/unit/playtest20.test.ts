import { describe, expect, it } from "vitest";
import { buildMapContent, validateContent } from "../../src/actions";
import { castleIssues } from "../../src/actions/validate";
import { resolveAction } from "../../src/actions/handlers";
import { blocksCell } from "../../src/actions/registry";
import { seedFromString } from "../../src/core/rng";
import { ALIGNMENTS, BANNER, CASTLE_MONSTERS, castleBosses, castleMonsters } from "../../src/data/castles";
import { equipmentModel } from "../../src/data/equipment";
import { HEIGHT_FACTOR, tunedItemModels } from "../../src/data/item-tuning";
import { MONSTER_THEME_NAMES, monstersOfTheme, pickMonster } from "../../src/data/monsters";
import { MONSTERS } from "../../src/data/tables";
import { hasHiddenUse, knownContent } from "../../src/game/minimap";
import { CELL, generateInterior } from "../../src/interiors";
import { analyzeTopology } from "../../src/interiors/topology";
import { Rng } from "../../src/core/rng";
import { flatTerrainOf } from "../../src/render/flatGround";
import { handTransform } from "../../src/render/equipment";
import { canSail, canSwim, createDefaultParty } from "../../src/sim/party";
import { overworldMascotSpots } from "../../src/world/mascots";
import { caravansIn } from "../../src/world/caravans";
import { GROUND, WORLD_SIZES, type Poi } from "../../src/world/types";
import { World } from "../../src/world/world";
import type { InteriorMap } from "../../src/interiors/types";

const castlesOf = (world: World): Poi[] => world.allPois().filter((p) => p.kind === "castle");

describe("twentieth playtest, point 8: no monster stronger than the level of its place", () => {
  it("never picks a monster above the tier, whatever the family (the snowy first tier had Sorcerers and Wizards)", () => {
    const rng = new Rng(seedFromString("tiers"));
    for (const theme of MONSTER_THEME_NAMES) {
      for (let tier = 1; tier <= 5; tier++) {
        for (let i = 0; i < 40; i++) {
          const m = pickMonster(rng, theme, tier);
          expect(m.terrain, `${theme} ${tier}`).not.toBe("water");
          expect(m.treasure_level, `${theme} ${tier}: ${m.name}`).toBeLessThanOrEqual(tier);
        }
      }
    }
    // the cold family has its Cryo Spore on the first tier in the sheet (it had nothing there before: the beasts stood in for it)
    expect(monstersOfTheme("cold").some((m) => m.treasure_level <= 1)).toBe(true);
    expect(pickMonster(new Rng(seedFromString("cold")), "cold", 1).treasure_level).toBe(1);
  });
});

describe("twentieth playtest, point 4: castles are good, neutral or evil", () => {
  const world = new World("castles-20", "huge");
  const castles = castlesOf(world).slice(0, 90);

  it("has all three kinds, each with the banner of its kind and only its own monsters", () => {
    const seen = new Set<string>();
    for (const poi of castles) {
      const map = generateInterior(world, poi);
      const kind = map.castle!.alignment;
      seen.add(kind);
      const content = buildMapContent(world, poi, map);
      expect(castleIssues(map, content), poi.id).toEqual([]);
      expect(validateContent(map, content), poi.id).toEqual([]);
      const banners = content.actions.filter((a) => a.kind === "decor" && [103, 104, 105].includes(Number(a.params.item)));
      expect(banners.length, `${poi.id} has a banner`).toBeGreaterThan(0);
      for (const b of banners) expect(b.params.item).toBe(BANNER[kind]);
      for (const s of content.spawns) for (const id of s.monsterIds) expect(CASTLE_MONSTERS[kind], `${poi.id} ${kind}: ${MONSTERS[id]!.name}`).toContain(id);
    }
    expect([...seen].sort()).toEqual([...ALIGNMENTS].sort());
  });

  it("gives a good castle no roaming monster: its guards stand in vaults that a gate, a locked door or a hidden wall shuts", () => {
    let good = 0;
    for (const poi of castles) {
      const map = generateInterior(world, poi);
      if (map.castle!.alignment !== "good") continue;
      good++;
      const content = buildMapContent(world, poi, map);
      expect(content.actions.some((a) => a.kind === "ambush")).toBe(false);
      expect(content.spawns.length).toBeGreaterThan(0);
      const shut = new Set<number>();
      for (const a of content.actions) if (a.kind === "door" && (a.uid.includes("#vault_gate:") || a.uid.includes("#vault_door:"))) shut.add(a.y * map.width + a.x);
      for (const a of content.actions) if (a.uid.includes("#vault_wall:")) shut.add(a.y * map.width + a.x);
      // the way in from the spawn, with every way into a vault closed: no monster can be reached
      const seen = new Uint8Array(map.width * map.height);
      const stack = [map.spawn.y * map.width + map.spawn.x];
      seen[stack[0]!] = 1;
      while (stack.length > 0) {
        const i = stack.pop()!;
        const x = i % map.width;
        const y = (i - x) / map.width;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const ni = (y + dy) * map.width + x + dx;
          if (seen[ni] || map.cells[ni] !== CELL.FLOOR || shut.has(ni)) continue;
          seen[ni] = 1;
          stack.push(ni);
        }
      }
      for (const s of content.spawns) expect(seen[s.y * map.width + s.x], `${poi.id} ${s.uid} stands in the open`).toBe(0);
    }
    expect(good).toBeGreaterThan(10);
  });

  it("builds every vault as a 2 x 2 chamber with a chest and guards, behind one of the three kinds of way in", () => {
    const hows = new Set<string>();
    for (const poi of castles.slice(0, 40)) {
      const map = generateInterior(world, poi);
      const sites = map.sites ?? [];
      const ways = sites.filter((s) => s.kind === "vault_way");
      expect(ways.length, poi.id).toBeGreaterThanOrEqual(1);
      expect(sites.filter((s) => s.kind === "vault_chest").length, poi.id).toBe(ways.length);
      expect(sites.filter((s) => s.kind === "vault_guard").length, poi.id).toBeGreaterThanOrEqual(ways.length);
      for (const w of ways) if (w.kind === "vault_way") hows.add(w.how);
      // the map is still one piece: everything is reachable (a hidden wall counts as a way through)
      const topo = analyzeTopology(map);
      expect(topo.reachableFloor, poi.id).toBe(topo.totalFloor);
      for (const room of map.rooms) expect(map.cells[room.cy * map.width + room.cx], `${poi.id} room ${room.id}`).toBe(CELL.FLOOR);
    }
    expect([...hows].sort()).toEqual(["door", "gate", "wall"]);
  });

  it("asks before it opens a locked vault door: the door is locked, do you want to try to break it?", () => {
    const party = createDefaultParty();
    const door = { uid: "t#vault_door:0", kind: "door" as const, x: 1, y: 1, params: { locked: true, ask: true, difficulty: 3, axis: "x" } };
    const ctx = { party, rootSeed: seedFromString("door"), monsterThemes: { beast: 1 }, tier: 1 };
    const asked = resolveAction(door, ctx);
    expect(asked.effects[0]).toMatchObject({ type: "confirm", question: expect.stringContaining("locked") });
    expect(asked.consumed).toBe(false);
    // a "No" leaves it shut and does not roll
    expect(resolveAction(door, { ...ctx, answer: null }).effects).toEqual([]);
    // a "Yes" tries it: the thief rolls against the difficulty
    const tried = resolveAction(door, { ...ctx, answer: "yes" });
    expect(tried.effects.some((e) => e.type === "door")).toBe(true);
  });

  it("uses the monsters the user named, by level, for a good, neutral and evil castle", () => {
    expect(castleMonsters("good", 1).sort((a, b) => a - b)).toEqual([8, 20, 66]); // nothing below level 2: Castle Guard, Draconi, Sorcerer
    expect(castleMonsters("good", 3).sort((a, b) => a - b)).toEqual([1, 8, 20, 66]);
    expect(castleMonsters("evil", 2).sort((a, b) => a - b)).toEqual([8, 12, 51, 61, 63]);
    expect(castleMonsters("neutral", 5)).toHaveLength(12);
    for (const kind of ALIGNMENTS) for (let tier = 1; tier <= 5; tier++) for (const id of castleBosses(kind, tier)) expect(CASTLE_MONSTERS[kind]).toContain(id);
  });
});

describe("twentieth playtest, point 5: monsters hold the weapons and shields of the old game", () => {
  it("knows the equipment of the ten monsters that have some", () => {
    const equipped = Object.values(MONSTERS).filter((m) => m.anim_weapon || m.anim_shield);
    expect(equipped.map((m) => m.name).sort()).toEqual(["Castle Guard", "Draconi", "Goblin", "Mad Dwarf", "Minotaur", "Minotaur King", "Ogre", "Orc Warrior", "Skeleton", "Troll"]);
    for (const m of equipped) {
      expect(equipmentModel(m.anim_weapon), m.name).not.toBeNull();
      if (m.anim_shield) expect(equipmentModel(m.anim_shield), m.name).not.toBeNull();
    }
  });

  it("holds a sword with its grip in the palm and its tip pointing away from the hand", () => {
    const t = handTransform("right", -0.78);
    const q = t.rotation;
    // the long axis of the sword in the frame of the hand joint (rotate (0, 1, 0))
    const blade = { x: 2 * (q.x * q.y - q.w * q.z), y: 1 - 2 * (q.x * q.x + q.z * q.z), z: 2 * (q.y * q.z + q.w * q.x) };
    expect(Math.hypot(blade.x, blade.y, blade.z)).toBeCloseTo(1, 5);
    // across the fingers, not along them
    expect(Math.abs(blade.y)).toBeLessThan(0.2);
    // the grip (item y = -0.78, scaled 40) lies at the palm
    const grip = { x: t.position.x + blade.x * -0.78 * t.scale, y: t.position.y + blade.y * -0.78 * t.scale, z: t.position.z + blade.z * -0.78 * t.scale };
    expect(Math.hypot(grip.x, grip.y - 6, grip.z)).toBeLessThan(1);
  });
});

describe("twentieth playtest, point 6: shallow water needs the Swimmer", () => {
  it("lets only the Swimmer, the Seafarer and the spells over shallow water, and only the Seafarer and the spells over deep water", () => {
    const party = createDefaultParty();
    expect(canSwim(party)).toBe(false);
    expect(canSail(party)).toBe(false);
    party.talents.push("talent_swimmer");
    expect(canSwim(party)).toBe(true);
    expect(canSail(party)).toBe(false);
    party.talents = ["talent_seafarer"];
    expect(canSwim(party)).toBe(true);
    expect(canSail(party)).toBe(true);
    party.talents = [];
    party.effects.push({ kind: "walk_on_water", until: party.minutes + 60 });
    expect(canSwim(party)).toBe(true);
    expect(canSail(party)).toBe(true);
  });
});

describe("twentieth playtest, point 7: no corner of three terrains where it can be avoided", () => {
  it("fills in water and lava that touch a road, so that only the bridges meet land and water at a corner", () => {
    let corners = 0;
    for (const seed of ["alpha", "beta", "gamma", "delta", "ember", "test"]) {
      const world = new World(seed, "default");
      const terrain = (x: number, y: number) => flatTerrainOf(world.tile(x, y));
      for (let y = 0; y < world.height; y++) {
        for (let x = 0; x < world.width; x++) {
          const set = new Set([terrain(x, y), terrain(x + 1, y), terrain(x, y + 1), terrain(x + 1, y + 1)]);
          if (set.size < 3) continue;
          corners++;
          const bridge = [[0, 0], [1, 0], [0, 1], [1, 1]].some(([dx, dy]) => world.tile(x + dx!, y + dy!).ground === GROUND.BRIDGE);
          expect(bridge, `${seed} ${x}/${y}: ${[...set].join(", ")} meet without a bridge`).toBe(true);
        }
      }
    }
    // (what is left is a bridge that meets the bank: there is no picture for it either)
    // (six worlds of 140 x 200 now, 2.8 times the area of the 100 x 100 ones this limit was set for)
    expect(corners).toBeLessThan(200);
  });
});

describe("twentieth playtest, point 9 and 14: the map", () => {
  it("shows a fountain, a shrine or a barrel only when it was used or Wizard's Eye is on; chests and quest chests always", () => {
    const chest = { uid: "c#1", kind: "treasure" as const, x: 1, y: 1, params: { chest: 74, level: 1, gold: 1, items: 1 } };
    const barrel = { uid: "c#2", kind: "treasure" as const, x: 2, y: 1, params: { chest: 5, level: 1, gold: 1, items: 0 } };
    const quest = { uid: "c#3", kind: "treasure" as const, x: 3, y: 1, params: { chest: 5, level: 1, gold: 0, items: 0, quest: "quest_key_blue" } };
    const fountain = { uid: "c#4", kind: "fountain" as const, x: 4, y: 1, params: { heal: 5 } };
    const shrine = { uid: "c#5", kind: "shrine" as const, x: 5, y: 1, params: { effect: "heal", amount: 5 } };
    const lever = { uid: "c#6", kind: "lever" as const, x: 6, y: 1, params: {} };
    expect([chest, barrel, quest, fountain, shrine, lever].map((a) => hasHiddenUse(a))).toEqual([false, true, false, true, true, false]);
    const content = { mapKey: "k", tier: 1, actions: [chest, barrel, quest, fountain, shrine, lever], spawns: [] };
    const names = (opened: string[], eye: boolean) => knownContent(content, new Set(opened), eye).actions.map((a) => a.uid);
    expect(names([], false)).toEqual(["c#1", "c#3", "c#6"]);
    expect(names([], true)).toHaveLength(6);
    // used once: the fountain's day key and the shrine's own uid
    expect(names(["c#4@12", "c#5"], false)).toEqual(["c#1", "c#3", "c#4", "c#5", "c#6"]);
  });
});

describe("twentieth playtest, point 15: the rustic caravan is 75 % as high", () => {
  it("takes a quarter off the height of the old item 26 (its width is 85 % since the 24th playtest)", () => {
    expect(HEIGHT_FACTOR["26"]).toBe(0.75);
    const tuned = tunedItemModels<{ scale3: [number, number, number] }>();
    expect(tuned["26"]!.scale3[1]).toBeCloseTo(1.6 * 0.75, 6);
    expect(tuned["26"]!.scale3[0]).toBeCloseTo(1.3 * 0.85, 6);
    expect(tuned["25"]!.scale3).toEqual((tunedItemModels<{ scale3: [number, number, number] }>())["25"]!.scale3);
  });
});

describe("twentieth playtest, point 13: the portal and the passages of a town", () => {
  const world = new World("birch-ward-551");

  it("puts the portal in a niche or a dead end, with a wall on three sides", () => {
    for (const seed of ["birch-ward-551", "alpha", "beta"]) {
      const w = new World(seed, "huge");
      for (const town of w.allPois().filter((p) => p.kind === "town").slice(0, 12)) {
        const map = generateInterior(w, town);
        const portal = buildMapContent(w, town, map).actions.find((a) => a.kind === "portal")!;
        const open = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => map.cells[(portal.y + dy!) * map.width + portal.x + dx!] === CELL.FLOOR);
        expect(open.length, `${seed} ${town.id}: the portal at ${portal.x}/${portal.y} stands in a street`).toBe(1);
      }
    }
  });

  it("never shuts a passage: no solid object cuts the ring of cells round it in two streets", () => {
    for (let n = 0; n < 40; n++) {
      const town = { ...world.anchorOf(0, 0), id: `p:t:town:${n}`, x: n * 7 + 10, y: n * 11 + 10, tier: 1 + (n % 5) };
      const map = generateInterior(world, town);
      const content = buildMapContent(world, town, map);
      const solid = new Set(content.actions.filter((a) => blocksCell(a)).map((a) => a.y * map.width + a.x));
      for (const a of content.actions) {
        // the portal and the lectern are placed by this generator (the people, chests and statues of the old plan are the plan's, and stay where it put them)
        if (!(a.kind === "portal" || (a.kind === "decor" && Number(a.params.item) === 119))) continue;
        const ring = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
        const others = new Set(solid);
        others.delete(a.y * map.width + a.x);
        const open = ring.map(([dx, dy]) => map.cells[(a.y + dy!) * map.width + a.x + dx!] === CELL.FLOOR && !others.has((a.y + dy!) * map.width + a.x + dx!));
        // pieces of the ring that hold an edge neighbour, counted with this object removed (it is what cuts them)
        const wall = open.indexOf(false);
        if (wall < 0) continue;
        let pieces = 0;
        let inPiece = false;
        let hasEdge = false;
        for (let k = 1; k <= 8; k++) {
          const i = (wall + k) % 8;
          if (open[i]) {
            inPiece = true;
            if (i % 2 === 0) hasEdge = true;
          } else if (inPiece) {
            if (hasEdge) pieces++;
            inPiece = false;
            hasEdge = false;
          }
        }
        expect(pieces, `town ${n}: ${a.kind} ${a.params.item} at ${a.x}/${a.y} shuts a passage`).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("twentieth playtest, point 16: the way round a town stays open", () => {
  it("keeps the ring of land round every town in one piece with the caravans and mascots standing", () => {
    for (let n = 0; n < 30; n++) {
      const w = new World(`ring-${n}`, "small");
      const start = w.startPosition();
      const blockers = [...caravansIn(w, start.x - 40, start.y - 40, start.x + 40, start.y + 40), ...overworldMascotSpots(w)];
      for (const b of blockers) {
        const others = blockers.filter((o) => o !== b);
        expect(w.keepsRingOpen(b.x, b.y, others), `ring-${n}: ${JSON.stringify({ x: b.x, y: b.y })} blocks the way round a town`).toBe(true);
      }
    }
  });
});

describe("twentieth playtest, points 1 and 2: the sizes", () => {
  it("has the four sizes the user named, with the towns per level", () => {
    // the 21st playtest changed the sizes to 70 x 100 and twice, three and four times that; the 22nd made the world wider than it is high (100 x 70)
    expect(WORLD_SIZES.small).toMatchObject({ width: 100, height: 70, towns: 1 });
    expect(WORLD_SIZES.default).toMatchObject({ width: 200, height: 140, towns: 2 });
    expect(WORLD_SIZES.large).toMatchObject({ width: 300, height: 210, towns: 3 });
    expect(WORLD_SIZES.huge).toMatchObject({ width: 400, height: 280, towns: 4 });
  });

  it("is made of sea outside: no tile of a world's edge band is anything but deep water", () => {
    const map = (size: "small" | "default" | "large" | "huge"): InteriorMap | null => (size ? null : null);
    void map;
    for (const size of ["small", "default", "large", "huge"] as const) {
      const w = new World("sea-" + size, size);
      for (let i = 0; i < w.width; i++) {
        expect(w.tile(i, 0).ground).toBe(GROUND.WATER);
        expect(w.tile(i, w.height - 1).ground).toBe(GROUND.WATER);
        expect(w.tile(0, i % w.height).ground).toBe(GROUND.WATER);
        expect(w.tile(w.width - 1, i % w.height).ground).toBe(GROUND.WATER);
      }
    }
  });
});
