/**
 * What the party reads when it steps on or against an object of the old maps. Every object says something (trees and mountains aside);
 * a few have several lines, one of which is picked from the object's uid, so a town with six wells does not repeat itself six times.
 * Pure data: no DOM, no Babylon.
 */
import { seedFromString } from "../core/rng";
import { MAP_ITEMS } from "./tables";

const PROP_LINES: Record<number, readonly string[]> = {
  1: ["A wooden chest, locked by nothing but its own weight.", "A sturdy wooden chest. It looks like it has been waiting for you."],
  2: ["A beautiful fountain stands in front of you!", "Water splashes merrily in the basin. A few coins glint at the bottom.", "The fountain gurgles happily. Somebody has thrown a boot into it."],
  3: ["A portal shimmers in the air and hums quietly."],
  4: ["A heap of coins and jewels. It is not yours yet.", "Gold, gems and more gold. Somebody was very, very thorough."],
  5: ["A battered barrel. It smells of old wine and older secrets.", "A barrel. You knock on it. It knocks back. You decide to leave it alone."],
  6: ["A throne. Whoever sat here is long gone.", "A throne of black iron. It looks uncomfortable on purpose."],
  12: ["Rusty mining tools, left where they fell.", "A pickaxe leans against the wall. Its owner has probably gone for lunch. A long time ago."],
  13: ["Crates and sacks, stacked with great care and no labels at all.", "Somebody has stored a lot of things here. None of them are yours."],
  14: ["A table laid with food. It smells better than it should after all this time.", "A feast, abandoned mid-bite. Nobody has touched the roast. Nobody dares."],
  15: ["An alchemist's table: bubbling flasks and stained glass. One flask is labelled \"Do NOT drink\"."],
  16: ["A wheelbarrow, full of turnips. Someone meant to deliver them. That was a while ago.", "A wheelbarrow with a squeaky wheel. It has strong opinions about oil."],
  26: ["A rusty caravan. The wheels have long since grown roots."],
  27: ["A stone lion guards the way. Its expression says: \"Not today.\"", "A lion statue. Somebody has painted a moustache on it."],
  28: ["A winged horse, frozen in mid-gallop.", "A stone pegasus. It would fly away if it were not so heavy."],
  29: ["A stone head with a blank stare.", "A stone head. Its eyes seem to follow you, which is silly. Stone has no eyes. Does it?"],
  30: ["A throne carved with sunbursts. The cushion is still soft."],
  31: ["An old tree with a hollow trunk. Something small lives in it and does not wish to be disturbed."],
  32: ["\"Here lies a hero who did not look before opening the door.\"", "\"Rest in peace. Or pieces.\" The stone is badly weathered.", "A gravestone. The name has been scratched out and replaced with \"Gary\"."],
  33: ["A giant stone head. It seems to wait for something."],
  34: ["A dragon of black glass, polished to a mirror shine. It is exactly as warm as it looks: not at all.", "A dragon statue made of obsidian. Its eyes are two tiny red stones. They look like they are staring at your purse."],
  35: ["An altar. Faint runes glow on its top.", "An amethyst altar. It hums softly, like a cat that has been told a secret."],
  36: ["A giant hourglass. The sand falls upwards. Or you are tired."],
  37: ["A red well. Something bubbles in it."],
  38: ["A skull on a spike. A warning.", "A skull on a spike. Somebody has hung a tiny hat on it."],
  39: ["A lever. It is within reach and it looks pullable."],
  40: ["A transporter pad hums softly, waiting for someone brave enough."],
  45: ["A hut. Smoke rises from a crooked chimney."],
  46: ["A big stone oven. It is still warm. Somebody's dinner is in there; you leave it."],
  61: ["A metal statue of a hero nobody remembers.", "A statue made of metal. It squeaks very slightly when the wind blows."],
  62: ["A coffin. The lid is nailed shut.", "A coffin. From the inside, someone seems to have scratched \"Let me out\". Probably just the wood."],
  63: ["An open coffin. Empty. That is the worrying part."],
  67: ["A power crystal pulses with a cold blue light."],
  68: ["A computer terminal. Its screen shows only: \"AWAITING INPUT\"."],
  69: ["A grindstone. The sparks are long gone; the dust is not."],
  70: ["A pile of gnawed bones."],
  71: ["An abandoned fireplace. The ashes are cold."],
  73: ["Runes on the floor flicker softly. You decide not to read them aloud."],
  75: ["A bookshelf full of dusty books. The only legible title is \"Cooking with Dragons\".", "Books, books, books. One of them is the diary of a very bored wizard."],
  76: ["A rustic lantern. It burns steadily without any oil."],
  77: ["A trap door. It is a trap door, so you probably should not."],
  78: ["You see a bird's perch and by the reaction of your mascot companion it seems to be his."],
  79: ["A blue mushroom glows softly in the grass."],
  80: ["A heavy metal gate."],
  81: ["A heavy metal gate."],
  83: ["Fractured vessels. Their contents ran out long ago.", "Broken pots and shards. Somebody had a bad day."],
  86: ["A golden chalice, filled with something that is not wine."],
  88: ["A yellow well. The water hums.", "A yellow well. You cannot say why, but you feel watched by it."],
  89: ["A mermaid fountain. The mermaid looks thoroughly unimpressed by the water in her bowl.", "A mermaid fountain. Someone has lost a very small shoe in it."],
  91: ["A well with a rope that goes down a very long way.", "You drop a pebble into the well. You are still waiting for the splash."],
  92: ["A puddle of acid. It hisses at you."],
  93: ["A skeleton hangs from a chain. It looks relaxed.", "A hanging skeleton. It clearly lost an argument with a chain."],
  94: ["A rustic table, scarred by knives and dice.", "A rough wooden table. Somebody has carved a heart into it, then crossed it out."],
  95: ["A stone statue of a noble stranger. The pigeons have opinions about him.", "A weathered statue of someone important. Which is why nobody remembers who."],
  97: ["Ancient books. The dust is thicker than the pages.", "A shelf of very old books. They smell like a cellar and a secret."],
  98: ["A gallows. The rope is new."],
  99: ["A wooden beam holds up the ceiling. It creaks as if it knew something."],
  101: ["A hut. Something inside snores. Loudly."],
  102: ["A burnt-out hut. It smells of smoke and bad decisions."],
  103: ["A banner of the good kingdoms hangs here, a little faded."],
  104: ["A neutral banner, grey and tidy."],
  105: ["An evil banner. The embroidery is surprisingly cheerful."],
  109: ["An orb of power. It does not respond to you."],
  110: ["A sign with a cross: the temple."],
  111: ["A sign with a coin: the bank."],
  112: ["A sign with a skull and a star: the guild."],
  113: ["A sign with a bed: the inn."],
  114: ["A sign with an anvil: the smithy."],
  115: ["A sign with a mug: the tavern."],
  116: ["A sign with crossed swords: the training grounds."],
  117: ["Crystals as tall as a man. They hum faintly.", "Crystals grow from the floor like frozen light. They chime when you breathe."],
  118: ["A gong. It is rather loud."],
  119: ["A lectern with nothing on it.", "A lectern with an open book. The page reads: \"Chapter 1: Do Not Panic\"."],
  120: ["A puddle of lava. It glows and sulks."],
  121: ["Magic flames dance without any fuel."],
  125: ["A carving of a moose with a crown. Long live the moose!"],
  127: ["A sealed stone coffin. Nothing moves inside."],
  128: ["An opened stone coffin. Whatever was in there has left."],
};

