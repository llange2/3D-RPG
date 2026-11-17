// Radial profile of a glb (y up): for 24 horizontal bands the smallest and largest radius from the axis (how a fountain, a column or a bowl is built). Usage: node tools/dev/model-profile.mjs <file.glb>
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(process.argv[2]);
const pts = [];
for (const mesh of doc.getRoot().listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute("POSITION");
    const a = pos.getArray();
    for (let i = 0; i < a.length; i += 3) pts.push([a[i], a[i + 1], a[i + 2]]);
  }
}
let minY = Infinity, maxY = -Infinity;
for (const p of pts) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
console.log("vertices", pts.length, "y", minY.toFixed(3), maxY.toFixed(3));
const bands = 24;
const h = (maxY - minY) / bands;
for (let b = 0; b < bands; b++) {
  const lo = minY + b * h;
  const hi = lo + h;
  let rMax = 0;
  let rMin = Infinity;
  let n = 0;
  for (const p of pts) {
    if (p[1] >= lo && p[1] < hi + (b === bands - 1 ? 1e-6 : 0)) {
      const r = Math.hypot(p[0], p[2]);
      rMax = Math.max(rMax, r);
      rMin = Math.min(rMin, r);
      n++;
    }
  }
  console.log(`y ${(lo - minY).toFixed(2)}-${(hi - minY).toFixed(2)} (above base)  n=${String(n).padStart(5)}  r ${n ? rMin.toFixed(2) : "-"} .. ${n ? rMax.toFixed(2) : "-"}`);
}
