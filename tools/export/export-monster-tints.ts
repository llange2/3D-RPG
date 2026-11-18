/**
 * Reads the models of the monsters (`public/assets/models-original/monster_<id>.glb`) and writes the colour of each one to `src/data/monster-tints.json`: what the bits that fly off a
 * magical construct or a plant are tinted with (`render/hitFx.ts`, 18. 11. 2026). The colour is the DOMINANT colour of the model, not the average (the average of an orange cap on a blue
 * body is a muddy grey that is neither): the base colour picture is read at the UVs of the vertices (so that unused parts of a texture atlas do not count), the texels fall into 64 bins
 * (4 levels per channel), and the bin with the most texels, favouring saturated ones (a monster that is mostly grey stays grey, one with a colourful body gets the colour), gives the
 * colour (the mean of its texels). Texels that are see-through or dark (outlines, shadows) do not count; a material without a picture counts with its base colour factor.
 *
 * Usage: tsx tools/export/export-monster-tints.ts   (also `npm run data:tints`)
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import sharp from "sharp";

const ROOT = join(import.meta.dirname, "..", "..");
const REGISTER = join(ROOT, "public", "assets", "models.monsters.original.json");
const OUT = join(ROOT, "src", "data", "monster-tints.json");

interface Bin {
  n: number;
  r: number;
  g: number;
  b: number;
}

const register = JSON.parse(readFileSync(REGISTER, "utf8")) as Record<string, { file: string }>;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const tints: Record<string, [number, number, number]> = {};

for (const [id, entry] of Object.entries(register)) {
  const file = join(ROOT, "public", "assets", entry.file);
  if (!existsSync(file)) continue;
  const doc = await io.read(file);
  const bins = new Map<number, Bin>();
  const all: Bin = { n: 0, r: 0, g: 0, b: 0 };
  const add = (r: number, g: number, b: number): void => {
    all.n++;
    all.r += r;
    all.g += g;
    all.b += b;
    if (Math.max(r, g, b) < 75) return;
    const key = (r >> 6) * 16 + (g >> 6) * 4 + (b >> 6);
    const bin = bins.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    bin.n++;
    bin.r += r;
    bin.g += g;
    bin.b += b;
    bins.set(key, bin);
  };
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const material = prim.getMaterial();
      const uv = prim.getAttribute("TEXCOORD_0");
      const image = material?.getBaseColorTexture()?.getImage();
      const factor = material?.getBaseColorFactor() ?? [1, 1, 1, 1];
      if (!image || !uv) {
        add(factor[0]! * 255, factor[1]! * 255, factor[2]! * 255);
        continue;
      }
      const { data, info } = await sharp(Buffer.from(image)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const element: number[] = [0, 0];
      for (let i = 0; i < uv.getCount(); i++) {
        uv.getElement(i, element);
        const x = Math.min(info.width - 1, Math.max(0, Math.floor((((element[0]! % 1) + 1) % 1) * info.width)));
        const y = Math.min(info.height - 1, Math.max(0, Math.floor((((element[1]! % 1) + 1) % 1) * info.height)));
        const o = (y * info.width + x) * 4;
        if (data[o + 3]! < 128) continue;
        add(data[o]! * factor[0]!, data[o + 1]! * factor[1]!, data[o + 2]! * factor[2]!);
      }
    }
  }
  if (all.n === 0) continue;
  // the bin with the most texels, those of a saturated colour counting up to twice as much as grey ones
  let best: Bin | null = null;
  let bestScore = 0;
  for (const bin of bins.values()) {
    const [r, g, b] = [bin.r / bin.n, bin.g / bin.n, bin.b / bin.n];
    const top = Math.max(r, g, b);
    const saturation = top > 0 ? (top - Math.min(r, g, b)) / top : 0;
    const score = bin.n * (1 + saturation);
    if (score > bestScore) {
      best = bin;
      bestScore = score;
    }
  }
  const pick = best ?? all;
  tints[id] = [pick.r, pick.g, pick.b].map((c) => Math.round((c / pick.n / 255) * 1000) / 1000) as [number, number, number];
}

writeFileSync(OUT, "{\n" + Object.entries(tints).map(([id, c]) => `"${id}": ${JSON.stringify(c)}`).join(",\n") + "\n}\n");
console.log(`${Object.keys(tints).length} monster colours -> ${OUT}`);
