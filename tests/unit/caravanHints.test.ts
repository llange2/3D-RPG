import { describe, expect, it } from "vitest";
import { hintTale } from "../../src/data/caravan-hints";
import { holderOf, caravansIn, caravansOf, wagonTale } from "../../src/world/caravans";
import { hutIndex } from "../../src/world/huts";
import { overworldMascotSpots } from "../../src/world/mascots";
import { poiBounds } from "../../src/world/types";
import { World } from "../../src/world/world";

const SEEDS = ["test", "cedar-peak-198", "birch-reach-493"];

/** The locked dungeons and pyramids of a world. */
const locked = (world: World) => world.allPois().filter((p) => p.kind === "dungeon" && world.dungeonRef(p.id)?.requires);

describe("the wagons near locked places (49th playtest, point 1)", () => {
  it("puts one wagon within three tiles of nearly every locked dungeon and pyramid, standing clear of the entrance, the mascots and the huts", () => {
    let total = 0;
    let withWagon = 0;
    for (const seed of SEEDS) {
      const world = new World(seed, "default");
      const again = new World(seed, "default");
      const taken = [...overworldMascotSpots(world), ...hutIndex(world).huts];
      for (const place of locked(world)) {
        total++;
        const list = caravansOf(world, place);
        expect(list.length, `${seed} ${place.id}`).toBeLessThanOrEqual(1);
        const wagon = list[0];
        if (!wagon) continue;
        withWagon++;
        const b = poiBounds(place);
        const away = Math.max(b.x0 - wagon.x, wagon.x - b.x1, b.y0 - wagon.y, wagon.y - b.y1);
        // (the ground of a lava island has nowhere to stand: those places have no wagon; elsewhere three tiles hold except in a few squeezed spots)
        expect(away, `${seed} ${place.id}`).toBeGreaterThanOrEqual(1);
        expect(away, `${seed} ${place.id}`).toBeLessThanOrEqual(8);
        expect(world.poiAtEntrance(wagon.x, wagon.y), `${seed} ${place.id} blocks the entrance`).toBeNull();
        expect(taken.some((o) => Math.max(Math.abs(o.x - wagon.x), Math.abs(o.y - wagon.y)) < 2), `${seed} ${place.id} next to a mascot or hut`).toBe(false);
        expect(wagon.talent).toBeNull();
        expect(wagon.hint?.place).toBe(place.id);
        // the same world always puts it in the same place
        expect(caravansOf(again, place)[0]).toMatchObject({ x: wagon.x, y: wagon.y, cottage: wagon.cottage });
      }
    }
    expect(total).toBeGreaterThan(30);
    expect(withWagon / total).toBeGreaterThan(0.9);
  });

  it("sends the party to the place that holds what the locked place asks for", () => {
    for (const seed of SEEDS) {
      const world = new World(seed, "default");
      for (const place of locked(world)) {
        const wagon = caravansOf(world, place)[0];
        if (!wagon?.hint) continue;
        const holder = holderOf(world, wagon.hint.need)!;
        expect(holder, `${seed} ${place.id}`).toBeDefined();
        expect(wagon.hint.holder).toBe(holder.id);
        const tale = wagonTale(world, wagon)!;
        expect(tale).toContain(place.name);
        expect(tale).toContain(holder.name);
        // the thing itself is circumscribed: a key card is never called a key card
        expect(tale.toLowerCase()).not.toContain("keycard");
        expect(tale.toLowerCase()).not.toContain("key card");
      }
    }
  });

  it("is not part of the wagons the mascots and the huts step round, and is found by the game's own search", () => {
    const world = new World("test", "default");
    const place = locked(world).find((p) => caravansOf(world, p).length > 0)!;
    const x = place.x;
    const y = place.y;
    expect(caravansIn(world, x - 12, y - 12, x + 12, y + 12).some((c) => c.hint)).toBe(false);
    expect(caravansIn(world, x - 12, y - 12, x + 12, y + 12, true).some((c) => c.hint?.place === place.id)).toBe(true);
  });
});

describe("the tales", () => {
  const base = { need: "quest_green_keycard", place: "the Tomb of Zanara", holder: "the Cave of Kela", cottage: false };
  it("names both places, calls a card an artifact and a key a key of its colour", () => {
    for (let variant = 0; variant < 60; variant++) {
      const card = hintTale({ ...base, variant });
      expect(card).toContain("Tomb of Zanara");
      expect(card).toContain("Cave of Kela");
      expect(card).toContain("green");
      expect(card).not.toMatch(/key ?card/i);
      expect(card).not.toContain("{");
      const key = hintTale({ ...base, need: "quest_key_golden", variant });
      expect(key).toMatch(/golden key/);
      expect(key).not.toContain("{");
    }
  });
  it("speaks of the cottage or the caravan the party stands in", () => {
    expect(hintTale({ ...base, variant: 0, cottage: true })).toContain("cottage");
    expect(hintTale({ ...base, variant: 0, cottage: false })).toContain("caravan");
  });
  it("starts a quoted sentence with a capital letter", () => {
    for (let variant = 0; variant < 200; variant++) expect(hintTale({ ...base, variant })).not.toMatch(/"the /);
  });
});
