/**
 * What the party sees inside a Monster Hut, one scene for each monster that has one (entity 9 of the monster sheet), by monster id. The scene
 * ends with the question that decides whether the hut burns down.
 */
const ASK = " Burn this place down?";

const HUT_SCENES: Record<number, string> = {
  31: "A foul stench of rotten meat and smoke fills the cramped hut. Crude clubs and stolen pots lie among heaps of gnawed bones, and a ragged pile of furs is crawling with fleas." + ASK,
  74: "The hut is dark and thick with the smell of old blood. Hundreds of leathery wings hang from the rafters, and the floor is covered in droppings and the drained bodies of small animals." + ASK,
  78: "You see a gruesome scene inside the dark hut, where small mushrooms are growing out what appears to be human and animal remains. The air is filled with spores." + ASK,
  62: "Shrill echoes still ring in the empty hut. Cracked pottery, shattered windows and splintered beams show what the howling did to this place, and bits of wax from plugged ears lie scattered on the floor." + ASK,
  53: "Notched axes and dented shields hang on the walls of the hut. A rough map of the surrounding villages is pinned to a post, with red marks on every farm that has been raided." + ASK,
  68: "A strange glow drifts through the hut. Tiny cups, thimbles and jars full of glittering dust stand on shelves, and a mischievous giggle seems to come from every corner." + ASK,
  12: "The hut is filled with whispering voices. Dolls pierced with needles, rusty chains and charred amulets lie on the floor, and everything in here seems to carry a faint, sticky curse." + ASK,
  52: "Something clicks and scuttles behind the walls. The hut is full of husks of giant beetles and a mound of sticky, half-eaten food, and a cloud of flies rises when you enter." + ASK,
  30: "Thick white webs fill the hut from floor to roof. Wrapped bundles hang in them, some of them as big as a man, and the dry husks of countless insects crunch under your boots." + ASK,
  40: "Row upon row of pinned insects and strangely glowing eggs cover the walls of the hut. A faint magic hums in the air, and the sharp claws of the creature have left deep grooves in the beams." + ASK,
  51: "A huge rickety bed, a chair that no human could use and a pot big enough to cook a cow stand in the hut. Gnawed bones of horses and cattle are piled in the corner, and the whole place reeks of sweat." + ASK,
  49: "Throwing stars, black cloth and rolled-up scrolls lie in neat rows in the hut. The floor is bare and silent, but the beams above you are covered in claw marks, and you feel watched from every dark corner." + ASK,
  63: "Lockpicks, forged keys and purses cut open lie on a table in the hut. Behind a loose board you find a map with crosses on every merchant road, and a ledger listing travellers who never arrived." + ASK,
  5: "Children's toys lie in a corner of the hut, torn apart and covered in dark stains. Something big and hairy has slept on the straw, and the walls are scratched with the marks of claws and teeth." + ASK,
  29: "The hut is cold and silent. Shallow graves have been dug into the dirt floor, and the pale remains of travellers and farmers lie around in half-eaten heaps. The smell of death is overwhelming." + ASK,
  1: "Quivers full of arrows hang on the walls of the hut, and a long row of targets made of old shields stands against the back wall. A tally of coloured notches on a beam counts the travellers who have been shot on the road." + ASK,
  24: "Bundles of pelts, snares and traps hang from the roof of the hut. A carved board shows the hunting grounds of the forest with the paths of the farmers marked in red, and a scalp or two dangles from a nail." + ASK,
  72: "The hut stinks like a swamp. A huge cauldron simmers over a smouldering fire with something that was once a farmer's cow, and the bones in the corner have been cracked open to get at the marrow." + ASK,
  16: "A buzzing like a thousand tiny saws fills the hut. The walls are bare, the straw is gone and every plank has been chewed to splinters. Heaps of pale husks rise in the corners, and the few things that remain are bitten clean." + ASK,
  2: "Furs, a rusty axe and a rough bench are all the furniture in the hut. Skulls of beasts and men hang over the door as trophies, and a mighty tankard, still half full, stands by the fire." + ASK,
  44: "The hut is hot as a bread oven. The walls are scorched black, the ground is covered in cinders and melted coins, and a pile of charred bones lies in a nest of ash and smouldering straw." + ASK,
};

/** The scene of a hut whose monster the list above does not know, so that a monster added to the sheet has a hut at once. */
const GENERIC = "The hut is dark and silent. Bones, scraps and the marks of many claws and boots show that the creatures who live here have done terrible things." + ASK;

/** The scene inside the Monster Hut of a monster, with the question to burn it down. */
export function hutScene(monster: number): string {
  return HUT_SCENES[monster] ?? GENERIC;
}
