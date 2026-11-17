import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import type { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";

/** The grey value of a colour (a number, not a colour: the daylight of the game is warm, which would turn the blue of water dull). */
export const luma = (c: Color3): number => c.r * 0.3 + c.g * 0.59 + c.b * 0.11;

/**
 * How bright the scene is at a point, 0 (dark) to 1 (as bright as the sun makes the stone): the same lights the stone gets, added up as the shader does: the sky (a hemisphere, the
 * whole day or the faint glow underground), the sun, and, with `point`, the point lights (the party's torch with its ring, the lamps, the light of a shot) by their distance from the
 * point. The effects that are only added light (water, foam, halos) multiply their own brightness by it, so that nothing shines in the dark that the stone beside it does not
 * (bug_fix_68).
 */
export function lightAt(scene: Scene, x: number, y: number, z: number, point = true): number {
  let sky = 0;
  let near = 0;
  for (const l of scene.lights) {
    if (l.intensity <= 0 || !l.isEnabled()) continue;
    if (l instanceof HemisphericLight) sky += l.intensity * ((luma(l.diffuse) + luma(l.groundColor)) / 2);
    else if (l instanceof DirectionalLight) sky += l.intensity * luma(l.diffuse) * 0.5;
    else if (point && l instanceof PointLight) {
      const p = l.getAbsolutePosition();
      const d = Math.hypot(p.x - x, p.y - y, p.z - z);
      if (d < l.range) near += l.intensity * luma(l.diffuse) * (1 - d / l.range);
    }
  }
  // (a point light lights the stone at a slant and the stone takes only a part of it, while the pale water would take it all and, under a strong lamp, shine like a lamp itself:
  // what the point lights add is kept to 0.6)
  return Math.min(1, sky + Math.min(0.6, near * 0.55));
}
