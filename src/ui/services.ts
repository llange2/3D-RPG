import type { ServiceKind } from "../actions/registry";
import { LAYER, rngFor } from "../core/rng";
import { SPELLS, TEXTS, talentInfo } from "../data/tables";
import { addCondition, isAlive, xpToNextLevel } from "../sim/character";
import {
  buyItem, buyScroll, buyTavernFood, cureCost, deposit, guildScrolls, GUILD_SCHOOLS, healCost, innCost, innRest, isGuildMember, learnSpell, reviveCost, rumour, wordRumour, sellItem, sellPrice, sellScroll, smithStock, spellPrice, type SmithShelf,
  templeCure, templeHeal, templeRevive, tavernFood, train, trainAll, trainAllPlan, trainingCost, withdraw, guildTalent, type GuildSchool,
} from "../sim/economy";
import { bonusDescription, spellScroll } from "../sim/items";
import { isSpellImplemented, learnBlock } from "../sim/spells";
import { BAG_SLOTS, type Condition, type Item, type Party } from "../sim/types";
import type { SeedState } from "../core/rng";
import type { Poi } from "../world/types";
import type { World } from "../world/world";
import { tidy } from "../campaign/engine";
import { clear, h } from "./dom";
import { stopTownScene, townArt, type SceneName } from "./townScenes";
import { thousands } from "../core/format";
import { itemIcon } from "./itemIcons";
import { openRoster } from "./roster";
import type { UI } from "./ui";

export interface ServiceContext {
  party: Party;
  world: World;
  rootSeed: SeedState;
  poi: Poi | null;
  tier: number;
  /** Where the party stands (overworld coordinates), for rumours. */
  x: number;
  y: number;
  changed(): void;
  log(text: string, kind?: "info" | "good" | "bad" | "loot"): void;
  /** Campaign taverns tell the old game's gossip (and sometimes a password) instead of pointing at places of the endless world. */
  rumour?: () => string;
  /** Plays a sound of the old game (the book of heroes in the inn clicks, rolls dice and saves). */
  sound?: (id: number) => void;
  /**
   * Wares the party has bought, as `shop:<poi>:<day>:<n>` (n = place in the day's stock). Saved with the game, so a sold item stays
   * gone when the party leaves and comes back; tomorrow the smith has new stock.
   */
  soldOut?: Set<string>;
  /** Where to get the guild membership when it is not sold at the door: the endless world has a guild apprentice in every town (a `talent` action); the campaign's members earn it as in the old game. */
  membershipFrom?: string;
}

const TITLES: Record<ServiceKind, string> = {
  inn: "The Inn",
  training: "Training Grounds",
  tavern: "The Tavern",
  smith: "The Smithy",
  temple: "The Temple",
  bank: "The Bank",
  guild: "The Guild",
};

const MUSIC: Record<ServiceKind, number> = { inn: 9001, training: 9002, tavern: 9003, smith: 9004, temple: 9005, bank: 9006, guild: 9007 };
export const serviceMusic = (s: ServiceKind): number => MUSIC[s];

