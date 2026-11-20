import { ACHIEVEMENT_BY_ID } from "../data/achievements";
import { achOf, counterUnlocks, creditLedger, emptyProfile, heroUnlocks, parseProfile, unlockIn, type Profile } from "../sim/achievements";
import type { Party } from "../sim/types";

/**
 * The player's achievements in the browser (`sim/achievements.ts` has the rules). The profile lives in its own `localStorage` key, apart from the options (resetting those must not take
 * achievements away) and apart from the saves (it survives new games and loading an older save). It is written at once when something drops and, for counters, a moment after they change.
 */
const KEY = "mm3-seed-rpg:achievements:v1";
/** Counters change with every coin; the profile is only written this long after the last change (and at once when an achievement drops or the page is hidden). */
const WRITE_DELAY_MS = 4000;

export function readProfile(): Profile {
  try {
    return parseProfile(localStorage.getItem(KEY));
  } catch {
    return emptyProfile();
  }
}

/** A new id for a game (the high-water marks of the profile are kept by it). The game layer may use `Math.random`; `sim` may not. */
export function newGameId(): string {
  return `g${Date.now().toString(36)}${Math.floor(Math.random() * 36 ** 4).toString(36)}`;
}

export class Achievements {
  profile: Profile = readProfile();
  /** The game takes no achievements now: the campaign, or a game in which a debug action was used. Set by `Game`. */
  enabled: () => boolean = () => true;
  /** Called when the browser refuses the profile (storage full or blocked); the game tells the player once. */
  onWriteFailed: () => void = () => undefined;
  private dirty = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private failedOnce = false;

  /** Reads the profile again (the title screen shows the figure of the file, not of an earlier look). */
  reload(): void {
    this.flush();
    this.profile = readProfile();
  }

  has(id: string): boolean {
    return id in this.profile.unlocked;
  }

  /** Drops an achievement (no-op when it has dropped or the game takes none). Returns true when it is new. */
  award(id: string): boolean {
    if (!this.enabled() || !ACHIEVEMENT_BY_ID[id]) return false;
    if (!unlockIn(this.profile, id, new Date().toISOString())) return false;
    this.dirty = true;
    this.flush();
    return true;
  }

  /** The id whose dialog has not been confirmed yet. */
  nextUnseen(): string | undefined {
    return this.profile.unseen[0];
  }

  /** The player confirmed the dialog. */
  markSeen(id: string): void {
    this.profile.unseen = this.profile.unseen.filter((x) => x !== id);
    this.dirty = true;
    this.flush();
  }

  /**
   * What the game has earned since the last look: the ledger goes to the counters above its high-water mark, the heroes are looked at. Called after every step and every service action, so it
   * has to stay cheap: the ledger is four comparisons, `heroUnlocks` a few comparisons per hero and nothing at all once the four hero achievements have dropped.
   */
  sync(party: Party): void {
    if (!this.enabled()) return;
    const ach = achOf(party);
    if (!ach.id) ach.id = newGameId();
    if (creditLedger(this.profile, ach.id, ach.ledger)) {
      this.markDirty();
      for (const id of counterUnlocks(this.profile)) this.award(id);
    }
    for (const id of heroUnlocks(party, (x) => this.has(x))) this.award(id);
  }

  private markDirty(): void {
    this.dirty = true;
    this.timer ??= setTimeout(() => this.flush(), WRITE_DELAY_MS);
  }

  /** Writes the profile if it changed. A refusal keeps it dirty (tried again at the next change) and is reported once. */
  flush(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.dirty) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(this.profile));
      this.dirty = false;
      this.failedOnce = false;
    } catch {
      if (!this.failedOnce) this.onWriteFailed();
      this.failedOnce = true;
    }
  }
}
