import { assetPath } from "../ui/dom";
import { MUSIC_TRACKS, SOUNDS, filesOf } from "./sound-table";

/**
 * Music and sound effects as Opus/WebM files. Browsers only start audio after a user gesture, so playback requests
 * before the first click are remembered and started when the page is unlocked.
 */
const WIND_STEP = "wind_ambience";
const WIND_SLICE = 0.5;
/** A step takes 0.22 s (`STEP_SECONDS` in game/player.ts): the next slice starts that far on in the loop. */
const WIND_ADVANCE = 0.22;

export class AudioManager {
  musicVolume = 0.45;
  sfxVolume = 0.7;
  private music: HTMLAudioElement | null = null;
  private currentTrack: number | null = null;
  private pendingTrack: number | null = null;
  private unlocked = false;
  private readonly supported: boolean;
  private readonly footToggle = new Map<number, boolean>();
  private readonly cache = new Map<string, HTMLAudioElement>();
  /**
   * Sound effects are decoded once and played from memory: a new `Audio` element has to load and decode its file first, which took
   * a tenth of a second or more, and a gate that sank into the floor or a door that opened was heard after it had been seen.
   */
  private context: AudioContext | null = null;
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly loading = new Map<string, Promise<AudioBuffer | null>>();
  /** The looping background sounds that play now (fountain, birds, wind), by their old sound id. */
  private readonly ambient = new Map<number, HTMLAudioElement>();
  /** What the surroundings ask for, kept for the moment the page is unlocked by the first click or key. */
  private wanted: ReadonlyMap<number, number> = new Map();
  /** Where in the wind loop the next step of a levitating party cuts its slice from, in seconds. */
  private windCursor = 0;
  /** How many sounds were asked for so far (`play`), to tell whether a click already made a noise of its own. */
  private requests = 0;

  constructor() {
    const probe = document.createElement("audio");
    this.supported = probe.canPlayType('audio/webm; codecs="opus"') !== "";
    try {
      // created before the first click it stays suspended, but it can already decode what the game will need
      this.context = new AudioContext();
      this.preloadEffects();
    } catch {
      this.context = null; // no Web Audio: effects play from audio elements as before
    }
    const unlock = () => {
      void this.context?.resume();
      if (this.unlocked) return;
      this.unlocked = true;
      if (this.pendingTrack !== null) this.playMusic(this.pendingTrack);
      this.setAmbient(this.wanted);
    };
    window.addEventListener("pointerdown", unlock, { once: false });
    window.addEventListener("keydown", unlock, { once: false });
  }

  private url(group: "music" | "sfx", name: string): string {
    return assetPath(`audio/${group}/${name}.webm`);
  }

  /** Starts a looping track by its zone or system id (see sound-table). Does nothing when it already plays. */
  playMusic(id: number): void {
    if (!this.supported || !(id in MUSIC_TRACKS)) return;
    if (!this.unlocked) {
      this.pendingTrack = id;
      return;
    }
    if (this.currentTrack === id && this.music && !this.music.paused) return;
    this.pendingTrack = null;
    const old = this.music;
    const next = new Audio(this.url("music", MUSIC_TRACKS[id]!));
    next.loop = true;
    next.volume = 0;
    next.play().catch(() => undefined);
    this.music = next;
    this.currentTrack = id;
    this.fade(next, this.musicVolume, 0.8);
    if (old) {
      this.fade(old, 0, 0.8, () => old.pause());
    }
  }

  stopMusic(): void {
    this.pendingTrack = null;
    this.currentTrack = null;
    if (this.music) {
      const m = this.music;
      this.fade(m, 0, 0.6, () => m.pause());
      this.music = null;
    }
  }

  setMusicVolume(v: number): void {
    this.musicVolume = v;
    if (this.music) this.music.volume = v;
  }

  private fade(el: HTMLAudioElement, to: number, seconds: number, done?: () => void): void {
    const from = el.volume;
    const start = performance.now();
    const step = () => {
      const t = Math.min(1, (performance.now() - start) / (seconds * 1000));
      el.volume = Math.max(0, Math.min(1, from + (to - from) * t));
      if (t < 1) requestAnimationFrame(step);
      else done?.();
    };
    requestAnimationFrame(step);
  }

