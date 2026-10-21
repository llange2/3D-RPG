/** Prints structure of glb/obj models: meshes, triangles, bounds, textures, skins, animations. Usage: tsx tools/assets/inspect-model.ts <file> [file...] */
import { readFileSync } from "node:fs";
import { basename, extname } from "node:path";
import { NodeIO, getBounds } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import obj2gltf from "obj2gltf";

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

async function load(file: string) {
  if (extname(file).toLowerCase() === ".obj") {
    const glb = await obj2gltf(file, { binary: true, secure: true });
    return io.readBinary(new Uint8Array(glb));
  }
  return io.readBinary(new Uint8Array(readFileSync(file)));
}

for (const file of process.argv.slice(2)) {
  try {
    const doc = await load(file);
    const root = doc.getRoot();
    let tris = 0;
    let verts = 0;
    for (const mesh of root.listMeshes()) {
      for (const prim of mesh.listPrimitives()) {
        const idx = prim.getIndices();
        const pos = prim.getAttribute("POSITION");
        verts += pos?.getCount() ?? 0;
        tris += Math.floor((idx ? idx.getCount() : (pos?.getCount() ?? 0)) / 3);
      }
    }
    const scene = root.getDefaultScene() ?? root.listScenes()[0]!;
    const b = getBounds(scene);
    const size = [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]].map((v) => v.toFixed(2));
    const textures = root.listTextures().map((t) => {
      const s = t.getSize();
      return `${s ? s.join("x") : "?"} ${t.getMimeType().replace("image/", "")} ${Math.round((t.getImage()?.byteLength ?? 0) / 1024)}KB`;
    });
    const anims = root.listAnimations().map((a) => a.getName());
    console.log(
      `${basename(file)}\n  meshes=${root.listMeshes().length} prims=${root.listMeshes().reduce((n, m) => n + m.listPrimitives().length, 0)} tris=${tris} verts=${verts}` +
        `\n  bounds=${size.join(" x ")} min=${b.min.map((v) => v.toFixed(2)).join(",")} max=${b.max.map((v) => v.toFixed(2)).join(",")}` +
        `\n  materials=${root.listMaterials().length} textures=[${textures.join("; ")}]` +
        `\n  skins=${root.listSkins().length} joints=${root.listSkins()[0]?.listJoints().length ?? 0} animations=[${anims.join(", ")}]`,
    );
  } catch (e) {
    console.log(`${basename(file)}: ERROR ${(e as Error).message}`);
  }
}
