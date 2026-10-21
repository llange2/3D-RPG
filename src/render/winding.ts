import type { Mesh } from "@babylonjs/core/Meshes/mesh";

/**
 * Reverses the triangle winding of a mesh and leaves its normals alone.
 * (`Mesh.flipFaces` inverts the normals as well, which turns the lighting of a correctly shaded model inside out.)
 */
export function flipWinding(mesh: Mesh): void {
  const indices = mesh.getIndices();
  if (!indices) return;
  const flipped = new Uint32Array(indices.length);
  for (let i = 0; i < indices.length; i += 3) {
    flipped[i] = indices[i]!;
    flipped[i + 1] = indices[i + 2]!;
    flipped[i + 2] = indices[i + 1]!;
  }
  mesh.setIndices(flipped, mesh.getTotalVertices());
}
