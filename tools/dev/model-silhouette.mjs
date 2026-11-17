// Draws a glb as point silhouettes (front: x/y, side: z/y, top: x/z) with a grid in model units, to find where things are on a model (the mouth of a horn, the water level of a basin).
// Usage: node tools/dev/model-silhouette.mjs <file.glb> <out.png> [pixelsPerUnit=300]
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import sharp from "sharp";

const [file, out, ppuArg] = process.argv.slice(2);
const ppu = Number(ppuArg ?? 300);
const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(file);
const pts = [];
for (const mesh of doc.getRoot().listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    const a = prim.getAttribute("POSITION").getArray();
    for (let i = 0; i < a.length; i += 3) pts.push([a[i], a[i + 1], a[i + 2]]);
  }
}
const lo = [Infinity, Infinity, Infinity];
const hi = [-Infinity, -Infinity, -Infinity];
for (const p of pts) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
console.log("min", lo.map((v) => v.toFixed(3)).join(" "), "max", hi.map((v) => v.toFixed(3)).join(" "));
const pad = 0.1;
const span = (k) => hi[k] - lo[k] + 2 * pad;
const views = [
  { h: 0, v: 1, flipV: true, name: "front x/y" },
  { h: 2, v: 1, flipV: true, name: "side z/y" },
  { h: 0, v: 2, flipV: false, name: "top x/z" },
];
const w = Math.ceil(Math.max(span(0), span(2)) * ppu);
const hh = Math.ceil(Math.max(span(1), span(2)) * ppu);
const W = w * views.length;
const buf = Buffer.alloc(W * hh * 3, 255);
const put = (x, y, r, g, b) => { if (x >= 0 && y >= 0 && x < W && y < hh) { const o = (y * W + x) * 3; buf[o] = r; buf[o + 1] = g; buf[o + 2] = b; } };
views.forEach((view, vi) => {
  for (const p of pts) {
    const x = Math.round((p[view.h] - lo[view.h] + pad) * ppu) + vi * w;
    const y = view.flipV ? Math.round((hi[view.v] - p[view.v] + pad) * ppu) : Math.round((p[view.v] - lo[view.v] + pad) * ppu);
    put(x, y, 60, 60, 60);
  }
  // grid every 0.1 unit (dim), every 0.5 (strong); the origin lines in red
  for (let u = Math.ceil(lo[view.h] * 10) / 10; u <= hi[view.h]; u += 0.1) {
    const x = Math.round((u - lo[view.h] + pad) * ppu) + vi * w;
    const strong = Math.abs(u * 2 - Math.round(u * 2)) < 1e-6;
    if (strong) for (let y = 0; y < hh; y += 2) put(x, y, Math.abs(u) < 1e-6 ? 255 : 130, 140, 255);
  }
  for (let u = Math.ceil(lo[view.v] * 10) / 10; u <= hi[view.v]; u += 0.1) {
    const y = view.flipV ? Math.round((hi[view.v] - u + pad) * ppu) : Math.round((u - lo[view.v] + pad) * ppu);
    const strong = Math.abs(u * 2 - Math.round(u * 2)) < 1e-6;
    for (let x = vi * w; x < (vi + 1) * w; x += strong ? 2 : 6) put(x, y, strong ? (Math.abs(u) < 1e-6 ? 255 : 130) : 200, strong ? 140 : 200, strong ? 255 : 255);
  }
});
await sharp(buf, { raw: { width: W, height: hh, channels: 3 } }).png().toFile(out);
console.log("written", out, `${W}x${hh}`, views.map((v) => v.name).join(" | "));
