import type { Rng } from "../core/rng";

/**
 * The hints of quest 6 (quest document 1.2): a word is given away letter by letter by the statues of a place, each telling a little story in
 * which one name begins with the letter that is meant. The player is not told which statue stands for which letter; the order comes from the
 * story ("the second brother"). Pure data and a pure generator: no DOM, no Babylon.
 */

/** Names by their first letter, one list for the males and one for the females; every letter of the alphabet has some. */
const NAMES: Record<string, readonly string[]> = {
  A: ["Aldric", "Arno", "Alma", "Aveline"],
  B: ["Ben", "Bram", "Brenna", "Bettina"],
  C: ["Conrad", "Cedric", "Clara", "Cora"],
  D: ["Dorian", "Dag", "Dora", "Daphne"],
  E: ["Edmund", "Egon", "Elsa", "Edda"],
  F: ["Fenwick", "Falk", "Freya", "Fiona"],
  G: ["Gideon", "Garrick", "Greta", "Gwen"],
  H: ["Hagen", "Harold", "Helga", "Hilda"],
  I: ["Ivo", "Ingmar", "Ida", "Irma"],
  J: ["Jasper", "Jorn", "Jana", "Jolanda"],
  K: ["Konrad", "Kasimir", "Karla", "Katrin"],
  L: ["Lothar", "Leif", "Lena", "Liesel"],
  M: ["Magnus", "Merlin", "Mara", "Mathilde"],
  N: ["Norbert", "Niklas", "Nora", "Nelly"],
  O: ["Oliver", "Osmund", "Olga", "Odette"],
  P: ["Pippin", "Piet", "Petra", "Philippa"],
  Q: ["Quentin", "Quirin", "Quilla", "Queenie"],
  R: ["Rupert", "Roland", "Rosa", "Rhea"],
  S: ["Salomon", "Siegfried", "Sigrid", "Selma"],
  T: ["Theodor", "Tilman", "Thea", "Tamsin"],
  U: ["Ulrich", "Udo", "Ulla", "Ursula"],
  V: ["Valentin", "Veit", "Vera", "Viola"],
  W: ["Waldemar", "Wolf", "Wilma", "Winifred"],
  X: ["Xaver", "Xander", "Xenia", "Xanthe"],
  Y: ["Yorick", "Yves", "Yara", "Ysolde"],
  Z: ["Zacharias", "Zeno", "Zora", "Zelda"],
};

const ORDINALS = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth"] as const;

interface Story {
  /** Who the statues speak of, in the plural ("brothers"). */
  group: string;
  /** Singular of the persons ("brother"). */
  kind: string;
  female: boolean;
  /** How the statue says it: `{ord}` is the ordinal, `{name}` the name, `{kind}` the person. */
  line: string;
  /** The line for the youngest or last one, which is not called by number. */
  last: string;
  /** The line for a person who bears the same name as an earlier one. */
  same: string;
  /** The question of the statue that wants the word. */
  ask: string;
}

const STORIES: readonly Story[] = [
  {
    group: "brothers",
    kind: "brother",
    female: false,
    line: "The {ord} brother was called {name}.",
    last: "The youngest brother was called {name}.",
    same: "The {ord} brother was a twin of the {twin}, so they gave him the same name.",
    ask: "Take the first letter of each brother's name, in the order they were born. Which word do they spell?",
  },
  {
    group: "sisters",
    kind: "sister",
    female: true,
    line: "The {ord} of the sisters was called {name}.",
    last: "The youngest sister was called {name}.",
    same: "The {ord} sister was a twin of the {twin}, so they gave her the same name.",
    ask: "Take the first letter of each sister's name, in the order they were born. Which word do they spell?",
  },
  {
    group: "guardsmen",
    kind: "guardsman",
    female: false,
    line: "The {ord} guardsman on the wall was called {name}.",
    last: "The guardsman at the gate, last in the line, was called {name}.",
    same: "The {ord} guardsman was the cousin of the {twin} and carried the same name.",
    ask: "Take the first letter of the name of each guardsman, in the order of the watch. Which word do they spell?",
  },
  {
    group: "apprentices",
    kind: "apprentice",
    female: true,
    line: "The {ord} apprentice of the old witch was called {name}.",
    last: "The last apprentice of the old witch was called {name}.",
    same: "The {ord} apprentice was so fond of the {twin} that she took the same name.",
    ask: "Take the first letter of the name of each apprentice, in the order they came to the witch. Which word do they spell?",
  },
];

export interface LetterHints {
  /** One line per letter, in the order of the word. */
  hints: string[];
  /** What the statue that wants the word asks. */
  ask: string;
}

/**
 * The hints for a word, one per letter, in the order of the letters. A name is chosen per letter; a letter that repeats the one before
 * (BOOTS has two Os in a row) sometimes just says the person bears the same name as the one before.
 */
export function letterHints(rng: Rng, word: string): LetterHints {
  const letters = word.toUpperCase().replace(/[^A-Z]/g, "");
  const story = STORIES[rng.int(STORIES.length)]!;
  const hints: string[] = [];
  const nameOf: (string | undefined)[] = [];
  letters.split("").forEach((letter, i) => {
    const pool = NAMES[letter]!;
    const half = story.female ? pool.slice(2) : pool.slice(0, 2);
    const ordinal = ORDINALS[i] ?? `${i + 1}th`;
    const before = nameOf[i - 1];
    const sameAsBefore = i > 0 && letters[i - 1] === letter && before !== undefined && rng.chance(600);
    // the last one is "the youngest" or "the last" now and then, as in the document's example
    const youngest = i === letters.length - 1 && i > 0 && rng.chance(500);
    let text: string;
    let name: string;
    if (sameAsBefore) {
      name = before;
      text = story.same.replace("{ord}", ordinal).replace("{twin}", ORDINALS[i - 1]!);
    } else {
      name = half[rng.int(half.length)]!;
      text = (youngest ? story.last : story.line).replace("{ord}", ordinal).replace("{name}", name);
    }
    nameOf[i] = name;
    hints.push(text);
  });
  return { hints, ask: story.ask };
}
