import "./style.css";
import { BASE_CLASS } from "../data/tables";
import { clockText } from "../sim/party";
import { armor, isAlive, worstCondition } from "../sim/character";
import type { Character, Party } from "../sim/types";
import { assetPath, clear, h } from "./dom";
import { thousands } from "../core/format";
import { DEFAULT_WORLD_SIZE, WORLD_SIZES, WORLD_SIZE_NAMES, type WorldSize } from "../world/types";
import { hitEffect, portraitImage, protectionEffect, type AvatarEffect } from "./avatarFx";
import { conditionTitle, shownCondition } from "./conditionInfo";
import { mascotPortrait } from "./panels";
import { LoadingScreen } from "./loadingScreen";

export type LogKind = "info" | "good" | "bad" | "combat" | "loot";

export interface HudInfo {
  place: string;
  sub: string;
  facing: "N" | "E" | "S" | "W";
  x: number;
  y: number;
  battle: boolean;
  attacker: number | null;
  /** Campaign only: the quests the party has taken on, shown at the right edge. */
  quests: { open: string[]; done: number } | null;
  /** The party's mascot, and whether danger is near (monsters around or a trap ahead): the crow then comes alive. */
  mascot: string;
  alarm: boolean;
}

type TitlePage = "main" | "new" | "load";
/** Size of `title.webp` and the height of the middle of its grey rock (fraction of the picture height). */
const TITLE_IMAGE = { w: 1600, h: 995 };
const TITLE_ROCK_Y = 0.69;

/** What the title screen resolves with: a new game (endless world or campaign, with its seed) or one of the saves it was given. */
export type TitleChoice<S> = { action: "new" | "campaign"; seed: string; size: WorldSize } | { action: "load"; save: S };

export interface Option<T> {
  label: string;
  value: T;
  note?: string;
  disabled?: boolean;
  /** Set apart from the entries above it (the quick-cast entry under the spell list). */
  apart?: boolean;
}

/** One switch of `UI.toggles`: a click calls `flip`, then the label is read again. */
export interface ToggleRow {
  label: () => string;
  flip: () => void;
}

/** DOM overlay: HUD, message log and modal dialogs. All dialogs return promises, so game code reads linearly. */
export class UI {
  readonly root: HTMLElement;
  private readonly partyBar: HTMLElement;
  /** The four hero cards (rebuilt with every HUD update) and the mascot, which keeps its picture so that the crow's clip is not restarted. */
  private readonly cardsEl: HTMLElement;
  private readonly mascotEl: HTMLElement;
  private mascotShown = "";
  private readonly info: HTMLElement;
  private readonly compass: HTMLElement;
  private readonly logEl: HTMLElement;
  private readonly stats: HTMLElement;
  /** Frames per second in the top centre, under the monster's name bar (option "Show FPS"). */
  private readonly fps: HTMLElement;
  /** Icons of the spells that are working (protection, levitation), like the old update_gui. */
  private readonly status: HTMLElement;
  /** The list of open quests under the stats (campaign only). A click opens the whole log. */
  private readonly questList: HTMLElement;
  private readonly focus: HTMLElement;
  private readonly flash: HTMLElement;
  readonly minimap: HTMLCanvasElement;
  /** Covers everything while a map is built (the old game's loading screen). */
  readonly loading: LoadingScreen;
  private modalCount = 0;
  private modalStack: HTMLElement[] = [];
  /** Called when a party card is clicked (open the character sheet). */
  onCard: (index: number) => void = () => undefined;
  /** Called when the quest list at the right edge is clicked. */
  onQuests: () => void = () => undefined;
  /** Called when the mascot is clicked (its tab of the character screen). */
  onMascot: () => void = () => undefined;
  onAction: (action: "attack" | "cast" | "rest" | "map" | "menu" | "inventory") => void = () => undefined;

