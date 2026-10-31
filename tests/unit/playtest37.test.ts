import { describe, expect, it } from "vitest";
import { buildMapContent, innStart, portalStart } from "../../src/actions";
import { blocksCell } from "../../src/actions/registry";
import { MONSTERS } from "../../src/data/tables";
import { CELL, FACING_DELTA, generateInterior } from "../../src/interiors";
import { GAME_ACTIONS, DEFAULT_KEYS, actionOf, assignKey, defaultKeys, keyLabel, normalizeKey, parseKeys, primaryKey } from "../../src/game/keybindings";
import { QUALITY_LEVELS, applyQuality, qualityOf } from "../../src/game/quality";
import { DEFAULT_SETTINGS, parseSettings } from "../../src/game/settings";
import { GRIP_TWEAK, handTransform } from "../../src/render/equipment";
import { EQUIPMENT_MODELS } from "../../src/data/equipment";
import { World } from "../../src/world/world";
import { STRONG_KEEP_OFF, inStrongKeepOff } from "../../src/world/safezone";
import { chunkSpawns } from "../../src/world/spawns";

/** How many free street cells lie straight ahead of a spot (the party must not look at a wall). */
function freeAhead(map: ReturnType<typeof generateInterior>, content: ReturnType<typeof buildMapContent>, spot: { x: number; y: number; facing: keyof typeof FACING_DELTA }): boolean {
  const d = FACING_DELTA[spot.facing];
  const x = spot.x + d.dx;
  const y = spot.y + d.dy;
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return false;
  return map.cells[y * map.width + x] === CELL.FLOOR && !content.actions.some((a) => blocksCell(a) && a.x === x && a.y === y);
}

describe("37th playtest, point 1: a new game never starts with the nose against a wall", () => {
  it("looks along a free street from the spot in front of the inn, the inn behind it", () => {
    for (const seed of ["pearl-fall-919", "alpha", "ember", "kelp-mere-931", "pearl-wood-564", "test", "dune-keep-451", "amber-gate-204", "onyx-peak-786", "frost-glen-17"]) {
      const w = new World(seed);
      const town = w.poiById("p:0:0:0")!;
      const map = generateInterior(w, town);
      const content = buildMapContent(w, town, map);
      const spot = innStart(map, content);
      const inn = content.actions.find((a) => a.kind === "service" && a.params.service === "inn")!;
      expect(Math.abs(spot.x - inn.x) + Math.abs(spot.y - inn.y), `${seed}: the inn is next to the party`).toBe(1);
      expect(freeAhead(map, content, spot), `${seed}: free street ahead`).toBe(true);
    }
  });

  it("does the same for the arrival at a town portal", () => {
    for (const seed of ["alpha", "test", "pearl-fall-919"]) {
      const w = new World(seed);
      for (const poi of w.allPois().filter((p) => p.kind === "town")) {
        const map = generateInterior(w, poi);
        const content = buildMapContent(w, poi, map);
        const portal = content.actions.find((a) => a.kind === "portal");
        if (!portal) continue;
        const spot = portalStart(map, content);
        if (Math.abs(spot.x - portal.x) + Math.abs(spot.y - portal.y) !== 1) continue; // fell back to the way in
        expect(freeAhead(map, content, spot), `${seed} ${poi.id}`).toBe(true);
      }
    }
  });
});

describe("37th playtest, point 2: no strong monsters across the water from Starthaven", () => {
  it("keeps every group above level 1 out of the keep-off zone round the first town and the start", () => {
    for (const [seed, size] of [["pearl-fall-919", "default"], ["onyx-peak-786", "small"], ["alpha", "small"], ["test", "default"]] as const) {
      const w = new World(seed, size);
      for (let cy = 0; cy < w.chunksDown; cy++) {
        for (let cx = 0; cx < w.chunksAcross; cx++) {
          for (const g of chunkSpawns(w, cx, cy)) {
            if (w.tierAt(g.x, g.y) > 1) expect(inStrongKeepOff(w, g.x, g.y), `${seed}: ${g.uid} at ${g.x},${g.y}`).toBe(false);
          }
        }
      }
    }
  });

  it("puts no Paladin within reach of the start on pearl-fall-919", () => {
    const w = new World("pearl-fall-919", "default");
    const start = w.startPosition();
    for (let cy = 0; cy < w.chunksDown; cy++) {
      for (let cx = 0; cx < w.chunksAcross; cx++) {
        for (const g of chunkSpawns(w, cx, cy)) {
          if (!g.monsterIds.some((id) => MONSTERS[id]!.name === "Paladin")) continue;
          expect(Math.max(Math.abs(g.x - start.x), Math.abs(g.y - start.y)), g.uid).toBeGreaterThan(STRONG_KEEP_OFF - 3);
        }
      }
    }
  });
});

describe("37th playtest, point 3: weapons and shields sit in the hand", () => {
  it("has a grip for every sword, the hammer and the axe, and a shield offset behind the hand", () => {
    for (const key of ["wpn_sword1", "wpn_sword2", "wpn_sword3", "wpn_hammer", "wpn_axe"]) expect(GRIP_TWEAK[key], key).toBeDefined();
    for (const key of EQUIPMENT_MODELS.filter((k) => k.startsWith("wpn_shield"))) expect(GRIP_TWEAK[key]?.shift[2], key).toBeLessThan(0);
  });

  it("moves the sword's grip nine centimetres along the fingers into the fist", () => {
    const plain = handTransform("right", -0.78);
    const tuned = handTransform("right", -0.78, GRIP_TWEAK.wpn_sword1);
    expect(tuned.position.y - plain.position.y).toBeCloseTo(9, 5);
    expect(tuned.position.x).toBeCloseTo(plain.position.x, 5);
  });
});

