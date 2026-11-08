/**
 * What the people of the wagons near a locked place tell (49th playtest, point 1): a rustic caravan or a cottage within three tiles of a dungeon that asks for a key, or of a pyramid
 * that asks for a key card, hands out a tale about it. The tale names the locked place and the place where the thing lies, and circumscribes the thing itself: a card is "an
 * artifact", a key a key of its colour. Pure data and words: the placement is `world/caravans.ts`, the telling `Game.visitHintWagon`.
 */

/** A teller: how the wagon's door opens, and the words that go with the person (the stories are about someone's father, mother or grandfather). */
interface Teller {
  /** The first sentence; `{home}` is "caravan" or "cottage". */
  intro: string;
  /** "She" / "He": starts a sentence. */
  S: string;
  /** "she" / "he": inside a sentence. */
  s: string;
  /** "her" / "his". */
  poss: string;
  /** "her" / "him". */
  obj: string;
  /** Who told the tale. */
  kin: string;
}

const TELLERS: readonly Teller[] = [
  { intro: "An old woman asks you into her {home} and offers you delicious tea.", S: "She", s: "she", poss: "her", obj: "her", kin: "father" },
  { intro: "A bearded old man waves you into his {home}, where a kettle whistles on the stove.", S: "He", s: "he", poss: "his", obj: "him", kin: "grandmother" },
  { intro: "A grumpy hermit opens the door of the {home}, sighs, and pours you a cup of lukewarm broth.", S: "He", s: "he", poss: "his", obj: "him", kin: "uncle" },
  { intro: "A cheerful woman pulls you into her {home}, sits you down between two cats and shoves a plate of biscuits at you.", S: "She", s: "she", poss: "her", obj: "her", kin: "mother" },
  { intro: "A tiny, wrinkled storyteller leads you into the {home} and presses a cup of nettle tea into your hands.", S: "She", s: "she", poss: "her", obj: "her", kin: "grandfather" },
  { intro: "A man with ink on his fingers looks up from his maps in the {home}, clears a chair for you and pours you a glass of elderflower cordial.", S: "He", s: "he", poss: "his", obj: "him", kin: "aunt" },
];

/** What a card is called when nobody says "key card": the old ones' flat artifacts. `{colour}` is its colour. */
const CARD_WORDS: readonly string[] = ["a {colour} artifact", "a {colour} token of the old ones, flat as a plate and hard as stone", "a {colour} plate from the days before the ships fell silent"];

/** The tale of a pyramid: `{place}` is its name, `{holder}` the place where its card lies, `{thing}` the card in other words. */
const CARD_TALES: readonly ((t: Teller) => string)[] = [
  (t) => `${t.S} tells you that ${t.poss} ${t.kin} told ${t.obj} as a child that {place} can only be entered with {thing}. Legend has it that it can be found in {holder}.`,
  (t) => `"Nobody has set foot in {place} for a hundred years," ${t.s} says and stirs ${t.poss} cup. "The door wants {thing}, and no sword or spell will do. ${t.poss[0]!.toUpperCase()}${t.poss.slice(1)} ${t.kin} swore that it lies hidden in {holder}."`,
  (t) => `${t.S} lowers ${t.poss} voice. "{Place} has a slot for {thing}," ${t.s} says. "I only know the old rhyme: where the dark is deepest in {holder}, there it waits."`,
];

/** The tale of a dungeon behind a lock: `{thing}` is the key in other words. */
const KEY_TALES: readonly ((t: Teller) => string)[] = [
  (t) => `${t.S} tells you that ${t.poss} ${t.kin} used to say that the door of {place} is held by a heavy lock, and that only {thing} will turn it. Legend has it that the key lies in {holder}.`,
  (t) => `"Do not waste your strength on the door of {place}," ${t.s} says. "It is locked tight, and only {thing} fits. ${t.poss[0]!.toUpperCase()}${t.poss.slice(1)} ${t.kin} saw it once, deep inside {holder}."`,
  (t) => `${t.S} leans closer. "Whoever wants to enter {place} needs {thing}," ${t.s} whispers. "I hear it is guarded in {holder}, and not by anyone friendly."`,
];

/** Everything the tale depends on. */
export interface HintInput {
  /** The thing the locked place asks for: `quest_key_<colour>` or `quest_<colour>_keycard`. */
  need: string;
  /** The name of the locked place and of the place that holds what it asks for. */
  place: string;
  holder: string;
  /** Whether the wagon is the cottage (the words say "cottage" then, "caravan" otherwise). */
  cottage: boolean;
  /** A number of the place (a hash of its id), which picks the teller and the wording: the same wagon always tells the same tale. */
  variant: number;
}

const isCard = (need: string): boolean => need.endsWith("_keycard");

/** The colour in the name of a key or key card type: `quest_key_golden` is golden, `quest_blue_keycard` is blue. */
export function colourOf(need: string): string {
  const m = /^quest_key_(.+)$/.exec(need) ?? /^quest_(.+)_keycard$/.exec(need);
  return m?.[1] ?? "";
}

/** The key as a person says it: "a golden key", "a key of every colour at once" for the rainbow one. */
function keyWords(colour: string): string {
  return colour === "rainbow" ? "a key that shimmers in every colour at once" : `a ${colour} key`;
}

/** The whole tale one wagon tells. */
export function hintTale(input: HintInput): string {
  const v = Math.abs(Math.trunc(input.variant));
  const teller = TELLERS[v % TELLERS.length]!;
  const colour = colourOf(input.need);
  const tales = isCard(input.need) ? CARD_TALES : KEY_TALES;
  const tale = tales[Math.floor(v / TELLERS.length) % tales.length]!(teller);
  const thing = isCard(input.need) ? CARD_WORDS[Math.floor(v / (TELLERS.length * tales.length)) % CARD_WORDS.length]!.replace("{colour}", colour) : keyWords(colour);
  const intro = teller.intro.replace("{home}", input.cottage ? "cottage" : "caravan");
  return `${intro}\n\n${tale.replace("{Place}", input.place[0]!.toUpperCase() + input.place.slice(1)).replace("{place}", input.place).replace("{holder}", input.holder).replace("{thing}", thing)}`;
}
