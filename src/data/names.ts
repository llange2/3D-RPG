import type { Rng } from "../core/rng";
import type { PoiKind } from "../world/types";

const START = ["Ald", "Bar", "Cor", "Dra", "El", "Fen", "Gal", "Hal", "Ir", "Jor", "Kel", "Lor", "Mor", "Nor", "Os", "Pel", "Quin", "Rav", "Sil", "Tor", "Ul", "Var", "Wil", "Yar", "Zan"];
const MIDDLE = ["a", "e", "i", "o", "u", "an", "en", "ar", "or", "el", "in", "ra", "mo", "the", "va"];
// 51st playtest, point 6: the names of dungeons, caves and towers have twice as many parts (the towns and castles keep their lists, so their names do not change)
const MORE_START = ["Azr", "Bel", "Cael", "Dun", "Eld", "Fal", "Grim", "Hel", "Ith", "Jar", "Kar", "Lun", "Mal", "Neth", "Ob", "Pyr", "Qor", "Rhun", "Sar", "Thal", "Umb", "Vor", "Wyr", "Xan", "Zul"];
const MORE_MIDDLE = ["ae", "ia", "ol", "ur", "ath", "eth", "is", "ul", "ad", "yn", "oro", "ela", "ima", "ka", "ze"];
const END_BY_KIND: Record<PoiKind, string[]> = {
  town: ["ton", "haven", "ford", "wick", "stead", "mere", "bury", "dale"],
  castle: ["hold", "keep", "gard", "reach", "crest", "spire", "guard", "tower"],
  dungeon: ["Crypt", "Vault", "Depths", "Tomb", "Pit", "Warren", "Undercroft", "Catacombs", "Ossuary", "Sepulchre", "Barrow", "Sanctum", "Cellar", "Oubliette", "Mausoleum", "Underhalls"],
  cave: ["Cave", "Grotto", "Hollow", "Cavern", "Den", "Gully", "Maw", "Burrow", "Cleft", "Chasm", "Lair", "Tunnels", "Shaft", "Fissure", "Mines", "Passage"],
};

function stem(rng: Rng, kind: PoiKind): string {
  const wide = kind === "dungeon" || kind === "cave";
  const start = rng.pick(wide ? [...START, ...MORE_START] : START);
  const middle = rng.chance(550) ? rng.pick(wide ? [...MIDDLE, ...MORE_MIDDLE] : MIDDLE) : "";
  return `${start}${middle}`;
}

/** The name of a dungeon that is built as a tower: "Depths of Elvaa" becomes "Tower of Elvaa". */
export function towerName(name: string): string {
  const i = name.indexOf(" of ");
  return i < 0 ? `Tower of ${name}` : `Tower${name.slice(i)}`;
}

/** Deterministic place name from the given stream: "Aldaton", "Dramohold", "Crypt of Torana". */
export function placeName(rng: Rng, kind: PoiKind): string {
  const base = stem(rng, kind);
  const end = rng.pick(END_BY_KIND[kind]);
  if (kind === "town" || kind === "castle") return `${base}${end}`;
  return `${end} of ${base}a`;
}