describe("37th playtest, point 4: key bindings", () => {
  it("gives every action its default keys, and no key to two actions", () => {
    const seen = new Set<string>();
    for (const { id } of GAME_ACTIONS) {
      expect(DEFAULT_KEYS[id].length, id).toBeGreaterThan(0);
      for (const k of DEFAULT_KEYS[id]) {
        expect(seen.has(k), `${id}: ${k}`).toBe(false);
        seen.add(k);
      }
    }
  });

  it("keeps the keys the game had", () => {
    const keys = defaultKeys();
    expect(actionOf(keys, "w")).toBe("forward");
    expect(actionOf(keys, "W")).toBe("forward");
    expect(actionOf(keys, "ArrowLeft")).toBe("turnLeft");
    expect(actionOf(keys, " ")).toBe("attack");
    expect(actionOf(keys, "c")).toBe("inventory");
    expect(actionOf(keys, "F5")).toBe("quicksave");
    expect(actionOf(keys, "5")).toBe("mascot");
    expect(actionOf(keys, "Escape")).toBeNull();
    expect(actionOf(keys, "Shift")).toBeNull();
  });

  it("names the keys", () => {
    expect(keyLabel("Space")).toBe("Space");
    expect(keyLabel("f")).toBe("F");
    expect(keyLabel("ArrowUp")).toBe("↑");
    expect(keyLabel("Escape")).toBe("Esc");
    expect(normalizeKey(" ")).toBe("Space");
    expect(normalizeKey("Q")).toBe("q");
    expect(primaryKey(defaultKeys(), "attack")).toBe("Space");
  });

  it("takes a key from the action that had it", () => {
    const first = assignKey(defaultKeys(), "cast", 0, "r");
    expect(first.stolenFrom).toBe("rest");
    expect(first.bindings.cast).toEqual(["r"]);
    expect(first.bindings.rest).toEqual([]);
    expect(actionOf(first.bindings, "r")).toBe("cast");
    expect(actionOf(first.bindings, "f")).toBeNull();
    // the table given is untouched
    expect(defaultKeys().rest).toEqual(["r"]);
  });

  it("empties a slot and never gives away Escape", () => {
    expect(assignKey(defaultKeys(), "forward", 1, null).bindings.forward).toEqual(["w"]);
    const esc = assignKey(defaultKeys(), "forward", 0, "Escape");
    expect(esc.bindings.forward).toEqual(["w", "ArrowUp"]);
  });

  it("keeps a key on one slot of an action only", () => {
    const moved = assignKey(defaultKeys(), "forward", 1, "w");
    expect(moved.bindings.forward).toEqual(["ArrowUp", "w"]);
  });

  it("cleans up what was stored", () => {
    const parsed = parseKeys({ forward: ["x", "x", "Escape", 5], attack: "no", cast: ["x"] });
    expect(parsed.forward).toEqual(["x"]);
    // an entry that is no list gets its defaults back, unless another action took the key
    expect(parsed.attack).toEqual(["Space"]);
    expect(parsed.cast).toEqual([]);
    expect(parseKeys(null)).toEqual(defaultKeys());
  });
});

describe("37th playtest, point 4b: the quality slider", () => {
  it("sets the five switches of Low, Medium and High", () => {
    const base = { ...DEFAULT_SETTINGS };
    expect(applyQuality("low", base)).toEqual({ floorModel: false, textureQuality: "normal", viewDistance: "close", resolution: "low", animatedTown: false });
    expect(applyQuality("medium", base)).toEqual({ floorModel: false, textureQuality: "normal", viewDistance: "medium", resolution: "normal", animatedTown: true });
    expect(applyQuality("high", base)).toEqual({ floorModel: true, textureQuality: "high", viewDistance: "far", resolution: "normal", animatedTown: true });
    expect(QUALITY_LEVELS).toEqual(["low", "medium", "high", "custom"]);
  });

  it("reads the level back from the switches, and jumps to Custom for any other mix", () => {
    for (const level of ["low", "medium", "high"] as const) expect(qualityOf(applyQuality(level, DEFAULT_SETTINGS))).toBe(level);
    expect(qualityOf({ ...applyQuality("medium", DEFAULT_SETTINGS), resolution: "low" })).toBe("custom");
    expect(qualityOf({ ...applyQuality("high", DEFAULT_SETTINGS), floorModel: false })).toBe("custom");
    expect(applyQuality("custom", { ...DEFAULT_SETTINGS, viewDistance: "far" }).viewDistance).toBe("far");
  });

  it("starts at Medium", () => {
    expect(qualityOf(DEFAULT_SETTINGS)).toBe("medium");
  });
});

describe("37th playtest, point 4: stored settings", () => {
  it("starts the volumes in the middle and shows the keys", () => {
    expect(DEFAULT_SETTINGS.musicVolume).toBe(50);
    expect(DEFAULT_SETTINGS.sfxVolume).toBe(50);
    expect(DEFAULT_SETTINGS.showKeys).toBe(true);
    expect(DEFAULT_SETTINGS.keys).toEqual(defaultKeys());
  });

  it("reads volumes, key names and keys, and clamps what is out of range", () => {
    const s = parseSettings(JSON.stringify({ musicVolume: 120, sfxVolume: -5, showKeys: false, keys: { cast: ["x"] } }));
    expect(s.musicVolume).toBe(100);
    expect(s.sfxVolume).toBe(0);
    expect(s.showKeys).toBe(false);
    expect(s.keys.cast).toEqual(["x"]);
    // settings of an older version have none of them
    const old = parseSettings(JSON.stringify({ music: false }));
    expect(old.musicVolume).toBe(50);
    expect(old.keys).toEqual(defaultKeys());
  });
});