  constructor() {
    this.root = h("div");
    this.root.id = "ui";
    this.cardsEl = h("div", { class: "cards" });
    this.mascotEl = h("div", { class: "card mascot-card", onclick: () => this.onMascot() });
    this.partyBar = h("div", { class: "party-bar" }, this.cardsEl, this.mascotEl);
    this.info = h("div", { class: "info" });
    this.compass = h("div", { class: "compass" }, ...["N", "E", "S", "W"].map((d) => h("span", { text: d, data: { d } })));
    this.logEl = h("div", { class: "log" });
    this.stats = h("div", { class: "stats" });
    this.fps = h("div", { class: "fps" });
    this.status = h("div", { class: "status-icons" });
    this.questList = h("div", { class: "quest-list hud-hide", title: "Click for the whole quest log (J)", onclick: () => this.onQuests() });
    this.minimap = h("canvas") as HTMLCanvasElement;
    this.minimap.width = 176;
    this.minimap.height = 176;
    this.focus = h("div", { class: "focusbar hud-hide" });
    this.flash = h("div", { class: "dim-overlay" });
    const actions = h(
      "div",
      { class: "actions" },
      this.actionButton("Attack", "Space", "attack"),
      this.actionButton("Spells", "F", "cast"),
      this.actionButton("Inventory", "I", "inventory"),
      this.actionButton("Rest", "R", "rest"),
      this.actionButton("Map", "M", "map"),
      this.actionButton("Menu", "Esc", "menu"),
    );
    this.root.append(
      this.info,
      this.compass,
      this.fps,
      h("div", { class: "right-panel" }, this.minimap, this.stats, this.questList),
      this.status,
      this.focus,
      this.logEl,
      this.partyBar,
      actions,
      this.flash,
    );
    this.loading = new LoadingScreen(this.root);
    document.body.appendChild(this.root);
    this.setHudVisible(false);
  }

  private actionButton(label: string, key: string, action: Parameters<UI["onAction"]>[0]): HTMLElement {
    return h("button", { class: "btn", onclick: () => this.onAction(action) }, label, " ", h("small", { text: `(${key})` }));
  }

  setHudVisible(visible: boolean): void {
    for (const el of this.root.children) if (el !== this.flash && el !== this.loading.element) el.classList.toggle("hud-hide", !visible);
    this.focus.classList.add("hud-hide");
  }

  get modalOpen(): boolean {
    return this.modalCount > 0;
  }

  /** Shows the frame rate (null hides it: an empty element takes no room, see `.fps:empty`). */
  setFps(fps: number | null): void {
    const text = fps === null ? "" : `${Math.round(fps)} FPS`;
    if (this.fps.textContent !== text) this.fps.textContent = text;
  }

  // ---------------------------------------------------------------- HUD

  updateHud(party: Party, info: HudInfo): void {
    this.info.replaceChildren(h("div", { class: "place", text: info.place }), h("div", { text: info.sub }), h("div", { class: "small", text: `${info.x}, ${info.y}` }));
    // the compass is the talent "Well-oriented" (talent_orientation)
    this.compass.classList.toggle("no-talent", !party.talents.includes("talent_orientation"));
    for (const el of this.compass.children) (el as HTMLElement).classList.toggle("on", (el as HTMLElement).dataset.d === info.facing);
    const t = clockText(party);
    this.stats.replaceChildren(
      h("div", { html: `Gold <b>${thousands(party.gold)}</b>` }),
      h("div", { html: `Food <b>${party.food}</b> day${party.food === 1 ? "" : "s"}` }),
      h("div", { html: `Day <b>${t.day}</b>, <b>${String(t.hour).padStart(2, "0")}:${String(t.minute).padStart(2, "0")}</b>` }),
    );
    this.renderStatus(party);
    this.renderQuests(info.quests);
    this.renderCards(party, info.attacker, info.battle);
    this.renderMascot(info.mascot, info.alarm);
  }

  /**
   * The mascot beside the heroes' cards, as the old game's fifth portrait. Only the crow moves, and only while there is danger
   * (the old `npc01_active` clip); the card is rebuilt only when that changes, so the clip is not restarted every step.
   */
  private renderMascot(name: string, alarm: boolean): void {
    const state = `${name}:${alarm && name === "Crow"}`;
    if (state === this.mascotShown) return;
    this.mascotShown = state;
    this.mascotEl.classList.toggle("alarm", alarm && name === "Crow");
    this.mascotEl.title = `${name} - click for the mascot page (5)`;
    const picture =
      name === "Crow" && alarm
        ? Object.assign(h("video", { class: "portrait", src: assetPath("ui/npc01_active.webm") }), { autoplay: true, loop: true, muted: true, playsInline: true })
        : h("img", { class: "portrait", src: assetPath(`icons/portraits/${mascotPortrait(name)}.webp`), alt: name });
    this.mascotEl.replaceChildren(h("div", { class: "row" }, picture, h("div", {}, h("div", { class: "name", text: name }), h("div", { class: "cls", text: "Mascot" }))));
    // a clip made by script does not start by itself in every browser
    if (picture instanceof HTMLVideoElement) void picture.play().catch(() => undefined);
  }

