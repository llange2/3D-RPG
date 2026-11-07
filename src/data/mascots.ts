/**
 * The five mascots and the places they wait at. The old game draws a mascot as a map item (7 to 11) and swaps what is drawn
 * with the party's current mascot (`translate_special_entity`): the mascot in the party is gone from its place, the Crow leaves
 * an empty bird perch (78) and the Fairy an empty blue mushroom (79); the Donkey, the Orb and the Wolf leave nothing.
 */
export const MASCOT_NAMES = ["Crow", "Donkey", "Fairy", "Orb", "Wolf", "Capybara"] as const;

/**
 * The map item of a mascot's place. The Capybara (7. 11. 2026, the user's Easter egg) is no item of the old game: 310 is a pseudo item like the wall
 * reliefs (304 to 309), drawn with the model `obj_capybara` (`CAPYBARA_MODEL`) and placed by `Game.syncMascots`, not by `itemProp`.
 */
export const CAPYBARA_ITEM = 310;
export const CAPYBARA_MODEL = "obj_capybara";
/** The file is 1.13 x 1.54 x 1.91 around its middle; the scale makes it about as big as the real animal beside the party (a cell is 3 wide), the turn is added to the bearing of its cell. */
export const CAPYBARA_SCALE = 0.6;
export const CAPYBARA_YAW = 0;
export const MASCOT_ITEM: Record<string, number> = { Crow: 7, Donkey: 8, Fairy: 9, Orb: 10, Wolf: 11, Capybara: CAPYBARA_ITEM };

/** The empty perch and the blue mushroom: what stays when the Crow or the Fairy is with the party. */
export const BIRD_PERCH = 78;
export const BLUE_MUSHROOM = 79;

/** What is drawn on a mascot's place while `current` is the party's mascot: a map item number, or 0 for an empty place. */
export function mascotSpotItem(item: number, current: string): number {
  switch (item) {
    case 7:
      return current === "Crow" ? BIRD_PERCH : 7;
    case 8:
      return current === "Donkey" ? 0 : 8;
    case 9:
      return current === "Fairy" ? BLUE_MUSHROOM : 9;
    case 10:
      return current === "Orb" ? 0 : 10;
    case 11:
      return current === "Wolf" ? 0 : 11;
    case CAPYBARA_ITEM:
      return current === "Capybara" ? 0 : CAPYBARA_ITEM;
    default:
      return item;
  }
}

/** Whether something solid stands on the place (the perch and an empty place can be walked over; the mushroom is an obstacle like the mascots). */
export const isSolidSpotItem = (shown: number): boolean => shown !== 0 && shown !== BIRD_PERCH;

/** What the party is asked at a mascot's place (the texts the old outside map has there). */
export const MASCOT_ASK: Record<string, string> = {
  Crow: "The crow is sitting on its bird perch. Quickly her head moves to the left, then slowly back at you. This intelligent creature certainly is aware of its environment and its dangers.\nAllow the crow to follow you?",
  Orb: "The orb hovers in the forest, emitting a soothing glow. You feel a magical aura coming from it. Although you are not quite sure what “it” actually is, it seems it is willing to help you.\nTry to have the orb follow you?",
  Fairy: "A smile appears, when the fairy sees you. “You look fun. Let me join you and I will use my abilities to increase your elemental resistances.”\nAccept the fairy’s offer?",
  Wolf: "The majestic wolf looks you right into your eyes and you keep a respectful distance. You are fully aware of the its fighting strength.\nInvite the wolf into your party to fight alongside you?",
  Donkey: "This has got to be the friendliest donkey, you have ever seen. He gently nudges his head against you and lets you pet him. He also does not seem to mind carrying things around.\nAdopt this pet into your group?",
  Capybara: "Behind the crumbling wall sits a capybara, calm as a mountain lake. It looks up at you, blinks slowly and does not seem to be bothered by anything in the world.\nLet the capybara join your party?",
};
