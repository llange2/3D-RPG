import { poiBounds, type Poi } from "../world/types";
import type { MapViewport } from "./mapView";

/**
 * The search field of the big map (user, 12. 11. 2026): from the third letter on, every place whose name contains the text is marked with a red ring, and the ring stays
 * at any zoom (a ring of a fixed minimum size, not the size of the place, which is a few pixels on the map of the whole world). Pure arithmetic and drawing, no game state.
 */

/** The fewest letters that search. */
export const SEARCH_MIN_LETTERS = 3;

/** What a search needs to know of the world: the places. Whether the party has seen one is asked of the caller (`searchPlaces` `known`): a place it has never seen is not on its map and is not given away. */
export interface SearchableWorld {
  allPois(): readonly Poi[];
}

/** The text that is searched for: trimmed and without case, or null while it is too short. */
export function searchTerm(text: string): string | null {
  const term = text.trim().toLowerCase();
  return term.length >= SEARCH_MIN_LETTERS ? term : null;
}

/** The places whose name contains the text (`*text*`) and that `known` allows, in the order of the world. */
export function searchPlaces(world: SearchableWorld, text: string, known: (poi: Poi) => boolean): Poi[] {
  const term = searchTerm(text);
  if (term === null) return [];
  return world.allPois().filter((p) => p.name.toLowerCase().includes(term) && known(p));
}

/** The smallest ring in pixels (the radius), so that a place can be found on the map of the whole world. */
const RING_MIN = 12;

/**
 * Draws a ring round each place that is in the picture. `side` is the width of the canvas in pixels; a view shows `view.cells` tiles across, and the middle tile is the one
 * `view.x`/`view.y` (the same arithmetic as `cellAt` the other way round). The ring is red with a dark edge on either side, so that it shows on grass, snow and lava.
 */
export function drawSearchMarks(ctx: CanvasRenderingContext2D, side: number, view: MapViewport, places: readonly Poi[]): void {
  ctx.clearRect(0, 0, side, side);
  if (places.length === 0) return;
  const s = side / view.cells;
  const half = Math.floor(view.cells / 2);
  for (const poi of places) {
    const b = poiBounds(poi);
    const cx = (b.x0 + poi.size / 2 - view.x + half) * s;
    const cy = (b.y0 + poi.size / 2 - view.y + half) * s;
    const r = Math.max(RING_MIN, poi.size * s * 0.8 + 5);
    // a place just outside the picture would draw part of its ring in: leave it to the edge
    if (cx < -r || cy < -r || cx > side + r || cy > side + r) continue;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.lineWidth = 7;
    ctx.strokeStyle = "#000000cc";
    ctx.stroke();
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#ff1a1a";
    ctx.stroke();
  }
}
