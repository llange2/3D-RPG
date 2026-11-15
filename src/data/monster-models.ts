/**
 * Monsters whose model is a file of the user's own (`tools/assets/sources/models`, `new:` = that folder) and not the animated glb of the old game. Pure data: the asset pipeline
 * (`buildMonsters`) and the tests read it. The user's files carry the Mixamo rig (`mixamorig:RightHand`, joints in metres) where the old ones have `RightHand` in centimetres.
 */
export interface UserMonsterModel {
  /** `new:<file without .glb>`. */
  file: string;
  /** World scale of the model (the old `anim_scale`). */
  scale: number;
}

export const USER_MONSTER_MODELS: Readonly<Record<number, UserMonsterModel>> = {
  // 62nd playtest, points 1 and 2 (15. 11. 2026): the Evil Paladin (54) and the Evil Wizard (79, a static cloud-rider before)
  54: { file: "new:Evil_Paladin", scale: 1.4 },
  79: { file: "new:Evil_Wizard", scale: 1.3 },
};
