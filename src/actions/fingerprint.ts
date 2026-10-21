import { generateInterior, interiorHash } from "../interiors";
import { World } from "../world/world";
import { buildMapContent } from "./index";

export interface InteriorFingerprint {
  id: string;
  /** Cells, rooms, spawn, exit, lots and theme (see interiorHash). */
  map: number;
  /** FNV-1a over the JSON of the actions and spawns the rule engine placed. */
  content: number;
}

function fnv(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i) & 0xff;
    h = Math.imul(h, 0x01000193);
    h ^= text.charCodeAt(i) >>> 8;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Hashes of every POI interior (and its actions) in the given regions. Used to compare Node against the browser. */
export function interiorFingerprints(seed: string, regions: [number, number][]): InteriorFingerprint[] {
  const world = new World(seed);
  const out: InteriorFingerprint[] = [];
  for (const [rx, ry] of regions) {
    for (const poi of world.region(rx, ry).pois) {
      const map = generateInterior(world, poi);
      const content = buildMapContent(world, poi, map);
      out.push({ id: poi.id, map: interiorHash(map), content: fnv(JSON.stringify(content)) });
    }
  }
  return out;
}