  private renderQuests(quests: HudInfo["quests"]): void {
    this.questList.classList.toggle("hud-hide", !quests);
    if (!quests) return;
    this.questList.replaceChildren(
      h("div", { class: "quest-head", text: `Quests${quests.done > 0 ? ` (${quests.done} done)` : ""}` }),
      ...(quests.open.length === 0 ? [h("div", { class: "small", text: "No open quests." })] : quests.open.map((q) => h("div", { class: "quest", text: q }))),
    );
  }

  private renderStatus(party: Party): void {
    const icons = new Map<AvatarEffect, string>();
    for (const e of party.effects) {
      if (e.until <= party.minutes) continue;
      if (e.kind === "protection" && e.element) icons.set(protectionEffect(e.element), `Protection from ${e.element}`);
      else if (e.kind === "levitate") icons.set("gui_levitate", "Levitate");
      else if (e.kind === "power_shield") icons.set("gui_power_shield", "Power Shield: a tenth less damage");
    }
    this.status.replaceChildren(...[...icons].map(([name, title]) => h("img", { src: assetPath(`ui/tex_${name}.webp`), title, alt: title })));
  }

  private renderCards(party: Party, attacker: number | null, battle: boolean): void {
    clear(this.cardsEl);
    party.characters.forEach((c, i) => {
      const cond = shownCondition(c, party.minutes);
      const down = !isAlive(c) || c.conditions.includes("Unconscious");
      const card = h(
        "div",
        { class: `card${battle && attacker === i ? " active" : ""}${down ? " down" : ""}${c.mods?.rift ? " rifted" : ""}`, onclick: () => this.onCard(i), title: `${c.name} - ${c.raceType} ${c.classType}` },
        h(
          "div",
          { class: "row" },
          portraitImage(c),
          h("div", {}, h("div", { class: "name", text: c.name }), h("div", { class: "cls", text: `L${c.level} ${c.classType}` })),
        ),
        h("div", { class: "bar hp" }, h("i", { style: `width:${pct(c.hp, c.health)}%` })),
        c.mana > 0 ? h("div", { class: "bar sp" }, h("i", { style: `width:${pct(c.sp, c.mana)}%` })) : h("div", { class: "bar sp", style: "opacity:0.25" }, h("i", { style: "width:0" })),
        cond !== "Healthy" ? h("div", { class: "cond", text: cond, title: conditionTitle(c, party.minutes) }) : null,
      );
      card.dataset.index = String(i);
      this.cardsEl.append(card);
    });
  }

  /** Red flash on a character card when it is hit, with the picture of the kind of damage over the portrait. */
  hitCard(index: number, damageType = "physical"): void {
    const card = this.cardsEl.children[index] as HTMLElement | undefined;
    if (!card) return;
    const f = h("div", { class: "hitflash", style: "background:#ff2a1a" });
    card.append(f);
    requestAnimationFrame(() => f.classList.add("on"));
    setTimeout(() => f.remove(), 450);
    this.avatarEffect(index, hitEffect(damageType));
  }

  /**
   * A picture over the portrait of a character that fades out (a healing spell, a cure, a hit). It lives outside the
   * card, because the cards are rebuilt whenever the HUD updates.
   */
  avatarEffect(index: number, effect: AvatarEffect): void {
    const portrait = this.cardsEl.children[index]?.querySelector(".portrait");
    if (!portrait) return;
    const r = portrait.getBoundingClientRect();
    const size = Math.round(r.width * 1.7);
    const img = h("img", {
      class: "fx",
      src: assetPath(`ui/tex_${effect}.webp`),
      alt: "",
      style: `left:${Math.round(r.left + r.width / 2 - size / 2)}px;top:${Math.round(r.top + r.height / 2 - size / 2)}px;width:${size}px;height:${size}px`,
    });
    img.addEventListener("animationend", () => img.remove());
    this.root.append(img);
  }

