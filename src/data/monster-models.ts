/**
 * Monsters whose model is a file of the user's own (`tools/assets/sources/models`, `new:` = that folder) and not the animated glb of the old game. Pure data: the asset pipeline
 * (`buildMonsters`) and the tests read it. The user's files carry the Mixamo rig (`mixamorig:RightHand`, joints in metres) where the old ones have `RightHand` in centimetres.
 */
export interface UserMonsterModel {
  /** `new:<file without .glb>`. */
  file: string;
  /** World scale of the model (the old `anim_scale`). */
  scale: number;
  /** Turns the model about the vertical axis (degrees) when it is built, for a file whose figure does not face +z (every monster model must; check with `tools/dev/check-new-monsters.ts`). */
  rotateY?: number;
}

/**
 * The models of the monsters that only Fantastic Islands has (`docs/MONSTER_1.2.xlsx`, ids 92 to 116): the user's files in `tools/assets/sources-packs/fantastic/models` (`file` is `new:<name>`, built
 * by `npx tsx tools/assets/build-models.ts --pack=fantastic --monster=<ids>` into the pack, never into Classic's folder). Four of them have no skeleton (the Cinder Beetle, the Crypt Rat, the Rime
 * Wolf, the Frost Wyrm): they stand and bob like the static models of the old game (`animated` of the registry is false for them).
 */
export const FANTASTIC_MONSTER_MODELS: Readonly<Record<number, UserMonsterModel>> = {
  92: { file: "new:Frost_Imp", scale: 0.8 },
  93: { file: "new:Crypt_Rat", scale: 1.3 },
  94: { file: "new:Cinder_Beetle", scale: 1.2 },
  95: { file: "new:Thorn_Creeper", scale: 1.2 },
  96: { file: "new:Hollow_Scarecrow", scale: 1.3 },
  97: { file: "new:Rime_Wolf", scale: 1.3 },
  98: { file: "new:Ash_Cultist", scale: 1.2 },
  99: { file: "new:Bog_Toad", scale: 1.2 },
  100: { file: "new:Magma_Crawler", scale: 1.2 },
  101: { file: "new:Frost_Shade", scale: 1.4 },
  102: { file: "new:Venom_Bloom", scale: 1.5 },
  103: { file: "new:Frost_Giant", scale: 2 },
  104: { file: "new:Frost_Golem", scale: 2.2 },
  105: { file: "new:Hellhound", scale: 1.4 },
  106: { file: "new:Frost_Giant_King", scale: 2.6 },
  107: { file: "new:Hex_Warlock", scale: 1.3 },
  108: { file: "new:Swamp_Basilisk", scale: 1.3 },
  109: { file: "new:Winter_Queen", scale: 1.5 },
  110: { file: "new:Doom_Knight", scale: 1.8 },
  111: { file: "new:Magma_Titan", scale: 2.4 },
  112: { file: "new:Storm_Giant", scale: 2.4 },
  113: { file: "new:Elder_Treant", scale: 2.6 },
  114: { file: "new:Frost_Wyrm", scale: 2, rotateY: 90 },
  115: { file: "new:Treant_King", scale: 3 },
  116: { file: "new:Void_Horror", scale: 2.6 },
};

export const USER_MONSTER_MODELS: Readonly<Record<number, UserMonsterModel>> = {
  // 62nd playtest, points 1 and 2 (15. 11. 2026): the Evil Paladin (54) and the Evil Wizard (79, a static cloud-rider before)
  54: { file: "new:Evil_Paladin", scale: 1.4 },
  79: { file: "new:Evil_Wizard", scale: 1.3 },
  // bug_fix_79 (22. 11. 2026): the Evil Ranger (24, a staff in his hand) and the Black Knight (3); both keep the scale of their old models (1.4, 2.2). The user's files `.ignore/Evil_Ranger.glb` (a horned knight in black plate) and `.ignore/Black_Knight.glb` (a hooded man in a cloak) hold the
  // other one's figure, so the sources carry the names of what they show
  24: { file: "new:Evil_Ranger", scale: 1.4 },
  3: { file: "new:Black_Knight", scale: 2.2 },
};
