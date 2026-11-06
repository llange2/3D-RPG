import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkKeyChain } from "../../src/interiors/dungeonPlan";
import { planDungeon } from "../../src/interiors";
import { SOUNDS, filesOf } from "../../src/audio/sound-table";
import { ROBOT_SOUND, fliesAsMissile, isRobot, robotAttackSound, robotStepSounds, robotWakeSound } from "../../src/data/robot-sounds";
import { GATE_PASSABLE, SLIDE_PASSABLE } from "../../src/render/interiorDoors";
import { PROJECTILE_MODELS } from "../../src/render/projectiles";
import { MONSTER_ACTION_RADIUS, alertMonsters, type Encounter, type GridView, type MonsterInstance } from "../../src/sim/encounter";
import { DUNGEON_DENSITIES, DUNGEON_DENSITY_NAMES, type DungeonDensity, type WorldSize } from "../../src/world/types";
import { World } from "../../src/world/world";

const PUBLIC = join(import.meta.dirname, "..", "..", "public", "assets");

/** What a world holds of each kind of place, and which ones. */
function census(seed: string, size: WorldSize, density: DungeonDensity) {
  const world = new World(seed, size, density);
  const pois = world.allPois();
  const refs = pois.filter((p) => p.kind === "dungeon" || p.kind === "cave").map((p) => ({ poi: p, ref: planDungeon(world, p)! }));
  const pyramids = refs.filter((r) => r.ref.klass === "C");
  return {
    world,
    towns: pois.filter((p) => p.kind === "town").length,
    castles: pois.filter((p) => p.kind === "castle").map((p) => p.id),
    pyramids: pyramids.map((r) => r.poi.id).sort(),
    ordinary: refs.filter((r) => r.ref.klass !== "C").map((r) => r.poi.id),
    refs,
  };
}

describe("how many dungeons a world has (6. 11. 2026)", () => {
  it("offers few, default and maximum, as half, three quarters and all", () => {
    expect(DUNGEON_DENSITY_NAMES).toEqual(["few", "default", "maximum"]);
    expect(DUNGEON_DENSITIES.few.share).toBe(0.5);
    expect(DUNGEON_DENSITIES.default.share).toBe(0.75);
    expect(DUNGEON_DENSITIES.maximum.share).toBe(1);
  });

  it("keeps every town, castle and pyramid, and thins out the ordinary caves and dungeons by the share", { timeout: 120_000 }, () => {
    for (const [seed, size] of [["thin-a", "small"], ["thin-b", "default"], ["jade-shore-568", "default"]] as const) {
      const full = census(seed, size, "maximum");
      const most = census(seed, size, "default");
      const few = census(seed, size, "few");
      for (const other of [most, few]) {
        expect(other.towns, `${seed} towns`).toBe(full.towns);
        expect(other.castles, `${seed} castles`).toEqual(full.castles);
        expect(other.pyramids, `${seed} pyramids`).toEqual(full.pyramids);
        expect(other.pyramids.length, seed).toBe(5);
        // what remains was in the full world
        const all = new Set(full.ordinary);
        for (const id of other.ordinary) expect(all.has(id), `${seed} ${id}`).toBe(true);
      }
      expect(few.ordinary.length, seed).toBeLessThan(most.ordinary.length);
      expect(most.ordinary.length, seed).toBeLessThan(full.ordinary.length);
      // a share of each level, rounded, with the few places a level or an island must keep: close to the share, never far above it
      expect(most.ordinary.length / full.ordinary.length, seed).toBeGreaterThan(0.7);
      expect(most.ordinary.length / full.ordinary.length, seed).toBeLessThan(0.85);
      expect(few.ordinary.length / full.ordinary.length, seed).toBeGreaterThan(0.45);
      expect(few.ordinary.length / full.ordinary.length, seed).toBeLessThan(0.65);
    }
  });

  it("leaves the full world as it was, and a thinned world keeps the chain of keys, key cards and orbs", { timeout: 120_000 }, () => {
    const seed = "thin-chain";
    const orbsOf = (c: ReturnType<typeof census>) => c.refs.reduce((n, r) => n + (r.ref.klass === "C" ? 0 : r.ref.orbs), 0);
    const full = orbsOf(census(seed, "default", "maximum"));
    expect(full).toBeGreaterThan(0);
    for (const density of DUNGEON_DENSITY_NAMES) {
      const c = census(seed, "default", density);
      expect(checkKeyChain(c.refs.map((r) => ({ id: r.poi.id, ref: r.ref })), (id) => c.world.poiById(id)!.tier), density).toEqual([]);
      // the orbs of the dungeons are all there, wherever they lie
      expect(orbsOf(c), density).toBe(full);
    }
    // a world without a stated density is the full one
    expect(new World(seed, "default").density).toBe("maximum");
  });
});

