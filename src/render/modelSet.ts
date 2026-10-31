/**
 * The 3D models the game loads: the unreduced originals (`npm run assets:originals`, written to public/assets/models-original). The reduced low-poly set
 * and the option to switch to it are gone (37th playtest, point 4d). The registries carry the file paths, so the renderers need nothing but the registry.
 *
 * Changes that the loaded textures cannot follow (the texture quality) reload the page: the game is saved first, marks the reload (`markResume`) and
 * continues the autosave without the title screen.
 */
const RESUME_KEY = "mm3-seed-rpg:resume:v1";

/** Registry file of the models. Must match `PROFILES.original` in tools/assets/build-models.ts (tests/unit/assets.test.ts compares them). */
export function registryFile(kind: "static" | "monsters"): string {
  return `models.${kind}.original.json`;
}

/**
 * Marks that the next page load is a reload by the game itself: it continues the autosave of `kind` (the endless world or the
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