  /** Whole-screen red tint (party hurt). */
  hurtFlash(): void {
    this.flash.classList.add("on");
    setTimeout(() => this.flash.classList.remove("on"), 80);
  }

  setFocus(name: string | null, hp = 0, max = 1): void {
    if (!name) {
      this.focus.classList.add("hud-hide");
      return;
    }
    this.focus.classList.remove("hud-hide");
    this.focus.replaceChildren(h("div", { text: name }), h("div", { class: "bar hp" }, h("i", { style: `width:${pct(hp, max)}%` })));
  }

  log(text: string, kind: LogKind = "info"): void {
    const line = h("div", { class: kind === "info" ? "" : kind, text });
    this.logEl.append(line);
    while (this.logEl.children.length > 7) this.logEl.firstElementChild?.remove();
    setTimeout(() => line.remove(), 12500);
  }

  toast(text: string): void {
    const el = h("div", { class: "toast", text });
    this.root.append(el);
    setTimeout(() => el.remove(), 2500);
  }

  // ---------------------------------------------------------------- modal plumbing

  /** Shows content in a modal layer; resolves when `close` is called. */
  modal<T>(build: (close: (value: T) => void) => HTMLElement, options: { dismissWith?: T; wide?: boolean; canDismiss?: () => Promise<boolean> } = {}): Promise<T> {
    return new Promise<T>((resolve) => {
      const back = h("div", { class: "modal-back" });
      const close = (value: T) => {
        document.removeEventListener("keydown", onKey, true);
        back.remove();
        this.modalStack = this.modalStack.filter((m) => m !== back);
        this.modalCount--;
        resolve(value);
      };
      const onKey = (e: KeyboardEvent) => {
        if (this.modalStack[this.modalStack.length - 1] !== back) return;
        if (e.key === "Escape" && "dismissWith" in options) {
          e.stopPropagation();
          e.preventDefault();
          // a panel may ask first (the book of heroes warns about a party without a lockpicker)
          if (options.canDismiss) void options.canDismiss().then((ok) => ok && close(options.dismissWith as T));
          else close(options.dismissWith as T);
        }
      };
      document.addEventListener("keydown", onKey, true);
      back.append(build(close));
      this.root.append(back);
      this.modalStack.push(back);
      this.modalCount++;
    });
  }

  /** Parchment dialog with a text and buttons. */
  async ask<T>(title: string, text: string, buttons: { label: string; value: T; primary?: boolean }[], dismiss?: T, dismissible = dismiss !== undefined): Promise<T> {
    return this.modal<T>(
      (close) =>
        h(
          "div",
          { class: "parchment" },
          h("h2", { text: title }),
          h("p", { text }),
          h("div", { class: "buttons" }, ...buttons.map((b) => h("button", { class: `btn${b.primary ? " primary" : ""}`, text: b.label, onclick: () => close(b.value) }))),
        ),
      dismissible ? { dismissWith: dismiss as T } : {},
    );
  }

  confirm(title: string, text: string, yes = "Yes", no = "No"): Promise<boolean> {
    return this.ask(title, text, [{ label: yes, value: true, primary: true }, { label: no, value: false }], false);
  }

  message(text: string, title = "", button = "OK"): Promise<void> {
    return this.ask(title, text, [{ label: button, value: undefined as void, primary: true }], undefined as void, true);
  }

  /** Parchment list; resolves with the chosen value or null when dismissed. */
  choose<T>(title: string, text: string, options: Option<T>[], footer?: string): Promise<T | null> {
    return this.modal<T | null>(
      (close) =>
        h(
          "div",
          { class: "parchment" },
          h("h2", { text: title }),
          text ? h("p", { text }) : null,
          h(
            "div",
            { class: "list" },
            ...options.map((o) =>
              h(
                "div",
                { class: `opt${o.disabled ? " off" : ""}${o.apart ? " sep" : ""}`, onclick: () => !o.disabled && close(o.value) },
                h("span", { text: o.label }),
                o.note ? h("span", { class: "note", text: o.note }) : null,
              ),
            ),
          ),
          footer ? h("p", { class: "small", text: footer }) : null,
          h("div", { class: "buttons" }, h("button", { class: "btn", text: "Back", onclick: () => close(null) })),
        ),
      { dismissWith: null },
    );
  }

