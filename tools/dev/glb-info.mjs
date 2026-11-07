/**
 * Prints what a glb file holds: triangles, bounds, textures, nodes. Use it before a model of the user goes into `tools/assets/build-models.ts`
 * (size, orientation and the origin must be known: the pipeline does not normalise them).
 * Usage: node tools/dev/glb-info.mjs <file.glb>...
 */
import { NodeIO, getBounds } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const file of process.argv.slice(2)) {
  const doc = await io.read(file);
  const root = doc.getRoot();
  let tris = 0;
  let verts = 0;
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const position = prim.getAttribute("POSITION");
      verts += position.getCount();
      const index = prim.getIndices();
      tris += (index ? index.getCount() : position.getCount()) / 3;
    }
  }
  const bounds = getBounds(root.getDefaultScene() ?? root.listScenes()[0]);
  const textures = root.listTextures().map((t) => `${t.getMimeType()} ${(t.getSize() ?? []).join("x")} ${((t.getImage()?.length ?? 0) / 1e6).toFixed(1)}MB`);
  const fixed = (v) => v.map((n) => n.toFixed(2)).join(", ");
  console.log(`${file.split(/[\\/]/).pop()}: ${tris} triangles, ${verts} vertices, ${root.listNodes().length} nodes, ${root.listMaterials().length} materials`);
  console.log(`  min ${fixed(bounds.min)}   max ${fixed(bounds.max)}   size ${fixed(bounds.max.map((m, i) => m - bounds.min[i]))}`);
  console.log(`  textures: ${textures.join(" | ") || "none"}`);
}
