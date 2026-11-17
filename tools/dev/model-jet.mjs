// Measures the water column of the mermaid fountain (ci_89): around the axis (x, z) of the stream, per height, how far the vertices reach and what colour their texture has.
// Usage: node tools/dev/model-jet.mjs <file.glb> <axisX> <axisZ> [radius=0.12]
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import sharp from "sharp";

const [file, ax, az, rArg] = process.argv.slice(2);
const axisX = Number(ax);
const axisZ = Number(az);
const reach = Number(rArg ?? 0.12);
const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(file);
const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
const pos = prim.getAttribute("POSITION").getArray();
const uv = prim.getAttribute("TEXCOORD_0").getArray();
const image = prim.getMaterial().getBaseColorTexture().getImage();
const { data, info } = await sharp(Buffer.from(image)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const colour = (u, v) => {
  const x = Math.min(info.width - 1, Math.max(0, Math.floor((((u % 1) + 1) % 1) * info.width)));
  const y = Math.min(info.height - 1, Math.max(0, Math.floor((((v % 1) + 1) % 1) * info.height)));
  const o = (y * info.width + x) * 3;
  return [data[o], data[o + 1], data[o + 2]];
};
const bins = new Map();
for (let i = 0; i < pos.length / 3; i++) {
  const dx = pos[i * 3] - axisX;
  const dz = pos[i * 3 + 2] - axisZ;
  const r = Math.hypot(dx, dz);
  if (r > reach) continue;
  const y = Math.round(pos[i * 3 + 1] / 0.025) * 0.025;
  const key = y.toFixed(3);
  const b = bins.get(key) ?? { n: 0, rMin: 9, rMax: 0, col: [0, 0, 0] };
  b.n++;
  b.rMin = Math.min(b.rMin, r);
  b.rMax = Math.max(b.rMax, r);
  const c = colour(uv[i * 2], uv[i * 2 + 1]);
  for (let k = 0; k < 3; k++) b.col[k] += c[k];
  bins.set(key, b);
}
for (const [y, b] of [...bins].sort((p, q) => Number(q[0]) - Number(p[0]))) console.log(`y ${y} n ${b.n} r ${b.rMin.toFixed(3)}..${b.rMax.toFixed(3)} colour ${b.col.map((v) => Math.round(v / b.n)).join(",")}`);
