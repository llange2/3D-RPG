/**
 * Who sells which talent, as in the hand-built maps of the old game (action 15, "Buy Talent"). In the five towns the cartographer, the
 * explorer, the mountaineer, the sailor, the weapon master and the body builder stand on the street, and so does a guild apprentice who sells the
 * membership of the town's guild; orientation, swimming and perception are taught by the rusty caravans near the towns of the first tier (the altars of
 * Fountain Head Cavern, a "Statue: Head", item 29, taught them in the old game); "Lord Prayer" and "Lord Magic" wait in the Arachnoid Cavern.
 * Pure data: the generator and the game both read it.
 */
import { TEXTS } from "./tables";

export interface TalentSeller {
  /** An animated person of the old maps (`personas.ts`), or ... */
  persona?: number;
  /** ... an object that talks (a statue head). */
  item?: number;
  /** What the seller says before the price. */
  text: string;
}

/** The params a `talent` action carries for its seller: what he says, and the person or object he stands as. */
export function sellerParams(talent: string): Record<string, string | number> {
  const seller = TALENT_SELLERS[talent];
  if (!seller) throw new Error(`nobody sells ${talent}`);
  return { text: seller.text, ...(seller.persona !== undefined ? { persona: seller.persona } : {}), ...(seller.item !== undefined ? { item: seller.item } : {}) };
}

export const TALENT_SELLERS: Record<string, TalentSeller> = {
  talent_cartographer: { persona: 48, text: TEXTS[338]! },
  talent_pathfinder: { persona: 57, text: "My friends, I am Darek the pathfinder, at your service. The outside holds many secrets, but only those, who can understand the signs can see them." },
  talent_cave_explorer: { persona: 56, text: "Hey there, you look like you are decent adventurers. My name is Oro. There are riches in old forgotten caves, but only those, who are knowable enough can explore them." },
  talent_seafarer: { persona: 51, text: "Call me Jolly. I have been so much at sea that I know water better than land. I can teach you to build a float so that you can cross lakes and seas." },
  talent_body_builder: { persona: 55, text: TEXTS[426]! },
  talent_arms_master: { persona: 54, text: TEXTS[425]! },
  // the guild apprentices of the towns (item 50) sell the memberships: the guild houses only let members in
  guild_level_1: { persona: 50, text: TEXTS[290]! },
  guild_level_2: { persona: 50, text: "Friends, the Albatross guild has a place for you, if your purse has a place for the fee. A scholar has to eat as well." },
  guild_level_3: { persona: 50, text: "Do you want to cast spells that do more than singe an eyebrow? The Falcon guild teaches them. I teach the way in." },
  guild_level_4: { persona: 50, text: "The Buzzard guild keeps the great spells. I keep the key. For a modest fee, of course." },
  guild_level_5: { persona: 50, text: "The Eagle guild is the highest circle there is. You have come a long way, and I am glad to open the door for you." },
  talent_orientation: { item: 26, text: "The caravan is full of old maps, compasses and one very confused parrot. A sign says: 'Put the money on the table and you will never lose your way on the map again!'" },
  talent_swimmer: { item: 26, text: "The caravan smells of wet wool and lake water. A sign says: 'Put the money on the table and learn to swim across rivers!'" },
  talent_perceptive: { item: 26, text: "A rusty caravan with a magnifying glass nailed to the door. A sign says: 'Put the money on the table and see what others overlook: hidden passages and doors!'" },
  talent_prayer_master: { persona: 52, text: "I am Lord Prayer." },
  talent_prestidigitator: { persona: 52, text: "I am Lord Magic." },
  // the rusty caravans of the open country (`world/caravans.ts`): the old game's hut of the bargainers, with a sign
  talent_bargainer: { item: 26, text: "The caravan is rusty and empty, except for a table with a shiny scale on it. Next to it is a sign: 'Put the money on the table and become bargainers!'" },
  talent_merchant: { item: 26, text: "A rusty caravan full of crates, scales and sacks. A sign on the door says: 'Put the money on the table and become merchants!'" },
};
