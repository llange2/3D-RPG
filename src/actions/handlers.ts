import { thousands } from "../core/format";
import { LAYER, rngFor, type Rng, type SeedState } from "../core/rng";
import { loreLine } from "../data/lore";
import { BARREL_COINS, BARREL_EMPTY, propLine } from "../data/prop-texts";
import { pickMonsterWeighted } from "../data/monsters";
import { BASE_CLASS, SPELLS, TALENTS, TEXTS, talentInfo } from "../data/tables";
import { attr, canAct, canBeHealed, healHp, itemBonus, levelUp, thieveryRoll } from "../sim/character";
import { applyHit, elementalDamage, type DamageType } from "../sim/combat";
import { addCondition } from "../sim/conditions";
import { generateItem, questItem, spellScroll } from "../sim/items";
import { activeCharacters, addXp, freeSlots, giveItem, grantTalent, hasEffect } from "../sim/party";
import type { Attribute, Character, Condition, Item, Party } from "../sim/types";
import type { ActionInstance, MapContent } from "./types";
import { FACING_NAMES, gongsStruck, headFacing, moanSolved, ringSolved, rotationSolved, sameAnswer, turnHead } from "./quests";
import { answerMatches } from "../data/riddles";
import { trapElementOf, type ServiceKind } from "./registry";

export type Effect =
  | { type: "text"; text: string }
  | { type: "gold"; amount: number }
  | { type: "item"; item: Item; stored: boolean }
  | { type: "damage"; character: number; amount: number; damageType: DamageType; conditions: Condition[] }
  | { type: "attribute"; character: number; attribute: Attribute; amount: number }
  | { type: "resistance"; character: number; element: "fire" | "ice" | "acid" | "magic"; amount: number }
  | { type: "heal"; character: number; amount: number }
  | { type: "transfer"; mode: "poi_enter" | "poi_exit" | "stairs" | "teleport"; tier: number }
  | { type: "service"; service: ServiceKind; tier: number }
  | { type: "door"; state: "opened" | "locked" | "unlocked" }
  | { type: "wall"; state: "broken" }
  /** The game asks a yes or no question and calls `resolveAction` again with `ctx.answer` set to "yes", or to null when declined. */
  | { type: "confirm"; title: string; question: string; yes?: string; no?: string }
  /** The party bought a talent. */
  | { type: "talent"; talent: string; price: number }
  /** The party touched the portal of the town it stands in: the game registers it and offers the others it knows. */
  | { type: "portal" }
  /** The party worked for the job master: the gold is already paid, `days` pass. */
  | { type: "work"; gold: number; days: number }
  | { type: "ambush"; monsterIds: number[] }
  /** A statue wants an answer: the game asks the question and calls `resolveAction` again with it as `ctx.answer`. */
  | { type: "ask"; question: string }
  /** The party is thrown to a cell (a rune of the field). */
  | { type: "jump"; x: number; y: number }
  /** The game asks which hero (a chalice is to be drunk) and calls `resolveAction` again with `ctx.hero` set, or null when nobody was chosen. */
  | { type: "pick"; question: string }
  /** The quest of the place is done: its end room opens (the seal gives way, or the party is teleported into the pocket). */
  | { type: "endroom" }
  /** A hero got a condition from a chalice. */
  | { type: "condition"; character: number; condition: Condition }
  | { type: "defeat" };

export interface ActionContext {
  party: Party;
  rootSeed: SeedState;
  /** The quests need to see the rest of the place and what has been used up; the game passes both. */
  content?: MapContent;
  opened?: ReadonlySet<string>;
  /** The answer a player gave to the question of a riddle statue, or null if they gave none. Undefined until asked. */
  answer?: string | null;
  /** The hero a `pick` effect asked for. Undefined until asked. */
  hero?: number | null;
  /** Counts attempts at a repeatable check (door, wall), so every attempt rolls differently but reproducibly. */
  attempt?: number;
  /** Monster families of the current map, for ambushes. */
  monsterThemes: Record<string, number>;
  tier: number;
  /** True when a fountain was already used today. */
  usedToday?: boolean;
}

