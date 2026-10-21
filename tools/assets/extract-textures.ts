/** Dumps the base colour texture of glb models as small PNGs for visual inspection. Usage: tsx tools/assets/extract-textures.ts <outDir> <glb...> */
import { mkdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import sharp from "sharp";

const [outDir, ...files] = process.argv.slice(2);
if (!outDir) throw new Error("usage: extract-textures <outDir> <glb...>");
mkdirSync(outDir, { recursive: true });
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

for (const file of files) {
  const doc = await io.readBinary(new Uint8Array(readFileSync(file)));
  let n = 0;
  for (const mat of doc.getRoot().listMaterials()) {
    const tex = mat.getBaseColorTexture();
    const image = tex?.getImage();
    if (!tex || !image) continue;
    const out = join(outDir, `${basename(file, ".glb")}_${n++}.png`);
    await sharp(Buffer.from(image)).resize(512, 512).png().toFile(out);
    console.log(out);
  }
}
