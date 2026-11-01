import { DECO, GROUND, wrapDelta } from "./types";
import type { World } from "./world";

/**
 * The pirate ship of ue_quest_4 (quest document 1.4): it starts in the middle of the largest ocean, sails three fields a step towards a party that is in sight, over deep and shallow
 * water alike, and comes back a week after it has met the party. This file is only the geometry (where the home is, which way the ship takes); what the ship does with the party is
 * `Game.pirateTurn`. A pure function of the world seed: no randomness, nothing of the generated world changes, so no `GEN_VERSION`.
 */

/** Fields the ship sails in one step of the party. */
export const PIRATE_SPEED = 3;
/** A week of game time (minutes): how long the ship stays away after a meeting. */
export const PIRATE_RETURN_MINUTES = 7 * 24 * 60;

export interface Spot {
  x: number;
  y: number;
}

/** The spacing of the samples that find the ocean: the ocean is wide, a coarse grid sees it as well as every single tile and is four times faster. */
const SAMPLE = 2;

const homes = new WeakMap<World, Spot | null>();

/** Water the ship sails on: deep or shallow, with nothing standing in it (a bridge or a place on it is no water). */
export function pirateSails(world: World, x: number, y: number): boolean {
  const t = world.tile(x, y);
  return (t.ground === GROUND.WATER || t.ground === GROUND.SHALLOW) && t.deco === DECO.NONE && t.poiId === null;
}

/**
 * Where the ship starts: the deep-water tile of the largest ocean (the biggest body of deep water, the globe wraps round) that lies farthest from any land, so in its middle. Null in a world
 * with no deep water at all.
 */
export function pirateHome(world: World): Spot | null {
  if (homes.has(world)) return homes.get(world)!;
  const gw = Math.ceil(world.width / SAMPLE);
  const gh = Math.ceil(world.height / SAMPLE);
  const n = gw * gh;
  const deep = new Uint8Array(n);
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) deep[gy * gw + gx] = world.tile(gx * SAMPLE, gy * SAMPLE).ground === GROUND.WATER ? 1 : 0;
  const around = (i: number): number[] => {
    const x = i % gw;
    const y = (i - x) / gw;
    return [y * gw + ((x + 1) % gw), y * gw + ((x + gw - 1) % gw), ((y + 1) % gh) * gw + x, ((y + gh - 1) % gh) * gw + x];
  };
  // the bodies of deep water: the one with the most samples is the ocean
  const body = new Int32Array(n).fill(-1);
  const sizes: number[] = [];
  for (let s = 0; s < n; s++) {
    if (!deep[s] || body[s]! >= 0) continue;
    const id = sizes.length;
    let count = 0;
    const queue = [s];
    body[s] = id;
    for (let head = 0; head < queue.length; head++) {
      count++;
      for (const j of around(queue[head]!)) if (deep[j] && body[j]! < 0) {
        body[j] = id;
        queue.push(j);
      }
    }
    sizes.push(count);
  }
  if (sizes.length === 0) {
    homes.set(world, null);
    return null;
  }
  let ocean = 0;
  sizes.forEach((c, id) => {
    if (c > sizes[ocean]!) ocean = id;
  });
  // the distance of every sample to the nearest one that is not deep water
  const far = new Int32Array(n).fill(-1);
  const queue: number[] = [];
  for (let i = 0; i < n; i++) if (!deep[i]) {
    far[i] = 0;
    queue.push(i);
  }
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head]!;
    for (const j of around(i)) if (far[j]! < 0) {
      far[j] = far[i]! + 1;
      queue.push(j);
    }
  }
  let best = -1;
  for (let i = 0; i < n; i++) if (body[i] === ocean && (best < 0 || far[i]! > far[best]!)) best = i;
  const home = { x: (best % gw) * SAMPLE, y: Math.floor(best / gw) * SAMPLE };
  homes.set(world, home);
  return home;
}

/** The distance in fields between two places of the globe (the larger of the two axes). */
export function pirateDistance(world: World, a: Spot, b: Spot): number {
  return Math.max(Math.abs(wrapDelta(a.x, b.x, world.width)), Math.abs(wrapDelta(a.y, b.y, world.height)));
}

/**
 * One step of the ship: up to `PIRATE_SPEED` fields over water towards the party. The fields that can be reached within a window round the ship are searched (four directions, like the
 * party walks); the ship takes the way to the one that is nearest to the party, and stops as soon as it is next to it. `blocked` names fields that are taken (a sea monster, the party's own
 * field). Returns the place where the ship is afterwards (canonical coordinates of the world), the same place if there is no way that brings it nearer.
 */
export function pirateSail(world: World, ship: Spot, party: Spot, blocked: (x: number, y: number) => boolean): Spot {
  // everything is worked out in fields from the ship, so that the seam of the globe does not matter
  const px = wrapDelta(ship.x, party.x, world.width);
  const py = wrapDelta(ship.y, party.y, world.height);
  const reach = Math.max(Math.abs(px), Math.abs(py)) + 4;
  const side = reach * 2 + 1;
  const key = (ox: number, oy: number) => (oy + reach) * side + (ox + reach);
  const from = new Map<number, number>();
  const dist = new Map<number, number>();
  const queue: [number, number][] = [[0, 0]];
  from.set(key(0, 0), -1);
  dist.set(key(0, 0), 0);
  const gap = (ox: number, oy: number) => Math.max(Math.abs(px - ox), Math.abs(py - oy));
  let target: [number, number] = [0, 0];
  for (let head = 0; head < queue.length; head++) {
    const [ox, oy] = queue[head]!;
    const d = dist.get(key(ox, oy))!;
    // the nearest to the party, and the shortest way among equals
    if (gap(ox, oy) < gap(target[0], target[1])) target = [ox, oy];
    if (gap(ox, oy) <= 1) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = ox + dx;
      const ny = oy + dy;
      if (Math.abs(nx) > reach || Math.abs(ny) > reach || dist.has(key(nx, ny))) continue;
      if (nx === px && ny === py) continue;
      const wx = world.wrapX(ship.x + nx);
      const wy = world.wrapY(ship.y + ny);
      if (!pirateSails(world, wx, wy) || blocked(wx, wy)) continue;
      dist.set(key(nx, ny), d + 1);
      from.set(key(nx, ny), key(ox, oy));
      queue.push([nx, ny]);
    }
  }
  // the way back from the target to the ship, then its first `PIRATE_SPEED` fields
  const way: [number, number][] = [];
  let at: number = key(target[0], target[1]);
  while (at !== key(0, 0) && at !== -1) {
    way.push([(at % side) - reach, Math.floor(at / side) - reach]);
    at = from.get(at)!;
  }
  way.reverse();
  let [x, y] = [0, 0];
  for (const step of way.slice(0, PIRATE_SPEED)) {
    [x, y] = step;
    if (gap(x, y) <= 1) break;
  }
  return { x: world.wrapX(ship.x + x), y: world.wrapY(ship.y + y) };
}
