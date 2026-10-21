/**
 * What the animated monsters of the old game hold in their hands: `anim_weapon` (right hand) and `anim_shield` (left hand) of MONSTER_DATA, the
 * skeletons, goblins, castle guards, trolls, ogres and the rest. The models are static ones of the registry (`wpn_*`).
 */

/** The old model files by the key of the static registry. */
const MODEL_OF_FILE: Record<string, string> = {
  "Sword 1.glb": "wpn_sword1",
  "Sword 2.glb": "wpn_sword2",
  "Sword 3.glb": "wpn_sword3",
  "Shield 1.glb": "wpn_shield1",
  "Shield 2.glb": "wpn_shield2",
  "Shield 3.glb": "wpn_shield3",
  "Axe.glb": "wpn_axe",
  "Battle Hammer.glb": "wpn_hammer",
};

export const EQUIPMENT_MODELS: readonly string[] = Object.values(MODEL_OF_FILE);

/** The registry key of an old equipment path (`resources/objects/Sword 2.glb`), or null for none or an unknown model. */
export function equipmentModel(path: string | undefined | null): string | null {
  if (!path) return null;
  return MODEL_OF_FILE[path.slice(path.lastIndexOf("/") + 1)] ?? null;
}
