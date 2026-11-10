import "./style.css";
import { BASE_CLASS } from "../data/tables";
import { resistanceTone } from "../data/resistance-tone";
import { clockText } from "../sim/party";
import { armor, isAlive, worstCondition } from "../sim/character";
import type { Character, Party } from "../sim/types";
import { assetPath, clear, h } from "./dom";
import { thousands } from "../core/format";
import { DEFAULT_WORLD_SIZE, DUNGEON_DENSITIES, DUNGEON_DENSITY_NAMES, TITLE_DUNGEON_DENSITY, WORLD_SIZES, WORLD_SIZE_NAMES, type DungeonDensity, type WorldSize } from "../world/types";
import { hitEffect, portraitImage, protectionEffect, type AvatarEffect } from "./avatarFx";
import { conditionTitle, shownCondition } from "./conditionInfo";
import { mascotPortrait } from "./panels";
import { CapybaraClip } from "./capybaraClip";
import { LoadingScreen } from "./loadingScreen";
import { GAME_ACTIONS, KEYS_PER_ACTION, MENU_KEY, keyLabel, normalizeKey, type GameAction, type KeyBindings } from "../game/keybindings";

export type LogKind = "info" | "good" | "bad" | "combat" | "loot";

/** One kind of monster in the Identify Monster report. */
export interface IdentifyRow {
  name: string;
  maxHp: number;
  armor: number;
  attacks: number;
  abilities: string;
  resistances: { physical: number; fire: number; ice: number; acid: number; magic: number };
}

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
export type TitleChoice<S> = { action: "new" | "campaign"; seed: string; size: WorldSize; dungeons: DungeonDensity } | { action: "load"; save: S };

export interface Option<T> {
  label: string;
  value: T;
  note?: string;
  disabled?: boolean;
  /** Set apart from the entries above it (the quick-cast entry under the spell list). */
  apart?: boolean;
}

/**
 * One row of `UI.settingsPanel`. After every change all rows are read again, so a row can change what others show (the quality slider sets the switches
 * below it, and a switch moves the slider to "Custom").
 */
export type SettingsRow =
  /** A switch: a click calls `flip`. */
  | { type: "toggle"; label: () => string; flip: () => void }
  /** A slider with whole steps from `min` to `max`; `ticks` name the positions under it. */
  | { type: "slider"; label: () => string; min: number; max: number; step?: number; value: () => number; set: (value: number) => void; ticks?: string[] }
  /** A row that opens something (a window of its own): `press` runs on a click. */
  | { type: "button"; label: () => string; press: () => void | Promise<void> };

