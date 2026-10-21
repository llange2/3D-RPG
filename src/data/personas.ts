/**
 * The people of the hand-built maps (campaign items 48 to 60, 82, 90 and 106 to 108). The old game stood a rigged, animated
 * model on each of them (`entities.py add_item`, `UrsinaActor`) and only fell back to the static `personas/*.obj` without
 * Ursina actors. Pure data: the asset pipeline and the game both read it.
 */
export interface Persona {
  /** File under `old_code/resources/objects/personas/animated`, without `.glb`. */
  file: string;
  /** The clip they loop (`anim_name`): they chat, bow, squat or just stand. */
  idle: string;
  /** Size as the old game set it (`scale=`). */
  scale: number;
}

export const PERSONAS: Record<number, Persona> = {
  48: { file: "Cartographer", idle: "Stand_and_Chat", scale: 1.3 },
  49: { file: "Job Offerer", idle: "Stand_and_Chat", scale: 1.3 },
  50: { file: "Guild Apprentice", idle: "Idle_13", scale: 1.2 },
  51: { file: "Sailor", idle: "Stand_and_Chat", scale: 1.3 },
  52: { file: "Lord", idle: "Stand_and_Chat", scale: 1.3 },
  53: { file: "Monk", idle: "Stand_and_Chat", scale: 1.3 },
  54: { file: "Weapon Master", idle: "Lower_Weapon_Look_Raise", scale: 1.3 },
  55: { file: "Body Builder", idle: "air_squat", scale: 1.3 },
  56: { file: "Mountaineer", idle: "Stand_and_Chat", scale: 1.3 },
  57: { file: "Explorer", idle: "Gentlemans_Bow", scale: 1.3 },
  58: { file: "Good King", idle: "Stand_and_Chat", scale: 1.3 },
  59: { file: "Neutral King", idle: "Stand_and_Chat", scale: 1.3 },
  60: { file: "Evil King", idle: "Stand_and_Chat", scale: 1.3 },
  82: { file: "Skull Miser", idle: "Stand_and_Chat", scale: 1.3 },
  90: { file: "Seth Squirm", idle: "Idle_13", scale: 1.5 },
  106: { file: "Generic 1", idle: "Idle_11", scale: 1.2 },
  107: { file: "Generic 2", idle: "Idle_11", scale: 1.2 },
  108: { file: "Generic 3", idle: "Idle_11", scale: 1.2 },
};

/** Personas share the monster registry (same rig, same renderer); their ids start here so they cannot clash with the 91 monsters. */
export const PERSONA_BASE = 1000;

export const personaModelId = (item: number): number => PERSONA_BASE + item;

/**
 * What the old game added to a cell's rotation for each clip so that the actor faces the way the cell says (`g.ANIMATION`; the
 * clips of the personas are the ones listed). Ursina and Babylon import glTF mirrored in different axes, which turns a model by
 * 180 degrees: `personaYaw` accounts for it.
 */
const ANIMATION_YAW: Record<string, number> = {
  air_squat: 180,
  Gentlemans_Bow: 180,
  Idle_11: 180,
  Idle_13: 135,
  Lower_Weapon_Look_Raise: 180,
  Stand_and_Chat: 135,
};

/** Yaw in degrees of a persona on a cell with rotation `cellRotation` (0 = north, 90 = east), for Babylon. */
export function personaYaw(item: number, cellRotation: number): number {
  const clip = PERSONAS[item]?.idle ?? "";
  return (((cellRotation + (ANIMATION_YAW[clip] ?? 180) + 180) % 360) + 360) % 360;
}
