/**
 * Switches of the debug menu (`game/debug.ts`) that the rules of the game have to know about. Never saved: a loaded game starts
 * without them, and nothing sets them while `DEBUG_MENU` is off.
 */
export const cheats = {
  /** Heroes take no damage and no harmful condition, and the party never runs out of food. */
  god: false,
};