/** The lines for an object, or a plain "You see a ..." from its name. `pick` (a number, or a string such as the uid) chooses among several. */
export function propLine(item: number, pick: number | string = 0): string {
  const lines = PROP_LINES[item];
  if (lines && lines.length > 0) {
    const n = typeof pick === "number" ? pick : seedFromString(pick)[0] >>> 0;
    return lines[((n % lines.length) + lines.length) % lines.length]!;
  }
  // "Chest: Wooden" -> "wooden chest", "Persona (Lord)" -> "persona"
  const [head = "", tail] = (MAP_ITEMS[item]?.name ?? "object").replace(/\s*\(.*\)/, "").split(": ");
  const label = (tail ? `${tail} ${head}` : head).toLowerCase();
  return `You see ${/^[aeiou]/.test(label) ? "an" : "a"} ${label}.`;
}

/** Items with a line of their own (for the test that every object that stands anywhere says something). */
export const ITEMS_WITH_LINES: readonly number[] = Object.keys(PROP_LINES).map(Number);

/** What a barrel gives away when the party opens it and finds nothing or a few coins (barrels are containers: they must be of use). */
export const BARREL_EMPTY: readonly string[] = [
  "Somebody is fermenting fish in the barrel, so you quickly close the lid.",
  "The barrel is empty, except for a very surprised spider.",
  "You lift the lid. A smell of old herring knocks you back a step. Nothing else in there.",
  "Only dust, a button and the memory of beer.",
  "The barrel holds a single wet sock. You leave it where it is.",
  "Empty. Someone has written \"Not here either\" on the bottom.",
];
export const BARREL_COINS: readonly string[] = [
  "Under a layer of apples you find a few coins.",
  "At the bottom of the barrel lies a forgotten purse.",
  "Somebody hid some coins in the barrel, in a boot. Why a boot, nobody knows.",
  "Between the staves a few coins have been wedged. A thrifty barrel!",
];

/** What the people of a town say when the party talks to them (generic villagers, the ones standing in dead ends). */
export const VILLAGER_LINES: readonly string[] = [
  "\"I came here for a quiet moment. You are not helping.\"",
  "\"They say the dungeon beneath the town is haunted. I say it is just draughty.\"",
  "\"If you find a goat in your travels, it is not mine. But if it is, keep it.\"",
  "\"My grandmother fought a dragon once. The dragon still talks about it.\"",
  "\"Don't touch the barrel on the corner. It is not a barrel any more.\"",
  "\"I am practising standing still. How am I doing?\"",
  "\"Behind this wall is a secret. I would tell you, but I do not know what it is.\"",
  "\"Adventurers! Please wipe your boots. And your swords. Especially your swords.\"",
  "\"The innkeeper makes a soup that cures everything. Except the soup.\"",
  "\"Have you tried turning the dungeon off and on again?\"",
  "\"I once found a coin in this dead end. I have been coming back every day since.\"",
  "\"Gold is nice. Bread is nicer. Cheese is the best of all.\"",
  "\"I'm not hiding. I'm resting between two streets.\"",
  "\"Yes, it's a dead end. It's also the quietest place in town. Please keep it that way.\"",
  "\"Wanted: a hero with steady hands, a strong stomach and no plans for Tuesday.\"",
  "\"The watch told me to stay here until further notice. That was in spring.\"",
  "\"My cat says you look trustworthy. My cat is wrong about many things.\"",
  "\"Careful with the cobbles. They bite.\"",
  "\"I have seen things. Mostly pigeons, but still.\"",
  "\"Welcome to the best street in town! The only one with me in it.\"",
];
