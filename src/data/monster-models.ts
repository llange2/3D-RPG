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
  // bug_fix_79 (22. 11. 2026): the Evil Ranger (24, a staff in his hand) and the Black Knight (3); both keep the scale of their old models (1.4, 2.2). The user's files `.ignore/Evil_Ranger.glb` (a horned knight in black plate) and `.ignore/Black_Knight.glb` (a hooded man in a cloak) hold the
  // other one's figure, so the sources carry the names of what they show
  24: { file: "new:Evil_Ranger", scale: 1.4 },
  3: { file: "new:Black_Knight", scale: 2.2 },
};