describe("the robots of the spaceship (6. 11. 2026)", () => {
  it("has a sound file for each of the new ids", () => {
    for (const id of Object.values(ROBOT_SOUND)) {
      const entry = SOUNDS[id];
      expect(entry, String(id)).toBeDefined();
      for (const name of filesOf(entry!)) expect(existsSync(join(PUBLIC, "audio", "sfx", `${name}.webm`)), name).toBe(true);
    }
  });

  it("gives each robot the noises of the list", () => {
    const [ED, WIZARD, TERMINATOR, AUTOMATO] = [22, 35, 69, 88];
    for (const id of [ED, WIZARD, TERMINATOR, AUTOMATO]) expect(isRobot(id), String(id)).toBe(true);
    expect(isRobot(25)).toBe(false); // the Fire Lizard is no robot
    expect([WIZARD, TERMINATOR].map(robotWakeSound)).toEqual([ROBOT_SOUND.alarm, ROBOT_SOUND.alarm]);
    expect([AUTOMATO, ED].map(robotWakeSound)).toEqual([ROBOT_SOUND.target, ROBOT_SOUND.target]);
    expect([WIZARD, TERMINATOR, ED].map(robotAttackSound)).toEqual([ROBOT_SOUND.laser, ROBOT_SOUND.laser, ROBOT_SOUND.laser]);
    expect(robotAttackSound(AUTOMATO)).toBe(ROBOT_SOUND.launch);
    expect([AUTOMATO, ED, WIZARD, TERMINATOR].map(robotStepSounds)).toEqual([2, 2, 0, 0]);
    expect(robotWakeSound(25)).toBeNull();
    expect(robotAttackSound(25)).toBeNull();
  });

  it("lets only the Titanic Automato shoot a missile, and the missile model is built", () => {
    expect(fliesAsMissile(88)).toBe(true);
    for (const id of [22, 35, 69, 25]) expect(fliesAsMissile(id), String(id)).toBe(false);
    expect(PROJECTILE_MODELS).toContain("proj_missile");
    expect(existsSync(join(PUBLIC, "models-original", "proj_missile.glb"))).toBe(true);
    expect(existsSync(join(PUBLIC, "models", "proj_missile.glb"))).toBe(true);
  });
});

describe("monsters wake when a door opens (6. 11. 2026)", () => {
  const open: GridView = { walkable: (x, y) => x >= 0 && y >= 0 && x < 30 && y < 30, water: () => false, opaque: () => false };
  const monster = (uid: string, x: number, y: number): MonsterInstance => ({ uid, defId: 22, x, y, hp: 400 });

  it("alerts the monsters with a way to the party within the action radius, and only those", () => {
    const near = monster("near", 14, 10);
    const far = monster("far", 10 + MONSTER_ACTION_RADIUS + 3, 10);
    const enc: Encounter = { monsters: [near, far], battleMode: false, sequence: [], attacker: null };
    const woke = alertMonsters(open, enc, 10, 10);
    expect(woke.map((m) => m.uid)).toEqual(["near"]);
    expect(near.alerted).toBe(true);
    expect(far.alerted).toBeUndefined();
    // a second call wakes nobody new
    expect(alertMonsters(open, enc, 10, 10)).toEqual([]);
  });

  it("does not wake a monster that has no way to the party (a shut door is a wall)", () => {
    const shut: GridView = { ...open, walkable: (x, y) => open.walkable(x, y) && x !== 12 };
    const behind = monster("behind", 14, 10);
    const enc: Encounter = { monsters: [behind], battleMode: false, sequence: [], attacker: null };
    expect(alertMonsters({ ...shut, opaque: (x) => x === 12 }, enc, 10, 10)).toEqual([]);
    expect(behind.alerted).toBeUndefined();
  });
});

describe("the iron gates wait until they are open (6. 11. 2026)", () => {
  it("lets the party through only when the gate has risen or sunk far enough, like the other doors", () => {
    expect(GATE_PASSABLE).toBeGreaterThan(0.5);
    expect(GATE_PASSABLE).toBeLessThan(1);
    expect(SLIDE_PASSABLE).toBeGreaterThan(0.5);
  });
});
