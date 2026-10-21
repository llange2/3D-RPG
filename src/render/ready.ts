import type { Scene } from "@babylonjs/core/scene";

/** Gives up after this long: a mesh whose shader never compiles must not keep the loading screen up for ever. */
const TIMEOUT_MS = 30_000;
const POLL_MS = 40;

/**
 * Resolves once the scene can draw everything it holds. Textures arrive and shaders compile in the background, and a mesh
 * whose material is not ready is skipped; the prop models are loaded before the first frame, the wall and floor textures
 * are not, so the first frames showed chests and signs in mid-air and the walls only a second later.
 *
 * `progress` gets the share of the visible meshes that are ready (0 to 1). Resolves with false when it timed out.
 */
export async function whenDrawable(scene: Scene, progress: (share: number) => void): Promise<boolean> {
  const started = performance.now();
  for (;;) {
    let total = 0;
    let ready = 0;
    for (const mesh of scene.meshes) {
      if (!mesh.isEnabled() || !mesh.subMeshes || mesh.subMeshes.length === 0) continue;
      total++;
      // the complete check asks the material for every sub mesh, which also starts the compilation of shaders not asked for yet
      if (mesh.isReady(true)) ready++;
    }
    // a texture that is still on its way counts as work, too (it is pending data of the scene until it has been decoded)
    const waiting = scene.getWaitingItemsCount();
    progress(total === 0 ? 1 : ready / (total + waiting));
    if (ready === total && waiting === 0) return true;
    if (performance.now() - started > TIMEOUT_MS) {
      console.warn(`scene not ready after ${TIMEOUT_MS} ms: ${total - ready} meshes, ${waiting} pending items`);
      return false;
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

/** Resolves after `count` rendered frames (or `maxMs`, whichever comes first, so a hidden tab does not hang it). */
export function afterFrames(scene: Scene, count: number, maxMs = 1000): Promise<void> {
  return new Promise((resolve) => {
    let left = count;
    const done = () => {
      clearTimeout(timer);
      scene.onAfterRenderObservable.remove(observer);
      resolve();
    };
    const timer = setTimeout(done, maxMs);
    const observer = scene.onAfterRenderObservable.add(() => {
      if (--left <= 0) done();
    });
  });
}