  /**
   * Parchment of switches for settings: a click on a row turns that setting over (the label is read again), nothing takes effect until
   * Apply, which resolves "apply". Back, Esc and a click outside resolve null and the caller drops what was turned.
   */
  toggles(title: string, text: string, rows: ToggleRow[], footer = ""): Promise<"apply" | null> {
    return this.modal<"apply" | null>(
      (close) => {
        const labels = rows.map((r) => h("span", { text: r.label() }));
        const list = h(
          "div",
          { class: "list" },
          ...rows.map((r, i) =>
            h(
              "div",
              {
                class: "opt",
                onclick: () => {
                  r.flip();
                  rows.forEach((row, k) => (labels[k]!.textContent = row.label()));
                },
              },
              labels[i]!,
            ),
          ),
        );
        return h(
          "div",
          { class: "parchment" },
          h("h2", { text: title }),
          text ? h("p", { text }) : null,
          list,
          footer ? h("p", { class: "small", text: footer }) : null,
          h("div", { class: "buttons" }, h("button", { class: "btn", text: "Back", onclick: () => close(null) }), h("button", { class: "btn primary", text: "Apply", onclick: () => close("apply") })),
        );
      },
      { dismissWith: null },
    );
  }

  /** Parchment with a question and a text field; resolves with the answer or null when dismissed. */
  prompt(question: string, title = ""): Promise<string | null> {
    return this.modal<string | null>(
      (close) => {
        const input = h("input", { type: "text", placeholder: "your answer" }) as HTMLInputElement;
        input.addEventListener("keydown", (e) => {
          if (e.key === "Enter") close(input.value);
          e.stopPropagation();
        });
        setTimeout(() => input.focus(), 30);
        return h(
          "div",
          { class: "parchment" },
          title ? h("h2", { text: title }) : null,
          h("p", { text: question }),
          h("div", { class: "seedrow" }, input),
          h("div", { class: "buttons" }, h("button", { class: "btn primary", text: "Answer", onclick: () => close(input.value) }), h("button", { class: "btn", text: "Walk away", onclick: () => close(null) })),
        );
      },
      { dismissWith: null },
    );
  }

  /** Free-form panel (inventory, shops with live updates). `build` receives close and returns the root element. */
  panel(build: (close: () => void, root: HTMLElement) => void, options: { canDismiss?: () => Promise<boolean> } = {}): Promise<void> {
    return this.modal<void>(
      (close) => {
        const root = h("div", { class: "panel" });
        build(() => close(undefined as void), root);
        return root;
      },
      { dismissWith: undefined as void, ...options },
    );
  }

  // ---------------------------------------------------------------- title screen

