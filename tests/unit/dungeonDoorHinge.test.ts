import { describe, expect, it } from "vitest";
import { buildMapContent } from "../../src/actions";
import { generateInterior } from "../../src/interiors";
import { BIOME, type Poi } from "../../src/world/types";
import { World } from "../../src/world/world";
import { DOOR_PASSABLE, InteriorDoors, doorLook } from "../../src/render/interiorDoors";
import type { PropInstance } from "../../src/render/terrainMesher";
import type { PropRenderer } from "../../src/render/props";

const world = new World("hinge");
const LEAF = "blk_dungeon_door";
const FRAME = "frame_dungeon";

function poiFor(i: number): Poi {
  return { id: `p:t:dungeon:${i}`, kind: "dungeon", name: `dungeon ${i}`, x: i * 7 - 300, y: i * 13 - 900, size: 1, side: "S", region: { rx: 0, ry: 0 }, anchor: false, tier: 1, biome: BIOME.MEADOW };
}

/** A prop renderer that only remembers what it was told to draw. */
function recorder() {
  const owners = new Map<string, PropInstance[]>();
  const props = {
    setInstances: (owner: string, list: PropInstance[]) => void owners.set(owner, list),
    removeOwner: (owner: string) => void owners.delete(owner),
    flush: () => {},
  } as unknown as PropRenderer;
  const all = (model: string) => [...owners.values()].flat().filter((p) => p.model === model);
  return { props, all };
}

/** The first dungeon door that has the wooden look. */
function woodenDoor() {
  for (let i = 0; i < 60; i++) {
    const poi = poiFor(i);
    const map = generateInterior(world, poi);
    const content = buildMapContent(world, poi, map);
    const door = content.actions.find((a) => a.kind === "door" && doorLook(map, a.x, a.y) === "door");
    // only this door, so that every instance in the recorder is its own
    if (door) return { map, content: { ...content, actions: content.actions.filter((a) => a.kind !== "door" || a.uid === door.uid) }, door };
  }
  throw new Error("no dungeon with a wooden door");
}

/** Where a point of the leaf's own coordinates ends up in the world (Babylon's yaw: x' = x cos + z sin, z' = -x sin + z cos). */
function worldOf(p: PropInstance, x: number, z: number): [number, number] {
  const sx = (p.scaleXYZ ?? [p.scale, p.scale, p.scale])[0] * x;
  const sz = (p.scaleXYZ ?? [p.scale, p.scale, p.scale])[2] * z;
  return [p.x + sx * Math.cos(p.rotY) + sz * Math.sin(p.rotY), p.z - sx * Math.sin(p.rotY) + sz * Math.cos(p.rotY)];
}

describe("the wooden dungeon door swings on its hinges", () => {
  const { map, content, door } = woodenDoor();
  const HINGE = 0.5945;

  it("stands in its frame when shut, and swings by a quarter turn about a hinge that does not move", () => {
    const r = recorder();
    const doors = new InteriorDoors(r.props, {});
    doors.show(map, content, new Set(), "t");
    expect(r.all(FRAME)).toHaveLength(1);
    const shut = r.all(LEAF)[0]!;
    expect(shut.rotY).toBeCloseTo(r.all(FRAME)[0]!.rotY);
    const hingeShut = worldOf(shut, HINGE, 0);

    doors.set(door.uid, true);
    doors.swingSeconds = 2;
    // halfway: drawn every frame under the other owner, turned by 45 degrees, the hinge still where it was
    doors.update(1);
    const half = r.all(LEAF);
    expect(half).toHaveLength(1);
    expect(shut.rotY - half[0]!.rotY).toBeCloseTo(Math.PI / 4);
    const hingeHalf = worldOf(half[0]!, HINGE, 0);
    expect(hingeHalf[0]).toBeCloseTo(hingeShut[0]);
    expect(hingeHalf[1]).toBeCloseTo(hingeShut[1]);

    doors.update(1.5);
    const open = r.all(LEAF);
    expect(open).toHaveLength(1);
    expect(shut.rotY - open[0]!.rotY).toBeCloseTo(Math.PI / 2);
    const hingeOpen = worldOf(open[0]!, HINGE, 0);
    expect(hingeOpen[0]).toBeCloseTo(hingeShut[0]);
    expect(hingeOpen[1]).toBeCloseTo(hingeShut[1]);
    expect(doors.isClosed(door.uid)).toBe(false);
  });

  it("opens in exactly the length of its sound, and may be walked through only once it has swung far enough", () => {
    const r = recorder();
    const doors = new InteriorDoors(r.props, {});
    doors.show(map, content, new Set(), "t");
    doors.swingSeconds = 2.672;
    doors.set(door.uid, true);
    expect(doors.isPassable(door.uid)).toBe(false);
    doors.update(2.672 * DOOR_PASSABLE - 0.05);
    expect(doors.isPassable(door.uid)).toBe(false);
    doors.update(0.1);
    expect(doors.isPassable(door.uid)).toBe(true);
    doors.update(2.672 * (1 - DOOR_PASSABLE) - 0.05 + 0.01);
    // done within the length of the sound: the leaf has gone back to the still owner and stands wide open
    const open = r.all(LEAF);
    expect(open).toHaveLength(1);
    expect(open[0]!.rotY).toBeCloseTo(r.all(FRAME)[0]!.rotY - Math.PI / 2);
  });

  it("a door that was open when the level was entered stands wide open at once", () => {
    const r = recorder();
    const doors = new InteriorDoors(r.props, {});
    doors.show(map, content, new Set([door.uid]), "t");
    expect(r.all(LEAF)[0]!.rotY).toBeCloseTo(r.all(FRAME)[0]!.rotY - Math.PI / 2);
    expect(doors.isPassable(door.uid)).toBe(true);
  });
});