/** Opens the shop screen of a town service. Resolves when the party leaves. */
export function openService(ui: UI, kind: ServiceKind, ctx: ServiceContext): Promise<void> {
  const scene: SceneName = kind === "training" ? "training_grounds" : kind;
  return ui.panel((close, panel) => {
    const party = ctx.party;
    // Layout: a fixed head (title, way out), the whole picture on the left and the part that changes on the right. Only
    // the right side scrolls, so neither the picture nor the buttons are ever cut off. The views below write into `root`.
    const root = h("div", { class: "svc-main" });
    const gold = h("div", { class: "svc-gold" });
    panel.classList.add("service");
    panel.append(
      h("div", { class: "svc-head" }, h("h2", { text: `${TITLES[kind]}${ctx.poi ? ` of ${ctx.poi.name}` : ""}` }), h("button", { class: "btn", text: "Leave (Esc)", onclick: close })),
      h("div", { class: "svc-body" }, h("div", { class: "svc-art" }, townArt(scene), gold), root),
    );
    /** Updates the gold line; kept under the name `header` so every view starts with it. */
    const header = (extra?: string): never[] => {
      gold.innerHTML = `Your gold: <b style="color:var(--gold)">${thousands(party.gold)}</b>${extra ? `  -  ${extra}` : ""}`;
      return [];
    };
    const row = (left: Node | string, right: Node | string, onclick?: () => void, disabled = false) =>
      h("div", { class: `opt${disabled ? " off" : ""}`, style: "color:var(--text);background:#00000033;border:1px solid var(--gold-dim);padding:5px 10px;border-radius:5px;margin-top:4px;display:flex;justify-content:space-between;gap:12px;align-items:center;cursor:" + (disabled || !onclick ? "default" : "pointer") + (disabled ? ";opacity:0.5" : ""), onclick: disabled ? undefined : onclick }, left as string, right as string);
    /**
     * An item of the smithy: its picture, its name and its values on one line (cut off with dots where the row is too narrow: the rings of the highest level
     * carry many); the mouseover text lists all of them.
     */
    const itemLabel = (item: Item, size: number) => {
      const stats = bonusDescription(item);
      const name = item.name.trim();
      return h("span", { title: stats ? `${name}\n${stats}` : name, style: "display:flex;gap:10px;align-items:center;min-width:0" }, itemIcon(item, size),
        h("span", { style: "min-width:0" },
          h("div", { text: name }),
          stats ? h("div", { class: "small", style: "opacity:0.75;white-space:nowrap;overflow:hidden;text-overflow:ellipsis", text: stats.replace(/\n/g, ", ") }) : null));
    };
    const refresh = () => {
      ctx.changed();
      render();
    };
    const note = (text: string, kind: "good" | "bad" | "info" = "info") => ctx.log(text, kind);

    // -------------------------------------------------------------- inn
    const inn = () => {
      const cost = innCost(party, ctx.tier);
      root.append(
        ...header(),
        h("p", { text: "Soft beds, a warm fire and a landlord who does not ask questions. A night's rest heals the whole party, cures ailments and ends the night at eight in the morning." }),
        h("div", { class: "row-btns" },
          h("button", { class: "btn primary", text: `Rest until morning (${thousands(cost)} gold)`, disabled: party.gold < cost, onclick: () => {
            const r = innRest(party, ctx.tier);
            note(r.ok ? "The party sleeps soundly and wakes refreshed." : "You cannot afford a room.", r.ok ? "good" : "bad");
            refresh();
          } }),
        ),
        h("p", { text: `The landlord keeps a leather book of heroes who look for a company. ${party.reserve.length > 0 ? `${party.reserve.length} ${party.reserve.length === 1 ? "waits" : "wait"} by the fire.` : "Nobody waits by the fire right now."}` }),
        h("div", { class: "row-btns" },
          h("button", { class: "btn", text: "Look through the book of heroes", onclick: async () => {
            ctx.sound?.(9001);
            await openRoster(ui, party, { changed: ctx.changed, log: (t, k) => ctx.log(t, k), sound: (id) => ctx.sound?.(id) });
            refresh();
          } }),
        ),
      );
    };

    // -------------------------------------------------------------- tavern
    const tavern = () => {
      const offer = tavernFood(ctx.tier);
      const full = party.food >= offer.days;
      root.append(
        ...header(`food: ${party.food} of ${offer.days} days`),
        h("p", { text: "Smoke, laughter and a barkeep who knows everything about everyone." }),
        // one purchase fills the larder up to what this tavern keeps fresh, whatever is missing; above that nothing is bought or paid
        row(`Buy provisions: ${offer.days} days of food (${thousands(offer.price)} gold)`, full ? "the larder is full" : party.gold <= offer.price ? `${thousands(offer.price - party.gold + 1)} gold short` : "", () => {
          const r = buyTavernFood(party, ctx.tier);
          if (r.ok) ctx.sound?.(9000);
          note(r.ok ? `You stock up to ${offer.days} days of food.` : r.reason === "full" ? "You carry as much food as this tavern can keep fresh." : "Not enough gold.", r.ok ? "good" : "bad");
          refresh();
        }, full || party.gold <= offer.price),
        row("Buy a round and ask about rumours (5 gold)", "", () => {
          if (party.gold < 5) return;
          party.gold -= 5;
          // a drink goes to some heads: the less luck, the likelier (the old handle_rumor)
          const rng = rngFor(ctx.rootSeed, LAYER.LOOT, "drink", party.minutes, party.gold);
          const drunk = party.characters.filter((c) => isAlive(c) && rng.float() < 0.2 / (c.lck * 0.05));
          for (const c of drunk) addCondition(c, "Drunk", party.minutes);
          ctx.sound?.(drunk.length > 0 ? 9038 : 9000);
          if (drunk.length > 0) note(`${drunk.map((c) => c.name).join(", ")} had a drink too many.`, "bad");
          // one rumour in three lets a word slip (an answer of the riddles of the world, level by level), the others tell where a dungeon lies
          const word = rngFor(ctx.rootSeed, LAYER.LOOT, "word-rumour", party.minutes, party.gold);
          const r = ctx.rumour ? { text: ctx.rumour() } : word.int(3) === 0 ? { text: wordRumour(ctx.world, ctx.tier, word) } : rumour(ctx.world, ctx.x, ctx.y);
          note(r ? r.text : "Nobody here knows anything of interest.", r ? "info" : "bad");
          ctx.changed();
          void ui.message(r ? r.text : "The locals shrug. There is nothing worth telling nearby.", "A rumour").then(render);
        }, party.gold < 5),
      );
    };

    // -------------------------------------------------------------- smith
    let smithTab: "buy" | "sell" = "buy";
    let smithShelf: SmithShelf = "armor";
    const SHELF_LABEL: Record<SmithShelf, string> = { armor: "Armor", weapons: "Weapons", rings: "Rings" };
    let sellWho = 0;
    const smith = () => {
      const day = Math.floor(party.minutes / 1440);
      const stock = smithStock(ctx.rootSeed, ctx.poi?.id ?? "p:none", day, ctx.tier, party);
      const soldKey = (n: number) => `shop:${ctx.poi?.id ?? "p:none"}:${day}:${n}`;
      const tabs = h("div", { class: "tabs" }, h("div", { class: `tab${smithTab === "buy" ? " on" : ""}`, text: "Buy", onclick: () => ((smithTab = "buy"), render()) }), h("div", { class: `tab${smithTab === "sell" ? " on" : ""}`, text: "Sell", onclick: () => ((smithTab = "sell"), render()) }));
      root.append(...header(), tabs);
      if (smithTab === "buy") {
        root.append(h("div", { class: "tabs" }, ...(Object.keys(SHELF_LABEL) as SmithShelf[]).map((k) => h("div", { class: `tab${smithShelf === k ? " on" : ""}`, text: SHELF_LABEL[k], onclick: () => ((smithShelf = k), render()) }))));
        let left = 0;
        stock.forEach((s, n) => {
          if (ctx.soldOut?.has(soldKey(n)) || s.shelf !== smithShelf) return;
          left++;
          root.append(row(itemLabel(s.item, 44), `${thousands(s.price)} gold`, () => {
            const r = buyItem(party, s);
            if (r.ok) {
              ctx.soldOut?.add(soldKey(n));
              ctx.sound?.(9000);
            }
            note(r.ok ? `Bought ${s.item.name.trim()}.` : r.reason === "gold" ? "Not enough gold." : "Every backpack is full.", r.ok ? "good" : "bad");
            refresh();
          }, party.gold < s.price));
        });
        if (left === 0) root.append(h("p", { text: "This shelf is empty. The smith will have new wares tomorrow." }));
      } else {
        const who = h("div", { class: "tabs" }, ...party.characters.map((c, i) => h("div", { class: `tab${i === sellWho ? " on" : ""}`, text: c.name, onclick: () => ((sellWho = i), render()) })));
        root.append(who);
        const c = party.characters[sellWho]!;
        let any = false;
        for (const slot of BAG_SLOTS) {
          const item = c.inventory[slot];
          if (!item || item.quest) continue;
          any = true;
          root.append(row(itemLabel(item, 40), `sell for ${thousands(sellPrice(item, party))}`, () => {
            if (sellItem(party, sellWho, slot)) {
              ctx.sound?.(9000);
              note(`Sold ${item.name.trim()}.`, "good");
            }
            refresh();
          }));
        }
        if (!any) root.append(h("p", { text: `${c.name} has nothing to sell.` }));
      }
    };

    // -------------------------------------------------------------- temple
    const temple = () => {
      root.append(...header(), h("p", { text: "The priests tend the wounded and call back the fallen, for a donation." }));
      party.characters.forEach((c, i) => {
        const heal = healCost(c, ctx.tier, party);
        root.append(h("div", { class: "sheet", style: "margin-top:8px" },
          h("div", { html: `<b>${c.name}</b> - ${c.hp}/${c.health} HP - ${c.conditions.join(", ")}` }),
          h("div", { class: "row-btns" },
            isAlive(c) && c.hp < c.health ? h("button", { class: "btn", text: `Heal (${thousands(heal)})`, disabled: party.gold < heal, onclick: () => { if (templeHeal(party, i, ctx.tier)) note(`${c.name} is healed.`, "good"); refresh(); } }) : null,
            ...c.conditions.filter((x) => x !== "Healthy" && x !== "Dead" && x !== "Rotten" && x !== "Blessed" && x !== "Unconscious").map((cond) => {
              const cost = cureCost(cond as Condition, ctx.tier, party);
              return h("button", { class: "btn", text: `Cure ${cond} (${thousands(cost)})`, disabled: party.gold < cost, onclick: () => { if (templeCure(party, i, cond as Condition, ctx.tier)) note(`${c.name} is cured of ${cond}.`, "good"); refresh(); } });
            }),
            c.conditions.includes("Dead") ? h("button", { class: "btn primary", text: `Resurrect (${thousands(reviveCost(c, ctx.tier, party))})`, disabled: party.gold < reviveCost(c, ctx.tier, party), onclick: () => { if (templeRevive(party, i, ctx.tier)) note(`${c.name} returns to life.`, "good"); refresh(); } }) : null,
          )));
      });
    };

    // -------------------------------------------------------------- bank
    const bank = () => {
      root.append(
        ...header(`in the vault: <b style="color:var(--gold)">${thousands(party.bankGold)}</b>`),
        h("p", { text: "Gold in the vault is safe from thieves, traps and your own bad judgement." }),
        h("div", { class: "row-btns" },
          ...[100, 1000, 10000].map((n) => h("button", { class: "btn", text: `Deposit ${thousands(n)}`, disabled: party.gold < 1, onclick: () => { deposit(party, n); refresh(); } })),
          h("button", { class: "btn", text: "Deposit all", disabled: party.gold < 1, onclick: () => { deposit(party, party.gold); refresh(); } }),
        ),
        h("div", { class: "row-btns" },
          ...[100, 1000, 10000].map((n) => h("button", { class: "btn", text: `Withdraw ${thousands(n)}`, disabled: party.bankGold < 1, onclick: () => { withdraw(party, n); refresh(); } })),
          h("button", { class: "btn", text: "Withdraw all", disabled: party.bankGold < 1, onclick: () => { withdraw(party, party.bankGold); refresh(); } }),
        ),
      );
    };

    // -------------------------------------------------------------- training
    const training = () => {
      root.append(...header(), h("p", { text: "Experience means nothing until it is drilled into the bones. Pay the trainers when a hero has earned the next level." }));
      // one click for the whole party: the lowest level first, as far as the gold reaches
      const plan = trainAllPlan(party);
      const everyone = plan.who.length + plan.waiting.length;
      if (everyone > 0) {
        root.append(h("div", { class: "row-btns" }, h("button", {
          class: "btn primary",
          text: `Train all (${plan.who.length} of ${everyone}, ${thousands(plan.cost)} gold)`,
          title: "Trains every hero who can rise, beginning with the lowest level, as far as the gold lasts",
          disabled: plan.who.length === 0,
          onclick: () => {
            const done = trainAll(party);
            for (const i of done.who) note(`${party.characters[i]!.name} reaches level ${party.characters[i]!.level}!`, "good");
            if (done.waiting.length > 0) note(`Not enough gold for ${done.waiting.map((i) => party.characters[i]!.name).join(", ")}.`, "bad");
            refresh();
          },
        })));
      }
      party.characters.forEach((c, i) => {
        const need = xpToNextLevel(c);
        const cost = trainingCost(c, party);
        root.append(row(h("span", { html: `<b>${c.name}</b> - level ${c.level} - ${thousands(c.xp)} xp` }), need > 0 ? `needs ${thousands(need)} more xp` : `train for ${thousands(cost)} gold`, () => {
          const r = train(party, i);
          note(r.ok ? `${c.name} reaches level ${c.level}!` : r.reason === "gold" ? "Not enough gold." : "Not enough experience.", r.ok ? "good" : "bad");
          refresh();
        }, need > 0 || party.gold < cost || !isAlive(c)));
      });
    };

    // -------------------------------------------------------------- guild
    let guildWho = 0;
    let guildTab: GuildSchool | "sell" = "Arcane";
    /** Scrolls bought on this visit leave the shelf; the old guild was stocked afresh at every visit. */
    const bought = new Set<string>();
    const guild = () => {
      const level = Math.max(1, Math.min(5, ctx.tier));
      // only members are let in (the old game checks the talent `guild_level_<n>`; the skull in the wall sends the others away)
      if (!isGuildMember(party, level)) {
        root.append(
          ...header(),
          h("p", { text: tidy(TEXTS[398] ?? "You are not members. Leave!") }),
          h("p", { class: "small", text: ctx.membershipFrom ?? "Membership has to be earned." }),
        );
        return;
      }
      root.append(
        ...header(),
        h("p", { text: tidy(TEXTS[274] ?? "Come on in!") }),
        // the guild sells the scrolls of all three schools, as the old one did; reading one (right click in the backpack) is up to the class
        h("div", { class: "tabs" }, ...[...GUILD_SCHOOLS, "sell" as const].map((tab) => h("div", { class: `tab${tab === guildTab ? " on" : ""}`, text: tab === "sell" ? "Sell scrolls" : tab, onclick: () => ((guildTab = tab), render()) }))),
        h("div", { class: "small", text: guildTab === "sell" ? "Whose scrolls?" : "Into whose backpack does the scroll go?" }),
        h("div", { class: "tabs" }, ...party.characters.map((c, i) => h("div", { class: `tab${i === guildWho ? " on" : ""}`, text: c.name, onclick: () => ((guildWho = i), render()) }))),
      );
      const c = party.characters[guildWho]!;
      if (guildTab === "sell") {
        const scrolls = BAG_SLOTS.filter((slot) => c.inventory[slot]?.type === "spell");
        if (scrolls.length === 0) root.append(h("p", { text: `${c.name} has no scrolls to sell.` }));
        for (const slot of scrolls) {
          const item = c.inventory[slot]!;
          root.append(row(scrollLabel(item.spellId, item), `sell for ${thousands(sellPrice(item, party))}`, () => {
            if (sellScroll(party, guildWho, slot)) {
              for (const school of GUILD_SCHOOLS) bought.delete(`${school}:${item.spellId}`);
              ctx.sound?.(9000);
              note(`Sold ${item.name.trim()}.`, "good");
            }
            refresh();
          }));
        }
        return;
      }
      const shelf = guildScrolls(level, guildTab).filter((s) => !bought.has(`${guildTab}:${s.id}`));
      if (shelf.length === 0) root.append(h("p", { text: "The shelf is empty." }));
      for (const s of shelf) {
        const price = spellPrice(s, party);
        const block = learnBlock(c, s.id);
        const why = block === "class" ? `A ${c.classType} cannot learn this.` : block === "level" ? `${c.name} needs level ${s.level}.` : block === "known" ? `${c.name} already knows this.` : "";
        const key = `${guildTab}:${s.id}`;
        const buy = h("button", { class: "btn", text: "Buy scroll", disabled: party.gold < price, onclick: () => {
          const r = buyScroll(party, guildWho, s.id);
          if (r.ok) {
            bought.add(key);
            ctx.sound?.(9000);
          }
          note(r.ok ? `Bought the scroll of ${TEXTS[s.name]}.` : r.reason === "gold" ? "Not enough gold." : "Every backpack is full.", r.ok ? "good" : "bad");
          refresh();
        } });
        // a hero who can learn it right away may skip the scroll
        const learn = block === null && isSpellImplemented(s.id)
          ? h("button", { class: "btn", text: "Buy & learn", disabled: party.gold < price, onclick: () => {
              const r = learnSpell(party, guildWho, s.id);
              if (r.ok) ctx.sound?.(9000);
              note(r.ok ? `${c.name} learns ${s.title}.` : "Not enough gold.", r.ok ? "good" : "bad");
              refresh();
            } })
          : null;
        root.append(row(scrollLabel(s.id, null, why), h("span", { style: "display:flex;gap:8px;align-items:center;white-space:nowrap" }, h("span", { text: `${thousands(price)} gold` }), buy, learn)));
      }
    };

    /** A scroll in a list: its icon, name, level and mana, what it does, and why the hero cannot learn it if they cannot. */
    const scrollLabel = (spellId: number, item: Item | null, why = ""): HTMLElement => {
      const spell = SPELLS[spellId]!;
      return h(
        "span",
        { style: "display:flex;gap:10px;align-items:center" },
        itemIcon(item ?? spellScroll(spellId), 40),
        h(
          "span",
          {},
          h("div", { html: `<b>${spell.title}</b> <span class="small" style="opacity:0.75">level ${spell.level}, ${spell.mana} SP</span>` }),
          h("div", { class: "small", style: "opacity:0.75", text: `${spell.text}${isSpellImplemented(spellId) ? "" : " (Has no effect in this game yet.)"}` }),
          why ? h("div", { class: "small", style: "color:#e8745f", text: why }) : null,
        ),
      );
    };

    const views: Record<ServiceKind, () => void> = { inn, tavern, smith, temple, bank, training, guild };
    const render = () => {
      clear(root);
      views[kind]();
    };
    render();
  }).finally(() => stopTownScene(scene));
}
