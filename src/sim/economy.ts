import { LAYER, rngFor, type Rng, type SeedState } from "../core/rng";
import { RIDDLES_WORLD } from "../data/riddles";
import { CONSTANTS, SPELLS, TALENTS, type SpellDef } from "../data/tables";
import type { World } from "../world/world";
import { isV4, RULES } from "./balance";
import { isAlive, levelUp, recalcValues, removeCondition, xpToNextLevel } from "./character";
import { generateItem, spellScroll } from "./items";
import { MINUTES_PER_DAY, giveItem } from "./party";
import { isSpellImplemented, learnBlock } from "./spells";
import { BAG_SLOTS, type Character, type Condition, type Item, type Party } from "./types";

/** Price multiplier from the party's talents (25% / 50% discount, as in the old bargain_factor). */
export function bargainFactor(party: Party): number {
  if (party.talents.includes("talent_merchant")) return 0.5;
  // the old game checks `talent_bargaining`, a name no talent has: the bargainer never got his discount. The caravan sells the talent now, so it works
  if (party.talents.includes("talent_bargaining") || party.talents.includes("talent_bargainer")) return 0.75;
  return 1;
}

/** Level of a shop or guild: its own parameter, or, when that is 0 or missing, from the party's average level (the old game). */
export function serviceLevel(party: Party, parameter: number | string | null | undefined): number {
  const given = Number(parameter ?? 0);
  if (Number.isFinite(given) && given >= 1) return Math.min(5, Math.floor(given));
  const average = Math.floor(party.characters.reduce((sum, c) => sum + c.level, 0) / Math.max(1, party.characters.length));
  return average < 8 ? 1 : average < 18 ? 2 : average < 28 ? 3 : average < 38 ? 4 : 5;
}

/**
 * What a tavern's food is worth, by its level (the old TownTavern.update): one purchase tops the party's food up to `days`
 * for `price`, however little is missing. At or above `days` nothing is bought and nothing is paid.
 */
export const TAVERN_FOOD: Record<number, { days: number; price: number }> = {
  1: { days: 5, price: 10 },
  2: { days: 10, price: 50 },
  3: { days: 15, price: 250 },
  4: { days: 20, price: 1000 },
  5: { days: 40, price: 5000 },
};

export function tavernFood(level: number): { days: number; price: number } {
  return TAVERN_FOOD[Math.max(1, Math.min(5, Math.floor(level)))]!;
}

export function buyTavernFood(party: Party, level: number): { ok: boolean; reason?: "full" | "gold"; cost: number } {
  const offer = tavernFood(level);
  if (party.food >= offer.days) return { ok: false, reason: "full", cost: 0 };
  // the old game greys the button out when the gold does not exceed the price
  if (party.gold <= offer.price) return { ok: false, reason: "gold", cost: offer.price };
  party.food = offer.days;
  party.gold -= offer.price;
  return { ok: true, cost: offer.price };
}

// ------------------------------------------------------------------ guild

/** Spell levels a guild of each level teaches (the old `set_inventory_level`). */
const GUILD_SPELL_LEVELS: Record<number, [number, number]> = { 1: [2, 5], 2: [6, 10], 3: [11, 15], 4: [16, 20], 5: [21, Infinity] };

export function guildTeaches(guildLevel: number, spellLevel: number): boolean {
  const [lo, hi] = GUILD_SPELL_LEVELS[Math.max(1, Math.min(5, guildLevel))]!;
  return spellLevel >= lo && spellLevel <= hi;
}

export type GuildSchool = "Arcane" | "Clerical" | "Nature";
export const GUILD_SCHOOLS: readonly GuildSchool[] = ["Arcane", "Clerical", "Nature"];

/**
 * The scrolls a guild of this level sells in one school, whatever class asks: every spell of that school whose level lies in the
 * guild's band (the old `set_inventory_level`: guild 1 sells spells of level 2 to 5, guild 2 level 6 to 10, and so on), lowest level first.
 */
export function guildScrolls(guildLevel: number, school: GuildSchool): SpellDef[] {
  return Object.values(SPELLS)
    .filter((s) => s.type.includes(school) && guildTeaches(guildLevel, s.level))
    .sort((a, b) => a.level - b.level || a.id - b.id);
}

/** The talent that makes the party a member of the guild of this level (Raven, Albatross, Falcon, Buzzard, Eagle). */
export const guildTalent = (level: number): string => `guild_level_${Math.max(1, Math.min(5, level))}`;

