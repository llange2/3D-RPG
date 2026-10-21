/**
 * Which set of 3D models the game loads: the reduced low-poly set it ships with, or the unreduced originals
 * (`npm run assets:originals`, written to public/assets/models-original). The registries carry the file paths, so the
 * renderers need nothing but the registry of the chosen set.
 *
 * The choice is made once at start-up. Switching it in the menu stores it, saves the game and reloads the page: the
 * originals hold about five times the GPU memory (2048 px textures), which only a fresh page gives back.
 */
export type ModelSet = "lowpoly" | "original";

const STORE_KEY = "mm3-seed-rpg:models:v1";
const RESUME_KEY = "mm3-seed-rpg:resume:v1";

/** Registry file of a set. Must match `PROFILES` in tools/assets/build-models.ts (tests/unit/assets.test.ts compares them). */
export function registryFile(kind: "static" | "monsters", set: ModelSet): string {
  return set === "original" ? `models.${kind}.original.json` : `models.${kind}.json`;
}

/** `?models=original|lowpoly` beats the stored choice (for tools and shared links); anything else means low poly. */
export function resolveModelSet(search: string, stored: string | null): ModelSet {
  return (new URLSearchParams(search).get("models") ?? stored) === "original" ? "original" : "lowpoly";
}

export function readModelSet(): ModelSet {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(STORE_KEY);
  } catch {
    // private window or blocked storage: the choice just does not persist
  }
  return resolveModelSet(location.search, stored);
}

/** Stores the choice and drops `?models=` from the address, which would override it. False when the browser refuses to store. */
export function storeModelSet(set: ModelSet): boolean {
  try {
    localStorage.setItem(STORE_KEY, set);
  } catch {
    return false;
  }
  const params = new URLSearchParams(location.search);
  if (params.has("models")) {
    params.delete("models");
    const query = params.toString();
    history.replaceState(null, "", `${location.pathname}${query ? `?${query}` : ""}`);
  }
  return true;
}

/**
 * Marks that the next page load is a reload for a model switch: it continues the autosave of `kind` (the endless world or the
 * campaign, which have separate saves) instead of showing the title.
 */
export function markResume(kind: string): void {
  try {
    sessionStorage.setItem(RESUME_KEY, kind);
  } catch {
    // without it the title screen shows after the reload and "Continue" offers the same save
  }
}

/** The kind given to `markResume`, once; null when this load is not such a reload. */
export function takeResume(): string | null {
  try {
    const kind = sessionStorage.getItem(RESUME_KEY);
    sessionStorage.removeItem(RESUME_KEY);
    return kind;
  } catch {
    return null;
  }
}
