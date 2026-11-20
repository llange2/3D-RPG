/** Rooms of one place (a place without rooms has no boss room). Usage: DUNGEONS=maximum npx tsx tools/dev/boss-room.ts <seed> <size> <place id> */
import { generateInterior } from "../../src/interiors";
import type { WorldSize } from "../../src/world/types";
import { World } from "../../src/world/world";

const [seed = "alpha", size = "default", id = "p:0:0:1280"] = process.argv.slice(2);
const world = new World(seed, size as WorldSize, (process.env.DUNGEONS ?? "maximum") as never);
const map = generateInterior(world, world.poiById(id)!);
console.log("rooms", map.rooms.length, "layout", map.dungeon?.layout, JSON.stringify(map.rooms.slice(0, 4)));
