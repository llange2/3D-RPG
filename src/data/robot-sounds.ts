import { monsterGroup } from "./tables";

/**
 * The noises of the robots of the spaceship (the user's files `tools/assets/sources/audio/robot_*.mp3`, 6. 11. 2026). Which robot makes which noise is the user's list:
 *
 * - wakes up: Iron Wizard (35) and Terminator (69) sound an alarm, Titanic Automato (88) and ED-409 (22) have acquired their target
 * - attacks: Titanic Automato launches a missile, the three others fire a laser (the user wrote "25" for the Iron Wizard, a Fire Lizard, which is no robot; 35 is meant)
 * - moves: Titanic Automato and ED-409 take two steps for every tile they cross
 * - is hit by the party: every robot; defeated: every robot powers off
 */
export const ROBOT_SOUND = { alarm: 9057, target: 9058, laser: 9059, launch: 9060, powerOff: 9061, step: 9062, hit: 9063 } as const;

/** The pause in seconds between the two steps of a robot, after the first one has died away. */
export const ROBOT_STEP_PAUSE = 0.06;

const IRON_WIZARD = 35;
const TERMINATOR = 69;
const TITANIC_AUTOMATO = 88;
const ED_409 = 22;

/** Is this monster one of the robots (group `robot` of the sheet)? */
export const isRobot = (defId: number): boolean => monsterGroup(defId) === "robot";

/** The sound of a robot that has just woken up, or null for a monster that is no robot (or a robot the list does not name). */
export function robotWakeSound(defId: number): number | null {
  if (defId === IRON_WIZARD || defId === TERMINATOR) return ROBOT_SOUND.alarm;
  if (defId === TITANIC_AUTOMATO || defId === ED_409) return ROBOT_SOUND.target;
  return null;
}

/** The sound of a robot's attack, or null. */
export function robotAttackSound(defId: number): number | null {
  if (defId === TITANIC_AUTOMATO) return ROBOT_SOUND.launch;
  if (defId === IRON_WIZARD || defId === TERMINATOR || defId === ED_409) return ROBOT_SOUND.laser;
  return null;
}

/** The Titanic Automato shoots a missile (the model `proj_missile`) where other monsters of its damage type shoot a fireball. */
export const fliesAsMissile = (defId: number): boolean => defId === TITANIC_AUTOMATO;

/** How many steps are heard for every tile a robot crosses (0 for a monster that makes no such noise). */
export function robotStepSounds(defId: number): number {
  return defId === TITANIC_AUTOMATO || defId === ED_409 ? 2 : 0;
}