export interface ActionOutcome {
  effects: Effect[];
  /** True when the action is used up and must be stored in the save deltas. */
  consumed: boolean;
  /** True when the action worked and must not work again until tomorrow (fountains). */
  usedToday?: boolean;
  /** Changes to the set of used-up actions that are not "this action is done": levers and heads keep their position there. */
  state?: { add: string[]; remove: string[] };
}

/** What the job master pays and how long the work takes (old action 19, "Work a week for 100 gold": the old code advances ten days). */
export const WORK_GOLD = 100;
export const WORK_DAYS = 10;

const ELEMENTS = ["fire", "ice", "acid", "magic"] as const;
/** The old texts of an elemental trap ("Fire trap!"). */
const TRAP_TEXT = { acid: 432, fire: 433, ice: 434, magic: 435 } as const;
const ATTRS: Attribute[] = ["str", "int", "per", "end", "spd", "acc", "lck"];

/** The random stream of one action: a pure function of the world seed, the action uid and the attempt number. */
export function actionRng(ctx: Pick<ActionContext, "rootSeed" | "attempt">, uid: string): Rng {
  return rngFor(ctx.rootSeed, LAYER.LOOT, uid, ctx.attempt ?? 0);
}

const EMPTY: MapContent = { mapKey: "", tier: 1, actions: [], spawns: [] };
const NONE: ReadonlySet<string> = new Set();

/** The gold and the items of a chest or a riddle's reward: `gold`, `items` generated at `level`. */
function payOut(p: ActionInstance["params"], rng: Rng, party: Party, effects: Effect[]): void {
  const gold = Number(p.gold ?? 0);
  const level = Number(p.level ?? 1);
  const items = Number(p.items ?? 0);
  // a barrel is a container like a chest: it gives a few coins or a joke, never nothing at all
  const barrel = Number(p.chest) === 5;
  if (barrel) {
    const lines = gold > 0 ? BARREL_COINS : BARREL_EMPTY;
    effects.push({ type: "text", text: lines[rng.int(lines.length)]! });
  }
  if (gold > 0) {
    party.gold += gold;
    effects.push({ type: "gold", amount: gold });
  }
  for (let i = 0; i < items; i++) {
    const item = generateItem(rng, level);
    const stored = giveItem(party, item);
    effects.push({ type: "item", item, stored });
  }
  // end room rewards (quest document 1.2): packages of attribute points of a random kind, a level for everyone, scrolls of spells of the level
  const packages = Number(p.attr ?? 0);
  for (let i = 0; i < packages; i++) {
    const attribute = ATTRS[rng.int(ATTRS.length)]!;
    const who = attributeRecipient(party, attribute, rng);
    if (who === null) continue;
    const points = Number(p.pts ?? 5);
    party.characters[who]![attribute] += points;
    effects.push({ type: "text", text: `${party.characters[who]!.name} is filled with strength: ${attribute.toUpperCase()} +${points}.` }, { type: "attribute", character: who, attribute, amount: points });
  }
  const levels = Number(p.levels ?? 0);
  if (levels > 0) {
    for (const i of activeCharacters(party)) levelUp(party.characters[i]!, party.talents, levels, party.mascot);
    effects.push({ type: "text", text: levels === 1 ? "A surge of experience runs through the party: everybody rises a level." : `A surge of experience runs through the party: everybody rises ${levels} levels.` });
  }
  const scrolls = Number(p.spells ?? 0);
  if (scrolls > 0) {
    const wanted = Number(p.spellLevel ?? level);
    const pool = Object.values(SPELLS).filter((sp) => sp.level === wanted);
    for (let i = 0; i < scrolls && pool.length > 0; i++) {
      const item = spellScroll(pool[rng.int(pool.length)]!.id);
      effects.push({ type: "item", item, stored: giveItem(party, item) });
    }
  }
  const nothing = gold === 0 && items === 0 && packages === 0 && levels === 0 && scrolls === 0;
  if (nothing && !barrel) effects.push({ type: "text", text: "The chest is empty." });
}

function randomActive(party: Party, rng: Rng): number | null {
  const active = activeCharacters(party);
  return active.length === 0 ? null : active[rng.int(active.length)]!;
}

