import type { BoonKey } from "../sim/types";

/**
 * The words of a boon of the open land (35th playtest): which object it is (a fountain or a giant stone head), and what it does to the party. The opener is picked by the
 * tile, the effect says the stat and the points. `{n}` is the number of points, `{h}` the hours.
 */
export type BoonSource = "fountain" | "head";

/** The old items that can hold a boon: Fountain (2) and Giant stone head (33). The plain Well (91) of the open land is decoration only, and the magic wells (37, 88) belong to the end rooms. */
export const BOON_SOURCE: Readonly<Record<number, BoonSource>> = { 2: "fountain", 33: "head" };

const OPENERS: Record<BoonSource, readonly string[]> = {
  fountain: [
    "You cup your hands and drink from the little fountain. It tastes of old coins and distant rain.",
    "The fountain gurgles as if it had been waiting for visitors. Everybody takes a sip, and nobody mentions the pigeons.",
    "Water splashes from a stone fish's mouth. It is the cleanest thing you have seen all week, so the whole party drinks.",
  ],
  head: [
    "The giant stone head opens one eye, looks at you and hums a low note through its nose.",
    "You pat the giant stone head on the forehead. It sighs contentedly, and a warm wind rolls out of its mouth.",
    "The giant stone head clears its throat with a sound like a rockslide. \"Go on, take it,\" it rumbles. \"I have far too much of the stuff.\"",
  ],
};

const EFFECTS: Record<BoonKey, string> = {
  str: "Muscles bulge under tunics that were loose a minute ago. Strength +{n} for {h} hours: even the stuck jar in the backpack will open now.",
  int: "A great many thoughts arrive at once, and some of them are even good. Intelligence +{n} for {h} hours.",
  per: "Suddenly everybody is charming. Even the goblins would hold the door for you. Personality +{n} for {h} hours.",
  end: "Your knees stop complaining, and the backpack weighs half as much as before. Endurance +{n} for {h} hours.",
  spd: "Your boots feel like they belong to somebody much more in a hurry. Speed +{n} for {h} hours.",
  acc: "For the next {h} hours the world holds still while you aim. Accuracy +{n}.",
  lck: "A four-leaf clover grows out of somebody's hat, and a passing cat crosses the road the lucky way. Luck +{n} for {h} hours.",
  res_fire: "A pleasant chill settles over the party; the sun suddenly feels like a rumour. Fire resistance +{n}% for {h} hours.",
  res_ice: "Warmth wraps around you like a grandmother's blanket. Ice resistance +{n}% for {h} hours.",
  res_acid: "Your skin tingles and then goes strangely slippery. Acid resistance +{n}% for {h} hours.",
  res_magic: "You feel as if you had been politely asked not to be bewitched, and the magic complied. Magic resistance +{n}% for {h} hours.",
};

/** The log text of a boon: the opener of the object and the effect. */
export function boonText(source: BoonSource, pick: number, stat: BoonKey, points: number, hours: number): string {
  const openers = OPENERS[source];
  return `${openers[Math.abs(pick) % openers.length]!} ${EFFECTS[stat].replace("{n}", String(points)).replace("{h}", String(hours))}`;
}

/** Said when the party bumps into an object whose magic it has used up today. */
export const BOON_SPENT: Readonly<Record<BoonSource, string>> = {
  fountain: "The fountain only trickles. Whatever made its water special today is spent; try again tomorrow.",
  head: "The giant stone head snores. It has nothing more to give today.",
};
