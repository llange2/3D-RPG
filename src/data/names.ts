import type { Rng } from "../core/rng";
import type { PoiKind } from "../world/types";

const START = ["Ald", "Bar", "Cor", "Dra", "El", "Fen", "Gal", "Hal", "Ir", "Jor", "Kel", "Lor", "Mor", "Nor", "Os", "Pel", "Quin", "Rav", "Sil", "Tor", "Ul", "Var", "Wil", "Yar", "Zan"];
const MIDDLE = ["a", "e", "i", "o", "u", "an", "en", "ar", "or", "el", "in", "ra", "mo", "the", "va"];
const END_BY_KIND: Record<PoiKind, string[]> = {
  town: ["ton", "haven", "ford", "wick", "stead", "mere", "bury", "dale"],
  castle: ["hold", "keep", "gard", "reach", "crest", "spire", "guard", "tower"],
  dungeon: ["Crypt", "Vault", "Depths", "Tomb", "Pit", "Warren", "Undercroft", "Catacombs"],
  cave: ["Cave", "Grotto", "Hollow", "Cavern", "Den", "Gully", "Maw", "Burrow"],
};

function stem(rng: Rng): string {
  const start = rng.pick(START);
  const middle = rng.chance(550) ? rng.pick(MIDDLE) : "";
  return `${start}${middle}`;
}

/** Deterministic place name from the given stream: "Aldaton", "Dramohold", "Crypt of Torana". */
export function placeName(rng: Rng, kind: PoiKind): string {
  const base = stem(rng);
  const end = rng.pick(END_BY_KIND[kind]);
  if (kind === "town" || kind === "castle") return `${base}${end}`;
  return `${end} of ${base}a`;
}
