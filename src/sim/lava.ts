/**
 * What a step on lava does to the party (the user's rule, 28th playtest): every hero who is not dead takes `LAVA_DAMAGE` points of fire damage per step, cut
 * down like every other hit of fire: by the hero's fire resistance, by Protection from Elementals (fire; as many points as the caster has levels) and by the Fairy.
 * A hovering party (Levitate) does not touch the lava.
 */
import type { Rng } from "../core/rng";
import { anyoneLeft, isAlive } from "./character";
import { applyHit, elementalDamage } from "./combat";
import { hasEffect } from "./party";
import type { Condition, Party } from "./types";

export const LAVA_DAMAGE = 25;

export interface LavaHit {
  character: number;
  damage: number;
  conditions: Condition[];
}

export interface LavaStep {
  /** Everybody who was burnt (heroes whose protection took all of it are not listed). */
  hits: LavaHit[];
  /** True when nobody is left who can act. */
  defeated: boolean;
}

export function walkOnLava(party: Party, rng: Rng): LavaStep {
  const none: LavaStep = { hits: [], defeated: false };
  if (hasEffect(party, "levitate")) return none;
  const hits: LavaHit[] = [];
  party.characters.forEach((c, i) => {
    if (!isAlive(c)) return;
    const amount = elementalDamage(party, c, "fire", LAVA_DAMAGE);
    if (amount <= 0) return;
    const hit = applyHit(party, i, amount, null, rng);
    if (hit.damage > 0) hits.push({ character: i, damage: hit.damage, conditions: hit.conditions });
  });
  return { hits, defeated: hits.length > 0 && !anyoneLeft(party.characters) };
}
