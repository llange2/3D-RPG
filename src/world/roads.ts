/** A tile of the grid, as a point of a road. */
export interface Pt {
  x: number;
  y: number;
}

/**
 * One straight, one-tile-wide piece of a road, both ends inclusive. Roads are chains of such pieces with right-angle bends (no diagonals,
 * no wobble): the party moves one tile at a time and turns by quarter turns, so a staircase of single steps is hard to steer and a
 * straight road is easy. The old outside map draws its roads as a single row of dirt tiles as well.
 *
 * The ways of a lava island are such pieces too (`lava`): a stream of lava one or two tiles wide that runs through the mountains and takes the place of a
 * road. A piece two tiles wide has its second row on the side of the larger coordinate.
 */
export class RoadSeg {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  /** Runs along x (a single tile counts as horizontal). */
  readonly horizontal: boolean;
  /** A stream of lava on a lava island, not a road. */
  readonly lava: boolean;
  /** The tiles across the piece (1 or 2). */
  readonly width: number;

  constructor(a: Pt, b: Pt, width = 1, lava = false) {
    if (a.x !== b.x && a.y !== b.y) throw new Error(`road piece ${a.x}/${a.y} to ${b.x}/${b.y} is not straight`);
    this.x0 = Math.min(a.x, b.x);
    this.x1 = Math.max(a.x, b.x);
    this.y0 = Math.min(a.y, b.y);
    this.y1 = Math.max(a.y, b.y);
    this.horizontal = a.y === b.y;
    this.width = width;
    this.lava = lava;
    if (width > 1) {
      if (this.horizontal) this.y1 += width - 1;
      else this.x1 += width - 1;
    }
  }

  /** The same piece as a stream of lava `width` tiles wide. */
  asLava(width: number): RoadSeg {
    return new RoadSeg({ x: this.x0, y: this.y0 }, this.horizontal ? { x: this.x0 + (this.x1 - this.x0), y: this.y0 } : { x: this.x0, y: this.y1 }, width, true);
  }

  /** The fixed coordinate across the road. */
  get cross(): number {
    return this.horizontal ? this.y0 : this.x0;
  }

  /** First and last coordinate along the road. */
  get from(): number {
    return this.horizontal ? this.x0 : this.y0;
  }

  get to(): number {
    return this.horizontal ? this.x1 : this.y1;
  }

  contains(x: number, y: number): boolean {
    return x >= this.x0 && x <= this.x1 && y >= this.y0 && y <= this.y1;
  }

  /** Chebyshev distance from a tile to the nearest tile of the piece (0 on it). */
  distance(x: number, y: number): number {
    const dx = x < this.x0 ? this.x0 - x : x > this.x1 ? x - this.x1 : 0;
    const dy = y < this.y0 ? this.y0 - y : y > this.y1 ? y - this.y1 : 0;
    return Math.max(dx, dy);
  }

  /** True when the piece comes within `margin` tiles of the rectangle (inclusive). */
  near(x0: number, y0: number, x1: number, y1: number, margin: number): boolean {
    return this.x0 <= x1 + margin && this.x1 >= x0 - margin && this.y0 <= y1 + margin && this.y1 >= y0 - margin;
  }
}

/** The pieces of the road that runs through the points in order; consecutive points share an x or a y. Points that repeat are skipped. */
export function roadThrough(points: readonly Pt[]): RoadSeg[] {
  const out: RoadSeg[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    if (a.x === b.x && a.y === b.y) continue;
    out.push(new RoadSeg(a, b));
  }
  return out;
}
