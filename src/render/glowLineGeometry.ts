/**
 * Geometry and picture of the light lines that run over a floor (`glowLines.ts`). No Babylon in here, so that the unit tests can run it: the mesh
 * is a flat ribbon along a polyline, the glow is the soft cross-section of its texture (a bright core and a halo that fades out to the edges),
 * and the pulses that run along it are a texture that scrolls.
 */

export interface Point2 {
  x: number;
  z: number;
}

export interface Ribbon {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
}

/** Length of the line, in world units, that one pulse of the texture covers (two cells). */
export const PULSE_LENGTH = 6;
/** Width of the ribbon including the halo, in world units (a cell is 3): the core of the line is a fifth of it. */
export const RIBBON_WIDTH = 1.5;

/**
 * A flat ribbon of `width` along the polyline `path` (world x/z) at height `y`. Corners are mitred, so that a bend has no gap and no overlap. U runs along the
 * line in pulses (`PULSE_LENGTH` units each), V across it from 0 to 1 (the middle of the line is 0.5).
 */
export function ribbonAlong(path: readonly Point2[], width: number, y: number, pulse = PULSE_LENGTH): Ribbon {
  const out: Ribbon = { positions: [], normals: [], uvs: [], indices: [] };
  // consecutive points that coincide would have no direction
  const pts = path.filter((p, i) => i === 0 || p.x !== path[i - 1]!.x || p.z !== path[i - 1]!.z);
  if (pts.length < 2) return out;
  const half = width / 2;
  // unit direction of every segment, and its left normal in the x/z plane
  const dirs = pts.slice(1).map((p, i) => {
    const a = pts[i]!;
    const len = Math.hypot(p.x - a.x, p.z - a.z);
    return { x: (p.x - a.x) / len, z: (p.z - a.z) / len };
  });
  let along = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    if (i > 0) along += Math.hypot(p.x - pts[i - 1]!.x, p.z - pts[i - 1]!.z);
    const before = dirs[Math.max(0, i - 1)]!;
    const after = dirs[Math.min(dirs.length - 1, i)]!;
    const n1 = { x: -before.z, z: before.x };
    const n2 = { x: -after.z, z: after.x };
    // the mitre: the sum of both normals over one plus their dot product reaches the corner of the two edges (a right angle: the sum itself)
    const k = 1 / Math.max(0.2, 1 + n1.x * n2.x + n1.z * n2.z);
    const mx = (n1.x + n2.x) * k * half;
    const mz = (n1.z + n2.z) * k * half;
    const base = out.positions.length / 3;
    out.positions.push(p.x + mx, y, p.z + mz, p.x - mx, y, p.z - mz);
    out.normals.push(0, 1, 0, 0, 1, 0);
    out.uvs.push(along / pulse, 1, along / pulse, 0);
    if (i > 0) out.indices.push(base - 2, base - 1, base, base - 1, base + 1, base);
  }
  return out;
}

/** The world points of a line given by waypoint cells (consecutive ones share a row or a column), one point per waypoint. */
export function waypointsToPath(points: readonly { x: number; y: number }[], cellCenterX: (x: number) => number, cellCenterZ: (y: number) => number): Point2[] {
  return points.map((p) => ({ x: cellCenterX(p.x), z: cellCenterZ(p.y) }));
}

/** Every grid cell a line of waypoint cells passes over, in order (the corner cells once). Waypoints that are neither in a row nor in a column are not a line. */
export function cellsOfLine(points: readonly { x: number; y: number }[]): { x: number; y: number }[] {
  const cells: { x: number; y: number }[] = [];
  const add = (x: number, y: number): void => {
    const last = cells[cells.length - 1];
    if (!last || last.x !== x || last.y !== y) cells.push({ x, y });
  };
  points.forEach((p, i) => {
    if (i === 0) return add(p.x, p.y);
    const a = points[i - 1]!;
    if (a.x !== p.x && a.y !== p.y) throw new Error(`light line: ${a.x},${a.y} to ${p.x},${p.y} is not straight`);
    const dx = Math.sign(p.x - a.x);
    const dy = Math.sign(p.y - a.y);
    const steps = Math.abs(p.x - a.x) + Math.abs(p.y - a.y);
    for (let s = 1; s <= steps; s++) add(a.x + dx * s, a.y + dy * s);
  });
  return cells;
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Brightness of the picture of a line at `u` along one pulse (0 to 1) and `across` the line (0 to 1, the middle 0.5): a core, a halo around it that fades out to
 * the edge (zero there, so that the ribbon has no visible rim), and a pulse that runs along: the line always glows a little, the pulse is the bright part.
 */
export function glowAt(u: number, across: number): number {
  const d = Math.abs(across - 0.5) * 2;
  const core = 1 - smooth(0.14, 0.24, d);
  const halo = Math.pow(1 - smooth(0.1, 1, d), 2.2) * 0.6;
  const wrapped = Math.abs(u - 0.5);
  const pulse = Math.exp(-Math.pow(wrapped / 0.16, 2));
  return Math.max(core, halo) * (0.3 + 0.7 * pulse);
}

/**
 * The pixels (RGBA, row after row) of the picture of a line of the colour `rgb` (0 to 255 each): every pixel has the full colour, the alpha is the brightness, and
 * additive blending multiplies the two. (A canvas would premultiply the colour and lose the hue of the faint halo, so the picture is a raw texture.)
 */
export function glowPixels(width: number, height: number, rgb: readonly [number, number, number]): Uint8Array {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = rgb[0];
      data[i + 1] = rgb[1];
      data[i + 2] = rgb[2];
      data[i + 3] = Math.round(255 * glowAt((x + 0.5) / width, (y + 0.5) / height));
    }
  }
  return data;
}