/** DOM overlay: HUD, message log and modal dialogs. All dialogs return promises, so game code reads linearly. */
export class UI {
  readonly root: HTMLElement;
  private readonly partyBar: HTMLElement;
  /** The four hero cards (rebuilt with every HUD update) and the mascot, which keeps its picture so that the crow's clip is not restarted. */
  private readonly cardsEl: HTMLElement;
  private readonly mascotEl: HTMLElement;
  private mascotShown = "";
  /** The crow's clip, made once at the start so that it is loaded before the first alarm (it showed a black avatar until the file had arrived). */
  private readonly crowClip: HTMLVideoElement = Object.assign(h("video", { class: "portrait", src: assetPath("ui/npc01_active.webm") }), { poster: assetPath("icons/portraits/npc01.webp"), loop: true, muted: true, playsInline: true, preload: "auto" });
  /** The Capybara's picture: a still painting that turns round now and then, kept so that its timer is not restarted with every rebuild of the card. */
  private readonly capybaraClip = new CapybaraClip();
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
  /** The "(Space)" beside the name of each action button (see `setKeyHints`). */
  private readonly actionHints = new Map<string, HTMLElement>();
  /** The column of action buttons at the lower right; the option "Show action keys in GUI" off takes the whole column away. */
  private actionsEl!: HTMLElement;
  private readonly focus: HTMLElement;
  private readonly flash: HTMLElement;
  /** A bright tint over the whole picture that fades out through orange (Star Burst). */
  private readonly glow: HTMLElement;
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
    this.crowClip.load();
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
    this.glow = h("div", { class: "light-flash" });
    const actions = (this.actionsEl = h(
      "div",
      { class: "actions" },
      this.actionButton("Attack", "Space", "attack"),
      this.actionButton("Spells", "F", "cast"),
      this.actionButton("Inventory", "I", "inventory"),
      this.actionButton("Rest", "R", "rest"),
      this.actionButton("Map", "M", "map"),
      this.actionButton("Menu", "Esc", "menu"),
    ));
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
      this.glow,
      this.flash,
    );
    this.loading = new LoadingScreen(this.root);
    document.body.appendChild(this.root);
    this.setHudVisible(false);
  }

  private actionButton(label: string, key: string, action: Parameters<UI["onAction"]>[0]): HTMLElement {
    const small = h("small", { text: `(${key})` });
    this.actionHints.set(action, small);
    return h("button", { class: "btn", onclick: () => this.onAction(action) }, label, " ", small);
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
    const picture = name === "Crow" && alarm ? this.crowClip : name === "Capybara" ? this.capybaraClip.el : h("img", { class: "portrait", src: assetPath(`icons/portraits/${mascotPortrait(name)}.webp`), alt: name });
    this.mascotEl.replaceChildren(h("div", { class: "row" }, picture, h("div", {}, h("div", { class: "name", text: name }), h("div", { class: "cls", text: "Mascot" }))));
    // the clip is the one made at the start (loaded, with the still picture as poster): it only has to run from the beginning
    if (picture === this.crowClip) {
      picture.currentTime = 0;
      void picture.play().catch(() => undefined);
    } else this.crowClip.pause();
    // the Capybara turns round now and then while it is the mascot (`CapybaraClip`)
    if (name === "Capybara") this.capybaraClip.start();
    else this.capybaraClip.stop();
  }

  /** The mascot's card swells once and shrinks back (the Wolf has killed a monster). The animation restarts if it is still running from a kill just before. */
  pulseMascot(): void {
    this.mascotEl.classList.remove("pulse");
    // (reading a layout property makes the browser take the class off before it is put on again)
    void this.mascotEl.offsetWidth;
    this.mascotEl.classList.add("pulse");
  }

  private renderQuests(quests: HudInfo["quests"]): void {
    this.questList.classList.toggle("hud-hide", !quests);
    if (!quests) return;
    this.questList.replaceChildren(
      h("div", { class: "quest-head", text: `Quests${quests.done > 0 ? ` (${quests.done} done)` : ""}` }),
      ...(quests.open.length === 0 ? [h("div", { class: "small", text: "none" })] : quests.open.map((q) => h("div", { class: "quest", text: q }))),
    );
  }

  private renderStatus(party: Party): void {
    const icons = new Map<AvatarEffect, string>();
    for (const e of party.effects) {
      if (e.until <= party.minutes) continue;
      if (e.kind === "protection" && e.element) icons.set(protectionEffect(e.element), `Protection from ${e.element}`);
      else if (e.kind === "levitate") icons.set("gui_levitate", "Levitate");
      else if (e.kind === "power_shield") icons.set("gui_power_shield", "Power Shield: a tenth less damage");
      else if (e.kind === "wizard_eye") icons.set("gui_wizard_eye", "Wizard's Eye: the whole map shows");
      else if (e.kind === "detect_monster") icons.set("gui_detect_monster", "Detect Monster: the monsters show on the minimap");
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

  /**
   * A bright light over the whole picture that fades out within `seconds`, white at the start and orange in the middle (Star Burst, 48th playtest point 2). The point light at
   * the party lights the scene; this tint carries it into the sky and the far walls, which a light with a range cannot reach.
   */
  lightFlash(seconds: number): void {
    this.glow.getAnimations().forEach((a) => a.cancel());
    this.glow.animate(
      // (the tint is added to the picture, `mix-blend-mode: screen`: it brightens instead of muddying it)
      [
        { backgroundColor: "rgb(255,255,255)", opacity: 0.95, offset: 0 },
        { backgroundColor: "rgb(255,160,55)", opacity: 0.6, offset: 0.45 },
        { backgroundColor: "rgb(255,110,20)", opacity: 0, offset: 1 },
      ],
      { duration: seconds * 1000, easing: "ease-out" },
    );
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
  async ask<T>(title: string, text: string, buttons: { label: string; value: T; primary?: boolean }[], dismiss?: T, dismissible = dismiss !== undefined, skin = ""): Promise<T> {
    return this.modal<T>(
      (close) =>
        h(
          "div",
          { class: `parchment${skin ? ` ${skin}` : ""}` },
          h("h2", { text: title }),
          h("p", { text }),
          h("div", { class: "buttons" }, ...buttons.map((b) => h("button", { class: `btn${b.primary ? " primary" : ""}`, text: b.label, onclick: () => close(b.value) }))),
        ),
      dismissible ? { dismissWith: dismiss as T } : {},
    );
  }

  /** Parchment dialog with a picture of the speaker above the text (the pirate queen, `icons/portraits/<picture>.webp`) and one button. */
  scene(title: string, text: string, picture: string, button = "OK"): Promise<void> {
    return this.modal<void>((close) =>
      h(
        "div",
        { class: "parchment with-picture" },
        h("h2", { text: title }),
        h("img", { class: "speaker", src: assetPath(`icons/portraits/${picture}.webp`), alt: title }),
        h("p", { text }),
        h("div", { class: "buttons" }, h("button", { class: "btn primary", text: button, onclick: () => close(undefined as void) })),
      ),
    );
  }

  confirm(title: string, text: string, yes = "Yes", no = "No", skin = ""): Promise<boolean> {
    return this.ask(title, text, [{ label: yes, value: true, primary: true }, { label: no, value: false }], false, undefined, skin);
  }

  message(text: string, title = "", button = "OK"): Promise<void> {
    return this.ask(title, text, [{ label: button, value: undefined as void, primary: true }], undefined as void, true);
  }

  /** What a computer of the spaceship shows: the same box as `message`, on the ComputerScreen instead of the scroll (quest document 1.5). */
  computerMessage(text: string, title = "", button = "OK"): Promise<void> {
    return this.ask(title, text, [{ label: button, value: undefined as void, primary: true }], undefined as void, true, "computer");
  }

  /**
   * The report of the Identify Monster spell: each kind of monster once, with what it can do and its resistances, every one coloured by how high it is
   * (green up to 0.2, orange below 0.7, red from there on; `resistanceTone`).
   */
  identifyReport(rows: IdentifyRow[], title = "Identify Monster"): Promise<void> {
    const names: [keyof IdentifyRow["resistances"], string][] = [["physical", "Physical"], ["fire", "Fire"], ["ice", "Ice"], ["acid", "Acid"], ["magic", "Magic"]];
    return this.modal<void>(
      (close) =>
        h(
          "div",
          { class: "parchment identify" },
          h("h2", { text: title }),
          ...rows.map((r) =>
            h(
              "div",
              { class: "id-monster" },
              h("div", { class: "id-name", text: r.name }),
              h("div", { class: "id-stats", text: `${r.maxHp} hit points, armor ${r.armor}, ${r.attacks} attack${r.attacks === 1 ? "" : "s"} a round${r.abilities ? `, ${r.abilities}` : ""}` }),
              h(
                "div",
                { class: "id-res" },
                "Resistances: ",
                ...names.flatMap(([key, label], i) => [i > 0 ? ", " : "", h("span", { class: `res-${resistanceTone(r.resistances[key])}`, text: `${label} ${Math.round(r.resistances[key] * 100)}%` })]),
              ),
            ),
          ),
          h("div", { class: "buttons" }, h("button", { class: "btn primary", text: "OK", onclick: () => close(undefined as void) })),
        ),
      { dismissWith: undefined as void },
    );
  }

  /**
   * The console of the spaceship's bridge: its screen writes `text` like a typewriter and asks yes or no (6. 11. 2026). At every `marker` in the text a block cursor blinks three
   * times before the writing goes on. The buttons wait until everything is written; a click on the text writes the rest at once. Without `animate` the text stands there
   * at once (the party has read it before). Escape and a click outside answer no.
   */
  terminal(title: string, text: string, marker: string, animate: boolean, yes = "Yes", no = "No"): Promise<boolean> {
    const CHAR_MS = 24;
    const BLINK_MS = 230;
    const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
    return this.modal<boolean>(
      (close) => {
        const plain = text.split(marker).join("");
        // the box keeps its size while the text grows: the whole text is there from the start, invisible, and the typed text lies over it
        const ghost = h("p", { class: "term-line term-ghost", text: plain });
        const typed = h("span", {});
        const cursor = h("span", { class: "term-cursor", text: "█", style: "visibility:hidden" });
        const live = h("p", { class: "term-line term-live" }, typed, cursor);
        const buttons = h(
          "div",
          { class: "buttons", ...(animate ? { style: "visibility:hidden" } : {}) },
          h("button", { class: "btn primary", text: yes, onclick: () => close(true) }),
          h("button", { class: "btn", text: no, onclick: () => close(false) }),
        );
        let skipped = !animate;
        const body = h("div", { class: "term-body", onclick: () => (skipped = true) }, ghost, live);
        if (!animate) typed.textContent = plain;
        else {
          const run = async (): Promise<void> => {
            // (the box is on the screen only after this function has returned; a short pause before the first letter)
            await wait(350);
            const parts = text.split(marker);
            for (let i = 0; i < parts.length && !skipped; i++) {
              for (const ch of parts[i]!) {
                if (skipped || !typed.isConnected) break;
                typed.textContent += ch;
                await wait(ch === "\n" ? CHAR_MS * 6 : CHAR_MS);
              }
              if (i === parts.length - 1) break;
              // the cursor blinks three times: on, off, on, off, on, off
              for (let n = 0; n < 6 && !skipped && typed.isConnected; n++) {
                cursor.style.visibility = n % 2 === 0 ? "visible" : "hidden";
                await wait(BLINK_MS);
              }
              cursor.style.visibility = "hidden";
            }
            if (!typed.isConnected) return;
            typed.textContent = plain;
            cursor.style.visibility = "hidden";
            buttons.style.visibility = "visible";
          };
          void run();
        }
        return h("div", { class: "parchment computer terminal" }, h("h2", { text: title }), body, buttons);
      },
      { dismissWith: false },
    );
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
   * Parchment of settings (switches, sliders, rows that open a window): a click on a switch turns that setting over, a slider is moved, and every row is read again
   * after each change. Nothing takes effect until Apply, which resolves "apply". Back, Esc and a click outside resolve null and the caller drops what was changed.
   * `extra` buttons sit between Back and Apply (Reset to defaults).
   */
  settingsPanel(title: string, rows: SettingsRow[], extra: { label: string; run: () => void }[] = []): Promise<"apply" | null> {
    return this.modal<"apply" | null>(
      (close) => {
        const refreshers: (() => void)[] = [];
        const refresh = () => refreshers.forEach((f) => f());
        const list = h(
          "div",
          { class: "list" },
          ...rows.map((r) => {
            const label = h("span", { text: r.label() });
            if (r.type === "slider") {
              const input = h("input", { type: "range", min: String(r.min), max: String(r.max), step: String(r.step ?? 1) }) as HTMLInputElement;
              input.value = String(r.value());
              input.addEventListener("input", () => {
                r.set(Number(input.value));
                refresh();
              });
              // the keys that move the slider must not turn the party or open a window behind the dialog
              input.addEventListener("keydown", (e) => e.stopPropagation());
              refreshers.push(() => {
                label.textContent = r.label();
                if (Number(input.value) !== r.value()) input.value = String(r.value());
              });
              const ticks = r.ticks ? h("div", { class: "ticks" }, ...r.ticks.map((t) => h("span", { text: t }))) : null;
              return h("div", { class: "opt slider" }, label, input, ticks);
            }
            refreshers.push(() => (label.textContent = r.label()));
            return h(
              "div",
              {
                class: "opt",
                onclick: () => {
                  if (r.type === "toggle") r.flip();
                  else void Promise.resolve(r.press()).then(refresh);
                  refresh();
                },
              },
              label,
            );
          }),
        );
        return h(
          "div",
          { class: "parchment settings" },
          h("h2", { text: title }),
          list,
          h(
            "div",
            { class: "buttons" },
            h("button", { class: "btn", text: "Back", onclick: () => close(null) }),
            ...extra.map((x) => h("button", { class: "btn", text: x.label, onclick: () => (x.run(), refresh()) })),
            h("button", { class: "btn primary", text: "Apply", onclick: () => close("apply") }),
          ),
        );
      },
      { dismissWith: null },
    );
  }

  /**
   * The key bindings window: every action with its two keys; a click on a key waits for the next key press (Escape keeps the old key, Backspace or Delete empties the slot).
   * `get` reads the table, `assign` changes it and answers with a line to show (a key taken from another action), `reset` brings the defaults back. Resolves when closed.
   */
  keyBindings(get: () => KeyBindings, assign: (action: GameAction, slot: number, key: string | null) => string, reset: () => void): Promise<void> {
    return this.modal<void>(
      (close) => {
        const note = h("p", { class: "small", text: "Click a key, then press the new one. Escape keeps the old key, Backspace empties it. A key belongs to one action only." });
        const list = h("div", { class: "list keys" });
        const draw = () => {
          list.replaceChildren(
            ...GAME_ACTIONS.map(({ id, label }) =>
              h(
                "div",
                { class: "opt keyrow" },
                h("span", { text: label }),
                ...Array.from({ length: KEYS_PER_ACTION }, (_, slot) => {
                  const key = get()[id][slot];
                  const button = h("button", {
                    class: "btn keycap",
                    text: key === undefined ? "-" : keyLabel(key),
                    onclick: async () => {
                      button.textContent = "press a key";
                      button.classList.add("waiting");
                      const pressed = await this.captureKey();
                      const next = pressed === null ? undefined : pressed === "Backspace" || pressed === "Delete" ? null : normalizeKey(pressed);
                      if (next !== undefined && next !== null && next === MENU_KEY) note.textContent = "Escape stays the menu key.";
                      else if (next !== undefined) note.textContent = assign(id, slot, next) || "";
                      draw();
                    },
                  });
                  return button;
                }),
              ),
            ),
          );
        };
        draw();
        return h(
          "div",
          { class: "parchment" },
          h("h2", { text: "Key bindings" }),
          list,
          note,
          h("div", { class: "buttons" }, h("button", { class: "btn", text: "Reset to defaults", onclick: () => (reset(), draw()) }), h("button", { class: "btn primary", text: "Back", onclick: () => close() })),
        );
      },
      { dismissWith: undefined as void },
    );
  }

  /**
   * Waits for the next key (the key bindings window): resolves with its `KeyboardEvent.key`, or null when Escape was pressed (the caller keeps the old key).
   * The key is taken before anything else sees it.
   */
  captureKey(): Promise<string | null> {
    return new Promise((resolve) => {
      const onKey = (e: KeyboardEvent) => {
        if (["Shift", "Control", "Alt", "Meta", "AltGraph", "CapsLock"].includes(e.key)) return;
        e.preventDefault();
        e.stopPropagation();
        window.removeEventListener("keydown", onKey, true);
        resolve(e.key === "Escape" ? null : e.key);
      };
      window.addEventListener("keydown", onKey, true);
    });
  }

  /**
   * The key names on the action buttons and in the tips: `labels` gives the key of every action, `show` false takes the buttons away altogether (the option "Show action keys in GUI": the keys alone play the game).
   * The tip of the quest panel always names its key.
   */
  setKeyHints(labels: Record<"attack" | "cast" | "inventory" | "rest" | "map" | "menu" | "quests", string>, show: boolean): void {
    for (const [action, small] of this.actionHints) {
      const key = labels[action as keyof typeof labels];
      small.textContent = key ? `(${key})` : "";
    }
    this.actionsEl.classList.toggle("keys-off", !show);
    this.questList.title = `Click for the whole quest log (${labels.quests})`;
  }

  /** Parchment with a question and a text field; resolves with the answer or null when dismissed. */
  prompt(question: string, title = "", labels: { placeholder?: string; ok?: string; cancel?: string; maxLength?: number } = {}): Promise<string | null> {
    return this.modal<string | null>(
      (close) => {
        const input = h("input", { type: "text", placeholder: labels.placeholder ?? "your answer" }) as HTMLInputElement;
        if (labels.maxLength) input.maxLength = labels.maxLength;
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
          h("div", { class: "buttons" }, h("button", { class: "btn primary", text: labels.ok ?? "Answer", onclick: () => close(input.value) }), h("button", { class: "btn", text: labels.cancel ?? "Walk away", onclick: () => close(null) })),
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
  title<S>(options: { seed: string; size?: WorldSize; dungeons?: DungeonDensity; saves: Option<S>[]; onOptions?: () => void }): Promise<TitleChoice<S>> {
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
      // how many caves and dungeons the world has: one of three switches under the size (towns, castles and pyramids do not change)
      let dungeons: DungeonDensity = options.dungeons ?? TITLE_DUNGEON_DENSITY;
      const dungeonButtons = DUNGEON_DENSITY_NAMES.map((name) => {
        const info = DUNGEON_DENSITIES[name];
        return h("button", {
          class: `btn toggle${name === dungeons ? " on" : ""}`,
          text: info.label,
          title: name === "maximum" ? "Every cave and dungeon the world has room for" : `${Math.round(info.share * 100)} % of the caves and dungeons; towns, castles and pyramids stay`,
          onclick: () => {
            dungeons = name;
            dungeonButtons.forEach((b, i) => b.classList.toggle("on", DUNGEON_DENSITY_NAMES[i] === dungeons));
          },
        });
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
            // three rows of the same two columns, so that the first letters of "Seed", "World size" and "Dungeons" stand on one line
            h("span", { class: "rowlabel", text: "Seed" }),
            h("div", { class: "seedrow" }, input, h("button", { class: "btn", text: "Random", onclick: () => (input.value = randomSeed()) })),
            h("span", { class: "rowlabel", text: "World size" }),
            h("div", { class: "sizerow" }, ...sizeButtons),
            h("span", { class: "rowlabel", text: "Dungeons" }),
            h("div", { class: "sizerow" }, ...dungeonButtons),
          ),
          h("button", { class: "btn primary", text: "New game", onclick: () => done({ action: "new", seed: seed(), size, dungeons }) }),
          // ("New campaign", the 34 hand-built maps of the old game, has been taken off the menu on 6. 11. 2026; the campaign itself stays in the code: `Game.newCampaign`,
          // the `campaign` action of `TitleChoice` and `?scenario=campaign` still start it, and saved campaigns still load)
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
        if (e.key === "Enter") done({ action: "new", seed: seed(), size, dungeons });
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
