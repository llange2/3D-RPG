// Lists the nodes and primitives of a glb with their bounds and material colours (to find the water of a fountain model).
// Usage: node tools/dev/model-materials.mjs <file.glb>
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";

const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(process.argv[2]);
for (const node of doc.getRoot().listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  console.log("node", node.getName(), "T", node.getTranslation().map((v) => v.toFixed(3)).join(","), "S", node.getScale().join(","));
  for (const prim of mesh.listPrimitives()) {
    const a = prim.getAttribute("POSITION");
    const arr = a.getArray();
    const lo = [1e9, 1e9, 1e9];
    const hi = [-1e9, -1e9, -1e9];
    for (let i = 0; i < arr.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        lo[k] = Math.min(lo[k], arr[i + k]);
        hi[k] = Math.max(hi[k], arr[i + k]);
      }
    }
    const m = prim.getMaterial();
    console.log("  prim", m?.getName(), "base", m?.getBaseColorFactor().map((v) => v.toFixed(2)).join(","), "alpha", m?.getAlphaMode(), "tex", !!m?.getBaseColorTexture(), "n", a.getCount(), "min", lo.map((v) => v.toFixed(3)).join(","), "max", hi.map((v) => v.toFixed(3)).join(","));
  }
}
