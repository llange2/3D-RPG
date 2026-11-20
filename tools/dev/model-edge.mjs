// Edge profile of a floor tile glb (y up): for each distance from the tile border the lowest and highest vertex height, and the most common heights. Usage: node tools/dev/model-edge.mjs <file.glb>
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(process.argv[2]);
const pts = [];
for (const mesh of doc.getRoot().listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    const a = prim.getAttribute("POSITION").getArray();
    for (let i = 0; i < a.length; i += 3) pts.push([a[i], a[i + 1], a[i + 2]]);
  }
}
// the files of the user stand upright (the thin side in z, `ModelSpec.rotateX` lays them down): the height is the thin axis
const ext = [0, 1, 2].map((a) => Math.max(...pts.map((p) => p[a])) - Math.min(...pts.map((p) => p[a])));
const H = ext.indexOf(Math.min(...ext));
const [A, B] = [0, 1, 2].filter((a) => a !== H);
console.log("extents", ext.map((e) => e.toFixed(4)).join(" "), "height axis", "xyz"[H]);
const half = Math.max(...pts.map((p) => Math.max(Math.abs(p[A]), Math.abs(p[B]))));
console.log("vertices", pts.length, "half", half.toFixed(4));
// by distance to the border (in 0.01 steps) the lowest and highest vertex heights
const bins = new Map();
for (const p of pts) {
  const d = half - Math.max(Math.abs(p[A]), Math.abs(p[B]));
  const k = Math.round(d / 0.005) * 0.005;
  const b = bins.get(k) ?? { lo: Infinity, hi: -Infinity, n: 0 };
  b.lo = Math.min(b.lo, p[H]);
  b.hi = Math.max(b.hi, p[H]);
  b.n++;
  bins.set(k, b);
}
for (const k of [...bins.keys()].sort((a, b) => a - b).slice(0, 14)) {
  const b = bins.get(k);
  console.log(`dist ${k.toFixed(3)}: y ${b.lo.toFixed(4)} .. ${b.hi.toFixed(4)} (${b.n})`);
}
// heights of the top surface: histogram of y in the interior
const ys = new Map();
for (const p of pts) {
  const k = p[H].toFixed(3);
  ys.set(k, (ys.get(k) ?? 0) + 1);
}
console.log([...ys.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, n]) => `${k}:${n}`).join("  "));

// the lowest point of the part that can be seen from above (a triangle facing up): a quad under the tile that reaches higher shines through the grooves
let lowestTop = Infinity;
const tops = new Map();
for (const mesh of doc.getRoot().listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute("POSITION").getArray();
    const idx = prim.getIndices()?.getArray() ?? Array.from({ length: pos.length / 3 }, (_, i) => i);
    for (let t = 0; t < idx.length; t += 3) {
      const v = [0, 1, 2].map((k) => [pos[idx[t + k] * 3], pos[idx[t + k] * 3 + 1], pos[idx[t + k] * 3 + 2]]);
      const e1 = v[1].map((c, i) => c - v[0][i]);
      const e2 = v[2].map((c, i) => c - v[0][i]);
      const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const len = Math.hypot(...n) || 1;
      if (n[H] / len > 0.5) {
        for (const p of v) {
          lowestTop = Math.min(lowestTop, p[H]);
          const k = p[H].toFixed(3);
          tops.set(k, (tops.get(k) ?? 0) + 1);
        }
      }
    }
  }
}
console.log("lowest vertex of an up-facing triangle:", lowestTop.toFixed(4), "(up = +" + "xyz"[H] + ")");
console.log("heights of up-facing vertices:", [...tops.entries()].sort((a, b) => Number(a[0]) - Number(b[0])).slice(0, 8).map(([k, n]) => `${k}:${n}`).join("  "));
