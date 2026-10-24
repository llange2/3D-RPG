import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase";
import { RegisterMaterialPlugin } from "@babylonjs/core/Materials/materialPluginManager";
import type { Material } from "@babylonjs/core/Materials/material";
import { PBRBaseMaterial } from "@babylonjs/core/Materials/PBR/pbrBaseMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer";

/** Far enough that nothing is cut: interiors and the closed maps. */
export const NO_SIGHT_LIMIT = 1e6;

/** Where the eye is and how far it sees (world units); the plugin below reads it for every draw, so changing it recompiles nothing. */
const sight = { x: 0, y: 0, z: 0, range: NO_SIGHT_LIMIT };

export function setSight(x: number, y: number, z: number, range: number): void {
  sight.x = x;
  sight.y = y;
  sight.z = z;
  sight.range = range;
}

/**
 * Cuts what lies farther than `range` from the eye, in a circle like the fog (a far plane cuts by depth, so it let castles stand at the edge of the
 * picture at 29 tiles, as pale shapes in the colour of the fog against the sky). The fog is closed at the same distance, so the cut shows nothing but
 * the end of the world's last fogged ground.
 */
class SightLimitPlugin extends MaterialPluginBase {
  constructor(material: Material) {
    super(material, "SightLimit", 200, { SIGHT_LIMIT: false });
    this._enable(true);
  }

  override getClassName(): string {
    return "SightLimitPlugin";
  }

  override prepareDefines(defines: Record<string, unknown>): void {
    defines.SIGHT_LIMIT = true;
  }

  override getUniforms(): { ubo: { name: string; size: number; type: string }[]; fragment: string } {
    return { ubo: [{ name: "sightLimit", size: 4, type: "vec4" }], fragment: "uniform vec4 sightLimit;" };
  }

  override bindForSubMesh(uniformBuffer: UniformBuffer): void {
    uniformBuffer.updateFloat4("sightLimit", sight.x, sight.y, sight.z, sight.range);
  }

  override getCustomCode(shaderType: string): Record<string, string> | null {
    if (shaderType !== "fragment") return null;
    return { CUSTOM_FRAGMENT_MAIN_BEGIN: "if (distance(vPositionW, sightLimit.xyz) > sightLimit.w) discard;" };
  }
}

/** Gives every material made from now on the cut. Call before the first material is created. */
export function registerSightLimit(): void {
  RegisterMaterialPlugin("SightLimit", (material) => (material instanceof StandardMaterial || material instanceof PBRBaseMaterial ? new SightLimitPlugin(material) : null));
}
