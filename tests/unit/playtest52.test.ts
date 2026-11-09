import { describe, expect, it } from "vitest";
import { generateInterior } from "../../src/interiors";
import { CELL } from "../../src/interiors/types";
import { BOW_MODEL, BOW_MONSTERS } from "../../src/data/equipment";
import { GRIP_TWEAK } from "../../src/render/equipment";
import { PirateShip } from "../../src/render/pirateShip";
import { World } from "../../src/world/world";
import { OVERVIEW_CELLS, packColor } from "../../src/game/minimapOverview";

/** The 52nd playtest: the king shuts no way, the pirate ship sails, the Archer has a bow, the zoomed-out map is a picture. */
describe("the king shuts no way (point 5)", () => {
  it("has a step round the king for every two open cells beside him that meet at a right angle", () => {
    let checked = 0;
    for (const seed of ["glade-keep-429", "cedar-peak-198", "amber-gate-204", "frost-mere-472", "alpha", "beta"]) {
      const world = new World(seed, "default", "default");
      for (const poi of world.allPois().filter((p) => p.kind === "castle")) {
        const map = generateInterior(world, poi);
        const { king, throne } = map.castle!;
        const floor = (x: number, y: number) => map.cells[y * map.width + x] === CELL.FLOOR;
        const beside = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).filter(([dx, dy]) => floor(king.x + dx, king.y + dy) && !(king.x + dx === throne.x && king.y + dy === throne.y));
        for (const [px, py] of beside) {
          for (const [qx, qy] of beside) {
            if (px * qx + py * qy !== 0) continue;
            expect(floor(king.x + px + qx, king.y + py + qy), `${seed} ${poi.name}: the corner beside the king at ${king.x}/${king.y}`).toBe(true);
            checked++;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("opens the corners in front of the king of Quinkeep, so that the chests beside him are reached from the cell in front of him", () => {
    const world = new World("glade-keep-429", "default", "default");
    const poi = world.allPois().find((p) => p.name === "Quinkeep")!;
    const map = generateInterior(world, poi);
    const { king } = map.castle!;
    const floor = (x: number, y: number) => map.cells[y * map.width + x] === CELL.FLOOR;
    // the king stands at 10/8 with the throne behind him: the cell in front of him (10/9) and both corners beside it are floor
    expect(king).toMatchObject({ x: 10, y: 8 });
    for (const x of [9, 10, 11]) expect(floor(x, 9), `${x}/9`).toBe(true);
  });
});

describe("the pirate ship sails between the fields (point 7)", () => {
  function fakeProps() {
    const seen: { x: number; z: number; rotY: number }[] = [];
    const props = {
      setInstances: (_owner: string, list: { x: number; z: number; rotY: number }[]) => void seen.push({ x: list[0]!.x, z: list[0]!.z, rotY: list[0]!.rotY }),
      removeOwner: () => undefined,
      setVisibility: () => undefined,
      flush: () => undefined,
    };
    return { props: props as unknown as ConstructorParameters<typeof PirateShip>[0], seen };
  }

  it("glides to a field three tiles on instead of jumping, and is there within half a second", () => {
    const { props, seen } = fakeProps();
    const ship = new PirateShip(props);
    ship.place(0, 0, 0);
    ship.place(9, 0, 0);
    seen.length = 0;
    ship.update(0.05);
    expect(seen.at(-1)!.x).toBeGreaterThan(0);
    expect(seen.at(-1)!.x).toBeLessThan(9);
    for (let i = 0; i < 10; i++) ship.update(0.05);
    expect(seen.at(-1)!.x).toBeCloseTo(9, 6);
  });

  it("jumps at once over a long way (the world's seam or a new start) and takes the shortest way round to a new heading", () => {
    const { props, seen } = fakeProps();
    const ship = new PirateShip(props);
    ship.place(0, 0, 0);
    ship.place(1200, 0, 0);
    ship.update(0);
    expect(seen.at(-1)!.x).toBeCloseTo(1200, 6);
    // from 170 degrees to -170: twenty degrees across the half turn, not three hundred and forty back
    ship.place(1200, 0, (170 * Math.PI) / 180);
    ship.update(10);
    ship.place(1200, 0, (-170 * Math.PI) / 180);
    ship.update(0.03);
    const turned = seen.at(-1)!.rotY - -Math.PI / 2;
    expect(Math.abs(Math.sin(turned) - Math.sin((170 * Math.PI) / 180))).toBeLessThan(0.2);
  });
});

describe("the Archer's bow (point 6)", () => {
  it("is a model of the equipment, in the Archer's hand, with a fit of its own", () => {
    expect(BOW_MODEL).toBe("wpn_bow");
    expect(BOW_MONSTERS.has(1)).toBe(true);
    expect(GRIP_TWEAK[BOW_MODEL]).toBeDefined();
  });
});

describe("the zoomed-out map (point 8)", () => {
  it("packs a colour as the opaque pixel of an image and switches to the picture before the detailed map gets slow", () => {
    expect(packColor(10, 7, 5)).toBe(0xff05070a);
    expect(packColor(255, 255, 255)).toBe(0xffffffff);
    // the detailed map draws a few thousand tiles at most up to here (the 640 px map shows 25 cells when it opens)
    expect(OVERVIEW_CELLS).toBeGreaterThan(25);
    expect(OVERVIEW_CELLS).toBeLessThan(121);
  });
});