/** A class lives off the attributes it asks for (`STR` for the knight, `INT` for the wizard, `STR+PER+END` for the paladin). */
function usesAttribute(c: Character, attribute: Attribute): boolean {
  return (BASE_CLASS[c.classType]?.requirements ?? "").split("+").some((r) => r.trim().toLowerCase() === attribute);
}

/**
 * Who a shrine gives a plus in `attribute` to. The campaign lets the player choose, here the game picks the best: one of the heroes
 * whose class lives off it, at random if there are several. Luck helps everybody, the thief a little more (twice the chance). With
 * nobody who lives off it, the hero who has most of it.
 */
export function attributeRecipient(party: Party, attribute: Attribute, rng: Rng): number | null {
  const active = activeCharacters(party);
  if (active.length === 0) return null;
  if (attribute === "lck") {
    const raffle = active.flatMap((i) => (party.characters[i]!.classType === "Thief" ? [i, i] : [i]));
    return raffle[rng.int(raffle.length)]!;
  }
  const users = active.filter((i) => usesAttribute(party.characters[i]!, attribute));
  if (users.length > 0) return users[rng.int(users.length)]!;
  const best = Math.max(...active.map((i) => attr(party.characters[i]!, attribute)));
  const tied = active.filter((i) => attr(party.characters[i]!, attribute) === best);
  return tied[rng.int(tied.length)]!;
}

const RESISTANCE_KEY = { fire: "res_fire", ice: "res_ice", acid: "res_acid", magic: "res_magic" } as const;
const RESISTANCE_FIELD = { fire: "resFire", ice: "resIce", acid: "resAcid", magic: "resMagic" } as const;

/** Who a shrine gives a resistance to: the hero who has the least of it (what the gear adds counts), at random among equals. */
export function resistanceRecipient(party: Party, element: (typeof ELEMENTS)[number], rng: Rng): number | null {
  const active = activeCharacters(party);
  if (active.length === 0) return null;
  const has = (i: number) => party.characters[i]![RESISTANCE_FIELD[element]] + itemBonus(party.characters[i]!, RESISTANCE_KEY[element]);
  const least = Math.min(...active.map(has));
  const tied = active.filter((i) => has(i) === least);
  return tied[rng.int(tied.length)]!;
}

/** The tries a mini-quest statue has used: every wrong answer leaves `<uid>@try<n>` in the set. */
function countedTries(opened: ReadonlySet<string>, uid: string): number {
  let n = 0;
  while (opened.has(`${uid}@try${n}`)) n++;
  return n;
}

/** Is the typed text the answer? A number must be exactly it, a word may be an alias, differ in case or article, or have one slip of the finger. */
function answerIsRight(given: string, p: ActionInstance["params"]): boolean {
  const answer = String(p.answer);
  if (/^-?\d+$/.test(answer)) return given.trim() === answer;
  const aliases = typeof p.aliases === "string" && p.aliases !== "" ? p.aliases.split(",") : [];
  return answerMatches(given, { answer, aliases }) || sameAnswer(given, answer);
}

/**
 * Resolves what happens when the party uses an action. The result is a list of effects for the UI layer;
 * this function changes the party (gold, items, damage) but never touches the DOM or the renderer.
 */