export function isGuildMember(party: Party, level: number): boolean {
  return party.talents.includes(guildTalent(level));
}

/** What a membership costs where it can be bought (0: it cannot, the Eagle guild only takes who has earned it). */
export function guildFee(level: number, party: Party): number {
  return Math.round((TALENTS[guildTalent(level)]?.price ?? 0) * bargainFactor(party));
}

export function joinGuild(party: Party, level: number): { ok: boolean; cost: number } {
  const cost = guildFee(level, party);
  if (cost <= 0 || party.gold < cost || isGuildMember(party, level)) return { ok: false, cost };
  party.gold -= cost;
  party.talents.push(guildTalent(level));
  return { ok: true, cost };
}

// ------------------------------------------------------------------ inn, tavern

export function innCost(party: Party, tier: number): number {
  return Math.max(10, Math.round(20 * tier * party.characters.length * bargainFactor(party)));
}

/** Rest at an inn: heals everybody, ends bad conditions and moves the clock to 8:00 next morning. */
export function innRest(party: Party, tier: number): { ok: boolean; cost: number; reason?: "gold" } {
  const cost = innCost(party, tier);
  if (party.gold < cost) return { ok: false, cost, reason: "gold" };
  party.gold -= cost;
  const minuteOfDay = party.minutes % MINUTES_PER_DAY;
  const wait = minuteOfDay < 480 ? 480 - minuteOfDay : MINUTES_PER_DAY - minuteOfDay + 480;
  party.minutes += wait;
  for (const c of party.characters) {
    if (!isAlive(c)) continue;
    for (const cond of ["Sleeping", "Unconscious", "Weak", "Drunk", "Poisoned", "Diseased", "Crazy"] as const) removeCondition(c, cond);
    recalcValues(c, party.talents, true, party.mascot);
  }
  party.effects = party.effects.filter((e) => e.until > party.minutes);
  return { ok: true, cost };
}

/** What a tavern tells about a word (quest document 1.2, "Rätselmaster": the answers that exist in the world can turn up as rumours, with some silly ones among them). */
const WORD_RUMOURS = [
  "You invite a grieving peasant for a beer. He mumbles: \"My father told me on his death bed the word {a}. I have no clue what it means, but it must be important.\"",
  "A drunk sailor grabs your sleeve. \"{a}! Say it to a statue, and the stone will listen. At least that is what my grandmother swore.\"",
  "The barkeep wipes a mug and whispers: \"A wandering scholar left here with one word on his lips: {a}. He never came back.\"",
  "An old woman by the fire nods to herself. \"{a}, {a}, {a}. Whoever knows it, knows what the stones want to hear.\"",
  "A boy tugs at your cloak. \"There is a word the dead keep: {a}. Don't ask me how I know.\"",
];

/**
 * A rumour that lets a password slip (42nd playtest, point 7): the answer of a riddle that a statue of a dungeon, cave or castle nearby asks (a place up to one level above the
 * tavern). Null if the world has none yet.
 */
export function wordRumour(world: World, tavernTier: number, rng: Rng): string | null {
  const near = world.riddlesOfWorld().filter((r) => r.tier <= tavernTier + 1);
  if (near.length === 0) return null;
  const answer = RIDDLES_WORLD[String(near[rng.int(near.length)]!.riddle)]!.answer;
  return WORD_RUMOURS[rng.int(WORD_RUMOURS.length)]!.replace(/\{a\}/g, answer);
}

