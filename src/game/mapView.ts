/**
 * The big map can be zoomed and moved. A view is the cell in its middle and how many cells it shows across; the canvas draws that
 * square, and the pointer (as a fraction of the canvas) is turned back into a cell the same way. Pure arithmetic, no DOM.
 */
export interface MapViewport {
  /** The cell in the middle of the picture. */
  x: number;
  y: number;
  /** Cells across the picture; always odd, so that the middle is a cell and not the border of two. */
  cells: number;
}

/** What zooming may do: the fewest and the most cells across. */
export interface ZoomLimits {
  min: number;
  max: number;
}

const oddUp = (n: number): number => {
  const r = Math.round(n);
  return r % 2 === 0 ? r + 1 : r;
};
const oddDown = (n: number): number => {
  const r = Math.floor(n);
  return r % 2 === 0 ? r - 1 : r;
};

/** The nearest odd number of cells inside the limits. */
export function clampCells(cells: number, limits: ZoomLimits): number {
  const lo = oddUp(limits.min);
  const hi = Math.max(lo, oddDown(limits.max));
  return Math.max(lo, Math.min(hi, oddUp(cells)));
}

/** The cell under a point of the picture (`fx`, `fy` from 0 to 1 across and down). */
export function cellAt(view: MapViewport, fx: number, fy: number): { x: number; y: number } {
  const half = Math.floor(view.cells / 2);
  return { x: view.x + Math.floor(fx * view.cells) - half, y: view.y + Math.floor(fy * view.cells) - half };
}

/**
 * Shows `cells` across instead, and keeps the spot under the point (`fx`, `fy`; the middle of the picture by default) where it
 * is, so that zooming in on something does not push it out of the picture.
 */
export function zoomTo(view: MapViewport, cells: number, limits: ZoomLimits, fx = 0.5, fy = 0.5): MapViewport {
  const next = clampCells(cells, limits);
  if (next === view.cells) return view;
  const half = Math.floor(view.cells / 2);
  const nextHalf = Math.floor(next / 2);
  // the cell coordinate under the point is `x - half + fx * cells`; after the zoom it must come out the same
  const under = { x: view.x - half + fx * view.cells, y: view.y - half + fy * view.cells };
  return { x: Math.round(under.x + nextHalf - fx * next), y: Math.round(under.y + nextHalf - fy * next), cells: next };
}

/** One step of the wheel or of a zoom button: a quarter more or fewer cells (`direction` 1 zooms in, -1 out). */
export function zoomStep(view: MapViewport, direction: 1 | -1, limits: ZoomLimits, fx = 0.5, fy = 0.5): MapViewport {
  const factor = direction > 0 ? 1 / 1.25 : 1.25;
  let cells = view.cells * factor;
  // small maps move by whole cells: never stay on the same odd number
  if (clampCells(cells, limits) === view.cells) cells = view.cells + (direction > 0 ? -2 : 2);
  return zoomTo(view, cells, limits, fx, fy);
}

/** Moves the picture by whole cells. `bounds` (a map with an edge) keeps the middle inside it. */
export function panBy(view: MapViewport, dx: number, dy: number, bounds?: { width: number; height: number }): MapViewport {
  let x = view.x + dx;
  let y = view.y + dy;
  if (bounds) {
    x = Math.max(0, Math.min(bounds.width - 1, x));
    y = Math.max(0, Math.min(bounds.height - 1, y));
  }
  return { ...view, x, y };
}

/** Centres the picture on a cell. */
export const centreOn = (view: MapViewport, x: number, y: number): MapViewport => ({ ...view, x, y });

/** Zooms out until the whole map of `width` by `height` cells is in the picture, and centres it. */
export function fitMap(width: number, height: number, limits: ZoomLimits): MapViewport {
  return { x: Math.floor(width / 2), y: Math.floor(height / 2), cells: clampCells(Math.max(width, height) + 2, limits) };
}