  /**
   * Two pages: "New game" asks for the seed and the kind of game, "Load game" lists `saves` (the autosaves as "Continue"
   * entries first, then the saves made by hand). The title does not know where saves are kept; the caller hands in what it
   * found and gets the chosen one back.
   */
  title<S>(options: { seed: string; size?: WorldSize; saves: Option<S>[]; onOptions?: () => void }): Promise<TitleChoice<S>> {
    return new Promise((resolve) => {
      const { saves } = options;
      const input = h("input", { type: "text", value: options.seed, placeholder: "world seed" }) as HTMLInputElement;
      const menu = h("div", { class: "menu" });
      let page: TitlePage = "main";
      const seed = () => input.value.trim() || randomSeed();
      // the size of the world: one of four switches under the seed, a new game takes the one that is on
      let size: WorldSize = options.size ?? DEFAULT_WORLD_SIZE;
      const sizeButtons = WORLD_SIZE_NAMES.map((name) => {
        const info = WORLD_SIZES[name];
        const button = h("button", {
          class: `btn toggle${name === size ? " on" : ""}`,
          text: info.label,
          title: `${info.width} x ${info.height} tiles, ${info.towns} town${info.towns > 1 ? "s" : ""} on every level`,
          onclick: () => {
            size = name;
            sizeButtons.forEach((b, i) => b.classList.toggle("on", WORLD_SIZE_NAMES[i] === size));
          },
        });
        return button;
      });
      const backButton = () => h("button", { class: "btn", text: "Back", onclick: () => show("main") });
      const pages: Record<TitlePage, () => HTMLElement[]> = {
        main: () => [
          h("button", { class: `btn${saves.length === 0 ? " primary" : ""}`, text: "New game", onclick: () => show("new") }),
          h("button", { class: `btn${saves.length > 0 ? " primary" : ""}`, text: "Load game", disabled: saves.length === 0, title: saves.length === 0 ? "No saved games yet" : undefined, onclick: () => show("load") }),
          ...(options.onOptions ? [h("button", { class: "btn", text: "Options", onclick: () => options.onOptions!() })] : []),
        ],
        new: () => [
          h(
            "div",
            { class: "seedbox" },
            h("div", { class: "seedrow" }, h("span", { text: "Seed" }), input, h("button", { class: "btn", text: "Random", onclick: () => (input.value = randomSeed()) })),
            h("div", { class: "sizerow" }, ...sizeButtons),
          ),
          h("button", { class: "btn primary", text: "New game", onclick: () => done({ action: "new", seed: seed(), size }) }),
          h("button", { class: "btn", text: "New campaign (the 34 hand-built maps)", onclick: () => done({ action: "campaign", seed: seed(), size }) }),
          backButton(),
        ],
        load: () => [
          h(
            "div",
            { class: "list" },
            ...saves.map((o, i) =>
              h(
                "button",
                { class: `btn opt${i === 0 ? " primary" : ""}${o.apart ? " sep" : ""}`, disabled: o.disabled, onclick: () => done({ action: "load", save: o.value }) },
                h("span", { text: o.label }),
                o.note ? h("span", { class: "note", text: o.note }) : null,
              ),
            ),
          ),
          backButton(),
        ],
      };
      const show = (to: TitlePage) => {
        page = to;
        clear(menu);
        menu.append(...pages[to]());
        menu.classList.toggle("on-rock", to !== "load");
        placeMenu();
      };
      // The picture carries the name of the game itself; the menu sits on the grey rock of its island. The picture is drawn
      // with `cover` (1600 x 995), so the rock moves with the window shape and the menu has to follow it.
      const placeMenu = () => {
        const scale = Math.max(window.innerWidth / TITLE_IMAGE.w, window.innerHeight / TITLE_IMAGE.h);
        const top = (window.innerHeight - TITLE_IMAGE.h * scale) / 2;
        el.style.setProperty("--rock-y", `${Math.round(top + TITLE_IMAGE.h * scale * TITLE_ROCK_Y)}px`);
      };
      const el = h("div", { class: "title" }, menu);
      // Esc steps back from the second page; the title is no modal, so it has to listen itself
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape" && page !== "main") show("main");
      };
      const done = (choice: TitleChoice<S>) => {
        window.removeEventListener("keydown", onKey);
        window.removeEventListener("resize", placeMenu);
        el.remove();
        resolve(choice);
      };
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") done({ action: "new", seed: seed(), size });
      });
      window.addEventListener("keydown", onKey);
      window.addEventListener("resize", placeMenu);
      show("main");
      this.root.append(el);
    });
  }

  gameOver(): Promise<"load" | "new"> {
    return this.ask("The party has fallen", "Every hero lies motionless. The world goes on without you.", [{ label: "Load last save", value: "load" as const, primary: true }, { label: "New game", value: "new" as const }]);
  }
}

function pct(v: number, max: number): number {
  return max <= 0 ? 0 : Math.max(0, Math.min(100, Math.round((v / max) * 100)));
}

export function randomSeed(): string {
  // a friendlier seed than random digits: two syllable words and a number
  const a = ["amber", "birch", "cedar", "dune", "ember", "frost", "glade", "hollow", "iron", "jade", "kelp", "lunar", "moss", "north", "onyx", "pearl"];
  const b = ["fall", "gate", "hold", "isle", "keep", "mere", "peak", "reach", "shore", "vale", "ward", "wood"];
  const pick = (list: string[]) => list[Math.floor(Math.random() * list.length)]!;
  return `${pick(a)}-${pick(b)}-${Math.floor(Math.random() * 900 + 100)}`;
}

/** Summary line of a character for lists. */
export function describe(c: Character): string {
  return `${c.name}, ${c.raceType} ${c.classType} (L${c.level}, armor ${armor(c)})`;
}

export function classInfo(c: Character): string {
  const base = BASE_CLASS[c.classType];
  return base ? `needs ${base.requirements}` : "";
}