/** A funny rumour that means nothing. */
export const SILLY_RUMOURS: readonly string[] = [
  "A man at the bar swears that his goat can count to nine, but only on Tuesdays.",
  "\"The moon is a cheese,\" says a fat merchant, \"and the king's cook has the only knife that cuts it.\"",
  "An old woman whispers: \"Never trust a chicken that looks at you for longer than a heartbeat.\"",
  "The barkeep leans over the counter. \"They say the best sword is the one you did not have to draw. I say the best soup is the one you did not have to cook.\"",
  "A stable boy claims that horses dream of oats made of gold, and that this is why they are so tired in the morning.",
  "A drunk dwarf announces that beards grow faster if you sing to them. His is very long, and he looks very tired.",
  "\"A frog in the well means rain,\" mutters a farmer. \"Two frogs mean a wedding. Three frogs mean my wife has been in the well again.\"",
  "A minstrel shrugs: \"I know four hundred songs, and in all of them somebody loses a boot.\"",
  "An old soldier taps his wooden leg. \"Lost it to a goose. Don't laugh. You have never seen that goose.\"",
  "Somebody in the corner insists that the mountains were once flat, and that the giants tidied them up into heaps.",
  "\"If your shadow runs away from you at noon, don't chase it,\" a tailor advises. \"It always comes back for supper.\"",
  "A fisherman sighs. \"The big one that got away? It came back. It wanted its hook returned.\"",
  "A child by the fire explains with great seriousness that the stars are holes in the night, and the day is the glue.",
  "A baker nods wisely. \"Bread without salt is like a knight without a horse. It gets there, but nobody is proud of it.\"",
  "\"I once saw a wizard sneeze,\" a farmhand says. \"The cow was a bit of a toad for a week, but she gave excellent milk.\"",
  "A traveller whispers: \"There is a town where the rooster sleeps in and the sun has to wait.\"",
  "The barkeep polishes a mug and sighs. \"They say a tavern is only as good as its worst story. Mine is about a ham.\"",
  "A one-eyed sailor swears that the sea is only a very large puddle, and that the ships are the puddle's idea.",
  "\"Beware of lamp posts that smile,\" says a bard. \"I met one in a dream, and it owed me money.\"",
  "A blacksmith grunts: \"A hammer never forgets. That is why I never lend mine to my brother.\"",
];

/** The rumours of a tavern (42nd playtest, point 7): half the time a password of a place nearby, otherwise something funny and senseless. No distances or directions to places. */
export function tavernRumour(world: World, tavernTier: number, rng: Rng): string {
  const word = rng.int(2) === 0 ? wordRumour(world, tavernTier, rng) : null;
  return word ?? SILLY_RUMOURS[rng.int(SILLY_RUMOURS.length)]!;
}

// ------------------------------------------------------------------ temple

export function healCost(c: Character, tier: number, party: Party): number {
  return Math.round(Math.max(0, c.health - c.hp) * 2 * tier * bargainFactor(party));
}

const CURE_PRICE: Partial<Record<Condition, number>> = { Poisoned: 40, Diseased: 80, Cursed: 120, Crazy: 100, Weak: 30, Drunk: 10, Sleeping: 5, Paralyzed: 150, Petrified: 400, Unconscious: 60 };

export function cureCost(cond: Condition, tier: number, party: Party): number {
  return Math.round((CURE_PRICE[cond] ?? 100) * tier * bargainFactor(party));
}

export function reviveCost(c: Character, tier: number, party: Party): number {
  return Math.round(300 * c.level * tier * bargainFactor(party));
}

export function templeHeal(party: Party, index: number, tier: number): boolean {
  const c = party.characters[index]!;
  const cost = healCost(c, tier, party);
  if (!isAlive(c) || party.gold < cost) return false;
  party.gold -= cost;
  c.hp = c.health;
  removeCondition(c, "Unconscious");
  return true;
}

export function templeCure(party: Party, index: number, cond: Condition, tier: number): boolean {
  const c = party.characters[index]!;
  const cost = cureCost(cond, tier, party);
  if (!c.conditions.includes(cond) || party.gold < cost) return false;
  party.gold -= cost;
  removeCondition(c, cond);
  if (cond === "Unconscious" && c.hp <= 0) c.hp = 1;
  return true;
}

export function templeRevive(party: Party, index: number, tier: number): boolean {
  const c = party.characters[index]!;
  const cost = reviveCost(c, tier, party);
  if (!c.conditions.includes("Dead") || party.gold < cost) return false;
  party.gold -= cost;
  removeCondition(c, "Dead");
  removeCondition(c, "Rotten");
  c.hp = Math.max(1, Math.floor(c.health / 2));
  return true;
}

// ------------------------------------------------------------------ smith

export type SmithShelf = "armor" | "weapons" | "rings";

export interface Stock {
  item: Item;
  price: number;
  shelf: SmithShelf;
}

/** Eight items per shelf, like the old `generate_inventory`. */
const SMITH_SHELF_SIZE = 8;

function shelfOf(item: Item): SmithShelf | null {
  const type = item.type.toLowerCase();
  if ([...CONSTANTS.WEAPON_TYPES_1H, ...CONSTANTS.WEAPON_TYPES_2H, ...CONSTANTS.RANGED_WEAPON_TYPES].includes(type)) return "weapons";
  if ([...CONSTANTS.BODY_ARMOR_TYPES, ...CONSTANTS.ARMOR_TYPES].includes(type)) return "armor";
  return type === "ring" ? "rings" : null;
}

