/**
 * Measures the wall reliefs (53rd playtest, point 4): how deep a relief may sink into the wall before the wall shows through it. The relief is looked at from the front (+z) into a depth
 * buffer; over the pixels it covers (its silhouette) the front-most surface lies at some z. A wall plane at `z` hides everything below it, so the wall "shines through" where the relief's
 * front-most surface is lower than the plane: the plane may go as high as the low percentiles of that surface (a few per cent of rounded edge are no harm).
 * The numbers are in model units of the file (the interior view scales them by `DECO_SCALE`).
 * Usage: node tools/dev/measure-relief.mjs <file.glb>...
 */
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const W = 320;
const H = 440;
for (const file of process.argv.slice(2)) {
  const doc = await io.read(file);
  const root = doc.getRoot();
  const tris = [];
  let xMin = Infinity;
  let xMax = -Infinity;
  let yMin = Infinity;
  let yMax = -Infinity;
  let zMin = Infinity;
  let zMax = -Infinity;
  for (const node of root.listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const m = node.getWorldMatrix();
    const at = (p, i) => {
      const [x, y, z] = p.getElement(i, []);
      return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
    };
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute("POSITION");
      const idx = prim.getIndices();
      const n = idx ? idx.getCount() : pos.getCount();
      for (let t = 0; t < n; t += 3) {
        const tri = [0, 1, 2].map((k) => at(pos, idx ? idx.getScalar(t + k) : t + k));
        tris.push(tri);
        for (const [x, y, z] of tri) {
          xMin = Math.min(xMin, x);
          xMax = Math.max(xMax, x);
          yMin = Math.min(yMin, y);
          yMax = Math.max(yMax, y);
          zMin = Math.min(zMin, z);
          zMax = Math.max(zMax, z);
        }
      }
    }
  }
  const depth = new Float32Array(W * H).fill(-Infinity);
  const px = (x) => ((x - xMin) / (xMax - xMin)) * (W - 1);
  const py = (y) => ((y - yMin) / (yMax - yMin)) * (H - 1);
  for (const [a, b, c] of tris) {
    const [ax, ay, bx, by, cx, cy] = [px(a[0]), py(a[1]), px(b[0]), py(b[1]), px(c[0]), py(c[1])];
    const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
    if (Math.abs(area) < 1e-9) continue;
    for (let y = Math.max(0, Math.floor(Math.min(ay, by, cy))); y <= Math.min(H - 1, Math.ceil(Math.max(ay, by, cy))); y++) {
      for (let x = Math.max(0, Math.floor(Math.min(ax, bx, cx))); x <= Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx))); x++) {
        const w0 = ((bx - x) * (cy - y) - (cx - x) * (by - y)) / area;
        const w1 = ((cx - x) * (ay - y) - (ax - x) * (cy - y)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < -0.02 || w1 < -0.02 || w2 < -0.02) continue;
        const z = w0 * a[2] + w1 * b[2] + w2 * c[2];
        if (z > depth[y * W + x]) depth[y * W + x] = z;
      }
    }
  }
  const covered = [...depth].filter((z) => z > -Infinity).sort((p, q) => p - q);
  const pct = (p) => covered[Math.floor((covered.length - 1) * p)].toFixed(3);
  console.log(
    `${file.split(/[\\/]/).pop()}: back ${zMin.toFixed(3)}, front ${zMax.toFixed(3)}; front-most surface over the silhouette (${covered.length} px): p1 ${pct(0.01)}, p3 ${pct(0.03)}, p5 ${pct(0.05)}, p10 ${pct(0.1)}, p25 ${pct(0.25)}, median ${pct(0.5)}`,
  );
}
