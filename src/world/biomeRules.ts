import type { MonsterDef } from "../data/tables";
import { BIOME, type Biome } from "./types";

/**
 * Where on the overworld a monster may stand by the climate of its island (Fantastic Islands only, user request of 24. 11. 2026, `docs/REGELN_GENERIERUNG.md`):
 * - a **cold** monster does not stand in the desert or on lava and is preferred on snow,
 * - a **fire** monster does not stand in the snow and is preferred in the desert and on lava,
 *
 * "but only where there is a choice": a place whose level has nothing else keeps what it has (the callers fall back to the whole pool), and the huts only get the ban (their spots follow
 * the distance from Starthaven, so a preference would break the order of the huts). Castles, dungeons, caves and towns are not part of this, they have their own groups.
 *
 * Cold and fire are not told by the resistance 1 alone (the Frost Imp has 0.75, the Frost Giant King 0.7, the Magma Crawler 0.75, the Ash Cultist and the Cinder Beetle 0.5): a monster is
 * of the element when its resistance is at least `ELEMENT_KIN` or when its attack is of that element. A monster that is both (the Wizard, the Terminator) may stand on neither.
 */
export const ELEMENT_KIN = 0.7;

/** How much more often a monster is drawn on the climate it prefers. */
export const PREFERRED_WEIGHT = 3;

export const isColdKin = (m: Pick<MonsterDef, "res_ice" | "attack_type">): boolean => m.res_ice >= ELEMENT_KIN || m.attack_type === "Ice";
export const isFireKin = (m: Pick<MonsterDef, "res_fire" | "attack_type">): boolean => m.res_fire >= ELEMENT_KIN || m.attack_type === "Fire";

/** May the monster stand on an island of this climate? */
export function biomeAllows(m: MonsterDef, biome: Biome): boolean {
  if (isColdKin(m) && (biome === BIOME.DESERT || biome === BIOME.LAVA)) return false;
  if (isFireKin(m) && biome === BIOME.SNOW) return false;
  return true;
}

/** Does the monster belong on an island of this climate more than on the others? */
export function biomePrefers(m: MonsterDef, biome: Biome): boolean {
  if (isColdKin(m) && biome === BIOME.SNOW) return true;
  if (isFireKin(m) && (biome === BIOME.DESERT || biome === BIOME.LAVA)) return true;
  return false;
}