/**
 * What the smith offers today: a pure function of the world seed, the shop and the day, so it only changes overnight. Like the old
 * `TownSmithTrading.generate_inventory` it rolls items of the shop's own level (the material runs from 1 to level + 3, so a level 2 smith
 * never sells ruby) until every shelf holds eight.
 */
export function smithStock(root: SeedState, poiId: string, day: number, tier: number, party: Party): Stock[] {
  const rng = rngFor(root, LAYER.LOOT, `smith:${poiId}`, day);
  const shelves: Record<SmithShelf, Stock[]> = { armor: [], weapons: [], rings: [] };
  // every roll lands on a shelf or is dropped; the bound only guards against a table that never fills a shelf
  for (let tries = 0; tries < 2000 && Object.values(shelves).some((s) => s.length < SMITH_SHELF_SIZE); tries++) {
    const item = generateItem(rng, Math.max(1, tier));
    const shelf = shelfOf(item);
    if (shelf && shelves[shelf].length < SMITH_SHELF_SIZE) shelves[shelf].push({ item, shelf, price: Math.max(1, Math.round(item.value * bargainFactor(party))) });
  }
  return [shelves.armor, shelves.weapons, shelves.rings].flatMap((s) => s.sort((a, b) => a.price - b.price));
}

export function sellPrice(item: Item, party: Party): number {
  const base = Math.max(1, Math.floor(item.value / 2));
  return party.talents.includes("talent_merchant") ? Math.round(base * 1.5) : base;
}

export function buyItem(party: Party, stock: Stock): { ok: boolean; reason?: "gold" | "space" } {
  if (party.gold < stock.price) return { ok: false, reason: "gold" };
  const copy: Item = JSON.parse(JSON.stringify(stock.item)) as Item;
  copy.id = "";
  if (!giveItem(party, copy)) return { ok: false, reason: "space" };
  party.gold -= stock.price;
  return { ok: true };
}

export function sellItem(party: Party, character: number, slot: string): boolean {
  const c = party.characters[character]!;
  const item = c.inventory[slot];
  if (!item || item.quest) return false;
  party.gold += sellPrice(item, party);
  c.inventory[slot] = null;
  return true;
}

// ------------------------------------------------------------------ bank

export function deposit(party: Party, amount: number): number {
  const n = Math.max(0, Math.min(amount, party.gold));
  party.gold -= n;
  party.bankGold += n;
  return n;
}

export function withdraw(party: Party, amount: number): number {
  const n = Math.max(0, Math.min(amount, party.bankGold));
  party.bankGold -= n;
  party.gold += n;
  return n;
}

/** Positions of the bank's sliders (0 to `BANK_SLIDER_STEPS`). */
export const BANK_SLIDER_STEPS = 1000;

/**
 * The amount a bank slider stands for (45th playtest, point 10). The sums run from a few hundred to millions, so the slider is not linear: the position is cubed, which gives fine steps
 * at the bottom and coarse ones at the top. The result is rounded to three significant digits (never to more than `max`), the end of the slider is exactly `max` and the start 0.
 */
export function bankSliderAmount(max: number, position: number): number {
  if (max <= 0 || position <= 0) return 0;
  if (position >= BANK_SLIDER_STEPS) return max;
  const raw = Math.max(1, max * (position / BANK_SLIDER_STEPS) ** 3);
  const unit = 10 ** Math.max(0, Math.floor(Math.log10(raw)) - 2);
  return Math.min(max, Math.max(1, Math.round(raw / unit) * unit));
}

// ------------------------------------------------------------------ training, guild

/** Game minutes a hero spends at the training grounds for one level (41st playtest, point 6): "Train all" takes this per hero, so eight hours for a party of four. */
export const TRAINING_MINUTES = 120;

export function trainingCost(c: Character, party: Party): number {
  // BALANCE v4: 10 × level² per hero (the formula of the user's source list); LEGACY (balance v4): 250 × level
  const base = isV4() ? c.level * c.level * RULES.v4.trainingPerLevelSquared : c.level * RULES.legacy.trainingPerLevel;
  return Math.round(base * bargainFactor(party));
}

export type TrainResult = { ok: true; cost: number } | { ok: false; reason: "xp" | "gold" | "dead"; needXp?: number; cost?: number };

