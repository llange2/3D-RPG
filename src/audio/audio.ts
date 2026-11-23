import { assetPath } from "../ui/dom";
import { MUSIC_TRACKS, SOUNDS, filesOf } from "./sound-table";

/**
 * Music and sound effects as Opus/WebM files. Browsers only start audio after a user gesture, so playback requests
 * before the first click are remembered and started when the page is unlocked.
 */
/** The sound of a levitating party's steps (53rd playtest, point 20): `old_code/resources/sounds/short_wind.mp3`, sound 9043 in the table. */
const LEVITATE_SOUND = 9043;
/** Background loops that start at a moment the player causes (9, the hum of the spaceship's engines): decoded in advance so that they sound at once. */
const BUFFERED_AMBIENT: ReadonlySet<number> = new Set([9]);

/** Sounds whose file is quiet (peak -18 dB): played with this gain on top of the volume. The robot powering off is twice as loud as its file (user, 6. 11. 2026). */
const SOUND_GAIN: Readonly<Record<number, number>> = { 9061: 2 };

export class AudioManager {
  musicVolume = 0.45;
  sfxVolume = 0.7;
  private music: HTMLAudioElement | null = null;
  private currentTrack: number | null = null;
  private pendingTrack: number | null = null;
  /** The track of the title, loaded and playing muted until the page may make sound (`warmUp`). */
  private warm: { id: number; el: HTMLAudioElement } | null = null;
  private unlocked = false;
  private readonly supported: boolean;
  private readonly footToggle = new Map<number, number>();
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
  /** The loops of `BUFFERED_AMBIENT` that play from a decoded buffer. */
  private readonly ambientBuffers = new Map<number, { source: AudioBufferSourceNode; gain: GainNode }>();
  /** What the surroundings ask for, kept for the moment the page is unlocked by the first click or key. */
  private wanted: ReadonlyMap<number, number> = new Map();
  /** The moment (audio clock) at which the wind of a levitating party has played out; a step before it starts nothing. */
  private windUntil = 0;
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
      this.markUnlocked();
    };
    // every input that browsers count as a gesture (a touch only counts when it is lifted)
    for (const type of ["pointerdown", "pointerup", "mousedown", "click", "keydown", "touchend"]) window.addEventListener(type, unlock, { once: false, passive: true });
    // where the browser lets a page play without a gesture (a site the user visits a lot, the game's own window), the audio context runs at once: no click is waited for
    if (this.context) {
      this.context.addEventListener("statechange", () => {
        if (this.context?.state === "running") this.markUnlocked();
      });
      void this.context.resume().catch(() => undefined);
      if (this.context.state === "running") this.markUnlocked();
    }
  }

  /** From now on sound may play: starts the track that was asked for at the title and the surroundings that wait. */
  private markUnlocked(): void {
    if (this.unlocked) return;
    this.unlocked = true;
    if (this.pendingTrack !== null) this.playMusic(this.pendingTrack);
    this.setAmbient(this.wanted);
  }

  /**
   * Before the first gesture (the title screen): the track is loaded at once and played right away. Where the browser allows sound without a gesture, it is heard from the moment the
   * title is up (18. 11. 2026). Where it does not (Chrome for a page the user has not touched yet, `NotAllowedError`), it plays MUTED, which every browser allows: the file is loaded and
   * decoded and running, and the first click, key or touch only turns it up (`playMusic` adopts the element), so that the music starts at that instant and not after the download
   * (19. 11. 2026: the element used to be made only at the click, the file loaded then, and the music came in a second late).
   */
  private warmUp(id: number): void {
    if (this.warm?.id === id) return;
    this.discardWarm();
    const el = new Audio(this.url("music", MUSIC_TRACKS[id]!));
    el.loop = true;
    el.preload = "auto";
    el.volume = this.musicVolume;
    this.warm = { id, el };
    el.play().then(
      () => {
        if (this.warm?.el !== el) return;
        // the browser lets the page play: heard now, and everything else is unlocked as well
        this.warm = null;
        this.pendingTrack = null;
        this.music = el;
        this.currentTrack = id;
        void this.context?.resume().catch(() => undefined);
        this.markUnlocked();
      },
      () => {
        if (this.warm?.el !== el) return;
        el.muted = true;
        el.play().catch(() => undefined);
      },
    );
  }

  private discardWarm(): void {
    if (!this.warm) return;
    this.warm.el.pause();
    this.warm = null;
  }

  private url(group: "music" | "sfx", name: string): string {
    return assetPath(`audio/${group}/${name}.webm`);
  }

  /** Starts a looping track by its zone or system id (see sound-table). Does nothing when it already plays. */
  playMusic(id: number): void {
    if (!this.supported || !(id in MUSIC_TRACKS)) return;
    if (!this.unlocked) {
      this.pendingTrack = id;
      this.warmUp(id);
      return;
    }
    if (this.currentTrack === id && this.music && !this.music.paused) return;
    this.pendingTrack = null;
    const old = this.music;
    // the track that has been running muted since the title came up is turned up, from its start; any other is made now
    let next: HTMLAudioElement;
    if (this.warm?.id === id) {
      next = this.warm.el;
      this.warm = null;
      next.currentTime = 0;
      next.muted = false;
    } else {
      this.discardWarm();
      next = new Audio(this.url("music", MUSIC_TRACKS[id]!));
      next.loop = true;
    }
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
    this.discardWarm();
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
    for (const [id, node] of this.ambientBuffers) {
      if (levels.has(id)) continue;
      node.source.stop();
      this.ambientBuffers.delete(id);
    }
    if (!this.supported || !this.unlocked) return;
    for (const [id, level] of levels) {
      const entry = SOUNDS[id];
      if (typeof entry !== "string") continue;
      const volume = Math.max(0, Math.min(1, this.sfxVolume * level));
      // a loop that has to start the moment something is done (the hum of the engines) plays from memory, like the effects: a new `Audio` element needs its file first
      if (BUFFERED_AMBIENT.has(id) && this.context) {
        const buffer = this.buffers.get(entry);
        if (buffer) {
          const old = this.ambient.get(id);
          if (old) {
            old.pause();
            this.ambient.delete(id);
          }
          const node = this.ambientBuffers.get(id);
          if (node) node.gain.gain.value = volume;
          else {
            const source = this.context.createBufferSource();
            source.buffer = buffer;
            source.loop = true;
            const gain = this.context.createGain();
            gain.gain.value = volume;
            source.connect(gain).connect(this.context.destination);
            source.start();
            this.ambientBuffers.set(id, { source, gain });
          }
          continue;
        }
        // not decoded yet: the element starts it for now
        void this.buffer(entry);
      }
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
    for (const id of BUFFERED_AMBIENT) {
      const entry = SOUNDS[id];
      if (typeof entry === "string") void this.buffer(entry);
    }
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

  /** How long the sound lasts in seconds, once its file is decoded; `fallback` before that (or without Web Audio). For things that move as long as a sound plays. */
  durationOf(id: number, fallback: number): number {
    const entry = SOUNDS[id];
    if (!entry) return fallback;
    const name = filesOf(entry)[0]!;
    return this.buffers.get(name)?.duration ?? fallback;
  }

  /**
   * Like `durationOf`, without the silence at the end of the file: what can be heard, for things that must move exactly as long as the sound is audible
   * (the squeaky door's file runs 1.1 s on in digital silence). Samples below `threshold` (about -60 dB) count as silence.
   */
  audibleDurationOf(id: number, fallback: number, threshold = 0.001): number {
    const entry = SOUNDS[id];
    if (!entry) return fallback;
    const buffer = this.buffers.get(filesOf(entry)[0]!);
    if (!buffer) return fallback;
    let last = 0;
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const data = buffer.getChannelData(c);
      for (let i = data.length - 1; i > last; i--) {
        if (Math.abs(data[i]!) > threshold) {
          last = i;
          break;
        }
      }
    }
    return (last + 1) / buffer.sampleRate;
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
      const turn = this.footToggle.get(id) ?? 0;
      this.footToggle.set(id, (turn + 1) % entry.alternate.length);
      name = entry.alternate[turn]!;
    }
    // (a sound with a gain above 1 is a quiet file made louder: the web audio gain node takes it, the cap is only there against a mistake)
    const level = Math.max(0, Math.min(SOUND_GAIN[id] ? 4 : 1, this.sfxVolume * volume * (id === 9006 ? 0.5 : 1) * (SOUND_GAIN[id] ?? 1)));
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
   * A sound effect that plays over and over for `seconds` and then stops (bug_fix_83: the whirr of a Dancing Sword until it has hit its monster); a short file loops without a gap. Without Web Audio it plays once.
   */
  playFor(id: number, seconds: number, volume = 1): void {
    this.requests++;
    if (!this.supported || !this.unlocked) return;
    const entry = SOUNDS[id];
    const name = typeof entry === "string" ? entry : null;
    if (!name) return;
    const ctx = this.context;
    if (!ctx) {
      this.play(id, volume);
      return;
    }
    const level = Math.max(0, Math.min(1, this.sfxVolume * volume));
    const run = (buffer: AudioBuffer): void => {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const gain = ctx.createGain();
      gain.gain.value = level;
      source.connect(gain).connect(ctx.destination);
      source.start();
      source.stop(ctx.currentTime + Math.max(0.05, seconds));
    };
    const ready = this.buffers.get(name);
    if (ready) run(ready);
    else void this.buffer(name).then((b) => b && run(b));
  }

  /**
   * The sound of a step while the party levitates: the wind of `short_wind`, played once in full and never laid over itself. The next step starts it again only
   * when it has played out (the user's wish of 10. 11. 2026); the footsteps stay silent meanwhile.
   */
  levitateWind(volume = 1): void {
    const ctx = this.context;
    if (!ctx || !this.supported || !this.unlocked) return;
    if (ctx.currentTime < this.windUntil) return;
    const entry = SOUNDS[LEVITATE_SOUND];
    const name = typeof entry === "string" ? entry : null;
    if (!name) return;
    const buffer = this.buffers.get(name);
    if (!buffer) {
      void this.buffer(name);
      return;
    }
    this.windUntil = ctx.currentTime + buffer.duration;
    this.start(ctx, buffer, Math.max(0, Math.min(1, this.sfxVolume * volume)));
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