export function resolveAction(action: ActionInstance, ctx: ActionContext): ActionOutcome {
  const { party } = ctx;
  const rng = actionRng(ctx, action.uid);
  const p = action.params;
  const effects: Effect[] = [];

  switch (action.kind) {
    case "treasure": {
      // a chest that the quest of the place keeps shut until its puzzle is solved (the head ring, the row of heads)
      if ((p.lock === "ring" && !ringSolved(ctx.content ?? EMPTY, ctx.opened ?? NONE)) || (p.lock === "rotation" && !rotationSolved(ctx.content ?? EMPTY, ctx.opened ?? NONE))) {
        return { effects: [{ type: "text", text: "The chest will not open. Something in this hall is not as it should be." }], consumed: false };
      }
      // the key or key card of a place (chapter 1.2 of docs/DUNGEON_THEMES.md): a chest that holds nothing else stays shut until it fits in a backpack
      if (typeof p.quest === "string") {
        const found = questItem(p.quest);
        if (!found) throw new Error(`unknown quest item ${p.quest} in ${action.uid}`);
        const count = Math.max(1, Number(p.count ?? 1));
        // all of them or none: a chest of orbs stays shut until the backpacks have room for every one
        if (freeSlots(party) < count) return { effects: [{ type: "text", text: `You find the ${found.name}, but every backpack is full. Make room first.` }], consumed: false };
        const items = Array.from({ length: count }, () => questItem(String(p.quest))!);
        for (const item of items) giveItem(party, item);
        items.forEach((item) => effects.push({ type: "item", item, stored: true }));
        return { effects, consumed: true };
      }
      payOut(p, rng, party, effects);
      return { effects, consumed: true };
    }

    case "riddle": {
      if (p.requires === "gongs" && ctx.content) {
        const gongs = gongsStruck(ctx.content, ctx.opened ?? NONE);
        if (gongs.done < gongs.total) {
          effects.push({ type: "text", text: `The statue stays silent. "Only when all ${gongs.total} have been struck will the master reveal himself." (${gongs.done} of ${gongs.total})` });
          return { effects, consumed: false };
        }
      }
      // a statue of a mini quest falls silent after its tries (every wrong answer leaves `<uid>@try<n>` in the set)
      if (p.tries !== undefined && countedTries(ctx.opened ?? NONE, action.uid) >= Number(p.tries)) {
        effects.push({ type: "text", text: "The statue stays silent." });
        return { effects, consumed: false };
      }
      if (ctx.answer === undefined) return { effects: [{ type: "ask", question: String(p.question) }], consumed: false };
      if (ctx.answer === null) return { effects, consumed: false };
      if (!answerIsRight(ctx.answer, p)) {
        effects.push({ type: "text", text: "The statue's eyes dim. That is not the answer." });
        if (p.tries === undefined) return { effects, consumed: false };
        return { effects, consumed: false, state: { add: [`${action.uid}@try${countedTries(ctx.opened ?? NONE, action.uid)}`], remove: [] } };
      }
      effects.push({ type: "text", text: p.opens === "end" ? "The statue's eyes light up. \"Right!\" Stone grinds on stone somewhere in the walls." : "The statue's eyes light up. \"Right!\" A hidden compartment opens at its feet." });
      if (Number(p.gold ?? 0) > 0 || Number(p.items ?? 0) > 0) payOut(p, rng, party, effects);
      if (p.opens === "end") effects.push({ type: "endroom" });
      return { effects, consumed: true };
    }

    case "gong": {
      const gongs = gongsStruck(ctx.content ?? EMPTY, ctx.opened ?? NONE);
      const last = gongs.done + 1 >= gongs.total;
      effects.push({ type: "text", text: last ? "The last gong sounds. The air hums. Magic runes flare up in the middle of this place." : `The gong booms (${gongs.done + 1} of ${gongs.total}). Something answers from the dark.` });
      const ids = String(p.monsters ?? "").split(",").filter((s) => s !== "").map(Number);
      const group = Number(p.group ?? 1);
      if (ids.length > 0) effects.push({ type: "ambush", monsterIds: Array.from({ length: group }, () => ids[rng.int(ids.length)]!) });
      return { effects, consumed: true };
    }

    case "lever": {
      effects.push({ type: "text", text: "You pull the lever. Somewhere in the walls stone grinds on stone." });
      // a lever with a target flips it; the look-alikes without one do nothing but look the same
      const target = String(p.target ?? "");
      if (target === "") return { effects, consumed: false };
      const pulled = (ctx.opened ?? NONE).has(action.uid);
      return { effects, consumed: false, state: pulled ? { add: [], remove: [action.uid] } : { add: [action.uid], remove: [] } };
    }

    case "head": {
      if (p.mode === "ring") {
        effects.push({ type: "text", text: "A giant stone head. It seems to wait for something." });
        return { effects, consumed: false };
      }
      if (p.mode === "moan") {
        effects.push({ type: "text", text: "The statue moans. A hollow sound, as if from far below." });
        return { effects, consumed: false };
      }
      // a head of the row says its piece, then asks whether to turn it to the next direction, clockwise
      const now = headFacing(action, ctx.opened ?? NONE);
      const facing = (now + 1) % 4;
      const hint = typeof p.hint === "string" ? `${p.hint} ` : "";
      if (ctx.answer === undefined) return { effects: [{ type: "confirm", title: "Stone head", question: `${hint}The head is facing ${FACING_NAMES[now]}. Would you like to turn it ${FACING_NAMES[facing]}?`, yes: "Turn it", no: "Leave" }], consumed: false };
      if (ctx.answer === null) return { effects, consumed: false };
      effects.push({ type: "text", text: `The stone head turns with a grating sound and looks ${FACING_NAMES[facing]}.` });
      const next = turnHead(action, ctx.opened ?? NONE, facing);
      // the row is right when every head looks the way it should: the last turn opens the end room
      const after = new Set([...(ctx.opened ?? NONE)].filter((k) => !next.remove.includes(k)));
      for (const k of next.add) after.add(k);
      if (ctx.content && rotationSolved(ctx.content, after)) effects.push({ type: "endroom" });
      return { effects, consumed: false, state: next };
    }

    case "chalice": {
      // quest 2: the liquid in the cup is strange; whoever drinks hears a number and a direction, and falls ill
      if (ctx.hero === undefined) return { effects: [{ type: "pick", question: "A strange liquid fills the chalice. Which character shall drink it?" }], consumed: false };
      if (ctx.hero === null) return { effects, consumed: false };
      const hero = party.characters[ctx.hero];
      if (!hero) return { effects, consumed: false };
      const kinds = String(p.conditions ?? "Poisoned").split(",") as Condition[];
      const condition = kinds[rng.int(kinds.length)]!;
      addCondition(hero, condition, party.minutes);
      effects.push({ type: "text", text: `You hear ${String(p.number)}-${String(p.dir)} in your mind, before everything gets dark in front of your eyes.` }, { type: "condition", character: ctx.hero, condition });
      return { effects, consumed: true };
    }

    case "rune": {
      // quest 1 (the middle of the field) and quest 3 (the runes the last gong calls up): only the solved quest takes the party to the end room
      const content = ctx.content ?? EMPTY;
      const opened = ctx.opened ?? NONE;
      const gongs = gongsStruck(content, opened);
      const ready = p.need === "moan" ? moanSolved(content, opened) : gongs.total > 0 && gongs.done >= gongs.total;
      if (!ready) return { effects, consumed: false };
      effects.push({ type: "text", text: "The runes flare up. The floor falls away, and a strange light takes you." }, { type: "endroom" });
      return { effects, consumed: false };
    }

    case "qportal":
      // the portal of an end room reached by teleport leads back to where the quest began (A > B > A, apart from the portals of the towns)
      effects.push({ type: "text", text: "The portal hums and carries you back to the entrance." }, { type: "jump", x: Number(p.tx), y: Number(p.ty) });
      return { effects, consumed: false };

    case "teleporter":
      effects.push({ type: "text", text: "The floor flares under your feet. You are thrown back!" }, { type: "jump", x: Number(p.tx), y: Number(p.ty) });
      return { effects, consumed: false };

    case "door": {
      if (p.locked !== true) {
        // a gate of a town asks first, like the old action 16 ("Would you like to open the gate?")
        if (p.ask === true) {
          if (ctx.answer === undefined) return { effects: [{ type: "confirm", title: "Gate", question: "A heavy metal gate bars the way. Would you like to open it?", yes: "Open", no: "Leave" }], consumed: false };
          if (ctx.answer === null) return { effects, consumed: false };
        }
        effects.push({ type: "door", state: "opened" });
        return { effects, consumed: true };
      }
      // the door of a castle's vault says that it is locked first and asks whether to try it
      if (p.ask === true) {
        if (ctx.answer === undefined) return { effects: [{ type: "confirm", title: "Locked door", question: "The door is locked. Do you want to try to break it open?", yes: "Break it", no: "Leave" }], consumed: false };
        if (ctx.answer === null) return { effects, consumed: false };
      }
      const difficulty = Number(p.difficulty ?? 1);
      let best = 0;
      for (const i of activeCharacters(party)) best = Math.max(best, thieveryRoll(party.characters[i]!, rng));
      if (best >= difficulty) {
        effects.push({ type: "door", state: "unlocked" });
        return { effects, consumed: true };
      }
      effects.push({ type: "door", state: "locked" }, { type: "text", text: "The door is locked. Your thief cannot pick it yet." });
      return { effects, consumed: false };
    }

    case "trap": {
      const kind = String(p.trap);
      if (kind === "steal_gold") {
        const stolen = Math.min(party.gold, Math.max(1, Math.floor((party.gold * rng.range(5, 15)) / 100)));
        party.gold -= stolen;
        effects.push({ type: "text", text: stolen > 0 ? `A hidden hand steals ${thousands(stolen)} gold from your purse!` : "A hidden hand reaches for your purse, but it is empty." });
        if (stolen > 0) effects.push({ type: "gold", amount: -stolen });
        return { effects, consumed: true };
      }
      // a hovering party passes over the pit and it stays hidden (the old game's levitate spell)
      if (kind === "pit" && hasEffect(party, "levitate")) return { effects, consumed: false };
      const target = randomActive(party, rng);
      if (target === null) return { effects, consumed: true };
      let amount = Number(p.damage ?? 0);
      let damageType: DamageType = "physical";
      let text = kind === "pit" ? "You fall into a pit!" : kind === "guillotine" ? "A blade swings out of the wall!" : kind === "spring" ? "A spring trap snaps shut!" : "You trigger a trap!";
      if (kind === "generic") {
        // the old action 30: a fire, ice, acid or magic trap (texts 432 to 435), cut down by resistance and protection; ninjas dodge one time in ten
        const element = trapElementOf(action);
        const victim = party.characters[target]!;
        damageType = element;
        amount = victim.classType === "Ninja" && rng.float() < 0.1 ? 0 : elementalDamage(party, victim, element, amount);
        text = TEXTS[TRAP_TEXT[element]]!;
      }
      const hit = applyHit(party, target, amount, null, rng);
      effects.push({ type: "text", text });
      effects.push({ type: "damage", character: target, amount, damageType, conditions: hit.conditions });
      if (hit.defeated) effects.push({ type: "defeat" });
      return { effects, consumed: true };
    }

    case "lore":
      // a quest's hint carries its own words; the plain ones are lines of the old game's pool
      effects.push({ type: "text", text: typeof p.text === "string" ? p.text : loreLine(String(p.pool ?? "dungeon"), Number(p.line ?? 0)) });
      return { effects, consumed: false };

    case "transfer":
      effects.push({ type: "transfer", mode: p.mode as "poi_enter" | "poi_exit" | "stairs" | "teleport", tier: Number(p.tier ?? ctx.tier) });
      return { effects, consumed: false };

    case "service":
      effects.push({ type: "service", service: p.service as ServiceKind, tier: Number(p.tier ?? ctx.tier) });
      return { effects, consumed: false };

    case "ambush": {
      const count = Number(p.group ?? 1);
      const ids: number[] = [];
      // a themed place names its own monsters
      const named = typeof p.monsters === "string" && p.monsters !== "" ? p.monsters.split(",").map(Number) : [];
      for (let i = 0; i < count; i++) ids.push(named.length > 0 ? named[rng.int(named.length)]! : pickMonsterWeighted(rng, ctx.monsterThemes, ctx.tier).id);
      effects.push({ type: "text", text: "It was an ambush!" }, { type: "ambush", monsterIds: ids });
      return { effects, consumed: true };
    }

    case "shrine": {
      if (activeCharacters(party).length === 0) return { effects, consumed: false };
      const amount = Number(p.amount ?? 1);
      switch (p.effect) {
        case "resist": {
          const element = ELEMENTS[rng.int(ELEMENTS.length)]!;
          const who = resistanceRecipient(party, element, rng)!;
          const c = party.characters[who]!;
          c[RESISTANCE_FIELD[element]] += amount;
          effects.push({ type: "text", text: `${c.name} feels the shrine's blessing: ${element} resistance +${amount}.` }, { type: "resistance", character: who, element, amount });
          break;
        }
        case "xp": {
          addXp(party, amount);
          effects.push({ type: "text", text: `A great wisdom flows through the party: ${thousands(amount)} experience points for everyone who can still stand.` });
          break;
        }
        case "attribute": {
          const attribute = ATTRS[rng.int(ATTRS.length)]!;
          const who = attributeRecipient(party, attribute, rng)!;
          const c = party.characters[who]!;
          c[attribute] += amount;
          effects.push({ type: "text", text: `${c.name} is touched by the shrine: ${attribute.toUpperCase()} +${amount}.` }, { type: "attribute", character: who, attribute, amount });
          break;
        }
        default: {
          for (const [i, c] of party.characters.entries()) {
            if (!canBeHealed(c)) continue;
            healHp(c, amount);
            effects.push({ type: "heal", character: i, amount });
          }
          effects.push({ type: "text", text: "A soft light washes over the party." });
        }
      }
      return { effects, consumed: true };
    }

    case "fountain": {
      if (ctx.usedToday) {
        effects.push({ type: "text", text: "The basin is dry. It fills again with the next dawn." });
        return { effects, consumed: false };
      }
      const amount = Number(p.heal ?? 1);
      let healed = 0;
      for (const [i, c] of party.characters.entries()) {
        if (!canBeHealed(c) || c.hp >= c.health) continue;
        const gained = healHp(c, amount);
        healed += gained;
        effects.push({ type: "heal", character: i, amount: gained });
      }
      effects.push({ type: "text", text: healed > 0 ? "You drink the cool water. The party feels refreshed." : "The water is cool and clear, but nobody needs it right now." });
      // an unused drink does not count: the party can come back when somebody is hurt
      return { effects, consumed: false, usedToday: healed > 0 };
    }

    case "breakable_wall": {
      // it looks like any other wall: only a party with the Perceptive talent sees that it is brittle (the old action 8), and then it
      // is the player's choice to break it, as in the old game
      if (!party.talents.includes("talent_perceptive")) return { effects, consumed: false };
      if (ctx.answer === undefined) return { effects: [{ type: "confirm", title: "Brittle wall", question: TEXTS[1]! }], consumed: false };
      if (ctx.answer === null) return { effects, consumed: false };
      effects.push({ type: "wall", state: "broken" }, { type: "text", text: "The wall crumbles. A hidden passage opens!" });
      return { effects, consumed: true };
    }

    case "talent": {
      // the old action 15: the seller says his piece, names the price and the party pays or leaves
      const id = String(p.talent);
      const info = TALENTS[id];
      if (!info) return { effects, consumed: false };
      if (party.talents.includes(id)) {
        effects.push({ type: "text", text: `You are already ${talentInfo(id).name}.` });
        return { effects, consumed: false };
      }
      const price = Number(info.price);
      if (ctx.answer === undefined) {
        const question = `${String(p.text ?? "")}${TEXTS[335]}${talentInfo(id).name}${price > 0 ? `${TEXTS[336]}${thousands(price)}${TEXTS[337]}` : "?"}`;
        return { effects: [{ type: "confirm", title: talentInfo(id).name, question, yes: "Buy", no: "Leave" }], consumed: false };
      }
      if (ctx.answer === null) return { effects, consumed: false };
      if (party.gold < price) {
        effects.push({ type: "text", text: "You cannot afford that." });
        return { effects, consumed: false };
      }
      party.gold -= price;
      grantTalent(party, id);
      effects.push({ type: "talent", talent: id, price }, { type: "text", text: `You have become ${talentInfo(id).name}.` });
      return { effects, consumed: false };
    }

    case "portal":
      return { effects: [{ type: "portal" }], consumed: false };

    case "work": {
      // the old action 19 pays 100 gold for a week of work and lets ten days pass
      if (ctx.answer === undefined) return { effects: [{ type: "confirm", title: "The job master", question: TEXTS[343]!, yes: "Work", no: "Leave" }], consumed: false };
      if (ctx.answer === null) return { effects, consumed: false };
      party.gold += WORK_GOLD;
      effects.push({ type: "work", gold: WORK_GOLD, days: WORK_DAYS });
      return { effects, consumed: false };
    }

    case "decor":
      effects.push({ type: "text", text: propLine(Number(p.item), action.uid) });
      return { effects, consumed: false };

    case "legacy":
      // campaign actions are resolved by src/campaign/engine.ts, which needs prompts and map changes
      return { effects, consumed: false };
  }
}