export function train(party: Party, index: number): TrainResult {
  const c = party.characters[index]!;
  if (!isAlive(c)) return { ok: false, reason: "dead" };
  const need = xpToNextLevel(c);
  if (need > 0) return { ok: false, reason: "xp", needXp: need };
  const cost = trainingCost(c, party);
  if (party.gold < cost) return { ok: false, reason: "gold", cost };
  party.gold -= cost;
  levelUp(c, party.talents, 1, party.mascot);
  // 42nd playtest, point 1: a trained hero is rested in hit points and spell points (`levelUp` refills them); a hero at 0 is awake again,
  // as with every healing. The other conditions stay: the two hours of drill pass on the clock (`TRAINING_MINUTES`), so poison can still kill.
  c.hp = c.health;
  c.sp = c.mana;
  removeCondition(c, "Unconscious");
  return { ok: true, cost };
}

/** The heroes who could train now (alive, enough experience), lowest level first; ties keep the party's order. */
export function trainingOrder(party: Party): number[] {
  return party.characters
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => isAlive(c) && xpToNextLevel(c) <= 0)
    .sort((a, b) => a.c.level - b.c.level || a.i - b.i)
    .map(({ i }) => i);
}

/**
 * "Train all": one level for every hero who can rise, beginning with the lowest level, as long as the gold lasts. Training costs more the
 * higher the level, so once one hero cannot be paid for nobody after them can either, and the rest wait. Nothing is changed here:
 * `who` is who would be trained, `cost` what that takes, `waiting` who could rise but cannot be paid for.
 */
export function trainAllPlan(party: Party): { who: number[]; cost: number; waiting: number[] } {
  const order = trainingOrder(party);
  const who: number[] = [];
  let cost = 0;
  for (const index of order) {
    const price = trainingCost(party.characters[index]!, party);
    if (cost + price > party.gold) break;
    who.push(index);
    cost += price;
  }
  return { who, cost, waiting: order.slice(who.length) };
}

/** Carries out `trainAllPlan`: every hero in it rises one level, the lowest first. */
export function trainAll(party: Party): ReturnType<typeof trainAllPlan> {
  const plan = trainAllPlan(party);
  for (const index of plan.who) train(party, index);
  return plan;
}

export function spellPrice(spell: SpellDef, party: Party): number {
  return Math.max(10, Math.round(spell.value * bargainFactor(party)));
}

/**
 * Buys the scroll of a spell for a hero's backpack (the next hero's, then the Donkey's, when it is full). The scroll is read from
 * the backpack with a right click, where the same rules as for the old game apply: the school of the hero's class, the spell's level.
 */
export function buyScroll(party: Party, hero: number, spellId: number): { ok: boolean; reason?: "gold" | "space" | "unknown"; price: number } {
  const spell = SPELLS[spellId];
  if (!spell) return { ok: false, reason: "unknown", price: 0 };
  const price = spellPrice(spell, party);
  if (party.gold < price) return { ok: false, reason: "gold", price };
  const scroll = spellScroll(spellId);
  const bag = party.characters[hero]?.inventory;
  const slot = bag ? BAG_SLOTS.find((s) => bag[s] === null) : undefined;
  if (bag && slot) {
    scroll.id = `i${(party.itemCounter++).toString(36)}`;
    bag[slot] = scroll;
  } else if (!giveItem(party, scroll)) return { ok: false, reason: "space", price };
  party.gold -= price;
  return { ok: true, price };
}

/** The guild buys spell scrolls back, and nothing else. */
export function sellScroll(party: Party, hero: number, slot: string): boolean {
  const item = party.characters[hero]?.inventory[slot];
  return !!item && item.type === "spell" && sellItem(party, hero, slot);
}

export function learnSpell(party: Party, index: number, spellId: number): { ok: boolean; reason?: "gold" | "known" | "cannot" } {
  const c = party.characters[index]!;
  const spell = SPELLS[spellId];
  if (!spell || learnBlock(c, spellId) !== null || !isSpellImplemented(spellId)) return { ok: false, reason: c.spells.includes(spellId) ? "known" : "cannot" };
  const price = spellPrice(spell, party);
  if (party.gold < price) return { ok: false, reason: "gold" };
  party.gold -= price;
  c.spells.push(spellId);
  c.spells.sort((a, b) => a - b);
  return { ok: true };
}
