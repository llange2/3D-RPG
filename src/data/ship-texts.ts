import type { Attribute } from "../sim/types";

/**
 * The words of the spaceship (quest_7, quest document 1.5): the packages of the storage bay, the status computer, the crystals and the console. English, like every text in the game.
 */

/**
 * What the packaging of a pill says. The product names stand for an attribute or an element and never name it (like the colours of the magic pools): "Stamina-X1000.4"
 * is endurance. The same name always means the same thing.
 */
export const PILL_NAMES: Readonly<Record<Attribute, string>> = {
  str: "Mighty-Gen 440.2",
  int: "Cortex-Plus Q7",
  per: "Charm-Soft R12",
  end: "Stamina-X1000.4",
  spd: "Velo-Rush V8.8",
  acc: "Aim-Sharp A4.1",
  lck: "Fortuna-Mix F13.7",
};
export const PILL_NAMES_RESISTANCE: Readonly<Record<"fire" | "ice" | "acid" | "magic", string>> = {
  fire: "Therm-Shield T-70",
  ice: "Cryo-Guard C-12",
  acid: "Neutra-Coat N-55",
  magic: "Null-Field Z-9",
};
/** The serum of the crates that give experience: the label says nothing but a code. */
export const SERUM_NAMES: readonly string[] = ["Neuro-Sync NX-1", "Mnemo-Bank M-1000", "Archive-Gel A-17"];

/** The status computer of the control room. */
export function shipStatus(life: boolean, engineCrystal: boolean, engines: boolean): string {
  return `Ship status:\nLife support: ${life ? "Functional" : "Emergency only"}\nEngines: ${engines ? "Ready" : engineCrystal ? "Functional" : "Failure"}`;
}
export const ACTIVATE_ENGINES = "Would you like to activate the engines?";
export const ENGINES_STARTED = "The deck begins to tremble. Deep below you the engines roar to life and settle into a steady hum.";

/** The broken power crystals of the engine room and of life support. */
export const CRYSTAL_SAME_SIZE = "The crystal in your inventory seems to have the same size like the broken one. Try to replace it?";
export const CRYSTAL_BROKEN = "The crystal is broken. Maybe an intact one of the same size could replace it.";
export const CRYSTAL_MENDED = "The new crystal sits firmly in its socket and glows with a steady light.";
export const CRYSTAL_SNAPPED_ENGINE = "As soon as you snap in the new crystal its start to emit a faint light, which grows quickly brighter. You realize that also all other crystals start to emit a strong light, while a humming noise appears.";
export const CRYSTAL_SNAPPED_LIFE = "As soon as you snap in the new crystal its start to emit a faint light, which grows quickly brighter. You realize that also all other crystals start to emit a strong light, while the lights of the whole ship flicker on.";

/** The console of the bridge. */
export const CONSOLE_NOT_READY = "Ship not fully operational";
export const CONSOLE_NO_CARD = "A slot beside the screen glows red. The console wants a black key card.";
/** The words that rise over the black screen after the outro movie. */
export const ENDING_TEXT =
  "You are still startled by the discovery that underneath this world lay this strange vessel, which took you above the sky.\nYou admire the stars rushing by and wonder, where it will take you next.\n\nCongratulation on your victory!";
export const INSERT_CARD = "A slot beside the screen glows softly. Your heroes hold the black key card. Do you want to insert it?";
export const CONSOLE_STARTS = "The black key card slides into the slot. The console wakes up, the screens fill with symbols, and the world around you begins to dissolve.";

/** The computers of the control room that list the code words of the mini quests. */
export const CODE_TITLE = "Code words for surface entities";
/** Lines of code words on one page of a computer (the ComputerScreen holds about 18 lines with the title). */
export const CODE_LINES_PER_PAGE = 14;