  /**
   * Sets the background sounds of the surroundings: sound id (1 to 8 of the old game) to its volume, 0 to 1. Every sound that is
   * not in the map stops, like the old `ambient_sound`, which looped the closest source of each kind at a volume that falls with
   * the distance. Called again whenever the party moves.
   */
  setAmbient(levels: ReadonlyMap<number, number>): void {
    this.wanted = levels;
    for (const [id, audio] of this.ambient) {
      if (levels.has(id)) continue;
      audio.pause();
      this.ambient.delete(id);
    }
    if (!this.supported || !this.unlocked) return;
    for (const [id, level] of levels) {
      const entry = SOUNDS[id];
      if (typeof entry !== "string") continue;
      const volume = Math.max(0, Math.min(1, this.sfxVolume * level));
      const playing = this.ambient.get(id);
      if (playing) {
        playing.volume = volume;
        continue;
      }
      const audio = new Audio(this.url("sfx", entry));
      audio.loop = true;
      audio.volume = volume;
      this.ambient.set(id, audio);
      audio.play().catch(() => undefined);
    }
  }

  /** Fetches and decodes every sound effect (not the background loops, which stream) so that none of them has to be loaded when it is needed. */
  private preloadEffects(): void {
    for (const [id, entry] of Object.entries(SOUNDS)) {
      if (Number(id) < 9000) continue;
      for (const name of filesOf(entry)) void this.buffer(name);
    }
    void this.buffer(WIND_STEP);
  }

  private buffer(name: string): Promise<AudioBuffer | null> {
    const have = this.buffers.get(name);
    if (have) return Promise.resolve(have);
    let pending = this.loading.get(name);
    if (!pending) {
      pending = fetch(this.url("sfx", name))
        .then((r) => r.arrayBuffer())
        .then((data) => this.context!.decodeAudioData(data))
        .then((b) => {
          this.buffers.set(name, b);
          return b;
        })
        .catch(() => null);
      this.loading.set(name, pending);
    }
    return pending;
  }

  /**
   * Every button, option and tab that is clicked makes the old game's menu click (9001, "menu-selection") unless the click made another sound by itself (the
   * inventory's slots, a coin, a door): the handlers run first, and what they asked for is counted before this looks.
   */
  enableButtonSounds(root: Document = document): void {
    root.addEventListener(
      "click",
      (e) => {
        const el = (e.target as Element | null)?.closest?.("button, .btn, .opt, .tab");
        if (!el || el.matches(":disabled, .disabled, [aria-disabled='true']")) return;
        const before = this.requests;
        setTimeout(() => {
          if (this.requests === before) this.play(9001);
        }, 0);
      },
      true,
    );
  }

  /** Plays a sound effect by its old id (e.g. 9016 = melee hit). */
  play(id: number, volume = 1): void {
    this.requests++;
    if (!this.supported || !this.unlocked) return;
    const entry = SOUNDS[id];
    if (!entry) return;
    let name: string;
    if (typeof entry === "string") name = entry;
    else if ("pick" in entry) name = entry.pick[Math.floor(Math.random() * entry.pick.length)]!;
    else {
      const flip = !(this.footToggle.get(id) ?? false);
      this.footToggle.set(id, flip);
      name = entry.alternate[flip ? 0 : 1];
    }
    const level = Math.max(0, Math.min(1, this.sfxVolume * volume * (id === 9006 ? 0.5 : 1)));
    const ctx = this.context;
    if (ctx) {
      const ready = this.buffers.get(name);
      if (ready) this.start(ctx, ready, level);
      else void this.buffer(name).then((b) => b && this.start(ctx, b, level)); // not decoded yet: as soon as it is
      return;
    }
    let base = this.cache.get(name);
    if (!base) {
      base = new Audio(this.url("sfx", name));
      base.preload = "auto";
      this.cache.set(name, base);
    }
    const a = base.cloneNode() as HTMLAudioElement;
    a.volume = level;
    a.play().catch(() => undefined);
  }

  /**
   * The sound of one step while the party levitates: the wind loop (`wind_ambience`, 33 s, made as a background sound) replaces the
   * footsteps. A step cuts the next half second out of it and fades it in and out, so the slices of steps 0.22 s apart overlap
   * on the same stretch of the loop and join up to one steady wind.
   */
  windStep(volume = 1): void {
    const ctx = this.context;
    if (!ctx || !this.supported || !this.unlocked) return;
    const buffer = this.buffers.get(WIND_STEP);
    if (!buffer) {
      void this.buffer(WIND_STEP);
      return;
    }
    const length = WIND_SLICE;
    const offset = this.windCursor % Math.max(0.1, buffer.duration - length);
    this.windCursor = offset + WIND_ADVANCE;
    const level = Math.max(0, Math.min(1, this.sfxVolume * volume));
    const fade = 0.12;
    const now = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(level, now + fade);
    gain.gain.setValueAtTime(level, now + length - fade);
    gain.gain.linearRampToValueAtTime(0, now + length);
    source.connect(gain).connect(ctx.destination);
    source.start(now, offset, length);
  }

  private start(ctx: AudioContext, buffer: AudioBuffer, level: number): void {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = level;
    source.connect(gain).connect(ctx.destination);
    source.start();
  }
}
